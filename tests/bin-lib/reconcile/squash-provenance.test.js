'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { isSquashMerged } = require('../../../plugin/bin/lib/reconcile/squash-provenance');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// main: init -> (squash of build/two) ; build/two: two commits off init.
// `git merge --squash` + one commit is the exact shape `gh pr merge --squash`
// leaves on the base branch: one commit whose patch-id matches neither
// branch commit, so `git cherry` cannot prove it (the #2252 gap).
function makeSquashFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'squash-provenance-'));
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-m', 'init');
  const init = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'checkout', '-b', 'build/two');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
  git(dir, 'add', 'b.txt');
  git(dir, 'commit', '-m', 'first');
  fs.writeFileSync(path.join(dir, 'c.txt'), 'c\n');
  git(dir, 'add', 'c.txt');
  git(dir, 'commit', '-m', 'second');
  git(dir, 'checkout', 'main');
  git(dir, 'merge', '--squash', 'build/two');
  git(dir, 'commit', '-m', 'feat: two things (#2251)');
  const squash = git(dir, 'rev-parse', 'HEAD');
  return { dir, init, squash };
}

const merged = (oid) => ({ number: 7, state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', mergeCommit: { oid } });

test('isSquashMerged: confirmed MERGED PR whose mergeCommit is on the bounded first-parent history -> true', () => {
  const { dir, squash } = makeSquashFixture();
  assert.strictEqual(git(dir, 'cherry', 'main', 'build/two').split('\n').every((l) => l.startsWith('-')), false); // the gap is real: cherry says unmerged
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', merged(squash)), true);
});

test('isSquashMerged: mergeCommit not reachable on the tip (rewritten history) -> false, fail safe', () => {
  const { dir, init, squash } = makeSquashFixture();
  git(dir, 'checkout', '--detach');
  git(dir, 'branch', '-f', 'main', init); // main rewritten: the squash commit is gone from the tip
  git(dir, 'checkout', 'main');
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', merged(squash)), false);
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', merged('f'.repeat(40))), false); // never-existed oid
});

test('isSquashMerged: the scan is bounded to the fork point — an ancestor of the fork point never proves anything', () => {
  const { dir, init } = makeSquashFixture();
  // `init` IS reachable from main, but it precedes merge-base(main, build/two) — outside the bounded window.
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', merged(init)), false);
});

test('isSquashMerged: non-MERGED, malformed, or transport prState -> false without touching git', () => {
  const { dir, squash } = makeSquashFixture();
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', { ...merged(squash), state: 'CLOSED' }), false);
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', { ...merged(squash), state: 'OPEN' }), false);
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', { number: 7, state: 'MERGED' }), false); // no mergeCommit (bulk-screen shape)
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', { ...merged(squash), mergeCommit: { oid: 'abc' } }), false); // malformed oid
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', null), false);
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', 'gh-absent'), false);
  assert.strictEqual(isSquashMerged(dir, 'main', 'build/two', 'network-failure'), false);
});

test('isSquashMerged: git failure (unknown integration or branch ref) -> false, fail safe', () => {
  const { dir, squash } = makeSquashFixture();
  assert.strictEqual(isSquashMerged(dir, 'no-such-branch', 'build/two', merged(squash)), false);
  assert.strictEqual(isSquashMerged(dir, 'main', 'no-such-branch', merged(squash)), false);
});
