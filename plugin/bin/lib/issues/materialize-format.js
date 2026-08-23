// bin/lib/issues/materialize-format.js
// Pure: the shape gate, the Surface/Design-intent/Design-seed lift, and the
// pinned-header composition documented in skills/flow/materialize.md. No
// network — bin/materialize.js does the gh/local-store fetch and the file
// write; this module is what both that CLI and its tests import so the
// header format has exactly one implementation instead of a copy per caller.
'use strict';

const REQUIRED_SECTIONS = ['## Current State', '## Deliverables', '## Acceptance Criteria'];
const PLACEHOLDER_RE = /\bTBD\b|\bTODO\b|<!--\s*ambiguity:/;

// body -> the text of section `## {name}` up to the next `## ` heading (or
// end of body). null when the heading itself is absent.
function sectionText(body, name) {
  const heading = `## ${name}`;
  const start = body.indexOf(heading);
  if (start === -1) return null;
  const afterHeading = start + heading.length;
  const nextHeadingRel = body.slice(afterHeading).search(/\n## /);
  const end = nextHeadingRel === -1 ? body.length : afterHeading + nextHeadingRel;
  return body.slice(afterHeading, end).trim();
}

// body -> { ok: true } | { ok: false, missing: string[] }. `missing` names
// every failing section by its plain name ("Current State", not "## Current
// State") plus, when present, the string 'unresolved-placeholder' — the same
// gate materialize.md's "Materialization hard gate" describes: every
// section present and non-empty, no TBD/TODO/<!-- ambiguity: marker anywhere.
function shapeGate(body) {
  const text = typeof body === 'string' ? body : '';
  const missing = [];
  for (const heading of REQUIRED_SECTIONS) {
    const name = heading.replace('## ', '');
    const section = sectionText(text, name);
    if (section === null || section.length === 0) missing.push(name);
  }
  if (PLACEHOLDER_RE.test(text)) missing.push('unresolved-placeholder');
  return missing.length ? { ok: false, missing } : { ok: true, missing: [] };
}

// body -> { surface?, designIntent?, uiStack?, designSeed? } — read from the leading
// metadata block (every line before the first blank line). Legacy `Surface:
// frontend` reads as `web`; `Surface: mixed` is retired and passed through
// unchanged (materialize.md: a record still declaring it needs re-shaping,
// not a value this module silently rewrites).
function liftMetadata(body) {
  const text = typeof body === 'string' ? body : '';
  const blankAt = text.indexOf('\n\n');
  const block = blankAt === -1 ? text : text.slice(0, blankAt);
  const out = {};
  const surfaceMatch = /^Surface:\s*(\S+)/m.exec(block);
  if (surfaceMatch) out.surface = surfaceMatch[1] === 'frontend' ? 'web' : surfaceMatch[1];
  const intentMatch = /^Design-intent:\s*(\S+)/m.exec(block);
  if (intentMatch) out.designIntent = intentMatch[1];
  const uiStackMatch = /^Ui-stack:\s*(.+)$/m.exec(block);
  if (uiStackMatch) out.uiStack = uiStackMatch[1].trim();
  const seedMatch = /^Design-seed:\s*(\S+)/m.exec(block);
  if (seedMatch) out.designSeed = seedMatch[1];
  return out;
}

// fields -> the YAML frontmatter block (including the --- delimiters), per
// materialize.md's "The pinned header format". `ceremony` and `grants` are
// always emitted (never omitted, even when grants is empty); every other
// field is omitted when its value is null/undefined/empty.
function composeHeader({ record, origin, risk, size, ceremony, grants, fingerprint, blockedBy, surface, designIntent, uiStack, designSeed, parkedAtShaping }) {
  const lines = ['---', `record: ${record}`, `origin: ${origin}`];
  if (risk) lines.push(`risk: ${risk}`);
  if (size) lines.push(`size: ${size}`);
  lines.push(`ceremony: ${ceremony}`);
  const grantList = [];
  if (grants && grants.build) grantList.push('build');
  if (grants && grants.merge) grantList.push('merge');
  lines.push(`grants: [${grantList.join(', ')}]`);
  if (fingerprint) lines.push(`fingerprint: ${fingerprint}`);
  if (Array.isArray(blockedBy) && blockedBy.length) lines.push(`blocked-by: [${blockedBy.join(', ')}]`);
  if (surface) lines.push(`surface: ${surface}`);
  if (designIntent) lines.push(`design-intent: ${designIntent}`);
  if (uiStack) lines.push(`ui-stack: ${uiStack}`);
  if (designSeed) lines.push(`design-seed: ${designSeed}`);
  if (parkedAtShaping) lines.push('parked-at-shaping: true');
  lines.push('---');
  return lines.join('\n');
}

// { header, n, title, body } -> the full materialized file text.
function composeFile({ header, n, title, body }) {
  return `${header}\n# ${n}: ${title}\n\n${body}\n`;
}

module.exports = { REQUIRED_SECTIONS, sectionText, shapeGate, liftMetadata, composeHeader, composeFile };
