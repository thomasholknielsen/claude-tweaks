# Backlog — Overview Mode

Entirely mechanical — no per-record LLM reads, so it scales to the full fetched set cheaply. Renders a funnel decision surface over the open queue and recommends what to build next; the `critical`/`risk-value`/`cleanup`/`trust` lenses are one explicit argument away.

**Failure-only narration:** interstitial status lines render only when a check fails or degrades (truncation warning hit, fetch fallback taken, trust fetch skipped) — never to announce that a step ran or passed. A clean step is silent; its output speaks through the report itself.

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

The trust fetch/computation still runs **once per invocation**, independent of which lens (or
none) was requested, per `_shared/trust-table.md`'s Fetch section verbatim (including its
`work-links` resolution sub-section — skipping it and taking the first-listed `body-text` branch
on a `native` repo silently returns zero sub-issues, and every decomposed sub-issue re-enters
`cell.total` as ungraded evidence) — unchanged from before.

**Bare mode renders only a single collapsed consequence line**, never the table: one line, all
non-clean cells folded in semicolon-separated, e.g. `trust: clean, except human:human|low (mixed)
→ merges below stay PR-gated`. The consequence line renders for cells whose verdict is neither
`clean` nor `insufficient-evidence` (with `trust.js`'s current vocabulary that means exactly the
`mixed` cells). When no cell's verdict requires it, render **nothing at all** — no "trust: clean"
line. `insufficient-evidence` cells render nothing in bare mode — their table is one lens away.

The verdict vocabulary is read verbatim from `bin/lib/issues/trust.js`'s row verdicts as
`_shared/trust-table.md` defines them — nothing new is invented here.

The full table render moves to the trust lens (Step 2).

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
    funnel: bl.funnelBuckets(all),
  }));
" > /tmp/backlog-overview-views.json
```

**`critical`** — render `.critical` as a table (`| # | Record | Priority | Age |`), capped at `--budget` rows (default 20) with an overflow note. Note the excluded unscored count from `.split.unscored.length` ("N unscored records not risk-assessed yet — run bare mode for a judgment pass"). Skip to Step 4.

**`risk-value`** — render `.riskValue.ranked` as the primary ranked table, then `.riskValue.unscored` as a trailing "not yet scored" group, same capping. Add a `Tier` column reading `facets.ceremony` directly (`fast-lane`/`standard`), `—` for records scored before ceremony-tiering shipped. Skip to Step 4.

**`cleanup`** — render `.cleanup` as a table, grouped for a batch sweep, same capping. Skip to Step 4.

**`trust`** — renders the full trust table per `_shared/trust-table.md`'s Render section verbatim
(uncapped — that contract's "never cap or truncate the row count" rule applies unchanged), using
the computation Step 1.5 already ran. Skip to Step 4. Under `work-backend: local-files` the lens
reports that the trust table is not applicable (same omission rationale as Step 1.5).

**Bare (no lens)** — render the funnel header from `.funnel` (`funnelBuckets` output), then
continue to Step 3. The header is populations + verbs only — **no record ids, and no
Critical/Risk-Value/Cleanup tables** (those remain one lens away). Template:

```
captured ▶ scored ▶ shaped ▶ granted ▶ dispatchable ▶ in flight
  {captured.length}   {scored.length}   {shaped.length}   {granted.length}   {dispatchable.length}   {inFlight.length}

captured      {n} → /claude-tweaks:backlog refine (score them)
scored        {n} → /claude-tweaks:specify #N (shape them)
shaped        {n} → /claude-tweaks:backlog grant (or dispatch here with the human gate)
granted       {n}   (no pointer — waiting on blockers; the blocker itself appears in the dispatch hand-off)
dispatchable  {n} → /claude-tweaks:dispatch / /claude-tweaks:flow #N
in flight     {n}   (no pointer — informational; claims honored)
```

The header ends at `in flight` deliberately even though it is not the most actionable stage: the
header is the process axis read left-to-right; the terminal-tail actionability principle is
satisfied by the report's *body* ending in the hand-off and Next sections, not by the header's last
column. The header replaces the summary counts too — do not re-add a prose counts paragraph above
it; the header *is* the counts.

Then at most **two annotation lines total**:

- The trust consequence line from Step 1.5, when any applicable cell verdict requires it (all
  non-clean cells collapsed into that single semicolon-separated line — the per-cell phrasing never
  multiplies lines). Nothing when clean.
- `parked {N} · not-planned {M} → /claude-tweaks:tidy owns these` — rendered from
  `.funnel.parked.length` / `.funnel.notPlanned.length`, only when either count is non-zero.

Every record appears exactly once across the header's populations (`funnelBuckets` is mutually
exclusive by construction) — never re-list a record in a second stage or an extra summary.

## Step 3 (bare only): Recommend what to build next

Restricted to the buildable subset — `funnelBuckets` output `dispatchable` ∪ `granted` (Step 2's
`.funnel` view) — one predicate, owned by `funnelBuckets`, so the header's counts and this
recommendation's population can never drift apart. For each candidate, compute the three inputs `ranking.js`'s `rankNextToBuild` needs but doesn't compute itself:

- `keyFiles` — extract the `### Key Files` subsection from the body, the same extraction `/help`'s Conflict detection sub-section already performs.
- `hasPlan` — `true` if `docs/superpowers/plans/` contains a file whose name references this record's id/slug (a simple filename-pattern check, not a content read).
- `body` — already present from Step 1's fetch (needed for `rankNextToBuild`'s internal `parseDependencies` call).
- `blockedBy` — resolved per `work-links`/`work-backend`:
  - **`work-links: native`** (resolve via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values work-links`): fetch every candidate's blocked-by set as **one aliased GraphQL query** using `buildNativeDependencyQuery` (`bin/lib/issues/record.js`) — one alias per candidate issue, chunked at 50 aliases per request (buildable candidate sets are small, so one chunk is the norm) — and attach `blockedBy: [ids]` (the open blockers' numbers from each alias's `blockedBy.nodes`). A candidate whose node is missing or errored inside an otherwise-successful batch response gets **nothing attached** for that id only — never coerce a failed node to `[]`, since an empty array means "confirmed no blockers" and the mismatch detection below runs on exactly that distinction. Before the fetch, check field availability via `capabilities-probe.js`'s `probeSchema` (the `blockedBy` field itself — its count-only sibling `issueDependenciesSummary` is insufficient); probe unavailability or whole-fetch failure degrades to the body-text fallback with one failure-only narration line (per this file's failure-only narration rule), never a hard stop.
  - **`work-backend: local-files`**: attach `facets.blockedBy` as the `blockedBy` array — it is already native-shaped data (and `blockersOf`'s own `facets.blockedBy` tier makes this attachment a no-op safety net rather than load-bearing).
  - **`work-links: body-text`**: attach nothing — `blockersOf`'s `parseDependencies` fallback stands.
  - **`unsynced: true` fallback records** (any driver): attach nothing, and their own `facets.blockedBy` is deliberately not consulted — those ids live in the local-record namespace and must never cross-match GitHub issue numbers in the merged set (parent #512 promise F1; `funnelBuckets` applies the same rule).

```bash
node -e "
  const { rankNextToBuild } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/ranking.js');
  const candidates = require('/tmp/backlog-overview-candidates.json'); // [{id, facets, body, keyFiles, hasPlan}]
  console.log(JSON.stringify(rankNextToBuild(candidates)));
" > /tmp/backlog-overview-ranked.json
```

### Dependency-mismatch detection

- Run `findUnresolvedDependencyProse` (from `ranking.js`) over the candidates. On any hit, render a loud flag naming the affected ids with their `mention` lines, and **suppress every chain-shaped claim** about them ("unblocks N", dependency-order phrasing) — no corrected chain is drawn (chain rendering is the batch-emitter sub-issue).
- The accepted limitation, verbatim: the check fires only on empty resolved blockers; a *partially* wired record (non-empty `blockedBy` missing some prose-mentioned id) is not flagged — prose mentions have no mechanical ground truth, so partial-coverage checking would guess.
- **Headline-replacement rule:** when detection fires, the flagged candidates get no mechanical recommendation. Either (a) the output cites explicit dependency evidence it holds — native links on other candidates, the flagged records' own prose — as a **corrected** "Recommended next" with the citation inline, in which case the corrected pick IS the headline and the raw ranker pick demotes to a one-line footnote (never render a recommendation the same output retracts); or (b) when no such evidence resolves an order, the output states plainly that ranking is unreliable for the flagged set and points at `/claude-tweaks:backlog refine`'s dependency repair.
- A worked example tracing the observed #418/#419/#420 failure: three records wired `#420 blocked-by #419 blocked-by #418` in the native graph, bodies carrying only prose mentions ("Hard prerequisites, wired as Blocked by links: …"). Pre-#514: bodies parse as zero-dependency, `rankNextToBuild` recommends #420 (the chain's *last* record) first. Post-#514: the native fetch attaches `blockedBy: [419]`/`[418]`/`[]`, the ranker sees the true order, and #418 heads the recommendation; had the fetch failed, `findUnresolvedDependencyProse` flags all three (prose mention, empty resolution) and case (b) replaces the headline with the unreliable-ranking statement.

Render the top result (and up to 2 runners-up) as a short "Recommended next" callout above the funnel header, with a one-line rationale derived from which tie-break criterion decided it (e.g. "highest priority, unblocks 2 other records" or "smallest size among same-priority candidates with no file overlap") — except when the dependency-mismatch detection above fired: flagged candidates get no mechanical recommendation, and the headline follows the headline-replacement rule (corrected pick, or the case-(b) unreliable-ranking statement) instead. This section is scoped specifically to *which backlog/ready record deserves attention next* — it does not attempt to replace `/help`'s whole-pipeline status/recommendation role.

## Step 4: Hand-off block (contextual)

When a lens's output has a natural actionable batch, offer a stage-aware hand-off block as part of Next Actions rather than always rendering one:

- `ready` + `auto:build`-granted records → `/claude-tweaks:dispatch #N,#M,...`
- `backlog`-stage records to parallelize shaping on → a multi-terminal block, one `/claude-tweaks:specify #N` per column:

```
# Terminal 1                          # Terminal 2                          # Terminal 3
/claude-tweaks:specify #201           /claude-tweaks:specify #205           /claude-tweaks:specify #210
```

- A selection spanning both stages — split it by stage and render **both** blocks in the same Next Actions turn, never picking only one and silently dropping the other subset's records.
