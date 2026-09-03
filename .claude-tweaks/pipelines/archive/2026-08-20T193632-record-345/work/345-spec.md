---
record: 345
origin: human
risk: low
size: low
ceremony: standard
grants: [build]
surface: backend
---
# 345: init: Step 14 offers dedicated cloud-environment creation even when Step 15 routines are declined

Surface: backend

## Current State

`/init`'s Step 14 (Cloud/Routine Parity Setup, `skills/init/bootstrap/step-14-cloud-routine-parity.md`) runs before Step 15 (Routine Installation, `skills/init/bootstrap/step-15-routine-installation.md`) specifically so Step 15's own environment resolution can reuse whatever Step 14 already provisioned. Step 14's "Offer to apply the Setup script to a dedicated project environment" section unconditionally presents an `AskUserQuestion` with "apply it now via the browser" as the Recommended option, immediately after writing `scripts/claude-cloud-setup.sh` — before Step 15 has run and before it's known whether the user will select any routines at all.

A dedicated `claude-tweaks: <repo>` environment exists primarily to give scheduled Routines a stable, reusable place to run; an interactive cloud session doesn't need a *dedicated* environment the same way. When a user runs `/init` on a project with a GitHub remote but no interest in scheduled Routines, and then declines every candidate in Step 15's multiSelect picklist (selects "none" for every routine), Step 14 has already steered them — earlier in the same `/init` pass — toward creating an environment whose main justification (Routines) they were about to decline. Observed directly: a user who selected zero routines in Step 15 explicitly said, after the fact, "no need to create the cloud env since we are not creating any routines."

## Deliverables

- Change Step 14's environment-creation offer so it no longer defaults to "create now" when the same `/init` invocation is about to (or already has) decline all routines in Step 15 — one of two directions is acceptable per the issue's own ordering note:
  1. Defer the environment-creation sub-offer until after Step 15's selection is known, re-framing or skipping it when the selection is empty, or
  2. Reframe Step 14's own offer/recommended-option wording so it doesn't presuppose Routines are wanted, without changing when it runs.
- Preserve Step 14's existing behavior for the case where at least one Routine is intended (the common Step 15 outcome) — no behavior change there.
- Preserve Step 15's ordering dependency on Step 14 (Step 15 reuses whatever environment Step 14 already resolved/created) for any path where Step 14 still creates an environment.

## Acceptance Criteria

- On an `/init` run where Step 15's routine picklist ends with zero routines selected, Step 14's environment-creation offer no longer defaults to "create now" as the unconditional Recommended option in that scenario.
- On an `/init` run where Step 15's routine picklist ends with one or more routines selected, Step 14's current behavior (offer to create now, Recommended) is unchanged.
- Step 15's reuse of Step 14's already-created environment (when one was created) continues to work unmodified.
- `skills/init/bootstrap/step-14-cloud-routine-parity.md` and `skills/init/bootstrap/step-15-routine-installation.md` are updated consistently — the two files' descriptions of their own ordering and interaction don't contradict each other after the fix.

## Technical Approach

Per the issue's own ordering note, this cannot be solved by "check whether Step 15 already ran" as a precondition inside Step 14, because Step 14 runs first. Two concrete directions, either acceptable:

1. Defer Step 14's "apply the Setup script to a dedicated environment now via browser" `AskUserQuestion` until after Step 15's routine selection is known — i.e., move (or duplicate behind a routing flag) that specific sub-offer to run after Step 15, while Step 14 still writes `scripts/claude-cloud-setup.sh` and handles the `.claude/settings.json` declarations at its current position. Step 15's own "Resolve environment where possible" step would need to account for an environment that may not exist yet at the point it runs.
2. Leave Step 14's position unchanged, but change the `AskUserQuestion`'s recommended option and/or wording so it doesn't presuppose Routines are wanted — e.g., default to "print the line for manual setup" when no routine intent is yet known, or note that a dedicated environment is optional for interactive-only use.

## Gotchas

- Step 14 is documented as running before Step 15 specifically so Step 15's own environment resolution can reuse whatever Step 14 already set up (`step-14-cloud-routine-parity.md`'s "Offer to apply..." paragraph, and `step-15-routine-installation.md`'s "Resolve environment where possible" step). Any fix that defers Step 14's offer must not break that reuse path for the case where routines ARE selected.
- Step 15's `--defaults` path for the *first* selected candidate explicitly falls through to guided environment creation when no cached/resolved environment exists — a fix that defers Step 14's offer entirely (rather than reframing it) could shift the environment-creation onus onto Step 15's own fallback path instead of removing it, which may or may not be the desired outcome; worth confirming which failure mode this issue actually wants eliminated (creating an environment at all when no routines are wanted, vs. Step 14 in particular being the one asking).

## Original request

init: Step 14 offers dedicated cloud-environment creation even when Step 15 routines are declined

**Summary:** `/init` Step 14 (Cloud/Routine Parity Setup) offers to create a dedicated cloud environment even when the same `/init` run's Step 15 (Routine Installation) ends with zero routines selected.

**Kind:** Gap

**Affected component:** `skills/init/bootstrap/step-14-cloud-routine-parity.md` and its interaction with `step-15-routine-installation.md`

**Use case:** Running `/init` fresh on a project with a GitHub-flavored remote and no interest in scheduled Routines. In Step 15's multiSelect picklist, the user selected "none" for every candidate routine. Step 14 still unconditionally presented the "apply Setup script to a dedicated environment now via browser" offer as the recommended action. A dedicated `claude-tweaks: <repo>` environment is motivated primarily by giving scheduled Routines a stable, reusable place to run — interactive cloud sessions don't need a *dedicated* environment the same way. When the user has already signaled (in the same `/init` invocation) that no routines are wanted, defaulting to "create the environment now" is avoidable friction. The user's own words when declining: "no need to create the cloud env since we are not creating any routines."

**Suggested fix:** When Step 15's routine selection is known to be empty for this invocation, either skip Step 14's "apply now via browser" offer and fall straight through to printing the manual Setup-script line, or reframe the offer's recommended option to acknowledge that declining all routines removes most of the motivation for provisioning a dedicated environment right now.

**Ordering note:** Step 14 is documented as running before Step 15 specifically so Step 15's own environment resolution can reuse whatever Step 14 already set up. That means this can't simply be "check whether Step 15 already ran" — a fix likely needs either deferring the environment-creation sub-offer until after Step 15's selection is known, or changing the default framing so it doesn't presuppose Routines are wanted.

**Plugin version:** 6.79.0

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: feedback-a05630a8 -->

