'use strict';

// Project a finding into a GitHub issue payload. Emit-only — never calls the
// network. The skill hands the payload to the gh CLI itself.

const CATEGORY_LABELS = { drift: 'drift', coverage: 'coverage', 'regression-suspected': 'regression' };

function toIssuePayload(finding) {
  const marker = `<!-- journey-health-fingerprint: ${finding.id} -->`;
  const categoryLabel = CATEGORY_LABELS[finding.category] || finding.category;

  const body = [
    marker,
    '',
    `**Journey:** ${finding.journey} | **Section:** ${finding.section} | **Category:** ${finding.category} | **Severity:** ${finding.severity} | **Confidence:** ${finding.confidence}`,
    '',
    '## Description',
    '',
    finding.description,
    '',
    '## Evidence',
    '',
    finding.reason,
    '',
    '## Recommended Action',
    '',
    finding.recommendation,
    '',
    '_Filed by `/claude-tweaks:journey-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');

  const title = `Journey ${categoryLabel}: ${finding.journey} — ${finding.section}`;

  return {
    id: finding.id,
    journey: finding.journey,
    category: finding.category,
    section: finding.section,
    severity: finding.severity,
    confidence: finding.confidence,
    title,
    body,
    labels: ['journey-health', `journey-health:${finding.category}`, `journey-health:${finding.severity}`],
  };
}

module.exports = { toIssuePayload };
