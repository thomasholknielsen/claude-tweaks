# Open Items — hooks.js reconcile: compact default, --json opt-in (#638)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | wrap-up | branch — origin/worktree-record-627 — `git branch -r --merged origin/main` — merged, not deleted | deferred | Not this run's blast radius (record #627, unrelated) — tool-attribution gap in `probeBranches`, filed as #994. |
| 2 | wrap-up | branch — origin/worktree-record-789 — `git branch -r --merged origin/main` — merged, not deleted | deferred | Same gap, filed as #994 — unrelated record (#789). |
| 3 | wrap-up | branch — origin/worktree-record-893 — `git branch -r --merged origin/main` — merged, not deleted | deferred | Same gap, filed as #994 — unrelated record (#893). |
| 4 | wrap-up | pr — PR #972 — `gh pr list --state open` — open, head worktree-record-638 (this run's own PR) | accepted | This run's own PR — resolution is this wrap-up's own Phase 4 merge-verification step, not a separate residue action. |
| 5 | wrap-up | pipeline-run — .claude-tweaks/pipelines/2026-08-20T045254-record-627 — status: clean, not archived | deferred | Not this run's blast radius (record #627, unrelated) — same probe-attribution gap, extended to `pipeline-runs.js`. Filed as #994 ("residue.js --scope blast-radius does not attribute branches/pipeline-runs to the sweeping run", risk:low size:medium ready, Defer-reason: pre-existing-outside-diff). |
