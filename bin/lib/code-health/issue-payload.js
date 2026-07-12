// Project a finding into a GitHub issue payload. Emit-only: this never calls
// the network. The skill hands the payload to the gh CLI itself.
// Body is /specify-shaped so promotion to a spec is near-zero translation, and
// carries a hidden fingerprint marker the dedup step re-extracts.
function toIssuePayload(finding) {
  const marker = `<!-- code-health-fingerprint: ${finding.id} -->`;
  const filesLine = (finding.files || []).length ? (finding.files || []).join(', ') : '(no specific file)';
  const body = [
    marker,
    '',
    `**Lens:** ${finding.lens} | **Severity:** ${finding.severity} | **Confidence:** ${finding.confidence} | **Area:** ${finding.area}`,
    '',
    '## Current State',
    '',
    `Files: ${filesLine}`,
    '',
    finding.evidence,
    '',
    '## Deliverables',
    '',
    finding.suggestion,
    '',
    '## Acceptance Criteria',
    '',
    finding.acceptance,
    '',
    '_Filed by `/code-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');

  return {
    title: finding.title,
    body,
    labels: ['code-health', `code-health:${finding.severity}`],
  };
}

// v2: body uses anchor (Current State), suggestedApproach (Deliverables), acceptance (Acceptance Criteria).
// The criterion is not a label — it's already in the body's header line; nothing reads
// it back off a label, and per-criterion labels are the class that hit GitHub's 100-char cap.
function toIssuePayloadV2(finding) {
  const marker = `<!-- code-health-fingerprint: ${finding.id} -->`;
  const relatedLines = Array.isArray(finding.relatedAnchors) && finding.relatedAnchors.length > 0
    ? ['', `Also affects: ${finding.relatedAnchors.map((a) => `\`${a}\``).join(', ')}`]
    : [];
  const body = [
    marker,
    '',
    `**Criterion:** ${finding.criterion} | **Risk:** ${finding.risk} | **Severity:** ${finding.severity} | **Likelihood:** ${finding.likelihood} | **Effort:** ${finding.effort} | **Confidence:** ${finding.confidence} | **Area:** ${finding.areaId}`,
    '',
    '## Current State',
    '',
    `Anchor: \`${finding.anchor}\``,
    ...relatedLines,
    '',
    finding.evidence,
    '',
    '## Deliverables',
    '',
    finding.suggestedApproach,
    '',
    '## Acceptance Criteria',
    '',
    finding.acceptance,
    '',
    '_Filed by `/code-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');

  return {
    title: finding.title,
    body,
    labels: ['code-health', `code-health:risk-${finding.risk}`, `code-health:effort-${finding.effort}`],
  };
}

module.exports = { toIssuePayload, toIssuePayloadV2 };
