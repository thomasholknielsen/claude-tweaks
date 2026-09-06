# Open Items — Skill context composer (#1987 decomposition: #1988–#1997)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | test | Pre-existing (batch pre-flight sweep, unmodified base c392c4da7): `tests/bin-lib/reconcile/reap-merged.test.js` — 3 `#1793` releasePorts tests fail deterministically in isolation (3/15). Root cause: the test fixture builds paths under macOS `/var/folders/...` but `reapMerged` passes the realpath (`/private/var/folders/...`) to `releasePorts`, so `deepStrictEqual` on the recorded path mismatches. Not touched by any spec in this run. | open | — |
| 2 | test | Batch pre-flight sweep: `tests/statusline.test.js` "transcript_path under .claude-accounts renders the acct segment at the end" failed under the full suite (1/7484) but passed 78/78 in isolation — load-sensitive flake, not a regression. | observation | Flake per `test/verification.md` flake adjudication; no action. |
