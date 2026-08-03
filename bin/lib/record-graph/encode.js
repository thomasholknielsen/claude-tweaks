// bin/lib/record-graph/encode.js
// Pure: the six-axis visual-encoding contract from
// docs/superpowers/specs/2026-08-03-visualize-record-graph-design.md. One
// record in, one {fillKey, borderStyle, badges} out — every renderer (D2, SVG)
// reads exclusively from this shape, never from the raw record again.
'use strict';

const { TYPE_LABELS, normalizeLabelNames } = require('../issues/record');

const TITLE_MAX = 40;
const RECOGNIZED_TYPES = TYPE_LABELS.map(([label]) => label.split(':')[1]);

function truncateTitle(title, max = TITLE_MAX) {
  const text = typeof title === 'string' ? title : '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Native Issue Type (facets don't carry this — see facet-shape.js's own note
// that Type has no shared-facet analog) takes precedence over a type:* label,
// since a project could carry a stale label after switching work-types: native.
function typeOf(record) {
  const native = record.issueType;
  if (native && typeof native === 'object' && typeof native.name === 'string') {
    const name = native.name.toLowerCase();
    return RECOGNIZED_TYPES.includes(name) ? name : null;
  }
  const names = normalizeLabelNames(record.labels);
  for (const [label] of TYPE_LABELS) {
    if (names.includes(label)) return label.split(':')[1];
  }
  return null;
}

function scoringBadge(facets) {
  if (facets.risk == null && facets.effort == null) return null;
  return `R:${facets.risk || '?'} E:${facets.effort || '?'}`;
}

function badgesFor(record) {
  const badges = [];
  const type = typeOf(record);
  if (type) badges.push(`[${type}]`);
  const scoring = scoringBadge(record.facets);
  if (scoring) badges.push(scoring);
  if (record.facets.grants.build) badges.push('AUTO-BUILD');
  if (record.facets.grants.merge) badges.push('AUTO-MERGE');
  if (record.facets.acceptance) badges.push(`demo:${record.facets.acceptance}`);
  return badges;
}

function borderStyleFor(bot) {
  if (bot.blocked) return 'blocked';
  if (bot.inProgress) return 'in-progress';
  return 'default';
}

function encodeRecord(record) {
  return {
    number: record.number,
    title: truncateTitle(record.title),
    fillKey: record.facets.origin || 'human',
    borderStyle: borderStyleFor(record.facets.bot),
    badges: badgesFor(record),
  };
}

module.exports = { encodeRecord };
