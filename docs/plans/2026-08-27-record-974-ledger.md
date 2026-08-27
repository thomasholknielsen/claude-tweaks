# Open Items — #974: In-flight-tombstone claim stop (#315) isn't wired into Settle's contest handling or the gh-absent MCP transport

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review/hindsight | No changes needed — approach is sound (5 evaluations, no findings) | accepted | Approach, structural debt, consolidation, convention, skill-worthy patterns all clean — see decisions.md 15:54:45. |
| 2 | wrap-up | Pattern observation: build shipped the #315 wiring fix with no pinning test; caught by review's Test Quality lens, causal: terminal. Staged: staged/reflect-1.md | fixed | Skills curation row added a Gotchas bullet to `.claude/skills/shared-contract-extraction/SKILL.md` naming #974. Commit `7d322443`. |
| 3 | wrap-up | Friction: one contract-violation event (waiting-turn narration during background code-simplifier dispatch), avoidability ambiguous. Staged: staged/reflect-2.md | fixed | Skills curation row found the real root cause (no agent-identity awareness in `bin/lib/hooks/subagent-stop.js`) and fixed both `plugin/skills/_shared/subagent-output-contract.md` (`0e0eef95`) and `plugin/skills/reflect/full-mode.md` (`0e6e22ee`). |
