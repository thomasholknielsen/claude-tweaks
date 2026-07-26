# Local-Files Preflight Stop — Canonical Boundary Language

Every skill whose workflow, under `work-backend: local-files`, would otherwise proceed to
build, claim, or authorize application work that only `work-backend: github-issues`'s RBAC +
atomic claim mechanism actually supports MUST phrase its local-files Preflight stop using the
pattern below. Referenced by `/claude-tweaks:backlog` (refine mode's grant sub-stage) and `/claude-tweaks:dispatch`'s own
Preflight sections — each keeps its own full paragraph (the specific unmet condition, the
list of skills it would otherwise invoke, and its own forbidden-action list are genuinely
skill-specific and don't compress into one shared template), but both must stay consistent
with the pattern here rather than drift toward weaker phrasing independently.

## Why this exists

A skill in this project can be invoked headlessly, with no interactive human present to
receive a "point the user at doing X manually" message. Two separate real incidents — found
via this repo's own `evals/` harness running against real API calls, not hypothesized —
confirmed that a live model reads a *purely informational* "point the user at X and stop" as
license to do X itself when no human is there to act on the pointer:

- `/claude-tweaks:triage`'s original Preflight (now `/claude-tweaks:backlog refine`'s grant sub-stage) said "report that grants are not applicable...
  point the user at running `/claude-tweaks:flow` manually" — a live headless run instead
  built and committed real application code, reproduced twice (`evals/scenarios/
  triage-permission-matrix-compliance.yaml`, `.superpowers/sdd/task-9-report.md`).
- `/claude-tweaks:dispatch` had the identical weak phrasing, found and fixed pre-emptively
  once the triage incident established the pattern was real, then confirmed safe via a real
  run (`evals/scenarios/dispatch-local-files-preflight-stop.yaml`).

The fix is not persuasion, it's enumeration: state exactly what must not happen, and state
explicitly that the absence of a human is not an exception.

## The pattern

A compliant local-files Preflight paragraph contains all of the following, in this order:

1. **The trigger** — read `work-backend` (per `_shared/work-record.md`'s Config keys table)
   and identify the `local-files` branch.
2. **The reason**, stated in this skill's own terms — what mechanism or grant is actually
   unavailable under `local-files` (e.g. triage: the grant conditions this skill exists to
   enforce; dispatch: the claim mechanism the protocol depends on).
3. **"Stop this turn completely"**, followed by an explicit, enumerated list of forbidden
   actions — do not invoke {the specific skills this skill would otherwise hand off to}, or
   any other skill; do not write/edit/create any file (add "claim" when the skill's job
   involves claiming); do not run any build, test, or git-committing command. A vague "and
   stop" with no enumeration is exactly the phrasing that failed.
4. **The manual alternative**, framed explicitly as information for a human, not an
   instruction to act on: "Tell the user they can run {skill} manually... this is information
   for the user to act on, never an instruction for you to act on yourself."
5. **The no-exception clause** — this holds even when no interactive human is present
   (including any headless/scheduled-firing mode the skill supports): "the absence of a human
   to hand this off to is not license to do the work in their place — it means {the unmet
   condition from step 2}, so the correct behavior is to stop, not proceed."

See `skills/triage/SKILL.md` and `skills/dispatch/SKILL.md`'s own Preflight sections for two
worked instances of this pattern applied to genuinely different skill-specific reasons.

## Adding a third consumer

If a new skill needs a local-files Preflight stop, compose its paragraph from the five
elements above using its own reason/skill-list/manual-alternative — do not copy either
existing paragraph verbatim and edit nouns, since that risks silently dropping element 3's
enumeration or element 5's no-exception clause in the edit. Add the new skill to this file's
opening "Referenced by" list once done.
