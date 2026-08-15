# Open Items — /init worktree isolation (wrap-up reflection)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | wrap-up | Reflect insight: writing new phase-level SKILL.md mechanism content inline and extracting only after hitting the 40 KB ceiling costs several rounds of manual byte-trimming — draft the sub-file first next time | fixed | Added a clause to `docs/donts.md`'s SKILL.md-extraction rule |
| 2 | wrap-up | Reflect insight (D4, memory): committed a fabricated issue reference (`refs #488`) with no backing issue, caught only by self-review before merge — reflexive habit applied without checking an issue existed | open | Staged for Memory curation row — `staged/reflect-1.md` |
| 3 | wrap-up | Reflect insight (D5, upstream): the Friction lens depends on a run directory's `events.jsonl` existing during the work, but ad-hoc worktree dev sessions create no run dir until wrap-up runs afterward, so friction incurred during such work is invisible to the lens after the fact | open | Staged for Upstream feedback row — `staged/reflect-2.md` |
| 4 | wrap-up | Reflect insight: local `main` was 87-92 commits behind `origin/main` with unrelated pre-existing dirty state at merge time, forcing a pivot from a planned local-merge to a PR | accepted | Don't capture — this repo already defaults to PR-first for worktree landings; no new rule needed |
