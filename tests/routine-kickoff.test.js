'use strict';
// Pins the load-bearing text of skills/routine-kickoff/SKILL.md (#528) so none
// of it can be silently dropped: the dispatch/tidy manual-execution exclusion,
// the blast-radius note, and the standalone-followability note. Deliberately
// does NOT assert the repo contains zero references to routine-kickoff --
// the kernel migration (#529) wires references in immediately after landing.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const skill = fs.readFileSync(
  path.join(__dirname, '..', 'plugin', 'skills', 'routine-kickoff', 'SKILL.md'), 'utf8');

test('names dispatch, tidy, and backlog as manual-execution exclusions, with the principle', () => {
  assert.ok(skill.includes('the target is `dispatch`, `tidy`, or `backlog`'));
  assert.ok(skill.includes('report the degraded sandbox and stop'));
  assert.ok(skill.includes(
    'Dispatch claims queue records and triggers builds and merges, tidy\'s '
    + 'standalone-auto mode applies deletions'));
  assert.ok(skill.includes(
    'backlog refine\'s headless posture applies `auto:build`/`auto:merge` labels — '
    + 'machine-granted authorization is the same class of standing effect'));
  assert.ok(skill.includes(
    'any future routine whose skill claims work or writes beyond report-only '
    + 'surfaces gets the same exclusion'));
});

test('has a failure branch for a stale/renamed target skill on the manual-execution path', () => {
  assert.ok(skill.includes('If that file does not exist'));
  assert.ok(skill.includes('never guess at a similarly-named skill'));
});

test('states the hand-maintenance rule for the exclusion list', () => {
  assert.ok(skill.includes('hand-maintained'));
  assert.ok(skill.includes('the pinning test covers only the current names'));
});

test('carries the blast-radius standing constraint', () => {
  assert.ok(skill.includes('**Blast radius.**'));
  assert.ok(skill.includes('no per-routine pin'));
  assert.ok(skill.includes('the only rollback is a fix release'));
  assert.ok(skill.includes('shipped contract under expand-contract discipline'));
});

test('carries the standalone-followability standing constraint', () => {
  assert.ok(skill.includes('**Standalone followability.**'));
  assert.ok(skill.includes('reads this file as raw prose'));
  assert.ok(skill.includes('executable as written by a model with no Skill-tool support'));
});
