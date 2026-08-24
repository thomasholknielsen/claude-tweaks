# Open Items — dispatch: second-call templates conflate worktree-removal deferral with claim/archival deferral

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | ops | Worktree branch is 323 commits behind origin/main at pre-flight — build's own worktree-setup catch-up will fast-forward it | observation | Deferred to /build Common Step 1 post-creation catch-up |
| 2 | review | task-prompt.md's OUTCOME state-check paragraph (added by this record) gathers claim-liveness/label state but never ties it to an explicit decision beyond the PR-state → pending-review rule, and reads unscoped relative to the failed/blocked claim-release disposition stated two paragraphs above it | open | Staged at staged/review-1.patch |
| 3 | review | task-prompt.md's fixed OUTPUT FORMAT OUTCOME enum omits `ready-to-merge`, contradicted by the local-merge paragraph this record extensively rewrote just below it — pre-existing since commit b39013d8 (2026-08-14), exposed by this record's rewrite of the surrounding text | open | Staged at staged/review-2.patch |
