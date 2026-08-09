'use strict';

// Mechanical drift guard for the four health-sweep skills' FILE step (#240).
//
// skills/_shared/health-filing-mechanics.md documents a canonical shape for
// two boilerplate paragraphs each of code-health/harness-health/docs-health/
// journey-health's own FILE step re-writes inline (never reads-and-substitutes
// at runtime — that file's own header explains why: the FILE step is
// procedural, literal bash a session executes step by step, with no mid-step
// file switch, so an "inline from this file" convention plus a MECHANICAL
// parity check closes the actual hazard — hand-sync drift — without adding a
// weaker runtime "go read X and substitute" binding).
//
// This test is the mechanical check: it catches the exact failure this repo
// already hit once (code-health's "Exception — a headless D5 finding"
// paragraph had drifted to a shorter reworded version relative to its three
// siblings, found and fixed alongside this test — see #240).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const SOURCES = {
  'code-health': fs.readFileSync(path.join(ROOT, 'skills/code-health/SKILL.md'), 'utf8'),
  'harness-health': fs.readFileSync(path.join(ROOT, 'skills/harness-health/SKILL.md'), 'utf8')
    + fs.readFileSync(path.join(ROOT, 'skills/harness-health/filing.md'), 'utf8'),
  'docs-health': fs.readFileSync(path.join(ROOT, 'skills/docs-health/SKILL.md'), 'utf8'),
  'journey-health': fs.readFileSync(path.join(ROOT, 'skills/journey-health/SKILL.md'), 'utf8'),
};

// Extracts a paragraph starting at `startMarker` up to (not including) the
// next blank line. Throws (test failure, not silent skip) if the marker is
// missing — an absent paragraph is itself a drift the suite must catch, not
// something to quietly pass over (matches this repo's own rule against
// count-based checks that pass identically whether the checked thing holds).
function extractParagraph(source, startMarker) {
  const idx = source.indexOf(startMarker);
  assert.ok(idx !== -1, `marker not found: ${JSON.stringify(startMarker)}`);
  const rest = source.slice(idx);
  const blankIdx = rest.indexOf('\n\n');
  return (blankIdx === -1 ? rest : rest.slice(0, blankIdx)).trim();
}

// Replaces this skill's own name wherever it appears as `by:{skill}` or a
// bare `{skill}` token, so the four paragraphs compare equal modulo the one
// legitimate per-skill substitution.
function normalize(paragraph, skillName) {
  return paragraph.split(skillName).join('{SKILL}');
}

test('the "Subject check before filing" paragraph is byte-identical (modulo skill name) across all four health sweeps', () => {
  const marker = '**Subject check before filing.**';
  const normalized = {};
  for (const [skill, source] of Object.entries(SOURCES)) {
    normalized[skill] = normalize(extractParagraph(source, marker), skill);
  }
  const values = Object.values(normalized);
  const [first, ...rest] = values;
  for (let i = 0; i < rest.length; i++) {
    assert.strictEqual(
      rest[i], first,
      `Subject-check paragraph drifted in one of the four skills (compared against code-health's). `
      + `Got:\n${rest[i]}\n\nExpected (normalized):\n${first}`,
    );
  }
});

test('the "Exception — a headless D5 finding" paragraph is byte-identical (modulo by:{skill}) across all four health sweeps', () => {
  const marker = '**Exception — a headless D5 finding.**';
  const normalized = {};
  for (const [skill, source] of Object.entries(SOURCES)) {
    normalized[skill] = normalize(extractParagraph(source, marker), `by:${skill}`);
  }
  const values = Object.values(normalized);
  const [first, ...rest] = values;
  for (let i = 0; i < rest.length; i++) {
    assert.strictEqual(
      rest[i], first,
      `D5-exception paragraph drifted in one of the four skills (compared against code-health's). `
      + `Got:\n${rest[i]}\n\nExpected (normalized):\n${first}`,
    );
  }
});

test('every source file actually contains both canonical markers (a renamed heading would otherwise silently empty this suite)', () => {
  for (const [skill, source] of Object.entries(SOURCES)) {
    assert.ok(source.includes('**Subject check before filing.**'), `${skill} is missing the Subject-check marker`);
    assert.ok(source.includes('**Exception — a headless D5 finding.**'), `${skill} is missing the D5-exception marker`);
  }
});
