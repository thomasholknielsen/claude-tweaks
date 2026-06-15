const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'recon.js'); // bin/recon.js

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-cli-')); }
function runCli(args, root) {
  const out = execFileSync('node', [CLI, 'run', '--root', root, ...args], { encoding: 'utf8' });
  return JSON.parse(out);
}

// v2: cmdRun emits a slices-only stub — no mechanical-lens findings loop.
// The SKILL drives the LLM judge directly; this command is a scope smoke-check.

test('run emits v2 shape: runId, dryRun, areas[], plan:[], summary:{}', () => {
  const root = tmp();
  const res = runCli(['--area', '.'], root);
  assert.ok(typeof res.runId === 'string', 'runId must be a string');
  assert.strictEqual(res.dryRun, false, 'dryRun must default to false');
  assert.ok(Array.isArray(res.areas), 'areas must be an array');
  assert.deepStrictEqual(res.plan, [], 'plan must be empty in v2');
  assert.deepStrictEqual(res.summary, {}, 'summary must be empty in v2');
});

test('--area constrains the selected areas to the given path', () => {
  const root = tmp();
  const res = runCli(['--area', '.'], root);
  assert.deepStrictEqual(res.areas, ['.'], 'single --area should produce exactly that area id');
});

test('--dry-run sets dryRun:true in the output', () => {
  const root = tmp();
  const res = runCli(['--area', '.', '--dry-run'], root);
  assert.strictEqual(res.dryRun, true);
  // v2: no cache is written because plan is empty (no findings to persist)
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'recon', 'cache.json')), false);
});
