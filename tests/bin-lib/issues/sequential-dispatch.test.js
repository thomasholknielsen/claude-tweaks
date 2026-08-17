'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { runGroupsSequentially } = require('../../../plugin/bin/lib/issues/sequential-dispatch');

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
    return 'ready-to-merge';
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
    ['pending-review', 'ready-to-merge'],
  );
});

test('a rejecting dispatchTask still tears its worktree down, and still stops the loop', async () => {
  // Without the try/finally, a rejection skips teardownWorktree and leaks the
  // worktree — the documented behavior is that EVERY terminal outcome (failed and
  // blocked included) gets its worktree torn down.
  const groupA = { id: 'A' };
  const groupB = { id: 'B' };
  const tornDown = [];
  const enteredOrder = [];
  const boom = new Error('flow HARD-GATE failure');

  async function enterWorktree(group) {
    enteredOrder.push(group.id);
    return `wt-${group.id}`;
  }
  async function dispatchTask(group) {
    if (group.id === 'A') throw boom;
    return 'ready-to-merge';
  }
  async function teardownWorktree(worktree) {
    tornDown.push(worktree);
  }

  await assert.rejects(
    () => runGroupsSequentially([groupA, groupB], { enterWorktree, dispatchTask, teardownWorktree }),
    (err) => err === boom,
    'the rejection must propagate — cleanup runs, it does not swallow the failure',
  );

  assert.deepStrictEqual(tornDown, ['wt-A'], "group A's worktree must be torn down despite the rejection");
  assert.deepStrictEqual(enteredOrder, ['A'], 'the loop must stop on failure — group B is never entered');
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
