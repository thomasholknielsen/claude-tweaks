# Open Items — Wrap-Up Drift Prevention (#54-#58, parent #53)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review/hindsight | Pattern observation (record #54): extending a closed status enum consumed by multiple files took 3 review rounds to fully wire up — candidate CLAUDE.md Don't refinement. Staged at spec-54/staged/reflect-1.md. | deferred | Staged for Review Console |
| 2 | review/hindsight | Pattern observation (record #56): a plan's own deletion step justified removing real content ("registry maintenance") by asserting it "now lives in" a later step, but that later step never actually included it — silently dropped functionality survived 2 task-scoped reviews and the plan's own Self-Review Notes, caught only by a 3rd-layer Convention Compliance pass. Candidate CLAUDE.md Don't refinement. Staged at spec-56/staged/reflect-1.md. | deferred | Staged for Review Console |
| 3 | review/hindsight | Pattern observation (record #58): a case-sensitive verification grep (`"Both consumers"`) used to confirm a stale-phrase fix missed a lowercase second occurrence in a section heading, caught only by the next review layer's case-insensitive sweep — minor refinement candidate for the existing stale-cross-reference Don't. Staged at spec-58/staged/reflect-1.md. | deferred | Staged for Review Console |
