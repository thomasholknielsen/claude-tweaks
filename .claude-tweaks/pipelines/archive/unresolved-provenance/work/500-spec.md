---
record: 500
origin: capture
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 500: Reflect's Friction lens can't see friction from ad-hoc worktree dev sessions

Surface: backend

## Current State

Reflect's Friction lens (`skills/reflect/full-mode.md`'s Friction Lens section) reads a single
input: the run's own `events.jsonl`, which captures hook denials and `AskUserQuestion` stops
during a pipeline run.

Ad-hoc worktree dev sessions — implementing a change directly at the user's request, outside any
`/claude-tweaks:build`/`/claude-tweaks:flow` pipeline — create no run directory until
`/claude-tweaks:wrap-up` runs afterward and creates one for its own reflect pass. Any hook denial
or `AskUserQuestion` stop incurred earlier in such a session, before that run dir existed, has
nowhere to log to. By the time wrap-up's reflect pass reads `events.jsonl`, that friction was never
captured — the lens reports "nothing" not because the session was frictionless, but because there
was no run-scoped log for the friction to land in.

Surfaced by `/claude-tweaks:wrap-up`'s reflect pass on 2026-08-15, during the `/init`
worktree-isolation change (PR #497). Related: #451. Originally classified D5 (upstream) during
reflect, collapsed by the self-reference check since this project IS claude-tweaks, then filed here
since the fix needs a design decision before it's concrete enough to apply as a patch — the two
candidates below were not decided at filing time.

## Deliverables

Close the blind spot so friction incurred during an ad-hoc worktree dev session becomes visible to
a later reflect pass, by implementing one of the two candidate fixes below (or an implementer-chosen
combination) — the choice was left open at filing time and is this record's own design decision:

1. **Transcript fallback.** The Friction lens accepts a session-transcript fallback, for the period
   before wrap-up's own run dir was created, when no run-scoped `events.jsonl` exists yet. Read
   `skills/reflect/full-mode.md`'s Friction Lens section for the exact current read path this
   extends.
2. **Early run-dir stamping.** Ad-hoc worktree dev sessions get a lightweight run dir stamped at
   `EnterWorktree` time (a hooks-layer change, in `bin/lib/hooks/*.js`), so hook events have
   somewhere to land from the start of the session regardless of whether it ever reaches a formal
   pipeline skill.

Whichever is chosen, update `skills/reflect/full-mode.md`'s Friction Lens section to document the
new read path, and record the choice's rationale in the implementing commit/PR since the parent
issue explicitly left it open.

## Acceptance Criteria

- An ad-hoc worktree dev session (not run via `/claude-tweaks:build` or `/claude-tweaks:flow`) that
  incurs at least one hook denial or `AskUserQuestion` stop, followed later by a
  `/claude-tweaks:wrap-up` run's reflect pass, surfaces that friction in the Friction lens's
  output — not "nothing".
- A genuinely frictionless ad-hoc session still reports "nothing" from the Friction lens — the fix
  closes the blind spot without manufacturing false positives.
- Existing formal-pipeline sessions (`/claude-tweaks:build`, `/claude-tweaks:flow`) are unaffected —
  the Friction lens's existing `events.jsonl`-based read path keeps working exactly as before for
  runs that already have a proper run dir from the start.
- `skills/reflect/full-mode.md`'s Friction Lens section documents the chosen approach.
- `npm test` passes, including new coverage for the ad-hoc-session friction-visibility path.

## Technical Approach

- Start from `skills/reflect/full-mode.md`'s Friction Lens section for the current read path and
  exact expectations before choosing between the two candidates.
- If choosing the transcript fallback (candidate 1): identify the session transcript's on-disk path
  and format, and confirm it reliably distinguishes hook-denial/`AskUserQuestion`-stop events from
  unrelated transcript content before relying on it as a data source.
- If choosing early run-dir stamping (candidate 2): read `docs/hooks.md`'s run-dir resolution and
  ownership contract, and `_shared/pipeline-run-dir.md`'s `$RUN_ROOT`/collision rules, before
  touching `bin/lib/hooks/*.js` or `hooks/hooks.json`. Verify a formal pipeline skill starting later
  in the same worktree session adopts the already-stamped run dir rather than creating a duplicate
  or colliding one.
- Either path needs the implementer's explicit choice recorded (not left as a second open question)
  — the parent issue names both candidates precisely so this decision can be made once, at build
  time, with the tradeoffs already laid out.

## Gotchas

- Candidate 2 touches the hooks layer, which is governed by a strict contract (`docs/hooks.md`) —
  read it fully before editing `bin/lib/hooks/*.js` or `hooks/hooks.json`; this is not a casual
  addition.
- A naive early-run-dir approach risks colliding with, or shadowing, a run dir created later by a
  formal pipeline skill in the same session — verify against `_shared/pipeline-run-dir.md`'s
  collision-avoidance rules before landing candidate 2.
- Candidate 1's transcript fallback risks false positives/negatives if the transcript's schema for
  hook-denial/stop events isn't stable — confirm the schema empirically before committing to this
  path, per the `transcript-payload-verification` skill's convention (verify against this session's
  own stored transcript, not a type declaration or doc).
- The record's two-candidate framing is deliberate, not an unresolved gap in the spec — the parent
  issue names both tradeoffs explicitly and defers the pick to implementation time, so "candidate
  not yet chosen" is not itself a placeholder needing further definition.

## Original request

Reflect's Friction lens can't see friction from ad-hoc worktree dev sessions

**Related:** #451

Surfaced by /claude-tweaks:wrap-up's reflect pass (2026-08-15), during the /init worktree-isolation change (PR #497).

## Problem

The Friction lens's input is a run's own `events.jsonl`, but ad-hoc worktree dev sessions (implementing a change directly at the user's request, outside any /claude-tweaks:build|flow pipeline) create no run directory until wrap-up runs afterward. Any hook denials or AskUserQuestion stops incurred during such work are structurally invisible to the Friction lens by the time wrap-up reflects on it — the lens can only ever report "nothing" for this class of session, not because it was frictionless but because there was nowhere for the friction to be logged.

## Candidate fixes (not decided — pick at implementation time)

1. The Friction lens accepts a session-transcript fallback when no run-scoped `events.jsonl` exists for the period before wrap-up's own run dir was created.
2. Ad-hoc worktree dev sessions get a lightweight run dir stamped at `EnterWorktree` time (a hooks-layer change, likely `bin/lib/hooks/*.js`), so hook events have somewhere to land from the start regardless of whether the session ever reaches a formal pipeline skill.

## Origin

Full analysis: `skills/reflect/full-mode.md`'s Friction Lens section. Originally classified D5 (upstream) during reflect, but collapsed by the self-reference check since this project IS claude-tweaks — re-routed to the Skills curation row, then filed here since the fix needs design work before it's concrete enough to apply as a patch.
