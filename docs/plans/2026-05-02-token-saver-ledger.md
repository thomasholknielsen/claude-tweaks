# Open Items — Token Saver

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | Design listed 7 skills with Task-agent dispatch sites; actual sites are in browse, help, review (×2), tidy. The other 6 (visual-review, reflect, journeys, stories, test, build) only have Form A parallel I/O, not Form B agents. Updated only the real dispatch sites. | fixed | Real dispatch sites updated with Template references; design overstated scope is documented |
| 2 | build/skill | Forward-looking: when visual-review/reflect/journeys/stories/test/build start dispatching Task agents, they should reference the subagent-output-contract.md. CLAUDE.md updated to make this a convention. | accepted | Convention documented in CLAUDE.md ("Subagent output contract" section + Don'ts entry); future skill changes are guarded |
| 3 | review | Test coverage gap: bin/lib/* (paths, jsonl, color, deps) had only indirect e2e coverage. Added tests/lib.test.js with 13 unit tests for jsonl tail-read, malformed-line skip, NO_COLOR variants, paths construction, deps probing. | fixed | tests/lib.test.js (13 cases) — `2e0a60d` |
| 4 | review | Bash log timestamps use Date.now() — could collide on sub-millisecond rapid-fire calls. | accepted | Practically impossible; if it happens the log gets overwritten but the same content is visible in the conversation tool result anyway |
| 5 | review | findActiveSpec only matches files with 3+ digit numeric prefix. | accepted | Matches the claude-tweaks spec naming convention (NNNN-name.md) documented in /specify and /init |
| 6 | review | README v4.2 section doesn't link directly to design doc. | accepted | Design doc lives in docs/superpowers/specs/ and is discoverable; specs aren't typically cross-linked from the README |
