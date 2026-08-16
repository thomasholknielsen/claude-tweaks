# Open Items — housekeeping-auto-merge: derive the default from the autonomy ceiling (#580)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | ops | Open blocker #559 (merge-verification derivation, granted auto:build) shares bin/lib/policy-schema.js + policy-schema.md + resolver tests with this run; user approved proceeding — if #559 is dispatched concurrently, the later merge must rebase over the earlier | fixed | Race materialized as predicted: #559 shipped mid-run (PR #588); resolved by conflict-free catch-up merge ceef3072, 117/117 affected suites green post-merge |
| 2 | review/hindsight | Three derived-default shapes now coexist (resolveIntegrationModel wrapper, merge-verification module, #580's in-loop hook) — a fourth derived key has no stated precedent tie-break | deferred | Staged as staged/reflect-1.md (observation, low) — consolidate only when a fourth derived-default lever appears |
| 3 | wrap-up | branch — origin/worktree-flow+spec-332-602-334 — residue sweep: merged into origin/main, not deleted (remedy: auto) | fixed | Already deleted upstream (PR #603 merged, no worktree); the finding was a stale local remote-tracking ref — cleared by git fetch --prune |
| 4 | wrap-up | pr — PR #587 open, head worktree-flow-spec-580 (this work; remedy: record) | observation | This run's own PR — closed by Phase 4 execution via the pr-first merge path |
