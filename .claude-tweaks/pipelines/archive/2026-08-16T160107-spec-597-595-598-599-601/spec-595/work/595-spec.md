---
record: 595
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: design-critique-dispatch:design-critique-policy-lever-schema-entry-resolver-default-m
blocked-by: [559]
surface: backend
---
# 595: design.critique policy lever — schema entry, resolver default, Manifesto lever

Surface: backend

## Overview

Add the `design.critique` policy lever — `off | auto | full`, default `auto` — to the policy schema, expose it through the existing resolver, and surface it as a Pipeline Config Manifesto lever. This is the single knob that governs whether project-local design critics run at review time (consumed by #598's review-mode dispatch). It governs **critique only**: `skills/_shared/design-craft.md`'s writing-context assembly is untouched by any value of this lever.

The design rejected an open per-project critic manifest and a per-mode matrix in favour of one intensity lever with a plugin-opinionated default: `auto` conditions on `DESIGN.md` presence (the observable proxy for "this project locked a design direction"), with `full` and `off` as the two escape hatches for the proxy's known weaknesses (it measures Impeccable adoption, not design care). What `auto` resolves to at runtime is defined by the consumer (#598, via `skills/design-wrapper/critics.md`), not by this record.

**Complexity:** Low
**Estimated tasks:** 4

## Non-Goals

- No consumer wiring — the review-mode read site is #598; this record only makes the key exist, resolve, and appear in the Manifesto.
- No change to `design-intent` or any other existing lever.
- No `.claude-tweaks/policy.yml` edit in this repo — the default is the intended value here.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #559 | merge-verification: policy key, derivation ladder, and Manifesto lever | in progress — same two files (`policy-schema.js`, `manifesto.md`) **and the same test assertion** (`tests/policy-schema.test.js`'s `POLICY_KEYS` count pin). The native Blocked-by link on #559 is the structural gate: do not start until it is merged to the integration branch. Pickup precondition: `grep -n "merge-verification" bin/lib/policy-schema.js` must return #559's entry before this record's edit begins. |

## Current State

- `bin/lib/policy-schema.js` — a flat array `POLICY_KEYS` of `{ key, type, values?, default?, summary, category, tier }` entries. `design-intent` (enum, `pipeline-behavior`, `advanced`) is the closest precedent and the entry to place this one beside. Dotted keys already exist (`project.maturity`, `harness-health.scoped-rule-budget`).
- `bin/resolve-policy.js` — walks run `config.yml` → `policy.yml` → schema default; `--values <key>` prints the resolved value; the JSON envelope carries `source: run-config | policy | default`. No per-key code — a new schema entry is resolvable immediately.
- `skills/flow/manifesto.md` — canonical lever numbering line (`1=Mode … 10=Model stance`) with a per-lever table; Design intent is lever 4. Its suppression rule (table row "**Design intent** (4)") reads: suppressed when "all records are non-frontend (polish auto-skips regardless)" — the input is every record's materialized `surface:` header (`skills/flow/materialize.md`), backend/infra meaning non-frontend. That same input drives this lever's suppression; no new classification logic.
- Tests: `tests/policy-schema.test.js` — pins the **total key count** at line ~52 (`assert.strictEqual(new Set(POLICY_KEYS.map(k => k.key)).size, N)`) and holds per-key shape assertions (`find(k => k.key === '…')` then `default`/`values` checks); this is the file for per-key assertions. `tests/policy-schema-metadata.test.js` — enforces every row's `summary` (≤ 140 chars, non-empty, must not contain its own key verbatim), `category`, `tier`; needs no per-key addition. `tests/resolve-policy-lib.test.js` — resolver behavior.

## Deliverables

- [ ] `bin/lib/policy-schema.js`: add `{ key: 'design.critique', type: 'enum', values: ['off', 'auto', 'full'], default: 'auto', summary: "Sets whether project-local design critics run at review time: never, when the project shows design investment or the record asks, or always.", category: 'pipeline-behavior', tier: 'advanced' }` immediately after the `design-intent` entry. (Summary is 118 chars and does not contain the literal key — satisfies the metadata test.)
- [ ] `tests/policy-schema.test.js`: bump the `POLICY_KEYS` count pin by one (re-read the current value at pickup — #559 bumps it too) and add a per-key assertion for `design.critique` (`values` deep-equals `['off','auto','full']`, `default === 'auto'`, `category === 'pipeline-behavior'`, `tier === 'advanced'`), following the file's existing `find(...)` pattern.
- [ ] `tests/resolve-policy-lib.test.js`: assert resolving `design.critique` against an empty policy returns `auto` with `source: 'default'`.
- [ ] `skills/flow/manifesto.md`: add a **Design critique** lever at the next free canonical number after #559's (re-read the numbering line at pickup); read via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" design.critique`; Recommended value = the resolved value; the row's description column reads literally `off (never) / auto (critics when DESIGN.md exists or the record asks) / full (always)` so the human sees what `auto` implies before overriding; **suppressed** when every record in the run is non-frontend — the same materialized-`surface:` input Design intent (4) uses. The lever's resolution is logged to `decisions.md` per `_shared/auto-decision-log.md` as one `AUTO` line naming value and `source`, exactly as the other resolver-read levers are.

## Acceptance Criteria

1. `node bin/resolve-policy.js --values design.critique` prints `auto` in a checkout whose `policy.yml` has no `design.critique` key.
2. `grep -n "design.critique" bin/lib/policy-schema.js` shows exactly one entry with `values: ['off', 'auto', 'full']` and `default: 'auto'`.
3. `grep -n "Design critique" skills/flow/manifesto.md` shows the lever in the canonical numbering line and in the per-lever table with a suppression condition naming the materialized `surface:` input, and `grep -n "critics when DESIGN.md exists" skills/flow/manifesto.md` returns the description text.
4. `grep -n "design.critique" skills/flow/manifesto.md` shows the resolver call and the `AUTO` decisions-log line for this lever (or the lever is covered by an existing "every resolver-read lever logs" sentence — cite it in the commit if so).
5. `node --test tests/policy-schema.test.js tests/policy-schema-metadata.test.js tests/resolve-policy-lib.test.js` passes with the new assertions in place.
6. `git diff --stat` touches only `bin/lib/policy-schema.js`, `skills/flow/manifesto.md`, and files under `tests/`.

## Technical Approach

One schema entry, one Manifesto row, test pins. No new resolver code — the resolver is schema-driven.

### Data / API Surface

Policy key `design.critique`, enum `off | auto | full`, default `auto`. Read sites call the resolver; none read `policy.yml` directly.

### Key Files

- `bin/lib/policy-schema.js` — new entry beside `design-intent`
- `skills/flow/manifesto.md` — new lever row + canonical numbering + suppression rule
- `tests/policy-schema.test.js`, `tests/resolve-policy-lib.test.js` — pins

### Package Dependencies

None.

## Gotchas

- Dotted keys follow the existing convention; do not flatten to `design-critique`.
- The `POLICY_KEYS` count pin in `tests/policy-schema.test.js` is a guaranteed merge conflict with #559 if built concurrently — hence the hard Blocked-by, not advisory sequencing. Take the number and the lever slot *after* #559's, from the merged file.
- The `summary` string is user-facing in `/help`'s policy mode — one sentence, plain language, ≤ 140 chars, never containing the key itself.
- Do not add per-value behavior text to the schema — behavior lives in the consumer (`skills/design-wrapper/critics.md`, #598), not the schema.

<!-- work-fingerprint: design-critique-dispatch:design-critique-policy-lever-schema-entry-resolver-default-m -->
