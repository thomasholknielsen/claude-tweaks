'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  sniffFamily, extractFailingRegion, parseCounts, summaryLine,
  MAX_REGION_LINES, GENERIC_TAIL_LINES,
} = require(path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'verify', 'extract.js'));

const TAP_FIXTURE = [
  'ok 1 - passes fine',
  'not ok 2 - fails badly',
  '  ---',
  '  error: boom',
  "  stack: at Object.<anonymous>",
  '  ...',
  'ok 3 - another pass',
  '# tests 3',
  '# pass 2',
  '# fail 1',
].join('\n');

const JEST_FIXTURE = [
  'PASS src/a.test.js',
  'FAIL src/b.test.js',
  '  ● b > explodes',
  '    Error: kaboom',
  'Tests:       1 failed, 4 passed, 5 total',
].join('\n');

const PYTEST_FIXTURE = [
  'collected 5 items',
  'FAILED tests/test_b.py::test_x - AssertionError',
  '=========== 1 failed, 4 passed in 0.21s ===========',
].join('\n');

const GENERIC_FIXTURE = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n');

test('sniffs TAP from line-anchored markers', () => {
  assert.strictEqual(sniffFamily(TAP_FIXTURE), 'tap');
});

test('sniffs summary family for jest and pytest shapes', () => {
  assert.strictEqual(sniffFamily(JEST_FIXTURE), 'summary');
  assert.strictEqual(sniffFamily(PYTEST_FIXTURE), 'summary');
});

test('TAP precedence beats summary markers in the same text (AC5 precedence)', () => {
  assert.strictEqual(sniffFamily(`${JEST_FIXTURE}\nnot ok 1 - tap wins\n# tests 1`), 'tap');
});

test('no markers sniffs generic', () => {
  assert.strictEqual(sniffFamily(GENERIC_FIXTURE), 'generic');
});

test('a mid-line "not ok" does not trigger TAP (line-anchored)', () => {
  assert.strictEqual(sniffFamily('the result was not ok today\nplain text'), 'generic');
});

test('TAP extraction carries the not-ok line with trailing diagnostics', () => {
  const region = extractFailingRegion(TAP_FIXTURE, 'tap');
  assert.ok(region.includes('not ok 2 - fails badly'));
  assert.ok(region.includes('error: boom'));
  assert.ok(!region.includes('ok 1 - passes fine'));
});

test('summary extraction carries FAIL region and trailing summary block', () => {
  const region = extractFailingRegion(JEST_FIXTURE, 'summary');
  assert.ok(region.includes('FAIL src/b.test.js'));
  assert.ok(region.includes('Tests:       1 failed, 4 passed, 5 total'));
});

test('generic extraction is the last GENERIC_TAIL_LINES lines', () => {
  const region = extractFailingRegion(GENERIC_FIXTURE, 'generic');
  const lines = region.split('\n');
  assert.strictEqual(lines.length, GENERIC_TAIL_LINES);
  assert.strictEqual(lines[lines.length - 1], 'line 50');
});

test('every branch caps at MAX_REGION_LINES', () => {
  const bigTap = Array.from({ length: 400 }, (_, i) => `not ok ${i + 1} - f${i}`).join('\n');
  assert.ok(extractFailingRegion(bigTap, 'tap').split('\n').length <= MAX_REGION_LINES);
  const bigSummary = Array.from({ length: 400 }, (_, i) => `FAIL src/f${i}.test.js`).join('\n');
  assert.ok(extractFailingRegion(bigSummary, 'summary').split('\n').length <= MAX_REGION_LINES);
});

test('TAP counts parse from the # tests/# pass/# fail block', () => {
  assert.deepStrictEqual(parseCounts(TAP_FIXTURE, 'tap'), { tests: 3, pass: 2, fail: 1 });
});

test('jest counts parse from the Tests: line', () => {
  assert.deepStrictEqual(parseCounts(JEST_FIXTURE, 'summary'), { tests: 5, pass: 4, fail: 1 });
});

test('pytest counts parse from the === summary line', () => {
  assert.deepStrictEqual(parseCounts(PYTEST_FIXTURE, 'summary'), { tests: 5, pass: 4, fail: 1 });
});

test('incomplete TAP count block yields null, never a guess', () => {
  assert.strictEqual(parseCounts('not ok 1 - x\n# tests 3\n# pass 2', 'tap'), null);
});

test('summary with no parseable numbers yields null', () => {
  assert.strictEqual(parseCounts('FAIL src/b.test.js\nno numbers here', 'summary'), null);
});

test('generic family never yields counts', () => {
  assert.strictEqual(parseCounts('# tests 3\n# pass 3\n# fail 0', 'generic'), null);
});

test('summaryLine is one bounded line', () => {
  const line = summaryLine(TAP_FIXTURE, 'tap');
  assert.ok(!line.includes('\n'));
  assert.ok(line.length <= 200);
  const long = summaryLine('x'.repeat(5000), 'generic');
  assert.ok(long.length <= 200);
});
