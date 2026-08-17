'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS = path.join(__dirname, '..', '..', '..', 'bin', 'hooks.js');

function git(args, cwd) { return execFileSync('git', args, { cwd, encoding: 'utf8' }); }

test('reconcile-background: writes a status file with completedAt + summary, exits 0 even with no gh/remote', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-bg-'));
  git(['init', '-q', '--initial-branch=main'], dir);
  git(['config', 'user.email', 't@e.com'], dir);
  git(['config', 'user.name', 'T'], dir);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
  git(['add', 'a.txt'], dir);
  git(['commit', '-q', '-m', 'seed'], dir);

  const result = execFileSync('node', [HOOKS, 'reconcile-background'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.trim(), 'claude-tweaks: reconcile-background complete');

  const statusPath = path.join(dir, '.claude-tweaks', 'reconcile-background-status.json');
  const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  assert.equal(typeof status.completedAt, 'number');
  assert.equal(status.surfaced, false);
  assert.equal(typeof status.summary, 'object');
});

// Task 10 review Critical finding fix-up: a second call within the
// freshness window must be a true no-op — it must not re-run reconcile()
// at all, and must not touch the status file in any way (no `completedAt`
// bump, no `surfaced` reset). Verified by comparing the raw file bytes
// before and after the second call: if the second call had rewritten
// anything, `completedAt` (a `Date.now()` millisecond value) would almost
// certainly differ, so byte-identity is a reliable proxy for "did not run".
test('reconcile-background: a second call within the freshness window is a no-op — it does not re-run reconcile() or touch the status file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-recon-bg-nop-'));
  git(['init', '-q', '--initial-branch=main'], dir);
  git(['config', 'user.email', 't@e.com'], dir);
  git(['config', 'user.name', 'T'], dir);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
  git(['add', 'a.txt'], dir);
  git(['commit', '-q', '-m', 'seed'], dir);

  const statusPath = path.join(dir, '.claude-tweaks', 'reconcile-background-status.json');

  const first = execFileSync('node', [HOOKS, 'reconcile-background'], { cwd: dir, encoding: 'utf8' });
  assert.equal(first.trim(), 'claude-tweaks: reconcile-background complete');
  const firstRaw = fs.readFileSync(statusPath, 'utf8');

  const second = execFileSync('node', [HOOKS, 'reconcile-background'], { cwd: dir, encoding: 'utf8' });
  assert.equal(second.trim(), 'claude-tweaks: reconcile-background complete', 'stdout is identical whether or not the pass actually ran — nothing reads this detached process\'s output');
  const secondRaw = fs.readFileSync(statusPath, 'utf8');

  assert.equal(secondRaw, firstRaw, 'a second call inside the freshness window must not touch the status file at all');
});

// Task 10 review Important #3: pin the FAST_CHECKS/BACKGROUND_CHECKS
// partition invariant — a future check added to reconcile/index.js's
// ALL_CHECKS that isn't also added to exactly one of these two lists must
// fail loudly here instead of silently belonging to neither the fast nor
// the background path (dropped entirely) or both (duplicated work).
test('FAST_CHECKS (session-start.js) + BACKGROUND_CHECKS (bin/hooks.js) partition reconcile/index.js\'s ALL_CHECKS exactly', () => {
  const { FAST_CHECKS } = require('../../../plugin/bin/lib/hooks/session-start');
  const { BACKGROUND_CHECKS } = require('../../../plugin/bin/hooks');
  const { ALL_CHECKS } = require('../../../plugin/bin/lib/reconcile');

  assert.ok(Array.isArray(FAST_CHECKS) && FAST_CHECKS.length, 'FAST_CHECKS must be a non-empty array');
  assert.ok(Array.isArray(BACKGROUND_CHECKS) && BACKGROUND_CHECKS.length, 'BACKGROUND_CHECKS must be a non-empty array');

  const combined = [...FAST_CHECKS, ...BACKGROUND_CHECKS];
  assert.equal(combined.length, new Set(combined).size, 'FAST_CHECKS and BACKGROUND_CHECKS must not overlap');
  assert.deepEqual(
    [...combined].sort(),
    [...ALL_CHECKS].sort(),
    'FAST_CHECKS + BACKGROUND_CHECKS must partition ALL_CHECKS exactly — nothing dropped, nothing duplicated',
  );
});
