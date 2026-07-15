// bin/lib/code-health/pull-issues.js
// Filters already-filed GitHub issues down to the ones matching --label/--min-severity,
// reading the same current work-record taxonomy readers every other health-skill consumer
// uses (bin/lib/issues/record.js) — origin via the by:<origin> label (parseRecordFacets),
// risk via the risk:<tier> label (3-tier, matching --min-risk's scale elsewhere in
// bin/code-health.js), fingerprint via the dual-marker work-fingerprint/legacy reader
// (extractFingerprint). Replaces the old generic bin/lib/issues/ingest.js path, which
// matched only the legacy code-health:(risk-)?<tier> label and code-health-fingerprint
// marker — none of which any current-format issue carries (toIssuePayloadV2 emits
// by:code-health + risk:<tier> + a work-fingerprint marker instead), so that path
// silently degraded to zero real results against real, currently-filed code-health issues.
'use strict';

const { parseRecordFacets, extractFingerprint } = require('../issues/record');
const { RISK_RANK } = require('./dedup');

// opts: { label = 'code-health', minSeverity?, issuesJson = [] }. Returns brief[]:
// [{ number, title, body, fingerprint, severity }].
//
// `label` matches the record's `origin` facet (the by:<origin> label), not a raw label
// name — default 'code-health' selects issues carrying by:code-health. `severity` is the
// record's risk:<tier> facet (low/medium/high); the field name is kept as `severity` for
// backward compatibility with existing callers of the brief shape, not because this is a
// distinct scale from risk. An issue with no risk:<tier> label ranks as the least-urgent
// tier ('low') for floor comparison — every current-format code-health issue carries one
// (toIssuePayloadV2 always scores a risk before filing), so this only matters for a
// malformed/hand-edited issue.
function pullReconIssues({ label = 'code-health', minSeverity, issuesJson = [] } = {}) {
  const floor = minSeverity != null ? RISK_RANK[minSeverity] : null;
  const briefs = [];
  for (const issue of issuesJson) {
    const facets = parseRecordFacets(issue.labels);
    if (label && facets.origin !== label) continue;

    const severity = facets.risk;
    const rank = severity != null ? RISK_RANK[severity] : undefined;
    if (floor != null && (rank ?? RISK_RANK.low) > floor) continue;

    const body = issue.body || '';
    briefs.push({
      number: issue.number,
      title: issue.title,
      body,
      fingerprint: extractFingerprint(body),
      severity,
    });
  }
  return briefs;
}

module.exports = { pullReconIssues };
