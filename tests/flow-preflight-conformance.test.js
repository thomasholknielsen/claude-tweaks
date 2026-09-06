'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const { ADOPTION_NOTES } = require(path.join(ROOT, 'plugin', 'bin', 'lib', 'flow', 'preflight'));

test('steps-and-gates.md calls flow-preflight.js --run exactly once in the adoption section, no longer invokes check-resume-freshness --run, still names the verb, and checks BLOCKED right after the call (#1931 AC5)', () => {
  const t = read('plugin/skills/flow/steps-and-gates.md');
  assert.strictEqual((t.match(/flow-preflight\.js" --run/g) || []).length, 1);
  assert.strictEqual((t.match(/check-resume-freshness --run/g) || []).length, 0);
  assert.ok(t.includes('check-resume-freshness'), 'the verb is still cited by name (resume-freshness-citations pin)');
  const call = t.indexOf('flow-preflight.js" --run');
  const section = t.indexOf('### Adopting an inherited run directory');
  const next = t.indexOf('### Partial step lists');
  assert.ok(section < call && call < next, 'the call lives in the adoption section');
  const after = t.slice(call, call + 1200);
  assert.match(after, /freshness\.value\.verdict === 'BLOCKED'/, 'a literal check-and-stop on the freshness verdict follows the call');
  assert.match(after, /stop/i);
  assert.match(t, /inventory\.value\.status === 'MISMATCH'/);
  assert.match(t, /adoption\.value\.note/);
  assert.ok(Buffer.byteLength(t, 'utf8') <= 40960);
});

test('the four adoption note literals in preflight.js equal the ones steps-and-gates.md renders (#1931 AC5)', () => {
  const t = read('plugin/skills/flow/steps-and-gates.md');
  for (const n of [1, 2, 3, 4]) {
    assert.ok(t.includes('`' + ADOPTION_NOTES[n] + '`'), `case ${n} literal rendered verbatim in the prose`);
  }
});

test('manifesto.md renders the auto FYI table from preflight.levers and lists the pack as a source (#1931)', () => {
  const t = read('plugin/skills/flow/manifesto.md');
  assert.match(t, /preflight\.levers/);
  assert.match(t, /preflight\.json/);
  assert.match(t, /run-config/);
  assert.match(t, /`header`/);
  assert.match(t, /unresolved/);
  assert.ok(Buffer.byteLength(t, 'utf8') <= 40960);
});

test('flow/SKILL.md names the pack in Step 3 and did not grow (#1931 AC6)', () => {
  const t = read('plugin/skills/flow/SKILL.md');
  assert.match(t, /flow-preflight\.js/);
  assert.ok(Buffer.byteLength(t, 'utf8') <= 40271);
});
