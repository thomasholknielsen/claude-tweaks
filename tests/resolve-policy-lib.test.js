// tests/resolve-policy-lib.test.js — focused unit tests for
// bin/lib/policy-schema.js's resolvePolicyKeys (#329). Inline string fixtures
// only: never reads this repo's live .claude-tweaks/policy.yml (IL-80 — a test
// pinned to live production content is a scheduled failure).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { resolvePolicyKeys, parseFlatLines } = require('../bin/lib/policy-schema');

test('parseFlatLines is exported (Task 2 wrappers consume it)', () => {
  assert.strictEqual(typeof parseFlatLines, 'function');
  assert.deepStrictEqual(parseFlatLines('tidy-aggressiveness: moderate # note\n'), {
    'tidy-aggressiveness': 'moderate',
  });
});

test('returns a plain object keyed by requested name, never an array', () => {
  const result = resolvePolicyKeys(['autonomy'], { policyRaw: null, runConfigRaw: null });
  assert.ok(!Array.isArray(result), 'must be a plain object — array-attached properties are dropped by JSON.stringify (IL-121)');
  assert.deepStrictEqual(Object.keys(result), ['autonomy']);
});

test('policy-source value resolves with source: "policy"', () => {
  const result = resolvePolicyKeys(['tidy-aggressiveness'], {
    policyRaw: 'tidy-aggressiveness: aggressive\n',
  });
  assert.deepStrictEqual(result['tidy-aggressiveness'], { value: 'aggressive', source: 'policy' });
});

test('known-but-unset key resolves to the schema default with source: "default" and NO invalid flag', () => {
  const result = resolvePolicyKeys(['autonomy'], { policyRaw: 'worktree.always: true\n' });
  assert.deepStrictEqual(result.autonomy, { value: 'supervised', source: 'default' });
  assert.ok(!('invalid' in result.autonomy), 'source: "default" alone means known-but-unset — invalid must be absent');
});

test('run-config overrides policy for the same key', () => {
  const result = resolvePolicyKeys(['dispatch-retry-ceiling'], {
    policyRaw: 'dispatch-retry-ceiling: 5\n',
    runConfigRaw: 'dispatch-retry-ceiling: 7\n',
  });
  assert.deepStrictEqual(result['dispatch-retry-ceiling'], { value: 7, source: 'run-config' });
});

test('runConfigRaw only overlays when it is a string — a non-string overlay contributes nothing', () => {
  const result = resolvePolicyKeys(['dispatch-retry-ceiling'], {
    policyRaw: 'dispatch-retry-ceiling: 5\n',
    runConfigRaw: undefined,
  });
  assert.deepStrictEqual(result['dispatch-retry-ceiling'], { value: 5, source: 'policy' });
});

test('alias old-key-only in policy: dispatch-pick-max-concurrent: 5 resolves dispatch-batch-size with renamed-from', () => {
  const result = resolvePolicyKeys(['dispatch-batch-size'], {
    policyRaw: 'dispatch-pick-max-concurrent: 5\n',
  });
  // Full-envelope equality: this test FAILS if renamed-from were omitted or
  // held the wrong old-key name — it asserts the field's presence AND value.
  assert.deepStrictEqual(result['dispatch-batch-size'], {
    value: 5,
    source: 'policy',
    'renamed-from': 'dispatch-pick-max-concurrent',
  });
  assert.strictEqual(typeof result['dispatch-batch-size'].value, 'number', 'migrated integer must coerce to a native number');
});

test('both old and new key in one source: new wins, NO renamed-from', () => {
  const result = resolvePolicyKeys(['dispatch-batch-size'], {
    policyRaw: 'dispatch-pick-max-concurrent: 5\ndispatch-batch-size: 2\n',
  });
  assert.deepStrictEqual(result['dispatch-batch-size'], { value: 2, source: 'policy' });
  assert.ok(!('renamed-from' in result['dispatch-batch-size']), 'a stray old key beside the new one is auditPolicy\'s business, never a renamed-from tag');
});

test('null-migrate fall-through: run-config unattended-tier: off -> autonomy default, renamed-from still tagged', () => {
  const result = resolvePolicyKeys(['autonomy'], {
    policyRaw: null,
    runConfigRaw: 'unattended-tier: off\n',
  });
  // Full-envelope equality: FAILS if renamed-from were omitted.
  assert.deepStrictEqual(result.autonomy, {
    value: 'supervised',
    source: 'default',
    'renamed-from': 'unattended-tier',
  });
});

test('non-null migrate at run-config: unattended-tier: on -> autonomy unattended, source run-config, renamed-from', () => {
  const result = resolvePolicyKeys(['autonomy'], { runConfigRaw: 'unattended-tier: on\n' });
  assert.deepStrictEqual(result.autonomy, {
    value: 'unattended',
    source: 'run-config',
    'renamed-from': 'unattended-tier',
  });
});

test('null-migrate at one source does not shadow a real value at the next', () => {
  const result = resolvePolicyKeys(['autonomy'], {
    policyRaw: 'autonomy: trusted\n',
    runConfigRaw: 'unattended-tier: off\n',
  });
  assert.deepStrictEqual(result.autonomy, { value: 'trusted', source: 'policy' }, 'policy contributed a value, so no renamed-from and no default fall-through');
});

test('malformed value resolves to the schema default with invalid: true', () => {
  const result = resolvePolicyKeys(['trust-revert-window-days'], {
    policyRaw: 'trust-revert-window-days: banana\n',
  });
  assert.deepStrictEqual(result['trust-revert-window-days'], {
    value: 14,
    source: 'default',
    invalid: true,
  });
});

test('malformed value at run-config does NOT cascade to a valid policy value', () => {
  const result = resolvePolicyKeys(['trust-revert-window-days'], {
    policyRaw: 'trust-revert-window-days: 21\n',
    runConfigRaw: 'trust-revert-window-days: banana\n',
  });
  assert.deepStrictEqual(result['trust-revert-window-days'], {
    value: 14,
    source: 'default',
    invalid: true,
  }, 'a typo must not activate a different configured value — the winning source resolves, invalid, no cascade');
});

test('unknown key yields an error entry while its sibling still resolves', () => {
  const result = resolvePolicyKeys(['made-up-lever', 'autonomy'], {
    policyRaw: 'autonomy: trusted\n',
  });
  assert.deepStrictEqual(result['made-up-lever'], { error: 'unknown-key' });
  assert.ok(!('value' in result['made-up-lever']) && !('source' in result['made-up-lever']), 'error entries carry no value/source');
  assert.deepStrictEqual(result.autonomy, { value: 'trusted', source: 'policy' });
});

test('boolean coercion: worktree.always: true resolves to native boolean true', () => {
  const result = resolvePolicyKeys(['worktree.always'], { policyRaw: 'worktree.always: true\n' });
  assert.strictEqual(result['worktree.always'].value, true);
  assert.strictEqual(result['worktree.always'].source, 'policy');
});

test('a key with no schema default, absent everywhere, resolves to value: null, source: "default"', () => {
  const result = resolvePolicyKeys(['integration-branch', 'execution.always'], { policyRaw: '' });
  assert.deepStrictEqual(result['integration-branch'], { value: null, source: 'default' });
  assert.deepStrictEqual(result['execution.always'], { value: null, source: 'default' });
});

test('model-profiles resolves to its documented absent shape — the CLI overwrites this entry via delegation', () => {
  const result = resolvePolicyKeys(['model-profiles'], {
    policyRaw: 'model-profiles:\n  standard:\n    model: opus\n',
  });
  assert.deepStrictEqual(result['model-profiles'], { value: null, source: 'default' });
});

test('requesting an alias\'s old name resolves the replacement key, never unknown-key', () => {
  const result = resolvePolicyKeys(['unattended-tier'], { policyRaw: 'autonomy: trusted\n' });
  assert.deepStrictEqual(result['unattended-tier'], { value: 'trusted', source: 'policy' });
});
