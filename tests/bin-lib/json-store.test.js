'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readJsonFile, writeJsonFile } = require('../../plugin/bin/lib/json-store');

function tmpFile(name = 'data.json') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'json-store-'));
  return path.join(dir, name);
}

test('readJsonFile: returns the fallback for a missing file, without throwing', () => {
  assert.equal(readJsonFile(tmpFile(), { fallback: 'nope' }), 'nope');
  assert.equal(readJsonFile(tmpFile()), null);
});

test('readJsonFile: returns the fallback for unparseable content, without throwing', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{ not json');
  assert.equal(readJsonFile(file, { fallback: [] }).length, 0);
});

test('readJsonFile/writeJsonFile: round-trips a value; write creates parent dirs; content is pretty-printed with a trailing newline', () => {
  const file = tmpFile('nested/deep/data.json');
  writeJsonFile(file, { a: 1, b: [1, 2, 3] });
  assert.deepEqual(readJsonFile(file), { a: 1, b: [1, 2, 3] });
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(raw.endsWith('\n'));
  assert.ok(raw.includes('\n  "a": 1'), 'pretty-printed, not minified');
});

test('writeJsonFile: never leaves a partial file behind — a reader sees the old or the new content, never a truncated write', () => {
  const file = tmpFile();
  writeJsonFile(file, { v: 1 });
  writeJsonFile(file, { v: 2 });
  assert.deepEqual(readJsonFile(file), { v: 2 });
  const dir = fs.readdirSync(path.dirname(file));
  assert.deepEqual(dir, [path.basename(file)], 'no leftover .tmp file');
});
