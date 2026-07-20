'use strict';

// Shared YAML-style frontmatter bullet-list parser, extracted from three
// independently hand-written near-identical implementations:
// harness-health/scope.js's parseRulePaths (`paths:` key), journey-health/
// scope.js's parseJourneyFiles (`files:` key), and docs-health/freshness.js's
// parseFilesField (`files:` key) — all three parsed the identical shape,
// e.g.:
//   ---
//   files:
//     - src/checkout/Cart.tsx
//   ---
// Returns [] if there's no frontmatter, no `<fieldName>:` key, or no list
// items — an unparseable header means "no declared domain," not an error.
//
// The three prior implementations had already drifted on the per-item
// regex: docs-health's required at least one space after the dash
// (`/^\s*-\s+(.+?)\s*$/`), while harness-health's and journey-health's
// allowed zero or more (`/^\s*-\s*(.+?)\s*$/`). Every string the stricter
// `\s+` form matches is also matched by the more permissive `\s*` form (a
// space is itself whitespace), so using `\s*` here is a pure widening for
// docs-health's former callers, not a behavior break — verified against
// bin/lib/docs-health/tests/freshness.test.js's fixtures, which all use a
// real space after the dash.
function parseFrontmatterListField(content, fieldName) {
  const lines = content.split('\n');
  if (lines[0] !== '---') return [];
  const closeIdx = lines.indexOf('---', 1);
  if (closeIdx === -1) return [];
  const frontmatter = lines.slice(1, closeIdx);
  const escapedFieldName = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fieldRe = new RegExp(`^${escapedFieldName}:\\s*$`);
  const fieldIdx = frontmatter.findIndex((l) => fieldRe.test(l));
  if (fieldIdx === -1) return [];
  const items = [];
  for (let i = fieldIdx + 1; i < frontmatter.length; i++) {
    const m = frontmatter[i].match(/^\s*-\s*(.+?)\s*$/);
    if (!m) break;
    items.push(m[1]);
  }
  return items;
}

module.exports = { parseFrontmatterListField };
