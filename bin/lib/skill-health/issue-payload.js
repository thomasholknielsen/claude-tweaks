'use strict';

// Project a finding into a GitHub issue payload. Emit-only — never calls the
// network. The skill hands the payload to the gh CLI itself.
function toIssuePayload(finding) {
  const marker = `<!-- skill-health-fingerprint: ${finding.id} -->`;
  const kindLine = finding.kind === 'new-skill'
    ? `**New skill candidate** | **Confidence:** ${finding.confidence}`
    : `**Skill:** ${finding.skill} | **Section:** ${finding.section} | **Classification:** ${finding.classification} | **Confidence:** ${finding.confidence}`;

  const deliverables = finding.kind === 'new-skill'
    ? `Proposed new skill \`${finding.skill}\`:\n\n${finding.proposedBody}`
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
    '_Filed by `/claude-tweaks:skill-health`. Close to resolve; label `wontfix` to suppress future reports of this finding._',
  ].join('\n');

  return {
    title: finding.kind === 'new-skill'
      ? `New skill candidate: ${finding.skill}`
      : `Skill drift: ${finding.skill} — ${finding.section}`,
    body,
    labels: ['skill-health', finding.kind === 'new-skill' ? 'skill-health:new-skill' : `skill-health:${finding.classification}`],
  };
}

module.exports = { toIssuePayload };
