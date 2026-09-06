// bin/lib/issues/linked-prs.js
// Executes bin/lib/issues/record.js's buildLinkedPRQuery — the pure batched,
// aliased GraphQL query builder for the open-linked-PR exclusion (#1224) —
// via an injectable runner, and parses the response into the
// {openPR: number|null} shape bin/resolve-linked-prs.js's CLI and
// dispatch/queue-pull-script.md's eligibility pipeline both need. Mirrors
// native-dependencies.js's fetchNativeDependencies exactly (same
// throw-on-partial-result posture, same injectable-runner seam) but for the
// closedByPullRequestsReferences connection instead of blockedBy. Not pure
// (network via the injected runner) — deliberately kept out of record.js,
// which stays a pure, no-network module.
'use strict';

const { buildLinkedPRQuery } = require('./record');

// { numbers, owner, repo, runner } -> Map<number, { openPR: number|null }>.
// ONE batched, aliased GraphQL call (buildLinkedPRQuery) resolving every
// candidate's closedByPullRequestsReferences connection at once. owner/repo
// are already-resolved String! values, so -f (never -F — -F would
// type-coerce an all-numeric name, gh-api-module-pattern's flag table).
//
// Throws — never returns a partial map — when `data.repository` is
// null/missing, or any candidate's `i{n}` alias is absent from the
// response: the same "throw on a partial result rather than returning a
// partial map" rule fetchNativeDependencies follows above it — a malformed
// or error GraphQL response must never silently read as `openPR: null` for
// every affected record (an open-PR-in-flight false negative, the same
// #723 shape fetchNativeDependencies' own comment describes). Callers'
// own try/catch around this call routes the thrown message to their
// exit-1/exit-3 failure path, same as resolve-blockers.js does for
// fetchNativeDependencies.
function fetchLinkedPRs({ numbers, owner, repo, runner } = {}) {
  const result = new Map();
  const query = buildLinkedPRQuery(numbers);
  if (!query) return result;
  const out = runner(['api', 'graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `repo=${repo}`]);
  const parsed = JSON.parse(out);
  const repository = parsed && parsed.data && parsed.data.repository;
  const missing = repository ? numbers.filter((n) => !repository[`i${n}`]) : numbers.slice();
  if (missing.length) {
    const errs = Array.isArray(parsed && parsed.errors) ? parsed.errors.map((e) => e && e.message).filter(Boolean) : [];
    const suffix = errs.length ? ` (GraphQL: ${errs.join('; ')})` : '';
    const reason = repository ? 'missing linked-PR data for' : 'missing repository — no linked-PR data for';
    throw new Error(`${reason} ${missing.map((n) => `#${n}`).join(', ')}${suffix}`);
  }
  for (const n of numbers) {
    const node = repository[`i${n}`];
    const rawNodes = node.closedByPullRequestsReferences && node.closedByPullRequestsReferences.nodes;
    const nodes = Array.isArray(rawNodes) ? rawNodes : [];
    const openPR = nodes.find((p) => p && p.state === 'OPEN');
    result.set(n, { openPR: openPR ? openPR.number : null });
  }
  return result;
}

module.exports = { fetchLinkedPRs };
