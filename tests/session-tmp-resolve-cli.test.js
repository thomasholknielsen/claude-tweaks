// tests/session-tmp-resolve-cli.test.js — spawn tests for
// bin/session-tmp-resolve.js, the byte-cheap eval-ready CLI wrapper over
// lib/session-tmp.js#sessionTmpPath (#266's follow-up to shrink the
// per-fence inline `node -e` preamble that pushed backlog/overview-mode.md
// over the 40 KB skill-file ceiling).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'plugin', 'bin', 'session-tmp-resolve.js');

function run(args, env = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('resolves one VAR=filename pair to an eval-ready VAR="path" line', () => {
  const { stdout, status } = run(['ST_FOO=foo.json'], { CLAUDE_CODE_SESSION_ID: 'sess-abc' });
  assert.equal(status, 0);
  assert.equal(
    stdout.trim(),
    `ST_FOO=${JSON.stringify(path.join(os.tmpdir(), 'ct-session-sess-abc', 'foo.json'))}`,
  );
});

test('resolves multiple pairs in argument order, one line each', () => {
  const { stdout, status } = run(['A=a.json', 'B=b.md'], { CLAUDE_CODE_SESSION_ID: 'sess-xyz' });
  assert.equal(status, 0);
  const lines = stdout.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^A=/);
  assert.match(lines[1], /^B=/);
});

test('degrades to the OS tmpdir (no session-scoped subdirectory) when no session id is set', () => {
  const { stdout, status } = run(['X=x.json'], { CLAUDE_CODE_SESSION_ID: '' });
  assert.equal(status, 0);
  assert.equal(stdout.trim(), `X=${JSON.stringify(path.join(os.tmpdir(), 'x.json'))}`);
});

test('exits non-zero with no arguments', () => {
  const { status } = run([]);
  assert.notEqual(status, 0);
});

test('exits non-zero on a malformed argument (no "=")', () => {
  const { status } = run(['not-a-valid-arg']);
  assert.notEqual(status, 0);
});

test('the resolved value is safe to eval directly in bash', () => {
  const { stdout } = run(['ST_FOO=foo.json'], { CLAUDE_CODE_SESSION_ID: 'sess-eval-test' });
  const script = `eval "${stdout.trim().replace(/"/g, '\\"')}"\necho "$ST_FOO"`;
  const result = require('node:child_process').spawnSync('bash', ['-c', script], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), path.join(os.tmpdir(), 'ct-session-sess-eval-test', 'foo.json'));
});
