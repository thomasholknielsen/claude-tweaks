# Open Items — Record #39: Dispatch native Blocked-by dependency check

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | ops | Pre-flight merge-check: `origin/main` is 9 commits ahead of this worktree's base (unrelated `/demo` session-recall work, no file overlap with `skills/dispatch/SKILL.md`) (reason-not-auto: requires-judgment) | acknowledged | Continued per `auto` mode policy — no file overlap with this record's scope; rebase deferred to wrap-up/merge time if it still matters then |
| 2 | build | Dispatch Step 2's `/tmp/dispatch-*.json` temp files (pre-existing, and now 3 more inherit it: `dispatch-eligible.json`, `dispatch-native-query.graphql`, `dispatch-native-deps.json`) are not namespaced per run, so two concurrent dispatch firings can clobber each other's temp state mid-Step-2 | observation | Flagged by the whole-branch reviewer as pre-existing and out of scope for this record — worth a future `/claude-tweaks:capture` if it ever actually bites |
