'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  decideRelease, releasedEntry, writeTombstone, releaseMerged,
} = require('../../../bin/lib/reconcile/release-merged');

// AC1: open PR always wins over issue-closed evidence
test('decideRelease: live claim + open PR + closed issue -> skip pr-open', () => {
  assert.deepStrictEqual(
    decideRelease('live', { number: 7, state: 'OPEN' }, 'CLOSED'),
    { action: 'skip', reason: 'pr-open' },
  );
});

// AC2: issue-closed evidence releases on no-pr and pr-closed-unmerged joins
test('decideRelease: live claim + no PR + closed issue -> release (issue-closed)', () => {
  const r = decideRelease('live', null, 'CLOSED');
  assert.strictEqual(r.action, 'release');
  assert.match(r.reason, /^issue-closed/);
});
test('decideRelease: stale claim + closed-unmerged PR + closed issue -> release', () => {
  const r = decideRelease('stale', { number: 7, state: 'CLOSED' }, 'CLOSED');
  assert.strictEqual(r.action, 'release');
  assert.match(r.reason, /^issue-closed/);
});

// AC3: open or unknown issue state never releases without merged-PR evidence
test('decideRelease: live claim + no PR + open issue -> skip', () => {
  assert.strictEqual(decideRelease('live', null, 'OPEN').action, 'skip');
});
test('decideRelease: live claim + no PR + unknown issue state (fetch failed) -> skip', () => {
  assert.strictEqual(decideRelease('live', null, undefined).action, 'skip');
});

// Unchanged behavior: merged-PR evidence, transports, non-candidates
test('decideRelease: merged PR still releases regardless of issue state', () => {
  assert.strictEqual(decideRelease('live', { number: 7, state: 'MERGED' }, 'OPEN').action, 'release');
});
test('decideRelease: transport failures still skip even with closed issue', () => {
  assert.strictEqual(decideRelease('live', 'gh-absent', 'CLOSED').action, 'skip');
  assert.strictEqual(decideRelease('live', 'network-failure', 'CLOSED').action, 'skip');
});
test('decideRelease: tombstone/absent/unreadable never release on issue-closed', () => {
  assert.strictEqual(decideRelease('tombstone', null, 'CLOSED').action, 'skip');
  assert.strictEqual(decideRelease('absent', null, 'CLOSED').action, 'skip');
  assert.strictEqual(decideRelease('unreadable', null, 'CLOSED').action, 'skip');
});

// AC2 caller-dereference: released entry tolerates null / non-object prState
test('releasedEntry: null prState -> prNumber null, no throw', () => {
  assert.deepStrictEqual(releasedEntry(42, 'run-x', null), { issueNumber: 42, runId: 'run-x', prNumber: null });
});
test('releasedEntry: merged prState carries its number', () => {
  assert.deepStrictEqual(releasedEntry(42, 'run-x', { number: 9, state: 'MERGED' }), { issueNumber: 42, runId: 'run-x', prNumber: 9 });
});

// The reconciler's PUT is composed by the shared release-claim module — one write path
// for every release (Section E CLI, reconciler). Pin the adapter's contract: it delegates
// to release-claim's writeTombstone with owner/repo split from the slug and the issue
// number parsed from the blob name, and maps any throw to false.
test('writeTombstone adapter delegates to bin/lib/release-claim/release.js writeTombstone', () => {
  assert.equal(typeof writeTombstone, 'function', 'adapter is exported for this pin');
  const seen = [];
  const ok = writeTombstone('acme/w', 'issue-42.json', 'sha42', '{"released":true}', 'merged: reconciled from PR #7', (args) => { seen.push(args); return '{}'; });
  assert.equal(ok, true);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].slice(0, 4), ['api', '--method', 'PUT', 'repos/acme/w/contents/claims/issue-42.json']);
  assert.ok(seen[0].includes('sha=sha42'));
  assert.ok(seen[0].some((a) => /^message=Release claim issue-42\.json — merged: reconciled from PR #7$/.test(a)));
  assert.equal(writeTombstone('acme/w', 'issue-42.json', 'sha42', '{}', 'r', () => { throw new Error('HTTP 422'); }), false);
});

test('shouldSkipClaimRead: matching cached sha skips the read', () => {
  const { shouldSkipClaimRead } = require('../../../bin/lib/reconcile/release-merged');
  assert.equal(shouldSkipClaimRead({ name: 'issue-7.json', sha: 'abc' }, 'abc'), true);
});
test('shouldSkipClaimRead: different sha does not skip', () => {
  const { shouldSkipClaimRead } = require('../../../bin/lib/reconcile/release-merged');
  assert.equal(shouldSkipClaimRead({ name: 'issue-7.json', sha: 'abc' }, 'different'), false);
});
test('shouldSkipClaimRead: no cached entry (undefined) does not skip — first sighting always reads', () => {
  const { shouldSkipClaimRead } = require('../../../bin/lib/reconcile/release-merged');
  assert.equal(shouldSkipClaimRead({ name: 'issue-7.json', sha: 'abc' }, undefined), false);
});

test('releaseMerged: a tombstoned claim with an unchanged sha is never re-fetched on the next pass', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-release-cache-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/w.git'], { cwd: root });

  let readCalls = 0;
  const ghApi = (args) => {
    if (args[0].includes('/contents/claims?')) {
      return { stdout: JSON.stringify([{ name: 'issue-7.json', sha: 'tombstone-sha' }]), failure: null, status: null };
    }
    if (args[0].includes('/contents/claims/issue-7.json')) {
      readCalls += 1;
      return { stdout: JSON.stringify({ content: JSON.stringify({ released: true }), sha: 'tombstone-sha' }), failure: null, status: null };
    }
    throw new Error(`unexpected ${args.join(' ')}`);
  };

  await releaseMerged({ cwd: root, ghApi }); // first pass: reads and caches the tombstone's sha
  assert.equal(readCalls, 1);
  await releaseMerged({ cwd: root, ghApi }); // second pass: sha unchanged, must not re-read
  assert.equal(readCalls, 1, 'second pass must skip the read for an unchanged terminal-state sha');
});

// Task 7's Critical TOCTOU fix, pinned (#820 final review). Every other
// fixture in this file gives the directory listing and the blob read the
// SAME sha, so both would still pass if the cache write reverted to the
// listing's `entry.sha` — the exact bug Task 7's review caught. Here the two
// deliberately diverge (a race: another agent rewrote the claim between the
// listing call and the read), and the cache must record the sha of the
// content that was actually classified.
//
// Two independent discriminators, both red under `entry.sha`:
//   (1) the written cache holds 'blob-sha', not 'listing-sha';
//   (2) the next pass still RE-READS the claim — caching the listing's sha
//       would make shouldSkipClaimRead match the (unchanged) listing entry
//       forever, permanently freezing a claim on evidence never read.
test('releaseMerged: caches the blob sha actually classified, not the directory listing\'s sha (Task 7 TOCTOU)', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const { readCache } = require('../../../bin/lib/reconcile/cache');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-release-toctou-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/w.git'], { cwd: root });

  let readCalls = 0;
  const ghApi = (args) => {
    if (args[0].includes('/contents/claims?')) {
      // The listing's sha — stale by the time the read below happens.
      return { stdout: JSON.stringify([{ name: 'issue-9.json', sha: 'listing-sha' }]), failure: null, status: null };
    }
    if (args[0].includes('/contents/claims/issue-9.json')) {
      readCalls += 1;
      // The blob actually read and classified — terminal (tombstone), so it
      // reaches the cache-write branch, but at a DIFFERENT sha.
      return { stdout: JSON.stringify({ content: JSON.stringify({ released: true }), sha: 'blob-sha' }), failure: null, status: null };
    }
    throw new Error(`unexpected ${args.join(' ')}`);
  };

  await releaseMerged({ cwd: root, ghApi });
  assert.equal(readCalls, 1);
  assert.equal(
    readCache(root).claimShas[9],
    'blob-sha',
    'the cache must record the sha of the content that was classified, never the directory listing\'s',
  );

  await releaseMerged({ cwd: root, ghApi });
  assert.equal(
    readCalls,
    2,
    'the listing sha never matched a real read, so the claim must be re-read — caching entry.sha would freeze it on unread evidence',
  );
});

// Guards against terminal-only caching silently widening to cover active
// (live/stale) claims — the invariant this task exists to hold. A live
// claim's PR/issue join can change pass-to-pass even when its content
// hasn't, so it must never be cached/skipped, unlike the tombstone above.
test('releaseMerged: a live claim with an unchanged sha is still re-fetched every pass', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { execFileSync } = require('child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-release-cache-live-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/w.git'], { cwd: root });

  // Un-expired claimedAt/ttlHours + a runId — matches this file's existing
  // claim-marker fixture shape (see claims.js's claimPayload).
  const liveContent = JSON.stringify({
    runId: 'no-such-run', sessionId: 's1', claimedAt: new Date().toISOString(), ttlHours: 72, host: 'h',
  });

  let readCalls = 0;
  const ghApi = (args) => {
    if (args[0].includes('/contents/claims?')) {
      return { stdout: JSON.stringify([{ name: 'issue-8.json', sha: 'live-sha' }]), failure: null, status: null };
    }
    if (args[0].includes('/contents/claims/issue-8.json')) {
      readCalls += 1;
      return { stdout: JSON.stringify({ content: liveContent, sha: 'live-sha' }), failure: null, status: null };
    }
    if (args[0].includes('/issues/8')) {
      // No local run-state.json for 'no-such-run', so the PR join fails
      // closed (no-run-state) and decideRelease falls through to the
      // issue-state lookup — this fake answers it 'OPEN' so the claim
      // resolves to an ordinary skip ('no-run-state'), never a release,
      // keeping this test's only assertion on `readCalls`.
      return { stdout: 'OPEN\n', failure: null, status: null };
    }
    throw new Error(`unexpected ${args.join(' ')}`);
  };

  await releaseMerged({ cwd: root, ghApi });
  assert.equal(readCalls, 1);
  await releaseMerged({ cwd: root, ghApi }); // second pass: sha unchanged, but the claim is live — must still re-read
  assert.equal(readCalls, 2, 'a live claim must never be cached/skipped, even with an unchanged sha');
});
