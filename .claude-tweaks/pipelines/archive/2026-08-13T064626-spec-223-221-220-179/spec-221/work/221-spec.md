---
record: 221
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
fingerprint: 2026-08-08-model-profile-strategy:frontier-self-improvement-singletons-wrap-up-reflect-feedbac
blocked-by: [216]
surface: skills
---
# 221: Frontier self-improvement singletons: wrap-up, reflect, feedback, init

Surface: skills
Parent: #215

Blocked by #216: assumes resolve() exposes the Frontier preconditions, degradation sources, and run-dir cap tally these dispatched singletons rely on

## Overview

Give the plugin's **self-improvement surfaces** — the highest-leverage judgment steps, whose output compounds across every future session — a Frontier (Fable) execution path: `/wrap-up`'s learning capture and skill updates, `/reflect`'s synthesis, `/feedback`'s scrub judgment, and `/init`'s harness generation. Each becomes a dispatched **singleton** whose input is the run's artifacts assembled by the main thread per the Subagent Contract's input discipline — never a conversation-inheriting fork (IL-07). **The singleton-dispatch structure applies in every context; only the resolved model differs**: interactive runs at Frontier when the resolver permits, everything else (unattended runs, economy stance, cap exhausted) at Capable via the resolver's degradation. This covers `/dispatch`'s headless routine unit, whose pipelines end in wrap-up — those runs dispatch the same singleton at Capable.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- Verdict-gate slots (#220).
- Changing what these skills *conclude* — only where their judgment step executes and at what capability.
- Health sweeps: they stay Standard (parent's Decision Rationale).

## Current State

Resolver claims below are **expected per #216's design, re-verified against its landed text as the first task**.

- `/wrap-up` (`skills/wrap-up/SKILL.md` + sub-files `review-console.md`, `cleanup-procedures.md` — read before editing to locate the step): learning capture + skill updates run in the main thread; run artifacts exist in the run dir (`decisions.md`, `events.jsonl`, ledger) and git log.
- `/reflect` (`skills/reflect/SKILL.md`): lens synthesis in the main thread; invoked standalone or as a component by `/review`/`/wrap-up` (Component-Skill Contract with `$PIPELINE_RUN_DIR` + `--source` as documented signals).
- `/feedback` (`skills/feedback/SKILL.md`): scrub judgment main-thread; **typically invoked standalone with no run dir** — its dispatch uses the contract's 1-per-invocation rule, not `--run-dir`.
- `/init` (`skills/init/SKILL.md`): already dispatches Standard analysis agents (~265, 291 — the ~5x fan-out cost rationale there still holds and is untouched).
- After #216: `bin/resolve-profile.js` with `--run-dir`/`--unattended`; degradation sources; Frontier cap (`frontier-run-cap`, default 3).

## Deliverables

- [ ] **First task: re-read #216's landed resolver CLI and contract rules**; every dispatch below then names the exact landed invocation (IL-102 — "gather the run artifacts" without named paths and commands is the no-mechanism shape).
- [ ] `/wrap-up`: the learning-capture/skill-update judgment step becomes one `[Use: Frontier]` singleton dispatch — main thread assembles the artifact bundle (named paths: the run dir's `decisions.md`, `events.jsonl`, the ledger file, `git log` for the run's commits, and diffs of any skill files proposed for edit), dispatches with the step-specific output template below, integrates in the main thread. **The proposal output shape is fixed here:** the singleton returns, per proposed edit, a block of `path` + verbatim before-excerpt + verbatim after-text + one-line rationale — mechanically appliable via Edit by the main thread, which owns all writes and commits. This step runs before any worktree teardown, while the run dir still resolves.
- [ ] `/reflect`: same pattern when invoked **standalone**. When invoked as a component (`--source <parent>` present, or `$PIPELINE_RUN_DIR` set by a parent that dispatches its own singleton), `/reflect` never dispatches — **the rule is: component-invoked ⇒ no dispatch, standalone ⇒ dispatch.** This uses only the two documented CSC signals; no new flag is invented, and it structurally prevents double-dispatch without needing a "parent already dispatched" marker.
- [ ] `/feedback`: the scrub judgment as a singleton (1-per-invocation rule; filing and confirmation stay main-thread and human-gated).
- [ ] `/init`: the CLAUDE.md-generation/synthesis step becomes the same singleton structure; the resolver's `--unattended` gate handles Routine contexts (degrading to Capable) — no init-specific interactivity check is added, the resolver rule is the single mechanism.
- [ ] Each of the four tasks **authors its own step-specific output template inline in its skill** (per the contract's inline-verbatim rule; wrap-up's is the proposal shape above; the other three define theirs as part of their task).
- [ ] `docs/skill-graph.md`: edges for the new dispatch relationships.

## Acceptance Criteria

1. Each of the four skills contains exactly one Frontier-eligible dispatch site, structured as artifact-bundle assembly → singleton dispatch → main-thread integration; no skill dispatches it in a loop or parallel batch.
2. Every dispatch prompt template names its exact artifact paths and carries its inlined output template; none references conversation history.
3. The dispatch step's structure never branches on the resolved model — degradation is invisible except in the resolver's logged `source`.
4. `/reflect`'s component-invocation rule is stated in its Component-Skill Contract paragraph using the documented signals; a `/wrap-up`-invoked `/reflect` produces zero dispatches of its own.
5. `docs/skill-graph.md` names every new edge; no user-facing grammar changes (README//help untouched).

## Technical Approach

### Key Files

- `skills/wrap-up/SKILL.md` (+ sub-files as located), `skills/reflect/SKILL.md`, `skills/feedback/SKILL.md`, `skills/init/SKILL.md`
- `docs/skill-graph.md`

## Gotchas

- **The singleton judges; the main thread writes.** Proposals are applied and committed by the main thread so wrong-checkout hooks and git discipline stay in one place.
- Open record #179 also edits `docs/skill-graph.md` (different edges) — trivial merge risk; check its state at build start.
- `/wrap-up` post-teardown constraint (project memory): the dispatch must precede worktree teardown, while the run dir resolves — stated in the deliverable, restated here because it is the step's one ordering hazard.


<!-- work-fingerprint: 2026-08-08-model-profile-strategy:frontier-self-improvement-singletons-wrap-up-reflect-feedbac -->
