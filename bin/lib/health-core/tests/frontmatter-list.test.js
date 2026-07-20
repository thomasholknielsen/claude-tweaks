'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseFrontmatterListField } = require('../frontmatter-list');

test('parseFrontmatterListField returns [] when there is no frontmatter', () => {
  assert.deepStrictEqual(parseFrontmatterListField('# no frontmatter here', 'paths'), []);
});

test('parseFrontmatterListField returns [] when the frontmatter has no closing ---', () => {
  const content = '---\npaths:\n  - src/a.ts\n';
  assert.deepStrictEqual(parseFrontmatterListField(content, 'paths'), []);
});

test('parseFrontmatterListField returns [] when the named field key is absent', () => {
  const content = '---\nother: value\n---\n# Doc\n';
  assert.deepStrictEqual(parseFrontmatterListField(content, 'paths'), []);
});

test('parseFrontmatterListField extracts a bullet list under the named key', () => {
  const content = '---\npaths:\n  - src/api/**\n  - src/routes/**\n---\n# Doc\n';
  assert.deepStrictEqual(parseFrontmatterListField(content, 'paths'), ['src/api/**', 'src/routes/**']);
});

test('parseFrontmatterListField reads a different field name from the same shape', () => {
  const content = '---\nfiles:\n  - src/checkout/Cart.tsx\n  - src/checkout/Payment.tsx\n---\n';
  assert.deepStrictEqual(
    parseFrontmatterListField(content, 'files'),
    ['src/checkout/Cart.tsx', 'src/checkout/Payment.tsx'],
  );
});

test('parseFrontmatterListField stops at the first non-list-item line after the field', () => {
  const content = '---\nfiles:\n  - src/a.ts\nother: value\n  - src/b.ts\n---\n';
  assert.deepStrictEqual(parseFrontmatterListField(content, 'files'), ['src/a.ts']);
});

test('parseFrontmatterListField matches a dash with no space before the item (union of the three prior implementations\' regexes)', () => {
  // harness-health's parseRulePaths and journey-health's parseJourneyFiles
  // both used `\s*` (zero or more spaces) after the dash; docs-health's
  // parseFilesField required `\s+` (at least one). The shared parser uses
  // the more permissive form, a strict widening for docs-health's former
  // callers only (every `\s+` match is also a `\s*` match).
  const content = '---\nfiles:\n  -src/a.ts\n---\n';
  assert.deepStrictEqual(parseFrontmatterListField(content, 'files'), ['src/a.ts']);
});

test('parseFrontmatterListField treats the field name as a literal, not a regex', () => {
  const content = '---\nfil.s:\n  - src/a.ts\n---\n';
  assert.deepStrictEqual(parseFrontmatterListField(content, 'files'), []);
});
