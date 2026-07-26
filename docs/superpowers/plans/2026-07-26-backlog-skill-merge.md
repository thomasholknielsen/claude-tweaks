# Merge /triage + /review-backlog into /claude-tweaks:backlog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/claude-tweaks:triage` and `/claude-tweaks:review-backlog` with one skill, `/claude-tweaks:backlog`, with two modes (`refine` write, `overview` read), a scaled fetch/budget/presentation layering, and a repo-wide rename of every live cross-reference to the two retiring skill names.

**Architecture:** `bin/lib/issues/review-backlog.js` is renamed to `backlog.js` (no new exported functions — its existing `selectBudgetSlice` is generic enough to bound both the priority/Related synthesis pass and the new grant-check budget). A new pure module, `bin/lib/issues/ranking.js`, backs the "recommend what to build next" logic shared by `/backlog overview` and `/help`. The skill itself is `skills/backlog/SKILL.md` + two sub-files (`refine-mode.md`, `overview-mode.md`), replacing `skills/triage/` and `skills/review-backlog/` outright. `_shared/record-queue-fetch.md` gains a configurable fetch-limit + active truncation detection. Every other live file referencing the two old skill names by their command form gets a targeted rename.

**Tech Stack:** Node 18+ (`node --test`), Markdown skill files, `gh` CLI, GitHub GraphQL/REST via `gh api`.

## Global Constraints

- Clean cut: `skills/triage/` and `skills/review-backlog/` are deleted entirely — no deprecated alias, no redirect stub.
- **Never edit historical record**, even where it mentions the old skill names by name: `docs/superpowers/plans/*.md`, `CHANGELOG.md`, `docs/superpowers/specs/*.md` (except the current design doc, which needs no further edits), `docs/github-issues-integration-review.md` (a dated, closed 2026-07-11 audit — `docs/getting-started.md` itself calls it "audit of the pre-unification system"), `docs/decisions/*.md` (ADRs — immutable once accepted), top-level `specs/*.md` (this repo's own completed local work-record specs, `status: complete`), and `.claude-tweaks/pipelines/archive/**`.
- All edits happen inside this worktree (`worktree.always` policy) — no exception.
- `npm test` must pass after every code task (Tasks 1-2).
- Every skill file still follows CLAUDE.md's SKILL.md structure convention: frontmatter, interaction-style directive, lifecycle diagram, When to Use, Input, workflow steps, Next Actions, Component-Skill Contract, Anti-Patterns, Relationship to Other Skills.
- The interaction-style directive (verbatim, identical across all skills) goes at the top of every new/edited SKILL.md that doesn't already have it:
  ```
  > **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.
  ```
- **Correction to the approved design doc, discovered during planning:** the design doc states the `unsynced: true` local-fallback fold-in "now lives specifically in overview mode." That's only half right. Re-reading `review-backlog/SKILL.md`'s own Step 5 shows it applies `priority:*` to unsynced records too, via a `writeRecord` local-files fallback branch (unsynced records have no GitHub issue number even under `work-backend: github-issues`). Corrected split: unsynced-record **tagging** ("not yet synced" marker in rendered output) happens in both modes' fetch/display, since it's a pure display concern; the unsynced **apply** path (writing `priority:*` via `writeRecord` when a record has no `$ISSUE`) stays in `refine` mode's Apply step, matching today's actual review-backlog behavior. `/tidy`'s Shape 3 still owns the actual sync-to-GitHub action either way.

## File Structure

**Create:**
- `bin/lib/issues/backlog.js` — renamed from `review-backlog.js`, same 7 exports, no new functions
- `bin/lib/issues/tests/backlog.test.js` — renamed from `review-backlog.test.js`
- `bin/lib/issues/ranking.js` — new: `rankNextToBuild(candidates)`
- `bin/lib/issues/tests/ranking.test.js` — new
- `skills/backlog/SKILL.md` — new skill entry point
- `skills/backlog/refine-mode.md` — new sub-file (write mode procedure)
- `skills/backlog/overview-mode.md` — new sub-file (read mode procedure)

**Modify (rename sweep, grouped by task below):** `skills/_shared/record-queue-fetch.md`, `skills/_shared/work-record.md`, `skills/_shared/github-pr-scan.md`, `skills/_shared/pipeline-run-dir.md`, `skills/_shared/auto-mode-contract.md`, `skills/_shared/auto-decision-log.md`, `skills/_shared/label-bootstrap.md`, `skills/_shared/issue-claims.md`, `skills/_shared/local-files-preflight-stop.md`, `skills/dispatch/SKILL.md`, `skills/dispatch/routine-template.yml`, `skills/dispatch/settle-and-merge.md`, `skills/capture/SKILL.md`, `skills/specify/SKILL.md`, `skills/specify/record-creation.md`, `skills/assess-agent-autonomy/SKILL.md`, `skills/demo/SKILL.md`, `skills/init/SKILL.md`, `skills/init/bootstrap-steps.md`, `skills/code-health/SKILL.md`, `skills/code-health/routine-template.yml`, `skills/harness-health/SKILL.md`, `skills/harness-health/routine-template.yml`, `skills/journey-health/SKILL.md`, `skills/docs-health/SKILL.md`, `skills/docs-health/routine-template.yml`, `skills/tidy/SKILL.md`, `skills/tidy/scan-procedures.md`, `skills/help/SKILL.md`, `skills/help/status-scan.md`, `skills/help/reference-card.md`, `skills/help/context-flow.md`, `skills/flow/SKILL.md`, `skills/flow/steps-and-gates.md`, `README.md`, `CLAUDE.md`, `evals/README.md`, `evals/scenarios/triage-permission-matrix-compliance.yaml` (renamed), `.claude-plugin/plugin.json`.

**Delete:** `skills/triage/` (entire directory), `skills/review-backlog/` (entire directory), `bin/lib/issues/review-backlog.js`, `bin/lib/issues/tests/review-backlog.test.js`.

---

### Task 1: Rename `review-backlog.js` → `backlog.js`

**Files:**
- Create: `bin/lib/issues/backlog.js`
- Create: `bin/lib/issues/tests/backlog.test.js`
- Delete: `bin/lib/issues/review-backlog.js`, `bin/lib/issues/tests/review-backlog.test.js`

**Interfaces:**
- Produces: `splitScoredUnscored`, `filterCritical`, `rankRiskValue`, `filterCleanup`, `selectBudgetSlice`, `mergeUnsyncedRecords`, `deriveCreatedAtFromGit` — same signatures as today, now exported from `backlog.js`. `selectBudgetSlice(records, budget) -> { selected, remaining }` is the function Task 6 (refine-mode.md) uses for BOTH the priority/Related synthesis budget and the new grant-check budget — it's already generic (any records[] sorted oldest-first), no new function needed.

- [ ] **Step 1: Copy `review-backlog.js` to `backlog.js` with an updated module doc comment**

Read `bin/lib/issues/review-backlog.js` in full, then write the identical content to `bin/lib/issues/backlog.js`, changing only the top doc comment (lines 1-11) to:

```js
// bin/lib/issues/backlog.js
// Mechanical filter/sort/split/merge logic for /claude-tweaks:backlog's
// overview mode (scored records, unlimited scale — critical/risk-value/cleanup
// lenses) and refine mode's bounded LLM synthesis pass over unscored records.
// `selectBudgetSlice` also bounds refine mode's grant-check pass over
// ready+ungranted records — it's population-agnostic, just an oldest-first
// slice with a `remaining` count. Records are expected to already carry
// `.facets` (via record.js's parseRecordFacets or local-store.js's
// readRecord/queryRecords) and, where sorting depends on it, a `.createdAt` ISO
// string. Every function except `deriveCreatedAtFromGit` is pure — no network, no
// fs — mirroring record.js's purity contract; `deriveCreatedAtFromGit` is the one
// deliberate exception (it shells out to `git log`), with its side effect isolated
// behind an injectable `execFn` so callers (and tests) don't have to touch a real
// git repo to exercise it.
'use strict';
```

Every other line (the `RANK` map, `bandOf`/`riskBandOf`/`byCreatedAtAsc`, all 7 functions, `module.exports`) is copied verbatim, unchanged.

- [ ] **Step 2: Copy the test file, updating only the require path**

Read `bin/lib/issues/tests/review-backlog.test.js` in full, write it to `bin/lib/issues/tests/backlog.test.js` with line 12's require path changed from `require('../review-backlog')` to `require('../backlog')`. Every test body is copied verbatim, unchanged.

- [ ] **Step 3: Delete the old files**

```bash
git rm bin/lib/issues/review-backlog.js bin/lib/issues/tests/review-backlog.test.js
```

- [ ] **Step 4: Run the renamed test file to confirm it passes**

Run: `node --test bin/lib/issues/tests/backlog.test.js`
Expected: all tests pass (same count as the old `review-backlog.test.js` had), 0 failures.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/backlog.js bin/lib/issues/tests/backlog.test.js
git commit -m "Rename bin/lib/issues/review-backlog.js to backlog.js (backs the new /claude-tweaks:backlog skill)"
```

---

### Task 2: Add `bin/lib/issues/ranking.js`

**Files:**
- Create: `bin/lib/issues/ranking.js`
- Create: `bin/lib/issues/tests/ranking.test.js`

**Interfaces:**
- Consumes: `record.js`'s `PRIORITIES`, `TIERS`, `parseDependencies(body) -> number[]` (already exported today); `grouping.js`'s `groupByFileOverlap(items: {id, keyFiles}[]) -> id[][]` (already exported today).
- Produces: `rankNextToBuild(candidates) -> candidates[]` (sorted best-next-to-build first). Each candidate object must carry `{ id, facets, body, keyFiles, hasPlan }` — `keyFiles` and `hasPlan` are precomputed by the caller (Task 7's overview-mode.md and `/help`'s own consumption both compute these the same way `/help`'s existing Conflict-detection sub-section already does for `keyFiles` — extracting `### Key Files` from the body — and a `docs/superpowers/plans/` directory listing for `hasPlan`). This function does no I/O — pure, like every other function in `record.js`/`grouping.js`/`backlog.js`.

- [ ] **Step 1: Write the failing tests**

Create `bin/lib/issues/tests/ranking.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { rankNextToBuild } = require('../ranking');

function candidate(overrides) {
  return {
    id: 1,
    facets: { priority: null, effort: null },
    body: '',
    keyFiles: [],
    hasPlan: false,
    ...overrides,
  };
}

test('rankNextToBuild sorts by priority band first (high before medium before low before unset)', () => {
  const low = candidate({ id: 1, facets: { priority: 'low', effort: null } });
  const high = candidate({ id: 2, facets: { priority: 'high', effort: null } });
  const unset = candidate({ id: 3, facets: { priority: null, effort: null } });
  const medium = candidate({ id: 4, facets: { priority: 'medium', effort: null } });
  const result = rankNextToBuild([low, high, unset, medium]);
  assert.deepStrictEqual(result.map((c) => c.id), [2, 4, 1, 3]);
});

test('an out-of-vocabulary priority value sorts like unset (band 3), never NaN', () => {
  const bogus = candidate({ id: 1, facets: { priority: 'critical', effort: null } });
  const high = candidate({ id: 2, facets: { priority: 'high', effort: null } });
  const result = rankNextToBuild([bogus, high]);
  assert.deepStrictEqual(result.map((c) => c.id), [2, 1], 'an out-of-vocabulary priority must sort AFTER a real "high", not corrupt the order');
});

test('within the same priority band, a candidate that unblocks more other candidates ranks first', () => {
  const unblocksTwo = candidate({ id: 1, facets: { priority: 'high', effort: null } });
  const unblocksNone = candidate({ id: 2, facets: { priority: 'high', effort: null } });
  const blocker = candidate({ id: 3, facets: { priority: 'high', effort: null }, body: 'Blocked by #1' });
  const blocker2 = candidate({ id: 4, facets: { priority: 'high', effort: null }, body: 'Blocked by #1' });
  const result = rankNextToBuild([unblocksNone, unblocksTwo, blocker, blocker2]);
  assert.strictEqual(result[0].id, 1, 'id 1 unblocks 2 other candidates (ids 3 and 4) and must rank first among same-priority candidates');
});

test('within the same priority and unblocks-count, a candidate with no file overlap with another candidate ranks first', () => {
  const overlapping1 = candidate({ id: 1, facets: { priority: 'high', effort: null }, keyFiles: ['src/a.js'] });
  const overlapping2 = candidate({ id: 2, facets: { priority: 'high', effort: null }, keyFiles: ['src/a.js'] });
  const clean = candidate({ id: 3, facets: { priority: 'high', effort: null }, keyFiles: ['src/b.js'] });
  const result = rankNextToBuild([overlapping1, clean, overlapping2]);
  assert.strictEqual(result[0].id, 3, 'id 3 has no file overlap with any other candidate and must rank first among ties');
});

test('within the same priority/unblocks/overlap tier, lower effort ranks first', () => {
  const highEffort = candidate({ id: 1, facets: { priority: 'high', effort: 'high' } });
  const lowEffort = candidate({ id: 2, facets: { priority: 'high', effort: 'low' } });
  const result = rankNextToBuild([highEffort, lowEffort]);
  assert.deepStrictEqual(result.map((c) => c.id), [2, 1]);
});

test('as the final tie-break, a candidate with an existing plan ranks first', () => {
  const noPlan = candidate({ id: 1, facets: { priority: 'high', effort: 'low' }, hasPlan: false });
  const hasPlan = candidate({ id: 2, facets: { priority: 'high', effort: 'low' }, hasPlan: true });
  const result = rankNextToBuild([noPlan, hasPlan]);
  assert.deepStrictEqual(result.map((c) => c.id), [2, 1]);
});

test('unblocks-count only counts candidates within the same input array, and only exact-match blocker ids', () => {
  const target = candidate({ id: 5, facets: { priority: 'high', effort: null } });
  const otherTarget = candidate({ id: 6, facets: { priority: 'high', effort: null } });
  const blocksTarget = candidate({ id: 7, facets: { priority: 'high', effort: null }, body: 'Blocked by #5' });
  const blocksSomethingElse = candidate({ id: 8, facets: { priority: 'high', effort: null }, body: 'Blocked by #999' });
  const result = rankNextToBuild([target, otherTarget, blocksTarget, blocksSomethingElse]);
  assert.strictEqual(result[0].id, 5, 'id 5 is unblocked by one in-array candidate; id 6 by zero, so 5 ranks first among the priority:high tier');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/issues/tests/ranking.test.js`
Expected: FAIL — `Cannot find module '../ranking'`

- [ ] **Step 3: Write the implementation**

Create `bin/lib/issues/ranking.js`:

```js
// bin/lib/issues/ranking.js
// Pure: "what should I build next" ranking, shared by /claude-tweaks:backlog's
// overview mode and /claude-tweaks:help's Priority Order/Tie-Breaking (extracted
// from /help's prose-only rules so both consumers compute the identical order).
// Tie-break order: priority band (high first) -> unblocks-count (most other
// candidates in the same input array it unblocks, first) -> file-overlap-free
// (no shared keyFiles with another candidate in the array, first) -> effort band
// (low first) -> hasPlan (true first). Every input this needs (the unblocks
// graph, file-overlap groups, hasPlan) must be precomputed by the caller and
// attached to each candidate — this function does no I/O, mirroring record.js
// and grouping.js's purity contract.
'use strict';

const { PRIORITIES, TIERS, parseDependencies } = require('./record');
const { groupByFileOverlap } = require('./grouping');

const RANK = { high: 0, medium: 1, low: 2 };
const priorityBandOf = (c) => (c.facets.priority && PRIORITIES.includes(c.facets.priority) ? RANK[c.facets.priority] : 3);
const effortBandOf = (c) => (c.facets.effort && TIERS.includes(c.facets.effort) ? RANK[c.facets.effort] : 3);

// candidates[] -> Map<id, count>. For each candidate, how many OTHER candidates
// in the SAME input array declare `Blocked by #{candidate.id}` in their body
// (record.js's parseDependencies). A blocker id outside this array's id set
// contributes nothing — this only ranks within the candidate set actually
// passed in, not the whole backlog's dependency graph.
function computeUnblocksCount(candidates) {
  const counts = new Map(candidates.map((c) => [c.id, 0]));
  for (const c of candidates) {
    for (const blockerId of parseDependencies(c.body)) {
      if (counts.has(blockerId)) counts.set(blockerId, counts.get(blockerId) + 1);
    }
  }
  return counts;
}

// candidates[] -> Set<id> of candidates that share a keyFile with at least one
// other candidate in the array (grouping.js's groupByFileOverlap, filtered to
// groups of size > 1 — a singleton group has no overlap).
function computeOverlapSet(candidates) {
  const items = candidates.map((c) => ({ id: c.id, keyFiles: c.keyFiles || [] }));
  const groups = groupByFileOverlap(items);
  const overlapping = new Set();
  for (const group of groups) {
    if (group.length > 1) for (const id of group) overlapping.add(id);
  }
  return overlapping;
}

function rankNextToBuild(candidates) {
  const unblocksCountOf = computeUnblocksCount(candidates);
  const overlapping = computeOverlapSet(candidates);
  return candidates.slice().sort((a, b) =>
    priorityBandOf(a) - priorityBandOf(b) ||
    unblocksCountOf.get(b.id) - unblocksCountOf.get(a.id) ||
    Number(overlapping.has(a.id)) - Number(overlapping.has(b.id)) ||
    effortBandOf(a) - effortBandOf(b) ||
    Number(!b.hasPlan) - Number(!a.hasPlan)
  );
}

module.exports = { rankNextToBuild };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/issues/tests/ranking.test.js`
Expected: PASS — 7 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/ranking.js bin/lib/issues/tests/ranking.test.js
git commit -m "Add bin/lib/issues/ranking.js — shared 'what to build next' ranking for /backlog overview and /help"
```

---

### Task 3: Extend `_shared/record-queue-fetch.md` with a configurable limit and truncation detection

**Files:**
- Modify: `skills/_shared/record-queue-fetch.md`

- [ ] **Step 1: Read the current file**

Read `skills/_shared/record-queue-fetch.md` in full (76 lines) to confirm the exact current text of the `work-backend: github-issues` fetch section before editing.

- [ ] **Step 2: Replace the hardcoded `--limit 200` fetch with a configurable, truncation-detecting version**

In the `## work-backend: github-issues fetch` section, replace:

```bash
gh issue list --state open --json number,title,labels,milestone,updatedAt{,EXTRA_FIELDS} --limit 200 > {tmp-records-file}
node -e "
  const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('{tmp-records-file}');
  console.log(JSON.stringify(issues.map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }))));
" > {tmp-faceted-file}
```

with:

```bash
LIMIT="${BACKLOG_FETCH_LIMIT:-1000}"
export FETCH_LIMIT="$LIMIT"
gh issue list --state open --json number,title,labels,milestone,updatedAt{,EXTRA_FIELDS} --limit "$LIMIT" > {tmp-records-file}
node -e "
  const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('{tmp-records-file}');
  if (issues.length === Number(process.env.FETCH_LIMIT)) {
    console.error('WARNING: fetched exactly ' + issues.length + ' open issues (the configured backlog-fetch-limit) — there may be more beyond this cap. Consider raising backlog-fetch-limit in CLAUDE.md, or running /claude-tweaks:tidy to reduce backlog volume.');
  }
  console.log(JSON.stringify(issues.map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }))));
" > {tmp-faceted-file}
```

Read `backlog-fetch-limit` from the project's CLAUDE.md (`_shared/work-record.md`'s Config keys table — see Task 4) before this fetch and export it as `BACKLOG_FETCH_LIMIT`; a missing key defaults to `1000`. Export the same resolved value as `FETCH_LIMIT` for the node script's truncation check (two env vars because the bash default expansion and the node comparison both need the resolved number, and node's `process.env` can't see bash's `${VAR:-default}` fallback directly). The truncation warning is a `console.error` (stderr), not blocking — the fetch still proceeds with whatever it got; this is Layer 1 of the design doc's three-layer scaling model (fetch completeness), decoupled from Layer 2 (LLM-processing `--budget`, unrelated to this fetch's own size) and Layer 3 (presentation row caps, also unrelated).

- [ ] **Step 3: Add a one-line note after the code block explaining the new behavior**

Immediately after the code block from Step 2, add:

```markdown
`backlog-fetch-limit` (default `1000`) replaces the previous hardcoded 200/500 per-consumer limits — `gh issue list --limit N` auto-paginates internally regardless of how large `N` is, so raising the default doesn't change the fetch mechanism, only how much it's willing to pull before stopping. A consumer whose own population is naturally small (e.g. a `--label ready` filtered fetch) still uses this same limit and the same truncation check — the limit bounds "how many rows before we assume there might be more," not a per-consumer tuning knob.
```

- [ ] **Step 4: Manually verify the edited bash block is syntactically valid, and that `FETCH_LIMIT` is actually exported**

Reconstruct the FULL edited code block (the `LIMIT=`/`export FETCH_LIMIT=` lines, the `gh issue list` call, and the entire `node -e "..."` block — not a truncated fragment) in a scratch file and run `bash -n` against it (syntax check only, no execution, since this needs a live `gh`/repo context to actually run):

```bash
cat > /tmp/record-queue-fetch-check.sh << 'SCRIPT'
LIMIT="${BACKLOG_FETCH_LIMIT:-1000}"
export FETCH_LIMIT="$LIMIT"
gh issue list --state open --json number,title,labels,milestone,updatedAt --limit "$LIMIT" > /tmp/rqf-check-records.json
node -e "
  const issues = require('/tmp/rqf-check-records.json');
  if (issues.length === Number(process.env.FETCH_LIMIT)) {
    console.error('WARNING: fetched exactly ' + issues.length + ' open issues');
  }
  console.log(JSON.stringify(issues));
" > /tmp/rqf-check-out.json
SCRIPT
bash -n /tmp/record-queue-fetch-check.sh
```

Expected: no output (syntax OK), exit code 0. Separately, confirm by inspection (not execution) that `export FETCH_LIMIT="$LIMIT"` is present in the actual edited file — the node script's truncation comparison silently does nothing if this line is missing (`process.env.FETCH_LIMIT` would be `undefined`, `Number(undefined)` is `NaN`, and `issues.length === NaN` is never true).

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/record-queue-fetch.md
git commit -m "Add configurable backlog-fetch-limit + active truncation detection to record-queue-fetch.md"
```

---

### Task 4: Update `_shared/work-record.md` — collapse the permission matrix rows, update Consumers table, add the config key

**Files:**
- Modify: `skills/_shared/work-record.md`

- [ ] **Step 1: Replace the `/triage` and `/review-backlog` permission matrix rows with one `/backlog` row**

Find (exact current lines 95 and 98, confirmed by this session's research):

```
| **`/triage`** (gate, human present) | `auto:build`, `auto:merge` (human-confirmed), scoring supplied inline | `ready` (flag back), `bot:blocked` (re-grant strip) | granting on a headless path |
```

and

```
| **`/review-backlog`** (survey, human-confirmed) | `priority:*` (human-confirmed via batch-apply), updates the `**Related:**` body line (human-confirmed) | nothing | `auto:*`, `bot:*`, `ready`, `risk:*`/`effort:*`, body-shaping |
```

Replace both with a single row in the same table position (between the `/specify` row and the `/dispatch` row):

```
| **`/backlog refine`** (write mode, human present) | `auto:build`, `auto:merge` (human-confirmed), `priority:*` (human-confirmed via batch-apply), updates the `**Related:**` body line (human-confirmed), scoring supplied inline | `ready` (flag back), `bot:blocked` (re-grant strip) | granting on a headless path, `bot:*`, `risk:*`/`effort:*` beyond the inline-override case, body-shaping beyond the `**Related:**` line |
```

Add one line immediately below it documenting `overview` mode's read-only status (the permission matrix otherwise has no row for a skill that writes nothing — this is new, since neither predecessor needed it stated this explicitly on its own):

```
| **`/backlog overview`** (read mode) | nothing | nothing | everything — pure read-only distribution/recommendation view |
```

- [ ] **Step 2: Replace the Consumers table's `/triage` row**

Find (exact current line 286):

```
| `/triage` | The human gate — grants `auto:build` / `auto:merge` over the `ready` queue |
```

Replace with:

```
| `/backlog` | `refine` mode is the human gate — grants `auto:build`/`auto:merge` over the `ready` queue, and suggests `priority:*`/`**Related:**` (human-confirmed). `overview` mode is read-only — distribution views plus a "what to build next" recommendation. |
```

(No `/review-backlog` row exists in this table today — confirmed by this session's research — so there is nothing separate to remove there.)

- [ ] **Step 3: Add the `backlog-fetch-limit` config key**

In the `## Config keys` table, add a new row (any position — the table isn't alphabetized or otherwise ordered by a rule worth preserving, so append at the end, immediately before the `promise-register-min-leaves` row's closing):

```
| `backlog-fetch-limit` | `1000` | Cap on `gh issue list --limit` for every `_shared/record-queue-fetch.md` consumer (`/help`, `/tidy`, `/backlog`) — `gh` auto-paginates internally regardless of size; this bounds how many rows before a truncation warning fires, not a hard cutoff on backlog size |
```

- [ ] **Step 4: Verify no other `/triage` or `/review-backlog` pattern-form references remain in this file**

Run: `grep -n "\`/triage\`\|\`/review-backlog\`\|/claude-tweaks:triage\|/claude-tweaks:review-backlog" skills/_shared/work-record.md`
Expected: no matches (the `**Legacy alias exception.**` paragraph — line 277 in the pre-edit file — mentions `/triage` inside a longer sentence about `backlog-backend`; re-check this specific line and update it too if the grep surfaces it: replace `/dispatch`, `/triage`, `/demo`... with `/dispatch`, `/backlog`, `/demo`... in that sentence's skill list).

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/work-record.md
git commit -m "Collapse /triage + /review-backlog permission-matrix rows into one /backlog row; add backlog-fetch-limit config key"
```

---

### Task 5: Write `skills/backlog/SKILL.md`

**Files:**
- Create: `skills/backlog/SKILL.md`

**Interfaces:**
- Consumes: `refine-mode.md` (Task 6), `overview-mode.md` (Task 7) — lazy-loaded per mode, same pattern `skills/help/SKILL.md` uses for `status-scan.md`.

- [ ] **Step 1: Write the full file**

Create `skills/backlog/SKILL.md`:

```markdown
---
name: claude-tweaks:backlog
description: Use when you want to sweep the open work-record backlog and ensure records carry the right priority/Related/grant labels (refine mode), or get a distribution overview and a recommendation for what to build next (overview mode). Keywords - backlog, triage, authorize, grant, auto:build, auto:merge, priority, related, distribution, recommend, next.
argument-hint: "[refine|overview] [critical|risk-value|cleanup] [--budget <n>] [--origin <origin>]"
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Backlog — Refine Labels and Understand the Queue

Two modes over the same open work-record backlog: `refine` ensures every record carries the right `priority:*`/`**Related:**`/grant labels (a write sweep, human-confirmed); `overview` renders a distribution picture and recommends what to build next (read-only). Sits outside the main brainstorm-to-build chain, feeding judgment and authorization into it rather than gating it:

```
capture / code-health / harness-health / journey-health / docs-health   (file records)
                              │
                              v
                /claude-tweaks:specify   (shapes to ready)
                              │
                              v
              [ /claude-tweaks:backlog ]   <- utility (no fixed lifecycle position)
                              │
                              v
                    /claude-tweaks:dispatch   (claims + executes)
                              │
                              v
                    close-via-merge   (record closes)
```

## When to Use

- You want to sweep the backlog and make sure `priority:*`, `**Related:**`, and grants (`auto:build`/`auto:merge`) are all correctly set — `refine` mode.
- A record hit its retry ceiling (`bot:blocked`) and needs a human's renewed judgment before it can re-enter the autonomous queue — `refine` mode.
- You want a synthesized read of what's in the backlog — narrative + thematic clusters, a critical/risk-value/cleanup view, or a recommendation for what to build next — `overview` mode.
- You want a copy-pasteable hand-off block to parallelize shaping or building a chosen batch across terminals — `overview` mode.

Not for: shaping record bodies or stamping `risk:*`/`effort:*` (`/claude-tweaks:specify`'s job), claiming or building anything (`/claude-tweaks:dispatch`'s job), or filing/closing records.

## Input

`$ARGUMENTS` = `[refine|overview] [critical|risk-value|cleanup] [--budget <n>] [--origin <origin>]`

- No mode (bare) → `overview` — the safer, non-mutating default.
- `refine` → the write/labeling-sweep mode. Read `refine-mode.md` in this skill's directory for the full procedure.
- `overview` → the read-only distribution + recommendation mode. Read `overview-mode.md` in this skill's directory for the full procedure.
- `critical` / `risk-value` / `cleanup` → lens sub-arguments, valid only under `overview` (or bare, which is `overview`). Invalid under `refine` — report the conflict and stop rather than silently ignoring it.
- `--budget <n>` → caps LLM-bound processing in `refine` (the priority/Related synthesis pass and the grant-check pass, independently, default 40 each); caps table row rendering in `overview` (default 20).
- `--origin <origin>` → filters `refine`'s grant-sweep worklist by `facets.origin` (`code-health|harness-health|journey-health|docs-health|capture|human`, where `human` selects records with no `by:*` label). No effect on `overview` or on `refine`'s priority/Related sweep.

## Preflight

Read the project's `work-backend` config key (per `_shared/work-record.md`'s Config keys table, written by `/claude-tweaks:init`). Preflight is **mode-conditional**, not skill-wide:

**`overview` mode (either driver):** under `work-backend: github-issues`, run the Detection Ladder from `_shared/github-pr-scan.md` (checks 1-3) before any `gh` command — treat any ladder failure as a hard gate (there is no meaningful degraded mode when the whole fetch depends on `gh`). Report the specific failing check and stop. Under `work-backend: local-files`, skip the Detection Ladder entirely.

**`refine` mode, priority/Related sub-stage (either driver):** identical to `overview` mode's preflight above — both drivers supported, Detection Ladder hard gate under `github-issues`.

**`refine` mode, grant sub-stage (`github-issues` only):** before any `gh` command for this sub-stage specifically, run the same Detection Ladder as a hard gate. Under `work-backend: local-files`, this sub-stage alone reports "grants are not applicable under local-files — no headless consumer acts on them (see `refine-mode.md`'s Preflight)" and is skipped — this does **not** abort the whole `refine` run; the priority/Related sub-stage still proceeds normally. This is a deliberate divergence from the old `/triage`'s "stop this turn completely" stance: that made sense when grants were the skill's only job, but `refine` has a second, still-valid half under `local-files`.

**Missing key vs. deliberate `local-files` choice (grant sub-stage only).** Before treating an absent `work-backend` line as an intentional `local-files` project for the grant sub-stage specifically, check whether CLAUDE.md's `## Backlog integration` section already carries a `backlog-backend:` line (the pre-6.0 legacy key):

```bash
grep -q '^work-backend:' CLAUDE.md && echo "OK" || { grep -qE '^backlog-backend:[[:space:]]*\S' CLAUDE.md && echo "MIGRATION_GAP" || echo "GENUINE_LOCAL_FILES"; }
```

`MIGRATION_GAP` means this is very likely an incomplete migration, not a deliberate `local-files` choice — for the grant sub-stage only, report exactly this message (substituting the actual `backlog-backend` value for `{value}`) and skip the grant sub-stage (the priority/Related sub-stage is unaffected by this check):

> CLAUDE.md has backlog-backend but no work-backend: line — add work-backend: {value} (the same value as backlog-backend) to CLAUDE.md's Backlog integration section to fix this.

`OK` and `GENUINE_LOCAL_FILES` both proceed through the branch above unchanged.

## Workflow

Read `refine-mode.md` in this skill's directory for the full `refine` procedure, or `overview-mode.md` for the full `overview` procedure, per the resolved mode from Input above.

## Next Actions

**After `refine`:** call `AskUserQuestion`:
- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Dispatch what I just granted (Recommended)"`, `description`: `"/claude-tweaks:dispatch {#-prefixed, comma-joined numbers of every record this run granted a build authorization to, e.g. #201,#202,#205} — skips re-selection, claims and builds them directly"` — omit this option entirely if nothing was granted this run
- Option 2 — `label`: `"Dispatch just the next one"`, `description`: `"/claude-tweaks:dispatch next — claim and build the single highest-priority authorized record"`
- Option 3 — `label`: `"Refine again"`, `description`: `"/claude-tweaks:backlog refine — review anything still left needing labels"`

**After `overview`:** call `AskUserQuestion`:
- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Refine the labels (Recommended)"`, `description`: `"/claude-tweaks:backlog refine — apply the priority/Related/grant suggestions this overview surfaced"` — omit when nothing surfaced needs refining
- Option 2 — `label`: `"Shape the top priority record"`, `description`: `"/claude-tweaks:specify #{n} — shape the single highest-priority backlog record this run surfaced"`
- Option 3 — `label`: `"Generate a hand-off block"`, `description`: `"Parallelize shaping or dispatching across terminals for the batch this run surfaced"` — omit when no natural batch was produced this run
- Option 4 (only after a named-lens run) — `label`: `"Try the {other-lens} lens"`, `description`: `"/claude-tweaks:backlog overview {other-mode} — {one-line description of that mode}"`, naming exactly one of the two named lenses not yet run this session.

## Component-Skill Contract

`/claude-tweaks:backlog` is human-only — no pipeline orchestrator ever invokes it as a component step; a human runs it directly, every time. It always renders `## Next Actions`. `$PIPELINE_RUN_DIR` may be set during a run, but only because this skill resolves its own standalone run dir per `_shared/pipeline-run-dir.md`'s allowlist to write `decisions.md` — that resolution is for logging only and never suppresses interactivity or the Next Actions block.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Granting `auto:build`/`auto:merge` from anything but an interactive human session | `auto:*` labels are only ever added by an interactive human session — there is no machinery path that originates a grant. This is the security boundary, not a discretionary nicety. |
| Skipping or bulk-bypassing the batch-confirm in `refine` mode | The human action, however trivial, is the load-bearing security signature — never skip it, even for an all-recommended batch. |
| Adding any `bot:*` label from this skill | `bot:*` is `/claude-tweaks:dispatch`'s visibility layer — this skill only ever *strips* `bot:blocked` on re-grant; it never adds one. |
| Reading every unscored record's body in one unbounded pass, ignoring `--budget` | Defeats the bounded-synthesis design — see `refine-mode.md`'s Data Flow section. |
| Fixing (rather than surfacing) `unsynced: true` local fallback records' sync state | Stays `/claude-tweaks:tidy`'s job (its existing Shape 3) — this skill tags them and (in `refine`) may still suggest/apply `priority:*` for one via the local-files fallback path, but never mirrors it to GitHub. |
| Claiming or building a record from this skill | Out of scope entirely — stays `/claude-tweaks:dispatch`'s job. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:dispatch` | The queue consumer — claims records `refine` mode authorized (`auto:build`) and hands each to `/claude-tweaks:flow`. This skill never claims, dispatches, or executes. |
| `/claude-tweaks:flow` | Indirect only, via `/claude-tweaks:dispatch` — `/flow` builds and (with `auto:merge`) merges records this skill's `refine` mode has authorized. |
| `/claude-tweaks:code-health`, `/claude-tweaks:harness-health`, `/claude-tweaks:journey-health`, `/claude-tweaks:docs-health` | Feeders — file records born `ready` (spec-shaped, scored). This skill never files or closes their records. |
| `/claude-tweaks:capture` | Feeder — files raw backlog records; `overview` mode surveys and prioritizes them, `refine`'s priority/Related sweep enriches the `**Related:**` field `/capture`'s Entry Format stamps. |
| `/claude-tweaks:specify` | The shaper — stamps `ready` + scoring before a record can enter `refine`'s grant worklist; is where a flagged-back record returns for re-shaping; is the hand-off target for a backlog record `overview` surfaced. |
| `/claude-tweaks:tidy` | Reciprocal: folds `unsynced: true` local fallback records into its survey (surfacing, and — for the priority axis specifically — the apply path via the local-files fallback branch); `/tidy`'s existing Shape 3 owns the actual sync-to-GitHub action. `/tidy`'s Shape 4/5 findings (unscored `ready`, `bot:blocked`) surface the same facts `refine`'s own grant sweep would encounter — proactive hygiene, not a new redundancy. |
| `/claude-tweaks:help` | Surfaces `refine`'s pending-authorization count on its dashboard (the reciprocal of this row); shares `bin/lib/issues/ranking.js`'s `rankNextToBuild` with `overview`'s recommendation section. |
| `_shared/work-record.md` | Taxonomy home — the seven-axis label contract, grant semantics, spec-shaped body definition, and the permission-matrix row this skill implements. |
| `_shared/issue-claims.md` | Defines the claim protocol `/claude-tweaks:dispatch` uses after `refine` grants — this skill itself never claims. |
| `_shared/github-pr-scan.md` | Detection Ladder — this skill's preflight hard gate — plus the `repo-wide`/`triage-queue` scopes that surface `refine`'s pending-authorization count elsewhere. |
| `_shared/label-bootstrap.md` | Canonical check-then-create snippet for the `auto:build`/`auto:merge`/`priority:*`/`risk:*`/`effort:*` pairs this skill applies. |
| `_shared/pipeline-run-dir.md` | This skill resolves a standalone-auto run dir for its own `decisions.md`. |
| `_shared/auto-mode-contract.md` | Governs `decisions.md` logging for this skill's standalone run dir; the grants and priority/Related writes themselves are never auto-mode behavior — they require an interactive session by construction. |
| `_shared/local-files-preflight-stop.md` | Canonical "stop this turn completely" boundary-language pattern `refine`'s grant sub-stage Preflight follows for its local-files-hard-stop portion specifically. |
| `/claude-tweaks:assess-agent-autonomy` | Called inline once per grant-worklist record in `refine`'s grant-check pass — its `RECOMMEND_BUILD`/`RECOMMEND_MERGE` output becomes the unified table's Recommended column for grant rows. |
| `bin/lib/issues/{record,backlog,grouping,ranking}.js` | `record.js`'s `parseRecordFacets` facet-parses the fetched queue; `backlog.js`'s filter/sort/split/merge/budget helpers back both modes' mechanical logic; `grouping.js`'s `groupByFileOverlap` and `ranking.js`'s `rankNextToBuild` back `overview`'s recommendation section. |
```

- [ ] **Step 2: Commit**

```bash
git add skills/backlog/SKILL.md
git commit -m "Add skills/backlog/SKILL.md — the merged /claude-tweaks:backlog entry point"
```

---

### Task 6: Write `skills/backlog/refine-mode.md`

**Files:**
- Create: `skills/backlog/refine-mode.md`

**Interfaces:**
- Consumes: `bin/lib/issues/backlog.js`'s `splitScoredUnscored`, `selectBudgetSlice`; `bin/lib/issues/record.js`'s `parseRecordFacets`; `skills/_shared/record-queue-fetch.md` (Task 3's extended version); `/claude-tweaks:assess-agent-autonomy`'s `grant-check` mode (unchanged, invoked exactly as `triage/SKILL.md`'s old Step 2 did).

- [ ] **Step 1: Read the still-present source files for exact ported content**

Before writing, read `skills/triage/SKILL.md` (Steps 1-4, Concurrency section) and `skills/review-backlog/SKILL.md` (Steps 1, 3, 5 — the fetch, synthesis, and Apply mechanics) in full — both still exist on disk at this point in the plan (Task 8 deletes them later). This step exists so the content in Step 2 below is transcribed accurately, not from memory.

- [ ] **Step 2: Write the full file**

Create `skills/backlog/refine-mode.md`:

```markdown
# Backlog — Refine Mode

The comprehensive "ensure every issue has the right labels" sweep: `priority:*`/`**Related:**` suggestions plus `auto:build`/`auto:merge` grants, presented together and confirmed once.

## Step 1: Fetch

**Priority/Related fetch (both drivers).** Fetch and facet-parse the full open-issue queue per `_shared/record-queue-fetch.md` (`{tmp-records-file}` = `/tmp/backlog-refine-open.json`, `{tmp-faceted-file}` = `/tmp/backlog-refine-faceted.json`, `{EXTRA_FIELDS}` = `,body` — this pass needs bodies for synthesis). Under `work-backend: github-issues`, also fold in `unsynced: true` local fallback records the same way `review-backlog/SKILL.md`'s old Step 1 did (`queryRecords('specs', { unsynced: true })`, `deriveCreatedAtFromGit`, `mergeUnsyncedRecords` — port these three bash/node blocks verbatim from `review-backlog/SKILL.md`'s Step 1, substituting the tmp-file names above). Tag every fetched record with a **not yet synced** marker in rendered output wherever `facets.unsynced === true`.

**Grant fetch (`work-backend: github-issues` only, skipped per Preflight under `local-files`).** Fetch per the same shared fragment, this time server-side filtered:

```bash
LIMIT="${BACKLOG_FETCH_LIMIT:-1000}"
export FETCH_LIMIT="$LIMIT"
gh issue list --label ready --state open --json number,title,labels,updatedAt --limit "$LIMIT" > /tmp/backlog-refine-ready.json
node -e "
  const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('/tmp/backlog-refine-ready.json');
  if (issues.length === Number(process.env.FETCH_LIMIT)) {
    console.error('WARNING: fetched exactly ' + issues.length + ' ready-labeled issues (backlog-fetch-limit) — there may be more. See CLAUDE.md.');
  }
  const originFilter = process.env.BACKLOG_ORIGIN || '';
  let rows = issues.map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }));
  if (originFilter) {
    rows = rows.filter((r) => (originFilter === 'human' ? r.facets.origin === null : r.facets.origin === originFilter));
  }
  const worklist = rows.filter((r) => !r.facets.grants.build && !r.facets.grants.merge);
  const fresh = worklist.filter((r) => !r.facets.bot.blocked);
  const blocked = worklist.filter((r) => r.facets.bot.blocked);
  console.log(JSON.stringify({ fresh, blocked }));
" > /tmp/backlog-refine-worklist.json
```

When `--origin <name>` was passed (see `SKILL.md`'s Input), export `BACKLOG_ORIGIN=<name>` before running the script above; omitted, it's unset and the script runs unfiltered. This mirrors `triage/SKILL.md`'s old Step 1 exactly, including the origin-agnostic default and the fresh/blocked split (`blocked` = hit the retry ceiling, `bot:blocked`, a re-authorization candidate).

**These are two separate fetches, not one.** The priority/Related fetch is unfiltered (needs the whole backlog); the grant fetch is server-side filtered to `--label ready` (preserves today's exact starvation-avoidance guarantee — an unfiltered pull risks pushing older `ready`-labeled issues out of a shared result window on a large backlog). Both route through the same `backlog-fetch-limit` config key and truncation-warning pattern, just as two independent invocations of it.

## Step 2: Priority/Related synthesis (bounded)

Over the priority/Related fetch's `unscored` split (`bin/lib/issues/backlog.js`'s `splitScoredUnscored`), bound the LLM read to `--budget` (default 40, independent of the grant pass's own budget in Step 3):

```bash
node -e "
  const bl = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/backlog.js');
  const all = require('/tmp/backlog-refine-faceted.json');
  const { unscored } = bl.splitScoredUnscored(all);
  const { selected, remaining } = bl.selectBudgetSlice(unscored, ${PRIORITY_BUDGET:-40});
  console.log(JSON.stringify({ selected, remaining }));
" > /tmp/backlog-refine-priority-budget.json
```

Read every selected body in one pass and produce: a narrative summary + thematic clusters, a per-record `priority:*` suggestion with a one-line rationale, a per-record **non-binding** tier guess (`quick`/`full`) — purely to help a human eyeball a batch before deciding what to send to `/specify` next; this is never written as a label, only `/specify`'s own `ceremony-check` (a separate, authoritative computation with deeper context) writes `ceremony:*` — and detected `**Related:**` cross-references (pairs of selected records whose bodies reference each other's context in prose without a formal link). Never suggest `Blocked by #N` here — out of scope, the formally-parsed hard-dependency mechanism. If `remaining > 0`, state it plainly: "`{remaining}` more unscored records exist beyond this run's `--budget {N}` — re-run to continue." Never silently drop them. This step is identical in substance to `review-backlog/SKILL.md`'s old Step 3 (Lane B) — port its exact wording for the synthesis output shape, INCLUDING the tier-guess bullet (present in the source at `review-backlog/SKILL.md:164`, omitted from an earlier draft of this plan step by oversight — restore it, don't drop it).

## Step 3: Grant-check (bounded, `work-backend: github-issues` only)

Bound the grant-check LLM pass independently of Step 2's budget:

```bash
node -e "
  const bl = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/backlog.js');
  const data = require('/tmp/backlog-refine-worklist.json');
  const { selected, remaining } = bl.selectBudgetSlice(data.fresh || [], ${GRANT_BUDGET:-40});
  console.log(JSON.stringify({ selected, remaining, blocked: data.blocked || [] }));
" > /tmp/backlog-refine-grant-budget.json
```

For every record in `selected`, invoke `/claude-tweaks:assess-agent-autonomy` in `grant-check` mode, once per record:

```
Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "grant-check #{n}")
```

Each invocation returns `RECOMMEND_BUILD`/`RECOMMEND_MERGE`/`RATIONALE`. Derive the unified table's Recommended column for grant rows from this output, carrying `RATIONALE` through to the table's Rationale column and the `decisions.md` log line. For every record in `blocked` (unaffected by the budget — the retry-ceiling population is typically small and its re-authorization recommendation needs no `grant-check` call at all), recommend **`re-authorize (bot:blocked)`** directly, regardless of content — applying this row grants `auto:build` only, never bundling `auto:merge` automatically. If `remaining > 0` (from the `fresh` budget slice), state it plainly in the report: "`{remaining}` more ready records awaiting grant-check exist beyond this run's `--budget {N}` — re-run to continue." This step is identical in substance to `triage/SKILL.md`'s old Step 2 — port its exact wording, with the budget/residue addition above (today's `/triage` had no budget or residue message here at all; this is new).

## Step 3.5: Body-shape re-verification (before granting)

For every record the grant-check pass recommends **granting** (not flag-back/blocked rows) — fetch the body and re-verify spec shape immediately before writing any label, using the same cached-body-reuse trick `triage/SKILL.md`'s old Step 3.5 used (`grant-check` already fetched and cached the body at `/tmp/assess-grant-{n}.json`; reuse it instead of a second API round-trip). Port `triage/SKILL.md`'s old Step 3.5 verbatim — the spec-shaped body check (`## Current State`/`## Deliverables`/`## Acceptance Criteria` present and non-empty, no unresolved placeholder markers), the auto-downgrade-to-flag-back mechanics, and the exact flag-back comment wording.

## Step 4: Unified table

```markdown
### Backlog Refine — {N} suggested label changes

| # | Record | Type | Origin | Current | Recommended | Suggested Tier | Rationale |
|---|---|---|---|---|---|---|---|
| 1 | #123: {title} | priority | by:code-health | (none) | priority:high | quick? (guess) | {synthesis rationale} |
| 2 | #16: {title} | related | by:capture | (none) | Add **Related:** #23 | — | {synthesis rationale} |
| 3 | #124: {title} | grant | by:capture | — | auto:build + auto:merge | — | {grant-check RATIONALE} |
| 4 | #118: {title} | grant | by:harness-health | bot:blocked | re-authorize (bot:blocked) | — | Prior failure — human judgment required, not a mechanical replay |
```

The `Type` column (`priority`/`related`/`grant`) is what keeps grant rows visually distinguishable within the single table — a human scanning it can still see at a glance which rows are security-relevant, even though there is only one confirm gate for the whole batch. The `Suggested Tier` column carries Step 2's non-binding tier guess (`quick?`/`full?` (guess)) — populated only for `priority`-type rows (the tier guess is a byproduct of Step 2's per-record LLM read, which only runs over unscored records); `related` and `grant` rows always render `—` here, since neither has a tier guess to show. A record already carrying a real `ceremony:*` label (scored before this run) would render it plainly (`fast-lane`/`standard`, no `?`/`(guess)` suffix) rather than the LLM's own guess — distinguishing an authoritative value from a rough one, per `review-backlog/SKILL.md`'s old Step 4. For 10 or more rows, lead with a one-line count summary before the table (e.g. "18 suggestions: 6 priority, 3 related, 7 grants, 2 re-authorizations") so the human sees the batch's shape before the row detail.

Then one `AskUserQuestion`:

- `question`: `"Apply these label changes, or override specific items?"`, `header`: `"Backlog refine"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"Set priority/Related/grants exactly per the table above"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"I'll specify #-by-# corrections in my next message"`
- Option 3 — `label`: `"Grant auto:build only, hold merge"`, `description`: `"Apply every non-grant suggestion normally, and apply auto:build/re-authorize to every grant row, but withhold auto:merge session-wide — even rows recommended for it. Useful for a first supervised run."`
- Option 4 — `label`: `"Skip all suggestions"`, `description`: `"Leave every record untouched for now"`

Overrides (including inline scoring for an unscored grant row) are ordinary free-text in the user's next message, not the `Other` field.

## Step 5: Apply

**Priority/Related rows:** port `review-backlog/SKILL.md`'s old Step 5 verbatim — the `gh issue edit --remove-label/--add-label` swap for a pre-existing different-tier `priority:*` label, the local-files `writeRecord` + `git add`/`git commit` branch, and — per this plan's correction above — the `facets.unsynced === true` branch that takes the local-files `writeRecord` path regardless of the project-wide driver, since an unsynced record has no `$ISSUE` to edit either way.

**Grant rows:** port `triage/SKILL.md`'s old Step 4 verbatim — the label-bootstrap comment, the `bot:blocked`-strip-in-the-same-edit-as-grant mechanics, the inline-scoring-override write, and (when Option 3 above was chosen) the hold-merge session-wide skip of every `gh issue edit --add-label auto:merge` line.

**Flag-back rows:** port `triage/SKILL.md`'s old Step 4 flag-back mechanics verbatim (remove `ready`, post the appropriate comment — Step 3.5's exact downgrade wording, or the shorter `needs scoring`/free-text-reason wording for every other flag-back).

Log every action to this run's `decisions.md` (standalone-auto run dir per `_shared/pipeline-run-dir.md`):

```
AUTO {time} — Backlog refine: set priority:{tier} on #{n}.
AUTO {time} — Backlog refine: updated **Related:** on #{n} to reference #{m}.
AUTO {time} — Backlog refine: granted auto:build{ + auto:merge} to #{n} (risk:{riskTier}, effort:{effortTier}). Rationale: {grant-check RATIONALE}.
AUTO {time} — Backlog refine: re-authorized #{n} — stripped bot:blocked, granted auto:build{ + auto:merge}.
AUTO {time} — Backlog refine: flagged back #{n} — {missing sections | needs scoring}.
```

## Concurrency

Port `triage/SKILL.md`'s old Concurrency section verbatim — every label add is idempotent; the one sharp edge (a grant and a flag-back racing on the same record) is accepted, not engineered around, and self-corrects on the next run.
```

- [ ] **Step 3: Commit**

```bash
git add skills/backlog/refine-mode.md
git commit -m "Add skills/backlog/refine-mode.md — merged priority/Related + grant sweep procedure"
```

---

### Task 7: Write `skills/backlog/overview-mode.md`

**Files:**
- Create: `skills/backlog/overview-mode.md`

**Interfaces:**
- Consumes: `bin/lib/issues/backlog.js`'s `filterCritical`, `rankRiskValue`, `filterCleanup`; `bin/lib/issues/ranking.js`'s `rankNextToBuild`; `bin/lib/issues/grouping.js`'s `groupByFileOverlap` (for `keyFiles` extraction, same pattern `/help`'s Conflict detection uses).

- [ ] **Step 1: Read the still-present source file for exact ported content**

Read `skills/review-backlog/SKILL.md` (Steps 1, 2, 6) in full before writing — it still exists on disk at this point (Task 8 deletes it later).

- [ ] **Step 2: Write the full file**

Create `skills/backlog/overview-mode.md`:

```markdown
# Backlog — Overview Mode

Entirely mechanical — no per-record LLM reads, so it scales to the full fetched set cheaply. Collapses the `critical`/`risk-value`/`cleanup` lenses into one picture and adds a "what to build next" recommendation.

## Step 1: Fetch

Fetch and facet-parse the full open-issue queue per `_shared/record-queue-fetch.md`, same as `refine-mode.md`'s priority/Related fetch (`{tmp-records-file}` = `/tmp/backlog-overview-open.json`, `{tmp-faceted-file}` = `/tmp/backlog-overview-faceted.json`, `{EXTRA_FIELDS}` = `,body` — explicitly restated here, not just inherited by implication: Step 3 below needs every candidate's `body` for `rankNextToBuild`'s internal `parseDependencies` call, and without this field the fetch would silently omit bodies, making every candidate's unblocks-count silently compute as 0 rather than erroring). Fold in `unsynced: true` local fallback records the same way (port `review-backlog/SKILL.md`'s old Step 1 unsynced fold-in verbatim). Tag every fetched record with a **not yet synced** marker wherever `facets.unsynced === true` — this is a display-only tag in `overview` mode; the apply path for unsynced records' priority lives in `refine` mode (see this plan's correction note above).

## Step 2: Route by lens

```bash
node -e "
  const bl = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/backlog.js');
  const all = require('/tmp/backlog-overview-faceted.json');
  console.log(JSON.stringify({
    critical: bl.filterCritical(all),
    riskValue: bl.rankRiskValue(all),
    cleanup: bl.filterCleanup(all),
    split: bl.splitScoredUnscored(all),
  }));
" > /tmp/backlog-overview-views.json
```

**`critical`** — render `.critical` as a table (`| # | Record | Priority | Age |`), capped at `--budget` rows (default 20) with an overflow note. Note the excluded unscored count from `.split.unscored.length` ("N unscored records not risk-assessed yet — run bare mode for a judgment pass") — this signal existed in `review-backlog/SKILL.md`'s original `critical` rendering (its own Step 2) and was dropped from an earlier draft of this plan step by oversight; restore it, don't drop it. Skip to Step 4.

**`risk-value`** — render `.riskValue.ranked` as the primary ranked table, then `.riskValue.unscored` as a trailing "not yet scored" group, same capping. Add a `Tier` column reading `facets.ceremony` directly (`fast-lane`/`standard`), `—` for records scored before ceremony-tiering shipped. Skip to Step 4.

**`cleanup`** — render `.cleanup` as a table, grouped for a batch sweep, same capping. Skip to Step 4.

**Bare (no lens)** — render all three views above as a compact summary, then continue to Step 3.

## Step 3 (bare only): Recommend what to build next

Restricted to the buildable subset — `facets.stage === 'ready'` and (`facets.grants.build` or `facets.grants.merge`) — the same population `/help`'s Stage 1 "authorized" bucket already defines. For each candidate, compute the three inputs `ranking.js`'s `rankNextToBuild` needs but doesn't compute itself:

- `keyFiles` — extract the `### Key Files` subsection from the body, the same extraction `/help`'s Conflict detection sub-section already performs.
- `hasPlan` — `true` if `docs/superpowers/plans/` contains a file whose name references this record's id/slug (a simple filename-pattern check, not a content read).
- `body` — already present from Step 1's fetch (needed for `rankNextToBuild`'s internal `parseDependencies` call).

```bash
node -e "
  const { rankNextToBuild } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/ranking.js');
  const candidates = require('/tmp/backlog-overview-candidates.json'); // [{id, facets, body, keyFiles, hasPlan}]
  console.log(JSON.stringify(rankNextToBuild(candidates)));
" > /tmp/backlog-overview-ranked.json
```

Render the top result (and up to 2 runners-up) as a short "Recommended next" callout above the three-view summary, with a one-line rationale derived from which tie-break criterion decided it (e.g. "highest priority, unblocks 2 other records" or "lowest effort among same-priority candidates with no file overlap"). This section is scoped specifically to *which backlog/ready record deserves attention next* — it does not attempt to replace `/help`'s whole-pipeline status/recommendation role.

## Step 4: Hand-off block (contextual)

When a lens's output has a natural actionable batch, offer a stage-aware hand-off block as part of Next Actions rather than always rendering one:

- `ready` + `auto:build`-granted records → `/claude-tweaks:dispatch #N,#M,...`
- `backlog`-stage records to parallelize shaping on → a multi-terminal block, one `/claude-tweaks:specify #N` per column.
- A selection spanning both stages — split it by stage and render **both** blocks in the same Next Actions turn, never picking only one and silently dropping the other subset's records.

Port `review-backlog/SKILL.md`'s old Step 6 hand-off block rendering verbatim for the exact multi-terminal example format.
```

- [ ] **Step 3: Commit**

```bash
git add skills/backlog/overview-mode.md
git commit -m "Add skills/backlog/overview-mode.md — merged distribution views + recommend-next procedure"
```

---

### Task 8: Delete `skills/triage/` and `skills/review-backlog/`

**Files:**
- Delete: `skills/triage/` (entire directory: `SKILL.md`, `routine-template.yml` if present)
- Delete: `skills/review-backlog/` (entire directory: `SKILL.md`)

- [ ] **Step 1: Confirm the new skill is a faithful replacement before deleting**

Run: `ls skills/backlog/` — expect `SKILL.md`, `refine-mode.md`, `overview-mode.md` all present (Tasks 5-7 already committed).

- [ ] **Step 2: List and delete both directories**

```bash
ls skills/triage/ skills/review-backlog/
git rm -r skills/triage/ skills/review-backlog/
```

- [ ] **Step 3: Verify no other live file still requires them (a partial check — Tasks 9-15 do the full sweep)**

Run: `grep -rn "skills/triage/\|skills/review-backlog/" skills/ --include="*.md" --include="*.yml" | grep -v "^docs/"`
This is expected to still show matches — Tasks 9-15 haven't run yet. This step exists only to confirm the grep command itself works correctly before relying on its final, zero-match form in Task 17.

- [ ] **Step 4: Commit**

```bash
git commit -m "Delete skills/triage/ and skills/review-backlog/ — replaced by skills/backlog/"
```

---

### Task 9: Rename sweep — `_shared/` fragments

**Files:**
- Modify: `skills/_shared/github-pr-scan.md`, `skills/_shared/pipeline-run-dir.md`, `skills/_shared/auto-mode-contract.md`, `skills/_shared/auto-decision-log.md`, `skills/_shared/label-bootstrap.md`, `skills/_shared/issue-claims.md`, `skills/_shared/local-files-preflight-stop.md`

- [ ] **Step 1: Edit `skills/_shared/github-pr-scan.md`**

| Line (pre-edit) | Old text | New text |
|---|---|---|
| 81 | `matching \`/claude-tweaks:triage\` Step 1's own origin-agnostic \`ready\`-queue pull (\`skills/triage/SKILL.md\`), which no longer tiers any health-skill origin specially. This is a maintenance signal only — \`/tidy\` never grants authorization itself (\`/claude-tweaks:triage\` owns that).` | `matching \`/claude-tweaks:backlog refine\`'s own origin-agnostic \`ready\`-queue pull (\`skills/backlog/refine-mode.md\`), which no longer tiers any health-skill origin specially. This is a maintenance signal only — \`/tidy\` never grants authorization itself (\`/claude-tweaks:backlog refine\` owns that).` |
| 82 | `records that hit their retry ceiling and need a human's renewed judgment at \`/claude-tweaks:triage\` before re-entering the autonomous queue` | `records that hit their retry ceiling and need a human's renewed judgment at \`/claude-tweaks:backlog refine\` before re-entering the autonomous queue` |
| 98 | `Suggest \`/claude-tweaks:triage\` or Capture to backlog` | `Suggest \`/claude-tweaks:backlog refine\` or Capture to backlog` |
| 106 | `matches \`/claude-tweaks:triage\` Step 1's own \`ready\`-queue pull (\`skills/triage/SKILL.md\`), which tiers no health-skill origin specially` | `matches \`/claude-tweaks:backlog refine\`'s own \`ready\`-queue pull (\`skills/backlog/refine-mode.md\`), which tiers no health-skill origin specially` |
| 168 | `Code-health/harness-health/journey-health/docs-health issue still valid, awaiting \`/claude-tweaks:triage\`` | `Code-health/harness-health/journey-health/docs-health issue still valid, awaiting \`/claude-tweaks:backlog refine\`` |

- [ ] **Step 2: Edit `skills/_shared/pipeline-run-dir.md`**

Line 10's standalone-auto allowlist: replace `\`/claude-tweaks:dispatch\`, \`/claude-tweaks:triage\`, \`/claude-tweaks:review-backlog\`` with `\`/claude-tweaks:dispatch\`, \`/claude-tweaks:backlog\``.

- [ ] **Step 3: Edit `skills/_shared/auto-mode-contract.md`**

Line 87's identical allowlist phrase: replace `\`/claude-tweaks:dispatch\`, \`/claude-tweaks:triage\`, \`/claude-tweaks:review-backlog\`` with `\`/claude-tweaks:dispatch\`, \`/claude-tweaks:backlog\``.

- [ ] **Step 4: Edit `skills/_shared/auto-decision-log.md`**

Line 94's bare-form allowlist: replace `\`/tidy\`, \`/init\`, \`/capture\`, \`/dispatch\`, \`/triage\`, \`/review-backlog\`` with `\`/tidy\`, \`/init\`, \`/capture\`, \`/dispatch\`, \`/backlog\``.

- [ ] **Step 5: Edit `skills/_shared/label-bootstrap.md`**

Line 5's bare-form skill list: replace `health skills, \`/capture\`, \`/specify\`, \`/triage\`, \`/dispatch\`, \`/tidy\`,` with `health skills, \`/capture\`, \`/specify\`, \`/backlog\`, \`/dispatch\`, \`/tidy\`,`.

- [ ] **Step 6: Edit `skills/_shared/issue-claims.md`**

Line 207: replace `by \`/claude-tweaks:triage\`'s interactive invocation` with `by \`/claude-tweaks:backlog refine\`'s interactive invocation`.

- [ ] **Step 7: Edit `skills/_shared/local-files-preflight-stop.md`**

Line 6: replace `Referenced by \`/claude-tweaks:triage\` and \`/claude-tweaks:dispatch\`'s own` with `Referenced by \`/claude-tweaks:backlog\` (refine mode's grant sub-stage) and \`/claude-tweaks:dispatch\`'s own`.
Line 20: replace `\`/claude-tweaks:triage\`'s original Preflight said "report that grants are not applicable...` with `\`/claude-tweaks:triage\`'s original Preflight (now \`/claude-tweaks:backlog refine\`'s grant sub-stage) said "report that grants are not applicable...` — this line is narrating a past incident (why the canonical pattern was extracted), so keep the historical `/claude-tweaks:triage` name intact and only add the parenthetical pointing at its current location, rather than replacing it outright.

- [ ] **Step 8: Verify**

Run: `grep -rn "claude-tweaks:triage\|claude-tweaks:review-backlog" skills/_shared/github-pr-scan.md skills/_shared/pipeline-run-dir.md skills/_shared/auto-mode-contract.md skills/_shared/auto-decision-log.md skills/_shared/label-bootstrap.md skills/_shared/issue-claims.md skills/_shared/local-files-preflight-stop.md`
Expected: no matches, except the deliberately-preserved historical mention in `local-files-preflight-stop.md` line 20 (confirm that one line is the only surviving hit, if any).

- [ ] **Step 9: Commit**

```bash
git add skills/_shared/github-pr-scan.md skills/_shared/pipeline-run-dir.md skills/_shared/auto-mode-contract.md skills/_shared/auto-decision-log.md skills/_shared/label-bootstrap.md skills/_shared/issue-claims.md skills/_shared/local-files-preflight-stop.md
git commit -m "Rename sweep: _shared fragments now reference /claude-tweaks:backlog"
```

---

### Task 10: Rename sweep — dispatch, capture, specify, assess-agent-autonomy

**Files:**
- Modify: `skills/dispatch/SKILL.md`, `skills/dispatch/routine-template.yml`, `skills/dispatch/settle-and-merge.md`, `skills/capture/SKILL.md`, `skills/specify/SKILL.md`, `skills/specify/record-creation.md`, `skills/assess-agent-autonomy/SKILL.md`

- [ ] **Step 1: Edit `skills/dispatch/SKILL.md`**

| Line | Old text | New text |
|---|---|---|
| 19 | `                  /claude-tweaks:triage   (grants auto:build / auto:merge)` | `                  /claude-tweaks:backlog refine   (grants auto:build / auto:merge)` |
| 37 | `Not for: granting authorization (\`/claude-tweaks:triage\`'s job), deriving a spec, or building anything yourself.` | `Not for: granting authorization (\`/claude-tweaks:backlog refine\`'s job), deriving a spec, or building anything yourself.` |
| 314 | `for the same reason \`/claude-tweaks:triage\`'s own Concurrency section accepts its last-writer-wins label race` | `for the same reason \`/claude-tweaks:backlog refine\`'s own Concurrency section accepts its last-writer-wins label race` |
| 412 | `A cloud Routine created from \`/claude-tweaks:triage\`'s old template still fires \`triage dispatch\` — that workflow no longer exists (\`/claude-tweaks:triage\` is now the pure interactive gate; see Relationship below).` | `A cloud Routine created from \`/claude-tweaks:triage\`'s old template still fires \`triage dispatch\` — that skill no longer exists; grants now live at \`/claude-tweaks:backlog refine\` (see Relationship below).` — keep the first `/claude-tweaks:triage` mention (describing a pre-existing, possibly-still-live routine artifact from before this rename) intact; only the second clause changes. |
| 439 | `Dispatch is a *consumer* of what \`/claude-tweaks:triage\` already granted — filing belongs to the health skills/\`/claude-tweaks:capture\`, granting belongs to \`/claude-tweaks:triage\`.` | `Dispatch is a *consumer* of what \`/claude-tweaks:backlog refine\` already granted — filing belongs to the health skills/\`/claude-tweaks:capture\`, granting belongs to \`/claude-tweaks:backlog refine\`.` |
| 446-447 | Replace both Relationship-table rows (`/claude-tweaks:triage` and `/claude-tweaks:review-backlog`) with one row: `| \`/claude-tweaks:backlog\` | \`refine\` mode is the human gate upstream — grants \`auto:build\` (optionally \`+ auto:merge\`) that dispatch selects on, and is the only mode that ever suggests a \`priority:*\` value (human-confirmed) dispatch's \`next\` form consumes for tie-break ordering. Dispatch never grants; it only strips or downgrades a grant on failure or at the retry ceiling. \`refine\` never claims or dispatches. |` | |
| 459 | `added after the identical weaker phrasing was proven insufficient in \`/claude-tweaks:triage\`'s own Preflight.` | `added after the identical weaker phrasing was proven insufficient in \`/claude-tweaks:triage\`'s own Preflight (now \`/claude-tweaks:backlog refine\`'s grant sub-stage).` — historical-incident line, same treatment as Task 9 Step 7. |

- [ ] **Step 2: Edit `skills/dispatch/routine-template.yml`**

| Line | Old text | New text |
|---|---|---|
| 1-2 | `# Migration note: a Routine created from /claude-tweaks:triage's old template still` / `# fires "triage dispatch", a workflow that no longer exists. Re-create it via` | `# Migration note: a Routine created from /claude-tweaks:triage's old template still` / `# fires "triage dispatch", a skill that no longer exists (grants now live at` / `# /claude-tweaks:backlog refine). Re-create it via` — keep the historical `/claude-tweaks:triage` reference (describing what an OLD routine artifact fires), add the pointer to where grants live now. |
| 33 | `bot:blocked is added, and the record stops auto-retrying. Only /claude-tweaks:triage's` | `bot:blocked is added, and the record stops auto-retrying. Only /claude-tweaks:backlog refine's` |
| 40 | `still has to run bare \`/claude-tweaks:triage\` periodically to grant auto:build before` | `still has to run \`/claude-tweaks:backlog refine\` periodically to grant auto:build before` |

- [ ] **Step 3: Edit `skills/dispatch/settle-and-merge.md`**

Line 62: replace `until a human re-grants it at \`/claude-tweaks:triage\`` with `until a human re-grants it at \`/claude-tweaks:backlog refine\``.

- [ ] **Step 4: Edit `skills/capture/SKILL.md`**

| Line | Old text | New text |
|---|---|---|
| 263 | `| \`/claude-tweaks:triage\` | Records this skill files reach triage's worklist only after \`/claude-tweaks:specify\` shapes them to \`ready\` — the reciprocal of triage/SKILL.md's own Feeder row for \`/claude-tweaks:capture\` |` | `| \`/claude-tweaks:backlog\` | Records this skill files reach \`refine\` mode's grant worklist only after \`/claude-tweaks:specify\` shapes them to \`ready\`; \`overview\` mode surveys and prioritizes them — the reciprocal of \`backlog/SKILL.md\`'s own Feeder row for \`/claude-tweaks:capture\` |` |
| 264 | `| \`/claude-tweaks:review-backlog\` | Consumes and enriches the \`**Related:**\` field this skill's Entry Format stamps — review-backlog is the only skill that suggests values for it, always human-confirmed. |` | Delete this row entirely — merged into the single `/claude-tweaks:backlog` row above (it already covers `refine` mode's priority/Related sweep). |

- [ ] **Step 5: Edit `skills/specify/SKILL.md`**

| Line | Old text | New text |
|---|---|---|
| 207 | `those stay \`/triage\`'s (human-granted authorization) and \`/dispatch\`'s (bot-state mirror) territory.` | `those stay \`/backlog refine\`'s (human-granted authorization) and \`/dispatch\`'s (bot-state mirror) territory.` |
| 372 | `Also reused by \`/claude-tweaks:triage dispatch\` to group claimed issues before parallel execution (see \`triage/SKILL.md\`).` | Delete this sentence entirely — `triage dispatch` is a retired sub-command (per `dispatch/SKILL.md`'s own migration note, claiming now belongs to `/claude-tweaks:dispatch`, not this skill), so the claim is already stale independent of this rename; don't perpetuate it under the new name. |
| 556 | `Authorization is human-granted only (\`/triage\`'s territory)` | `Authorization is human-granted only (\`/backlog refine\`'s territory)` |
| 571 | `| \`/claude-tweaks:review-backlog\` | Upstream hand-off source — a backlog record review-backlog surfaced (priority suggested, possibly cross-referenced via \`**Related:**\`) still needs \`/specify\` to stamp \`risk:*\`/\`effort:*\` and reach \`ready\`. Review-backlog never shapes bodies or scores itself. |` | `| \`/claude-tweaks:backlog\` | Upstream hand-off source — a backlog record \`overview\` mode surfaced (priority suggested by \`refine\` mode, possibly cross-referenced via \`**Related:**\`) still needs \`/specify\` to stamp \`risk:*\`/\`effort:*\` and reach \`ready\`. This skill never shapes bodies or scores itself. |` |
| 573 | `| \`/claude-tweaks:triage\` | Downstream gate — \`/specify\` is "the shaper" triage names: stamping \`ready\` + scoring is what admits a record into triage's worklist, and a record triage flags back for missing/empty spec-shaped fields returns here (\`/claude-tweaks:specify #{n}\`) for re-shaping. |` | Merge into the row above — delete this row, and fold its content into the single `/claude-tweaks:backlog` row from line 571: `| \`/claude-tweaks:backlog\` | Upstream hand-off source (\`overview\` mode surfaces priority-suggested records) and downstream gate (\`/specify\` is "the shaper" \`refine\` mode names: stamping \`ready\` + scoring is what admits a record into its grant worklist, and a record \`refine\` flags back for missing/empty spec-shaped fields returns here via \`/claude-tweaks:specify #{n}\` for re-shaping). |` |

- [ ] **Step 6: Edit `skills/specify/record-creation.md`**

Line 217: replace `The sole exception is \`/claude-tweaks:review-backlog\`, which may write \`priority:*\`` with `The sole exception is \`/claude-tweaks:backlog\`'s \`refine\` mode, which may write \`priority:*\``.

- [ ] **Step 7: Edit `skills/assess-agent-autonomy/SKILL.md`** (10 occurrences)

Every occurrence of `/claude-tweaks:triage` in this file describes the `grant-check` caller relationship — replace all 10 with `/claude-tweaks:backlog refine` (lines 12, 16, 24, 32, 62, 68, 109, 135, 394, 416). Two need slightly more than a bare swap:
- Line 16 (`/claude-tweaks:triage Step 2          [ grant-check ]    -> RECOMMEND_BUILD / RECOMMEND_MERGE`, an ASCII-diagram line): becomes `/claude-tweaks:backlog refine        [ grant-check ]    -> RECOMMEND_BUILD / RECOMMEND_MERGE` (re-pad the spacing so the diagram's `->` column still aligns with its neighbors — check the surrounding lines in the same diagram block for the correct column position).
- Line 68 (`**Called from:** \`/claude-tweaks:triage\`'s Step 2, once per worklist record, every triage session`): becomes `**Called from:** \`/claude-tweaks:backlog refine\`'s grant-check pass, once per worklist record, every refine run`.
- Line 109 (`\`/claude-tweaks:triage\`'s own Step 3.5 body-shape re-verification, which runs after this mode`): becomes `\`/claude-tweaks:backlog refine\`'s own Step 3.5 body-shape re-verification, which runs after this mode`.
- Line 416 (`| \`/claude-tweaks:triage\` | Calls \`grant-check\` once per worklist record in Step 2 — the output becomes the batch table's Recommended column directly. Triage still renders the human batch-confirm exactly as before; only what generates the suggestion changed. |`): becomes `| \`/claude-tweaks:backlog\` | \`refine\` mode calls \`grant-check\` once per worklist record — the output becomes the unified table's Recommended column for grant rows directly. \`refine\` still renders the human batch-confirm exactly as before; only what generates the suggestion changed. |`

- [ ] **Step 8: Verify**

Run: `grep -rln "claude-tweaks:triage\|claude-tweaks:review-backlog" skills/dispatch/ skills/capture/SKILL.md skills/specify/ skills/assess-agent-autonomy/`
Expected: no matches, except `skills/dispatch/SKILL.md` line 412 and `skills/dispatch/routine-template.yml` lines 1-2 (the two deliberately-preserved historical/migration-note mentions from Steps 1 and 2 above — confirm exactly those survive and nothing else does).

- [ ] **Step 9: Commit**

```bash
git add skills/dispatch/ skills/capture/SKILL.md skills/specify/ skills/assess-agent-autonomy/SKILL.md
git commit -m "Rename sweep: dispatch, capture, specify, assess-agent-autonomy now reference /claude-tweaks:backlog"
```

---

### Task 11: Rename sweep — health-skill family + demo + init

**Files:**
- Modify: `skills/code-health/SKILL.md`, `skills/code-health/routine-template.yml`, `skills/harness-health/SKILL.md`, `skills/harness-health/routine-template.yml`, `skills/journey-health/SKILL.md`, `skills/docs-health/SKILL.md`, `skills/docs-health/routine-template.yml`, `skills/demo/SKILL.md`, `skills/init/SKILL.md`, `skills/init/bootstrap-steps.md`

- [ ] **Step 1: Edit `skills/code-health/SKILL.md`**

Line 416: replace `still-valid ones are suggested for \`/claude-tweaks:triage\` or captured to the backlog.` with `still-valid ones are suggested for \`/claude-tweaks:backlog refine\` or captured to the backlog.`
Line 417: replace `Triage's bare invocation is the primary consumer of code-health's \`risk:<tier>\`/\`effort:<tier>\` labels — Step 2's \`grant-check\`` with `\`refine\` mode's grant sub-stage is the primary consumer of code-health's \`risk:<tier>\`/\`effort:<tier>\` labels — its \`grant-check\`` (rest of the sentence unchanged).

- [ ] **Step 2: Edit `skills/code-health/routine-template.yml`**

Line 30: replace `bare \`/claude-tweaks:triage\` to actually authorize (grant auto:build/auto:merge)` with `\`/claude-tweaks:backlog refine\` to actually authorize (grant auto:build/auto:merge)`.

- [ ] **Step 3: Edit `skills/harness-health/SKILL.md`**

Line 280: replace `\`/claude-tweaks:assess-agent-autonomy\`'s \`grant-check\` mode (invoked from triage's Step 2)` with `\`/claude-tweaks:assess-agent-autonomy\`'s \`grant-check\` mode (invoked from \`refine\` mode's grant sub-stage)`. The rest of the line ("Triage never files or closes harness-health issues") becomes "\`/claude-tweaks:backlog\` never files or closes harness-health issues."

- [ ] **Step 4: Edit `skills/harness-health/routine-template.yml`**

Line 30: replace `\`/claude-tweaks:triage\` (or schedule a triage-adjacent routine) to tier them.` with `\`/claude-tweaks:backlog refine\` (or schedule a backlog-adjacent routine) to tier them.`

- [ ] **Step 5: Edit `skills/journey-health/SKILL.md`**

Line 11: replace `by \`/claude-tweaks:dispatch\` → \`/claude-tweaks:flow\` once \`/claude-tweaks:triage\` has granted \`auto:build\`.` with `by \`/claude-tweaks:dispatch\` → \`/claude-tweaks:flow\` once \`/claude-tweaks:backlog refine\` has granted \`auto:build\`.`
Line 300: identical replacement (same phrase repeated).
Line 325: replace `| \`/claude-tweaks:triage\` | Filed \`by:journey-health\` issues resolve the same way \`by:code-health\`/\`by:harness-health\` issues already do: \`/claude-tweaks:triage\` grants \`auto:build\`, then \`/claude-tweaks:dispatch\` claims and hands off to \`/claude-tweaks:flow\` — or a human builds them manually (\`triage dispatch\`, the old sub-command this once described, no longer exists). Per the intro, records are not a separate lane. |` with `| \`/claude-tweaks:backlog\` | Filed \`by:journey-health\` issues resolve the same way \`by:code-health\`/\`by:harness-health\` issues already do: \`refine\` mode grants \`auto:build\`, then \`/claude-tweaks:dispatch\` claims and hands off to \`/claude-tweaks:flow\` — or a human builds them manually. Per the intro, records are not a separate lane. |`

- [ ] **Step 6: Edit `skills/docs-health/SKILL.md`**

Line 315: replace `| \`/claude-tweaks:triage\` | The human gate over the \`ready\` queue — records docs-health files feed into triage's worklist the same way code-health/harness-health findings do. |` with `| \`/claude-tweaks:backlog\` | \`refine\` mode is the human gate over the \`ready\` queue — records docs-health files feed into its grant worklist the same way code-health/harness-health findings do. |`

- [ ] **Step 7: Edit `skills/docs-health/routine-template.yml`**

Line 28: replace `periodically run bare \`/claude-tweaks:triage\` (or schedule a triage-adjacent routine)` with `periodically run \`/claude-tweaks:backlog refine\` (or schedule a backlog-adjacent routine)`.

- [ ] **Step 8: Edit `skills/demo/SKILL.md`**

Line 253: replace `\`description\`: \`"/claude-tweaks:triage — the new gap record needs shaping/authorization like any other backlog item"\`` with `\`description\`: \`"/claude-tweaks:backlog refine — the new gap record needs shaping/authorization like any other backlog item"\``.

- [ ] **Step 9: Edit `skills/init/SKILL.md`**

Line 141: replace `used by \`/claude-tweaks:capture\`, \`/claude-tweaks:specify\`, \`/claude-tweaks:triage\`, \`/claude-tweaks:dispatch\`, \`/claude-tweaks:tidy\`,` with `used by \`/claude-tweaks:capture\`, \`/claude-tweaks:specify\`, \`/claude-tweaks:backlog\`, \`/claude-tweaks:dispatch\`, \`/claude-tweaks:tidy\`,`.

- [ ] **Step 10: Edit `skills/init/bootstrap-steps.md`**

| Line | Old text | New text |
|---|---|---|
| 248 | `` `/claude-tweaks:triage`'s gate re-verifies before granting authorization and`` | `` `/claude-tweaks:backlog refine`'s gate re-verifies before granting authorization and`` |
| 762 | `` `/claude-tweaks:capture`, `/claude-tweaks:specify`, `/claude-tweaks:triage`,`` | `` `/claude-tweaks:capture`, `/claude-tweaks:specify`, `/claude-tweaks:backlog`,`` |
| 781 | `works with \`/claude-tweaks:triage\` for` | `works with \`/claude-tweaks:backlog refine\` for` |
| 795 | `everything /claude-tweaks:triage, /claude-tweaks:dispatch, and /claude-tweaks:tidy act on)` | `everything /claude-tweaks:backlog, /claude-tweaks:dispatch, and /claude-tweaks:tidy act on)` |
| 796 | `Filterable, visible outside the repo, works with /claude-tweaks:triage for authorization and headless dispatch.` | `Filterable, visible outside the repo, works with /claude-tweaks:backlog refine for authorization and headless dispatch.` |

- [ ] **Step 11: Verify**

Run: `grep -rln "claude-tweaks:triage\|claude-tweaks:review-backlog" skills/code-health/ skills/harness-health/ skills/journey-health/ skills/docs-health/ skills/demo/SKILL.md skills/init/SKILL.md skills/init/bootstrap-steps.md`
Expected: no matches.

- [ ] **Step 12: Commit**

```bash
git add skills/code-health/ skills/harness-health/ skills/journey-health/ skills/docs-health/ skills/demo/SKILL.md skills/init/SKILL.md skills/init/bootstrap-steps.md
git commit -m "Rename sweep: health-skill family, demo, init now reference /claude-tweaks:backlog"
```

---

### Task 12: Rename sweep — `/tidy`

**Files:**
- Modify: `skills/tidy/SKILL.md`, `skills/tidy/scan-procedures.md`

- [ ] **Step 1: Edit `skills/tidy/SKILL.md`**

| Line | Old text | New text |
|---|---|---|
| 148 | `recommends \`/claude-tweaks:triage\`) | Auto (no-op, always surfaced)` | `recommends \`/claude-tweaks:backlog refine\`) | Auto (no-op, always surfaced)` |
| 211 | `\| 8 \| Blocked \| "{title}" (bot:blocked) \| Re-triage — /claude-tweaks:triage \|` | `\| 8 \| Blocked \| "{title}" (bot:blocked) \| Re-triage — /claude-tweaks:backlog refine \|` |
| 233 | `- \`bot:blocked\`: {N} — needs \`/claude-tweaks:triage\`` | `- \`bot:blocked\`: {N} — needs \`/claude-tweaks:backlog refine\`` |
| 314 | `- Option 4 — \`label\`: \`"Triage the queue"\`, \`description\`: \`"/claude-tweaks:triage — authorize any ready-but-unscored or bot:blocked records the audit surfaced"\`` | `- Option 4 — \`label\`: \`"Refine the queue"\`, \`description\`: \`"/claude-tweaks:backlog refine — authorize any ready-but-unscored or bot:blocked records the audit surfaced"\`` |
| 340 | `before \`/claude-tweaks:triage\` has to flag it back reactively.` | `before \`/claude-tweaks:backlog refine\` has to flag it back reactively.` |
| 356 | `still-valid ones suggested for \`/claude-tweaks:triage\`. \|` | `still-valid ones suggested for \`/claude-tweaks:backlog refine\`. \|` |
| 357 | `still-valid ones suggested for \`/claude-tweaks:triage\` or direct application. \|` | `still-valid ones suggested for \`/claude-tweaks:backlog refine\` or direct application. \|` |
| 358 | `still-valid ones suggested for \`/claude-tweaks:triage\`. \|` (journey-health row) | `still-valid ones suggested for \`/claude-tweaks:backlog refine\`. \|` |
| 359 | `still-valid ones suggested for \`/claude-tweaks:triage\`. \|` (docs-health row) | `still-valid ones suggested for \`/claude-tweaks:backlog refine\`. \|` |
| 361 | `\| \`/claude-tweaks:triage\` \| Reciprocal gate relationship: \`/tidy\`'s Step 1 record scan surfaces \`bot:blocked\` records (Shape 5) and \`ready\`-but-unscored records (Shape 4) as candidates for \`/claude-tweaks:triage\`'s worklist, and its Step 4.8 pending-authorization count (per \`_shared/github-pr-scan.md\`'s \`repo-wide\` scope) surfaces in the rolling digest. \`/tidy\` never grants authorization itself — that stays \`/claude-tweaks:triage\`'s job. Migration note: pre-6.0 records still carrying retired \`tier:*\`/\`status:*\`/\`backlog\` labels surface via \`/tidy\`'s legacy-taxonomy finding (Shape 7), not through the gate — see \`triage/SKILL.md\`'s own Relationship row for the reciprocal note. \|` | `\| \`/claude-tweaks:backlog\` \| Reciprocal gate relationship: \`/tidy\`'s Step 1 record scan surfaces \`bot:blocked\` records (Shape 5) and \`ready\`-but-unscored records (Shape 4) as candidates for \`refine\` mode's grant worklist, and its Step 4.8 pending-authorization count (per \`_shared/github-pr-scan.md\`'s \`repo-wide\` scope) surfaces in the rolling digest. \`overview\` mode folds \`unsynced: true\` local fallback records into its survey (surfacing, and — for the priority axis — \`refine\` mode's apply path — never fixing the sync state itself). \`/tidy\` never grants authorization itself — that stays \`refine\` mode's job. Migration note: pre-6.0 records still carrying retired \`tier:*\`/\`status:*\`/\`backlog\` labels surface via \`/tidy\`'s legacy-taxonomy finding (Shape 7), not through the gate — see \`backlog/SKILL.md\`'s own Relationship row for the reciprocal note. \|` (this also absorbs line 362's old `/claude-tweaks:review-backlog` row — delete line 362 separately below, its content is now folded in here). |
| 362 | `\| \`/claude-tweaks:review-backlog\` \| Reciprocal: review-backlog folds \`unsynced: true\` local fallback records into its survey (surfacing, never fixing them) — \`/tidy\`'s existing Shape 3 (Step 1) owns the actual sync action. \|` | Delete this row — its content is folded into the merged row above. |

- [ ] **Step 2: Edit `skills/tidy/scan-procedures.md`**

| Line | Old text | New text |
|---|---|---|
| 75 | `\`/claude-tweaks:triage\`'s own Step 2 would flag the identical gap reactively when it next pulls the \`ready\` queue; this surfaces it proactively during hygiene instead of waiting for a triage run.` | `\`/claude-tweaks:backlog refine\`'s own grant sub-stage would flag the identical gap reactively when it next pulls the \`ready\` queue; this surfaces it proactively during hygiene instead of waiting for a refine run.` |
| 81 | `needs a human's renewed judgment at \`/claude-tweaks:triage\` before it can re-enter the autonomous queue.` | `needs a human's renewed judgment at \`/claude-tweaks:backlog refine\` before it can re-enter the autonomous queue.` |
| 83 | `` → Collect each as: `[blocked] {title} — hit its retry ceiling — re-authorize at /claude-tweaks:triage` `` | `` → Collect each as: `[blocked] {title} — hit its retry ceiling — re-authorize at /claude-tweaks:backlog refine` `` |
| 91 | `\`/claude-tweaks:triage\` only ever reads/writes the current seven-axis vocabulary (see its own Relationship table)` | `\`/claude-tweaks:backlog\` only ever reads/writes the current seven-axis vocabulary (see its own Relationship table)` |
| 256-257 | `this includes the human-gate skills' runs (\`/claude-tweaks:triage\`,` / `` `/claude-tweaks:dispatch`, `/claude-tweaks:review-backlog`), but also `/tidy`'s own past`` | `this includes the human-gate skills' runs (\`/claude-tweaks:backlog\`,` / `` `/claude-tweaks:dispatch`), but also `/tidy`'s own past`` |
| 276 | `` (legitimate — e.g. a `/triage` session where every row was flagged back). File`` | `` (legitimate — e.g. a `/backlog refine` session where every row was flagged back). File`` |
| 286 | `still-valid ones → suggested \`/claude-tweaks:triage\` run when still valid` | `still-valid ones → suggested \`/claude-tweaks:backlog refine\` run when still valid` |

- [ ] **Step 3: Verify**

Run: `grep -n "claude-tweaks:triage\|claude-tweaks:review-backlog" skills/tidy/SKILL.md skills/tidy/scan-procedures.md`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add skills/tidy/SKILL.md skills/tidy/scan-procedures.md
git commit -m "Rename sweep: /tidy now references /claude-tweaks:backlog"
```

---

### Task 13: Rename sweep — `/help` + `/flow`

**Files:**
- Modify: `skills/help/SKILL.md`, `skills/help/status-scan.md`, `skills/help/reference-card.md`, `skills/help/context-flow.md`, `skills/flow/SKILL.md`, `skills/flow/steps-and-gates.md`

- [ ] **Step 1: Edit `skills/help/SKILL.md`**

Line 74: replace `recommend \`/claude-tweaks:triage\` to review and grant \`auto:build\`` with `recommend \`/claude-tweaks:backlog refine\` to review and grant \`auto:build\``.
Lines 138-139: replace both rows with one merged row: `| \`/claude-tweaks:backlog\` | Surfaces pending-authorization count, \`bot:blocked\` count, and rolling auto-merge count on the dashboard (Stage 4.6, \`triage-queue\` scope) — the reciprocal of \`backlog/SKILL.md\`'s own \`/claude-tweaks:help\` row. Shares \`bin/lib/issues/ranking.js\`'s \`rankNextToBuild\` with \`overview\` mode's recommendation section. |`

- [ ] **Step 2: Edit `skills/help/status-scan.md`**

Line 122: replace `Cheap counts only — detail stays \`/claude-tweaks:triage\`'s and \`/tidy\`'s job,` with `Cheap counts only — detail stays \`/claude-tweaks:backlog\`'s and \`/tidy\`'s job,`.
Line 126: replace `matching \`/claude-tweaks:triage\` Step 1's own origin-agnostic \`ready\`-queue pull, which tiers no health-skill origin specially.` with `matching \`/claude-tweaks:backlog refine\`'s own origin-agnostic \`ready\`-queue pull, which tiers no health-skill origin specially.`
Line 176: replace `` \`/claude-tweaks:triage\` to review and grant`` with `` \`/claude-tweaks:backlog refine\` to review and grant``.
Line 179: replace `` \`/claude-tweaks:triage\` to re-authorize`` with `` \`/claude-tweaks:backlog refine\` to re-authorize``.
Line 196: replace `` run \`/claude-tweaks:triage\` (omit this line when N is 0)`` with `` run \`/claude-tweaks:backlog refine\` (omit this line when N is 0)``.
Line 197: replace `` run \`/claude-tweaks:triage\` to review (omit this line when N is 0)`` with `` run \`/claude-tweaks:backlog refine\` to review (omit this line when N is 0)``.

- [ ] **Step 3: Edit `skills/help/reference-card.md`**

Lines 40-41: replace both Utility-table rows with one merged row: `| \`/claude-tweaks:backlog\` | Two modes over the open backlog: \`refine\` ensures every record has the right priority/Related/grant labels (a write sweep, human-confirmed); \`overview\` renders a distribution picture and recommends what to build next (read-only). | \`[refine\\|overview] [critical\\|risk-value\\|cleanup] [--budget <n>] [--origin <origin>]\` |`

- [ ] **Step 4: Edit `skills/help/context-flow.md`**

Line 18: replace `/claude-tweaks:triage    /claude-tweaks:dispatch` (in the ASCII flow diagram) with `/claude-tweaks:backlog   /claude-tweaks:dispatch` — check the surrounding diagram's column alignment and re-pad if needed.
Line 33: replace `two utility skills act on the record with no fixed lifecycle position of their own — \`/claude-tweaks:triage\` (grants \`auto:build\`/\`auto:merge\`) and \`/claude-tweaks:dispatch\`` with `two utility skills act on the record with no fixed lifecycle position of their own — \`/claude-tweaks:backlog\` (\`refine\` mode grants \`auto:build\`/\`auto:merge\`) and \`/claude-tweaks:dispatch\``.
Line 57: replace `| \`/claude-tweaks:triage\` | Open work records carrying \`ready\` with no \`auto:*\` grant yet (the authorization worklist) | \`auto:build\`/\`auto:merge\` labels (human-granted only); strips \`bot:blocked\` on re-authorization; removes \`ready\` and comments when flagging an unshaped record back | — |` with `| \`/claude-tweaks:backlog refine\` | Open work records carrying \`ready\` with no \`auto:*\` grant yet (the authorization worklist) | \`auto:build\`/\`auto:merge\` labels (human-granted only); strips \`bot:blocked\` on re-authorization; removes \`ready\` and comments when flagging an unshaped record back | — |`

- [ ] **Step 5: Edit `skills/flow/SKILL.md`**

Lines 358-359: replace both rows with one merged treatment — row 358 becomes `| \`/claude-tweaks:backlog\` | \`refine\` mode is the human gate upstream of \`/claude-tweaks:dispatch\` — grants \`auto:build\`/\`auto:merge\` on records \`/flow\` may later build. It itself never invokes \`/flow\`, and never selects, filters, sorts, or claims records. |`; row 359's internal `/claude-tweaks:triage\` (authorization)` mention becomes `/claude-tweaks:backlog refine\` (authorization)`.

- [ ] **Step 6: Edit `skills/flow/steps-and-gates.md`**

Line 76: replace `` `/claude-tweaks:triage` (authorization) for that logic.`` with `` `/claude-tweaks:backlog refine` (authorization) for that logic.``

- [ ] **Step 7: Verify**

Run: `grep -n "claude-tweaks:triage\|claude-tweaks:review-backlog" skills/help/SKILL.md skills/help/status-scan.md skills/help/reference-card.md skills/help/context-flow.md skills/flow/SKILL.md skills/flow/steps-and-gates.md`
Expected: no matches.

- [ ] **Step 8: Commit**

```bash
git add skills/help/ skills/flow/SKILL.md skills/flow/steps-and-gates.md
git commit -m "Rename sweep: /help and /flow now reference /claude-tweaks:backlog"
```

---

### Task 14: Rename sweep — README.md + CLAUDE.md

**Files:**
- Modify: `README.md`, `CLAUDE.md`

- [ ] **Step 1: Edit `README.md`**

Line 38: replace `/claude-tweaks:triage grants, /claude-tweaks:dispatch claims (utility skills, no fixed position)` with `/claude-tweaks:backlog refine grants, /claude-tweaks:dispatch claims (utility skills, no fixed position)`.
Line 93: replace `` `/claude-tweaks:triage` is the interactive gate that grants this — machinery can only strip or downgrade a grant, never originate one.`` with `` `/claude-tweaks:backlog refine` is the interactive gate that grants this — machinery can only strip or downgrade a grant, never originate one.``
Line 104: replace `` `/claude-tweaks:triage`'s grants are recorded but have no headless consumer`` with `` `/claude-tweaks:backlog refine`'s grants are recorded but have no headless consumer``

Additionally, in `README.md`'s skill-reference paragraphs (the `**\`/claude-tweaks:triage\`**` and `**\`/claude-tweaks:review-backlog\`**` paragraphs — check for these by searching `README.md` for `**\`/claude-tweaks:triage\`**`; if present, replace both paragraphs with one merged `**\`/claude-tweaks:backlog\`**` paragraph combining their content, mirroring `docs/getting-started.md`'s two paragraphs — see Task 15's equivalent edit to that file for the exact merged wording to reuse here).

- [ ] **Step 2: Edit `CLAUDE.md`**

Line 23 (the `_shared/*.md` file-purpose description): replace `label-bootstrap (canonical check-then-create snippet for GitHub label bootstrapping, referenced by capture/specify/triage/dispatch/tidy/wrap-up/init/code-health/harness-health/journey-health/docs-health/flow/demo/review-backlog)` with `label-bootstrap (canonical check-then-create snippet for GitHub label bootstrapping, referenced by capture/specify/backlog/dispatch/tidy/wrap-up/init/code-health/harness-health/journey-health/docs-health/flow/demo)`. Same line, later in the same file-purpose description: replace `local-files-preflight-stop (canonical "stop this turn completely" boundary-language pattern for a skill's Preflight under work-backend: local-files, referenced by triage and dispatch)` with `local-files-preflight-stop (canonical "stop this turn completely" boundary-language pattern for a skill's Preflight under work-backend: local-files, referenced by backlog's refine-mode grant sub-stage and dispatch)`.

Line 35: replace `### Skill directories (33 total)` with `### Skill directories (32 total)`.

Line 39: replace `**Utility:** help, tidy, flow, browse, ledger, version, research, code-health, routine, harness-health, journey-health, docs-health, triage, dispatch, demo, review-backlog` with `**Utility:** help, tidy, flow, browse, ledger, version, research, code-health, routine, harness-health, journey-health, docs-health, backlog, dispatch, demo`.

Line 62 (the skill sub-files table's `help` row): replace `pipeline status scan parallel-dispatch procedure (Stages 1-7 — the former Stage 1.5/3/4 INBOX/Deferred-Work/spec-index scans merged into Stage 1's single work-record query — incl. sub-stages 4.5/4.6, current-PR scan, and triage-queue counts)` with the same text but `triage-queue counts` becomes `backlog-refine-queue counts` — wait, verify against `_shared/github-pr-scan.md`'s actual scope name after Task 9: the scope identifier itself (`triage-queue`) is a `github-pr-scan.md`-internal name, not a command reference — check whether Task 9 renamed the scope identifier itself or only prose describing it. **Do not rename the `triage-queue` scope identifier string** (it's an internal scope key referenced by exact string match in `_shared/github-pr-scan.md` and `skills/help/status-scan.md`'s own dispatcher-inlining code — renaming it would require updating every literal string match, out of scope for this plan since it carries no user-facing command reference). Leave line 62 as-is — this is a false positive from the original grep, not an actual command rename.

Line 111 (`argument-hint` example — established in this session's research as **factually wrong today regardless of this merge**, since every one of the 33 (now 32) skills declares a non-empty `argument-hint`): replace `omit only for the rare skill that takes no arguments at all (e.g. \`/claude-tweaks:triage\`)` with `omit only for a skill that genuinely takes no arguments at all — none currently do (every skill in this plugin declares a non-empty \`argument-hint\`), but the convention still applies if one is ever added`.

Line 250 — **do not edit**. This is a "Lessons learned" narrative entry describing a past incident during `/review-backlog`'s original build, not a live cross-reference — same historical character as `docs/superpowers/plans/*.md`, per this session's research.

- [ ] **Step 3: Verify**

Run: `grep -n "claude-tweaks:triage\|claude-tweaks:review-backlog" README.md CLAUDE.md`
Expected: for `CLAUDE.md`, only line 250 (the deliberately-preserved historical narrative entry) survives. For `README.md`, no matches at all.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "Rename sweep: README.md and CLAUDE.md now reference /claude-tweaks:backlog"
```

---

### Task 15: Rename sweep — `docs/getting-started.md` + evals

**Files:**
- Modify: `docs/getting-started.md`, `evals/README.md`
- Rename + modify: `evals/scenarios/triage-permission-matrix-compliance.yaml` → `evals/scenarios/backlog-refine-permission-matrix-compliance.yaml`

- [ ] **Step 1: Edit `docs/getting-started.md`**

Line 100: replace `Any records code-health files feed into \`/claude-tweaks:triage\`'s \`ready\` queue, which grants \`auto:build\`/\`auto:merge\` for autonomous building;` with `Any records code-health files feed into \`/claude-tweaks:backlog refine\`'s \`ready\` queue, which grants \`auto:build\`/\`auto:merge\` for autonomous building;`.

Lines 102 and 104 (the two full skill-reference paragraphs for `/claude-tweaks:triage` and `/claude-tweaks:review-backlog`) — replace both paragraphs with one merged paragraph:

```markdown
**`/claude-tweaks:backlog`** — Two modes over the open work-record backlog. `refine` ensures every record carries the right `priority:*`/`**Related:**`/grant labels: pulls ungranted `ready` records, gets a content-aware recommendation from `/claude-tweaks:assess-agent-autonomy`'s `grant-check` mode (reads the record's actual body, not just its risk/effort labels), re-verifies spec shape before granting (a `ready` label alone never authorizes — the gate re-fetches the body), and — together with a bounded LLM synthesis pass over unscored records producing `priority:*` suggestions and detected `**Related:**` cross-references — applies everything after a single unified batch confirm. A record that hit its retry ceiling (`bot:blocked`) surfaces as a re-authorization candidate. `overview` is read-only: mechanical label filtering (`critical`/`risk-value`/`cleanup` lenses) over already-scored records at any backlog scale, plus a "what to build next" recommendation. Neither mode claims, builds, or dispatches anything itself.
```

Line 106: replace `(e.g. handed off by \`/claude-tweaks:triage\`'s Next Actions after a grant)` with `(e.g. handed off by \`/claude-tweaks:backlog refine\`'s Next Actions after a grant)`; and `only \`/claude-tweaks:triage\` grants` with `only \`/claude-tweaks:backlog refine\` grants`.

Line 108: replace `(2026-07-11 audit of the pre-unification system — 5 high-severity and 18 medium-severity findings, prioritized)` — **do not edit this parenthetical's description of the audit's own historical scope**; it correctly describes what the linked, unedited `docs/github-issues-integration-review.md` covers. No change needed on this line.

- [ ] **Step 2: Edit `evals/README.md`** (prose only, no functional impact)

Line 149: replace `\`/claude-tweaks:triage\` correctly report grants as not-applicable and stop` and the trailing `a fix (\`skills/triage/SKILL.md\`) verified` with `\`/claude-tweaks:backlog\`'s \`refine\` mode correctly report grants as not-applicable and stop` and `a fix (\`skills/backlog/refine-mode.md\`) verified`.
Line 150: replace `the identical Preflight phrasing was found insufficient in \`/claude-tweaks:triage\`` with `the identical Preflight phrasing was found insufficient in \`/claude-tweaks:triage\` (now \`/claude-tweaks:backlog refine\`)` — historical-incident phrasing, same treatment as prior tasks' incident lines.

Also rename the table's scenario-name cell on line 149 from `` `triage-permission-matrix-compliance` `` to `` `backlog-refine-permission-matrix-compliance` `` (matching Step 3's file rename below).

- [ ] **Step 3: Rename and update the eval scenario file**

```bash
git mv evals/scenarios/triage-permission-matrix-compliance.yaml evals/scenarios/backlog-refine-permission-matrix-compliance.yaml
```

Read the renamed file in full, then edit:
- Line 1 (`name: triage-permission-matrix-compliance`) → `name: backlog-refine-permission-matrix-compliance`
- Lines 5, 12, 21 (`description:` prose referencing `skills/triage/SKILL.md` / `/claude-tweaks:triage`) → `skills/backlog/refine-mode.md` / `/claude-tweaks:backlog refine`, adjusted grammatically per each sentence's context.
- **Line 40 (the functional invocation target):**
  ```yaml
  skill_invocation:
    prompt: "/claude-tweaks:triage"
  ```
  becomes:
  ```yaml
  skill_invocation:
    prompt: "/claude-tweaks:backlog refine"
  ```

- [ ] **Step 4: Verify**

Run: `grep -rn "claude-tweaks:triage\|claude-tweaks:review-backlog\|skills/triage\|skills/review-backlog" docs/getting-started.md evals/README.md evals/scenarios/backlog-refine-permission-matrix-compliance.yaml`
Expected: only `evals/README.md` line 150's deliberately-preserved historical mention survives; everything else is clean.

Run the eval harness's own free unit suite to confirm the rename didn't break scenario-loading machinery:
```bash
cd evals && npm install && node --test tests/
cd ..
```
Expected: all tests pass (this suite validates scenario-file structure generically, not this specific scenario's content — it should be unaffected by the rename, but confirms nothing broke).

- [ ] **Step 5: Commit**

```bash
git add docs/getting-started.md evals/README.md evals/scenarios/backlog-refine-permission-matrix-compliance.yaml
git rm evals/scenarios/triage-permission-matrix-compliance.yaml 2>/dev/null || true
git commit -m "Rename sweep: docs/getting-started.md, evals now reference /claude-tweaks:backlog"
```

---

### Task 16: Version bump

**Files:**
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1: Check for a concurrent bump before bumping**

```bash
git fetch origin main
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
```

Read the current `version` field in `.claude-plugin/plugin.json`. If `origin/main`'s log shows a bump that landed after this worktree branched, use the next free version after that one instead of a naive increment.

- [ ] **Step 2: Bump the minor version**

This is a feature addition (a new skill replacing two others, with new capabilities — the layered fetch/budget design, the recommend-next feature) — bump the minor version component. Edit `.claude-plugin/plugin.json`'s `version` field accordingly (e.g. `6.16.1` → `6.17.0` — substitute the actual current value read in Step 1).

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "Bump version for /claude-tweaks:backlog (replaces /triage + /review-backlog)"
```

Note for the human merging this branch: the marketplace repo (`thomasholknielsen/claude-tweaks-marketplace`) mirror update is a separate, cross-repo release action per CLAUDE.md's "Releasing (two repos)" section — not part of this worktree's scope. Do it after this branch merges to `main`.

---

### Task 17: Final repo-wide verification sweep

**Files:** none modified — verification only.

- [ ] **Step 1: Confirm zero remaining live references**

**Note on the exclusion pattern below:** `grep -rl PATTERN .` in this shell environment returns paths WITHOUT a leading `./` (a documented gotcha — see CLAUDE.md's Don'ts on `grep -v` exclusion anchoring). Anchor the exclusion to the bare relative path, not `^\./...` — the latter would silently exclude nothing and this whole verification step would falsely report clean.

```bash
grep -rln "claude-tweaks:triage\b\|claude-tweaks:review-backlog\b" \
  --include="*.md" --include="*.yml" --include="*.yaml" --include="*.json" . \
  | grep -vE '^(docs/superpowers/plans|docs/superpowers/specs|specs|\.claude-tweaks/pipelines/archive|docs/decisions|docs/github-issues-integration-review\.md|CHANGELOG\.md)'
```

Expected output: exactly these lines and no others (the deliberately-preserved historical-incident mentions from Tasks 9-15, each confirmed individually in its own task's verify step):
- `skills/dispatch/SKILL.md` (line 412's historical routine-migration note)
- `skills/dispatch/routine-template.yml` (lines 1-2's historical migration comment)
- `skills/_shared/local-files-preflight-stop.md` (line 20's historical incident note)
- `CLAUDE.md` (line 250's Lessons Learned entry)
- `evals/README.md` (line 150's historical incident note)

If any OTHER file appears, stop and go back to the relevant rename-sweep task — this means a live reference was missed.

- [ ] **Step 2: Confirm both old skill directories are gone and the new one is complete**

```bash
test ! -d skills/triage && test ! -d skills/review-backlog && echo "OK: old directories removed"
ls skills/backlog/
```

Expected: "OK: old directories removed", then `SKILL.md`, `refine-mode.md`, `overview-mode.md` listed.

- [ ] **Step 3: Run the full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass, 0 failures (matching this plan's Task 1/2 additions plus every pre-existing test, none of which this plan's rename-only tasks should have broken).

- [ ] **Step 4: Bare-form sweep for any remaining short-form references this session's research may not have caught**

```bash
grep -rln "\`/triage\`\|\`/review-backlog\`" --include="*.md" --include="*.yml" skills/ _shared/ 2>/dev/null \
  | grep -vE '^(docs/superpowers/plans|docs/superpowers/specs)'
```

Expected: no matches. If any surface, apply the same rename pattern established in Tasks 9-15 (map to `/claude-tweaks:backlog refine` or `/claude-tweaks:backlog overview` per the specific behavior being described, following this plan's Global Constraints correction note for anything touching the `unsynced` fold-in).

- [ ] **Step 5: No commit needed — this task is pure verification**

If Steps 1-4 all pass as expected, the branch is ready for `/claude-tweaks:review` and `/claude-tweaks:wrap-up`. If any step surfaces a gap, fix it as an addition to the relevant task above and re-run this task's verification from Step 1.
