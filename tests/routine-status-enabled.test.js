'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const status = fs.readFileSync(path.join(ROOT, 'plugin', 'skills', 'routine', 'status.md'), 'utf8');

test('Step 3.5 diffs the live `enabled` field (AC3/AC4)', () => {
  assert.ok(status.includes('a top-level `enabled` field'));
  assert.ok(status.includes('paused via the claude.ai/code web UI'));
});

test('a paused routine folds into Drifted, never a sixth verdict (spec Technical Approach)', () => {
  const idx = status.indexOf('a top-level `enabled` field');
  assert.notEqual(idx, -1);
  const nearby = status.slice(idx, idx + 700);
  assert.ok(nearby.includes('Drifted'));
  assert.ok(nearby.includes('routine is paused (enabled: false) in the live console'));
});

test('`enabled: true` (the healthy state) is not reported', () => {
  const idx = status.indexOf('a top-level `enabled` field');
  const nearby = status.slice(idx, idx + 900);
  assert.ok(nearby.includes('`enabled: true` is not reported'));
});

test('additive: the five existing field-level checks are still present', () => {
  assert.ok(status.includes('a top-level `cron_expression`'));
  assert.ok(status.includes('`job_config.ccr.session_context.model`'));
  assert.ok(status.includes('`job_config.ccr.session_context.allowed_tools`'));
  assert.ok(status.includes('sources[].git_repository.url`'));
});
