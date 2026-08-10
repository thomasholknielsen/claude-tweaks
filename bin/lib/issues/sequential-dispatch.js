'use strict';
// Canonical, testable shape of #295's fix for #155 (shared-worktree hazard):
// a Task-tool subagent is always launched cwd-pinned to the dispatching
// session's own worktree, so two groups' subagents can never be independently
// isolated while both are in flight. The remedy is having the DISPATCHING
// SESSION (not the subagent) switch worktrees between groups, one at a time.
// skills/dispatch/SKILL.md Step 5 documents the live orchestration (Task-tool
// calls are not Node-invocable, so that orchestration is prose-driven); this
// module pins the ordering guarantee so a regression is unit-testable.

async function runGroupsSequentially(groups, { enterWorktree, dispatchTask, teardownWorktree }) {
  const results = [];
  for (const group of groups) {
    const worktree = await enterWorktree(group);
    let outcome;
    try {
      outcome = await dispatchTask(group, worktree);
    } finally {
      // Every terminal outcome tears its worktree down — including the failed and
      // blocked ones. A rejection here must not leak the worktree into the next
      // group's turn, which is the #155 hazard by another route. The rejection
      // still propagates: the loop stops on failure, just after cleanup.
      await teardownWorktree(worktree);
    }
    results.push({ group, outcome });
  }
  return results;
}

module.exports = { runGroupsSequentially };
