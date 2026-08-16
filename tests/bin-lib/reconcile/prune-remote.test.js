'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decideRemotePrune } = require('../../../bin/lib/reconcile/prune-remote');

// The delete bar is deliberately stricter than archive-branches' local -D:
// a pushed deletion is unrecoverable from this checkout once origin GCs the
// ref, so it requires BOTH signals — a MERGED PR and cherry-equivalence.
test('decideRemotePrune: merged PR + cherry-equivalent -> delete', () => {
  const r = decideRemotePrune({ branch: 'build/x', cherryEquivalent: true, prState: { number: 3, state: 'MERGED' } });
  assert.strictEqual(r.action, 'delete');
  assert.strictEqual(r.reason, 'merged-pr-cherry-equivalent');
});
test('decideRemotePrune: open PR -> skip, even when cherry-equivalent', () => {
  assert.strictEqual(decideRemotePrune({ branch: 'build/x', cherryEquivalent: true, prState: { number: 3, state: 'OPEN' } }).reason, 'pr-open');
});
test('decideRemotePrune: merged PR but not cherry-equivalent (rebased remnant) -> skip', () => {
  assert.strictEqual(decideRemotePrune({ branch: 'build/x', cherryEquivalent: false, prState: { number: 3, state: 'MERGED' } }).reason, 'not-cherry-equivalent');
});
test('decideRemotePrune: cherry-equivalent but no PR / closed-unmerged PR -> skip (no merged-PR corroboration)', () => {
  assert.strictEqual(decideRemotePrune({ branch: 'build/x', cherryEquivalent: true, prState: null }).reason, 'no-merged-pr');
  assert.strictEqual(decideRemotePrune({ branch: 'build/x', cherryEquivalent: true, prState: { number: 3, state: 'CLOSED' } }).reason, 'no-merged-pr');
});
test('decideRemotePrune: transport failures -> skip (fail closed)', () => {
  assert.strictEqual(decideRemotePrune({ branch: 'build/x', cherryEquivalent: true, prState: 'gh-absent' }).reason, 'gh-absent');
  assert.strictEqual(decideRemotePrune({ branch: 'build/x', cherryEquivalent: true, prState: 'network-failure' }).reason, 'network-failure');
});

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pruneRemote } = require('../../../bin/lib/reconcile/prune-remote');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// A clone wired to a real bare origin — push --delete must actually land.
function makeRepoWithOrigin() {
  const origin = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-remote-origin-'));
  git(origin, 'init', '--bare', '-b', 'main');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-remote-'));
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-m', 'init');
  git(dir, 'remote', 'add', 'origin', origin);
  git(dir, 'push', '-u', 'origin', 'main');
  return dir;
}

test('pruneRemote: squash-merged remote build/* branch is deleted on origin; dry-run only reports', () => {
  const dir = makeRepoWithOrigin();
  git(dir, 'checkout', '-b', 'build/merged');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
  git(dir, 'add', 'b.txt');
  git(dir, 'commit', '-m', 'change');
  git(dir, 'push', 'origin', 'build/merged');
  git(dir, 'checkout', 'main');
  git(dir, 'cherry-pick', 'build/merged'); // merged in substance (squash-merge shape)
  git(dir, 'branch', '-D', 'build/merged'); // local branch already disposed; remote lingers

  const dry = pruneRemote({ cwd: dir, integration: 'main', dryRun: true, resolvePr: () => ({ number: 1, state: 'MERGED' }) });
  assert.strictEqual(dry.entries.find((e) => e.name === 'build/merged').action, 'delete');
  assert.match(git(dir, 'ls-remote', 'origin', 'refs/heads/build/merged'), /build\/merged/); // dry-run did not mutate

  const real = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => ({ number: 1, state: 'MERGED' }) });
  const entry = real.entries.find((e) => e.name === 'build/merged');
  assert.strictEqual(entry.action, 'delete');
  assert.strictEqual(entry.kind, 'remote-branch');
  assert.strictEqual(git(dir, 'ls-remote', 'origin', 'refs/heads/build/merged').trim(), ''); // gone on origin
});

test('pruneRemote: unmerged remote branch and non-namespace remote branch are never deleted', () => {
  const dir = makeRepoWithOrigin();
  git(dir, 'checkout', '-b', 'build/unmerged');
  fs.writeFileSync(path.join(dir, 'c.txt'), 'c\n');
  git(dir, 'add', 'c.txt');
  git(dir, 'commit', '-m', 'unmerged');
  git(dir, 'push', 'origin', 'build/unmerged');
  git(dir, 'checkout', 'main');
  git(dir, 'branch', '-D', 'build/unmerged');
  git(dir, 'checkout', '-b', 'feature/out-of-scope');
  fs.writeFileSync(path.join(dir, 'd.txt'), 'd\n');
  git(dir, 'add', 'd.txt');
  git(dir, 'commit', '-m', 'oos');
  git(dir, 'push', 'origin', 'feature/out-of-scope');
  git(dir, 'checkout', 'main');
  git(dir, 'branch', '-D', 'feature/out-of-scope');

  const r = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => ({ number: 1, state: 'MERGED' }) });
  assert.strictEqual(r.entries.find((e) => e.name === 'build/unmerged').reason, 'not-cherry-equivalent');
  assert.strictEqual(r.entries.find((e) => e.name === 'feature/out-of-scope'), undefined); // silent scope guard
  assert.match(git(dir, 'ls-remote', 'origin', 'refs/heads/build/unmerged'), /build\/unmerged/);
  assert.match(git(dir, 'ls-remote', 'origin', 'refs/heads/feature/out-of-scope'), /feature\/out-of-scope/);
});

test('pruneRemote: integration branch and origin/HEAD are never candidates', () => {
  const dir = makeRepoWithOrigin();
  const r = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => ({ number: 1, state: 'MERGED' }) });
  assert.strictEqual(r.entries.length, 0);
  assert.match(git(dir, 'ls-remote', 'origin', 'refs/heads/main'), /refs\/heads\/main/);
});

test('pruneRemote: branch attached to a live worktree is silently out of scope', () => {
  const dir = makeRepoWithOrigin();
  git(dir, 'checkout', '-b', 'build/wt');
  fs.writeFileSync(path.join(dir, 'e.txt'), 'e\n');
  git(dir, 'add', 'e.txt');
  git(dir, 'commit', '-m', 'wt');
  git(dir, 'push', 'origin', 'build/wt');
  git(dir, 'checkout', 'main');
  git(dir, 'cherry-pick', 'build/wt'); // even cherry-equivalent…
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-remote-wt-'));
  git(dir, 'worktree', 'add', path.join(wt, 'w'), 'build/wt'); // …but attached to a live worktree

  const r = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => ({ number: 1, state: 'MERGED' }) });
  assert.strictEqual(r.entries.find((e) => e.name === 'build/wt'), undefined);
  assert.match(git(dir, 'ls-remote', 'origin', 'refs/heads/build/wt'), /build\/wt/);
});
