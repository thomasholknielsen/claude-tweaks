'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('wrap-up SKILL.md calls wrap-up-pack.js --run exactly once, in Phase 3, and stays under the ceiling (#1930 AC5)', () => {
  const skill = read('plugin/skills/wrap-up/SKILL.md');
  assert.strictEqual((skill.match(/wrap-up-pack\.js" --run/g) || []).length, 1);
  const phase3 = skill.indexOf('## Phase 3');
  const phase4 = skill.indexOf('## Phase 4');
  const call = skill.indexOf('wrap-up-pack.js" --run');
  assert.ok(phase3 < call && call < phase4, 'the call lives in Phase 3');
  assert.ok(Buffer.byteLength(skill, 'utf8') <= 40960);
});

test('every pack-reading sub-file cites wrap-up-pack.json and states the absent-file fallback (#1930 AC5)', () => {
  for (const f of ['residue-sweep', 'unblocked-records', 'cleanup-procedures', 'review-console', 'auto-merge-short-circuit', 'summary-template']) {
    const t = read(`plugin/skills/wrap-up/${f}.md`);
    assert.ok(t.includes('wrap-up-pack.json'), `${f} cites the pack`);
    assert.ok(/absent/.test(t), `${f} states the absent-file fallback`);
  }
});

test('merge-check.md documents the --pack input and keeps the CLI path (#1930 AC6)', () => {
  const t = read('plugin/skills/assess-agent-autonomy/merge-check.md');
  assert.ok(t.includes('--pack'));
  assert.ok(t.includes('could-not-gather'));
  assert.ok(t.includes('bin/blast-radius.js'));
});

test('the pack keeps exactly the ten probe names the skill prose enumerates (#1930)', () => {
  const { PROBE_NAMES } = require(path.join(ROOT, 'plugin', 'bin', 'lib', 'wrap-up', 'pack.js'));
  const skill = read('plugin/skills/wrap-up/SKILL.md');
  for (const n of PROBE_NAMES) assert.ok(skill.includes(`\`${n}\``), `SKILL.md names probe ${n}`);
  assert.strictEqual(PROBE_NAMES.length, 10);
});
