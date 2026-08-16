// tests/merge-verification.test.js — schema shape, PR-CI detection, the
// four-branch derivation ladder, and CLI wiring for the merge-verification
// policy key (#559). Inline/temp fixtures only — never reads this repo's live
// .claude-tweaks/policy.yml (IL-80). Fixture repos are built under os.tmpdir()
// so `git rev-parse --show-toplevel` never resolves THIS repo.
'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { POLICY_KEYS, resolvePolicyKeys } = require('../bin/lib/policy-schema');

const CLI = path.join(__dirname, '..', 'bin', 'resolve-policy.js');
const REPO_ROOT = path.join(__dirname, '..');
const VALUES = ['merge-when-green', 'wait', 'off'];

const tempDirs = [];
after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

// --- Schema shape ---

test('merge-verification is registered as an enum with the three values and no static default', () => {
  const entry = POLICY_KEYS.find((e) => e.key === 'merge-verification');
  assert.ok(entry, 'merge-verification must be registered in POLICY_KEYS');
  assert.equal(entry.type, 'enum');
  assert.deepEqual(entry.values, VALUES);
  assert.equal(entry.default, undefined, 'a static default would bypass the derivation ladder entirely');
  assert.equal(entry.category, 'merge-safety');
});

test('resolvePolicyKeys stays pure for merge-verification — unset resolves to null/default, explicit value verbatim', () => {
  const unset = resolvePolicyKeys(['merge-verification'], { policyRaw: null, runConfigRaw: null });
  assert.deepEqual(unset['merge-verification'], { value: null, source: 'default' });
  const set = resolvePolicyKeys(['merge-verification'], { policyRaw: 'merge-verification: wait\n', runConfigRaw: null });
  assert.deepEqual(set['merge-verification'], { value: 'wait', source: 'policy' });
  const bad = resolvePolicyKeys(['merge-verification'], { policyRaw: 'merge-verification: sideways\n', runConfigRaw: null });
  assert.deepEqual(bad['merge-verification'], { value: null, source: 'default', invalid: true });
});
