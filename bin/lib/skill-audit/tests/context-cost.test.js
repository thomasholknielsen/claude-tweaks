'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const {
  CEILING_BYTES,
  measureSkills,
  measureSubFiles,
  overCeiling,
  totalBytes,
  headroom,
} = require('../context-cost.js');

const REPO = path.join(__dirname, '..', '..', '..', '..');
const kb = (b) => (b / 1024).toFixed(1);

test('measureSkills finds every shipped skill', () => {
  const skills = measureSkills(REPO);
  assert.strictEqual(skills.length, 33);
  assert.ok(skills.every((s) => s.bytes > 0));
});

test('overCeiling and headroom agree on the boundary', () => {
  const at = { name: 'x', bytes: CEILING_BYTES };
  const over = { name: 'y', bytes: CEILING_BYTES + 1 };
  assert.deepStrictEqual(overCeiling([at]), []);
  assert.deepStrictEqual(overCeiling([over]), [over]);
  assert.strictEqual(headroom(at), 0);
  assert.strictEqual(headroom(over), -1);
});

// ── The guards. Both can fail, and after the Phase 3 extraction several files
// sit within a kilobyte of the ceiling, so they are one paragraph from doing so.

test('no SKILL.md exceeds the 40 KB per-invocation ceiling', () => {
  const skills = measureSkills(REPO);
  const over = overCeiling(skills);
  assert.deepStrictEqual(
    over.map((s) => `${s.name} ${kb(s.bytes)} KB`),
    [],
    'a SKILL.md loads in full on every invocation and once per dispatched subagent — '
      + 'extract a section to a sub-file rather than raising this ceiling',
  );
});

test('no lazy-loaded sub-file exceeds the ceiling either', () => {
  // A stub citing a sub-file pays the whole file — Read has no section
  // granularity. This is the shape that let init/bootstrap-steps.md reach 86 KB
  // behind 18 stubs (IL-70), while the per-SKILL.md rule was followed exactly.
  const over = overCeiling(measureSubFiles(REPO));
  assert.deepStrictEqual(
    over.map((s) => `${s.skill}/${s.file} ${kb(s.bytes)} KB`),
    [],
    'split by the unit the stubs actually name, rather than growing one overflow file',
  );
});

test('reports the payload total and the tightest headroom', () => {
  const skills = measureSkills(REPO);
  const total = totalBytes(skills);
  const tightest = skills
    .map((s) => ({ ...s, free: headroom(s) }))
    .sort((a, b) => a.free - b.free)[0];

  // Informational, not asserted: a total that only ever ratchets one direction is
  // the thing this module exists to make visible, but pinning it would fail on
  // every legitimate edit.
  console.log(`    shipped SKILL.md payload: ${kb(total)} KB across ${skills.length} skills`);
  console.log(`    tightest headroom: ${tightest.name} at ${kb(tightest.bytes)} KB `
    + `(${tightest.free} B under the ceiling)`);

  assert.ok(total > 0);
  assert.ok(tightest.free >= 0, `${tightest.name} is already over the ceiling`);
});
