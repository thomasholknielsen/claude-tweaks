---
record: 969
title: "Grant gate: oversight-floor rule for shaped:headless records"
origin: human
risk: medium
size: low
ceremony: standard
grants: []
surface: backend
---

Surface: backend

## Overview

Teach the authorization stage to read the new provenance. The grant gate's gate 5 already denies ANY record at/above the configured oversight floor (`failedKey: 'oversight-floor'`) — so provenance-aware treatment must be a **stricter** floor, not a re-application of the same one: a record carrying `shaped:headless` is additionally evaluated against fixed `medium` floors on both axes, meaning a headlessly-shaped record auto-grants only when its risk AND size are both `low`. Human-shaped records keep exactly today's configured-floor behavior. The denial is surfaced to a human through `/backlog attention`'s existing human-owed table, not through the grant unit's own report — `grant-mode.md`'s documented skip convention (decisions.md log only, no comment, no per-verdict branching) is preserved.

**Complexity:** Low
**Estimated tasks:** 4

## Non-Goals

- No change to interactive/human grants — a human granting a `shaped:headless` record is always allowed; the label is provenance, not a block.
- No new policy levers — `fleet-daily-grant-cap`, autonomy tiers, blast-radius caps, and the configured `riskFloor`/`sizeFloor` are all unchanged; the `medium` cap for provenance-carrying records is fixed in code, deliberately not configurable in v1.
- No `merge-check`/`auto:merge` changes — this gates the grant, not the merge (independent axes).
- No change to `grant-mode.md`'s silent-skip convention — no comments posted on denied records from the grant unit.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #968 | specify next: framing-check guard + shaped:headless provenance | must land first — the `shaped:headless` label and its `shapedHeadless` facet (in `parseRecordFacets`) land there |

## Current State

- `plugin/bin/lib/issues/grant-gate.js` — `evaluateGrantGate({record, policy, trustVerdicts, grantCheck})` runs gates 1a–5 in deny-fast order; gate 5's fixed sub-order is merge-sensitive-paths → `exceedsOversightFloor(facets, {riskFloor, sizeFloor})` denying with key `'oversight-floor'` → daily grant cap. `parseRecordFacets` and `resolveProvenance` are already imported. Deny reasons are free text per the file's own convention.
- `plugin/bin/lib/issues/oversight-floor.js` — `exceedsOversightFloor(facets, policy)` returns `{ exceeds: boolean, reason: 'risk' | 'size' | 'unscored' | null }`; unscored/missing facets fail closed.
- `tests/bin-lib/issues/grant-gate.test.js` — the gate's unit suite.
- `plugin/skills/backlog/grant-mode.md` — the headless grant unit's gate chain; its skip convention is explicitly silent (no label change, no comment; decisions.md log only, no per-verdict branching).
- `plugin/skills/backlog/attention-mode.md` — the human-owed discovery surface: a table of label-classified records, each row with a `run /claude-tweaks:backlog refine #{n} to …` action (the established command convention for grant-type items).
- `plugin/skills/assess-agent-autonomy/grant-check.md` — Step 1 Gather / Step 2 Judge / Step 3 Render; no provenance input today.
- This project's live policy (`.claude-tweaks/policy.yml`): `autonomy: unattended`, `grant-origination-enabled: true`, `fleet-daily-grant-cap: 3` — the rule lands in a real unattended configuration.

## Deliverables

- [ ] `grant-gate.js`: in gate 5, immediately after the existing `'oversight-floor'` deny, when `facets.shapedHeadless` is true, evaluate `exceedsOversightFloor(facets, { riskFloor: 'medium', sizeFloor: 'medium' })`; on `exceeds`, return `deny('shaped-headless-floor', …)` with a free-text reason naming the floor result's `reason`, the fixed `medium` cap, and the human route (`/claude-tweaks:backlog refine`). Snapshot carries the floor result's `reason` and the record's `risk`/`size`. A code comment at the check states the restrictive-only invariant: this branch may only ever narrow auto-granting, never widen it.
- [ ] `plugin/skills/backlog/grant-mode.md`: document the new deny key in the gate-chain description; the skip stays silent per the existing convention (decisions.md log only).
- [ ] `plugin/skills/backlog/attention-mode.md`: new classification row — an open record carrying `ready` + `shaped:headless` with no `auto:build` grant — with the action text `run /claude-tweaks:backlog refine #{n} to grant (spec was headlessly shaped — no human has reviewed it)`, following the table's existing command convention.
- [ ] `plugin/skills/assess-agent-autonomy/grant-check.md`: in Step 2 (Judge), one paragraph — a `shaped:headless` record's spec content had no human review, so content-derived confidence is weaker; ambiguity weighs toward `RECOMMEND_BUILD: false` (the skill's existing conservative direction), without duplicating the gate's hard rule.
- [ ] Tests in `grant-gate.test.js`: (a) `shaped:headless` + risk or size `medium` (below the configured `high` floor) → denied with `'shaped-headless-floor'`; (b) `shaped:headless` + risk and size both `low` → passes gate 5; (c) no `shaped:headless`, same facets as (a) → grants (regression: human-shaped path byte-identical); (d) `shaped:headless` + risk `high` (above the configured floor too) → denied with `'oversight-floor'`, pinning that the existing key wins when both would fire.

## Acceptance Criteria

1. `evaluateGrantGate` denies a `shaped:headless` record whose risk or size is `medium`+ with `failedKey: 'shaped-headless-floor'`, and the deny snapshot names the floor result's `reason` and the record's tiers.
2. A `shaped:headless` record with risk and size both `low` is not denied by this rule (later gates still apply — the test isolates the rule).
3. Every pre-existing `grant-gate.test.js` case passes unmodified, and test (c) pins that a human-shaped record with identical facets is unaffected — the change is restrictive-only for provenance-carrying records and a no-op for all others.
4. Test (d) pins the deny-fast ordering: when both floors would deny, `'oversight-floor'` is the surfaced key.
5. `attention-mode.md` renders the new classification with the runnable `refine` command; `grant-mode.md` documents the key without adding any comment-posting behavior.
6. `npm test` passes; the new tests fail when the gate change is reverted (verify once during development).

## Technical Approach

Expand-only on gate 5: the existing configured-floor check runs first (its `'oversight-floor'` key keeps winning for records that exceed both — pinned by test (d)); the new branch adds one further `exceedsOversightFloor` call with fixed `medium` floors, only for provenance-carrying records. Reusing the same predicate function means unscored facets fail closed here exactly as they do on the configured floor, with no new comparison logic. Surfacing goes through `/backlog attention` because that is the plugin's designated human-owed discovery surface — the grant unit's own report stays silent by design, and the attention row's `refine` command is the actual grant mechanism.

### Data / API Surface

- `evaluateGrantGate` result: new possible `failedKey: 'shaped-headless-floor'`; result shape otherwise unchanged.
- Reads `facets.shapedHeadless` as delivered by #968's `parseRecordFacets` change.

### Key Files

- `plugin/bin/lib/issues/grant-gate.js` — the gate-5 branch + invariant comment
- `tests/bin-lib/issues/grant-gate.test.js` — four new cases
- `plugin/skills/backlog/grant-mode.md` — gate-chain documentation
- `plugin/skills/backlog/attention-mode.md` — human-owed classification row
- `plugin/skills/assess-agent-autonomy/grant-check.md` — Step 2 provenance paragraph

### Package Dependencies

- none

## Gotchas

- Restrictive-only invariant: this change may only ever narrow auto-granting. Any path where the new branch could widen a grant (e.g. short-circuiting a later deny into a pass) is a bug — AC 3's regression pin and the in-code invariant comment are the two enforcement points.
- Gate 3 already refuses machine grants to records with no `by:*` origin — so the practical population for this rule is agent-filed records (e.g. `by:capture`) that #967/#968's unit shaped headlessly. Do not "fix" gate 3 to widen the population; that refusal is its own recorded AC.
- Open #481 also touches `skills/backlog/` files — check for collisions before merging.
- The parent-aggregation variant of the oversight floor (a decomposition parent gated on max sub-issue risk) belongs to wrap-up's brief procedure — the grant gate evaluates exactly the record it is given; do not import parent aggregation here.
- Deny reasons in `grant-gate.js` are free text by the file's own convention — `_shared/ledger-format.md`'s closed vocabulary governs ledger/ops qualifiers, not gate deny strings; no vocabulary lookup applies here.

<!-- work-fingerprint: headless-shaping-unit:grant-gate-oversight-floor-rule-for-shaped-headless-records -->
