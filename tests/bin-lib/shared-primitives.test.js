'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runClassified, runClassifiedAsync } = require('../../plugin/bin/lib/shared-primitives');

test('runClassified: returns fn()\'s value on success', () => {
  const result = runClassified(() => 'ok', () => 'unused');
  assert.strictEqual(result, 'ok');
});

test('runClassified: returns mapError(err) when fn() throws', () => {
  const err = new Error('boom');
  const result = runClassified(
    () => { throw err; },
    (caught) => ({ caught }),
  );
  assert.deepStrictEqual(result, { caught: err });
});

test('runClassified: mapError never runs on the success path', () => {
  let mapErrorCalls = 0;
  runClassified(() => 'ok', () => { mapErrorCalls += 1; return 'unused'; });
  assert.strictEqual(mapErrorCalls, 0);
});

test('runClassifiedAsync: returns fn()\'s resolved value on success', async () => {
  const result = await runClassifiedAsync(async () => 'ok', () => 'unused');
  assert.strictEqual(result, 'ok');
});

test('runClassifiedAsync: returns mapError(err) when fn() rejects', async () => {
  const err = new Error('boom');
  const result = await runClassifiedAsync(
    async () => { throw err; },
    (caught) => ({ caught }),
  );
  assert.deepStrictEqual(result, { caught: err });
});

test('runClassifiedAsync: mapError never runs on the success path', async () => {
  let mapErrorCalls = 0;
  await runClassifiedAsync(async () => 'ok', () => { mapErrorCalls += 1; return 'unused'; });
  assert.strictEqual(mapErrorCalls, 0);
});
