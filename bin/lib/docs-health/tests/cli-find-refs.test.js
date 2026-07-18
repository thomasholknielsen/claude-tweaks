'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'docs-health.js');

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
