// bin/lib/issues/claims.js
// Pure: build claim/release payloads for refs/claims/* and fold claim-comment
// markers into claim status. The SKILL.md runs gh and passes results back —
// no network here. Time-dependent functions take `now` (epoch ms).
// Contract: skills/_shared/issue-claims.md.
'use strict';

const DEFAULT_TTL_HOURS = 72;
const CLAIMS_BRANCH = 'claims-registry';
const RELEASE_RE = /<!--\s*agent-claim-release:\s*(\{[\s\S]*?\})\s*-->/;
const CLAIM_RE = /<!--\s*agent-claim:\s*(\{[\s\S]*?\})\s*-->/;

function claimRef(issueNumber) {
  return `refs/claims/issue-${issueNumber}`;
}

function claimFilePath(issueNumber) {
  return `claims/issue-${issueNumber}.json`;
}

// opts: { issueNumber, sha, runId, sessionId, ttlHours?, host?, owner?, repo?, note?, now }
// owner/repo default to gh's {owner}/{repo} placeholders (auto-filled from the current repo).
// Returns { ref, sha, owner, repo, claimPath, fileContent, commentBody }.
// gh-CLI path: `gh api "repos/${owner}/${repo}/git/refs" -f "ref=${ref}" -f "sha=${sha}"`
//   (201 = claimed, 422 = contested).
// MCP path: create_or_update_file(owner, repo, claimPath, fileContent, branch: CLAIMS_BRANCH)
//   with no `sha` argument (create-only) — a file-already-exists rejection = contested,
//   the same 201/422 shape one level down. CLAIMS_BRANCH auto-creates on first write.
function claimPayload({ issueNumber, sha, runId, sessionId, ttlHours = DEFAULT_TTL_HOURS, host = '', owner = '{owner}', repo = '{repo}', note, now }) {
  const claimedAt = new Date(now).toISOString();
  const ref = claimRef(issueNumber);
  const marker = { runId, sessionId, claimedAt, ttlHours, host };
  const humanLines = [`Claimed by claude-tweaks run ${runId} at ${claimedAt} (TTL ${ttlHours}h).`];
  if (note) humanLines.push(note);
  return {
    ref,
    sha,
    owner,
    repo,
    claimPath: claimFilePath(issueNumber),
    fileContent: JSON.stringify(marker, null, 2),
    commentBody: `<!-- agent-claim: ${JSON.stringify(marker)} -->\n${humanLines.join('\n')}`,
  };
}

// opts: { issueNumber, runId, reason, link?, owner?, repo?, now }
// Returns { ref, owner, repo, claimPath, tombstoneContent, commentBody }.
// gh-CLI path: `gh api -X DELETE "repos/${owner}/${repo}/git/${ref}"`.
// MCP path: create_or_update_file(owner, repo, claimPath, tombstoneContent, branch:
//   CLAIMS_BRANCH, sha: <current file's sha, fetched first>) — overwrites with a tombstone
//   rather than deleting, since a delete-file MCP tool isn't confirmed to exist. A sha
//   mismatch here means someone else already broke/re-claimed — treat as a release race,
//   not this run's problem (mirrors the gh-path's own "release fails -> log, TTL is the
//   backstop" posture).
function releasePayload({ issueNumber, runId, reason, link, owner = '{owner}', repo = '{repo}', now }) {
  const releasedAt = new Date(now).toISOString();
  const ref = claimRef(issueNumber);
  const marker = link ? { runId, reason, releasedAt, link } : { runId, reason, releasedAt };
  const human = `Released by run ${runId}: ${reason}.` + (link ? ` See ${link}.` : '');
  return {
    ref,
    owner,
    repo,
    claimPath: claimFilePath(issueNumber),
    tombstoneContent: JSON.stringify({ released: true, ...marker }, null, 2),
    commentBody: `<!-- agent-claim-release: ${JSON.stringify(marker)} -->\n${human}`,
  };
}

// Never throws. Returns { kind: 'claim'|'release', ...markerFields } or null.
// The derived kind (from which marker prefix matched) always wins over any
// "kind" key inside the marker JSON — fields spread first, kind last.
// Release is checked first; the claim regex cannot match a release marker
// ("agent-claim-release:" has "-" after "agent-claim", not ":").
function parseClaimMarker(body) {
  if (typeof body !== 'string') return null;
  for (const [kind, re] of [['release', RELEASE_RE], ['claim', CLAIM_RE]]) {
    const m = re.exec(body);
    if (!m) continue;
    try {
      const fields = JSON.parse(m[1]);
      if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) return null;
      return { ...fields, kind };
    } catch {
      return null;
    }
  }
  return null;
}

// claim: a parsed claim marker. now: epoch ms.
// Stale iff now >= claimedAt + ttlHours. Unparseable claimedAt → never stale
// (fail-closed: a claim you cannot read is not yours to break; /tidy surfaces it).
function isStale(claim, now) {
  const t = Date.parse(claim && claim.claimedAt);
  if (Number.isNaN(t)) return false;
  const ttl = typeof claim.ttlHours === 'number' ? claim.ttlHours : DEFAULT_TTL_HOURS;
  return now >= t + ttl * 3600 * 1000;
}

// comments: array of body strings or {body} objects, chronological (gh api order).
// Folds markers in order: a claim activates, a release clears. `claimed` is true
// even when stale — staleness signals breakability, not absence.
//
// When claimed is false, `everReleased` distinguishes two outcomes a bare 422 can't tell
// apart on its own (see `_shared/issue-claims.md`'s Failure-posture table): `true` means the
// last marker seen was a valid release (the ref-delete failed after the release comment
// posted — safe to break: delete, recreate, takeover comment). `false` means no marker was
// ever found at all (comment-post failed after an earlier claim, or the marker is corrupted) —
// treat as live: skip, log; never break on this signal alone.
function claimStatus(comments, now) {
  let active = null;
  let lastMarkerKind = null;
  for (const item of comments || []) {
    const body = typeof item === 'string' ? item : item && item.body;
    const marker = parseClaimMarker(body);
    if (!marker) continue;
    lastMarkerKind = marker.kind;
    if (marker.kind === 'claim') active = marker;
    else active = null;
  }
  if (!active) return { claimed: false, claim: null, stale: false, everReleased: lastMarkerKind === 'release' };
  return { claimed: true, claim: active, stale: isStale(active, now) };
}

module.exports = {
  DEFAULT_TTL_HOURS, CLAIMS_BRANCH, claimRef, claimFilePath, claimPayload, releasePayload,
  parseClaimMarker, isStale, claimStatus,
};
