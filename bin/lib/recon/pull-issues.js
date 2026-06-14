// bin/lib/recon/pull-issues.js
// Pure: parse `gh issue list --json number,title,body,labels` output into briefs.
// The SKILL.md runs gh and passes the parsed array as issuesJson — no network here.
'use strict';

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const FP_RE = /<!--\s*recon-fingerprint:\s*([^\s>]+)\s*-->/;
const SEV_LABEL_RE = /^recon:(critical|high|medium|low|info)$/;

function labelNames(issue) {
  return (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
}

function severityOf(names) {
  for (const n of names) {
    const m = SEV_LABEL_RE.exec(n);
    if (m) return m[1];
  }
  return 'info';
}

// opts: { label = 'recon', minSeverity?, issuesJson }. Returns brief[]:
// [{ number, title, body, fingerprint, severity }].
function pullReconIssues({ label = 'recon', minSeverity, issuesJson = [] } = {}) {
  const floor = minSeverity != null ? SEVERITY_RANK[minSeverity] : null;
  const briefs = [];
  for (const issue of issuesJson) {
    const names = labelNames(issue);
    if (!names.includes(label)) continue;

    const severity = severityOf(names);
    if (floor != null && (SEVERITY_RANK[severity] ?? SEVERITY_RANK.info) > floor) continue;

    const body = issue.body || '';
    const fpMatch = FP_RE.exec(body);
    briefs.push({
      number: issue.number,
      title: issue.title,
      body,
      fingerprint: fpMatch ? fpMatch[1] : null,
      severity,
    });
  }
  return briefs;
}

module.exports = { pullReconIssues, SEVERITY_RANK };
