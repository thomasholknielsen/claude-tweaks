# Open Items — consoleAutoResolve must still render the consolidated console

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | wrap-up | Residue sweep (`bin/residue.js --scope blast-radius`): PR #747 — head `worktree-flow-record-714` (this run's own PR) still open | accepted | No `auto:merge` grant on issue #714 (only `auto:build`) — Auto-merge short-circuit (`review-console.md`) never applies; run terminates at `pending-review` by design. PR #747 stays open for human merge review; worktree removal, claim release, and run-dir archival are deferred to the reconciler on merged-PR evidence, per this run's own dispatch routing. |
