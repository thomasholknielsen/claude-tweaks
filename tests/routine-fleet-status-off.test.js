'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const fleet = fs.readFileSync(path.join(ROOT, 'skills', 'routine', 'fleet.md'), 'utf8');
const skill = fs.readFileSync(path.join(ROOT, 'skills', 'routine', 'SKILL.md'), 'utf8');

test('fleet.md carries the status and off sections', () => {
  assert.ok(fleet.includes('## Fleet status (aggregation)'));
  assert.ok(fleet.includes('## Fleet off (pause-based shutdown)'));
});

test('fleet off pins never-delete and non-fleet scope (AC3/AC6)', () => {
  assert.ok(/never\s+deletes anything/i.test(fleet));
  assert.ok(fleet.includes('no destructive'));
  assert.ok(fleet.includes('deletion-vs-keep'));
});

test('fleet status pins posture taxonomy and counter honesty (AC2)', () => {
  assert.ok(fleet.includes('Posture taxonomy'));
  assert.ok(/supervised/.test(fleet) && /unattended/.test(fleet));
  assert.ok(fleet.includes('Blind spot'));
  assert.ok(fleet.includes('grant-mode-audit'));
});

test('SKILL.md wires fleet status and fleet off modes', () => {
  assert.ok(/\|\s*`fleet status`\s*\|/.test(skill));
  assert.ok(/\|\s*`fleet off`\s*\|/.test(skill));
  assert.ok(!skill.includes('are a companion sub-issue, not implemented here'));
});
