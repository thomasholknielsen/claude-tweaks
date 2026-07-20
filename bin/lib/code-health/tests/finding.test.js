const { test } = require('node:test');
const assert = require('node:assert');
const { makeFinding, FINDING_FIELDS } = require('../finding');

test('makeFinding fills defaults and preserves provided fields', () => {
  const f = makeFinding({
    lens: 'todo-comments',
    area: '.',
    signature: 'TODO wire it up',
    title: 'TODO in a.js',
    files: ['a.js:12'],
    evidence: 'a.js:12 (TODO: wire it up)',
    suggestion: 'Resolve the TODO.',
    acceptance: 'TODO removed or tracked.',
  });
  assert.strictEqual(f.lens, 'todo-comments');
  assert.strictEqual(f.category, 'convention');     // default
  assert.strictEqual(f.severity, 'low');            // default
  assert.strictEqual(f.confidence, 'high');         // default
  assert.deepStrictEqual(f.files, ['a.js:12']);
  assert.strictEqual(f.id, null);                   // fingerprint assigns later
});

test('makeFinding rejects an invalid severity', () => {
  assert.throws(() => makeFinding({ lens: 'x', area: '.', signature: 's', title: 't', severity: 'urgent' }),
    /severity/);
});

test('makeFinding rejects "critical" — dropped from the schema, must match validate-finding.js\'s low|medium|high', () => {
  assert.throws(() => makeFinding({ lens: 'x', area: '.', signature: 's', title: 't', severity: 'critical' }),
    /severity/);
});

test('FINDING_FIELDS lists every field exactly once', () => {
  assert.ok(FINDING_FIELDS.includes('acceptance'));
  assert.strictEqual(new Set(FINDING_FIELDS).size, FINDING_FIELDS.length);
});
