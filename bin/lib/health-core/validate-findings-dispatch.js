'use strict';
const { loadIssueIndex } = require('./issue-index');

// Shared cache-read + issueIndex-load + within-batch-dedup + decide/dispatch
// loop for every health producer's cmdValidateFindings (harness-health,
// journey-health, docs-health) — previously ~15 lines byte-for-byte
// duplicated across all three CLI entrypoints
// (bin/harness-health.js/bin/journey-health.js/bin/docs-health.js).
//
// deps: { readCache, decide, toIssuePayload } are each domain-specific
// (their own cache shape, dedup rules, and issue-payload projection), so
// they're injected rather than hardcoded here — this module owns only the
// dedup/dispatch control flow shared by all three, not the domain logic.
//
// opts: { root, issuesPath, toolName, survivors } — survivors is the
// caller's own array of already-validated, fingerprinted findings.
// Returns { cache, payloads, seen } — cache is the mutated in-memory cache
// object (the caller still owns persisting it via its own writeCache),
// payloads is the array of issue payloads to emit, and seen is the Set of
// fingerprints processed this run (for the run-record's `fingerprints`
// field).
function dedupAndDispatch({
  root, issuesPath, toolName, survivors, readCache, decide, toIssuePayload,
}) {
  const cache = readCache(root);
  const issueIndex = loadIssueIndex(issuesPath, toolName);
  const payloads = [];
  const seen = new Set();
  for (const finding of survivors) {
    if (seen.has(finding.id)) continue;
    seen.add(finding.id);

    const decision = decide(finding, issueIndex, cache);
    if (decision.action === 'skip' || decision.action === 'suppress') continue;

    if (decision.action === 'file' || decision.action === 'reopen') {
      cache[finding.id] = decision.action === 'reopen'
        ? { status: 'regressed', issue: decision.issue || null, lastSeenMs: Date.now() }
        : { status: 'staged', lastSeenMs: Date.now() };
      payloads.push(toIssuePayload(finding));
    }
  }
  return { cache, payloads, seen };
}

module.exports = { dedupAndDispatch };
