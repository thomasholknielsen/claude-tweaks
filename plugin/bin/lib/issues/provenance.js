'use strict';

// The Origin axis has three states (see skills/_shared/work-record.md):
//   producer    — one of record.js's ORIGINS, carried as a by:* label
//   side-effect — a record created by another skill's flow, carried as an
//                 `Origin: {context}` body line with deliberately no label
//   human       — neither signal; absence IS the signal
//
// This module resolves a record to one of those three, and emits a fourth
// `kind` of its own for the cases it cannot:
//   unstructured — NOT a taxonomy state. This classifier's own artifact for an
//                 Origin line it could not reduce to a class: text still over
//                 MAX_SOURCE_LENGTH after normalization (source
//                 'unstructured'), or text that normalizes to nothing at all
//                 (source 'empty-origin'). Nothing coherent is inside it, so
//                 consumers must never grade it — see trust.js's
//                 UNGRADABLE_KIND.
//
// IMPORTANT: Consumers must key on both `kind` AND `source` together to build
// trust tables (e.g., `kind:source`). The `kind` field disambiguates the
// provenance axis; the `source` field identifies the trust class within that kind.
// Keying on both is also what keeps the classifier's own bucket unforgeable: a
// genuine `Origin: unstructured` body line resolves to `side-effect:unstructured`,
// never to this module's `unstructured:unstructured`.
//
// This module reads that axis. It never writes one, and never extends ORIGINS.
const { ORIGINS } = require('./record.js');

const BY_LABEL = /^by:(.+)$/;
// Anchored to line start so prose describing the convention is not mistaken
// for a provenance claim. The capture is `.*?`, not `.+?`, so a bare `Origin:`
// line with nothing after it still enters the branch below and resolves to the
// ungradable bucket — an empty marker is malformed provenance, not the absent
// marker that means human-filed.
const ORIGIN_LINE = /^Origin:[ \t]*(.*?)[ \t]*$/m;
// A trailing source reference makes the context per-record unique, which would
// explode the class count and give every cell a sample size of one. This is
// stripped AFTER clause truncation so that trailing punctuation doesn't defeat
// the pattern (e.g., "from #42." still matches).
const TRAILING_SOURCE = /\s+from\s+(#\d+|session recall)$/i;

const MAX_SOURCE_LENGTH = 60;

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
    // Lowercase and check length. If still exceeds MAX_SOURCE_LENGTH, return
    // kind: 'unstructured' to distinguish overflow from structured contexts.
    // A real Origin line always yields kind: 'side-effect', so they cannot collide.
    source = source.toLowerCase();
    if (source.length > MAX_SOURCE_LENGTH) {
      return { kind: 'unstructured', source: 'unstructured' };
    }
    if (source) return { kind: 'side-effect', source };
    // An Origin line that normalizes to nothing ("Origin: .", "Origin:   ") is
    // a malformed provenance marker, not an absent one. Falling through to
    // human:human would merge it into a real trust class — a false merge, the
    // strictly worse direction: a false split only delays one class's verdict,
    // while a merge makes a real class's verdict wrong. Resolve it to the
    // ungradable bucket instead, under its own source so the operator can see
    // which defect produced it.
    return { kind: 'unstructured', source: 'empty-origin' };
  }

  return { kind: 'human', source: 'human' };
}

module.exports = { resolveProvenance, PRODUCERS: ORIGINS };
