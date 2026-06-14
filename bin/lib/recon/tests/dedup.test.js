const { test } = require('node:test');
const assert = require('node:assert');
const { decide, SEVERITY_RANK } = require('../dedup');

// issueIndex shape (contract): { "<fingerprint>": { number, state, labels } }
const F = (id, sev = 'high') => ({ id, severity: sev });

test('SEVERITY_RANK orders critical highest', () => {
  assert.ok(SEVERITY_RANK.critical < SEVERITY_RANK.high);
  assert.ok(SEVERITY_RANK.high < SEVERITY_RANK.low);
});

test('open issue with same fingerprint -> skip', () => {
  const index = { 'recon-aaa': { number: 7, state: 'open', labels: ['recon'] } };
  assert.deepStrictEqual(decide(F('recon-aaa'), index, {}), { action: 'skip', issue: 7 });
});

test('closed non-wontfix issue with same fingerprint -> reopen (regressed)', () => {
  const index = { 'recon-bbb': { number: 8, state: 'closed', labels: ['recon'] } };
  const result = decide(F('recon-bbb'), index, {});
  assert.strictEqual(result.action, 'reopen');
  assert.strictEqual(result.issue, 8);
  assert.ok(typeof result.note === 'string' && result.note.length > 0, 'note should be a non-empty string');
});

test('wontfix-labelled issue -> suppress (standing decision)', () => {
  const index = { 'recon-ccc': { number: 9, state: 'open', labels: ['recon', 'wontfix'] } };
  assert.deepStrictEqual(decide(F('recon-ccc'), index, {}), { action: 'suppress', issue: 9 });
});

test('wontfix in cache, no issue -> suppress', () => {
  assert.deepStrictEqual(decide(F('recon-ddd'), {}, { 'recon-ddd': { status: 'wontfix', issue: null } }),
    { action: 'suppress' });
});

test('new finding at/above threshold -> file', () => {
  assert.deepStrictEqual(decide(F('recon-eee', 'high'), {}, {}), { action: 'file' });
  assert.deepStrictEqual(decide(F('recon-eee', 'critical'), {}, {}), { action: 'file' });
});

test('new finding below threshold -> remember', () => {
  assert.deepStrictEqual(decide(F('recon-fff', 'medium'), {}, {}), { action: 'remember' });
  assert.deepStrictEqual(decide(F('recon-fff', 'low'), {}, {}), { action: 'remember' });
});

test('threshold is overridable', () => {
  assert.deepStrictEqual(decide(F('recon-ggg', 'medium'), {}, {}, { threshold: 'medium' }), { action: 'file' });
});
