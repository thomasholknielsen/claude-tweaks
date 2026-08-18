---
record: 687
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 687: review: Failed-agent output retrieval reads the full raw envelope instead of just the trailing error

Surface: backend

## Current State

- `_shared/subagent-output-contract.md` defines dispatch input, status-line, and template discipline but has no rule for retrieving a *failed* agent's output. When a Task agent dies mid-flight (session-limit interruption, tool crash), `TaskOutput {block:true}` returns the whole raw transcript envelope — tens of KB of base64/JSONL internals — of which only the trailing `<error>` line is actionable. Measured at ~6% of one run's total tool-result characters for zero net information.
- The contract's third-party section already tells callers to distinguish unavailable / failed / empty / unparseable, but not how to read the failed case cheaply.
- **Related:** #649 (fan-out prose in the same contract file).

## Deliverables

1. A "Failed-agent retrieval" rule in `_shared/subagent-output-contract.md` (beside the status-line / aggregation sections): read the task-notification status first; on `failed`, retrieve only the trailing `<error>` block (or the tail of the named output file — last N lines), never a blocking full-envelope `TaskOutput`; on `completed`, proceed as today.
2. Name the concrete retrieval form (`TaskOutput` non-blocking + tail, or `tail -n` on the output-file path carried by the notification) so a dispatcher doesn't rediscover it.
3. Cite the rule from the fan-out skills' dispatch prose that currently say "collect results" without a failure branch — at minimum `/review`'s lens dispatch (`review/step3-lens-dispatch.md`) and `/dispatch`'s two-call gate (`dispatch/two-call-gate.md`) — one sentence + pointer each, no restatement.

## Acceptance Criteria

- `grep -n "Failed-agent" skills/_shared/subagent-output-contract.md` finds the section; it states the status-check-before-block order and names the tail-only retrieval form.
- The two cited dispatch files each carry a one-line pointer to that section.
- `npm test` green (skill-conventions / context-cost tests still pass — check `wc -c` on the contract file against the ceiling before adding).

## Technical Approach

Prose-only contract addition; keep it under ~15 lines. Verify the current size headroom of `subagent-output-contract.md` first (hard-ceiling headroom check).

## Gotchas

- The task-notification's exact status vocabulary is harness-defined; quote it from an observed notification (transcript-payload-verification), not from memory, so the rule keys on the real field.
- Retrieval rule only — no new stop, no new AskUserQuestion.

## Original request

review: Failed-agent output retrieval reads the full raw envelope instead of just the trailing error

**Related:** none

Context: When a dispatched Task agent dies mid-flight (e.g. a session-limit interruption), `TaskOutput {block:true}` returns the entire raw transcript envelope -- tens of KB of base64 and JSONL internals -- when only the trailing `<error>` line is actionable; measured at ~6% of one run's total tool-result characters for zero net information.

Scope: In `_shared/subagent-output-contract.md`, add a failed-agent retrieval rule -- check the task-notification status before blocking on `TaskOutput`, and on `failed`, retrieve only the trailing `<error>` block or the tail of the named output file.
