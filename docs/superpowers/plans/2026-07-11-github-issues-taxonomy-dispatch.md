# GitHub Issues Taxonomy, Dashboard & Dispatch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the `status:*` label taxonomy into `tier:*` (authorization) / `status:*` (operational), add a shared label-bootstrap helper that closes the 100-char-cap bug class, drop code-health's per-criterion labels, give every GitHub dashboard number one owner, and make headless triage dispatch group claimed issues by file overlap and run them capped-concurrent with one consolidated Review Console per firing.

**Architecture:** Two new pure-logic modules (`bin/lib/issues/labels.js`, `bin/lib/issues/grouping.js`) with full unit coverage, consumed by prose skill files that are edited directly and verified by grep sweeps (skill files are LLM-executed markdown, not code under `npm test`). The label rename runs early so every later prose edit is authored in terms of the final names.

**Tech Stack:** Node 18+ built-in `node --test`, `gh` CLI, existing `bin/lib/issues/*` and `bin/lib/code-health/*` conventions (pure emit-only modules, no network in `bin/lib/`).

## Global Constraints

- Clean break, no migration tooling — this plugin's early adoption makes a documented breaking rename acceptable (per the approved design's Context section).
- No changes to `bin/lib/issues/claims.js` or the ref/comment/label claim mechanics — out of scope (design doc Context).
- Every `gh label create --description` string must stay ≤100 chars (GitHub's hard cap) — enforced by `ensureLabelPayload` at construction time, not discovered as a 422.
- Full `npm test` must show 0 new failures beyond the pre-existing flaky `tests/statusline.test.js` timing test at the end of every task that touches `bin/lib/`.
- Work happens in the current worktree (`.claude/worktrees/github-issues-review`, branch `worktree-github-issues-review`) — already isolated; do not create a new worktree.
- Follow the design doc exactly at `docs/superpowers/specs/2026-07-11-github-issues-taxonomy-dispatch-design.md`; two corrections found during planning (documented in Task 9 and Task 3) refine — not change the scope of — that design.

---

## File Structure

| File | Responsibility |
|---|---|
| `bin/lib/issues/labels.js` (new) | `ensureLabelPayload(name, description)` — validates + shapes a label bootstrap payload, throws over the 100-char cap |
| `bin/lib/issues/tests/labels.test.js` (new) | Unit tests for `ensureLabelPayload`, including every real label description this plan introduces |
| `bin/lib/issues/grouping.js` (new) | `groupByFileOverlap(items)` — union-find partition by shared file paths; `extractKeyFiles(issue)` — pulls the file(s) a code-health/harness-health issue concerns straight from its body |
| `bin/lib/issues/tests/grouping.test.js` (new) | Unit tests for both functions |
| `bin/lib/code-health/issue-payload.js` | Drop the per-criterion label from `toIssuePayloadV2` |
| `bin/lib/code-health/criteria.js` | Drop the now-unused `description` field from every `CRITERIA` entry |
| `bin/lib/code-health/tests/criteria.test.js` | Remove the two tests tied to the removed `description` field |
| `bin/lib/code-health/tests/issue-payload.test.js` | Update the v2 labels assertion to drop the criterion label |
| `skills/triage/SKILL.md` | `tier:*` rename; Step 2.5 (new grouping step); Step 3 rewrite (capped-concurrent group dispatch); Step 4 framing note; new Consolidated Review Console section; new config row |
| `skills/triage/routine-template.yml` | `tier:*` rename in `notes:` |
| `skills/_shared/issue-claims.md` | `tier:*` rename |
| `skills/wrap-up/cleanup-procedures.md` | `tier:*` rename |
| `skills/wrap-up/review-console.md` | `tier:*` rename |
| `skills/flow/multispec-review-console.md` | `tier:*` rename |
| `skills/_shared/github-pr-scan.md` | `tier:*` rename in item 7; new `triage-queue` scope |
| `skills/help/status-scan.md` | Stage 4.6 consumes the new `triage-queue` scope; Stage 3 calls `groupByFileOverlap` |
| `skills/specify/SKILL.md` | Implicit Dependency Detection calls `groupByFileOverlap` |
| `skills/code-health/SKILL.md` | Step 9 uses `ensureLabelPayload`; drops per-criterion label bootstrap + attachment |
| `skills/harness-health/SKILL.md` | Adds label-bootstrap-with-description via `ensureLabelPayload` (was previously missing entirely) |

---

### Task 1: `bin/lib/issues/labels.js` — shared label-bootstrap helper

**Files:**
- Create: `bin/lib/issues/labels.js`
- Test: `bin/lib/issues/tests/labels.test.js`

**Interfaces:**
- Produces: `ensureLabelPayload(name: string, description: string) -> { name, description }` — throws `Error` if `description` is not a string or exceeds 100 characters. Used by Tasks 4 and 5.

- [ ] **Step 1: Write the failing tests**

```js
// bin/lib/issues/tests/labels.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { ensureLabelPayload } = require('../labels');

test('returns { name, description } for a valid description', () => {
  assert.deepStrictEqual(
    ensureLabelPayload('backlog', 'Inbox-stage backlog entry'),
    { name: 'backlog', description: 'Inbox-stage backlog entry' },
  );
});

test('accepts a description of exactly 100 characters', () => {
  const d = 'x'.repeat(100);
  assert.deepStrictEqual(ensureLabelPayload('x', d), { name: 'x', description: d });
});

test('throws for a description of 101 characters', () => {
  const d = 'x'.repeat(101);
  assert.throws(() => ensureLabelPayload('x', d), /100 chars/);
});

test('throws when description is not a string', () => {
  assert.throws(() => ensureLabelPayload('x', undefined), /must be a string/);
  assert.throws(() => ensureLabelPayload('x', 42), /must be a string/);
});

test('error message names the label', () => {
  assert.throws(() => ensureLabelPayload('code-health:review-quality', 'x'.repeat(101)), /code-health:review-quality/);
});

// Every real label description this plan introduces or keeps must pass — a single place
// that would have caught the status:in-progress (commit 54ab897) and code-health:*
// criterion (this plan's Task 3) 100-char overruns before they shipped.
const REAL_LABEL_DESCRIPTIONS = [
  ['code-health', 'Filed by the code-health engine — a systematic maintainability finding'],
  ['code-health:risk-low', "Risk tier if this finding's suggested fix goes wrong"],
  ['code-health:risk-medium', "Risk tier if this finding's suggested fix goes wrong"],
  ['code-health:risk-high', "Risk tier if this finding's suggested fix goes wrong"],
  ['code-health:effort-low', "Estimated effort to implement this finding's suggested fix"],
  ['code-health:effort-medium', "Estimated effort to implement this finding's suggested fix"],
  ['code-health:effort-high', "Estimated effort to implement this finding's suggested fix"],
  ['harness-health', 'Filed by the harness-health engine — a plugin harness maintenance finding'],
  ['harness-health:additive', 'Safe, mechanical patch — additive change with no removed behavior'],
  ['harness-health:restructural', 'Structural change requiring human review before applying'],
  ['harness-health:new-skill', 'Proposes a new skill candidate surfaced by harness-health'],
  ['tier:needs-review', 'Triage flagged this - needs a closer human look before authorizing'],
  ['tier:approved', 'Triage authorized this for building - human approves the merge'],
  ['tier:fast-track', 'Triage authorized this for building - auto-merges if the run comes back clean'],
  ['status:in-progress', 'Claimed and being built by an autonomous claude-tweaks run'],
  ['parked', 'Backlog entry parked until its trigger condition is met'],
];

test('every real label description used across the skill tree stays under the cap', () => {
  for (const [name, description] of REAL_LABEL_DESCRIPTIONS) {
    assert.doesNotThrow(() => ensureLabelPayload(name, description), `${name}: "${description}" (${description.length} chars)`);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review" && node --test bin/lib/issues/tests/labels.test.js`
Expected: FAIL — `Cannot find module '../labels'`

- [ ] **Step 3: Write the implementation**

```js
// bin/lib/issues/labels.js
// Pure: validate + shape a label bootstrap payload. Throws on GitHub's 100-char
// description cap so a too-long description fails at construction time, not
// silently as a 422 on first `gh label create` (see commit 54ab897, which hit
// and fixed this exact bug once for status:in-progress).
'use strict';

function ensureLabelPayload(name, description) {
  if (typeof description !== 'string') {
    throw new Error(`label "${name}": description must be a string (got ${typeof description})`);
  }
  if (description.length > 100) {
    throw new Error(`label "${name}": description must be <= 100 chars (got ${description.length}): "${description}"`);
  }
  return { name, description };
}

module.exports = { ensureLabelPayload };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review" && node --test bin/lib/issues/tests/labels.test.js`
Expected: PASS — all 7 tests green

- [ ] **Step 5: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
pwd && git rev-parse --show-toplevel   # verify both resolve to the worktree, not the parent repo
git add bin/lib/issues/labels.js bin/lib/issues/tests/labels.test.js
git commit -m "Add ensureLabelPayload — shared label-bootstrap helper with a 100-char cap check"
```

---

### Task 2: `bin/lib/issues/grouping.js` — file-overlap grouping + issue key-file extraction

**Files:**
- Create: `bin/lib/issues/grouping.js`
- Test: `bin/lib/issues/tests/grouping.test.js`

**Interfaces:**
- Produces: `groupByFileOverlap(items: {id, keyFiles: string[]}[]) -> Array<Array<id>>` — union-find partition; items sharing a file path (directly or transitively) land in the same group; each returned group is an array of item ids in first-seen order. Used by Task 9 (dispatch) and Task 7/8 (specify/help's implicit-dependency check).
- Produces: `extractKeyFiles(issue: {body: string, labels: (string|{name:string})[]}) -> string[]` — reads a code-health or harness-health issue's body and returns the file path(s) it concerns, using the label set to pick the right body shape to parse. Returns `[]` when nothing is extractable. Used by Task 9.

- [ ] **Step 1: Write the failing tests**

```js
// bin/lib/issues/tests/grouping.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { groupByFileOverlap, extractKeyFiles } = require('../grouping');

// ── groupByFileOverlap ──────────────────────────────────────────────────────

test('empty input returns no groups', () => {
  assert.deepStrictEqual(groupByFileOverlap([]), []);
});

test('items with no shared files are all singletons', () => {
  const groups = groupByFileOverlap([
    { id: 1, keyFiles: ['a.js'] },
    { id: 2, keyFiles: ['b.js'] },
    { id: 3, keyFiles: [] },
  ]);
  assert.strictEqual(groups.length, 3);
  for (const g of groups) assert.strictEqual(g.length, 1);
});

test('two items sharing a file land in one group', () => {
  const groups = groupByFileOverlap([
    { id: 1, keyFiles: ['a.js'] },
    { id: 2, keyFiles: ['a.js', 'b.js'] },
  ]);
  assert.strictEqual(groups.length, 1);
  assert.deepStrictEqual(groups[0].sort(), [1, 2]);
});

test('transitive overlap (A-B share file1, B-C share file2, A-C share nothing directly) is one group', () => {
  const groups = groupByFileOverlap([
    { id: 'A', keyFiles: ['f1.js'] },
    { id: 'B', keyFiles: ['f1.js', 'f2.js'] },
    { id: 'C', keyFiles: ['f2.js'] },
  ]);
  assert.strictEqual(groups.length, 1);
  assert.deepStrictEqual(groups[0].sort(), ['A', 'B', 'C']);
});

test('unrelated pair stays separate from an overlapping pair in the same batch', () => {
  const groups = groupByFileOverlap([
    { id: 1, keyFiles: ['a.js'] },
    { id: 2, keyFiles: ['a.js'] },
    { id: 3, keyFiles: ['z.js'] },
  ]);
  const sizes = groups.map((g) => g.length).sort();
  assert.deepStrictEqual(sizes, [1, 2]);
});

test('item with empty keyFiles never merges with anything', () => {
  const groups = groupByFileOverlap([
    { id: 1, keyFiles: [] },
    { id: 2, keyFiles: [] },
  ]);
  assert.strictEqual(groups.length, 2);
});

test('group order matches first-seen order of each group', () => {
  const groups = groupByFileOverlap([
    { id: 1, keyFiles: ['a.js'] },
    { id: 2, keyFiles: ['b.js'] },
  ]);
  assert.deepStrictEqual(groups[0], [1]);
  assert.deepStrictEqual(groups[1], [2]);
});

// ── extractKeyFiles ──────────────────────────────────────────────────────────

test('extracts the anchor file from a v2 code-health issue body', () => {
  const issue = {
    labels: ['code-health', 'code-health:risk-high'],
    body: [
      '<!-- code-health-fingerprint: recon-ab12cd34 -->',
      '',
      '**Criterion:** simplification | **Risk:** high',
      '',
      '## Current State',
      '',
      'Anchor: `src/api/user.js#getUser`',
      '',
      'evidence text',
    ].join('\n'),
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['src/api/user.js']);
});

test('extracts the Files line from a v1 code-health issue body', () => {
  const issue = {
    labels: ['code-health', 'code-health:high'],
    body: [
      '<!-- code-health-fingerprint: recon-abc12345 -->',
      '',
      '**Lens:** oversized-file | **Severity:** high',
      '',
      '## Current State',
      '',
      'Files: apps/web/big.js, apps/web/small.js',
      '',
      'evidence text',
    ].join('\n'),
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['apps/web/big.js', 'apps/web/small.js']);
});

test('returns [] for a v1 code-health issue with "(no specific file)"', () => {
  const issue = {
    labels: ['code-health'],
    body: 'Files: (no specific file)',
  };
  assert.deepStrictEqual(extractKeyFiles(issue), []);
});

test('extracts the target from a harness-health issue body', () => {
  const issue = {
    labels: ['harness-health', 'harness-health:additive'],
    body: '**Skill:** skills/triage/SKILL.md | **Section:** Step 4 | **Category:** rule-gap | **Classification:** additive | **Confidence:** high',
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['skills/triage/SKILL.md']);
});

test('returns [] when the issue carries neither code-health nor harness-health labels', () => {
  const issue = { labels: ['backlog'], body: 'Files: a.js' };
  assert.deepStrictEqual(extractKeyFiles(issue), []);
});

test('returns [] when body is missing', () => {
  assert.deepStrictEqual(extractKeyFiles({ labels: ['code-health'] }), []);
});

test('accepts label objects ({name}) as well as plain strings', () => {
  const issue = {
    labels: [{ name: 'code-health' }],
    body: 'Anchor: `src/x.js#fn`',
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['src/x.js']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review" && node --test bin/lib/issues/tests/grouping.test.js`
Expected: FAIL — `Cannot find module '../grouping'`

- [ ] **Step 3: Write the implementation**

```js
// bin/lib/issues/grouping.js
// Pure: partition claimed issues into groups whose target files overlap, and
// extract the file(s) an issue concerns straight from its body — used at
// dispatch time, before any spec exists to read a "Key Files" section from.
'use strict';

// Partitions items into groups whose keyFiles overlap, directly or
// transitively (union-find over shared file paths). Items with no overlap
// to anything else in the batch are singleton groups.
function groupByFileOverlap(items) {
  const parent = new Map();
  function find(x) {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const item of items) parent.set(item.id, item.id);

  const fileToId = new Map();
  for (const item of items) {
    for (const file of item.keyFiles || []) {
      if (fileToId.has(file)) union(item.id, fileToId.get(file));
      else fileToId.set(file, item.id);
    }
  }

  const groups = new Map();
  for (const item of items) {
    const root = find(item.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item.id);
  }
  return [...groups.values()];
}

const ANCHOR_RE = /Anchor:\s*`([^`#]+)/;
const FILES_LINE_RE = /^Files:\s*(.+)$/m;
const HARNESS_HEADER_RE = /^\*\*[^:*]+:\*\*\s*([^\s|]+)/m;

function labelNames(labels) {
  return (labels || []).map((l) => (typeof l === 'string' ? l : l && l.name)).filter(Boolean);
}

// issue: { body, labels } shaped like `gh api .../issues/{n}` output.
// Returns string[] of file paths, [] when nothing is extractable.
function extractKeyFiles(issue) {
  const body = (issue && issue.body) || '';
  const names = labelNames(issue && issue.labels);

  if (names.includes('code-health')) {
    const anchor = ANCHOR_RE.exec(body);
    if (anchor) return [anchor[1]];
    const filesLine = FILES_LINE_RE.exec(body);
    if (filesLine && filesLine[1].trim() !== '(no specific file)') {
      return filesLine[1].split(',').map((f) => f.trim()).filter(Boolean);
    }
    return [];
  }

  if (names.includes('harness-health')) {
    const targetHeader = HARNESS_HEADER_RE.exec(body);
    return targetHeader ? [targetHeader[1]] : [];
  }

  return [];
}

module.exports = { groupByFileOverlap, extractKeyFiles };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review" && node --test bin/lib/issues/tests/grouping.test.js`
Expected: PASS — all 15 tests green

- [ ] **Step 5: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
pwd && git rev-parse --show-toplevel
git add bin/lib/issues/grouping.js bin/lib/issues/tests/grouping.test.js
git commit -m "Add groupByFileOverlap + extractKeyFiles for dispatch grouping"
```

---

### Task 3: Rename `status:{needs-review,approved,fast-track}` to `tier:*` across the skill tree

**Files:**
- Modify: `skills/triage/SKILL.md`
- Modify: `skills/triage/routine-template.yml`
- Modify: `skills/_shared/issue-claims.md`
- Modify: `skills/wrap-up/cleanup-procedures.md`
- Modify: `skills/wrap-up/review-console.md`
- Modify: `skills/flow/multispec-review-console.md`
- Modify: `skills/_shared/github-pr-scan.md`
- Modify: `README.md`

**Correction found during planning:** the design doc's file list also named `skills/tidy/scan-procedures.md`, uncertain whether it needed changes. Re-grepped during planning (`grep -rn "status:needs-review\|status:approved\|status:fast-track" skills/ README.md`) — it does not contain any of the three literal strings. Dropped from this task's file list; do not touch it.

- [ ] **Step 1: Mechanical rename of the three literal label strings**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
pwd && git rev-parse --show-toplevel   # verify both resolve to the worktree
FILES="skills/triage/SKILL.md skills/triage/routine-template.yml skills/_shared/issue-claims.md skills/wrap-up/cleanup-procedures.md skills/wrap-up/review-console.md skills/flow/multispec-review-console.md skills/_shared/github-pr-scan.md"
for f in $FILES; do
  sed -i '' 's/status:needs-review/tier:needs-review/g; s/status:approved/tier:approved/g; s/status:fast-track/tier:fast-track/g' "$f"
done
```

`status:in-progress` and `status:blocked` are untouched by this substitution — neither string matches any of the three patterns.

- [ ] **Step 2: Fix the remaining occurrences the literal sed cannot catch**

These are template placeholders and narrative shorthand — found by grepping for `status:{` / `status:\*` patterns during planning, which the literal-string sed above does not match.

In `skills/triage/SKILL.md`, three occurrences of the `{tier}` template placeholder:

```
old_string: "  gh issue edit \"$ISSUE\" --remove-label status:blocked --add-label \"status:{tier}\""
new_string: "  gh issue edit \"$ISSUE\" --remove-label status:blocked --add-label \"tier:{tier}\""
```

```
old_string: "  gh issue edit \"$ISSUE\" --add-label \"status:{tier}\""
new_string: "  gh issue edit \"$ISSUE\" --add-label \"tier:{tier}\""
```

```
old_string: "`AUTO {time} — Triage: applied status:{tier} to issue #{n} (risk:{riskTier}, effort:{effortTier}).`"
new_string: "`AUTO {time} — Triage: applied tier:{tier} to issue #{n} (risk:{riskTier}, effort:{effortTier}).`"
```

In `skills/_shared/issue-claims.md`, the generic `status:*` shorthand:

```
old_string: "mutually-exclusive `status:*` tier labels, all *granted* exclusively by `/claude-tweaks:triage`'s"
new_string: "mutually-exclusive `tier:*` labels, all *granted* exclusively by `/claude-tweaks:triage`'s"
```

In `README.md`, the generic `status:*` shorthand:

```
old_string: "applies one of three `status:*` tier labels (`needs-review`/`approved`/`fast-track`)"
new_string: "applies one of three `tier:*` labels (`needs-review`/`approved`/`fast-track`)"
```

- [ ] **Step 3: Verify — zero stale references, operational labels untouched**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
# Expect NO output — every literal + template + shorthand occurrence was renamed:
grep -rn 'status:needs-review\|status:approved\|status:fast-track\|status:{tier}\|status:\*.*tier' skills/ README.md
echo "exit: $?"   # expect 1 (grep found nothing)

# Expect non-empty output in the same 7 files as Step 1, now using tier:*:
grep -rl 'tier:needs-review\|tier:approved\|tier:fast-track' skills/ README.md

# Expect status:in-progress / status:blocked occurrence COUNTS unchanged — spot-check
# triage/SKILL.md, the file with the most operational-label references:
grep -c 'status:in-progress\|status:blocked' skills/triage/SKILL.md   # expect the same count as before Step 1 (record it before running Step 1 if unsure)
```

Expected: the first grep exits 1 (no matches); the second lists the same 7 files touched in Step 1; the third shows `status:in-progress`/`status:blocked` mentions still present and unchanged in count.

- [ ] **Step 4: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
pwd && git rev-parse --show-toplevel
git add skills/triage/SKILL.md skills/triage/routine-template.yml skills/_shared/issue-claims.md skills/wrap-up/cleanup-procedures.md skills/wrap-up/review-console.md skills/flow/multispec-review-console.md skills/_shared/github-pr-scan.md README.md
git commit -m "Rename status:needs-review/approved/fast-track to tier:* — status: now means bot-owned operational state only"
```

---

### Task 4: Remove code-health's per-criterion label

**Files:**
- Modify: `bin/lib/code-health/issue-payload.js`
- Modify: `bin/lib/code-health/criteria.js`
- Modify: `bin/lib/code-health/tests/criteria.test.js`
- Modify: `bin/lib/code-health/tests/issue-payload.test.js`
- Modify: `skills/code-health/SKILL.md`

**Correction found during planning:** verified nothing reads the per-criterion label back off an issue — `fingerprint.js`'s v2 hashing, `validate-finding.js`, and `dedup.js` all take `criterion` from the in-memory finding object, never from a parsed label. The criterion is already in the issue body (`**Criterion:** {finding.criterion}`). This is a pure subtraction with zero downstream blast radius beyond the files listed above.

**Interfaces:**
- Consumes: `ensureLabelPayload` from Task 1.

- [ ] **Step 1: Update the failing test for the new label shape**

Edit `bin/lib/code-health/tests/issue-payload.test.js` — change the v2 labels assertion:

```
old_string: "test('v2 labels are code-health + code-health:risk-<tier> + code-health:effort-<tier> + code-health:<criterion>', () => {\n  assert.deepStrictEqual(\n    toIssuePayloadV2(V2_FINDING).labels,\n    ['code-health', 'code-health:risk-high', 'code-health:effort-low', 'code-health:simplification'],\n  );\n});"
new_string: "test('v2 labels are code-health + code-health:risk-<tier> + code-health:effort-<tier> (no per-criterion label)', () => {\n  assert.deepStrictEqual(\n    toIssuePayloadV2(V2_FINDING).labels,\n    ['code-health', 'code-health:risk-high', 'code-health:effort-low'],\n  );\n});"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review" && node --test bin/lib/code-health/tests/issue-payload.test.js`
Expected: FAIL — the v2 labels test, actual array still includes `'code-health:simplification'`

- [ ] **Step 3: Remove the per-criterion label from the payload builder**

Edit `bin/lib/code-health/issue-payload.js`:

```
old_string: "// v2: body uses anchor (Current State), suggestedApproach (Deliverables), acceptance (Acceptance Criteria).\n// Labels include the criterion."
new_string: "// v2: body uses anchor (Current State), suggestedApproach (Deliverables), acceptance (Acceptance Criteria).\n// The criterion is not a label — it's already in the body's header line; nothing reads\n// it back off a label, and per-criterion labels are the class that hit GitHub's 100-char cap."
```

```
old_string: "    labels: ['code-health', `code-health:risk-${finding.risk}`, `code-health:effort-${finding.effort}`, `code-health:${finding.criterion}`],"
new_string: "    labels: ['code-health', `code-health:risk-${finding.risk}`, `code-health:effort-${finding.effort}`],"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review" && node --test bin/lib/code-health/tests/issue-payload.test.js`
Expected: PASS — all tests green

- [ ] **Step 5: Remove the now-unused `description` field from criteria.js and its tests**

Edit `bin/lib/code-health/criteria.js` — update the file header comment:

```
old_string: "// Each entry: { id, description, appliesTo, fragment, confidenceFloor }\n//   description:   real, human-readable one-liner used as the GitHub label description —\n//                  must stay under GitHub's 100-char label-description cap (see criteria.test.js)\n//   appliesTo:      'universal' | string[]  (area type strings, e.g. ['frontend','library'])"
new_string: "// Each entry: { id, appliesTo, fragment, confidenceFloor }\n//   appliesTo:      'universal' | string[]  (area type strings, e.g. ['frontend','library'])"
```

Then remove every `description:` line from the 23 `CRITERIA` entries with a single scripted pass — both the 15 multi-line entries (description on its own line) and the 8 single-line domain entries (description inline mid-line), including the one entry (`test-quality`) that uses double quotes because its text contains an apostrophe:

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
pwd && git rev-parse --show-toplevel
node -e "
  const fs = require('fs');
  const path = 'bin/lib/code-health/criteria.js';
  let src = fs.readFileSync(path, 'utf8');
  // Multi-line entries: the description sits on its own line — remove the
  // preceding newline + indentation along with it so no blank line remains.
  src = src.replace(/\n[ \t]*description: (['\"]).*?\1,/g, '');
  // Single-line domain entries: description sits inline between two other
  // fields on the same line — collapse the surrounding whitespace to one space.
  src = src.replace(/[ \t]*description: (['\"]).*?\1,[ \t]*/g, ' ');
  fs.writeFileSync(path, src);
"
grep -c 'description:' bin/lib/code-health/criteria.js   # expect 0
```

Edit `bin/lib/code-health/tests/criteria.test.js` — remove the two tests tied to the removed field:

```
old_string: "test('every criterion has a non-empty description', () => {\n  for (const c of CRITERIA) {\n    assert.ok(\n      typeof c.description === 'string' && c.description.trim().length > 0,\n      `criterion ${c.id} is missing a description`,\n    );\n  }\n});\n\n// Every description ends up as a `gh label create --description` value — GitHub's cap is\n// 100 characters (see commit 54ab897, which hit and fixed this exact bug once already for\n// status:in-progress). A description over the cap makes the label bootstrap 422 on first use\n// and silently breaks issue filing for that criterion.\ntest('every criterion description stays under GitHub\\'s 100-char label-description cap', () => {\n  for (const c of CRITERIA) {\n    assert.ok(\n      c.description.length <= 100,\n      `criterion ${c.id}'s description is ${c.description.length} chars, over GitHub's 100-char label-description cap: \"${c.description}\"`,\n    );\n  }\n});"
new_string: "// description was removed from CRITERIA entries — criteria no longer bootstrap their own\n// GitHub label (see bin/lib/code-health/issue-payload.js); the 100-char-cap check now lives\n// in bin/lib/issues/tests/labels.test.js as a property of ensureLabelPayload itself."
```

- [ ] **Step 6: Run the full code-health test suite to verify it passes**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review" && node --test bin/lib/code-health/tests/`
Expected: PASS — 0 failures (criteria.test.js and issue-payload.test.js both green; every other file in the directory unaffected)

- [ ] **Step 7: Update `skills/code-health/SKILL.md` Step 9 — drop per-criterion bootstrap, use `ensureLabelPayload` for the rest**

Read the current Step 9 content first (`skills/code-health/SKILL.md` around line 211-232) to confirm exact text, then:

```
old_string: "**Step 9 — FILE / REOPEN ISSUES.**\n\nBefore filing, ensure the criterion label carries a real description rather than the blank one `gh issue create` would auto-vivify on first use. For each payload's criterion, check whether the label already exists and create it with a description if not:\n\n```bash\nLABEL=\"code-health:<criterion>\"\nDESCRIPTION=\"<the criterion's description field from bin/lib/code-health/criteria.js — read it via: node -e \\\"const {getCriterion}=require('\\${CLAUDE_PLUGIN_ROOT}/bin/lib/code-health/criteria.js'); console.log(getCriterion('<criterion>').description)\\\">\"\ngh label list --search \"$LABEL\" --json name -q '.[].name' | grep -qx \"$LABEL\" || \\\n  gh label create \"$LABEL\" --description \"$DESCRIPTION\"\n```\n\nFor each payload in `/tmp/code-health-payloads.json`, call `gh issue create`. The engine is emit-only; filing is always done by the skill:\n\n```bash\ngh issue create \\\n  --title \"<payload.title>\" \\\n  --body \"<payload.body>\" \\\n  --label code-health \\\n  --label \"code-health:risk-<tier>\" \\\n  --label \"code-health:effort-<tier>\" \\\n  --label \"code-health:<criterion>\"\n```"
new_string: "**Step 9 — FILE / REOPEN ISSUES.**\n\nBefore filing, bootstrap the three label families this run needs with real descriptions — using the shared helper so a too-long description fails loudly here rather than as a 422 on `gh issue create`:\n\n```bash\nnode -e \"\n  const { ensureLabelPayload } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/labels.js');\n  const labels = [\n    ['code-health', 'Filed by the code-health engine — a systematic maintainability finding'],\n    ['code-health:risk-low', \\\"Risk tier if this finding's suggested fix goes wrong\\\"],\n    ['code-health:risk-medium', \\\"Risk tier if this finding's suggested fix goes wrong\\\"],\n    ['code-health:risk-high', \\\"Risk tier if this finding's suggested fix goes wrong\\\"],\n    ['code-health:effort-low', \\\"Estimated effort to implement this finding's suggested fix\\\"],\n    ['code-health:effort-medium', \\\"Estimated effort to implement this finding's suggested fix\\\"],\n    ['code-health:effort-high', \\\"Estimated effort to implement this finding's suggested fix\\\"],\n  ];\n  console.log(JSON.stringify(labels.map(([n, d]) => ensureLabelPayload(n, d))));\n\" > /tmp/code-health-label-payloads.json\nnode -e \"const ls=require('/tmp/code-health-label-payloads.json'); ls.forEach(l => console.log(l.name + '\\t' + l.description))\" | while IFS=$'\\t' read -r NAME DESCRIPTION; do\n  gh label list --search \"$NAME\" --json name -q '.[].name' | grep -qx \"$NAME\" || \\\n    gh label create \"$NAME\" --description \"$DESCRIPTION\"\ndone\n```\n\nThere is no per-criterion label anymore — the criterion is already in the issue body's header line (`**Criterion:** ...`), and nothing reads it back off a label; this is also the label class that hit GitHub's 100-char cap (see `bin/lib/code-health/issue-payload.js`).\n\nFor each payload in `/tmp/code-health-payloads.json`, call `gh issue create`. The engine is emit-only; filing is always done by the skill:\n\n```bash\ngh issue create \\\n  --title \"<payload.title>\" \\\n  --body \"<payload.body>\" \\\n  --label code-health \\\n  --label \"code-health:risk-<tier>\" \\\n  --label \"code-health:effort-<tier>\"\n```"
```

- [ ] **Step 8: Verify no stale per-criterion label references remain**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
grep -n 'code-health:<criterion>\|code-health:\${finding.criterion}\|code-health:\${criterion}' skills/code-health/SKILL.md bin/lib/code-health/issue-payload.js
echo "exit: $?"   # expect 1 (grep found nothing)
```

- [ ] **Step 9: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
pwd && git rev-parse --show-toplevel
git add bin/lib/code-health/issue-payload.js bin/lib/code-health/criteria.js bin/lib/code-health/tests/criteria.test.js bin/lib/code-health/tests/issue-payload.test.js skills/code-health/SKILL.md
git commit -m "Drop code-health's per-criterion label — criterion already lives in the issue body, nothing read the label back"
```

---

### Task 5: harness-health label bootstrap with real descriptions

**Files:**
- Modify: `skills/harness-health/SKILL.md`

**Correction found during planning:** the design doc assumed harness-health mirrors code-health's `risk-*`/`effort-*` scheme. Verified against `bin/lib/harness-health/validate-finding.js:10` — harness-health's second label dimension is `classification`, a 2-value enum (`CLASSIFICATION_VALUES = new Set(['additive', 'restructural'])`), plus a distinct `new-skill` kind (`bin/lib/harness-health/issue-payload.js:60`: `labels: ['harness-health', finding.kind === 'new-skill' ? 'harness-health:new-skill' : \`harness-health:${finding.classification}\`]`). This is a small, bounded label set already — not the sprawl problem Task 4 fixed for code-health — so there is nothing to *remove* here. The actual gap (confirmed: `skills/harness-health/SKILL.md` never bootstraps any of its labels with a description, unlike every sibling skill) gets the same `ensureLabelPayload` treatment as Task 4's remaining code-health labels.

**Interfaces:**
- Consumes: `ensureLabelPayload` from Task 1.

- [ ] **Step 1: Add label bootstrap before the `gh issue create` call**

Read `skills/harness-health/SKILL.md` around line 104-114 (Step 7 — APPLY or FILE) to confirm exact current text, then insert a bootstrap block immediately before the existing filing bullet:

```
old_string: "**Step 7 — APPLY or FILE.**\n\nEach payload in `/tmp/harness-health-payloads.json` carries structured fields, not just the GitHub issue text — `id`, `kind`, `target`, `assetType`, `category`, `section`, `classification`, `confidence`, `reversibility`, `oldString`, `newString` are all present directly on the payload object (not just embedded in `payload.body`'s markdown)."
new_string: "**Step 7 — APPLY or FILE.**\n\nBefore filing anything this firing, bootstrap harness-health's labels with real descriptions — this project's other issue-filing skills (code-health) already do this; harness-health previously did not, leaving every one of its labels with GitHub's blank auto-vivified description:\n\n```bash\nnode -e \"\n  const { ensureLabelPayload } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/labels.js');\n  const labels = [\n    ['harness-health', 'Filed by the harness-health engine — a plugin harness maintenance finding'],\n    ['harness-health:additive', 'Safe, mechanical patch — additive change with no removed behavior'],\n    ['harness-health:restructural', 'Structural change requiring human review before applying'],\n    ['harness-health:new-skill', 'Proposes a new skill candidate surfaced by harness-health'],\n  ];\n  console.log(JSON.stringify(labels.map(([n, d]) => ensureLabelPayload(n, d))));\n\" > /tmp/harness-health-label-payloads.json\nnode -e \"const ls=require('/tmp/harness-health-label-payloads.json'); ls.forEach(l => console.log(l.name + '\\t' + l.description))\" | while IFS=$'\\t' read -r NAME DESCRIPTION; do\n  gh label list --search \"$NAME\" --json name -q '.[].name' | grep -qx \"$NAME\" || \\\n    gh label create \"$NAME\" --description \"$DESCRIPTION\"\ndone\n```\n\nEach payload in `/tmp/harness-health-payloads.json` carries structured fields, not just the GitHub issue text — `id`, `kind`, `target`, `assetType`, `category`, `section`, `classification`, `confidence`, `reversibility`, `oldString`, `newString` are all present directly on the payload object (not just embedded in `payload.body`'s markdown)."
```

- [ ] **Step 2: Verify the bootstrap block landed correctly**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
grep -n "ensureLabelPayload" skills/harness-health/SKILL.md
```

Expected: two matches (the `require` line and the `.map(([n, d]) => ...)` line).

- [ ] **Step 3: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
pwd && git rev-parse --show-toplevel
git add skills/harness-health/SKILL.md
git commit -m "Bootstrap harness-health's labels with real descriptions via ensureLabelPayload"
```

---

### Task 6: `github-pr-scan.md` — new `triage-queue` scope

**Files:**
- Modify: `skills/_shared/github-pr-scan.md`

**Confirmed bug this fixes:** `skills/help/status-scan.md` Stage 4.6 independently computes "pending authorization" without excluding `status:blocked` — a blocked issue carries none of the three tier labels, so it satisfies "untiered" and shows up in *both* the "Pending authorization" line and the "Blocked" line on the same dashboard (verified during design by reading the actual Stage 4.6 bash: `untiered = all.filter(i => !names(i).some(n => n === 'tier:needs-review' || ...))` has no `status:blocked` exclusion).

- [ ] **Step 1: Add the `triage-queue` scope section**

Insert a new `## Scope: triage-queue` section after the existing `## Scope: repo-wide` section (which ends right before the `Findings and recommendations` table):

```
old_string: "This is a maintenance signal only — `/tidy` never applies a tier label itself (`/claude-tweaks:triage` owns that). Surface the count in the digest's \"Still needs your review\" section (see `tidy/SKILL.md`'s digest section) as `**Pending authorization:** {N} issues awaiting a tier label`.\n\nFindings and recommendations (tidy Action Vocabulary):"
new_string: "This is a maintenance signal only — `/tidy` never applies a tier label itself (`/claude-tweaks:triage` owns that). Surface the count in the digest's \"Still needs your review\" section (see `tidy/SKILL.md`'s digest section) as `**Pending authorization:** {N} issues awaiting a tier label`.\n\n## Scope: `triage-queue` (consumed by /help Stage 4.6)\n\nThree cheap counts for the dashboard's Triage Queue section. This scope exists so `/help` never hand-writes its own query for these numbers — see the fix this closes: Stage 4.6 previously computed \"pending authorization\" without excluding `status:blocked`, so a blocked issue counted as both pending AND blocked on the same dashboard.\n\n1. **Pending authorization** — code-health + harness-health issues carrying none of `tier:needs-review`, `tier:approved`, `tier:fast-track`, **and not carrying** `status:blocked`. (The exclusion is the fix: a blocked issue already had its decision and failed out — it is not \"pending your initial decision.\")\n\n   ```bash\n   gh issue list --label code-health --state open --json number,labels --limit 200 > /tmp/triage-queue-ch.json\n   gh issue list --label harness-health --state open --json number,labels --limit 200 > /tmp/triage-queue-hh.json\n   node -e \"\n     const all = [...require('/tmp/triage-queue-ch.json'), ...require('/tmp/triage-queue-hh.json')];\n     const names = i => (i.labels || []).map(l => (typeof l === 'string' ? l : l.name));\n     const pending = all.filter(i => {\n       const n = names(i);\n       const hasTier = n.some(x => x === 'tier:needs-review' || x === 'tier:approved' || x === 'tier:fast-track');\n       const blocked = n.includes('status:blocked');\n       return !hasTier && !blocked;\n     }).length;\n     console.log(pending);\n   \"\n   ```\n\n2. **Blocked** — `gh issue list --label status:blocked --state open --json number --limit 200 -q 'length'`\n\n3. **Auto-merged this week** — `[fast-lane]`-tagged commits on the *default* branch (never the current worktree's own branch — see the note on `worktree.always` below), last 7 days:\n\n   ```bash\n   SINCE=$(node -e \"console.log(new Date(Date.now() - 7*24*60*60*1000).toISOString())\")\n   gh api \"repos/{owner}/{repo}/commits?since=${SINCE}&per_page=100\" -q '[.[] | select(.commit.message | contains(\"[fast-lane]\"))] | length'\n   ```\n\n   The commits endpoint defaults to the default branch when no `sha=` param is given — correct regardless of which branch/worktree `/help` itself runs from under `worktree.always`. `SINCE` is computed via `node`, not shell `date` arithmetic, which differs between BSD/macOS and GNU date.\n\nRender as three lines: `Pending authorization: **{N}** issues awaiting your decision` / `Blocked: **{N}** issues hit their retry ceiling` / `Auto-merged this week: **{N}** fast-lane merges` — omit any line whose count is 0.\n\nFindings and recommendations (tidy Action Vocabulary):"
```

- [ ] **Step 2: Verify the scope section landed with correct heading level and no stale `status:approved`-style label names**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
grep -n "^## Scope: \`triage-queue\`" skills/_shared/github-pr-scan.md
grep -n "tier:needs-review\|tier:approved\|tier:fast-track\|status:blocked" skills/_shared/github-pr-scan.md
```

Expected: first grep finds the new heading; second grep shows the new scope's usages plus item 7's pre-existing (Task 3-renamed) usages — no bare `status:approved`/`status:needs-review`/`status:fast-track` anywhere.

- [ ] **Step 3: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
pwd && git rev-parse --show-toplevel
git add skills/_shared/github-pr-scan.md
git commit -m "Add triage-queue scope to github-pr-scan.md — single source for /help's dashboard counts"
```

---

### Task 7: `help/status-scan.md` — consume the shared scope, call `groupByFileOverlap`

**Files:**
- Modify: `skills/help/status-scan.md`

**Interfaces:**
- Consumes: `github-pr-scan.md`'s `triage-queue` scope (Task 6); `groupByFileOverlap` from Task 2.

- [ ] **Step 1: Stage 4.6 — replace the independent query with the shared scope**

```
old_string: "## Stage 4.6: Triage Queue (GitHub)\n\nCheap counts only — detail stays `/claude-tweaks:triage`'s and `/tidy`'s job,\nnot `/help`'s. Skip silently (same fail-open detection ladder as Stage 4.5)\nwhen `gh` is unavailable, unauthenticated, or the repo has no GitHub remote.\n\n```bash\ngh issue list --label code-health --state open --json number,labels --limit 200 > /tmp/help-triage-ch.json\ngh issue list --label harness-health --state open --json number,labels --limit 200 > /tmp/help-triage-hh.json\nnode -e \"\n  const all = [...require('/tmp/help-triage-ch.json'), ...require('/tmp/help-triage-hh.json')];\n  const names = i => (i.labels || []).map(l => (typeof l === 'string' ? l : l.name));\n  const untiered = all.filter(i => !names(i).some(n => n === 'status:needs-review' || n === 'status:approved' || n === 'status:fast-track')).length;\n  console.log(untiered);\n\"\ngh issue list --label status:blocked --state open --json number --limit 200 -q 'length'\nSINCE=$(node -e \"console.log(new Date(Date.now() - 7*24*60*60*1000).toISOString())\")\ngh api \"repos/{owner}/{repo}/commits?since=${SINCE}&per_page=100\" -q '[.[] | select(.commit.message | contains(\"[fast-lane]\"))] | length'\n```\n\nThe commits query counts `[fast-lane]`-tagged commits on the repo's *default* branch — never the current worktree's own branch, which typically won't contain them yet (this project enforces `worktree.always`, so `/help` is commonly invoked from inside a feature-branch worktree whose branch forked before any recent auto-merges landed). The commits endpoint defaults to the default branch when no `sha=` param is given, so this is correct regardless of which branch/worktree `/help` itself runs from. `SINCE` is computed via `node` rather than shell `date` arithmetic, which differs between BSD/macOS and GNU date.\n\nRender as three lines on the dashboard:\n\n- Pending authorization: **N issues awaiting your decision** — run `/claude-tweaks:triage` (omit this line when N is 0)\n- Blocked: **N issues hit their retry ceiling** — run `/claude-tweaks:triage` to review (omit this line when N is 0)\n- Auto-merged this week: **N fast-lane merges** on the default branch in the last 7 days (omit this line when N is 0)"
new_string: "## Stage 4.6: Triage Queue (GitHub)\n\nCheap counts only — detail stays `/claude-tweaks:triage`'s and `/tidy`'s job,\nnot `/help`'s. Skip silently (same fail-open detection ladder as Stage 4.5)\nwhen `gh` is unavailable, unauthenticated, or the repo has no GitHub remote.\n\nScan per `_shared/github-pr-scan.md`, **`triage-queue`** scope. The dispatcher inlines that file's Detection Ladder, `triage-queue` scope section, and the three-line render format into this agent's prompt — subagents cannot read sibling files. This is the single source for these three counts; this stage does not compute them independently (previously it did, and its own version double-counted `status:blocked` issues inside \"pending authorization\" — the shared scope excludes them)."
```

- [ ] **Step 2: Stage 3 — call `groupByFileOverlap` instead of restating the algorithm**

```
old_string: "## Stage 3: Specs Ready to Build (`specs/INDEX.md` + `specs/*.md`)\n\n- Find specs where all prerequisites are met (blocking specs are complete)\n- Check YAML frontmatter for `status: not-started` with empty or satisfied `blocked-by`\n- Check which tier they're in (lower tier = higher priority)\n- Check if a plan already exists in `docs/plans/` (ready for immediate `/claude-tweaks:build`)\n- **Implicit dependency check:** Extract `Key Files` from each ready spec and each in-progress (or other not-started) spec. If a ready spec shares Key Files with any non-completed spec, flag it in the \"Needs Attention\" table — building it now risks merge conflicts or duplicated work. This is the same algorithm that `/claude-tweaks:specify` runs at spec creation time, re-run here to catch conflicts from specs that started building since then."
new_string: "## Stage 3: Specs Ready to Build (`specs/INDEX.md` + `specs/*.md`)\n\n- Find specs where all prerequisites are met (blocking specs are complete)\n- Check YAML frontmatter for `status: not-started` with empty or satisfied `blocked-by`\n- Check which tier they're in (lower tier = higher priority)\n- Check if a plan already exists in `docs/plans/` (ready for immediate `/claude-tweaks:build`)\n- **Implicit dependency check:** extract `Key Files` from each ready spec and each in-progress (or other not-started) spec, then call the shared grouping primitive — the same one `/claude-tweaks:specify` uses at spec creation time (`bin/lib/issues/grouping.js`), re-run here to catch conflicts from specs that started building since then:\n\n  ```bash\n  node -e \"\n    const { groupByFileOverlap } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/grouping.js');\n    const specs = require('/tmp/help-specs-key-files.json'); // [{id, keyFiles}], excludes completed specs\n    const groups = groupByFileOverlap(specs);\n    const conflicts = groups.filter(g => g.length > 1);\n    console.log(JSON.stringify(conflicts));\n  \"\n  ```\n\n  A ready spec appearing in any group of size > 1 shares files with another non-completed spec — flag it in the \"Needs Attention\" table, listing the other group members as the conflicting specs."
```

- [ ] **Step 3: Verify**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
grep -n "groupByFileOverlap\|triage-queue" skills/help/status-scan.md
grep -c "status:needs-review\|status:approved\|status:fast-track" skills/help/status-scan.md
```

Expected: first grep shows both new call sites; second grep shows `0` (already renamed by Task 3, and this task's edits introduce no new occurrences of the old names).

- [ ] **Step 4: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
pwd && git rev-parse --show-toplevel
git add skills/help/status-scan.md
git commit -m "help/status-scan.md: consume the shared triage-queue scope; Stage 3 calls groupByFileOverlap"
```

---

### Task 8: `specify/SKILL.md` — call `groupByFileOverlap` for implicit dependency detection

**Files:**
- Modify: `skills/specify/SKILL.md`

**Interfaces:**
- Consumes: `groupByFileOverlap` from Task 2.

- [ ] **Step 1: Replace the prose-only algorithm description with a call to the shared function**

```
old_string: "### Implicit Dependency Detection\n\nAfter decomposing into work units, before writing spec files, check each new work unit's planned Key Files against the file reference map from Step 1.\n\n| Overlap Type | Meaning | Action |\n|-------------|---------|--------|\n| New spec's files overlap with a **completed** spec | No conflict — completed specs are done | No action |\n| New spec's files overlap with a **not-started** spec | Potential conflict — both will modify the same files | Add to `blocked-by` or reorder to avoid concurrent modification |\n| New spec's files overlap with an **in-progress** spec | Active conflict — concurrent changes to the same files | Add to `blocked-by` — wait for the in-progress spec to finish |\n| Two **new** specs from this decomposition share files | Internal conflict within the batch | Add explicit dependency between them and order accordingly |\n\nPresent any detected implicit dependencies as part of the Step 9 summary. These are flagged alongside the explicit `blocked-by` relationships from the tier/prerequisite analysis.\n\n> **Algorithm shared with /claude-tweaks:help:** Both /specify and /help use the same implicit dependency check — compare Key Files from the target spec against Key Files from all non-completed specs. /specify runs this at creation time; /help re-runs it at dashboard time to catch new conflicts from specs that started building after /specify ran.\n\n> **Why this matters:** Explicit `blocked-by` captures logical dependencies (spec B needs spec A's API). File-based overlap captures physical dependencies (both specs modify the same file). Missing the physical dependency leads to merge conflicts and duplicated work during concurrent builds."
new_string: "### Implicit Dependency Detection\n\nAfter decomposing into work units, before writing spec files, build the input set — every new work unit plus every **non-completed** existing spec (from the file reference map in Step 1), each as `{id, keyFiles}` — and partition it with the shared grouping primitive:\n\n```bash\nnode -e \"\n  const { groupByFileOverlap } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/grouping.js');\n  const items = require('/tmp/specify-key-files.json'); // [{id, keyFiles}] — new work units + non-completed specs\n  console.log(JSON.stringify(groupByFileOverlap(items).filter(g => g.length > 1)));\n\"\n```\n\nEach returned group of size > 1 is a set of specs/work-units sharing at least one file, directly or transitively. Classify each new work unit's group membership:\n\n| Overlap Type | Meaning | Action |\n|-------------|---------|--------|\n| Grouped with a **not-started** spec | Potential conflict — both will modify the same files | Add to `blocked-by` or reorder to avoid concurrent modification |\n| Grouped with an **in-progress** spec | Active conflict — concurrent changes to the same files | Add to `blocked-by` — wait for the in-progress spec to finish |\n| Grouped with another **new** spec from this decomposition | Internal conflict within the batch | Add explicit dependency between them and order accordingly |\n\n(Completed specs are excluded from the input set entirely — no group they'd appear in needs action.)\n\nPresent any detected implicit dependencies as part of the Step 9 summary. These are flagged alongside the explicit `blocked-by` relationships from the tier/prerequisite analysis.\n\n> **Algorithm shared with /claude-tweaks:help:** both /specify and /help call the same `groupByFileOverlap` (`bin/lib/issues/grouping.js`) — /specify runs it at creation time; /help re-runs it at dashboard time to catch new conflicts from specs that started building after /specify ran. Also reused by `/claude-tweaks:triage dispatch` to group claimed issues before parallel execution (see `triage/SKILL.md`).\n\n> **Why this matters:** Explicit `blocked-by` captures logical dependencies (spec B needs spec A's API). File-based overlap captures physical dependencies (both specs modify the same file). Missing the physical dependency leads to merge conflicts and duplicated work during concurrent builds."
```

- [ ] **Step 2: Verify**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
grep -n "groupByFileOverlap" skills/specify/SKILL.md
```

Expected: two matches (the `require` line and the filter-usage line).

- [ ] **Step 3: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
pwd && git rev-parse --show-toplevel
git add skills/specify/SKILL.md
git commit -m "specify/SKILL.md: call the shared groupByFileOverlap instead of restating the algorithm in prose"
```

---

### Task 9: `triage/SKILL.md` — grouped, capped-parallel dispatch + consolidated console

**Files:**
- Modify: `skills/triage/SKILL.md`

**Correction found during planning:** the design doc's Section 4 assumed `/flow #A #B #C` (multiple issue references) was a valid multi-spec invocation form. Verified against `skills/flow/SKILL.md:46,67`: issue-reference mode takes exactly **one** `#<issue>` and is documented as "the only /flow entry point that does not take a spec number directly." Multi-spec mode (`skills/flow/SKILL.md:89`) takes **spec numbers**, comma-joined (`/claude-tweaks:flow 42,45,48`), not issue references. There is no multi-issue form. This refines (not changes the scope of) the design: for a bundle, dispatch itself calls `/claude-tweaks:specify "#{issue}"` once per bundle member first (the same derivation `/flow`'s own issue-mode already performs internally for a single issue — `skills/flow/SKILL.md:46`), collects the resulting spec numbers, then invokes ordinary multi-spec `/flow "{spec1},{spec2},..."` once for the whole bundle. This keeps `/flow`'s documented boundary intact ("`/flow` never selects, filters, sorts, or claims issues itself" — `skills/triage/SKILL.md`'s own Relationship table) since all issue-to-spec batching stays in triage.

**Interfaces:**
- Consumes: `groupByFileOverlap` and `extractKeyFiles` from Task 2 (already renamed to `tier:*` by Task 3).

- [ ] **Step 1: Insert Step 2.5 — group claimed issues by file overlap**

Insert immediately after the existing Step 2 (Claim each) content, before `### Step 3: Hand off to /flow`:

```
old_string: "Any other `gh` failure during claim: skip, log, continue.\n\n### Step 3: Hand off to `/flow`"
new_string: "Any other `gh` failure during claim: skip, log, continue.\n\n### Step 2.5: Group claimed issues by file overlap\n\nClaimed issues that touch the same code should build on each other's commits in one shared worktree, not diverge across isolated parallel worktrees. Extract each claimed issue's key files straight from its body (no spec exists yet at this point — extraction happens before any spec derivation) and partition:\n\n```bash\n> /tmp/dispatch-claimed-issues.ndjson\nfor ISSUE in $CLAIMED_ISSUES; do   # $CLAIMED_ISSUES: issue numbers successfully claimed in Step 2\n  gh api \"repos/{owner}/{repo}/issues/${ISSUE}\" --jq '{id:.number,body:.body,labels:[.labels[].name]}' >> /tmp/dispatch-claimed-issues.ndjson\ndone\nnode -e \"\n  const fs = require('fs');\n  const { extractKeyFiles, groupByFileOverlap } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/grouping.js');\n  const issues = fs.readFileSync('/tmp/dispatch-claimed-issues.ndjson', 'utf8').trim().split('\\n').filter(Boolean).map(JSON.parse);\n  const items = issues.map((i) => ({ id: i.id, keyFiles: extractKeyFiles(i) }));\n  console.log(JSON.stringify(groupByFileOverlap(items)));\n\" > /tmp/dispatch-groups.json\n```\n\n`/tmp/dispatch-groups.json` is an array of groups, each an array of issue numbers. A group of size 1 is a **singleton** (dispatched as plain issue-mode `/flow #{issue}`, unchanged from before this design); a group of size 2+ is a **bundle** (each member gets its own spec derived first, then the bundle runs as one multi-spec `/flow` invocation — see Step 3).\n\n### Step 3: Hand off to `/flow`"
```

- [ ] **Step 2: Rewrite Step 3 — capped-concurrent group dispatch**

```
old_string: "### Step 3: Hand off to `/flow`\n\nFor each successfully claimed issue, invoke `/claude-tweaks:flow #{issue}`\n(the pure-executor issue-reference form — see `flow/SKILL.md`). `/flow`\nderives a spec via `/claude-tweaks:specify #{issue}` (the existing\nissue-ingestion path) and runs the standard pipeline."
new_string: "### Step 3: Dispatch groups, capped-concurrent\n\nWork through `/tmp/dispatch-groups.json` at up to `triage-dispatch-max-concurrent` groups running at once (default 3 — see Configuration). Each group becomes one Task agent with its own worktree (created via `/superpowers:using-git-worktrees` exactly as a normal `/flow` invocation would — do not pre-create or share a worktree path across groups). Queued groups start as soon as a slot frees up; there is no per-firing timeout, only the concurrency throttle — nothing elsewhere in this codebase imposes one (existing parallel-Task dispatch sites, e.g. `/help`'s Stage 1-7, already wait for all dispatched agents regardless of duration).\n\n**Singleton group** `[123]` — the agent's job is exactly today's single-issue dispatch: invoke `/claude-tweaks:flow #123` (issue-mode derives its own spec internally, per `flow/SKILL.md`).\n\n**Bundle group** `[123, 456]` — `/flow` has no multi-issue form (verified: multi-spec mode takes spec numbers, not issue references — `flow/SKILL.md`'s multi-spec syntax is `/claude-tweaks:flow 42,45,48`). The agent derives a spec per member first, then runs the bundle as one multi-spec invocation:\n\n```bash\nfor ISSUE in 123 456; do\n  /claude-tweaks:specify \"#${ISSUE}\"   # derives a spec, carries recon-issue/recon-fingerprint frontmatter forward\n  # capture the resulting spec number from specify's own summary output\ndone\n# once every member has a spec:\n/claude-tweaks:flow \"${SPEC_1},${SPEC_2}\"   # multi-spec, one shared worktree — see multi-spec.md\n```\n\nEach group's `Task()` prompt (per `_shared/subagent-output-contract.md`'s input discipline — minimal input, literal output template inlined, no conversation history):\n\n```\nTask scope: Execute claude-tweaks pipeline work for this group of already-claimed GitHub\nissues: {issue list}. Singleton -> run `/claude-tweaks:flow #{issue}`. Bundle (2+ issues) ->\nfor each issue run `/claude-tweaks:specify \"#{issue}\"` to derive a spec, then run\n`/claude-tweaks:flow \"{spec1},{spec2},...}\"` once with the resulting spec numbers\ncomma-joined. Handle any HARD-GATE failure per skills/triage/SKILL.md's Step 4 (retry\nceiling / failure-downgrade rule) before finishing -- do not leave a failed issue's claim\nor label state unresolved.\n\nWorking directory: create your own worktree via /superpowers:using-git-worktrees; do not\nreuse a path from another group. Echo `pwd` and `git rev-parse --show-toplevel` before any\ncommit and verify both resolve to your own worktree.\n\nStatus line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS\n/ NEEDS_CONTEXT / BLOCKED.\n\nOUTPUT FORMAT (required), after the status line -- return ONLY these lines, no preamble:\n\nGROUP: {comma-joined issue numbers}\nOUTCOME: {merged | pr-opened | pending-review | failed | blocked}\nMANIFEST: {path to this group's run-dir manifest.yml/decisions.md; for a singleton, the\n  single-spec run dir path}\n\nOne line per issue in this group that hit a HARD-GATE or the retry ceiling (omit if none):\nISSUE #{n}: {failed:{gate} | blocked:retry-ceiling}\n\n[Use: Standard model -- this dispatch wraps full pipeline execution, not analysis; the\npipeline's own steps select their own models as usual.]\n```\n\nThis is a new dispatch shape for this codebase -- none of Templates A/B/C in `_shared/subagent-output-contract.md` fit an agent that executes a full pipeline rather than returning findings/locations/a yes-no, so this task defines its own minimal template inline here rather than forcing a template mismatch. The universal parts of the contract still apply: the four-value status line, minimal input, and literal (not referenced) output format."
```

- [ ] **Step 3: Add a framing note to Step 4 — it now runs inside each group's Task agent**

```
old_string: "### Step 4: On pipeline failure — retry ceiling\n\nWhen a handed-off `/flow` run fails a HARD-GATE (never reaches `/wrap-up`):"
new_string: "### Step 4: On pipeline failure — retry ceiling\n\nThis procedure now runs inside each group's own Task agent (Step 3), against that agent's own issue(s) — not in dispatch's main thread. The mechanics below (ownership check, release, retry-ceiling math, failure-downgrade rule) are unchanged; only who executes them changed.\n\nWhen a handed-off `/flow` run fails a HARD-GATE (never reaches `/wrap-up`):"
```

- [ ] **Step 4: Add the Consolidated Review Console section**

Insert after Step 4's content, before `## Auto-merge gate (fast-track only)`:

```
old_string: "**Failure-downgrade rule:** whenever a `status:fast-track` issue's run fails for *any* reason —\nincluding a sub-ceiling failure handled by item 6 above, not only the ceiling-hit case — downgrade\nit to `status:approved` before the next retry. A retry that didn't come back clean the first\ntime never gets another unsupervised shot at auto-merge. This is not a separate, optional step:\nitem 6's \"leave the tier label in place\" refers to whatever tier remains *after* this downgrade\nruns, never to `status:fast-track` unconditionally.\n\n## Auto-merge gate (fast-track only)"
new_string: "**Failure-downgrade rule:** whenever a `tier:fast-track` issue's run fails for *any* reason —\nincluding a sub-ceiling failure handled by item 6 above, not only the ceiling-hit case — downgrade\nit to `tier:approved` before the next retry. A retry that didn't come back clean the first\ntime never gets another unsupervised shot at auto-merge. This is not a separate, optional step:\nitem 6's \"leave the tier label in place\" refers to whatever tier remains *after* this downgrade\nruns, never to `tier:fast-track` unconditionally.\n\n## Consolidated Review Console (dispatch only)\n\nAfter every group from Step 3 reports back (`DONE`, `DONE_WITH_CONCERNS`, or `BLOCKED`), render **one** Review Console for the whole firing instead of the human seeing one per issue. Reuse `flow/multispec-review-console.md`'s table format and Hard Requirements (every entry surfaced, `Spec`/`Issue` column mandatory, sort order: reversibility:low first, then severity:high first, tiebreaker issue number ascending) — read every group's manifest/`decisions.md` (a bundle's is the standard multi-spec manifest; a singleton's is the degenerate one-item case) and consolidate.\n\nThe auto-merge gate (below) is evaluated per issue, not per group, before this console renders — a bundle where one issue auto-merged cleanly and the other didn't shows the auto-merged one as an FYI row (already merged) and the other as a normal pending-approval row in the same console.\n\nIf every group's manifest shows zero decisions, zero staged items, and zero HARD-GATE failures across the whole firing, skip the console entirely — log \"Dispatch firing: nothing to review\" (same empty-console fast path as `multispec-review-console.md`).\n\n## Auto-merge gate (fast-track only)"
```

- [ ] **Step 5: Add the `triage-dispatch-max-concurrent` config row**

```
old_string: "| `triage-fast-track-max-files` | `2` | Blast-radius cap on changed files for a fast-track auto-merge. |"
new_string: "| `triage-fast-track-max-files` | `2` | Blast-radius cap on changed files for a fast-track auto-merge. |\n| `triage-dispatch-max-concurrent` | `3` | Maximum groups (bundles or singleton issues) a dispatch firing runs at once; remaining groups queue for a freed slot. |"
```

- [ ] **Step 6: Verify — structure, no stale content, config row present**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
grep -n "^### Step 2.5\|^### Step 3\|^### Step 4\|^## Consolidated Review Console\|^## Auto-merge gate" skills/triage/SKILL.md
grep -n "triage-dispatch-max-concurrent" skills/triage/SKILL.md
grep -c "For each successfully claimed issue, invoke" skills/triage/SKILL.md   # expect 0 — the sequential-dispatch sentence was fully replaced
```

Expected: first grep shows the sections in order (Step 2.5, Step 3, Step 4, Consolidated Review Console, Auto-merge gate); second grep shows 2 matches (table row + Step 3's throttle sentence); third grep shows `0`.

- [ ] **Step 7: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
pwd && git rev-parse --show-toplevel
git add skills/triage/SKILL.md
git commit -m "triage/SKILL.md: group claimed issues by file overlap, dispatch capped-concurrent, one consolidated console per firing"
```

---

### Task 10: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
pwd && git rev-parse --show-toplevel
npm test 2>&1 | tail -30
```

Expected: `# pass` count increased by 22 (7 from Task 1 + 15 from Task 2) relative to this plan's starting baseline, `# fail` count unchanged at 1 (the pre-existing `tests/statusline.test.js` timing flake — confirm by name in the output, not just count).

- [ ] **Step 2: Repo-wide sweep for anything this plan should have renamed but didn't**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
grep -rn 'status:needs-review\|status:approved\|status:fast-track' --include='*.md' --include='*.yml' --include='*.js' .
echo "exit: $?"   # expect 1 (grep found nothing) across the ENTIRE repo, not just the file list from Task 3
```

Expected: no output. If this finds anything, it means Task 3's file list (built from a grep run before Tasks 4-9 added or touched other files) missed an occurrence introduced later — fix inline before considering this task done.

- [ ] **Step 3: Spot-check README's label taxonomy documentation reads correctly end-to-end**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
grep -n "tier:\*\|code-health:<criterion>\|code-health:\${finding.criterion}" README.md
```

Expected: shows the renamed `tier:*` reference from Task 3, Step 2; no per-criterion label reference remains.

- [ ] **Step 4: Confirm no task left an uncommitted change**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/github-issues-review"
git status --short
```

Expected: no output from this plan's files (the pre-existing untracked review docs/diagram from before this plan started, and the earlier bug-fix pass's uncommitted changes, are NOT part of this plan's scope — do not commit or discard them; leave as-is for the user's separate commit decision).
