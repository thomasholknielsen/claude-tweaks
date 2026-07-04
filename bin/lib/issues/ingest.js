// bin/lib/issues/ingest.js
// Pure: turn `gh issue list/view --json number,title,body,labels` output into
// pipeline briefs for any selector (--from-issues, --from-label, --from-recon).
// The SKILL.md runs gh and passes the parsed array — no network here.
// Contract: skills/_shared/issue-claims.md; consumed by skills/flow/from-recon.md.
'use strict';

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const FP_RE = /<!--\s*recon-fingerprint:\s*([^\s>]+)\s*-->/;
const SEV_LABEL_RE = /^recon:(critical|high|medium|low|info)$/;
// GitHub issue forms render textarea labels as ### headings; recon writes ##.
const SECTION_RES = [
  /^###?\s+Current State\s*$/m,
  /^###?\s+Deliverables\s*$/m,
  /^###?\s+Acceptance Criteria\s*$/m,
];

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

function isFormShaped(body) {
  if (typeof body !== 'string' || !body) return false;
  return SECTION_RES.every((re) => re.test(body));
}

// opts: { issuesJson = [], label?, numbers?, minSeverity?, requireLabels? }. Returns brief[]:
// [{ number, title, body, fingerprint, severity, shape }].
function issuesToBriefs({ issuesJson = [], label, numbers, minSeverity, requireLabels } = {}) {
  const floor = minSeverity != null ? SEVERITY_RANK[minSeverity] : null;
  const wanted = numbers != null ? new Set(numbers) : null;
  const briefs = [];
  for (const issue of issuesJson) {
    if (wanted && !wanted.has(issue.number)) continue;
    const names = labelNames(issue);
    if (label && !names.includes(label)) continue;
    if (requireLabels && requireLabels.length && !requireLabels.every((r) => names.includes(r))) continue;

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
      shape: isFormShaped(body) ? 'form' : 'freeform',
    });
  }
  return briefs;
}

module.exports = { issuesToBriefs, isFormShaped, SEVERITY_RANK };
