---
record: 580
origin: human
risk: medium
size: low
ceremony: standard
grants: []
fingerprint: 2026-08-16-housekeeping-auto-merge-design:housekeeping-auto-merge-derive-the-default-from-the-autonomy
blocked-by: [559, 533]
surface: backend
---
# 580: housekeeping-auto-merge: derive the default from the autonomy ceiling

Surface: backend

## Overview

`housekeeping-auto-merge` carries a static `default: false` in `bin/lib/policy-schema.js`, so tidy's marker-stamped housekeeping PRs never gain the arm grant unless a project sets the key explicitly — even when the same `policy.yml` already declares `autonomy: unattended`. On 2026-08-16, PR #567 (green, marker-stamped) sat unarmed until merged by hand; the operator's declared posture and the lever's default disagreed (#571, parent #579). This unit makes the unset default derive from the resolved `autonomy` ceiling: `trusted`/`unattended` → `true`, `supervised` → `false`. An explicit key wins, in both directions.

**Complexity:** Low
**Estimated tasks:** 5

## Non-Goals

- No consumer behavior change beyond the value the resolver returns — tidy Step 7.5's arm-at-creation is the sibling sub-issue #581 under parent #579
- No raw default flip: `supervised` (the `autonomy` schema default) must keep resolving `false`
- No new policy key, no rename, no new resolver flag or output field — the key stays `housekeeping-auto-merge`, its type stays `boolean`, and the existing per-entry `source` field is the attribution surface (see Data / API Surface)
- Not #559's merge-verification derivation ladder — separate key, separate derivation logic, same module; do not couple the two implementations
- No export of the derivation as a public helper — it stays private to the resolution path until a second caller exists (`resolveIntegrationModel` is exported because reconcile calls it in-process; nothing calls this one)

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #533 | Policy schema human-facing metadata (summary/category/tier) and resolve-policy --all | bot:in-progress (PR #555) — edits the same schema rows; native Blocked-by link wired |
| #559 | merge-verification: policy key, derivation ladder, and Manifesto lever | ready, auto:build — edits the same module/doc/tests; native Blocked-by link wired |

## Current State

- `bin/lib/policy-schema.js` (~line 47): `{ key: 'housekeeping-auto-merge', type: 'boolean', default: false }`, preceded by a #414-era comment explaining the deliberate opt-in ("--auto until a project opts in")
- Same module (~line 72): `{ key: 'autonomy', type: 'enum', values: ['supervised', 'trusted', 'unattended'], default: 'supervised' }`
- `resolvePolicyKeys(requestedKeys, { policyRaw, runConfigRaw })` (~line 281): parses both sources once (run-config overlay wins over policy.yml), applies `RENAMED_KEYS` alias migration per source, then resolves **each requested key independently** — there is no "resolved so far" map shared across keys, and the real consumer (`_shared/github-pr-scan.md` item 9) requests `housekeeping-auto-merge` alone, so the derivation can never assume `autonomy` was itself requested
- Each resolved entry carries a `source` field; `'default'` means no source supplied the key. Derivation precedent in the same module: `resolveIntegrationModel` (~line 415) resolves the key, branches on `entry.source !== 'default'`, and computes the derived value otherwise — its header comment also documents that a set-but-invalid value falls through to the derived/usable default
- Invalid explicit values take a distinct path (~line 340-344): `invalid: true` surfaced, value falls back to `schemaEntry.default`
- Consumers all read through `bin/resolve-policy.js` (`HOUSEKEEPING_GRANT=$(... --values housekeeping-auto-merge)`, then `=== 'true'` string comparison) and inherit a derived value with zero per-consumer edits
- Tests: `tests/resolve-policy-lib.test.js` — imports and tests `resolvePolicyKeys` directly with inline string fixtures (its header bans live-policy.yml reads); `tests/policy-schema.test.js` covers only schema-shape/audit exports and is NOT the home for this matrix
- Docs: `skills/_shared/policy-schema.md` (lever row, Default column currently `false`); `skills/_shared/autonomy-ceiling.md` (consumer reference list in its opening paragraphs)

## Deliverables

- [ ] Derivation in `bin/lib/policy-schema.js`, inside the resolution path: when `housekeeping-auto-merge` is unset — the canonical key absent from both parsed sources (run-config overlay and policy.yml), judged after `RENAMED_KEYS` alias migration — resolve it by **internally resolving `autonomy` from the same parsed sources** (never from `requestedKeys`, never from a second file read), then mapping `trusted`/`unattended` → `true`, anything else (including `supervised`, unset, or an unrecognized future enum value) → `false`
- [ ] The derived entry keeps `source: 'default'` — that field is how sibling #581 attributes `derived-from-autonomy` vs `explicit`; an inline comment must name both this contract and the internal-resolution-order invariant
- [ ] Set-but-invalid explicit values (e.g. `housekeeping-auto-merge: maybe`) keep surfacing `invalid: true` but now fall back to the derived value instead of static `false` — matching `resolveIntegrationModel`'s documented set-but-invalid behavior
- [ ] Explicit valid values win unchanged at any rank, both directions (validation of explicit booleans untouched)
- [ ] Update the module's #414-era comment to describe the derived default and why (posture is the opt-in)
- [ ] `skills/_shared/policy-schema.md`: the lever's Default column becomes "derived from `autonomy`: `true` at `trusted`/`unattended`, else `false`"
- [ ] `skills/_shared/autonomy-ceiling.md`: add this lever to the consumer reference list (the ceiling now feeds a derived policy default)
- [ ] Test matrix in `tests/resolve-policy-lib.test.js` per the acceptance criteria below, using that file's inline-fixture + `AC N:` naming conventions

## Acceptance Criteria

All resolution assertions are direct `resolvePolicyKeys` calls with inline fixtures in `tests/resolve-policy-lib.test.js` (no subprocess spawning — `--values` serialization is `bin/resolve-policy.js`'s printer, already covered elsewhere):

1. Key unset + `autonomy: supervised` (or `autonomy` unset) → `{ value: false, source: 'default' }`
2. Key unset + `autonomy: trusted` → `{ value: true, source: 'default' }`
3. Key unset + `autonomy: unattended` → `{ value: true, source: 'default' }`
4. Key unset + `autonomy: unattended`, requested alone (`resolvePolicyKeys(['housekeeping-auto-merge'], ...)` — `autonomy` not in `requestedKeys`) → still derives `true` — pins the internal-resolution invariant
5. Explicit `housekeeping-auto-merge: false` + `autonomy: unattended` → `{ value: false }` with a non-`'default'` source
6. Explicit `housekeeping-auto-merge: true` + `autonomy: supervised` → `{ value: true }` with a non-`'default'` source
7. Invalid explicit `housekeeping-auto-merge: maybe` + `autonomy: unattended` → `{ value: true, invalid: true }`
8. `npm test` passes in full

## Technical Approach

Implement the derivation inside the resolution path in `bin/lib/policy-schema.js` — never in `bin/resolve-policy.js` (its header: "No resolution logic lives here"). Because `resolvePolicyKeys` resolves each requested key independently, the derivation must resolve `autonomy` on demand from the same parsed `sources` array (reusing the pass's alias-migrated values — not re-reading files, not depending on `autonomy` appearing in `requestedKeys`, not depending on key order). Follow the branch shape of `resolveIntegrationModel` (`entry.source !== 'default'` → explicit wins; otherwise derive), kept private rather than exported. The `trusted`/`unattended` → `true` mapping is a positive-list check — an `autonomy` enum extension lands on `false` until this mapping is deliberately revisited; say so in the inline comment.

### Data / API Surface

No new keys, no new flags, no new output fields. Contract changes:

- Unset case: `value` becomes autonomy-derived per the table above; `source` stays `'default'` (attribution surface for #581 — `source === 'default'` ⇒ derived, anything else ⇒ explicit)
- Set-but-invalid case: `invalid: true` unchanged; fallback `value` becomes the derived value instead of static `false`

### Key Files

- `bin/lib/policy-schema.js` — derivation in the resolution path, comment updates (key row + inline invariant comment)
- `skills/_shared/policy-schema.md` — Default column of the lever's row
- `skills/_shared/autonomy-ceiling.md` — consumer reference list
- `tests/resolve-policy-lib.test.js` — derivation matrix (AC 1-7)

## Gotchas

- #533 (in progress, PR #555) is adding metadata fields to every schema row in the same file; #559 (granted) adds a sibling derived key with its own ladder. The native Blocked-by links serialize this — rebase on whatever has merged before starting, and if #559's ladder landed first as a sibling resolver function, mirror its placement and shape rather than inventing a third pattern
- #537 (ready, granted) adds a coverage-block line to `skills/_shared/policy-schema.md` — trivial merge-conflict risk only; deliberately not serialized
- The sweep consumes the value as `process.env.HOUSEKEEPING_GRANT === 'true'` (`_shared/github-pr-scan.md` item 9) — the derived value must serialize through `--values` exactly like the static boolean did (no printer changes)
- Behavior change ships to any project already at `trusted`/`unattended` with the key unset — including claude-tweaks itself. The release notes for the version carrying this must name it (minor bump, per CLAUDE.md versioning)
- Do not add a provenance API, flag, or output field — the existing `source` field already carries the derived-vs-explicit distinction; keeping it accurate (Deliverable 2) is the whole attribution contract

## Decision Rationale

See parent #579's Decision Rationale (derived-not-flipped, `trusted` inclusion, rejected alternatives).

<!-- work-fingerprint: 2026-08-16-housekeeping-auto-merge-design:housekeeping-auto-merge-derive-the-default-from-the-autonomy -->

