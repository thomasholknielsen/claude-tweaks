# Open Items — demo: cli-surface Observation plan for a decomposed sub-issue skips end-to-end manual verification guidance

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review/hindsight | `buildNativeParentQuery` triplicates the GraphQL envelope string already used by `buildNativeSubIssuesQuery`/`buildNativeDependencyQuery` (`plugin/bin/lib/issues/record.js`) | deferred | Staged to `staged/reflect-1.md` for the Wrap-Up Review Console. Not collapsed now — record #1194's own spec flags two other open records (#1309, #1224) concurrently touching `record.js`; a shared-helper refactor now risks the merge conflict that warning names. Follow-up backlog record recommended once those land. |
