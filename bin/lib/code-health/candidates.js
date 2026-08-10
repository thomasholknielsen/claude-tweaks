'use strict';

// Focus-mode candidate generator registry — the single source of truth
// SKILL.md's Focus Mode section reads (skills/code-health/focus-mode.md)
// rather than hand-listing known `focus=` values. Adding a new vertical
// means adding one entry here; SKILL.md never hardcodes the list.
//
// Each entry: { generator, criterion } — `generator(rootDir) → candidates[]`
// is the vertical's deterministic candidate generator; `criterion` is the
// single criteria.js catalog id the judge applies in focus mode (a focus
// pins its criterion set — see criteriaForArea's normal multi-criterion
// selection, which focus mode deliberately bypasses).
const { candidatesDeadCode } = require('./candidates-dead-code');

const FOCUS_GENERATORS = {
  'dead-code': { generator: candidatesDeadCode, criterion: 'dead-code' },
};

function knownFocusValues() {
  return Object.keys(FOCUS_GENERATORS);
}

function getFocusGenerator(focus) {
  return FOCUS_GENERATORS[focus] || null;
}

module.exports = { FOCUS_GENERATORS, knownFocusValues, getFocusGenerator };
