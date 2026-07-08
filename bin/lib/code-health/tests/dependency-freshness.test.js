const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const lens = require('../lenses/dependency-freshness');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-dep-')); }
const AREA = { id: '.', globs: ['.'], flags: {} };

test('mechanical contract', () => {
  assert.strictEqual(lens.id, 'dependency-freshness');
  assert.strictEqual(lens.kind, 'mechanical');
});

test('flags wildcard and latest ranges, ignores pinned ranges', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    dependencies: { wild: '*', loose: 'latest', good: '^1.2.3' },
  }));
  const findings = lens.run(AREA, root);
  const names = findings.map((f) => f.signature).sort();
  assert.deepStrictEqual(names, ['dep-range loose latest', 'dep-range wild wildcard']);
  assert.strictEqual(findings.find((f) => f.signature.includes('wild')).severity, 'high');
});

test('no package.json yields no findings', () => {
  assert.strictEqual(lens.run(AREA, tmp()).length, 0);
});

test('skips .claude (other sessions\' live worktrees under .claude/worktrees/)', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'worktrees', 'foo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'worktrees', 'foo', 'package.json'), JSON.stringify({
    dependencies: { wild: '*' },
  }));
  assert.strictEqual(lens.run(AREA, root).length, 0);
});
