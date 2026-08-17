# Open Items — 820: Reduce SessionStart reconcile() latency

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build/skill | `gh-api-module-pattern` documents a sync injectable-runner shape (execFileSync-based); this build's `bin/lib/reconcile/gh-pool.js` establishes a sibling pattern the skill doesn't cover — a concurrency-capped async pool (`execFile`+`Promise`, order-preserving, per-item try/catch so one failure never aborts the batch) for parallelizing `gh` call fan-out. Worth folding into that skill as a documented pattern for future async gh-call work. | observation | Not blocking — noted for a future skill update, not actioned in this build. |
