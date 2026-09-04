'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  extractFileEntries, extractScopeKeywords, extractTaskBlocks,
  extractStep2Verification, extractVerificationChecks,
} = require('../../../plugin/bin/lib/plan-audit/parser');

test('extractFileEntries reads Create/Modify/Delete/Test bullets, backticked and bare', () => {
  const text = [
    '**Files:**',
    '- Create: `tests/foo.test.js`',
    '- Modify: `plugin/bin/lib/foo.js`',
    '- Delete: plugin/bin/lib/old.js',
    '- Test: `tests/bar.test.js`',
  ].join('\n');
  const entries = extractFileEntries(text);
  assert.deepStrictEqual(entries, [
    { type: 'Create', path: 'tests/foo.test.js' },
    { type: 'Modify', path: 'plugin/bin/lib/foo.js' },
    { type: 'Delete', path: 'plugin/bin/lib/old.js' },
    { type: 'Test', path: 'tests/bar.test.js' },
  ]);
});

test('extractFileEntries strips a trailing line-range suffix', () => {
  const text = '- Modify: `plugin/skills/flow/materialize.md:142-147` (the example block)';
  assert.deepStrictEqual(extractFileEntries(text), [
    { type: 'Modify', path: 'plugin/skills/flow/materialize.md' },
  ]);
});

test('extractFileEntries collects bullets across multiple per-task Files: sections', () => {
  const text = [
    '### Task 1: First',
    '**Files:**',
    '- Modify: `a.js`',
    '',
    '### Task 2: Second',
    '**Files:**',
    '- Create: `b.js`',
  ].join('\n');
  assert.deepStrictEqual(extractFileEntries(text), [
    { type: 'Modify', path: 'a.js' },
    { type: 'Create', path: 'b.js' },
  ]);
});

test('extractFileEntries returns empty for "Files:** none"', () => {
  assert.deepStrictEqual(extractFileEntries('**Files:** none (verification only).'), []);
});

test('extractScopeKeywords parses a comma-separated list, trimmed and de-duplicated', () => {
  const text = 'Some prose.\nScope keywords: playwright-cli, claude_in_chrome , playwright-cli\nMore prose.';
  assert.deepStrictEqual(extractScopeKeywords(text), ['playwright-cli', 'claude_in_chrome']);
});

test('extractScopeKeywords returns empty when the field is absent', () => {
  assert.deepStrictEqual(extractScopeKeywords('No such field here.'), []);
});

test('extractTaskBlocks splits on ### Task N: headings', () => {
  const text = '### Task 1: A\nbody1\n### Task 2: B\nbody2\n';
  const tasks = extractTaskBlocks(text);
  assert.strictEqual(tasks.length, 2);
  assert.strictEqual(tasks[0].taskNumber, '1');
  assert.match(tasks[0].body, /body1/);
  assert.strictEqual(tasks[1].taskNumber, '2');
  assert.match(tasks[1].body, /body2/);
});

test('extractStep2Verification matches by step NUMBER, not by wording', () => {
  const body = [
    '- [ ] **Step 1: Write the failing test**',
    '',
    'some setup',
    '',
    '- [ ] **Step 2: Run the new tests to verify they fail**',
    '',
    'Run: `node --test tests/foo.test.js`',
    'Expected: FAIL — assertion not yet true',
    '',
    '- [ ] **Step 3: Implement**',
  ].join('\n');
  const result = extractStep2Verification(body);
  assert.deepStrictEqual(result, {
    command: 'node --test tests/foo.test.js',
    expected: 'FAIL — assertion not yet true',
  });
});

test('extractStep2Verification returns null when the task has no Step 2 Run:/Expected: pair', () => {
  const body = '- [ ] **Step 1: Update the docs**\n\nNo run/expected pair here.\n';
  assert.strictEqual(extractStep2Verification(body), null);
});

test('extractVerificationChecks only returns tasks whose Expected starts with FAIL', () => {
  const text = [
    '### Task 1: Code task',
    '- [ ] **Step 2: Run test to verify it fails**',
    '',
    'Run: `node --test a.test.js`',
    'Expected: FAIL with "not defined"',
    '',
    '### Task 2: Doc-only task',
    '- [ ] **Step 1: Update the doc**',
    '',
    'No verification command here.',
    '',
    '### Task 3: Post-implementation check (not Check C scope)',
    '- [ ] **Step 4: Run test to verify it passes**',
    '',
    'Run: `node --test a.test.js`',
    'Expected: PASS',
  ].join('\n');
  const checks = extractVerificationChecks(text);
  assert.strictEqual(checks.length, 1);
  assert.strictEqual(checks[0].taskNumber, '1');
  assert.strictEqual(checks[0].command, 'node --test a.test.js');
});
