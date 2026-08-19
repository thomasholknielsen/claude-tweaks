---
record: 408
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
blocked-by: [407]
surface: backend
---
# 408: Reconciler trigger wiring: session start, queue pull, routine preambles, tidy, worktree setup

Surface: backend

## Overview

Wire the reconciler into every shared-state read point, making catch-up rigorous by construction: `session-start.js` calls it natively (absorbing today's reaper block); `/claude-tweaks:dispatch`'s queue pull runs it first; Routine prompt preambles include it; `/claude-tweaks:tidy`'s scan runs it before reading state; and `_shared/worktree-setup.md`'s post-creation catch-up becomes a citation of the same helper instead of prose. This generalizes and retires the narrow #190 fix in `routine/record-freshness.md` (which pulls only `.claude-tweaks/routines/` freshness) — the whole checkout is current at every trigger point, so stale-checkout phantom-drift bugs stop being per-skill patches.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- No reconciler behavior changes — the module ships in its own sub-issue; this wires call sites only.
- No console execution wiring — separate sub-issue.
- No new trigger points beyond the five named above.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| reconciler-module | Reconciler module | ready |

## Current State

- `bin/lib/hooks/session-start.js` — deps check, stale-run detection, worktree-reaper block (the ordering comment says stale-runs must run before the reaper), `worktree.always` nudge.
- `skills/dispatch/SKILL.md` Step 2 — queue pull via `dispatch/queue-pull-script.md`.
- `skills/routine/record-freshness.md` — the #190 fix: fetch-then-compare for routine records, with its `git pull --ff-only` recovery instruction.
- `skills/tidy/scan-procedures.md` — Step 4.5 git audit; `skills/tidy/SKILL.md` step table.
- `skills/_shared/worktree-setup.md` — post-creation catch-up (unconditional both-direction merge), cited by `build/worktree-setup.md` Common Step 4.
- `skills/routine/` routine templates carry a prompt preamble (self-heal per #260).

## Deliverables

- [x] `session-start.js` calls the reconciler in-process — the same exported `reconcile()` the CLI verb wraps (the module ships both surfaces with a parity test; verify that shipped before wiring — this sub-issue adds no reconciler behavior). The integrity-scan-before-reap ordering moves inside the module and is asserted by a test, not a comment. Existing additionalContext output shapes are kept, plus one added summary line when anything changed — an addition within the existing shape, not a reshape. local-merge projects keep the existing ancestry-based reap via the module's fallback.
- [x] `dispatch/SKILL.md` queue pull: `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" reconcile` as the step's first action, result logged to the run's decisions.md.
- [x] Routine template preamble: one reconcile line before the skill invocation in every template `_shared/routine-template-schema.md` governs (dispatch's `routine-template.yml` and the health sweeps'), same diagnosable-failure posture as the #260 self-heal preamble. Future instantiations only — already-live Routines pick it up at their next `/claude-tweaks:routine update`; no forced re-sync deliverable.
- [x] `tidy/scan-procedures.md`: reconcile before Step 4.5's git audit, so the audit reads converged state instead of re-deriving merged-branch findings the reconciler already acted on.
- [x] `_shared/worktree-setup.md` post-creation catch-up: cite the reconciler for the fetch/ff of the integration branch, keeping the worktree-local `git merge origin/{branch}` step (the reconciler converges the mirror, not a feature branch).
- [x] Retire `routine/record-freshness.md`'s fetch/behind-derivation block — the block containing its `git fetch` instruction and the `{behind}` count computation — in favor of the reconcile call; its disposition logic (the Step F3 stop tables) survives unchanged. Add a pointer noting the generalization.

## Acceptance Criteria

1. A session starting in a checkout strictly behind origin gets its integration branch fast-forwarded before the SessionStart additionalContext renders, and the context includes a one-line reconcile summary when anything changed.
2. `grep -rn "reconcile" skills/dispatch/SKILL.md skills/tidy/scan-procedures.md skills/_shared/worktree-setup.md skills/dispatch/routine-template.yml` — plus each health-sweep routine template — shows the wiring at every named point, each citing the verb rather than restating ff rules. Every wiring deliverable has a verifying grep.
3. `routine/record-freshness.md` no longer contains its own `git fetch` instruction (control grep confirms) and cites the reconcile step instead.
4. `npm test` passes; the session-start module still satisfies the dispatcher garbage-stdin invariant and its existing tests (updated for the module call).

## Technical Approach

Session-start absorbs the module natively (in-process call, no subprocess); skill files invoke the verb — both are the same exported function, so the surfaces cannot diverge. Every wiring point states behavior by citation to the reconciler, never by restating ff/reap rules — one implementation, no prose drift. SessionStart latency matters: the fetch runs under the module's exported 5s timeout constant (a reconciler-module deliverable — cite it, don't redefine it) and degrades to skipped-unverifiable, never delaying session start on a dead network.

### Key Files

- `bin/lib/hooks/session-start.js` — module call replacing the reaper block.
- `skills/dispatch/SKILL.md` — queue-pull step.
- `skills/routine/*.yml` / routine template files — preamble line.
- `skills/routine/record-freshness.md` — de-duplication.
- `skills/tidy/scan-procedures.md`, `skills/_shared/worktree-setup.md` — citations.
- `tests/` — session-start tests updated.

## Gotchas

- Never break a session: every session-start path exits 0; the reconcile call inherits that posture (module call inside try/catch like every existing block).
- The stale-runs-before-reaper ordering in session-start.js is load-bearing (branch derivation breaks after reaping) — preserve it around the module call.
- #381 (coalesce redundant git spawns in SessionStart) and #137 (report resolved build from SessionStart) touch the same file — Related, land independently; keep this change surgical.
- A skill reference in actionable instruction text must use the fully-qualified `/claude-tweaks:{skill}` form.
- Skill files reach subagents only via inlined prompt content — dispatch's queue-pull wiring must put the reconcile command in the dispatching session's own step, not in a Task prompt where the subagent's cwd-pinning makes main-checkout convergence meaningless.
- Dispatch itself runs from a worktree under `worktree.always`; the reconcile verb converges the *main checkout's* mirror via `mainCheckoutRoot` resolution (the same resolution `session-start.js` documents), so invoking it from the worktree still has the intended effect.
- Tidy Step 4.5's own audit logic is untouched — it simply runs after reconcile; trimming its now-redundant findings is explicitly out of scope.
