---
record: 388
origin: capture
risk: low
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 388: init: policy.yml review should be more verbose, with a skip option

Surface: backend

## Current State

`/init`'s Update Mode Phase 1u.5 only validates specific known-key migrations (Config Home Drift, Renamed Key Drift) — there is no general "here is your current policy, does it look right" pass. The fleet Manifesto (`skills/routine/fleet.md` Step 1) already does this kind of lever walkthrough, but only for its own 5 fleet-relevant keys.

## Deliverables

Add a general `policy.yml` review/validation step to `/init`'s Update Mode:

- Surface every recognized lever in the project's `policy.yml`
- Flag invalid or inconsistent values
- Briefly explain what each lever does (doubles as onboarding for users who have never seen `policy.yml`)
- Provide a skip option so the review doesn't add friction on every run for users who already know their config is fine

## Acceptance Criteria

- `/init` Update Mode gains a policy.yml review pass distinct from the existing known-key-migration checks (Config Home Drift, Renamed Key Drift)
- The review surfaces every recognized lever in `policy.yml`, flags invalid or inconsistent values, and gives a brief explanation of what each lever does
- A skip option exists so the review does not force friction on every run
- Existing Phase 1u.5 known-key migration checks are unaffected

## Technical Approach

Extend `/init`'s Update Mode (`skills/init/update-mode.md`) with a new review step, modeled on the fleet Manifesto's lever walkthrough (`skills/routine/fleet.md` Step 1) but generalized to `policy.yml`'s full schema (`_shared/policy-schema.md`). Read recognized keys from the schema, diff against the project's current `policy.yml`, and render as a batch table with a skip option per this project's interaction-style convention (single `AskUserQuestion`).

## Gotchas

- Don't duplicate Phase 1u.5's known-key migrations — this is a fuller review, not a replacement for it
- The skip option must be genuinely low-friction (one click/answer), not just "type no"

## Original request

init: policy.yml review should be more verbose, with a skip option

**Related:** none

Context: /init's Update Mode Phase 1u.5 only validates specific known-key migrations (Config Home Drift, Renamed Key Drift) — there is no general "here is your current policy, does it look right" pass. The fleet Manifesto (skills/routine/fleet.md Step 1) already does this kind of lever walkthrough, but only for its own 5 fleet-relevant keys.

Scope: Add a general policy.yml review/validation step to /init's Update Mode — surface recognized levers, flag invalid or inconsistent values, briefly explain what each lever does (doubles as onboarding for new users who have never seen policy.yml). Needs a skip option so it does not add friction on every run for users who already know their config is fine.
