'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  checkResumeFreshness,
  RESUME_FRESHNESS_THRESHOLD_MS,
} = require('../plugin/bin/lib/hooks/resume-freshness');
const { gitRepo, linkedWorktreeOf, fixtureGit } = require('./helpers/git-fixtures');

function tmpRunDir(state) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-resume-freshness-'));
  if (state) fs.writeFileSync(path.join(dir, 'run-state.json'), JSON.stringify(state));
  return dir;
}

test('checkResumeFreshness: own session is always safe, before any other check', () => {
  const runDir = tmpRunDir({ status: 'interrupted', sessionId: 'sess-a', worktree: '/does/not/exist' });
  const result = checkResumeFreshness(runDir, { sessionId: 'sess-a' });
  assert.deepStrictEqual(result, { safe: true, verdict: 'own-session' });
});

test('checkResumeFreshness: missing run-state.json is safe (nothing recorded to protect)', () => {
  const runDir = tmpRunDir(null);
  const result = checkResumeFreshness(runDir, { sessionId: 'sess-a' });
  assert.deepStrictEqual(result, { safe: true, verdict: 'no-state' });
});

test('checkResumeFreshness: status other than interrupted is always safe (the two-call dispatch handoff shape)', () => {
  const runDir = tmpRunDir({ status: 'active', sessionId: 'sess-a', worktree: '/does/not/exist' });
  const result = checkResumeFreshness(runDir, { sessionId: 'sess-b' });
  assert.deepStrictEqual(result, { safe: true, verdict: 'not-interrupted' });
});

test('checkResumeFreshness: interrupted with no recorded worktree is safe (nothing to probe)', () => {
  const runDir = tmpRunDir({ status: 'interrupted', sessionId: 'sess-a' });
  const result = checkResumeFreshness(runDir, { sessionId: 'sess-b' });
  assert.deepStrictEqual(result, { safe: true, verdict: 'no-worktree' });
});

test('checkResumeFreshness: interrupted with a worktree path that no longer exists is safe', () => {
  const runDir = tmpRunDir({ status: 'interrupted', sessionId: 'sess-a', worktree: '/no/such/path/at/all' });
  const result = checkResumeFreshness(runDir, { sessionId: 'sess-b' });
  assert.deepStrictEqual(result, { safe: true, verdict: 'worktree-gone' });
});

test('checkResumeFreshness: interrupted + a live worktree lock blocks', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  fixtureGit(['-C', main, 'worktree', 'lock', wt, '--reason', `claude session test (pid ${process.pid} start now)`]);
  const runDir = tmpRunDir({ status: 'interrupted', sessionId: 'sess-a', worktree: wt });
  const result = checkResumeFreshness(runDir, { sessionId: 'sess-b' });
  assert.equal(result.safe, false);
  assert.equal(result.verdict, 'locked');
  assert.match(result.reason, /live process/);
});

test('checkResumeFreshness: interrupted + a recent commit (no lock) blocks', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  fixtureGit(['-C', wt, 'commit', '--allow-empty', '-m', 'recent work', '-q']);
  const runDir = tmpRunDir({ status: 'interrupted', sessionId: 'sess-a', worktree: wt });
  const result = checkResumeFreshness(runDir, { sessionId: 'sess-b', now: Date.now() });
  assert.equal(result.safe, false);
  assert.equal(result.verdict, 'recent-commit');
  assert.ok(result.ageMs < RESUME_FRESHNESS_THRESHOLD_MS);
});

test('checkResumeFreshness: interrupted + a commit older than the threshold, no lock, is safe (stale)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  fixtureGit(['-C', wt, 'commit', '--allow-empty', '-m', 'old work', '-q']);
  const farFuture = Date.now() + RESUME_FRESHNESS_THRESHOLD_MS * 5;
  const runDir = tmpRunDir({ status: 'interrupted', sessionId: 'sess-a', worktree: wt });
  const result = checkResumeFreshness(runDir, { sessionId: 'sess-b', now: farFuture });
  assert.equal(result.safe, true);
  assert.equal(result.verdict, 'stale');
});

test('checkResumeFreshness: interrupted + a worktree path that exists but is not a git repo fails closed to indeterminate, not locked', () => {
  // Exists on disk (passes the existence check) but has no `.git` anywhere
  // above it in the temp-dir tree, so mainCheckoutRoot cannot resolve a root
  // for it. That is "could not determine", not "confirmed locked by a live
  // process" — the two must stay distinguishable because every call site
  // reports `reason` to a human verbatim (#676's final review, Important
  // finding #1). Before that fix this fell through the collapsed
  // isWorktreeLocked boolean and reported `verdict: 'locked'`, which is
  // simply false: there is no lock and no process here.
  const notAWorktree = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-resume-freshness-not-git-'));
  const runDir = tmpRunDir({ status: 'interrupted', sessionId: 'sess-a', worktree: notAWorktree });
  const result = checkResumeFreshness(runDir, { sessionId: 'sess-b' });
  assert.equal(result.safe, false);
  assert.equal(result.verdict, 'indeterminate');
});

test('RESUME_FRESHNESS_THRESHOLD_MS is on the order of minutes', () => {
  assert.ok(RESUME_FRESHNESS_THRESHOLD_MS >= 60 * 1000);
  assert.ok(RESUME_FRESHNESS_THRESHOLD_MS <= 60 * 60 * 1000);
});
