'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkLifecycleStamps } = require('../../../plugin/bin/lib/hooks/lifecycle-stamps');

// [IL-131] second recurrence (#991): a build agent's own "already satisfied
// by prior work" judgment silently swept past both record-worktree and the
// PR-early lifecycle, twice (#118, #893) — with zero further commits either
// time, so nothing keyed on git activity would ever catch it. These tests
// pin `checkLifecycleStamps` — the pure decision function behind
// `/claude-tweaks:test`'s Step 1.6 Lifecycle Stamp Gate — against that exact
// trigger and its legitimate degrade counterpart.

function tmpRunDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-lifecycle-'));
  return dir;
}

function writeState(dir, state) {
  fs.writeFileSync(path.join(dir, 'run-state.json'), JSON.stringify(state));
}

test('no run dir (standalone /test) — nothing to enforce, always ok', () => {
  const result = checkLifecycleStamps({ runDir: null, gitStrategy: 'worktree', integrationModel: 'pr-first' });
  assert.deepStrictEqual(result, { ok: true, problems: [] });
});

test('#118/#893/#991 exact trigger: worktree mode, pr-first, no run-state.json at all — both stamps missing', () => {
  const run = tmpRunDir();
  const result = checkLifecycleStamps({ runDir: run, gitStrategy: 'worktree', integrationModel: 'pr-first' });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.problems.length, 2);
  assert.match(result.problems[0], /record-worktree was never called/);
  assert.match(result.problems[1], /PR-early lifecycle/);
});

test('worktree stamp present, pr-first with no pr/prDegraded — only the PR-lifecycle problem is reported', () => {
  const run = tmpRunDir();
  writeState(run, { worktree: '/tmp/wt' });
  const result = checkLifecycleStamps({ runDir: run, gitStrategy: 'worktree', integrationModel: 'pr-first' });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.problems.length, 1);
  assert.match(result.problems[0], /PR-early lifecycle/);
});

test('both stamps present — ok', () => {
  const run = tmpRunDir();
  writeState(run, { worktree: '/tmp/wt', pr: { number: 7, url: 'https://github.com/o/r/pull/7' } });
  const result = checkLifecycleStamps({ runDir: run, gitStrategy: 'worktree', integrationModel: 'pr-first' });
  assert.deepStrictEqual(result, { ok: true, problems: [] });
});

test('a documented degrade satisfies the PR-stamp check exactly like a real pr — never turns a legitimate degrade into a block', () => {
  const run = tmpRunDir();
  writeState(run, { worktree: '/tmp/wt', prDegraded: { reason: 'push-failed: no network', at: '2026-08-21T00:00:00.000Z' } });
  const result = checkLifecycleStamps({ runDir: run, gitStrategy: 'worktree', integrationModel: 'pr-first' });
  assert.deepStrictEqual(result, { ok: true, problems: [] });
});

test('local-merge never requires a PR stamp, even with neither pr nor prDegraded set', () => {
  const run = tmpRunDir();
  writeState(run, { worktree: '/tmp/wt' });
  const result = checkLifecycleStamps({ runDir: run, gitStrategy: 'worktree', integrationModel: 'local-merge' });
  assert.deepStrictEqual(result, { ok: true, problems: [] });
});

test('current-branch mode never requires a worktree stamp, even with an unset worktree field', () => {
  const run = tmpRunDir();
  writeState(run, { pr: { number: 1, url: 'https://github.com/o/r/pull/1' } });
  const result = checkLifecycleStamps({ runDir: run, gitStrategy: 'current-branch', integrationModel: 'pr-first' });
  assert.deepStrictEqual(result, { ok: true, problems: [] });
});

test('current-branch + local-merge — nothing to check, ok even with a totally empty run-state.json', () => {
  const run = tmpRunDir();
  writeState(run, {});
  const result = checkLifecycleStamps({ runDir: run, gitStrategy: 'current-branch', integrationModel: 'local-merge' });
  assert.deepStrictEqual(result, { ok: true, problems: [] });
});

test('an unreadable/corrupt run-state.json reads as "no stamps" — fails closed, never silently passes', () => {
  const run = tmpRunDir();
  fs.writeFileSync(path.join(run, 'run-state.json'), '{not valid json');
  const result = checkLifecycleStamps({ runDir: run, gitStrategy: 'worktree', integrationModel: 'pr-first' });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.problems.length, 2);
});
