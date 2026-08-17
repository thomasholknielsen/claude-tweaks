'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { deriveDocId } = require('../../../plugin/bin/docs-health');

// Regression coverage for a bug where deriveDocId resolved a relative
// targetPath against process.cwd() instead of the supplied `root` argument
// — --root means "audit a project elsewhere," so a relative targetPath must
// be interpreted relative to that root, not to wherever the command happens
// to be invoked from. These roots are arbitrary, non-existent paths: the
// function does pure path arithmetic and never touches the filesystem, so
// the assertions would fail under the old process.cwd()-based resolution
// regardless of the actual working directory the test runner uses.

test('deriveDocId resolves a relative target path against root, not process.cwd()', () => {
  const id = deriveDocId('docs/foo.md', '/tmp/docs-health-derive-doc-id-fixture');
  assert.strictEqual(id, 'foo');
});

test('deriveDocId resolves a nested relative target path against root', () => {
  const id = deriveDocId('docs/nested/bar.md', '/tmp/docs-health-derive-doc-id-fixture');
  assert.strictEqual(id, 'nested/bar');
});

test('deriveDocId handles an already-absolute target path regardless of root', () => {
  const id = deriveDocId(
    '/tmp/docs-health-derive-doc-id-fixture/docs/baz.md',
    '/tmp/docs-health-derive-doc-id-fixture',
  );
  assert.strictEqual(id, 'baz');
});
