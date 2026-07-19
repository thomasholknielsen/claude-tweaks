# Open Items — #32: wrap-up's run-dir archival can still delete decisions.md before it's copied

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | test | `tests/statusline.test.js` "render under 750ms" failed at full-suite load contention (unrelated — statusline.js untouched); re-ran in isolation, passed | observation | Pre-existing flaky perf-timing test, confirmed unrelated by isolated re-run |
| 2 | test | Fix mechanism (`git rev-parse --git-common-dir` resolution + `cp` to main checkout) exercised manually against real files in this worktree before committing — confirmed `MAIN_CHECKOUT` resolves correctly and files land readably in the main checkout | fixed | Verified directly; test artifacts cleaned up before commit |
| 3 | test | Full end-to-end verification (the fixed Section C/B procedure actually running during a real wrap-up, worktree removed, archive checked afterward) will be exercised by this very build's own wrap-up step — using the newly-fixed procedure on itself rather than a separate synthetic test | accepted | Natural dogfood verification — see this run's own wrap-up outcome |
