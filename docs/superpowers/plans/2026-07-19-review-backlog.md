# review-backlog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/claude-tweaks:review-backlog`, a standalone utility skill that synthesizes the open work-record backlog into thematic clusters and priority signal, suggesting `priority:*`/`**Related:**` values via human batch-confirm.

**Architecture:** Two-lane pipeline — Lane A is pure label filter/sort over already-scored records (unlimited scale, three modes: `critical`/`risk-value`/`cleanup`); Lane B is a bounded LLM synthesis pass over unscored records only (default budget 40), producing priority suggestions and `**Related:**` cross-references applied via the same batch-confirm pattern `/claude-tweaks:triage` already uses.

**Tech Stack:** Markdown skill file (bash + inline `node -e` snippets calling a new pure CommonJS module), `node --test` for the module's unit tests. No new dependencies — the plugin ships zero runtime npm deps.

## Global Constraints

- No new npm dependencies — pure CommonJS, `'use strict'`, no network/fs calls inside `bin/lib/issues/review-backlog.js` itself (matches `record.js`/`tier.js`'s existing purity contract).
- Every `AskUserQuestion` call answers exactly one logical decision — priority suggestions and `**Related:**` suggestions are two separate calls, never combined (CLAUDE.md's interaction-style directive).
- `priority:*` and `**Related:**` writes are always human-confirmed via batch-apply — never autonomous (`_shared/work-record.md`'s grant/permission semantics).
- This skill never writes `risk:*`, `effort:*`, `auto:*`, `bot:*`, `ready`, or `Blocked by #N` — those stay other skills' exclusive jobs (see the design doc's Non-goals).
- Commit message style: `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes (`feat:`/`fix:`/etc. are NOT used in this repo — CLAUDE.md's Versioning section).
- Design reference: `docs/superpowers/specs/2026-07-19-review-backlog-design.md` — every decision in its "Decision log" table is final; do not re-litigate it.
- Work from inside the existing worktree at `.claude/worktrees/review-backlog-design` (branch `worktree-review-backlog-design`) — do not create a new worktree. Before any commit, echo `pwd` and `git rev-parse --show-toplevel` and confirm both resolve to this worktree.

---

### Task 1: Pure logic module — `bin/lib/issues/review-backlog.js`

**Files:**
- Create: `bin/lib/issues/review-backlog.js`
- Test: `bin/lib/issues/tests/review-backlog.test.js`

**Interfaces:**
- Produces (consumed by Task 3's SKILL.md bash snippets, via `require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/review-backlog.js')`):
  - `splitScoredUnscored(records)` → `{ scored: records[], unscored: records[] }`. Scored = `facets.risk` and `facets.effort` both truthy.
  - `filterCritical(records)` → `records[]`, filtered to `facets.risk === 'high'`, sorted by priority band (`priority:high` first, unprioritized last) then oldest-`createdAt`-first.
  - `rankRiskValue(records)` → `{ ranked: records[], unscored: records[] }`. `ranked` is the scored subset sorted by priority band, then risk band (both high-first), then oldest-first. `unscored` is the trailing group, oldest-first.
  - `filterCleanup(records)` → `records[]`, filtered to `facets.effort === 'low'`, sorted by priority band then oldest-first.
  - `selectBudgetSlice(unscored, budget)` → `{ selected: records[], remaining: number }`. Oldest-`createdAt`-first; `remaining` is an honest overflow count, never silently dropped.
  - `mergeUnsyncedRecords(githubRecords, unsyncedRecords)` → `records[]`. Concatenates github-first then unsynced, tagging every record's `facets.unsynced` explicitly (`false`/`true`) since `record.js`'s `parseRecordFacets` never sets that key at all.
- Consumes: every function expects records already carrying `.facets` (from `record.js`'s `parseRecordFacets` or `local-store.js`'s `readRecord`/`queryRecords`) and, where sorting needs it, a `.createdAt` ISO string. This module never fetches, parses labels, or touches the filesystem/network itself.

- [ ] **Step 1: Write the failing tests**

Create `bin/lib/issues/tests/review-backlog.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  splitScoredUnscored,
  filterCritical,
  rankRiskValue,
  filterCleanup,
  selectBudgetSlice,
  mergeUnsyncedRecords,
} = require('../review-backlog');

function record(overrides) {
  return {
    number: 1,
    title: 'untitled',
    createdAt: '2026-01-01T00:00:00Z',
    facets: { risk: null, effort: null, priority: null },
    ...overrides,
  };
}

test('splitScoredUnscored buckets by presence of both risk and effort', () => {
  const scored = record({ number: 1, facets: { risk: 'high', effort: 'low', priority: null } });
  const riskOnly = record({ number: 2, facets: { risk: 'high', effort: null, priority: null } });
  const unscored = record({ number: 3, facets: { risk: null, effort: null, priority: null } });
  const result = splitScoredUnscored([scored, riskOnly, unscored]);
  assert.deepStrictEqual(result.scored, [scored]);
  assert.deepStrictEqual(result.unscored, [riskOnly, unscored]);
});

test('filterCritical keeps only risk:high, sorted by priority band then oldest-first', () => {
  const high1 = record({ number: 1, createdAt: '2026-02-01T00:00:00Z', facets: { risk: 'high', effort: 'low', priority: null } });
  const high2 = record({ number: 2, createdAt: '2026-01-01T00:00:00Z', facets: { risk: 'high', effort: 'low', priority: 'high' } });
  const medium = record({ number: 3, facets: { risk: 'medium', effort: 'low', priority: 'high' } });
  const result = filterCritical([high1, high2, medium]);
  assert.deepStrictEqual(result.map((r) => r.number), [2, 1]);
});

test('rankRiskValue sorts scored records by priority band then risk band then oldest-first, trailing unscored separately', () => {
  const a = record({ number: 1, createdAt: '2026-01-01T00:00:00Z', facets: { risk: 'low', effort: 'low', priority: 'high' } });
  const b = record({ number: 2, createdAt: '2026-01-02T00:00:00Z', facets: { risk: 'high', effort: 'low', priority: 'high' } });
  const c = record({ number: 3, createdAt: '2026-01-01T00:00:00Z', facets: { risk: 'high', effort: 'low', priority: null } });
  const unscored1 = record({ number: 4, createdAt: '2026-01-05T00:00:00Z', facets: { risk: null, effort: null, priority: null } });
  const unscored2 = record({ number: 5, createdAt: '2026-01-03T00:00:00Z', facets: { risk: null, effort: null, priority: null } });
  const result = rankRiskValue([a, b, c, unscored1, unscored2]);
  assert.deepStrictEqual(result.ranked.map((r) => r.number), [2, 1, 3]);
  assert.deepStrictEqual(result.unscored.map((r) => r.number), [5, 4]);
});

test('filterCleanup keeps only effort:low, sorted by priority band then oldest-first', () => {
  const low1 = record({ number: 1, createdAt: '2026-02-01T00:00:00Z', facets: { risk: 'low', effort: 'low', priority: null } });
  const low2 = record({ number: 2, createdAt: '2026-01-01T00:00:00Z', facets: { risk: 'low', effort: 'low', priority: 'high' } });
  const highEffort = record({ number: 3, facets: { risk: 'low', effort: 'high', priority: 'high' } });
  const result = filterCleanup([low1, low2, highEffort]);
  assert.deepStrictEqual(result.map((r) => r.number), [2, 1]);
});

test('selectBudgetSlice picks the oldest N and reports an honest remaining count', () => {
  const records = [
    record({ number: 1, createdAt: '2026-01-03T00:00:00Z' }),
    record({ number: 2, createdAt: '2026-01-01T00:00:00Z' }),
    record({ number: 3, createdAt: '2026-01-02T00:00:00Z' }),
  ];
  const result = selectBudgetSlice(records, 2);
  assert.deepStrictEqual(result.selected.map((r) => r.number), [2, 3]);
  assert.strictEqual(result.remaining, 1);
});

test('selectBudgetSlice reports zero remaining when the budget covers everything', () => {
  const records = [record({ number: 1 }), record({ number: 2 })];
  const result = selectBudgetSlice(records, 5);
  assert.strictEqual(result.remaining, 0);
  assert.strictEqual(result.selected.length, 2);
});

test('mergeUnsyncedRecords concatenates github-first then unsynced, tagging facets.unsynced explicitly on both', () => {
  const githubRecord = record({
    number: 1,
    // parseRecordFacets never sets an `unsynced` key at all — simulate that shape.
    facets: { risk: 'low', effort: 'low', priority: null },
  });
  const unsyncedRecord = record({
    number: 2,
    facets: { risk: null, effort: null, priority: null, unsynced: true },
  });
  const result = mergeUnsyncedRecords([githubRecord], [unsyncedRecord]);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].number, 1);
  assert.strictEqual(result[0].facets.unsynced, false);
  assert.strictEqual(result[1].number, 2);
  assert.strictEqual(result[1].facets.unsynced, true);
});
```

- [ ] **Step 2: Run the test file to verify it fails**

Run: `node --test bin/lib/issues/tests/review-backlog.test.js`
Expected: FAIL — `Cannot find module '../review-backlog'`

- [ ] **Step 3: Write the implementation**

Create `bin/lib/issues/review-backlog.js`:

```js
// bin/lib/issues/review-backlog.js
// Pure: mechanical filter/sort/split/merge logic for /claude-tweaks:review-backlog's
// Lane A (scored records, unlimited scale) and the scored/unscored split feeding
// Lane B's bounded LLM synthesis pass. Records are expected to already carry
// `.facets` (via record.js's parseRecordFacets or local-store.js's
// readRecord/queryRecords) and, where sorting depends on it, a `.createdAt` ISO
// string. No network, no fs — mirrors record.js/tier.js's purity contract.
'use strict';

const RANK = { high: 0, medium: 1, low: 2 };
const bandOf = (r) => (r.facets.priority ? RANK[r.facets.priority] : 3);
const riskBandOf = (r) => (r.facets.risk ? RANK[r.facets.risk] : 3);
const byCreatedAtAsc = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);

// records[] -> { scored: records[], unscored: records[] }. Scored = carries both
// risk:* and effort:* (the two labels /specify's shaping and the health skills'
// born-ready filing always stamp together). Order within each bucket is preserved
// from the input array — callers sort afterward per mode.
function splitScoredUnscored(records) {
  const scored = [];
  const unscored = [];
  for (const r of records) {
    if (r.facets.risk && r.facets.effort) scored.push(r);
    else unscored.push(r);
  }
  return { scored, unscored };
}

// records[] -> records[] filtered to risk:high, sorted by priority band then
// oldest-createdAt-first. Only scored records ever carry risk:*, so this is safe
// to call on a mixed scored+unscored array directly.
function filterCritical(records) {
  return records
    .filter((r) => r.facets.risk === 'high')
    .sort((a, b) => bandOf(a) - bandOf(b) || byCreatedAtAsc(a, b));
}

// records[] -> { ranked: records[], unscored: records[] }. ranked is the scored
// bucket sorted by priority band, then risk band (both high-first), then
// oldest-createdAt-first; unscored is the trailing "not yet scored" group,
// oldest-first for the same staleness-first bias.
function rankRiskValue(records) {
  const { scored, unscored } = splitScoredUnscored(records);
  const ranked = scored
    .slice()
    .sort((a, b) => bandOf(a) - bandOf(b) || riskBandOf(a) - riskBandOf(b) || byCreatedAtAsc(a, b));
  return { ranked, unscored: unscored.slice().sort(byCreatedAtAsc) };
}

// records[] -> records[] filtered to effort:low, sorted by priority band then
// oldest-createdAt-first.
function filterCleanup(records) {
  return records
    .filter((r) => r.facets.effort === 'low')
    .sort((a, b) => bandOf(a) - bandOf(b) || byCreatedAtAsc(a, b));
}

// (unscored records[], budget) -> { selected: records[], remaining: number }.
// Oldest-createdAt-first — surfaces the longest-neglected records first, same
// staleness bias /tidy already uses. No silent truncation: `remaining` is exactly
// how many unscored records this pass didn't read.
function selectBudgetSlice(unscored, budget) {
  const sorted = unscored.slice().sort(byCreatedAtAsc);
  return {
    selected: sorted.slice(0, budget),
    remaining: Math.max(0, sorted.length - budget),
  };
}

// (githubRecords[], unsyncedRecords[]) -> records[]. Concatenates both, tagging
// every record's facets.unsynced explicitly (record.js's parseRecordFacets never
// sets this key at all; local-store.js's facets already carry it truthfully).
// GitHub records come first, preserving their original relative order; unsynced
// records follow, also in their original relative order.
function mergeUnsyncedRecords(githubRecords, unsyncedRecords) {
  const tag = (r, unsynced) => ({ ...r, facets: { ...r.facets, unsynced } });
  return [
    ...githubRecords.map((r) => tag(r, !!r.facets.unsynced)),
    ...unsyncedRecords.map((r) => tag(r, true)),
  ];
}

module.exports = {
  splitScoredUnscored,
  filterCritical,
  rankRiskValue,
  filterCleanup,
  selectBudgetSlice,
  mergeUnsyncedRecords,
};
```

- [ ] **Step 4: Run the test file to verify it passes**

Run: `node --test bin/lib/issues/tests/review-backlog.test.js`
Expected: PASS — 8 tests, 0 failures

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS (the pre-existing `tests/statusline.test.js` timing benchmark may still flake under load — this was already observed and accepted at worktree baseline; any other failure must be investigated before continuing)

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/review-backlog.js bin/lib/issues/tests/review-backlog.test.js
git commit -m "$(cat <<'EOF'
Add review-backlog pure logic module

Filter/sort/split/merge helpers for the two-lane pipeline: mechanical
label-based filtering (critical/risk-value/cleanup) over scored records,
and the scored/unscored split plus budget slicing that bounds the LLM
judgment pass to unscored records only.
EOF
)"
```

---

### Task 2: Taxonomy doc updates

**Files:**
- Modify: `skills/_shared/work-record.md` (Permission matrix table)
- Modify: `skills/specify/SKILL.md` (priority-ownership sentence)
- Modify: `skills/_shared/pipeline-run-dir.md` (standalone-auto allowlist)

**Interfaces:** None — pure documentation, no code.

- [ ] **Step 1: Add the `/review-backlog` row to `_shared/work-record.md`'s permission matrix**

Read `skills/_shared/work-record.md` and find the "## Permission matrix" table (the row for `/claude-tweaks:triage` ends with `granting on a headless path` in its Never column). Add a new row immediately after the `/claude-tweaks:tidy` row and before the `/claude-tweaks:demo` row so the human-facing gates (`/triage`, `/review-backlog`) stay grouped:

```markdown
| **`/review-backlog`** (survey, human-confirmed) | `priority:*` (human-confirmed via batch-apply), updates the `**Related:**` body line (human-confirmed) | nothing | `auto:*`, `bot:*`, `ready`, `risk:*`/`effort:*`, body-shaping |
```

- [ ] **Step 2: Amend `/specify`'s priority-ownership sentence**

In `skills/specify/SKILL.md`, find this exact sentence (in the "Cross-repo linking" section, just before "### Decision Rationale and Assumptions"):

> `priority:*` labels are optional, dispatch-ordering-only, and human-applied only — per the permission matrix in `_shared/work-record.md`, no skill in this pipeline, including `/specify`, ever adds one.

Replace it with:

> `priority:*` labels are optional, dispatch-ordering-only, and human-applied only — per the permission matrix in `_shared/work-record.md`, no skill in this pipeline, including `/specify`, ever adds one *autonomously*. The sole exception is `/claude-tweaks:review-backlog`, which may write `priority:*` — always gated on an explicit human batch-confirm, never silently.

- [ ] **Step 3: Add `/claude-tweaks:review-backlog` to the standalone-auto allowlist**

In `skills/_shared/pipeline-run-dir.md`, find this sentence in the "Resolution order" section, item 3:

> **Standalone auto fallback** — when neither resolves AND the skill is running in `auto` mode AND the skill is on the standalone-auto allowlist (`/tidy`, `/init`, `/capture`, `/reflect`, `/journeys`, `/visual-review`, `/simplify`, `/claude-tweaks:dispatch`), create a standalone run dir at `.claude-tweaks/pipelines/{ISO-timestamp}-{skill-name}-standalone/` with `decisions.md` and `staged/`.

Replace the allowlist parenthetical with:

> (`/tidy`, `/init`, `/capture`, `/reflect`, `/journeys`, `/visual-review`, `/simplify`, `/claude-tweaks:dispatch`, `/claude-tweaks:triage`, `/claude-tweaks:review-backlog`)

Note this also adds `/claude-tweaks:triage`, which was missing despite `triage/SKILL.md` already asserting it's on this allowlist — a small, directly-adjacent correction on the exact line this task is already touching, not a separate scope expansion.

- [ ] **Step 4: Verify the edits landed correctly**

Run: `grep -n "review-backlog" skills/_shared/work-record.md skills/specify/SKILL.md skills/_shared/pipeline-run-dir.md`
Expected: one match per file, matching the text just added above.

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/work-record.md skills/specify/SKILL.md skills/_shared/pipeline-run-dir.md
git commit -m "$(cat <<'EOF'
Wire review-backlog into the taxonomy and run-dir contracts

Adds its permission-matrix row (priority:*/**Related:** writes, both
human-confirmed), names it as the sole exception to /specify's
"no skill ever adds priority" invariant, and adds it (plus the
already-shipped /triage, previously missing) to the standalone-auto
run-dir allowlist.
EOF
)"
```

---

### Task 3: The skill itself — `skills/review-backlog/SKILL.md`

**Files:**
- Create: `skills/review-backlog/SKILL.md`

**Interfaces:**
- Consumes: `bin/lib/issues/review-backlog.js`'s six exports (Task 1) via `require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/review-backlog.js')`; `record.js`'s `parseRecordFacets`; `local-store.js`'s `queryRecords`/`writeRecord`; `_shared/github-pr-scan.md`'s Detection Ladder; `_shared/label-bootstrap.md`'s check-then-create snippet; `_shared/pipeline-run-dir.md`'s resolution order (Task 2 added this skill to its allowlist).
- Produces: nothing new for other skills to `require` — everything downstream (Task 4) integrates via prose Relationship-table entries, not code.

- [ ] **Step 1: Write the full skill file**

Create `skills/review-backlog/SKILL.md`:

```markdown
---
name: claude-tweaks:review-backlog
description: Use when you want to understand what's in the open work-record backlog and get a sense of priority across it — synthesizes unscored records into thematic clusters, suggests priority:* and **Related:** values via human batch-confirm, and renders critical/risk-value/cleanup filtered views plus parallel hand-off blocks for a chosen batch. Keywords - backlog review, prioritization, content synthesis, priority label, related records, hand-off, critical, risk-value, cleanup.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Review Backlog — Understand and Prioritize the Open Work-Record Queue

Synthesizes the open work-record backlog into thematic clusters and priority signal, and suggests `priority:*`/`**Related:**` values a human can batch-confirm. Sits outside the main brainstorm-to-build chain, feeding judgment into it rather than gating it:

```
capture / code-health / harness-health / journey-health / docs-health   (file records)
                              │
                              v
              [ /claude-tweaks:review-backlog ]   <- utility (no fixed lifecycle position)
                              │
                              v  (understanding + priority signal informs what to shape next)
                /claude-tweaks:specify   (shapes to ready)
                              │
                              v
                    /claude-tweaks:triage   (grants)
                              │
                              v
                    /claude-tweaks:dispatch   (claims + executes)
```

## When to Use

- You want a synthesized read of what's actually in the backlog — narrative + thematic clusters — not just counts.
- You want to work from one of three lenses: critical-first (`risk:high`), a full risk/value ranking, or a low-effort cleanup batch.
- A cluster of `backlog`-stage records has never been through `/specify` and you want a first-pass priority read plus any cross-record relationships prose reveals but no formal link captures.
- You want a copy-pasteable hand-off block to parallelize shaping or building a chosen batch across terminals.

Not for: shaping record bodies, stamping `risk:*`/`effort:*`, granting `auto:build`/`auto:merge`, or claiming/building anything — those stay `/claude-tweaks:specify`'s, `/claude-tweaks:triage`'s, and `/claude-tweaks:dispatch`'s jobs respectively. This skill only ever suggests `priority:*` and `**Related:**` values, both gated on an explicit human batch-confirm.

## Input

`$ARGUMENTS` = `[mode] [--budget N]`

- No mode (bare) — full survey: all three mechanical views plus a bounded LLM synthesis pass over unscored records.
- `critical` — mechanical only, `risk:high` records.
- `risk-value` — mechanical only, full ranked view.
- `cleanup` — mechanical only, `effort:low` records.
- `--budget N` — caps how many unscored records the bare-mode synthesis pass reads (default 40). Ignored on the three named modes, which never read unscored bodies.

## Preflight

Read the `work-backend` field from the project's CLAUDE.md (`_shared/work-record.md`'s Config keys table). Unlike `/claude-tweaks:triage`'s grants (GitHub-RBAC-enforced, `github-issues` only), `priority:*` and the `**Related:**` body line are meaningful writes under either driver, so both are supported.

**`work-backend: github-issues`:** run the Detection Ladder from `_shared/github-pr-scan.md` (checks 1-3) before any `gh` command — treat any ladder failure as a hard gate, same stance as `/claude-tweaks:triage` (there is no meaningful degraded mode when the whole fetch depends on `gh`). Report the specific failing check and stop.

**`work-backend: local-files`:** skip the Detection Ladder entirely.

## Workflow

### Step 1: Fetch (mechanical, unbounded scale)

```bash
# work-backend: github-issues
gh issue list --state open --json number,title,labels,createdAt,updatedAt --limit 500 > /tmp/review-backlog-open.json
node -e "
  const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const issues = require('/tmp/review-backlog-open.json');
  const rows = issues.map((i) => ({ ...i, facets: parseRecordFacets(i.labels) }));
  console.log(JSON.stringify(rows));
" > /tmp/review-backlog-github.json
```

Fold in `unsynced: true` local fallback records (per `/tidy`'s existing Shape 3 — a failed GitHub write, not a supported dual-driver mode):

```bash
node -e "
  const { queryRecords } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/local-store.js');
  const records = queryRecords('specs', { unsynced: true });
  console.log(JSON.stringify(records));
" > /tmp/review-backlog-unsynced.json
```

For each unsynced record, attach a `createdAt` from its own last-commit date (the local driver carries no timestamp facet — same approach `/tidy`'s Step 1 staleness clock already uses):

```bash
node -e "
  const { execSync } = require('child_process');
  const records = require('/tmp/review-backlog-unsynced.json');
  const withDates = records.map((r) => {
    let createdAt;
    try {
      createdAt = execSync('git log -1 --format=%cI -- ' + JSON.stringify(r.path), { encoding: 'utf8' }).trim();
    } catch { createdAt = null; }
    return { ...r, createdAt: createdAt || new Date().toISOString() };
  });
  console.log(JSON.stringify(withDates));
" > /tmp/review-backlog-unsynced-dated.json
node -e "
  const { mergeUnsyncedRecords } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/review-backlog.js');
  const github = require('/tmp/review-backlog-github.json');
  const unsynced = require('/tmp/review-backlog-unsynced-dated.json');
  console.log(JSON.stringify(mergeUnsyncedRecords(github, unsynced)));
" > /tmp/review-backlog-all.json
```

```bash
# work-backend: local-files
node -e "
  const { queryRecords } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/local-store.js');
  const { mergeUnsyncedRecords } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/review-backlog.js');
  const records = queryRecords('specs', {});
  console.log(JSON.stringify(mergeUnsyncedRecords(records, [])));
" > /tmp/review-backlog-all.json
```

Local-files records have no dedicated timestamp facet either — when a mode below sorts by `createdAt` and it's absent, derive it the same way (the record's own last-commit date; an uncommitted/brand-new record counts as fresh — `git log -1` returning empty).

Tag every fetched record with an `⚠ not yet synced` marker in rendered output wherever `facets.unsynced === true` — this skill surfaces those records, it never fixes them (`/claude-tweaks:tidy`'s job).

### Step 2: Route by mode

```bash
node -e "
  const rb = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/review-backlog.js');
  const all = require('/tmp/review-backlog-all.json');
  console.log(JSON.stringify({
    critical: rb.filterCritical(all),
    riskValue: rb.rankRiskValue(all),
    cleanup: rb.filterCleanup(all),
    split: rb.splitScoredUnscored(all),
  }));
" > /tmp/review-backlog-views.json
```

**`critical`** — render `.critical` as a table (`| # | Record | Priority | Age |`). Note the excluded unscored count from `.split.unscored.length` ("N unscored records not risk-assessed yet — run bare mode for a judgment pass"). Skip to Next Actions.

**`risk-value`** — render `.riskValue.ranked` as the primary ranked table, then `.riskValue.unscored` as a trailing "not yet scored" group. Skip to Next Actions.

**`cleanup`** — render `.cleanup` as a table, grouped for a batch sweep. Skip to Next Actions.

**Bare** — render all three views above as a compact summary, then continue to Step 3.

### Step 3 (bare mode only): Bounded synthesis over unscored records

```bash
node -e "
  const rb = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/review-backlog.js');
  const all = require('/tmp/review-backlog-all.json');
  const { unscored } = rb.splitScoredUnscored(all);
  const { selected, remaining } = rb.selectBudgetSlice(unscored, ${BUDGET:-40});
  console.log(JSON.stringify({ selected, remaining }));
" > /tmp/review-backlog-budget.json
```

Fetch bodies only for `selected` (github: `gh issue view {n} --json body`, one per record; local-files: bodies are already present from Step 1's `queryRecords`). Read every selected body in one pass and produce:

- A narrative summary + thematic clusters (group by shared theme/origin/root cause, not just by label — the same read a human gets from reading a handful of related issues side by side).
- A per-record `priority:*` suggestion with a one-line rationale.
- Detected `**Related:**` cross-references — pairs of selected records whose bodies reference each other's context in prose without a formal link (`**Related:**` is `/capture`'s own body-template line; nothing else reads or maintains it — `_shared/work-record.md`). Never suggest `Blocked by #N` here — that's the formally-parsed hard-dependency mechanism, out of scope for this skill (`_shared/work-record.md`'s permission matrix, Task 2).

If `remaining > 0`, state it plainly in the report: "`{remaining}` more unscored records exist beyond this run's `--budget {N}` — re-run to continue." Never silently drop them.

### Step 4 (bare mode only): Batch-confirm suggestions

Render the priority suggestions as a batch table, mirroring `/claude-tweaks:triage`'s own Step 3 pattern:

```markdown
### Review Backlog — {N} priority suggestions

| # | Record | Current | Suggested | Rationale |
|---|---|---|---|---|
| 1 | #123: {title} | (none) | priority:high | {one-line rationale} |
```

Then one `AskUserQuestion`:

- `question`: `"Apply the suggested priority to all, or override specific records?"`, `header`: `"Priority batch"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all suggested (Recommended)"`, `description`: `"Set priority:* exactly per the table above"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"I'll specify #-by-# corrections in my next message"`
- Option 3 — `label`: `"Skip priority suggestions"`, `description`: `"Leave every record unprioritized for now"`

Then, separately, render the `**Related:**` suggestions as their own batch table and a second, separate `AskUserQuestion` (same three-option shape, `header`: `"Related batch"`, question text `"Apply the suggested **Related:** updates to all, or override specific records?"`) — never combined into the priority call, per this repo's one-decision-per-`AskUserQuestion` convention.

### Step 5: Apply

For every record the priority decision resolved to apply:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['priority:high', 'Priority: dispatch picks this band first'],
#  ['priority:medium', 'Priority: dispatch picks after priority:high'],
#  ['priority:low', 'Priority: dispatch picks last among prioritized records']]
gh issue edit "$ISSUE" --add-label "priority:$TIER"
```

Local-files driver: recompose the record's full facets (`priority: $TIER`) and call `writeRecord` (`bin/lib/issues/local-store.js`) — same compose-then-write-once pattern `/specify`'s local-driver path already uses.

For every record the `**Related:**` decision resolved to apply, replace the existing `**Related:** {...}` line in the body (github: `gh issue edit "$ISSUE" --body-file`, rewriting the fetched body with the line replaced; local-files: `writeRecord` with the updated body).

Log every application to this run's `decisions.md` (standalone-auto run dir per `_shared/pipeline-run-dir.md` — `/claude-tweaks:review-backlog` is on the allowlist):

```
AUTO {time} — Review Backlog: set priority:{tier} on #{n}.
AUTO {time} — Review Backlog: updated **Related:** on #{n} to reference #{m}.
```

### Step 6: Hand-off block (contextual)

When a mode's output has a natural actionable batch (a `cleanup` run, a chosen subset of `risk-value`'s ranked list, or the just-confirmed priority batch), offer a stage-aware hand-off block as part of Next Actions rather than always rendering one:

- `ready` + `auto:build`-granted records → `/claude-tweaks:dispatch #N,#M,...` (mirrors `/claude-tweaks:triage`'s own Next Actions).
- `backlog`-stage records to parallelize shaping on → a multi-terminal block, one `/claude-tweaks:specify #N` per column (mirrors `help/reference-card.md`'s existing "Parallel specs" example):

```
# Terminal 1                          # Terminal 2                          # Terminal 3
/claude-tweaks:specify #201           /claude-tweaks:specify #205           /claude-tweaks:specify #210
```

## Next Actions

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Shape the top priority record (Recommended)"`, `description`: `"/claude-tweaks:specify #{n} — shape the single highest-priority backlog record this run surfaced"`
- Option 2 — `label`: `"Generate a hand-off block"`, `description`: `"Parallelize shaping or dispatching across terminals for the batch this run surfaced"` — omit when no natural batch was produced this run
- Option 3 — `label`: `"Review the ready queue"`, `description`: `"/claude-tweaks:triage — authorize anything now scored and shaped"` — omit when nothing in the ready queue changed this run
- Option 4 (only after a named-mode run) — `label`: `"Try the {other-lens} lens"`, `description`: `"/claude-tweaks:review-backlog {other-mode} — {one-line description of that mode}"`, naming exactly one of the two modes not just run. Omit entirely after a bare run, which already rendered all three mechanical views.

## Component-Skill Contract

`/claude-tweaks:review-backlog` is human-only — no pipeline orchestrator ever invokes it as a component step; a human runs it directly, every time. It always renders `## Next Actions` (mirrors `/claude-tweaks:triage`'s stance, which is user-facing for the same reason). `$PIPELINE_RUN_DIR` may be set during a run, but only because this skill resolves its own standalone run dir per `_shared/pipeline-run-dir.md`'s allowlist (item 3) to write `decisions.md` — that resolution is for logging only and never suppresses interactivity or the Next Actions block.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Writing `risk:*`/`effort:*` labels or shaping a record's body from this skill | Stays `/claude-tweaks:specify`'s exclusive job — this skill only ever suggests `priority:*` and `**Related:**`, both human-confirmed (`_shared/work-record.md`'s permission matrix). |
| Suggesting or writing `Blocked by #N` | Only the soft, informational `**Related:**` field is in scope. A wrong hard-dependency suggestion has real downstream consequences — it would affect `/claude-tweaks:dispatch`'s queue selection. |
| Applying a priority or `**Related:**` suggestion without the batch-confirm | `priority:*` is human-applied-only by contract (`_shared/work-record.md`) — the batch-confirm is the human action that satisfies that, even when every suggestion is accepted as-is. |
| Reading every unscored record's body in one unbounded pass, ignoring `--budget` | Defeats the entire two-lane design — Lane B exists specifically to stay bounded on a large backlog. |
| Fixing (rather than surfacing) `unsynced: true` local fallback records | Stays `/claude-tweaks:tidy`'s job (its existing Shape 3) — this skill only tags and reports them. |
| Granting `auto:build`/`auto:merge` or claiming/building a record from this skill | Out of scope entirely — those stay `/claude-tweaks:triage`'s and `/claude-tweaks:dispatch`'s jobs. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:triage` | Reciprocal utility relationship over the same record set: review-backlog surveys content and suggests `priority:*`/`**Related:**`; triage grants `auto:build`/`auto:merge` over the `ready` queue. Neither claims, builds, or shapes bodies. |
| `/claude-tweaks:capture` | Consumes and enriches capture's `**Related:**` body-template field — the one field this skill's relationship-detection suggestions target. |
| `/claude-tweaks:tidy` | Reciprocal: review-backlog folds in `unsynced: true` local fallback records (surfacing, never fixing them) — `/tidy`'s existing Shape 3 owns the actual sync action. |
| `/claude-tweaks:specify` | The shaping hand-off target — a backlog record review-backlog surfaced (priority suggested, possibly cross-referenced) still needs `/specify` to stamp `risk:*`/`effort:*` and reach `ready`. |
| `/claude-tweaks:dispatch` | Consumes `priority:*` for its `next` tie-break ordering — review-backlog is the only skill that ever suggests a value for that label (human-confirmed), per `/specify`'s own amended note. |
| `/claude-tweaks:help` | Reciprocal: could surface an "N unscored records" nudge on its dashboard, mirroring how it already surfaces `/claude-tweaks:triage`'s pending-authorization count. |
| `_shared/work-record.md` | Taxonomy home — the permission-matrix row this skill implements (adds `priority:*` and updates `**Related:**`, both human-confirmed; never touches `auto:*`, `bot:*`, `ready`, or `risk:*`/`effort:*`). |
| `_shared/github-pr-scan.md` | Detection Ladder — this skill's preflight hard gate under `work-backend: github-issues`. |
| `_shared/label-bootstrap.md` | Canonical check-then-create snippet for the `priority:*` labels this skill applies. |
| `_shared/pipeline-run-dir.md` | Review-backlog resolves a standalone-auto run dir (allowlist item 3) for its own `decisions.md`. |
| `bin/lib/issues/review-backlog.js` | The pure filter/sort/split/merge helpers behind every mode — `splitScoredUnscored`, `filterCritical`, `rankRiskValue`, `filterCleanup`, `selectBudgetSlice`, `mergeUnsyncedRecords`. |
| `bin/lib/issues/{record,local-store}.js` | `record.js`'s `parseRecordFacets` facet-parses every fetched GitHub issue in Step 1; `local-store.js`'s `queryRecords`/`writeRecord` back the entire `local-files` driver path. |
```

- [ ] **Step 2: Verify the file has every required structural section**

Run: `grep -n "^## \|^---$" skills/review-backlog/SKILL.md`
Expected output includes, in order: `## When to Use`, `## Input`, `## Preflight`, `## Workflow`, `## Next Actions`, `## Component-Skill Contract`, `## Anti-Patterns`, `## Relationship to Other Skills` — matching the standard SKILL.md structure every other skill in this repo follows (CLAUDE.md's "SKILL.md structure" convention).

- [ ] **Step 3: Verify no placeholder markers slipped in**

Run: `grep -n -i "TBD\|TODO\|<!-- ambiguity" skills/review-backlog/SKILL.md`
Expected: no output (exit code 1).

- [ ] **Step 4: Commit**

```bash
git add skills/review-backlog/SKILL.md
git commit -m "$(cat <<'EOF'
Add the review-backlog skill

Standalone utility skill: two-lane pipeline (mechanical label filtering
for critical/risk-value/cleanup modes, bounded LLM synthesis for
unscored records) that surveys the open work-record backlog and
suggests priority:*/**Related:** values via the same human batch-confirm
pattern /triage already uses. Never shapes bodies, grants, or dispatches.
EOF
)"
```

---

### Task 4: Bidirectional Relationship-to-Other-Skills updates

**Files:**
- Modify: `skills/capture/SKILL.md`
- Modify: `skills/tidy/SKILL.md`
- Modify: `skills/help/SKILL.md`
- Modify: `skills/dispatch/SKILL.md`
- Modify: `skills/specify/SKILL.md`

**Interfaces:** None — pure documentation, no code. Each edit adds exactly one row to an existing `## Relationship to Other Skills` table, reciprocating Task 3's own table.

- [ ] **Step 1: `skills/capture/SKILL.md`**

Find the `## Relationship to Other Skills` table (starts after line 257). Add a new row immediately after the `/claude-tweaks:specify` row:

```markdown
| `/claude-tweaks:review-backlog` | Consumes and enriches the `**Related:**` field this skill's Entry Format stamps — review-backlog is the only skill that suggests values for it, always human-confirmed. |
```

- [ ] **Step 2: `skills/tidy/SKILL.md`**

Find the `## Relationship to Other Skills` table (starts after line 400). Add a new row immediately after the `/claude-tweaks:triage` row:

```markdown
| `/claude-tweaks:review-backlog` | Reciprocal: review-backlog folds `unsynced: true` local fallback records into its survey (surfacing, never fixing them) — `/tidy`'s existing Shape 3 (Step 1) owns the actual sync action. |
```

- [ ] **Step 3: `skills/help/SKILL.md`**

Find the `## Relationship to Other Skills` table (starts after line 122). Add a new row immediately after the `/claude-tweaks:triage` row:

```markdown
| `/claude-tweaks:review-backlog` | Reciprocal: could surface an "N unscored records" nudge on the dashboard — the reciprocal of this skill already surfacing `/claude-tweaks:triage`'s pending-authorization count. |
```

- [ ] **Step 4: `skills/dispatch/SKILL.md`**

Find the `## Relationship to Other Skills` table (starts after line 393). Add a new row immediately after the `/claude-tweaks:triage` row:

```markdown
| `/claude-tweaks:review-backlog` | The only skill that ever suggests a `priority:*` value (human-confirmed) — dispatch's `next` form consumes whatever value results for its tie-break ordering. Review-backlog never claims, dispatches, or grants. |
```

- [ ] **Step 5: `skills/specify/SKILL.md`**

Find the `## Relationship to Other Skills` table (starts after line 724). Add a new row immediately after the `/claude-tweaks:capture` row:

```markdown
| `/claude-tweaks:review-backlog` | Upstream hand-off source — a backlog record review-backlog surfaced (priority suggested, possibly cross-referenced via `**Related:**`) still needs `/specify` to stamp `risk:*`/`effort:*` and reach `ready`. Review-backlog never shapes bodies or scores itself. |
```

- [ ] **Step 6: Verify every table gained exactly one row**

Run: `grep -c "claude-tweaks:review-backlog" skills/capture/SKILL.md skills/tidy/SKILL.md skills/help/SKILL.md skills/dispatch/SKILL.md skills/specify/SKILL.md`
Expected: `1` for each of the five files.

- [ ] **Step 7: Commit**

```bash
git add skills/capture/SKILL.md skills/tidy/SKILL.md skills/help/SKILL.md skills/dispatch/SKILL.md skills/specify/SKILL.md
git commit -m "$(cat <<'EOF'
Add reciprocal review-backlog rows to five Relationship tables

capture, tidy, help, dispatch, and specify each gain a bidirectional
Relationship-to-Other-Skills entry pointing back to review-backlog's
own table, per this repo's cross-reference convention.
EOF
)"
```

---

### Task 5: Version bump and catalog updates

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `skills/help/reference-card.md`

**Interfaces:** None — pure documentation/metadata, no code.

- [ ] **Step 1: Check for a concurrent version bump before touching `plugin.json`**

Run:
```bash
git fetch origin main
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
```
If the most recent entry already bumped past `6.7.0`, use the next free version instead of `6.8.0` below and note the collision in the commit message. Otherwise proceed with `6.8.0`.

- [ ] **Step 2: Bump `.claude-plugin/plugin.json`**

Change `"version": "6.7.0"` to `"version": "6.8.0"` (minor bump — feature addition, per CLAUDE.md's Versioning convention).

- [ ] **Step 3: Update CLAUDE.md's skill directory count and category list**

In this repo's own `CLAUDE.md`, find:

```
### Skill directories (32 total)

**Lifecycle:** init, capture, challenge, specify, build, test, stories, review, wrap-up
**Component:** reflect, simplify, deepen, journeys, visual-review, design, visualize, assess-agent-autonomy
**Utility:** help, tidy, flow, browse, ledger, version, research, code-health, routine, harness-health, journey-health, docs-health, triage, dispatch, demo
```

Replace with:

```
### Skill directories (33 total)

**Lifecycle:** init, capture, challenge, specify, build, test, stories, review, wrap-up
**Component:** reflect, simplify, deepen, journeys, visual-review, design, visualize, assess-agent-autonomy
**Utility:** help, tidy, flow, browse, ledger, version, research, code-health, routine, harness-health, journey-health, docs-health, triage, dispatch, demo, review-backlog
```

- [ ] **Step 4: Add review-backlog to README.md's Utility skills section**

In `README.md`, find the `**\`/claude-tweaks:triage\`**` paragraph (the one starting "The interactive human gate over the `ready` queue..."). Insert a new paragraph immediately after it and before the `**\`/claude-tweaks:dispatch\`**` paragraph:

```markdown
**`/claude-tweaks:review-backlog`** — Understand and prioritize the open work-record backlog. A two-lane pipeline: mechanical label filtering (`critical`/`risk-value`/`cleanup` modes) over already-scored records scales to any backlog size; a bounded LLM synthesis pass (default 40 records per run) covers only unscored records, producing thematic clusters, `priority:*` suggestions, and detected `**Related:**` cross-references — both applied via the same human batch-confirm pattern `/claude-tweaks:triage` uses for grants. Folds in `unsynced: true` local fallback records (surfacing, never fixing them — that stays `/claude-tweaks:tidy`'s job). Never shapes bodies, stamps `risk:*`/`effort:*`, or grants/claims anything.
```

- [ ] **Step 5: Add review-backlog to `skills/help/reference-card.md`'s command catalog**

In `skills/help/reference-card.md`'s Utility table, add a new row immediately after the `/claude-tweaks:triage` row:

```markdown
| `/claude-tweaks:review-backlog` | Understand and prioritize the open backlog — thematic clusters, `priority:*`/`**Related:**` suggestions via batch-confirm | `critical`, `risk-value`, `cleanup`, `--budget N` |
```

- [ ] **Step 6: Verify all four files updated consistently**

Run: `grep -c "review-backlog" .claude-plugin/plugin.json CLAUDE.md README.md skills/help/reference-card.md`
Expected: `plugin.json` shows `0` (version bump has no skill-name text — this just confirms the file still parses; check the version separately below), `CLAUDE.md` shows `1`, `README.md` shows `1`, `reference-card.md` shows `1`.

Run: `node -e "console.log(require('./.claude-plugin/plugin.json').version)"`
Expected: `6.8.0` (or the collision-adjusted version from Step 1).

- [ ] **Step 7: Run the full test suite one last time**

Run: `npm test`
Expected: PASS (same acceptable pre-existing `statusline.test.js` timing flake as Task 1's Step 5, nothing else).

- [ ] **Step 8: Commit**

```bash
git add .claude-plugin/plugin.json CLAUDE.md README.md skills/help/reference-card.md
git commit -m "$(cat <<'EOF'
Bump to 6.8.0 and catalog review-backlog

Minor version bump for the new skill (CLAUDE.md's versioning
convention). Updates the skill-directory count/list in CLAUDE.md, adds
review-backlog's README.md description, and adds its reference-card.md
command-catalog row.
EOF
)"
```
