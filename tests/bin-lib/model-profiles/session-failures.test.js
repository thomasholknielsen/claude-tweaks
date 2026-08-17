'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  failurePath, readFailedModels, recordFailure,
} = require('../../../bin/lib/model-profiles/session-failures');

function cleanup(sessionId) {
  const p = failurePath(sessionId);
  if (p) { try { fs.unlinkSync(p); } catch { /* already absent */ } }
}

test('failurePath is null for a missing/blank session id, a real path otherwise', () => {
  assert.strictEqual(failurePath(undefined), null);
  assert.strictEqual(failurePath(''), null);
  assert.strictEqual(failurePath('  '), null);
  assert.strictEqual(failurePath('abc-123'), path.join(os.tmpdir(), 'ct-model-failures-abc-123.json'));
});

test('readFailedModels returns an empty set when no file exists', () => {
  const id = 'sf-test-empty';
  cleanup(id);
  assert.deepStrictEqual(readFailedModels(id), new Set());
});

test('readFailedModels degrades to an empty set on malformed JSON, never throws', () => {
  const id = 'sf-test-malformed';
  fs.writeFileSync(failurePath(id), 'not json');
  assert.deepStrictEqual(readFailedModels(id), new Set());
  cleanup(id);
});

test('recordFailure then readFailedModels round-trips one model', () => {
  const id = 'sf-test-roundtrip';
  cleanup(id);
  recordFailure(id, 'fable');
  assert.deepStrictEqual(readFailedModels(id), new Set(['fable']));
  cleanup(id);
});

test('recordFailure is idempotent — recording the same model twice does not duplicate', () => {
  const id = 'sf-test-idempotent';
  cleanup(id);
  recordFailure(id, 'fable');
  recordFailure(id, 'fable');
  const raw = JSON.parse(fs.readFileSync(failurePath(id), 'utf8'));
  assert.strictEqual(raw.length, 1);
  cleanup(id);
});

test('recordFailure accumulates distinct models across calls', () => {
  const id = 'sf-test-accumulate';
  cleanup(id);
  recordFailure(id, 'fable');
  recordFailure(id, 'opus');
  assert.deepStrictEqual(readFailedModels(id), new Set(['fable', 'opus']));
  cleanup(id);
});

test('recordFailure is a no-op with no session id — nothing thrown, no file written', () => {
  assert.doesNotThrow(() => recordFailure(undefined, 'fable'));
  assert.doesNotThrow(() => recordFailure('', 'fable'));
});

test('two session ids never share a file', () => {
  cleanup('sf-test-a');
  cleanup('sf-test-b');
  recordFailure('sf-test-a', 'fable');
  assert.deepStrictEqual(readFailedModels('sf-test-b'), new Set());
  cleanup('sf-test-a');
  cleanup('sf-test-b');
});
