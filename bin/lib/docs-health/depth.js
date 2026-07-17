'use strict';

// Computes a mechanical depth signal for a doc: an explicit `depth-hint:`
// frontmatter value (ground truth, returned as-is, no computation) or a
// plain word count with frontmatter and fenced code blocks stripped
// first, so a metadata block or one long example doesn't inflate a thin
// page's count. No LLM involved — the JUDGE step in docs-health/SKILL.md
// interprets the returned value against what the doc's location/heading
// imply. Returns a number (word count) or a string (the depth-hint's
// literal value) — callers must handle both.
function computeWordCount(content) {
  const lines = content.split('\n');
  let body = content;
  if (lines[0] === '---') {
    const closeIdx = lines.indexOf('---', 1);
    if (closeIdx !== -1) {
      const frontmatter = lines.slice(1, closeIdx);
      const hintLine = frontmatter.find((l) => /^depth-hint:\s*.+$/.test(l));
      if (hintLine) {
        return hintLine.replace(/^depth-hint:\s*/, '').trim();
      }
      body = lines.slice(closeIdx + 1).join('\n');
    }
  }
  const stripped = body.replace(/```[\s\S]*?```/g, '');
  const words = stripped.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

module.exports = { computeWordCount };
