'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  readStamp, detectRegression, caveatLine,
} = require(path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'verify', 'count-stamp.js'));

function fakeFs(files) {
  return {
    readFileSync: (p) => {
      if (!(p in files)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return files[p];
    },
  };
}

test('readStamp returns null when the file does not exist (bootstrap, first run)', () => {
  assert.strictEqual(readStamp('/nope.json', fakeFs({})), null);
});

test('readStamp returns null on malformed JSON (fail toward absence)', () => {
  assert.strictEqual(readStamp('/c.json', fakeFs({ '/c.json': 'not json' })), null);
});

test('readStamp returns null when tests is missing or not a finite number', () => {
  assert.strictEqual(readStamp('/c.json', fakeFs({ '/c.json': '{"sha":"abc"}' })), null);
  assert.strictEqual(readStamp('/c.json', fakeFs({ '/c.json': '{"tests":"9"}' })), null);
  assert.strictEqual(readStamp('/c.json', fakeFs({ '/c.json': '{"tests":null}' })), null);
});

test('readStamp parses a well-formed stamp', () => {
  const fs = fakeFs({ '/c.json': '{"tests":10,"sha":"abc","recordedAt":"2026-08-27T00:00:00.000Z"}' });
  assert.deepStrictEqual(readStamp('/c.json', fs), { tests: 10, sha: 'abc', recordedAt: '2026-08-27T00:00:00.000Z' });
});

test('detectRegression returns null when there is no previous baseline (bootstrap)', () => {
  assert.strictEqual(detectRegression(null, { tests: 5 }), null);
});

test('detectRegression returns null when the current run has no parseable count', () => {
  assert.strictEqual(detectRegression({ tests: 5 }, null), null);
});

test('detectRegression returns null when the count held steady or increased', () => {
  assert.strictEqual(detectRegression({ tests: 10 }, { tests: 10 }), null);
  assert.strictEqual(detectRegression({ tests: 10 }, { tests: 12 }), null);
});

// IL-84's exact shape: an enumerated-glob npm test configuration silently
// excluded a whole test directory (15 tests never ran) while still exiting
// 0 -- a drop that looked identical to a clean pass. This fixture reproduces
// that shape at the detection layer: a prior run recorded 100 tests, this
// run's glob silently excluded a directory and only 85 ran.
test('detectRegression fires on IL-84\'s exact shape -- a silent glob exclusion drops the count', () => {
  const previous = { tests: 100, sha: 'aaa', recordedAt: '2026-08-20T00:00:00.000Z' };
  const current = { tests: 85, sha: 'bbb', recordedAt: '2026-08-27T00:00:00.000Z' };
  const regression = detectRegression(previous, current);
  assert.deepStrictEqual(regression, { previousTests: 100, currentTests: 85, droppedBy: 15 });
});

test('caveatLine returns null when there is no regression', () => {
  assert.strictEqual(caveatLine(null), null);
});

test('caveatLine names the drop, the delta, and cites IL-84', () => {
  const line = caveatLine({ previousTests: 100, currentTests: 85, droppedBy: 15 });
  assert.match(line, /^CAVEAT:/);
  assert.match(line, /100/);
  assert.match(line, /85/);
  assert.match(line, /15/);
  assert.match(line, /IL-84/);
});
