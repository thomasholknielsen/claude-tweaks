# Open Items — archiveRunDir() never moves engine-state.json, leaving orphaned run-dir residue

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | Record #893's Deliverables/Acceptance Criteria are already satisfied by `08098fe7` (refs #902), already on `origin/main` — `archiveRunDir()` moved from a fixed file-name list to directory enumeration, which catches `engine-state.json` (and any other current/future wrap-up-engine filename) without a code change. Regression test already present: `tests/reconcile.test.js:337`. No diff was made for this build. | observation | Superseded by #902 — recommend closing #893 as already-resolved (reference #902 / `08098fe7`), not merging as new work. |
