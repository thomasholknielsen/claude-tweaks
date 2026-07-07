const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { contentHash } = require('../scope');
const { writeCursors } = require('../cache');

const CLI = path.resolve(__dirname, '..', '..', '..', 'code-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-ns-')); }
function runNextSlice(args, root) {
  const raw = execFileSync('node', [CLI, 'next-slice', '--root', root, ...args], { encoding: 'utf8' });
  return JSON.parse(raw);
}

test('next-slice returns a slice object for a new repo', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const result = runNextSlice([], root);
  assert.ok(result !== null, 'must pick a slice when nothing has been judged');
  assert.ok(typeof result.id === 'string');
  assert.ok(typeof result.why === 'string');
});

test('next-slice returns null when the only slice has an unchanged hash', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const hash = contentHash(root);
  writeCursors(root, { '.': { lastSweptMs: Date.now(), lastHash: hash } });
  const result = runNextSlice([], root);
  assert.strictEqual(result, null, 'unchanged recently-judged slice must yield null');
});

test('next-slice --budget 2 returns an array of up to 2 slices', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'pkg-a'));
  fs.mkdirSync(path.join(root, 'pkg-b'));
  fs.writeFileSync(path.join(root, 'pkg-a', 'a.js'), 'const a = 1;\n');
  fs.writeFileSync(path.join(root, 'pkg-b', 'b.js'), 'const b = 2;\n');
  // No cursors → all slices are stale → budget=2 returns up to 2
  const raw = execFileSync('node', [CLI, 'next-slice', '--root', root, '--budget', '2'], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.ok(Array.isArray(result), '--budget must return an array');
  assert.ok(result.length >= 1 && result.length <= 2);
  // IDs must be unique
  const ids = result.map((s) => s.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'budget results must have unique ids');
});

test('next-slice exits 0 and writes nothing to disk', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  // A hash-matched cursor means nothing is due
  const hash = contentHash(root);
  writeCursors(root, { '.': { lastSweptMs: Date.now(), lastHash: hash } });
  // Must exit 0 even when returning null
  const raw = execFileSync('node', [CLI, 'next-slice', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(JSON.parse(raw), null);
  // Cache must be untouched
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'code-health', 'cache.json')), false);
});
