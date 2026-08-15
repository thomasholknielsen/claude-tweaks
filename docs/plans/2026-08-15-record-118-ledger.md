# Open Items — 118: declined.json is durable state that no documentation mentions

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | test | `tests/impeccable-cli-contract.test.js` "the installed CLI matches the pinned version" fails (locally installed Impeccable CLI is 3.6.0, fixtures pinned to 3.5.0) | accepted | Pre-existing baseline failure, unrelated to this build's diff — confirmed by running the same test against `main` before any change (fails identically there: environment's global `impeccable` CLI version vs. pinned fixture version). |
