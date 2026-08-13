# Skill-Invocation Ledger, Run-Integrity Detection, and Teardown Gate — Design

**Date:** 2026-08-13
**Origin:** #364 (flow/wrap-up: no runtime check that a pipeline run's own wrap-up actually executed), generalized per brainstorming to the pipeline-audit skill family.
**Related incidents:** `[IL-116]` (worktree torn down directly, skipping cleanup procedure), `[IL-45]` (content-identity merge check).

## Problem

The plugin assumes its lifecycle skills are invoked via the Skill tool, but an agent can read a SKILL.md's documented intent and manually execute equivalent actions — write the code, run the tests, merge the PR — without ever calling the tool. When that happens, none of the hook-driven audit trail fires: `run-state.json` stays `"active"`, the worktree stays registered, the ledger's resolve gate never runs, and a hand-written `decisions.md` entry can mimic the real audit trail's shape without going through the mechanism that produces it. Nothing detects or surfaces the drift; #364's run was discovered only by manual hook-state inspection after the PR had already merged.

The ambition (stated during brainstorming): skill invocation should be as dependable as a function call. Detection is the starting point; prevention is folded into this same work. Automatic reconciliation is deliberately **not** in scope — it treats the symptom (dirty bookkeeping) rather than the cause (the procedure being bypassed).

**Scope:** the pipeline-audit family — the skills whose state lives in `run-state.json`, `decisions.md`, and the ledger (`build`, `test`, `review`, `wrap-up`, `specify`, `flow`, `ledger`, and flow's polish stage). Not the whole skill graph; not one-shot skills like `/capture` that carry no hook state.

## Component 1 — Skill-invocation ledger (mechanism)

New `PostToolUse` matcher block in `hooks/hooks.json` for `"Skill"` (confirmed hookable — the harness treats `Skill` like any other tool name in matchers), routed through the existing dispatcher to a new module `bin/lib/hooks/skill-invocation.js`.

On each Skill-tool call, the module resolves the active run exactly the way every other hook does (`context.js`'s `resolveRun`, ownership rules included — writes go through `ctx.ownedRun` semantics like every other event write) and appends one typed event to the run's existing `events.jsonl`:

```json
{"type": "skill_invoked", "skill": "claude-tweaks:wrap-up", "ts": "..."}
```

Design decisions, each deliberate:

- **No allowlist in the hook.** Every Skill invocation is logged, unfiltered; filtering to "expected pipeline skills" happens at read time in the detection layer. A skill allowlist inside hook code is the restated-list-goes-stale failure `[IL-93]` exists for — every new pipeline skill would need a hook-code edit nobody would remember. Append-only events are cheap.
- **One event, not a pre/post pair.** `PostToolUse` for Skill fires when the *tool call* returns — immediately, before the skill's instructions have executed. A pre/post pair would imply completion-bracketing semantics the mechanism does not have. The single event means exactly "the procedure was entered," nothing more. `PostToolUse` (not `PreToolUse`) so that a denied or failed tool call does not log a false entry.
- **Reuses existing infrastructure.** Run resolution, the append-only event log, and ownership-scoped writes all exist. No new file, no new state machine — one more event type in a log built for exactly this purpose.

### Stated boundaries (not solved problems)

- **Subagent visibility is unconfirmed.** Whether a Task-dispatched subagent's internal Skill-tool call fires the parent session's hooks is undocumented and likely isolated. SDD/dispatch route real pipeline work through subagents, so this ledger reliably proves *top-level* invocations (the ones `/flow` makes in the orchestrating session) — which is #364's actual failure mode (the top-level wrap-up invocation never happened at all). It does not prove every nested step ran faithfully.
- **Standalone-wrap-up ordering hole.** Standalone `/wrap-up` creates its own run dir at Phase 1 — *after* its `skill_invoked` event fires — so that event resolves no run and is dropped. Acceptable: the teardown gate (Component 3) only ever evaluates flow-parented runs, where the run dir pre-exists the wrap-up invocation.

## Component 2 — Run-integrity detection

New module `bin/lib/hooks/run-integrity.js` exporting `checkRunIntegrity(runDir)`. It reads the run's `run-state.json` (status, worktree assignment) and `events.jsonl` (the new `skill_invoked` events plus the git commit/push events already logged), and cross-references ground truth: has the run's branch actually merged or been deleted — the same content-identity check `[IL-45]` already uses (`HEAD` reachable from / identical to the integration branch tip).

Two distinguishable states per non-terminal run (a deliberate cut from three — see Rejected below):

1. **In progress, no drift** — non-terminal status, no shipped signal. What the SessionStart scan already reports today; unchanged.
2. **Shipped but never closed** — ground truth shows the branch merged/gone, `run-state.json` is still non-terminal, and the ledger shows no `skill_invoked` for wrap-up. #364's exact scenario, now mechanically distinguishable from "still working on it."

**Surfacing: no new UI surface.** The existing SessionStart unfinished-runs scan (`session-start.js`) gains the ground-truth dimension, so its message can say "shipped but never closed — wrap-up appears to have been bypassed; run `/claude-tweaks:wrap-up` or `close-run`" instead of `status: unknown`. No standalone doctor command — a second surface would be a second place to drift.

## Component 3 — Teardown gate (prevention)

The hard-to-reverse action worth gating is worktree teardown — literally `[IL-116]`'s burned incident. New `PreToolUse` check in `pre-tool-use.js`, **block tier** (deny), same posture as the existing `worktree.always` gate:

> **Deny tearing down a worktree that is still assigned to a non-terminal run.**

Matching surface: a new `hooks.json` matcher for the `ExitWorktree` tool, plus `Bash(git worktree *)` (neither is currently matched). The gate resolves the target path against recorded worktree assignments in run-state files; a worktree assigned to a run whose status is not `clean` is denied, with the deny message pointing at `cleanup-procedures.md` Section C (the documented sequence whose Transitional guard the direct teardown would skip).

Honest limits, established during brainstorming and kept deliberately:

- **`close-run` remains an escape hatch, by design.** `close-run` clears the worktree assignment, after which the gate resolves nothing and fails open ("ambiguity resolves to allow"). Making the gate stricter — requiring a wrap-up `skill_invoked` event even for `clean` runs — would break a legitimate documented path: `/dispatch`'s auto-merge gate calls `close-run` before merging, and dispatch's wrap-up stage runs inside Task subagents, exactly where Skill-hook visibility is unconfirmed. A hard requirement there would false-positive-block correct behavior.
- **The shortcut case degrades to warn, at the right chokepoint.** `close-run` itself (in `hooks.js`) gains a warn-tier check: when called on a run whose `events.jsonl` contains no `skill_invoked` for wrap-up, it still closes the run but emits a non-blocking systemMessage and logs a `close-without-wrapup` event. Detection where prevention would false-positive.
- **Fail-open rules unchanged.** A recorded worktree path that no longer exists, missing run-state, or unresolvable ownership all resolve to allow, consistent with every existing hook.

Gate documentation follows the existing pattern: coverage stated once, in a sibling coverage block next to `worktree.always`'s in `_shared/policy-schema.md`, pinned by the `GATE_COVERAGE` mechanism in `tests/hooks-gate-coverage.test.js` — not restated across files.

## Rejected alternatives

- **Ground-truth-only reconciliation (no ledger):** simpler, but reactive-only — structurally cannot observe anything before a terminal git event, so it can never approach the "dependable as a function call" ambition. Dead end.
- **Automatic reconciliation as the primary response:** treats the symptom; explicitly deprioritized by the user.
- **Skill allowlist in the hook / pre+post event pair / mid-chain-gap detection state:** each cut during design review — the allowlist drifts (`[IL-93]`), the pair implies false completion semantics, and the mid-chain state requires an expected-stage-chain model (which stages were configured, conditional polish, review-effort variation) that is speculative with no incident behind it. The third state can return when a real incident motivates it.
- **Gating `git push`/merge or SessionEnd:** push/merge collides with dispatch's documented `close-run`-before-merge path; SessionEnd hooks cannot deny (the session is already ending — that case is covered by the next SessionStart scan).

## Testing

- `skill-invocation.js` and the gate extension pass the garbage-stdin invariant in `tests/hooks-dispatcher.test.js` (every path exits 0).
- Unit tests for `run-integrity.js`: each of the two states, plus fail-open cases (missing run-state, missing branch, no ledger events).
- Gate tests extend `tests/hooks-gate-coverage.test.js`'s coverage-pinning pattern; deny/allow matrix including the `close-run`-then-teardown sequence (must allow) and non-terminal teardown (must deny).
- `close-run` warn path: close with and without a wrap-up `skill_invoked` event present.
- Per `[IL-122]`: fixture events/SHAs match real shapes (full ISO timestamps, real skill identifiers), so tests fail for the right reason.

## Out of scope / follow-ups

- Nested/subagent Skill-call visibility: needs empirical validation; if subagent calls turn out to fire parent hooks, the ledger silently gets richer with no design change.
- Mid-chain stage-skip detection (the cut third state).
- Whole-skill-graph coverage beyond the pipeline-audit family.
