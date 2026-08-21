---
record: 970
title: "specify routine-template + fleet row between finders and grant unit"
origin: human
risk: low
size: low
ceremony: standard
grants: []
surface: backend
---

Surface: backend

## Overview

Make the shaping unit fire on schedule. Adds `plugin/skills/specify/routine-template.yml` (prompt: `/claude-tweaks:specify next`) and a fleet composition row at 08:00 UTC weekdays — after the 05:00–07:00 finder window so overnight-filed records are visible to the firing, and before the 09:00 grant unit so the one record each firing shapes is grantable the same morning. Throughput is deliberately one record per weekday firing — the backlog drains over days at this cadence, not in one window; raising cadence is a later policy decision, not this record's scope.

**Complexity:** Low
**Estimated tasks:** 4

## Non-Goals

- No new Manifesto policy levers — the row rides the existing `autonomy` ceiling like every non-grant fleet row; grant consequences are already gated by #969's provenance rule. If build-time review concludes shaping itself should be tier-gated, that is a scope addition to raise, not an implementer-invented lever.
- No changes to other rows' schedules or to the grant unit's conditional provisioning.
- No #524 kernel restructure — the template follows today's frozen-preamble convention and becomes one more migration consumer for #524.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #967 | specify next: headless selection form + shared headless-self-report extraction | must land first — the template's prompt must exist. Before authoring the template, verify `next` is present in the built tree (`grep -n "next" plugin/skills/specify/SKILL.md` shows the Input form); the blocked-by edge encodes the order, this check proves it |

## Current State

- `plugin/skills/dispatch/routine-template.yml` — the closest sibling: a headless `next` prompt whose `notes:` spell out its own eligibility rule and empty-queue cheap-no-op, and whose standalone `default_schedule.cron_expression` (`11 */2 * * 1-5`) deliberately differs from its fleet-table cron (`0 10 * * 1-5`) — the two values are independently chosen by precedent. Seven templates exist today (backlog, dispatch, tidy, code-health, docs-health, journey-health, harness-health), with independent per-file `template_version` counters.
- `plugin/skills/routine/fleet.md` — the composition table (rows 1–11: finders 1–4, generalist sweeps 5–8, grant unit 9, dispatch 10, tidy 11), the stagger-rationale paragraph, the naming derivation, the partial-fleet rule, and the idempotent reconcile (`fleet on` re-run adopts new rows). Row numbers are cited elsewhere in the file both as prose ("row 9") and as bare numerals in example tables.
- `tests/routine-template-schema.test.js` and `tests/routine-template-parser.test.js` — schema/parser pins over the template set.
- `plugin/skills/routine/create-and-update.md` — the CREATE procedure fleet mode parameterizes per row.

## Deliverables

- [ ] `plugin/skills/specify/routine-template.yml` — conforms to the template schema; prompt `/claude-tweaks:specify next`; `template_version: 1` (first version of a new file); `default_schedule.cron_expression: 23 */2 * * 1-5` (an independent standalone cadence following dispatch's precedent, offset from dispatch's `11 */2` to avoid same-minute collisions; the fleet-table cron below is separate by design); `notes:` describe the zero-eligible cheap-no-op by citing `next-mode.md`'s landed eligibility predicate (#967's wording is the source of truth — do not paraphrase a competing definition).
- [ ] `routine/fleet.md` composition table: one new row — **row 9**, bucket "Shaping unit", entry specify, source template above, focus n/a, cron `0 8 * * 1-5`, `PREFIXED_NAME` `{REPO_SLUG}-specify-weekdays` (standard naming derivation) — inserted between the generalist sweeps and the grant unit, shifting grant unit 9→10, dispatch 10→11, tidy 11→12; the stagger-rationale paragraph gains the 08:00 slot's reasoning (after finders, before grant).
- [ ] Cardinality/renumbering sweep — repo-wide, with example and illustrative tables explicitly in scope: `grep -rnE "row (9|10|11|12)" plugin/ docs/ tests/` for prose citations AND `grep -nE "^\| (9|10|11) \|" plugin/skills/routine/fleet.md` for bare-numeral table cells (fleet.md's own example summary tables number rows too); fix every stale reference the sweep finds, or report the sweep explicitly empty.
- [ ] A one-line comment on #524 naming the new template as its eighth migration consumer.
- [ ] Tests: the schema/parser suites demonstrably scan the new template, plus a permanent name-based assertion (the template set the suite scans includes `specify/routine-template.yml` by name), so a later glob/enumeration refactor cannot silently drop it.

## Acceptance Criteria

1. `node --test tests/routine-template-schema.test.js tests/routine-template-parser.test.js` passes with the new template in the scanned set, and a permanent name-based assertion pins its membership (not only a one-time dev-time proof).
2. `fleet.md`'s composition table contains the new row 9 with cron `0 8 * * 1-5` and the standard-derivation name; grant/dispatch/tidy rows read 10/11/12; the stagger paragraph explains the slot.
3. The renumbering sweep (Deliverable 3) is run with both patterns and its findings either fixed or explicitly reported empty.
4. The #524 comment exists naming the new template.
5. `npm test` passes.

## Technical Approach

Copy `dispatch/routine-template.yml` as the starting point — same headless-`next` shape, same no-op economics — changing the prompt, name, description, schedules, and `template_version` as specified above. The fleet.md edit is a table row plus one rationale sentence plus the mechanical renumber; the reconcile machinery needs no change (`fleet on` re-run is the adoption path, and the partial-fleet rule already covers repos lacking the template).

### Key Files

- `plugin/skills/specify/routine-template.yml` — new
- `plugin/skills/routine/fleet.md` — table row + renumber + stagger rationale
- `tests/routine-template-schema.test.js`, `tests/routine-template-parser.test.js` — coverage + membership assertion

### Package Dependencies

- none

## Gotchas

- `fleet on` re-run IS the reconcile path — an existing fleet adopts the new row on its next run; no migration step exists or is needed.
- The template's preamble must match the current template conventions byte-for-byte where the schema requires it (`routine/SKILL.md`'s anti-patterns: a preamble edit without version bumps ships silently stale).
- Scheduled-Routine sandboxes have measured parity gaps (IL-113/IL-117) — fleet mode's Step 2 honesty check already covers this; the template must not restate it.
- The composition table is the single enumeration of fleet membership (cardinality rule) — the new row goes there and nowhere else.

<!-- work-fingerprint: headless-shaping-unit:specify-routine-template-fleet-row-between-finders-and-grant -->
