const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const lens = require('../lenses/dead-export');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-dead-')); }
const AREA = { id: '.', globs: ['.'], flags: {} };

test('mechanical contract', () => {
  assert.strictEqual(lens.id, 'dead-export');
  assert.strictEqual(lens.kind, 'mechanical');
});

test('flags an export that is never imported, ignores one that is', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'export const used = 1;\nexport const orphan = 2;\n');
  fs.writeFileSync(path.join(root, 'b.js'), "import { used } from './a';\n");
  const findings = lens.run(AREA, root);
  assert.strictEqual(findings.length, 1);
  assert.match(findings[0].title, /orphan/);
  assert.strictEqual(findings[0].confidence, 'low');
});

test('self-pollution guard skips .claude-tweaks', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'x.js'), 'export const orphan = 1;\n');
  assert.strictEqual(lens.run(AREA, root).length, 0);
});

test('import type { X } does not count as dead export', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'types.ts'), 'export const Foo = {};\n');
  fs.writeFileSync(path.join(root, 'consumer.ts'), "import type { Foo } from './types';\n");
  const findings = lens.run(AREA, root);
  assert.strictEqual(findings.length, 0, 'Foo should not be flagged as dead when imported via import type');
});

test('skips .claude (other sessions\' live worktrees under .claude/worktrees/)', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'worktrees', 'foo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'worktrees', 'foo', 'x.js'), 'export const orphan = 1;\n');
  assert.strictEqual(lens.run(AREA, root).length, 0);
});
