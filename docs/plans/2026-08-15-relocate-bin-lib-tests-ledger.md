# Open Items — Relocate bin/lib tests to tests/bin-lib (#417)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build/ops | Globally-installed Impeccable CLI is 3.6.0, this repo's fixtures are pinned to 3.5.0 — `tests/impeccable-cli-contract.test.js` fails on this machine (reason-not-auto: requires-judgment — re-pin to 3.6.0 and re-record fixtures, or reinstall 3.5.0 globally; either is a deliberate choice, not a mechanical fix) | fixed | Superseded: merging `origin/main` (commits d77e0a2c/e17b8ef8/c17bf4bf) into this branch pulled in another session's independent re-pin to 3.6.0 — `npm test` now shows 0 failures. The staged backlog proposal was withdrawn (no longer applicable) rather than approved. |
| 2 | wrap-up | Residue sweep: PR #487 (this run's own head branch worktree-flow-417-420) is still open | open | User chose "Fix anyway" — merging now as this run's own Phase 4 completion step |
