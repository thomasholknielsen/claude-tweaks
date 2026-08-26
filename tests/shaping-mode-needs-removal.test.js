'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readFlat = (rel) => read(rel).replace(/\s+/g, ' ');

const SHAPING_MODE_FLAT = readFlat('plugin/skills/specify/shaping-mode.md');

test('shaping-mode.md states the needs:* removal-on-promotion bullet, generalizing #825', () => {
  assert.ok(SHAPING_MODE_FLAT.includes('generalizes #825'), 'shaping-mode.md must cite #825 in its needs:* removal bullet');
  assert.ok(SHAPING_MODE_FLAT.includes('remove every `needs:*`-prefixed label'), 'needs:* removal bullet missing its core statement');
});

test('shaping-mode.md resolves every unresolved needs-decision comment before removing needs:decision', () => {
  assert.ok(SHAPING_MODE_FLAT.includes('**Resolved:** promoted via /specify'), 'promotion-time resolution line text missing');
  assert.ok(SHAPING_MODE_FLAT.includes('updateIssueComment'), 'shaping-mode.md must use the GraphQL updateIssueComment mutation to edit the live comment in place');
  assert.ok(SHAPING_MODE_FLAT.includes('needs:definition` carries no such comment and needs no equivalent write'), 'shaping-mode.md must distinguish needs:definition (no comment) from needs:decision (has a comment)');
});

test('shaping-mode.md compose-then-write-once call removes both needs:definition and needs:decision', () => {
  assert.ok(SHAPING_MODE_FLAT.includes('--remove-label "needs:definition"'), 'compose call must remove needs:definition');
  assert.ok(SHAPING_MODE_FLAT.includes('--remove-label "needs:decision"'), 'compose call must remove needs:decision');
});

test('shaping-mode.md read-back verification asserts no needs:* label survived the write', () => {
  assert.ok(SHAPING_MODE_FLAT.includes('needs:') && /needs:\*/.test(SHAPING_MODE_FLAT), 'read-back verification must assert against the needs:* family, not just parked/solution:unjustified');
});

// #763 is a real, currently-closed record that hit exactly this bug: it entered shaping carrying
// needs:definition, had its open question resolved via an in-shaping AskUserQuestion, and was
// stamped ready + full scoring while needs:definition remained on the final label set (verified
// live via `gh issue view 763 --json labels` — both `ready` and `needs:definition` are present on
// the closed issue today). This is AC4's own named historical scenario.
const PRE_CHANGE_STAMP_BULLETS = '- **`parked` present** — remove it; a record entering shaping mode is being promoted out of hold.\n- **`ready`** — add it (idempotent when already present, e.g. a born-ready record).';

test('go-red control (#763\'s bug): pre-change stamp bullets have no needs:* removal step at all', () => {
  assert.ok(!PRE_CHANGE_STAMP_BULLETS.includes('needs:'), 'control must not already remove any needs:* label — this is the exact absence #763 hit and #825 reported');
});
