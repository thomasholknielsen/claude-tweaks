---
record: 218
origin: human
risk: low
effort: low
ceremony: fast-lane
grants: []
fingerprint: 2026-08-08-model-profile-strategy:routine-model-drift-detection-and-stale-statusline-fixtures
surface: bin
---
# 218: Routine model drift detection and stale statusline fixtures

Surface: bin
Parent: #215

## Overview

Make a cloud Routine's `model` visible to drift detection end-to-end, and refresh stale statusline test fixtures. Red-team corrected this record's original premise: adding `model` to `SIGNIFICANT_FIELDS` alone is **inert**, because the instantiated routine record (`.claude-tweaks/routines/*.yml`) never persists a `model:` key — the record-write template omits it, so the record-vs-record diff would compare nothing against nothing. The real change is two-part: persist `model` into the instantiated record at create/update time, then include it in the significant-field diff. Second, `tests/statusline.test.js` fixtures still use `claude-sonnet-4-6` display data.

**Complexity:** Low
**Estimated tasks:** 5

## Non-Goals

- Changing any routine template's actual `model:` value — all six stay `claude-sonnet-5` (parent's Decision Rationale).
- Adding a `--model` flag to `/claude-tweaks:routine` — the existing `session_context.model` override is documented instead.
- Any statusline rendering change — fixtures only.
- Touching `skills/routine/status.md`'s live-API check (Step 3.5) — it compares the live `session_context.model` against the resolved **template**; the record-level diff below compares two copies of the instantiated **record**. These are two independent checks over different objects; this leaf adds the record half, it does not merge them.

## Current State

- Record-write template: `skills/routine/create-and-update.md` (~lines 130-136) writes `routine_id`/`template`/`template_version`/`created_at`/`schedule`/`console_url`/`branch` — **no `model`**; `skills/_shared/routine-template-schema.md`'s "Instantiated record" table matches.
- `bin/lib/routine-template-parser.js:195` — `SIGNIFICANT_FIELDS = ['routine_id', 'template', 'template_version', 'schedule', 'branch']`, exported ~line 402, consumed by `compareRoutineRecords` (~338-354), which diffs local vs upstream copies of the instantiated record.
- `skills/routine/SKILL.md` documents options (`--branch` only); `skills/_shared/routine-diagnostic-probe.md:63` notes `session_context.model` is caller-overridable.
- `tests/routine-template-parser.test.js` covers parser + significant-field diffs; `tests/statusline.test.js` (~140-148, ~500) uses `claude-sonnet-4-6` fixtures.

## Deliverables

- [ ] `skills/routine/create-and-update.md`: the instantiated-record write template gains `model: {template.model}`; `skills/_shared/routine-template-schema.md`'s Instantiated-record table updated to match
- [ ] `'model'` added to `SIGNIFICANT_FIELDS` in `bin/lib/routine-template-parser.js`
- [ ] `tests/routine-template-parser.test.js`: (a) a model change between local and upstream copies of the **instantiated record** is reported as a significant-field diff; (b) a fixture shaped like a pre-change CREATE-written record (no `model:` key) diffed against a post-change record demonstrates the transition case rather than silently normalizing; both demonstrated red first per IL-105
- [ ] One sentence in `skills/routine/SKILL.md` documenting the `session_context.model` override (pointing at the diagnostic probe's existing note)
- [ ] `tests/statusline.test.js` fixtures updated to current family data (`claude-sonnet-5` / `Sonnet 5`), assertions unchanged in behavior

## Acceptance Criteria

1. A record freshly written by the create/update procedure carries `model:`; `compareRoutineRecords` reports a model edit as significant; the new test fails when `model` is removed from `SIGNIFICANT_FIELDS`.
2. The transition fixture (old record without `model:` vs new record with it) produces a defined, tested outcome — reported as a significant diff, not a crash or silent equality.
3. All existing parser and statusline tests pass with only fixture strings changed where they named the stale model.
4. `npm test` green.

## Technical Approach

### Key Files

- `skills/routine/create-and-update.md` — record-write template line
- `skills/_shared/routine-template-schema.md` — instantiated-record table
- `bin/lib/routine-template-parser.js` — SIGNIFICANT_FIELDS
- `tests/routine-template-parser.test.js` — two new cases
- `tests/statusline.test.js` — fixture strings
- `skills/routine/SKILL.md` — one doc sentence

## Gotchas

- Statusline fixtures are display inputs — `renderModel` prefers `display_name` over `id`; update both fields per fixture so the same precedence branches stay exercised (IL-62: keep expectations independent of the implementation).
- Existing live routine records predate the template change and lack `model:` — the transition-fixture test above pins how the diff treats them; the next `/routine` update of each routine backfills the key naturally.
- Before building, check open records #212/#213/#209 for claims via `_shared/issue-claims.md`'s lock and a `gh issue view` on each — they touch neighboring routine files.


<!-- work-fingerprint: 2026-08-08-model-profile-strategy:routine-model-drift-detection-and-stale-statusline-fixtures -->
