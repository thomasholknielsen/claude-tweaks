---
record: 675
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 675: Curation-engine judges must verify their staged file landed at the anchored stagePath

Surface: backend

## Current State

`skills/wrap-up/curation-engine.md`'s parallel-dispatch rule sends each open registry row to a judge agent whose payload may carry a `stagePath`. In run 2026-08-16T164927's batch curation pass, the Skills judge wrote its staged proposal to the worktree's *relative* shadow of `.claude-tweaks/pipelines/…/staged/` even though the dispatch prompt named the absolute anchored main-checkout path — the exact shadow-copy hazard `_shared/pipeline-run-dir.md`'s Anchoring section exists to prevent — and then, reading that same shadow, misreported the sibling specs' staged files as dangling. The controller caught and relocated the file by an ad-hoc check; nothing in the contract requires that check.

## Deliverables

- [ ] `skills/wrap-up/curation-engine.md`'s dispatch guidance: a judge that stages a finding must, after writing, verify the file exists at the **absolute** anchored path (`test -f`) and echo that absolute path as the payload's `stagePath`; a relative `stagePath` in a payload is a contract violation the controller rejects (re-prompt once, then treat the finding as unstaged and surface it).
- [ ] The consoles' aggregation step (or the engine's own post-fan-out pass) sweeps the current worktree's shadow of the run-dir path for stray staged files after every judged fan-out, relocating and logging any found — routine, not ad-hoc.

## Acceptance Criteria

1. The dispatch-template text contains the self-verification step and the absolute-`stagePath` requirement; `npm test` passes with any conformance pins updated.
2. A staged file deliberately written to the worktree shadow is detected and relocated by the documented sweep (verified by a probe during the build), not by chance inspection.

## Technical Approach

Prose hardening in `curation-engine.md` plus one sweep clause at the console aggregation step; reuses the Anchoring section's `$RUN_ROOT` resolution — no new mechanism.

## Gotchas

- Judges run inside the worktree by necessity (they read and edit repo files), so relative pipeline paths resolving into the shadow is the default failure mode, not agent carelessness — the guard must be structural.
- The materialized `work/` subtree legitimately lives in the worktree; the sweep must target only `staged/` (and `decisions.md`-adjacent state), never `work/`.

## Original request

Curation-engine judges must verify their staged file landed at the anchored stagePath

**Related:** none

Context: In run 2026-08-16T164927's batch curation pass, the Skills judge wrote its staged proposal into the worktree's relative shadow of .claude-tweaks/pipelines/ despite the dispatch prompt naming the absolute anchored main-checkout path, then misreported sibling staged files as dangling.

Scope: curation-engine.md's dispatch template — judge self-verification (test -f on the absolute stagePath, echoed in the payload) plus a console-side sweep of the worktree shadow path after every fan-out.
