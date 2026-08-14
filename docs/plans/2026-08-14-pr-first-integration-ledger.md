# Open Items — pr-first integration model (#405–#415)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | test | Pre-existing baseline failure: `npm test`'s `node --test tests/ bin/lib/.../*.test.js ...` invocation reports `not ok - tests` (1 of 2572 top-level nodes) with `MODULE_NOT_FOUND: Cannot find module '.../tests'`. Root cause: on Node v22.23.2, `node --test <bareDirectory>/` combined with additional glob-file args in the same invocation fails to enumerate the directory's test files — reproduced with a bare `node --test tests/` call (0 discovered, 1 synthetic fail) vs. `node --test tests/*.test.js` (784 discovered, 779 pass / 5 skip / 0 fail, matching content). Not a code regression — every individual test file passes; this is an `npm test` script / Node-version interaction. Pre-existing — see ledger #1, batch pre-flight sweep. | open | — |
