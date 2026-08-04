'use strict';

// Distinctive-payload extraction for skill prose.
//
// Phase 2 of the bloat-reduction work relocates operative Relationship rows into
// the step bodies that implement them, rewording them in the process. Line-level
// comparison therefore reports nearly everything as missing and is useless as a
// safety net. What must survive a rewording is the payload a reader acts on:
// backticked identifiers and step references. This module reports which of those
// disappeared, so a human can adjudicate a short list instead of a whole diff.

const BACKTICKED = /`([^`\n]+)`/g;
const STEP_REF = /\bStep \d+(?:\.\d+)?\b/g;
const MIN_LENGTH = 4;

function normalize(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function extractIdentifiers(text) {
  const source = String(text);
  const found = new Set();

  for (const m of source.matchAll(BACKTICKED)) {
    const token = m[1].trim();
    if (token.length < MIN_LENGTH) continue;
    // Skill references (`/claude-tweaks:flow`) and paths are edge labels, not payload.
    // A Relationship row's first cell is always a skill name, and it legitimately does
    // not reappear when the row is relocated into a step body — keeping these would
    // make every single relocated row report a false loss.
    if (token.startsWith('/')) continue;
    found.add(token);
  }
  for (const m of source.matchAll(STEP_REF)) {
    found.add(m[0]);
  }

  return [...found].sort();
}

// indexOf rather than RegExp: identifiers routinely contain / . { } * : and ( ).
function countOccurrences(needle, haystack) {
  const n = normalize(needle);
  if (!n) return 0;
  const h = normalize(haystack);
  let count = 0;
  let from = 0;
  for (;;) {
    const at = h.indexOf(n, from);
    if (at === -1) return count;
    count += 1;
    from = at + n.length;
  }
}

// Reports every identifier in sourceText whose occurrence count fell between the
// two corpora. The caller chooses the scope: the source file plus every file named
// as a relocation destination.
//
// Counting rather than testing presence is deliberate and load-bearing. Presence
// asks "does this identifier appear anywhere afterwards?", and common identifiers
// (PIPELINE_RUN_DIR, auto:merge, subagent) recur across the whole tree, so they
// always read as surviving no matter what happened to the row that carried them.
// Measured against a real 100% loss — deleting review/SKILL.md's entire
// Relationship table — presence reported 24%, counting reports 100%.
function findLostOccurrences(sourceText, beforeCorpus, afterCorpus) {
  const before = normalize(beforeCorpus);
  const after = normalize(afterCorpus);
  const lost = [];

  for (const identifier of extractIdentifiers(sourceText)) {
    const b = countOccurrences(identifier, before);
    const a = countOccurrences(identifier, after);
    if (a < b) lost.push({ identifier, before: b, after: a });
  }

  return lost;
}

module.exports = { extractIdentifiers, countOccurrences, findLostOccurrences };
