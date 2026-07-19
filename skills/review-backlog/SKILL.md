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
