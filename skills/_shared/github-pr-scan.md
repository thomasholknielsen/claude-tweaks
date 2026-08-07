# GitHub PR Scan — Shared Procedure

Single source of truth for scanning GitHub pull-request and issue state. Consumed by `/claude-tweaks:help` (Stage 4.5, **`current-pr`** scope; Stage 4.6, **`triage-queue`** scope; Stage 4.7, **`acceptance-queue`** scope) and `/claude-tweaks:tidy` (Step 4.8, **`repo-wide`** scope; Step 4.8, **`acceptance-gap`** scope). Subagents cannot read this file — the dispatcher inlines the relevant scope section, plus the Detection Ladder and Output Contract, into the scan agent's prompt (the same pattern as `tidy/scan-procedures.md`).

Every `gh issue list`/`gh pr list` call below carries an explicit `--limit` — `gh`'s implicit default is 30, which silently truncates instead of erroring. A result count landing exactly at the stated limit means the scan may be incomplete; treat that as a signal to narrow the query (a tighter label/state filter) or re-run with a higher `--limit`, not as a final count.

## Detection Ladder (fail-open)

Run these checks in order before any scan. On the first failure, emit the single info row shown and stop — a skipped GitHub scan is normal, never a `BLOCKED` status, never a hard gate.

| # | Check | Command | On failure, emit Finding / Evidence |
|---|-------|---------|-------------------------------------|
| 1 | GitHub remote exists | `git -C "{REPO_ROOT}" remote get-url origin` exits 0 (any host — no longer string-matched against `github.com`, which false-negated on GitHub Enterprise hosts like `github.mycompany.com`) | `GitHub scan skipped` / `no GitHub remote` |
| 2 | gh CLI installed | `command -v gh` exits 0 | `GitHub scan skipped` / `gh CLI not installed` |
| 3 | gh authenticated + repo reachable | `gh repo view --json owner,name` exits 0 (resolves the host from the remote automatically — works identically for github.com and GitHub Enterprise once authenticated for that host; replaces the old bare `gh auth status` check) | `GitHub scan skipped` / `gh not authenticated or repo unreachable` |

The skip row uses severity `info` and Path:Line `(github)`.

Individual `gh` command failures mid-scan (rate limit, network, transient API errors) degrade to a `DONE_WITH_CONCERNS` status line with whatever partial results exist — never `BLOCKED`.

`{REPO_ROOT}` resolves via `git rev-parse --show-toplevel` in the dispatcher before the agent fires (see Working Directory Discipline in `_shared/subagent-output-contract.md`).

## Staleness Thresholds

Keyed on `updatedAt`. Same scale as /tidy's backlog-record audit:

| Age since last update | Classification |
|----------------------|----------------|
| < 2 weeks | Fresh |
| 2-4 weeks | Review |
| > 4 weeks | Stale |

## Scope: `current-pr` (consumed by /help Stage 4.5)

Deep scan of the current branch's PR only, plus one cheap repo-wide count.

1. **PR lookup** — `gh pr view --json number,title,isDraft,reviewDecision,statusCheckRollup,closingIssuesReferences,url`. Non-zero exit means no PR for the current branch → emit one info row (`No open PR for current branch`), then run item 4 only.
2. **Unresolved review threads** — resolve `{owner}` and `{repo}` via `gh repo view --json owner,name -q '.owner.login + " " + .name'`, `{number}` from item 1, then run exactly:

   ```bash
   gh api graphql -f query='query($owner:String!,$repo:String!,$pr:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$pr){reviewThreads(first:100){nodes{isResolved}}}}}' -f owner='{owner}' -f repo='{repo}' -F pr={number} --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not)] | length'
   ```

3. **CI checks** — `gh pr checks {number}` → count failing / pending / passing. Exit code 8 means checks are still pending; a non-zero exit that still lists checks is valid output, not a scan failure.
4. **Repo-wide stale count (maintenance signal only)** — `gh pr list --state open --json number,updatedAt --limit 100` → total open PRs + count stale per the thresholds above. This row is routed to the caller's maintenance-signals rendering, not the Current PR dashboard section.

Emit `[pr]` rows per the Output Contract.

## Scope: `repo-wide` (consumed by /tidy Step 4.8)

Full sweep of open PRs, `by:code-health`-labelled issues, `by:harness-health`-labelled issues, `by:journey-health`-labelled issues, and `by:docs-health`-labelled issues. Backlog-record findings (stale, parked-trigger, unsynced, needs-scoring, `bot:blocked`, legacy-taxonomy) are `/tidy` Step 1's job now, not this scope's — `repo-wide` no longer queries the retired `backlog` label (see `tidy/scan-procedures.md` Step 1).

> **Parallel execution:** Use parallel tool calls aggressively — items 1, 3, 4, 5, 6, 7, and 8 below, plus each open PR's own review-thread query in item 2, are independent gh/bash calls with no dependency on one another and should run concurrently.

1. **Open PRs** — `gh pr list --state open --json number,title,updatedAt,isDraft,reviewDecision,headRefName,url --limit 100` → classify each per the Staleness Thresholds. A PR that is simultaneously not draft, not yet `Stale` (< 4 weeks since `updatedAt` — spans both the `Fresh` and `Review` bands, since neither currently has its own finding for a PR with nothing wrong), has zero unresolved review threads (item 2 below), and has no failing/pending CI (`gh pr checks`) gets its own finding: `[pr] PR #{n}: {title} — awaiting review — last updated {age} ago, CI {status}, 0 unresolved threads`. This is informational only — see the Severity mapping and `tidy/SKILL.md`'s Step 6 routing below. A PR with failing/pending CI (`gh pr checks`) or `reviewDecision: CHANGES_REQUESTED` instead gets its own finding, regardless of staleness: `[pr] PR #{n}: {title} — CI failing/pending or changes requested — CI {status}, review {reviewDecision}`. This is `high` severity per the Severity mapping below, not informational — see the Findings and recommendations table below.
2. **Unresolved threads per open PR** — the same GraphQL query as `current-pr` item 2, once per open PR.
3. **Code-health issues** — `gh issue list --label by:code-health --state open --json number,title,labels,updatedAt,url --limit 100`.
4. **Merged/closed PRs with local remnants** — `gh pr list --state merged --limit 50 --json number,headRefName` AND `gh pr list --state closed --limit 50 --json number,headRefName` (GitHub's PR `state` is `OPEN`/`CLOSED`/`MERGED` — mutually exclusive — so `--state closed` never overlaps `--state merged`; both queries are needed to cover "merged or closed without merging"); cross-check each `headRefName` from either result against `git -C "{REPO_ROOT}" branch --list` output.
5. **Harness-health issues** — `gh issue list --label by:harness-health --state open --json number,title,labels,updatedAt,url --limit 100`.
6. **Journey-health issues** — `gh issue list --label by:journey-health --state open --json number,title,updatedAt,url --limit 100`.
7. **Docs-health issues** — `gh issue list --label by:docs-health --state open --json number,title,labels,updatedAt,url --limit 100`.
8. **Grant-queue counts** — one self-contained query feeds three maintenance-signal counts, per `_shared/work-record.md`'s record taxonomy. Not gated on `work-backend` — this scope only runs once the Detection Ladder already confirmed a reachable GitHub remote, regardless of which driver stores records:

   ```bash
   gh issue list --state open --json number,title,labels --limit 200 > /tmp/pr-scan-records.json
   node -e "
     const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
     const { isPendingAuthorization } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/pending-authorization.js');
     const issues = require('/tmp/pr-scan-records.json');
     const faceted = issues.map((i) => parseRecordFacets(i.labels));
     const withFacets = issues.map((i, idx) => ({ number: i.number, title: i.title, facets: faceted[idx] }));
     const pending = withFacets.filter((i) => i.facets.stage === 'ready' && isPendingAuthorization(i.facets)).length;
     const blocked = withFacets.filter((i) => i.facets.bot.blocked).length;
     const backlog = withFacets.filter((i) => i.facets.stage === 'backlog').length;
     console.log(JSON.stringify({ pending, blocked, backlog }));
   "
   ```

   - **Pending authorization** — `ready` ∧ no `auto:*` ∧ no `bot:*` (neither `bot:in-progress` nor `bot:blocked`). Origin-agnostic: any record any health skill, `/claude-tweaks:capture`, or a human filed counts, with or without a `by:*` label — matching `/claude-tweaks:backlog refine`'s own origin-agnostic `ready`-queue pull (`skills/backlog/refine-mode.md`), which no longer tiers any health-skill origin specially. This is a maintenance signal only — `/tidy` never grants authorization itself (`/claude-tweaks:backlog refine` owns that).
   - **`bot:blocked`** — records that hit their retry ceiling and need a human's renewed judgment at `/claude-tweaks:backlog refine` before re-entering the autonomous queue (same definition as `scan-procedures.md` Step 1 Shape 5).
   - **Backlog-state** — open records carrying neither `ready` nor `parked` — the default, unasserted state per `_shared/work-record.md`'s lifecycle spine.

   Surface all three as the `[queue]` Output Contract row below — bare counts only, per the Output Contract's own documented shape. No per-record enumeration is produced or needed here.

Findings and recommendations (tidy Action Vocabulary):

| Finding | Recommendation |
|---------|---------------|
| Open PR has failing/pending CI or `CHANGES_REQUESTED` (item 1's second finding) | Investigate the CI failure or address the requested changes — local action |
| Open PR stale (>4 weeks, no updates) | Close (GitHub) or Resume — judgment call |
| Open PR superseded (related spec complete, equivalent changes merged) | Close (GitHub) |
| Merged/closed PR whose head branch or worktree still exists locally | Corroborates Step 4.5 `[git]` cleanup — dispatcher merges at assembly |
| Unresolved review thread addressed by a later commit (evidence: commit touching the flagged lines) | Resolve thread |
| Unresolved review thread not addressed | Capture to backlog or run `/claude-tweaks:review` — local action |
| `by:{skill}` issue stale (>4 weeks, the flagged code/target/journey/doc has since changed or been removed) — `{skill}` is any of `code-health`/`harness-health`/`journey-health`/`docs-health` | Close (GitHub) — superseded |
| `by:{skill}` issue still valid | Suggest `/claude-tweaks:backlog refine` or Capture to backlog — all four health skills are report-only and never apply patches directly (see each skill's own SKILL.md Anti-Patterns table), so a still-valid issue always needs a human-routed fix regardless of which skill filed it |

Emit `[pr]` and `[gh-issue]` rows per the Output Contract. Backlog-record findings (the record-scan shapes: stale, parked-trigger, unsynced, needs-scoring, `bot:blocked`, legacy-taxonomy) no longer originate from this scope — see `tidy/scan-procedures.md` Step 1 for their findings table and `[backlog]`/`[parked]`/`[unsynced]`/`[scoring]`/`[blocked]`/`[legacy]` row prefixes.

## Scope: `triage-queue` (consumed by /help Stage 4.6)

Three cheap counts for the dashboard's Triage Queue section. This scope exists so `/help` never hand-writes its own query for these numbers — see the fix this closes: Stage 4.6 previously computed "pending authorization" without excluding `bot:blocked` records, so a blocked record counted as both pending AND blocked on the same dashboard.

1. **Pending authorization** — `ready` ∧ no `auto:*` ∧ no `bot:*` (neither `bot:in-progress` nor `bot:blocked`). Origin-agnostic: matches `/claude-tweaks:backlog refine`'s own `ready`-queue pull (`skills/backlog/refine-mode.md`), which tiers no health-skill origin specially — every `ready` record, with or without a `by:*` label, is in scope.

   ```bash
   gh issue list --label ready --state open --json number,labels --limit 200 > /tmp/triage-queue-ready.json
   node -e "
     const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
     const { isPendingAuthorization } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/pending-authorization.js');
     const issues = require('/tmp/triage-queue-ready.json');
     const pending = issues.filter((i) => isPendingAuthorization(parseRecordFacets(i.labels))).length;
     console.log(pending);
   "
   ```

2. **Blocked** — `gh issue list --label bot:blocked --state open --json number --limit 200 -q 'length'`

3. **Auto-merged this week** — `[fast-lane]`-tagged (wrap-up's single-record Auto-merge short-circuit, `wrap-up/review-console.md`) or `[auto-merge]`-tagged (dispatch's group-scoped bundle gate, `dispatch/SKILL.md`) — both headless autonomous merges, distinguished by scope, not by which is current — commits on the *default* branch (never the current worktree's own branch — see the note on `worktree.always` below), last 7 days:

   ```bash
   SINCE=$(node -e "console.log(new Date(Date.now() - 7*24*60*60*1000).toISOString())")
   gh api "repos/{owner}/{repo}/commits?since=${SINCE}&per_page=100" -q '[.[] | select(.commit.message | contains("[fast-lane]") or contains("[auto-merge]"))] | length'
   ```

   The commits endpoint defaults to the default branch when no `sha=` param is given — correct regardless of which branch/worktree `/help` itself runs from under `worktree.always`. `SINCE` is computed via `node`, not shell `date` arithmetic, which differs between BSD/macOS and GNU date.

Render as three lines: `Pending authorization: **{N}** records awaiting your decision` / `Blocked: **{N}** records hit their retry ceiling` / `Auto-merged this week: **{N}** auto-merges` — omit any line whose count is 0.

## Scope: `acceptance-queue` (consumed by /help Stage 4.7)

One cheap list for the dashboard's Acceptance Queue section — deliberately `--state all`, unlike
every other count in this file, since `demo:pending` persists independent of open/closed state
(an `auto:merge`'d record's issue can already be closed while still awaiting sign-off). `/demo`
no longer sweeps this backlog itself (it resolves one item per invocation), so this is the sole
place the outstanding set is enumerated.

```bash
gh issue list --label demo:pending --state all --json number,title --limit 200
```

Render as one line listing every matching record: `Awaiting sign-off: **{N} records** — #{n1}
({title1}), #{n2} ({title2}), ... — run /demo #N on any of these` — omit entirely when the count
is 0.

## Scope: `acceptance-gap` (consumed by /tidy Step 4.8)

Finds closed records that carry no acceptance label at all — the case `acceptance-queue` above
cannot see, since that scope only lists records already flagged `demo:pending`. A record closed
without ever receiving a `demo:*` label is invisible to `acceptance-queue` and would otherwise
disappear from the backlog with no disposition on record. Classification is entirely
`needsBackstop`'s (`bin/lib/issues/acceptance.js`, Task 1) — this scope does not reimplement the
label taxonomy; see that module or `_shared/work-record.md` for what the labels mean.

Record set: closed records from the last 30 days. The `date` fallback covers both platforms this
plugin runs on — BSD `date` (macOS, this project's development platform) uses `-v-30d`; GNU `date`
(Linux, cloud Routine sandboxes) uses `-d '30 days ago'`.

```bash
gh issue list --state closed --limit 200 \
  --json number,title,state,labels,closedAt \
  --jq '[.[] | select(.closedAt > "'"$(date -u -v-30d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ)"'")]' \
  > /tmp/tidy-closed-records.json

node -e "
  const { needsBackstop } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/acceptance.js');
  const records = require('/tmp/tidy-closed-records.json');
  const gaps = records
    .map(r => ({ ...r, labels: r.labels.map(l => l.name) }))
    .filter(r => needsBackstop({ state: 'CLOSED', labels: r.labels }));
  gaps.forEach(r => console.log('[acceptance-gap] #' + r.number + ': ' + r.title + ' — closed with no acceptance disposition — recommend /claude-tweaks:demo #' + r.number));
"
```

Un-dispositioned closed records are **staged, never auto-applied**, regardless of
`tidy-aggressiveness`. Applying a disposition is a judgment about whether shipped work actually
solved the problem — not a mechanical cleanup — and `_shared/auto-mode-contract.md` places that
kind of work-record judgment outside what `auto` silences. Do not fold this finding into any
auto-apply tier.

Emit `[acceptance-gap]` rows per the Output Contract.

## Output Contract

Two collection prefixes for PR/code-health/harness-health/journey-health/docs-health findings, one grant-queue-metrics prefix (`repo-wide` scope only, unconditional — the grant-queue counts exist regardless of which driver stores records), and one un-dispositioned-closed-record prefix (`acceptance-gap` scope only) — all emitted as standard Template A rows (`_shared/subagent-output-contract.md`) so existing dispatchers consume them unchanged:

- `[pr]` — pull-request findings: `[pr] PR #{n}: {title} — {issue} — {recommendation}`
- `[gh-issue]` — code-health/harness-health/journey-health/docs-health issue findings: `[gh-issue] #{n}: {title} — {issue} — {recommendation}`
- `[queue]` — grant-queue metrics (item 8 above, `repo-wide` scope only, derived from the single `gh issue list --state open` query already fetched): `[queue] {N} pending authorization, {M} bot:blocked, {K} backlog`
- `[acceptance-gap]` — closed records with no acceptance disposition (`acceptance-gap` scope above): `[acceptance-gap] #{n}: {title} — closed with no acceptance disposition — recommend /claude-tweaks:demo #{n}`

Backlog-record findings (the record-scan shapes: stale, parked-trigger, unsynced, needs-scoring, `bot:blocked`, legacy-taxonomy) no longer emit from this scope — they are `/tidy` Step 1's `[backlog]` / `[parked]` / `[unsynced]` / `[scoring]` / `[blocked]` / `[legacy]` rows now (`tidy/scan-procedures.md`).

Severity mapping (Template A Severity column):

| Signal | Severity |
|--------|----------|
| Failing CI or `CHANGES_REQUESTED` on any open PR (current branch's or repo-wide) | high |
| Unresolved review threads | medium |
| Stale open PR (>4 weeks) | medium |
| Open PR superseded (related work already merged) | medium |
| Merged/closed PR with local branch/worktree remnants | medium |
| Code-health/harness-health/journey-health/docs-health issue stale/superseded | medium |
| Code-health/harness-health/journey-health/docs-health issue still valid, awaiting `/claude-tweaks:backlog refine` | low |
| Closed record with no acceptance disposition (`acceptance-gap` scope) | medium |
| Open PR awaiting review (not draft, not yet `Stale`, 0 unresolved threads, CI clean) | info |
| Fresh draft PR / no PR / scan skipped | info |
