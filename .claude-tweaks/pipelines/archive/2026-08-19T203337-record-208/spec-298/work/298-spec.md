---
record: 298
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 298: Dispatch: first-call-failure teardown hits the ledger's headless nothing-left-behind gate

Surface: backend

## Current State

- `/claude-tweaks:dispatch` Step 5 dispatches each group as two sequential `Task()` calls (refs #296, `skills/dispatch/two-call-gate.md`): `build,test` first, then `review,polish,wrap-up`.
- When the **first** call fails a HARD-GATE, the second call is never dispatched. Worktree teardown must still route through `wrap-up`'s cleanup (`[IL-116]` forbids `ExitWorktree` / raw `git worktree remove` on a pipeline-run worktree — it skips `skills/wrap-up/cleanup-procedures.md` Section C step 3.5's transitional guard and can permanently destroy a pre-anchoring run's `config.yml`/`decisions.md`/`staged/`). So the dispatching session makes one further call purely to reach that cleanup route:

  ```
  PIPELINE_RUN_DIR="{run-dir}" CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow {target} wrap-up
  ```

- `wrap-up` being in that step list is exactly the condition `skills/flow/SKILL.md` Step 5's nothing-left-behind ledger gate fires on (scoped to "`wrap-up` in the resolved step list" by #296's Critical 2 fix — see `skills/flow/steps-and-gates.md`'s "Partial step lists" section, which only skips the gate when `wrap-up` is *absent* from the list).
- The ledger gate's Phase 2 requires per-item human input and is explicitly on `skills/_shared/auto-mode-contract.md`'s "what auto never silences" list. `skills/_shared/unattended-tier.md`'s Phase 2 narrowing (default `off`) only auto-routes items whose blocker reason clears the floor rule, and only to a single disposition (`Route to a record -> Keep (backlog)`) — every other disposition, and every item whose reason misses the floor, still needs a human.
- Net effect: a headless `/claude-tweaks:dispatch next` firing (scheduled Routine, nobody present) whose first Task call fails `build`/`test` can stall on this unanswerable gate. The worktree then survives until the `SessionStart` reaper collects it, and the firing's report is worse than it needs to be. This is the ordinary failure path, not an edge case.
- Documented today as an accepted, tracked risk in `skills/dispatch/two-call-gate.md` §5, with two fix directions on the table, not yet traded off: (1) widen `unattended-tier`'s `ledgerNarrowing` scope for this specific context, or (2) a dedicated cleanup-only `/flow` entry point that reaches `wrap-up`'s cleanup procedures without running Step 5's ledger gate at all.

## Deliverables

- [ ] A new `cleanup-only` flag on `/claude-tweaks:flow`, documented in `skills/flow/SKILL.md`'s Syntax/Arguments, valid only when the resolved step list includes `wrap-up` (e.g. `/claude-tweaks:flow {target} wrap-up cleanup-only`). On any step list that does not include `wrap-up`, the flag is a no-op — note it in the pipeline output, the same convention `keep-going` already uses for its own no-op case ("`cleanup-only` has no effect — `wrap-up` is not in the step list").
- [ ] `skills/flow/steps-and-gates.md`'s "Partial step lists" section extended so that, when `cleanup-only` is set **and** `wrap-up` is in the resolved step list, Step 5 (Present Pipeline Summary) treats the run the same way it already treats a step list where `wrap-up` is *absent* — skip the nothing-left-behind ledger gate, the Creative Opportunities survey, and the Depth Opportunities survey; render the same "Flow: Steps Complete" note (ledger items stay `open` in the ledger file for a later invocation).
- [ ] `skills/wrap-up/SKILL.md` documents a `cleanup-only` mode, threaded down from `/flow`: Phase 1 (ESTABLISH/reflection), Phase 2 (ROUTE), Phase 3 (SETTLE), and Phase 4's decide/execute/hand-off logic are all skipped; only `cleanup-procedures.md`'s cleanup items (A–E) run, with Section C's teardown-ordering invariant and step 3.5's transitional guard running unconditionally, exactly as they do today in the full pipeline — `[IL-116]`'s constraint is a floor, not something `cleanup-only` is permitted to relax.
- [ ] `skills/dispatch/two-call-gate.md` §5's teardown call updated from `.../claude-tweaks:flow {target} wrap-up` to `.../claude-tweaks:flow {target} wrap-up cleanup-only`.
- [ ] `skills/dispatch/two-call-gate.md` §5's "Accepted, tracked risk on this path" paragraph rewritten to describe the fix (pointing at the `cleanup-only` flag) instead of describing an open, accepted risk — the paragraph no longer contains the phrase "Accepted, tracked risk" once the fix lands.
- [ ] A `node --test` prose-conformance test (per the `skill-prose-conformance-tests` skill's byte-pin convention) that fails if either half of the fix regresses: `two-call-gate.md`'s teardown command literal no longer contains `cleanup-only`, or `steps-and-gates.md`'s gate documentation no longer names the `cleanup-only` skip condition.

## Acceptance Criteria

1. `skills/flow/SKILL.md`'s Syntax line and Arguments table both list `cleanup-only` as an optional, order-independent flag, with the same one-line style as the existing `no-polish`/`no-stories`/`keep-going` rows (what it does, when it's valid, what happens when it's a no-op).
2. `skills/flow/steps-and-gates.md`'s "Partial step lists — what Step 5 does when `wrap-up` is absent" section (or a new adjacent subsection it cross-references) states explicitly that `cleanup-only` produces the identical Step 5 behavior — skip ledger gate, skip Creative/Depth surveys, render the "Flow: Steps Complete" note — even though `wrap-up` *is* present in the step list this time. A reader must not be able to conclude the ledger gate still fires just because `wrap-up` ran.
3. `skills/wrap-up/SKILL.md` states, in the same section that documents `--dry-run` (or an adjacent one it cross-references), that `cleanup-only` skips Phases 1–4's reflection/route/settle/close content and runs only `cleanup-procedures.md`'s items — and states explicitly that Section C step 3.5's transitional guard is NOT skipped by `cleanup-only` (the `[IL-116]` floor).
4. `skills/dispatch/two-call-gate.md` §5's literal teardown command reads `PIPELINE_RUN_DIR="{run-dir}" CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow {target} wrap-up cleanup-only`, and the paragraph beginning "Accepted, tracked risk on this path" is replaced with a short note that this record (#298) closed the gap via the `cleanup-only` flag — `grep -c "Accepted, tracked risk" skills/dispatch/two-call-gate.md` returns 0.
5. A full `/claude-tweaks:flow {target} wrap-up` invocation (no `cleanup-only`) is unaffected — Step 5's ledger gate, Creative/Depth surveys, and full Pipeline Summary still render exactly as before for a normal (non-teardown) `wrap-up` run. Prove this by re-reading `steps-and-gates.md`'s existing "wrap-up absent" branch is untouched in its own condition (still gated on `wrap-up` being absent, unrelated to `cleanup-only`) and the new `cleanup-only` branch is additive, not a rewrite of the existing one.
6. The new prose-conformance test passes on the fixed prose and — verified by temporarily reverting each half of the fix and re-running it (per the project's "verify test discrimination by reverting" convention) — fails when either `two-call-gate.md`'s `cleanup-only` literal or `steps-and-gates.md`'s `cleanup-only` skip-condition text is reverted.
7. `npm test` passes in full after the change, including the existing pins in `tests/dispatch-flow-rundir-handoff.test.js`, `tests/flow-run-dir-anchoring.test.js`, and `tests/wrap-up-registry-pin.test.js` — none of which this change should need to touch, since it adds a new flag/branch rather than altering the existing `PIPELINE_RUN_DIR` handoff or run-dir anchoring mechanics.

## Technical Approach

Direction 2 from the original request: a dedicated cleanup-only path through `wrap-up`, rather than widening `unattended-tier`'s `ledgerNarrowing` scope (Direction 1). The original request's own tradeoff note is the deciding factor — Direction 1 is "cheapest, but widens a lever whose whole value is its narrowness," while Direction 2 is "structurally cleaner: the teardown call does not actually want wrap-up's *review* semantics, only its cleanup." A `cleanup-only` flag keeps `unattended-tier`'s scope exactly as narrow as it is today and confines the change to the one call site that actually needs it.

Mechanically, this is a flag layered onto the existing `wrap-up` step-list value, not a new step-list keyword — it follows the same pattern as `no-polish`/`no-stories`/`keep-going` in `skills/flow/SKILL.md`'s Arguments table, order-independent and parsed alongside the step list rather than as part of it. Two things must change together for the flag to do anything:

1. **`/flow`'s own Step 5** (Present Pipeline Summary) must treat `cleanup-only` + `wrap-up`-in-list the same as its existing `wrap-up`-absent branch (`steps-and-gates.md`'s "Partial step lists" section) — this is what actually suppresses the un-answerable ledger gate for a headless firing. Ledger items stay `open` in the ledger file, exactly as the existing branch already does for genuinely-partial runs; nothing is silenced, only deferred to the next invocation that runs a full `wrap-up`.
2. **`/claude-tweaks:wrap-up` itself** must skip its own Phase 1–4 content (reflection, routing, settle, close) under `cleanup-only` and run only `cleanup-procedures.md`. This is the half that keeps the teardown call cheap and fast — today's teardown call pays for a full reflection pass it has no use for (the group already failed at `build,test`; there is nothing to reflect on yet).

### Key Files

- `skills/flow/SKILL.md` — Syntax line (~L39), Arguments table (~L46-63): add the `cleanup-only` row.
- `skills/flow/steps-and-gates.md` — "Partial step lists — what Step 5 does when `wrap-up` is absent" section (~L80-100): extend the condition, or add an adjacent subsection it cross-references.
- `skills/wrap-up/SKILL.md` — Input section (~L22, where `--dry-run` is documented) and Phase 1/Phase 4 headers (~L45, ~L216): document the `cleanup-only` skip.
- `skills/wrap-up/cleanup-procedures.md` — read-only reference for this change (Section C, ~L81-237, especially the teardown-ordering invariant and step 3.5); no edits needed here, `cleanup-only` runs this file's existing procedure unchanged.
- `skills/dispatch/two-call-gate.md` — §5 (~L9-29): update the teardown command literal and rewrite the "Accepted, tracked risk" paragraph.

## Gotchas

- `[IL-116]` is a floor, not a target for this fix — `cleanup-only` must never skip `cleanup-procedures.md` Section C step 3.5's transitional guard. If the implementation finds itself special-casing that guard to make `cleanup-only` "faster," that's the wrong direction; the guard's cost is what step 3.5 exists to pay.
- `steps-and-gates.md`'s existing "wrap-up absent" branch and gate table entries (`wrap-up | Always passes`) must not be edited to key off `cleanup-only` — the new flag is additive to that branch's *condition*, not a replacement of the branch. A normal full `/flow {target} wrap-up` run (no `cleanup-only`) must render identically to today.
- Settle (claim release, `assess-agent-autonomy` failure classification, retry counting, `auto:merge` revocation, the failure comment) already runs inside the **first** call's own agent per `two-call-gate.md` §5 item 1 — `cleanup-only` does not touch that; it only replaces what the *second*, teardown-only `/flow` invocation does.
- `unattended-tier`'s `ledgerNarrowing`/`ledgerRouteRemainder` bookkeeping capabilities (`skills/_shared/autonomy-ceiling.md`) are untouched by this fix — Direction 1 was explicitly not taken, so no scope widening there. Do not fold this fix into that lever.
- This record is itself the tracking half referenced from `skills/dispatch/two-call-gate.md` §5 and `skills/flow/steps-and-gates.md`'s "Intentional two-call consumer" note — once the fix lands, re-check whether either of those two files (beyond the specific paragraph named in the Deliverables above) still narrates the gap as open, and update accordingly.

## Original request

Dispatch: first-call-failure teardown hits the ledger's headless nothing-left-behind gate

## Problem

`/claude-tweaks:dispatch` Step 5 dispatches each group as two sequential Task calls (refs #296). When the **first** call (`build,test`) fails, the second call is never dispatched, so no `wrap-up` ever runs for that group — but the group's worktree still has to be torn down through wrap-up's own cleanup route, because `[IL-116]` forbids `ExitWorktree` / raw `git worktree remove` on a pipeline-run worktree.

The dispatching session therefore makes one further call purely to reach that route (`skills/dispatch/two-call-gate.md` §5):

```
PIPELINE_RUN_DIR="{run-dir}" CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow {target} wrap-up
```

`wrap-up` is in that step list, which is exactly the condition `flow/SKILL.md` Step 5's **nothing-left-behind ledger gate** fires on (the gate was scoped to "`wrap-up` in the resolved step list" by #296's Critical 2 fix, so partial lists like `build,test` correctly skip it — this call is not a partial list).

So the gate runs, headlessly, against a ledger full of build/test-failure items:

- `auto` does not silence it — the ledger resolve gate's Phase 2 is on `_shared/auto-mode-contract.md`'s explicit "what auto never silences" list, and requires per-item human input.
- `_shared/unattended-tier.md` does not close it — the lever defaults to `off`, and even when `on`, its Phase 2 narrowing only auto-routes items whose blocker reason clears the floor rule, and only to `Route to a record -> Keep (backlog)`. Every other disposition, and every item whose reason misses the floor, still needs a human.

## Who is affected

Any `/claude-tweaks:dispatch next` firing (the headless scheduled-Routine form, nobody present) whose **first** Task call fails a `build`/`test` HARD-GATE — i.e. the ordinary failure path, not an edge case. The teardown call can stall on an unanswerable gate; the worktree then survives until the `SessionStart` reaper collects it, and the firing's report is worse than it needs to be.

## Current status

Documented as an accepted, tracked risk in `skills/dispatch/two-call-gate.md` §5 rather than silently left as a gap. This record is the tracking half of that.

## Fix directions (not yet traded off)

1. **A new `unattended-tier` scope for this context** — e.g. a cleanup-only authorization that lets the resolve gate defer every open item to the ledger file (already a durable artifact) when the invocation is a failure-path teardown with no human present. Cheapest, but widens a lever whose whole value is its narrowness.
2. **A dedicated cleanup-only `/flow` entry point** — reaches `wrap-up`'s cleanup procedures (`cleanup-procedures.md` Section C, including step 3.5's transitional guard) without running Step 5's ledger gate at all. Structurally cleaner: the teardown call does not actually want wrap-up's *review* semantics, only its cleanup, and routing it through the full `wrap-up` step is what drags the gate in.

Either way, the constraint that must survive is `[IL-116]`: teardown must not bypass `cleanup-procedures.md` Section C step 3.5.

## References

- refs #296 (the two-call split that created this path)
- `skills/dispatch/two-call-gate.md` §5
- `skills/flow/SKILL.md` Step 5, `skills/flow/steps-and-gates.md` "Partial step lists"
- `skills/_shared/unattended-tier.md`, `skills/_shared/auto-mode-contract.md`

