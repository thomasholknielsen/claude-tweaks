'use strict';
// bin/lib/wrap-up/tests/engine-cli.test.js — exercises bin/wrap-up-engine.js
// end to end: `plan` against a real fixture git repo (same builder shape as
// facts.test.js), `record` reading a payload off stdin, and `render`
// including the --strict completeness gate. Spawns the CLI as a real child
// process (execFileSync) so exit codes are asserted the way a caller would
// actually observe them, not by calling internals in-process.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', '..', '..', 'wrap-up-engine.js');

let repoDir;
let baseSha;

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function run(args, { cwd, input } = {}) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd: cwd || repoDir,
      input: input !== undefined ? input : undefined,
      encoding: 'utf8',
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status, stdout: e.stdout || '', stderr: e.stderr || '' };
  }
}

before(() => {
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapup-engine-cli-'));
  git(['init', '-q'], repoDir);
  git(['config', 'user.email', 'test@example.com'], repoDir);
  git(['config', 'user.name', 'Test'], repoDir);

  fs.writeFileSync(
    path.join(repoDir, 'CLAUDE.md'),
    ['# Test project', '', '## Commands', '', 'npm run oldcmd', 'npm test', '', '## Other', '', 'irrelevant', ''].join('\n'),
  );
  fs.mkdirSync(path.join(repoDir, 'docs', 'journeys'), { recursive: true });
  fs.writeFileSync(
    path.join(repoDir, 'docs', 'journeys', 'j1.md'),
    ['---', 'title: Journey 1', 'files:', '  - src-a.js', '  - src-b.js', '---', '', '# Journey 1', ''].join('\n'),
  );
  fs.mkdirSync(path.join(repoDir, '.claude', 'skills'), { recursive: true });
  fs.writeFileSync(path.join(repoDir, '.claude', 'skills', 's1.md'), '# Skill 1\n');
  fs.writeFileSync(path.join(repoDir, 'docs', 'guide.md'), '# Guide\n');

  git(['add', '.'], repoDir);
  git(['commit', '-q', '-m', 'base'], repoDir);
  baseSha = git(['rev-parse', 'HEAD'], repoDir);

  // Second commit: rename a file (renamedOrDeleted), change CLAUDE.md's
  // Commands section (claudeMdCommandRenamed), and touch 2 new files that
  // overlap j1.md's `files:` list (multiFileDiff + a frontmatter-overlap
  // candidate for the journeys row).
  git(['mv', 'docs/guide.md', 'docs/guide2.md'], repoDir);
  fs.writeFileSync(
    path.join(repoDir, 'CLAUDE.md'),
    ['# Test project', '', '## Commands', '', 'npm test', '', '## Other', '', 'irrelevant', ''].join('\n'),
  );
  fs.writeFileSync(path.join(repoDir, 'src-a.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(repoDir, 'src-b.js'), 'module.exports = 2;\n');
  git(['add', '.'], repoDir);
  git(['commit', '-q', '-m', 'second'], repoDir);
});

after(() => {
  fs.rmSync(repoDir, { recursive: true, force: true });
});

function makeRunDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wrapup-engine-rundir-'));
}

function readState(runDir) {
  return JSON.parse(fs.readFileSync(path.join(runDir, 'engine-state.json'), 'utf8'));
}

// ---- plan -----------------------------------------------------------------

test('plan writes engine-state.json and prints parseable worklist JSON with 8 rows', () => {
  const runDir = makeRunDir();
  const r = run(['plan', '--run-dir', runDir, '--base', baseSha, '--dry-run']);
  assert.strictEqual(r.status, 0, r.stderr);

  const worklist = JSON.parse(r.stdout);
  assert.strictEqual(worklist.rows.length, 8);

  assert.ok(fs.existsSync(path.join(runDir, 'engine-state.json')));
  const state = readState(runDir);
  assert.strictEqual(state.worklist.rows.length, 8);
});

test('plan resolves the journeys row scope from frontmatter file overlap', () => {
  const runDir = makeRunDir();
  const r = run(['plan', '--run-dir', runDir, '--base', baseSha, '--dry-run']);
  assert.strictEqual(r.status, 0, r.stderr);
  const worklist = JSON.parse(r.stdout);
  const journeysRow = worklist.rows.find((row) => row.id === 'journeys');
  assert.strictEqual(journeysRow.gate, 'open');
  assert.deepStrictEqual(journeysRow.scope.candidates, ['docs/journeys/j1.md']);
});

test('plan --signals with malformed JSON exits 2 with a stderr reason', () => {
  const runDir = makeRunDir();
  const r = run(['plan', '--run-dir', runDir, '--base', baseSha, '--signals', '{not-json', '--dry-run']);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /--signals is not valid JSON/);
  assert.strictEqual(r.stdout, '');
});

test('plan without --base or --run-dir exits 2 with usage on stderr', () => {
  const r1 = run(['plan', '--base', baseSha]);
  assert.strictEqual(r1.status, 2);
  assert.match(r1.stderr, /usage: wrap-up-engine\.js/);

  const r2 = run(['plan', '--run-dir', makeRunDir()]);
  assert.strictEqual(r2.status, 2);
  assert.match(r2.stderr, /usage: wrap-up-engine\.js/);
});

test('plan without --dry-run appends telemetry under the resolved repo root', () => {
  // In this fixture, repoDir is a normal (non-worktree) checkout, so
  // `git rev-parse --git-common-dir`'s parent resolves to repoDir itself.
  const runDir = makeRunDir();
  const telemetryPath = path.join(repoDir, '.claude-tweaks', 'wrap-up-outcomes.tsv');
  assert.strictEqual(fs.existsSync(telemetryPath), false);

  const r = run(['plan', '--run-dir', runDir, '--base', baseSha]);
  assert.strictEqual(r.status, 0, r.stderr);

  assert.ok(fs.existsSync(telemetryPath));
  const tsv = fs.readFileSync(telemetryPath, 'utf8');
  assert.ok(tsv.length > 0);
});

// ---- record -----------------------------------------------------------

function planFreshRunDir() {
  const runDir = makeRunDir();
  const r = run(['plan', '--run-dir', runDir, '--base', baseSha, '--dry-run']);
  assert.strictEqual(r.status, 0, r.stderr);
  return runDir;
}

test('record with a valid payload on stdin appends a SCANNED line, prints it, and exits 0', () => {
  const runDir = planFreshRunDir();
  const before = fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8').trim().split('\n').length;

  const payload = JSON.stringify({
    version: 1, rowId: 'skills', result: 'clean',
    read: [{ path: '.claude/skills/s1.md', mode: 'full' }],
    findings: [], gapDetection: 'run', detail: 'nothing to change',
  });
  const r = run(['record', '--run-dir', runDir, '--dry-run'], { input: payload });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /^SCANNED .* — Skills: gate open/);

  const after = fs.readFileSync(path.join(runDir, 'decisions.md'), 'utf8').trim().split('\n');
  assert.strictEqual(after.length, before + 1);

  const state = readState(runDir);
  assert.strictEqual(state.results.skills.result, 'clean');
});

test('record with garbage stdin exits 1 (not 0, not 2) with a reason on stderr', () => {
  const runDir = planFreshRunDir();
  const r = run(['record', '--run-dir', runDir, '--dry-run'], { input: '{not-json' });
  assert.strictEqual(r.status, 1);
  assert.notStrictEqual(r.status, 0);
  assert.notStrictEqual(r.status, 2);
  assert.match(r.stderr, /not valid JSON/);
  assert.strictEqual(r.stdout, '');
});

test('record without --run-dir exits 2', () => {
  const payload = JSON.stringify({ version: 1, rowId: 'skills', result: 'clean', gapDetection: 'run' });
  const r = run(['record'], { input: payload });
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /usage: wrap-up-engine\.js/);
});

test('record against a run dir with no engine-state.json exits 2 (not 1, not 0), naming engine-state.json', () => {
  const runDir = makeRunDir(); // never plan'd — no engine-state.json
  const payload = JSON.stringify({ version: 1, rowId: 'skills', result: 'clean', gapDetection: 'run' });
  const r = run(['record', '--run-dir', runDir, '--dry-run'], { input: payload });
  assert.strictEqual(r.status, 2);
  assert.notStrictEqual(r.status, 1);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /engine-state\.json/);
  assert.strictEqual(r.stdout, '');
});

test('record rejects a payload that fails engine-record validation with exit 1', () => {
  const runDir = planFreshRunDir();
  const payload = JSON.stringify({ version: 1, rowId: 'skills', result: 'bogus', gapDetection: 'run' });
  const r = run(['record', '--run-dir', runDir, '--dry-run'], { input: payload });
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /result/);
});

// ---- render -----------------------------------------------------------

test('render --section trace contains the pinned header row', () => {
  const runDir = planFreshRunDir();
  const r = run(['render', '--run-dir', runDir, '--section', 'trace']);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /\| Target \| Result \| Detail \|/);
});

test('render defaults to the trace section when --section is omitted', () => {
  const runDir = planFreshRunDir();
  const r = run(['render', '--run-dir', runDir]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /\| Target \| Result \| Detail \|/);
});

test('render --strict exits 2 while open rows are unrecorded, and 0 once all are recorded', () => {
  const runDir = planFreshRunDir();

  const strictBefore = run(['render', '--run-dir', runDir, '--strict']);
  assert.strictEqual(strictBefore.status, 2);
  // Printed BEFORE the fatal exit — the hole is visible, not just fatal.
  assert.match(strictBefore.stdout, /\| Target \| Result \| Detail \|/);

  const worklist = JSON.parse(fs.readFileSync(path.join(runDir, 'engine-state.json'), 'utf8')).worklist;
  const openRows = worklist.rows.filter((row) => row.gate === 'open');
  assert.ok(openRows.length > 0, 'fixture must have at least one open row');

  for (const row of openRows) {
    const payload = JSON.stringify({
      version: 1, rowId: row.id, result: 'clean', read: [], findings: [], gapDetection: 'not-run', detail: 'nothing to change',
    });
    const rr = run(['record', '--run-dir', runDir, '--dry-run'], { input: payload });
    assert.strictEqual(rr.status, 0, rr.stderr);
  }

  const strictAfter = run(['render', '--run-dir', runDir, '--strict']);
  assert.strictEqual(strictAfter.status, 0, strictAfter.stderr);
});

test('render without --run-dir exits 2', () => {
  const r = run(['render']);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /usage: wrap-up-engine\.js/);
});

test('render against a run dir with no engine-state.json exits 2', () => {
  const runDir = makeRunDir();
  const r = run(['render', '--run-dir', runDir]);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /engine-state\.json/);
});

test('unknown verb exits 2 with usage', () => {
  const r = run(['bogus-verb']);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /usage: wrap-up-engine\.js/);
});
