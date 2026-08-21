---
record: 230
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 230: Extract shared field-validation helper into code-health/validate-finding.js

Surface: backend

## Current State

`bin/lib/code-health/validate-finding.js` (`validateFindingV2`, lines 46-98) reimplements a "required non-empty string" field-validation loop inline (`V2_REQUIRED_STRINGS`), while its three structural siblings — `bin/lib/docs-health/validate-finding.js`, `bin/lib/journey-health/validate-finding.js`, and `bin/lib/harness-health/validate-finding.js` — already import and use the shared `requireNonEmptyStrings`/`validateRelatedSections` helpers from `bin/lib/health-core/finding-validation.js`. Verified directly against all four files: code-health is the one holdout of four parallel modules, and its inline loop is functionally identical to `requireNonEmptyStrings`, down to the error-message template string.

## Deliverables

Refactor `validateFindingV2` in `bin/lib/code-health/validate-finding.js` to use the shared `bin/lib/health-core/finding-validation.js` helpers, matching its three siblings' pattern:

- Replace the inline `V2_REQUIRED_STRINGS` loop with a call to `requireNonEmptyStrings(obj, V2_REQUIRED_STRINGS)`.
- Decide how to handle the optional array-shape check (see Gotchas — code-health's field is named `relatedAnchors`, not `relatedSections`, so `validateRelatedSections` cannot be dropped in unmodified).

## Acceptance Criteria

- `bin/lib/code-health/validate-finding.js` imports and uses `requireNonEmptyStrings` from `bin/lib/health-core/finding-validation.js` instead of its own inline required-string loop.
- The optional `relatedAnchors` array-shape check keeps validating the correct field (`relatedAnchors`, not `relatedSections`) after the refactor — either by generalizing `validateRelatedSections` to accept a field name (updating all four call sites) or by another approach that doesn't silently stop validating `relatedAnchors`.
- Existing `bin/lib/code-health/tests/` suite still passes with no behavior change (including behavior for `relatedAnchors`).
- No new abstraction introduced — this only removes an existing duplicate.

## Technical Approach

`requireNonEmptyStrings(obj, fields)` is a straight drop-in for the `V2_REQUIRED_STRINGS` loop — same signature shape (object + field-name array), same per-field error message format. The severity/confidence/likelihood/effort enum-membership checks that follow the loop in `validateFindingV2` are unrelated to this helper and stay as they are.

`validateRelatedSections(obj)` is hardcoded to read `obj.relatedSections` (see `bin/lib/health-core/finding-validation.js` lines 29-36) — it is not parameterized by field name. code-health's optional array field is `relatedAnchors`, not `relatedSections`, so calling `validateRelatedSections(obj)` unmodified would check `obj.relatedSections` (always `undefined` on a code-health finding) and never validate `obj.relatedAnchors` at all — a silent behavior regression, not a refactor. Two viable resolutions: (a) generalize `validateRelatedSections` to take a field name (`validateRelatedSections(obj, 'relatedAnchors')`), updating the three existing call sites to pass `'relatedSections'` explicitly; or (b) leave code-health's `relatedAnchors` check inline (only the required-string loop moves to the shared helper). Either is acceptable under "no new abstraction introduced" as long as `relatedAnchors` keeps being validated — the AC above is the binding constraint, not a preference between (a)/(b).

## Gotchas

- **Field-name mismatch is the real risk in this change.** code-health's optional array field is `relatedAnchors`; all three siblings (and the shared helper) use `relatedSections`. A naive "swap in `validateRelatedSections(obj)`" silently stops validating `relatedAnchors` — this must not ship. Confirmed by reading `bin/lib/health-core/finding-validation.js` (the field name is a literal, not a parameter) and grepping all four `validate-finding.js` files for `relatedAnchors`/`relatedSections`.
- `V2_REQUIRED_STRINGS` includes `likelihood` and `effort`, which also get a *second*, separate enum-membership check later in the same function (unlike the siblings' required-string lists) — that second check is unaffected by this refactor and should be left alone.

## Original request

Extract shared field-validation helper into code-health/validate-finding.js

**Related:** #240

### Current State

`bin/lib/code-health/validate-finding.js` (validateFindingV2, lines 46-98) reimplements a 'required non-empty string' field-validation loop inline, while its three structural siblings — `bin/lib/docs-health/validate-finding.js`, `bin/lib/journey-health/validate-finding.js`, and `bin/lib/harness-health/validate-finding.js` — already import and use the shared `requireNonEmptyStrings`/`validateRelatedSections` helpers from `bin/lib/health-core/finding-validation.js`. code-health is the one holdout of four parallel modules.

### Deliverables

Refactor `validateFindingV2` in `bin/lib/code-health/validate-finding.js` to use the shared `bin/lib/health-core/finding-validation.js` helpers, matching its three siblings' pattern.

### Acceptance Criteria

- `bin/lib/code-health/validate-finding.js` imports and uses `requireNonEmptyStrings`/`validateRelatedSections` from `bin/lib/health-core/finding-validation.js` instead of its own inline loop
- Existing `bin/lib/code-health/tests/` suite still passes with no behavior change
- No new abstraction introduced — this only removes an existing duplicate

Origin: /claude-tweaks:init Update Mode reconnaissance (Phase 2f pain-point detection).

