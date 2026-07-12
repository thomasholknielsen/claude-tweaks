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

Keyed on `updatedAt`. Same scale as /tidy's INBOX audit:

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

Full sweep of open PRs, code-health-labelled issues, harness-health-labelled issues, and journey-health-labelled issues.

1. **Open PRs** — `gh pr list --state open --json number,title,updatedAt,isDraft,reviewDecision,headRefName,url` → classify each per the Staleness Thresholds.
2. **Unresolved threads per open PR** — the same GraphQL query as `current-pr` item 2, once per open PR.
3. **Code-health issues** — `gh issue list --label code-health --state open --json number,title,labels,updatedAt,url`.
4. **Merged/closed PRs with local remnants** — `gh pr list --state merged --limit 50 --json number,headRefName`; cross-check each `headRefName` against `git -C "{REPO_ROOT}" branch --list` output.
5. **Harness-health issues** — `gh issue list --label harness-health --state open --json number,title,labels,updatedAt,url`.
6. **Journey-health issues** — `gh issue list --label journey-health --state open --json number,title,updatedAt,url`.
7. **Backlog issues** (only when this repo's CLAUDE.md sets `backlog-backend: github-issues` — read it directly from CLAUDE.md's `## Backlog integration` section, same as `/tidy` Steps 1/1.5; skip this item entirely under `local-files` or a missing flag) — write the query's output to a temp file, then classify each issue:

   ```bash
   gh issue list --label backlog --state open --json number,title,body,labels,milestone,updatedAt,url,state > /tmp/backlog-issues.json
   node -e "const {classifyBacklogIssue}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/backlog.js');
     const issues=JSON.parse(require('fs').readFileSync(0,'utf8'));
     console.log(JSON.stringify(issues.map(classifyBacklogIssue)))" < /tmp/backlog-issues.json
   ```

   `classifyBacklogIssue`'s result also carries `state` and `isBacklogLabeled` now — callers that want strict filtering can check both explicitly.

   One query, split client-side by `stage` (`inbox` / `parked`) — not two separate queries.

8. **Pending-authorization queue size** — `/claude-tweaks:triage` (`skills/triage/SKILL.md` Step 1) tiers **code-health and harness-health issues only** — it never touches `backlog`-labeled issues, which have their own separate inbox/parked lifecycle unrelated to build-authorization tiers, and `journey-health` issues aren't wired into triage's tiering flow (yet), so they're excluded here too. Reuse items 3 and 5's JSON output directly (both now carry `labels`) — count how many of those already-fetched issues lack all three current tier labels (`tier:needs-review`, `tier:approved`, `tier:fast-track` — read the exact current set from `skills/triage/SKILL.md`, do not hardcode a stale list here). Not gated on `backlog-backend` — code-health/harness-health issues exist regardless of which backlog backend is active.

   ```bash
   jq -s '[.[0][], .[1][]] | map(select((.labels | map(.name) | any(. == "tier:needs-review" or . == "tier:approved" or . == "tier:fast-track" or . == "status:blocked")) | not)) | length' \
     <(echo "$CODE_HEALTH_ISSUES_JSON") \
     <(echo "$HARNESS_HEALTH_ISSUES_JSON")
   ```

   The exclusion also covers `status:blocked` — an issue that already hit its retry ceiling has
   had its decision made and failed out; it is not "pending your initial decision" (same fix
   already applied to the `triage-queue` scope below, consumed by `/help`).

   (`$CODE_HEALTH_ISSUES_JSON` / `$HARNESS_HEALTH_ISSUES_JSON` are items 3 and 5's own `gh issue list` output, already captured earlier in this same scan — do not re-query. Each is passed to `jq -s` as its own positional input via process substitution, which is what makes `.[0]`/`.[1]` valid; a repeated `<<<` here-string redirection is NOT equivalent — bash keeps only the last one, silently dropping the first document. If testing this snippet standalone/in isolation outside a live scan, substitute `<(gh issue list --label code-health --state open --json number,labels)` and the harness-health equivalent for the two `echo` calls.)

   This is a maintenance signal only — `/tidy` never applies a tier label itself (`/claude-tweaks:triage` owns that). Surface the count in the digest's "Still needs your review" section (see `tidy/SKILL.md`'s digest section) as `**Pending authorization:** {N} issues awaiting a tier label`.

## Scope: `triage-queue` (consumed by /help Stage 4.6)

Three cheap counts for the dashboard's Triage Queue section. This scope exists so `/help` never hand-writes its own query for these numbers — see the fix this closes: Stage 4.6 previously computed "pending authorization" without excluding `status:blocked`, so a blocked issue counted as both pending AND blocked on the same dashboard.

1. **Pending authorization** — code-health + harness-health issues carrying none of `tier:needs-review`, `tier:approved`, `tier:fast-track`, **and not carrying** `status:blocked`. (The exclusion is the fix: a blocked issue already had its decision and failed out — it is not "pending your initial decision.")

   ```bash
   gh issue list --label code-health --state open --json number,labels --limit 200 > /tmp/triage-queue-ch.json
   gh issue list --label harness-health --state open --json number,labels --limit 200 > /tmp/triage-queue-hh.json
   node -e "
     const all = [...require('/tmp/triage-queue-ch.json'), ...require('/tmp/triage-queue-hh.json')];
     const names = i => (i.labels || []).map(l => (typeof l === 'string' ? l : l.name));
     const pending = all.filter(i => {
       const n = names(i);
       const hasTier = n.some(x => x === 'tier:needs-review' || x === 'tier:approved' || x === 'tier:fast-track');
       const blocked = n.includes('status:blocked');
       return !hasTier && !blocked;
     }).length;
     console.log(pending);
   "
   ```

2. **Blocked** — `gh issue list --label status:blocked --state open --json number --limit 200 -q 'length'`

3. **Auto-merged this week** — `[fast-lane]`-tagged commits on the *default* branch (never the current worktree's own branch — see the note on `worktree.always` below), last 7 days:

   ```bash
   SINCE=$(node -e "console.log(new Date(Date.now() - 7*24*60*60*1000).toISOString())")
   gh api "repos/{owner}/{repo}/commits?since=${SINCE}&per_page=100" -q '[.[] | select(.commit.message | contains("[fast-lane]"))] | length'
   ```

   The commits endpoint defaults to the default branch when no `sha=` param is given — correct regardless of which branch/worktree `/help` itself runs from under `worktree.always`. `SINCE` is computed via `node`, not shell `date` arithmetic, which differs between BSD/macOS and GNU date.

Render as three lines: `Pending authorization: **{N}** issues awaiting your decision` / `Blocked: **{N}** issues hit their retry ceiling` / `Auto-merged this week: **{N}** fast-lane merges` — omit any line whose count is 0.

Findings and recommendations (tidy Action Vocabulary):

| Finding | Recommendation |
|---------|---------------|
| Open PR stale (>4 weeks, no updates) | Close (GitHub) or Resume — judgment call |
| Open PR superseded (related spec complete, equivalent changes merged) | Close (GitHub) |
| Merged/closed PR whose head branch or worktree still exists locally | Corroborates Step 4.5 `[git]` cleanup — dispatcher merges at assembly |
| Unresolved review thread addressed by a later commit (evidence: commit touching the flagged lines) | Resolve thread |
| Unresolved review thread not addressed | Capture to INBOX or run `/review` — local action |
| Code-health issue stale (>4 weeks, flagged code since changed/removed) | Close (GitHub) — superseded |
| Code-health issue still valid | Suggest `/claude-tweaks:triage` or Capture to INBOX |
| Harness-health issue stale (>4 weeks, the referenced target or code has since changed again) | Close (GitHub) — superseded |
| Harness-health issue still valid | Suggest `/claude-tweaks:triage` or Capture — same as a still-valid code-health issue (harness-health never applies patches directly) |
| Journey-health issue stale (>4 weeks, the referenced journey or its files: have since changed again) | Close (GitHub) — superseded |
| Journey-health issue still valid | Suggest `/claude-tweaks:triage` or Capture to backlog |
| Backlog issue, stage `inbox`, age per Staleness Thresholds | `< 2 weeks`: Keep. `2-4 weeks`: Keep (unless clearly stale). `> 4 weeks`: Delete or Promote — judgment call, same as `/tidy`'s inbox-stage backlog audit |
| Backlog issue, stage `parked`, milestone attached | Trigger met when `milestoneDueOn` (from `classifyBacklogIssue`) is in the past — Promote (evidence: the due date; qualifies for the evidence tier, see `tidy/SKILL.md`). Otherwise Keep. |
| Backlog issue, stage `parked`, `watchedPaths` present | Trigger met when `git log` shows recent commits touching any watched path — Promote (evidence: the commit SHA; qualifies for the evidence tier, see `tidy/SKILL.md`). Otherwise Keep. |
| Backlog issue, stage `parked`, neither milestone nor `watchedPaths` | Prose-only `**Trigger:**` in the body, judged live each sweep — same as today's parked-stage backlog audit |

Emit `[pr]` and `[gh-issue]` rows per the Output Contract — **except** backlog-issue findings, which emit `[inbox]` / `[deferred]` rows instead (see Output Contract below), reusing `/tidy`'s existing file-scan prefixes so Step 6 renders them into the Actions table exactly like the rows they replace.

## Output Contract

Two collection prefixes for PR/code-health/harness-health/journey-health findings, plus two conditional ones for backlog findings (`repo-wide` scope only, `backlog-backend: github-issues` only), plus one queue-size prefix (`repo-wide` scope only, unconditional — code-health/harness-health issues exist regardless of backlog backend) — all emitted as standard Template A rows (`_shared/subagent-output-contract.md`) so existing dispatchers consume them unchanged:

- `[pr]` — pull-request findings: `[pr] PR #{n}: {title} — {issue} — {recommendation}`
- `[gh-issue]` — code-health/harness-health/journey-health issue findings: `[gh-issue] #{n}: {title} — {issue} — {recommendation}`
- `[inbox]` — backlog issue, stage `inbox`: `[inbox] {title} — {age} — {recommendation}` (mirrors `/tidy` Step 1's file-based row shape exactly)
- `[deferred]` — backlog issue, stage `parked`: `[deferred] {title} — from issue #{n} — {recommendation}` (mirrors `/tidy` Step 1's file-based row shape; `#{n}` stands in for `spec {N}` since a parked issue has no originating spec)
- `[queue]` — pending-authorization queue size (item 8 above, `repo-wide` scope only, derived from the code-health/harness-health issues items 3 and 5 already fetched): `[queue] {N} issues awaiting a tier label`

Severity mapping (Template A Severity column):

| Signal | Severity |
|--------|----------|
| Failing CI or `CHANGES_REQUESTED` on any open PR (current branch's or repo-wide) | high |
| Unresolved review threads | medium |
| Stale open PR (>4 weeks) | medium |
| Open PR superseded (related work already merged) | medium |
| Merged/closed PR with local branch/worktree remnants | medium |
| Recon issue stale/superseded | medium |
| Recon issue still valid, awaiting pipeline | low |
| Fresh draft PR / no PR / scan skipped | info |
