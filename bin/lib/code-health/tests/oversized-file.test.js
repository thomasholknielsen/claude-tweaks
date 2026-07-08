const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const lens = require('../lenses/oversized-file');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-big-')); }
const AREA = { id: '.', globs: ['.'], flags: {} };

test('mechanical contract', () => {
  assert.strictEqual(lens.id, 'oversized-file');
  assert.strictEqual(lens.kind, 'mechanical');
});

test('flags a file over the threshold and ignores one under it', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'big.js'), 'x\n'.repeat(700));   // 700 lines > 300
  fs.writeFileSync(path.join(root, 'small.js'), 'x\n'.repeat(10));
  const findings = lens.run(AREA, root, { threshold: 300 });
  assert.strictEqual(findings.length, 1);
  assert.deepStrictEqual(findings[0].files, ['big.js']);
  assert.strictEqual(findings[0].severity, 'high'); // 701 > 300*2
  assert.match(findings[0].signature, /big\.js/);
});

test('respects .claude-tweaks self-pollution guard', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'recon-cache.json'), 'x\n'.repeat(900));
  assert.strictEqual(lens.run(AREA, root, { threshold: 300 }).length, 0);
});

test('skips .claude (other sessions\' live worktrees under .claude/worktrees/)', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude', 'worktrees', 'foo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude', 'worktrees', 'foo', 'big.js'), 'x\n'.repeat(900));
  assert.strictEqual(lens.run(AREA, root, { threshold: 300 }).length, 0);
});
