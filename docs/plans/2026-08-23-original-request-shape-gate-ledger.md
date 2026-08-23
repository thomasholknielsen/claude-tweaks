# Open Items — #1240: specify: preserved Original request placeholder tokens trip materialize-format.js's whole-body PLACEHOLDER_RE

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | ops | Pre-flight 2.5: origin/main 137 ahead of worktree base (local main also 50 ahead of origin, known both-ways drift); continued per auto policy, build catch-up merges origin/main | fixed | Resolved by build's post-creation catch-up merge (commit e376d285, `/build` Common Step 1) — origin/main merged cleanly into the worktree branch. |
| 2 | ops | Step 1.5: installed materialize.js shapeGate false-positived on #1240 (markers only in verbatim `## Original request` — the record's own AC1 scenario); overrode with documented decision, fixed gate to be re-verified against this record | fixed | Re-verified during review (2026-08-23): `shapeGate()` from the fixed `materialize-format.js` (commit 986aa906) run directly against #1240's own materialized spec body (`work/1240-spec.md`) returns `{ok: true, missing: []}` — live AC1 evidence the fix resolves the exact false-positive this record was filed for. |
