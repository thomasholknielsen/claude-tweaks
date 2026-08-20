'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const skill = fs.readFileSync(path.join(ROOT, 'plugin', 'skills', 'routine', 'SKILL.md'), 'utf8');
const createAndUpdate = fs.readFileSync(
  path.join(ROOT, 'plugin', 'skills', 'routine', 'create-and-update.md'),
  'utf8',
);

test('SKILL.md wires pause/resume in argument-hint and the Input table', () => {
  assert.ok(skill.includes('<create|update|status|pause|resume>'));
  assert.ok(/\|\s*`pause <skill>`\s*\|/.test(skill));
  assert.ok(/\|\s*`resume <skill>`\s*\|/.test(skill));
});

test('SKILL.md Workflow table and mode-resolution line list pause/resume', () => {
  assert.ok(skill.includes('`create` | `update` | `status` | `pause` | `resume` | `fleet on` | `fleet status` | `fleet off`'));
  assert.ok(skill.includes('### PAUSE `<skill>` / RESUME `<skill>`'));
});

test('create-and-update.md defines the PAUSE/RESUME procedure', () => {
  assert.ok(createAndUpdate.includes('## PAUSE `<skill>` / RESUME `<skill>`'));
});

test('PAUSE/RESUME reuses record resolution rather than re-deriving it (AC1/AC2)', () => {
  assert.ok(createAndUpdate.includes('exactly as CREATE Steps 1-2 do'));
  assert.ok(createAndUpdate.includes("exactly as UPDATE Step 1 does"));
});

test('PAUSE/RESUME body touches only `enabled` (AC1/AC2)', () => {
  assert.ok(createAndUpdate.includes('{"enabled": <false for pause, true for resume>}'));
  assert.ok(createAndUpdate.includes('No other field is reassembled or changed'));
});

test('PAUSE/RESUME does not rewrite the instantiated record', () => {
  assert.ok(createAndUpdate.includes('The instantiated record is not rewritten'));
});
