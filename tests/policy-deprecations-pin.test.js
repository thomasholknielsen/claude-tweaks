'use strict';
// tests/policy-deprecations-pin.test.js — binds bin/lib/policy-schema.js's
// RENAMED_KEYS to its removal-condition docs (skills/_shared/policy-deprecations.md
// and skills/dispatch/deprecated-aliases.md), the same prose<->constant pin
// pattern as tests/policy-schema-metadata.test.js. Without this test the two
// docs drift silently from the array — #331, #332, and #602 each hand-added a
// heading when they touched RENAMED_KEYS, and that manual discipline already
// missed unattended-tier (merged into autonomy in #289) before this test
// closed the gap (#629).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { RENAMED_KEYS } = require('../plugin/bin/lib/policy-schema');

const DEPRECATIONS_MD_PATH = path.join(__dirname, '..', 'plugin', 'skills', '_shared', 'policy-deprecations.md');
const ALIASES_MD_PATH = path.join(__dirname, '..', 'plugin', 'skills', 'dispatch', 'deprecated-aliases.md');
const deprecationsMd = fs.readFileSync(DEPRECATIONS_MD_PATH, 'utf8');
const aliasesMd = fs.readFileSync(ALIASES_MD_PATH, 'utf8');

// Extract every `## \`{key}\`` heading's leading backtick-quoted token.
function headingKeys(text) {
  return [...text.matchAll(/^## `([^`]+)`/gm)].map((match) => match[1]);
}

const deprecationsHeadings = headingKeys(deprecationsMd);
const aliasesHeadings = headingKeys(aliasesMd);
const renamedKeyNames = new Set(RENAMED_KEYS.map((entry) => entry.key));

test('every RENAMED_KEYS entry has exactly one removal-condition heading across the two docs', () => {
  for (const key of renamedKeyNames) {
    const matches = [...deprecationsHeadings, ...aliasesHeadings].filter((heading) => heading === key);
    assert.strictEqual(
      matches.length,
      1,
      `${key}: expected exactly 1 heading across policy-deprecations.md + deprecated-aliases.md, found ${matches.length}`,
    );
  }
});

test('every policy-deprecations.md heading has a backing RENAMED_KEYS entry', () => {
  for (const key of deprecationsHeadings) {
    assert.ok(renamedKeyNames.has(key), `${key}: heading in policy-deprecations.md has no RENAMED_KEYS entry`);
  }
});

test('every deprecated-aliases.md heading backed by a RENAMED_KEYS entry matches it (--concurrent <n> excluded — CLI-flag alias, not a policy key)', () => {
  for (const key of aliasesHeadings) {
    if (key === '--concurrent <n>') continue;
    assert.ok(renamedKeyNames.has(key), `${key}: heading in deprecated-aliases.md has no RENAMED_KEYS entry`);
  }
});
