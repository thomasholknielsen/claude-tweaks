'use strict';

// Parser for a SKILL.md's `## Relationship to Other Skills` section.
//
// Phase 2 of the bloat-reduction work walks this section four times over — to build
// the classification corpus, to generate docs/skill-graph.md, to answer "does this
// skill cite _shared/x.md anywhere outside its table", and to verify at apply time
// that nothing was dropped. One tested parser beats four ad-hoc section walks.

const HEADING = /^##\s+Relationship to Other Skills\b/;
const NEXT_HEADING = /^##\s/;
const RULE_ROW = /^\|\s*:?-+/;

// Returns {start, end} line indices for the section, end-exclusive, or null.
// 31 of the 32 skills carry this section last, so a missing next heading means
// "runs to end of file" — not "no section". A walker that requires a following
// heading silently truncates almost every table in the tree.
function locate(lines) {
  const start = lines.findIndex((line) => HEADING.test(line));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !NEXT_HEADING.test(lines[end])) end += 1;
  return { start, end };
}

function extractRelationshipRows(markdown) {
  const lines = String(markdown).split('\n');
  const at = locate(lines);
  if (!at) return [];

  const rows = [];
  let sawHeader = false;

  for (let i = at.start; i < at.end; i += 1) {
    const raw = lines[i];
    if (!raw.startsWith('|')) continue;
    if (RULE_ROW.test(raw)) continue;
    if (!sawHeader) {
      sawHeader = true;
      continue;
    }
    const cells = raw.split('|');
    rows.push({
      line: i + 1,
      target: (cells[1] || '').trim(),
      // Rejoin rather than index: a description may contain an escaped pipe.
      description: cells.slice(2).join('|').replace(/\|\s*$/, '').trim(),
      raw,
    });
  }

  return rows;
}

function bodyOutsideSection(markdown) {
  const text = String(markdown);
  const lines = text.split('\n');
  const at = locate(lines);
  if (!at) return text;
  return lines.slice(0, at.start).concat(lines.slice(at.end)).join('\n');
}

module.exports = { extractRelationshipRows, bodyOutsideSection };
