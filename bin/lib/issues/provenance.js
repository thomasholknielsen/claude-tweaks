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
// explode the class count and give every cell a sample size of one. This is
// stripped AFTER clause truncation so that trailing punctuation doesn't defeat
// the pattern (e.g., "from #42." still matches).
const TRAILING_SOURCE = /\s+from\s+(#\d+|session recall)$/i;

const MAX_SOURCE_LENGTH = 60;
// Sentinel for unstructured overflow. Angle brackets cannot appear in normalized
// prose (lowercased), so this is unforgeable — a real Origin line reading
// exactly "<unstructured>" would be extremely unusual, and normalizing any such
// genuine context to this sentinel is the correct behavior.
const UNSTRUCTURED_SENTINEL = '<unstructured>';

// Truncate at the first clause boundary (comma or period at bracket depth zero,
// followed by whitespace or end-of-string) to normalize legacy records that
// differ only in trailing details (e.g., "captured 2026-06-14" vs "2026-06-13").
// Must NOT truncate at punctuation inside parentheses or other brackets.
// Stray closing brackets are inert — floor the depth counter at zero so an
// unmatched ')' cannot corrupt the depth state of a subsequent '(...)' pair.
function truncateAtClauseBoundary(source) {
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && (ch === ',' || ch === '.')) {
      // Check if followed by whitespace or end-of-string
      const nextChar = i + 1 < source.length ? source[i + 1] : ' ';
      if (nextChar === ' ' || nextChar === '\t' || nextChar === '\n' || i + 1 === source.length) {
        return source.slice(0, i);
      }
    }
  }
  return source;
}

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
    // Truncate at clause boundaries first (before stripping trailing source),
    // so that punctuation after "from #N" doesn't prevent the pattern from matching.
    let source = truncateAtClauseBoundary(line[1]).trim();
    // Then strip the trailing source reference.
    source = source.replace(TRAILING_SOURCE, '').trim();
    // Lowercase and check length. If still exceeds MAX_SOURCE_LENGTH, it is not
    // a structured context — resolve to UNSTRUCTURED_SENTINEL to avoid false
    // merges of unrelated long contexts sharing a prefix.
    source = source.toLowerCase();
    if (source.length > MAX_SOURCE_LENGTH) {
      source = UNSTRUCTURED_SENTINEL;
    }
    if (source) return { kind: 'side-effect', source };
  }

  return { kind: 'human', source: 'human' };
}

module.exports = { resolveProvenance, PRODUCERS: ORIGINS };
