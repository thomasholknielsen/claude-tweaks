import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPolicy, resolvePolicyKeys } from '../../plugin/bin/lib/policy-schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

// The four fixtures below (#631) are deliberately frozen at the pre-6.48.0
// policy-inside-CLAUDE.md shape and still name three retired policy keys:
// section-confirmation (retired outright, #331), merge-check (renamed
// branch-divergence-check, #331), and review-severity-floor (renamed
// review-auto-apply-ceiling, #332). This guard proves the harness's actual
// policy-resolution code paths (plugin/bin/lib/policy-schema.js) tolerate
// that frozen shape: nothing throws, nothing treats a retired name embedded
// in CLAUDE.md as migratable, and the current replacement keys still resolve
// to their untouched schema defaults regardless of what sits in these
// fixtures' CLAUDE.md — never a raw grep for the retired strings, but the
// harness's real behavior when it reads policy for a repo shaped like this.
// If a future policy-key rename ever breaks this, this test — not a live
// scenario run — is what catches it.
const FROZEN_FIXTURES = ['init-baseline', 'minimal-node-repo', 'complexity-repo', 'code-health-repo'];
const RETIRED_KEYS = ['section-confirmation', 'merge-check', 'review-severity-floor'];
// Schema defaults for the current replacement keys — asserted independently
// of plugin/bin/lib/policy-schema.js's own POLICY_KEYS table so this test
// still fails loudly if a future rename changes either default silently.
const CURRENT_REPLACEMENTS = {
  'branch-divergence-check': true,
  'review-auto-apply-ceiling': 'low',
};

test('frozen fixtures still embed the pre-6.48.0 retired keys (sanity check the fixture content itself)', () => {
  for (const name of FROZEN_FIXTURES) {
    const claudeMd = fs.readFileSync(path.join(FIXTURES_DIR, name, 'CLAUDE.md'), 'utf8');
    for (const key of RETIRED_KEYS) {
      assert.match(claudeMd, new RegExp(key), `${name}/CLAUDE.md must still carry the frozen ${key} line`);
    }
  }
});

test('auditPolicy never throws against a frozen fixture, and never flags a retired key as migratable', () => {
  for (const name of FROZEN_FIXTURES) {
    const repoRoot = path.join(FIXTURES_DIR, name);
    let result;
    assert.doesNotThrow(() => { result = auditPolicy(repoRoot); }, `${name}: auditPolicy must not throw on a frozen pre-6.48.0 CLAUDE.md`);
    const migratableKeyNames = result.migratableKeys.map((entry) => entry.key);
    for (const retired of RETIRED_KEYS) {
      assert.ok(
        !migratableKeyNames.includes(retired),
        `${name}: a retired key (${retired}) must never surface as migratable — it isn't in the current schema`,
      );
    }
    // No .claude-tweaks/policy.yml exists for any of these fixtures (that gap
    // is what this record is about) — renamedKeys is policy.yml-only, so it
    // must stay empty no matter what the frozen CLAUDE.md carries.
    assert.deepStrictEqual(result.renamedKeys, [], `${name}: renamedKeys only ever comes from policy.yml`);
  }
});

test('resolvePolicyKeys resolves the current replacement keys to their untouched schema defaults for a repo shaped like these frozen fixtures', () => {
  // None of the four fixtures carries a .claude-tweaks/policy.yml — the
  // harness's real read path for a repo like this passes null for both raw
  // sources, exactly as it would for one of these fixture repos today.
  const result = resolvePolicyKeys(Object.keys(CURRENT_REPLACEMENTS), { policyRaw: null, runConfigRaw: null });
  for (const [key, expected] of Object.entries(CURRENT_REPLACEMENTS)) {
    assert.deepStrictEqual(result[key], { value: expected, source: 'default' }, `${key} must resolve to its schema default`);
  }
});

test('requesting a retired key name directly degrades gracefully instead of throwing', () => {
  let result;
  assert.doesNotThrow(() => {
    result = resolvePolicyKeys(RETIRED_KEYS, { policyRaw: null, runConfigRaw: null });
  });
  // section-confirmation was retired outright (replacedBy: null) — unknown-key.
  assert.deepStrictEqual(result['section-confirmation'], { error: 'unknown-key' });
  // merge-check / review-severity-floor were renamed, not retired — requesting
  // the old name still resolves the replacement key's default, never an error.
  assert.deepStrictEqual(result['merge-check'], { value: true, source: 'default' });
  assert.deepStrictEqual(result['review-severity-floor'], { value: 'low', source: 'default' });
});
