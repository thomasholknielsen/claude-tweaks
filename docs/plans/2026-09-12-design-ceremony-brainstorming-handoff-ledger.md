# Open Items — record #1886 (design-ceremony brainstorming handoff)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | Task 1's new `design-ceremony` policy key broke `tests/policy-schema.test.js`'s hardcoded `POLICY_KEYS.length` pin (66 -> 67), surfaced by Task 2's full-suite run rather than Task 1's own scoped review | fixed | Bumped the count and appended the file's own bump-history comment convention — `e2898a731` |
| 2 | build | Final whole-branch review (opus, resolve-profile.js capable): 6 Important + 6 Minor findings, 0 Critical | fixed | Bundled findings #1, #2, #4, #7, #8 into one fix wave, scoped re-review confirmed all ADDRESSED with no new breakage — `696a729e7` |
| 3 | build | Architecture-alignment deviation: composition uses a new pure-function+CLI seam (`compose-brainstorm-args.js`) rather than inline per-site prose as the spec originally described | fixed | Classified Beneficial (AUTO) — spec's Technical Approach section updated in place on the live GitHub issue to describe the as-built architecture and why it was kept |
| 4 | build | 4 deferred final-review findings (capture route wiring, prose-conformance test, policy-schema.md headroom, fast-lane/ceremony-profile value collision) — out of #1886's own Non-Goals scope | resolved | Filed as follow-up backlog record `#2347` (Defer-reason: genuinely-larger); deliberately left unstamped (no `ready`/risk/size) since one deliverable explicitly needs human judgment before it can be auto-built |
| 5 | build | Skill Observation: reviewed the new `compose-brainstorm-args.js` CLI against `.claude/skills/gh-api-module-pattern` | closed | No divergence, no new wrinkle — a straightforward instance of the already-documented CLI-wrapper-for-run-directory-writers-and-similar-pure-CLIs pattern; no skill update warranted |

All items resolved. No open items remain from the build phase.
