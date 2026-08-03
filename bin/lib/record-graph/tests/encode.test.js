const { test } = require('node:test');
const assert = require('node:assert');
const { encodeRecord } = require('../encode');
const { FIXTURE_RECORDS } = require('./fixtures');

test('encodeRecord: backlog record with nothing set gets no badges, human fill, default border', () => {
  const encoded = encodeRecord(FIXTURE_RECORDS[0]);
  assert.strictEqual(encoded.number, 10);
  assert.strictEqual(encoded.title, '#10 Backlog record with no scoring');
  assert.strictEqual(encoded.fillKey, 'human');
  assert.strictEqual(encoded.borderStyle, 'default');
  assert.deepStrictEqual(encoded.badges, []);
});

test('encodeRecord: code-health-origin, scored, in-progress record gets a scoring badge only', () => {
  const encoded = encodeRecord(FIXTURE_RECORDS[1]);
  assert.strictEqual(encoded.fillKey, 'code-health');
  assert.strictEqual(encoded.borderStyle, 'in-progress');
  assert.deepStrictEqual(encoded.badges, ['R:low E:medium']);
});

test('encodeRecord: bot:blocked wins over bot:inProgress when (hypothetically) both are true', () => {
  const both = { ...FIXTURE_RECORDS[1], facets: { ...FIXTURE_RECORDS[1].facets, bot: { inProgress: true, blocked: true } } };
  assert.strictEqual(encodeRecord(both).borderStyle, 'blocked');
});

test('encodeRecord: fully-badged parked record — type via type:* label fallback, both grants, acceptance', () => {
  const encoded = encodeRecord(FIXTURE_RECORDS[2]);
  assert.strictEqual(encoded.fillKey, 'human');
  assert.strictEqual(encoded.borderStyle, 'blocked');
  assert.deepStrictEqual(encoded.badges, ['[bug]', 'AUTO-BUILD', 'AUTO-MERGE', 'demo:pending']);
});

test('encodeRecord: native Issue Type takes precedence over any type:* label', () => {
  const record = { ...FIXTURE_RECORDS[2], issueType: { name: 'Feature' } };
  assert.deepStrictEqual(encodeRecord(record).badges, ['[feature]', 'AUTO-BUILD', 'AUTO-MERGE', 'demo:pending']);
});

test('encodeRecord: unrecognized native Issue Type name omits the Type badge rather than guessing', () => {
  const record = { ...FIXTURE_RECORDS[0], issueType: { name: 'Epic' } };
  assert.deepStrictEqual(encodeRecord(record).badges, []);
});

test('encodeRecord: only one of risk/effort set still shows a scoring badge with "?" for the other', () => {
  const record = { ...FIXTURE_RECORDS[0], facets: { ...FIXTURE_RECORDS[0].facets, risk: 'high' } };
  assert.deepStrictEqual(encodeRecord(record).badges, ['R:high E:?']);
});

test('encodeRecord: the label is prefixed with the issue number so a node says which issue it is', () => {
  for (const record of FIXTURE_RECORDS) {
    assert.ok(
      encodeRecord(record).title.startsWith(`#${record.number} `),
      `expected #${record.number} prefix, got "${encodeRecord(record).title}"`,
    );
  }
});

test('encodeRecord: only the title portion is capped at 40 chars — the #N prefix rides on top', () => {
  const longTitle = 'x'.repeat(50);
  const record = { ...FIXTURE_RECORDS[0], title: longTitle };
  const encoded = encodeRecord(record);
  assert.strictEqual(encoded.title, `#10 ${'x'.repeat(39)}…`);
  assert.strictEqual(encoded.title.length, 44);
});

test('encodeRecord: title at or under 40 chars is left unchanged behind the #N prefix', () => {
  assert.strictEqual(encodeRecord(FIXTURE_RECORDS[0]).title, '#10 Backlog record with no scoring');
});
