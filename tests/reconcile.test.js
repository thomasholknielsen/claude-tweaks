// tests/reconcile.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { classifyMirror } = require('../bin/lib/reconcile/classify');
const { mirrorFastForward } = require('../bin/lib/reconcile/mirror-ff');
const { decideReap } = require('../bin/lib/reconcile/reap-merged');
const { decideRelease } = require('../bin/lib/reconcile/release-merged');
const { decideArchive, readConsoleState } = require('../bin/lib/reconcile/archive-merged');
const { isWorktreeLocked } = require('../bin/lib/hooks/worktree-reap');
const { reconcile } = require('../bin/lib/reconcile');

const HOOKS = path.join(__dirname, '..', 'bin', 'hooks.js');

function runHook(args, { input = '', cwd = undefined, env = {} } = {}) {
  try {
    const stdout = execFileSync('node', [HOOKS, ...args], {
      input, cwd, encoding: 'utf8', env: { ...process.env, ...env },
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '' };
  }
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

// Two-repo fixture: `origin` (bare) + a clone that plays the role of the
// main checkout, both on `main`. Fully local — no network, no gh.
function pairedFixture() {
  const originDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-origin-'));
  git(['init', '-q', '--bare', '--initial-branch=main'], originDir);

  const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-seed-'));
  git(['clone', '-q', originDir, seedDir]);
  git(['config', 'user.email', 'test@example.com'], seedDir);
  git(['config', 'user.name', 'Test'], seedDir);
  fs.writeFileSync(path.join(seedDir, 'a.txt'), 'one\n');
  git(['add', 'a.txt'], seedDir);
  git(['commit', '-q', '-m', 'seed'], seedDir);
  git(['push', '-q', 'origin', 'main'], seedDir);

  const mainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-main-'));
  git(['clone', '-q', originDir, mainDir]);
  git(['config', 'user.email', 'test@example.com'], mainDir);
  git(['config', 'user.name', 'Test'], mainDir);

  return { originDir, seedDir, mainDir };
}

// --- classify.js / mirror-ff.js: real local git fixtures, no network ---

test('classifyMirror: current when local matches origin', () => {
  const { mainDir } = pairedFixture();
  const r = classifyMirror(mainDir, 'main');
  assert.strictEqual(r.state, 'current');
  assert.strictEqual(r.failure, null);
});

test('classifyMirror: behind when origin has moved ahead', () => {
  const { seedDir, mainDir } = pairedFixture();
  fs.writeFileSync(path.join(seedDir, 'b.txt'), 'two\n');
  git(['add', 'b.txt'], seedDir);
  git(['commit', '-q', '-m', 'second'], seedDir);
  git(['push', '-q', 'origin', 'main'], seedDir);

  const r = classifyMirror(mainDir, 'main');
  assert.strictEqual(r.state, 'behind');
});

test('classifyMirror: ahead when local has unpushed commits', () => {
  const { mainDir } = pairedFixture();
  fs.writeFileSync(path.join(mainDir, 'local.txt'), 'mine\n');
  git(['add', 'local.txt'], mainDir);
  git(['commit', '-q', '-m', 'local-only'], mainDir);

  const r = classifyMirror(mainDir, 'main');
  assert.strictEqual(r.state, 'ahead');
});

test('classifyMirror: diverged when both sides have unique commits', () => {
  const { seedDir, mainDir } = pairedFixture();
  fs.writeFileSync(path.join(seedDir, 'origin-side.txt'), 'x\n');
  git(['add', 'origin-side.txt'], seedDir);
  git(['commit', '-q', '-m', 'origin-side'], seedDir);
  git(['push', '-q', 'origin', 'main'], seedDir);

  fs.writeFileSync(path.join(mainDir, 'local-side.txt'), 'y\n');
  git(['add', 'local-side.txt'], mainDir);
  git(['commit', '-q', '-m', 'local-side'], mainDir);

  const r = classifyMirror(mainDir, 'main');
  assert.strictEqual(r.state, 'diverged');
});

test('classifyMirror: dirty when the working tree has uncommitted changes, before any fetch is attempted', () => {
  const { mainDir } = pairedFixture();
  fs.writeFileSync(path.join(mainDir, 'a.txt'), 'modified\n');
  const r = classifyMirror(mainDir, 'main');
  assert.strictEqual(r.state, 'dirty');
});

test('mirrorFastForward: fast-forwards when strictly behind and clean (AC1)', () => {
  const { seedDir, mainDir } = pairedFixture();
  fs.writeFileSync(path.join(seedDir, 'b.txt'), 'two\n');
  git(['add', 'b.txt'], seedDir);
  git(['commit', '-q', '-m', 'second'], seedDir);
  git(['push', '-q', 'origin', 'main'], seedDir);

  const before = git(['rev-parse', 'main'], mainDir).trim();
  const r = mirrorFastForward(mainDir, 'main');
  assert.strictEqual(r.state, 'behind');
  assert.strictEqual(r.action, 'fast-forwarded');
  const after = git(['rev-parse', 'main'], mainDir).trim();
  assert.notStrictEqual(before, after);
  assert.strictEqual(after, git(['rev-parse', 'origin/main'], mainDir).trim());
});

test('mirrorFastForward: dirty tree reports dirty and moves nothing (AC1)', () => {
  const { seedDir, mainDir } = pairedFixture();
  fs.writeFileSync(path.join(seedDir, 'b.txt'), 'two\n');
  git(['add', 'b.txt'], seedDir);
  git(['commit', '-q', '-m', 'second'], seedDir);
  git(['push', '-q', 'origin', 'main'], seedDir);
  fs.writeFileSync(path.join(mainDir, 'a.txt'), 'dirty\n');

  const before = git(['rev-parse', 'HEAD'], mainDir).trim();
  const r = mirrorFastForward(mainDir, 'main');
  assert.strictEqual(r.state, 'dirty');
  assert.strictEqual(r.action, 'none');
  assert.strictEqual(git(['rev-parse', 'HEAD'], mainDir).trim(), before);
});

test('mirrorFastForward: ahead (local-only commits) reports a warning and moves nothing (AC1)', () => {
  const { mainDir } = pairedFixture();
  fs.writeFileSync(path.join(mainDir, 'local.txt'), 'mine\n');
  git(['add', 'local.txt'], mainDir);
  git(['commit', '-q', '-m', 'local-only'], mainDir);
  const before = git(['rev-parse', 'HEAD'], mainDir).trim();

  const r = mirrorFastForward(mainDir, 'main');
  assert.strictEqual(r.state, 'ahead');
  assert.ok(r.warning);
  assert.strictEqual(git(['rev-parse', 'HEAD'], mainDir).trim(), before);
});

test('mirrorFastForward: idempotent — a second run after an ff produces zero further writes (AC3)', () => {
  const { seedDir, mainDir } = pairedFixture();
  fs.writeFileSync(path.join(seedDir, 'b.txt'), 'two\n');
  git(['add', 'b.txt'], seedDir);
  git(['commit', '-q', '-m', 'second'], seedDir);
  git(['push', '-q', 'origin', 'main'], seedDir);

  mirrorFastForward(mainDir, 'main');
  const afterFirst = git(['rev-parse', 'HEAD'], mainDir).trim();
  const r2 = mirrorFastForward(mainDir, 'main');
  assert.strictEqual(r2.state, 'current');
  assert.strictEqual(r2.action, 'none');
  assert.strictEqual(git(['rev-parse', 'HEAD'], mainDir).trim(), afterFirst);
});

// --- decision tables: pure functions, zero I/O ---

test('decideReap: merged PR -> reap', () => {
  assert.deepStrictEqual(decideReap({ number: 5, state: 'MERGED' }), { action: 'reap' });
});
test('decideReap: closed-unmerged PR -> skip, surfaced (AC2)', () => {
  assert.deepStrictEqual(decideReap({ number: 5, state: 'CLOSED' }), { action: 'skip', reason: 'pr-closed-unmerged' });
});
test('decideReap: open PR -> skip, reason pr-open (AC2)', () => {
  assert.deepStrictEqual(decideReap({ number: 5, state: 'OPEN' }), { action: 'skip', reason: 'pr-open' });
});
test('decideReap: no PR at all -> skip, reason no-pr', () => {
  assert.deepStrictEqual(decideReap(null), { action: 'skip', reason: 'no-pr' });
});
test('decideReap: gh absent / network failure are distinguished, never silently collapsed', () => {
  assert.deepStrictEqual(decideReap('gh-absent'), { action: 'skip', reason: 'gh-absent' });
  assert.deepStrictEqual(decideReap('network-failure'), { action: 'skip', reason: 'network-failure' });
});

test('decideRelease: only live/stale claims are ever candidates for release', () => {
  assert.strictEqual(decideRelease('absent', { number: 1, state: 'MERGED' }).action, 'skip');
  assert.strictEqual(decideRelease('tombstone', { number: 1, state: 'MERGED' }).action, 'skip');
  assert.strictEqual(decideRelease('unreadable', { number: 1, state: 'MERGED' }).action, 'skip');
});
test('decideRelease: live claim + merged PR -> release', () => {
  const r = decideRelease('live', { number: 7, state: 'MERGED' });
  assert.strictEqual(r.action, 'release');
  assert.match(r.reason, /#7/);
});
test('decideRelease: stale claim + merged PR -> release (idempotence path)', () => {
  assert.strictEqual(decideRelease('stale', { number: 7, state: 'MERGED' }).action, 'release');
});
test('decideRelease: live claim + open PR -> skip, never released', () => {
  assert.deepStrictEqual(decideRelease('live', { number: 7, state: 'OPEN' }), { action: 'skip', reason: 'pr-open' });
});

test('decideArchive: merged + no console rendered -> archive', () => {
  assert.deepStrictEqual(decideArchive({ number: 3, state: 'MERGED' }, 'none'), { action: 'archive' });
});
test('decideArchive: merged + console resolved -> archive', () => {
  assert.deepStrictEqual(decideArchive({ number: 3, state: 'MERGED' }, 'resolved'), { action: 'archive' });
});
test('decideArchive: merged + console UNresolved -> never archived', () => {
  assert.deepStrictEqual(decideArchive({ number: 3, state: 'MERGED' }, 'unresolved'), { action: 'skip', reason: 'console-unresolved' });
});
test('decideArchive: PR not merged -> never archived regardless of console state', () => {
  assert.strictEqual(decideArchive({ number: 3, state: 'OPEN' }, 'resolved').action, 'skip');
});

test('readConsoleState: absent file reads as none, not unresolved', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-console-'));
  assert.strictEqual(readConsoleState(dir), 'none');
});
test('readConsoleState: {resolved:true} reads as resolved', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-console-'));
  fs.writeFileSync(path.join(dir, 'console.json'), JSON.stringify({ resolved: true }));
  assert.strictEqual(readConsoleState(dir), 'resolved');
});
test('readConsoleState: unparseable content fails closed to unresolved, never silently archived', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-console-'));
  fs.writeFileSync(path.join(dir, 'console.json'), '{not json');
  assert.strictEqual(readConsoleState(dir), 'unresolved');
});

// --- isWorktreeLocked: reused verbatim from worktree-reap.js (not a copy) ---

test('isWorktreeLocked: a plain unlocked linked worktree is not locked', () => {
  const { originDir, mainDir } = pairedFixture();
  const wtDir = path.join(os.tmpdir(), `ct-recon-wt-${Date.now()}`);
  git(['worktree', 'add', '-b', 'feature-x', wtDir], mainDir);
  try {
    assert.strictEqual(isWorktreeLocked(wtDir, { cwd: mainDir }), false);
  } finally {
    git(['worktree', 'remove', '--force', wtDir], mainDir);
    void originDir;
  }
});

test('isWorktreeLocked: a path not registered in git worktree list at all is not locked (nothing to lock)', () => {
  const { mainDir } = pairedFixture();
  assert.strictEqual(isWorktreeLocked('/nonexistent/path/xyz', { cwd: mainDir }), false);
});

// --- reconcile() orchestrator: offline degradation and model gating ---

test('reconcile: local-merge project skips every check with one clear reason, never throws (AC4-adjacent)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-lm-'));
  git(['init', '-q'], dir);
  fs.mkdirSync(path.join(dir, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude-tweaks', 'policy.yml'), 'integration-model: local-merge\n');

  const r = reconcile({ cwd: dir });
  assert.strictEqual(r.mirror, null);
  assert.strictEqual(r.worktrees, null);
  assert.deepStrictEqual(r.skipped, [{ check: 'all', reason: 'local-merge-model' }]);
});

test('reconcile: no network / no remote resolves to no-remote, never crashes (AC4)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-noremote-'));
  git(['init', '-q'], dir);
  fs.mkdirSync(path.join(dir, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude-tweaks', 'policy.yml'), 'integration-model: pr-first\n');

  const r = reconcile({ cwd: dir });
  assert.deepStrictEqual(r.skipped, [{ check: 'all', reason: 'no-remote' }]);
});

test('reconcile: outside any repo resolves to no-repo, never crashes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-norepo-'));
  const r = reconcile({ cwd: dir });
  assert.deepStrictEqual(r.skipped, [{ check: 'all', reason: 'no-repo' }]);
});

test('reconcile: checks filter runs only the requested subset', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-checks-'));
  git(['init', '-q'], dir);
  fs.mkdirSync(path.join(dir, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude-tweaks', 'policy.yml'), 'integration-model: local-merge\n');

  const r = reconcile({ cwd: dir, checks: ['mirror'] });
  // Still gated on local-merge before any per-check dispatch — proves the
  // model gate runs before the checks filter is even consulted.
  assert.deepStrictEqual(r.skipped, [{ check: 'all', reason: 'local-merge-model' }]);
});

// --- hooks.js verb: garbage-stdin invariant + JSON shape (AC5) ---

test('reconcile verb: garbage stdin still exits 0 and prints valid JSON', () => {
  // Always an isolated fixture cwd, never the ambient process cwd — a bare
  // `reconcile` with no cwd override would run for real against whatever
  // repo the test runner happens to be in (this project's own, under `npm
  // test`), including its real worktrees and claims-registry branch. The
  // module's own fail-safe design (isWorktreeLocked, no-PR skip) made that
  // safe when it happened once during authoring, but a test must not rely
  // on that — it must never reach live state in the first place.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-garbage-'));
  const r = runHook(['reconcile'], { input: '%%%not json%%%', cwd: dir });
  assert.strictEqual(r.code, 0);
  assert.doesNotThrow(() => JSON.parse(r.stdout));
  assert.deepStrictEqual(JSON.parse(r.stdout).skipped, [{ check: 'all', reason: 'no-repo' }]);
});

test('reconcile verb: --dry-run is accepted and never mutates on a no-remote fixture', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-hook-'));
  git(['init', '-q'], dir);
  fs.mkdirSync(path.join(dir, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude-tweaks', 'policy.yml'), 'integration-model: pr-first\n');
  const r = runHook(['reconcile', '--dry-run'], { cwd: dir });
  assert.strictEqual(r.code, 0);
  const parsed = JSON.parse(r.stdout);
  assert.deepStrictEqual(parsed.skipped, [{ check: 'all', reason: 'no-remote' }]);
});
