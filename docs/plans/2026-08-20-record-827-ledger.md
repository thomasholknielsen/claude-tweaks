# Open Items — docs/skill-authoring.md consumer-side report-line reading rule (#827)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | wrap-up | branch — origin/worktree-record-554 — git branch -r --merged origin/main — merged, not deleted | fixed | Deleted via `git push origin --delete worktree-record-554` |
| 2 | wrap-up | branch — origin/worktree-record-767 — git branch -r --merged origin/main — merged, not deleted | fixed | Deleted via `git push origin --delete worktree-record-767` |
| 3 | wrap-up | pr — PR #1004 — merge-verification gate (merge-when-green) read a red `test` check (tests/bin-lib/reconcile/prune-remote.test.js:397) before the merge attempt — took the Red path: parked, bot:blocked added, park comment posted | open | Parked, not fixed — pr-first-merge.md's Red path never merges on red. Resume once CI is green (likely a pre-existing env-sensitive flake in prune-remote.test.js, unrelated to this record's docs-only diff — see issue comment). Claim/worktree/branch left intact for resume. |
| 4 | wrap-up | pipeline-run — .claude-tweaks/pipelines/2026-08-20T044339-record-861 — run-state.json status: clean, not archived | deferred | Deferred to #1007 (blocked-external — worktree-isolated singleton session cannot `git mv` main-checkout paths and is instructed not to provision a scratch worktree) |
| 5 | wrap-up | pipeline-run — .claude-tweaks/pipelines/2026-08-20T044355-record-789 — run-state.json status: clean, not archived | deferred | Deferred to #1007 (same reason as #4) |
| 6 | wrap-up | pipeline-run — .claude-tweaks/pipelines/2026-08-20T045254-record-627 — run-state.json status: clean, not archived | deferred | Deferred to #1007 (same reason as #4) |
| 7 | wrap-up | pipeline-run — .claude-tweaks/pipelines/2026-08-20T051524-record-767 — run-state.json status: clean, not archived | deferred | Deferred to #1007 (same reason as #4) |
| 8 | wrap-up | pipeline-run — .claude-tweaks/pipelines/2026-08-20T051544-record-879 — run-state.json status: clean, not archived | deferred | Deferred to #1007 (same reason as #4) |
