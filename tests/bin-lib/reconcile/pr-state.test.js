'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolvePrState, resolvePrStateAsync, resolvePrStatesBulk } = require('../../../plugin/bin/lib/reconcile/pr-state');

// resolvePrState/resolvePrStateAsync both shell to `gh pr list` — neither is
// injectable (mirrors the module's pre-existing design), so tests intercept
// at the process-spawn boundary via a `gh` wrapper placed first on PATH,
// same technique tests/bin-lib/reconcile/prune-remote.test.js already uses
// for `git` (#820 review — pr-state.js had no test file at all before this).
function installGhWrapper(jsonOrScript) {
  const wrapperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-state-ghwrap-'));
  const wrapperPath = path.join(wrapperDir, 'gh');
  const body = typeof jsonOrScript === 'string' && jsonOrScript.startsWith('#!')
    ? jsonOrScript
    : `#!/bin/sh\ncat <<'EOF'\n${JSON.stringify(jsonOrScript)}\nEOF\n`;
  fs.writeFileSync(wrapperPath, body);
  fs.chmodSync(wrapperPath, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${wrapperDir}${path.delimiter}${originalPath}`;
  return { restore: () => { process.env.PATH = originalPath; } };
}

test('resolvePrState/resolvePrStateAsync: no branch -> null, no gh call', async () => {
  assert.equal(resolvePrState('/tmp', null), null);
  assert.equal(await resolvePrStateAsync('/tmp', null), null);
});

test('resolvePrState/resolvePrStateAsync: merged PR wins over other PRs for the same branch', async () => {
  const prs = [
    { number: 1, state: 'CLOSED', mergedAt: null, updatedAt: '2026-01-01T00:00:00Z' },
    { number: 2, state: 'MERGED', mergedAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
  ];
  const wrapper = installGhWrapper(prs);
  try {
    assert.equal(resolvePrState('/tmp', 'some-branch').number, 2);
    assert.equal((await resolvePrStateAsync('/tmp', 'some-branch')).number, 2);
  } finally {
    wrapper.restore();
  }
});

test('resolvePrState/resolvePrStateAsync: no merged PR -> most recently updated governs', async () => {
  const prs = [
    { number: 1, state: 'OPEN', mergedAt: null, updatedAt: '2026-01-01T00:00:00Z' },
    { number: 2, state: 'CLOSED', mergedAt: null, updatedAt: '2026-01-03T00:00:00Z' },
  ];
  const wrapper = installGhWrapper(prs);
  try {
    assert.equal(resolvePrState('/tmp', 'some-branch').number, 2);
    assert.equal((await resolvePrStateAsync('/tmp', 'some-branch')).number, 2);
  } finally {
    wrapper.restore();
  }
});

test('resolvePrState/resolvePrStateAsync: no PRs for the branch -> null', async () => {
  const wrapper = installGhWrapper([]);
  try {
    assert.equal(resolvePrState('/tmp', 'some-branch'), null);
    assert.equal(await resolvePrStateAsync('/tmp', 'some-branch'), null);
  } finally {
    wrapper.restore();
  }
});

test('resolvePrState/resolvePrStateAsync: gh absent -> gh-absent, no throw', async () => {
  const originalPath = process.env.PATH;
  process.env.PATH = '/nonexistent-path-with-no-gh';
  try {
    assert.equal(resolvePrState('/tmp', 'some-branch'), 'gh-absent');
    assert.equal(await resolvePrStateAsync('/tmp', 'some-branch'), 'gh-absent');
  } finally {
    process.env.PATH = originalPath;
  }
});

test('resolvePrState/resolvePrStateAsync: malformed gh output -> network-failure, no throw', async () => {
  const wrapper = installGhWrapper('#!/bin/sh\necho "not json"\n');
  try {
    assert.equal(resolvePrState('/tmp', 'some-branch'), 'network-failure');
    assert.equal(await resolvePrStateAsync('/tmp', 'some-branch'), 'network-failure');
  } finally {
    wrapper.restore();
  }
});

test('resolvePrStateAsync: does not block the event loop (real concurrency, not execFileSync in disguise)', async () => {
  // A wrapper that sleeps briefly before responding — if resolvePrStateAsync
  // were secretly synchronous, N concurrent calls would take N * sleep; a
  // real non-blocking execFile lets them overlap, so wall time stays close
  // to one sleep regardless of N (#820 review — this is exactly the property
  // Phase 1.5's runWithConcurrency pooling in release-merged.js depends on).
  const wrapper = installGhWrapper('#!/bin/sh\nsleep 0.15\necho "[]"\n');
  try {
    const start = Date.now();
    await Promise.all([
      resolvePrStateAsync('/tmp', 'branch-a'),
      resolvePrStateAsync('/tmp', 'branch-b'),
      resolvePrStateAsync('/tmp', 'branch-c'),
    ]);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 400, `expected concurrent execution well under 3x150ms=450ms, took ${elapsed}ms`);
  } finally {
    wrapper.restore();
  }
});

test('preferOpen: an OPEN PR outranks a MERGED PR for destructive callers, whichever is newer', async () => {
  // #664 / #570 review scenario: branch reused after its first PR merged.
  const openNewer = [
    { number: 10, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { number: 11, state: 'OPEN', mergedAt: null, updatedAt: '2026-02-01T00:00:00Z' },
  ];
  const openOlder = [
    { number: 12, state: 'OPEN', mergedAt: null, updatedAt: '2026-01-01T00:00:00Z' },
    { number: 13, state: 'MERGED', mergedAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' },
  ];
  for (const [prs, expectedOpen] of [[openNewer, 11], [openOlder, 12]]) {
    const wrapper = installGhWrapper(prs);
    try {
      assert.equal(resolvePrState('/tmp', 'some-branch', { preferOpen: true }).number, expectedOpen);
    } finally {
      wrapper.restore();
    }
  }
});

test('read-mostly consumers (no opts): MERGED still wins over a newer OPEN PR — explicit regression proof for reap/archive/release', async () => {
  const prs = [
    { number: 10, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { number: 11, state: 'OPEN', mergedAt: null, updatedAt: '2026-02-01T00:00:00Z' },
  ];
  const wrapper = installGhWrapper(prs);
  try {
    assert.equal(resolvePrState('/tmp', 'some-branch').number, 10);
    assert.equal((await resolvePrStateAsync('/tmp', 'some-branch')).number, 10);
  } finally {
    wrapper.restore();
  }
});

test('preferOpen with no OPEN PR in the set: behavior unchanged (MERGED wins)', () => {
  const prs = [
    { number: 1, state: 'CLOSED', mergedAt: null, updatedAt: '2026-01-03T00:00:00Z' },
    { number: 2, state: 'MERGED', mergedAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
  ];
  const wrapper = installGhWrapper(prs);
  try {
    assert.equal(resolvePrState('/tmp', 'some-branch', { preferOpen: true }).number, 2);
  } finally {
    wrapper.restore();
  }
});

// Build a canned GraphQL response for a chunk's branches: entries maps
// alias index -> { prs: [...] } (ref exists) or null (no ref).
function graphqlResponse(entries) {
  const repository = {};
  entries.forEach((e, i) => {
    repository['b' + i] = e === null ? null : {
      name: 'x', target: { oid: 'deadbeef' },
      associatedPullRequests: { nodes: e.prs },
    };
  });
  return JSON.stringify({ data: { repository } });
}

test('resolvePrStatesBulk: complete map, tie-break parity with resolvePrState (preferOpen both ways)', () => {
  const merged = { number: 10, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
  const open = { number: 11, state: 'OPEN', mergedAt: null, updatedAt: '2026-02-01T00:00:00Z' };
  const calls = [];
  const runner = (args) => { calls.push(args); return graphqlResponse([{ prs: [merged, open] }, { prs: [merged] }, null]); };
  const r = resolvePrStatesBulk('/tmp', ['reused', 'merged-only', 'gone'], { preferOpen: true, runner, repoSlug: 'o/r' });
  assert.equal(calls.length, 1);
  assert.equal(r.get('reused').number, 11);        // preferOpen: OPEN governs
  assert.equal(r.get('merged-only').number, 10);   // MERGED wins with no OPEN
  assert.equal(r.get('gone'), null);               // deleted/never-pushed ref -> null, still present in map
  assert.equal(r.size, 3);
});

test('resolvePrStatesBulk: default tie-break (no preferOpen) matches resolvePrState — MERGED wins over newer OPEN', () => {
  const merged = { number: 10, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
  const open = { number: 11, state: 'OPEN', mergedAt: null, updatedAt: '2026-02-01T00:00:00Z' };
  const runner = () => graphqlResponse([{ prs: [merged, open] }]);
  const r = resolvePrStatesBulk('/tmp', ['reused'], { runner, repoSlug: 'o/r' });
  assert.equal(r.get('reused').number, 10);
});

test('resolvePrStatesBulk: chunking at 50 with sequential short-circuit on chunk failure', () => {
  const branches = Array.from({ length: 120 }, (_, i) => 'br-' + i);
  let call = 0;
  const runner = (args) => {
    call += 1;
    if (call === 2) { const e = new Error('boom'); e.code = 'ETIMEDOUT'; throw e; }
    return graphqlResponse(Array.from({ length: 50 }, () => null));
  };
  const r = resolvePrStatesBulk('/tmp', branches, { runner, repoSlug: 'o/r' });
  assert.equal(r, 'network-failure');
  assert.equal(call, 2); // chunk 3 never issued — short-circuit
});

test('resolvePrStatesBulk: degraded responses classify network-failure; missing gh classifies gh-absent; empty set spawns nothing', () => {
  const errResp = JSON.stringify({ data: { repository: { b0: null } }, errors: [{ message: 'partial' }] });
  assert.equal(resolvePrStatesBulk('/tmp', ['a'], { runner: () => errResp, repoSlug: 'o/r' }), 'network-failure');
  assert.equal(resolvePrStatesBulk('/tmp', ['a'], { runner: () => 'not json', repoSlug: 'o/r' }), 'network-failure');
  const enoent = () => { const e = new Error('nope'); e.code = 'ENOENT'; throw e; };
  assert.equal(resolvePrStatesBulk('/tmp', ['a'], { runner: enoent, repoSlug: 'o/r' }), 'gh-absent');
  let spawned = 0;
  assert.equal(resolvePrStatesBulk('/tmp', [], { runner: () => { spawned += 1; return '{}'; }, repoSlug: 'o/r' }).size, 0);
  assert.equal(spawned, 0);
});

test('resolvePrStatesBulk: unresolvable repo slug classifies network-failure (fail closed, no spawn)', () => {
  let spawned = 0;
  const r = resolvePrStatesBulk('/tmp/definitely-not-a-repo-xyz', ['a'], { runner: () => { spawned += 1; return '{}'; } });
  assert.equal(r, 'network-failure');
  assert.equal(spawned, 0);
});
