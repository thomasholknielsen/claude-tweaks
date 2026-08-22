# Open Items — QA artifact retention (records #1077, #1078)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | qa-reporting.md:176-177 trace-column source padding not re-aligned to widened cell content — GFM renders identically | observation | Cosmetic; deferred by final review triage (does not block merge) |
| 2 | build | init migration table (step-04-gitignore-suggestions.md) cannot offer `.claude-tweaks/artifacts/` to an already-split project with no bare `screenshots/` line — falls through to the no-op row (final-review finding; spec gap, not a build defect) | deferred | Filed #1146 |
| 3 | review | #1078 handoff: journey-mode.md:117 tail already reads `.claude-tweaks/artifacts/` (prefixed by #1077 per plan ruling — spec AC carve-out superseded; ruling in SDD ledger), AND a second retention sentence exists at browse/SKILL.md:91 — #1078 must rewrite BOTH retention sentences and derive edit anchors from live text, not its spec | observation | Carried into #1078 build input |
| 4 | review | scan-procedures.md Step 4.5 has the same missing-kind gap for `kind: pipeline-run` (pre-existing — step-6-auto.md:66 asserts it is read, but no paragraph surfaces it) | deferred | Filed #1147 |
| 5 | review | artifacts probe: loose first-level FILES under the three artifacts roots are never aged out (only directories are scanned); related: help/context-flow.md:74 documents report.json directly under screenshots/qa/ while qa-procedures.md puts it in a run dir — reconcile | deferred | Filed #1148 |
| 6 | review | C1 data-loss finding fixed in-branch (ownership discriminators); noting for the record: the auto-delete row's safety now rests on untracked-proof + shape-match — revisit if artifact layout changes | observation | Fixed this run |
