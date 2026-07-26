'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { POLICY_KEYS, auditPolicy } = require('../bin/lib/policy-schema');

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

test('POLICY_KEYS has exactly 33 entries with unique keys', () => {
  assert.strictEqual(POLICY_KEYS.length, 33);
  assert.strictEqual(new Set(POLICY_KEYS.map((k) => k.key)).size, 33);
});

test('missing policy.yml and missing CLAUDE.md -> all-empty result', () => {
  const result = auditPolicy(tmpRepo());
  assert.deepStrictEqual(result, { unrecognizedKeys: [], invalidValues: [], legacyClaudeMdLevers: [] });
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

test('invalid value in policy.yml is flagged with source: policy.yml', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'tidy-aggressiveness: extreme\n');
  const result = auditPolicy(repo);
  assert.strictEqual(result.invalidValues.length, 1);
  assert.strictEqual(result.invalidValues[0].key, 'tidy-aggressiveness');
  assert.strictEqual(result.invalidValues[0].value, 'extreme');
  assert.strictEqual(result.invalidValues[0].source, 'policy.yml');
});

test('invalid value in CLAUDE.md is flagged in invalidValues with source: CLAUDE.md', () => {
  const repo = tmpRepo();
  writeClaudeMd(repo, '## Auto-mode policy\ntidy-aggressiveness: extreme\n');
  const result = auditPolicy(repo);
  assert.strictEqual(result.invalidValues.length, 1);
  assert.strictEqual(result.invalidValues[0].key, 'tidy-aggressiveness');
  assert.strictEqual(result.invalidValues[0].value, 'extreme');
  assert.strictEqual(result.invalidValues[0].source, 'CLAUDE.md');
});

test('legacyClaudeMdLevers entry for an invalid legacy value has isValid: false', () => {
  const repo = tmpRepo();
  writeClaudeMd(repo, '## Auto-mode policy\ntidy-aggressiveness: extreme\n');
  const result = auditPolicy(repo);
  const entry = result.legacyClaudeMdLevers.find((e) => e.key === 'tidy-aggressiveness');
  assert.ok(entry, 'expected a legacyClaudeMdLevers entry for tidy-aggressiveness');
  assert.strictEqual(entry.isValid, false);
});

test('legacyClaudeMdLevers entry for a valid override has isValid: true', () => {
  const repo = tmpRepo();
  writeClaudeMd(repo, '## Auto-mode policy\ntidy-aggressiveness: aggressive\n');
  const result = auditPolicy(repo);
  const entry = result.legacyClaudeMdLevers.find((e) => e.key === 'tidy-aggressiveness');
  assert.ok(entry, 'expected a legacyClaudeMdLevers entry for tidy-aggressiveness');
  assert.strictEqual(entry.isValid, true);
  assert.strictEqual(entry.matchesDefault, false);
});

test('malformed policy.yml (unparseable) is treated as absent, not thrown', () => {
  const repo = tmpRepo();
  const dir = path.join(repo, '.claude-tweaks');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'policy.yml'), Buffer.from([0xff, 0xfe, 0x00, 0x01]));
  assert.doesNotThrow(() => auditPolicy(repo));
});

const LEGACY_LEVERS = [
  ['unattended-tier', 'off', 'on'],
  ['scope-creep', 'add-to-plan', 'stop-and-ask'],
  ['overlap', 'companion', 'extend'],
  ['design-intent', 'none', 'bold'],
  ['leftover-default', 'defer', 'backlog'],
  ['auto-fix-threshold', 'lint+type', 'lint-only'],
  ['review-severity-floor', 'low', 'medium'],
  ['tidy-aggressiveness', 'conservative', 'aggressive'],
];

for (const [key, defaultValue, overrideValue] of LEGACY_LEVERS) {
  test(`legacy CLAUDE.md lever "${key}" at its default -> matchesDefault true`, () => {
    const repo = tmpRepo();
    writeClaudeMd(repo, `## Auto-mode policy\n${key}: ${defaultValue}\n`);
    const result = auditPolicy(repo);
    const entry = result.legacyClaudeMdLevers.find((e) => e.key === key);
    assert.ok(entry, `expected a legacyClaudeMdLevers entry for ${key}`);
    assert.strictEqual(entry.value, defaultValue);
    assert.strictEqual(entry.matchesDefault, true);
  });

  test(`legacy CLAUDE.md lever "${key}" overridden -> matchesDefault false`, () => {
    const repo = tmpRepo();
    writeClaudeMd(repo, `## Auto-mode policy\n${key}: ${overrideValue}\n`);
    const result = auditPolicy(repo);
    const entry = result.legacyClaudeMdLevers.find((e) => e.key === key);
    assert.ok(entry, `expected a legacyClaudeMdLevers entry for ${key}`);
    assert.strictEqual(entry.value, overrideValue);
    assert.strictEqual(entry.matchesDefault, false);
  });
}

test('a lever absent from CLAUDE.md produces no legacyClaudeMdLevers entry for it', () => {
  const repo = tmpRepo();
  writeClaudeMd(repo, '## Auto-mode policy\nscope-creep: add-to-plan\n');
  const result = auditPolicy(repo);
  assert.strictEqual(result.legacyClaudeMdLevers.some((e) => e.key === 'tidy-aggressiveness'), false);
});

test('mixed policy.yml + CLAUDE.md content is read independently, both audited together', () => {
  const repo = tmpRepo();
  writePolicy(repo, 'dispatch-retry-ceiling: 5\nmade-up-lever: 1\n');
  writeClaudeMd(repo, '## Auto-mode policy\nscope-creep: drop\ntidy-aggressiveness: conservative\n');
  const result = auditPolicy(repo);
  assert.deepStrictEqual(result.unrecognizedKeys, ['made-up-lever']);
  assert.strictEqual(result.legacyClaudeMdLevers.length, 2);
  const scopeCreep = result.legacyClaudeMdLevers.find((e) => e.key === 'scope-creep');
  assert.strictEqual(scopeCreep.matchesDefault, false);
  const tidyAgg = result.legacyClaudeMdLevers.find((e) => e.key === 'tidy-aggressiveness');
  assert.strictEqual(tidyAgg.matchesDefault, true);
});
