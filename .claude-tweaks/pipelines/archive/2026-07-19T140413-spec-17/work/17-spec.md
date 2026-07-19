---
record: 17
origin: human
risk: low
effort: low
grants: []
surface: backend
---
# 17: Audit /wrap-up skill; ensure 'manual action' items become GitHub issues

Surface: backend

## Current State

Ran the requested audit against the current codebase (v6.8.0): every place `/claude-tweaks:wrap-up` (and the skills feeding it) produces a "manual action" / human-follow-up item, and whether it lands as a durable GitHub issue or only as prose.

Two of the three named surfaces are already compliant:

- **Leftover routing** (`skills/wrap-up/leftover-routing.md`) — every disposition except `Drop`/`Finish now` creates a real work record (staged then Review-Console-approved in auto mode; created directly on explicit per-item confirmation in interactive mode). Compliant.
- **Review Console** (`skills/wrap-up/review-console.md`) — its Queue writes section (Section 7) already generically drains any staged record proposal, from leftover routing or "another step," through per-item `AskUserQuestion` approval before creating the record. Compliant, and already designed to be a shared drain for more than one producer.

The third — **the ledger resolve gate** (`skills/ledger/resolve-gate.md`, Phase 3, called from `/wrap-up` Step 8.5) — has a real, narrow gap. Its `Close out` disposition offers three terminal outcomes: `Accept`, `Acknowledge`, `Drop`. `Accept` and `Drop` are correctly ledger-only (nothing further needs to happen — the user explicitly decided not to act, there's nothing to track). But `Acknowledge` is documented as "Ops item requiring action outside the codebase" — i.e., there **is** outstanding action, just not one the agent can perform — and Phase 3 currently just does `record as acknowledged` in the ledger file, with no GitHub issue or local-files record created.

This matters because the ledger file itself is deleted at wrap-up cleanup (`cleanup-procedures.md` item 2, "Delete via `/ledger`'s delete operation, only after Step 8.5 confirms zero open items") once every item — including `acknowledged` ones — is resolved. And the terminal "Manual Steps Required" table (`skills/wrap-up/SKILL.md` Step 9's summary, and its `flow`/`multi-spec`/`failure-cards` mirrors) renders these `Acknowledged` rows straight into the chat transcript with no linked issue. Once wrap-up finishes, an `Acknowledge`d manual step exists nowhere durable — not the deleted ledger, not a GitHub issue, only the chat transcript — even though it explicitly represents work someone still needs to do, contradicting this project's own `backlog-backend: github-issues` convention that durable follow-up work lives on the tracker.

Traced the origin: `build/SKILL.md` Spec Step 2.5 ("Classify and Seed Manual Steps") correctly seeds a "truly manual" Manual Step into the ledger's `ops` phase with a `(reason-not-auto: …)` qualifier (`ledger/SKILL.md`'s "Required for `ops`-phase items" section) — that part is fine. The gap is purely at resolution time, in resolve-gate.md's Phase 3.

## Deliverables

Fix `Acknowledge`'s Phase 3 handling only — `Accept`/`Drop` are correct as-is and out of scope.

1. In `skills/ledger/resolve-gate.md` Phase 3, change the `Acknowledge` bullet so it stages a record proposal — same shape as the existing `Keep` bullet immediately above it (backlog stage, no `Trigger:` line, `{run-dir}/staged/ledger-record-{slug}.md`), but with `Origin: ledger resolve gate (acknowledged)` instead of the plain `Origin: ledger resolve gate`, and `Type: task` (an ops/manual-action item is maintenance work, not a bug or feature). Update the ledger status to `deferred` (note `→ backlog, acknowledged` in the Resolution column), same as `Keep` does. This routes through the Review Console's existing Queue writes section — no change needed there, since it already generically drains any staged proposal regardless of producer.
2. Update Phase 2's Step 2b `Acknowledge` option description in the same file to reflect that it now files a trackable record, not just a ledger status change.
3. Update every "Manual Steps Required" table mirror's example `Status` column value from `Acknowledged` to `Filed as #{n}` (the record is already created by the time any of these render, since Step 8.6's Review Console runs before Step 9's summary — and equivalently before `/flow`'s own Pipeline Summary). `grep -rn "Manual Steps Required" skills/**/*.md` currently finds 6 occurrences: `skills/wrap-up/SKILL.md`, `skills/flow/SKILL.md`, `skills/flow/multi-spec.md`, `skills/flow/failure-cards.md`, `skills/build/handoff-template.md`, and `skills/review/review-summary-template.md`. Re-run the grep at implementation time rather than trusting this list — this is exactly the "same fact restated in more than one place" pattern this project's own CLAUDE.md flags as easy to half-fix, and the count above was itself corrected once already while drafting this record (an initial pass found only 4 of the 6).

## Acceptance Criteria

- `skills/ledger/resolve-gate.md`'s Phase 3 `Acknowledge` bullet stages a record proposal (matching `Keep`'s shape) instead of only updating ledger status.
- `grep -rn "Acknowledged" skills/wrap-up/SKILL.md skills/flow/SKILL.md skills/flow/multi-spec.md skills/flow/failure-cards.md skills/build/handoff-template.md skills/review/review-summary-template.md` — every remaining hit (if any) is a status value, never a terminal untracked state with no linked issue reference.
- No behavior change to the `Accept` or `Drop` dispositions, or to any other Phase 1/Phase 2 path — confirm by diffing resolve-gate.md and checking only the `Acknowledge` bullet and the Step 2b option description changed.
- `npm test` passes in full (this is a documentation-only change; expect no test impact, but confirm rather than assume).

## Technical Approach

### Key Files

- `skills/ledger/resolve-gate.md` — Phase 3's `Acknowledge` bullet, Phase 2's Step 2b option description
- `skills/wrap-up/SKILL.md`, `skills/flow/SKILL.md`, `skills/flow/multi-spec.md`, `skills/flow/failure-cards.md`, `skills/build/handoff-template.md`, `skills/review/review-summary-template.md` — every current "Manual Steps Required" table mirror (re-verify with `grep -rn "Manual Steps Required" skills/**/*.md` at implementation time — do not trust this list without re-checking)

### Approach

Reuse the existing `Keep` staging mechanism verbatim rather than inventing a new one — `Acknowledge` becomes "`Keep`, plus an `Origin:` qualifier and `Type: task`," not a new code path. The Review Console's Queue writes section already generically drains staged proposals from more than one producer, so no change is needed there.

## Gotchas

- `Accept` and `Drop` are deliberately excluded from this fix — verified by reading their descriptions ("Intentional, with stated reason" / "No longer relevant") rather than assuming symmetry with `Acknowledge`. Making all three uniformly file issues would be noisy and wrong; only `Acknowledge`'s own documented meaning ("requires action outside the codebase") implies outstanding, trackable work.
- Verify the exact set of "Manual Steps Required" table mirrors via a live grep before editing (`grep -rn "Manual Steps Required" skills/**/*.md`) — do not assume the 6 files listed above are exhaustive without re-checking; this project's own CLAUDE.md flags stale cross-file restatements as a recurring failure mode when only the first-found location gets fixed.
- Do not touch `build/SKILL.md` Spec Step 2.5 — it already correctly seeds `ops`-phase items into the ledger; the gap is entirely at resolution time in resolve-gate.md's Phase 3, not at seeding time.

## Original request

Audit /wrap-up skill; ensure 'manual action' items become GitHub issues

**Related:** none

Context: Prompted by a general check-in on /wrap-up's health. Separately, wrap-up (and related flows like the Review Console / leftover routing) may surface items tagged as requiring manual follow-up that currently just sit in ledger/console output instead of becoming trackable, durable GitHub issues.

Scope: Run an audit of skills/wrap-up/*.md for drift/accuracy (similar in spirit to /harness-health). Specifically check every place wrap-up produces a 'manual action' / human-follow-up item (Review Console, leftover routing, cleanup procedures) and confirm each one is filed as a GitHub issue rather than left as prose only, per this project's backlog-backend: github-issues convention.

