const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const lens = require('../lenses/todo-comments');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-todo-')); }
const AREA = { id: '.', globs: ['.'], flags: {} };

test('lens exposes the mechanical contract', () => {
  assert.strictEqual(lens.id, 'todo-comments');
  assert.strictEqual(lens.kind, 'mechanical');
  assert.strictEqual(typeof lens.run, 'function');
});

test('reports TODO/FIXME/HACK with file:line in files and a stable signature', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n// TODO: wire it up\n');
  const findings = lens.run(AREA, root);
  assert.strictEqual(findings.length, 1);
  const f = findings[0];
  assert.strictEqual(f.lens, 'todo-comments');
  assert.deepStrictEqual(f.files, ['a.js:2']);
  assert.strictEqual(f.signature, 'TODO wire it up');
  assert.strictEqual(f.severity, 'low');
});

// REGRESSION (PORT.md delta #2): a run must never scan its own output.
test('self-pollution guard: TODO inside .claude-tweaks is ignored', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'recon-cache.json'),
    '{ "x": "TODO: this is engine output, not source" }');
  fs.writeFileSync(path.join(root, 'real.js'), '// FIXME: real one\n');
  const findings = lens.run(AREA, root);
  assert.strictEqual(findings.length, 1);
  assert.deepStrictEqual(findings[0].files, ['real.js:1']);
});

test('skips node_modules and .git', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'node_modules', 'p'), { recursive: true });
  fs.writeFileSync(path.join(root, 'node_modules', 'p', 'i.js'), '// TODO: vendored\n');
  assert.strictEqual(lens.run(AREA, root).length, 0);
});

test('skips .claude (other sessions\' live worktrees under .claude/worktrees/)', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'worktrees', 'foo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'worktrees', 'foo', 'i.js'), '// TODO: in another session\'s worktree\n');
  assert.strictEqual(lens.run(AREA, root).length, 0);
});
