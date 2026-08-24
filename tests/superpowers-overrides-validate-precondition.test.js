'use strict';
// tests/superpowers-overrides-validate-precondition.test.js — pins #808: both
// CLAUDE.md and its shipped template (plugin/skills/init/claude-md-template.md)
// must state a Validate/visual-review precondition before offering or invoking
// /superpowers:finishing-a-development-branch's merge decision for UI-dependent
// work, and must explicitly exempt backend/infra work with no UI surface.
// The Superpowers overrides line is a live, incrementally-growing convention
// statement (not content a future migration will delete), so this follows the
// same declared-contract read-live pattern as tests/specify-auto-continue-conformance.test.js
// rather than freezing a fixture.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

function overridesLine(text) {
  return text.split('\n').find((l) => l.includes('Superpowers overrides'));
}

for (const file of ['CLAUDE.md', path.join('plugin', 'skills', 'init', 'claude-md-template.md')]) {
  test(`${file}: Superpowers overrides line requires a Validate precondition before finish-branch's merge decision`, () => {
    const line = overridesLine(read(...file.split(path.sep)));
    assert.ok(line, `${file} must still carry a Superpowers overrides line`);
    assert.match(line, /Before offering or invoking `\/superpowers:finishing-a-development-branch`'s merge decision/);
    assert.match(line, /run a real browser-based visual check first/);
    assert.match(line, /raw HTML inspection does not satisfy this/, 'must rule out the known false-positive mode named in the record\'s Gotchas');
    assert.match(line, /Backend\/infra work with no UI surface is not blocked by this/, 'must state the AC3 exemption explicitly');
    assert.match(line, /`\/claude-tweaks:review \{N\} full`|`\/claude-tweaks:demo`/, 'must name at least one real channel for the check');
  });

  test(`${file}: Validate-precondition clause reuses the existing surface-detection signal, not a new one`, () => {
    const line = overridesLine(read(...file.split(path.sep)));
    assert.match(line, /surface:` web\/mobile\/desktop/);
    assert.match(line, /the same signal `\/specify`'s frontend detection and `\/claude-tweaks:build`'s Next Actions table already use/);
  });
}

test('CLAUDE.md still carries its own specify-auto-continue clause alongside the new one (no accidental deletion)', () => {
  const line = overridesLine(read('CLAUDE.md'));
  assert.match(line, /specify-auto-continue/, 'the pre-existing clause this repo carries beyond the shipped template must survive the edit');
});
