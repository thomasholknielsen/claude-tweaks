'use strict';
// tests/build-sdd-ledger-carryover.test.js — pins #1135: /build's Common Step 2 SDD
// invocation instruction must direct /superpowers:subagent-driven-development to copy
// surviving SDD deferred-minor/parked progress.md lines into the run ledger before its
// own Finish step deletes the SDD workspace — otherwise a scoped re-review's out-of-scope
// observation ledgered only in the SDD workspace is structurally lost at the seam
// (skill-prose-conformance-tests' "prove go-red" pattern, [IL-105]).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const buildSkill = fs.readFileSync(path.join(ROOT, 'plugin', 'skills', 'build', 'SKILL.md'), 'utf8');

// The pre-change paragraph fragment (#1135) — the invocation-instruction paragraph as it
// read before this fix, missing the SDD ledger-carryover clause entirely. Used as the
// negative control so a green result proves each pattern can actually go red.
const PRE_CHANGE_FRAGMENT = 'so a per-task review can catch a task brief that misstates a spec criterion instead of relying solely on the final whole-branch review. **`profile=<fast|standard|capable|frontier>` token:** when present in `$ARGUMENTS`, it always wins over the `size:`-derived profile';

function assertClaimPinned(pattern, missingMessage) {
  assert.match(buildSkill, pattern, missingMessage);
  assert.doesNotMatch(PRE_CHANGE_FRAGMENT, pattern, 'pattern must NOT match the pre-change fragment (proves it can go red)');
}

test('build/SKILL.md Common Step 2: instructs SDD to carry forward deferred-minor findings before workspace deletion', () => {
  assertClaimPinned(
    /Carry forward SDD deferred-minor findings:/,
    'must add the SDD ledger-carryover clause to the subagent invocation instruction',
  );
});

test('build/SKILL.md Common Step 2: names progress.md as the source and the deletion-ordering constraint', () => {
  assertClaimPinned(
    /progress\.md.*before its (?:own )?Finish step deletes/,
    'must name progress.md as the source and require the copy to happen before workspace deletion',
  );
});

test('build/SKILL.md Common Step 2: names both SDD markers verbatim', () => {
  assertClaimPinned(
    /`minor \(deferred\)`.*`parked`/,
    'must name both minor (deferred) and parked as the lines to carry forward',
  );
  assertClaimPinned(
    /`parked`.*`minor \(deferred\)`|`minor \(deferred\)`.*`parked`/,
    'must name both markers (order-independent check)',
  );
});

test('build/SKILL.md Common Step 2: destination is the run ledger with phase build and a status per marker', () => {
  assertClaimPinned(
    /docs\/plans\/\{run\}-ledger\.md/,
    'must name the run ledger file as the destination',
  );
  assertClaimPinned(
    /phase `build`/,
    'must specify phase build for carried-forward lines',
  );
  assertClaimPinned(
    /status `deferred`.*status `observation`|status `observation`.*status `deferred`/,
    'must specify both deferred and observation as the possible carried-forward statuses',
  );
});

test('build/SKILL.md: file stays under the 40 KB per-invocation ceiling', () => {
  const bytes = Buffer.byteLength(buildSkill, 'utf8');
  assert.ok(bytes <= 40 * 1024, `build/SKILL.md is ${bytes} bytes, over the 40 KB ceiling — extract a sub-file`);
});
