// bin/lib/init/claude-md-conformance.js — deterministic conformance check for an
// adopting project's CLAUDE.md against the plugin's current template. Replaces
// init Phase 1u.5's hand-maintained contract-version marker greps: the markers
// went stale as the template changed, and never covered Working Approach or
// Philosophy at all.
'use strict';

// The Initial Mode Template lives inside a fenced ```markdown block so that the
// template's own h2 headings do not collide with the documentation headings of
// the file that carries it. Return the fence's contents, fences stripped.
function extractTemplateBody(templateSource) {
  const lines = templateSource.split('\n');
  const start = lines.findIndex((l) => l.trim() === '## Initial Mode Template');
  if (start === -1) throw new Error('claude-md-template.md has no "## Initial Mode Template" section');

  let open = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('```')) { open = i; break; }
  }
  if (open === -1) throw new Error('unterminated: no opening fence after "## Initial Mode Template"');

  let close = -1;
  for (let i = open + 1; i < lines.length; i++) {
    if (lines[i].trim() === '```') { close = i; break; }
  }
  if (close === -1) throw new Error('unterminated fence in the Initial Mode Template');

  const body = lines.slice(open + 1, close).join('\n');

  // Fail loudly on an ambiguous fence rather than returning a truncated
  // template. The outer fence and any same-length inner fence are
  // indistinguishable to this scan — per CommonMark the outer block would
  // terminate at the inner one — so a nested ``` block silently cuts the
  // template short and every section past it reads as missing. Plan A's removal
  // of the Project Defaults block is what makes this file unambiguous; this
  // assertion is what stops that dependency from being a silent assumption.
  if (!/^## Don'ts$/m.test(body)) {
    throw new Error(
      'Initial Mode Template extraction stopped early — expected the template to end with '
      + "a \"## Don'ts\" section. A nested ``` fence inside the template will do this.",
    );
  }

  return body;
}

// Map each `## Heading` to its body text. Nested headings inside a section
// (the template has none after the Project Defaults removal) are not split out.
function splitSections(markdown) {
  const sections = new Map();
  let current = null;
  let buffer = [];
  for (const line of markdown.split('\n')) {
    const m = /^## (.+)$/.exec(line);
    if (m) {
      if (current !== null) sections.set(current, buffer.join('\n'));
      current = m[1].trim();
      buffer = [];
    } else if (current !== null) {
      buffer.push(line);
    }
  }
  if (current !== null) sections.set(current, buffer.join('\n'));
  return sections;
}

module.exports = { extractTemplateBody, splitSections };
