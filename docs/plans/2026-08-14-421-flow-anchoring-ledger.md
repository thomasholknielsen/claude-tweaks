# Open Items — /flow's materialize step doesn't anchor run directories to the main checkout inside a worktree

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | wrap-up | Reflect (full, Near-misses lens): dispatched subagent's final reply during `/build` lacked the required Subagent Contract status line (warn-tier `contract-violation` logged, no functional impact — subagent's finding independently verified correct) | accepted | No action needed for this record; the SubagentStop hook already logs + warns non-blockingly by design. Noted for pattern tracking if it recurs across dispatch sites. |
| 2 | wrap-up | Residue sweep (`bin/residue.js --scope blast-radius --no-suite`): full-suite probe skipped via `--no-suite` since npm test already ran independently earlier in this run (3603 pass, 0 fail, 5 env-only skips) | observation | Not re-run — already verified independently at the review step; re-running would cost time with no new information. |
