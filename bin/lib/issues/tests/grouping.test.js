// bin/lib/issues/tests/grouping.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { groupByFileOverlap, extractKeyFiles, parseExplicitIssueList, selectGroupsForExplicitList } = require('../grouping');

// ── groupByFileOverlap ──────────────────────────────────────────────────────

test('empty input returns no groups', () => {
  assert.deepStrictEqual(groupByFileOverlap([]), []);
});

test('items with no shared files are all singletons', () => {
  const groups = groupByFileOverlap([
    { id: 1, keyFiles: ['a.js'] },
    { id: 2, keyFiles: ['b.js'] },
    { id: 3, keyFiles: [] },
  ]);
  assert.strictEqual(groups.length, 3);
  for (const g of groups) assert.strictEqual(g.length, 1);
});

test('two items sharing a file land in one group', () => {
  const groups = groupByFileOverlap([
    { id: 1, keyFiles: ['a.js'] },
    { id: 2, keyFiles: ['a.js', 'b.js'] },
  ]);
  assert.strictEqual(groups.length, 1);
  assert.deepStrictEqual(groups[0].sort(), [1, 2]);
});

test('transitive overlap (A-B share file1, B-C share file2, A-C share nothing directly) is one group', () => {
  const groups = groupByFileOverlap([
    { id: 'A', keyFiles: ['f1.js'] },
    { id: 'B', keyFiles: ['f1.js', 'f2.js'] },
    { id: 'C', keyFiles: ['f2.js'] },
  ]);
  assert.strictEqual(groups.length, 1);
  assert.deepStrictEqual(groups[0].sort(), ['A', 'B', 'C']);
});

test('unrelated pair stays separate from an overlapping pair in the same batch', () => {
  const groups = groupByFileOverlap([
    { id: 1, keyFiles: ['a.js'] },
    { id: 2, keyFiles: ['a.js'] },
    { id: 3, keyFiles: ['z.js'] },
  ]);
  const sizes = groups.map((g) => g.length).sort();
  assert.deepStrictEqual(sizes, [1, 2]);
});

test('item with empty keyFiles never merges with anything', () => {
  const groups = groupByFileOverlap([
    { id: 1, keyFiles: [] },
    { id: 2, keyFiles: [] },
  ]);
  assert.strictEqual(groups.length, 2);
});

test('group order matches first-seen order of each group', () => {
  const groups = groupByFileOverlap([
    { id: 1, keyFiles: ['a.js'] },
    { id: 2, keyFiles: ['b.js'] },
  ]);
  assert.deepStrictEqual(groups[0], [1]);
  assert.deepStrictEqual(groups[1], [2]);
});

// ── extractKeyFiles ──────────────────────────────────────────────────────────

test('extracts the anchor file from a v2 code-health issue body', () => {
  const issue = {
    labels: ['code-health', 'code-health:risk-high'],
    body: [
      '<!-- code-health-fingerprint: recon-ab12cd34 -->',
      '',
      '**Criterion:** simplification | **Risk:** high',
      '',
      '## Current State',
      '',
      'Anchor: `src/api/user.js#getUser`',
      '',
      'evidence text',
    ].join('\n'),
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['src/api/user.js']);
});

test('extracts the Files line from a v1 code-health issue body', () => {
  const issue = {
    labels: ['code-health', 'code-health:high'],
    body: [
      '<!-- code-health-fingerprint: recon-abc12345 -->',
      '',
      '**Lens:** oversized-file | **Severity:** high',
      '',
      '## Current State',
      '',
      'Files: apps/web/big.js, apps/web/small.js',
      '',
      'evidence text',
    ].join('\n'),
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['apps/web/big.js', 'apps/web/small.js']);
});

test('returns [] for a v1 code-health issue with "(no specific file)"', () => {
  const issue = {
    labels: ['code-health'],
    body: 'Files: (no specific file)',
  };
  assert.deepStrictEqual(extractKeyFiles(issue), []);
});

test('extracts the anchor file from a by:code-health issue body (post-migration origin label)', () => {
  const issue = {
    labels: ['by:code-health', 'code-health:risk-high', 'risk:high', 'effort:low'],
    body: [
      '<!-- work-fingerprint: recon-ab12cd34 -->',
      '',
      '**Criterion:** simplification | **Risk:** high',
      '',
      '## Current State',
      '',
      'Anchor: `src/api/user.js#getUser`',
      '',
      'evidence text',
    ].join('\n'),
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['src/api/user.js']);
});

test('extracts the target from a harness-health issue body', () => {
  const issue = {
    labels: ['harness-health', 'harness-health:additive'],
    body: '**Skill:** skills/triage/SKILL.md | **Section:** Step 4 | **Category:** rule-gap | **Classification:** additive | **Confidence:** high',
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['skills/triage/SKILL.md']);
});

test('returns [] for a harness-health new-skill candidate, not a scraped path from its embedded proposedBody', () => {
  // Real shape from bin/lib/harness-health/issue-payload.js:14-19 — the header
  // line has no colon inside the bold run ("**New skill candidate**", not
  // "**Something:**"), so it can't match BOLD_HEADER_RE. The proposed
  // skill's own body is embedded verbatim afterward and commonly contains its
  // own bold, colon-terminated, line-starting labels (SKILL.md frontmatter
  // convention) — without the new-skill short-circuit, extraction would fall
  // through to the first such line and return an unrelated, wrong path.
  const issue = {
    labels: ['harness-health', 'harness-health:new-skill'],
    body: [
      '<!-- harness-health-fingerprint: hh-abc123 -->',
      '',
      '**New skill candidate** | **Confidence:** high',
      '',
      '## Current State',
      '',
      'Gap: no skill covers X.',
      '',
      '## Deliverables',
      '',
      'Proposed new skill `skills/example/SKILL.md`:',
      '',
      '**Trigger:** the misleading bold line an unfixed regex would latch onto',
    ].join('\n'),
  };
  assert.deepStrictEqual(extractKeyFiles(issue), []);
});

test('extracts the target from a by:harness-health issue body (post-migration origin label)', () => {
  const issue = {
    labels: ['by:harness-health', 'harness-health:additive', 'risk:low', 'effort:low'],
    body: '**Skill:** skills/triage/SKILL.md | **Section:** Step 4 | **Category:** rule-gap | **Classification:** additive | **Confidence:** high',
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['skills/triage/SKILL.md']);
});

test('extracts the journey file from a by:journey-health issue body', () => {
  // Real header shape from bin/lib/journey-health/issue-payload.js:26 —
  // "**Journey:** {path} | **Section:** ..." — the same bold-field shape
  // BOLD_HEADER_RE already extracts for harness-health.
  const issue = {
    labels: ['by:journey-health', 'journey-health:drift', 'risk:medium', 'effort:medium'],
    body: '**Journey:** docs/journeys/checkout.md | **Section:** Step 3 | **Category:** drift | **Severity:** med | **Confidence:** high',
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['docs/journeys/checkout.md']);
});

test('returns [] when the issue carries neither code-health nor harness-health labels', () => {
  const issue = { labels: ['backlog'], body: 'Files: a.js' };
  assert.deepStrictEqual(extractKeyFiles(issue), []);
});

test('returns [] when body is missing', () => {
  assert.deepStrictEqual(extractKeyFiles({ labels: ['code-health'] }), []);
});

test('accepts label objects ({name}) as well as plain strings', () => {
  const issue = {
    labels: [{ name: 'code-health' }],
    body: 'Anchor: `src/x.js#fn`',
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['src/x.js']);
});

// ── parseExplicitIssueList ───────────────────────────────────────────────────

test('parses a single bare number with a leading #', () => {
  assert.deepStrictEqual(parseExplicitIssueList('#123'), [123]);
});

test('parses a comma-joined list, trimming whitespace around entries', () => {
  assert.deepStrictEqual(parseExplicitIssueList('#123, #124,#130'), [123, 124, 130]);
});

test('accepts entries without a leading #', () => {
  assert.deepStrictEqual(parseExplicitIssueList('123,124'), [123, 124]);
});

test('filters out non-numeric entries rather than throwing', () => {
  assert.deepStrictEqual(parseExplicitIssueList('#123,notanumber,#130'), [123, 130]);
});

test('empty string returns an empty array', () => {
  assert.deepStrictEqual(parseExplicitIssueList(''), []);
});

// ── selectGroupsForExplicitList ──────────────────────────────────────────────

test('selects the single group containing a requested number', () => {
  const groups = [[{ number: 123 }, { number: 124 }], [{ number: 130 }]];
  const result = selectGroupsForExplicitList([123], groups);
  assert.deepStrictEqual(result.selectedGroups, [[{ number: 123 }, { number: 124 }]]);
  assert.deepStrictEqual(result.notFound, []);
});

test('two requested numbers in the same group produce one selected group, not two', () => {
  const groups = [[{ number: 123 }, { number: 124 }], [{ number: 130 }]];
  const result = selectGroupsForExplicitList([123, 124], groups);
  assert.strictEqual(result.selectedGroups.length, 1);
  assert.deepStrictEqual(result.notFound, []);
});

test('two requested numbers in different groups produce two selected groups', () => {
  const groups = [[{ number: 123 }], [{ number: 130 }]];
  const result = selectGroupsForExplicitList([123, 130], groups);
  assert.strictEqual(result.selectedGroups.length, 2);
});

test('a requested number not present in any group is reported in notFound, not thrown', () => {
  const groups = [[{ number: 123 }]];
  const result = selectGroupsForExplicitList([123, 999], groups);
  assert.deepStrictEqual(result.selectedGroups, [[{ number: 123 }]]);
  assert.deepStrictEqual(result.notFound, [999]);
});

test('requesting nothing returns no selected groups and no notFound', () => {
  const groups = [[{ number: 123 }]];
  const result = selectGroupsForExplicitList([], groups);
  assert.deepStrictEqual(result.selectedGroups, []);
  assert.deepStrictEqual(result.notFound, []);
});
