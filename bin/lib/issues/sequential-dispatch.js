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
    const outcome = await dispatchTask(group, worktree);
    await teardownWorktree(worktree);
    results.push({ group, outcome });
  }
  return results;
}

module.exports = { runGroupsSequentially };
