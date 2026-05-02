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
