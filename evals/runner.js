// Scenario runner: loads a scenario YAML, builds its fixture, invokes the
// Claude Agent SDK's query() with the actor wired as canUseTool, evaluates
// the scenario's assertions against the result, and writes one JSON result
// file. queryFn is injectable (default: the real SDK's query) so this file's
// own orchestration logic is testable without a live API call — see
// evals/tests/runner.test.js.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { load as loadYaml } from 'js-yaml';
import { query as realQuery } from '@anthropic-ai/claude-agent-sdk';
import { createActor } from './actor.js';
import { runAssertion } from './assertions/index.js';
import { freshRepo, seedFiles, applyPatch, seedLocalWorkRecord, walkFiles } from './fixtures/git-fixtures.js';

const EVALS_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(EVALS_ROOT, '..');
const SCENARIOS_DIR = path.join(EVALS_ROOT, 'scenarios');
const FIXTURES_DIR = path.join(EVALS_ROOT, 'fixtures');
const RESULTS_DIR = path.join(EVALS_ROOT, 'results');

// Task 7.6 (incident-driven, see task-7.6-brief.md): PLUGIN_ROOT is this
// actual live worktree, since evals/ lives inside the very plugin under
// test. Passing it directly as plugins[0].path let the SDK's own auto-
// injected "Base directory for this skill: <PLUGIN_ROOT>/skills/<name>" line
// entice a confused/exploring model into cd-ing into the real repo instead
// of staying inside the fixture. buildPluginSnapshot() copies only the
// directories a skill invocation actually needs to resolve plugin/skill
// content into a fresh tmpdir, excluding .git, evals/, docs/,
// .claude-tweaks/, and .superpowers/ — so plugins[0].path never names a real,
// nameable path into this worktree.
const PLUGIN_SNAPSHOT_DIRS = ['.claude-plugin', 'skills', 'agents', 'hooks', 'bin', 'commands'];

export function buildPluginSnapshot() {
  const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-plugin-snapshot-'));
  for (const name of PLUGIN_SNAPSHOT_DIRS) {
    const src = path.join(PLUGIN_ROOT, name);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(snapshotDir, name), { recursive: true });
    }
  }
  return snapshotDir;
}

function buildFixture(scenario, fixturesDir) {
  const dir = freshRepo();
  const baseName = scenario.fixture && scenario.fixture.base;
  if (baseName && baseName !== 'none') {
    const baseDir = path.join(fixturesDir, baseName);
    if (fs.existsSync(baseDir)) {
      const files = walkFiles(baseDir);
      if (Object.keys(files).length > 0) seedFiles(dir, files, 'seed base fixture');
    }
  }
  for (const step of (scenario.fixture && scenario.fixture.seed) || []) {
    if (step['apply-patch']) {
      const patchText = fs.readFileSync(path.join(fixturesDir, step['apply-patch']), 'utf8');
      applyPatch(dir, patchText);
    }
    if (step['local-record']) {
      seedLocalWorkRecord(dir, step['local-record']);
    }
  }
  return dir;
}

// scenarioPath -> result object, also written to <resultsDir>/<name>-<ts>.json.
// opts: { queryFn = realQuery, resultsDir = RESULTS_DIR, fixturesDir = FIXTURES_DIR }
export async function runScenarioWith(scenarioPath, opts = {}) {
  const { queryFn = realQuery, resultsDir = RESULTS_DIR, fixturesDir = FIXTURES_DIR } = opts;
  const scenario = loadYaml(fs.readFileSync(scenarioPath, 'utf8'));
  const repoDir = buildFixture(scenario, fixturesDir);
  const pluginSnapshotDir = buildPluginSnapshot();
  const actor = createActor({ answerOverrides: scenario.answer_overrides, repoDir });

  const toolCalls = [];
  let resultText = '';
  let costUsd = null;
  let tokens = null;
  const startedAt = Date.now();

  const stream = queryFn({
    prompt: scenario.skill_invocation.prompt,
    options: {
      cwd: repoDir,
      plugins: [{ type: 'local', path: pluginSnapshotDir }],
      managedSettings: {
        sandbox: {
          enabled: true,
          failIfUnavailable: true,
          allowUnsandboxedCommands: false,
          network: { allowedDomains: [] },
          filesystem: { allowRead: [path.join(repoDir, '.git')] },
        },
      },
      canUseTool: async (toolName, input, options) => {
        toolCalls.push(toolName);
        return actor(toolName, input, options);
      },
    },
  });

  for await (const message of stream) {
    if (message.type === 'assistant' && message.message && message.message.content) {
      const textParts = message.message.content.filter((c) => c.type === 'text').map((c) => c.text);
      // Accumulate across every assistant text message, not just the last one.
      // A skill like /claude-tweaks:review produces many narrative messages
      // across its own internal steps (and, once its Next Actions question is
      // answered, the agent may keep going into whatever it recommended next)
      // — the message carrying the actual findings table is very often not
      // the final one. Keeping only the last message silently discards
      // earlier substantive output; assertions here (parseFindingsTable) key
      // off a specific heading located anywhere in the text via indexOf, so
      // concatenating is safe and finds the first (correct) occurrence.
      if (textParts.length > 0) resultText += (resultText ? '\n' : '') + textParts.join('\n');
    }
    if (message.type === 'result') {
      costUsd = message.total_cost_usd != null ? message.total_cost_usd : null;
      tokens = message.usage != null ? message.usage : null;
    }
  }

  const durationMs = Date.now() - startedAt;
  const context = { repoDir, resultText, toolCalls };
  const assertionResults = (scenario.assertions || []).map((a) => runAssertion(context, a));

  const result = {
    scenario: scenario.name,
    startedAt: new Date(startedAt).toISOString(),
    durationMs,
    costUsd,
    tokens,
    toolCallCount: toolCalls.length,
    assertions: assertionResults,
    allPassed: assertionResults.every((a) => a.pass),
  };

  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, `${scenario.name}-${startedAt}.json`), JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  const [, , cmd, arg] = process.argv;
  if (cmd !== 'run' || !arg) {
    console.error('usage: node runner.js run <scenario-name>|--all');
    process.exit(1);
  }
  const names = arg === '--all'
    ? fs.readdirSync(SCENARIOS_DIR).filter((f) => f.endsWith('.yaml')).map((f) => f.replace(/\.yaml$/, ''))
    : [arg];

  let anyFailed = false;
  for (const name of names) {
    const scenarioPath = path.join(SCENARIOS_DIR, `${name}.yaml`);
    const result = await runScenarioWith(scenarioPath, {});
    console.log(`${name}: ${result.allPassed ? 'PASS' : 'FAIL'} (cost=$${result.costUsd}, tools=${result.toolCallCount}, ${result.durationMs}ms)`);
    if (!result.allPassed) anyFailed = true;
  }
  process.exit(anyFailed ? 1 : 0);
}

// Only run the CLI when this file is executed directly, not when imported by
// tests. Compares via pathToFileURL (not a hand-built `file://${path}` string)
// because this repo's own path contains a space ("Code Workspaces") — a
// manually-constructed URL string wouldn't percent-encode it the way
// import.meta.url does, so the two would silently never match.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
