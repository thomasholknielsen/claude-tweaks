'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'docs-health.js');

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-cli-find-refs-'));
}

test('find-refs reports zero for an orphan doc', () => {
  const root = makeTmpRoot();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  const target = path.join(root, 'docs', 'orphan.md');
  fs.writeFileSync(target, '# Orphan\n');
  const out = execFileSync('node', [CLI, 'find-refs', target, '--root', root], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.result.count, 0);
});

test('find-refs reports a reference from README.md', () => {
  const root = makeTmpRoot();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  const target = path.join(root, 'docs', 'setup.md');
  fs.writeFileSync(target, '# Setup\n');
  fs.writeFileSync(path.join(root, 'README.md'), 'See docs/setup.md.\n');
  const out = execFileSync('node', [CLI, 'find-refs', target, '--root', root], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.result.count, 1);
});

test('find-refs exits 2 with no path argument', () => {
  const result = spawnSync('node', [CLI, 'find-refs']);
  assert.strictEqual(result.status, 2);
});

test('find-refs exits 1 for a missing file', () => {
  const root = makeTmpRoot();
  const result = spawnSync('node', [CLI, 'find-refs', path.join(root, 'docs', 'nope.md'), '--root', root]);
  assert.strictEqual(result.status, 1);
});

// Regression: cmdFindRefs checked fs.existsSync(targetPath) using the raw,
// unresolved targetPath instead of resolving it against --root the way
// deriveDocId's own path.resolve(root, targetPath) correctly does. A
// relative targetPath invoked from a cwd other than --root (the exact
// "audit a project elsewhere" scenario --root exists to support) failed
// with "could not read file" even though the file genuinely exists under
// --root.
test('find-refs resolves a relative path against --root, not the invoking cwd', () => {
  const root = makeTmpRoot();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'setup.md'), '# Setup\n');
  fs.writeFileSync(path.join(root, 'README.md'), 'See docs/setup.md.\n');

  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-cli-find-refs-elsewhere-'));
  const out = execFileSync(
    'node', [CLI, 'find-refs', 'docs/setup.md', '--root', root],
    { cwd: elsewhere, encoding: 'utf8' },
  );
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.result.count, 1);
});
