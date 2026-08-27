'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { writeJsonAtomic } = require(path.join(
  __dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'verify', 'atomic-write'));

// The single atomic-write implementation behind both of bin/verify.js's JSON
// writes -- report.json (#892 AC3) and the #881 suite-count stamp.
test('writeJsonAtomic writes a temp file then renames it over the target (AC3)', () => {
  const calls = [];
  const fakeFs = {
    writeFileSync: (p, content) => calls.push(['write', p, content]),
    renameSync: (from, to) => calls.push(['rename', from, to]),
  };
  writeJsonAtomic('/out/thing.json', { a: 1 }, fakeFs);
  assert.strictEqual(calls[0][0], 'write');
  assert.strictEqual(calls[0][1], '/out/thing.json.tmp');
  assert.deepStrictEqual(JSON.parse(calls[0][2]), { a: 1 });
  assert.deepStrictEqual(calls[1], ['rename', '/out/thing.json.tmp', '/out/thing.json']);
});

test('writeJsonAtomic actually persists real content to disk with no injected fs (real filesystem path)', () => {
  const os = require('os');
  const fs = require('fs');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-write-test-'));
  const target = path.join(tmpDir, 'out.json');
  writeJsonAtomic(target, { hello: 'world' });
  assert.ok(fs.existsSync(target));
  assert.ok(!fs.existsSync(`${target}.tmp`), 'temp file must not survive the rename');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, 'utf8')), { hello: 'world' });
});
