'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decideRemotePrune, pruneRemote } = require('../../../plugin/bin/lib/reconcile/prune-remote');

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

// Two independently prunable remote branches (both cherry-equivalent + MERGED),
// built with the exact same steps as the single-branch delete test above,
// looped over 'build/b1' and 'build/b2' — the batch-push tests need at least
// two candidates in the same `pruneRemote()` pass to observe batching.
function buildTwoPrunableBranchesFixture() {
  const dir = makeRepoWithOrigin();
  for (const name of ['build/b1', 'build/b2']) {
    const file = `${name.replace('/', '-')}.txt`;
    git(dir, 'checkout', '-b', name);
    fs.writeFileSync(path.join(dir, file), `${name}\n`);
    git(dir, 'add', file);
    git(dir, 'commit', '-m', `change ${name}`);
    git(dir, 'push', 'origin', name);
    git(dir, 'checkout', 'main');
    git(dir, 'cherry-pick', name); // merged in substance (squash-merge shape)
    git(dir, 'branch', '-D', name); // local branch already disposed; remote lingers
  }
  return { root: dir, integration: 'main' };
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

// The evidence is read from local refs/remotes/origin/* but the delete lands
// on origin's LIVE ref, and `push --delete` has no --force-with-lease. So the
// check must refresh those refs itself: without the internal fetch, a branch
// another clone has pushed to since our last fetch still reads merged here and
// the delete destroys commits this checkout never saw. Deleting the fetch call
// makes this test fail with the branch actually gone from origin.
test('pruneRemote: refreshes origin before judging — a branch advanced from another clone is not deleted on stale evidence', () => {
  const dir = makeRepoWithOrigin();
  const originUrl = git(dir, 'remote', 'get-url', 'origin').trim();
  git(dir, 'checkout', '-b', 'build/stale');
  fs.writeFileSync(path.join(dir, 'h.txt'), 'h\n');
  git(dir, 'add', 'h.txt');
  git(dir, 'commit', '-m', 'merged part');
  git(dir, 'push', 'origin', 'build/stale');
  git(dir, 'checkout', 'main');
  git(dir, 'cherry-pick', 'build/stale'); // this clone's snapshot IS cherry-equivalent…
  git(dir, 'branch', '-D', 'build/stale');

  // …but another machine pushes a further commit to the same remote branch.
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-remote-clone2-'));
  git(other, 'clone', originUrl, 'c');
  const clone2 = path.join(other, 'c');
  git(clone2, 'config', 'user.email', 't@t');
  git(clone2, 'config', 'user.name', 't');
  git(clone2, 'checkout', 'build/stale');
  fs.writeFileSync(path.join(clone2, 'i.txt'), 'i\n');
  git(clone2, 'add', 'i.txt');
  git(clone2, 'commit', '-m', 'work this clone never saw');
  git(clone2, 'push', 'origin', 'build/stale');

  // No fetch in `dir` — its refs/remotes/origin/build/stale is deliberately stale.
  const r = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => ({ number: 1, state: 'MERGED' }) });
  const entry = r.entries.find((e) => e.name === 'build/stale');
  assert.strictEqual(entry.action, 'skip');
  assert.strictEqual(entry.reason, 'not-cherry-equivalent'); // the internal fetch pulled the new commit in
  assert.match(git(dir, 'ls-remote', 'origin', 'refs/heads/build/stale'), /build\/stale/); // unfetched work survives
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

test('pruneRemote: integration branch is excluded even when it sits inside the plugin namespace', () => {
  // Namespaced (build/*), trivially cherry-equivalent against itself, and
  // NOT the branch currently checked out in this worktree (so the
  // live-worktree half of inScope can't be why it survives either) —
  // only the branch === integration guard can be what keeps it out of
  // entries. (A namespaced branch that IS the checked-out branch would
  // accidentally be protected by the live-worktree guard instead, since
  // the primary worktree's own branch always self-matches that check.)
  const dir = makeRepoWithOrigin();
  git(dir, 'checkout', '-b', 'build/trunk');
  fs.writeFileSync(path.join(dir, 'g.txt'), 'g\n');
  git(dir, 'add', 'g.txt');
  git(dir, 'commit', '-m', 'trunk');
  git(dir, 'push', 'origin', 'build/trunk');
  git(dir, 'checkout', 'main'); // build/trunk stays as a local ref but is no longer attached to any worktree

  const r = pruneRemote({ cwd: dir, integration: 'build/trunk', dryRun: false, resolvePr: () => ({ number: 1, state: 'MERGED' }) });
  assert.strictEqual(r.entries.find((e) => e.name === 'build/trunk'), undefined);
  assert.match(git(dir, 'ls-remote', 'origin', 'refs/heads/build/trunk'), /build\/trunk/);
});

test('pruneRemote: origin/HEAD symbolic ref is never a candidate, alongside a real deletable branch', () => {
  const dir = makeRepoWithOrigin();
  git(dir, 'remote', 'set-head', 'origin', 'main'); // creates the symbolic refs/remotes/origin/HEAD ref
  git(dir, 'checkout', '-b', 'build/merged2');
  fs.writeFileSync(path.join(dir, 'f.txt'), 'f\n');
  git(dir, 'add', 'f.txt');
  git(dir, 'commit', '-m', 'change2');
  git(dir, 'push', 'origin', 'build/merged2');
  git(dir, 'checkout', 'main');
  git(dir, 'cherry-pick', 'build/merged2');
  git(dir, 'branch', '-D', 'build/merged2');

  const r = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => ({ number: 1, state: 'MERGED' }) });
  assert.strictEqual(r.entries.find((e) => e.name === 'build/merged2').action, 'delete');
  assert.strictEqual(r.entries.find((e) => e.name === 'HEAD'), undefined);
  assert.strictEqual(git(dir, 'ls-remote', 'origin', 'refs/heads/build/merged2').trim(), ''); // real branch actually deleted
  assert.match(git(dir, 'symbolic-ref', 'refs/remotes/origin/HEAD'), /refs\/remotes\/origin\/main/); // origin/HEAD survives untouched
});

// skipFetch trusts the caller already refreshed origin/* this pass
// (reconcile()'s shared fetch, #820 D2) — pointing origin at an invalid URL
// proves no second fetch is attempted: if pruneRemote still fetched despite
// skipFetch, this would surface as `fetch-failed` instead of a real result.
test('pruneRemote: skipFetch=true never calls fetch, trusts already-fetched refs', () => {
  const dir = makeRepoWithOrigin();
  const originUrl = git(dir, 'remote', 'get-url', 'origin').trim();
  git(dir, 'fetch', '--prune', 'origin'); // caller already fetched, simulating the shared-fetch path
  git(dir, 'remote', 'set-url', 'origin', 'https://example.invalid/nope.git');

  const r = pruneRemote({ cwd: dir, integration: 'main', dryRun: false, skipFetch: true, resolvePr: () => ({ number: 1, state: 'MERGED' }) });
  assert.strictEqual(r.failure, null);
  void originUrl;
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

// gitExec.runGit = stub does NOT work here: prune-remote.js does
// `const { runGit } = require('../hooks/git-exec')` once at module load,
// which copies the function VALUE into a local const at that instant.
// Reassigning `gitExec.runGit` afterward only changes what a fresh
// `require('../hooks/git-exec').runGit` property lookup returns — the
// already-bound local `runGit` inside prune-remote.js keeps pointing at the
// original function (see tests/reconcile.test.js's identical note on
// classify.js/shared-fetch.js, #820 D2). Intercept at the process-spawn
// boundary instead: a `git` wrapper placed first on PATH.
function installPushWrapper(failMultiBranch) {
  const wrapperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-remote-gitwrap-'));
  const logFile = path.join(wrapperDir, 'push-calls.log');
  fs.writeFileSync(logFile, '');
  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const wrapperPath = path.join(wrapperDir, 'git');
  // Real invocation shape is `git -C <cwd> push origin --delete <branch...>`,
  // so $1=-C $2=<cwd> $3=push $4=origin $5=--delete $6=<branch1> $7=<branch2?>.
  // When failMultiBranch is set, a push --delete naming 2+ branches (the
  // batch) exits 1 without touching origin; a single-branch push --delete
  // (the per-branch fallback) is let through to real git.
  const failClause = failMultiBranch ? '\n  if [ -n "$7" ]; then\n    exit 1\n  fi' : '';
  fs.writeFileSync(
    wrapperPath,
    `#!/bin/sh\nif [ "$3" = "push" ]; then\n  echo "$@" >> "${logFile}"${failClause}\nfi\nexec "${realGit}" "$@"\n`,
  );
  fs.chmodSync(wrapperPath, 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${wrapperDir}${path.delimiter}${originalPath}`;
  return {
    logFile,
    restore: () => { process.env.PATH = originalPath; },
  };
}

test('pruneRemote: multiple prunable branches are deleted with ONE push call, not one per branch', () => {
  const { root, integration } = buildTwoPrunableBranchesFixture();
  const wrapper = installPushWrapper(false);
  let result;
  try {
    result = pruneRemote({ cwd: root, integration, skipFetch: true, resolvePr: () => ({ number: 1, state: 'MERGED' }) });
  } finally {
    wrapper.restore();
  }
  const pushLines = fs.readFileSync(wrapper.logFile, 'utf8').split('\n').filter(Boolean);
  assert.equal(pushLines.length, 1, `expected one batched push, saw ${pushLines.length}: ${JSON.stringify(pushLines)}`);
  assert.match(pushLines[0], /build\/b1/);
  assert.match(pushLines[0], /build\/b2/);
  assert.equal(result.entries.filter((e) => e.action === 'delete').length, 2);
});

test('pruneRemote: a failed batch push falls back to per-branch deletes, one bad ref does not swallow the rest', () => {
  const { root, integration } = buildTwoPrunableBranchesFixture();
  const wrapper = installPushWrapper(true);
  let result;
  try {
    result = pruneRemote({ cwd: root, integration, skipFetch: true, resolvePr: () => ({ number: 1, state: 'MERGED' }) });
  } finally {
    wrapper.restore();
  }
  const pushLines = fs.readFileSync(wrapper.logFile, 'utf8').split('\n').filter(Boolean);
  const batchAttempted = pushLines.some((l) => /build\/b1/.test(l) && /build\/b2/.test(l));
  assert.equal(batchAttempted, true, `expected a batch attempt naming both branches, saw ${JSON.stringify(pushLines)}`);
  assert.equal(result.entries.filter((e) => e.action === 'delete').length, 2, 'per-branch fallback still deletes both');
});

const { reconcile, ALL_CHECKS } = require('../../../plugin/bin/lib/reconcile');

test("index: ALL_CHECKS includes 'remote-prune'; dispatch sits between 'archive-branches' and 'reap'; result gains remoteBranches slot", () => {
  assert.ok(ALL_CHECKS.includes('remote-prune'));
  const src = fs.readFileSync(path.join(__dirname, '../../../plugin/bin/lib/reconcile/index.js'), 'utf8');
  const iBranches = src.indexOf("checks.includes('archive-branches')");
  // Search from iBranches: the shared-fetch gate above the mirror dispatch
  // (#820 D2) also tests `checks.includes('remote-prune')` — as part of
  // deciding whether to run the one shared fetch at all — so the literal
  // string now appears earlier in the file too. The actual dispatch block is
  // the occurrence after archive-branches.
  const iRemote = src.indexOf("checks.includes('remote-prune')", iBranches);
  const iReap = src.indexOf("checks.includes('reap')", iBranches);
  assert.ok(iBranches > -1 && iRemote > iBranches && iReap > iRemote, 'dispatch order: archive-branches < remote-prune < reap');
});

test('index: pr-first repo with a working remote actually reaches the remote-prune dispatch; requesting a different check leaves remoteBranches null', async () => {
  // A no-remote fixture never reaches the dispatch at all (it short-circuits
  // at the earlier `if (!integration)` guard) — that would pass even with
  // the dispatch block deleted, so it doesn't discriminate. This fixture has
  // a real working origin and forces pr-first (integration-model detection
  // shells to `gh repo view`, which has no real GitHub repo to find here),
  // so `checks: ['remote-prune']` must actually run pruneRemote() and land
  // an array (even an empty one — no in-namespace remote branches exist) in
  // result.remoteBranches. Deleting the dispatch block makes this fail.
  const dir = makeRepoWithOrigin();
  fs.mkdirSync(path.join(dir, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.claude-tweaks', 'policy.yml'),
    'integration-model: pr-first\nintegration-branch: main\n',
  );

  const withDispatch = await reconcile({ cwd: dir, checks: ['remote-prune'] });
  assert.ok(Array.isArray(withDispatch.remoteBranches), 'remote-prune requested under pr-first must set remoteBranches to an array, not stay null');

  const withoutDispatch = await reconcile({ cwd: dir, checks: ['mirror'] });
  assert.strictEqual(withoutDispatch.remoteBranches, null, 'remote-prune not requested must leave remoteBranches null');
});
