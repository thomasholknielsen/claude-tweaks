'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  ISSUE_REF_SOURCE,
  extractIssueNumbers,
  generateWorkflowYaml,
} = require('../bin/lib/issue-branch-tracking');

test('extractIssueNumbers matches GitHub closing keywords, case-insensitive', () => {
  const messages = [
    'Fixes #12: correct the off-by-one',
    'closes #34',
    'Fixed #56 and resolved #78',
  ];
  assert.deepStrictEqual(extractIssueNumbers(messages), [12, 34, 56, 78]);
});

test('extractIssueNumbers ignores bare issue references without a closing keyword', () => {
  const messages = ['See #99 for context', 'Related to #100 but not fixing it'];
  assert.deepStrictEqual(extractIssueNumbers(messages), []);
});

test('extractIssueNumbers de-dupes and sorts when the same issue repeats', () => {
  const messages = ['Fixes #5', 'fix #5', 'Closes #2'];
  assert.deepStrictEqual(extractIssueNumbers(messages), [2, 5]);
});

test('extractIssueNumbers handles multiple references in one commit message', () => {
  const messages = ['Fixes #1 and Closes #2'];
  assert.deepStrictEqual(extractIssueNumbers(messages), [1, 2]);
});

test('extractIssueNumbers returns [] for empty or missing input', () => {
  assert.deepStrictEqual(extractIssueNumbers([]), []);
  assert.deepStrictEqual(extractIssueNumbers(undefined), []);
});

test('generateWorkflowYaml embeds both jobs and the default-branch comparison', () => {
  const yaml = generateWorkflowYaml();
  assert.ok(yaml.includes('label-fix-branch:'));
  assert.ok(yaml.includes('cleanup-fix-labels:'));
  assert.ok(yaml.includes(
    "if: github.ref != format('refs/heads/{0}', github.event.repository.default_branch)"
  ));
  assert.ok(yaml.includes(
    "if: github.ref == format('refs/heads/{0}', github.event.repository.default_branch)"
  ));
});

test('generateWorkflowYaml embeds the exact tested regex pattern (single source of truth)', () => {
  const yaml = generateWorkflowYaml();
  const needle = `PATTERN='${ISSUE_REF_SOURCE}'`;
  const occurrences = yaml.split(needle).length - 1;
  assert.strictEqual(occurrences, 2);
});

test('generateWorkflowYaml output has no tab characters and starts with the workflow name', () => {
  const yaml = generateWorkflowYaml();
  assert.ok(yaml.startsWith('name: Track issue fixes across branches'));
  assert.ok(!yaml.includes('\t'), 'YAML must not contain tab characters');
});
