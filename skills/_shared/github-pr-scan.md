# GitHub PR Scan — Shared Procedure

Single source of truth for scanning GitHub pull-request and issue state. Consumed by `/claude-tweaks:help` (Stage 4.5, **`current-pr`** scope; Stage 4.6, **`triage-queue`** scope) and `/claude-tweaks:tidy` (Step 4.8, **`repo-wide`** scope). Subagents cannot read this file — the dispatcher inlines the relevant scope section, plus the Detection Ladder and Output Contract, into the scan agent's prompt (the same pattern as `tidy/scan-procedures.md`).

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
4. **Repo-wide stale count (maintenance signal only)** — `gh pr list --state open --json number,updatedAt` → total open PRs + count stale per the thresholds above. This row is routed to the caller's maintenance-signals rendering, not the Current PR dashboard section.

Emit `[pr]` rows per the Output Contract.

## Scope: `repo-wide` (consumed by /tidy Step 4.8)

Full sweep of open PRs, `by:code-health`-labelled issues, `by:harness-health`-labelled issues, `by:journey-health`-labelled issues, and `by:docs-health`-labelled issues. Backlog-record findings (stale, parked-trigger, unsynced, needs-scoring, `bot:blocked`, legacy-taxonomy) are `/tidy` Step 1's job now, not this scope's — `repo-wide` no longer queries the retired `backlog` label (see `tidy/scan-procedures.md` Step 1).

1. **Open PRs** — `gh pr list --state open --json number,title,updatedAt,isDraft,reviewDecision,headRefName,url` → classify each per the Staleness Thresholds. A PR that is simultaneously not draft, not yet `Stale` (< 4 weeks since `updatedAt` — spans both the `Fresh` and `Review` bands, since neither currently has its own finding for a PR with nothing wrong), has zero unresolved review threads (item 2 below), and has no failing/pending CI (`gh pr checks`) gets its own finding: `[pr] PR #{n}: {title} — awaiting review — last updated {age} ago, CI {status}, 0 unresolved threads`. This is informational only — see the Severity mapping and `tidy/SKILL.md`'s Step 6 routing below.
2. **Unresolved threads per open PR** — the same GraphQL query as `current-pr` item 2, once per open PR.
3. **Code-health issues** — `gh issue list --label by:code-health --state open --json number,title,labels,updatedAt,url`.
4. **Merged/closed PRs with local remnants** — `gh pr list --state merged --limit 50 --json number,headRefName`; cross-check each `headRefName` against `git -C "{REPO_ROOT}" branch --list` output.
5. **Harness-health issues** — `gh issue list --label by:harness-health --state open --json number,title,labels,updatedAt,url`.
6. **Journey-health issues** — `gh issue list --label by:journey-health --state open --json number,title,updatedAt,url`.
7. **Docs-health issues** — `gh issue list --label by:docs-health --state open --json number,title,labels,updatedAt,url`.
8. **Grant-queue counts** — one self-contained query feeds three digest metrics, per `_shared/work-record.md`'s record taxonomy. Not gated on `work-backend` — this scope only runs once the Detection Ladder already confirmed a reachable GitHub remote, regardless of which driver stores records:

   ```bash
   gh issue list --state open --json number,title,labels --limit 200 > /tmp/pr-scan-records.json
   node -e "
     const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
     const issues = require('/tmp/pr-scan-records.json');
     const faceted = issues.map((i) => parseRecordFacets(i.labels));
     const withFacets = issues.map((i, idx) => ({ number: i.number, title: i.title, facets: faceted[idx] }));
     const pendingList = withFacets.filter((i) => i.facets.stage === 'ready' && !i.facets.grants.build && !i.facets.grants.merge && !i.facets.bot.inProgress && !i.facets.bot.blocked);
     const blockedList = withFacets.filter((i) => i.facets.bot.blocked);
     const backlogList = withFacets.filter((i) => i.facets.stage === 'backlog');
     const strip = (list) => list.map(({ number, title }) => ({ number, title }));
     console.log(JSON.stringify({
       pending: pendingList.length, blocked: blockedList.length, backlog: backlogList.length,
       pendingList: strip(pendingList), blockedList: strip(blockedList), backlogList: strip(backlogList),
     }));
   "
   ```

   - **Pending authorization** — `ready` ∧ no `auto:*` ∧ no `bot:*` (neither `bot:in-progress` nor `bot:blocked`). Origin-agnostic: any record any health skill, `/claude-tweaks:capture`, or a human filed counts, with or without a `by:*` label — matching `/claude-tweaks:triage` Step 1's own origin-agnostic `ready`-queue pull (`skills/triage/SKILL.md`), which no longer tiers any health-skill origin specially. This is a maintenance signal only — `/tidy` never grants authorization itself (`/claude-tweaks:triage` owns that).
   - **`bot:blocked`** — records that hit their retry ceiling and need a human's renewed judgment at `/claude-tweaks:triage` before re-entering the autonomous queue (same definition as `scan-procedures.md` Step 1 Shape 5).
   - **Backlog-state** — open records carrying neither `ready` nor `parked` — the default, unasserted state per `_shared/work-record.md`'s lifecycle spine.

   Surface all three in the digest's "Still needs your review" section (see `tidy/SKILL.md`'s digest section) as a summary line plus an enumerated bullet per record: `**Pending authorization:** {N} records awaiting a grant` followed by one `- #{number}: {title}` line per entry in `pendingList` (same pattern for `**Blocked:**`/`blockedList` and `**Backlog:**`/`backlogList`) — omit both the summary line and its bullet list when a bucket's count is 0. No cap on list length.

## Scope: `triage-queue` (consumed by /help Stage 4.6)

Three cheap counts for the dashboard's Triage Queue section. This scope exists so `/help` never hand-writes its own query for these numbers — see the fix this closes: Stage 4.6 previously computed "pending authorization" without excluding `bot:blocked` records, so a blocked record counted as both pending AND blocked on the same dashboard.

1. **Pending authorization** — `ready` ∧ no `auto:*` ∧ no `bot:*` (neither `bot:in-progress` nor `bot:blocked`). Origin-agnostic: matches `/claude-tweaks:triage` Step 1's own `ready`-queue pull (`skills/triage/SKILL.md`), which tiers no health-skill origin specially — every `ready` record, with or without a `by:*` label, is in scope.

   ```bash
   gh issue list --label ready --state open --json number,labels --limit 200 > /tmp/triage-queue-ready.json
   node -e "
     const { parseRecordFacets } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
     const issues = require('/tmp/triage-queue-ready.json');
     const pending = issues.filter((i) => {
       const f = parseRecordFacets(i.labels);
       return !f.grants.build && !f.grants.merge && !f.bot.inProgress && !f.bot.blocked;
     }).length;
     console.log(pending);
   "
   ```

2. **Blocked** — `gh issue list --label bot:blocked --state open --json number --limit 200 -q 'length'`

3. **Auto-merged this week** — `[fast-lane]`-tagged (legacy human-facilitated merges, `wrap-up/review-console.md`) or `[auto-merge]`-tagged (headless autonomous merges, `dispatch/SKILL.md`) commits on the *default* branch (never the current worktree's own branch — see the note on `worktree.always` below), last 7 days:

   ```bash
   SINCE=$(node -e "console.log(new Date(Date.now() - 7*24*60*60*1000).toISOString())")
   gh api "repos/{owner}/{repo}/commits?since=${SINCE}&per_page=100" -q '[.[] | select(.commit.message | contains("[fast-lane]") or contains("[auto-merge]"))] | length'
   ```

   The commits endpoint defaults to the default branch when no `sha=` param is given — correct regardless of which branch/worktree `/help` itself runs from under `worktree.always`. `SINCE` is computed via `node`, not shell `date` arithmetic, which differs between BSD/macOS and GNU date.

Render as three lines: `Pending authorization: **{N}** records awaiting your decision` / `Blocked: **{N}** records hit their retry ceiling` / `Auto-merged this week: **{N}** auto-merges` — omit any line whose count is 0.

Findings and recommendations (tidy Action Vocabulary):

| Finding | Recommendation |
|---------|---------------|
| Open PR stale (>4 weeks, no updates) | Close (GitHub) or Resume — judgment call |
| Open PR superseded (related spec complete, equivalent changes merged) | Close (GitHub) |
| Merged/closed PR whose head branch or worktree still exists locally | Corroborates Step 4.5 `[git]` cleanup — dispatcher merges at assembly |
| Unresolved review thread addressed by a later commit (evidence: commit touching the flagged lines) | Resolve thread |
| Unresolved review thread not addressed | Capture to backlog or run `/claude-tweaks:review` — local action |
| Code-health issue stale (>4 weeks, flagged code since changed/removed) | Close (GitHub) — superseded |
| Code-health issue still valid | Suggest `/claude-tweaks:triage` or Capture to backlog |
| Harness-health issue stale (>4 weeks, the referenced target or code has since changed again) | Close (GitHub) — superseded |
| Harness-health issue still valid | Suggest `/claude-tweaks:triage` or Capture — same as a still-valid code-health issue (harness-health never applies patches directly) |
| Journey-health issue stale (>4 weeks, the referenced journey or its files: have since changed again) | Close (GitHub) — superseded |
| Journey-health issue still valid | Suggest `/claude-tweaks:triage` or Capture to backlog |
| Docs-health issue stale (>4 weeks, the referenced doc or the fact it flagged has since changed again) | Close (GitHub) — superseded |
| Docs-health issue still valid | Suggest `/claude-tweaks:triage` or Capture to backlog |

Emit `[pr]` and `[gh-issue]` rows per the Output Contract. Backlog-record findings (the record-scan shapes: stale, parked-trigger, unsynced, needs-scoring, `bot:blocked`, legacy-taxonomy) no longer originate from this scope — see `tidy/scan-procedures.md` Step 1 for their findings table and `[backlog]`/`[parked]`/`[unsynced]`/`[scoring]`/`[blocked]`/`[legacy]` row prefixes.

## Output Contract

Two collection prefixes for PR/code-health/harness-health/journey-health/docs-health findings, plus one grant-queue-metrics prefix (`repo-wide` scope only, unconditional — the grant-queue counts exist regardless of which driver stores records) — all emitted as standard Template A rows (`_shared/subagent-output-contract.md`) so existing dispatchers consume them unchanged:

- `[pr]` — pull-request findings: `[pr] PR #{n}: {title} — {issue} — {recommendation}`
- `[gh-issue]` — code-health/harness-health/journey-health/docs-health issue findings: `[gh-issue] #{n}: {title} — {issue} — {recommendation}`
- `[queue]` — grant-queue metrics (item 8 above, `repo-wide` scope only, derived from the single `gh issue list --state open` query already fetched): `[queue] {N} pending authorization, {M} bot:blocked, {K} backlog`

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
| Code-health/harness-health/journey-health/docs-health issue still valid, awaiting `/claude-tweaks:triage` | low |
| Open PR awaiting review (not draft, not yet `Stale`, 0 unresolved threads, CI clean) | info |
| Fresh draft PR / no PR / scan skipped | info |
