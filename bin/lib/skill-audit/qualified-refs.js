'use strict';

// Fully-qualified skill-reference lint.
//
// CLAUDE.md: "A skill reference inside actionable instruction text (a `## Step
// N` body, a `## Next Actions` block) MUST use the fully-qualified
// `/claude-tweaks:{skill}` form -- the `Skill` tool requires it, and a bare
// `/{skill}` there fails with 'Unknown skill' at invocation time." The lint's
// hardest edge -- distinguishing actionable instruction text from descriptive
// prose inside the same Step body -- is resolved by position, not semantics:
// the parenthetical itself defines "actionable instruction text" as "a
// `## Step N` body, a `## Next Actions` block". Everything inside those H2
// sections counts, no sentence-level judgment; everything outside them (When
// to Use, Overview, Relationship-table remnants) is descriptive prose and
// stays exempt by construction. Confirmed drift at the time this module was
// written: 60 bare references across 12 skills (deepen, demo, flow, init,
// journeys, reflect, review, simplify, test, tidy, visual-review, wrap-up),
// fixed in the same change rather than allowlisted.

const KNOWN_HEADING_RE = /^## (Step \d+(?:\.\d+)?|Next Actions)\b/;

// Byte ranges of every `## Step N` / `## Next Actions` H2 section in `body`.
function actionableRanges(body) {
  const headings = [...body.matchAll(/^## .*$/gm)];
  const ranges = [];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    if (KNOWN_HEADING_RE.test(h[0])) {
      const start = h.index;
      const end = i + 1 < headings.length ? headings[i + 1].index : body.length;
      ranges.push([start, end]);
    }
  }
  return ranges;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// One bare-reference finder for a given skill-name alternation. Excludes:
//  - already-qualified references (negative lookahead on `claude-tweaks:`)
//  - heading citations like `` `## /journeys` `` -- another file's (e.g.
//    skills/_shared/auto-decision-log.md's own bare `## /{skill}` heading
//    convention) is quoted literal text, not an invocation
//  - mid-path/mid-word occurrences (e.g. `bin/test.js`) via boundary
//    lookaround on both sides
function buildReferenceRegex(skillNames) {
  const alt = skillNames.map(escapeRegExp).join('|');
  return new RegExp(`(?<!## )(?<![\\w/.-])/(?!claude-tweaks:)(${alt})(?![\\w/.-])`, 'g');
}

// Every bare reference found inside `body`'s actionable ranges, as
// { skillName, index, match } -- one entry per occurrence, in document order.
function findBareReferences(body, skillNames) {
  const re = buildReferenceRegex(skillNames);
  const found = [];
  for (const [start, end] of actionableRanges(body)) {
    const chunk = body.slice(start, end);
    for (const m of chunk.matchAll(re)) {
      found.push({ skillName: m[1], index: start + m.index, match: m[0] });
    }
  }
  return found;
}

module.exports = { actionableRanges, buildReferenceRegex, findBareReferences };
