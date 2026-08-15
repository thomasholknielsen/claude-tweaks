---
record: 367
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 367: Demo binary gate: leaf records and parent aggregation

Surface: backend

## Overview

`/claude-tweaks:demo`'s acceptance gate is unconditional today: every closed record — and every decomposition parent, via `wrap-up/verification-brief.md`'s Parent-Gate Procedure — gets a `demo:pending` label and a full Verification Brief, regardless of how much is actually at stake. This sub-issue makes that conditional on the shared `exceedsOversightFloor` predicate (built in this decomposition's companion sub-issue): a leaf record only gets the gate when it exceeds the configured risk/size floor; a decomposition parent is gated on risk alone, aggregated as the max across its sub-issues, never on size.

The verdict itself is untouched — every record that meets the floor still gets a real human `/demo` click, at every autonomy tier. This sub-issue only conditions whether the gate is required to fire at all.

**Complexity:** Medium-High
**Estimated tasks:** 7

## Non-Goals

- Automating the verdict itself — no autonomy tier, trust class, or policy value ever causes a record to self-approve. Every gated record still gets a real human click.
- Any `demo:exempt` stamp or new label state on the not-required path — a below-floor record closes with **no** `demo:*` label at all, no brief, no ceremony. It stays demoable later on request via `/demo`'s existing closing-commit-reconstruction path (its `#N` lookup already handles a record carrying no `demo:pending` label).
- The `acceptance-gap`/`parent-gate` backstop sweeps — a separate, dependent sub-issue (blocked on #204's file-split) makes those floor-aware; this sub-issue only changes when the gate is *applied at close time*, not how the backstops later recompute it.
- Review-history / changes-requested evidence as a floor input — deliberately deferred, not silently dropped.
- #310 ("Sampling floor") — a companion, not a blocker.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #366 | Oversight-floor predicate, policy keys, and grant-gate migration | Shipped — `exceedsOversightFloor` exists in `bin/lib/issues/oversight-floor.js` |

## Current State

- `skills/wrap-up/verification-brief.md` — owns both the ordinary per-record `demo:pending` stamping (Phase 4) and the Parent-Gate Procedure.
- `skills/demo/SKILL.md` Step 1 — resolves a record via three fallbacks: label-backed → closing-commit reconstruction → session-recall.
- `bin/lib/issues/acceptance.js` — owns `needsBackstop`/`parentGateState`. Not touched by this sub-issue.
- `_shared/auto-mode-contract.md` — acceptance is never silenced by `auto` mode; unaffected by this change.

## Deliverables

- [x] Ordinary (non-parent) close path: gate Phase 4's brief-composition + `demo:pending` on `exceedsOversightFloor`.
- [x] Parent-Gate Procedure's "Evaluate the gate" step: gate on `due AND max(sub-issue risk) exceeds risk-floor`, via `exceedsOversightFloor({risk: maxTier}, {riskFloor, sizeFloor: null})`.
- [x] Unscored leaf/sub-issue fails closed (already `exceedsOversightFloor`'s behavior; `maxRiskTier` propagates this for the parent case).
- [x] Update `skills/demo/SKILL.md`'s prose to reflect that `demo:pending` is no longer unconditional.

## Acceptance Criteria

1. Leaf `risk:medium`/`size:medium` under default floor closes with no `demo:pending`, no brief.
2. Leaf `risk:high`/`size:low` closes with `demo:pending` + brief — unchanged.
3. Parent sub-issues `low/medium/low` (max=medium) — no gate.
4. Same parent +1 `risk:high` — gate applies.
5. Parent sub-issues all `risk:low`, one `size:high` — no gate (size never read at parent level).
6. Sub-issue missing `risk:*` — gate applies (fails closed), parent case.
6b. Standalone leaf missing `risk:*` — gate applies (fails closed).
7. `/claude-tweaks:demo #N` on a below-floor record still resolves via closing-commit reconstruction.
8. Locate and extend the actual test file(s) covering this logic; confirm `node --test` passes.

## Technical Approach

### Key Files

- `skills/wrap-up/verification-brief.md`
- `skills/demo/SKILL.md`
- `bin/lib/issues/oversight-floor.js` (consumed; extended with `maxRiskTier`)

## Gotchas

- The OR-composition contract with #310.
- "Not required" is not "cannot be demoed" — a below-floor record is still fully demoable on request.
- Both Parent-Gate entry shapes funnel through one gate-evaluation section — do not duplicate the aggregation logic.
- `/claude-tweaks:tidy`'s `Open parent gate` action reuses the same Parent-Gate Procedure.
- Floor values are read live at each evaluation, not pinned at record-close time.
