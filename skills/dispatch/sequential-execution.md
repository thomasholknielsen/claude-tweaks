# Dispatch Step 5 — Sequential Execution Mechanism

Referenced by `skills/dispatch/SKILL.md` Step 5's banner. Full detail on why Step 5 processes groups one at a time instead of in parallel, and what the loop actually does between groups.

## Why sequential, not parallel

A Task-tool subagent is always launched cwd-pinned to the *dispatching session's* own worktree — there is no route to giving two concurrently-running subagents independent worktrees (`EnterWorktree` refuses a subagent cwd override; see #155). The fix is structural, not a policy dial: the **dispatching session itself** switches worktrees between groups.

## The loop

For group N, enter a fresh worktree, dispatch group N's Task agent (which inherits that cwd), wait for its terminal status line (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED) and OUTCOME line, tear that worktree down via the standard cleanup route, THEN enter a fresh worktree for group N+1. Never enter group N+1's worktree, and never dispatch its Task agent, while group N's is still running.

This is the same enter→dispatch→teardown→next sequence `bin/lib/issues/sequential-dispatch.js`'s `runGroupsSequentially` pins as a unit-testable invariant — that module is what a regression here should be checked against.

## Wall-clock trade-off

A multi-group firing's wall-clock time now scales linearly with group count instead of being bounded by the slowest group — an accepted, documented trade-off (dispatch only fires on a schedule with nobody waiting synchronously), not a regression to flag at review time.
