'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS = path.join(__dirname, '..', 'plugin', 'bin', 'hooks.js');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

// #1130: never let an omitted cwd fall through to the spawned subprocess's
// own process.cwd() — that is the test runner's real working directory, and
// when npm test runs from a real checkout, hooks that walk
// .claude-tweaks/pipelines/ from there write fixture events into REAL run
// dirs (the #657 pollution incident). Calls that don't care about cwd get an
// isolated, non-git sandbox instead.
const HOOK_SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-archrun-sandbox-'));

function runHook(args, { cwd = HOOK_SANDBOX, env = {} } = {}) {
  try {
    const stdout = execFileSync('node', [HOOKS, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '' };
  }
}

function runDirFixture(status) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-archrun-')));
  git(['init', '-q', '--initial-branch=main'], root);
  git(['config', 'user.email', 'test@example.com'], root);
  git(['config', 'user.name', 'Test'], root);
  fs.writeFileSync(path.join(root, 'a.txt'), 'one\n');
  git(['add', 'a.txt'], root);
  git(['commit', '-q', '-m', 'seed'], root);

  const runId = '2026-08-14T120000-spec-999';
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', runId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'config.yml'), 'x: 1\n');
  fs.writeFileSync(path.join(runDir, 'decisions.md'), '# decisions\n');
  fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify({ status }));

  return { root, runDir, runId };
}

test('archive-run: refuses a run with status active, naming close-run as the prerequisite', () => {
  const { root, runDir } = runDirFixture('active');
  const result = runHook(['archive-run', '--run', runDir], { cwd: root });
  assert.match(result.stdout, /close-run/);
  assert.ok(fs.existsSync(path.join(runDir, 'config.yml')));
});

test('archive-run: refuses a run with status interrupted', () => {
  const { root, runDir } = runDirFixture('interrupted');
  const result = runHook(['archive-run', '--run', runDir], { cwd: root });
  assert.match(result.stdout, /interrupted/);
  assert.ok(fs.existsSync(runDir));
});

test('archive-run: refuses a run dir with no run-state.json, naming archiveOrphanedMint', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-archrun-orphan-')));
  git(['init', '-q', '--initial-branch=main'], root);
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-08-14T120000-spec-orphan');
  fs.mkdirSync(runDir, { recursive: true });
  const result = runHook(['archive-run', '--run', runDir], { cwd: root });
  assert.match(result.stdout, /archiveOrphanedMint/);
});

test('archive-run: archives a clean fixture and prints one moved: line per entry', () => {
  const { root, runDir, runId } = runDirFixture('clean');
  const result = runHook(['archive-run', '--run', runDir], { cwd: root });
  assert.match(result.stdout, /moved: config\.yml/);
  assert.match(result.stdout, /moved: decisions\.md/);
  assert.ok(!fs.existsSync(runDir));
  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  assert.ok(fs.existsSync(path.join(archiveDir, 'config.yml')));
});

test('archive-run: never prints a moved: line for a name absent from the fixture (no hardcoded list)', () => {
  const { root, runDir } = runDirFixture('clean');
  const result = runHook(['archive-run', '--run', runDir], { cwd: root });
  // This fixture never creates manifest.yml/events.jsonl/console.json/staged —
  // a hardcoded fixed-list printer would still claim they were moved.
  assert.doesNotMatch(result.stdout, /moved: manifest\.yml/);
  assert.doesNotMatch(result.stdout, /moved: events\.jsonl/);
  assert.doesNotMatch(result.stdout, /moved: console\.json/);
  assert.doesNotMatch(result.stdout, /moved: staged/);
});

test('cleanup-procedures-execution.md Section B invokes archive-run instead of a hand-run recipe', () => {
  const text = fs.readFileSync(
    path.join(__dirname, '..', 'plugin', 'skills', 'wrap-up', 'cleanup-procedures-execution.md'),
    'utf8',
  );
  const bStart = text.indexOf('## B.');
  const cStart = text.indexOf('## C.');
  assert.ok(bStart !== -1 && cStart !== -1, 'Section B/C headings must exist');
  const sectionB = text.slice(bStart, cStart);
  assert.ok(sectionB.includes('hooks.js" archive-run'), 'Section B must invoke the archive-run verb');
  assert.ok(!/\bgit mv\b/.test(sectionB), 'Section B must not hand-run git mv anymore');
  assert.ok(!/\bmv\s+"\$RUN_DIR"/.test(sectionB), 'Section B must not hand-run a raw mv on $RUN_DIR anymore');
});
