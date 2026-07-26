import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveGitState, appendHistoryEntry, readHistory, formatHistoryTable } from '../history.js';
import { freshRepo } from '../fixtures/git-fixtures.js';

test('resolveGitState: returns the real HEAD sha and gitDirty:false right after a fresh commit', () => {
  const dir = freshRepo();
  const { gitSha, gitDirty } = resolveGitState(dir);
  const expectedSha = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.strictEqual(gitSha, expectedSha);
  assert.strictEqual(gitDirty, false);
});

test('resolveGitState: gitDirty becomes true once an uncommitted file exists', () => {
  const dir = freshRepo();
  fs.writeFileSync(path.join(dir, 'untracked.txt'), 'x');
  const { gitDirty } = resolveGitState(dir);
  assert.strictEqual(gitDirty, true);
});

test('resolveGitState: returns nulls for a directory that is not a git repo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-nogit-'));
  const { gitSha, gitDirty } = resolveGitState(dir);
  assert.strictEqual(gitSha, null);
  assert.strictEqual(gitDirty, null);
});

test('appendHistoryEntry + readHistory: round-trips two entries in append order', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-hist-'));
  const historyPath = path.join(dir, 'history.jsonl');
  appendHistoryEntry(historyPath, { scenario: 'a', n: 1 });
  appendHistoryEntry(historyPath, { scenario: 'b', n: 2 });
  const entries = readHistory(historyPath);
  assert.strictEqual(entries.length, 2);
  assert.deepStrictEqual(entries[0], { scenario: 'a', n: 1 });
  assert.deepStrictEqual(entries[1], { scenario: 'b', n: 2 });
});

test('readHistory: returns an empty array when the file does not exist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-hist-'));
  const entries = readHistory(path.join(dir, 'does-not-exist.jsonl'));
  assert.deepStrictEqual(entries, []);
});

test('readHistory: skips a malformed line rather than throwing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-hist-'));
  const historyPath = path.join(dir, 'history.jsonl');
  fs.writeFileSync(historyPath, '{"scenario":"a"}\nnot json\n{"scenario":"b"}\n');
  const entries = readHistory(historyPath);
  assert.strictEqual(entries.length, 2);
  assert.strictEqual(entries[0].scenario, 'a');
  assert.strictEqual(entries[1].scenario, 'b');
});

const PASS_ENTRY = {
  scenario: 'scenario-a',
  startedAt: '2026-07-20T10:00:00.000Z',
  costUsd: 1.234,
  toolCallCount: 3,
  allPassed: true,
  assertions: [{ type: 'tool-count', pass: true, message: 'ok' }],
  gitSha: 'abc1234567',
};

const FAIL_ENTRY = {
  scenario: 'scenario-a',
  startedAt: '2026-07-24T10:00:00.000Z',
  costUsd: 0.5,
  toolCallCount: 1,
  allPassed: false,
  assertions: [
    { type: 'tool-count', pass: true, message: 'ok' },
    { type: 'commit-count', pass: false, message: 'too many commits' },
  ],
  gitSha: 'def4567890',
};

const OTHER_SCENARIO_ENTRY = {
  scenario: 'scenario-b',
  startedAt: '2026-07-22T10:00:00.000Z',
  costUsd: 2.0,
  toolCallCount: 5,
  allPassed: true,
  assertions: [],
  gitSha: 'ghi7890123',
};

test('formatHistoryTable: with a scenario, sorts newest first and shows failed assertion types inline', () => {
  const table = formatHistoryTable([PASS_ENTRY, FAIL_ENTRY], 'scenario-a');
  const failIdx = table.indexOf('FAIL (commit-count)');
  const passIdx = table.indexOf('PASS');
  assert.ok(failIdx > -1, 'should show the failed assertion type inline');
  assert.ok(failIdx < passIdx, 'newer FAIL entry should appear before older PASS entry');
});

test('formatHistoryTable: with a scenario that has no matching entries, says so', () => {
  const table = formatHistoryTable([PASS_ENTRY], 'no-such-scenario');
  assert.strictEqual(table, 'No history for scenario "no-such-scenario".');
});

test('formatHistoryTable: with no scenario, shows one row per scenario using its most recent entry', () => {
  const table = formatHistoryTable([PASS_ENTRY, FAIL_ENTRY, OTHER_SCENARIO_ENTRY]);
  assert.ok(table.includes('scenario-a'));
  assert.ok(table.includes('scenario-b'));
  const scenarioALine = table.split('\n').find((l) => l.startsWith('scenario-a'));
  assert.ok(scenarioALine.includes('FAIL (commit-count)'), 'scenario-a\'s most recent entry is FAIL_ENTRY, not the older PASS_ENTRY');
});

test('formatHistoryTable: with no entries at all, says so', () => {
  assert.strictEqual(formatHistoryTable([]), 'No history recorded yet.');
});
