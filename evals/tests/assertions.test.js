import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { runAssertion } from '../assertions/index.js';
import { freshRepo, seedFiles, seedLocalWorkRecord } from '../fixtures/git-fixtures.js';

const SAMPLE_FINDINGS_TEXT = `
## Review: test

### Code Review Findings (confirmed)
| Category | Finding | Severity | Action |
|----------|---------|----------|--------|
| security | SQL injection via string concatenation in src/auth.js | high | captured |
| perf | Off-by-one slice in src/utils.js | medium | captured |

### Next Actions
`;

test('file-exists: passes when the file exists', () => {
  const dir = freshRepo();
  seedFiles(dir, { 'src/a.js': 'x' });
  const result = runAssertion({ repoDir: dir }, { type: 'file-exists', path: 'src/a.js' });
  assert.strictEqual(result.pass, true);
});

test('file-exists: fails when the file is missing', () => {
  const dir = freshRepo();
  const result = runAssertion({ repoDir: dir }, { type: 'file-exists', path: 'src/missing.js' });
  assert.strictEqual(result.pass, false);
});

test('test-passes: passes when the command exits 0', () => {
  const dir = freshRepo();
  const result = runAssertion({ repoDir: dir }, { type: 'test-passes', command: 'true' });
  assert.strictEqual(result.pass, true);
});

test('test-passes: fails when the command exits non-zero', () => {
  const dir = freshRepo();
  const result = runAssertion({ repoDir: dir }, { type: 'test-passes', command: 'false' });
  assert.strictEqual(result.pass, false);
});

test('decisions-log-has: finds a substring in the most recent run\'s decisions.md', () => {
  const dir = freshRepo();
  seedFiles(dir, {
    '.claude-tweaks/pipelines/2026-01-01T000000-x-standalone/decisions.md':
      '# Auto-Decision Log\n\nAUTO 10:00:00 — Step 1: did the thing.\n',
  });
  const result = runAssertion({ repoDir: dir }, { type: 'decisions-log-has', contains: 'did the thing' });
  assert.strictEqual(result.pass, true);
});

test('decisions-log-has: fails when the substring is absent', () => {
  const dir = freshRepo();
  seedFiles(dir, {
    '.claude-tweaks/pipelines/2026-01-01T000000-x-standalone/decisions.md': '# Auto-Decision Log\n',
  });
  const result = runAssertion({ repoDir: dir }, { type: 'decisions-log-has', contains: 'nope' });
  assert.strictEqual(result.pass, false);
});

test('tool-called: passes when the tool was called at least N times', () => {
  const result = runAssertion({ toolCalls: ['Read', 'Edit', 'Edit'] }, { type: 'tool-called', name: 'Edit', atLeast: 2 });
  assert.strictEqual(result.pass, true);
});

test('tool-count: fails when over max', () => {
  const result = runAssertion({ toolCalls: new Array(50).fill('Read') }, { type: 'tool-count', max: 40 });
  assert.strictEqual(result.pass, false);
});

test('local-record-facet: reads a facet from a seeded local-files record', () => {
  const dir = freshRepo();
  const record = seedLocalWorkRecord(dir, { slug: 'triage-me', title: 'Triage Me', facets: { stage: 'ready', risk: 'low' } });
  const relPath = record.path.replace(dir + path.sep, '');
  const result = runAssertion({ repoDir: dir }, { type: 'local-record-facet', recordPath: relPath, facet: 'stage', equals: 'ready' });
  assert.strictEqual(result.pass, true);
});

test('commit-count: counts commits since a ref', () => {
  const dir = freshRepo();
  seedFiles(dir, { 'a.txt': '1' });
  seedFiles(dir, { 'b.txt': '2' });
  const result = runAssertion({ repoDir: dir }, { type: 'commit-count', max: 5 });
  assert.strictEqual(result.pass, true);
});

test('commit-messages-allowed: passes when every commit matches an allowed pattern', () => {
  const dir = freshRepo();
  seedFiles(dir, { 'a.txt': '1' }, 'seed base fixture');
  seedFiles(dir, { 'b.txt': '2' }, 'Backlog Refine: set priority:medium on 1');
  const result = runAssertion(
    { repoDir: dir },
    { type: 'commit-messages-allowed', allow: ['^init$', '^seed base fixture$', '^Backlog Refine: '] },
  );
  assert.strictEqual(result.pass, true, result.message);
});

test('commit-messages-allowed: fails and names the offending commit when one matches nothing', () => {
  const dir = freshRepo();
  seedFiles(dir, { 'a.txt': '1' }, 'seed base fixture');
  seedFiles(dir, { 'src/app.js': 'x' }, 'Implement signup validation');
  const result = runAssertion(
    { repoDir: dir },
    { type: 'commit-messages-allowed', allow: ['^init$', '^seed base fixture$', '^Backlog Refine: '] },
  );
  assert.strictEqual(result.pass, false);
  assert.ok(result.message.includes('Implement signup validation'), result.message);
});

test('findings-include: finds a matching row by severity and substring', () => {
  const result = runAssertion(
    { resultText: SAMPLE_FINDINGS_TEXT },
    { type: 'findings-include', severity: 'high', contains: 'src/auth.js' },
  );
  assert.strictEqual(result.pass, true);
});

test('findings-include: fails when no row matches', () => {
  const result = runAssertion(
    { resultText: SAMPLE_FINDINGS_TEXT },
    { type: 'findings-include', severity: 'critical', contains: 'src/auth.js' },
  );
  assert.strictEqual(result.pass, false);
});

test('result-contains: passes when every needle appears anywhere', () => {
  const result = runAssertion(
    { resultText: 'Found 1 depth opportunity:\n| 1 | src/store-wrapper.js | collapse | pure pass-through |' },
    { type: 'result-contains', contains: ['store-wrapper', 'collapse'] },
  );
  assert.strictEqual(result.pass, true);
});

test('result-contains: within pins needles to lines matching the scope substring', () => {
  const text = '| 1 | src/store-wrapper.js | collapse | pass-through |\n| 2 | src/other.js | deepen | leaks |';
  const pinned = runAssertion(
    { resultText: text },
    { type: 'result-contains', within: 'store-wrapper', contains: 'collapse' },
  );
  assert.strictEqual(pinned.pass, true);
  // "deepen" appears in the text, but never on a store-wrapper line.
  const crossLine = runAssertion(
    { resultText: text },
    { type: 'result-contains', within: 'store-wrapper', contains: 'deepen' },
  );
  assert.strictEqual(crossLine.pass, false);
});

test('result-contains: fails and names the missing needle', () => {
  const result = runAssertion(
    { resultText: 'no candidates found' },
    { type: 'result-contains', contains: ['collapse'] },
  );
  assert.strictEqual(result.pass, false);
  assert.match(result.message, /collapse/);
});

test('findings-exclude-false-positive: passes when the file is never mentioned', () => {
  const result = runAssertion(
    { resultText: SAMPLE_FINDINGS_TEXT },
    { type: 'findings-exclude-false-positive', files: ['src/clean-module.js'] },
  );
  assert.strictEqual(result.pass, true);
});

test('findings-exclude-false-positive: fails when the file IS mentioned', () => {
  const result = runAssertion(
    { resultText: SAMPLE_FINDINGS_TEXT },
    { type: 'findings-exclude-false-positive', files: ['src/auth.js'] },
  );
  assert.strictEqual(result.pass, false);
});

// --- parse-findings-table.js: real observed output shapes ---
// Three real /claude-tweaks:review runs each produced a differently-shaped
// summary (different heading, different column count/order/names) — these
// fixtures are the actual text observed (reformatted to single-line rows,
// since a real markdown table row is one line; only report-doc rendering
// wrapped it across lines). The parser must handle all three via the one
// stable signal: a "Severity" column header.

const REAL_SHAPE_STEP3_LOCATION = `
## Step 3 — Code Review Findings

| # | Finding | Severity | Category | Location | Recommended |
|---|---|---|---|---|---|
| 1 | \`buildUserLookupQuery\` interpolates raw \`username\` into a SQL string with no sanitization — classic auth-bypass injection (SQL injection). | **Critical** | security | \`src/auth.js:4\` | Fix now — restore input sanitization |
| 2 | \`lastNItems\` now slices at \`items.length - n - 1\` instead of \`items.length - n\`. Confirmed: returns n+1 items. | **High** | correctness | \`src/utils.js:4\` | Fix now — restore \`items.length - n\` |
`;

const REAL_SHAPE_FILE_LINE_RESOLUTION = `
### Code Review Findings

| # | File:Line | Severity | Category | Issue | Resolution |
|---|---|---|---|---|---|
| 1 | \`src/auth.js:4\` | Critical | Security | Sanitization removed before interpolating \`username\` into a raw SQL string — SQL injection | **Fixed** |
| 2 | \`src/utils.js:4\` | High | Correctness | \`lastNItems\` off-by-one (\`length - n - 1\`) returned n+1 items instead of n | **Fixed** |
`;

test('parseFindingsTable: parses the "Finding/Location/Recommended" shape via the Severity header, stripping markdown emphasis', () => {
  const result = runAssertion(
    { resultText: REAL_SHAPE_STEP3_LOCATION },
    { type: 'findings-include', severity: 'critical', contains: 'SQL injection' },
  );
  assert.strictEqual(result.pass, true, result.message);
  const highResult = runAssertion(
    { resultText: REAL_SHAPE_STEP3_LOCATION },
    { type: 'findings-include', severity: 'high', contains: 'lastNItems' },
  );
  assert.strictEqual(highResult.pass, true, highResult.message);
});

test('parseFindingsTable: parses the "File:Line/Issue/Resolution" shape via the Severity header', () => {
  const result = runAssertion(
    { resultText: REAL_SHAPE_FILE_LINE_RESOLUTION },
    { type: 'findings-include', severity: 'critical', contains: 'SQL injection' },
  );
  assert.strictEqual(result.pass, true, result.message);
  const highResult = runAssertion(
    { resultText: REAL_SHAPE_FILE_LINE_RESOLUTION },
    { type: 'findings-include', severity: 'high', contains: 'lastNItems' },
  );
  assert.strictEqual(highResult.pass, true, highResult.message);
});

// Real captured output (2026-07-24 run, cost $4.14) where the off-by-one
// finding never used the literal string "lastNItems" — validates the
// file-path-based fallback assertion against real data before spending on
// another live run.
const REAL_SHAPE_NO_FUNCTION_NAME = `
### Code Review Findings

| # | Finding | Severity | Location | Lenses | Resolution |
|---|---|---|---|---|---|
| 1 | Sanitization was removed — raw \`username\` is now interpolated directly into the SQL string, reintroducing SQL injection | Critical | \`src/auth.js:4\` | Security + Error-handling (both confirmed) | Fix now — restore sanitization |
| 2 | Off-by-one: \`items.length - n - 1\` silently returns the wrong element count for every normal call | High | \`src/utils.js:4\` | Error-handling (confirmed) | Fix now — restore \`items.length - n\` |
| 3 | No test covers \`buildUserLookupQuery\`; a test would have caught the SQL-injection regression | Medium | \`src/auth.js\` | Test Quality (confirmed) | Add regression test |
| 4 | No test covers \`lastNItems\`; a test would have caught the off-by-one regression | Medium | \`src/utils.js\` | Test Quality (confirmed) | Add regression test |
`;

test('findings-include: matches the off-by-one finding by file path when the function name is never literally mentioned', () => {
  const result = runAssertion(
    { resultText: REAL_SHAPE_NO_FUNCTION_NAME },
    { type: 'findings-include', severity: 'high', contains: 'src/utils.js' },
  );
  assert.strictEqual(result.pass, true, result.message);
});

test('findings-include: the file-path match is disambiguated by severity, not accidentally matching the Medium test-coverage row for the same file', () => {
  // Row 4 (Medium) also mentions src/utils.js — confirm severity:high only
  // matches row 2, not row 4, by checking the matched row's own content.
  const result = runAssertion(
    { resultText: REAL_SHAPE_NO_FUNCTION_NAME },
    { type: 'findings-include', severity: 'high', contains: 'src/utils.js' },
  );
  assert.ok(result.message.includes('Off-by-one'), result.message);
  assert.ok(!result.message.includes('No test covers'), result.message);
});

// --- verdict-matches.js: merge-check's VERDICT: line ---

test('verdict-matches: passes when the stated verdict matches expected', () => {
  const result = runAssertion(
    { resultText: 'RATIONALE: pointer repair.\nVERDICT: auto-merge\nRATIONALE: pointer repair only.' },
    { type: 'verdict-matches', expected: 'auto-merge' },
  );
  assert.strictEqual(result.pass, true, result.message);
});

test('verdict-matches: fails when the stated verdict does not match expected', () => {
  const result = runAssertion(
    { resultText: 'VERDICT: needs-human\nRATIONALE: sensitive path touched.' },
    { type: 'verdict-matches', expected: 'auto-merge' },
  );
  assert.strictEqual(result.pass, false);
});

test('verdict-matches: fails with an excerpt when no VERDICT: line is present', () => {
  const result = runAssertion(
    { resultText: 'I looked at the diff but did not render a verdict.' },
    { type: 'verdict-matches', expected: 'auto-merge' },
  );
  assert.strictEqual(result.pass, false);
  assert.ok(result.message.includes('did not render a verdict'), result.message);
});

test('verdict-matches: multiple mentions takes the last one (narrative may restate options before Step 3 renders the real verdict)', () => {
  const result = runAssertion(
    {
      resultText: [
        'Weighing auto-merge vs needs-human for this diff.',
        'VERDICT: needs-human',
        'RATIONALE: draft.',
        'On reflection: VERDICT: auto-merge',
        'RATIONALE: the refutation attempt came up empty.',
      ].join('\n'),
    },
    { type: 'verdict-matches', expected: 'auto-merge' },
  );
  assert.strictEqual(result.pass, true, result.message);
});

test('verdict-matches: case tolerance — VERDICT written in a different case still matches', () => {
  const result = runAssertion(
    { resultText: 'verdict: AUTO-MERGE\nrationale: rename only.' },
    { type: 'verdict-matches', expected: 'auto-merge' },
  );
  assert.strictEqual(result.pass, true, result.message);
});

// --- filter-outcome-matches.js: research verify's per-candidate keep/drop outcome ---

test('filter-outcome-matches: passes when every kept/dropped token matches', () => {
  const result = runAssertion(
    {
      resultText: [
        'Q-WEBHOOK: KEEP — answers lead to structurally different pipelines.',
        'Q-TTL: DROP — the module is rebuilt per-run either way.',
      ].join('\n'),
    },
    { type: 'filter-outcome-matches', kept: ['Q-WEBHOOK'], dropped: ['Q-TTL'] },
  );
  assert.strictEqual(result.pass, true, result.message);
});

test('filter-outcome-matches: fails naming the first mismatched token', () => {
  const result = runAssertion(
    {
      resultText: [
        'Q-WEBHOOK: DROP — no divergence found.',
        'Q-TTL: DROP — the module is rebuilt per-run either way.',
      ].join('\n'),
    },
    { type: 'filter-outcome-matches', kept: ['Q-WEBHOOK'], dropped: ['Q-TTL'] },
  );
  assert.strictEqual(result.pass, false);
  assert.ok(result.message.includes('Q-WEBHOOK'), result.message);
});

test('filter-outcome-matches: fails when a token never appears in the result', () => {
  const result = runAssertion(
    { resultText: 'Q-TTL: DROP — the module is rebuilt per-run either way.' },
    { type: 'filter-outcome-matches', kept: ['Q-WEBHOOK'], dropped: ['Q-TTL'] },
  );
  assert.strictEqual(result.pass, false);
  assert.ok(result.message.includes('Q-WEBHOOK'), result.message);
});

test('filter-outcome-matches: multiple mentions takes the outcome nearest the token\'s last mention', () => {
  const result = runAssertion(
    {
      resultText: [
        'Considering Q-WEBHOOK — this could go either way, tentatively DROP.',
        'On reflection, Q-WEBHOOK: KEEP — answers lead to structurally different pipelines.',
      ].join('\n'),
    },
    { type: 'filter-outcome-matches', kept: ['Q-WEBHOOK'], dropped: [] },
  );
  assert.strictEqual(result.pass, true, result.message);
});

test('filter-outcome-matches: negation — flipping the expected direction turns a passing case red', () => {
  const resultText = 'Q-WEBHOOK: KEEP — answers lead to structurally different pipelines.';
  const passing = runAssertion({ resultText }, { type: 'filter-outcome-matches', kept: ['Q-WEBHOOK'], dropped: [] });
  assert.strictEqual(passing.pass, true, passing.message);
  const negated = runAssertion({ resultText }, { type: 'filter-outcome-matches', kept: [], dropped: ['Q-WEBHOOK'] });
  assert.strictEqual(negated.pass, false, 'negating the expected outcome must flip pass to fail');
});

test('parseFindingsTable: a gate table with no Severity column (e.g. Spec Compliance) is skipped, not parsed as findings', () => {
  const textWithGateTableFirst = `
### Spec Compliance
| Deliverable | Status |
|-------------|--------|
| Auth fix | done |

${REAL_SHAPE_FILE_LINE_RESOLUTION}
`;
  const result = runAssertion(
    { resultText: textWithGateTableFirst },
    { type: 'findings-exclude-false-positive', files: ['clean-module.js'] },
  );
  assert.strictEqual(result.pass, true, result.message);
  const stillFinds = runAssertion(
    { resultText: textWithGateTableFirst },
    { type: 'findings-include', severity: 'critical', contains: 'SQL injection' },
  );
  assert.strictEqual(stillFinds.pass, true, stillFinds.message);
});
