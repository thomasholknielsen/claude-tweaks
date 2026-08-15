---
record: 368
origin: human
risk: low
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 368: Backstop pre-filter: acceptance-gap and parent-gate recompute live against the floor

Surface: backend

## Overview

The two existing backstop sweeps that catch closed-with-no-disposition records — `acceptance-gap` and `parent-gate` (`skills/_shared/github-pr-scan.md`'s scopes under `work-backend: github-issues`; `skills/tidy/step-1-records.md`'s Shapes 8 and 7 under `local-files`) — will, after this decomposition's companion sub-issue ships, start seeing records that legitimately closed with no `demo:*` label because they never exceeded the oversight floor. Without a change, those sweeps would misreport every one of them as a gap needing attention forever.

This sub-issue adds a pre-filter to both scopes: before either treats a closed, undisposed record as a gap candidate, recompute `exceedsOversightFloor` against the record's **current** `risk:*`/`size:*` labels and the **current** `risk-floor`/`size-floor` policy values. Below floor → not a gap, skip; the existing `needsBackstop`/`parentGateState` predicates never see it. This recomputes live rather than trusting a frozen stamp, deliberately — a later floor tightening naturally re-surfaces previously-exempt records on the next sweep, without needing a separate reconciliation mechanism.

**Complexity:** Medium
**Estimated tasks:** 5

## Non-Goals

- No `demo:exempt` label or any other new marker — this is a read-time recomputation, not a write.
- No change to `bin/lib/issues/acceptance.js`'s `needsBackstop`/`parentGateState` function signatures or logic — this is a pre-filter that runs *before* those predicates, narrowing the population they see, never a change to what they themselves decide.
- No change to how `/claude-tweaks:demo` itself applies or evaluates the gate at close time — that is the companion sub-issue's scope. This sub-issue only touches what the periodic backstop sweeps report.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #204 | Split `_shared/github-pr-scan.md` by scope before it hits the 40 KB ceiling | Blocking — `github-pr-scan.md` is at 40,774 of a 40,960-byte hard ceiling (`bin/lib/skill-audit/context-cost.js`'s `CEILING_BYTES`), 186 bytes of headroom. This sub-issue's pre-filter prose cannot land in that file until #204's split creates room. If #204 has not shipped when this sub-issue is picked up, re-measure the file's current size first — it may have already grown past the ceiling from unrelated changes, in which case this sub-issue is blocked outright, not just tight. `#204`'s own "Candidate grouping" note names the scope `family-gate`, not `parent-gate` — that's #204's pre-rename wording (this repo's parent-issue vocabulary rename landed after #204 was filed); read it as referring to today's `parent-gate` scope, and don't let the name mismatch read as #204 being about something else. |
| #366 | Oversight-floor predicate, policy keys, and grant-gate migration | Blocking — this sub-issue calls `exceedsOversightFloor`, which does not exist until that sub-issue ships |

**The exact contract this sub-issue depends on** (verify against #366's shipped code before starting): `exceedsOversightFloor(facets, { riskFloor, sizeFloor })` returns `{ exceeds: boolean, reason: 'risk' | 'size' | 'unscored' | null }`. Either floor may be the literal `null`, meaning that axis is not evaluated at all for this call — critically, this is different from a *missing* facet, which fails closed as `'unscored'`. The parent-gate pre-filter below depends entirely on passing `sizeFloor: null` (not the resolved size-floor policy value, and not omitted) when evaluating a parent's aggregate risk with no size facet supplied.

**Build-time note (materialized 2026-08-14):** #204 remains open at materialization time, but the technical constraint it tracked no longer holds — `8d1363a` ("Sweep backstop...", refs #414) already split `skills/_shared/github-pr-scan.md` by scope, creating `skills/_shared/github-pr-scan-acceptance.md`. Re-measured at build time: `github-pr-scan.md` is 31,256 bytes and `github-pr-scan-acceptance.md` is 29,632 bytes (post-edit), both well under the 40,960-byte ceiling — confirmed via `bin/lib/skill-audit/tests/context-cost.test.js`. #366 is CLOSED/shipped; `exceedsOversightFloor` exists and its shipped signature matches the contract above (verified directly against `bin/lib/issues/oversight-floor.js`).

## Current State

- `skills/_shared/github-pr-scan.md`'s `acceptance-gap` scope — surfaces closed records with no acceptance disposition (drives `/tidy` Step 4.8 and `/help` Stage 4.7 under `github-issues`). Already fetches `labels` on every closed record it scans (needed for `needsBackstop`'s own hasParent/disposition logic).
- The same file's `parent-gate` scope — surfaces decomposition parents whose sub-issues are all closed but the parent carries no `demo:pending`. Already fetches each sub-issue's state to build the `leaves` array `parentGateState` consumes.
- `skills/tidy/step-1-records.md` Shapes 7 and 8 — the `local-files` equivalents, querying the record store directly instead of the GitHub API (`queryRecords('specs', { isParentIssue: true })` merged with per-parent sub-issue queries for Shape 7; `queryRecords('specs', { closed: true })` filtered to non-sub-issue records for Shape 8).
- `bin/lib/issues/acceptance.js` — `needsBackstop({ state, labels, hasParent })` and `parentGateState({ leaves })` (or whatever the actual current signatures are — confirm by reading the file directly at build time; this description is from prior-session context and may not be byte-exact).

## Deliverables

- [x] In whichever file #204's split produces for the `acceptance-gap` scope: resolve `risk-floor`/`size-floor` once per scan invocation (not per record) via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values risk-floor size-floor` at the top of the scope's existing scan loop. Before calling `needsBackstop` on a closed, undisposed candidate record, call `exceedsOversightFloor({ risk: record.facets.risk, size: record.facets.size }, { riskFloor, sizeFloor })` using the record's already-fetched `labels` (via `parseRecordFacets`). Skip the record (do not call `needsBackstop`, do not include it in the scope's findings) when `exceeds` is `false`.
- [x] In whichever file #204's split produces for the `parent-gate` scope: same once-per-scan `resolve-policy.js` call as above. Before calling `parentGateState`, compute `maxTier` — the max risk tier across the parent's `leaves` (using each sub-issue's already-fetched labels — no additional `gh` calls; ordering per `record.js`'s `TIERS`) — and call `exceedsOversightFloor({ risk: maxTier }, { riskFloor, sizeFloor: null })`. **`sizeFloor` must be the literal `null` here, never the resolved size-floor value and never omitted** — per #366's contract this is what makes a `facets` object with no `size` key return `exceeds: false` (when risk doesn't trip) instead of failing closed on a missing size that was never meant to be evaluated at this level. Skip the parent when `exceeds` is `false`. This candidate set is only ever non-empty parents.
- [x] `skills/tidy/step-1-records.md` Shape 8 (`local-files` acceptance-gap equivalent) — same pre-filter, sourced from `queryRecords`'s returned `facets.risk`/`facets.size` instead of GitHub labels.
- [x] `skills/tidy/step-1-records.md` Shape 7 (`local-files` parent-gate equivalent) — same max-risk-only pre-filter, sourced from the merged sub-issue query's `facets.risk`.
- [x] Confirm (do not assume) that both `acceptance-gap` and `parent-gate` scopes' existing label/facet fetches already include `risk:*`/`size:*` — if either scope's current `gh issue list --json ...` field list or `queryRecords` filter omits them, add them to that existing fetch call rather than issuing a second round-trip. **Confirmed:** `acceptance-gap`'s closed-record fetch already carried `labels`; `parent-gate`'s state-map fetch (`gh issue list --state all --json number,state`) did **not** carry `labels` — added `labels` to that existing fetch call (no second round-trip introduced).

## Acceptance Criteria

1. A closed record with `risk:medium`, `size:medium`, no `demo:*` label, under the default floor (`risk-floor: high`, `size-floor: high`) — does **not** appear in `acceptance-gap` scope output.
2. A closed record with `risk:high`, no `demo:*` label — still appears in `acceptance-gap` scope output, unchanged from today.
3. A decomposition parent with all sub-issues closed, max sub-issue risk `medium`, no `demo:pending` on the parent — does **not** appear in `parent-gate` scope output.
4. The same parent shape but with one sub-issue at `risk:high` — still appears in `parent-gate` scope output.
5. A decomposition parent whose sub-issues are all `risk:low` but one carries `size:high` — does **not** appear in `parent-gate` scope output (size is never read at the parent level, matching the companion sub-issue's own regression case).
6. Re-running the scan with `risk-floor` lowered to `medium` in `policy.yml` (no other change) causes case 1's record to newly appear in `acceptance-gap` output — confirms live recomputation, not a frozen decision.
7. Both `local-files` Shapes 7/8 produce equivalent results to their `github-issues` counterparts for the same facet shapes (cases 1, 3, 5 mirrored on the local driver).
8. Neither scope issues any additional **per-record** network/file round-trip beyond what it already performs today.

**Build-time verification:** cases 1, 2, 3, 4, 5, 6, and the unscored-leaf fail-closed case were exercised directly against the shipped `exceedsOversightFloor`/`needsBackstop`/`parentGateState`/`parseRecordFacets` functions with the exact filter logic now embedded in both `github-pr-scan-acceptance.md` and `step-1-records.md`; all returned the expected boolean. AC7 holds by construction — both drivers call the identical `exceedsOversightFloor`/max-tier logic. AC8 holds: `acceptance-gap`'s fetch already carried labels; `parent-gate`'s fetch gained `labels` on its *existing* call, not a new one; `local-files` reads are in-process file reads with no network round-trip at all. This sub-issue's logic is markdown-prose executed by a dispatched scan agent, not a standalone JS module (per its own Gotchas), so there is no new `node --test` file for it — the underlying predicates it composes (`exceedsOversightFloor`, `needsBackstop`, `parentGateState`, `parseRecordFacets`) already carry their own full unit coverage from #366 and pre-existing `acceptance.test.js`, unchanged and still passing (166/166 across `acceptance.test.js`, `oversight-floor.test.js`, `record.test.js`, `local-store.test.js`).

## Technical Approach

### Key Files

- The file(s) #204's split produces from `skills/_shared/github-pr-scan.md` — resolved at build time via `grep -rln "acceptance-gap" skills/_shared/` and `grep -rln "parent-gate" skills/_shared/`: both scopes live in `skills/_shared/github-pr-scan-acceptance.md`.
- `skills/tidy/step-1-records.md` — Shapes 7 and 8.
- `bin/lib/issues/oversight-floor.js` — consumed, not modified.

## Gotchas

- Resolve `risk-floor`/`size-floor` once per scan invocation, not once per candidate record — these scopes can iterate dozens of records/parents in one run, and a per-record policy resolution call would be wasteful and is unnecessary since the floor value cannot change mid-scan.
- The parent-level check must pass `sizeFloor: null` (the literal value, per #366's contract — see Prerequisites), never the resolved size-floor policy value and never an omitted key on the policy object. Passing the real `sizeFloor` value here, with `facets.size` absent, would trip `exceedsOversightFloor`'s `'unscored'` fail-closed path and gate every parent regardless of risk — silently reintroducing the exact bug this sub-issue exists to avoid. Acceptance Criteria 5 is the regression test for this; #366's own Acceptance Criteria 9b/9c are the predicate-level unit tests the same contract depends on.
- If #204 has not shipped and this sub-issue is picked up regardless, re-measure `github-pr-scan.md`'s current byte count before starting — do not assume the 40,774-byte figure from decomposition time still holds. (Re-measured at build time: see the Prerequisites build-time note above.)
- The pre-filter logic described here (Deliverables 1-2) is markdown-prose executed by a dispatched scan agent, not a standalone JS module — there is no `acceptance.test.js`-style unit-testable entry point for it the way `bin/lib/issues/oversight-floor.js` has one. Acceptance Criteria 1-6 are verified by actually running the scope (via `/claude-tweaks:tidy` Step 4.8, or the equivalent standalone invocation) against fixture records matching each case's facet shape and reading the resulting output list — not a `node --test` run. Only Acceptance Criterion 7 (the `local-files` parity check) and the general project test suite touch `node --test` at all for this sub-issue.

**Build-time note — the same shell-persistence discipline elsewhere in these files applies to the new resolution calls added here:** the `risk-floor`/`size-floor` resolution must run inside the *same* Bash code block as the script that consumes it, never a separate preceding block — shell state does not survive between separate Bash tool calls. Both edited files' new pre-filter sections resolve the floor values as the first line of the same block that runs the filter script, per `_shared/github-pr-scan-acceptance.md`'s own pre-existing Fetch-limit/`work-links` discipline.
