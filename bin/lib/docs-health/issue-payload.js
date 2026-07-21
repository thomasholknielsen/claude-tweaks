'use strict';

// Project a finding into a GitHub issue payload. Emit-only — never calls
// the network. The skill hands the payload to the gh CLI itself.
// Label/marker/type assembly delegates to recordPayload
// (bin/lib/issues/record.js) — the shared work-record taxonomy
// (skills/_shared/work-record.md): origin by:docs-health, colon-form
// risk:*/effort:* scoring, born-ready, Type task, work-fingerprint marker.
// fenceFor/fencedBlock (GitHub-fence-safe code-block wrapper) and
// CLASSIFICATION_SCORING (classification -> risk/effort fold) also live in
// record.js — shared with harness-health/issue-payload.js rather than
// copy-pasted.
const {
  recordPayload, specShapedBody, CLASSIFICATION_SCORING, fencedBlock,
} = require('../issues/record');
const { buildRelatedBlocks } = require('../issues/related-blocks');

const CATEGORY_LABELS = {
  'genre-drift': 'genre-drift', staleness: 'staleness', 'depth-mismatch': 'depth-mismatch', findability: 'findability',
};

const MISLEADS_LABELS = {
  human: 'human engineer',
  agent: 'coding agent',
  both: 'human engineer + coding agent',
};

function toIssuePayload(finding) {
  const categoryLabel = CATEGORY_LABELS[finding.category] || finding.category;
  const misleadsLabel = MISLEADS_LABELS[finding.misleads] || finding.misleads;

  const kindLine = `**Doc:** ${finding.target} | **Section:** ${finding.section} | **Category:** ${finding.category} | **Misleads:** ${misleadsLabel} | **Classification:** ${finding.classification} | **Confidence:** ${finding.confidence}`;

  const deliverables = `**Current:**\n${fencedBlock(finding.oldString || '(N/A — new content)')}\n\n**Proposed:**\n${fencedBlock(finding.newString)}`;

  // Only ever populated when multiple findings in one doc audit share the same
  // root cause — see the "Bundling rule" in skills/docs-health/SKILL.md Step 3.
  const relatedBlocks = buildRelatedBlocks(finding.relatedSections);

  const body = specShapedBody({
    header: kindLine,
    currentState: [...relatedBlocks, finding.reason],
    deliverables,
    acceptanceCriteria: finding.description,
    filedBy: '/claude-tweaks:docs-health',
  });

  const title = `Doc ${categoryLabel}: ${finding.target} — ${finding.section}`;
  const diagnosticLabel = `docs-health:${finding.classification}`;
  // Guard with optional chaining, matching harness-health/issue-payload.js's
  // identical CLASSIFICATION_SCORING lookup — an unmapped classification
  // (a future value added to docs-health's own CLASSIFICATION_VALUES without
  // a matching CLASSIFICATION_SCORING entry) must degrade to risk/effort:
  // undefined (recordPayload's `if (risk !== undefined)` guard simply omits
  // the label), not throw and abort the whole validate-findings batch.
  const scoring = CLASSIFICATION_SCORING[finding.classification];
  const risk = scoring?.risk;
  const effort = scoring?.effort;

  const payload = recordPayload({
    title,
    body,
    type: 'task',
    origin: 'docs-health',
    risk,
    effort,
    ready: true,
    fingerprint: finding.id,
  });

  return {
    id: finding.id,
    target: finding.target,
    assetType: finding.assetType,
    category: finding.category,
    misleads: finding.misleads,
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
