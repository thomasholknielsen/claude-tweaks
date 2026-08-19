---
record: 820
origin: capture
ceremony: standard
grants: []
surface: infra
---
# 820: Reduce SessionStart reconcile() latency (GitHub-health preflight, batching, parallelism, async split)

## Current State

`bin/lib/hooks/session-start.js`'s `reconcile()` runs synchronously on every
`SessionStart` and blocks the session's first message on it. In `pr-first`
repos it makes many sequential `git`/`gh` calls — a `git fetch` in `mirror`
plus a *second*, separate `git fetch --prune` in `prune-remote`, one `git
push origin --delete <branch>` per prunable remote branch, 1-2 `gh api`
calls per open issue claim in `release-merged.js`, and one `gh pr view` per
open console in `console-execute.js` — with no aggregate time budget and no
upfront GitHub-health check. Each individual call is timeout-capped
(5-10s), so nothing hangs forever, but they run strictly in series, so wall
time scales with however much stale branch/claim/console state has
accumulated in the repo.

Measured: 6.9s total on `jarvis` (a small case — 3 remote branches, 1
worktree, 4 pipeline runs). Traced from a real report of 1-2 minute
Claude Code session starts, worst when GitHub's API is degraded, since a
slowdown there just multiplies against however many serial calls happen to
be queued that session with no circuit breaker.

## Deliverables

1. GitHub-health preflight at the very top of `reconcile()` (`bin/lib/reconcile/index.js`) — on failure/timeout (~2s), skip every network-dependent check (`mirror`, `red-tip`, `console`, `release`, `remote-prune`) for this pass rather than letting each discover the outage via its own timeout.
2. Merge `mirror`'s fetch (`classify.js`) and `prune-remote.js`'s separate `git fetch --prune` into one shared fetch — currently two full round trips to the same remote per session.
3. Batch `prune-remote.js`'s per-branch `git push origin --delete <branch>` loop into a single multi-ref push (`git push origin :b1 :b2 :b3`).
4. Add an overall wall-clock budget for `reconcile()` (~15-20s) that aborts remaining checks and reports what was skipped, instead of no aggregate ceiling at all.
5. Parallelize `release-merged.js`'s per-claim `gh api` reads and `console-execute.js`'s per-PR `gh pr view` calls with a concurrency cap (~5-8) instead of serial `execFileSync` loops.
6. Replace `release-merged.js`'s one-`gh api`-call-per-open-claim pattern with a single Git Trees API listing of the `claims/` directory on `CLAIMS_BRANCH`, fetching individual blob contents only for shas that changed since last seen.
7. Add a short-TTL (5-10 min) freshness cache so near-simultaneous session starts in the same repo (common with worktree-per-run, multiple parallel sessions) skip redundant network reconciliation.
8. Split the `SessionStart` hook into a fast synchronous advisory pass (deps check, stale-run scan, `red-tip` — worth surfacing immediately) and move the pure-janitorial, write-only checks (`release`, `archive`, `archive-branches`, `remote-prune`, `reap`) to `async: true` (already a supported hooks.json field — see `superpowers`' own SessionStart hook) or a separate trigger, since none of them need to block the first message.

## Acceptance Criteria

- `reconcile()` no longer accumulates per-call timeouts when GitHub is unreachable/degraded — it degrades within ~2s via the preflight instead.
- `reconcile()`'s total wall-clock time is bounded by an explicit budget regardless of how much stale branch/claim/console state exists.
- Session start in a `pr-first` repo with a typical amount of stale state completes in low single-digit seconds under healthy network conditions (down from the current linear-in-candidate-count behavior).
- Existing `tests/reconcile.test.js` coverage still passes; new tests cover the preflight skip path and the budget-abort path.
