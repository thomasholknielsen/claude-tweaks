'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { extractIdentifiers, findLostIdentifiers } = require('../identifiers.js');

test('extractIdentifiers: collects backticked spans', () => {
  // Sorted lexicographically, so uppercase precedes lowercase.
  const out = extractIdentifiers('Set `PIPELINE_RUN_DIR` before calling `merge-check`.');
  assert.deepStrictEqual(out, ['PIPELINE_RUN_DIR', 'merge-check']);
});

test('extractIdentifiers: drops skill references and paths', () => {
  const out = extractIdentifiers('`/claude-tweaks:flow` passes `PIPELINE_RUN_DIR`');
  assert.deepStrictEqual(out, ['PIPELINE_RUN_DIR']);
});

test('extractIdentifiers: collects step references', () => {
  const out = extractIdentifiers('Step 8.6 hands off to Step 3.');
  assert.deepStrictEqual(out, ['Step 3', 'Step 8.6']);
});

test('extractIdentifiers: drops spans shorter than 4 chars', () => {
  assert.deepStrictEqual(extractIdentifiers('use `gh` and `auto:merge`'), ['auto:merge']);
});

test('extractIdentifiers: dedupes repeats', () => {
  assert.deepStrictEqual(extractIdentifiers('`ready` then `ready`'), ['ready']);
});

test('extractIdentifiers: returns empty array for prose with no identifiers', () => {
  assert.deepStrictEqual(extractIdentifiers('Just ordinary prose here.'), []);
});

test('findLostIdentifiers: reports an identifier absent from the after-corpus', () => {
  const before = 'flow passes `PIPELINE_RUN_DIR` and constrains `subagent` execution.';
  const after = 'flow constrains `subagent` execution.';
  assert.deepStrictEqual(findLostIdentifiers(before, after), ['PIPELINE_RUN_DIR']);
});

test('findLostIdentifiers: survives rewording when the identifier is retained', () => {
  const before = '| `/flow` | Invoked BY /flow; passes `PIPELINE_RUN_DIR` so auto-mode resolves. |';
  const after = 'Step 4 reads `PIPELINE_RUN_DIR` from the invoking pipeline.';
  assert.deepStrictEqual(findLostIdentifiers(before, after), []);
});

test('findLostIdentifiers: matches across a line wrap in the after-corpus', () => {
  const before = 'see `merge-sensitive-paths` for detail';
  const after = 'reads the\n`merge-sensitive-paths`\nkey';
  assert.deepStrictEqual(findLostIdentifiers(before, after), []);
});

test('findLostIdentifiers: returns empty when before has no identifiers', () => {
  assert.deepStrictEqual(findLostIdentifiers('plain prose', 'anything'), []);
});
