# Open Items — CLAUDE.md: one Don'ts bullet is 214 words, having absorbed the incident narrative that belongs in the incident log

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | `tests/impeccable-cli-contract.test.js` fails: installed Impeccable CLI is 3.6.0, pinned fixture is 3.5.0 | accepted | Pre-existing environment drift unrelated to #136 — this branch touches only `docs/incident-log.md` and `docs/donts.md`; the failure is deterministic on the local machine's globally installed CLI version vs. the repo's pinned fixture, not caused by any commit on this branch. |
