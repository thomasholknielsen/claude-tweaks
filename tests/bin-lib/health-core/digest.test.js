'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  decideFilingMode,
  isDigestIssue,
  countOpenSingletons,
  findOpenDigestIssue,
  parseDigestFingerprints,
  expandDigestFingerprints,
  digestEntryLine,
  initialDigestBody,
  appendDigestEntries,
} = require('../../../plugin/bin/lib/health-core/digest');

// --- decideFilingMode: cap boundary ---

test('decideFilingMode: below cap files normally', () => {
  assert.strictEqual(decideFilingMode({ action: 'file', openCount: 9, cap: 10 }), 'normal');
});

test('decideFilingMode: exactly at cap digests', () => {
  assert.strictEqual(decideFilingMode({ action: 'file', openCount: 10, cap: 10 }), 'digest');
});

test('decideFilingMode: above cap digests', () => {
  assert.strictEqual(decideFilingMode({ action: 'file', openCount: 11, cap: 10 }), 'digest');
});

test('decideFilingMode: a regression (reopen) bypasses the cap regardless of openCount', () => {
  assert.strictEqual(decideFilingMode({ action: 'reopen', openCount: 999, cap: 1 }), 'normal');
});

test('decideFilingMode: skip/suppress/remember are unaffected by the cap', () => {
  for (const action of ['skip', 'suppress', 'remember']) {
    assert.strictEqual(decideFilingMode({ action, openCount: 999, cap: 1 }), 'normal');
  }
});

test('decideFilingMode: cap 0 disables the throttle (unconditional filing, today\'s behavior)', () => {
  assert.strictEqual(decideFilingMode({ action: 'file', openCount: 500, cap: 0 }), 'normal');
});

test('decideFilingMode: missing/non-numeric cap disables the throttle', () => {
  assert.strictEqual(decideFilingMode({ action: 'file', openCount: 500, cap: undefined }), 'normal');
  assert.strictEqual(decideFilingMode({ action: 'file', openCount: 500, cap: NaN }), 'normal');
});

// --- countOpenSingletons / isDigestIssue: digest issue excluded from its own count ---

test('countOpenSingletons excludes the digest issue and closed issues, counts only open singletons', () => {
  const raw = [
    { number: 1, state: 'open', labels: ['by:code-health'] },
    { number: 2, state: 'open', labels: ['by:code-health'] },
    { number: 3, state: 'closed', labels: ['by:code-health'] },
    { number: 4, state: 'open', labels: ['by:code-health', 'code-health:digest'] },
    { number: 5, state: 'open', labels: ['some-other-label'] }, // human-filed, no origin label — still counts per the raw array's own scope
  ];
  // Independently derived: only #1, #2, #5 are open and not the digest issue -> 3.
  assert.strictEqual(countOpenSingletons(raw, 'code-health:digest'), 3);
});

test('isDigestIssue is false for an issue with no labels array', () => {
  assert.strictEqual(isDigestIssue({ number: 1 }, 'code-health:digest'), false);
});

test('findOpenDigestIssue finds the open one and ignores a closed digest issue', () => {
  const raw = [
    { number: 9, state: 'closed', labels: ['code-health:digest'], body: 'old' },
    { number: 10, state: 'open', labels: ['code-health:digest'], body: 'current' },
  ];
  const found = findOpenDigestIssue(raw, 'code-health:digest');
  assert.strictEqual(found.number, 10);
});

test('findOpenDigestIssue returns undefined when none exists', () => {
  assert.strictEqual(findOpenDigestIssue([{ number: 1, state: 'open', labels: [] }], 'code-health:digest'), undefined);
});

// --- parseDigestFingerprints / expandDigestFingerprints: dedup continuity ---

test('parseDigestFingerprints extracts every embedded marker in order', () => {
  const body = [
    '- [ ] **A** <!-- digest-fingerprint: codehealth-aaa11111 -->',
    '- [ ] **B** <!-- digest-fingerprint: codehealth-bbb22222 -->',
  ].join('\n');
  assert.deepStrictEqual(parseDigestFingerprints(body), ['codehealth-aaa11111', 'codehealth-bbb22222']);
});

test('parseDigestFingerprints returns [] for a body with no markers', () => {
  assert.deepStrictEqual(parseDigestFingerprints('nothing here'), []);
});

test('parseDigestFingerprints handles undefined/null body without throwing', () => {
  assert.deepStrictEqual(parseDigestFingerprints(undefined), []);
  assert.deepStrictEqual(parseDigestFingerprints(null), []);
});

test('expandDigestFingerprints projects each embedded fingerprint onto the digest issue\'s own number/state/labels', () => {
  const raw = [
    {
      number: 42,
      state: 'open',
      labels: ['by:code-health', 'code-health:digest'],
      body: '- [ ] **A** <!-- digest-fingerprint: codehealth-aaa11111 -->\n- [ ] **B** <!-- digest-fingerprint: codehealth-bbb22222 -->',
    },
    { number: 1, state: 'open', labels: ['by:code-health'], body: 'not a digest', fingerprint: 'codehealth-ccc33333' },
  ];
  const expanded = expandDigestFingerprints(raw, 'code-health:digest');
  assert.deepStrictEqual(expanded, [
    {
      number: 42, state: 'open', labels: ['by:code-health', 'code-health:digest'], fingerprint: 'codehealth-aaa11111',
    },
    {
      number: 42, state: 'open', labels: ['by:code-health', 'code-health:digest'], fingerprint: 'codehealth-bbb22222',
    },
  ]);
});

test('expandDigestFingerprints returns [] when no issue carries the digest label', () => {
  const raw = [{
    number: 1, state: 'open', labels: ['by:code-health'], body: 'x',
  }];
  assert.deepStrictEqual(expandDigestFingerprints(raw, 'code-health:digest'), []);
});

// --- digestEntryLine / initialDigestBody / appendDigestEntries ---

test('digestEntryLine embeds the fingerprint marker and prefers title over criterion', () => {
  const line = digestEntryLine({ id: 'codehealth-aaa11111', title: 'My Title', criterion: 'simplification' });
  assert.strictEqual(line, '- [ ] **My Title** <!-- digest-fingerprint: codehealth-aaa11111 -->');
});

test('digestEntryLine falls back to criterion when title is absent', () => {
  const line = digestEntryLine({ id: 'codehealth-aaa11111', criterion: 'simplification' });
  assert.strictEqual(line, '- [ ] **simplification** <!-- digest-fingerprint: codehealth-aaa11111 -->');
});

test('initialDigestBody names the origin label and the throttling policy key', () => {
  const body = initialDigestBody('code-health');
  assert.ok(body.includes('code-health'));
  assert.ok(body.includes('health-open-cap'));
});

test('appendDigestEntries appends new findings and skips ones already present (fingerprint continuity)', () => {
  const body = initialDigestBody('code-health')
    + digestEntryLine({ id: 'codehealth-aaa11111', title: 'A' }) + '\n';
  const { body: next, appended } = appendDigestEntries(body, [
    { id: 'codehealth-aaa11111', title: 'A (re-seen this run)' }, // already present -> not re-appended
    { id: 'codehealth-bbb22222', title: 'B' }, // new -> appended
  ]);
  assert.strictEqual(appended, 1);
  // Independently derived: exactly one occurrence of each fingerprint marker after the append.
  assert.strictEqual((next.match(/codehealth-aaa11111/g) || []).length, 1);
  assert.strictEqual((next.match(/codehealth-bbb22222/g) || []).length, 1);
  assert.ok(next.includes('- [ ] **B** <!-- digest-fingerprint: codehealth-bbb22222 -->'));
});

test('appendDigestEntries with zero new findings returns the body unchanged and appended: 0', () => {
  const body = initialDigestBody('code-health') + digestEntryLine({ id: 'codehealth-aaa11111', title: 'A' }) + '\n';
  const { body: next, appended } = appendDigestEntries(body, [{ id: 'codehealth-aaa11111', title: 'A' }]);
  assert.strictEqual(appended, 0);
  assert.strictEqual(next, body);
});

test('appendDigestEntries handles an empty starting body', () => {
  const { body, appended } = appendDigestEntries('', [{ id: 'codehealth-aaa11111', title: 'A' }]);
  assert.strictEqual(appended, 1);
  assert.strictEqual(body, '- [ ] **A** <!-- digest-fingerprint: codehealth-aaa11111 -->\n');
});
