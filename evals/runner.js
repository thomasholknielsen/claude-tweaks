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
import { freshRepo, seedFiles, applyPatch, seedLocalWorkRecord, seedGitRemote, seedBranch, walkFiles } from './fixtures/git-fixtures.js';
import { resolveGitState, appendHistoryEntry, readHistory, formatHistoryTable } from './history.js';

const EVALS_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(EVALS_ROOT, '..');
const SCENARIOS_DIR = path.join(EVALS_ROOT, 'scenarios');
const FIXTURES_DIR = path.join(EVALS_ROOT, 'fixtures');
const RESULTS_DIR = path.join(EVALS_ROOT, 'results');
const HISTORY_PATH = path.join(EVALS_ROOT, 'history.jsonl');

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
// PLUGIN_SNAPSHOT_DIRS is the eval fixture snapshot, not the payload
// definition — the payload boundary is the plugin/ subtree (ADR-0015).
const PLUGIN_SNAPSHOT_DIRS = ['plugin/.claude-plugin', 'plugin/skills', 'plugin/agents', 'plugin/hooks', 'plugin/bin', 'plugin/commands'];

export function buildPluginSnapshot() {
  const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-plugin-snapshot-'));
  for (const name of PLUGIN_SNAPSHOT_DIRS) {
    const src = path.join(PLUGIN_ROOT, name);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(snapshotDir, path.basename(name)), { recursive: true });
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
    // Opt-in per scenario, never a default: several fixtures exist precisely to
    // exercise a no-remote repo (code-health-seeded-findings drives the
    // gh-unavailable degrade path that way), so seeding one globally would
    // silently retarget them.
    if (step['git-remote']) {
      seedGitRemote(dir, step['git-remote']);
    }
    if (step['branch']) {
      seedBranch(dir, step['branch']);
    }
    // Minimal arm (#180): writes files directly to the fixture's single
    // branch, with no branching semantics at all. Added for the
    // consequence-filter matrix, which only needs a per-case brief file on
    // disk — seedBranch would work but drags in a rename-default-branch +
    // checkout-a-feature-branch side effect the skill under test (research
    // verify, which never inspects `git diff`) has no use for.
    if (step['files']) {
      seedFiles(dir, step['files']);
    }
  }
  return dir;
}

// ── Matrix expansion ────────────────────────────────────────────────────────
// One scenario file iterating a frozen fixture corpus. Without this, covering
// an N-entry corpus means N near-identical scenario files, and an entry added
// to the corpus is exercised by nothing until someone remembers to add the
// (N+1)th file — the corpus reads as coverage while measuring nothing (#158).

const MATRIX_PLACEHOLDER_RE = /\{\{matrix\.([A-Za-z0-9_$.]+)\}\}/g;
const MATRIX_WHOLE_RE = /^\{\{matrix\.([A-Za-z0-9_$.]+)\}\}$/;

function readPath(obj, dottedPath) {
  return dottedPath.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

// Deep-substitutes {{matrix.<dotted.path>}} against one corpus entry. A string
// that is EXACTLY one placeholder resolves to the raw value rather than to its
// stringification, so a corpus null stays null: routing-destination-matches.js
// gates the kind check on `if (expectedKind)`, which a literal "null" string
// would wrongly satisfy — turning a skipped check into a guaranteed-failing one.
function substituteMatrix(value, entry) {
  if (typeof value === 'string') {
    const whole = value.match(MATRIX_WHOLE_RE);
    if (whole) return readPath(entry, whole[1]);
    return value.replace(MATRIX_PLACEHOLDER_RE, (_, p) => String(readPath(entry, p) ?? ''));
  }
  if (Array.isArray(value)) return value.map((v) => substituteMatrix(v, entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substituteMatrix(v, entry)]));
  }
  return value;
}

// scenario -> array of fully-resolved scenarios, one per selected corpus entry.
// A scenario with no `matrix:` block expands to itself, so every caller runs
// the same loop and a matrix can never be silently reduced to its first case.
//
//   matrix:
//     corpus: learning-routing-corpus/lessons.json   # path under fixturesDir
//     entries: lessons        # property holding the array; omit if the file IS one
//     exclude: [some-id]      # entries a dedicated scenario file already covers
//
// `exclude` (rather than an `only` allowlist) keeps the default inclusive: a
// newly added corpus entry runs without anyone editing this scenario, which is
// the whole failure mode this construct exists to close.
export function expandMatrix(scenario, fixturesDir) {
  const matrix = scenario.matrix;
  if (!matrix) return [scenario];
  if (!matrix.corpus) throw new Error(`scenario "${scenario.name}": matrix.corpus is required`);
  const corpus = JSON.parse(fs.readFileSync(path.join(fixturesDir, matrix.corpus), 'utf8'));
  const entries = matrix.entries ? readPath(corpus, matrix.entries) : corpus;
  if (!Array.isArray(entries)) {
    const where = matrix.entries ? `${matrix.corpus} (.${matrix.entries})` : matrix.corpus;
    throw new Error(`scenario "${scenario.name}": matrix source ${where} is not an array`);
  }
  const exclude = new Set(matrix.exclude || []);
  const selected = entries.filter((entry) => !exclude.has(entry.id));
  // Fail loudly: an exclude list that has grown to cover the whole corpus is a
  // scenario that runs nothing while still reporting PASS for zero cases.
  if (selected.length === 0) {
    throw new Error(`scenario "${scenario.name}": matrix selected 0 of ${entries.length} entries in ${matrix.corpus} — every entry is excluded`);
  }
  return selected.map((entry, i) => {
    const { matrix: _unused, ...rest } = scenario;
    return { ...substituteMatrix(rest, entry), name: `${scenario.name}[${entry.id ?? i}]` };
  });
}

// scenarioPath -> array of result objects, one per matrix case (length 1 when
// the scenario declares no matrix), each also written to
// <resultsDir>/<name>-<ts>.json. Cases run sequentially: each is a real,
// billed agent run against its own fixture repo.
// opts: see runResolvedScenario.
export async function runScenarioWith(scenarioPath, opts = {}) {
  const { fixturesDir = FIXTURES_DIR } = opts;
  const scenario = loadYaml(fs.readFileSync(scenarioPath, 'utf8'));
  const results = [];
  for (const resolved of expandMatrix(scenario, fixturesDir)) {
    results.push(await runResolvedScenario(resolved, opts));
  }
  return results;
}

// Runs ONE fully-resolved scenario object (matrix already expanded).
// opts: { queryFn = realQuery, resultsDir = RESULTS_DIR, fixturesDir = FIXTURES_DIR, record = false, historyPath = HISTORY_PATH, resolveGitStateFn = resolveGitState }
export async function runResolvedScenario(scenario, opts = {}) {
  const {
    queryFn = realQuery,
    resultsDir = RESULTS_DIR,
    fixturesDir = FIXTURES_DIR,
    record = false,
    historyPath = HISTORY_PATH,
    resolveGitStateFn = resolveGitState,
  } = opts;
  const repoDir = buildFixture(scenario, fixturesDir);
  const escapeTargetPath = path.join(os.tmpdir(), `ct-eval-escape-${path.basename(repoDir)}.txt`);
  const prompt = scenario.skill_invocation.prompt.replaceAll('{{ESCAPE_TARGET_PATH}}', escapeTargetPath);
  const pluginSnapshotDir = buildPluginSnapshot();
  const actor = createActor({ answerOverrides: scenario.answer_overrides, repoDir });

  const toolCalls = [];
  // Parallel to toolCalls (which stays a flat array of bare names — several
  // assertions/tests already key off that exact shape): records {name, input}
  // per call so tool-input-includes.js can verify a call attempted a specific
  // thing, not just that the tool ran at all.
  const toolInputs = [];
  let resultText = '';
  let costUsd = null;
  let tokens = null;
  const startedAt = Date.now();

  const stream = queryFn({
    prompt,
    options: {
      cwd: repoDir,
      plugins: [{ type: 'local', path: pluginSnapshotDir }],
      managedSettings: {
        sandbox: {
          enabled: true,
          failIfUnavailable: true,
          allowUnsandboxedCommands: false,
          // The SDK's own default for this setting is true (confirmed
          // against the installed SDK's sdk.d.ts — see evals/NOTES.md);
          // left on, many sandboxed Bash calls bypass canUseTool entirely,
          // so toolCalls (and any tool-count/tool-called assertion built on
          // it) silently undercounts real tool use. Explicitly disabling it
          // routes every Bash call through canUseTool, costing one extra
          // async JS round-trip per call — noise next to the seconds-scale
          // latency of the real model turn each scenario already pays for,
          // so accurate counting wins the tradeoff for a harness whose
          // whole purpose is measurement.
          autoAllowBashIfSandboxed: false,
          network: { allowedDomains: [] },
          filesystem: { allowRead: [path.join(repoDir, '.git')] },
        },
      },
      canUseTool: async (toolName, input, options) => {
        toolCalls.push(toolName);
        toolInputs.push({ name: toolName, input });
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
  // `history` is read HERE, before this run's own append below, so a
  // history-comparing assertion (context-cost-regression) sees only prior runs
  // and can never include the current one in its own baseline.
  const context = {
    repoDir, resultText, toolCalls, escapeTargetPath, toolInputs,
    scenarioName: scenario.name, tokens, history: readHistory(historyPath),
  };
  // A thrown assertion (unknown type, or a fail-closed check like
  // absolute-path-exists.js's missing-target guard) must not crash the whole
  // run after a real, already-paid-for API call completed — that would lose
  // the run's result entirely instead of recording an inspectable FAIL.
  const assertionResults = (scenario.assertions || []).map((a) => {
    try {
      return runAssertion(context, a);
    } catch (err) {
      return { type: a.type, pass: false, message: `assertion threw: ${err.message}` };
    }
  });

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

  if (record) {
    const { gitSha, gitDirty } = resolveGitStateFn(PLUGIN_ROOT);
    appendHistoryEntry(historyPath, { ...result, gitSha, gitDirty });
  }

  return result;
}

// Pure argv-parsing helper for the `run` subcommand, exported so it's unit
// testable without spawning the CLI. `--all` is a positional value (the
// scenario selector), not a boolean flag, so it must NOT be filtered out
// the way `--no-record` is.
export function parseRunArgs(rest) {
  const record = !rest.includes('--no-record');
  const positional = rest.filter((a) => a !== '--no-record');
  return { record, arg: positional[0] };
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === 'history') {
    const entries = readHistory(HISTORY_PATH);
    console.log(formatHistoryTable(entries, rest[0]));
    return;
  }

  const { record, arg } = parseRunArgs(rest);
  if (cmd !== 'run' || !arg) {
    console.error('usage: node runner.js run <scenario-name>|--all [--no-record]');
    console.error('       node runner.js history [scenario-name]');
    process.exit(1);
  }
  const names = arg === '--all'
    ? fs.readdirSync(SCENARIOS_DIR).filter((f) => f.endsWith('.yaml')).map((f) => f.replace(/\.yaml$/, ''))
    : [arg];

  let anyFailed = false;
  for (const name of names) {
    const scenarioPath = path.join(SCENARIOS_DIR, `${name}.yaml`);
    // One line per matrix case, labelled by result.scenario (which carries the
    // `[entry-id]` suffix) rather than by the file's basename — otherwise every
    // case of a matrix scenario prints under one indistinguishable name.
    for (const result of await runScenarioWith(scenarioPath, { record })) {
      console.log(`${result.scenario}: ${result.allPassed ? 'PASS' : 'FAIL'} (cost=$${result.costUsd}, tools=${result.toolCallCount}, ${result.durationMs}ms)`);
      if (!result.allPassed) anyFailed = true;
    }
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
