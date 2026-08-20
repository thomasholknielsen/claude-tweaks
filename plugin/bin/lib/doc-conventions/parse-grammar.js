// bin/lib/doc-conventions/parse-grammar.js
// Pure: filename-grammar half of `_shared/existing-convention-detection.md`'s
// Procedure step 3 — prefix, separator, zero-pad width, majority-agreement
// count. Deliberately stops there: section/metadata shape is the judgment
// half that stays in that file's prose (see its Gotchas — a 16-ADR corpus
// was 16/16 consistent on filename grammar but only 9/5/2 on one heading's
// casing). No filesystem I/O — filename array in, grammar struct out.
'use strict';

// <prefix><sep>?<digits><sep><rest>.md — prefix and its own leading
// separator are optional (bare `0007-slug.md` has neither); the separator
// between the digits and the rest is required for a filename to parse at all.
const GRAMMAR_RE = /^([A-Za-z]+)?(-|_)?(\d+)(-|_)(.+)\.md$/;

function parseOne(filename) {
  const match = GRAMMAR_RE.exec(filename);
  if (!match) return null;
  const [, alpha, prefixSep, digits, separator] = match;
  return {
    prefix: alpha ? `${alpha}${prefixSep || ''}` : '',
    separator,
    padWidth: digits.length,
  };
}

function grammarKey(g) {
  return `${g.prefix}|${g.separator}|${g.padWidth}`;
}

// Returns { prefix, separator, padWidth, agreeing, total } for the
// most-agreed-on grammar in `filenames`, or null when there's nothing to
// report: fewer than 3 files (existing-convention-detection.md step 2's
// floor — a near-empty directory can't establish a convention) or none of
// them carry a parseable numbering grammar at all (never guessed). Below
// that floor, `agreeing` and `total` are handed back as-is — deciding what
// a split means (conflict vs. not) stays with the caller.
function parseGrammar(filenames) {
  if (!Array.isArray(filenames) || filenames.length < 3) return null;

  const counts = new Map();
  for (const filename of filenames) {
    const grammar = parseOne(filename);
    if (!grammar) continue;
    const key = grammarKey(grammar);
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { grammar, count: 1 });
  }
  if (counts.size === 0) return null;

  let best = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }

  return {
    prefix: best.grammar.prefix,
    separator: best.grammar.separator,
    padWidth: best.grammar.padWidth,
    agreeing: best.count,
    total: filenames.length,
  };
}

module.exports = { parseGrammar };
