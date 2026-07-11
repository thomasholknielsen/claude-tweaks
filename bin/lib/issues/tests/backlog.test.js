const { test } = require('node:test');
const assert = require('node:assert');
const { categoryLabel, inboxIssuePayload, parkedIssuePayload, extractWatchedPaths, classifyBacklogIssue, CATEGORIES } = require('../backlog');

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

// ── classifyBacklogIssue ─────────────────────────────────────────────────

const OPEN_INBOX_ISSUE = {
  number: 101,
  title: 'Voice command to add item to shopping list',
  labels: [{ name: 'backlog' }, { name: 'backlog:category-product' }],
  body: '**Related:** none\n\nContext: came up in a call\n\nScope: needs a new intent',
  milestone: null,
  updatedAt: '2026-07-01T00:00:00Z',
  url: 'https://github.com/acme/repo/issues/101',
};

const PARKED_ISSUE = {
  number: 102,
  title: 'Revisit /deepen boundary',
  labels: [{ name: 'backlog' }, { name: 'parked' }, { name: 'backlog:category-technical' }, { name: 'backlog:priority-low' }],
  body: '**Origin:** ADR 0001\n\nContext: shipped standalone\n\n**Trigger:** if skill count grows\n\nOptions considered: merge into /simplify',
  milestone: { title: 'Before launch' },
  updatedAt: '2026-06-14T00:00:00Z',
  url: 'https://github.com/acme/repo/issues/102',
};

const PARKED_WITH_WATCHED_PATHS = {
  number: 103,
  title: 'Load-tolerant statusline perf assertion',
  labels: [{ name: 'backlog' }, { name: 'parked' }, { name: 'backlog:category-technical' }],
  body: '**Origin:** flake report\n\nContext: flakes under load\n\n**Trigger:** touching statusline.test.js\n\n**Watched paths:** tests/statusline.test.js, bin/statusline.js\n\nOptions considered: CPU time instead of wall clock',
  milestone: null,
  updatedAt: '2026-07-04T00:00:00Z',
  url: 'https://github.com/acme/repo/issues/103',
};

const PARKED_ISSUE_WITH_DUE_DATE = {
  ...PARKED_ISSUE,
  milestone: { title: 'Before launch', dueOn: '2026-08-01T00:00:00Z' },
};

test('classifyBacklogIssue: open backlog issue with no parked label is stage "inbox"', () => {
  assert.strictEqual(classifyBacklogIssue(OPEN_INBOX_ISSUE).stage, 'inbox');
});

test('classifyBacklogIssue: issue carrying the parked label is stage "parked"', () => {
  assert.strictEqual(classifyBacklogIssue(PARKED_ISSUE).stage, 'parked');
});

test('classifyBacklogIssue extracts category from the backlog:category-* label', () => {
  assert.strictEqual(classifyBacklogIssue(OPEN_INBOX_ISSUE).category, 'product');
});

test('classifyBacklogIssue category is null when no category label is present', () => {
  const noCategoryIssue = { ...OPEN_INBOX_ISSUE, labels: [{ name: 'backlog' }] };
  assert.strictEqual(classifyBacklogIssue(noCategoryIssue).category, null);
});

test('classifyBacklogIssue extracts priority from the backlog:priority-* label', () => {
  assert.strictEqual(classifyBacklogIssue(PARKED_ISSUE).priority, 'low');
});

test('classifyBacklogIssue priority is null when no priority label is present', () => {
  assert.strictEqual(classifyBacklogIssue(OPEN_INBOX_ISSUE).priority, null);
});

test('classifyBacklogIssue surfaces the attached milestone title', () => {
  assert.strictEqual(classifyBacklogIssue(PARKED_ISSUE).milestone, 'Before launch');
});

test('classifyBacklogIssue milestone is null when none is attached', () => {
  assert.strictEqual(classifyBacklogIssue(OPEN_INBOX_ISSUE).milestone, null);
});

test('classifyBacklogIssue surfaces the attached milestone due date', () => {
  assert.strictEqual(classifyBacklogIssue(PARKED_ISSUE_WITH_DUE_DATE).milestoneDueOn, '2026-08-01T00:00:00Z');
});

test('classifyBacklogIssue milestoneDueOn is null when the milestone has no due date', () => {
  assert.strictEqual(classifyBacklogIssue(PARKED_ISSUE).milestoneDueOn, null);
});

test('classifyBacklogIssue milestoneDueOn is null when no milestone is attached', () => {
  assert.strictEqual(classifyBacklogIssue(OPEN_INBOX_ISSUE).milestoneDueOn, null);
});

test('classifyBacklogIssue extracts watchedPaths from the body via extractWatchedPaths', () => {
  assert.deepStrictEqual(classifyBacklogIssue(PARKED_WITH_WATCHED_PATHS).watchedPaths, ['tests/statusline.test.js', 'bin/statusline.js']);
});

test('classifyBacklogIssue watchedPaths is null when the body has no Watched paths field', () => {
  assert.strictEqual(classifyBacklogIssue(PARKED_ISSUE).watchedPaths, null);
});

test('classifyBacklogIssue passes through number, title, updatedAt, and url unchanged', () => {
  const result = classifyBacklogIssue(OPEN_INBOX_ISSUE);
  assert.strictEqual(result.number, 101);
  assert.strictEqual(result.title, 'Voice command to add item to shopping list');
  assert.strictEqual(result.updatedAt, '2026-07-01T00:00:00Z');
  assert.strictEqual(result.url, 'https://github.com/acme/repo/issues/101');
});

test('classifyBacklogIssue handles bare-string labels (not {name} objects)', () => {
  const bareLabels = { ...OPEN_INBOX_ISSUE, labels: ['backlog', 'backlog:category-product'] };
  const result = classifyBacklogIssue(bareLabels);
  assert.strictEqual(result.stage, 'inbox');
  assert.strictEqual(result.category, 'product');
});
