// tests/capture-absorb-default.test.js
// Pins the "absorb-by-default" rules added to /capture's Immediate Routing
// (record #1264): absorb recommended as option 1 at high similarity, the
// two-criteria high-similarity definition, the multi-candidate tie-break,
// the headless structural bar and its fail-toward-filing default, bare-auto
// precedence, never-lower-size / never-write-priority, the three absorb
// exclusions, the 55,000-char body-vs-comment threshold, the AUTO log line,
// the `## Absorbed:` heading format, and the byte ceiling.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const CAPTURE = 'plugin/skills/capture/SKILL.md';

// --- recommended-ordering rule (Deliverable 2 / AC1) ---

test('capture/SKILL.md recommends absorb as Option 1 at high similarity', () => {
  const text = read(CAPTURE);
  assert.match(
    text,
    /\*\*High similarity\*\* \(two-criteria bar below, met by one candidate\): absorb is \*\*Option 1\*\* — `label`: `"Absorb into record \{N\} \(Recommended\)"`/
  );
});

// --- two-criteria high-similarity definition (Deliverable 1 / AC1) ---

test('capture/SKILL.md defines high similarity as two required criteria, including the literal "same kind of change"', () => {
  const text = read(CAPTURE);
  assert.match(text, /\*\*\(a\) same file\/subsystem\*\*/);
  assert.match(text, /\*\*\(b\) same kind of change\*\*/);
  assert.match(text, /same kind of change/);
});

// --- multi-candidate tie-break (Deliverable 2 / AC1) ---

test('capture/SKILL.md tie-breaks multiple qualifying candidates by most-recently-updated', () => {
  const text = read(CAPTURE);
  assert.match(
    text,
    /Several candidates meeting the bar: recommend the one sharing the most file paths, tie-broken by most-recently-updated/
  );
});

// --- headless structural bar + fail-toward-filing default (Deliverable 4 / AC2) ---

test('capture/SKILL.md states the headless structural bar (shared literal path + identical type, standing in for the operation-match)', () => {
  const text = read(CAPTURE);
  assert.match(
    text,
    /absorb only if \(a\) is a literal path match and \(b\)'s `type:\{t\}` matches \(both below\) — standing in for \(b\)'s operation-match judgment/
  );
});

test('capture/SKILL.md states the headless fail-toward-filing default with the literal "files fresh"', () => {
  const text = read(CAPTURE);
  const matches = text.match(/files fresh/g) || [];
  assert.ok(matches.length >= 2, 'expected "files fresh" to appear at least twice (headless bar + exclusions)');
});

// --- bare-auto precedence (Task 4's fix) ---

test('capture/SKILL.md states bare auto keeps the keep default, absorbing only via explicit --route=absorb:N', () => {
  const text = read(CAPTURE);
  assert.match(
    text,
    /Bare `auto` keeps the contract's `keep` default; it absorbs only via explicit front-loaded `--route=absorb:N`\./
  );
});

// --- never-lower size (raise-only) and never-write priority ---

test('capture/SKILL.md re-judges size as raise-only, never lower', () => {
  const text = read(CAPTURE);
  assert.match(text, /Re-judges `size:` per `_shared\/work-record\.md` — raise only, never lower/);
});

test('capture/SKILL.md never writes priority, suggesting it in output instead', () => {
  const text = read(CAPTURE);
  assert.match(text, /`priority:\*` stays unwritten, suggest higher priority in output/);
});

// --- the three exclusions as one enumerable list citing _shared/work-record.md ---

test('capture/SKILL.md lists all three absorb exclusions (closed, parent-issue, bot:in-progress) as one list citing _shared/work-record.md', () => {
  const text = read(CAPTURE);
  assert.match(
    text,
    /Absorb never targets: \(1\) a closed record, \(2\) a `parent-issue` carrier, \(3\) a `bot:in-progress` carrier \(per `_shared\/work-record\.md`\)/
  );
});

test('capture/SKILL.md\'s "Unknown or invalid N" stop rule references the absorb exclusions', () => {
  const text = read(CAPTURE);
  assert.match(text, /excluded per the absorb exclusions above/);
  assert.match(text, /Do not silently fall back to `keep`\./);
});

// --- the 55,000-char body-vs-comment threshold (and 65,536 cap) ---

test('capture/SKILL.md switches to a comment past 55,000 post-append chars, against the 65,536 cap', () => {
  const text = read(CAPTURE);
  assert.match(text, /past 55,000 post-append chars \(vs 65,536 cap\), comment instead/);
});

// --- the exact AUTO log line ---

test('capture/SKILL.md logs the exact AUTO absorb line per _shared/auto-decision-log.md', () => {
  const text = read(CAPTURE);
  assert.match(
    text,
    /AUTO \{time\} — capture absorbed into #\{N\} \(shared path \+ same type\)\. Reversibility: medium \(append is visible on #\{N\}\)\./
  );
});

// --- the ## Absorbed: heading format ---

test('capture/SKILL.md appends under the exact "## Absorbed: {YYYY-MM-DD} — {captured title}" heading', () => {
  const text = read(CAPTURE);
  assert.match(text, /## Absorbed: \{YYYY-MM-DD\} — \{captured title\}/);
});

// --- byte ceiling ---

test('capture/SKILL.md stays within the context-cost ceiling', () => {
  const CEILING_BYTES = 40960;
  const bytes = fs.statSync(path.join(REPO_ROOT, CAPTURE)).size;
  assert.ok(bytes <= CEILING_BYTES, `${CAPTURE} is ${bytes} bytes, over the ${CEILING_BYTES} ceiling`);
});
