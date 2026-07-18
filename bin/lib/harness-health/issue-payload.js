'use strict';

// Project a finding into a GitHub issue payload. Emit-only — never calls the
// network. The skill hands the payload to the gh CLI itself.
// Label/marker/type assembly delegates to recordPayload (bin/lib/issues/record.js) — the
// shared work-record taxonomy (skills/_shared/work-record.md): origin by:harness-health,
// colon-form risk:*/effort:* scoring, born-ready, Type task, work-fingerprint marker.
const { recordPayload, specShapedBody } = require('../issues/record');

const ASSET_TYPE_LABELS = { skill: 'Skill', rule: 'Rule', 'claude-md': 'CLAUDE.md', 'design-artifact': 'Design Context', memory: 'Memory' };
const CATEGORY_LABELS = { drift: 'drift', 'template-conformance': 'structure', 'best-practice': 'best-practice' };

// classification -> scoring axis fold (spec 15): additive is a safe, mechanical
// patch (low risk, low effort); restructural needs human review and more effort.
// kind: 'new-skill' never consults this map — it stays deliberately unscored (see below).
const CLASSIFICATION_SCORING = {
  additive: { risk: 'low', effort: 'low' },
  restructural: { risk: 'medium', effort: 'high' },
};

function toIssuePayload(finding) {
  const isNewSkill = finding.kind === 'new-skill';
  const assetLabel = ASSET_TYPE_LABELS[finding.assetType] || finding.assetType;
  const categoryLabel = CATEGORY_LABELS[finding.category] || finding.category;

  const kindLine = isNewSkill
    ? `**New skill candidate** | **Confidence:** ${finding.confidence}`
    : `**${assetLabel}:** ${finding.target} | **Section:** ${finding.section} | **Category:** ${finding.category} | **Classification:** ${finding.classification} | **Confidence:** ${finding.confidence}`;

  const deliverables = isNewSkill
    ? `Proposed new skill \`${finding.target}\`:\n\n${finding.proposedBody}`
    : `**Current:**\n\`\`\`\n${finding.oldString || '(N/A — new content)'}\n\`\`\`\n\n**Proposed:**\n\`\`\`\n${finding.newString}\n\`\`\``;

  // Only ever populated for kind: "patch" findings — new-skill candidates have
  // no section to bundle by, so finding.relatedSections is always absent there.
  const relatedBlocks = Array.isArray(finding.relatedSections) && finding.relatedSections.length > 0
    ? [`Also affects: ${finding.relatedSections.map((s) => `\`${s}\``).join(', ')}`]
    : [];

  const body = specShapedBody({
    header: kindLine,
    currentState: [...relatedBlocks, finding.reason],
    deliverables,
    acceptanceCriteria: finding.description,
    filedBy: '/claude-tweaks:harness-health',
  });

  const title = isNewSkill
    ? `New skill candidate: ${finding.target}`
    : `${assetLabel} ${categoryLabel}: ${finding.target} — ${finding.section}`;

  const diagnosticLabel = isNewSkill ? 'harness-health:new-skill' : `harness-health:${finding.classification}`;
  // new-skill is unscored by design (no risk/effort) — the gate flags "needs scoring"
  // rather than inheriting a guessed tier from a kind that carries no evidence for one.
  const scoring = isNewSkill ? undefined : CLASSIFICATION_SCORING[finding.classification];
  const risk = scoring?.risk;
  const effort = scoring?.effort;

  // No spread after this call — the final return below picks fields explicitly.
  const payload = recordPayload({
    title,
    body,
    type: 'task',
    origin: 'harness-health',
    risk,
    effort,
    ready: true,
    fingerprint: finding.id,
  });

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
    relatedSections: finding.relatedSections,
    title: payload.title,
    body: payload.body,
    labels: [...payload.labels, diagnosticLabel],
    type: payload.type,
  };
}

module.exports = { toIssuePayload };
