# Dispatch Step 5 — Sequential Execution Mechanism

Referenced by `skills/dispatch/SKILL.md` Step 5's banner. Full detail on why Step 5 processes groups one at a time instead of in parallel, and what the loop actually does between groups.

## Why sequential, not parallel

A Task-tool subagent is always launched cwd-pinned to the *dispatching session's* own worktree — there is no route to giving two concurrently-running subagents independent worktrees (`EnterWorktree` refuses a subagent cwd override; see #155). The fix is structural, not a policy dial: the **dispatching session itself** switches worktrees between groups.

## When the dispatching session itself is cwd-pinned (#447)

The loop below, and `SKILL.md` Step 5's own description of it, assume this dispatching session's cwd is free to move — it enters group N's worktree, and that entry is what lets the two Task calls dispatched into it inherit the right cwd. That assumption fails when `/claude-tweaks:dispatch` is itself launched as a Task/Agent-tool subagent instead of a top-level session: this session's own cwd is pinned by the harness the same way a dispatched call's would be, so this session's own worktree-entry attempt is refused for the identical reason — the same signal `EnterWorktree`'s own refusal already surfaces, just observed one level higher up the chain. Confirmed independently across 3 separate dispatch firings on 2026-08-14, each self-settling correctly via the existing failure path (claim released, `auto:build`/`auto:merge` preserved, no unsafe state left behind) — so the failure mode was safe, just undocumented and previously re-solved ad hoc per firing.

Detect the shape up front — before attempting to enter group N's worktree at all, not after the attempt fails — by checking this session's own context for the same cwd-pinned signal. When detected, this session still creates the group's worktree via a plain `git worktree add` (a filesystem operation that does not require repinning this session's own cwd), but skips relying on cwd inheritance for the group's two Task calls: since this session's own cwd never moves into the new worktree, neither Task call can inherit it. Instead, every command each call's prompt issues is prefixed with an explicit `cd {worktree-path} &&`, so both calls are anchored to the worktree per-command rather than through a shared shell cwd this session cannot set. Everything else in the loop below — enter once per group, dispatch both calls, tear down via wrap-up's cleanup route before the next group — is unchanged; only the *mechanism* a Task call uses to reach the worktree differs.

A top-level dispatching session (the common case, and the one the rest of this file describes) never hits this — its own cwd is not pinned, so it enters each group's worktree directly and both Task calls inherit it, exactly as below.

## The loop

For group N, enter **one** fresh worktree, then run that group's whole dispatch sequence inside it: both of its Task calls (`build,test`, then — gated — `review,polish,wrap-up`; see `two-call-gate.md`) inherit that single cwd, and each reports its own terminal status line (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED) plus an OUTCOME line. One worktree per group, entered once and torn down once — never one per call.

Where that teardown falls depends on which call ends the group. A first call that fails or blocks its `build,test` gate *is* the group's terminal point — the second call is never dispatched, and teardown routes through the explicit `/claude-tweaks:flow {target} wrap-up` call `two-call-gate.md` section 5 specifies. A first call that clears the gate hands off to the second, whose own wrap-up performs the cleanup at its terminal OUTCOME. Either way the worktree comes down through wrap-up's cleanup route, never a raw removal (`[IL-116]`), and only THEN does the dispatching session enter a fresh worktree for group N+1. Never enter group N+1's worktree, and never dispatch any of its calls, while any of group N's is still running.

This is the same enter→dispatch→teardown→next sequence `bin/lib/issues/sequential-dispatch.js`'s `runGroupsSequentially` pins as a unit-testable invariant — that module is what a regression here should be checked against. It sequences *groups*; the two calls within a group are sequenced by the gate in `two-call-gate.md`.

## No per-group timeout, and the wall-clock trade-off

There is no per-group timeout — nothing elsewhere in this codebase imposes one (existing parallel-Task dispatch sites, e.g. `/help`'s Stage 1-7, wait for all dispatched agents regardless of duration; this is the same "no timeout" posture, just applied to a sequential loop instead of a concurrent one).

A multi-group firing's wall-clock time now scales linearly with group count instead of being bounded by the slowest group — an accepted, documented trade-off (dispatch only fires on a schedule with nobody waiting synchronously), not a regression to flag at review time.
