# Open Items — Bookkeeping Stamps Gate (record #991)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | `checkBookkeepingStampsGate` (`plugin/bin/lib/hooks/pre-tool-use.js:895`) called `wtDetect.repoInfo(ctx.cwd)` with no `\|\| process.cwd()` fallback, unlike every sibling call site in this file — `nearestExistingDir`'s `path.resolve(undefined)` throws instead of the file's documented "ambiguity resolves to allow" behavior. Reproduced independently by both 3c reproduction-pair agents (one with a live repro). | fixed | Added `\|\| process.cwd()` fallback, matching the file's existing convention (lines 320/325/373/375) — commit pending |
