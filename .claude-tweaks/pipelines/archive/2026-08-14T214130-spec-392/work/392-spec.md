---
record: 392
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 392: Delete consumerless code: four skill-audit modules + _shared/unattended-tier.md

Surface: backend

## Current State

`bin/lib/skill-audit/` holds 863 prod lines, but only `bloat.js` (404) plus its two deps `context-cost.js` (81) and `anti-patterns.js` (115) are reachable from live surfaces (`skills/harness-health/judge-procedure.md:94`, `skills/_shared/harness-health-analysis.md:141`). Four modules have no importer anywhere: `qualified-refs.js` (67), `skill-catalog.js` (53), `identifiers.js` (80), `relationship-rows.js` (63) — ~263 prod lines plus their tests. A 2026-08-04 plan already declared `findLostIdentifiers` consumerless; the module regrew afterward. Separately, `skills/_shared/unattended-tier.md` (11 lines) is a tombstone with zero live citers — its migration is implemented in `bin/lib/policy-schema.js`'s `RENAMED_KEYS`, not by the file.

## Deliverables

- Delete the four modules and their test files under `bin/lib/skill-audit/tests/`.
- Delete `skills/_shared/unattended-tier.md`.
- Sweep load-bearing prose mentions (`docs/skill-graph.md`, `docs/plugin-structure.md`); leave `docs/incident-log.md` history untouched.

## Acceptance Criteria

- A fresh grep per deleted module name across `skills/ bin/ tests/ docs/*.md` shows only historical mentions (incident log, CHANGELOG), none load-bearing — output shown, run at build time, not inherited from the audit.
- `npm test` passes and `package.json`'s test globs still match every remaining `bin/lib/*/tests/` directory (IL-84 class).
- `bloat.js` still functions via harness-health's documented invocation path.

## Technical Approach

Re-verify the zero-importer claim per module with a fresh grep before each deletion (the audit ran 2026-08-14; the tree moves). Then delete, sweep prose, run the full suite.

## Gotchas

- `bin/lib/skill-audit/tests/relationship-rows.test.js` is listed among the tests pinning `_shared/work-record.md`'s config-key table. If the pin is real, deleting the module must not silently drop the contract check — either relocate the pinning assertion or confirm another test covers it before removing.
- `bin/lib/skill-audit/tests/fixtures/review-SKILL-pre-2b.md` is a frozen fixture used by surviving tests — do not delete fixtures still referenced by kept tests.
- `docs/incident-log.md:399` records a prior sweep wrongly excusing this directory wholesale ("it is the parser and the guard") — cite this record when sweeping so the same excuse doesn't resurrect.

## Original request

Delete consumerless code: four skill-audit modules + _shared/unattended-tier.md

**Related:** none

Context: Bloat audit: qualified-refs.js, skill-catalog.js, identifiers.js, relationship-rows.js (~263 prod lines + tests) have no importer — only bloat.js and its two deps are invoked from skills; a 2026-08-04 plan already declared identifiers.js consumerless and the module regrew. _shared/unattended-tier.md (11 lines) has zero live citers.

Scope: delete the four modules + their tests + the _shared tombstone; sweep prose mentions.
