# Open Items — 717: Run-dir archival must run on every console path — move to Shared teardown; residue.js backstop for the 104-dir backlog

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review/3c | probePipelineRuns collapsed genuine readdirSync failures (EACCES/EIO) into the same ran:true clean-sweep as a missing dir, unlike sibling probes in this diff | fixed | commit 2b2501fc — split ENOENT (clean) from any other error (ran:false, reason) |
| 2 | review/3f | Test name "no .claude-tweaks/pipelines directory at all does not run" contradicted its own `assert.strictEqual(ran, true)` | fixed | commit 2b2501fc — renamed test, added a genuine-failure-path test |
