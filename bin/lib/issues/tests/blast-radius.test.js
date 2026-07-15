'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { classifyDiffFiles, blastRadiusSummary } = require('../blast-radius');

test('classifyDiffFiles marks files under a tests/ directory as isTest', () => {
  const files = [{ path: 'bin/lib/issues/tests/grouping.test.js', additions: 38, deletions: 1 }];
  const result = classifyDiffFiles(files, []);
  assert.strictEqual(result[0].isTest, true);
});

test('classifyDiffFiles marks .test.js files as isTest even outside a tests/ directory', () => {
  const files = [{ path: 'src/widget.test.js', additions: 10, deletions: 0 }];
  const result = classifyDiffFiles(files, []);
  assert.strictEqual(result[0].isTest, true);
});

test('classifyDiffFiles marks ordinary implementation files as not isTest', () => {
  const files = [{ path: 'bin/lib/issues/grouping.js', additions: 28, deletions: 5 }];
  const result = classifyDiffFiles(files, []);
  assert.strictEqual(result[0].isTest, false);
});

test('classifyDiffFiles marks a file matching merge-sensitive-paths as isSensitive', () => {
  const files = [{ path: 'bin/hooks.js', additions: 3, deletions: 1 }];
  const result = classifyDiffFiles(files, ['bin/hooks.js', 'skills/_shared/*.md']);
  assert.strictEqual(result[0].isSensitive, true);
});

test('classifyDiffFiles matches a glob-style sensitive path against a nested file', () => {
  const files = [{ path: 'skills/_shared/work-record.md', additions: 2, deletions: 0 }];
  const result = classifyDiffFiles(files, ['skills/_shared/*.md']);
  assert.strictEqual(result[0].isSensitive, true);
});

test('classifyDiffFiles marks a file not matching any sensitive path as not isSensitive', () => {
  const files = [{ path: 'bin/lib/issues/grouping.js', additions: 28, deletions: 5 }];
  const result = classifyDiffFiles(files, ['bin/hooks.js']);
  assert.strictEqual(result[0].isSensitive, false);
});

test('classifyDiffFiles defaults sensitivePaths to an empty list when omitted', () => {
  const files = [{ path: 'bin/hooks.js', additions: 1, deletions: 0 }];
  const result = classifyDiffFiles(files);
  assert.strictEqual(result[0].isSensitive, false);
});

test('blastRadiusSummary sums impl and test lines separately, #18-shaped fixture', () => {
  const classified = classifyDiffFiles(
    [
      { path: 'bin/lib/issues/grouping.js', additions: 28, deletions: 5 },
      { path: 'bin/lib/issues/tests/grouping.test.js', additions: 38, deletions: 1 },
    ],
    [],
  );
  assert.deepStrictEqual(blastRadiusSummary(classified), {
    implLines: 33,
    testLines: 39,
    implFiles: 1,
    testFiles: 1,
    sensitiveFilesTouched: [],
  });
});

test('blastRadiusSummary lists sensitiveFilesTouched by path', () => {
  const classified = classifyDiffFiles(
    [{ path: 'bin/hooks.js', additions: 3, deletions: 1 }],
    ['bin/hooks.js'],
  );
  assert.deepStrictEqual(blastRadiusSummary(classified).sensitiveFilesTouched, ['bin/hooks.js']);
});

test('blastRadiusSummary returns all-zero summary for an empty file list', () => {
  assert.deepStrictEqual(blastRadiusSummary([]), {
    implLines: 0,
    testLines: 0,
    implFiles: 0,
    testFiles: 0,
    sensitiveFilesTouched: [],
  });
});
