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
recommendation's population can never drift apart. One limitation on that guarantee: the funnel
header's own `granted`/`dispatchable` split (Step 2) resolves blockers from body-text/`facets`
data only — native `blockedBy` attachment happens here, in Step 3 — so on a `work-links: native`
repo a natively-blocked record can still render `dispatchable` in the header even though this
step's native fetch would resolve it as blocked. Header-level native resolution is deliberately
out of this record's scope (captured as a follow-up record). For each candidate, compute the three inputs `ranking.js`'s `rankNextToBuild` needs but doesn't compute itself:

- `keyFiles` — extract the `### Key Files` subsection from the body, the same extraction `/help`'s Conflict detection sub-section already performs.
- `hasPlan` — `true` if `docs/superpowers/plans/` contains a file whose name references this record's id/slug (a simple filename-pattern check, not a content read).
- `body` — already present from Step 1's fetch (needed for `blockersOf`'s body-text `parseDependencies` fallback, used when no `blockedBy` is attached).
- `blockedBy` — resolved per `work-links`/`work-backend`:
  - **`work-links: native`** (resolve via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values work-links`): fetch every candidate's blocked-by set as **one aliased GraphQL query** using `buildNativeDependencyQuery` (`bin/lib/issues/record.js`) — one alias per candidate issue, chunked at 50 aliases per request (buildable candidate sets are small, so one chunk is the norm) — and attach `blockedBy: [ids]` (the open blockers' numbers from each alias's `blockedBy.nodes`). A candidate whose node is missing or errored inside an otherwise-successful batch response gets **nothing attached** for that id only — never coerce a failed node to `[]`, since an empty array means "confirmed no blockers" and the mismatch detection below runs on exactly that distinction. When any alias in an otherwise-successful batch failed, render one failure-only narration line naming exactly those ids (e.g. `blocker data incomplete for #12, #40 — node fetch failed; they rank on body-text fallback this run`) — same failure-only narration rule, per-node granularity, so a prose-less native record hit by a per-node failure doesn't degrade silently. Before the fetch, check field availability via `capabilities-probe.js`'s `probeSchema` (the `blockedBy` field itself — its count-only sibling `issueDependenciesSummary` is insufficient); probe unavailability or whole-fetch failure degrades to the body-text fallback with one failure-only narration line (per this file's failure-only narration rule), never a hard stop.
  - **`work-backend: local-files`**: attach `facets.blockedBy` as the `blockedBy` array — it is already native-shaped data (and `blockersOf`'s own `facets.blockedBy` tier makes this attachment a no-op safety net rather than load-bearing).
  - **`work-links: body-text`**: attach nothing — `blockersOf`'s `parseDependencies` fallback stands.
  - **`unsynced: true` fallback records** (any driver): attach nothing, and their own `facets.blockedBy` is deliberately not consulted — those ids live in the local-record namespace and must never cross-match GitHub issue numbers in the merged set (parent #512 promise F1; `funnelBuckets` applies the same rule).

```bash
node -e "
  const { rankNextToBuild, findUnresolvedDependencyProse } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/ranking.js');
  const candidates = require('/tmp/backlog-overview-candidates.json'); // [{id, facets, body, keyFiles, hasPlan, blockedBy?}]
  console.log(JSON.stringify({ ranked: rankNextToBuild(candidates), flags: findUnresolvedDependencyProse(candidates) }));
" > /tmp/backlog-overview-ranked.json
```

### Dependency-mismatch detection

- Read the `flags` array from `/tmp/backlog-overview-ranked.json` (computed above, in the same pass as `ranked` — `findUnresolvedDependencyProse`, from `ranking.js`). On any hit, render a loud flag naming the affected ids with their `mention` lines, and **suppress every chain-shaped claim** about them ("unblocks N", dependency-order phrasing) — no corrected chain is drawn (chain rendering is the batch-emitter sub-issue).
- The accepted limitation, verbatim: the check fires only on empty resolved blockers; a *partially* wired record (non-empty `blockedBy` missing some prose-mentioned id) is not flagged — prose mentions have no mechanical ground truth, so partial-coverage checking would guess.
- **False-positive expectation:** the prose regex is deliberately broad (same-line intervening words allowed between "blocked by" and the `#N`), so non-dependency mentions can flag too — e.g. "blocked by the outage, see #12" is not a real dependency but still matches. The rendered `mention` line is exactly the human's evidence to dismiss a false positive at a glance; a false negative here would instead be the silent mis-ranking this detection exists to prevent, so the check accepts occasional over-flagging rather than risk under-flagging.
- **Headline-replacement rule:** when detection fires, the flagged candidates get no mechanical recommendation. Either (a) the output cites explicit dependency evidence it holds — native links on other candidates, the flagged records' own prose — as a **corrected** "Recommended next" with the citation inline, in which case the corrected pick IS the headline and the raw ranker pick demotes to a one-line footnote (never render a recommendation the same output retracts); or (b) when no such evidence resolves an order, the output states plainly that ranking is unreliable for the flagged set and points at `/claude-tweaks:backlog refine`'s dependency repair.
- A worked example tracing the observed #418/#419/#420 failure: three records wired `#420 blocked-by #419 blocked-by #418` in the native graph, bodies carrying only prose mentions ("Hard prerequisites, wired as Blocked by links: …"). Pre-#514: bodies parse as zero-dependency, `rankNextToBuild` recommends #420 (the chain's *last* record) first. Post-#514: the native fetch attaches `#420→blockedBy:[419]`, `#419→blockedBy:[418]`, `#418→blockedBy:[]`; `computeUnblocksCount` then yields `418→1, 419→1, 420→0`, so #420 — the record the old path recommended first — drops to last, while #418 and #419 tie at 1. That residual tie (including the fact that a blocked candidate is not demoted by ranking — #419 is itself blocked by #418, yet ties with it) is left to the batch-emitter sub-issue's chain-aware ordering. Had the fetch failed instead, `findUnresolvedDependencyProse` flags all three (prose mention, empty resolution) and case (b) replaces the headline with the unreliable-ranking statement.

Render the top result (and up to 2 runners-up) as a short "Recommended next" callout above the funnel header, with a one-line rationale derived from which tie-break criterion decided it (e.g. "highest priority, unblocks 2 other records" or "smallest size among same-priority candidates with no file overlap") — except when the dependency-mismatch detection above fired: flagged candidates get no mechanical recommendation, and the headline follows the headline-replacement rule (corrected pick, or the case-(b) unreliable-ranking statement) instead. This section is scoped specifically to *which backlog/ready record deserves attention next* — it does not attempt to replace `/help`'s whole-pipeline status/recommendation role.

## Step 4: Batch emitter (bare mode)

**Input precondition:** the dispatch-block candidate set is `funnelBuckets`'s `dispatchable` ∪
`granted` (Step 2's `.funnel` — already filtered; `needs:definition` records structurally can't be
in it since they never reach `ready`; the Shape block's own human-owed filtering belongs to the
needs-you sub-issue). The Shape block's population is the `scored` bucket (records shaped next);
the Score line's count is the `captured` bucket.

Compute the batch's graph structure, transitive payout, and file-overlap groups in one pass,
extending Step 3's outputs:

```bash
node -e "
  const { buildChains, transitiveUnblocksCount } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/ranking.js');
  const { groupByFileOverlap } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/grouping.js');
  const candidates = require('/tmp/backlog-overview-candidates.json');
  console.log(JSON.stringify({
    graph: buildChains(candidates),
    payout: Object.fromEntries(transitiveUnblocksCount(candidates)),
    overlapGroups: groupByFileOverlap(candidates.map((c) => ({ id: c.id, keyFiles: c.keyFiles || [] }))),
  }));
" > /tmp/backlog-overview-emitter.json
```

**Ordering rule:** one combined ranking over dependency components and independents alike — sort
key: the component head's `transitiveUnblocksCount` (an independent is its own head; usually 0)
descending, then priority, then size, ties by id. No chains-first-then-independents grouping.

**Render:** one fenced paste block per funnel stage that has members, exactly these templates:

```
── Score the rest ──
# {captured-count} unscored records
/claude-tweaks:backlog refine
```

```
── Shape next ──
# Terminal 1 — priority:{tier} — {one-line hook}
/claude-tweaks:specify #{N}
# Terminal 2 — priority:{tier} — {one-line hook}
/claude-tweaks:specify #{M}
```

```
── Dispatch now ──
# Terminal 1 — chain: #A ─▶ #B ─▶ #C (head unblocks {n})
/claude-tweaks:flow #A,#B,#C
# Terminal 2 — independent
/claude-tweaks:flow #D
```

Prose rules: the Score line's count is comment-only (`refine` has no count flag); Shape lines are
priority-ordered, one record per terminal; a chain emits as **one** multi-ref
`/claude-tweaks:flow #A,#B,#C` command listing every member in dependency order (one command per
chain, never head-only — flow's multi-ref form runs them as a sequential pipeline); independents
get their own terminals with plain `/claude-tweaks:flow #N`. All commands fully qualified.

**Batch integrity rules:**

- **Overlap serialization** — records `groupByFileOverlap` groups together never appear in
  different concurrent terminal blocks. Deciding criterion: members of the same dependency
  component are already serialized in one terminal by construction; a file-overlap group spanning
  different components/independents serializes them into one terminal when they are few (≤3
  combined), otherwise excludes the lower-ranked with a `#`-comment naming the conflict. Group
  membership is transitive — treat membership, not pairwise overlap, as the signal.
- **Claim exclusion** — `bot:in-progress`/claimed records are excluded from every block, one
  `#`-comment reason each (e.g. `# #472 skipped — bot:in-progress`), and counted in the funnel's
  `in flight` stage. The claim snapshot is read-only and may go stale between render and paste;
  that staleness is accepted risk, resolved downstream by `/claude-tweaks:dispatch`/
  `/claude-tweaks:flow`'s own claim-taking at execution time — never read this scan as a
  completeness guarantee, and never instruct taking a claim from this report.
- **No silent caps** — anything excluded or truncated is named with a count.
- **No terminal cap** — blocks emit in ranked order; the human takes the top *k*.
- **Flagged records** — records flagged by the dependency-mismatch detection (Step 3's `flags`)
  render as plain independents: no `─▶` arrows, own terminal, with a `#`-comment naming the
  suppressed chain and pointing at `/claude-tweaks:backlog refine`'s dependency repair — never
  silently dropped (dropping would violate the no-silent-caps rule above).

**Two-channel contract + `Next:` line:** paste blocks carry agent-executable/unattended commands
only; the `AskUserQuestion` menu carries this-session moves only (run refine here, open a lens,
dispatch the top chain here) and is never the delivery channel for other-terminal command lists —
terminal-command lists inside `AskUserQuestion` options are forbidden. The report body ends with a
single `Next:` line: one sentence naming the top-ranked action, always exactly one. Fallback ladder
when `dispatchable` is empty: the top action of the highest-precedence non-empty stage (grant →
specify → refine), ties broken by id; when every stage is empty, the literal `Next: backlog is empty`.
The menu's `(Recommended)` option MUST match the `Next:` line — one source of truth.
