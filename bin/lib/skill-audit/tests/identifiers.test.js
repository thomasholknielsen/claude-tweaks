'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { extractIdentifiers, countOccurrences, findLostOccurrences } = require('../identifiers.js');

test('extractIdentifiers: collects backticked spans', () => {
  // Sorted lexicographically, so uppercase precedes lowercase.
  const out = extractIdentifiers('Set `PIPELINE_RUN_DIR` before calling `close-run`.');
  assert.deepStrictEqual(out, ['PIPELINE_RUN_DIR', 'close-run']);
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

test('countOccurrences: counts non-overlapping hits', () => {
  assert.strictEqual(countOccurrences('ready', 'ready set ready go ready'), 3);
  assert.strictEqual(countOccurrences('ready', 'nothing here'), 0);
});

test('countOccurrences: normalises whitespace on both sides', () => {
  assert.strictEqual(countOccurrences('merge  check', 'a merge\ncheck b'), 1);
});

test('findLostOccurrences: reports nothing when a row moves within one file', () => {
  const before = '| `/flow` | passes `PIPELINE_RUN_DIR` |\nStep 4 runs.';
  const after = 'Step 4 runs, reading `PIPELINE_RUN_DIR` from the invoking pipeline.';
  assert.deepStrictEqual(findLostOccurrences(before, before, after), []);
});

test('findLostOccurrences: matches across a line wrap in the after-corpus', () => {
  const row = 'see `merge-sensitive-paths` for detail';
  const after = 'reads the\n`merge-sensitive-paths`\nkey';
  assert.deepStrictEqual(findLostOccurrences(row, row, after), []);
});

test('findLostOccurrences: reports a drop even when the identifier survives elsewhere', () => {
  // The whole point: `PIPELINE_RUN_DIR` still appears, but one occurrence vanished.
  const row = 'passes `PIPELINE_RUN_DIR` to the child run';
  const before = 'Step 4 reads `PIPELINE_RUN_DIR`.\n' + row;
  const after = 'Step 4 reads `PIPELINE_RUN_DIR`.';
  assert.deepStrictEqual(findLostOccurrences(row, before, after), [
    { identifier: 'PIPELINE_RUN_DIR', before: 2, after: 1 },
  ]);
});

test('findLostOccurrences: returns empty when the source text has no identifiers', () => {
  assert.deepStrictEqual(findLostOccurrences('plain prose', 'anything', 'anything'), []);
});

test('findLostOccurrences: acceptance — deleting a whole Relationship table reports near-total loss', () => {
  // The experiment that condemned the previous presence-based implementation, which
  // scored 24% on this exact input. Counting occurrences must score at or near 100%.
  //
  // The input is a FIXTURE, not the live skills/review/SKILL.md, because Phase 2b then
  // deleted every Relationship section in the corpus — reading the live file would make
  // this test unrunnable the moment it proved its point. The fixture is that file
  // verbatim at the last commit before the deletion, so the experiment still runs on
  // exactly the bytes that produced the 24% and 100% figures on record.
  const file = path.join(__dirname, 'fixtures', 'review-SKILL-pre-2b.md');
  const before = fs.readFileSync(file, 'utf8');
  const lines = before.split('\n');
  const start = lines.findIndex((l) => /^##\s+Relationship to Other Skills/.test(l));
  assert.ok(start > 0, 'the fixture must still contain a Relationship section');
  let end = start + 1;
  while (end < lines.length && !/^##\s/.test(lines[end])) end += 1;

  const table = lines.slice(start, end).join('\n');
  const after = lines.slice(0, start).concat(lines.slice(end)).join('\n');
  const ids = extractIdentifiers(table);
  assert.ok(ids.length >= 20, `expected a substantial table, got ${ids.length} identifiers`);

  const lost = findLostOccurrences(table, before, after);
  const ratio = lost.length / ids.length;
  assert.ok(
    ratio >= 0.95,
    `expected >=95% of ${ids.length} identifiers reported lost, got ${lost.length} (${(ratio * 100).toFixed(0)}%)`,
  );
});
