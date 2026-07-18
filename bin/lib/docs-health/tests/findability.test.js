'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { computeInboundReferences } = require('../findability');

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-findability-'));
}

test('counts zero references for an orphan doc', () => {
  const root = makeTmpRoot();
  fs.mkdirSync(path.join(root, 'docs', 'guides'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'guides', 'orphan.md'), '# Orphan\n\nNo one links here.\n');
  const result = computeInboundReferences('guides/orphan', root);
  assert.strictEqual(result.count, 0);
  assert.deepStrictEqual(result.referencedBy, []);
});

test('counts a reference from another doc', () => {
  const root = makeTmpRoot();
  fs.mkdirSync(path.join(root, 'docs', 'guides'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'guides', 'target.md'), '# Target\n');
  fs.writeFileSync(path.join(root, 'docs', 'guides', 'index.md'), '# Guides\n\nSee [target](target.md).\n');
  const result = computeInboundReferences('guides/target', root);
  assert.strictEqual(result.count, 1);
  assert.deepStrictEqual(result.referencedBy, [path.join('docs', 'guides', 'index.md')]);
});

test('counts a reference from README.md', () => {
  const root = makeTmpRoot();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'setup.md'), '# Setup\n');
  fs.writeFileSync(path.join(root, 'README.md'), 'See [setup](docs/setup.md) for details.\n');
  const result = computeInboundReferences('setup', root);
  assert.strictEqual(result.count, 1);
  assert.deepStrictEqual(result.referencedBy, ['README.md']);
});

test('counts a reference from CLAUDE.md', () => {
  const root = makeTmpRoot();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'conventions.md'), '# Conventions\n');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), 'See docs/conventions.md for details.\n');
  const result = computeInboundReferences('conventions', root);
  assert.strictEqual(result.count, 1);
  assert.deepStrictEqual(result.referencedBy, ['CLAUDE.md']);
});

test('excludes the doc itself from its own reference count', () => {
  const root = makeTmpRoot();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'self.md'), '# Self\n\nself.md is this file.\n');
  const result = computeInboundReferences('self', root);
  assert.strictEqual(result.count, 0);
});

test('counts references from multiple files', () => {
  const root = makeTmpRoot();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'target.md'), '# Target\n');
  fs.writeFileSync(path.join(root, 'docs', 'a.md'), 'Link to [target](target.md).\n');
  fs.writeFileSync(path.join(root, 'docs', 'b.md'), 'Also see [target](target.md).\n');
  const result = computeInboundReferences('target', root);
  assert.strictEqual(result.count, 2);
});

test('returns zero when docs/ does not exist yet', () => {
  const root = makeTmpRoot();
  fs.writeFileSync(path.join(root, 'README.md'), 'Nothing here yet.\n');
  const result = computeInboundReferences('missing-doc', root);
  assert.strictEqual(result.count, 0);
});
