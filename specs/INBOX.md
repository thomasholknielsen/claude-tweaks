# Inbox

## Reframe Subagent Contract docs — correctness vs token-saving

**Added:** 2026-06-13 | **Category:** technical | **Related:** none

Context: Removing the v4.2 bash-output filter exposed that CLAUDE.md's "token-saving infrastructure" label also covered the Subagent Contract, making the removal scope ambiguous. The contract's real load-bearing value is correctness (status protocol, working-directory discipline, output templates), not unmeasured token savings.

Scope: Reframe `skills/_shared/subagent-output-contract.md` and its CLAUDE.md references so the contract reads as dispatch-correctness discipline, not a cost optimization — keep the mechanism, drop the "saves tokens" framing. Doc-only.
