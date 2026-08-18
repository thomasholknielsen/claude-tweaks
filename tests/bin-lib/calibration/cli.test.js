'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'calibration-report.js');

function makeFixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calib-cli-'));
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.claude-tweaks', 'wrap-up-outcomes.tsv'),
    '2026-08-01\trun-1\tskills\tclosed\t0\tna\n2026-08-02\trun-2\tskills\tclosed\t0\tna\n',
  );
  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive');
  for (const runId of ['run-1', 'run-2']) {
    const dir = path.join(archiveDir, runId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'decisions.md'), '- AUTO 12:00:00 — Review Console: terminal decision approve-all. Reversibility: n/a.\n');
    fs.writeFileSync(path.join(dir, 'events.jsonl'), '{"type":"gate-denial"}\n');
  }
  return root;
}

function run(args, root) {
  return execFileSync('node', [CLI, ...args, '--root', root], { encoding: 'utf8' });
}

test('CLI renders all five sections for a fixture tree', () => {
  const root = makeFixtureRoot();
  const out = run([], root);
  assert.match(out, /Per-registry-row finding rate|finding rate/i);
  assert.match(out, /approve-all/);
  assert.match(out, /Reversibility/i);
  assert.match(out, /gate-denial/);
  assert.match(out, /[Rr]efused/);
});

test('CLI --json round-trips the same numbers as the text report', () => {
  const root = makeFixtureRoot();
  const jsonOut = JSON.parse(run(['--json'], root));
  const textOut = run([], root);
  assert.strictEqual(jsonOut.consoleDist['approve-all'], 2);
  assert.match(textOut, new RegExp(`approve-all: ${jsonOut.consoleDist['approve-all']}\\b`));
  assert.match(textOut, new RegExp(`gate-denial: ${jsonOut.frictionCounts['gate-denial']}\\b`));
  assert.strictEqual(jsonOut.refusedCount, 0);
  assert.match(textOut, /Refused proposals: 0/);
});

test('missing TSV exits 0 with an explicit "no telemetry yet" line', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calib-empty-'));
  const out = run([], root);
  assert.match(out, /no telemetry yet/);
});

test('no archive dir is stated explicitly', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calib-noarchive-'));
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'wrap-up-outcomes.tsv'), '');
  const out = run([], root);
  assert.match(out, /no archived runs/i);
});

test('unknown flag exits 2 (not just some non-zero code)', () => {
  const root = makeFixtureRoot();
  try {
    execFileSync('node', [CLI, '--bogus', '--root', root], { encoding: 'utf8' });
    assert.fail('should have thrown');
  } catch (err) {
    assert.strictEqual(err.status, 2);
  }
});

test('autonomy-raising signal fires at 100% approve-all over >=10 stops under the schema-default (supervised) ceiling', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calib-ceiling-'));
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'wrap-up-outcomes.tsv'), '');
  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive');
  for (let i = 1; i <= 10; i++) {
    const dir = path.join(archiveDir, `run-${i}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'decisions.md'), '- AUTO 12:00:00 — Review Console: terminal decision approve-all. Reversibility: n/a.\n');
  }
  const out = run(['--runs', '20'], root);
  assert.match(out, /[Cc]onsider raising autonomy/);
  // The recommended line must be a real runnable command, not a "#" comment
  // that can be pasted but does nothing (this repo has no .claude-tweaks
  // dir with a real git root inside the temp fixture, so a literal `sed`
  // path isn't assertable here — only that it isn't a bare comment line).
  assert.doesNotMatch(out, /^#\s*edit .*autonomy: trusted\s*$/m);
});

test('narrowing signal renders with a paste-ready command on its own line at >=10 appearances', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'calib-narrow-'));
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  const lines = [];
  for (let i = 1; i <= 10; i++) lines.push(`2026-08-${String(i).padStart(2, '0')}\trun-${i}\tskills\tclosed\t0\tna`);
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'wrap-up-outcomes.tsv'), lines.join('\n') + '\n');
  fs.mkdirSync(path.join(root, '.claude-tweaks', 'pipelines', 'archive'), { recursive: true });
  const out = run(['--runs', '20'], root);
  assert.match(out, /consider narrowing/i);
});
