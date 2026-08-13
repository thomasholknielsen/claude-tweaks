---
record: 366
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: oversight-floor:oversight-floor-predicate-policy-keys-and-grant-gate-migrati
surface: backend
---
# 366: Oversight-floor predicate, policy keys, and grant-gate migration

Surface: backend

## Overview

Today `bin/lib/issues/grant-gate.js`'s gate 5 hardcodes `if (facets.risk === 'high')` as the point past which a machine-originated grant is denied and a human review is required. This is the only place in the codebase that currently makes an "is this too risky for autonomy" decision, and it has no policy key, no size dimension, and no shared name — a second, silently-drifting copy of the same judgment `/claude-tweaks:demo`'s new gate (a companion sub-issue) is about to make explicit.

This sub-issue builds the shared foundation both consumers sit on: two new generic policy keys (`risk-floor`, `size-floor` — not prefixed `demo-`, since more than one consumer reads them), one pure predicate function that compares a record's `risk:*`/`size:*` facets against those floors, and the migration of `grant-gate.js`'s existing hardcoded check onto it.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- Building the `/claude-tweaks:demo` binary gate itself, or the parent-aggregation rule — that is a separate, dependent sub-issue (this design's "Demo binary gate" companion).
- Building the `acceptance-gap`/`parent-gate` backstop pre-filter — also a separate, dependent sub-issue, additionally blocked on #204's file-split.
- Per-consumer floor divergence — both consumers read the same `risk-floor`/`size-floor` value pair by default; no per-site override mechanism is built here. Nobody has asked for grant-gate and demo to use different thresholds, and the shared-predicate structure makes an additive override cheap to add later if that changes.
- Any `/init` walkthrough work — tracked separately (see the design doc's Non-Goals and the follow-up scope agreed during decomposition).

## Current State

- Policy schema: `skills/_shared/policy-schema.md` (prose table) + `bin/lib/policy-schema.js` (`POLICY_KEYS` data, `auditPolicy(repoRoot)`, `resolveValue(key, rawValue)`) — 40 existing keys, no `risk-floor`/`size-floor` yet.
- Risk/size vocabulary: `bin/lib/issues/record.js` exports `TIERS` (the shared `low`/`medium`/`high` enum both `risk:*` and `size:*` labels use) and `PRIORITIES` — already imported by `bin/lib/issues/backlog.js` and `bin/lib/issues/ranking.js` for unrelated triage/sort purposes (do not touch those two files; they are triage lenses, not gates — see design doc Non-Goals).
- Existing hardcoded gate: `bin/lib/issues/grant-gate.js`'s `evaluateGrantGate` — gate 5 (`if (facets.risk === 'high') return deny('risk-high', ...)`) runs after gate 4's `grantCheck` phase, before the daily-grant-cap check. It only runs when `pol.ceiling === 'unattended'` AND `pol.grantOriginationEnabled === true` (gates 1a/1b already restrict the population).
- Trust module: `bin/lib/issues/trust.js` exports `riskBand(labels)` — a **different, binary** (`low`/`elevated`) collapse used only to key trust-class lookups (`kind:source|band`). Do not reuse or rename this function; the new predicate needs a distinct name so it isn't mistaken for a variant of it.
- Resolver: `bin/resolve-policy.js` is the canonical read path (`node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" [--values] <key> [<key>...]`) — new keys must be added to `POLICY_KEYS` to resolve through it.

## Deliverables

- [ ] Add `risk-floor` and `size-floor` to `bin/lib/policy-schema.js`'s `POLICY_KEYS` — `type: 'enum'`, values `['low', 'medium', 'high', 'always']`, default `'high'` for both. `'always'` is the reserved opt-out value (see Acceptance Criteria) — `exceedsOversightFloor` treats it as an unconditional match regardless of the record's own tier, the same short-circuit an unscored record already gets.
- [ ] Add both keys as a new row each in `skills/_shared/policy-schema.md`'s existing table format (mirror the surrounding rows' column shape — Key / Canonical home / Owner skill(s) / Default / Meaning).
- [ ] Create `bin/lib/issues/oversight-floor.js` exporting `exceedsOversightFloor(facets, policy)`, where `facets` is a `parseRecordFacets`-shaped object (`.risk`, `.size`) and `policy` is `{ riskFloor, sizeFloor }` (each `'low' | 'medium' | 'high' | 'always' | null`, already-resolved — `undefined` is treated identically to `'high'`, the schema default, as a fail-safe; see Gotchas). Returns `{ exceeds: boolean, reason: 'risk' | 'size' | 'unscored' | null }`.

  **`null` means "this axis is not evaluated for this call"** — distinct from a missing *facet*. A caller evaluating risk only (e.g. a decomposition parent, which has no meaningful size of its own) passes `sizeFloor: null` explicitly; the size axis then contributes nothing to the result and never triggers `'unscored'` on size's account, regardless of whether `facets.size` is present, absent, or anything else. This is the one piece of the contract every consumer of this predicate must get right — passing `sizeFloor: 'high'` (or omitting it, which now defaults to `'high'`) while also omitting `facets.size` is a *scored-but-missing* case and correctly fails closed as `'unscored'`; passing `sizeFloor: null` is a *not-applicable* case and correctly never fails closed on size at all. Both `riskFloor`/`sizeFloor` being `null` simultaneously is not an expected call shape (nothing would be evaluated) and callers should never construct it.

  **Fixed check order** (resolves any ambiguity about which `reason` wins when more than one condition applies), evaluated only over axes whose floor is not `null`: (1) `'always'` short-circuit first — if either non-null floor is `'always'`, `exceeds: true` immediately with `reason` naming whichever floor(s) are `'always'` (`'risk'` if only `riskFloor`, `'size'` if only `sizeFloor`, `'risk'` if both — risk wins ties throughout this ordering); (2) unscored check next — for each non-null-floor axis, a missing OR out-of-vocabulary `risk`/`size` value (anything not in `record.js`'s `TIERS`) folds to `reason: 'unscored'`, checked before either tier comparison; (3) risk-floor comparison (skipped entirely when `riskFloor` is `null`); (4) size-floor comparison (skipped entirely when `sizeFloor` is `null`) — when both risk and size independently exceed their floor, `reason: 'risk'` wins (risk takes priority over size throughout, both here and in the `'always'` case above, for one consistent rule instead of two different tie-breaks).
- [ ] Migrate `grant-gate.js` gate 5 from `if (facets.risk === 'high')` to `exceedsOversightFloor(facets, { riskFloor: pol.riskFloor, sizeFloor: pol.sizeFloor })`, with `failedKey: 'oversight-floor'` (fixed literal, not a suggestion) replacing the hardcoded `'risk-high'` string in the `deny(...)` call — the `reason` field goes into the deny's `reason` message text, naming which dimension tripped it.
- [ ] Update `skills/backlog/grant-mode.md`'s Phase A and Phase C `evaluateGrantGate` call sites (both already construct a `policy` object from a `FLOOR_VALUES`-style resolver reading `merge-sensitive-paths`/`fleet-daily-grant-cap`) to additionally resolve `risk-floor`/`size-floor` via `resolve-policy.js` and pass them as `riskFloor`/`sizeFloor` on that same object — today `grant-mode.md` is the only real caller of `evaluateGrantGate` and does not fetch either new key, so without this deliverable the migration in the prior bullet is unreachable in the actual runtime path (only exercised directly by unit tests).
- [ ] Ensure the release summary passed to `node bin/release.js <minor|patch> "<summary>"` at this change's next release (per `docs/releasing.md` — CHANGELOG.md is generated from that one-line summary by the release script itself, never hand-authored per deliverable) calls out that `grant-gate.js` now also denies on `size:high`, where it previously ignored size entirely — a real tightening for the `unattended` + `grant-origination-enabled` population, not a refactor. No file edit in this deliverable; it is a note for whoever runs the release.

## Acceptance Criteria

1. `exceedsOversightFloor({ risk: 'high', size: 'low' }, { riskFloor: 'high', sizeFloor: 'high' })` returns `{ exceeds: true, reason: 'risk' }`.
2. `exceedsOversightFloor({ risk: 'low', size: 'high' }, { riskFloor: 'high', sizeFloor: 'high' })` returns `{ exceeds: true, reason: 'size' }`.
3. `exceedsOversightFloor({ risk: 'medium', size: 'medium' }, { riskFloor: 'high', sizeFloor: 'high' })` returns `{ exceeds: false, reason: null }`.
4. `exceedsOversightFloor({}, { riskFloor: 'high', sizeFloor: 'high' })` (both facets absent) returns `{ exceeds: true, reason: 'unscored' }` — fails closed, matching `trust.js`'s own "absence of a risk score is not evidence of safety" precedent for `riskBand`.
5. `exceedsOversightFloor({ risk: 'low', size: 'low' }, { riskFloor: 'always', sizeFloor: 'high' })` returns `{ exceeds: true, reason: 'risk' }` — the `'always'` reserved value short-circuits regardless of tier.
6. `exceedsOversightFloor({ risk: 'low', size: 'low' }, { riskFloor: 'high', sizeFloor: 'always' })` returns `{ exceeds: true, reason: 'size' }` — symmetric to case 5, confirming `'always'` is independent per-axis.
7. `exceedsOversightFloor({ risk: 'high', size: 'high' }, { riskFloor: 'high', sizeFloor: 'high' })` returns `{ exceeds: true, reason: 'risk' }` — both dimensions independently exceed; risk wins the tie per the fixed check order.
8. `exceedsOversightFloor({ risk: 'high' }, { riskFloor: 'high', sizeFloor: 'high' })` (size facet absent, risk present and exceeding) returns `{ exceeds: true, reason: 'unscored' }` — the unscored check runs before either tier comparison, so a partially-scored record still fails closed on the missing dimension rather than passing on the present one.
9. `exceedsOversightFloor({ risk: 'critical', size: 'low' }, { riskFloor: 'high', sizeFloor: 'high' })` (an out-of-vocabulary risk value, not in `TIERS`) returns `{ exceeds: true, reason: 'unscored' }` — an invalid tier folds to the same fail-closed path as a missing one.
9b. `exceedsOversightFloor({ risk: 'low' }, { riskFloor: 'high', sizeFloor: null })` (no `size` facet at all, `sizeFloor` explicitly `null`) returns `{ exceeds: false, reason: null }` — the missing `size` facet does **not** trigger `'unscored'`, because `sizeFloor: null` means size is not evaluated for this call at all. This is the specific regression case #367 and #368 (the demo-gate and backstop-pre-filter sub-issues) both depend on for evaluating a decomposition parent's aggregate risk without a size facet.
9c. `exceedsOversightFloor({ risk: 'high' }, { riskFloor: 'high', sizeFloor: null })` returns `{ exceeds: true, reason: 'risk' }` — confirms the risk axis still evaluates normally when size is excluded via `null`, not accidentally short-circuited by the exclusion.
10. `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values risk-floor size-floor` against a project with no `risk-floor`/`size-floor` keys in `policy.yml` prints `high` then `high` (schema default, `source: "default"`).
11. A record with `risk:high` + `size:low`, `ceiling: unattended`, `grantOriginationEnabled: true`, no sensitive-path hit, under the daily cap — `evaluateGrantGate` denies with `failedKey: 'oversight-floor'`, where before this change it would have denied with `failedKey: 'risk-high'`.
12. A record with `risk:medium` + `size:high` under the same policy — `evaluateGrantGate` now denies (it would have been granted before this change, since the old check never read `size`). This is the documented behavior tightening from the grant-gate migration deliverable.
13. Running `/claude-tweaks:backlog grant` end-to-end against a candidate record scored `risk:medium`/`size:high` — the real `grant-mode.md` Phase A/C call path (not a direct unit-test call) denies it, confirming the `grant-mode.md` caller-update deliverable actually wires `riskFloor`/`sizeFloor` through in the runtime path, not only in tests.
14. `node --test bin/lib/issues/tests/oversight-floor.test.js bin/lib/issues/tests/grant-gate.test.js` (confirm the exact existing test-file path for `grant-gate.js` and `policy-schema.js` before writing — see Current State) passes.

## Technical Approach

### Data / API Surface

```js
// bin/lib/issues/oversight-floor.js
function exceedsOversightFloor(facets, policy) {
  // facets: { risk?: 'low'|'medium'|'high', size?: 'low'|'medium'|'high' }
  // policy: { riskFloor: 'low'|'medium'|'high'|'always'|null, sizeFloor: 'low'|'medium'|'high'|'always'|null }
  //   null on either floor means "this axis is not evaluated" — never contributes to
  //   exceeds/reason, regardless of whether the matching facets.* key is present.
  // returns: { exceeds: boolean, reason: 'risk' | 'size' | 'unscored' | null }
}
module.exports = { exceedsOversightFloor };
```

Tier comparison reuses `record.js`'s existing `TIERS` ordering (`['low', 'medium', 'high']`) — a tier "exceeds" a floor when its index is `>=` the floor's index, except `'always'`, which is not a member of `TIERS` and short-circuits before any index lookup.

### Key Files

- `bin/lib/issues/oversight-floor.js` — new file, the predicate.
- `bin/lib/issues/tests/oversight-floor.test.js` (match the existing test-directory convention used by `bin/lib/issues/tests/grant-gate.test.js`) — new tests, Acceptance Criteria 1-5.
- `bin/lib/issues/grant-gate.js` — gate 5 migration (Deliverable 4).
- `bin/lib/policy-schema.js` — `POLICY_KEYS` additions (Deliverable 1).
- `skills/_shared/policy-schema.md` — table row additions (Deliverable 2).
- `skills/backlog/grant-mode.md` — Phase A and Phase C `evaluateGrantGate` call sites, adding `riskFloor`/`sizeFloor` to the resolved-policy object passed in.

## Gotchas

- Do not name the new predicate `riskBand` or anything that reads as a variant of `trust.js`'s existing `riskBand(labels)` — that function is a different, binary concept (keys trust-class lookups) and a similar name will get confused with it in code review.
- Do not touch `bin/lib/issues/backlog.js`'s `filterCritical`/`rankRiskValue` or `bin/lib/issues/ranking.js`'s `sizeBandOf` — these read the same `risk:*`/`size:*` labels but for triage/sort ordering ("show critical items first"), not gating. They are out of scope and unrelated to `exceedsOversightFloor`.
- `TIERS` from `record.js` is the source of truth for valid tier values. An out-of-vocabulary `facets.risk`/`facets.size` value (not in `TIERS`) folds to `reason: 'unscored'`, exactly like a missing one — see Deliverable 3's fixed check order and Acceptance Criteria 9. This is a deliberately different contract from `backlog.js`'s `riskBandOf`/`bandOf`, which fold an invalid value to a sort-last rank for triage ordering — do not port that fallback-rank behavior here, since `exceedsOversightFloor`'s `reason` is a fail-closed signal, not a sort key. `local-store.js`'s frontmatter parser accepts `risk:`/`size:` values verbatim with no enum check, so this case is reachable in practice.
- `policy.js`'s in-process read path (used by the PreToolUse hook for `worktree.always`) is a separate carve-out from `resolve-policy.js` — `risk-floor`/`size-floor` are ordinary policy keys and belong on the `resolve-policy.js` path only; do not add them to the in-process hot-path reader.
- Because `grant-mode.md`'s own caller update is now this sub-issue's own deliverable (not assumed pre-existing), `evaluateGrantGate` should default any `undefined` `riskFloor`/`sizeFloor` on its `policy` param to the schema default (`'high'`) internally, as a fail-safe for any future caller that forgets to resolve them — never crash or silently skip the check on a missing floor value.


<!-- work-fingerprint: oversight-floor:oversight-floor-predicate-policy-keys-and-grant-gate-migrati -->
