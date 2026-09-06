// tests/test-skill-affected-conformance.test.js
//
// Pins #1923's re-verify scoping contract in the prose that states it: the
// scoping table in test/verification.md (every site row named), the
// --changed-files redefinition of `affected` in test/SKILL.md, the QA skip
// literal, and multi-spec's single bookkeeping-only-delta statement. Reads
// live prose deliberately — the enumeration IS the declared contract whose
// update is the intended action (same house pattern as
// tests/manifesto-lever-conformance.test.js); do not generalize.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

test('test/SKILL.md redefines `affected` onto verify.js --changed-files and drops the git-diff wording (#1923 AC3)', () => {
  const skill = read('plugin/skills/test/SKILL.md');
  assert.ok(!skill.includes('uncommitted changes (uses git diff)'));
  const hits = skill.split('--changed-files').length - 1;
  assert.ok(hits >= 2, `expected --changed-files at least twice, got ${hits}`);
});

test('test/SKILL.md pipeline behavior carries the QA skip literal and the frontend-surface exception (#1923 AC4)', () => {
  const skill = read('plugin/skills/test/SKILL.md');
  const list = skill.slice(skill.indexOf('**Pipeline behavior:**'), skill.indexOf('## Step 1: Resolve Scope and Execute'));
  assert.ok(list.includes('QA: skipped — no affected stories'));
  // The surface decides on zero matches: a frontend surface always runs the
  // full story set (#808); anything else falls to the Layer 3 sniff.
  assert.match(list, /`web`\/`mobile`\/`desktop` → run the full story set/);
  assert.match(list, /Layer 3 sniff/);
});

test('verification.md holds the re-verify scoping table with every site row (#1923 AC1)', () => {
  const v = read('plugin/skills/test/verification.md');
  const table = v.slice(v.indexOf('### Re-verify scoping'));
  for (const row of [
    ['Build Common Step 5', 'always full'],
    ["auto-inserted `test`", 'scoped against `fullSha`'],
    ['Polish re-verify', 'scoped'],
    ['Review-fix re-verify', 'scoped'],
    ['Multi-spec spec-N `test` step', 'scoped (`none` on a bookkeeping-only delta)'],
    ['Standalone `/claude-tweaks:test`', 'full'],
    ['`/claude-tweaks:test affected`', 'the shared changed-file set'],
  ]) {
    const line = table.split('\n').find((l) => l.startsWith('|') && l.includes(row[0]));
    assert.ok(line, `missing table row for ${row[0]}`);
    assert.ok(line.includes(row[1]), `row ${row[0]} must state mode ${row[1]}: ${line}`);
  }
  assert.ok(table.includes('Standalone is always full'));
});

test('flow/multi-spec.md states the bookkeeping-only delta exactly once; steps-and-gates cites the table (#1923 AC6)', () => {
  const ms = read('plugin/skills/flow/multi-spec.md');
  assert.strictEqual(ms.split('still-verified: bookkeeping-only delta').length - 1, 1);
  const sg = read('plugin/skills/flow/steps-and-gates.md');
  assert.ok(sg.includes('**Re-verify scoping:**'));
  assert.ok(sg.includes('test/verification.md'));
});
