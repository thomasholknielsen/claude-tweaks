# GitHub PR Scan — Shared Procedure

Single source of truth for scanning GitHub pull-request and issue state. Consumed by `/claude-tweaks:help` (Stage 4.5, **`current-pr`** scope) and `/claude-tweaks:tidy` (Step 4.8, **`repo-wide`** scope). Subagents cannot read this file — the dispatcher inlines the relevant scope section, plus the Detection Ladder and Output Contract, into the scan agent's prompt (the same pattern as `tidy/scan-procedures.md`).

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

Full sweep of open PRs, code-health-labelled issues, and harness-health-labelled issues.

1. **Open PRs** — `gh pr list --state open --json number,title,updatedAt,isDraft,reviewDecision,headRefName,url` → classify each per the Staleness Thresholds.
2. **Unresolved threads per open PR** — the same GraphQL query as `current-pr` item 2, once per open PR.
3. **Code-health issues** — `gh issue list --label code-health --state open --json number,title,updatedAt,url`.
4. **Merged/closed PRs with local remnants** — `gh pr list --state merged --limit 50 --json number,headRefName`; cross-check each `headRefName` against `git -C "{REPO_ROOT}" branch --list` output.
5. **Harness-health issues** — `gh issue list --label harness-health --state open --json number,title,updatedAt,url`.
6. **Backlog issues** (only when this repo's CLAUDE.md sets `backlog-backend: github-issues` — read it directly from CLAUDE.md's `## Backlog integration` section, same as `/tidy` Steps 1/1.5; skip this item entirely under `local-files` or a missing flag) — write the query's output to a temp file, then classify each issue:

   ```bash
   gh issue list --label backlog --state open --json number,title,body,labels,milestone,updatedAt,url > /tmp/backlog-issues.json
   node -e "const {classifyBacklogIssue}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/backlog.js');
     const issues=JSON.parse(require('fs').readFileSync(0,'utf8'));
     console.log(JSON.stringify(issues.map(classifyBacklogIssue)))" < /tmp/backlog-issues.json
   ```

   One query, split client-side by `stage` (`inbox` / `parked`) — not two separate queries.

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
| Harness-health issue still valid | Suggest applying the patch directly, or `/claude-tweaks:harness-health --target <name> --kind <skill\|rule\|claude-md>` to re-judge |
| Backlog issue, stage `inbox`, age per Staleness Thresholds | `< 2 weeks`: Keep. `2-4 weeks`: Keep (unless clearly stale). `> 4 weeks`: Delete or Promote — judgment call, same as `/tidy`'s file-based INBOX audit |
| Backlog issue, stage `parked`, milestone attached | Trigger met when the milestone is due/closed — Promote. Otherwise Keep. |
| Backlog issue, stage `parked`, `watchedPaths` present | Trigger met when `git log` shows recent commits touching any watched path — Promote. Otherwise Keep. |
| Backlog issue, stage `parked`, neither milestone nor `watchedPaths` | Prose-only `**Trigger:**` in the body, judged live each sweep — same as today's file-based DEFERRED audit |

Emit `[pr]` and `[gh-issue]` rows per the Output Contract — **except** backlog-issue findings, which emit `[inbox]` / `[deferred]` rows instead (see Output Contract below), reusing `/tidy`'s existing file-scan prefixes so Step 6 renders them into the Actions table exactly like the rows they replace.

## Output Contract

Two collection prefixes for PR/code-health/harness-health findings, plus two conditional ones for backlog findings (`repo-wide` scope only, `backlog-backend: github-issues` only) — all emitted as standard Template A rows (`_shared/subagent-output-contract.md`) so existing dispatchers consume them unchanged:

- `[pr]` — pull-request findings: `[pr] PR #{n}: {title} — {issue} — {recommendation}`
- `[gh-issue]` — code-health/harness-health issue findings: `[gh-issue] #{n}: {title} — {issue} — {recommendation}`
- `[inbox]` — backlog issue, stage `inbox`: `[inbox] {title} — {age} — {recommendation}` (mirrors `/tidy` Step 1's file-based row shape exactly)
- `[deferred]` — backlog issue, stage `parked`: `[deferred] {title} — from issue #{n} — {recommendation}` (mirrors `/tidy` Step 1.5's file-based row shape; `#{n}` stands in for `spec {N}` since a parked issue has no originating spec)

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
