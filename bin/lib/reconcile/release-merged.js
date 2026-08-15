// bin/lib/reconcile/release-merged.js — convergence check 3: release claims
// and remove the `bot:in-progress` label on merged-PR evidence. Iterates the
// open claim blobs themselves — `claims/issue-{n}.json` names its issue
// number and `runId`, and `runId` -> this repo's own run-state.json -> branch
// -> PR state IS the branch<->issue join, no naming convention needed (see
// `_shared/issue-claims.md`). Re-derives from claim/run state independently
// every pass, so a partial or interrupted reconcile costs nothing — the next
// pass picks up exactly where this one left off.
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const { runGit } = require('../hooks/git-exec');
const { parseWorktreeList } = require('../hooks/worktree-reap');
const { readRunState } = require('../hooks/context');
const { classifyClaimBlob, releasePayload, CLAIMS_BRANCH } = require('../issues/claims');
const { resolvePrState } = require('./pr-state');

const GH_TIMEOUT_MS = 5000;

// One claim's classified state + the branch's PR state -> what to do.
// Pure — no I/O — so the whole decision table is unit-testable without a
// real gh call. `classifiedState` is `classifyClaimBlob(content, now).state`.
//   { action: 'release', reason } | { action: 'skip', reason }
function decideRelease(classifiedState, prState) {
  if (classifiedState !== 'live' && classifiedState !== 'stale') {
    return { action: 'skip', reason: classifiedState }; // absent/tombstone/unreadable — nothing to release
  }
  if (prState === 'gh-absent') return { action: 'skip', reason: 'gh-absent' };
  if (prState === 'network-failure') return { action: 'skip', reason: 'network-failure' };
  if (!prState) return { action: 'skip', reason: 'no-pr' };
  if (prState.state !== 'MERGED') {
    return { action: 'skip', reason: prState.state === 'OPEN' ? 'pr-open' : 'pr-closed-unmerged' };
  }
  return { action: 'release', reason: `merged: reconciled from PR #${prState.number}` };
}

function ghApi(args) {
  try {
    const stdout = execFileSync('gh', ['api', ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: GH_TIMEOUT_MS,
    });
    return { stdout, failure: null };
  } catch (e) {
    if (e && e.code === 'ENOENT') return { stdout: null, failure: 'gh-absent' };
    return { stdout: null, failure: 'network-failure' };
  }
}

function repoSlugOf(repoRoot) {
  const remote = runGit(['remote', 'get-url', 'origin'], repoRoot);
  if (remote.failure || !remote.stdout) return null;
  const m = /[:/]([^/]+\/[^/]+?)(\.git)?$/.exec(remote.stdout);
  return m ? m[1] : null;
}

function listClaims(repoSlug) {
  const r = ghApi([`repos/${repoSlug}/contents/claims?ref=${CLAIMS_BRANCH}`, '-q', '.[].name']);
  if (r.failure) return { names: [], failure: r.failure };
  return { names: r.stdout.split('\n').map((s) => s.trim()).filter(Boolean), failure: null };
}

function readClaim(repoSlug, name) {
  const r = ghApi([`repos/${repoSlug}/contents/claims/${name}?ref=${CLAIMS_BRANCH}`, '-q', '{content: (.content | @base64d), sha: .sha}']);
  if (r.failure) return { content: null, sha: null, failure: r.failure };
  try {
    const parsed = JSON.parse(r.stdout);
    return { content: parsed.content, sha: parsed.sha, failure: null };
  } catch {
    return { content: null, sha: null, failure: 'network-failure' };
  }
}

// Conditional-update — sha = the target file's current blob sha from the
// fresh read above, per `_shared/issue-claims.md`'s "The lock" step 4/5. A
// sha mismatch (someone else already broke/re-claimed it) surfaces as an
// ordinary write failure here; the caller logs it as a release race, exactly
// the posture that file's Failure posture table documents.
function writeTombstone(repoSlug, name, sha, tombstoneContent) {
  const encoded = Buffer.from(tombstoneContent, 'utf8').toString('base64');
  const r = ghApi([
    '--method', 'PUT', `repos/${repoSlug}/contents/claims/${name}`,
    '-f', `message=Release claim ${name} — reconciled (PR merged)`,
    '-f', `content=${encoded}`,
    '-f', `branch=${CLAIMS_BRANCH}`,
    '-f', `sha=${sha}`,
  ]);
  return r.failure === null;
}

// Best-effort in both directions per `_shared/issue-claims.md` — a failed
// add/remove never blocks the claim, the release, or the pipeline.
function removeInProgressLabel(repoSlug, issueNumber) {
  const r = ghApi(['--method', 'DELETE', `repos/${repoSlug}/issues/${issueNumber}/labels/bot%3Ain-progress`]);
  return r.failure === null;
}

function releaseMerged({ cwd } = {}) {
  const released = [];
  const skipped = [];
  const root = cwd || process.cwd();
  const repoSlug = repoSlugOf(root);
  if (!repoSlug) return { released, skipped, failure: 'no-remote' };

  const { names, failure } = listClaims(repoSlug);
  if (failure) return { released, skipped, failure };

  const wtList = runGit(['worktree', 'list', '--porcelain'], root);
  const worktrees = wtList.failure ? [] : parseWorktreeList(wtList.stdout);

  for (const name of names) {
    const m = /^issue-(\d+)\.json$/.exec(name);
    if (!m) continue;
    const issueNumber = Number(m[1]);

    const claim = readClaim(repoSlug, name);
    if (claim.failure) { skipped.push({ issueNumber, reason: claim.failure }); continue; }

    const classified = classifyClaimBlob(claim.content, Date.now());
    let runId = null;
    if (classified.state === 'live' || classified.state === 'stale') {
      try { runId = JSON.parse(claim.content).runId || null; } catch { /* falls through to no-run-id below */ }
    }
    if ((classified.state === 'live' || classified.state === 'stale') && !runId) {
      skipped.push({ issueNumber, reason: 'no-run-id' });
      continue;
    }

    let prState = null;
    if (runId) {
      const runDir = path.join(root, '.claude-tweaks', 'pipelines', runId);
      const runState = readRunState(runDir);
      const wtEntry = runState && runState.worktree
        ? worktrees.find((w) => path.resolve(w.path) === path.resolve(runState.worktree))
        : null;
      const branch = wtEntry ? wtEntry.branch : null;
      if (runState && runState.worktree && !branch) {
        skipped.push({ issueNumber, runId, reason: 'no-branch' });
        continue;
      }
      if (!runState || !runState.worktree) {
        skipped.push({ issueNumber, runId, reason: 'no-run-state' });
        continue;
      }
      prState = resolvePrState(root, branch);
    }

    const decision = decideRelease(classified.state, prState);
    if (decision.action === 'skip') {
      if (classified.state !== 'live' && classified.state !== 'stale') continue; // absent/tombstone/unreadable — not worth logging as a skip
      skipped.push({ issueNumber, runId, reason: decision.reason });
      continue;
    }

    const payload = releasePayload({ issueNumber, runId, reason: decision.reason, now: Date.now() });
    const ok = writeTombstone(repoSlug, name, claim.sha, payload.tombstoneContent);
    if (!ok) { skipped.push({ issueNumber, runId, reason: 'release-write-failed' }); continue; }
    removeInProgressLabel(repoSlug, issueNumber); // best-effort, never gates the release
    released.push({ issueNumber, runId, prNumber: prState.number });
  }
  return { released, skipped };
}

module.exports = { releaseMerged, decideRelease, repoSlugOf };
