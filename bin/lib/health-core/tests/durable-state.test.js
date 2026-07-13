'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  HEALTH_STATE_BRANCH,
  MAX_RUN_HISTORY,
  ESCALATE_AFTER_ATTEMPTS,
  statePath,
  pruneRuns,
  enqueueRetry,
  dequeueRetry,
  shouldEscalate,
  createDurableState,
} = require('../durable-state');

test('constants', () => {
  assert.strictEqual(HEALTH_STATE_BRANCH, 'health-state');
  assert.strictEqual(MAX_RUN_HISTORY, 90);
  assert.strictEqual(ESCALATE_AFTER_ATTEMPTS, 3);
});

test('statePath namespaces a file under the skill name', () => {
  assert.strictEqual(statePath('code-health', 'cursors.json'), 'code-health/cursors.json');
});

test('pruneRuns keeps only the newest maxCount records, oldest first order preserved', () => {
  const runs = [
    { runId: 'a', runAt: '2026-01-01T00:00:00.000Z' },
    { runId: 'b', runAt: '2026-01-02T00:00:00.000Z' },
    { runId: 'c', runAt: '2026-01-03T00:00:00.000Z' },
  ];
  const pruned = pruneRuns(runs, 2);
  assert.deepStrictEqual(pruned.map((r) => r.runId), ['b', 'c']);
});

test('pruneRuns is a no-op when runs.length <= maxCount', () => {
  const runs = [{ runId: 'a', runAt: '2026-01-01T00:00:00.000Z' }];
  assert.deepStrictEqual(pruneRuns(runs, 90), runs);
});

test('pruneRuns sorts by runAt before slicing, regardless of input order', () => {
  const runs = [
    { runId: 'c', runAt: '2026-01-03T00:00:00.000Z' },
    { runId: 'a', runAt: '2026-01-01T00:00:00.000Z' },
    { runId: 'b', runAt: '2026-01-02T00:00:00.000Z' },
  ];
  assert.deepStrictEqual(pruneRuns(runs, 2).map((r) => r.runId), ['b', 'c']);
});

test('enqueueRetry adds a brand-new fingerprint with attempts:1', () => {
  const next = enqueueRetry([], { fingerprint: 'ch-abc123', payload: { title: 't' } }, { now: 1720000000000 });
  assert.strictEqual(next.length, 1);
  assert.strictEqual(next[0].fingerprint, 'ch-abc123');
  assert.strictEqual(next[0].attempts, 1);
  assert.strictEqual(next[0].firstFailedAt, new Date(1720000000000).toISOString());
});

test('enqueueRetry increments attempts for an existing fingerprint instead of duplicating', () => {
  const queue = [{ fingerprint: 'ch-abc123', payload: { title: 't' }, firstFailedAt: 'x', attempts: 1, lastError: null }];
  const next = enqueueRetry(queue, { fingerprint: 'ch-abc123', payload: { title: 't' }, lastError: 'timeout' }, { now: 1720000000000 });
  assert.strictEqual(next.length, 1);
  assert.strictEqual(next[0].attempts, 2);
  assert.strictEqual(next[0].lastError, 'timeout');
  assert.strictEqual(next[0].firstFailedAt, 'x', 'firstFailedAt must not change on repeat failures');
});

test('dequeueRetry removes only the matching fingerprint', () => {
  const queue = [
    { fingerprint: 'a', attempts: 1 },
    { fingerprint: 'b', attempts: 1 },
  ];
  assert.deepStrictEqual(dequeueRetry(queue, 'a'), [{ fingerprint: 'b', attempts: 1 }]);
});

test('shouldEscalate is true at exactly ESCALATE_AFTER_ATTEMPTS and beyond, false below it', () => {
  assert.strictEqual(shouldEscalate({ attempts: 2 }), false);
  assert.strictEqual(shouldEscalate({ attempts: 3 }), true);
  assert.strictEqual(shouldEscalate({ attempts: 4 }), true);
});

test('shouldEscalate is false for a missing entry', () => {
  assert.strictEqual(shouldEscalate(null), false);
  assert.strictEqual(shouldEscalate(undefined), false);
});

// --- createDurableState: fake runner records every (cmd, args, opts) call and
// returns canned responses keyed by a simple pattern match on args. `returns`/
// `throws` may be a plain value OR a function of (cmd, args) called lazily on
// each match — use a function whenever a rule needs to react to prior calls
// (a counter, a flag flipped by an earlier matched rule) so the state change
// happens when the fake is actually invoked by the code under test, not once
// eagerly while the script array literal is being built. ---

function fakeRunner(script) {
  const calls = [];
  function run(cmd, args, opts) {
    calls.push({ cmd, args, opts });
    for (const rule of script) {
      if (rule.match(cmd, args)) {
        const throwsVal = typeof rule.throws === 'function' ? rule.throws(cmd, args) : rule.throws;
        if (throwsVal) throw new Error(throwsVal);
        return typeof rule.returns === 'function' ? rule.returns(cmd, args) : rule.returns;
      }
    }
    throw new Error(`fakeRunner: no rule matched ${cmd} ${JSON.stringify(args)}`);
  }
  return { run, calls };
}

function matchArgs(args, needle) {
  return args.join(' ').includes(needle);
}

test('readState returns empty defaults when the branch does not exist yet (includeRemembered:true skill)', () => {
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), throws: "couldn't find remote ref health-state" },
  ]);
  const ds = createDurableState('code-health', { run, includeRemembered: true });
  const state = ds.readState('/repo');
  assert.deepStrictEqual(state, { cursors: {}, remembered: {}, retryQueue: [], runs: [] });
});

test('readState parses each file via git show, defaulting missing files to {}/[]', () => {
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'cursors.json'), returns: JSON.stringify({ '.': { lastSweptMs: 1 } }) },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'remembered.json'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'retry-queue.json'), returns: '[]' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'runs.json'), returns: '[]' },
  ]);
  const ds = createDurableState('code-health', { run, includeRemembered: true });
  const state = ds.readState('/repo');
  assert.deepStrictEqual(state.cursors, { '.': { lastSweptMs: 1 } });
  assert.deepStrictEqual(state.remembered, {});
  assert.deepStrictEqual(state.retryQueue, []);
  assert.deepStrictEqual(state.runs, []);
});

test('readState omits the remembered key entirely for a skill that does not opt in (includeRemembered defaults to false)', () => {
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
  ]);
  const ds = createDurableState('harness-health', { run });
  const state = ds.readState('/repo');
  assert.deepStrictEqual(state, { cursors: {}, retryQueue: [], runs: [] });
  assert.ok(!('remembered' in state), 'a skill that never opts in must never see a remembered key at all');
});

test('writeState succeeds on the first attempt: fetch, read, build blobs/tree/commit, non-force ref update', () => {
  const written = {};
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'), returns: 'tree-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && !matchArgs(args, '^{tree}'), returns: 'commit-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/blobs'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/trees'), returns: 'tree-sha-2\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/commits'), returns: 'commit-sha-2\n' },
    {
      match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/refs/heads/health-state') && matchArgs(args, 'PATCH'),
      returns: () => { written.updated = true; return ''; },
    },
  ]);
  const ds = createDurableState('code-health', { run, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => ({ ...current, cursors: { '.': { lastSweptMs: 2 } } }));
  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(written.updated, true);
});

test('writeState retries on a rejected (non-fast-forward) ref update, then succeeds', () => {
  let refAttempts = 0;
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'), returns: 'tree-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && !matchArgs(args, '^{tree}'), returns: 'commit-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/blobs'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/trees'), returns: 'tree-sha-2\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/commits'), returns: 'commit-sha-2\n' },
    {
      match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/refs/heads/health-state') && matchArgs(args, 'PATCH'),
      returns: () => {
        refAttempts += 1;
        if (refAttempts === 1) throw new Error('422 Reference update failed (non-fast-forward)');
        return '';
      },
    },
  ]);
  const ds = createDurableState('code-health', { run, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => ({ ...current, cursors: { '.': { lastSweptMs: 2 } } }));
  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(refAttempts, 2, 'must retry the whole read-modify-write cycle after a rejection');
});

test('writeState gives up gracefully (no throw) after MAX_CAS_ATTEMPTS exhausted', () => {
  const { run } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'), returns: 'tree-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && !matchArgs(args, '^{tree}'), returns: 'commit-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/blobs'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/trees'), returns: 'tree-sha-2\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/commits'), returns: 'commit-sha-2\n' },
    {
      match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/refs/heads/health-state') && matchArgs(args, 'PATCH'),
      throws: '422 Reference update failed (non-fast-forward)',
    },
  ]);
  const ds = createDurableState('code-health', { run, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => current);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error, 'must report why it gave up');
});

test('writeState bootstraps the branch when it does not exist yet, then completes the write on the bootstrapped branch', () => {
  let branchCreated = false;
  const { run, calls } = fakeRunner([
    {
      match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'),
      returns: () => {
        if (!branchCreated) throw new Error("couldn't find remote ref health-state");
        return '';
      },
    },
    {
      match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse'),
      returns: (cmd, args) => {
        if (!branchCreated) throw new Error('unknown revision');
        return matchArgs(args, '^{tree}') ? 'tree-sha-1\n' : 'commit-sha-1\n';
      },
    },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/blobs'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/trees'), returns: 'tree-sha-2\n' },
    {
      match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/commits'),
      returns: () => { branchCreated = true; return 'commit-sha\n'; },
    },
    {
      match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'repos/{owner}/{repo}/git/refs') && !matchArgs(args, 'heads'),
      returns: '',
    },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/refs/heads/health-state') && matchArgs(args, 'PATCH'), returns: '' },
  ]);
  const ds = createDurableState('code-health', { run, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => current);
  assert.deepStrictEqual(result, { ok: true });
  assert.ok(branchCreated, 'ensureBranch must have created the bootstrap commit before the main write proceeded');
  const refCreateCall = calls.find(
    (c) => c.cmd === 'gh' && c.args.includes('repos/{owner}/{repo}/git/refs'),
  );
  assert.ok(refCreateCall, 'must have called the plain git/refs create endpoint during bootstrap, distinct from the git/refs/heads/health-state PATCH');
});

test('writeState never includes a remembered.json blob for a skill that does not opt in', () => {
  const { run, calls } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'), returns: 'tree-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && !matchArgs(args, '^{tree}'), returns: 'commit-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/blobs'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/trees'), returns: 'tree-sha-2\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/commits'), returns: 'commit-sha-2\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/refs/heads/health-state') && matchArgs(args, 'PATCH'), returns: '' },
  ]);
  const ds = createDurableState('harness-health', { run });
  const result = ds.writeState('/repo', (current) => current);
  assert.deepStrictEqual(result, { ok: true });
  const treeCall = calls.find((c) => c.cmd === 'gh' && c.args.includes('repos/{owner}/{repo}/git/trees'));
  const paths = JSON.parse(treeCall.opts.input).tree.map((e) => e.path).sort();
  assert.deepStrictEqual(paths, ['harness-health/cursors.json', 'harness-health/retry-queue.json', 'harness-health/runs.json']);
});

test('writeState includes a remembered.json blob only for a skill that opts in', () => {
  const { run, calls } = fakeRunner([
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && matchArgs(args, '^{tree}'), returns: 'tree-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'rev-parse') && !matchArgs(args, '^{tree}'), returns: 'commit-sha-1\n' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'fetch'), returns: '' },
    { match: (cmd, args) => cmd === 'git' && matchArgs(args, 'show'), throws: 'fatal: path does not exist' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/blobs'), returns: 'blob-sha\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/trees'), returns: 'tree-sha-2\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/commits'), returns: 'commit-sha-2\n' },
    { match: (cmd, args) => cmd === 'gh' && matchArgs(args, 'git/refs/heads/health-state') && matchArgs(args, 'PATCH'), returns: '' },
  ]);
  const ds = createDurableState('code-health', { run, includeRemembered: true });
  const result = ds.writeState('/repo', (current) => current);
  assert.deepStrictEqual(result, { ok: true });
  const treeCall = calls.find((c) => c.cmd === 'gh' && c.args.includes('repos/{owner}/{repo}/git/trees'));
  const paths = JSON.parse(treeCall.opts.input).tree.map((e) => e.path).sort();
  assert.deepStrictEqual(paths, [
    'code-health/cursors.json',
    'code-health/remembered.json',
    'code-health/retry-queue.json',
    'code-health/runs.json',
  ]);
});
