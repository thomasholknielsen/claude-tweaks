---
record: 37
origin: human
risk: low
effort: low
ceremony: fast-lane
grants: []
surface: backend
---
# 37: unattended-tier: 3 minor documentation follow-ups from final review

Surface: backend

## Current State

- `skills/wrap-up/review-console.md`'s Unattended-tier auto-file section describes its queue-write detection heuristic as looking for "a decisions.md STAGED entry phrased as a record proposal" — but the ledger Phase 2 narrowing step actually logs items as `AUTO`, not `STAGED`. The heuristic still functionally works today because the same sentence also names the leftover-/ledger-record staged-file naming as an alternate identifying signal, but a literal reading of just the STAGED clause would miss an AUTO-logged narrowed item. A narrowed item currently produces two AUTO log entries (narrowing's own + the console's) — expected, but undocumented.
- `skills/_shared/auto-mode-contract.md`'s "What auto does NOT silence" table has no ops-acknowledgment row (neither confirming nor excepting it), while `CLAUDE.md`'s unattended-tier caveat names "ops-ack" as an exception to something the table never establishes in the first place.
- `skills/init/claude-md-template.md`'s `## Auto-mode policy` block omits the `unattended-tier` lever entirely, so a freshly `/init`-generated CLAUDE.md has no way to discover or set it.

## Deliverables

- [ ] Tighten `review-console.md`'s auto-file detection wording from "a decisions.md STAGED entry" to "a decisions.md STAGED or AUTO entry"; add a short comment noting a narrowed item currently produces two AUTO log entries (narrowing's own + the console's), which is expected and fine.
- [ ] Add a dedicated ops-acknowledgment row to `auto-mode-contract.md`'s "What auto does NOT silence" table.
- [ ] Add `unattended-tier: off  # off | on` to `init/claude-md-template.md`'s `## Auto-mode policy` block, completing the precedence chain.

## Acceptance Criteria

1. `skills/wrap-up/review-console.md`'s auto-file detection sentence reads "STAGED or AUTO entry" (or equivalent wording covering both), and a comment is present noting the double-AUTO-log-entry case for a narrowed item.
2. `skills/_shared/auto-mode-contract.md`'s "What auto does NOT silence" table has an explicit ops-acknowledgment row.
3. `skills/init/claude-md-template.md`'s `## Auto-mode policy` block includes the line `unattended-tier: off  # off | on`.
4. No behavior change — these are documentation/discoverability-only edits; nothing in the actual detection logic, silencing behavior, or generated CLAUDE.md defaults changes.

## Technical Approach

Three independent text edits across three files. No shared logic and no ordering dependency between them — any can land first.

### Key Files

- `skills/wrap-up/review-console.md` — Unattended-tier auto-file section: tighten the STAGED/AUTO wording, add the double-log-entry comment
- `skills/_shared/auto-mode-contract.md` — "What auto does NOT silence" table: add the ops-ack row
- `skills/init/claude-md-template.md` — `## Auto-mode policy` block: add the `unattended-tier` line

## Gotchas

- This is a pure documentation-completeness fix — do not also change the ledger Phase 2 narrowing step's actual log-entry kind (AUTO vs STAGED); the acceptance criteria explicitly call for wording-only, no behavior change.
- Item 1's fix must preserve the existing alternate identifying signal (leftover-/ledger-record staged-file naming) already named in the same sentence — don't delete it while tightening the STAGED/AUTO wording.

## Original request

unattended-tier: 3 minor documentation follow-ups from final review

Origin: wrap-up reflection insight from the unattended-tier feature (merged `b09c7b6`)

Three small documentation-completeness follow-ups the final whole-branch review judged Minor / non-blocking for that merge, deferred here rather than dropped:

1. **AUTO/STAGED detection wording nuance** — `skills/wrap-up/review-console.md`'s Unattended-tier auto-file section leads its queue-write detection heuristic with 'a decisions.md STAGED entry phrased as a record proposal,' but the ledger Phase 2 narrowing step logs items as AUTO, not STAGED. Functionally resolved (the same sentence also names the leftover-/ledger-record- staged-file naming as an identifying signal), but tighten the wording to 'STAGED or AUTO entry' so a literal reading doesn't miss it. Also note: a narrowed item currently gets two AUTO log entries (narrowing's + the console's), which is fine but worth a comment.
2. **Ops-ack table gap** — `skills/_shared/auto-mode-contract.md`'s 'What auto does NOT silence' table never had an ops-acknowledgment row to begin with (positive or negative); `CLAUDE.md`'s new unattended-tier caveat names 'ops-ack' as an exception with nothing to except from. Add a dedicated ops-acknowledgment row to that table.
3. **init template discoverability** — `skills/init/claude-md-template.md`'s `## Auto-mode policy` block omits `unattended-tier`, so the lever isn't discoverable/settable from a freshly `/init`-generated CLAUDE.md. Add `unattended-tier: off  # off | on` to complete the precedence chain.

Deliverables:
- [ ] Tighten review-console.md's auto-file detection wording (item 1)
- [ ] Add an ops-acknowledgment row to auto-mode-contract.md's does-NOT-silence table (item 2)
- [ ] Add unattended-tier to init/claude-md-template.md's Auto-mode policy block (item 3)

Acceptance criteria: all three follow-ups landed; no behavior change, documentation/discoverability only.
