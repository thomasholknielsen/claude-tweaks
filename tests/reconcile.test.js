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

test('classifyMirror: skipFetch=true never calls fetch, trusts already-fetched refs', () => {
  const { originDir, mainDir } = pairedFixture();
  git(['fetch', 'origin'], mainDir); // caller already fetched, simulating the shared-fetch path
  // Point origin at an invalid URL so a *second* fetch attempt would fail —
  // if classifyMirror still fetched despite skipFetch, this would surface as
  // a non-null failure instead of the 'current' state proven by the fetch above.
  git(['remote', 'set-url', 'origin', 'https://example.invalid/nope.git'], mainDir);
  const result = classifyMirror(mainDir, 'main', { skipFetch: true });
  assert.equal(result.state, 'current');
  assert.equal(result.failure, null);
  void originDir;
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

test('mirrorFastForward: a concurrent session on a different branch is never merged into — skipped, not silently ff-ed', () => {
  const { seedDir, mainDir } = pairedFixture();
  fs.writeFileSync(path.join(seedDir, 'b.txt'), 'two\n');
  git(['add', 'b.txt'], seedDir);
  git(['commit', '-q', '-m', 'second'], seedDir);
  git(['push', '-q', 'origin', 'main'], seedDir);

  // classifyMirror's rev-list comparison is ref-to-ref and reports 'behind'
  // regardless of what's checked out — the guard has to catch it downstream,
  // at the write itself, not by changing the classification.
  git(['checkout', '-q', '-b', 'someone-elses-work'], mainDir);
  const before = git(['rev-parse', 'HEAD'], mainDir).trim();

  const r = mirrorFastForward(mainDir, 'main');
  assert.strictEqual(r.state, 'behind');
  assert.strictEqual(r.action, 'skipped');
  assert.match(r.reason, /wrong-branch/);
  assert.strictEqual(git(['branch', '--show-current'], mainDir).trim(), 'someone-elses-work');
  assert.strictEqual(git(['rev-parse', 'HEAD'], mainDir).trim(), before);
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

// --- archiveRunDir: real git fixture — the actual move/commit I/O, not just the pure decision table ---

function runDirFixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-archive-')));
  git(['init', '-q', '--initial-branch=main'], root);
  git(['config', 'user.email', 'test@example.com'], root);
  git(['config', 'user.name', 'Test'], root);
  fs.writeFileSync(path.join(root, 'a.txt'), 'one\n');
  git(['add', 'a.txt'], root);
  git(['commit', '-q', '-m', 'seed'], root);

  const runId = '2026-08-14T120000-spec-999';
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', runId);
  fs.mkdirSync(path.join(runDir, 'work'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'work', '999-spec.md'), '# 999\n');
  git(['add', path.join('.claude-tweaks', 'pipelines', runId, 'work', '999-spec.md')], root);
  git(['commit', '-q', '-m', 'materialize #999'], root);

  fs.writeFileSync(path.join(runDir, 'config.yml'), 'x: 1\n');
  fs.writeFileSync(path.join(runDir, 'decisions.md'), '# decisions\n');
  fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify({ status: 'active', worktree: '/some/worktree' }));

  return { root, runDir, runId };
}

test('archiveRunDir: the git mv of work/ is committed, not left staged (no uncommitted rename after archival)', () => {
  const { archiveRunDir } = require('../bin/lib/reconcile/archive-merged');
  const { root, runDir, runId } = runDirFixture();

  const result = archiveRunDir(root, runDir);
  assert.strictEqual(result.ok, true);

  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  const archivedWorkRel = path.relative(root, path.join(archiveDir, 'work'));
  const oldWorkRel = path.relative(root, path.join(runDir, 'work'));
  assert.ok(fs.existsSync(path.join(archiveDir, 'work', '999-spec.md')));
  assert.ok(!fs.existsSync(path.join(runDir, 'work')));
  // config.yml/decisions.md/run-state.json are plain (never git-tracked, same
  // as .gitignore's real-repo rule) — only the git-mv'd work/ path is checked
  // for cleanliness here, since that's the actual write this test pins.
  assert.strictEqual(git(['status', '--porcelain', '--', archivedWorkRel, oldWorkRel], root).trim(), '');
  assert.strictEqual(git(['ls-files', '--', archivedWorkRel], root).trim(),
    path.join(archivedWorkRel, '999-spec.md'));
  assert.match(git(['log', '-1', '--format=%s'], root).trim(), /archive run/);
});

test('archiveRunDir: run-state.json moves to the archived location with status: clean, not left orphaned at the old path', () => {
  const { archiveRunDir } = require('../bin/lib/reconcile/archive-merged');
  const { root, runDir, runId } = runDirFixture();

  const result = archiveRunDir(root, runDir);
  assert.strictEqual(result.ok, true);

  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  const archived = JSON.parse(fs.readFileSync(path.join(archiveDir, 'run-state.json'), 'utf8'));
  assert.strictEqual(archived.status, 'clean');
  assert.strictEqual(archived.worktree, null);
  assert.ok(!fs.existsSync(path.join(runDir, 'run-state.json')));
});

test('archiveRunDir: the old run dir is removed once empty — a later iterRunDirsWithState pass never re-yields it', () => {
  const { archiveRunDir } = require('../bin/lib/reconcile/archive-merged');
  const { iterRunDirsWithState } = require('../bin/lib/hooks/context');
  const { root, runDir } = runDirFixture();

  archiveRunDir(root, runDir);
  assert.ok(!fs.existsSync(runDir));
  assert.deepStrictEqual([...iterRunDirsWithState(root)], []);
});

// --- isOrphanedMint / archiveOrphanedMint: dispatch-minted dirs that never got adopted by flow ---

function bareRepoRoot() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-orphan-')));
  git(['init', '-q', '--initial-branch=main'], root);
  git(['config', 'user.email', 'test@example.com'], root);
  git(['config', 'user.name', 'Test'], root);
  fs.writeFileSync(path.join(root, 'a.txt'), 'one\n');
  git(['add', 'a.txt'], root);
  git(['commit', '-q', '-m', 'seed'], root);
  return root;
}

function mintEmptyRunDir(root, runId, { ageMs = 0 } = {}) {
  const dir = path.join(root, '.claude-tweaks', 'pipelines', runId);
  fs.mkdirSync(dir, { recursive: true });
  if (ageMs) {
    const backdated = new Date(Date.now() - ageMs);
    fs.utimesSync(dir, backdated, backdated);
  }
  return dir;
}

test('isOrphanedMint: false when config.yml exists, regardless of age', () => {
  const { isOrphanedMint, ORPHAN_MINT_TTL_MS } = require('../bin/lib/reconcile/archive-merged');
  const root = bareRepoRoot();
  const dir = mintEmptyRunDir(root, '2026-08-01T000000-record-999', { ageMs: ORPHAN_MINT_TTL_MS * 2 });
  fs.writeFileSync(path.join(dir, 'config.yml'), 'x: 1\n');
  assert.strictEqual(isOrphanedMint(dir), false);
});

test('isOrphanedMint: false when empty but within the grace window', () => {
  const { isOrphanedMint } = require('../bin/lib/reconcile/archive-merged');
  const root = bareRepoRoot();
  const dir = mintEmptyRunDir(root, '2026-08-15T000000-record-999');
  assert.strictEqual(isOrphanedMint(dir), false);
});

test('isOrphanedMint: true when empty (no config.yml) and older than the TTL', () => {
  const { isOrphanedMint, ORPHAN_MINT_TTL_MS } = require('../bin/lib/reconcile/archive-merged');
  const root = bareRepoRoot();
  const dir = mintEmptyRunDir(root, '2026-08-01T000000-record-999', { ageMs: ORPHAN_MINT_TTL_MS + 60000 });
  assert.strictEqual(isOrphanedMint(dir), true);
});

test('archiveMerged: an orphaned mint older than the TTL is archived on the next sweep, not left in place', () => {
  const { archiveMerged, ORPHAN_MINT_TTL_MS } = require('../bin/lib/reconcile/archive-merged');
  const root = bareRepoRoot();
  const runId = '2026-08-01T120000-record-999';
  mintEmptyRunDir(root, runId, { ageMs: ORPHAN_MINT_TTL_MS + 60000 });

  const result = archiveMerged({ cwd: root });

  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  assert.ok(fs.existsSync(archiveDir), 'orphaned mint should be moved to the archive path');
  assert.ok(!fs.existsSync(path.join(root, '.claude-tweaks', 'pipelines', runId)), 'original mint dir should no longer exist');
  assert.ok(result.archived.includes(path.join(root, '.claude-tweaks', 'pipelines', runId)));
});

test('archiveMerged: an orphaned mint within the TTL is left in place, not archived', () => {
  const { archiveMerged } = require('../bin/lib/reconcile/archive-merged');
  const root = bareRepoRoot();
  const runId = '2026-08-15T120000-record-999';
  const dir = mintEmptyRunDir(root, runId);

  archiveMerged({ cwd: root });

  assert.ok(fs.existsSync(dir), 'a fresh mint should not be swept before the grace window elapses');
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

test('reconcile: local-merge project falls back to the legacy ancestry reap, skips mirror/release/archive (AC4-adjacent)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-lm-'));
  git(['init', '-q', '--initial-branch=main'], dir);
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'Test'], dir);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'one\n');
  git(['add', 'a.txt'], dir);
  git(['commit', '-q', '-m', 'seed'], dir);
  fs.mkdirSync(path.join(dir, '.claude-tweaks'), { recursive: true });
  // No remote at all (truly no-forge) — integration-branch: must be explicit
  // in policy.yml for resolveIntegrationBranch to succeed, since there is no
  // origin/HEAD to fall back to. The legacy ancestry reap still needs a
  // resolved integration branch name regardless of forge reachability.
  fs.writeFileSync(
    path.join(dir, '.claude-tweaks', 'policy.yml'),
    'integration-model: local-merge\nintegration-branch: main\n',
  );

  const r = await reconcile({ cwd: dir });
  assert.strictEqual(r.mirror, null);
  assert.deepStrictEqual(r.worktrees, []); // legacy reap ran, found zero worktrees to consider
  assert.deepStrictEqual(r.skipped, [{ check: 'mirror,release,archive,archive-branches,remote-prune,console', reason: 'local-merge-model' }]);
});

test('reconcile: local-merge with no resolvable integration branch at all resolves no-remote, never crashes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-lm-noib-'));
  git(['init', '-q'], dir);
  fs.mkdirSync(path.join(dir, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude-tweaks', 'policy.yml'), 'integration-model: local-merge\n');
  const r = await reconcile({ cwd: dir });
  assert.deepStrictEqual(r.skipped, [{ check: 'all', reason: 'no-remote' }]);
});

test('reconcile: no network / no remote resolves to no-remote, never crashes (AC4)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-noremote-'));
  git(['init', '-q'], dir);
  fs.mkdirSync(path.join(dir, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude-tweaks', 'policy.yml'), 'integration-model: pr-first\n');

  const r = await reconcile({ cwd: dir });
  assert.deepStrictEqual(r.skipped, [{ check: 'all', reason: 'no-remote' }]);
});

test('reconcile: outside any repo resolves to no-repo, never crashes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-norepo-'));
  const r = await reconcile({ cwd: dir });
  assert.deepStrictEqual(r.skipped, [{ check: 'all', reason: 'no-repo' }]);
});

test('reconcile: checks filter excludes reap -> local-merge project runs nothing at all', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-checks-'));
  git(['init', '-q', '--initial-branch=main'], dir);
  fs.mkdirSync(path.join(dir, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.claude-tweaks', 'policy.yml'),
    'integration-model: local-merge\nintegration-branch: main\n',
  );

  const r = await reconcile({ cwd: dir, checks: ['mirror'] });
  // 'mirror' was requested but has no local-merge equivalent — nothing runs.
  assert.strictEqual(r.worktrees, null);
  assert.deepStrictEqual(r.skipped, [{ check: 'mirror,release,archive,archive-branches,remote-prune,console', reason: 'local-merge-model' }]);
});

test('reconcile: reap dispatches strictly after release and archive in source order (load-bearing, not incidental — #408)', () => {
  // release and archive both derive a run's branch from a live `git
  // worktree list`; reap physically removes worktrees. Running reap first
  // would starve release/archive of exactly the runs most likely to
  // qualify (a just-reaped worktree's PR is, by construction, merged).
  // Pinned structurally, the same way tests/hooks-gate-coverage.test.js
  // pins prose to code — a real ordering regression here has no other test
  // that would catch it without fabricating live PR/claim state.
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'lib', 'reconcile', 'index.js'), 'utf8');
  const releaseIdx = src.indexOf("checks.includes('release')");
  const archiveIdx = src.indexOf("checks.includes('archive')");
  const reapIdx = src.lastIndexOf("checks.includes('reap')"); // the pr-first dispatch, not the local-merge fallback above it
  assert.ok(releaseIdx > 0 && archiveIdx > 0 && reapIdx > 0);
  assert.ok(releaseIdx < reapIdx, 'release must dispatch before reap');
  assert.ok(archiveIdx < reapIdx, 'archive must dispatch before reap');
});

test('reconcile: ALL_CHECKS includes red-tip immediately after mirror', () => {
  const { ALL_CHECKS } = require('../bin/lib/reconcile');
  const mirrorIdx = ALL_CHECKS.indexOf('mirror');
  assert.strictEqual(ALL_CHECKS[mirrorIdx + 1], 'red-tip', 'red-tip must be the entry immediately after mirror');
});

test('reconcile: red-tip dispatches immediately after mirror in source order (load-bearing — reads the ref mirror-ff just fetched)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'bin', 'lib', 'reconcile', 'index.js'), 'utf8');
  const mirrorIdx = src.indexOf("checks.includes('mirror')");
  const redTipIdx = src.indexOf("checks.includes('red-tip')");
  const consoleIdx = src.indexOf("checks.includes('console')");
  assert.ok(mirrorIdx > 0 && redTipIdx > 0 && consoleIdx > 0);
  assert.ok(mirrorIdx < redTipIdx, 'mirror must dispatch before red-tip');
  assert.ok(redTipIdx < consoleIdx, 'red-tip must dispatch before console');
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

test('reconcile(): returns a thenable (async contract) even when every check stays synchronous internally', async () => {
  const { originDir, mainDir } = pairedFixture();
  git(['remote', 'set-url', 'origin', 'https://example.invalid/nope.git'], mainDir); // no gh reachable, exercised as local-merge below is enough
  const p = reconcile({ cwd: mainDir, checks: ['mirror'] });
  assert.equal(typeof p.then, 'function', 'reconcile() must return a Promise');
  const r = await p;
  assert.equal(typeof r, 'object');
  void originDir;
});

// --- preflight (#820): one upfront gh-health check gates the whole set ---

test('reconcile(): a failing GitHub-health preflight skips every requested check in one entry, never per-check timeouts (D1)', async () => {
  const { mainDir } = pairedFixture();
  // pairedFixture()'s origin is a bare local repo, not a GitHub remote, so
  // resolveIntegrationModel's forge-detection fallback would otherwise land
  // on local-merge (no gh-backed repo to detect) — force pr-first explicitly
  // so this test actually reaches the preflight, per the same pattern used
  // above at policy.yml: 'integration-model: pr-first\n'.
  fs.mkdirSync(path.join(mainDir, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(mainDir, '.claude-tweaks', 'policy.yml'), 'integration-model: pr-first\n');

  const preflight = require('../bin/lib/reconcile/preflight');
  const original = preflight.ghHealthCheck;
  preflight.ghHealthCheck = () => ({ ok: false, reason: 'github-unreachable' });
  try {
    const r = await reconcile({ cwd: mainDir, checks: ['mirror', 'release'] });
    assert.equal(r.mirror, null);
    assert.equal(r.claims, null);
    assert.deepEqual(r.skipped, [{ check: 'mirror,release', reason: 'preflight-github-unreachable' }]);
  } finally {
    preflight.ghHealthCheck = original;
  }
});

// --- wall-clock budget (#820): an exhausted budget skips the remainder ---

test('reconcile(): an exhausted wall-clock budget skips every remaining check in one entry (D4)', async () => {
  const { mainDir } = pairedFixture();
  // Same forcing as the preflight test above: pairedFixture()'s origin is a
  // bare local repo, not a real GitHub remote, so resolveIntegrationModel's
  // detectIntegrationModel fallback resolves to local-merge and short-
  // circuits before the budget is ever created. Force pr-first explicitly so
  // this test actually reaches the budget guards.
  fs.mkdirSync(path.join(mainDir, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(mainDir, '.claude-tweaks', 'policy.yml'), 'integration-model: pr-first\n');

  // Must clear the preflight gate before the budget guard is even reached —
  // stub it to succeed rather than depending on a real `gh` call reaching
  // GitHub, which the test environment cannot guarantee.
  const preflight = require('../bin/lib/reconcile/preflight');
  const originalHealth = preflight.ghHealthCheck;
  preflight.ghHealthCheck = () => ({ ok: true, reason: null });

  const budgetMod = require('../bin/lib/reconcile/budget');
  const original = budgetMod.createBudget;
  budgetMod.createBudget = () => ({ exceeded: () => true, remainingMs: () => 0 });
  try {
    const r = await reconcile({ cwd: mainDir, checks: ['mirror', 'red-tip'] });
    assert.deepEqual(r.skipped, [{ check: 'mirror,red-tip', reason: 'budget-exceeded' }]);
  } finally {
    budgetMod.createBudget = original;
    preflight.ghHealthCheck = originalHealth;
  }
});

// --- shared fetch (#820 D2): mirror and remote-prune merge into one fetch ---

test('reconcile(): mirror and remote-prune share one fetch, not two (D2)', async () => {
  const { mainDir } = pairedFixture();
  // Same forcing as the preflight/budget tests above: pairedFixture()'s
  // origin is a bare local repo, not a real GitHub remote. Committed (not
  // left as an untracked file) — unlike the preflight/budget tests, THIS
  // test needs classifyMirror to actually reach its fetch call (not bail
  // out early on `state: 'dirty'`), so `git status --porcelain` in mainDir
  // must read clean.
  fs.mkdirSync(path.join(mainDir, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(mainDir, '.claude-tweaks', 'policy.yml'), 'integration-model: pr-first\n');
  git(['add', '.claude-tweaks/policy.yml'], mainDir);
  git(['commit', '-q', '-m', 'policy'], mainDir);

  const preflight = require('../bin/lib/reconcile/preflight');
  const originalHealth = preflight.ghHealthCheck;
  preflight.ghHealthCheck = () => ({ ok: true, reason: null });

  // NOT counted via a `gitExec.runGit = stub` swap: classify.js,
  // prune-remote.js, and shared-fetch.js each do
  // `const { runGit } = require('../hooks/git-exec')` once at module load,
  // which copies the function VALUE into a local const at that instant.
  // Reassigning `gitExec.runGit` afterward only changes what a fresh
  // `require('../hooks/git-exec').runGit` property lookup returns — every
  // already-bound local `runGit` inside those three modules keeps pointing
  // at the original function, so a stub swap silently never fires and the
  // count would read 0 (or pass by accident), not discriminate the merge.
  // (Verified empirically with a throwaway destructure/mutate/call repro:
  // the destructured binding never observed the module.exports reassignment.)
  // Counting at the process-spawn boundary instead — a `git` executable
  // placed first on PATH — needs no assumption about any module's import
  // style and observes every real `git fetch` invocation.
  const wrapperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-gitwrap-'));
  const logFile = path.join(wrapperDir, 'fetch-calls.log');
  fs.writeFileSync(logFile, '');
  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const wrapperPath = path.join(wrapperDir, 'git');
  // git-exec.js always calls execFileSync('git', ['-C', cwd, ...args]) — the
  // real subcommand (fetch, status, rev-list, ...) is always positional $3.
  fs.writeFileSync(
    wrapperPath,
    `#!/bin/sh\nif [ "$3" = "fetch" ]; then\n  echo x >> "${logFile}"\nfi\nexec "${realGit}" "$@"\n`,
  );
  fs.chmodSync(wrapperPath, 0o755);

  const originalPath = process.env.PATH;
  process.env.PATH = `${wrapperDir}${path.delimiter}${originalPath}`;
  let r;
  try {
    r = await reconcile({ cwd: mainDir, checks: ['mirror', 'remote-prune'] });
  } finally {
    process.env.PATH = originalPath;
    preflight.ghHealthCheck = originalHealth;
  }

  assert.deepEqual(r.skipped, [], `expected no skipped entries, saw ${JSON.stringify(r.skipped)}`);
  const fetchCalls = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).length;
  assert.equal(fetchCalls, 1, `expected exactly one fetch, saw ${fetchCalls}`);
});
