'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { recordPayload, TYPE_LABELS } = require('../record');

test('recordPayload assembles labels for a born-ready health record', () => {
  const result = recordPayload({
    title: 't', body: 'b', type: 'task', origin: 'code-health',
    risk: 'low', effort: 'low', ready: true, fingerprint: 'ch:abc',
  });
  assert.deepStrictEqual(result.labels, ['by:code-health', 'risk:low', 'effort:low', 'ready']);
  assert.strictEqual(result.type, 'task');
  assert.strictEqual(result.body, 'b\n\n<!-- work-fingerprint: ch:abc -->');
});

test('recordPayload assembles a plain capture record', () => {
  const result = recordPayload({ title: 't', body: 'b', type: 'feature', origin: 'capture' });
  assert.deepStrictEqual(result.labels, ['by:capture']);
  assert.strictEqual(result.body, 'b');
});

test('recordPayload with origin omitted emits no by:* label and does not throw', () => {
  const result = recordPayload({ title: 't', body: 'b', type: 'bug' });
  assert.deepStrictEqual(result.labels, []);
});

test('recordPayload throws on unknown type; absence never throws', () => {
  assert.throws(() => recordPayload({ title: 't', body: 'b', type: 'epic' }), /bug|feature|task/);
});

test('recordPayload throws on unknown origin', () => {
  assert.throws(() => recordPayload({ title: 't', body: 'b', type: 'task', origin: 'wrap-up' }), /origin/);
});

test('recordPayload throws on unknown risk', () => {
  assert.throws(() => recordPayload({ title: 't', body: 'b', type: 'task', risk: 'critical' }), /risk/);
});

test('recordPayload throws when both ready and parked are true', () => {
  assert.throws(
    () => recordPayload({ title: 't', body: 'b', type: 'task', ready: true, parked: true }),
    /both ready and parked/
  );
});

test('recordPayload emits parked and priority labels', () => {
  const result = recordPayload({ title: 't', body: 'b', type: 'task', parked: true, priority: 'high' });
  assert.deepStrictEqual(result.labels, ['parked', 'priority:high']);
});

test('TYPE_LABELS has exactly 3 pairs naming type:bug|feature|task with descriptions <= 100 chars', () => {
  assert.strictEqual(TYPE_LABELS.length, 3);
  assert.deepStrictEqual(TYPE_LABELS.map(([name]) => name), ['type:bug', 'type:feature', 'type:task']);
  for (const [, description] of TYPE_LABELS) {
    assert.ok(description.length <= 100, `description too long: "${description}"`);
  }
});
