'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const cp = require('child_process');
// Destructured at require time, so this binding is a snapshot of the REAL
// implementation — it stays callable as the pass-through inside the
// compound-failure test's `t.mock.method(cp, 'execFileSync', ...)` below.
const { execFileSync } = cp;
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  archiveRunDir, listSpecDirs, decideArchive, readConsoleState, isOrphanedMint, trackArchiveResult,
} = require('../../../plugin/bin/lib/reconcile/archive-merged');
const { RESIDUE_ESCALATE_THRESHOLD, listResidueFailures } = require('../../../plugin/bin/lib/reconcile/cache');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function trackedFiles(root) {
  return git(root, 'ls-files').split('\n').filter(Boolean);
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-merged-'));
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-m', 'init');
  return dir;
}

function commitPath(root, relPath, content) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  git(root, 'add', relPath);
  git(root, 'commit', '-m', `add ${relPath}`);
}

// Forces a REAL `git commit` failure via a failing pre-commit hook — the same
// class of real-world cause named in #652's Technical Approach (gpgsign
// requirement, a failing pre-commit/commit-msg hook, a policy gate) — rather
// than mocking `runGit` (archive-merged.js destructures `runGit` at require
// time, so a `t.mock.method` on the git-exec module's exported property
// wouldn't be observed by archive-merged.js's already-bound reference).
// The compound-failure test below takes a different tack — mocking
// `child_process.execFileSync` itself, which git-exec.js's `runGit` calls via
// property access at call time (`cp.execFileSync(...)`, not a destructured
// const — see that file's own header comment) — since forcing `git reset`
// itself to fail has no equivalent real-hook mechanism (`reset` has no
// `pre-reset` hook the way `commit` does).
function installFailingPreCommitHook(root) {
  const hookPath = path.join(root, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hookPath, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
}

function removePreCommitHook(root) {
  fs.rmSync(path.join(root, '.git', 'hooks', 'pre-commit'), { force: true });
}

// #593 AC: archiving a run dir with a tracked work/*-spec.md file removes the
// old pre-archive path from BOTH disk and the git index, and the archived
// copy exists and is tracked at the new path — single-spec layout.
test('archiveRunDir: single-spec run — git-tracked work/ moves via git mv, gone from disk + index at old path', () => {
  const root = makeRepo();
  const runId = '2026-08-01T090000-spec-42';
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', runId);
  commitPath(root, `.claude-tweaks/pipelines/${runId}/work/42-spec.md`, '# spec 42\n');
  fs.writeFileSync(path.join(runDir, 'config.yml'), 'auto-mode: true\n');
  fs.writeFileSync(path.join(runDir, 'decisions.md'), '# decisions\n');
  fs.writeFileSync(path.join(runDir, 'events.jsonl'), '{"type":"start"}\n');
  fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify({ status: 'active' }));

  const result = archiveRunDir(root, runDir);
  assert.equal(result.ok, true, JSON.stringify(result));

  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);

  // Old path: gone from disk entirely.
  assert.equal(fs.existsSync(runDir), false, 'old run dir must not survive on disk');

  // Old path: gone from the git index (the actual defect — a plain
  // fs.renameSync leaves the tracked file registered at the old path, so a
  // later `git checkout`/merge resurrects it there).
  const tracked = trackedFiles(root);
  assert.equal(
    tracked.includes(`.claude-tweaks/pipelines/${runId}/work/42-spec.md`),
    false,
    'old path must not remain tracked in the git index',
  );

  // New path: archived copy exists on disk and is tracked.
  assert.equal(fs.existsSync(path.join(archiveDir, 'work', '42-spec.md')), true);
  assert.ok(
    tracked.includes(`.claude-tweaks/pipelines/archive/${runId}/work/42-spec.md`),
    'archived copy must be tracked at the new path',
  );

  // Gitignored siblings moved too.
  assert.equal(fs.existsSync(path.join(archiveDir, 'config.yml')), true);
  assert.equal(fs.existsSync(path.join(archiveDir, 'decisions.md')), true);
  assert.equal(fs.existsSync(path.join(archiveDir, 'events.jsonl')), true);

  // Finalized terminal state at the archived location.
  const state = JSON.parse(fs.readFileSync(path.join(archiveDir, 'run-state.json'), 'utf8'));
  assert.equal(state.status, 'clean');
});

// #593 deliverable 2/4: multi-spec parent run dirs nest per-record
// spec-{N}/work/ subtrees (multi-spec.md's Run directory layout) — every one
// of them must move via git mv too, not just a top-level work/ that a
// multi-spec parent dir never has.
test('archiveRunDir: multi-spec parent run dir — every spec-{N}/work/ subtree moves via git mv', () => {
  const root = makeRepo();
  const runId = '2026-08-01T090000-spec-10-11';
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', runId);
  commitPath(root, `.claude-tweaks/pipelines/${runId}/spec-10/work/10-spec.md`, '# spec 10\n');
  commitPath(root, `.claude-tweaks/pipelines/${runId}/spec-11/work/11-spec.md`, '# spec 11\n');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'manifest.yml'), 'specs: []\n');
  fs.writeFileSync(path.join(runDir, 'config.yml'), 'auto-mode: true\n');
  fs.writeFileSync(path.join(runDir, 'decisions.md'), '# decisions\n');
  fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify({ status: 'active' }));
  fs.writeFileSync(path.join(runDir, 'spec-10', 'config.yml'), 'auto-mode: true\n');
  fs.writeFileSync(path.join(runDir, 'spec-10', 'decisions.md'), '# spec 10 decisions\n');
  fs.writeFileSync(path.join(runDir, 'spec-11', 'config.yml'), 'auto-mode: true\n');
  fs.writeFileSync(path.join(runDir, 'spec-11', 'decisions.md'), '# spec 11 decisions\n');

  assert.deepEqual(listSpecDirs(runDir).sort(), ['spec-10', 'spec-11']);

  const result = archiveRunDir(root, runDir);
  assert.equal(result.ok, true, JSON.stringify(result));

  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  const tracked = trackedFiles(root);

  for (const n of [10, 11]) {
    // Old path gone from disk and the index.
    assert.equal(fs.existsSync(path.join(runDir, `spec-${n}`)), false, `spec-${n}/ must not survive on disk`);
    assert.equal(
      tracked.includes(`.claude-tweaks/pipelines/${runId}/spec-${n}/work/${n}-spec.md`),
      false,
      `spec-${n}/work/${n}-spec.md must not remain tracked at the old path`,
    );
    // New path exists on disk and is tracked.
    assert.equal(fs.existsSync(path.join(archiveDir, `spec-${n}`, 'work', `${n}-spec.md`)), true);
    assert.ok(
      tracked.includes(`.claude-tweaks/pipelines/archive/${runId}/spec-${n}/work/${n}-spec.md`),
      `spec-${n}/work/${n}-spec.md must be tracked at the archived path`,
    );
    // Per-spec gitignored siblings moved too.
    assert.equal(fs.existsSync(path.join(archiveDir, `spec-${n}`, 'config.yml')), true);
    assert.equal(fs.existsSync(path.join(archiveDir, `spec-${n}`, 'decisions.md')), true);
  }

  // Parent-level gitignored files moved.
  assert.equal(fs.existsSync(path.join(archiveDir, 'manifest.yml')), true);
  assert.equal(fs.existsSync(path.join(archiveDir, 'config.yml')), true);
  assert.equal(fs.existsSync(path.join(archiveDir, 'decisions.md')), true);

  const state = JSON.parse(fs.readFileSync(path.join(archiveDir, 'run-state.json'), 'utf8'));
  assert.equal(state.status, 'clean');

  // Old parent dir fully gone.
  assert.equal(fs.existsSync(runDir), false);
});

test('archiveRunDir: single-spec run with no work/ (mint or pre-materialize) still archives gitignored content, no git-mv attempted', () => {
  const root = makeRepo();
  const runId = '2026-08-01T090000-spec-99';
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', runId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify({ status: 'active' }));

  const result = archiveRunDir(root, runDir);
  assert.equal(result.ok, true, JSON.stringify(result));
  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  assert.equal(fs.existsSync(path.join(archiveDir, 'run-state.json')), true);
  assert.equal(fs.existsSync(runDir), false);
});

// #652 AC 1: a commit failure after a successful git mv must not leave the
// main checkout's tracked working tree dirty — the old path must be restored
// on disk AND in the index, not just left as an uncommitted rename.
test('archiveRunDir: git mv succeeds but git commit fails — reverts on disk and in the index, leaving the tree clean', () => {
  const root = makeRepo();
  const runId = '2026-08-01T090000-spec-77';
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', runId);
  commitPath(root, `.claude-tweaks/pipelines/${runId}/work/77-spec.md`, '# spec 77\n');
  fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify({ status: 'active' }));

  // No cleanup needed: the hook lives inside this test's own throwaway repo.
  installFailingPreCommitHook(root);
  const result = archiveRunDir(root, runDir);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.reason, 'commit-failed');

  // Old path restored on disk.
  assert.equal(
    fs.existsSync(path.join(runDir, 'work', '77-spec.md')),
    true,
    'old work/77-spec.md must be restored on disk after a commit failure',
  );
  assert.equal(
    fs.readFileSync(path.join(runDir, 'work', '77-spec.md'), 'utf8'),
    '# spec 77\n',
  );

  // Old path restored in the index — no staged rename survives the pass.
  const tracked = trackedFiles(root);
  assert.ok(
    tracked.includes(`.claude-tweaks/pipelines/${runId}/work/77-spec.md`),
    'old path must remain tracked in the index after a reverted commit failure',
  );

  // New (archive) path must not exist — the rename was fully undone.
  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  assert.equal(fs.existsSync(path.join(archiveDir, 'work', '77-spec.md')), false);

  // The tracked working tree (staged + unstaged) is clean for the path this
  // pass touched — no leftover deletion or addition from the aborted git mv.
  // Scoped to `--` status of the tracked area only: `run-state.json` is a
  // genuine untracked sibling in this test fixture (in the real repo it's
  // gitignored) and unrelated to the revert this test is pinning.
  const statusOut = git(root, 'status', '--porcelain', '--', '.claude-tweaks/pipelines');
  const trackedStatusLines = statusOut
    .split('\n')
    .filter((line) => line && !line.startsWith('??'));
  assert.equal(
    trackedStatusLines.join('\n'),
    '',
    `expected no staged/modified tracked entries, got:\n${statusOut}`,
  );
});

// #652 AC 2: once the commit-failure cause is resolved, the next reconcile
// pass must complete the archive — proving the retry guard
// (`fs.existsSync(topWork)`) still sees the restored path and isn't
// permanently stuck skipping this run.
test('archiveRunDir: second pass after the commit-failure cause is resolved completes the archive', () => {
  const root = makeRepo();
  const runId = '2026-08-01T090000-spec-78';
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', runId);
  commitPath(root, `.claude-tweaks/pipelines/${runId}/work/78-spec.md`, '# spec 78\n');
  fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify({ status: 'active' }));

  installFailingPreCommitHook(root);
  const firstPass = archiveRunDir(root, runDir);
  assert.equal(firstPass.ok, false);
  assert.equal(firstPass.reason, 'commit-failed');
  removePreCommitHook(root);

  const secondPass = archiveRunDir(root, runDir);
  assert.equal(secondPass.ok, true, JSON.stringify(secondPass));

  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  assert.equal(fs.existsSync(path.join(archiveDir, 'work', '78-spec.md')), true);
  assert.equal(fs.existsSync(runDir), false);
  const tracked = trackedFiles(root);
  assert.ok(tracked.includes(`.claude-tweaks/pipelines/archive/${runId}/work/78-spec.md`));
  assert.equal(
    tracked.includes(`.claude-tweaks/pipelines/${runId}/work/78-spec.md`),
    false,
  );
});

// #652 review finding (critical, converged across 3 independent lens agents):
// revertWorkMoves ignored `git reset`'s result and unconditionally ran
// fs.renameSync next — under the same lock-contention cause that can fail
// `git commit`, `git reset` could plausibly fail too, and moving the file
// back on disk while the index still holds the old staged rename would
// desync disk from index (worse than the original bug: a coherent staged
// rename becomes an incoherent one). The fix: only move the file back when
// `git reset` actually succeeded; on reset failure, leave that pair exactly
// where `git mv` put it (still consistent — matches the original bug's
// state, not a new mismatched one) and report a distinguishable reason.
test('archiveRunDir: commit fails AND the revert reset also fails — file is not moved back (no disk/index desync), reason distinguishes partial revert', (t) => {
  const root = makeRepo();
  const runId = '2026-08-01T090000-spec-79';
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', runId);
  commitPath(root, `.claude-tweaks/pipelines/${runId}/work/79-spec.md`, '# spec 79\n');
  fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify({ status: 'active' }));

  t.mock.method(cp, 'execFileSync', (cmd, args, opts) => {
    const failingVerb = cmd === 'git' && Array.isArray(args)
      && args.find((a) => a === 'commit' || a === 'reset');
    if (failingVerb) throw new Error(`simulated failure: git ${failingVerb}`);
    return execFileSync(cmd, args, opts);
  });

  const result = archiveRunDir(root, runDir);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.equal(result.reason, 'commit-failed-partial-revert');

  // The file stays at the archive (dest) location — NOT moved back — since
  // the reset that would have made moving it back safe also failed.
  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  assert.equal(
    fs.existsSync(path.join(archiveDir, 'work', '79-spec.md')),
    true,
    'file must stay at the archive path when reset fails — moving it back would desync disk from the still-staged index',
  );
  assert.equal(
    fs.existsSync(path.join(runDir, 'work', '79-spec.md')),
    false,
    'old path must NOT be resurrected on disk when the index was never actually unstaged',
  );
});

test('listSpecDirs: only spec-* subdirectories, ignores files and non-matching dirs; empty for unreadable dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'list-spec-dirs-'));
  fs.mkdirSync(path.join(dir, 'spec-1'));
  fs.mkdirSync(path.join(dir, 'spec-2'));
  fs.mkdirSync(path.join(dir, 'staged'));
  fs.writeFileSync(path.join(dir, 'spec-not-a-dir.txt'), 'x');
  assert.deepEqual(listSpecDirs(dir).sort(), ['spec-1', 'spec-2']);
  assert.deepEqual(listSpecDirs(path.join(dir, 'does-not-exist')), []);
});

// Re-pin the existing exports still resolve after the refactor above touched
// the same module — a regression here would mean the export list drifted.
test('archive-merged module still exports its pre-existing surface', () => {
  assert.equal(typeof decideArchive, 'function');
  assert.equal(typeof readConsoleState, 'function');
  assert.equal(typeof isOrphanedMint, 'function');
});

// #644 Deliverable 2 — trackArchiveResult is archiveMerged's one choke
// point for the move-failed consecutive-failure counter and escalation.
test('trackArchiveResult: escalates exactly once at the threshold via an injected escalate, never on later still-failing calls', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-merged-track-'));
  const calls = [];
  const escalate = (args) => { calls.push(args); return { status: 'filed', number: 1 }; };
  const dir = path.join(root, '.claude-tweaks', 'pipelines', '2026-01-01T000000-stuck');

  for (let i = 0; i < RESIDUE_ESCALATE_THRESHOLD; i++) {
    trackArchiveResult(root, 'o/r', dir, { ok: false, reason: 'move-failed' }, { escalate });
  }
  assert.equal(calls.length, 1, `expected exactly one escalation call, got ${calls.length}`);
  assert.equal(calls[0].reason, 'move-failed');
  assert.equal(calls[0].targetPath, dir);
  assert.equal(calls[0].count, RESIDUE_ESCALATE_THRESHOLD);

  trackArchiveResult(root, 'o/r', dir, { ok: false, reason: 'move-failed' }, { escalate });
  assert.equal(calls.length, 1, 'must not re-escalate on a later still-failing call');
});

test('trackArchiveResult: only tracks move-failed — a different failure reason never enters the counter', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-merged-track2-'));
  const dir = path.join(root, '.claude-tweaks', 'pipelines', '2026-01-01T000000-other');
  trackArchiveResult(root, 'o/r', dir, { ok: false, reason: 'commit-failed' });
  assert.deepEqual(listResidueFailures(root), []);
});

test('trackArchiveResult: a success clears a prior failure streak for the same dir', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-merged-track3-'));
  const dir = path.join(root, '.claude-tweaks', 'pipelines', '2026-01-01T000000-recovered');
  trackArchiveResult(root, 'o/r', dir, { ok: false, reason: 'move-failed' });
  assert.equal(listResidueFailures(root).length, 1);
  trackArchiveResult(root, 'o/r', dir, { ok: true, movedEntries: [] });
  assert.deepEqual(listResidueFailures(root), []);
});
