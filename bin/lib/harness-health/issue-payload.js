'use strict';

// Project a finding into a GitHub issue payload. Emit-only — never calls the
// network. The skill hands the payload to the gh CLI itself.

const ASSET_TYPE_LABELS = { skill: 'Skill', rule: 'Rule', 'claude-md': 'CLAUDE.md' };
const CATEGORY_LABELS = { drift: 'drift', 'template-conformance': 'structure', 'best-practice': 'best-practice' };

function toIssuePayload(finding) {
  const marker = `<!-- harness-health-fingerprint: ${finding.id} -->`;
  const assetLabel = ASSET_TYPE_LABELS[finding.assetType] || finding.assetType;
  const categoryLabel = CATEGORY_LABELS[finding.category] || finding.category;

  const kindLine = finding.kind === 'new-skill'
    ? `**New skill candidate** | **Confidence:** ${finding.confidence}`
    : `**${assetLabel}:** ${finding.target} | **Section:** ${finding.section} | **Category:** ${finding.category} | **Classification:** ${finding.classification} | **Confidence:** ${finding.confidence}`;

  const deliverables = finding.kind === 'new-skill'
    ? `Proposed new skill \`${finding.target}\`:\n\n${finding.proposedBody}`
    : `**Current:**\n\`\`\`\n${finding.oldString || '(N/A — new content)'}\n\`\`\`\n\n**Proposed:**\n\`\`\`\n${finding.newString}\n\`\`\``;

  const body = [
    marker,
    '',
    kindLine,
    '',
    '## Current State',
    '',
    finding.reason,
    '',
    '## Deliverables',
    '',
    deliverables,
    '',
    '## Acceptance Criteria',
    '',
    finding.description,
    '',
    '_Filed by `/claude-tweaks:harness-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');

  const title = finding.kind === 'new-skill'
    ? `New skill candidate: ${finding.target}`
    : `${assetLabel} ${categoryLabel}: ${finding.target} — ${finding.section}`;

  return {
    id: finding.id,
    kind: finding.kind,
    target: finding.target,
    assetType: finding.assetType,
    category: finding.category,
    section: finding.section,
    classification: finding.classification,
    confidence: finding.confidence,
    reversibility: finding.reversibility,
    oldString: finding.oldString,
    newString: finding.newString,
    title,
    body,
    labels: ['harness-health', finding.kind === 'new-skill' ? 'harness-health:new-skill' : `harness-health:${finding.classification}`],
  };
}

module.exports = { toIssuePayload };
