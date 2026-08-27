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

test('build/SKILL.md Common Step 2: names both SDD markers verbatim, parked disambiguated from Finish\'s completion count', () => {
  // `parked —` (with the trailing em dash) rather than bare `parked` — SDD's own Finish
  // section emits `Task <N>: complete (commits <a>..<b>, <K> parked)`, which also contains
  // the substring "parked" but is a completion record, not a finding. Matching the bare word
  // would carry a spurious observation row into the ledger on every run with a parked count.
  assertClaimPinned(
    /`minor \(deferred\)`.*`parked —`|`parked —`.*`minor \(deferred\)`/,
    'must name both minor (deferred) and parked — (order-independent) as the lines to carry forward',
  );
});

test('build/SKILL.md Common Step 2: destination is the run ledger with phase build and status observation', () => {
  assertClaimPinned(
    /docs\/plans\/\{run\}-ledger\.md/,
    'must name the run ledger file as the destination',
  );
  assertClaimPinned(
    /phase `build`/,
    'must specify phase build for carried-forward lines',
  );
  // Both markers map to status `observation` (not `deferred`) — ledger-format.md defines
  // `deferred` as "staged as a work record proposal", which nothing here stages; a carried
  // line with no staged proposal would silently defeat wrap-up's nothing-left-behind gate.
  // `observation` is terminal, non-blocking, and carries no resolution-text requirement.
  assertClaimPinned(
    /status `observation`/,
    'must specify status observation for carried-forward lines',
  );
});

test('build/SKILL.md Common Step 2: anchors the copy to something /build itself controls, not only SDD\'s own Finish step', () => {
  // The same paragraph tells SDD to "stop the skill and return here" after the final review —
  // an executor reading only the Finish-step anchor could plausibly never reach it. The
  // "in any case before it returns control to /build" clause is the robustness backstop.
  assertClaimPinned(
    /before it returns control to `\/build`/,
    'must anchor the copy to returning control to /build, not only to SDD\'s own Finish step',
  );
});

test('build/SKILL.md: file stays under the 40 KB per-invocation ceiling', () => {
  const bytes = Buffer.byteLength(buildSkill, 'utf8');
  assert.ok(bytes <= 40 * 1024, `build/SKILL.md is ${bytes} bytes, over the 40 KB ceiling — extract a sub-file`);
});
