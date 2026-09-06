'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('review-console.md calls console-resolve.js --run exactly once, inside the short-circuit section, and stays under the ceiling (#1932 AC7)', () => {
  const t = read('plugin/skills/wrap-up/review-console.md');
  assert.strictEqual((t.match(/console-resolve\.js" --run/g) || []).length, 1);
  const section = t.indexOf('## Auto-resolution short-circuit');
  const next = t.indexOf('## Present a real stop');
  const call = t.indexOf('console-resolve.js" --run');
  assert.ok(section < call && call < next, 'the call lives in the short-circuit section');
  assert.match(t, /exit code 4/);
  assert.match(t, /exit code 5/);
  assert.match(t, /exit codes 2 and 3/);
  assert.match(t, /HARD-GATE/);
  assert.match(t, /--dry-run/);
  assert.ok(Buffer.byteLength(t, 'utf8') <= 40960);
});

test('auto-merge-short-circuit.md logs the needs-human verdict the resolver reads (#1932 decision 3)', () => {
  const t = read('plugin/skills/wrap-up/auto-merge-short-circuit.md');
  assert.match(t, /assess-agent-autonomy verdict needs-human/);
  assert.ok(Buffer.byteLength(t, 'utf8') <= 40960);
});

test('settle-and-merge.md logs the needs-human verdict the resolver reads (#1932 C1)', () => {
  const t = read('plugin/skills/dispatch/settle-and-merge.md');
  assert.match(t, /assess-agent-autonomy verdict needs-human/);
  assert.ok(Buffer.byteLength(t, 'utf8') <= 40960);
});

test('autonomy-ceiling.md names console-resolve.js as consoleAutoResolve\'s execution (#1932)', () => {
  const t = read('plugin/skills/_shared/autonomy-ceiling.md');
  assert.match(t, /console-resolve\.js/);
  assert.ok(Buffer.byteLength(t, 'utf8') <= 40960);
});

test('wrap-up/SKILL.md did not grow past its pre-#1932 size (#1932 AC7)', () => {
  assert.ok(Buffer.byteLength(read('plugin/skills/wrap-up/SKILL.md'), 'utf8') <= 40893);
});
