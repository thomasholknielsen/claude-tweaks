'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  recordPayload, TYPE_LABELS,
  extractFingerprint, parseRecordFacets, parseDependencies,
} = require('../record');

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

test('recordPayload throws when title is missing', () => {
  assert.throws(() => recordPayload({ body: 'b', type: 'task' }), /title/);
});

test('recordPayload throws when title is not a string', () => {
  assert.throws(() => recordPayload({ title: 5, body: 'b', type: 'task' }), /title/);
});

test('recordPayload throws when body is missing', () => {
  assert.throws(() => recordPayload({ title: 't', type: 'task' }), /body/);
});

test('recordPayload throws when body is not a string', () => {
  assert.throws(() => recordPayload({ title: 't', body: 5, type: 'task' }), /body/);
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

test('recordPayload throws on unknown effort', () => {
  assert.throws(() => recordPayload({ title: 't', body: 'b', type: 'task', effort: 'gigantic' }), /effort/);
});

test('recordPayload throws on unknown priority', () => {
  assert.throws(() => recordPayload({ title: 't', body: 'b', type: 'task', priority: 'urgent' }), /priority/);
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

// AC 2 — dual-marker extraction

test('extractFingerprint reads the legacy code-health-fingerprint marker', () => {
  assert.strictEqual(extractFingerprint('x\n<!-- code-health-fingerprint: old:1 -->'), 'old:1');
});

test('extractFingerprint reads the new work-fingerprint marker', () => {
  assert.strictEqual(extractFingerprint('x\n<!-- work-fingerprint: new:2 -->'), 'new:2');
});

test('extractFingerprint prefers the new work-fingerprint marker when both are present', () => {
  assert.strictEqual(
    extractFingerprint('<!-- code-health-fingerprint: old:1 -->\n<!-- work-fingerprint: new:2 -->'),
    'new:2'
  );
});

test('extractFingerprint returns null when no marker is present', () => {
  assert.strictEqual(extractFingerprint('no markers here'), null);
});

test('extractFingerprint returns null for null, undefined, and empty-string bodies', () => {
  assert.strictEqual(extractFingerprint(null), null);
  assert.strictEqual(extractFingerprint(undefined), null);
  assert.strictEqual(extractFingerprint(''), null);
});

// AC 4 — facets

test('parseRecordFacets: by:capture + parked', () => {
  assert.deepStrictEqual(parseRecordFacets(['by:capture', 'parked']), {
    origin: 'capture', risk: null, effort: null, priority: null, stage: 'parked',
    grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
  });
});

test('parseRecordFacets: ready + auto:build + bot:in-progress', () => {
  const result = parseRecordFacets(['ready', 'auto:build', 'bot:in-progress']);
  assert.strictEqual(result.stage, 'ready');
  assert.deepStrictEqual(result.grants, { build: true, merge: false });
  assert.deepStrictEqual(result.bot, { inProgress: true, blocked: false });
  assert.strictEqual(result.origin, null);
});

test('parseRecordFacets: auto:build + auto:merge grants both build and merge', () => {
  const result = parseRecordFacets(['auto:build', 'auto:merge']);
  assert.deepStrictEqual(result.grants, { build: true, merge: true });
});

test('parseRecordFacets: bot:blocked sets bot.blocked without bot.inProgress', () => {
  const result = parseRecordFacets(['bot:blocked']);
  assert.deepStrictEqual(result.bot, { inProgress: false, blocked: true });
});

test('parseRecordFacets: empty label list', () => {
  assert.deepStrictEqual(parseRecordFacets([]), {
    origin: null, risk: null, effort: null, priority: null, stage: 'backlog',
    grants: { build: false, merge: false }, bot: { inProgress: false, blocked: false },
  });
});

test('parseRecordFacets: {name} label objects for risk/effort/priority, unmatched wontfix ignored', () => {
  const result = parseRecordFacets([
    { name: 'risk:high' }, { name: 'effort:low' }, { name: 'priority:medium' }, { name: 'wontfix' },
  ]);
  assert.strictEqual(result.risk, 'high');
  assert.strictEqual(result.effort, 'low');
  assert.strictEqual(result.priority, 'medium');
  assert.strictEqual(result.stage, 'backlog');
});

test('parseRecordFacets: malformed ready+parked resolves deterministically to ready (ready > parked)', () => {
  assert.strictEqual(parseRecordFacets(['ready', 'parked']).stage, 'ready');
});

test('parseRecordFacets: malformed parked+ready still resolves to ready regardless of array order', () => {
  assert.strictEqual(parseRecordFacets(['parked', 'ready']).stage, 'ready');
});

// AC 5 — dependencies

test('parseDependencies collects line-anchored Blocked-by numbers in order of appearance', () => {
  assert.deepStrictEqual(parseDependencies('intro\nBlocked by #12\nBlocked by #7\ntail'), [12, 7]);
});

test('parseDependencies dedupes repeated numbers', () => {
  assert.deepStrictEqual(parseDependencies('Blocked by #12\nBlocked by #12'), [12]);
});

test('parseDependencies returns an empty array when there are no dependency lines', () => {
  assert.deepStrictEqual(parseDependencies('no deps'), []);
});

test('parseDependencies ignores mid-line occurrences (line-anchored only)', () => {
  assert.deepStrictEqual(parseDependencies('see Blocked by #9 mid-line'), []);
});
