// bin/lib/issues/claims.js
// Pure: build claim/release payloads for refs/claims/* and fold claim-comment
// markers into claim status. The SKILL.md runs gh and passes results back —
// no network here. Time-dependent functions take `now` (epoch ms).
// Contract: skills/_shared/issue-claims.md.
'use strict';

const DEFAULT_TTL_HOURS = 72;
const RELEASE_RE = /<!--\s*agent-claim-release:\s*(\{[\s\S]*?\})\s*-->/;
const CLAIM_RE = /<!--\s*agent-claim:\s*(\{[\s\S]*?\})\s*-->/;

function claimRef(issueNumber) {
  return `refs/claims/issue-${issueNumber}`;
}

// opts: { issueNumber, sha, runId, sessionId, ttlHours?, host?, owner?, repo?, now }
// owner/repo default to gh's {owner}/{repo} placeholders (auto-filled from the current repo).
// Returns { ref, refArgs, commentBody }. refArgs feed `gh api` (201 = claimed, 422 = contested).
function claimPayload({ issueNumber, sha, runId, sessionId, ttlHours = DEFAULT_TTL_HOURS, host = '', owner = '{owner}', repo = '{repo}', now }) {
  const claimedAt = new Date(now).toISOString();
  const ref = claimRef(issueNumber);
  const marker = { runId, sessionId, claimedAt, ttlHours, host };
  return {
    ref,
    refArgs: [`repos/${owner}/${repo}/git/refs`, '-f', `ref=${ref}`, '-f', `sha=${sha}`],
    commentBody: `<!-- agent-claim: ${JSON.stringify(marker)} -->\nClaimed by claude-tweaks run ${runId} at ${claimedAt} (TTL ${ttlHours}h).`,
  };
}

// opts: { issueNumber, runId, reason, owner?, repo?, now }
// Returns { ref, refDeleteArgs, commentBody }. DELETE path is /git/refs/claims/issue-<n>
// (the API drops the leading "refs/" segment in the delete path).
function releasePayload({ issueNumber, runId, reason, owner = '{owner}', repo = '{repo}', now }) {
  const releasedAt = new Date(now).toISOString();
  const ref = claimRef(issueNumber);
  const marker = { runId, reason, releasedAt };
  return {
    ref,
    refDeleteArgs: ['-X', 'DELETE', `repos/${owner}/${repo}/git/${ref}`],
    commentBody: `<!-- agent-claim-release: ${JSON.stringify(marker)} -->\nReleased by run ${runId}: ${reason}.`,
  };
}

// Never throws. Returns { kind: 'claim'|'release', ...markerFields } or null.
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

module.exports = { DEFAULT_TTL_HOURS, claimRef, claimPayload, releasePayload, parseClaimMarker };
