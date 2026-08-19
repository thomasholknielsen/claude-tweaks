'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { buildWorklist } = require('../../../plugin/bin/lib/wrap-up/engine-plan');

const FACTS = { isRepo: true, changedFiles: ['src/a.js', 'src/b.js'], renamedDeleted: [],
  skillsLibraryExists: false, multiFileDiff: true, docsTreeNonEmpty: false,
  journeysExist: true, journeyFiles: ['docs/journeys/j1.md', 'docs/journeys/j2.md'],
  claudeMdCommandRenamed: false, renamedOrDeleted: false, headingRenamed: false,
  claudeMdOverBudget: false };

test('fact gates open on any listed fact', () => {
  const wl = buildWorklist({ facts: FACTS, signals: {}, ceremonyProfile: 'standard', budgets: {} });
  const row = (id) => wl.rows.find((r) => r.id === id);
  assert.strictEqual(row('skills').gate, 'open');       // multiFileDiff superset
  assert.strictEqual(row('docs').gate, 'closed');
  assert.strictEqual(row('references').gate, 'closed');
  assert.match(row('docs').gateReason, /docs/);
});

test('references gate opens on a renamed heading alone', () => {
  // No rename and no deletion — only a heading changed inside a modified file.
  // The old gate (renamedOrDeleted only) closed the row here, which made
  // reference-sweep.md's heading-collection instruction unreachable.
  const wl = buildWorklist({ facts: { ...FACTS, headingRenamed: true }, signals: {}, ceremonyProfile: 'standard', budgets: {} });
  const row = wl.rows.find((r) => r.id === 'references');
  assert.strictEqual(row.gate, 'open');
  assert.strictEqual(row.gateReason, 'a heading was renamed in a modified file');
});

test('references closed reason names both facts', () => {
  const wl = buildWorklist({ facts: FACTS, signals: {}, ceremonyProfile: 'standard', budgets: {} });
  assert.strictEqual(
    wl.rows.find((r) => r.id === 'references').gateReason,
    'no renames or deletions in diff, no renamed headings');
});

test('signal gates open on signals and close without', () => {
  const open = buildWorklist({ facts: FACTS, signals: { d4Count: 2 }, ceremonyProfile: 'standard', budgets: {} });
  assert.strictEqual(open.rows.find((r) => r.id === 'memory').gate, 'open');
  const closed = buildWorklist({ facts: FACTS, signals: {}, ceremonyProfile: 'standard', budgets: {} });
  assert.strictEqual(closed.rows.find((r) => r.id === 'memory').gate, 'closed');
});

test('claude-md gate opens on fact OR signal', () => {
  const byFact = buildWorklist({ facts: { ...FACTS, claudeMdCommandRenamed: true }, signals: {}, ceremonyProfile: 'standard', budgets: {} });
  assert.strictEqual(byFact.rows.find((r) => r.id === 'claude-md').gate, 'open');
  const bySignal = buildWorklist({ facts: FACTS, signals: { incidentRecorded: true }, ceremonyProfile: 'standard', budgets: {} });
  assert.strictEqual(bySignal.rows.find((r) => r.id === 'claude-md').gate, 'open');
});

test('claude-md gate opens on claudeMdOverBudget alone', () => {
  const wl = buildWorklist({ facts: { ...FACTS, claudeMdOverBudget: true }, signals: {}, ceremonyProfile: 'standard', budgets: {} });
  assert.strictEqual(wl.rows.find((r) => r.id === 'claude-md').gate, 'open');
});

test('claude-md gate stays closed when claudeMdOverBudget is false alongside every other signal', () => {
  const wl = buildWorklist({ facts: { ...FACTS, claudeMdOverBudget: false }, signals: {}, ceremonyProfile: 'standard', budgets: {} });
  assert.strictEqual(wl.rows.find((r) => r.id === 'claude-md').gate, 'closed');
});

test('claude-md gateReason names claudeMdOverBudget in both directions', () => {
  const open = buildWorklist({ facts: { ...FACTS, claudeMdOverBudget: true }, signals: {}, ceremonyProfile: 'standard', budgets: {} });
  assert.strictEqual(
    open.rows.find((r) => r.id === 'claude-md').gateReason,
    'CLAUDE.md/rules over the size budget');

  const closed = buildWorklist({ facts: { ...FACTS, claudeMdOverBudget: false }, signals: {}, ceremonyProfile: 'standard', budgets: {} });
  assert.strictEqual(
    closed.rows.find((r) => r.id === 'claude-md').gateReason,
    'CLAUDE.md Commands section unchanged, CLAUDE.md/rules within budget, no signals raised');
});

test('cap resolution: flag beats fast-lane beats default', () => {
  const flag = buildWorklist({ facts: { ...FACTS, skillsLibraryExists: true }, signals: {}, ceremonyProfile: 'fast-lane', budgets: { 'skill-budget': 7 } });
  assert.deepStrictEqual(
    (({ cap, capSource }) => ({ cap, capSource }))(flag.rows.find((r) => r.id === 'skills').scope),
    { cap: 7, capSource: 'flag' });
  const fast = buildWorklist({ facts: { ...FACTS, skillsLibraryExists: true }, signals: {}, ceremonyProfile: 'fast-lane', budgets: {} });
  assert.strictEqual(fast.rows.find((r) => r.id === 'skills').scope.cap, 2);
});

test('frontmatter-overlap computes journey candidates', () => {
  const wl = buildWorklist({ facts: FACTS, signals: {}, ceremonyProfile: 'standard', budgets: {},
    journeyFrontmatter: { 'docs/journeys/j1.md': ['src/a.js'], 'docs/journeys/j2.md': ['other.js'] } });
  assert.deepStrictEqual(wl.rows.find((r) => r.id === 'journeys').scope.candidates, ['docs/journeys/j1.md']);
});

test('every registry row appears exactly once, in order', () => {
  const wl = buildWorklist({ facts: FACTS, signals: {}, ceremonyProfile: 'standard', budgets: {} });
  assert.deepStrictEqual(wl.rows.map((r) => r.id), require('../../../plugin/bin/lib/wrap-up/registry').ROW_IDS);
});
