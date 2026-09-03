---
record: 808
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 808: demo: visual verification isn't required before the finish-gate merge decision

Surface: backend

## Current State

Work can be declared "verified green" and merged before any visual/browser evidence exists, with the visual check only happening afterward, at the user's request — `/claude-tweaks:demo`'s Validate step isn't positioned as a precondition of the finish flow's merge decision. Observed sequence: complete an implementation whose acceptance genuinely depends on visual/UI behavior, reach the "Implementation complete, what would you like to do?" merge decision without having run any browser-based Validate/visual-review step first, merge, then have the user ask "can you test it out in the browser?" as a separate, later request. In the reproducing session, the merge decision was reached and taken first ("merged to master cleanly ... verified green"), and the user had to explicitly request a browser check afterward — twice, since the first attempt substituted raw HTML for an actual rendered check.

## Deliverables

- Position `/claude-tweaks:demo`'s Validate step (or an equivalent browser-based visual check) as a precondition of the finish flow's merge decision when the work's acceptance criteria depend on rendered UI behavior — not an optional afterthought a user has to request separately.
- A detection rule for "this record's acceptance depends on rendered UI" (Surface: web/mobile/desktop, or acceptance criteria naming visual/interactive behavior) that gates whether the precondition applies — a backend-only record should not be forced through a browser check it has no UI to validate.

## Acceptance Criteria

- A change whose correctness depends on rendered UI behavior reaches the merge decision only after a browser-based visual check has run (or been explicitly declined) — not after merge, on a separate later request.
- Raw HTML rendering does not satisfy the check — the check must be an actual rendered browser verification.
- A record with no UI-dependent acceptance criteria is not blocked by this precondition.

## Technical Approach

Wire the detection rule into the same Surface-aware machinery `/specify` already uses to decide frontend-vs-backend (Step 2.5a's sniff) so the two stay consistent rather than diverging judgments. Where the precondition applies, the finish flow's "what would you like to do?" merge decision should not render until a Validate/visual-review pass has completed or been explicitly skipped by the user.

## Gotchas

- A raw-HTML substitute for an actual rendered check is a known false-positive mode in this exact scenario (observed twice in the reproducing session) — the fix must not be satisfiable by anything short of a real browser-rendered check.
- Don't force a browser check on backend/infra records with no UI surface — the gate must be conditional on the detection rule, not universal.

## Original request

demo: visual verification isn't required before the finish-gate merge decision

**Summary:** Work can be declared "verified green" and merged before any visual/browser evidence exists, with the visual check only happening afterward, at the user's request — `/claude-tweaks:demo`'s Validate step isn't positioned as a precondition of the finish flow's merge decision.

**Kind:** Defect

**Affected component:** `/claude-tweaks:demo` (Validate step, relative to the lifecycle's finish gate)

**Objective:** Developer joy

**Repro steps:**
1. Complete an implementation whose acceptance genuinely depends on visual/UI behavior.
2. Reach the "Implementation complete, what would you like to do?" merge decision without having run any browser-based Validate/visual-review step first.
3. Merge, then have the user ask "can you test it out in the browser?" as a separate, later request.

**Expected vs. actual:**
Expected: a change whose correctness depends on rendered UI gets a visual check before the merge decision is offered, not after.
Actual: in this session, the merge decision was reached and taken first ("merged to master cleanly ... verified green"), and the user had to explicitly request a browser check afterward — twice, since the first attempt substituted raw HTML for an actual rendered check.

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: feedback-f6742c30 -->

