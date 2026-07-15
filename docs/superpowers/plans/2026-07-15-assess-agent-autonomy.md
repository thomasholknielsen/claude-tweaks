# Assess Agent Autonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mechanical, label-only scoring in `/claude-tweaks:triage` and `/claude-tweaks:dispatch` with content-aware judgment via a new inline-invoked skill, `/claude-tweaks:assess-agent-autonomy`, without weakening the human-confirmation boundary anywhere it currently exists.

**Architecture:** A new three-mode skill (`grant-check`, `merge-check`, `failure-check`), invoked inline (Skill tool, same agent — never a fresh Task dispatch) from triage's Step 2 and dispatch's Auto-merge gate + Settle step. A new pure module, `bin/lib/issues/blast-radius.js`, supplies the one genuinely mechanical input (test-exclusion-aware diff sizing). `bin/lib/issues/tier.js`'s `recommendGrants`/`recommendTier` and two of its three legacy label adapters retire; the third (`extractHarnessHealthRiskEffort`) also retires, for a verified-correct but different reason than originally assumed (see Task 5).

**Tech Stack:** Markdown skill files (prose procedures), Node.js pure module (`bin/lib/issues/`, tested via `node --test`), no new dependencies.

## Global Constraints

- Full design doc, approved and committed: `docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md` — read it before starting; every task below implements a specific section of it.
- `merge-sensitive-paths` config key defaults to an **empty list** — do not hardcode any project-specific paths into the plugin's own default.
- `automerge-max-lines`/`automerge-max-files` are **not removed** — they become a weighted input to `merge-check`'s judgment, not a cutoff.
- Every mode's error/ambiguity handling defaults to the **conservative** outcome (see design doc's Error Handling section) — never resolve uncertainty toward more autonomy.
- `dispatch-retry-ceiling`'s counting is **unchanged** — a `transient`-classified failure still counts as an attempt; classification only affects whether `auto:merge` is additionally stripped and whether a human is notified early.
- Working Directory Discipline applies to every step below: confirm `pwd` and `git rev-parse --show-toplevel` resolve to your worktree before any commit.
- Commit message style: `{Verb} {what} — {detail}` (imperative, no conventional-commit prefixes). Reference the design doc's motivation where relevant, never invent new justification.

---

### Task 1: `bin/lib/issues/blast-radius.js` — pure blast-radius module

**Files:**
- Create: `bin/lib/issues/blast-radius.js`
- Test: `bin/lib/issues/tests/blast-radius.test.js`

**Interfaces:**
- Produces: `classifyDiffFiles(files, sensitivePaths)` — `files: [{path, additions, deletions}]`, `sensitivePaths: string[]` (glob patterns) → `[{path, isTest, isSensitive, additions, deletions}]`. `blastRadiusSummary(classifiedFiles)` → `{implLines, testLines, implFiles, testFiles, sensitiveFilesTouched}`.

- [ ] **Step 1: Write the failing tests**

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { classifyDiffFiles, blastRadiusSummary } = require('../blast-radius');

test('classifyDiffFiles marks files under a tests/ directory as isTest', () => {
  const files = [{ path: 'bin/lib/issues/tests/grouping.test.js', additions: 38, deletions: 1 }];
  const result = classifyDiffFiles(files, []);
  assert.strictEqual(result[0].isTest, true);
});

test('classifyDiffFiles marks .test.js files as isTest even outside a tests/ directory', () => {
  const files = [{ path: 'src/widget.test.js', additions: 10, deletions: 0 }];
  const result = classifyDiffFiles(files, []);
  assert.strictEqual(result[0].isTest, true);
});

test('classifyDiffFiles marks ordinary implementation files as not isTest', () => {
  const files = [{ path: 'bin/lib/issues/grouping.js', additions: 28, deletions: 5 }];
  const result = classifyDiffFiles(files, []);
  assert.strictEqual(result[0].isTest, false);
});

test('classifyDiffFiles marks a file matching merge-sensitive-paths as isSensitive', () => {
  const files = [{ path: 'bin/hooks.js', additions: 3, deletions: 1 }];
  const result = classifyDiffFiles(files, ['bin/hooks.js', 'skills/_shared/*.md']);
  assert.strictEqual(result[0].isSensitive, true);
});

test('classifyDiffFiles matches a glob-style sensitive path against a nested file', () => {
  const files = [{ path: 'skills/_shared/work-record.md', additions: 2, deletions: 0 }];
  const result = classifyDiffFiles(files, ['skills/_shared/*.md']);
  assert.strictEqual(result[0].isSensitive, true);
});

test('classifyDiffFiles marks a file not matching any sensitive path as not isSensitive', () => {
  const files = [{ path: 'bin/lib/issues/grouping.js', additions: 28, deletions: 5 }];
  const result = classifyDiffFiles(files, ['bin/hooks.js']);
  assert.strictEqual(result[0].isSensitive, false);
});

test('classifyDiffFiles defaults sensitivePaths to an empty list when omitted', () => {
  const files = [{ path: 'bin/hooks.js', additions: 1, deletions: 0 }];
  const result = classifyDiffFiles(files);
  assert.strictEqual(result[0].isSensitive, false);
});

test('blastRadiusSummary sums impl and test lines separately, #18-shaped fixture', () => {
  const classified = classifyDiffFiles(
    [
      { path: 'bin/lib/issues/grouping.js', additions: 28, deletions: 5 },
      { path: 'bin/lib/issues/tests/grouping.test.js', additions: 38, deletions: 1 },
    ],
    [],
  );
  assert.deepStrictEqual(blastRadiusSummary(classified), {
    implLines: 33,
    testLines: 39,
    implFiles: 1,
    testFiles: 1,
    sensitiveFilesTouched: [],
  });
});

test('blastRadiusSummary lists sensitiveFilesTouched by path', () => {
  const classified = classifyDiffFiles(
    [{ path: 'bin/hooks.js', additions: 3, deletions: 1 }],
    ['bin/hooks.js'],
  );
  assert.deepStrictEqual(blastRadiusSummary(classified).sensitiveFilesTouched, ['bin/hooks.js']);
});

test('blastRadiusSummary returns all-zero summary for an empty file list', () => {
  assert.deepStrictEqual(blastRadiusSummary([]), {
    implLines: 0,
    testLines: 0,
    implFiles: 0,
    testFiles: 0,
    sensitiveFilesTouched: [],
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/issues/tests/blast-radius.test.js`
Expected: FAIL — `Cannot find module '../blast-radius'`

- [ ] **Step 3: Write the implementation**

```javascript
'use strict';

// Pure: the mechanical half of assess-agent-autonomy's merge-check mode. Classifies a diff's
// files (test vs. implementation, sensitive vs. not) and reduces that to the summary merge-check
// weighs as one input alongside review findings and diff content — never a pass/fail gate on its
// own. See docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md.

const TEST_PATH_RE = /(^|\/)tests\//;
const TEST_SUFFIX_RE = /\.test\.js$/;

function isTestPath(path) {
  return TEST_PATH_RE.test(path) || TEST_SUFFIX_RE.test(path);
}

// Minimal glob support: '*' matches within a path segment (not '/'). Sufficient for this
// project's own sensitive-path shapes (e.g. 'skills/_shared/*.md', 'bin/hooks.js' as a literal).
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}

function isSensitivePath(path, sensitivePaths) {
  return sensitivePaths.some((glob) => globToRegExp(glob).test(path));
}

function classifyDiffFiles(files, sensitivePaths = []) {
  return (files || []).map((f) => ({
    path: f.path,
    isTest: isTestPath(f.path),
    isSensitive: isSensitivePath(f.path, sensitivePaths),
    additions: f.additions || 0,
    deletions: f.deletions || 0,
  }));
}

function blastRadiusSummary(classifiedFiles) {
  const summary = {
    implLines: 0,
    testLines: 0,
    implFiles: 0,
    testFiles: 0,
    sensitiveFilesTouched: [],
  };
  for (const f of classifiedFiles || []) {
    const lines = f.additions + f.deletions;
    if (f.isTest) {
      summary.testLines += lines;
      summary.testFiles += 1;
    } else {
      summary.implLines += lines;
      summary.implFiles += 1;
    }
    if (f.isSensitive) summary.sensitiveFilesTouched.push(f.path);
  }
  return summary;
}

module.exports = { classifyDiffFiles, blastRadiusSummary };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/issues/tests/blast-radius.test.js`
Expected: PASS — 10/10 tests

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/blast-radius.js bin/lib/issues/tests/blast-radius.test.js
git commit -m "Add bin/lib/issues/blast-radius.js — test-exclusion-aware diff classification

Pure module supplying assess-agent-autonomy's merge-check mode with its
one genuinely mechanical input. classifyDiffFiles marks each changed
file as test/implementation (path convention: tests/ dir or .test.js
suffix) and sensitive (against the merge-sensitive-paths config list).
blastRadiusSummary reduces that to impl/test line and file counts.

refs #33"
```

(Use this program's actual GitHub record number once filed — see Task 8's note on filing this work as a record before dispatch, if this plan is executed via `/claude-tweaks:dispatch` rather than run standalone.)

---

### Task 2: `skills/assess-agent-autonomy/SKILL.md` — the new skill

**Files:**
- Create: `skills/assess-agent-autonomy/SKILL.md`

**Interfaces:**
- Consumes: `bin/lib/issues/blast-radius.js`'s `classifyDiffFiles`/`blastRadiusSummary` (Task 1). `bin/lib/issues/tier.js`'s `extractRiskEffort` (surviving colon-form reader — unchanged by this task, retired pieces removed in Task 5, after this task's callers are wired in Tasks 3-4). `bin/lib/issues/retry.js`'s `countFailedAttempts` (unchanged, already exists).
- Produces: three inline-invocable modes other skills call by name — `grant-check`, `merge-check`, `failure-check` — each with the literal output contract shown below. Tasks 3 and 4 wire dispatch/triage to call these.

- [ ] **Step 1: Write the skill file**

```markdown
---
name: claude-tweaks:assess-agent-autonomy
description: Use when triage or dispatch need a content-aware trust verdict instead of a mechanical label lookup — grant-check informs triage's recommendation, merge-check replaces dispatch's blast-radius gate, failure-check replaces dispatch's blanket failure-revocation rule. Inline helper, never invoked directly by a human. Keywords - autonomy, trust, judgment, grant recommendation, auto-merge, blast radius, failure classification.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Assess Agent Autonomy — Content-Aware Trust Verdicts

Three-mode inline helper that replaces mechanical label lookups with judgment read from actual
record/diff/failure content. Never invoked directly by a human — always a component step inside
`/claude-tweaks:triage` or `/claude-tweaks:dispatch`:

```
/claude-tweaks:triage Step 2        [ grant-check ]  -> RECOMMEND_BUILD / RECOMMEND_MERGE
/claude-tweaks:dispatch Auto-merge  [ merge-check ]   -> VERDICT: auto-merge | needs-human
/claude-tweaks:dispatch Settle      [ failure-check ] -> CLASSIFICATION + NOTIFY_NOW
```

## When to Use

- `/claude-tweaks:triage`'s Step 2 needs a grant recommendation for a worklist record.
- `/claude-tweaks:dispatch`'s Auto-merge gate needs a merge-or-human verdict for a clean, reviewed run.
- `/claude-tweaks:dispatch`'s Settle step needs to classify why a run failed.

Not for: granting `auto:build`/`auto:merge` (still `/claude-tweaks:triage`'s human-confirmed job),
merging anything itself (`/claude-tweaks:dispatch` acts on the verdict), or any decision outside
these three call sites — this is not a general-purpose risk service.

## Input

`$ARGUMENTS` is `{mode} #{n}`, where `mode` is one of `grant-check` | `merge-check` |
`failure-check` and `#{n}` is the record's issue number (used to fetch the record body for
`grant-check`; used for reference/logging in `merge-check`/`failure-check`'s rendered output).

Invoked inline via the Skill tool — not as a fresh Task-agent dispatch. The calling agent (a
human-driven `/claude-tweaks:triage` session, or dispatch's per-group Task agent running `/flow`)
runs this skill's procedure in its own context and reads the produced report directly; there is no
cross-process hand-off.

## Mode: grant-check

**Called from:** `/claude-tweaks:triage`'s Step 2, once per worklist record, every triage session
— never pre-filtered to "borderline" records.

### Step 1: Gather

```bash
gh issue view "$N" --json body,labels -q '{body: .body, labels: [.labels[].name]}' > /tmp/assess-grant-${N}.json
```

Read the record's full body (Current State / Deliverables / Acceptance Criteria) from the fetched
JSON. Extract the current `risk:*`/`effort:*` labels, if present:

```bash
node -e "const {extractRiskEffort}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/tier.js');
  const d=require('/tmp/assess-grant-${N}.json');
  console.log(JSON.stringify(extractRiskEffort(d.labels)))"
```

### Step 2: Judge

Read the body content directly — don't just trust the risk/effort labels as ground truth. Weigh:

- Does the Deliverables/Acceptance Criteria text describe touching authentication, session
  handling, claim/locking logic, or other structurally sensitive behavior, regardless of what the
  risk/effort labels say? That's a reason to recommend more cautiously than the labels alone imply.
- Does the record describe creating or substantially editing a file under `skills/**/*.md` (a new
  or changed skill)? This includes `harness-health:new-skill` findings — their body reads
  "**New skill candidate**" with a "Proposed new skill" deliverable (see
  `bin/lib/harness-health/issue-payload.js`). Recognize this from body content, not from a label —
  `new-skill` findings currently carry no `risk:*`/`effort:*` labels at all, by design, so labels
  alone tell you nothing here. A well-specified new-skill proposal can still reasonably recommend
  `RECOMMEND_BUILD: true` (drafting the content autonomously is fine — a human still confirms the
  grant, and reviews again before any merge), but recommend `RECOMMEND_MERGE: false` — new skill
  files encode instructions future agents follow, which is high-leverage independent of how small
  or clean the proposal looks.
- Is the described change actually lower-risk than its labels suggest (e.g. a `risk:medium` record
  that turns out to be a pure documentation correction with no behavioral surface)? Judge accuracy,
  not blanket caution — recommend generously when the content genuinely supports it.
- A missing Current State/Deliverables/Acceptance Criteria section, or an unresolved
  `TBD`/`TODO`/`<!-- ambiguity:` marker, is not this mode's job to catch — that's
  `/claude-tweaks:triage`'s own Step 3.5 body-shape re-verification, which runs after this mode
  regardless of its output.

### Step 3: Render

Output ONLY these lines, no preamble:

```
RECOMMEND_BUILD: true | false
RECOMMEND_MERGE: true | false
RATIONALE: {one paragraph, naming the specific content signal the recommendation is based on}
```

If nothing in the record's content or scoring supports any recommendation, output
`RECOMMEND_BUILD: false` / `RECOMMEND_MERGE: false` — triage's Step 2 already treats this the same
as today's "flag back (needs scoring)" case; no separate error path is needed here.

## Mode: merge-check

**Called from:** `/claude-tweaks:dispatch`'s Auto-merge gate, replacing layers 2-4 (scoring
eligibility, runtime cleanliness, blast radius) entirely. Layer 1 (authorization — `auto:merge`
present on every group member) stays a hard binary gate in `dispatch/SKILL.md` itself, unchanged.

### Step 1: Gather

The calling agent has just finished this run's build, test, and review — the diff and review
verdict are already in its own context. Confirm rather than re-derive where possible; if not
already available:

```bash
git diff --name-only "$MERGE_BASE"..HEAD > /tmp/assess-merge-files-${N}.txt
git diff --numstat "$MERGE_BASE"..HEAD > /tmp/assess-merge-numstat-${N}.txt
```

Build the `{path, additions, deletions}` list from the numstat output.

Read this project's own configured `merge-sensitive-paths`/`automerge-max-lines`/
`automerge-max-files` directly — this skill reads its own config, the same way
`skills/dispatch/SKILL.md`'s existing Configuration section reads `dispatch-retry-ceiling` and
friends directly rather than expecting a caller to pre-fetch and pass them:

```bash
grep -E "^merge-sensitive-paths:|^automerge-max-lines:|^automerge-max-files:" CLAUDE.md .claude-tweaks/policy.yml 2>/dev/null
```

`merge-sensitive-paths` is a single line, comma-separated glob list (e.g.
`merge-sensitive-paths: bin/hooks.js,skills/_shared/*.md,.claude-tweaks/policy.yml`) — split on `,`
and trim whitespace; absent entirely defaults to `[]` (see `_shared/work-record.md`'s Config keys
table). `automerge-max-lines`/`automerge-max-files` default to `40`/`2` when absent, matching
`skills/dispatch/SKILL.md`'s existing Configuration table.

Then compute the blast-radius summary:

```bash
node -e "
  const { classifyDiffFiles, blastRadiusSummary } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/blast-radius.js');
  const files = require('/tmp/assess-merge-files-${N}.json'); // [{path, additions, deletions}]
  const sensitivePaths = process.argv[1] ? process.argv[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
  const classified = classifyDiffFiles(files, sensitivePaths);
  console.log(JSON.stringify(blastRadiusSummary(classified)));
" "$MERGE_SENSITIVE_PATHS_CSV" > /tmp/assess-merge-blast-radius-${N}.json
```

(`$MERGE_SENSITIVE_PATHS_CSV` is the comma-separated value parsed from the grep above, e.g.
`"bin/hooks.js,skills/_shared/*.md"` — passed as a positional arg, not an env var expected from a
caller, since this skill reads its own config rather than depending on one.)

### Step 2: Judge

- **Sensitive-path hit is a hard floor.** If `sensitiveFilesTouched` is non-empty, render
  `needs-human` immediately — do not weigh anything else. No content judgment overrides this.
- **A new or substantially-edited `skills/**/*.md` file is `needs-human`, regardless of size.**
  Generalizes the old `harness-health:new-skill` exclusion — a skill file shapes future agent
  behavior, which is high-leverage independent of how small the diff looks.
- **Weigh `blastRadiusSummary.implLines`/`implFiles` against the project's configured
  `automerge-max-lines`/`automerge-max-files`** as one input, not a cutoff — a diff comfortably
  under the configured guideline (e.g. #18's 33 impl lines under a 40-line guideline) supports
  `auto-merge` when review is clean; a diff well past it is a reason to lean `needs-human` even
  with a clean review, but is not an automatic disqualifier the way the old mechanical gate was.
  `testLines`/`testFiles` are informational only — never weigh test-file bulk toward risk.
- **Weigh the diff's actual content**, not just its size or file list: does it touch concurrency,
  locking, auth, or external API calls in a way that looks structurally sensitive even outside the
  configured `merge-sensitive-paths` list? Treat that as elevated risk from content, the same way a
  human reviewer would flag it on sight.
- **Review's findings are a hard input, not advisory**: if this run's `/claude-tweaks:review` pass
  produced anything at Medium severity or above, render `needs-human` — this mode never overrides a
  real review finding.

### Step 3: Render

```
VERDICT: auto-merge | needs-human
RATIONALE: {one paragraph, naming the specific factors weighed}
```

## Mode: failure-check

**Called from:** `/claude-tweaks:dispatch`'s Settle step, replacing "any failed run
unconditionally revokes `auto:merge`."

### Step 1: Gather

```bash
gh api "repos/{owner}/{repo}/issues/${N}/comments?per_page=100" > /tmp/assess-failure-comments-${N}.json
node -e "
  const { countFailedAttempts } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/retry.js');
  const comments = require('/tmp/assess-failure-comments-${N}.json');
  console.log(JSON.stringify({ priorAttempts: countFailedAttempts(comments) }));
"
```

Read the actual failure output from the gate that failed (test output, review findings, error
logs) — already in the calling agent's context from the run that just failed.

### Step 2: Judge

- **Transient signatures**: `gh api` rate-limit (HTTP 429) responses, network timeouts,
  `ECONNREFUSED`, or a failure in a test this repo already documents as flaky (currently
  `statusline.test.js`'s render-timing assertion). Classify `transient`.
- **Correctness signatures**: a test failure showing an assertion mismatch directly tied to code
  the record's own diff changed (expected/actual values diverging in logic the change touched).
  Classify `correctness`.
- **Ambiguous**: anything that doesn't clearly match either pattern. Classify `ambiguous` and
  handle it exactly like `correctness` downstream (see Output) — when genuinely unsure, err toward
  the existing conservative behavior, never toward the new permissive one.
- **`NOTIFY_NOW`**: set `true` when this is the *same* `correctness`-class failure recurring
  verbatim across two or more consecutive attempts (compare this failure's content against
  `priorAttempts`' recorded reasons in the comment history) — a signal the agent may be stuck
  rather than making incremental progress. Otherwise `false`.

### Step 3: Render

```
CLASSIFICATION: correctness | transient | ambiguous
NOTIFY_NOW: true | false
RATIONALE: {one paragraph}
```

The caller (dispatch's Settle step) is responsible for acting on `CLASSIFICATION` — revoking
`auto:merge` for `correctness`/`ambiguous`, preserving it for `transient` — and for the
retry-ceiling bookkeeping, which runs unconditionally regardless of this mode's output (see
`skills/dispatch/SKILL.md`'s Settle step).

## Error Handling

If this skill cannot render a clear verdict for any reason (malformed input, an inconclusive read),
default to the conservative outcome for whichever mode was running: `grant-check` →
`RECOMMEND_BUILD: false` / `RECOMMEND_MERGE: false`; `merge-check` → `VERDICT: needs-human`;
`failure-check` → `CLASSIFICATION: correctness`. Never resolve ambiguity toward more autonomy — a
missed auto-merge costs a human a click; a wrongly-granted one could ship something bad.

## Component-Skill Contract

`/claude-tweaks:assess-agent-autonomy` is **always** a component skill — it is never invoked
directly by a human, and never renders a `## Next Actions` block. Its only callers are
`/claude-tweaks:triage` (Step 2, `grant-check`) and `/claude-tweaks:dispatch` (Auto-merge gate,
`merge-check`; Settle step, `failure-check`).

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Overriding a review finding at Medium+ severity because the diff otherwise looks safe | `merge-check` never overrides a real review finding — review's own findings are a hard input, not advisory. |
| Weighing test-file line count toward risk in `merge-check` | The entire reason this skill exists is that test-line bulk isn't implementation risk — `testLines`/`testFiles` are informational only. |
| Skipping the sensitive-path hard floor because the content judgment "looks fine" | Sensitive paths are a floor precisely because they're the cases where content judgment alone isn't sufficient signal — never overridden. |
| Classifying an unclear failure as `transient` "to be less conservative" | Ambiguity always resolves to `correctness`'s conservative handling — the point of this skill is accuracy, not blanket permissiveness. |
| Recommending `RECOMMEND_MERGE: true` for a new-or-changed `skills/**/*.md` file | Skill files shape future agent behavior — this is a hard `needs-human`/`false` case regardless of how clean or small the change looks. |
| Dispatching this as a fresh Task agent instead of an inline Skill invocation | The calling agent already has the diff/review-findings/failure-output in its own context — a subagent restart only pays to re-derive what's already known. |
| Writing to `decisions.md` from inside this skill | This skill doesn't know about run-dir resolution — logging is the caller's job (`/claude-tweaks:triage` or `/claude-tweaks:dispatch`), matching every other auto-decision log entry in this codebase. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:triage` | Calls `grant-check` once per worklist record in Step 2 — the output becomes the batch table's Recommended column directly. Triage still renders the human batch-confirm exactly as before; only what generates the suggestion changed. |
| `/claude-tweaks:dispatch` | Calls `merge-check` in the Auto-merge gate (replacing layers 2-4) and `failure-check` in the Settle step (replacing the old unconditional-revocation rule). Dispatch still owns layer 1 (authorization) and all label/claim mechanics directly. |
| `bin/lib/issues/blast-radius.js` | Pure module supplying `merge-check`'s one genuinely mechanical input — test-exclusion-aware diff sizing. This skill never computes blast radius itself. |
| `bin/lib/issues/tier.js` | `extractRiskEffort`'s surviving colon-form reader supplies `grant-check`'s current-label input. `recommendGrants`/`recommendTier` are retired — this skill replaces them as triage's recommendation signal. |
| `bin/lib/issues/retry.js` | `countFailedAttempts` supplies `failure-check`'s retry-history input. |
| `_shared/work-record.md` | Taxonomy home — the `merge-sensitive-paths` config key this skill's `merge-check` mode reads as a hard floor. |
| `docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md` | The full design rationale, motivation (the #18/#19 evidence), and calibration examples this skill's judgment procedures are anchored against. |
```

- [ ] **Step 2: Self-review against the design doc's per-mode contracts**

This is a prose deliverable — there is no `pytest`-style test cycle. Instead, re-read
`docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md` section by section and confirm
line-for-line:

- `grant-check`'s Input/Output blocks match the design doc's Mode: `grant-check` section exactly
  (field names, types, the two calibration examples both represented in Step 2's judgment
  guidance).
- `merge-check`'s Input/Output blocks match the design doc's Mode: `merge-check` section, including
  the `automerge-max-lines`/`files` role-change note and all four calibration examples.
- `failure-check`'s Input/Output blocks match the design doc's Mode: `failure-check` section,
  including all three calibration examples and the `NOTIFY_NOW` trigger condition.
- The Error Handling section matches the design doc's Error Handling section's three conservative
  defaults exactly.
- No `TBD`/`TODO`/placeholder text anywhere in the file.

Fix any drift found inline. No need to re-review after fixing — just fix and move on.

- [ ] **Step 3: Commit**

```bash
git add skills/assess-agent-autonomy/SKILL.md
git commit -m "Add /claude-tweaks:assess-agent-autonomy skill — three judgment modes

grant-check, merge-check, failure-check — content-aware verdicts
replacing the mechanical label lookups this program's design doc
identifies as miscalibrated (#18's blast-radius miss, blanket
failure-revocation). Not yet wired to any caller — Tasks 3-4 do that.

refs #33"
```

---

### Task 3: Wire `/claude-tweaks:dispatch`'s Auto-merge gate and Settle step

**Files:**
- Modify: `skills/dispatch/SKILL.md` (Auto-merge gate section, Settle step 3, Anti-Patterns table, Relationship table)

**Interfaces:**
- Consumes: `/claude-tweaks:assess-agent-autonomy`'s `merge-check` and `failure-check` modes (Task 2), via inline `Skill()` invocation.

- [ ] **Step 1: Replace the Auto-merge gate's layer list**

In `skills/dispatch/SKILL.md`, find:

```markdown
When a qualifying group's `/flow` run reaches `/wrap-up`'s Review Console, check all four layers before presenting it for approval:

1. **Authorization** — `auto:merge` was present on every member of the group when Step 4 claimed it (true by construction).
2. **Scoring eligibility** — true by construction for a mechanically-recommended grant: `recommendGrants` (`bin/lib/issues/tier.js`) only ever sets `merge: true` for `risk:low` + `effort:low`. An explicit human override at `/claude-tweaks:triage` remains possible and is accepted as-is here, same as the pre-grants design.
3. **Runtime cleanliness** — `/review`'s Step 3 Routing produced nothing at Medium severity or above anywhere in this group's `/flow` run.
4. **Blast radius** — attributed per record: each member's share of the diff touches only files that record's fingerprint/anchor pointed at, and the group's combined diff stays under `automerge-max-lines` (default 40) changed lines across `automerge-max-files` (default 2) files.
```

Replace with:

```markdown
When a qualifying group's `/flow` run reaches `/wrap-up`'s Review Console, check two layers before presenting it for approval:

1. **Authorization** — `auto:merge` was present on every member of the group when Step 4 claimed it (true by construction).
2. **Content judgment** — for each member of the group, invoke `/claude-tweaks:assess-agent-autonomy` in `merge-check` mode: `Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "merge-check #{n}")`. This weighs the diff's content, `/review`'s findings, and a test-exclusion-aware blast-radius summary (`bin/lib/issues/blast-radius.js`) holistically, replacing the old three independent mechanical checks (scoring eligibility, runtime cleanliness, blast radius) that stood in for one real question — see `docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md`. **Every member's verdict must be `auto-merge`** for the group to proceed — a single `needs-human` verdict anywhere in the group falls the whole group back to the normal pending-review path.
```

- [ ] **Step 2: Update the decisions.md log line**

Find:

```markdown
Log to `decisions.md`:
`AUTO {time} — Auto-merge: group [{issues}], {lines} lines across {files} files, zero findings >= medium. Merge commit: {sha}. Reversibility: high (git revert).`
```

Replace with:

```markdown
Log to `decisions.md`:
`AUTO {time} — Auto-merge: group [{issues}], assess-agent-autonomy verdict auto-merge for every member (see each member's RATIONALE). Merge commit: {sha}. Reversibility: high (git revert).`
```

- [ ] **Step 3: Replace Settle step 3 (unconditional revocation) with failure-check-driven handling**

Find:

```markdown
3. **Unconditionally revoke `auto:merge` if present.** Any failed run permanently drops merge autonomy for this record, regardless of whether the ceiling was hit — this is not a separate, optional step gated on the ceiling check below:

   ```bash
   if gh issue view "$ISSUE" --json labels -q '.labels[].name' | grep -qx auto:merge; then
     gh issue edit "$ISSUE" --remove-label auto:merge
   fi
   ```
```

Replace with:

```markdown
3. **Classify the failure and act on `auto:merge` accordingly.** Invoke `/claude-tweaks:assess-agent-autonomy` in `failure-check` mode: `Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "failure-check #{n}")`. If `CLASSIFICATION` is `correctness` or `ambiguous`, revoke `auto:merge` if present — today's behavior for this class, unchanged:

   ```bash
   if gh issue view "$ISSUE" --json labels -q '.labels[].name' | grep -qx auto:merge; then
     gh issue edit "$ISSUE" --remove-label auto:merge
   fi
   ```

   If `CLASSIFICATION` is `transient`, **preserve** `auto:merge` — do not remove it. This is the one behavior change from the old rule: a transient/infrastructure failure no longer permanently strips merge trust from a record that was never at fault. If `NOTIFY_NOW` is `true`, send a `PushNotification` immediately ("Record #{n} may be stuck — same failure recurred: {rationale}"), in addition to (not instead of) the retry-ceiling notification in step 6 below if the ceiling is also hit on this same attempt.
```

- [ ] **Step 4: Correct the closing paragraph after step 7**

Find:

```markdown
Any failure — whether or not it hits the ceiling — unconditionally revokes `auto:merge` before the next retry, per step 3 above: a run that wasn't clean the first time never gets another unsupervised shot at auto-merge. This permanently drops merge autonomy for that record until a human re-grants it at `/claude-tweaks:triage`.
```

Replace with:

```markdown
A `correctness`- or `ambiguous`-classified failure revokes `auto:merge` before the next retry, per step 3 above — that record doesn't get another unsupervised shot at auto-merge until a human re-grants it at `/claude-tweaks:triage`. A `transient`-classified failure preserves `auto:merge` — the retry-ceiling counting below still runs unconditionally regardless of classification (an attempt is an attempt), but classification alone no longer determines merge trust the way it did before.
```

- [ ] **Step 5: Correct the Anti-Patterns table row**

Find:

```markdown
| Letting a group auto-merge on a retry after a prior failure | The failure-downgrade rule exists specifically to prevent this — any failure unconditionally revokes `auto:merge` before the next retry. |
```

Replace with:

```markdown
| Letting a group auto-merge on a retry after a prior `correctness`-classified failure | The failure-downgrade rule exists specifically to prevent this — a `correctness` or `ambiguous` classification unconditionally revokes `auto:merge` before the next retry; only a `transient` classification preserves it. |
```

- [ ] **Step 6: Add a Relationship table row**

Find the last row of the Relationship table:

```markdown
| `bin/lib/issues/{claims,retry,grouping,record}.js` | The pure helpers behind claim/release payloads, retry-ceiling math, file-overlap grouping, and grant/bot-state facet parsing — dispatch calls all four, unchanged. Step 2 also calls record.js's `parseDependencies` to drop records with an open `Blocked by #N` line from the queue. |
```

Add immediately after it:

```markdown
| `/claude-tweaks:assess-agent-autonomy` | Called inline (not a fresh Task dispatch) at two points: the Auto-merge gate (`merge-check` mode, replacing the old three-layer mechanical check) and the Settle step (`failure-check` mode, replacing unconditional `auto:merge` revocation). Dispatch still owns authorization, claim mechanics, and retry-ceiling counting directly — assess-agent-autonomy only ever returns a verdict, never writes a label itself. |
```

- [ ] **Step 7: Verify no other reference to the old 4-layer gate survives**

```bash
grep -n "four layers\|Scoring eligibility.*true by construction\|Runtime cleanliness.*Step 3 Routing" skills/dispatch/SKILL.md
```

Expected: no output (all such phrasing was in the blocks replaced above).

- [ ] **Step 8: Commit**

```bash
git add skills/dispatch/SKILL.md
git commit -m "Wire dispatch's Auto-merge gate and Settle step to assess-agent-autonomy

Auto-merge gate's layers 2-4 (scoring eligibility, runtime cleanliness,
blast radius) collapse into one merge-check call. Settle step's
blanket 'any failure revokes auto:merge' becomes failure-check-driven:
correctness/ambiguous still revokes, transient now preserves trust.
Retry-ceiling counting is unchanged either way.

refs #33"
```

---

### Task 4: Wire `/claude-tweaks:triage`'s Step 2 to `grant-check`

**Files:**
- Modify: `skills/triage/SKILL.md` (Step 2, Relationship table)

**Interfaces:**
- Consumes: `/claude-tweaks:assess-agent-autonomy`'s `grant-check` mode (Task 2).

- [ ] **Step 1: Replace Step 2's tier.js-based recommendation**

Find:

```markdown
### Step 2: Recommend

```bash
node -e "
  const { extractRiskEffort, recommendGrants } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/tier.js');
  const { fresh, blocked } = require('/tmp/triage-worklist.json');
  const scoreRow = (i) => {
    const { riskTier, effortTier } = extractRiskEffort(i.labels);
    return { number: i.number, title: i.title, riskTier, effortTier, grants: recommendGrants({ risk: riskTier, effort: effortTier }) };
  };
  console.log(JSON.stringify({ fresh: fresh.map(scoreRow), blocked: blocked.map(scoreRow) }));
" > /tmp/triage-scored.json
```

Derive the batch table's Recommended column from this output:

- **fresh, `grants.build` true** → `auto:build` (append `+ auto:merge` when `grants.merge` is also true — `recommendGrants` only sets it for `risk:low`+`effort:low`).
- **fresh, `grants.build` false** (unscored, or a tier `recommendGrants` doesn't recognize) → `flag back (needs scoring)`. The human may supply scoring inline as a free-text override instead of flagging back — the gate then stamps the supplied `risk:*`/`effort:*` labels alongside the grant (Step 4).
- **any blocked row** → `re-authorize (bot:blocked)`, regardless of its own score. A prior failure means the human's renewed judgment is the point, not a mechanical replay: applying this row grants `auto:build` only, never bundling `auto:merge` automatically. Restoring `auto:merge` too requires an explicit override.
```

Replace with:

```markdown
### Step 2: Recommend

For every record in `fresh` (from Step 1's worklist), invoke `/claude-tweaks:assess-agent-autonomy` in `grant-check` mode, once per record, every triage session — never pre-filtered to "borderline" records:

```
Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "grant-check #{n}")
```

Each invocation returns `RECOMMEND_BUILD`/`RECOMMEND_MERGE`/`RATIONALE` (see
`skills/assess-agent-autonomy/SKILL.md`'s `grant-check` mode). Derive the batch table's
Recommended column directly from this output:

- **`RECOMMEND_BUILD: true`** → `auto:build` (append `+ auto:merge` when `RECOMMEND_MERGE` is also
  `true`).
- **`RECOMMEND_BUILD: false`** → `flag back (needs scoring)`. The human may supply scoring inline as
  a free-text override instead of flagging back — the gate then stamps the supplied `risk:*`/
  `effort:*` labels alongside the grant (Step 4).

For every record in `blocked` (Step 1's worklist), skip `grant-check` and recommend
**`re-authorize (bot:blocked)`** directly, regardless of content — a prior failure means the
human's renewed judgment is the point, not a mechanical (or judgment-driven) replay: applying this
row grants `auto:build` only, never bundling `auto:merge` automatically. Restoring `auto:merge` too
requires an explicit override.
```

- [ ] **Step 2: Update the Relationship table**

Find:

```markdown
| `bin/lib/issues/tier.js` | `extractRiskEffort` + `recommendGrants` — the mechanical scoring Step 2 reads, always subject to the human batch-confirm. |
```

Replace with:

```markdown
| `/claude-tweaks:assess-agent-autonomy` | Called inline (not a fresh Task dispatch) once per worklist record in Step 2, `grant-check` mode — its `RECOMMEND_BUILD`/`RECOMMEND_MERGE` output becomes the batch table's Recommended column directly. Triage's human batch-confirm is unchanged; only what generates the suggestion changed. |
| `bin/lib/issues/tier.js` | `extractRiskEffort`'s surviving colon-form reader supplies `grant-check`'s current-label input (an input to assess-agent-autonomy's judgment now, not triage's own recommendation logic). `recommendGrants`/`recommendTier` are retired. |
```

- [ ] **Step 3: Verify no other reference to `recommendGrants` survives in this file**

```bash
grep -n "recommendGrants\|recommendTier" skills/triage/SKILL.md
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add skills/triage/SKILL.md
git commit -m "Wire triage's Step 2 recommendation to assess-agent-autonomy's grant-check

Replaces the tier.js recommendGrants lookup with a content-aware
grant-check call, once per worklist record. The human batch-confirm
gate is unchanged — only what generates the Recommended column
changed.

refs #33"
```

---

### Task 5: Retire dead code in `bin/lib/issues/tier.js`

**Files:**
- Modify: `bin/lib/issues/tier.js`
- Modify: `bin/lib/issues/tests/tier.test.js`

**Interfaces:**
- Consumes: nothing new. Depends on Tasks 3-4 having already rewired dispatch/triage away from `recommendGrants`/`recommendTier` — this task only proceeds once those callers are gone.

**Verify this task's precondition before starting:**

```bash
grep -rn "recommendGrants\|recommendTier\|extractHarnessHealthRiskEffort\|extractCodeHealthRiskEffort\|extractBareHyphenRiskEffort" skills/ bin/*.js 2>/dev/null | grep -v "bin/lib/issues/tier.js\|bin/lib/issues/tests/tier.test.js"
```

Expected: no output — confirms nothing outside `tier.js` and its own test file still references
any of the functions this task deletes. If this returns any line, stop and resolve that reference
first (it means Task 3 or 4 missed something).

- [ ] **Step 1: Replace `tier.js` with the trimmed version**

The full replacement content (retains `extractColonRiskEffort`/`extractRiskEffort`'s dispatch
logic for the colon form only; removes the three now-dead adapters and both recommendation
functions):

```javascript
// Pure: reads a record's current colon-form risk:*/effort:* labels for
// assess-agent-autonomy's grant-check mode. The legacy code-health-prefixed
// hyphen form, bare hyphen form, and harness-health additive/restructural
// classification adapters that used to live here are retired — see
// docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md's
// Retirements section for why each one was safe to remove (not a uniform
// reason: two were genuinely dead code, the third is redundant because its
// own producer already co-emits the canonical colon form on every issue it
// files). recommendGrants/recommendTier are also retired — grant-check
// (skills/assess-agent-autonomy/SKILL.md) replaces them as triage's
// recommendation signal.
'use strict';

const COLON_RISK_RE = /^risk:(low|medium|high)$/;
const COLON_EFFORT_RE = /^effort:(low|medium|high)$/;

function extractRiskEffort(labels) {
  const names = (labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
  const risk = names.map((n) => COLON_RISK_RE.exec(n)).find(Boolean);
  const effort = names.map((n) => COLON_EFFORT_RE.exec(n)).find(Boolean);
  return {
    riskTier: risk ? risk[1] : undefined,
    effortTier: effort ? effort[1] : undefined,
  };
}

module.exports = { extractRiskEffort };
```

- [ ] **Step 2: Replace `tier.test.js` with only the surviving-behavior tests**

```javascript
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { extractRiskEffort } = require('../tier');

test('extractRiskEffort reads canonical colon-form risk:*/effort:* string labels', () => {
  assert.deepStrictEqual(
    extractRiskEffort(['risk:low', 'effort:medium']),
    { riskTier: 'low', effortTier: 'medium' },
  );
});

test('extractRiskEffort reads canonical colon-form labels from {name} objects', () => {
  const labels = [{ name: 'risk:high' }, { name: 'effort:high' }];
  assert.deepStrictEqual(extractRiskEffort(labels), { riskTier: 'high', effortTier: 'high' });
});

test('extractRiskEffort returns undefined fields when labels are absent', () => {
  assert.deepStrictEqual(extractRiskEffort([]), { riskTier: undefined, effortTier: undefined });
  assert.deepStrictEqual(extractRiskEffort(undefined), { riskTier: undefined, effortTier: undefined });
});

test('extractRiskEffort ignores non-colon-form labels entirely (no legacy fallback)', () => {
  assert.deepStrictEqual(
    extractRiskEffort(['code-health:risk-low', 'harness-health:additive', 'risk-medium']),
    { riskTier: undefined, effortTier: undefined },
  );
});

test('extractRiskEffort resolves risk and effort independently when only one axis is present', () => {
  assert.deepStrictEqual(extractRiskEffort(['risk:low']), { riskTier: 'low', effortTier: undefined });
  assert.deepStrictEqual(extractRiskEffort(['effort:high']), { riskTier: undefined, effortTier: 'high' });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `node --test bin/lib/issues/tests/tier.test.js`
Expected: PASS — 5/5 tests

- [ ] **Step 4: Run the full suite to confirm nothing else broke**

Run: `npm test`
Expected: PASS in full — no failures anywhere else in the suite (this confirms Task 3/4's
precondition grep was accurate: nothing else actually called the removed functions).

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/tier.js bin/lib/issues/tests/tier.test.js
git commit -m "Retire tier.js's recommendGrants/recommendTier and legacy label adapters

recommendGrants/recommendTier: superseded by grant-check
(skills/assess-agent-autonomy/SKILL.md) as triage's recommendation
signal, now caller-free (verified via grep before this commit).
extractCodeHealthRiskEffort/extractBareHyphenRiskEffort: dead code,
confirmed against the current producers, not just issue history.
extractHarnessHealthRiskEffort: redundant, not dead — its own
producer (bin/lib/harness-health/issue-payload.js) already co-emits
canonical colon-form labels on every additive/restructural finding,
so the surviving colon-form reader already resolves them without it.

refs #33"
```

---

### Task 6: Update `work-record.md` and `harness-health/SKILL.md`

**Files:**
- Modify: `skills/_shared/work-record.md` (Config keys table)
- Modify: `skills/harness-health/SKILL.md` (Relationship table row, `new-skill` scoring prose)

**Interfaces:** none — pure documentation corrections, no code.

- [ ] **Step 1: Add `merge-sensitive-paths` to `work-record.md`'s Config keys table**

Find:

```markdown
| `dispatch-pick-max-concurrent` | `3` | Max concurrent groups a bare `/dispatch` multi-pick may run |
```

Add immediately after it:

```markdown
| `merge-sensitive-paths` | `[]` | Path globs `/claude-tweaks:assess-agent-autonomy`'s `merge-check` mode treats as a hard `needs-human` floor, regardless of diff size or content judgment. Empty by default — project-agnostic, each project populates its own list. |
```

- [ ] **Step 2: Correct `harness-health/SKILL.md`'s Relationship table row**

Find:

```markdown
| `/claude-tweaks:triage` | The Tier Rule in triage's bare invocation reads this skill's `harness-health:additive`/`harness-health:restructural` diagnostic labels directly, recommending fast-track for additive and approved for restructural — the harness-health-side counterpart to how triage reads code-health's `risk:<tier>`/`effort:<tier>` labels. Triage never files or closes harness-health issues. |
```

Replace with:

```markdown
| `/claude-tweaks:triage` | `/claude-tweaks:assess-agent-autonomy`'s `grant-check` mode (invoked from triage's Step 2) reads this skill's finding body directly — including recognizing `harness-health:new-skill` findings from their "New skill candidate" body content, not from a label, since those findings carry no `risk:*`/`effort:*` labels at all. `additive`/`restructural` findings already carry colon-form `risk:*`/`effort:*` labels (this skill's own `issue-payload.js` co-emits them alongside the diagnostic label), which grant-check also reads as one input. Triage never files or closes harness-health issues. |
```

- [ ] **Step 3: Correct the `new-skill` scoring prose**

Find:

```markdown
`new-skill` candidates file with no scoring labels by design — the authorization gate flags them "needs scoring" rather than inheriting a guessed tier from a kind that carries no scoring evidence. Every filed finding is **born-`ready`** — harness-health findings are agent-sized and spec-shaped by construction (Current State / Deliverables / Acceptance Criteria), so they file with the `ready` label already applied and appear directly in the authorization gate's worklist, skipping maturation.
```

Replace with:

```markdown
`new-skill` candidates file with no scoring labels by design — there is no classification-driven
tier to guess from a kind that carries no scoring evidence. `/claude-tweaks:assess-agent-autonomy`'s
`grant-check` mode (triage's Step 2) recognizes a `new-skill` finding from its body content
directly (it reads "**New skill candidate**" with a "Proposed new skill" deliverable) rather than
depending on a scoring label being present, and can still recommend `auto:build` for a
well-specified proposal — building the draft autonomously is reasonable, since a human confirms the
grant and reviews again before any merge — while recommending against `auto:merge`, since a new
skill file shapes future agent behavior regardless of how clean the diff looks. Every filed finding
is **born-`ready`** — harness-health findings are agent-sized and spec-shaped by construction
(Current State / Deliverables / Acceptance Criteria), so they file with the `ready` label already
applied and appear directly in the authorization gate's worklist, skipping maturation.
```

- [ ] **Step 4: Commit**

```bash
git add skills/_shared/work-record.md skills/harness-health/SKILL.md
git commit -m "Document merge-sensitive-paths and correct harness-health's triage description

work-record.md's Config keys table gains merge-sensitive-paths.
harness-health/SKILL.md's Relationship table and new-skill scoring
prose described the retired tier.js mechanism directly; both now
describe grant-check reading finding content instead.

refs #33"
```

---

### Task 7: Update skill catalog documentation

**Files:**
- Modify: `CLAUDE.md` (skill directory count and category list)
- Modify: `README.md` (skill catalog entry, near the `/claude-tweaks:dispatch`/`/claude-tweaks:triage` entries)
- Modify: `skills/help/reference-card.md` (catalog table row)

**Interfaces:** none — pure documentation, no code.

- [ ] **Step 1: Update `CLAUDE.md`'s skill count and category**

Find:

```markdown
### Skill directories (29 total)

**Lifecycle:** init, capture, challenge, specify, build, test, stories, review, wrap-up
**Component:** reflect, simplify, deepen, journeys, visual-review, design, visualize
**Utility:** help, tidy, flow, browse, ledger, version, research, code-health, routine, harness-health, journey-health, triage, dispatch
```

Replace with:

```markdown
### Skill directories (30 total)

**Lifecycle:** init, capture, challenge, specify, build, test, stories, review, wrap-up
**Component:** reflect, simplify, deepen, journeys, visual-review, design, visualize, assess-agent-autonomy
**Utility:** help, tidy, flow, browse, ledger, version, research, code-health, routine, harness-health, journey-health, triage, dispatch
```

`assess-agent-autonomy` is a Component skill (never invoked directly by a human — matches the same
category as `/simplify`/`/deepen`/`/reflect`), not Lifecycle or Utility.

- [ ] **Step 2: Add a catalog entry in `README.md`**

Find, in the `### Component skills (standalone or called by lifecycle skills)` section:

```markdown
**`/claude-tweaks:visual-review`** — Browser-based UI inspection with structured review steps: reconnaissance, first impressions, persona-based interaction, structured analysis, and creative reimagination. Three modes: **page** (single URL), **journey** (walk a documented journey testing "should feel" expectations), **discover** (scan and document all journeys in a brownfield project). Handles its own browser detection with fallback chain. Used by `/review` (Step 6). Works standalone: `/claude-tweaks:visual-review http://localhost:3000`.

### Utility skills
```

Insert a new paragraph immediately before the `### Utility skills` line (after
`/claude-tweaks:visual-review`'s paragraph, still inside the Component skills section):

```markdown
**`/claude-tweaks:assess-agent-autonomy`** — Content-aware trust verdicts replacing mechanical label lookups. Three modes: **grant-check** (informs `/triage`'s Step 2 recommendation, reading a record's actual body content rather than just its risk/effort labels), **merge-check** (replaces `/dispatch`'s Auto-merge gate — weighs diff content, review findings, and a test-exclusion-aware blast-radius summary holistically instead of a hard line-count cutoff), and **failure-check** (replaces `/dispatch`'s blanket failure-revocation rule — classifies a failure as correctness/transient/ambiguous so a flaky test or infrastructure hiccup no longer permanently strips merge trust). Invoked inline by its callers, never directly by a human.
```

- [ ] **Step 3: Add a catalog row in `skills/help/reference-card.md`**

Find:

```markdown
| `/claude-tweaks:dispatch` | The queue consumer — claims an authorized record's whole file-overlap group (atomic ref lock) and hands it to `/flow`; settles on success/failure | *(none)* (interactive batch pick), `next` (headless routine unit), `#N` (direct) |
```

Add immediately after it:

```markdown
| `/claude-tweaks:assess-agent-autonomy` | Inline judgment helper — grant-check informs triage's recommendation, merge-check replaces dispatch's blast-radius gate, failure-check replaces dispatch's blanket failure-revocation rule. Never invoked directly by a human. | `{mode} #{n}` (`grant-check`\|`merge-check`\|`failure-check`) |
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md skills/help/reference-card.md
git commit -m "Add assess-agent-autonomy to the skill catalog (29 -> 30 skills)

refs #33"
```

---

### Task 8: Full verification

**Files:** none — verification only.

- [ ] **Step 1: Run the full test suite**

```bash
pwd
git rev-parse --show-toplevel
npm test
```

Expected: PASS in full (1006+ tests — the exact count will differ from the pre-Task-5 baseline
since `tier.test.js` shrank from ~30 tests to 5; that's expected, not a regression).

- [ ] **Step 2: Confirm no dangling reference to anything retired**

```bash
grep -rn "recommendGrants\|recommendTier\|extractHarnessHealthRiskEffort\|extractCodeHealthRiskEffort\|extractBareHyphenRiskEffort" . --include="*.md" --include="*.js" 2>/dev/null | grep -v "docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md\|docs/superpowers/plans/2026-07-15-assess-agent-autonomy.md\|\.git/"
```

Expected: no output. (The design doc and this plan itself are excluded since they necessarily
quote the retired names verbatim when explaining the retirement — a repo-wide sweep for a retired
pattern should always exclude the planning artifacts that document the retirement, not just code.)

- [ ] **Step 3: Confirm the new skill's frontmatter and structure match this project's convention**

```bash
head -6 skills/assess-agent-autonomy/SKILL.md
grep -c "^## " skills/assess-agent-autonomy/SKILL.md
```

Expected: frontmatter present (`name`/`description`), interaction-style directive present, and at
least the following top-level sections present: When to Use, Input, three Mode sections, Error
Handling, Component-Skill Contract, Anti-Patterns, Relationship to Other Skills — matching the
standard structure CLAUDE.md's "SKILL.md structure" convention documents.

- [ ] **Step 4: Simplify pass**

Run `/claude-tweaks:simplify` on the files this plan touched:
`bin/lib/issues/blast-radius.js bin/lib/issues/tier.js skills/assess-agent-autonomy/SKILL.md skills/dispatch/SKILL.md skills/triage/SKILL.md`. Commit any simplifications separately if made.

- [ ] **Step 5: Report**

Summarize: tests passing (count), files created/modified, and confirm both grep sweeps (Task 5's
precondition check, this task's Step 2) returned clean. This plan does not include filing a GitHub
record for itself or dispatching through `/claude-tweaks:triage`/`/claude-tweaks:dispatch` — it
assumes direct execution via `/superpowers:subagent-driven-development` or
`/superpowers:executing-plans` against this plan file, in the worktree it was written in. If you
want this work to flow through the record system instead (so it's tracked, claimable, and subject
to the same grant/dispatch protocol it implements), file it via `/claude-tweaks:capture` or
`/claude-tweaks:specify` before executing — this plan doesn't do that itself, and the `refs #33`
placeholder in each commit message above is illustrative only until a real record number exists.
