# 0009. Guided environment creation attaches the caller's real routine, not a throwaway

- **Status:** accepted
- **Date:** 2026-07-31
- **Context:** Cloud Routine Environment Freshness & Per-Project Dedication (`docs/superpowers/specs/2026-07-31-cloud-routine-environment-freshness-design.md`, deleted `70849915`), Task 3 fix round 1

> **Scope note (6.70.0).** A fourth procedure, `Ensure-setup-script`, now exists in
> `guided-environment-creation.md`. It is **not** the fourth procedure rejected under
> "Alternatives considered" below: that one would have *created an environment* with no routine to
> attach, and remains rejected for the reason given. `Ensure-setup-script` creates nothing — it
> opens an environment that already exists and edits its Setup script field, and it targets the
> environment *interactive sessions* use rather than any routine's. Neither the decision nor its
> revisit trigger is affected. Left unedited below on purpose, per `[ADR-0013]`'s superseded-rather-
> than-edited convention.

## Context

No API can create, list, or configure a Claude Code cloud "environment" — it's a human-browser,
web-UI-only action (`RemoteTrigger` is scoped to `/v1/code/triggers` only). A new environment's
`environment_id` is only discoverable by reading it off an *existing* trigger's
`job_config.ccr.environment_id` — there is no "list environments" call. So creating a dedicated
environment for a project that doesn't have one yet requires *some* routine to exist that
references it, purely to make the ID discoverable via `RemoteTrigger get`.

The original design (written before any live browser testing) had the guided-creation browser
flow submit "any minimal routine" after creating the environment — a placeholder, on the
assumption the caller would separately create its real routine afterward via a normal
`/claude-tweaks:routine create` call. This shipped, passed its own task-scoped review, and only
during that same task's mandated live-verification pass (driving the real `claude.ai/code` UI
end-to-end) did the actual consequence become concrete: `RemoteTrigger` has no delete counterpart
(confirmed live, and already documented in `skills/routine/SKILL.md`'s own Anti-Patterns table —
"a mistaken routine runs on a live schedule until manually removed at claude.ai/code/routines").
A placeholder routine created purely to unlock an environment ID would be exactly that mistaken,
undeletable-via-API routine, on every single first-time invocation.

## Decision

The guided-creation Create procedure submits the caller's *actual* routine — its real name,
schedule, and instructions — in the same continuous browser session that creates the environment.
There is no placeholder and no cleanup step. This required the procedure's inputs to grow (it now
takes `routine_name`, `cron_expression`, and `instructions`, not just `project_slug`/`repo_url`),
and required `/claude-tweaks:routine`'s CREATE flow to defer invoking guided creation until *after*
its own schedule-resolution step, so every field the routine needs is already in hand before the
browser session opens.

## Alternatives considered

- **Throwaway routine + automated cleanup** — after discovering the environment ID, delete the
  placeholder routine via the browser's own delete-routine affordance (confirmed live, during this
  same session, that the web UI *does* expose routine deletion — the "no delete API" constraint is
  specific to the `RemoteTrigger` tool, not the UI a human would use manually). Rejected: still
  costs an extra full browser round trip (create-routine, then a second navigate-and-delete pass)
  for zero benefit over folding the real routine into the same flow, and leaves a window where a
  partial failure (environment created, deletion never reached) is a real possibility with no
  automated recovery.
- **A dedicated migration-style "create environment only" mini-procedure** — a fourth procedure
  in `guided-environment-creation.md`, separate from Create, used only when there's no real
  routine to attach (`/init`'s Update Mode migration path, which re-points *existing* routines and
  has none new to create). Not needed: the Re-point procedure already opens an existing routine's
  own Environment combobox, which exposes the identical "+ Add environment" affordance Create
  uses — extending Re-point with an optional `create_if_missing` flag reused that existing flow
  instead of inventing a parallel one, with zero throwaway routine in either case.

## Consequences

**Makes easy:** every guided-creation invocation — first-time project setup and existing-project
migration alike — now creates exactly the infrastructure the caller actually wants, with no
orphaned, schedule-bearing routine left behind on any success path.

**Makes hard:** the guided-creation Create procedure can no longer run standalone with only
`project_slug`/`repo_url` — every caller must resolve the routine's own name, schedule, and
instructions *before* invoking it, which is why `/claude-tweaks:routine`'s CREATE flow had to
defer the guided-creation call from Step 4 (environment resolution) to Step 8 (after schedule
resolution), threaded through a `NEEDS_GUIDED_CREATION` flag. A future caller of this procedure
that doesn't already have a concrete routine to create (not just an environment) cannot use it
directly.

**Would force a revisit:** if `RemoteTrigger` ever gains a delete action, or if a future call site
needs to create an environment with genuinely no routine to attach (and Re-point's
`create_if_missing` extension doesn't fit that site's own shape), the throwaway-plus-cleanup
alternative above becomes viable again and worth reconsidering.
