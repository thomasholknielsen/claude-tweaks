---
record: 734
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 734: Add a gate-over-producers plan-authoring check to /build Spec Step 3 (trace a new gate against its output's producers and alternate shapes)

Surface: backend

## Current State

Two Important final-review findings and one review-lens finding on #685 all lived in the same blind spot: the plan added a *gate* (a conformance scan) over an existing output (the tidy report) and traced it against the template, but not against the output's existing *producers* (`scan-procedures.md`'s Yours routing — record-less `[doctor]`/`[health]` rows) or the gate's own alternate output shape (the digest). `skills/build/SKILL.md` Spec Step 3 already carries a family of plan-authoring checks (return-shape widening, blocking-verification downgrade, deictic re-resolution, verbatim-command run-once, degrade-clause convention); a "gate-over-producers" check belongs beside them.

## Deliverables

Add a **Gate-over-producers check** to `skills/build/SKILL.md` Spec Step 3 (and Design Step 3): when a plan task adds a validation gate over an existing output, enumerate that output's producers (grep the routing/collection tables that feed it) and every alternate shape the output can take, and trace each gate row against them before finalizing the plan.

## Acceptance Criteria

- `skills/build/SKILL.md` Spec Step 3 and Design Step 3 both carry the new Gate-over-producers check, worded consistently with the existing plan-authoring check family.
- The check names the concrete failure mode it prevents (a gate traced against the template but not against the output's producers or alternate shapes) using #685 as the worked example.

## Technical Approach

Fold the new check into the existing plan-authoring check family already in Spec Step 3 (return-shape widening, blocking-verification downgrade, deictic re-resolution, verbatim-command run-once, degrade-clause convention) rather than introducing a new standalone section — it belongs beside them structurally and in prose style.

## Gotchas

- This is a small, low-risk doc addition to an already-established checklist family — the risk is in getting the wording precise enough that a plan author would actually apply it, not in any code change.

## Original request

Add a gate-over-producers plan-authoring check to /build Spec Step 3 (trace a new gate against its output's producers and alternate shapes)

# Reflect — staged finding 5

**Category:** tangential
**Severity:** low
**Reversibility:** high
**Source:** full mode, lens "Approach" (seeded from review Key Learning 1)
**Files:** skills/build/SKILL.md

## Finding

Two Important final-review findings and one review-lens finding on #685 all lived in the same blind spot: the plan added a *gate* (a conformance scan) over an existing output (the tidy report) and traced it against the template, but not against the output's existing *producers* (`scan-procedures.md`'s Yours routing — record-less `[doctor]`/`[health]` rows) or the gate's own alternate output shape (the digest). `skills/build/SKILL.md` Spec Step 3 already carries a family of plan-authoring checks (return-shape widening, blocking-verification downgrade, deictic re-resolution, verbatim-command run-once, degrade-clause convention); a "gate-over-producers" check belongs beside them. Routed D5 (names a `/claude-tweaks:build` behavior; holds in any project) — self-reference: this repo owns it → project record.

## Suggested resolution

Add a **Gate-over-producers check** to `skills/build/SKILL.md` Spec Step 3 (and Design Step 3): when a plan task adds a validation gate over an existing output, enumerate that output's producers (grep the routing/collection tables that feed it) and every alternate shape the output can take, and trace each gate row against them before finalizing the plan.

## Decision-log reference

STAGED — Step 3: pattern observation "gate-over-producers plan-authoring check" (self-reference: this repo owns the component → project record). Stage path: staged/reflect-5.md.


Origin: /claude-tweaks:wrap-up Review Console (record #685, run 2026-08-16T205523-spec-685) — staged/reflect-5.md

