'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// #685: tidy report rendering — width discipline, fenced column layout,
// command-grouped Yours, conformance scan, digest. Prose-as-implementation:
// pin the report contract's literal text so a later edit that drops a rule
// fails here, plus one mechanical check that the grouping rule's "batchable
// today" claim matches the live argument-hints it is keyed on.

const ROOT = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const STEP6 = read('skills', 'tidy', 'step-6-auto.md');

function section(text, startHeading, endHeading) {
  const start = text.indexOf(startHeading);
  assert.ok(start >= 0, `missing heading: ${startHeading}`);
  const end = endHeading ? text.indexOf(endHeading, start + startHeading.length) : text.length;
  assert.ok(end > start, `missing heading after ${startHeading}: ${endHeading}`);
  return text.slice(start, end);
}

// --- Task 1: template + Yours grouping ---

test('step-6-auto.md: report template renders every section\'s rows inside ```text fences', () => {
  const tpl = section(STEP6, '#### The report template (standalone auto)', '#### Bucket mapping');
  const fences = tpl.match(/```text/g) || [];
  assert.ok(fences.length >= 4, `expected a text fence per section (Applied/Approve/Yours/Clean), found ${fences.length}`);
  assert.match(tpl, /\*\*Applied automatically\*\*\n```text/);
  assert.match(tpl, /\*\*Approve \(\{N\}\)\*\*\n```text/);
  assert.match(tpl, /\*\*Yours \(\{N\}\)\*\*\n```text/);
  assert.match(tpl, /\*\*Clean:\*\*\n```text/);
  assert.match(tpl, /Full decision log: \{run-dir\}\/decisions\.md/);
  assert.match(tpl, /_shared\/terminal-ux\.md/, 'template cites the terminal-ux craft file');
});

test('step-6-auto.md: Yours grouping section states the group key, the fixed order, and the batch-vs-paste-block rule', () => {
  const grp = section(STEP6, '#### Yours grouping (by the command the human runs)', '### Report rules');
  assert.match(grp, /`specify`, `demo`, `git`, `capture`, `backlog refine`, then every remaining key alphabetically/);
  assert.match(grp, /argument-hint/);
  assert.match(grp, /\/claude-tweaks:flow/);
  assert.match(grp, /\/claude-tweaks:dispatch/);
  assert.match(grp, /paste block/);
  assert.match(grp, /never by scan step/i);
  assert.match(grp, /\(likewise #41 #113 …\)/);
  assert.match(grp, /never acceptable/);
});

test('step-6-auto.md: Bucket mapping Clean row is per-scan count lines, not a comma list', () => {
  const bucket = section(STEP6, '#### Bucket mapping', '#### Yours grouping');
  assert.doesNotMatch(bucket, /comma list/);
  assert.match(bucket, /\{scan\}\s+\{count\} checked/);
});

// Mechanical: the grouping rule names flow + dispatch as today's batchable
// targets and specify + demo as single-ref. Check that against the live
// argument-hints the rule is keyed on, so the "today" clause cannot go stale
// silently.
test('grouping rule\'s batchable-today claim matches the live argument-hints', () => {
  const hint = (skill) => {
    const m = read('skills', skill, 'SKILL.md').match(/^argument-hint:\s*"([^"]*)"/m);
    assert.ok(m, `no argument-hint in skills/${skill}/SKILL.md`);
    return m[1];
  };
  const multi = /\[,\s*#/; // `<#n>[,#m,#o]` / `#N[,#M...]`
  assert.match(hint('flow'), multi);
  assert.match(hint('dispatch'), multi);
  assert.doesNotMatch(hint('specify'), multi);
  assert.doesNotMatch(hint('demo'), multi);
});
