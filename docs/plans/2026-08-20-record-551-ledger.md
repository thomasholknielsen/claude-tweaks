# Open Items — #551: reconcile-check-authoring docs shape

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build/docs | `docs/REGISTRY.md`'s `docs/hooks.md` row lists `plugin/bin/lib/reconcile/**` in its Auto-detect column. Now that `docs/reconcile-checks.md` exists as the dedicated procedural doc for that directory, the registry arguably should gain its own row for `docs/reconcile-checks.md` (Auto-detect: `plugin/bin/lib/reconcile/**`) and narrow `docs/hooks.md`'s row to drop that pattern — otherwise both docs keep auto-detecting on the same future reconcile changes, working against the split #551 establishes. Not in this record's Deliverables/Acceptance Criteria, so left unresolved here rather than expanding this build's scope. | open | — |
