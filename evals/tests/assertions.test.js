import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { runAssertion } from '../assertions/index.js';
import { freshRepo, seedFiles } from '../fixtures/git-fixtures.js';

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

test('commit-count: counts commits since a ref', () => {
  const dir = freshRepo();
  seedFiles(dir, { 'a.txt': '1' });
  seedFiles(dir, { 'b.txt': '2' });
  const result = runAssertion({ repoDir: dir }, { type: 'commit-count', max: 5 });
  assert.strictEqual(result.pass, true);
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
