# Open Items — #989: pr-early-run-lifecycle: two-call dispatch's build phase silently skipped draft-PR creation

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | Reviewed `checkBookkeepingStampsGate`'s new `hasNoUpstreamYet` exemption (plugin/bin/lib/hooks/pre-tool-use.js) against the raw diff and the full test run — narrow, one-shot exemption scoped to Bash push targets only, correctly falls through to deny on an already-tracked branch with no PR recorded, ambiguous git outcomes resolve to false (not exempt) per the file's stated posture for this branch. Two new regression tests (allow case + still-deny case) both pass as part of the full 6244/6244 green suite. | observation | — |
