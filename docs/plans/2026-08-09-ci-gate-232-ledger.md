# Open Items — #232: Add automated CI gate running npm test on push/PR

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build/ops | Pre-flight merge check: origin/main was 30 ahead of local HEAD (and local main 19 ahead of origin — both-ways drift, concurrent sessions). Continued per auto; worktree merged origin/main as first action (merge commit `9e30364b`, one conflict in `skills/wrap-up/skill-curation.md` resolved to origin's structural refactor per IL-44) | acknowledged | Merge landed; divergence reconciliation on main belongs to the sessions that own the unpushed commits |
| 2 | build | Observation: post-merge tree combines local Group A's CLAUDE.md eviction (`a0864057`, refs #233) with origin's wrap-up refactor that moved skill-curation decision prose into review-console — any stale citations to the evicted CLAUDE.md conventions inside origin's moved content are Group A's reference sweep to finish, not this branch's scope | observation | — |
| 3 | build/ops | Verify the first live `test` workflow run goes green after this branch merges to `main` (the push trigger cannot fire pre-merge; spec AC "green on its own introduction" completes there). `gh run list --workflow test --limit 1` (reason-not-auto: requires-merge-first) | open | — |
