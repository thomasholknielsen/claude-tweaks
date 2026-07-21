const { test } = require('node:test');
const assert = require('node:assert');
const { decide, RISK_RANK } = require('../dedup');

// issueIndex shape (contract): { "<fingerprint>": { number, state, labels } }
const F = (id, risk = 'high') => ({ id, risk });

test('RISK_RANK orders high as most urgent', () => {
  assert.ok(RISK_RANK.high < RISK_RANK.medium);
  assert.ok(RISK_RANK.medium < RISK_RANK.low);
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

test('wontfix in cache, no issue on record -> suppress with issue: null', () => {
  assert.deepStrictEqual(decide(F('recon-ddd'), {}, { 'recon-ddd': { status: 'wontfix', issue: null } }),
    { action: 'suppress', issue: null });
});

test('wontfix in cache with a known issue number -> suppress carries that issue number through (regression: the cache-fallback suppress path used to silently drop it, unlike the issueIndex-match suppress path)', () => {
  assert.deepStrictEqual(
    decide(F('recon-ddd-2'), {}, { 'recon-ddd-2': { status: 'wontfix', issue: 42 } }),
    { action: 'suppress', issue: 42 },
  );
});

test('new finding at/above threshold -> file', () => {
  assert.deepStrictEqual(decide(F('recon-eee', 'high'), {}, {}), { action: 'file' });
});

test('new finding below threshold -> remember', () => {
  assert.deepStrictEqual(decide(F('recon-fff', 'medium'), {}, {}), { action: 'remember' });
  assert.deepStrictEqual(decide(F('recon-fff', 'low'), {}, {}), { action: 'remember' });
});

test('threshold is overridable', () => {
  assert.deepStrictEqual(decide(F('recon-ggg', 'medium'), {}, {}, { threshold: 'medium' }), { action: 'file' });
});

test('decide uses finding.id over finding.fingerprint when both are present (regression: finding.id is the derived/trusted key; finding.fingerprint is unvalidated echoed-back input and must not override it)', () => {
  const finding = { id: 'recon-hhh', fingerprint: 'wrong-key', risk: 'high' };
  const index = { 'recon-hhh': { number: 11, state: 'open', labels: [] } };
  assert.deepStrictEqual(decide(finding, index, {}), { action: 'skip', issue: 11 });
});

test('decide falls back to finding.id when finding.fingerprint is absent', () => {
  const finding = { id: 'recon-iii', risk: 'high' };
  const index = { 'recon-iii': { number: 12, state: 'open', labels: [] } };
  assert.deepStrictEqual(decide(finding, index, {}), { action: 'skip', issue: 12 });
});
