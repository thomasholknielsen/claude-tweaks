# Open Items — #989: pr-early-run-lifecycle: two-call dispatch's build phase silently skipped draft-PR creation

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | Reviewed `checkBookkeepingStampsGate`'s new `hasNoUpstreamYet` exemption (plugin/bin/lib/hooks/pre-tool-use.js) against the raw diff and the full test run — narrow, one-shot exemption scoped to Bash push targets only, correctly falls through to deny on an already-tracked branch with no PR recorded, ambiguous git outcomes resolve to false (not exempt) per the file's stated posture for this branch. Two new regression tests (allow case + still-deny case) both pass as part of the full 6244/6244 green suite. | observation | — |
| 2 | review | 3i doc freshness — `docs/hooks.md` (REGISTRY.md-registered against `plugin/bin/lib/hooks/**`) documented the existing degrade-line PR-stamp exemption but not the new #989 `hasNoUpstreamYet` initial-publish-push exemption for the same gate | fixed | Added a matching sentence to docs/hooks.md's Bookkeeping-stamps gate bullet — `7cdfff70` |
