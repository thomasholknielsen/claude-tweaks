const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const FILTER = path.join(__dirname, '..', 'bin', 'filter-bash-output.js');
const filter = require('../bin/filter-bash-output.js');

function runFilter(payload) {
  const out = execFileSync('node', [FILTER], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'ct-test-')) },
  });
  return out ? JSON.parse(out) : {};
}

test('decide: below threshold returns false', () => {
  assert.strictEqual(filter.decide(8000, true, true), false);
});

test('decide: noisy + failure above threshold returns true', () => {
  assert.strictEqual(filter.decide(17000, true, true), true);
});

test('decide: noisy + huge (>=2x threshold) returns true', () => {
  assert.strictEqual(filter.decide(33000, true, false), true);
});

test('decide: noisy + medium without failure returns false', () => {
  assert.strictEqual(filter.decide(20000, true, false), false);
});

test('decide: generic huge (>=4x threshold) returns true', () => {
  assert.strictEqual(filter.decide(70000, false, false), true);
});

test('decide: generic medium returns false', () => {
  assert.strictEqual(filter.decide(50000, false, false), false);
});

test('NOISY_COMMAND_RE matches test runners', () => {
  assert.match('npm test', filter.NOISY_COMMAND_RE);
  assert.match('pytest -vv', filter.NOISY_COMMAND_RE);
  assert.match('go test ./...', filter.NOISY_COMMAND_RE);
  assert.match('cargo test', filter.NOISY_COMMAND_RE);
  assert.match('playwright test', filter.NOISY_COMMAND_RE);
});

test('NOISY_COMMAND_RE does not match plain commands', () => {
  assert.doesNotMatch('echo hello', filter.NOISY_COMMAND_RE);
  assert.doesNotMatch('git push', filter.NOISY_COMMAND_RE);
});

test('FAILURE_RE matches typical failure markers', () => {
  assert.match('AssertionError: expected 1 got 2', filter.FAILURE_RE);
  assert.match('Traceback (most recent call last):', filter.FAILURE_RE);
  assert.match('  FAIL src/test.ts', filter.FAILURE_RE);
  assert.match('panic: nil pointer', filter.FAILURE_RE);
});

test('summarize includes failure-line count and command', () => {
  const out = filter.summarize('npm test', 'PASS x\nFAIL y\nFAIL z\n', '', 1);
  assert.ok(out.includes('Command: `npm test`'));
  assert.ok(out.includes('Exit code: 1'));
  assert.ok(out.includes('Failure/error lines detected:'));
});

test('summarize keeps stderr in summary', () => {
  const stderr = 'Error: something broke\nat foo (file.js:42)\n';
  const out = filter.summarize('npm test', '', stderr, 1);
  assert.ok(out.includes('Error: something broke'));
});

test('estimateTokens uses chars/4 heuristic', () => {
  assert.strictEqual(filter.estimateTokens('a'.repeat(400)), 100);
  assert.strictEqual(filter.estimateTokens(''), 0);
});

test('dedupeLines collapses identical adjacent runs with counts', () => {
  const out = filter.dedupeLines(['ok', 'ok', 'ok', 'done']);
  assert.deepStrictEqual(out, ['ok  (×3)', 'done']);
});

test('dedupeLines leaves distinct lines untouched', () => {
  const out = filter.dedupeLines(['a', 'b', 'a']);
  assert.deepStrictEqual(out, ['a', 'b', 'a']);
});

test('dedupeLines collapses blank runs without a count annotation', () => {
  const out = filter.dedupeLines(['x', '', '', 'y']);
  assert.deepStrictEqual(out, ['x', '', 'y']);
});

test('testSummaryLines extracts cargo/jest/pytest/mocha summaries', () => {
  assert.deepStrictEqual(
    filter.testSummaryLines('test result: ok. 262 passed; 0 failed; 0 ignored'),
    ['test result: ok. 262 passed; 0 failed; 0 ignored'],
  );
  assert.deepStrictEqual(
    filter.testSummaryLines('Tests:       1 failed, 5 passed, 6 total'),
    ['Tests:       1 failed, 5 passed, 6 total'],
  );
  assert.deepStrictEqual(
    filter.testSummaryLines('===== 1 failed, 12 passed in 0.53s ====='),
    ['===== 1 failed, 12 passed in 0.53s ====='],
  );
  assert.deepStrictEqual(filter.testSummaryLines('  5 passing (2s)'), ['5 passing (2s)']);
});

test('testSummaryLines ignores per-test ok/fail lines and dedupes', () => {
  const text = 'test foo ... ok\nPASS bar\ntest baz ... ok\n12 passed\n12 passed';
  assert.deepStrictEqual(filter.testSummaryLines(text), ['12 passed']);
});

test('groupByDirectory buckets git-status-style paths by directory', () => {
  const lines = [
    ' M src/components/Button.tsx',
    ' M src/components/Modal.tsx',
    '?? src/components/Card.tsx',
    'A  src/lib/util.ts',
    ' M src/lib/helper.ts',
    ' M src/lib/format.ts',
    '?? tests/a.test.ts',
    ' M tests/b.test.ts',
    ' M tests/c.test.ts',
    ' M README.md',
  ];
  const out = filter.groupByDirectory(lines);
  assert.ok(out, 'expected grouping to trigger');
  const joined = out.join('\n');
  assert.ok(joined.includes('Files by directory'));
  assert.ok(joined.includes('src/components/ — 3'));
  assert.ok(joined.includes('src/lib/ — 3'));
  assert.ok(joined.includes('tests/ — 3'));
});

test('groupByDirectory returns null when output is not path-like', () => {
  const lines = ['hello world', 'this is prose', 'not a path at all', 'more text here'];
  assert.strictEqual(filter.groupByDirectory(lines), null);
});

test('groupByRule consolidates ruff and eslint findings by rule', () => {
  const ruff = [
    'app/main.py:10:5: E501 line too long',
    'app/main.py:20:1: E501 line too long',
    'app/util.py:3:1: F401 imported but unused',
    'app/util.py:9:1: F401 imported but unused',
    'app/x.py:1:1: F401 imported but unused',
    'app/y.py:2:2: E501 line too long',
    'app/z.py:4:4: E712 comparison to True',
    'app/q.py:5:5: E712 comparison to True',
  ];
  const out = filter.groupByRule(ruff);
  assert.ok(out, 'expected rule grouping to trigger');
  const joined = out.join('\n');
  assert.ok(joined.includes('Lint findings by rule'));
  assert.ok(joined.includes('E501 — 3'));
  assert.ok(joined.includes('F401 — 3'));
  assert.ok(joined.includes('E712 — 2'));
});

test('groupByRule reads eslint stylish rule ids', () => {
  const eslint = Array.from({ length: 8 }, (_, i) =>
    i % 2 === 0 ? `${i + 1}:5  error  Missing semicolon  semi` : `${i + 1}:1  warning  Unused var  no-unused-vars`,
  );
  const out = filter.groupByRule(eslint);
  assert.ok(out, 'expected eslint grouping to trigger');
  const joined = out.join('\n');
  assert.ok(joined.includes('semi — 4'));
  assert.ok(joined.includes('no-unused-vars — 4'));
});

test('summarize surfaces a Test summary section', () => {
  const stdout = 'running 262 tests\ntest a ... ok\ntest b ... ok\ntest result: ok. 262 passed; 0 failed\n';
  const out = filter.summarize('cargo test', stdout, '', 0);
  assert.ok(out.includes('Test summary:'));
  assert.ok(out.includes('test result: ok. 262 passed; 0 failed'));
});

test('summarize groups file-listing stdout by directory', () => {
  const stdout = [
    'src/a.ts',
    'src/b.ts',
    'src/c.ts',
    'src/d.ts',
    'lib/e.ts',
    'lib/f.ts',
    'lib/g.ts',
    'lib/h.ts',
  ].join('\n');
  const out = filter.summarize('find . -name "*.ts"', stdout, '', 0);
  assert.ok(out.includes('Files by directory'));
});

test('summarize collapses repeated stdout lines with a count', () => {
  const stdout = `${'Downloading widget\n'.repeat(50)}done\n`;
  const out = filter.summarize('npm test', stdout, '', 0);
  assert.ok(out.includes('Downloading widget  (×50)'));
});

test('end-to-end: small output passes through', () => {
  const result = runFilter({
    tool_input: { command: 'git status' },
    tool_response: { stdout: 'On branch main\n', stderr: '', exit_code: 0 },
    session_id: 'test',
  });
  assert.deepStrictEqual(result, {});
});

test('end-to-end: huge noisy failure triggers filter', () => {
  const stdout = 'PASS test1\n'.repeat(2000) + 'FAIL test2\nAssertionError\n'.repeat(100);
  const result = runFilter({
    tool_input: { command: 'npm test' },
    tool_response: { stdout, stderr: '', exit_code: 1 },
    session_id: 'test',
  });
  assert.ok(result.hookSpecificOutput, `expected filter to trigger at ${stdout.length} chars`);
  assert.strictEqual(result.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.ok(result.hookSpecificOutput.additionalContext.includes('compacted noisy Bash output'));
  assert.ok(result.hookSpecificOutput.additionalContext.includes('[full output:'));
});

test('end-to-end: malformed JSON exits cleanly', () => {
  const out = execFileSync('node', [FILTER], { input: 'not-json{{', encoding: 'utf8' });
  assert.strictEqual(out, '{}');
});
