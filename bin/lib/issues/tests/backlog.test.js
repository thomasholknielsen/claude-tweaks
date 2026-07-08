const { test } = require('node:test');
const assert = require('node:assert');
const { categoryLabel, inboxIssuePayload, parkedIssuePayload, extractWatchedPaths, CATEGORIES } = require('../backlog');

test('CATEGORIES lists the four backlog categories', () => {
  assert.deepStrictEqual(CATEGORIES, ['product', 'technical', 'legal', 'infrastructure']);
});

test('categoryLabel formats as backlog:category-<value>', () => {
  assert.strictEqual(categoryLabel('technical'), 'backlog:category-technical');
});

// ── inboxIssuePayload ────────────────────────────────────────────────────

const INBOX_INPUT = {
  title: 'Voice command to add item to shopping list',
  related: 'none',
  context: 'User asked for hands-free entry while cooking.',
  scope: 'Voice capture UI + parsing into existing shopping-list schema.',
  category: 'product',
};

test('inboxIssuePayload labels are backlog + backlog:category-<value>', () => {
  assert.deepStrictEqual(inboxIssuePayload(INBOX_INPUT).labels, ['backlog', 'backlog:category-product']);
});

test('inboxIssuePayload title is the entry title', () => {
  assert.strictEqual(inboxIssuePayload(INBOX_INPUT).title, INBOX_INPUT.title);
});

test('inboxIssuePayload body carries Related, Context, and Scope', () => {
  const { body } = inboxIssuePayload(INBOX_INPUT);
  assert.ok(body.includes('**Related:** none'));
  assert.ok(body.includes('Context: User asked for hands-free entry while cooking.'));
  assert.ok(body.includes('Scope: Voice capture UI + parsing into existing shopping-list schema.'));
});

test('inboxIssuePayload body has no Category prose — category lives in the label only', () => {
  const { body } = inboxIssuePayload(INBOX_INPUT);
  assert.ok(!body.includes('Category'));
});

test('inboxIssuePayload defaults Related to "none" when omitted', () => {
  const { body } = inboxIssuePayload({ ...INBOX_INPUT, related: undefined });
  assert.ok(body.includes('**Related:** none'));
});

// ── parkedIssuePayload ───────────────────────────────────────────────────

const PARKED_INPUT = {
  title: 'Fix flaky tests/statusline.test.js "render under 500ms" timing assertion',
  origin: 'Observed repeatedly during the Impeccable re-baseline work.',
  context: 'Passes in isolation but intermittently fails under full-suite load.',
  trigger: 'Revisit when someone next touches tests/statusline.test.js or the statusline renderer.',
  optionsConsidered: '(a) raise the timing budget; (b) mock the slow dependency; (c) move to a separate benchmark suite.',
  category: 'technical',
};

test('parkedIssuePayload labels are backlog + parked + backlog:category-<value>', () => {
  assert.deepStrictEqual(parkedIssuePayload(PARKED_INPUT).labels, ['backlog', 'parked', 'backlog:category-technical']);
});

test('parkedIssuePayload title is the entry title', () => {
  assert.strictEqual(parkedIssuePayload(PARKED_INPUT).title, PARKED_INPUT.title);
});

test('parkedIssuePayload body carries Origin, Context, Trigger, and Options considered', () => {
  const { body } = parkedIssuePayload(PARKED_INPUT);
  assert.ok(body.includes('**Origin:** Observed repeatedly during the Impeccable re-baseline work.'));
  assert.ok(body.includes('Context: Passes in isolation but intermittently fails under full-suite load.'));
  assert.ok(body.includes('**Trigger:** Revisit when someone next touches tests/statusline.test.js or the statusline renderer.'));
  assert.ok(body.includes('Options considered: (a) raise the timing budget'));
});

test('parkedIssuePayload body omits Watched paths when not given', () => {
  const { body } = parkedIssuePayload(PARKED_INPUT);
  assert.ok(!body.includes('Watched paths'));
});

test('parkedIssuePayload body includes Watched paths when given a non-empty array', () => {
  const { body } = parkedIssuePayload({ ...PARKED_INPUT, watchedPaths: ['tests/statusline.test.js', 'bin/statusline.js'] });
  assert.ok(body.includes('**Watched paths:** tests/statusline.test.js, bin/statusline.js'));
});

test('parkedIssuePayload body omits Watched paths when given an empty array', () => {
  const { body } = parkedIssuePayload({ ...PARKED_INPUT, watchedPaths: [] });
  assert.ok(!body.includes('Watched paths'));
});

test('parkedIssuePayload places Watched paths between Trigger and Options considered', () => {
  const { body } = parkedIssuePayload({ ...PARKED_INPUT, watchedPaths: ['a.js'] });
  const triggerIdx = body.indexOf('**Trigger:**');
  const watchedIdx = body.indexOf('**Watched paths:**');
  const optionsIdx = body.indexOf('Options considered:');
  assert.ok(triggerIdx < watchedIdx && watchedIdx < optionsIdx, 'expected Trigger < Watched paths < Options considered');
});

// ── extractWatchedPaths ──────────────────────────────────────────────────

test('extractWatchedPaths returns null when the field is absent', () => {
  const { body } = parkedIssuePayload(PARKED_INPUT);
  assert.strictEqual(extractWatchedPaths(body), null);
});

test('extractWatchedPaths returns the trimmed path array when the field is present', () => {
  const { body } = parkedIssuePayload({ ...PARKED_INPUT, watchedPaths: ['tests/statusline.test.js', 'bin/statusline.js'] });
  assert.deepStrictEqual(extractWatchedPaths(body), ['tests/statusline.test.js', 'bin/statusline.js']);
});

test('extractWatchedPaths round-trips through parkedIssuePayload for a single path', () => {
  const { body } = parkedIssuePayload({ ...PARKED_INPUT, watchedPaths: ['a.js'] });
  assert.deepStrictEqual(extractWatchedPaths(body), ['a.js']);
});

test('extractWatchedPaths returns null for a body with other bold fields but no Watched paths', () => {
  assert.strictEqual(extractWatchedPaths('**Origin:** x\n\nContext: y'), null);
});

test('extractWatchedPaths returns null for non-string input', () => {
  assert.strictEqual(extractWatchedPaths(undefined), null);
  assert.strictEqual(extractWatchedPaths(null), null);
});
