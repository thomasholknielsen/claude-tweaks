const { test } = require('node:test');
const assert = require('node:assert');
const { computeWordCount } = require('../../../plugin/bin/lib/docs-health/depth');

test('computeWordCount counts plain words with no frontmatter', () => {
  const result = computeWordCount('one two three four five');
  assert.strictEqual(result, 5);
});

test('computeWordCount strips frontmatter before counting', () => {
  const content = ['---', 'title: Foo', '---', 'one two three'].join('\n');
  const result = computeWordCount(content);
  assert.strictEqual(result, 3);
});

test('computeWordCount returns the depth-hint value as-is, uncounted', () => {
  const content = ['---', 'depth-hint: deep-dive', '---', 'one two three'].join('\n');
  const result = computeWordCount(content);
  assert.strictEqual(result, 'deep-dive');
});

test('computeWordCount strips fenced code blocks before counting', () => {
  const fence = String.fromCharCode(96).repeat(3);
  const content = ['one two', fence, 'three four five', fence, 'six seven'].join('\n');
  const result = computeWordCount(content);
  assert.strictEqual(result, 4);
});

test('computeWordCount returns 0 for an empty doc', () => {
  const result = computeWordCount('');
  assert.strictEqual(result, 0);
});

test('computeWordCount falls back to counting everything when frontmatter has no closing marker', () => {
  const content = ['---', 'title: Foo', 'one two three'].join('\n');
  const result = computeWordCount(content);
  assert.strictEqual(result, 6);
});
