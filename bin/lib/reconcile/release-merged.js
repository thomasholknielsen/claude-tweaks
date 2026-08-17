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
const { classifyClaimBlob, releasePayload } = require('../issues/claims');
const claimStore = require('../issues/claim-store');
const { resolvePrState } = require('./pr-state');
const { writeTombstone: writeTombstoneShared } = require('../release-claim/release');
const { readCache, writeCache } = require('./cache');

const GH_TIMEOUT_MS = 5000;

// One claim's classified state + the branch's PR state (+ optionally the
// issue's own state) -> what to do. Pure — no I/O — so the whole decision
// table is unit-testable without a real gh call. `classifiedState` is
// `classifyClaimBlob(content, now).state`. `issueState` is `'OPEN' | 'CLOSED'
// | undefined` — when the PR join alone can't release (no-pr or
// pr-closed-unmerged), a closed issue is independent release evidence: a
// closed record cannot legitimately still be in progress.
//   { action: 'release', reason } | { action: 'skip', reason }
function decideRelease(classifiedState, prState, issueState) {
  if (classifiedState !== 'live' && classifiedState !== 'stale') {
    return { action: 'skip', reason: classifiedState }; // absent/tombstone/unreadable — nothing to release
  }
  if (prState === 'gh-absent') return { action: 'skip', reason: 'gh-absent' };
  if (prState === 'network-failure') return { action: 'skip', reason: 'network-failure' };
  if (prState && prState.state === 'MERGED') {
    return { action: 'release', reason: `merged: reconciled from PR #${prState.number}` };
  }
  if (prState && prState.state === 'OPEN') {
    return { action: 'skip', reason: 'pr-open' }; // open PR means work may be landing — issue-closed evidence never overrides
  }
  // Join yielded no-pr (null) or pr-closed-unmerged: issue-closed evidence applies.
  // A closed record cannot legitimately be in progress, whatever the close reason.
  if (issueState === 'CLOSED') {
    return { action: 'release', reason: 'issue-closed' }; // caller appends ": reconciled from #{n}" — the blob's own issue number is not in this signature
  }
  return { action: 'skip', reason: prState ? 'pr-closed-unmerged' : 'no-pr' };
}

// The two joins `decideRelease` cannot settle from PR evidence alone — no PR at
// all, or a PR closed unmerged. Everything else (MERGED, OPEN, gh-absent,
// network-failure) is decided without an issue lookup, so this is what gates the
// extra gh api call at the call site.
function needsIssueEvidence(prState) {
  if (prState === null) return true;
  return typeof prState === 'object' && prState.state === 'CLOSED';
}

// Pure: a claim listing entry + the cached sha last seen for that issue ->
// skip the readClaimBlob call entirely when unchanged (#820, D6). Only ever
// called by releaseMerged's loop below with a cache entry that was recorded
// for a TERMINAL classified state (tombstone/unreadable) — a live/stale
// claim's sha is never cached, because that claim's PR/issue join can still
// change pass-to-pass even when its content hasn't (see the loop's own
// comment). A terminal state, once classified, never un-terminals itself —
// `classifyClaimBlob` is a pure function of content, so a byte-identical
// blob reclassifies identically every time — so a cache hit here means "we
// already know this claim is dead weight, don't re-fetch it."
function shouldSkipClaimRead(entry, cachedSha) {
  if (cachedSha === undefined || cachedSha === null) return false;
  return entry.sha === cachedSha;
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

// Raw `gh` runner for the shared write path below (ghApi prepends `api` and
// swallows failures; writeTombstoneShared composes its own argv and needs the throw).
function ghRunner(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: GH_TIMEOUT_MS });
}

function repoSlugOf(repoRoot) {
  const remote = runGit(['remote', 'get-url', 'origin'], repoRoot);
  if (remote.failure || !remote.stdout) return null;
  const m = /[:/]([^/]+\/[^/]+?)(\.git)?$/.exec(remote.stdout);
  return m ? m[1] : null;
}

// Both delegate to claim-store.js's one contents-API implementation.
// `api` defaults to this module's own `ghApi`, which never sets `status`
// (unlike claim-store's `defaultGhApi`), so `readClaimBlob`'s `absent: true`
// branch never fires with the default — every failure still surfaces as
// `gh-absent`/`network-failure` exactly as before this extraction (a 404
// mid-iteration is a race with another release pass, indistinguishable from
// any other read failure, and was never distinguished here pre-extraction
// either). `api` is overridable so releaseMerged's own injectable `ghApi`
// param (see below) reaches these calls in tests, mirroring claim-store's
// seam rather than adding a second one.
function listClaims(repoSlug, api = ghApi) {
  return claimStore.listClaimEntries(api, repoSlug);
}

// claim-store.js keys on the issue number, not the blob filename. Callers
// pre-filter `name` on this same regex before calling — see releaseMerged's
// loop below — so the match is always non-null here.
function issueNumberOf(name) {
  return Number(/^issue-(\d+)\.json$/.exec(name)[1]);
}

function readClaim(repoSlug, name, api = ghApi) {
  const r = claimStore.readClaimBlob(api, repoSlug, issueNumberOf(name));
  return { content: r.content, sha: r.sha, failure: r.failure };
}

// Issue-state lookup — same ghApi pattern (5s timeout). Unknown/errored
// state returns undefined: fail closed, never releases on missing evidence.
function readIssueState(repoSlug, issueNumber, api = ghApi) {
  const r = api([`repos/${repoSlug}/issues/${issueNumber}`, '-q', '.state']);
  if (r.failure || !r.stdout) return undefined;
  const s = r.stdout.trim().toUpperCase();
  return s === 'OPEN' || s === 'CLOSED' ? s : undefined;
}

// Pure seam for the released.push shape — the issue-closed path releases with a
// null/non-merged prState, so an unconditional prState.number dereference would
// throw on exactly that path.
function releasedEntry(issueNumber, runId, prState) {
  return { issueNumber, runId, prNumber: prState && typeof prState === 'object' ? prState.number : null };
}

// Conditional-update — sha = the target file's current blob sha from the
// fresh read above, per `_shared/issue-claims.md`'s "The lock" step 4/5. The
// PUT itself is composed by bin/lib/release-claim/release.js's writeTombstone —
// the one write path Section E's CLI and this reconciler share — so a sha
// mismatch (someone else already broke/re-claimed it) surfaces as an ordinary
// throw there and maps to false here; the caller logs it as a release race,
// exactly the posture that file's Failure posture table documents. `runner`
// is injectable for tests; the default keeps this module's 5s gh timeout.
function writeTombstone(repoSlug, name, sha, tombstoneContent, reason, runner = ghRunner) {
  const [owner, repo] = repoSlug.split('/');
  const issueNumber = Number((/^issue-(\d+)\.json$/.exec(name) || [])[1]);
  try {
    writeTombstoneShared({ owner, repo, issueNumber, sha, tombstoneContent, message: `Release claim ${name} — ${reason}`, runner });
    return true;
  } catch {
    return false;
  }
}

// Best-effort in both directions per `_shared/issue-claims.md` — a failed
// add/remove never blocks the claim, the release, or the pipeline.
function removeInProgressLabel(repoSlug, issueNumber, api = ghApi) {
  const r = api(['--method', 'DELETE', `repos/${repoSlug}/issues/${issueNumber}/labels/bot%3Ain-progress`]);
  return r.failure === null;
}

// opts: { cwd?, ghApi? } — `ghApi` is an injectable override for this
// module's own gh-api calls (listing, per-claim reads, issue-state, label
// removal), mirroring claim-store.js's seam, so tests never shell to the
// real `gh` binary. Defaults to the module-level `ghApi` above.
function releaseMerged({ cwd, ghApi: ghApiOverride } = {}) {
  const released = [];
  const skipped = [];
  const root = cwd || process.cwd();
  const repoSlug = repoSlugOf(root);
  if (!repoSlug) return { released, skipped, failure: 'no-remote' };

  const api = ghApiOverride || ghApi;

  const { entries, failure } = listClaims(repoSlug, api);
  if (failure) return { released, skipped, failure };

  const cache = readCache(root);
  const nextClaimShas = {};

  const wtList = runGit(['worktree', 'list', '--porcelain'], root);
  const worktrees = wtList.failure ? [] : parseWorktreeList(wtList.stdout);

  for (const entry of entries) {
    const m = /^issue-(\d+)\.json$/.exec(entry.name);
    if (!m) continue;
    const issueNumber = Number(m[1]);

    // A cache hit here only ever fires for a sha last recorded below with a
    // TERMINAL classified state (tombstone/unreadable) — see the `!isActive`
    // branch. A live/stale claim's sha is never written to the cache, so
    // this can never skip re-reading (and rejoining) an active candidate;
    // it only skips re-fetching content this module already knows is dead
    // weight, since `classifyClaimBlob` is a pure function of content and a
    // terminal state never un-terminals itself (#820, D6). Re-propagating
    // `entry.sha` here (rather than re-deriving claim.sha, which we don't
    // have — the whole point of this branch is skipping that read) is safe:
    // a cache HIT means this exact sha was already proven terminal by a
    // real read+classify on a PRIOR pass (see the `!isActive` branch below,
    // which caches `claim.sha` — the two are equal for a quiescent claim
    // since a listing sha and a blob-content sha are the same git blob sha).
    if (shouldSkipClaimRead(entry, cache.claimShas[issueNumber])) {
      nextClaimShas[issueNumber] = entry.sha; // still terminal, still cached
      continue; // matches the `if (!isActive) continue;` no-log behavior below
    }

    const claim = readClaim(repoSlug, entry.name, api);
    if (claim.failure) { skipped.push({ issueNumber, reason: claim.failure }); continue; }

    const classified = classifyClaimBlob(claim.content, Date.now());
    const isActive = classified.state === 'live' || classified.state === 'stale';
    if (!isActive) {
      // Cache the sha of the content actually classified (claim.sha, from
      // THIS fresh read), never the listing's entry.sha (from the earlier
      // directory-listing call) — the two can diverge under a race where
      // another agent released the claim between the listing and this read
      // (#820 review). claim.sha is also what writeTombstone already treats
      // as the authoritative sha for a conditional write, so this matches
      // the rest of the module. A null claim.sha (e.g. a 404-race/no-content
      // misread that classifyClaimBlob(null, ...) reports as 'absent') is
      // self-disarming: shouldSkipClaimRead's cachedSha === null guard never
      // treats it as a cache hit, so that claim simply stays un-cached and
      // is re-read (and can self-heal) on the next pass.
      nextClaimShas[issueNumber] = claim.sha; // terminal — cacheable, see the skip branch above
      continue; // absent/tombstone/unreadable — not worth logging as a skip
    }

    let runId = null;
    try { runId = JSON.parse(claim.content).runId || null; } catch { /* falls through to no-run-id below */ }
    if (!runId) {
      skipped.push({ issueNumber, reason: 'no-run-id' });
      continue;
    }

    let prState = null;
    let joinFailure = null; // 'no-run-state' | 'no-branch' — preserved as the skip reason when no evidence releases
    if (runId) {
      const runDir = path.join(root, '.claude-tweaks', 'pipelines', runId);
      const runState = readRunState(runDir);
      const wtEntry = runState && runState.worktree
        ? worktrees.find((w) => path.resolve(w.path) === path.resolve(runState.worktree))
        : null;
      const branch = wtEntry ? wtEntry.branch : null;
      if (!runState || !runState.worktree) {
        joinFailure = 'no-run-state'; // archived/gone run dir — issue-closed evidence below may still release
      } else if (!branch) {
        joinFailure = 'no-branch';
      } else {
        prState = resolvePrState(root, branch);
      }
    }

    // Fetch issue state only for release candidates where PR evidence alone
    // cannot release: the no-pr and pr-closed-unmerged join results (incl.
    // join failures above). Gated on live/stale first — tombstones persist
    // forever (overwrites, not deletions), so an ungated fetch here would be
    // a growing per-pass gh api cost with zero effect on non-candidates.
    let issueState;
    if (needsIssueEvidence(prState)) {
      // One gh api call per candidate, per pass — intentional; bounded by the
      // open claim count (typically small), not by repo or issue history size.
      issueState = readIssueState(repoSlug, issueNumber, api);
    }

    const decision = decideRelease(classified.state, prState, issueState);
    if (decision.action === 'skip') {
      skipped.push({ issueNumber, runId, reason: joinFailure || decision.reason });
      continue;
    }

    const reason = decision.reason === 'issue-closed'
      ? `issue-closed: reconciled from #${issueNumber}`
      : decision.reason;
    const payload = releasePayload({ issueNumber, runId, reason, now: Date.now() });
    const ok = writeTombstone(repoSlug, entry.name, claim.sha, payload.tombstoneContent, reason);
    if (!ok) { skipped.push({ issueNumber, runId, reason: 'release-write-failed' }); continue; }
    removeInProgressLabel(repoSlug, issueNumber, api); // best-effort, never gates the release
    released.push(releasedEntry(issueNumber, runId, prState));
  }

  writeCache(root, { ...cache, claimShas: nextClaimShas });
  return { released, skipped };
}

module.exports = {
  releaseMerged, decideRelease, releasedEntry, repoSlugOf, writeTombstone, shouldSkipClaimRead,
};
