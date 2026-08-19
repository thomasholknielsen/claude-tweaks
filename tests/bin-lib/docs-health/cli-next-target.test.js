const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'plugin', 'bin', 'docs-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-nt-')); }
function runNextTarget(args, root) {
  const raw = execFileSync('node', [CLI, 'next-target', '--root', root, ...args], { encoding: 'utf8' });
  return JSON.parse(raw);
}

test('next-target returns { target: null } for a project with no docs yet', () => {
  const root = tmp();
  const result = runNextTarget([], root);
  assert.strictEqual(result.target, null);
});

test('next-target picks a never-audited doc as stale', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'readme.md'), '# readme');
  const result = runNextTarget([], root);
  assert.ok(result.target !== null);
  assert.strictEqual(result.target.id, 'readme');
  assert.strictEqual(result.target.why, 'stale');
});

test('next-target --target <id> bypasses selection and returns why: "manual"', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'a.md'), '# a');
  fs.writeFileSync(path.join(root, 'docs', 'b.md'), '# b');
  const result = runNextTarget(['--target', 'b'], root);
  assert.strictEqual(result.target.id, 'b');
  assert.strictEqual(result.target.why, 'manual');
});

test('next-target --budget 2 returns an array of up to 2 unique targets', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'a.md'), '# a');
  fs.writeFileSync(path.join(root, 'docs', 'b.md'), '# b');
  const raw = execFileSync('node', [CLI, 'next-target', '--root', root, '--budget', '2'], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.ok(Array.isArray(result.targets));
  assert.ok(result.targets.length >= 1 && result.targets.length <= 2);
  const ids = result.targets.map((t) => t.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'budget results must have unique ids');
});

test('next-target without --budget still returns a single target object (default budget=1, no shape regression)', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'a.md'), '# a');
  const result = runNextTarget([], root);
  assert.ok(!Array.isArray(result.target));
  assert.strictEqual(result.target.id, 'a');
});

test('next-target --dir <path> restricts selection to docs under that subdirectory', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs', 'decisions'), { recursive: true });
  fs.mkdirSync(path.join(root, 'docs', 'guides'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'decisions', '0007-foo.md'), '# foo');
  fs.writeFileSync(path.join(root, 'docs', 'guides', 'setup.md'), '# setup');

  const result = runNextTarget(['--dir', 'guides'], root);
  assert.ok(result.target !== null);
  assert.strictEqual(result.target.id, 'guides/setup');
});

test('next-target --dir <path> with no matching docs returns { target: null }', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'docs', 'decisions'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'decisions', '0007-foo.md'), '# foo');

  const result = runNextTarget(['--dir', 'guides'], root);
  assert.strictEqual(result.target, null);
});
