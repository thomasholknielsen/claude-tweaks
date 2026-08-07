'use strict';

// The Origin axis has three states (see skills/_shared/work-record.md):
//   producer    — one of record.js's ORIGINS, carried as a by:* label
//   side-effect — a record created by another skill's flow, carried as an
//                 `Origin: {context}` body line with deliberately no label
//   human       — neither signal; absence IS the signal
// This module reads that axis. It never writes one, and never extends ORIGINS.
const { ORIGINS } = require('./record.js');

const BY_LABEL = /^by:(.+)$/;
// Anchored to line start so prose describing the convention is not mistaken
// for a provenance claim.
const ORIGIN_LINE = /^Origin:[ \t]*(.+?)[ \t]*$/m;
// A trailing source reference makes the context per-record unique, which would
// explode the class count and give every cell a sample size of one.
const TRAILING_SOURCE = /\s+from\s+(#\d+|session recall)$/i;
// Truncate long prose at a clause boundary (comma or period followed by
// whitespace/end-of-string), then cap at 60 characters to normalize legacy
// records that differ only in trailing details (e.g., "captured 2026-06-14"
// vs "captured 2026-06-13"). Must NOT break on periods inside contexts like
// "Phase 8.5" or inside filenames like ".md'," — the boundary requires
// whitespace or string end after the punctuation.
const CLAUSE_BOUNDARY = /^(.*?)[,.](?=[ \t\n]|$)/;

function resolveProvenance({ labels, body } = {}) {
  const names = Array.isArray(labels) ? labels : [];
  for (const name of names) {
    const match = BY_LABEL.exec(name);
    if (match && ORIGINS.includes(match[1])) {
      return { kind: 'producer', source: match[1] };
    }
  }

  const line = ORIGIN_LINE.exec(typeof body === 'string' ? body : '');
  if (line) {
    let source = line[1].replace(TRAILING_SOURCE, '').trim();
    // Truncate at clause boundaries (comma or period + whitespace/EOS) to
    // normalize long prose descriptions. Then lowercase and cap at 60 chars.
    const clauseMatch = CLAUSE_BOUNDARY.exec(source);
    if (clauseMatch) {
      source = clauseMatch[1];
    }
    source = source.toLowerCase().slice(0, 60);
    if (source) return { kind: 'side-effect', source };
  }

  return { kind: 'human', source: 'human' };
}

module.exports = { resolveProvenance, PRODUCERS: ORIGINS };
