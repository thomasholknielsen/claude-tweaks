# Open Items — 717: Run-dir archival must run on every console path — move to Shared teardown; residue.js backstop for the 104-dir backlog

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review/3c | probePipelineRuns collapsed genuine readdirSync failures (EACCES/EIO) into the same ran:true clean-sweep as a missing dir, unlike sibling probes in this diff | fixed | commit 2b2501fc — split ENOENT (clean) from any other error (ran:false, reason) |
| 2 | review/3f | Test name "no .claude-tweaks/pipelines directory at all does not run" contradicted its own `assert.strictEqual(ran, true)` | fixed | commit 2b2501fc — renamed test, added a genuine-failure-path test |
| 3 | wrap-up/skills | residue-sweep.md's remedy:auto example list omitted the new un-archived-run-dir finding | fixed | commit 7bac0948 |
| 4 | wrap-up/skills | tidy/SKILL.md's Step 4.5 scan-table row was considered for the new pipeline-run kind, but the row already omits other undocumented kinds from the same --scope repo call for the same structural reason | accepted | verified not a clean additive fix — see decisions.md's Skills row entry |
| 5 | wrap-up/skills | tidy's 30-day archive-compaction rule and the new immediate pipeline-run finding cover overlapping sets with no cross-reference | deferred | staged — staged/wrap-up-skill-1.md, awaiting Review Console |
| 6 | wrap-up/skills | New-skill candidate "residue-probe-contract" for the fail-loud-on-genuine-failure rule shared by every bin/lib/residue/probes/*.js file | deferred | staged — staged/wrap-up-skill-new-residue-probe-contract.md, awaiting Review Console |
| 7 | wrap-up/docs | docs/plugin-structure.md's residue-probe list named a removed `claims` probe and omitted the new `pipeline-runs` probe | fixed | commit 7bac0948 |
| 8 | wrap-up/docs | docs/hooks.md's background-convergence bullet reads as a guarantee an un-archived run dir eventually gets picked up; verified it doesn't (a `status: clean` run is permanently skipped by `iterRunDirsWithState`) | deferred | staged — staged/wrap-up-doc-1.md, awaiting Review Console |
| 9 | wrap-up/residue | `node bin/residue.js --scope blast-radius` reported 58 pre-existing un-archived closed pipeline-run dirs (not produced by this diff); this worktree-isolated session cannot write to the main checkout's `.claude-tweaks/pipelines/` to archive them | deferred | filed thomasholknielsen/claude-tweaks#758 (Defer-reason: pre-existing-outside-diff) |
| 10 | wrap-up/residue | `node bin/residue.js --scope blast-radius` reported PR #746 as an open, unmerged finding | accepted | this run's own draft PR — resolves on merge, no separate action |
