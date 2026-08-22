// tests/materiality-floor-conformance.test.js
// Pins plugin/skills/_shared/materiality-floor.md's contract elements, its citation from
// deferral-gate.md, and the /tidy digest sweep's promotion/expiry procedures. No local-files
// runtime test double exists yet for the container branch — that branch is pinned as prose only
// until a local-files consumer lands.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

const FLOOR = read('plugin/skills/_shared/materiality-floor.md');
const GATE = read('plugin/skills/_shared/deferral-gate.md');
const SWEEP = read('plugin/skills/tidy/digest-sweep.md');
const TIDY_SKILL = read('plugin/skills/tidy/SKILL.md');
const TIDY_RECORDS = read('plugin/skills/tidy/step-1-records.md');

test('materiality-floor.md states the floor definition (all three low axes, fail-toward-filing)', () => {
  assert.ok(/size:low/i.test(FLOOR));
  assert.ok(/priority:low/i.test(FLOOR));
  assert.ok(/risk:low/i.test(FLOOR));
  assert.ok(FLOOR.includes('fails toward filing'));
});

test('materiality-floor.md states both overrides', () => {
  assert.ok(/tangential/i.test(FLOOR));
  assert.ok(FLOOR.toLowerCase().includes('out of this contract') || FLOOR.toLowerCase().includes('/capture'));
});

test('materiality-floor.md states the entry format line', () => {
  assert.ok(FLOOR.includes('- [{area}] {one-line finding} — {file refs} — Defer-reason: {value} — {provenance}'));
});

test('materiality-floor.md\'s audit line uses the literal AUTO status and no invented status word', () => {
  assert.match(FLOOR, /^AUTO \{time\} — materiality-floor:/m);
  assert.ok(!/^DIGEST /m.test(FLOOR));
});

test('materiality-floor.md states both container shapes', () => {
  assert.ok(FLOOR.includes('work-backend: github-issues'));
  assert.ok(FLOOR.includes('work-backend: local-files'));
  assert.ok(FLOOR.includes('specs/digest.md'));
});

test('materiality-floor.md states expiry is a logged retention decision, not skipped work', () => {
  assert.ok(FLOOR.includes('## Expiry is not skipped work'));
  assert.ok(FLOOR.includes('Archival is a logged retention decision reachable only'));
});

test('materiality-floor.md defines {area} as an exact-match grouping key', () => {
  const entryIdx = FLOOR.indexOf('## Entry format');
  const containerIdx = FLOOR.indexOf('## Container');
  const section = FLOOR.slice(entryIdx, containerIdx);
  assert.ok(entryIdx !== -1 && containerIdx > entryIdx, 'Entry format section must precede Container');
  assert.ok(/`\{area\}` is the subsystem/.test(section), '{area} must be defined, not just referenced');
  assert.ok(/exact match/i.test(section), 'the definition must state that clustering groups on it by exact match');
});

test('materiality-floor.md exempts the digest container from record-scoped sweeps', () => {
  assert.ok(FLOOR.includes('The digest issue is a container, not a work record.'));
  assert.ok(FLOOR.includes('isBacklog'), 'the exemption must name the predicate that would otherwise claim it');
  assert.ok(/never (?:shaped|scored|promoted|closed)/.test(FLOOR));
});

test('tidy Shape 1 carries the digest-container staleness exemption the contract promises', () => {
  const shape1 = TIDY_RECORDS.slice(
    TIDY_RECORDS.indexOf('### Shape 1'),
    TIDY_RECORDS.indexOf('### Shape 2'),
  );
  assert.ok(shape1.length > 0, 'Shape 1 section must exist');
  assert.match(shape1, /Digest containers are exempt/);
  assert.ok(shape1.includes('_shared/materiality-floor.md'));
  assert.match(shape1, /Keep — materiality-floor digest container/);
});

test('deferral-gate.md\'s bundling bullet cites materiality-floor.md by literal path', () => {
  const bullet = GATE.split('\n').find((l) => l.includes('"Bundle of small items"'));
  assert.ok(bullet, 'deferral-gate.md must still carry the "Bundle of small items" bad-reason bullet');
  assert.ok(
    bullet.includes('_shared/materiality-floor.md'),
    'the citation must sit on the bundling bullet itself, not merely somewhere else in the file',
  );
});

test('digest-sweep.md states the cluster-promotion threshold, per-line marker, and always-promotable rule', () => {
  assert.ok(SWEEP.includes('3 or more'));
  assert.ok(SWEEP.includes('→ #{n}'));
  assert.match(SWEEP.toLowerCase(), /remain manually promotable or\s+re-filable at any time/);
});

test('digest-sweep.md states the expiry age, the 100-comment rollover, and the no-digest/two-digest edges', () => {
  assert.ok(SWEEP.includes('90 days'));
  assert.ok(SWEEP.includes('100 comments'));
  assert.ok(SWEEP.toLowerCase().includes('no-ops silently'));
  assert.ok(SWEEP.toLowerCase().includes('bootstrap-race repair'));
});

test('tidy/SKILL.md cites digest-sweep.md instead of restating its procedures', () => {
  assert.ok(TIDY_SKILL.includes('digest-sweep.md'));
  assert.ok(!TIDY_SKILL.includes('90 days'));
});

test('tidy/SKILL.md stays within its context-cost ceiling', () => {
  const bytes = Buffer.byteLength(TIDY_SKILL, 'utf8');
  assert.ok(bytes <= 40960, `tidy/SKILL.md is ${bytes} bytes, over the 40960 ceiling`);
});

const ADOPTERS = [
  'plugin/skills/review/step3-routing.md',
  'plugin/skills/wrap-up/residue-sweep.md',
  'plugin/skills/wrap-up/leftover-routing.md',
  'plugin/skills/reflect/full-mode.md',
  'plugin/skills/reflect/hindsight-mode.md',
  'plugin/skills/visual-review/browser-review.md',
  'plugin/skills/code-health/filing.md',
  'plugin/skills/docs-health/SKILL.md',
  'plugin/skills/harness-health/filing.md',
  'plugin/skills/journey-health/SKILL.md',
];

for (const rel of ADOPTERS) {
  test(`${rel} cites materiality-floor.md at its filing point`, () => {
    assert.match(read(rel), /_shared\/materiality-floor\.md/);
  });
}

test('no adopter file restates the floor\'s three-axis definition', () => {
  for (const rel of ADOPTERS) {
    assert.doesNotMatch(
      read(rel),
      /size:low.*priority:low.*risk:low/,
      `${rel} appears to restate the floor's definition instead of citing it`,
    );
  }
});

test('the four health sweeps state materiality-floor-before-cap-digest ordering', () => {
  const HEALTH_FILES = [
    'plugin/skills/code-health/filing.md',
    'plugin/skills/docs-health/SKILL.md',
    'plugin/skills/harness-health/filing.md',
    'plugin/skills/journey-health/SKILL.md',
  ];
  for (const rel of HEALTH_FILES) {
    assert.match(
      read(rel),
      /[Bb]efore the (drain-rate cap check|cap check)/,
      `${rel} should state the floor is consulted before its own cap digest check`,
    );
  }
});

test('reflect\'s and visual-review\'s recommend-only Defer bullets state accept-time (not recommendation-time) digest write', () => {
  const RECOMMEND_ONLY = [
    'plugin/skills/reflect/full-mode.md',
    'plugin/skills/visual-review/browser-review.md',
  ];
  for (const rel of RECOMMEND_ONLY) {
    assert.match(
      read(rel),
      /approves|approved/,
      `${rel} should state the digest entry is written only once a human approves the recommendation`,
    );
  }
});

test('multi-branch adopter files cite materiality-floor.md at each of their two filing branches', () => {
  const MULTI_BRANCH = [
    'plugin/skills/review/step3-routing.md',
    'plugin/skills/reflect/full-mode.md',
    'plugin/skills/visual-review/browser-review.md',
  ];
  for (const rel of MULTI_BRANCH) {
    const count = (read(rel).match(/_shared\/materiality-floor\.md/g) || []).length;
    assert.ok(
      count >= 2,
      `${rel} should cite _shared/materiality-floor.md at both of its filing branches (found ${count})`,
    );
  }
});
