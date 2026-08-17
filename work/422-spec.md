---
record: 422
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 422: /claude-tweaks:wrap-up resume's stated precondition doesn't match how a dispatched Task agent actually stops

Surface: backend

## Current State

`plugin/skills/dispatch/settle-and-merge.md` ("Resuming a parked run") and `plugin/skills/wrap-up/SKILL.md` ("Resuming a halted Review Console") both document `/claude-tweaks:wrap-up resume` as the re-entry path for a Review Console a headless dispatch run parked at. But `resume`'s gate requires `run-state.json` `status: interrupted`, which is stamped only on real interruption (Ctrl-C-style). A Task agent following `dispatch/task-prompt.md`'s second-call template ("Do NOT answer the Review Console yourself... stop there") completes its turn *normally*, leaving `status: active` — so `resume`'s precondition can never hold on the exact path those two sections describe. Verified live against #389's parked run: `resume` would have failed; re-invoking wrap-up with the explicit record reference worked, because it re-adopts the same run dir by matching rather than via the `resume` gate.

## Deliverables

- Correct both named sections to document the re-entry path that actually works: re-invoke `/claude-tweaks:wrap-up` with the explicit record reference(s), which re-adopts the parked run dir by matching. State plainly that `resume` does not apply to a console parked by a completed Task turn — its gate is `status: interrupted`, and a normal turn end never stamps that.
- Record the decision this shaping makes: option (a) from the original capture (stamping `interrupted` at the hand-off) is **rejected** because skills write `run-state.json` only through `hooks.js record-worktree`/`close-run` (CLAUDE.md Hooks contract) — a new state-stamping verb is a feature, out of scope for a docs-accuracy bug fix. Note the rejection in the PR description, never as a deferred-work comment left in the files.

## Acceptance Criteria

- Neither section promises `resume` for the Task-agent-parked path (grep for the old `wrap-up resume` promise in both sections returns nothing, output shown); both name the explicit-ref re-invocation.
- `resume`'s own gate documentation is untouched — its semantics stay correct for genuine interruption.
- No behavior, hook, or state-schema change anywhere in the diff (docs-only, diff stat shown).

## Technical Approach

Docs-only edit to the two named sections, wording aligned with what `task-prompt.md`'s second-call template actually produces.

## Gotchas

- If parking-at-console becomes a common headless pattern, a purpose-built parked status (new hooks verb + `resume` gate extension) is a legitimate follow-up **feature** — file it via `/claude-tweaks:capture` then; do not smuggle it into this fix.

## Original request

/claude-tweaks:wrap-up resume's stated precondition doesn't match how a dispatched Task agent actually stops

Title: /claude-tweaks:wrap-up resume's stated precondition doesn't match how a dispatched Task agent actually stops
Type: bug
Labels: none

# Reflect — staged finding 2

**Category:** tangential
**Severity:** med
**Reversibility:** high
**Source:** full mode, lens "Near-misses"
**Causal:** systemic
**Files:** dispatch/settle-and-merge.md, wrap-up/SKILL.md

## Finding

`dispatch/settle-and-merge.md`'s "Resuming a parked run" section and `wrap-up/SKILL.md`'s own
"Resuming a halted Review Console" section both document `/claude-tweaks:wrap-up resume` as the
way to re-enter a Review Console a headless dispatch run parked at. `resume`'s actual gate
requires the run's `run-state.json` to carry `status: interrupted` — which, per this project's own
CLAUDE.md Hooks section, is "stamped only... on interruption" (Ctrl-C-style). A Task-tool subagent
that reaches the Review Console and is instructed to simply stop without answering — exactly what
`dispatch/task-prompt.md`'s second-call template instructs ("Do NOT answer the Review Console
yourself... stop there") — completes its turn normally. That is not an interruption, so
`run-state.json` stays `status: active`, never `interrupted`. Verified directly during this
session: `/claude-tweaks:wrap-up resume` was attempted against record #389's exact parked run and
would have failed the precondition (the run's `run-state.json` read back `{"status":"active",...}`
at that point) — the dispatching session had to fall back to re-invoking wrap-up with the explicit
`#389` record reference instead, which worked by re-adopting the same run dir via matching, not
via `resume`. This is a real gap between the documented resume mechanism and what dispatch's own
documented hand-off (`task-prompt.md`'s second-call template) actually produces on this exact
path — it is not a one-off; any headless dispatch run that parks at the console via that template
will hit the same mismatch.

## Suggested resolution

Either (a) have the hand-off that stops a Task agent at an unanswered Review Console stamp
`run-state.json` as `interrupted` before the agent's turn ends, so `resume`'s existing precondition
starts matching this path, or (b) correct `dispatch/settle-and-merge.md`'s "Resuming a parked run"
and `wrap-up/SKILL.md`'s "Resuming a halted Review Console" sections to stop promising `resume`
works here and instead document the fallback that actually works (re-invoking wrap-up with the
explicit record reference). A human/build session should pick between these — it is a genuine
judgment call, not a mechanical fix.

## Decision-log reference

STAGED (see `## /wrap-up — Phase 1 (ESTABLISH)` in this run's `decisions.md`)
