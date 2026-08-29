'use strict';

// Canonical, directory-derived skill catalog.
//
// Before this module, four test files each hard-coded the shipped skill count as
// a literal `33` (tests/skill-conventions.test.js, and three files under
// tests/bin-lib/skill-audit/: context-cost.test.js, anti-patterns.test.js,
// relationship-rows.test.js) -- the issue that motivated this module claimed
// "three", but a repo-wide grep found a fourth (`[IL-71]`: measure the premise
// against the live files, not the issue body). Every new skill directory
// required editing all four in lockstep, with nothing enforcing that they
// stayed in sync -- and a literal count can't tell "the glob broke" apart from
// "a skill was added", so it wasn't even a strong check.
//
// listSkillDirs is the single definition of "what counts as a shipped skill":
// a directory under skills/ that has its own SKILL.md. Every consumer computes
// its expected count from this function instead of restating a number.

const fs = require('node:fs');
const path = require('node:path');
const { escapeRegExp } = require('../shared-primitives');

function listSkillDirs(repoRoot) {
  const skillsDir = path.join(repoRoot, 'skills');
  return fs
    .readdirSync(skillsDir)
    .filter((n) => fs.existsSync(path.join(skillsDir, n, 'SKILL.md')))
    .sort();
}

// A small, stable sample that must always be present in the catalog -- not the
// full roster (that would just restate the directory listing), but enough that
// a broken glob/filter returns an empty or truncated list loudly rather than
// silently passing a count-only check. Mirrors the pattern already established
// in tests/bin-lib/skill-audit/house-structure.test.js.
const KNOWN_SKILLS = ['build', 'flow', 'review', 'wrap-up', 'specify', 'test'];

// True when `name` is mentioned as a skill reference in `body`: either the
// fully-qualified `claude-tweaks:{name}` form, or the short `` `/{name}` ``
// form used in tables that already scope every row to this plugin. A plain
// substring check would let "claude-tweaks:test" false-positive-match a
// hypothetical "claude-tweaks:testing" -- the negative lookahead rules that
// out by requiring the match not be followed by another skill-name character.
function mentionsSkill(body, name) {
  const escaped = escapeRegExp(name);
  const re = new RegExp(`(claude-tweaks:${escaped}|/${escaped}\`)(?![a-zA-Z0-9-])`);
  return re.test(body);
}

module.exports = { listSkillDirs, KNOWN_SKILLS, mentionsSkill };
