# Backlog — Overview Mode

Entirely mechanical — no per-record LLM reads, so it scales to the full fetched set cheaply. Collapses the `critical`/`risk-value`/`cleanup` lenses into one picture and adds a "what to build next" recommendation.

## Step 1: Fetch

Fetch and facet-parse the full open-issue queue per `_shared/record-queue-fetch.md`, same as `refine-mode.md`'s priority/Related fetch (`{tmp-records-file}` = `/tmp/backlog-overview-open.json`, `{tmp-faceted-file}` = `/tmp/backlog-overview-faceted.json`, `{EXTRA_FIELDS}` = `,body`). Step 3's recommendation pass needs every candidate's `body` (for `rankNextToBuild`'s internal `parseDependencies` call) — without `,body` here, the `github-issues` fetch would silently omit bodies rather than error, and every candidate's unblocks-count would silently compute as 0, quietly corrupting the bare-mode recommendation's tie-break order rather than crashing. Under `work-backend: github-issues`, also fold in `unsynced: true` local fallback records the same way (port the retired `/claude-tweaks:review-backlog` skill's old Step 1 unsynced fold-in verbatim):

```bash
node -e "
  const { queryRecords } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/local-store.js');
  const records = queryRecords('specs', { unsynced: true });
  console.log(JSON.stringify(records));
" > /tmp/backlog-overview-unsynced.json
```

```bash
node -e "
  const { deriveCreatedAtFromGit } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/backlog.js');
  const records = require('/tmp/backlog-overview-unsynced.json');
  console.log(JSON.stringify(deriveCreatedAtFromGit(records)));
" > /tmp/backlog-overview-unsynced-dated.json
node -e "
  const { mergeUnsyncedRecords } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/backlog.js');
  const github = require('/tmp/backlog-overview-faceted.json');
  const unsynced = require('/tmp/backlog-overview-unsynced-dated.json');
  console.log(JSON.stringify(mergeUnsyncedRecords(github, unsynced)));
" > /tmp/backlog-overview-faceted.json
```

This last script reads `/tmp/backlog-overview-faceted.json`'s github-only content and overwrites the same path with the fully merged (github + unsynced) set — Step 2 below reads `/tmp/backlog-overview-faceted.json` expecting the merge to already be complete. Tag every fetched record with a **not yet synced** marker wherever `facets.unsynced === true` — this is a display-only tag in `overview` mode; the apply path for unsynced records' priority lives in `refine` mode's Apply step (writing `priority:*` via `writeRecord` when a record has no `$ISSUE`).

## Step 1.5: Trust table (read-only)

*(Omit this entire step under `work-backend: local-files` — see `_shared/trust-table.md`'s
framing note; `demo:approved`/`demo:changes-requested` are a `github-issues` concept and there is
nothing to fetch.)*

Render `bin/lib/issues/trust.js`'s per-class trust table per `_shared/trust-table.md`'s Fetch and
Render sections, verbatim — including the Fetch section's `work-links` resolution sub-section,
which decides which of the two family-parent branches to run (skipping it and taking the
first-listed `body-text` branch on a `native` repo silently returns zero leaves, and every
decomposed leaf re-enters `cell.total` as ungraded evidence). This step reports what evidence
exists and nothing else — it never
grants, changes a label, merges anything, or recommends an autonomous action. It runs once per
invocation, independent of which lens (or none) was requested below, since it is a repo-wide
finding rather than a lens-scoped view.

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

**`critical`** — render `.critical` as a table (`| # | Record | Priority | Age |`), capped at `--budget` rows (default 20) with an overflow note. Note the excluded unscored count from `.split.unscored.length` ("N unscored records not risk-assessed yet — run bare mode for a judgment pass"). Skip to Step 4.

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
- `backlog`-stage records to parallelize shaping on → a multi-terminal block, one `/claude-tweaks:specify #N` per column:

```
# Terminal 1                          # Terminal 2                          # Terminal 3
/claude-tweaks:specify #201           /claude-tweaks:specify #205           /claude-tweaks:specify #210
```

- A selection spanning both stages — split it by stage and render **both** blocks in the same Next Actions turn, never picking only one and silently dropping the other subset's records.
