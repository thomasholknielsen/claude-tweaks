import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScenarioWith, buildPluginSnapshot, parseRunArgs } from '../runner.js';
import { resolveGitState } from '../history.js';
import { freshRepo, seedFiles } from '../fixtures/git-fixtures.js';

// A fake queryFn matching the shape runner.js expects: given a single
// { prompt, options } argument (matching the real SDK's query() signature),
// returns an async generator yielding SDKMessage-shaped objects, ending with a
// result message. Built as a real async generator function (not a pre-built
// array), so each call produces fresh output rather than a shared, eagerly-
// evaluated fixture.
async function* fakeQuery({ prompt, options }) {
  await options.canUseTool('Read', { file_path: '/tmp/x' }, {});
  yield { type: 'assistant', message: { content: [{ type: 'text', text: 'No findings — code is clean.' }] } };
  yield { type: 'result', total_cost_usd: 0.01, usage: { input_tokens: 100, output_tokens: 50 } };
}

// Captures the options object the fake queryFn was invoked with, so a test
// can assert on the managedSettings.sandbox config runner.js wires through —
// regression coverage for the incident-driven Task 7.5 hardening (a model
// escaping the fixture via Bash `cd` into the real repo, see task-7.5-brief.md).
let capturedOptions = null;
async function* fakeQueryCapturingOptions({ prompt, options }) {
  capturedOptions = options;
  await options.canUseTool('Read', { file_path: '/tmp/x' }, {});
  yield { type: 'assistant', message: { content: [{ type: 'text', text: 'No findings — code is clean.' }] } };
  yield { type: 'result', total_cost_usd: 0.01, usage: { input_tokens: 100, output_tokens: 50 } };
}

// A multi-message fake matching real /claude-tweaks:review shape: a findings
// table appears in an early assistant message, followed by later narrative
// messages (e.g. Implementation Hindsight, Simplify, or a cascaded next
// skill) that also carry text but no table. Regression coverage for the bug
// Task 6's real run uncovered: resultText must accumulate every assistant
// text message, not just keep the last one — otherwise a later message with
// no table silently erases the earlier one that had it.
async function* fakeQueryMultiMessage({ prompt, options }) {
  await options.canUseTool('Read', { file_path: '/tmp/x' }, {});
  yield {
    type: 'assistant',
    message: {
      content: [{
        type: 'text',
        text: [
          '### Code Review Findings (confirmed)',
          '| Category | Finding | Severity | Action |',
          '|----------|---------|----------|--------|',
          '| security | SQL injection in src/auth.js | high | captured |',
        ].join('\n'),
      }],
    },
  };
  yield { type: 'assistant', message: { content: [{ type: 'text', text: '### Implementation Hindsight\nNo changes needed.' }] } };
  yield { type: 'assistant', message: { content: [{ type: 'text', text: '### Next Actions\nWrap up (Recommended).' }] } };
  yield { type: 'result', total_cost_usd: 0.02, usage: { input_tokens: 200, output_tokens: 100 } };
}

test('runScenarioWith: builds fixture, runs the fake query, evaluates assertions, writes a result file', async () => {
  const scenariosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-scen-'));
  const scenarioPath = path.join(scenariosDir, 'sample.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: sample',
    'fixture:',
    '  base: none',
    '  seed: []',
    'skill_invocation:',
    '  prompt: "hello"',
    'assertions:',
    '  - type: tool-called',
    '    name: Read',
    '    atLeast: 1',
  ].join('\n'));

  const resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-results-'));

  const result = await runScenarioWith(scenarioPath, { queryFn: fakeQuery, resultsDir, fixturesDir: scenariosDir });

  assert.strictEqual(result.allPassed, true);
  assert.strictEqual(result.costUsd, 0.01);
  assert.strictEqual(result.toolCallCount, 1);
  const written = fs.readdirSync(resultsDir);
  assert.strictEqual(written.length, 1);
});

test('runScenarioWith: resultText accumulates across assistant messages so an earlier findings table survives later narrative text', async () => {
  const scenariosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-scen-'));
  const scenarioPath = path.join(scenariosDir, 'sample.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: sample-multi-message',
    'fixture:',
    '  base: none',
    '  seed: []',
    'skill_invocation:',
    '  prompt: "hello"',
    'assertions:',
    '  - type: findings-include',
    '    severity: high',
    '    contains: "src/auth.js"',
  ].join('\n'));

  const resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-results-'));

  const result = await runScenarioWith(scenarioPath, { queryFn: fakeQueryMultiMessage, resultsDir, fixturesDir: scenariosDir });

  assert.strictEqual(result.allPassed, true, JSON.stringify(result.assertions));
  assert.strictEqual(result.assertions[0].pass, true);
});

test('runScenarioWith: wires managedSettings.sandbox into the SDK options to contain Bash-tool filesystem/network access to the fixture (Task 7.5 hardening)', async () => {
  const scenariosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-scen-'));
  const scenarioPath = path.join(scenariosDir, 'sample.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: sample-sandbox',
    'fixture:',
    '  base: none',
    '  seed: []',
    'skill_invocation:',
    '  prompt: "hello"',
    'assertions:',
    '  - type: tool-called',
    '    name: Read',
    '    atLeast: 1',
  ].join('\n'));

  const resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-results-'));

  capturedOptions = null;
  await runScenarioWith(scenarioPath, { queryFn: fakeQueryCapturingOptions, resultsDir, fixturesDir: scenariosDir });

  assert.ok(capturedOptions, 'queryFn should have been invoked with an options object');
  assert.deepStrictEqual(capturedOptions.managedSettings.sandbox, {
    enabled: true,
    failIfUnavailable: true,
    allowUnsandboxedCommands: false,
    network: { allowedDomains: [] },
    // Task 7.6 (incident-driven, see task-7.6-brief.md): confirmed via a
    // controller A/B test that managedSettings.sandbox denies reading
    // .git/config even inside the fixture's own working directory, breaking
    // git status/log/diff there. filesystem.allowRead restores that access.
    // Asserted structurally below (derived from this test run's own repoDir
    // via capturedOptions.cwd, which runner.js sets to the same repoDir
    // value) rather than as a hardcoded string, since freshRepo() uses
    // mkdtempSync and the actual path differs per run.
    filesystem: { allowRead: [path.join(capturedOptions.cwd, '.git')] },
  });
});

test('runScenarioWith: does not pass the real repo root as plugins[0].path (Task 7.6 — PLUGIN_ROOT snapshot)', async () => {
  const scenariosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-scen-'));
  const scenarioPath = path.join(scenariosDir, 'sample.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: sample-plugin-snapshot',
    'fixture:',
    '  base: none',
    '  seed: []',
    'skill_invocation:',
    '  prompt: "hello"',
    'assertions:',
    '  - type: tool-called',
    '    name: Read',
    '    atLeast: 1',
  ].join('\n'));

  const resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-results-'));

  capturedOptions = null;
  await runScenarioWith(scenarioPath, { queryFn: fakeQueryCapturingOptions, resultsDir, fixturesDir: scenariosDir });

  assert.ok(capturedOptions, 'queryFn should have been invoked with an options object');
  const realRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  assert.notStrictEqual(capturedOptions.plugins[0].path, realRepoRoot);
  assert.ok(fs.existsSync(capturedOptions.plugins[0].path), 'the snapshot path passed to plugins[0].path should actually exist');
});

test('buildPluginSnapshot: copies plugin content into a fresh tmpdir, excluding evals/.git/docs (Task 7.6)', () => {
  const snapshotDir = buildPluginSnapshot();

  assert.ok(fs.existsSync(path.join(snapshotDir, 'skills')), 'snapshot should contain a skills subdirectory');
  assert.ok(!fs.existsSync(path.join(snapshotDir, 'evals')), 'snapshot must not contain evals/');
  assert.ok(!fs.existsSync(path.join(snapshotDir, '.git')), 'snapshot must not contain .git');
  assert.ok(!fs.existsSync(path.join(snapshotDir, 'docs')), 'snapshot must not contain docs/');
});

test('parseRunArgs: --no-record suppresses record and is excluded from the positional arg', () => {
  assert.deepStrictEqual(parseRunArgs(['my-scenario']), { record: true, arg: 'my-scenario' });
  assert.deepStrictEqual(parseRunArgs(['my-scenario', '--no-record']), { record: false, arg: 'my-scenario' });
  assert.deepStrictEqual(parseRunArgs(['--no-record', '--all']), { record: false, arg: '--all' });
});

test('runScenarioWith: appends a history entry (with gitSha/gitDirty) when record is true', async () => {
  const scenariosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-scen-'));
  const scenarioPath = path.join(scenariosDir, 'sample.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: sample-history',
    'fixture:',
    '  base: none',
    '  seed: []',
    'skill_invocation:',
    '  prompt: "hello"',
    'assertions:',
    '  - type: tool-called',
    '    name: Read',
    '    atLeast: 1',
  ].join('\n'));

  const resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-results-'));
  const historyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-history-'));
  const historyPath = path.join(historyDir, 'history.jsonl');
  const fakeResolveGitState = () => ({ gitSha: 'abc1234', gitDirty: false });

  await runScenarioWith(scenarioPath, {
    queryFn: fakeQuery,
    resultsDir,
    fixturesDir: scenariosDir,
    record: true,
    historyPath,
    resolveGitStateFn: fakeResolveGitState,
  });

  const lines = fs.readFileSync(historyPath, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.strictEqual(entry.scenario, 'sample-history');
  assert.strictEqual(entry.gitSha, 'abc1234');
  assert.strictEqual(entry.gitDirty, false);
  assert.strictEqual(entry.allPassed, true);
});

test('runScenarioWith: does not touch history when record is false (the default)', async () => {
  const scenariosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-scen-'));
  const scenarioPath = path.join(scenariosDir, 'sample.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: sample-no-record',
    'fixture:',
    '  base: none',
    '  seed: []',
    'skill_invocation:',
    '  prompt: "hello"',
    'assertions:',
    '  - type: tool-called',
    '    name: Read',
    '    atLeast: 1',
  ].join('\n'));

  const resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-results-'));
  const historyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-history-'));
  const historyPath = path.join(historyDir, 'history.jsonl');

  await runScenarioWith(scenarioPath, { queryFn: fakeQuery, resultsDir, fixturesDir: scenariosDir, historyPath });

  assert.strictEqual(fs.existsSync(historyPath), false);
});

test('runScenarioWith: gitDirty stays false across a multi-scenario batch, even though history.jsonl itself is a tracked file the harness appends to', async () => {
  const repoDir = freshRepo();
  seedFiles(repoDir, { 'evals/history.jsonl': '' }, 'seed empty history.jsonl');

  const scenariosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-scen-'));
  const scenarioPath = path.join(scenariosDir, 'sample.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: sample-batch',
    'fixture:',
    '  base: none',
    '  seed: []',
    'skill_invocation:',
    '  prompt: "hello"',
    'assertions:',
    '  - type: tool-called',
    '    name: Read',
    '    atLeast: 1',
  ].join('\n'));

  const resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-results-'));
  const historyPath = path.join(repoDir, 'evals', 'history.jsonl');

  await runScenarioWith(scenarioPath, {
    queryFn: fakeQuery, resultsDir, fixturesDir: scenariosDir,
    record: true, historyPath, resolveGitStateFn: () => resolveGitState(repoDir),
  });
  await runScenarioWith(scenarioPath, {
    queryFn: fakeQuery, resultsDir, fixturesDir: scenariosDir,
    record: true, historyPath, resolveGitStateFn: () => resolveGitState(repoDir),
  });

  const lines = fs.readFileSync(historyPath, 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 2);
  const entries = lines.map((l) => JSON.parse(l));
  assert.strictEqual(entries[0].gitDirty, false);
  assert.strictEqual(entries[1].gitDirty, false, "second scenario must not see the first scenario's own history.jsonl append as tree dirt");
});
