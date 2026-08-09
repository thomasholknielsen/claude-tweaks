import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runScenarioWith, buildPluginSnapshot, parseRunArgs, expandMatrix } from '../runner.js';
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

// Captures the prompt runScenarioWith invoked queryFn with, so a test can
// assert on the {{ESCAPE_TARGET_PATH}} templating substitution runner.js
// performs before the prompt reaches the SDK — see Task 2 (task-2-brief.md).
let capturedPrompt = null;
async function* fakeQueryCapturingPrompt({ prompt, options }) {
  capturedPrompt = prompt;
  await options.canUseTool('Read', { file_path: '/tmp/x' }, {});
  yield { type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } };
  yield { type: 'result', total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 5 } };
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

  const [result] = await runScenarioWith(scenarioPath, { queryFn: fakeQuery, resultsDir, fixturesDir: scenariosDir });

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

  const [result] = await runScenarioWith(scenarioPath, { queryFn: fakeQueryMultiMessage, resultsDir, fixturesDir: scenariosDir });

  assert.strictEqual(result.allPassed, true, JSON.stringify(result.assertions));
  assert.strictEqual(result.assertions[0].pass, true);
});

// A Bash call with a distinctive command, for tool-input-includes.js
// end-to-end coverage (context.toolInputs populated by canUseTool and
// consumed by the assertion, not just unit-tested in isolation).
async function* fakeQueryBashCommand({ prompt, options }) {
  await options.canUseTool('Bash', { command: 'echo ESCAPED > /tmp/marker.txt' }, {});
  yield { type: 'assistant', message: { content: [{ type: 'text', text: 'done' }] } };
  yield { type: 'result', total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 5 } };
}

test('runScenarioWith: tool-input-includes verifies the specific command ran, not just that Bash ran at all', async () => {
  const scenariosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-scen-'));
  const scenarioPath = path.join(scenariosDir, 'sample.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: sample-tool-input-includes',
    'fixture:',
    '  base: none',
    '  seed: []',
    'skill_invocation:',
    '  prompt: "hello"',
    'assertions:',
    '  - type: tool-input-includes',
    '    name: Bash',
    '    contains: ESCAPED',
    '  - type: tool-input-includes',
    '    name: Bash',
    '    contains: NEVER_HAPPENED',
  ].join('\n'));

  const resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-results-'));

  const [result] = await runScenarioWith(scenarioPath, { queryFn: fakeQueryBashCommand, resultsDir, fixturesDir: scenariosDir });

  assert.strictEqual(result.assertions[0].pass, true, JSON.stringify(result.assertions[0]));
  assert.strictEqual(result.assertions[1].pass, false, JSON.stringify(result.assertions[1]));
});

test('runScenarioWith: a throwing assertion (e.g. absolute-path-exists.js\'s missing-target guard) fails closed as a recorded result, not an uncaught crash', async () => {
  const scenariosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-scen-'));
  const scenarioPath = path.join(scenariosDir, 'sample.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: sample-throwing-assertion',
    'fixture:',
    '  base: none',
    '  seed: []',
    'skill_invocation:',
    '  prompt: "hello"',
    'assertions:',
    '  - type: absolute-path-exists',
    '    target: nonexistentContextField',
  ].join('\n'));

  const resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-results-'));

  const [result] = await runScenarioWith(scenarioPath, { queryFn: fakeQuery, resultsDir, fixturesDir: scenariosDir });

  assert.strictEqual(result.allPassed, false);
  assert.strictEqual(result.assertions[0].pass, false);
  assert.match(result.assertions[0].message, /assertion threw/);
  const written = JSON.parse(fs.readFileSync(path.join(resultsDir, `${result.scenario}-${Date.parse(result.startedAt)}.json`), 'utf8'));
  assert.strictEqual(written.allPassed, false, 'result must still be written to disk, not lost to an uncaught exception');
});

test('runScenarioWith: substitutes {{ESCAPE_TARGET_PATH}} in the prompt with a real absolute path outside repoDir, and exposes it via context.escapeTargetPath', async () => {
  const scenariosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-scen-'));
  const scenarioPath = path.join(scenariosDir, 'sample.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: sample-escape-target',
    'fixture:',
    '  base: none',
    '  seed: []',
    'skill_invocation:',
    '  prompt: "write to {{ESCAPE_TARGET_PATH}}"',
    'assertions:',
    '  - type: absolute-path-exists',
    '    target: escapeTargetPath',
    '    shouldExist: false',
  ].join('\n'));

  const resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-results-'));

  capturedPrompt = null;
  const [result] = await runScenarioWith(scenarioPath, { queryFn: fakeQueryCapturingPrompt, resultsDir, fixturesDir: scenariosDir });

  assert.ok(capturedPrompt, 'queryFn should have been invoked');
  assert.ok(!capturedPrompt.includes('{{ESCAPE_TARGET_PATH}}'), 'placeholder should be substituted, not passed through literally');
  assert.ok(capturedPrompt.includes(os.tmpdir()), 'substituted path should be under the system tmpdir');
  assert.strictEqual(result.allPassed, true, JSON.stringify(result.assertions));
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
    autoAllowBashIfSandboxed: false,
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

// ── git-remote fixture seed step (#157) ─────────────────────────────────────

test('runScenarioWith: a git-remote seed step gives the fixture repo an origin the skill under test can resolve', async () => {
  const scenariosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-scen-'));
  const scenarioPath = path.join(scenariosDir, 'sample.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: sample-git-remote',
    'fixture:',
    '  base: none',
    '  seed:',
    '    - git-remote: https://github.com/thomasholknielsen/claude-tweaks.git',
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

  // capturedOptions.cwd is the fixture repoDir runner.js built for this run.
  const url = execFileSync('git', ['-C', capturedOptions.cwd, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  assert.strictEqual(url, 'https://github.com/thomasholknielsen/claude-tweaks.git');
});

test('runScenarioWith: a fixture with no git-remote seed step still has no remote (the step is opt-in)', async () => {
  const scenariosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-scen-'));
  const scenarioPath = path.join(scenariosDir, 'sample.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: sample-no-git-remote',
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

  // code-health-seeded-findings drives gh-unavailable degradation off exactly
  // this absence, so seeding a remote by default would silently retarget it.
  assert.throws(
    () => execFileSync('git', ['-C', capturedOptions.cwd, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: 'pipe' }),
  );
});

// ── branch fixture seed step (#115) ─────────────────────────────────────────

test('runScenarioWith: a branch seed step checks out a feature branch ahead of the normalized base, so merge-base/diff resolve', async () => {
  const scenariosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-scen-'));
  const scenarioPath = path.join(scenariosDir, 'sample.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: sample-branch',
    'fixture:',
    '  base: none',
    '  seed:',
    '    - branch:',
    '        name: feature',
    '        base: main',
    '        files:',
    '          feature.txt: "new file\\n"',
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

  const repoDir = capturedOptions.cwd;
  const current = execFileSync('git', ['-C', repoDir, 'branch', '--show-current'], { encoding: 'utf8' }).trim();
  assert.strictEqual(current, 'feature');
  const mergeBase = execFileSync('git', ['-C', repoDir, 'merge-base', 'main', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.ok(mergeBase);
  const numstat = execFileSync('git', ['-C', repoDir, 'diff', '--numstat', 'main..HEAD'], { encoding: 'utf8' }).trim();
  assert.match(numstat, /feature\.txt/);
});

// ── files fixture seed step (#180) ──────────────────────────────────────────

test('runScenarioWith: a files seed step writes and commits files with no branching side effect', async () => {
  const scenariosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-scen-'));
  const scenarioPath = path.join(scenariosDir, 'sample.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: sample-files',
    'fixture:',
    '  base: none',
    '  seed:',
    '    - files:',
    '        docs/brief.md: "hello brief\\n"',
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

  const repoDir = capturedOptions.cwd;
  assert.strictEqual(fs.readFileSync(path.join(repoDir, 'docs/brief.md'), 'utf8'), 'hello brief\n');
  // Unlike the branch arm, this must leave the fixture on its single,
  // un-renamed default branch (whatever git's init.defaultBranch resolves to
  // in this environment) — no rename, no checkout to a second branch.
  const branches = execFileSync('git', ['-C', repoDir, 'branch', '--list'], { encoding: 'utf8' }).trim().split('\n');
  assert.strictEqual(branches.length, 1, `expected exactly one branch, got: ${branches.join(', ')}`);
  const status = execFileSync('git', ['-C', repoDir, 'status', '--porcelain'], { encoding: 'utf8' });
  assert.strictEqual(status, '', 'seedFiles must commit, leaving the worktree clean');
});

// ── Matrix expansion (#158) ─────────────────────────────────────────────────

function writeCorpus(dir, entries) {
  fs.writeFileSync(path.join(dir, 'corpus.json'), JSON.stringify({ lessons: entries }), 'utf8');
}

test('expandMatrix: a scenario with no matrix block expands to exactly itself', () => {
  const scenario = { name: 'plain', skill_invocation: { prompt: 'hello' } };
  assert.deepStrictEqual(expandMatrix(scenario, '/nonexistent'), [scenario]);
});

test('expandMatrix: one case per corpus entry, with placeholders substituted into prompt and assertions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-matrix-'));
  writeCorpus(dir, [
    { id: 'alpha', text: 'first lesson', expected: { destination: 'D5', kind: 'defect' } },
    { id: 'beta', text: 'second lesson', expected: { destination: 'D4', kind: null } },
  ]);

  const cases = expandMatrix({
    name: 'routing',
    matrix: { corpus: 'corpus.json', entries: 'lessons' },
    skill_invocation: { prompt: 'classify: {{matrix.text}}' },
    assertions: [{
      type: 'routing-destination-matches',
      expectedDestination: '{{matrix.expected.destination}}',
      expectedKind: '{{matrix.expected.kind}}',
    }],
  }, dir);

  assert.strictEqual(cases.length, 2);
  assert.deepStrictEqual(cases.map((c) => c.name), ['routing[alpha]', 'routing[beta]']);
  assert.strictEqual(cases[0].skill_invocation.prompt, 'classify: first lesson');
  assert.strictEqual(cases[1].skill_invocation.prompt, 'classify: second lesson');
  assert.strictEqual(cases[0].assertions[0].expectedDestination, 'D5');
  assert.strictEqual(cases[0].assertions[0].expectedKind, 'defect');
  assert.strictEqual(cases[1].assertions[0].expectedDestination, 'D4');
  // The corpus records kind as null for every non-D5 lesson.
  // routing-destination-matches.js gates its kind check on `if (expectedKind)`,
  // so a stringified "null" would flip a deliberately-skipped check into one
  // that can never pass.
  assert.strictEqual(cases[1].assertions[0].expectedKind, null);
  // The matrix block itself must not survive into a resolved case — a case is a
  // plain scenario, and leaving it in would re-expand on any second pass.
  assert.ok(!('matrix' in cases[0]));
});

test('expandMatrix: exclude drops entries a dedicated scenario file already covers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-matrix-'));
  writeCorpus(dir, [
    { id: 'alpha', text: 'a' },
    { id: 'beta', text: 'b' },
    { id: 'gamma', text: 'c' },
  ]);

  const cases = expandMatrix({
    name: 'routing',
    matrix: { corpus: 'corpus.json', entries: 'lessons', exclude: ['beta'] },
    skill_invocation: { prompt: '{{matrix.text}}' },
  }, dir);

  assert.deepStrictEqual(cases.map((c) => c.name), ['routing[alpha]', 'routing[gamma]']);
});

test('expandMatrix: throws when exclude has grown to cover the whole corpus, rather than running zero cases', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-matrix-'));
  writeCorpus(dir, [{ id: 'alpha', text: 'a' }]);

  assert.throws(() => expandMatrix({
    name: 'routing',
    matrix: { corpus: 'corpus.json', entries: 'lessons', exclude: ['alpha'] },
    skill_invocation: { prompt: '{{matrix.text}}' },
  }, dir), /selected 0 of 1 entries/);
});

test('expandMatrix: throws when the named entries property is not an array', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-matrix-'));
  fs.writeFileSync(path.join(dir, 'corpus.json'), JSON.stringify({ lessons: { not: 'an array' } }), 'utf8');

  assert.throws(() => expandMatrix({
    name: 'routing',
    matrix: { corpus: 'corpus.json', entries: 'lessons' },
    skill_invocation: { prompt: '{{matrix.text}}' },
  }, dir), /is not an array/);
});

test('runScenarioWith: a matrix scenario runs every case and returns one result (and one result file) each', async () => {
  const scenariosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-scen-'));
  writeCorpus(scenariosDir, [
    { id: 'alpha', text: 'first lesson' },
    { id: 'beta', text: 'second lesson' },
  ]);
  const scenarioPath = path.join(scenariosDir, 'sample.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: sample-matrix',
    'matrix:',
    '  corpus: corpus.json',
    '  entries: lessons',
    'fixture:',
    '  base: none',
    '  seed: []',
    'skill_invocation:',
    '  prompt: "classify: {{matrix.text}}"',
    'assertions:',
    '  - type: tool-called',
    '    name: Read',
    '    atLeast: 1',
  ].join('\n'));

  const resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-results-'));

  capturedPrompt = null;
  const results = await runScenarioWith(scenarioPath, { queryFn: fakeQueryCapturingPrompt, resultsDir, fixturesDir: scenariosDir });

  assert.strictEqual(results.length, 2, 'every corpus entry must run, not just the first');
  assert.deepStrictEqual(results.map((r) => r.scenario), ['sample-matrix[alpha]', 'sample-matrix[beta]']);
  assert.ok(results.every((r) => r.allPassed));
  // The last case's prompt proves substitution reached the SDK, not just expandMatrix.
  assert.strictEqual(capturedPrompt, 'classify: second lesson');
  assert.strictEqual(fs.readdirSync(resultsDir).length, 2, 'each case writes its own result file');
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
