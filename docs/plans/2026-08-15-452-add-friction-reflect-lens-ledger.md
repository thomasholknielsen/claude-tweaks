# Open Items — Add a Friction reflect lens fed by hook-denial and AskUserQuestion events

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | ops | Pre-flight branch-divergence: origin/main is 3 commits ahead (materialize.md wording fix, #439 spec materialization, PR #449 merge — none touch reflect/hooks/feedback). Continued per auto mode. | accepted | Unrelated to this record's files; reversibility: low (divergence persists) per contract, accepted as no-risk given file scope. |
| 2 | review/hindsight | Skill-worthy pattern: transcript-as-ground-truth technique for verifying live hook payload shapes (used to catch #452's wrong AskUserQuestion schema assumption). [skill: NEW - transcript-payload-verification] | deferred | Staged to Review Console via staged/reflect-1.md. |
| 3 | wrap-up | Near-misses (systemic): blocking-verification-deliverable downgrade risk — Task 0's live-capture requirement was silently downgraded to a doc re-read during plan authoring, nearly shipping a wrong schema. | deferred | Staged to Review Console via staged/reflect-2.md. |
| 4 | wrap-up | pr — PR #455 open, head worktree-wrapup-friction-feedback (this work) — remedy: record (this run's own PR; not Phase 1's to fix, Phase 2 drills disposition). | accepted | Dropped per user — no longer relevant (resolves via this run's own Phase 4 merge). |
| 5 | wrap-up | Residue sweep: test-suite probe unknown (skipped via --no-suite — full npm test already ran clean during /claude-tweaks:test earlier this run). | observation | Not a missed check — full suite already ran and passed (3558/3558) earlier in this run. |
