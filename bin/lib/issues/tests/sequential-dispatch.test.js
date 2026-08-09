'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { runGroupsSequentially } = require('../sequential-dispatch');

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

test('#155 scenario: group 2 worktree is never entered while group 1 is still active', async () => {
  const groupA = { id: 'A', autoMerge: true };
  const groupB = { id: 'B', autoMerge: false };
  const activeWorktrees = new Set();
  const maxConcurrentSeen = { value: 0 };
  const enteredOrder = [];
  const branchOf = new Map();

  const groupAGate = deferred();

  async function enterWorktree(group) {
    const worktree = `wt-${group.id}`;
    activeWorktrees.add(worktree);
    maxConcurrentSeen.value = Math.max(maxConcurrentSeen.value, activeWorktrees.size);
    enteredOrder.push(group.id);
    branchOf.set(group.id, `flow/spec-${group.id}`);
    return worktree;
  }

  async function dispatchTask(group) {
    if (group.id === 'A') {
      await groupAGate.promise; // group A's Task agent takes a while
      return 'pending-review';
    }
    return 'merged';
  }

  async function teardownWorktree(worktree) {
    activeWorktrees.delete(worktree);
  }

  const runPromise = runGroupsSequentially([groupA, groupB], { enterWorktree, dispatchTask, teardownWorktree });

  // While group A's task is still pending, group B must NOT have entered a worktree yet.
  await Promise.resolve();
  await Promise.resolve();
  assert.strictEqual(enteredOrder.includes('B'), false, 'group B entered a worktree before group A finished');

  groupAGate.resolve();
  const results = await runPromise;

  assert.strictEqual(maxConcurrentSeen.value, 1, 'more than one worktree was ever active at once — this is exactly the #155 hazard');
  assert.deepStrictEqual(enteredOrder, ['A', 'B'], 'groups must be processed in order');
  assert.notStrictEqual(branchOf.get('A'), branchOf.get('B'), 'groups must build on distinct branches');
  assert.deepStrictEqual(
    results.map((r) => r.outcome),
    ['pending-review', 'merged'],
  );
});

test('reverting to concurrent (Promise.all) dispatch fails the same invariant', async () => {
  // This models what today's (pre-fix) "parallel Task agent" behavior does, and proves the
  // test above actually discriminates: running the two mock groups concurrently — the exact
  // shape #295 removes — violates the single-active-worktree invariant.
  async function runGroupsConcurrently(groups, { enterWorktree, dispatchTask, teardownWorktree }) {
    return Promise.all(groups.map(async (group) => {
      const worktree = await enterWorktree(group);
      const outcome = await dispatchTask(group, worktree);
      await teardownWorktree(worktree);
      return { group, outcome };
    }));
  }

  const groupA = { id: 'A' };
  const groupB = { id: 'B' };
  const activeWorktrees = new Set();
  const maxConcurrentSeen = { value: 0 };
  const gate = deferred();

  async function enterWorktree(group) {
    const worktree = `wt-${group.id}`;
    activeWorktrees.add(worktree);
    maxConcurrentSeen.value = Math.max(maxConcurrentSeen.value, activeWorktrees.size);
    return worktree;
  }
  async function dispatchTask(group) {
    if (group.id === 'A') await gate.promise;
    return 'ok';
  }
  async function teardownWorktree(worktree) {
    activeWorktrees.delete(worktree);
  }

  const runPromise = runGroupsConcurrently([groupA, groupB], { enterWorktree, dispatchTask, teardownWorktree });
  await Promise.resolve();
  await Promise.resolve();
  gate.resolve();
  await runPromise;

  assert.strictEqual(maxConcurrentSeen.value, 2, 'sanity check: concurrent dispatch DOES trigger the #155 hazard (2 worktrees active at once)');
});
