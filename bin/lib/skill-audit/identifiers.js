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

function findLostIdentifiers(beforeText, afterCorpus) {
  const haystack = normalize(afterCorpus);
  return extractIdentifiers(beforeText).filter((id) => !haystack.includes(normalize(id)));
}

module.exports = { extractIdentifiers, findLostIdentifiers };
