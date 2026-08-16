'use strict';
// Pins the policy-key naming convention documented in
// skills/_shared/policy-schema.md's "## Key naming" section (#332): keys are
// flat kebab-case identifiers — never dotted (a dotted key reads as a
// nested-YAML path in a flat-line parser and silently defaults when a user
// writes it nested), grouping lives in the `category` metadata, not the key.
// Also pins that every POLICY_KEYS key has a documented row in that file, so
// a rename that touches the schema but not the doc fails here.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { POLICY_KEYS, RENAMED_KEYS } = require('../bin/lib/policy-schema');

const KEY_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const MD_PATH = path.join(__dirname, '..', 'skills', '_shared', 'policy-schema.md');

test('every POLICY_KEYS key is flat kebab-case — no dots, no uppercase, no underscores', () => {
  const offenders = POLICY_KEYS.map((row) => row.key).filter((key) => !KEY_NAME.test(key));
  assert.deepStrictEqual(offenders, [], `non-conforming key names (see policy-schema.md "## Key naming"): ${offenders.join(', ')}`);
});

test('every RENAMED_KEYS replacement name is flat kebab-case (the retired names may be anything — they are what is being migrated away from)', () => {
  const offenders = RENAMED_KEYS.map((entry) => entry.replacedBy)
    .filter((name) => name !== null)
    .filter((name) => !KEY_NAME.test(name));
  assert.deepStrictEqual(offenders, [], `non-conforming replacement names: ${offenders.join(', ')}`);
});

test('policy-schema.md documents a "## Key naming" section and every POLICY_KEYS key has a table row there', () => {
  const md = fs.readFileSync(MD_PATH, 'utf8');
  assert.ok(md.includes('\n## Key naming\n'), 'policy-schema.md has no "## Key naming" section');
  const missing = POLICY_KEYS.map((row) => row.key).filter((key) => !md.includes(`| \`${key}\` |`));
  assert.deepStrictEqual(missing, [], `POLICY_KEYS keys with no documented row in policy-schema.md: ${missing.join(', ')}`);
});
