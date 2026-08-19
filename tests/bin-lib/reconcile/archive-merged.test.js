'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  archiveRunDir, listSpecDirs, decideArchive, readConsoleState, isOrphanedMint,
} = require('../../../plugin/bin/lib/reconcile/archive-merged');

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
