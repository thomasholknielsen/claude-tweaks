# Inbox

## Revisit /deepen — standalone skill vs /review mode

**Added:** 2026-06-14 | **Category:** technical | **Related:** docs/decisions/0001-deepen-standalone-and-flow-survey.md

Context: `/deepen` shipped as a standalone component skill (ADR 0001). The weakest point of that decision was skill-count adjacency with `/simplify` — two "clean up recent code" skills at different altitudes. The contract mismatch (auto-apply vs stage-only) made merging into `/simplify` wrong, but a `/review deepen` mode was a viable alternative deferred only because review is a gate, not a refactoring tool.

Scope: If the skill count grows or users find the simplify/deepen boundary confusing, evaluate collapsing `/deepen` into a `/review deepen` mode. The depth-analysis discipline (deletion test, leverage ranking, stage-don't-apply, two-stage interaction) must survive the move. No action unless the adjacency actually causes friction — this is a watch item, not a planned change.

## Reframe Subagent Contract docs — correctness vs token-saving

**Added:** 2026-06-13 | **Category:** technical | **Related:** none

Context: Removing the v4.2 bash-output filter exposed that CLAUDE.md's "token-saving infrastructure" label also covered the Subagent Contract, making the removal scope ambiguous. The contract's real load-bearing value is correctness (status protocol, working-directory discipline, output templates), not unmeasured token savings.

Scope: Reframe `skills/_shared/subagent-output-contract.md` and its CLAUDE.md references so the contract reads as dispatch-correctness discipline, not a cost optimization — keep the mechanism, drop the "saves tokens" framing. Doc-only.
