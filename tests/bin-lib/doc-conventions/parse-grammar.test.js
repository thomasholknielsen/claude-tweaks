// tests/bin-lib/doc-conventions/parse-grammar.test.js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseGrammar } = require('../../../plugin/bin/lib/doc-conventions/parse-grammar');

function adrCorpus(count) {
  const files = [];
  for (let i = 1; i <= count; i++) {
    files.push(`ADR-${String(i).padStart(3, '0')}-decision-${i}.md`);
  }
  return files;
}

function numberedCorpus(count) {
  const files = [];
  for (let i = 1; i <= count; i++) {
    files.push(`${String(i).padStart(4, '0')}-record-${i}.md`);
  }
  return files;
}

test('parseGrammar reads a 16-file ADR-016-slug.md corpus as prefix/sep/pad-3, all agreeing', () => {
  const result = parseGrammar(adrCorpus(16));
  assert.deepStrictEqual(result, {
    prefix: 'ADR-', separator: '-', padWidth: 3, agreeing: 16, total: 16,
  });
});

test('parseGrammar reads a 13-file 0007-slug.md corpus as no-prefix/sep/pad-4, all agreeing', () => {
  const result = parseGrammar(numberedCorpus(13));
  assert.deepStrictEqual(result, {
    prefix: '', separator: '-', padWidth: 4, agreeing: 13, total: 13,
  });
});

test('parseGrammar returns null for a 2-file corpus — under the 3-file floor', () => {
  assert.strictEqual(parseGrammar(adrCorpus(2)), null);
});

test('parseGrammar reports a mixed 9/5-split corpus without deciding what the split means', () => {
  const majority = adrCorpus(9); // prefix ADR-, pad 3
  const minority = [];
  for (let i = 1; i <= 5; i++) {
    minority.push(`NOTE-${String(i).padStart(2, '0')}-aside-${i}.md`); // prefix NOTE-, pad 2
  }
  const result = parseGrammar([...majority, ...minority]);
  assert.deepStrictEqual(result, {
    prefix: 'ADR-', separator: '-', padWidth: 3, agreeing: 9, total: 14,
  });
});

test('parseGrammar returns null when no filename in the corpus carries parseable numbering', () => {
  const files = ['readme.md', 'overview.md', 'glossary.md', 'index.md'];
  assert.strictEqual(parseGrammar(files), null);
});

test('parseGrammar returns null for a non-array input', () => {
  assert.strictEqual(parseGrammar(undefined), null);
  assert.strictEqual(parseGrammar(null), null);
});
