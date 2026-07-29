'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  compareVersions,
  parseChangelogVersions,
  extractChangelogRange,
} = require('../bin/lib/changelog.js');

const SAMPLE_CHANGELOG = `# Changelog

## v3.2.0 — Third entry

Third entry body line one.
Third entry body line two.

## v3.1.0 — Second entry

Second entry body.

## v3.0.0 — First entry

First entry body.
`;

test('compareVersions returns 0 for equal versions', () => {
  assert.strictEqual(compareVersions('1.0.0', '1.0.0'), 0);
});

test('compareVersions returns -1 when the first version is older', () => {
  assert.strictEqual(compareVersions('1.0.0', '2.0.0'), -1);
});

test('compareVersions returns 1 when the first version is newer', () => {
  assert.strictEqual(compareVersions('2.0.0', '1.0.0'), 1);
});

test('compareVersions compares numerically, not lexicographically', () => {
  // Lexicographic string comparison would say "1.10.0" < "1.2.0" (char '1' < '2' at the
  // first differing position) — numerically 1.10.0 > 1.2.0. This proves it isn't a string compare.
  assert.strictEqual(compareVersions('1.2.0', '1.10.0'), -1);
  assert.strictEqual(compareVersions('1.10.0', '1.2.0'), 1);
});

test('compareVersions throws a clear error on a non-semver input', () => {
  assert.throws(() => compareVersions('abc', '1.0.0'), /Invalid semver version/);
});

test('parseChangelogVersions extracts every entry in file order with trimmed bodies', () => {
  const entries = parseChangelogVersions(SAMPLE_CHANGELOG);
  assert.strictEqual(entries.length, 3);
  assert.deepStrictEqual(
    entries.map((e) => e.version),
    ['3.2.0', '3.1.0', '3.0.0'],
  );
  assert.strictEqual(entries[0].title, 'Third entry');
  assert.strictEqual(entries[0].body, 'Third entry body line one.\nThird entry body line two.');
  assert.strictEqual(entries[2].body, 'First entry body.');
});

test('extractChangelogRange excludes the old version and includes the new version', () => {
  const range = extractChangelogRange(SAMPLE_CHANGELOG, '3.0.0', '3.2.0');
  assert.deepStrictEqual(
    range.map((e) => e.version),
    ['3.2.0', '3.1.0'],
  );
});

test('extractChangelogRange returns an empty array when old and new versions match', () => {
  const range = extractChangelogRange(SAMPLE_CHANGELOG, '3.2.0', '3.2.0');
  assert.deepStrictEqual(range, []);
});

test('extractChangelogRange works by pure semver comparison even when the old version has no matching entry in the text', () => {
  const range = extractChangelogRange(SAMPLE_CHANGELOG, '2.5.0', '3.0.0');
  assert.deepStrictEqual(
    range.map((e) => e.version),
    ['3.0.0'],
  );
});
