const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { hasTestScript } = require('../detect-test-script');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'residue-detect-test-'));
}

// Verified live before this fix: a directory with no package.json at all
// (the case any non-Node project, or a bare scratch dir, hits) made
// bin/residue.js run `npm test` anyway, and npm's own "missing script" exit
// code was reported as a genuine red suite finding.
test('no package.json at all degrades to unknown, never a finding', () => {
  const dir = tmpDir();
  assert.strictEqual(hasTestScript(dir), false);
});

test('a package.json with no scripts.test key degrades to unknown', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { build: 'tsc' } }));
  assert.strictEqual(hasTestScript(dir), false);
});

test('a package.json with an empty scripts.test string degrades to unknown', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: '   ' } }));
  assert.strictEqual(hasTestScript(dir), false);
});

test('a package.json with a real scripts.test entry is detected', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'node --test tests/' } }));
  assert.strictEqual(hasTestScript(dir), true);
});

test('a malformed package.json degrades to unknown rather than throwing', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'package.json'), '{ not valid json');
  assert.strictEqual(hasTestScript(dir), false);
});
