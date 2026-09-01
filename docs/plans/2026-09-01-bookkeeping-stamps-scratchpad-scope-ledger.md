# Open Items — Bookkeeping-Stamps Gate Scratchpad Scoping (#1678)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | `checkBookkeepingStampsGate`'s new "provably not a repo at all" exemption (`plugin/bin/lib/hooks/pre-tool-use.js` file-tool branch, #1678) is nested inside `if (mainRoot)`, so a transient `mainCheckoutRoot(wtRoot)` resolution failure denies a target `repoInfo` already proved has no repo root at all — contradicting the adjacent comment's "unconditionally" claim | open | — |
| 2 | review | Same code region: the new exemption resolves the file-tool target via `wtDetect.repoInfo(fileTargetPath)` on the raw literal path without following a symlink at the leaf, unlike `realTarget()` (already used by `isPolicyFile` in the same file for exactly this reason) — a symlink located outside any repo but pointing inside the protected worktree can bypass the bookkeeping-stamps gate entirely | open | — |
