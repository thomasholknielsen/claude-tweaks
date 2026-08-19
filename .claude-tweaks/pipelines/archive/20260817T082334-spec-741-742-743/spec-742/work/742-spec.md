---
record: 742
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: feedback-bcddf170
surface: backend
---
# 742: backlog overview: replace absolute failure-only narration rule with a bounded allowance, restated per output-emitting step

Surface: backend

## Current State

`skills/backlog/overview-mode.md:5` mandates an absolute failure-only narration rule ("interstitial status lines render only when a check fails or degrades … A clean step is silent"), yet a live overview run emitted 14 interstitial assistant texts of which 13 announced a step running or passing. The absolute rule loses to the model's default progress-narration habit and to harness-level guidance that actively encourages brief status notes. The convention is backlog-local: only `overview-mode.md` and `refine-mode.md` carry "failure-only narration" — the banner at `overview-mode.md:5`, plus point-of-use restatements at `overview-mode.md:65`, `overview-mode.md:149`, and `refine-mode.md:355` (verified at shaping time).

## Deliverables

Per the stamped direction (2026-08-17 review — the absolute rule is replaced, not restated-and-pinned, and not deleted):

1. Replace `overview-mode.md`'s absolute failure-only banner with a bounded allowance: exactly one opening status line at the start of the run, plus failure/degradation lines as already specified, and nothing else.
2. Restate the allowance as a one-clause reminder inside each output-emitting step of `overview-mode.md`, rather than a single top-of-file banner.
3. Apply the same reshape to `refine-mode.md`'s failure-only narration uses, for consistency.
4. A conformance test pinning the bounded-allowance prose (accepting that the test pins text, not runtime behavior), proven able to go red against the pre-change text.

## Acceptance Criteria

- No occurrence of the absolute rule's clean-step-silence phrasing ("render only when a check fails or degrades", "A clean step is silent") survives in either file — sweep-derived, including line-wrapped forms, not just the banner line.
- Every output-emitting step in both files carries the one-clause bounded-allowance reminder; the allowance permits exactly one opening status line per run plus failure/degradation lines, nothing else.
- The existing point-of-use failure/degradation-line specifications (`overview-mode.md:65`, `:149`; `refine-mode.md:355`) remain correct under the new wording — the allowance retains the failure-line convention itself.
- The conformance test fails against the pre-change text and passes after; `npm test` passes.

## Technical Approach

Prose edits to `skills/backlog/overview-mode.md` and `skills/backlog/refine-mode.md`, plus one conformance test. Derive the edit list by grepping every retired-vocabulary token and its escaped/wrapped forms across both files rather than editing only the banner.

## Gotchas

- The absolute rule fights harness-level guidance by design — the bounded allowance is what makes it winnable; do not reintroduce absolute silence phrasing anywhere in the reshape.
- The conformance test pins prose, not behavior — an accepted limitation, recorded in the review stamp.
- The phrase "failure-only narration" may legitimately survive where it names the failure/degradation lines themselves; the sweep targets the absolute clean-step-silence rule, not the failure-line convention.

## Original request

backlog overview: replace absolute failure-only narration rule with a bounded allowance, restated per output-emitting step

**Summary:** `overview-mode.md:5` mandates "interstitial status lines render only when a check fails or degrades … A clean step is silent", yet a live overview run emitted 14 interstitial assistant texts of which 13 announced a step running or passing — the rule sat four lines above Step 1 and lost to the model's default progress-narration habit (and to harness-level guidance that encourages brief status notes).

**Kind:** Defect

**Affected component:** `skills/backlog/overview-mode.md` (Failure-only narration banner)

**Objective:** Instruction efficacy

**Repro steps:**
1. Run `/claude-tweaks:backlog overview` on a repo with a populated queue.
2. Count interstitial assistant texts before the report against the banner's rule.

**Expected vs. actual:**
Expected: silent clean steps; narration only on failure/degradation (one legitimate instance observed: a failed variable export).
Actual: 13 of 14 interstitial texts announced progress or success ("Ladder clear…", "201 open records fetched…", "Trust computed…", "All data assembled…").

**Definition:** Stamped (2026-08-17 review). Neither original direction as-is: (a) restate-and-pin alone won't work — a conformance test pins the *prose*, not runtime behavior, and an absolute silence rule fights harness-level guidance that actively tells the model to give brief status updates, so it reliably loses; (b) pure deletion discards the real signal-to-noise intent. Chosen shape: **replace the absolute rule with a bounded allowance** — exactly one opening status line at the start of the run, plus failure/degradation lines as already specified, and nothing else — restated as a one-clause reminder inside each output-emitting step rather than a single banner, and pinned with a conformance test (accepting that the test pins text, not behavior). The convention is backlog-local (only `overview-mode.md`/`refine-mode.md` carry "failure-only narration"), so reshaping it fragments no repo-wide standard; apply the same reshape to `refine-mode.md`'s uses for consistency.

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).
<!-- fingerprint: feedback-bcddf170 -->

