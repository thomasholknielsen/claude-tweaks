'use strict';

// Project a finding into a GitHub issue payload. Emit-only — never calls the
// network. The skill hands the payload to the gh CLI itself.
// Label/marker/type assembly delegates to recordPayload (bin/lib/issues/record.js) — the
// shared work-record taxonomy (skills/_shared/work-record.md): origin by:harness-health,
// colon-form risk:*/size:* scoring, born-ready, Type task, work-fingerprint marker.
// fenceFor/fencedBlock (GitHub-fence-safe code-block wrapper) and
// CLASSIFICATION_SCORING (classification -> risk/size fold) also live in
// record.js — shared with docs-health/issue-payload.js rather than
// copy-pasted. kind: 'new-skill' never consults CLASSIFICATION_SCORING — it
// stays deliberately unscored (see below).
const {
  recordPayload, specShapedBody, CLASSIFICATION_SCORING, fencedBlock,
} = require('../issues/record');
const { buildRelatedBlocks } = require('../issues/related-blocks');

const ASSET_TYPE_LABELS = { skill: 'Skill', rule: 'Rule', 'claude-md': 'CLAUDE.md', 'design-artifact': 'Design Context', memory: 'Memory' };
const CATEGORY_LABELS = { drift: 'drift', 'template-conformance': 'structure', 'best-practice': 'best-practice' };

// verifiedAsOf (#117): the sha the sweep read this repo at, resolved ONCE per
// run by the caller (bin/harness-health.js, via health-core/read-commit.js)
// and threaded through here — never resolved inside this function. See
// specShapedBody's own verifiedAsOf doc in record.js for why.
// pluginVersion (#1840, optional): the running plugin's own version
// (`.claude-plugin/plugin.json` under CLAUDE_PLUGIN_ROOT), resolved ONCE per
// run by the same caller — same non-resolved-here convention as
// verifiedAsOf. Only ever combined with finding.templateSource, which the
// judge sets for a template-derived claude-md/rule finding in the
// template-conformance/best-practice categories; every other finding (a
// skill drift finding, a new-skill candidate) carries no templateSource and
// this parameter is simply unused for it.
function toIssuePayload(finding, verifiedAsOf, pluginVersion) {
  const isNewSkill = finding.kind === 'new-skill';
  const assetLabel = ASSET_TYPE_LABELS[finding.assetType] || finding.assetType;
  const categoryLabel = CATEGORY_LABELS[finding.category] || finding.category;

  const kindLine = isNewSkill
    ? `**New skill candidate** | **Confidence:** ${finding.confidence}`
    : `**${assetLabel}:** ${finding.target} | **Section:** ${finding.section} | **Category:** ${finding.category} | **Classification:** ${finding.classification} | **Confidence:** ${finding.confidence}`;

  // A removal has an empty newString by contract, so rendering it as a
  // "Proposed:" block would show an empty fence and read as a broken finding
  // rather than an intentional deletion. Name the action instead.
  const isRemoval = finding.intent === 'remove';
  let deliverables;
  if (isNewSkill) {
    deliverables = `Proposed new skill \`${finding.target}\`:\n\n${finding.proposedBody}`;
  } else if (isRemoval) {
    deliverables = `**Remove this content:**\n${fencedBlock(finding.oldString)}\n\n**Proposed:** delete it — nothing replaces it.`;
  } else {
    deliverables = `**Current:**\n${fencedBlock(finding.oldString || '(N/A — new content)')}\n\n**Proposed:**\n${fencedBlock(finding.newString)}`;
  }

  // #1840: a template-derived finding's Proposed block is a filing-time
  // snapshot of the origin template — nothing tells a builder that literally
  // by itself. When the judge set templateSource AND the caller supplied a
  // pluginVersion to stamp it at, name both in a Template: metadata line
  // (same convention as Verified-as-of) and open Deliverables with one
  // sentence saying so. Absent either input, behavior is byte-identical to
  // before this record (a skill drift finding never carries templateSource
  // at all, so it is never affected).
  const templateStamp = finding.templateSource && pluginVersion
    ? `${finding.templateSource} @ ${pluginVersion}`
    : undefined;
  if (templateStamp) {
    const snapshotSentence = `The Proposed block below is a snapshot of \`${finding.templateSource}\` as rendered at plugin version ${pluginVersion} — at build time, re-derive the replacement from the *installed* template and treat this fence as the intended shape, not the bytes.`;
    deliverables = `${snapshotSentence}\n\n${deliverables}`;
  }

  // Only ever populated for kind: "patch" findings — new-skill candidates have
  // no section to bundle by, so finding.relatedSections is always absent there.
  const relatedBlocks = buildRelatedBlocks(finding.relatedSections);

  const body = specShapedBody({
    header: kindLine,
    currentState: [...relatedBlocks, finding.reason],
    deliverables,
    acceptanceCriteria: finding.description,
    filedBy: '/claude-tweaks:harness-health',
    verifiedAsOf,
    templateStamp,
  });

  let title;
  if (isNewSkill) {
    title = `New skill candidate: ${finding.target}`;
  } else if (isRemoval) {
    title = `${assetLabel} ${categoryLabel}: retire dead content in ${finding.target} — ${finding.section}`;
  } else {
    title = `${assetLabel} ${categoryLabel}: ${finding.target} — ${finding.section}`;
  }

  const diagnosticLabel = isNewSkill ? 'harness-health:new-skill' : `harness-health:${finding.classification}`;
  // new-skill is unscored by design (no risk/size) — the gate flags "needs scoring"
  // rather than inheriting a guessed tier from a kind that carries no evidence for one.
  const scoring = isNewSkill ? undefined : CLASSIFICATION_SCORING[finding.classification];
  const risk = scoring?.risk;
  // The record facet is `size` (renamed from effort, #217), and
  // CLASSIFICATION_SCORING's second axis moved with it. Only the record side
  // was renamed — each health skill's own finding vocabulary is untouched
  // (harness-health folds `classification`; code-health's judge still emits
  // `finding.effort`, which its call site passes through as `size`).
  const size = scoring?.size;

  // No spread after this call — the final return below picks fields explicitly.
  const payload = recordPayload({
    title,
    body,
    type: 'task',
    origin: 'harness-health',
    risk,
    size,
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
    // fenced Current/Proposed (or Remove-this-content) blocks composed above,
    // and that markdown is what actually ships to GitHub. Carrying them twice
    // made a payload with ~2.6 KB of patch text 38% duplicate bytes, uncapped
    // across the findings array. Matches docs-health/journey-health/code-health.
    // Anything needing the patch text reads it out of `body`. (kind "new-skill"
    // never had them — it carries proposedBody in the body instead.)
    //
    // intent stays: it is a 1-word classification, not duplicated content, and
    // it is the ONLY top-level signal distinguishing a deletion from a
    // replacement now that newString is gone — a consumer can no longer infer
    // "removal" from an empty newString, so dropping this too would lose
    // information rather than just de-duplicate it.
    intent: finding.intent,
    relatedSections: finding.relatedSections,
    title: payload.title,
    body: payload.body,
    labels: [...payload.labels, diagnosticLabel],
    type: payload.type,
  };
}

module.exports = { toIssuePayload };
