# Open Items — #695 specify + demo: accept a #N,#M batch argument so tidy's Yours groups collapse to one paste line

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | ops | Flow Step 2.5 pre-flight: origin/main was 14 commits ahead of local main HEAD 676838ad at run start (auto → continued). Worktree branched from origin/main and caught up to 24b03525 in post-creation catch-up, so the divergence is absorbed for this branch; local main checkout itself remains behind origin. | open | — |
| 2 | build/deferred-check | Deliverable D (tidy Yours group heads emit `/claude-tweaks:specify #a,#b` / `/claude-tweaks:demo #a,#b`) could not be applied: #685's grouping rule is not on origin/main yet (PR #699 still open at build time). Its rule reads the target skill's `argument-hint` at render time, but its `Single-ref target` example bullet and `Batch only where allowed` scan row name specify/demo as single-ref literally. Re-check at wrap-up: if #685 merged, apply Task 4 Steps 2-4; otherwise resolve `deferred` with trigger "PR #699 merges" and file a backlog record via /claude-tweaks:capture. | open | — |
