'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'phase-timing.js');
const FIX = path.join(__dirname, '..', '..', 'fixtures', 'timing', 'record-1535');
function run(args) { return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' }); }
function tmpRun(copyFixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-timing-'));
  if (copyFixture) for (const f of ['events.jsonl', 'manifest.yml']) fs.copyFileSync(path.join(FIX, f), path.join(dir, f));
  return dir;
}

test('#1928 AC4: --markdown prints the table and writes timing.json', () => {
  const dir = tmpRun(true);
  const r = run(['--run', dir, '--markdown']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.split('\n')[0], '| Phase | Minutes | Verify |');
  assert.match(r.stdout, /^\| call-1 \| 25 \(own 1\) \|/m);
  assert.match(r.stdout, /^\| tasks \| 14 \| scoped ×1 \|/m);
  assert.match(r.stdout, /^\| build \| 22 \(own 2\) \|/m);
  const json = JSON.parse(fs.readFileSync(path.join(dir, 'timing.json'), 'utf8'));
  assert.equal(json.runDir, dir);
  assert.equal(typeof json.generatedAt, 'string');
  assert.equal(json.totals.verifyRuns, 2);
});

test('#1928 AC4: an events file with only session-end prints every phase unattributed and exits 0', () => {
  const dir = tmpRun(false);
  fs.writeFileSync(path.join(dir, 'events.jsonl'), '{"ts":"2026-09-05T14:13:00.000Z","type":"session-end"}\n');
  const r = run(['--run', dir, '--markdown']);
  assert.equal(r.status, 0, r.stderr);
  const rows = r.stdout.trim().split('\n').slice(2);
  assert.equal(rows.length, 10);
  for (const row of rows) assert.match(row, /\| 0 \| unattributed \|$/);
});

test('#1928: a malformed line is skipped, not fatal; a missing events file is an empty run', () => {
  const dir = tmpRun(true);
  fs.appendFileSync(path.join(dir, 'events.jsonl'), 'not json\n');
  assert.equal(run(['--run', dir, '--json']).status, 0);
  const empty = tmpRun(false);
  const r = run(['--run', empty, '--json']);
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).totals.minutes, 0);
});

test('#1928: malformed invocation exits 2 — no --run, or a --run that is not a directory', () => {
  assert.equal(run([]).status, 2);
  assert.equal(run(['--run', path.join(os.tmpdir(), 'ct-timing-does-not-exist')]).status, 2);
  assert.equal(run(['--run']).status, 2);
});

test('#1928 fix round 2: --run "" (present but empty — the unset-$PIPELINE_RUN_DIR idiom) exits 0 and writes nothing', () => {
  const r = run(['--run', '', '--markdown']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /no run directory/);
});
