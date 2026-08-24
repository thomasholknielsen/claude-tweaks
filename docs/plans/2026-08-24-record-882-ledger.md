# Open Items — record #882 (test: flake adjudication — re-run failed files in isolation before reporting failure)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | wrap-up | Near-miss: test-gate re-run after Step 5 simplify didn't capture the specific failing test name before re-running the full suite (procedurally looser than the isolate-and-report procedure this record itself adds, though the flake conclusion was still correct) — staged/reflect-1.md | accepted | Duplicate of existing memory entry "npm test output capture / tail truncation" (redirect long runs to a file before grepping/tailing) — no new memory write needed; classifier dedup (learning-routing.md) |
| 2 | wrap-up | Residue sweep: PR #1379 (this run's own draft PR, head worktree-dispatch-record-882) still open at sweep time | accepted | This run's own PR — resolved by this same run's Phase 4 merge-verification gate / pr-first-merge.md procedure (not external residue) |
