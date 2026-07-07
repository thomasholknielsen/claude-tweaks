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

test('generateWorkflowYaml guards both extract-step ISSUES=$(...) pipelines with || true so pipefail cannot fail the step on a no-match push', () => {
  const yaml = generateWorkflowYaml();
  const guardedNeedle = "tr '\\n' ' ' || true)";
  const guardedOccurrences = yaml.split(guardedNeedle).length - 1;
  assert.strictEqual(
    guardedOccurrences,
    2,
    'both extract-step ISSUES=$(...) lines must end in `|| true)` immediately after tr \'\\n\' \' \''
  );

  const unguardedNeedle = "tr '\\n' ' ')";
  const unguardedOccurrences = yaml.split(unguardedNeedle).length - 1;
  assert.strictEqual(
    unguardedOccurrences,
    0,
    'no extract-step ISSUES=$(...) line may be missing the || true guard (would fail the job under pipefail on a no-match push)'
  );
});

test('generateWorkflowYaml uses $RUNNER_TEMP instead of /tmp for the commit-messages scratch file', () => {
  const yaml = generateWorkflowYaml();
  const runnerTempOccurrences = yaml.split('"$RUNNER_TEMP/commit_messages.txt"').length - 1;
  assert.strictEqual(runnerTempOccurrences, 4, 'both jobs write and read the scratch file via $RUNNER_TEMP (2 lines each)');
  assert.ok(!yaml.includes('/tmp/commit_messages.txt'), 'no hardcoded /tmp path should remain');
});

test('generateWorkflowYaml declares a per-ref concurrency group so overlapping pushes to the same branch queue instead of racing', () => {
  const yaml = generateWorkflowYaml();
  assert.ok(yaml.includes('concurrency:'));
  assert.ok(yaml.includes('  group: track-issue-fixes-${{ github.ref }}'));
  assert.ok(yaml.includes('  cancel-in-progress: false'));
});

test('generateWorkflowYaml skips posting a duplicate tracking comment when one for this SHA already exists', () => {
  const yaml = generateWorkflowYaml();
  assert.ok(
    yaml.includes("-q '.comments[].body' | grep -F \"$SHA\" || true)"),
    'must check existing comments for this commit SHA before posting a new one'
  );
  assert.ok(
    yaml.includes('if [ -z "$EXISTING" ]; then'),
    'must only post the tracking comment when no existing comment for this SHA was found'
  );
});
