'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', '..', '..', 'bin', 'resolve-profile.js');

// Every pre-#763 test predates resolve-profile.js reading
// CLAUDE_CODE_SESSION_ID at all, so none of them isolate from it. Now that a
// normal (non-record-failure) resolution reads the session's failure
// blacklist, an ambient CLAUDE_CODE_SESSION_ID (this dev session has a real
// one; per the Subagent Contract, parallel Task dispatches can share one
// parent session id) would let a genuine sibling-recorded failure make these
// tests nondeterministic. Strip it by default so these subprocess calls are
// hermetic regardless of the caller's environment.
function isolatedEnv() {
  const env = { ...process.env };
  delete env.CLAUDE_CODE_SESSION_ID;
  return env;
}

function run(args, cwd) {
  return JSON.parse(execFileSync('node', [CLI, ...args], { cwd, env: isolatedEnv(), encoding: 'utf8' }));
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
    () => execFileSync('node', [CLI, 'turbo'], { cwd: dir, env: isolatedEnv(), encoding: 'utf8' }),
    (e) => /turbo/.test(String(e.stderr)),
  );
});

test('a value-taking flag at end-of-args exits 1 naming the flag', () => {
  const dir = tmpProject(null);
  assert.throws(
    () => execFileSync('node', [CLI, 'standard', '--stance'], { cwd: dir, env: isolatedEnv(), encoding: 'utf8' }),
    (e) => e.status === 1 && /--stance requires a value/.test(String(e.stderr)),
  );
  assert.throws(
    () => execFileSync('node', [CLI, 'standard', '--run-dir'], { cwd: dir, env: isolatedEnv(), encoding: 'utf8' }),
    (e) => e.status === 1 && /--run-dir requires a value/.test(String(e.stderr)),
  );
});

test('a value-taking flag does not swallow the following flag as its value', () => {
  const dir = tmpProject(null);
  assert.throws(
    () => execFileSync(
      'node', [CLI, 'frontier', '--stance', '--unattended', '--run-dir', '/tmp/x'],
      { cwd: dir, env: isolatedEnv(), encoding: 'utf8' },
    ),
    (e) => e.status === 1 && /--stance requires a value/.test(String(e.stderr)),
  );
});

test('a failing tally append exits 1 naming the problem, with no stack trace', () => {
  const dir = tmpProject(null);
  const missing = path.join(dir, 'no', 'such', 'dir');
  assert.throws(
    () => execFileSync('node', [CLI, 'frontier', '--run-dir', missing], { cwd: dir, env: isolatedEnv(), encoding: 'utf8' }),
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
    () => execFileSync('node', [CLI, 'standard'], { cwd: dir, env: isolatedEnv(), encoding: 'utf8' }),
    (e) => /soon/.test(String(e.stderr)),
  );
});

test('a resolution avoids a model recorded as failed this session, via CLAUDE_CODE_SESSION_ID', () => {
  const dir = tmpProject(null);
  const sessionId = `cli-test-${process.pid}-fail-avoid`;
  const env = { ...process.env, CLAUDE_CODE_SESSION_ID: sessionId };
  execFileSync('node', [CLI, 'record-failure', 'fable'], { cwd: dir, env, encoding: 'utf8' });
  const r = JSON.parse(execFileSync('node', [CLI, 'frontier'], { cwd: dir, env, encoding: 'utf8' }));
  assert.strictEqual(r.model, 'opus');
  assert.strictEqual(r.source, 'degraded:session-failure');
  // cleanup — do not leak this test's blacklist file to a later run
  const { failurePath } = require('../../../bin/lib/model-profiles/session-failures');
  fs.rmSync(failurePath(sessionId), { force: true });
});

test('a resolution with no CLAUDE_CODE_SESSION_ID set is unaffected by any blacklist', () => {
  const dir = tmpProject(null);
  const env = { ...process.env };
  delete env.CLAUDE_CODE_SESSION_ID;
  const r = JSON.parse(execFileSync('node', [CLI, 'frontier'], { cwd: dir, env, encoding: 'utf8' }));
  assert.strictEqual(r.model, 'fable');
});

test('record-failure with no model name exits 1 naming the problem', () => {
  const dir = tmpProject(null);
  const env = { ...process.env, CLAUDE_CODE_SESSION_ID: `cli-test-${process.pid}-no-model` };
  assert.throws(
    () => execFileSync('node', [CLI, 'record-failure'], { cwd: dir, env, encoding: 'utf8' }),
    (e) => e.status === 1 && /record-failure requires a model name/.test(String(e.stderr)),
  );
});

test('record-failure with no CLAUDE_CODE_SESSION_ID exits 1 naming the problem, records nothing', () => {
  const dir = tmpProject(null);
  const env = { ...process.env };
  delete env.CLAUDE_CODE_SESSION_ID;
  assert.throws(
    () => execFileSync('node', [CLI, 'record-failure', 'fable'], { cwd: dir, env, encoding: 'utf8' }),
    (e) => e.status === 1 && /CLAUDE_CODE_SESSION_ID/.test(String(e.stderr)),
  );
});

test('record-failure prints a JSON confirmation on success', () => {
  const dir = tmpProject(null);
  const sessionId = `cli-test-${process.pid}-confirm`;
  const env = { ...process.env, CLAUDE_CODE_SESSION_ID: sessionId };
  const out = JSON.parse(execFileSync('node', [CLI, 'record-failure', 'opus'], { cwd: dir, env, encoding: 'utf8' }));
  assert.deepStrictEqual(out, { recorded: true, model: 'opus', sessionId });
  const { failurePath } = require('../../../bin/lib/model-profiles/session-failures');
  fs.rmSync(failurePath(sessionId), { force: true });
});
