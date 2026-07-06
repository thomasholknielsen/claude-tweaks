// Project a finding into a GitHub issue payload. Emit-only: this never calls
// the network. The skill hands the payload to the gh CLI itself.
// Body is /specify-shaped so promotion to a spec is near-zero translation, and
// carries a hidden fingerprint marker the dedup step re-extracts.
function toIssuePayload(finding) {
  const marker = `<!-- recon-fingerprint: ${finding.id} -->`;
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
    '_Filed by `/recon`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');

  return {
    title: finding.title,
    body,
    labels: ['recon', `recon:${finding.severity}`],
  };
}

// v2: body uses anchor (Current State), suggestedApproach (Deliverables), acceptance (Acceptance Criteria).
// Labels include the criterion.
function toIssuePayloadV2(finding) {
  const marker = `<!-- recon-fingerprint: ${finding.id} -->`;
  const relatedLines = Array.isArray(finding.relatedAnchors) && finding.relatedAnchors.length > 0
    ? ['', `Also affects: ${finding.relatedAnchors.map((a) => `\`${a}\``).join(', ')}`]
    : [];
  const body = [
    marker,
    '',
    `**Criterion:** ${finding.criterion} | **Severity:** ${finding.severity} | **Confidence:** ${finding.confidence} | **Area:** ${finding.areaId}`,
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
    '_Filed by `/recon`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');

  return {
    title: finding.title,
    body,
    labels: ['recon', `recon:${finding.severity}`, `recon:${finding.criterion}`],
  };
}

module.exports = { toIssuePayload, toIssuePayloadV2 };
