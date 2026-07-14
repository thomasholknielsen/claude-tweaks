'use strict';

// Project a finding into a GitHub issue payload. Emit-only — never calls the
// network. The skill hands the payload to the gh CLI itself.
// Label/marker/type assembly delegates to recordPayload (bin/lib/issues/record.js) — the
// shared work-record taxonomy (skills/_shared/work-record.md): origin by:journey-health,
// colon-form risk:*/effort:medium scoring, born-ready, Type bug|task, work-fingerprint marker.
const { recordPayload } = require('../issues/record');

const CATEGORY_LABELS = { drift: 'drift', coverage: 'coverage', 'regression-suspected': 'regression' };

// severity -> risk axis fold (spec 15): journey-health's severity vocabulary (high/med/low)
// folds onto the shared risk tier vocabulary (high/medium/low) — 'med' is the one spelling
// difference. validate-finding.js's SEVERITY_VALUES already restricts finding.severity to
// exactly these three keys before a finding ever reaches this function through the real
// validate-findings pipeline, so a lookup miss is unreachable there. For a direct/bypassing
// caller, a lookup miss resolves to `undefined`, which recordPayload treats as "risk not
// supplied" (same as harness-health's unscored new-skill findings) rather than throwing —
// there is no local pre-validation or default fallback here on purpose.
const SEVERITY_TO_RISK = { high: 'high', med: 'medium', low: 'low' };

function toIssuePayload(finding) {
  const categoryLabel = CATEGORY_LABELS[finding.category] || finding.category;

  const body = [
    `**Journey:** ${finding.journey} | **Section:** ${finding.section} | **Category:** ${finding.category} | **Severity:** ${finding.severity} | **Confidence:** ${finding.confidence}`,
    '',
    '## Current State',
    '',
    finding.description,
    '',
    finding.reason,
    '',
    '## Deliverables',
    '',
    finding.recommendation,
    '',
    '## Acceptance Criteria',
    '',
    `The condition described above is resolved: a fresh \`/claude-tweaks:journey-health\` audit of journey '${finding.journey}' files no finding with this fingerprint.`,
    '',
    '_Filed by `/claude-tweaks:journey-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');

  const title = `Journey ${categoryLabel}: ${finding.journey} — ${finding.section}`;
  // Type rule: a regression-suspected finding means the journey/story text is accurate and
  // the implementation broke (a defect); drift/coverage findings are documentation/coverage
  // maintenance, not a defect.
  const type = finding.category === 'regression-suspected' ? 'bug' : 'task';
  const diagnosticLabel = `journey-health:${finding.category}`;

  // No spread after this call — the final return below picks fields explicitly.
  const payload = recordPayload({
    title,
    body,
    type,
    origin: 'journey-health',
    risk: SEVERITY_TO_RISK[finding.severity],
    effort: 'medium',
    ready: true,
    fingerprint: finding.id,
  });

  return {
    id: finding.id,
    journey: finding.journey,
    category: finding.category,
    section: finding.section,
    severity: finding.severity,
    confidence: finding.confidence,
    title: payload.title,
    body: payload.body,
    labels: [...payload.labels, diagnosticLabel],
    type: payload.type,
  };
}

module.exports = { toIssuePayload };
