'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// #680: a Next Actions option carrying a runnable, state-changing command
// (a release bump) was marked (recommended) for work a prior release had
// already carried — the recommendation rested on a premise nobody checked.
// Pin both the summary-template.md release row's premise-verification rule
// and the general skill-authoring.md convention sentence it derives from.

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const SUMMARY = read('skills', 'flow', 'summary-template.md');
const AUTHORING = read('docs', 'skill-authoring.md');

test('skill-authoring.md: Next Actions convention names the premise-verification rule for state-changing options', () => {
  assert.match(
    AUTHORING,
    /state-changing command \(a release bump, a push, a delete, a merge\) is never marked `\(recommended\)` on an unverified premise/,
  );
  assert.match(AUTHORING, /the option is omitted entirely when that check didn't run/);
});

test('summary-template.md: the release row is conditional and mutually exclusive on the ancestry check result', () => {
  assert.match(SUMMARY, /Render only when the project has a documented release procedure/);
  assert.match(SUMMARY, /never render a release row from an unverified premise, and never render one at all when the check couldn't run/);
  assert.match(SUMMARY, /not yet in a release — bump pending.*cut the release/s);
  assert.match(SUMMARY, /already shipped in vX\.Y\.Z, backfill the CHANGELOG/);
});

test('summary-template.md: the release row cites the #678 release-status subcommand as its source, falling back to inline git commands', () => {
  assert.match(SUMMARY, /reuse that value verbatim rather than re-running the check/);
  assert.match(SUMMARY, /no `bin\/release\.js status`-shaped subcommand.*render the row from the two inline git commands/s);
  assert.match(SUMMARY, /git merge-base --is-ancestor <merge> <newest-bump-commit>/);
});

test('summary-template.md: neither release-row form is unconditionally Recommended', () => {
  assert.match(SUMMARY, /is never marked `\(recommended\)` while `\/claude-tweaks:flow \{next spec\}` is present/);
  assert.match(SUMMARY, /the "backfill the CHANGELOG" form is never marked `\(recommended\)`/);
});

test('summary-template.md: Next Actions still documents assembling only applicable lines, base 2 plus conditionals', () => {
  assert.match(SUMMARY, /the base 2 always; the three conditional lines only when their trigger condition holds/);
});
