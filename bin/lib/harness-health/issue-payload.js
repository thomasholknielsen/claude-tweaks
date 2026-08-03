'use strict';

// Project a finding into a GitHub issue payload. Emit-only — never calls the
// network. The skill hands the payload to the gh CLI itself.
// Label/marker/type assembly delegates to recordPayload (bin/lib/issues/record.js) — the
// shared work-record taxonomy (skills/_shared/work-record.md): origin by:harness-health,
// colon-form risk:*/effort:* scoring, born-ready, Type task, work-fingerprint marker.
// fenceFor/fencedBlock (GitHub-fence-safe code-block wrapper) and
// CLASSIFICATION_SCORING (classification -> risk/effort fold) also live in
// record.js — shared with docs-health/issue-payload.js rather than
// copy-pasted. kind: 'new-skill' never consults CLASSIFICATION_SCORING — it
// stays deliberately unscored (see below).
const {
  recordPayload, specShapedBody, CLASSIFICATION_SCORING, fencedBlock,
} = require('../issues/record');
const { buildRelatedBlocks } = require('../issues/related-blocks');

const ASSET_TYPE_LABELS = { skill: 'Skill', rule: 'Rule', 'claude-md': 'CLAUDE.md', 'design-artifact': 'Design Context', memory: 'Memory' };
const CATEGORY_LABELS = { drift: 'drift', 'template-conformance': 'structure', 'best-practice': 'best-practice' };

function toIssuePayload(finding) {
  const isNewSkill = finding.kind === 'new-skill';
  const assetLabel = ASSET_TYPE_LABELS[finding.assetType] || finding.assetType;
  const categoryLabel = CATEGORY_LABELS[finding.category] || finding.category;

  const kindLine = isNewSkill
    ? `**New skill candidate** | **Confidence:** ${finding.confidence}`
    : `**${assetLabel}:** ${finding.target} | **Section:** ${finding.section} | **Category:** ${finding.category} | **Classification:** ${finding.classification} | **Confidence:** ${finding.confidence}`;

  const deliverables = isNewSkill
    ? `Proposed new skill \`${finding.target}\`:\n\n${finding.proposedBody}`
    : `**Current:**\n${fencedBlock(finding.oldString || '(N/A — new content)')}\n\n**Proposed:**\n${fencedBlock(finding.newString)}`;

  // Only ever populated for kind: "patch" findings — new-skill candidates have
  // no section to bundle by, so finding.relatedSections is always absent there.
  const relatedBlocks = buildRelatedBlocks(finding.relatedSections);

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
    // oldString/newString are deliberately NOT surfaced as top-level payload
    // fields: for kind "patch", `body` already carries both verbatim via the
    // fenced Current/Proposed blocks composed above, and that markdown is what
    // actually ships to GitHub. Carrying them twice made a payload with
    // ~2.6 KB of patch text 38% duplicate bytes, uncapped across the findings
    // array. Matches docs-health/journey-health/code-health. Anything needing
    // the patch text reads it out of `body`. (kind "new-skill" never had them
    // — it carries proposedBody in the body instead.)
    relatedSections: finding.relatedSections,
    title: payload.title,
    body: payload.body,
    labels: [...payload.labels, diagnosticLabel],
    type: payload.type,
  };
}

module.exports = { toIssuePayload };
