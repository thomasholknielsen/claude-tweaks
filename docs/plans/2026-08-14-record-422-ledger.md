# Open Items — #422: /claude-tweaks:wrap-up resume's stated precondition doesn't match how a dispatched Task agent actually stops

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | wrap-up | branch — origin/issue-368-oversight-floor-prefilter — merged, not deleted (residue sweep, remedy: auto) | fixed | Stale local remote-tracking ref only — `git fetch --prune` confirmed the branch was already deleted on the actual remote (GitHub auto-delete-on-merge); no push required |
| 2 | wrap-up | branch — origin/issue-388-policy-review — merged, not deleted (residue sweep, remedy: auto) | fixed | Same as #1 — `git fetch --prune` |
| 3 | wrap-up | pr — PR #430 — open, head worktree-dispatch-422 (residue sweep, remedy: record) | accepted | Not residue: this is #422's own PR, expected to be open at this exact checkpoint (residue sweep runs in Phase 3, before Phase 4's Auto-merge/merge decision in this same wrap-up run). Accepted without a Phase 2 drill — no `AskUserQuestion` tool is available in this headless dispatch context, and the resolution is mechanical (pipeline-stage-relative), not a judgment call with competing options |
