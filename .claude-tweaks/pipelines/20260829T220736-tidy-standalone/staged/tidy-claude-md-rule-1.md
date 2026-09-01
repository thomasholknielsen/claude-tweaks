# Staged: CLAUDE.md rule — enforce subagent status-line contract

Invariant: dispatched Task agents keep skipping the required DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED
status line, and the contract's own "re-prompt once on violation" step is itself being skipped by
dispatching sessions. Seen in reflect notes for records/specs 832, 1318, 1219, 803 (5 violations in
one run alone, 5-day sample).

Proposed docs/donts.md addition (or a CLAUDE.md `## Don'ts` pointer entry):

> **Re-prompt on missing status line, don't just note it.** When a dispatched Task agent's reply
> lacks the required DONE/... status line, the dispatcher re-prompts once (per
> `_shared/subagent-output-contract.md`'s "Re-prompt on violation") before accepting the output —
> never a one-off note that the line was missing followed by acceptance anyway.
> **Why:** an unrouted result is a result you will misread — a failed dispatch aggregates silently
> as clean. Observed 5 violations in a single 5-day sample, with the re-prompt step itself skipped
> each time.

Source: plugin/skills/_shared/subagent-output-contract.md; friction-events.js contract-violation
events across records 832, 1318, 1219, 803.
