# Open Items — record #832 (decomposition-mode.md interactive/mechanical split)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | Stale cross-reference: `design-pre-steps.md:150,197` say "decomposition mode's Step 3 in `decomposition-mode.md`" but Step 3 moved to `decomposition-mode-closeout.md` in this diff | open | — |
| 2 | review | `mechanical-handoff.md`'s Required Inputs table omits the `Visual-reference:` scaffold-path field (Step 2.5b-ii's accepted-variant output), which Step 3 needs when a frontend unit's scaffold was accepted | open | — |
| 3 | review | `mechanical-handoff.md`'s Required Inputs table lists `--chained` flag state as a carried input, but `--chained` is a shaping-mode-only flag (`SKILL.md`:48) that decomposition mode never receives — no call site references it anywhere in `decomposition-mode.md`/`decomposition-mode-closeout.md` | open | — |
| 4 | review | `tests/specify-mechanical-handoff.test.js` has three test-discrimination gaps: (a) line 43's assertion only checks presence of `decomposition-mode-closeout.md`, not absence of a `decomposition-mode.md` read instruction; (b) line 26's regex `/[Ww]ork.unit list/` uses an unescaped `.` metacharacter, overly permissive; (c) lines 48-52's test name claims "ambiguity" coverage but no assertion checks for it | open | — |
