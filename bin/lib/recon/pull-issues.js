// bin/lib/recon/pull-issues.js
// Thin wrapper over bin/lib/issues/ingest.js — recon's briefs are the generic
// ingestion with the `recon` label default. Kept for the recon.js CLI and
// existing consumers; SEVERITY_RANK re-exported for compatibility.
'use strict';

const { issuesToBriefs, SEVERITY_RANK } = require('../issues/ingest');

// opts: { label = 'recon', minSeverity?, issuesJson }. Returns brief[]:
// [{ number, title, body, fingerprint, severity, shape }].
function pullReconIssues({ label = 'recon', minSeverity, issuesJson = [] } = {}) {
  return issuesToBriefs({ issuesJson, label, minSeverity });
}

module.exports = { pullReconIssues, SEVERITY_RANK };
