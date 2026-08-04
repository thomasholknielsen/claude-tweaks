# Help — Pipeline Status Scan

Stage-by-stage scan procedure run by `/claude-tweaks:help` (default invocation, or `status` argument). Lazy-loaded from `SKILL.md` Section 2.

## Execution model

Stages split by cost. Stages 1, 4.5, 4.6, and 4.7 each do real `gh` work over an independent data source and carry substantial inlined `_shared/` fragments, so each earns a Task agent. Stages 2, 5, 6, and 7 are a glob or a grep apiece — dispatching those as agents would pay the full inherited `CLAUDE.md` cost to execute what amounts to a single `Glob`, so they run directly in the main thread instead.

> **Parallel execution:** Dispatch Stages 1, 4.5, 4.6, and 4.7 as parallel Task agents — each stage scans an independent data source and returns counts, flags, and recommendations. The orchestrator assembles the dashboard after all agents complete.
>
> **Contract:** Each agent follows `_shared/subagent-output-contract.md` — minimal input (scope + path + literal output template, no conversation), status line first (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`), then Template A.
>
> **Model tier:** Fast (Haiku) — each stage scan is a mechanical `gh`/facet-parse over a single data source (the open work-record queue, current PR via gh). No synthesis at the per-stage level; the orchestrator assembles the dashboard.
>
> **Output template (each agent must follow exactly):**
>
> ```markdown
> OUTPUT FORMAT (required):
> Return ONLY a markdown table, no preamble:
>
> | Severity | Path:Line | Finding | Evidence |
> |---|---|---|---|
> | medium | (work records) | Backlog: 14, 3 stale | 3 records' `updatedAt` are older than the `record-staleness-weeks` threshold |
>
> Severity scale: critical / high / medium / low / info
> If no findings: return literal text "No findings."
> Return at most 15 rows, highest severity first; if more were found, append a final row reading "+N more" with the count in place of N — never omit this row when findings exceed the cap.
> Do not add narration, headers, or summaries before or after the table.
> ```

> **Parallel execution:** Use parallel tool calls aggressively — all `Glob`/`Grep` operations in Stages 2, 5, and 6 are independent and should run concurrently.

Issue those Stage 2/5/6 tool calls in the same message that dispatches the agent batch above — they depend on neither it nor each other, so the whole batch overlaps. Being in the main thread, they need no status line and no agent envelope; they contribute findings to the dashboard using the same column mapping as the agents.

**Stage 7 runs last, in the main thread**, only once the agent batch and the Stage 2/5/6 calls have all returned. Several of its signals are derived from their output (Stage 1's backlog count, Stage 2's unspecified-design-doc count, Stage 4.5's stale-PR count); the rest are cheap local checks of its own. It must never be made concurrent with its own inputs.

**Dispatcher column mapping (status-scan use):** Severity = recommendation urgency (`info` for nothing-to-do, `low` for routine, `medium` for needs-attention, `high` for blocking). Path:Line = the artifact (`#{n}` / the local record path under `work-backend: local-files`, `docs/journeys/checkout.md`, etc.). Finding = the count or flag (`14 items, 3 stale`). Evidence = the specific items or signals.

## Stage 1: Work Records (backlog / parked / ready / authorized / building / blocked)

Replaces the former INBOX scan, Deferred-Work scan, Specs-Ready-to-Build scan, and Specs-In-Progress scan — all four read `specs/backlog/*.md` frontmatter or the old spec index and `specs/*.md` files directly. The record store is the current landscape now; there is no separate index file or backlog directory to read (`_shared/work-record.md`). One list call + one facet parse computes every count below.

Fetch and facet-parse the queue per `_shared/record-queue-fetch.md` — the dispatcher inlines that file's `work-backend` resolution, both drivers' fetch commands, and the Staleness clock and Threshold resolution sections into this agent's prompt (the same pattern already used for `_shared/github-pr-scan.md`), with `{tmp-records-file}` = `/tmp/help-records.json`, `{tmp-faceted-file}` = `/tmp/help-records-faceted.json`, and `{EXTRA_FIELDS}` = `,body` on the `github-issues` driver — `body` rides along on this one `gh issue list --state open` round-trip because this same fetch also feeds Conflict detection below, instead of opening a second round-trip just for that.

**Fail-open behavior** (`work-backend: github-issues` only): if the `gh issue list` fetch fails — `gh` unavailable, unauthenticated, or the repo has no GitHub remote — Stage 1 fails open, the same posture as Stages 4.5/4.6/4.7 below: emit a single info row (`Work-record scan skipped — {reason}`) instead of BLOCKED. All six counts and the Conflict-detection sub-section are treated as unavailable for this run, and the dashboard's Work Records and Ready-to-Build sections are omitted (same omission convention already used for an empty pipeline) rather than rendering zeros. `work-backend: local-files` has no equivalent failure mode — its fetch reads the local record store directly, not `gh`.

Both drivers land in the same faceted-record shape (`{ ..., facets }`) at `/tmp/help-records-faceted.json`. The six-bucket classification below is `/help`'s own consumer-specific logic, described once here and run identically against either driver's output:

```bash
WEEKS="${RECORD_STALENESS_WEEKS:-4}"
export STALENESS_WEEKS="$WEEKS"
node -e "
  const { isBacklog, isParked, isBotBlocked, isBotInProgress, classifyStaleness } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record-buckets.js');
  const records = require('/tmp/help-records-faceted.json');
  const now = Date.now();
  const thresholdMs = Number(process.env.STALENESS_WEEKS) * 7 * 24 * 60 * 60 * 1000;
  const blocked = records.filter((r) => isBotBlocked(r));
  const building = records.filter((r) => !isBotBlocked(r) && isBotInProgress(r));
  const authorized = records.filter((r) => !isBotBlocked(r) && !isBotInProgress(r) && r.facets.stage === 'ready' && (r.facets.grants.build || r.facets.grants.merge));
  const ready = records.filter((r) => !isBotBlocked(r) && !isBotInProgress(r) && r.facets.stage === 'ready' && !r.facets.grants.build && !r.facets.grants.merge);
  const parked = records.filter((r) => !isBotBlocked(r) && !isBotInProgress(r) && isParked(r));
  const backlog = records.filter((r) => !isBotBlocked(r) && !isBotInProgress(r) && isBacklog(r));
  const stale = backlog.filter((r) => r.updatedAt && classifyStaleness(now - Date.parse(r.updatedAt), thresholdMs) === 'stale');
  const wakeReady = parked.filter((r) => r.milestone && r.milestone.dueOn && Date.parse(r.milestone.dueOn) < now);
  console.log(JSON.stringify({
    backlog: backlog.length, backlogStale: stale.length,
    parked: parked.length, parkedWakeReady: wakeReady.length,
    ready: ready.length, authorized: authorized.length,
    building: building.length, blocked: blocked.length,
  }));
"
```

`building` and `blocked` are always 0 under `local-files` — the local driver carries no bot state (`_shared/work-record.md`). `authorized` still counts: grants are recorded as frontmatter for isomorphism even though no headless consumer acts on them under this driver (`backlog/SKILL.md`'s Preflight). `local-files` records carry no `updatedAt`/`milestone` field, so this script's `backlogStale`/`parkedWakeReady` naturally come back 0 for that driver — see "Staleness clock" and "Wake-ready sub-count" below for what this driver reports instead.

**Staleness clock** (backlog sub-count): per `_shared/record-queue-fetch.md`'s Staleness clock and Threshold resolution sections — `github-issues` uses the query's own `updatedAt`, as computed above; `local-files` uses the record file's own last-commit date, applied per backlog record here.

**Wake-ready sub-count** (parked, milestone due in the past) is a cheap heuristic, not full trigger evaluation — a `local-files` parked record's trigger lives as body prose (`**Trigger:**`/`**Watched paths:**` lines), too expensive to read per-record on a dashboard pass. Omit the sub-count under this driver and report the bare `parked` count only. Full trigger evaluation (including watched-path `git log` checks on both drivers) stays `/claude-tweaks:tidy`'s job — this is a maintenance signal, not a substitute.

**Solution-baked title flag:** scan every `backlog`-bucket record's `title` (already fetched above — no extra call) for solution-oriented phrasing per `SKILL.md` Section 3's criteria (a specific technology named as the fix, or the problem framed as a solution). Flag matches in the Needs Attention table as `/claude-tweaks:challenge` candidates — this is a title-only signal, not the full debiasing judgment `/claude-tweaks:challenge` itself performs against the whole record.

### Conflict detection (file overlap)

Feeds from open **in-flight** records — any record with `facets.stage === 'ready'` (covers the ready, authorized, building, and blocked sub-states alike: the `ready` label persists for a record's entire life once shaped, and is never removed by `/claude-tweaks:dispatch`, `/claude-tweaks:build`, `/claude-tweaks:flow`, or `/claude-tweaks:wrap-up` — `_shared/work-record.md`'s permission matrix). Backlog and parked records are never spec-shaped, so they carry no `### Key Files` subsection and would contribute nothing to the map — same reasoning `/claude-tweaks:specify`'s Step 1 File Reference Map documents — so skip them.

`work-backend: github-issues`: filter Stage 1's already-fetched `/tmp/help-records-faceted.json` to `facets.stage === 'ready'` — its `body` field (fetched in Stage 1's `gh issue list` call above) is already populated, so no second `gh issue list --state open` call is needed:

```bash
node -e "
  const records = require('/tmp/help-records-faceted.json');
  const inFlight = records.filter((r) => r.facets.stage === 'ready');
  console.log(JSON.stringify(inFlight));
" > /tmp/help-inflight-bodies.json
```

`work-backend: local-files`: `queryRecords('specs', { stage: 'ready' })` returns matching records with `.body` already populated — no separate fetch.

Extract the `### Key Files` subsection (under `## Technical Approach`, per `spec-template.md`'s record body template) from every returned body — the same extraction `/claude-tweaks:specify` Step 1 performs — to build `/tmp/help-records-key-files.json` as `[{id, keyFiles}]` (`id` is the issue number, or the local record id). Then call the shared grouping primitive:

```bash
node -e "
  const { groupByFileOverlap } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/grouping.js');
  const items = require('/tmp/help-records-key-files.json');
  const conflicts = groupByFileOverlap(items).filter((g) => g.length > 1);
  console.log(JSON.stringify(conflicts));
"
```

A record appearing in any group of size > 1 shares files with another open in-flight record — flag it in the Needs Attention table, listing the other group members as the conflicting records.

> **Algorithm shared with `/claude-tweaks:specify`:** both skills call the same `groupByFileOverlap` (`bin/lib/issues/grouping.js`) — `/claude-tweaks:specify` runs it at creation time; `/claude-tweaks:help` re-runs it at dashboard time to catch new conflicts from records that started building since then.

**Ranking `ready` + `authorized` records for the render below.** For each candidate — Stage 1's `ready` and `authorized` buckets combined — compute the two inputs `ranking.js`'s `rankNextToBuild` needs but doesn't compute itself: `keyFiles` (extract the `### Key Files` subsection from the body, the same extraction Conflict detection above performs) and `hasPlan` (`true` if `docs/superpowers/plans/` contains a file whose name references the record's id/slug — a filename-pattern check, not a content read). `body` is already present from Stage 1's fetch.

```bash
node -e "
  const { rankNextToBuild } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/ranking.js');
  const candidates = require('/tmp/help-ready-authorized-candidates.json'); // [{id, facets, body, keyFiles, hasPlan}]
  console.log(JSON.stringify(rankNextToBuild(candidates)));
"
```

The table below renders in this ranked order, not the fetch's own order.

Emit one Template A row for the six counts (Finding: `backlog {N} ({M} stale) / parked {N} ({M} wake-ready) / ready {N} / authorized {N} / building {N} / blocked {N}`), plus one row per conflict group, one row per solution-baked-title backlog record, and one row carrying the ranked `ready`+`authorized` order computed above (Finding: the ordered `{ref}` list) so the Ready to Build table can render in that order.

There is no Stage 1.5, Stage 3, or Stage 4 — they merged into Stage 1 above (their data sources — `specs/backlog/*.md`, the old spec index, and `specs/*.md` frontmatter — are retired). The rest of the numbering (Stage 2, 4.5, 4.6, 4.7, 5, 6, 7) is unchanged, so existing cross-references — including this file's own later stages and `SKILL.md`'s Priority Order — keep pointing at the right stage.

## Stage 2: Design Docs (`docs/superpowers/specs/*-design.md`)

*(Main thread — one `Glob` plus a heading check per hit. Runs concurrently with the agent batch.)*

- Find design docs that still exist (full decomposition deletes the doc, so any surviving doc is either un-decomposed or partially decomposed)
- For each surviving doc, check whether it has `## Phase N:` headings:
  - No phase headings → never decomposed, waiting for `/claude-tweaks:specify`
  - Has phase headings but at least one lacks a matching `## Phase N: Specified` marker → partially decomposed, the unmarked phases are still waiting for `/claude-tweaks:specify`
- These are brainstorming outputs waiting for `/claude-tweaks:specify`

## Stage 4.5: Current PR (GitHub)

Scan per `_shared/github-pr-scan.md`, **`current-pr`** scope. The dispatcher inlines that file's Detection Ladder, `current-pr` scope section, and Output Contract into this agent's prompt — subagents cannot read sibling files.

- Detection ladder runs first — any failure emits a single info row (`GitHub scan skipped — {reason}`) and the stage completes normally (fail-open, never BLOCKED)
- Current branch's PR: review decision, failing/pending CI checks, unresolved review-thread count, linked issues
- Repo-wide stale-PR count (total open, count stale) — routed to Stage 7's maintenance signals, not the Current PR dashboard section
- No PR on the branch → single info row (`No open PR for current branch`); the dashboard omits the Current PR section

## Stage 4.6: Triage Queue (GitHub)

Cheap counts only — detail stays `/claude-tweaks:backlog`'s and `/tidy`'s job,
not `/help`'s. Skip silently (same fail-open detection ladder as Stage 4.5)
when `gh` is unavailable, unauthenticated, or the repo has no GitHub remote.

Scan per `_shared/github-pr-scan.md`, **`triage-queue`** scope. The dispatcher inlines that file's Detection Ladder, `triage-queue` scope section, and the three-line render format into this agent's prompt — subagents cannot read sibling files. This is the single source for these three counts; this stage does not compute them independently (previously it did, and its own version double-counted `status:blocked` issues inside "pending authorization" — the shared scope excludes them). Origin-agnostic: every `ready` record counts toward pending authorization regardless of origin (health-filed, captured, or human-filed, with or without a `by:*` label) — matching `/claude-tweaks:backlog refine`'s own origin-agnostic `ready`-queue pull, which tiers no health-skill origin specially.

## Stage 4.7: Acceptance Queue (GitHub)

Cheap list only — the walkthrough stays `/claude-tweaks:demo`'s job, not `/help`'s. `/demo` no
longer sweeps the `demo:pending` backlog itself (it resolves a single item per invocation — this
session's own recall-detected work, or one explicit `#N`), so this stage is the sole discovery
surface for which records are outstanding. Skip silently (same fail-open detection ladder as
Stage 4.5/4.6) when `gh` is unavailable, unauthenticated, or the repo has no GitHub remote.

Scan per `_shared/github-pr-scan.md`, **`acceptance-queue`** scope. The dispatcher inlines that
file's Detection Ladder, `acceptance-queue` scope section, and one-line render format into this
agent's prompt — subagents cannot read sibling files.

## Stage 5: Specs Awaiting Review

*(Main thread — runs concurrently with the agent batch.)*

- Find specs that appear fully implemented but haven't been reviewed yet
- These need `/claude-tweaks:review` before `/claude-tweaks:wrap-up`

## Stage 6: Specs Awaiting Wrap-Up

*(Main thread — runs concurrently with the agent batch.)*

- Find specs that have been reviewed (review commits/artifacts exist) but not wrapped up

## Stage 7: Maintenance Signals

*(Main thread, and last — this stage reads other stages' output, so it runs only after the agent batch and Stages 2/5/6 have all returned. See the Execution model above.)*

- Backlog has 10+ records → suggest `/claude-tweaks:tidy`
- Stage 4.5 reports stale open PRs (>4 weeks without updates) → suggest `/claude-tweaks:tidy` (Step 4.8 audits the PR backlog)
- Plans older than 4 weeks with no matching spec progress → flag
- More than 3 design docs unspecified → suggest a `/claude-tweaks:specify` session
- Doc registry exists but has stale entries or gaps → suggest `/claude-tweaks:tidy` (Step 4.6 audits registry health)
- No doc registry exists but `docs/` has files → suggest `/claude-tweaks:init update` to create registry

## Present Dashboard

```markdown
## Workflow Status

### Pipeline
| Stage | Count | Action |
|-------|-------|--------|
| Design docs unspecified | {N} | `/claude-tweaks:specify {topic}` |
| Specs awaiting review | {N} | `/claude-tweaks:review {number}` |
| Specs awaiting wrap-up | {N} | `/claude-tweaks:wrap-up {number}` |

### Work Records (backlog / parked / ready / authorized / building / blocked)

*(Omit this section entirely when the work-record scan was skipped (Stage 1's fail-open case), or when all six counts are 0 — an empty pipeline, matching the Triage Queue section's own omission convention.)*

- Backlog: **{N}** ({M} stale, untouched longer than the configured `record-staleness-weeks` threshold) — `/claude-tweaks:capture` to add, `/claude-tweaks:tidy` to review stale ones
- Parked: **{N}** ({M} wake-ready — milestone due) — `/claude-tweaks:tidy` to re-evaluate triggers
- Ready (pending authorization): **{N}** — `/claude-tweaks:backlog refine` to review and grant
- Authorized: **{N}** — `/claude-tweaks:dispatch` (headless) or `/claude-tweaks:build #{n}` (direct)
- Building: **{N}** — resume `/claude-tweaks:build`/`/claude-tweaks:flow`, or check status
- Blocked (`bot:blocked`): **{N}** — `/claude-tweaks:backlog refine` to re-authorize

### Current PR — #{N} {title}

*(Omit this section when Stage 4.5 reports no open PR or the GitHub scan was skipped.)*

| Signal | State | Action |
|--------|-------|--------|
| Review decision | {APPROVED / CHANGES_REQUESTED / REVIEW_REQUIRED} | {Address review threads / —} |
| CI checks | {N failing, M pending} | {Fix before merge / —} |
| Unresolved threads | {N} | {Address or resolve / —} |
| Linked issues | {#12, #14} | Closed on merge |

### Triage Queue

*(Omit this section entirely when the GitHub scan was skipped, or when all three counts are 0.)*

- Pending authorization: **{N} records awaiting your decision** — run `/claude-tweaks:backlog refine` (omit this line when N is 0)
- Blocked: **{N} records hit their retry ceiling** — run `/claude-tweaks:backlog refine` to review (omit this line when N is 0)
- Auto-merged this week: **{N} auto-merges** on the default branch in the last 7 days (omit this line when N is 0)

### Acceptance Queue

*(Omit this section entirely when the GitHub scan was skipped, or the count is 0.)*

- Awaiting sign-off: **{N} records** — #{n1} ({title1}), #{n2} ({title2}), ... — run `/claude-tweaks:demo #N` on any of these

### Ready to Build (priority order)

*(Omit this section entirely when the work-record scan was skipped (Stage 1's fail-open case), or when both buckets are 0.)*

| Record | Title | Risk / Effort | Status | Has Plan? |
|--------|-------|----------------|--------|-----------|
| {ref} | {title} | {risk}/{effort} | ready / authorized | {yes/no} |

`{ref}` is `#{n}` under `work-backend: github-issues`, the bare record id under `local-files`. Rows come from Stage 1's `ready` and `authorized` buckets, ordered per `SKILL.md` Section 3's Tie-Breaking rules, capped at `--budget` rows (default 10 — see `SKILL.md`'s `## Input` section). If more rows exist than the budget allows, append one line below the table: "`{remaining}` more ready/authorized records exist beyond this run's `--budget {N}` — re-run `/claude-tweaks:help --budget {N}` to see more."

### Needs Attention
| Item | Issue | Suggested Action |
|------|-------|-----------------|
| {item} | {issue} | {action} |

Capped at `--budget` rows (default 10), same overflow-note convention as Ready to Build above. Order flagged items by severity (high → low, using the same scale from the dispatch contract above) before truncating, so the most actionable items survive the cap.
```
