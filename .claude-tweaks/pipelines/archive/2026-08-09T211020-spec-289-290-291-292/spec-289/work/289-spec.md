---
record: 289
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: 2026-08-09-autonomy-unattended-tier-merge:core-lever-code
surface: backend
---
# 289: Merge unattended-tier into the autonomy ceiling — core lever code

Surface: backend

## Overview

Two policy levers — `autonomy` (`supervised`/`trusted`/`unattended`, evidence-gated) and
`unattended-tier` (`off`/`on`, category-gated) — currently answer overlapping versions of "how
much do I let the pipeline decide on its own?" and converge at exactly one point (both let a new
backlog record get filed without a human click, via unrelated mechanisms). This leaf merges
`unattended-tier`'s three behaviors (ledger Phase 2 narrowing, queue-write auto-file, ops-ack
auto-acknowledge) into `autonomy`'s existing three tiers, retires `unattended-tier` as a standalone
lever, and gives `bin/lib/policy-schema.js` a small migration-detection mechanism for the retired
key. This is the foundation leaf — three sibling leaves (skill-prose drills, contract
documentation, the init question) all depend on the function and policy-key shapes this leaf ships.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- Editing any `skills/**/*.md` prose that consumes these functions — that's three separate leaves
  (call-batched drills; contract/reference documentation; init question), each blocked by this one.
- Changing `permittedGrants`'s existing behavior or signature in any way. It stays exactly as
  written — this leaf adds a sibling function, never touches that one.
- Touching grant-origination (`auto:build`/`auto:merge` from machinery) or its separate opt-in —
  unrelated capability, already implemented, not in scope.
- Adding a second entry to `RENAMED_KEYS` for any lever other than `unattended-tier` in this leaf.
  The mechanism (an array scanned generically) is inherently reusable, but only one entry ships
  here — a future retirement is a future leaf's decision, not this one's.

## Prerequisites

None — this is the first leaf in the decomposition; nothing blocks it.

## Current State

- `bin/lib/issues/autonomy.js` — exports `CEILINGS` (`['supervised', 'trusted', 'unattended']`),
  `resolveCeiling(sources)`, and `permittedGrants(input)`. `permittedGrants` takes
  `{ ceiling, row, grantOriginationEnabled }` and returns early with `DENY(...)` whenever `row` is
  missing or not a valid trust row — it has no ceiling-only code path today. Two internal
  (unexported) helpers already exist and are reused by this leaf's new code: `isCeiling(value)`
  (returns whether `value` is one of `CEILINGS`) and `atLeast(ceiling, minimum)` (compares tier
  position via `CEILINGS.indexOf`).
- `bin/lib/issues/unattended-tier.js` — exports one function, `clearsFloor(blockerReason)`. Pure,
  no dependencies beyond a fixed array of regexes (`CATEGORY_PATTERNS`) plus one numeric-threshold
  regex (`UNRELATED_TESTS_RE`) for the ">10 unrelated tests" scope-expansion category. 45 lines
  total including comments.
- `bin/lib/policy-schema.js` — `POLICY_KEYS` is a flat array of
  `{ key, type, values?, default? }` objects. `unattended-tier` is currently
  `{ key: 'unattended-tier', type: 'enum', values: ['off', 'on'], default: 'off' }`; `autonomy` is
  `{ key: 'autonomy', type: 'enum', values: ['supervised', 'trusted', 'unattended'], default: 'supervised' }`.
  `auditPolicy(repoRoot)` reads `.claude-tweaks/policy.yml` and `CLAUDE.md`, builds
  `schemaByKey` from `POLICY_KEYS`, and returns `{ unrecognizedKeys, invalidValues, migratableKeys }`.
  `migratableKeys` only inspects `claudeMdEntries` (CLAUDE.md) for keys that ARE in `POLICY_KEYS` —
  it has no mechanism today for a key that has been *removed* from `POLICY_KEYS` entirely.
  `unrecognizedKeys` (line 98 in the live file) is computed as
  `Object.keys(policyEntries).filter((key) => !schemaByKey.has(key))` — dropping `unattended-tier`
  from `POLICY_KEYS` makes any `unattended-tier:` line in a project's `policy.yml` satisfy this
  filter too, landing it in `unrecognizedKeys` at the same time it lands in the new `renamedKeys`
  (see Deliverables) unless this leaf excludes it explicitly. `harness-health` already auto-files a
  "possible typo" finding off a non-empty `unrecognizedKeys` — an unexcluded double-membership
  would be a live regression, not just an inconsistency, so this is a required deliverable, not an
  optional cleanup.
- Tests: `bin/lib/issues/tests/autonomy.test.js` (181 lines), `bin/lib/issues/tests/unattended-tier.test.js`
  (105 lines), `tests/policy-schema.test.js`. `tests/policy-schema.test.js:22` asserts
  `POLICY_KEYS.length === 34` (hardcoded literal); `tests/policy-schema.test.js:149` asserts
  `auditPolicy()`'s full return shape via `assert.deepStrictEqual(result, { unrecognizedKeys: [],
  invalidValues: [], migratableKeys: [] })` — both break under this leaf's changes and both need an
  explicit edit, not just "remove stale assertions" in the abstract. All run under `node --test`.

## Deliverables

- [ ] `bin/lib/issues/autonomy.js`: add `clearsFloor(blockerReason)` (moved verbatim from
      `unattended-tier.js` — same regex patterns, same logic, no behavior change) and a new
      `bookkeepingPermissions(ceiling)` function returning
      `{ ledgerNarrowing: atLeast(tier, 'trusted'), queueWriteAutoFile: atLeast(tier, 'trusted'), opsAckAutoAcknowledge: atLeast(tier, 'unattended') }`,
      where `tier = isCeiling(ceiling) ? ceiling : 'supervised'` (same unrecognized-value handling
      as `permittedGrants`). Add both to `module.exports` alongside the existing three exports.
- [ ] Delete `bin/lib/issues/unattended-tier.js`.
- [ ] `bin/lib/policy-schema.js`: remove the `unattended-tier` entry from `POLICY_KEYS`. Add a new
      `RENAMED_KEYS` array: `[{ key: 'unattended-tier', replacedBy: 'autonomy', migrate: (value) => (value === 'on' ? 'unattended' : null) }]`.
      In `auditPolicy()`, after computing `policyEntries`, compute `renamedKeys` by scanning
      `Object.entries(policyEntries)` for any key matching a `RENAMED_KEYS` entry (regardless of
      whether it's also in CLAUDE.md — this check is `policy.yml`-only, since that's the only file
      code ever reads). Each match produces
      `{ key, value, replacedBy, suggestedValue: migrate(value), currentReplacementValue: policyEntries[replacedBy] ?? null }`.
      Add `renamedKeys` to the function's return object. **Also update the existing
      `unrecognizedKeys` computation to exclude any key present in `RENAMED_KEYS`** — build a
      `Set` of `RENAMED_KEYS`' keys once, and add `&& !renamedKeySet.has(key)` to the existing
      filter — so a stray `unattended-tier` reports exactly once, under `renamedKeys`, never also
      under `unrecognizedKeys`. Export `RENAMED_KEYS` alongside `POLICY_KEYS`.
- [ ] Move `bin/lib/issues/tests/unattended-tier.test.js`'s floor-matching cases into
      `bin/lib/issues/tests/autonomy.test.js` verbatim (same assertions, now calling
      `clearsFloor` from `autonomy.js`'s export instead of `unattended-tier.js`'s). Delete
      `bin/lib/issues/tests/unattended-tier.test.js`.
- [ ] `bin/lib/issues/tests/autonomy.test.js`: add cases for `bookkeepingPermissions` covering all
      three tiers (see Acceptance Criteria).
- [ ] `tests/policy-schema.test.js`: change line 22's `assert.strictEqual(POLICY_KEYS.length, 34)`
      to `33`. Change line 149's `assert.deepStrictEqual(result, { unrecognizedKeys: [],
      invalidValues: [], migratableKeys: [] })` to include `renamedKeys: []` in the expected object
      — it's a full-shape equality check, so an extra returned field silently starts failing this
      test's `deepStrictEqual` (verify by running the suite before this leaf's other edits land, to
      confirm this is the actual failure mode, not a guess). Remove any assertion expecting
      `unattended-tier` to be a recognized key; add cases for `renamedKeys` and for
      `unrecognizedKeys` staying empty (see Acceptance Criteria).

## Acceptance Criteria

1. `bookkeepingPermissions('supervised')` returns
   `{ ledgerNarrowing: false, queueWriteAutoFile: false, opsAckAutoAcknowledge: false }`.
2. `bookkeepingPermissions('trusted')` returns
   `{ ledgerNarrowing: true, queueWriteAutoFile: true, opsAckAutoAcknowledge: false }`.
3. `bookkeepingPermissions('unattended')` returns
   `{ ledgerNarrowing: true, queueWriteAutoFile: true, opsAckAutoAcknowledge: true }`.
4. `bookkeepingPermissions(undefined)` and `bookkeepingPermissions('bogus-tier')` both return the
   same all-`false` object as `bookkeepingPermissions('supervised')` — unrecognized input falls
   through to the ceiling's own default exactly like `resolveCeiling`/`permittedGrants` do.
5. Every existing case in the moved `clearsFloor` test suite still passes unchanged (four category
   patterns, the numeric-threshold edge cases for "more than N" vs. exact N, empty/non-string input).
6. `permittedGrants`'s existing test suite passes with zero modifications — this leaf adds nothing
   to its signature or behavior.
7. `auditPolicy()` called against a fixture `policy.yml` containing `unattended-tier: on` and no
   `autonomy` key returns `renamedKeys: [{ key: 'unattended-tier', value: 'on', replacedBy: 'autonomy', suggestedValue: 'unattended', currentReplacementValue: null }]`
   **and** `unrecognizedKeys: []` — the same fixture, both fields asserted in the same test, so the
   exclusion is checked directly rather than inferred from two separate tests that could drift.
8. `auditPolicy()` called against a fixture `policy.yml` containing both `unattended-tier: on` and
   `autonomy: trusted` returns the same `renamedKeys` entry, with `currentReplacementValue: 'trusted'`.
9. `auditPolicy()` called against a `policy.yml` with no `unattended-tier` key returns
   `renamedKeys: []`.
10. `auditPolicy()` called against a fixture `policy.yml` containing `unattended-tier: off`
    (the schema's own documented default, distinct from the key being absent) returns
    `renamedKeys: [{ key: 'unattended-tier', value: 'off', replacedBy: 'autonomy', suggestedValue: null, currentReplacementValue: null }]`.
    `suggestedValue: null` means "the stray key can simply be deleted, no `autonomy` value needs to
    be set" — `off` never unlocked anything `autonomy`'s own `supervised` default doesn't already
    match, so there is nothing to carry forward. State this meaning in a code comment next to
    `RENAMED_KEYS`' `migrate` function, since a future reader of `suggestedValue: null` elsewhere
    in the codebase has no other way to learn it.
11. `require('.../policy-schema.js').POLICY_KEYS` contains no entry with `key === 'unattended-tier'`,
    and its `.length` is exactly one less than its pre-leaf count (measure the live count at build
    time — don't hard-code a number here that could drift before this leaf builds, `[IL-40]`).
12. Reverting `bookkeepingPermissions`'s tier thresholds (e.g., gating `queueWriteAutoFile` on
    `unattended` instead of `trusted`) causes Acceptance Criterion 2 above to fail — confirms the
    test actually discriminates, not just reads correct (`[IL-105]`).

## Technical Approach

`bookkeepingPermissions` lives in `autonomy.js` rather than a new file because it shares
`CEILINGS`/`isCeiling`/`atLeast` with `permittedGrants` and `resolveCeiling` — those three
internal helpers stay module-private (not exported today, and this leaf doesn't change that; the
new function calls them directly since it's defined in the same file). It is a genuinely separate
function from `permittedGrants`, not a parameter added to it: `permittedGrants` denies immediately
without a trust `row`, and the three bookkeeping capabilities have no trust-class dimension at all
— forcing them through `permittedGrants` would require every caller to fabricate a fake trust row.

`clearsFloor` moves into `autonomy.js` unmodified — it's a pure, small, dependency-free function
with no reason to live in a file of its own once the lever that gated its use case no longer
exists as a standalone toggle.

### Data / API Surface

```js
// bin/lib/issues/autonomy.js — new exports, added to the existing module.exports object
function clearsFloor(blockerReason) { /* moved verbatim from unattended-tier.js */ }

function bookkeepingPermissions(ceiling) {
  const tier = isCeiling(ceiling) ? ceiling : 'supervised';
  return {
    ledgerNarrowing: atLeast(tier, 'trusted'),
    queueWriteAutoFile: atLeast(tier, 'trusted'),
    opsAckAutoAcknowledge: atLeast(tier, 'unattended'),
  };
}

module.exports = { CEILINGS, resolveCeiling, permittedGrants, clearsFloor, bookkeepingPermissions };
```

```js
// bin/lib/policy-schema.js — new export alongside POLICY_KEYS
const RENAMED_KEYS = [
  {
    key: 'unattended-tier',
    replacedBy: 'autonomy',
    // null means "delete the stray key, no autonomy value needs setting" — 'off' never
    // unlocked anything autonomy's own 'supervised' default doesn't already match.
    migrate: (value) => (value === 'on' ? 'unattended' : null),
  },
];
const RENAMED_KEY_NAMES = new Set(RENAMED_KEYS.map((entry) => entry.key));

// inside auditPolicy(repoRoot), after policyEntries is computed:
// existing line 98, now excludes renamed keys so a stray key reports exactly once:
const unrecognizedKeys = Object.keys(policyEntries)
  .filter((key) => !schemaByKey.has(key) && !RENAMED_KEY_NAMES.has(key));

const renamedKeys = [];
for (const entry of RENAMED_KEYS) {
  if (Object.prototype.hasOwnProperty.call(policyEntries, entry.key)) {
    const value = policyEntries[entry.key];
    renamedKeys.push({
      key: entry.key,
      value,
      replacedBy: entry.replacedBy,
      suggestedValue: entry.migrate(value),
      currentReplacementValue: Object.prototype.hasOwnProperty.call(policyEntries, entry.replacedBy)
        ? policyEntries[entry.replacedBy]
        : null,
    });
  }
}
// ... return { unrecognizedKeys, invalidValues, migratableKeys, renamedKeys };

module.exports = { POLICY_KEYS, RENAMED_KEYS, auditPolicy };
```

### Key Files

- `bin/lib/issues/autonomy.js` — add `clearsFloor`, `bookkeepingPermissions`; extend `module.exports`
- `bin/lib/issues/unattended-tier.js` — delete
- `bin/lib/policy-schema.js` — drop `unattended-tier` from `POLICY_KEYS`; add `RENAMED_KEYS`; add
  `renamedKeys` to `auditPolicy()`'s return; extend `module.exports`
- `bin/lib/issues/tests/autonomy.test.js` — add `bookkeepingPermissions` cases; absorb moved
  `clearsFloor` cases
- `bin/lib/issues/tests/unattended-tier.test.js` — delete (after moving its cases)
- `tests/policy-schema.test.js` — drop stale `unattended-tier` recognition assertion; add
  `renamedKeys` cases

### Package Dependencies

- None new.

## Gotchas

- `permittedGrants`'s `DENY` early-return checks run in a specific order (no trust row → gradable
  kind → ceiling supervised → verdict clean → ...). `bookkeepingPermissions` has none of that —
  don't copy the guard-clause shape, it doesn't apply here.
- `atLeast(tier, minimum)` compares `CEILINGS.indexOf(tier) >= CEILINGS.indexOf(minimum)` — passing
  an unrecognized `tier` string (not resolved through `isCeiling` first) makes `indexOf` return
  `-1`, which compares as *less than every real tier*, silently denying everything rather than
  throwing. `bookkeepingPermissions` must resolve `tier` via `isCeiling(ceiling) ? ceiling : 'supervised'`
  before calling `atLeast`, exactly like `permittedGrants` already does — don't pass the raw
  `ceiling` argument straight into `atLeast`.
- The `renamedKeys` check reads `policyEntries` only — never `claudeMdEntries`. A stray
  `unattended-tier` sitting in CLAUDE.md instead of `policy.yml` is a different, pre-existing
  problem (`migratableKeys` already covers "recognized key in the wrong file") and out of scope
  here — `unattended-tier` won't be in `POLICY_KEYS` anymore, so `migratableKeys`' existing
  `schemaByKey.has(key)` guard means it wouldn't be flagged there either; that's an accepted,
  narrow gap (a key that's simultaneously wrong-file AND retired reports only as `renamedKeys` if
  it's in `policy.yml`, and as neither if it's only in stale CLAUDE.md prose — CLAUDE.md prose
  describing a retired lever is a documentation staleness problem, not a config-migration one).
- Do not add `unattended-tier` back to `POLICY_KEYS` "just so `renamedKeys` can find it via
  `schemaByKey`" — the whole point of `renamedKeys` is to work for a key that `POLICY_KEYS` no
  longer recognizes at all.
- `tests/policy-schema.test.js:149`'s `assert.deepStrictEqual(result, {...})` checks the function's
  *entire* return shape, not specific fields — adding `renamedKeys` to what `auditPolicy()` returns
  breaks this test even though nothing about `unrecognizedKeys`/`invalidValues`/`migratableKeys`
  changed. This is a real, verified-in-advance failure (confirmed by three independent red-team
  passes against the live file), not a hypothetical — don't discover it by running the suite and
  being surprised; it's already accounted for in the Deliverables above.


<!-- work-fingerprint: 2026-08-09-autonomy-unattended-tier-merge:core-lever-code -->
