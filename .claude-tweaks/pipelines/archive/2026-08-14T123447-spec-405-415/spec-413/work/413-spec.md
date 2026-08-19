---
record: 413
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
blocked-by: [412, 407]
surface: backend
---
# 413: Console execution: reconciler executes answered consoles, live accelerator, consoleAutoResolve

Surface: backend

## Overview

Close the console loop: the reconciler detects answered-but-unexecuted console comments (final "Resolve console" box ticked), executes the approved items, replies to the comment with an execution report, and marks the console resolved. Execution is idempotent via the run dir's `console.json` state marker plus a resolved marker edit on the comment itself, so a live session and a reconciliation racing each other costs nothing — whoever executes first wins, the second is a no-op. In live sessions, `AskUserQuestion` survives as an accelerator: the session renders the console both ways (PR comment + in-session question) and whichever answer arrives first wins. `_shared/autonomy-ceiling.md`'s `consoleAutoResolve` slots in: at `autonomy: unattended`, the reconciler may tick the floor-clearing boxes itself, per that file's existing capability definition.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- No changes to which items are floor-clearing — `_shared/autonomy-ceiling.md`'s definitions are consumed, not edited (beyond wiring the executor as a sanctioned caller).
- No new console content kinds.
- No execution of PR-level decisions (merge/close) — those are GitHub actions the human (or the merge path) performs; the executor handles item ticks only.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| console-on-pr | Console-on-PR render + protocol | ready |
| reconciler-module | Reconciler module | ready |

## Current State

- `{run-dir}/console.json` + the console comment protocol (from the console-on-pr sub-issue): item IDs, resolve checkbox, tick semantics.
- `bin/lib/reconcile/` — the reconciler's per-check structure and idempotence discipline (from the reconciler sub-issue).
- `skills/wrap-up/execution-and-verification.md` — wrap-up Phase 4's execution step: what executing each approved item kind actually does (memory writes, queue-record creation, upstream filing, ledger resolution, cleanup items).
- `skills/_shared/autonomy-ceiling.md` — `consoleAutoResolve` (unattended-only) and the bookkeeping capability model.
- `skills/_shared/auto-decision-log.md` — decisions.md entry format execution must append to.

## Deliverables

- [x] `bin/lib/reconcile/console-execute.js` — detection only, in Node: find non-terminal runs with a rendered console, fetch the comment (gh CLI), parse tick states by item ID, and report answered-but-unexecuted consoles in the reconcile result. Execution happens in the invoking agent session, never in Node.
- [x] Executor wiring: the skill-level trigger points (session-start context, dispatch, tidy) route the reported set through the same procedures `wrap-up/execution-and-verification.md` defines (cited, not restated); declined items log as declined; every action appends its `_shared/auto-decision-log.md` line.
- [x] Pre-execution claim: before executing, the agent writes `console.json.executingAt` + its session id — the check-then-act guard. Write order after execution: reply comment first, then the resolved marker edit. Sanctioned exception to `ctx.ownedRun` write-scoping, recorded in `context.js`.
- [x] Execution report: one reply comment (`<!-- console-item: executed -->`) summarizing per-item outcomes; the console comment gets a resolved marker edit (`<!-- claude-tweaks-console-resolved -->`).
- [x] Idempotence: a second reconciliation (or a live session racing) detects the resolved marker or `console.json.executedAt` and no-ops.
- [x] Live-session accelerator in `wrap-up/review-console.md`: interactive runs still ask via `AskUserQuestion`; on answer, the session executes directly and stamps the same resolved markers so the reconciler skips it; on a reconciler-first race the session detects the marker and reports instead of re-asking.
- [x] `consoleAutoResolve` wiring: at `unattended`, exactly the floor-clearing item kinds `_shared/autonomy-ceiling.md` already enumerates are ticked and executed, logged AUTO.

## Acceptance Criteria

1. Ticking items + resolve box on a parked run's console comment, then running `hooks.js reconcile`, executes the ticked items, posts the execution report, and marks the console resolved — end-to-end on a fixture run.
2. Running reconcile again produces zero writes (idempotence test).
3. Unticked items appear in the report as declined with their decisions.md lines.
4. An interactive wrap-up answering via AskUserQuestion leaves the same resolved markers, and a subsequent reconcile no-ops.
5. At `autonomy: unattended` with `consoleAutoResolve`, a console containing only floor-clearing items resolves with zero human ticks; any non-floor item still waits.
6. `npm test` passes.

## Technical Approach

Parsing ticks: fetch the comment body, match each `<!-- console-item: {id} -->`-adjacent `- [x]`/`- [ ]` row. The executor is judgment-light by design — item execution procedures already exist in wrap-up's Phase 4; this sub-issue routes to them from a different entry point.

### Key Files

- `bin/lib/reconcile/console-execute.js` — new check.
- `skills/wrap-up/review-console.md`, `skills/wrap-up/execution-and-verification.md` — accelerator + entry-point wiring.
- `skills/_shared/autonomy-ceiling.md` — executor named as the consoleAutoResolve mechanism.
- `tests/` — race/idempotence/autoresolve tests.

## Gotchas

- Whoever can edit the comment can approve — GitHub's write-access trust boundary, same as merge; do not build a second authorization layer.
- Checkbox edits have no audit trail beyond comment edit history — accepted residual, stated in the execution report.
- #347's tier semantics compose with this executor — Related; do not pre-implement its `ledgerRouteRemainder`.
- Memory writes and queue writes remain per-item approvals per the auto-mode contract — `consoleAutoResolve` at unattended is the one sanctioned bypass.
- Execution may run in a session that never saw the original run — every needed input must come from `console.json`, `staged/`, and the PR. Re-hash staged files against `console.json`'s recorded `stagedHash` before executing.
- Comment-tick approval covers irreversible item kinds exactly as today's in-session console click does.
