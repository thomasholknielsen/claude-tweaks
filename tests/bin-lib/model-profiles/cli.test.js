'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'resolve-profile.js');

function run(args, cwd) {
  return JSON.parse(execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }));
}

function tmpProject(policyText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-cli-'));
  if (policyText !== null) {
    fs.mkdirSync(path.join(dir, '.claude-tweaks'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude-tweaks', 'policy.yml'), policyText);
  }
  return dir;
}

test('resolves from the table when no policy file exists', () => {
  const dir = tmpProject(null);
  assert.deepStrictEqual(run(['standard'], dir), {
    model: 'sonnet', effort: 'high', source: 'default',
    effortLine: '[Effort: high — apply high-level reasoning depth to this task.]',
  });
});

test('reads policy.yml from cwd and applies rows and stance', () => {
  const dir = tmpProject('model-profiles:\n  standard:\n    model: opus\n    effort: low\n');
  assert.strictEqual(run(['standard'], dir).model, 'opus');
  assert.strictEqual(run(['standard', '--stance', 'economy'], dir).effort, 'low'); // already at floor
});

test('frontier tally: counts prior lines, appends on frontier result only', () => {
  const dir = tmpProject(null);
  const runDir = path.join(dir, 'run');
  fs.mkdirSync(runDir);
  const tally = path.join(runDir, 'frontier-tally.log');
  const first = run(['frontier', '--run-dir', runDir], dir);
  assert.strictEqual(first.model, 'fable');
  assert.strictEqual(fs.readFileSync(tally, 'utf8').split('\n').filter(Boolean).length, 1);
  run(['frontier', '--run-dir', runDir], dir);
  run(['frontier', '--run-dir', runDir], dir);
  // fourth resolution hits the default cap of 3 → degraded, no new line
  const fourth = run(['frontier', '--run-dir', runDir], dir);
  assert.strictEqual(fourth.source, 'degraded:cap');
  assert.strictEqual(fs.readFileSync(tally, 'utf8').split('\n').filter(Boolean).length, 3);
});

// The six tests above only ever write frontier-prefixed lines, so a mutation
// probe found the `startsWith('frontier\t')` filter unguarded — counting every
// non-empty line passed all of them. Three unrelated lines must not read as
// three frontier uses against the cap.
test('frontier tally counts only frontier-prefixed lines', () => {
  const dir = tmpProject(null);
  const runDir = path.join(dir, 'run');
  fs.mkdirSync(runDir);
  fs.writeFileSync(path.join(runDir, 'frontier-tally.log'), 'note\ta\nnote\tb\nnote\tc\n');
  assert.strictEqual(run(['frontier', '--run-dir', runDir], dir).model, 'fable');
});

test('--unattended degrades frontier and appends nothing', () => {
  const dir = tmpProject(null);
  const runDir = path.join(dir, 'run');
  fs.mkdirSync(runDir);
  const r = run(['frontier', '--unattended', '--run-dir', runDir], dir);
  assert.strictEqual(r.source, 'degraded:unattended');
  assert.ok(!fs.existsSync(path.join(runDir, 'frontier-tally.log')));
});

test('unknown profile exits non-zero naming it', () => {
  const dir = tmpProject(null);
  assert.throws(
    () => execFileSync('node', [CLI, 'turbo'], { cwd: dir, encoding: 'utf8' }),
    (e) => /turbo/.test(String(e.stderr)),
  );
});

test('a value-taking flag at end-of-args exits 1 naming the flag', () => {
  const dir = tmpProject(null);
  assert.throws(
    () => execFileSync('node', [CLI, 'standard', '--stance'], { cwd: dir, encoding: 'utf8' }),
    (e) => e.status === 1 && /--stance requires a value/.test(String(e.stderr)),
  );
  assert.throws(
    () => execFileSync('node', [CLI, 'standard', '--run-dir'], { cwd: dir, encoding: 'utf8' }),
    (e) => e.status === 1 && /--run-dir requires a value/.test(String(e.stderr)),
  );
});

test('a value-taking flag does not swallow the following flag as its value', () => {
  const dir = tmpProject(null);
  assert.throws(
    () => execFileSync(
      'node', [CLI, 'frontier', '--stance', '--unattended', '--run-dir', '/tmp/x'],
      { cwd: dir, encoding: 'utf8' },
    ),
    (e) => e.status === 1 && /--stance requires a value/.test(String(e.stderr)),
  );
});

test('a failing tally append exits 1 naming the problem, with no stack trace', () => {
  const dir = tmpProject(null);
  const missing = path.join(dir, 'no', 'such', 'dir');
  assert.throws(
    () => execFileSync('node', [CLI, 'frontier', '--run-dir', missing], { cwd: dir, encoding: 'utf8' }),
    (e) => {
      const err = String(e.stderr);
      return e.status === 1
        && /cannot append frontier tally/.test(err)
        && !/\n\s+at /.test(err); // no stack frames
    },
  );
});

test('malformed policy exits non-zero naming the problem', () => {
  const dir = tmpProject('frontier-run-cap: soon\n');
  assert.throws(
    () => execFileSync('node', [CLI, 'standard'], { cwd: dir, encoding: 'utf8' }),
    (e) => /soon/.test(String(e.stderr)),
  );
});
