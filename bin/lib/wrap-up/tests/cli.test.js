// bin/lib/wrap-up/tests/cli.test.js — the CLI's own composition: argument
// parsing, the --since resolution and its error path, and the local+remote
// reflog join. None of that is reachable from the three module suites, which
// each feed their unit hand-made inputs.
//
// These assertions are deliberately STRUCTURAL — line presence, exit codes,
// JSON shape, and the echoed boundary. Asserting a history-derived value (a
// commit count, a specific op) would be a scheduled failure the next time the
// branch moves.
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', '..', '..', 'wrap-up-state.js');

function run(args, cwd) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: cwd || process.cwd(), encoding: 'utf8',
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

test('exits 2 with a usage message when --since is missing', () => {
  const r = run([]);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /usage: wrap-up-state\.js --since/);
});

test('the usage string advertises only the base-sha form', () => {
  const r = run([]);
  assert.match(r.stderr, /--since <base-sha>/);
  assert.doesNotMatch(r.stderr, /iso-datetime/);
});

test('exits 0 and renders all three State lines for a valid base', () => {
  const r = run(['--since', 'HEAD~1']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /^Branch\s+\S/m);
  assert.match(r.stdout, /^Worktree\s+\S/m);
  assert.match(r.stdout, /^Scope\s+since HEAD~1/m);
});

test('--json emits a parseable object carrying state, ops, since and sinceDate', () => {
  const r = run(['--since', 'HEAD~1', '--json']);
  assert.strictEqual(r.status, 0);
  const o = JSON.parse(r.stdout);
  assert.strictEqual(typeof o.state.pushed, 'boolean');
  assert.ok(Array.isArray(o.ops));
  assert.strictEqual(o.since, 'HEAD~1');
  assert.ok(typeof o.sinceDate === 'string' && o.sinceDate.length > 0);
});

test('an unresolvable --since inside a repository exits 2 and names the bad value', () => {
  const r = run(['--since', 'not-a-real-ref']);
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /not-a-real-ref/);
  assert.strictEqual(r.stdout, '');
});

test('outside a git repository the fields render unknown and the exit stays 0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapup-cli-'));
  try {
    const r = run(['--since', 'HEAD'], dir);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /Branch\s+unknown/);
    assert.match(r.stdout, /Worktree\s+unknown/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
