'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { POLICY_KEYS, RENAMED_KEYS, auditPolicy, resolveValue } = require('../bin/lib/policy-schema');

function tmpRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-policy-schema-'));
}
function writePolicy(repo, content) {
  const dir = path.join(repo, '.claude-tweaks');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'policy.yml'), content);
}
function writeClaudeMd(repo, content) {
  fs.writeFileSync(path.join(repo, 'CLAUDE.md'), content);
}

test('POLICY_KEYS entries are unique', () => {
  assert.strictEqual(POLICY_KEYS.length, 35);
  assert.strictEqual(new Set(POLICY_KEYS.map((k) => k.key)).size, 35);
});

test('dispatch-batch-size is registered alongside its deprecated alias', () => {
  // #295 renamed dispatch-pick-max-concurrent -> dispatch-batch-size. Registering
  // only the old name made auditPolicy reject the name every skill now documents.
  const renamed = POLICY_KEYS.find((k) => k.key === 'dispatch-batch-size');
  assert.ok(renamed, 'dispatch-batch-size missing from POLICY_KEYS — the renamed key must validate');
  assert.strictEqual(renamed.type, 'integer');
  assert.strictEqual(renamed.default, 3);

  const alias = POLICY_KEYS.find((k) => k.key === 'dispatch-pick-max-concurrent');
  assert.ok(alias, 'the deprecated alias must stay recognized until its removal condition is met');
  assert.strictEqual(alias.default, renamed.default, 'alias and canonical key must resolve the same default');
});

test('unattended-tier is retired from POLICY_KEYS', () => {
  assert.strictEqual(
    POLICY_KEYS.find((k) => k.key === 'unattended-tier'),
    undefined,
    'unattended-tier was merged into autonomy; RENAMED_KEYS carries the migration, not POLICY_KEYS',
  );
});

test('integration-branch is a recognized string key with no default', () => {
  const branch = POLICY_KEYS.find((k) => k.key === 'integration-branch');
  assert.ok(branch, 'integration-branch missing from POLICY_KEYS');
  assert.strictEqual(branch.type, 'string');
  assert.strictEqual(branch.default, undefined, 'unset must mean "resolve the default branch per firing"');
});

test('routine.branch is gone — renamed before it ever shipped, with no alias', () => {
  assert.strictEqual(
    POLICY_KEYS.find((k) => k.key === 'routine.branch'),
    undefined,
    'routine.branch was renamed before it shipped (the work landed as 6.42.0); an alias would be a compatibility path with no expiry'
  );
});

test('integration-branch accepts a branch name and flags a whitespace-bearing one', () => {
  const ok = tmpRepo();
  writePolicy(ok, 'integration-branch: dev\n');
  assert.deepStrictEqual(auditPolicy(ok).invalidValues, []);
  assert.deepStrictEqual(auditPolicy(ok).unrecognizedKeys, []);

  const bad = tmpRepo();
  writePolicy(bad, 'integration-branch: dev branch\n');
  const result = auditPolicy(bad);
  assert.strictEqual(result.invalidValues.length, 1, 'a name git itself would reject must be flagged, like every other typed key');
  assert.strictEqual(result.invalidValues[0].key, 'integration-branch');
});

test('execution-strategy and git-strategy are recognized policy keys', () => {
  const byKey = new Map(POLICY_KEYS.map((k) => [k.key, k]));

  const exec = byKey.get('execution-strategy');
  assert.ok(exec, 'execution-strategy missing from POLICY_KEYS');
  assert.strictEqual(exec.type, 'enum');
  assert.deepStrictEqual(exec.values, ['subagent', 'batched']);
  assert.strictEqual(exec.default, 'subagent');

  const git = byKey.get('git-strategy');
  assert.ok(git, 'git-strategy missing from POLICY_KEYS');
  assert.strictEqual(git.type, 'enum');
  assert.deepStrictEqual(git.values, ['current-branch', 'worktree']);
  assert.strictEqual(git.default, 'worktree');
});

test('autonomy is a recognized enum key defaulting to supervised; an invalid value is invalid, not unrecognized', () => {
  const byKey = new Map(POLICY_KEYS.map((k) => [k.key, k]));

  const autonomy = byKey.get('autonomy');
  assert.ok(autonomy, 'autonomy missing from POLICY_KEYS');
  assert.strictEqual(autonomy.type, 'enum');
  assert.deepStrictEqual(autonomy.values, ['supervised', 'trusted', 'unattended']);
  assert.strictEqual(autonomy.default, 'supervised');

  const repo = tmpRepo();
  writePolicy(repo, 'autonomy: reckless\n');
  const result = auditPolicy(repo);
  assert.strictEqual(result.invalidValues.length, 1, 'a value outside the enum must be flagged as invalid');
  assert.strictEqual(result.invalidValues[0].key, 'autonomy');
  assert.strictEqual(result.invalidValues[0].value, 'reckless');
  assert.deepStrictEqual(result.unrecognizedKeys, [], 'a recognized key with a bad value must never also appear as unrecognized');
});

test('execution.always locks the axis and execution-strategy sets the default — they are distinct keys', () => {
  const keys = POLICY_KEYS.map((k) => k.key);
  assert.ok(keys.includes('execution.always'), 'execution.always must survive as the lock');
  assert.ok(keys.includes('execution-strategy'), 'execution-strategy must exist as the default');
});

test('a recognized key in CLAUDE.md is flagged for migration, not validated', () => {
  const repo = tmpRepo();
  writeClaudeMd(repo, 'tidy-aggressiveness: moderate\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.migratableKeys, [
    { key: 'tidy-aggressiveness', value: 'moderate', alsoInPolicy: false },
  ]);
  assert.deepStrictEqual(result.invalidValues, [], 'CLAUDE.md values are no longer validated — the fix is to move the key, not to correct a value that has no effect');
});

test('a recognized key in CLAUDE.md with an INVALID value is still only a migration, never an invalidValues entry', () => {
  const repo = tmpRepo();
  writeClaudeMd(repo, 'tidy-aggressiveness: extreme\n');
  const result = auditPolicy(repo);
  assert.strictEqual(result.migratableKeys.length, 1);
  assert.strictEqual(result.migratableKeys[0].value, 'extreme');
  assert.deepStrictEqual(result.invalidValues, [], 'once CLAUDE.md is not read, its values cannot be wrong — only misplaced');
});

test('the same key in policy.yml is not flagged for migration', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'tidy-aggressiveness: moderate\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.migratableKeys, []);
});

test('a key in BOTH resolves to policy.yml and still flags the CLAUDE.md copy, marked alsoInPolicy', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'tidy-aggressiveness: aggressive\n');
  writeClaudeMd(repo, 'tidy-aggressiveness: conservative\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.migratableKeys, [
    { key: 'tidy-aggressiveness', value: 'conservative', alsoInPolicy: true },
  ]);
  assert.deepStrictEqual(result.invalidValues, [], 'both values are individually valid; policy.yml is the one that applies');
});

test('an UNrecognized key in CLAUDE.md is not flagged — CLAUDE.md prose is full of key-shaped lines', () => {
  const repo = tmpRepo();
  writeClaudeMd(repo, 'Lifecycle: capture -> specify -> build\nStatus: Approved\nwork-backend: github-issues\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.migratableKeys, [], 'only keys in POLICY_KEYS are migratable; work-backend is deliberately out of scope, and ordinary prose must never be touched');
  assert.deepStrictEqual(result.unrecognizedKeys, [], 'unrecognizedKeys is policy.yml-derived only');
});

test('invalidValues entries no longer carry a source field', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'tidy-aggressiveness: extreme\n');
  const [entry] = auditPolicy(repo).invalidValues;
  assert.strictEqual(entry.source, undefined, 'every entry is policy.yml-derived now — a field that can hold exactly one value reads as a live branch and is not one');
  assert.deepStrictEqual(Object.keys(entry).sort(), ['expected', 'key', 'value']);
});

test('missing policy.yml and missing CLAUDE.md -> all-empty result', () => {
  const result = auditPolicy(tmpRepo());
  assert.deepStrictEqual(result, { unrecognizedKeys: [], invalidValues: [], migratableKeys: [], renamedKeys: [] });
});

test('a stray unattended-tier: on with no autonomy key -> renamedKeys entry, and never also unrecognizedKeys', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'unattended-tier: on\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.renamedKeys, [
    { key: 'unattended-tier', value: 'on', replacedBy: 'autonomy', suggestedValue: 'unattended', currentReplacementValue: null },
  ]);
  assert.deepStrictEqual(result.unrecognizedKeys, []);
});

test('a stray unattended-tier: on alongside an existing autonomy value -> currentReplacementValue reflects it', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'unattended-tier: on\nautonomy: trusted\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.renamedKeys, [
    { key: 'unattended-tier', value: 'on', replacedBy: 'autonomy', suggestedValue: 'unattended', currentReplacementValue: 'trusted' },
  ]);
});

test('no unattended-tier key -> renamedKeys is empty', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'autonomy: trusted\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.renamedKeys, []);
});

test('unattended-tier: off (the schema default, distinct from absent) -> suggestedValue is null', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'unattended-tier: off\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.renamedKeys, [
    { key: 'unattended-tier', value: 'off', replacedBy: 'autonomy', suggestedValue: null, currentReplacementValue: null },
  ]);
});

test('RENAMED_KEYS names unattended-tier, replaced by autonomy', () => {
  assert.strictEqual(RENAMED_KEYS.length, 1);
  assert.strictEqual(RENAMED_KEYS[0].key, 'unattended-tier');
  assert.strictEqual(RENAMED_KEYS[0].replacedBy, 'autonomy');
});

test('recognized key with a valid value -> no invalidValues entry', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'dispatch-retry-ceiling: 5\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.invalidValues, []);
});

test('recognized enum key with an invalid value -> flagged', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'tidy-aggressiveness: extreme\n');
  const result = auditPolicy(repo);
  assert.strictEqual(result.invalidValues.length, 1);
  assert.strictEqual(result.invalidValues[0].key, 'tidy-aggressiveness');
  assert.strictEqual(result.invalidValues[0].value, 'extreme');
});

test('recognized integer key with a non-integer value -> flagged', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'automerge-max-lines: forty\n');
  const result = auditPolicy(repo);
  assert.strictEqual(result.invalidValues.length, 1);
  assert.strictEqual(result.invalidValues[0].key, 'automerge-max-lines');
});

test('recognized boolean key with a non-boolean value -> flagged', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'worktree.always: yes\n');
  const result = auditPolicy(repo);
  assert.strictEqual(result.invalidValues.length, 1);
  assert.strictEqual(result.invalidValues[0].key, 'worktree.always');
});

test('review-diff-heuristic-thresholds is presence-only validated, never flagged', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'review-diff-heuristic-thresholds: anything at all, not even valid YAML\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.invalidValues, []);
});

test('unrecognized key -> flagged, does not also appear in invalidValues', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'made-up-lever: 42\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.unrecognizedKeys, ['made-up-lever']);
  assert.deepStrictEqual(result.invalidValues, []);
});

test('invalid value in policy.yml is flagged in invalidValues', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'tidy-aggressiveness: extreme\n');
  const result = auditPolicy(repo);
  assert.strictEqual(result.invalidValues.length, 1);
  assert.strictEqual(result.invalidValues[0].key, 'tidy-aggressiveness');
  assert.strictEqual(result.invalidValues[0].value, 'extreme');
});

test('a CLAUDE.md key is reported under migratableKeys, never invalidValues', () => {
  const repo = tmpRepo();
  writeClaudeMd(repo, 'tidy-aggressiveness: extreme\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.invalidValues, []);
  assert.strictEqual(result.migratableKeys.length, 1);
  assert.strictEqual(result.migratableKeys[0].key, 'tidy-aggressiveness');
});

test('malformed policy.yml (unparseable) is treated as absent, not thrown', () => {
  const repo = tmpRepo();
  const dir = path.join(repo, '.claude-tweaks');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'policy.yml'), Buffer.from([0xff, 0xfe, 0x00, 0x01]));
  assert.doesNotThrow(() => auditPolicy(repo));
});

test('doc-convention.adr is an enum with no default — unset means "detect and ask"', () => {
  const key = POLICY_KEYS.find((k) => k.key === 'doc-convention.adr');
  assert.ok(key, 'doc-convention.adr missing from POLICY_KEYS');
  assert.strictEqual(key.type, 'enum');
  assert.deepStrictEqual(key.values, ['plugin', 'project']);
  assert.strictEqual(key.default, undefined, 'unset is a meaningful third state: the question has not been asked yet');

  const repo = tmpRepo();
  writePolicy(repo, 'doc-convention.adr: project\n');
  const ok = auditPolicy(repo);
  assert.deepStrictEqual(ok.invalidValues, []);
  assert.deepStrictEqual(ok.unrecognizedKeys, []);

  const bad = tmpRepo();
  writePolicy(bad, 'doc-convention.adr: whatever-the-repo-does\n');
  const result = auditPolicy(bad);
  assert.strictEqual(result.invalidValues.length, 1, 'a value outside the enum must be flagged');
  assert.strictEqual(result.invalidValues[0].key, 'doc-convention.adr');
});

test('trust-revert-window-days is a recognized integer key with a floor of 1, defaulting to 14', () => {
  const key = POLICY_KEYS.find((k) => k.key === 'trust-revert-window-days');
  assert.ok(key, 'trust-revert-window-days missing from POLICY_KEYS');
  assert.strictEqual(key.type, 'integer');
  assert.strictEqual(key.min, 1);
  assert.strictEqual(key.default, 14);

  const repo = tmpRepo();
  writePolicy(repo, 'trust-revert-window-days: 21\n');
  assert.deepStrictEqual(auditPolicy(repo).invalidValues, []);

  const bad = tmpRepo();
  writePolicy(bad, 'trust-revert-window-days: 0\n');
  const result = auditPolicy(bad);
  assert.strictEqual(result.invalidValues.length, 1, '0 is below the floor of 1 and must be flagged');
  assert.strictEqual(result.invalidValues[0].key, 'trust-revert-window-days');

  const negative = tmpRepo();
  writePolicy(negative, 'trust-revert-window-days: -5\n');
  assert.strictEqual(auditPolicy(negative).invalidValues.length, 1, 'a negative value must be flagged too');
});

test('mixed policy.yml + CLAUDE.md content is read independently, both audited together', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'dispatch-retry-ceiling: 5\nmade-up-lever: 1\n');
  writeClaudeMd(repo, 'tidy-aggressiveness: not-a-real-value\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.unrecognizedKeys, ['made-up-lever']);
  const migrated = result.migratableKeys.find((e) => e.key === 'tidy-aggressiveness');
  assert.ok(migrated, 'expected the CLAUDE.md key to be reported as migratable');
  assert.strictEqual(migrated.alsoInPolicy, false);
});

test('resolveValue falls back to the schema default when the raw value is absent', () => {
  assert.strictEqual(resolveValue('trust-revert-window-days', undefined), 14);
  assert.strictEqual(resolveValue('trust-revert-window-days', null), 14);
  assert.strictEqual(resolveValue('trust-revert-window-days', ''), 14);
});

test('resolveValue coerces a valid raw value to a number', () => {
  assert.strictEqual(resolveValue('trust-revert-window-days', '21'), 21);
  assert.strictEqual(resolveValue('trust-revert-window-days', 21), 21);
});

test('resolveValue falls back to the default on a malformed integer — zero, negative, non-integer', () => {
  assert.strictEqual(resolveValue('trust-revert-window-days', '0'), 14);
  assert.strictEqual(resolveValue('trust-revert-window-days', 0), 14);
  assert.strictEqual(resolveValue('trust-revert-window-days', '-5'), 14);
  assert.strictEqual(resolveValue('trust-revert-window-days', 'abc'), 14);
});

test('resolveValue passes an unrecognized key through unchanged', () => {
  assert.strictEqual(resolveValue('made-up-lever', 'anything'), 'anything');
});

test('resolveValue never throws on a malformed value of any type', () => {
  assert.doesNotThrow(() => resolveValue('trust-revert-window-days', {}));
  assert.doesNotThrow(() => resolveValue('trust-revert-window-days', ['x']));
});
