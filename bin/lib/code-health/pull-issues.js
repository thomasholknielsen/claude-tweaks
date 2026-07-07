// bin/lib/code-health/pull-issues.js
// Thin wrapper over bin/lib/issues/ingest.js — code-health's briefs are the generic
// ingestion with the `code-health` label default. Kept for the code-health.js CLI and
// existing consumers; SEVERITY_RANK re-exported for compatibility.
'use strict';

const { issuesToBriefs, SEVERITY_RANK } = require('../issues/ingest');

// opts: { label = 'code-health', minSeverity?, issuesJson }. Returns brief[]:
// [{ number, title, body, fingerprint, severity, shape }].
function pullReconIssues({ label = 'code-health', minSeverity, issuesJson = [] } = {}) {
  return issuesToBriefs({ issuesJson, label, minSeverity });
}

module.exports = { pullReconIssues, SEVERITY_RANK };
