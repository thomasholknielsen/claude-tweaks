'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeRetryQueueCommands } = require('../retry-cli');

function fakeDurableState(initial) {
  let state = { retryQueue: [], ...initial };
  return {
    readDurableState: () => state,
    writeDurableState: (root, mutatorFn) => {
      state = mutatorFn(state);
      return { ok: true };
    },
  };
}

// Simulates writeDurableState's own CAS-retry loop (durable-state.js's
// writeState) re-invoking the mutator fresh on every attempt before the
// write finally succeeds — see durable-state.test.js's "retries on a
// rejected ref update" test for the real behavior this stands in for. Only
// the LAST invocation's returned state is ever actually persisted.
function fakeDurableStateWithRetries(initial, invocationsBeforeSuccess) {
  let state = { retryQueue: [], ...initial };
  return {
    readDurableState: () => state,
    writeDurableState: (root, mutatorFn) => {
      let next;
      for (let i = 0; i < invocationsBeforeSuccess; i++) {
        next = mutatorFn(state);
      }
      state = next;
      return { ok: true };
    },
  };
}

function captureStdout(fn) {
  const original = process.stdout.write.bind(process.stdout);
  let out = '';
  process.stdout.write = (chunk) => { out += chunk; return true; };
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return out;
}

test('drain prints the payload of every queued entry', () => {
  const ds = fakeDurableState({
    retryQueue: [
      { fingerprint: 'a', payload: { title: 'A' }, firstFailedAt: 'x', attempts: 1, lastError: null },
      { fingerprint: 'b', payload: { title: 'B' }, firstFailedAt: 'x', attempts: 1, lastError: null },
    ],
  });
  const { drain } = makeRetryQueueCommands(ds);
  const out = captureStdout(() => drain({ root: '/repo' }));
  assert.deepStrictEqual(JSON.parse(out), [{ title: 'A' }, { title: 'B' }]);
});

test('drain prints [] when the queue is empty', () => {
  const ds = fakeDurableState({ retryQueue: [] });
  const { drain } = makeRetryQueueCommands(ds);
  const out = captureStdout(() => drain({ root: '/repo' }));
  assert.deepStrictEqual(JSON.parse(out), []);
});

test('update dequeues successes and enqueues failures, printing entries that just crossed the escalation threshold', () => {
  const ds = fakeDurableState({
    retryQueue: [
      { fingerprint: 'stuck', payload: { title: 'Stuck' }, firstFailedAt: 'x', attempts: 2, lastError: 'timeout' },
    ],
  });
  const { update } = makeRetryQueueCommands(ds);
  const resultsPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'retry-cli-')), 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify([
    { fingerprint: 'stuck', payload: { title: 'Stuck' }, ok: false, error: 'still failing' },
    { fingerprint: 'fresh', payload: { title: 'Fresh' }, ok: true },
  ]));
  const out = captureStdout(() => update({ root: '/repo', _: ['update', resultsPath] }));
  const escalated = JSON.parse(out);
  assert.strictEqual(escalated.length, 1);
  assert.strictEqual(escalated[0].fingerprint, 'stuck');
  assert.strictEqual(escalated[0].attempts, 3);
});

test('update reports each escalated fingerprint exactly once even when the mutator is re-invoked multiple times before the write succeeds', () => {
  const ds = fakeDurableStateWithRetries(
    {
      retryQueue: [
        { fingerprint: 'stuck', payload: { title: 'Stuck' }, firstFailedAt: 'x', attempts: 2, lastError: 'timeout' },
      ],
    },
    3, // simulate 3 CAS attempts (2 rejected, 1 finally accepted) before success
  );
  const { update } = makeRetryQueueCommands(ds);
  const resultsPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'retry-cli-')), 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify([
    { fingerprint: 'stuck', payload: { title: 'Stuck' }, ok: false, error: 'still failing' },
  ]));
  const out = captureStdout(() => update({ root: '/repo', _: ['update', resultsPath] }));
  const escalated = JSON.parse(out);
  assert.strictEqual(escalated.length, 1, 'must report the fingerprint exactly once, not once per retried mutator invocation');
  assert.strictEqual(escalated[0].fingerprint, 'stuck');
});

test('update prints [] when nothing crosses the escalation threshold', () => {
  const ds = fakeDurableState({ retryQueue: [] });
  const { update } = makeRetryQueueCommands(ds);
  const resultsPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'retry-cli-')), 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify([{ fingerprint: 'new', payload: { title: 'New' }, ok: false, error: 'timeout' }]));
  const out = captureStdout(() => update({ root: '/repo', _: ['update', resultsPath] }));
  assert.deepStrictEqual(JSON.parse(out), []);
});
