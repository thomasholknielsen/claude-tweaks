'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { derivePhases, PHASES, NESTED_PARENT } = require('../../../plugin/bin/lib/timing/derive');
const { parseManifestYaml } = require('../../../plugin/bin/lib/flow/manifest');

const FIX = path.join(__dirname, '..', '..', 'fixtures', 'timing', 'record-1535');
function fixtureEvents() {
  return fs.readFileSync(path.join(FIX, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
}
function fixtureManifest() {
  return parseManifestYaml(fs.readFileSync(path.join(FIX, 'manifest.yml'), 'utf8'));
}
const byName = (out) => Object.fromEntries(out.phases.map((p) => [p.phase, p]));

test('#1928 AC3: the frozen fixture reproduces the reference boundaries within ±1 minute', () => {
  const out = derivePhases({ events: fixtureEvents(), manifest: fixtureManifest(), now: new Date('2026-09-05T14:13:00.000Z') });
  assert.deepEqual(out.phases.map((p) => p.phase), PHASES);
  const p = byName(out);
  const near = (a, b) => Math.abs(a - b) <= 1;
  assert.ok(near(p['call-1'].minutes, 25), `call-1 ${p['call-1'].minutes}`);
  assert.ok(near(p['call-2'].ownMinutes, 24), `call-2 own ${p['call-2'].ownMinutes}`);
  assert.ok(near(p.plan.minutes, 6));
  assert.ok(near(p.tasks.minutes, 14));
  assert.ok(near(p.build.ownMinutes, 2));
  assert.ok(near(p.test.minutes, 2));
  assert.ok(near(p.review.minutes, 8));
  assert.equal(p.polish.minutes, 0);
  assert.equal(p.polish.source, 'unattributed');
  assert.equal(p.polish.start, p['wrap-up'].start);
  assert.ok(near(p['wrap-up'].minutes, 15), `wrap-up ${p['wrap-up'].minutes}`);
  assert.ok(near(p.merge.minutes, 1));
  assert.equal(p.tasks.verify.length, 1);
  assert.equal(p.tasks.verify[0].mode, 'scoped');
  assert.equal(p.test.verify.length, 1);
  assert.equal(p.test.verify[0].mode, 'full');
  assert.equal(out.totals.verifyRuns, 2);
  assert.deepEqual(out.totals.verifyModes, ['scoped', 'full']);
  assert.ok(near(out.totals.minutes, 73), `totals ${out.totals.minutes}`);
});

test('#1928: sources are labelled by the boundary that produced them', () => {
  const p = byName(derivePhases({ events: fixtureEvents(), manifest: fixtureManifest() }));
  assert.equal(p['call-1'].source, 'skill_invoked');
  assert.equal(p.tasks.source, 'verify');
  assert.equal(p.merge.source, 'commit');
});

test('#1928 AC4 (derivation half): only session-end ⇒ every canonical phase is unattributed, 0 minutes', () => {
  const out = derivePhases({ events: [{ ts: '2026-09-05T14:13:00.000Z', type: 'session-end' }] });
  assert.deepEqual(out.phases.map((p) => p.phase), PHASES);
  for (const p of out.phases) { assert.equal(p.source, 'unattributed'); assert.equal(p.minutes, 0); }
  assert.equal(out.totals.minutes, 0);
});

test('#1928: an un-mapped claude-tweaks skill opens its own top-level span (never nests silently)', () => {
  const events = [
    { skill: 'claude-tweaks:flow', ts: '2026-09-05T13:00:00.000Z', type: 'skill_invoked' },
    { skill: 'claude-tweaks:review', ts: '2026-09-05T13:10:00.000Z', type: 'skill_invoked' },
    { skill: 'claude-tweaks:mystery', ts: '2026-09-05T13:15:00.000Z', type: 'skill_invoked' },
    { skill: 'claude-tweaks:wrap-up', ts: '2026-09-05T13:20:00.000Z', type: 'skill_invoked' },
    { ts: '2026-09-05T13:25:00.000Z', type: 'session-end' },
  ];
  const out = derivePhases({ events });
  const p = byName(out);
  assert.equal(p.review.minutes, 5, 'review ends when the un-mapped skill starts');
  assert.ok(out.phases.some((x) => x.phase === 'mystery' && x.minutes === 5));
  assert.equal(NESTED_PARENT.journeys, 'enclosing');
});

test('#1928: a re-entered phase sums every span attributed to its name', () => {
  const events = [
    { skill: 'claude-tweaks:flow', ts: '2026-09-05T13:00:00.000Z', type: 'skill_invoked' },
    { skill: 'claude-tweaks:review', ts: '2026-09-05T13:01:00.000Z', type: 'skill_invoked' },
    { skill: 'claude-tweaks:build', ts: '2026-09-05T13:05:00.000Z', type: 'skill_invoked' },
    { skill: 'claude-tweaks:review', ts: '2026-09-05T13:15:00.000Z', type: 'skill_invoked' },
    { ts: '2026-09-05T13:18:00.000Z', type: 'session-end' },
  ];
  assert.equal(byName(derivePhases({ events })).review.minutes, 7);
});

test('#1928: merge ends at runState.pr.mergedAt under pr-first, else at a merge commit or the terminal event', () => {
  const events = [
    { skill: 'claude-tweaks:flow', ts: '2026-09-05T13:00:00.000Z', type: 'skill_invoked' },
    { skill: 'claude-tweaks:wrap-up', ts: '2026-09-05T13:01:00.000Z', type: 'skill_invoked' },
    { action: 'push', ts: '2026-09-05T13:10:00.000Z', type: 'commit' },
    { ts: '2026-09-05T13:30:00.000Z', type: 'session-end' },
  ];
  assert.equal(byName(derivePhases({ events, runState: { pr: { mergedAt: '2026-09-05T13:14:00.000Z' } } })).merge.minutes, 4);
  assert.equal(byName(derivePhases({ events })).merge.minutes, 20);
  const local = [...events.slice(0, 3), { action: 'merge', ts: '2026-09-05T13:12:00.000Z', type: 'commit' }, events[3]];
  assert.equal(byName(derivePhases({ events: local })).merge.minutes, 2);
});
