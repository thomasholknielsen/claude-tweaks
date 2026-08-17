# Open Items — record 713 wrap-up

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | wrap-up | Residue sweep (`bin/residue.js --scope blast-radius --base 052a1ebf --integration-branch main`): `origin/worktree-flow-spec-716` — merged into `main`, not deleted | fixed | Deleted the stale merged remote branch (`git push origin --delete worktree-flow-spec-716`) — no worktree referenced it, unrelated to this record's own diff. |
| 2 | wrap-up | Residue sweep: PR #757 — head `worktree-flow-record-713` (this run's own PR) still open | accepted | No `auto:merge` grant on issue #713 (only `auto:build`) — Auto-merge short-circuit (`review-console.md`) never applies; run terminates at `pending-review` by design. PR #757 stays open for human merge review; worktree removal, claim release, and run-dir archival are deferred to the reconciler on merged-PR evidence, per this run's own dispatch routing. |
