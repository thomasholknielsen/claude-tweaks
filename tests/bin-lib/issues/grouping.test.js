// tests/bin-lib/issues/grouping.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { groupByFileOverlap, extractKeyFiles, extractKeyFilesSection, expectsKeyFilesSection, parseExplicitIssueList, selectGroupsForExplicitList } = require('../../../plugin/bin/lib/issues/grouping');

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

// ── groupByFileOverlap: hub-path exclusion (#1365) ────────────────────────────
// A generic/hub-like path (e.g. tests/) referenced by an anomalously large
// fraction of the batch must never act as a transitive union-find bridge
// between otherwise-unrelated items — see grouping.js's HUB_PATH_MIN_COUNT/
// HUB_PATH_FRACTION for the threshold this exercises.

test('N otherwise-unrelated items sharing only one hub-like path stay as N singletons', () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, keyFiles: ['tests/'] }));
  const groups = groupByFileOverlap(items);
  assert.strictEqual(groups.length, 12, 'must not collapse into one 12-member group');
  for (const g of groups) assert.strictEqual(g.length, 1);
});

test('a hub-like path is excluded from bridging, but a real shared file among a few items still groups them', () => {
  const items = [
    { id: 1, keyFiles: ['tests/', 'src/real.js'] },
    { id: 2, keyFiles: ['tests/', 'src/real.js'] },
    ...Array.from({ length: 10 }, (_, i) => ({ id: i + 3, keyFiles: ['tests/'] })),
  ];
  const groups = groupByFileOverlap(items);
  // Items 1 and 2 still union via src/real.js (a non-hub file); the other 10
  // items, whose only file is the hub path, remain singletons.
  const sizes = groups.map((g) => g.length).sort((a, b) => a - b);
  assert.deepStrictEqual(sizes, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2]);
  const pair = groups.find((g) => g.length === 2);
  assert.deepStrictEqual(pair.sort(), [1, 2]);
});

test('existing small-batch behavior (below the hub threshold) is unchanged with default options', () => {
  // Same shape as the pre-existing "two items sharing a file land in one
  // group" test — 2 shared references never crosses the default hubPathMinCount (3).
  const groups = groupByFileOverlap([
    { id: 1, keyFiles: ['a.js'] },
    { id: 2, keyFiles: ['a.js', 'b.js'] },
  ]);
  assert.strictEqual(groups.length, 1);
  assert.deepStrictEqual(groups[0].sort(), [1, 2]);
});

test('a custom hubPathMinCount lets a smaller batch exercise the exclusion deterministically', () => {
  const items = [
    { id: 1, keyFiles: ['hub.js'] },
    { id: 2, keyFiles: ['hub.js'] },
    { id: 3, keyFiles: ['hub.js'] },
  ];
  // With hubPathMinCount lowered to 2 (and fraction 0 to disable that half of
  // the max()), hub.js's 3 references clear the threshold at a tiny batch size.
  const groups = groupByFileOverlap(items, { hubPathMinCount: 2, hubPathFraction: 0 });
  assert.strictEqual(groups.length, 3);
  for (const g of groups) assert.strictEqual(g.length, 1);
});

test('hubPathFraction alone can trigger exclusion even below hubPathMinCount, when explicitly lowered', () => {
  const items = [
    { id: 1, keyFiles: ['hub.js'] },
    { id: 2, keyFiles: ['hub.js'] },
  ];
  // fraction 0.5 of a 2-item batch = 1, but hubPathMinCount default (3) would
  // normally win via max() — override it down to 1 to isolate the fraction path.
  const groups = groupByFileOverlap(items, { hubPathMinCount: 1, hubPathFraction: 0.5 });
  assert.strictEqual(groups.length, 2);
});

test('an item whose only files are all hub paths never merges, but still appears as its own singleton', () => {
  const items = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, keyFiles: ['tests/', 'docs/donts.md'] }));
  const groups = groupByFileOverlap(items);
  assert.strictEqual(groups.length, 5);
});

// ── groupByFileOverlap: bare directory-entry exclusion (#1420) ─────────────
// A bare directory-level Key Files entry (trailing "/", no filename) must
// never bridge two records via union-find, regardless of citation count —
// including below the #1365 hub-path threshold. Each test below keeps the hub
// rule out of play, so a failure can only mean the directory rule broke:
// either 2 shared references (never clears HUB_PATH_MIN_COUNT of 3) or an
// explicit hubPathMinCount: Infinity, which makes the hub set unreachable.

test('two records sharing only a bare directory entry stay as separate singletons, even below the hub threshold', () => {
  const items = [
    { id: 1, keyFiles: ['tests/'] },
    { id: 2, keyFiles: ['tests/'] },
  ];
  const groups = groupByFileOverlap(items);
  assert.strictEqual(groups.length, 2, 'must not union on a bare directory entry alone');
  for (const g of groups) assert.strictEqual(g.length, 1);
});

test('a handful of records sharing only a broad directory entry do not fuse into one mega-group (live failure shape)', () => {
  const items = [
    { id: 1, keyFiles: ['plugin/skills/'] },
    { id: 2, keyFiles: ['plugin/skills/'] },
    { id: 3, keyFiles: ['plugin/skills/'] },
    { id: 4, keyFiles: ['plugin/skills/'] },
  ];
  // 4 citations would clear the hub threshold on their own, which would make
  // this pass with the directory rule removed. Disable the hub rule so the
  // directory rule is the only thing keeping these four apart.
  const groups = groupByFileOverlap(items, { hubPathMinCount: Infinity });
  assert.strictEqual(groups.length, 4, 'a shared directory-level entry must not act as a universal connector');
  for (const g of groups) assert.strictEqual(g.length, 1);
});

test('a directory entry is excluded from bridging, but a real shared specific file among the same items still groups them', () => {
  const items = [
    { id: 1, keyFiles: ['tests/', 'src/real.js'] },
    { id: 2, keyFiles: ['tests/', 'src/real.js'] },
    { id: 3, keyFiles: ['tests/'] },
  ];
  // Hub rule disabled — 3 citations of tests/ would otherwise clear the hub
  // threshold and produce this same result without the directory rule.
  const groups = groupByFileOverlap(items, { hubPathMinCount: Infinity });
  // Items 1 and 2 still union via src/real.js (a specific file, not a
  // directory); item 3, whose only file is the directory entry, stays a
  // singleton.
  const sizes = groups.map((g) => g.length).sort((a, b) => a - b);
  assert.deepStrictEqual(sizes, [1, 2]);
  const pair = groups.find((g) => g.length === 2);
  assert.deepStrictEqual(pair.sort(), [1, 2]);
});

test('two records sharing an actual specific file path (not a directory) are still correctly unioned', () => {
  const groups = groupByFileOverlap([
    { id: 1, keyFiles: ['plugin/bin/lib/issues/grouping.js'] },
    { id: 2, keyFiles: ['plugin/bin/lib/issues/grouping.js'] },
  ]);
  assert.strictEqual(groups.length, 1);
  assert.deepStrictEqual(groups[0].sort(), [1, 2]);
});

// ── extractKeyFiles ──────────────────────────────────────────────────────────

test('extracts the anchor file from a v2 code-health issue body', () => {
  const issue = {
    labels: ['code-health', 'code-health:risk-high'],
    body: [
      '<!-- code-health-fingerprint: codehealth-ab12cd34 -->',
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
      '<!-- code-health-fingerprint: codehealth-abc12345 -->',
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
    labels: ['by:code-health', 'code-health:risk-high', 'risk:high', 'size:low'],
    body: [
      '<!-- work-fingerprint: codehealth-ab12cd34 -->',
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
    body: '**Skill:** skills/backlog/SKILL.md | **Section:** Step 4 | **Category:** rule-gap | **Classification:** additive | **Confidence:** high',
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['skills/backlog/SKILL.md']);
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
    labels: ['by:harness-health', 'harness-health:additive', 'risk:low', 'size:low'],
    body: '**Skill:** skills/backlog/SKILL.md | **Section:** Step 4 | **Category:** rule-gap | **Classification:** additive | **Confidence:** high',
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['skills/backlog/SKILL.md']);
});

test('extracts the journey file from a by:journey-health issue body', () => {
  // Real header shape from bin/lib/journey-health/issue-payload.js:26 —
  // "**Journey:** {path} | **Section:** ..." — the same bold-field shape
  // BOLD_HEADER_RE already extracts for harness-health.
  const issue = {
    labels: ['by:journey-health', 'journey-health:drift', 'risk:medium', 'size:medium'],
    body: '**Journey:** docs/journeys/checkout.md | **Section:** Step 3 | **Category:** drift | **Severity:** med | **Confidence:** high',
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['docs/journeys/checkout.md']);
});

test('extracts the doc file from a by:docs-health issue body', () => {
  // Real header shape from bin/lib/docs-health/issue-payload.js:31 —
  // "**Doc:** {path} | **Section:** ..." — the same bold-field shape
  // BOLD_HEADER_RE already extracts for harness-health and journey-health.
  const issue = {
    labels: ['by:docs-health', 'docs-health:additive', 'risk:low', 'size:low'],
    body: '**Doc:** docs/api.md | **Section:** Overview | **Category:** genre-drift | **Misleads:** human engineer | **Classification:** additive | **Confidence:** high',
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['docs/api.md']);
});

test('two by:docs-health issues targeting the same doc land in one group via extractKeyFiles + groupByFileOverlap', () => {
  const issueA = {
    id: 1,
    labels: ['by:docs-health'],
    body: '**Doc:** docs/api.md | **Section:** Overview | **Category:** genre-drift | **Misleads:** human engineer | **Classification:** additive | **Confidence:** high',
  };
  const issueB = {
    id: 2,
    labels: ['by:docs-health'],
    body: '**Doc:** docs/api.md | **Section:** Auth | **Category:** staleness | **Misleads:** coding agent | **Classification:** additive | **Confidence:** medium',
  };
  const items = [issueA, issueB].map((issue) => ({ id: issue.id, keyFiles: extractKeyFiles(issue) }));
  const groups = groupByFileOverlap(items);
  assert.strictEqual(groups.length, 1);
  assert.deepStrictEqual(groups[0].sort(), [1, 2]);
});

test('returns [] when the issue carries neither code-health nor harness-health labels', () => {
  const issue = { labels: ['backlog'], body: 'Files: a.js' };
  assert.deepStrictEqual(extractKeyFiles(issue), []);
});

test('returns [] when body is missing', () => {
  assert.deepStrictEqual(extractKeyFiles({ labels: ['code-health'] }), []);
});

test('preserves a space in a bold-header target path instead of truncating at the first whitespace character', () => {
  const issue = {
    labels: ['by:docs-health'],
    body: '**Doc:** docs/User Guide.md | **Section:** Overview | **Category:** genre-drift | **Misleads:** human engineer | **Classification:** additive | **Confidence:** high',
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['docs/User Guide.md']);
});

test('a code-health-shaped issue and a docs-health-shaped issue targeting the same space-containing path extract identically and group together', () => {
  const codeHealthIssue = { labels: ['by:code-health'], body: 'Files: docs/User Guide.md' };
  const docsHealthIssue = {
    labels: ['by:docs-health'],
    body: '**Doc:** docs/User Guide.md | **Section:** Overview',
  };
  const items = [
    { id: 1, keyFiles: extractKeyFiles(codeHealthIssue) },
    { id: 2, keyFiles: extractKeyFiles(docsHealthIssue) },
  ];
  assert.deepStrictEqual(
    items[0].keyFiles,
    items[1].keyFiles,
    'both extraction paths must produce the identical string for the same real file',
  );
  const groups = groupByFileOverlap(items);
  assert.strictEqual(
    groups.length,
    1,
    'must union into one dispatch claim group — the whole point of extractKeyFiles is preventing two agents from claiming the same file',
  );
});

test('accepts label objects ({name}) as well as plain strings', () => {
  const issue = {
    labels: [{ name: 'code-health' }],
    body: 'Anchor: `src/x.js#fn`',
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['src/x.js']);
});

// ── extractKeyFiles: the `### Key Files` fallthrough (#154) ──────────────────
// /specify-produced sub-issues and /capture records carry no by:* origin label, so
// they reach the fallthrough below the four health-sweep branches. Before #154
// that fallthrough was a bare `return []`, and every such record reported zero
// key files — making groupByFileOverlap emit singletons regardless of real
// overlap, which is exactly the collision guard /dispatch relies on.

const SPECIFY_SUB_ISSUE_LABELS = ['ready', 'type:feature', 'auto:build', 'priority:high', 'risk:medium', 'size:medium', 'ceremony:standard'];

test('extracts backticked paths from a /specify-produced sub-issue\'s ### Key Files subsection', () => {
  const issue = {
    labels: SPECIFY_SUB_ISSUE_LABELS,
    body: [
      'Surface: backend',
      '',
      '## Technical Approach',
      '',
      '### Key Files',
      '',
      '- `bin/lib/issues/grouping.js` (modify)',
      '- `skills/dispatch/SKILL.md` (check)',
      '',
      '### Gotchas',
      '',
      '- Do not touch `skills/specify/spec-template.md` — it is already correct.',
    ].join('\n'),
  };
  assert.deepStrictEqual(extractKeyFiles(issue), [
    'bin/lib/issues/grouping.js',
    'skills/dispatch/SKILL.md',
  ]);
});

test('stops at the next heading rather than scraping backticked paths out of ### Gotchas', () => {
  // The Gotchas section routinely names files in backticks. Bleeding past the
  // section boundary would union unrelated records on an incidental mention.
  const issue = {
    labels: SPECIFY_SUB_ISSUE_LABELS,
    body: [
      '### Key Files',
      '',
      '- `src/only-this-one.js` (modify)',
      '',
      '### Gotchas',
      '',
      '- `src/not-a-key-file.js` is merely mentioned here.',
    ].join('\n'),
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['src/only-this-one.js']);
});

test('ignores a trailing annotation, including one containing commas and bold markup', () => {
  // Real annotations from #146/#150. A comma inside the annotation must not be
  // treated as a path separator the way code-health's `Files:` line does.
  const issue = {
    labels: SPECIFY_SUB_ISSUE_LABELS,
    body: [
      '### Key Files',
      '',
      '- `skills/design-wrapper/modes/doctor.md` (create — **owns the finding schema**)',
      '- `skills/design-wrapper/SKILL.md` (modify — Universal preconditions Step 1 and Step 2, Reference sub-files list)',
    ].join('\n'),
  };
  assert.deepStrictEqual(extractKeyFiles(issue), [
    'skills/design-wrapper/modes/doctor.md',
    'skills/design-wrapper/SKILL.md',
  ]);
});

test('takes the first backticked span when a list item names an alternative', () => {
  // Real shape from record #154's own body:
  //   - `bin/lib/issues/tests/` or `tests/` (add — fixture-based coverage)
  const issue = {
    labels: SPECIFY_SUB_ISSUE_LABELS,
    body: '### Key Files\n\n- `bin/lib/issues/tests/` or `tests/` (add — fixture-based coverage)',
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['bin/lib/issues/tests/']);
});

test('skips an unfilled `{path}` template placeholder instead of grouping records on it', () => {
  // spec-template.md ships "- `{path}` — {what changes}". Two records that both
  // carry the unfilled template would otherwise union on the literal "{path}".
  const issue = {
    labels: SPECIFY_SUB_ISSUE_LABELS,
    body: '### Key Files\n\n- `{path}` — {what changes}\n- `src/real.js` (modify)',
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['src/real.js']);
});

test('returns [] for a record whose body has no ### Key Files section', () => {
  // Backlog and parked records have no such section by construction —
  // decomposition-mode.md: "skip silently rather than treating the absence as
  // an error."
  const issue = {
    labels: ['backlog', 'type:feature'],
    body: '## Overview\n\nA half-formed idea with no technical approach yet.',
  };
  assert.deepStrictEqual(extractKeyFiles(issue), []);
});

test('returns [] for a ### Key Files section that exists but lists no backticked path', () => {
  const issue = {
    labels: SPECIFY_SUB_ISSUE_LABELS,
    body: '### Key Files\n\n_To be determined during the build._\n\n### Gotchas\n',
  };
  assert.deepStrictEqual(extractKeyFiles(issue), []);
});

test('the ### Key Files branch is a fallthrough — it never shadows a health-sweep branch', () => {
  // [IL-83]: an exemption placed after an early return only runs on the branch
  // you did not put it after. A health record whose body happens to carry a
  // ### Key Files heading must still extract via its own origin branch.
  const issue = {
    labels: ['by:docs-health'],
    body: [
      '**Doc:** docs/api.md | **Section:** Overview',
      '',
      '### Key Files',
      '',
      '- `docs/SOMETHING-ELSE.md` (modify)',
    ].join('\n'),
  };
  assert.deepStrictEqual(extractKeyFiles(issue), ['docs/api.md']);
});

test('#146 and #150 real bodies land in ONE bundle of two, not two singletons', () => {
  // Frozen fixtures of the real issue bodies ([IL-80] — never fetched live).
  // Their true intersection is skills/design-wrapper/SKILL.md and
  // skills/design-wrapper/impeccable-plugin.md. Before #154, extractKeyFiles
  // returned [] for both and /dispatch would have built them in two separate
  // worktrees, each editing those same two files.
  const readFixture = (n) =>
    require('node:fs').readFileSync(
      require('node:path').join(__dirname, 'fixtures', `record-${n}-body.md`),
      'utf8',
    );
  const issue146 = { id: 146, labels: SPECIFY_SUB_ISSUE_LABELS, body: readFixture(146) };
  const issue150 = { id: 150, labels: SPECIFY_SUB_ISSUE_LABELS, body: readFixture(150) };

  const files146 = extractKeyFiles(issue146);
  const files150 = extractKeyFiles(issue150);

  assert.deepStrictEqual(files146, [
    'skills/design-wrapper/impeccable-plugin.md',
    'skills/design-wrapper/SKILL.md',
    'skills/design-wrapper/frontend-detection.md',
    'skills/design-wrapper/modes/live.md',
    'skills/design-wrapper/modes/review.md',
    'tests/impeccable-plugin-contract.test.js',
  ]);
  assert.deepStrictEqual(files150, [
    'skills/design-wrapper/modes/doctor.md',
    'skills/design-wrapper/SKILL.md',
    'skills/design-wrapper/impeccable-plugin.md',
    'skills/tidy/scan-procedures.md',
    'skills/tidy/SKILL.md',
  ]);

  const shared = files146.filter((f) => files150.includes(f));
  assert.deepStrictEqual(
    shared.sort(),
    ['skills/design-wrapper/SKILL.md', 'skills/design-wrapper/impeccable-plugin.md'],
    'the two records genuinely overlap on exactly these files',
  );

  const groups = groupByFileOverlap([
    { id: 146, keyFiles: files146 },
    { id: 150, keyFiles: files150 },
  ]);
  assert.strictEqual(groups.length, 1, 'must be one bundle of two, not two singletons');
  assert.deepStrictEqual(groups[0].sort(), [146, 150]);
});

// ── extractKeyFilesSection: direct export (#81) ───────────────────────────────

test('extractKeyFilesSection is directly exported and reads a body without an issue wrapper', () => {
  const body = '## Technical Approach\n\n### Key Files\n\n- `src/only.js` — the change\n';
  assert.deepStrictEqual(extractKeyFilesSection(body), ['src/only.js']);
});

test('extractKeyFilesSection returns [] for a body with no Key Files subsection', () => {
  assert.deepStrictEqual(extractKeyFilesSection('## Current State\n\nno key files here\n'), []);
});

// ── expectsKeyFilesSection (#661) ──────────────────────────────────────────────

test('expectsKeyFilesSection is true for a plain /specify-shaped issue (no origin label)', () => {
  assert.strictEqual(expectsKeyFilesSection({ labels: ['ready', 'risk:low'] }), true);
});

test('expectsKeyFilesSection is false for a by:code-health-origin issue', () => {
  assert.strictEqual(expectsKeyFilesSection({ labels: ['by:code-health'] }), false);
});

test('expectsKeyFilesSection is false for a by:harness-health-origin issue', () => {
  assert.strictEqual(expectsKeyFilesSection({ labels: ['by:harness-health'] }), false);
});

test('expectsKeyFilesSection is false for a by:journey-health-origin issue', () => {
  assert.strictEqual(expectsKeyFilesSection({ labels: ['by:journey-health'] }), false);
});

test('expectsKeyFilesSection is false for a by:docs-health-origin issue', () => {
  assert.strictEqual(expectsKeyFilesSection({ labels: ['by:docs-health'] }), false);
});

test('expectsKeyFilesSection is true for an issue with no labels at all', () => {
  assert.strictEqual(expectsKeyFilesSection({}), true);
});

test('a ready record whose body omits ### Key Files: expectsKeyFilesSection true + extractKeyFiles empty is the warn-worthy case', () => {
  const issue = { labels: ['ready'], body: '## Technical Approach\n\nno key files subsection\n' };
  assert.strictEqual(expectsKeyFilesSection(issue), true);
  assert.deepStrictEqual(extractKeyFiles(issue), []);
});

test('a code-health record with no extractable file: expectsKeyFilesSection false suppresses the would-be warning', () => {
  const issue = { labels: ['by:code-health'], body: 'no anchor or files line here' };
  assert.strictEqual(expectsKeyFilesSection(issue), false);
  assert.deepStrictEqual(extractKeyFiles(issue), []);
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
