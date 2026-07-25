# Eval Benchmark Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the claude-tweaks eval harness (`evals/`) durable, git-tracked benchmark history — a `history.jsonl` append log, a `history` viewer command, and a manually-dispatched GitHub Action — so a scenario's cost/quality trend is answerable without diffing gitignored result files by hand.

**Architecture:** A new `evals/history.js` module owns git-sha resolution, appending, reading, and table-rendering. `runner.js` wires it in behind a record-by-default (`--no-record` to suppress) flag on the `run` subcommand, and gains a new `history` subcommand that reuses the same rendering for both local CLI use and a new `workflow_dispatch`-only GitHub Action.

**Tech Stack:** Node.js (ESM), `node --test`, no new runtime dependencies — reuses `@anthropic-ai/claude-agent-sdk` and `js-yaml`, already in `evals/package.json`.

## Global Constraints

- Zero new runtime dependencies in `evals/` — reuse `@anthropic-ai/claude-agent-sdk` and `js-yaml` only.
- `history.jsonl` entries reuse `runScenarioWith`'s existing `result` object shape verbatim, plus exactly two new fields: `gitSha`, `gitDirty`. No parallel schema.
- Recording is opt-out at the CLI: `node runner.js run <scenario>` records by default; `--no-record` suppresses it; applies to every scenario in a `--all` batch.
- `runScenarioWith`'s own `record` opt defaults to `false` (safe library default) — only `main()`'s `run` subcommand computes and passes `record: true` by default. Existing tests that call `runScenarioWith` without specifying `record` are unaffected by this change.
- Git-sha/dirty resolution must be injectable (`resolveGitStateFn` opt) so no test ever shells out to a real `git` subprocess against unrelated state.
- The GitHub Action triggers on `workflow_dispatch` only — never `push`, `pull_request`, or a schedule. This is a benchmark tool, not a CI gate.
- Verification is unit-tests-only except exactly one real confirming run (Task 3) — no other step in this plan spends real API money.

---

### Task 1: History data layer (`evals/history.js`)

**Files:**
- Create: `evals/history.js`
- Test: `evals/tests/history.test.js`

**Interfaces:**
- Consumes: `freshRepo` from `evals/fixtures/git-fixtures.js` (test-only, for `resolveGitState`'s happy-path test).
- Produces: `resolveGitState(pluginRoot): {gitSha: string|null, gitDirty: boolean|null}`, `appendHistoryEntry(historyPath, entry): void`, `readHistory(historyPath): Array<object>`, `formatHistoryTable(entries, scenario?): string` — all four consumed by Task 2's `runner.js` changes.

- [ ] **Step 1: Write the failing tests**

Create `evals/tests/history.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd evals && node --test tests/history.test.js`
Expected: FAIL — `Cannot find module '../history.js'`

- [ ] **Step 3: Write the implementation**

Create `evals/history.js`:

```js
// Durable cross-run tracking for the eval harness: appends one line per real
// scenario run to evals/history.jsonl (git-tracked, unlike the gitignored
// results/*.json files), correlated to the plugin repo's own commit sha, so
// "did commit X regress this scenario" and "is this scenario's cost trending
// up" are answerable without re-deriving anything. See
// docs/superpowers/specs/2026-07-25-eval-benchmark-tracking-design.md.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

// Real git implementation. Injectable via runScenarioWith's resolveGitStateFn
// opt so tests never shell out to git — see evals/tests/history.test.js and
// evals/tests/runner.test.js.
export function resolveGitState(pluginRoot) {
  try {
    const gitSha = execFileSync('git', ['-C', pluginRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const status = execFileSync('git', ['-C', pluginRoot, 'status', '--porcelain'], { encoding: 'utf8' });
    return { gitSha, gitDirty: status.trim().length > 0 };
  } catch {
    return { gitSha: null, gitDirty: null };
  }
}

export function appendHistoryEntry(historyPath, entry) {
  fs.appendFileSync(historyPath, JSON.stringify(entry) + '\n');
}

export function readHistory(historyPath) {
  if (!fs.existsSync(historyPath)) return [];
  const lines = fs.readFileSync(historyPath, 'utf8').split('\n').filter((l) => l.trim() !== '');
  const entries = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip a malformed line (e.g. a partial write from an interrupted
      // process) rather than let one bad line break every other entry.
    }
  }
  return entries;
}

function shortSha(sha) {
  return sha ? sha.slice(0, 7) : '(none)';
}

function failedAssertionTypes(entry) {
  return entry.assertions.filter((a) => !a.pass).map((a) => a.type).join(', ');
}

function formatDate(startedAt) {
  return startedAt.replace('T', ' ').replace(/\.\d+Z$/, 'Z');
}

function rowLine(row) {
  const date = formatDate(row.startedAt);
  const cost = row.costUsd != null ? `$${row.costUsd.toFixed(3)}` : '(n/a)';
  const passLabel = row.allPassed ? 'PASS' : `FAIL (${failedAssertionTypes(row)})`;
  return `${date}  ${shortSha(row.gitSha).padEnd(8)}  ${cost.padEnd(8)}  ${String(row.toolCallCount).padEnd(5)}  ${passLabel}`;
}

export function formatHistoryTable(entries, scenario) {
  if (scenario) {
    const rows = entries
      .filter((e) => e.scenario === scenario)
      .slice()
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
    if (rows.length === 0) return `No history for scenario "${scenario}".`;
    const lines = [`scenario: ${scenario}`, 'date                  sha       cost      tools  pass'];
    for (const row of rows) lines.push(rowLine(row));
    return lines.join('\n');
  }

  const latestByScenario = new Map();
  for (const entry of entries) {
    const existing = latestByScenario.get(entry.scenario);
    if (!existing || new Date(entry.startedAt) > new Date(existing.startedAt)) {
      latestByScenario.set(entry.scenario, entry);
    }
  }
  const scenarioNames = [...latestByScenario.keys()].sort();
  if (scenarioNames.length === 0) return 'No history recorded yet.';
  const lines = ['scenario                                   date                  sha       cost      tools  pass'];
  for (const name of scenarioNames) {
    lines.push(`${name.padEnd(42)}  ${rowLine(latestByScenario.get(name))}`);
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd evals && node --test tests/history.test.js`
Expected: all tests pass (10 tests)

- [ ] **Step 5: Commit**

```bash
cd evals
git add history.js tests/history.test.js
git commit -m "Add evals/history.js: git-sha resolution, append/read, table rendering"
```

---

### Task 2: Wire recording + the `history` subcommand into `runner.js`

**Files:**
- Modify: `evals/runner.js`
- Modify: `evals/tests/runner.test.js`
- Modify: `evals/README.md`

**Interfaces:**
- Consumes: `resolveGitState`, `appendHistoryEntry`, `readHistory`, `formatHistoryTable` (Task 1).
- Produces: `parseRunArgs(rest): {record: boolean, arg: string|undefined}` (new export from `runner.js`, consumed by nothing further in this plan but kept exported for testability); `runScenarioWith`'s opts gain `record = false`, `historyPath = HISTORY_PATH`, `resolveGitStateFn = resolveGitState`. Task 3 and Task 4 both consume the resulting CLI surface (`run <scenario>|--all [--no-record]`, `history [scenario]`) as black boxes — no further JS interfaces.

- [ ] **Step 1: Write the failing tests**

Edit `evals/tests/runner.test.js` — change the import line:

```js
import { runScenarioWith, buildPluginSnapshot } from '../runner.js';
```

to:

```js
import { runScenarioWith, buildPluginSnapshot, parseRunArgs } from '../runner.js';
```

Then append these three tests at the end of the file (after the existing `buildPluginSnapshot` test):

```js

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd evals && node --test tests/runner.test.js`
Expected: FAIL — `SyntaxError: The requested module '../runner.js' does not provide an export named 'parseRunArgs'`

- [ ] **Step 3: Write the implementation**

Edit `evals/runner.js` — add the new import after the existing imports:

```js
import { resolveGitState, appendHistoryEntry, readHistory, formatHistoryTable } from './history.js';
```

Add a new constant next to the existing `RESULTS_DIR` line:

```js
const HISTORY_PATH = path.join(EVALS_ROOT, 'history.jsonl');
```

In `runScenarioWith`, change the opts destructuring line from:

```js
  const { queryFn = realQuery, resultsDir = RESULTS_DIR, fixturesDir = FIXTURES_DIR } = opts;
```

to:

```js
  const {
    queryFn = realQuery,
    resultsDir = RESULTS_DIR,
    fixturesDir = FIXTURES_DIR,
    record = false,
    historyPath = HISTORY_PATH,
    resolveGitStateFn = resolveGitState,
  } = opts;
```

Immediately before the final `return result;` in `runScenarioWith` (after the existing `fs.writeFileSync(path.join(resultsDir, ...` line), add:

```js

  if (record) {
    const { gitSha, gitDirty } = resolveGitStateFn(PLUGIN_ROOT);
    appendHistoryEntry(historyPath, { ...result, gitSha, gitDirty });
  }
```

Replace the entire `main()` function with:

```js
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
    const result = await runScenarioWith(scenarioPath, { record });
    console.log(`${name}: ${result.allPassed ? 'PASS' : 'FAIL'} (cost=$${result.costUsd}, tools=${result.toolCallCount}, ${result.durationMs}ms)`);
    if (!result.allPassed) anyFailed = true;
  }
  process.exit(anyFailed ? 1 : 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd evals && node --test tests/runner.test.js`
Expected: all tests pass (8 tests)

Then run the full suite to confirm nothing else broke:

Run: `cd evals && node --test tests/`
Expected: all tests pass

- [ ] **Step 5: Free manual smoke test of the `history` subcommand's real CLI wiring**

At this point in the plan `evals/history.jsonl` does not exist yet (Task 3 creates the first real entry), so this is a genuine, zero-cost end-to-end check of `main()`'s new branch — no SDK call involved:

Run: `cd evals && node runner.js history`
Expected: prints exactly `No history recorded yet.`

Run: `cd evals && node runner.js history review-catches-planted-bugs`
Expected: prints exactly `No history for scenario "review-catches-planted-bugs".`

- [ ] **Step 6: Update `evals/README.md`**

Replace the `## Usage` section:

```markdown
## Usage

    node runner.js run review-catches-planted-bugs
    node runner.js run --all

Each run writes one JSON result file to `results/` (gitignored): cost,
tokens, tool-call count, wall-clock duration, and a per-assertion pass/fail
list.
```

with:

```markdown
## Usage

    node runner.js run review-catches-planted-bugs
    node runner.js run --all
    node runner.js run review-catches-planted-bugs --no-record

Each run writes one JSON result file to `results/` (gitignored): cost,
tokens, tool-call count, wall-clock duration, and a per-assertion pass/fail
list.
```

Replace the `## Comparing before/after a skill change` section:

```markdown
## Comparing before/after a skill change

    node runner.js run --all               # on main
    git checkout my-skill-change-branch
    node runner.js run --all               # on the branch
    # diff the two result sets under results/ by hand

No durable cross-run store exists yet — this is a deliberate v1 scope
decision (see the design doc's Result Handling section). Non-determinism:
a single run's numbers are noisy since this drives a real LLM agent, not
deterministic code — read a small delta as indicative, not conclusive. The
live skills this harness tests can themselves change behavior between runs
independent of anything under `evals/` — several scenarios here needed
recalibration mid-development when the underlying skill's real output
shape or effort-tiering behavior turned out to differ from what an earlier
run had captured. Treat a scenario's assertions as pinned to observed
reality at calibration time, not as a permanent contract the skill owes it.
```

with:

```markdown
## Comparing before/after a skill change

    node runner.js run --all               # on main — appends to history.jsonl
    git checkout my-skill-change-branch
    node runner.js run --all               # on the branch — appends its own lines
    node runner.js history <scenario>      # see both runs, newest first, correlated to gitSha

`history.jsonl` (see "Tracking results over time" below) is the durable
comparison mechanism — no more diffing two `results/` JSON files by hand.
Non-determinism: a single run's numbers are noisy since this drives a real
LLM agent, not deterministic code — read a small delta as indicative, not
conclusive; multiple lines sharing one `gitSha` in history are repeat
samples at the same commit, not an error. The live skills this harness
tests can themselves change behavior between runs independent of anything
under `evals/` — several scenarios here needed recalibration
mid-development when the underlying skill's real output shape or
effort-tiering behavior turned out to differ from what an earlier run had
captured. Treat a scenario's assertions as pinned to observed reality at
calibration time, not as a permanent contract the skill owes it.

## Tracking results over time

Every real run appends one line to `evals/history.jsonl` (git-tracked, not
gitignored — unlike `results/`) by default: the same cost/tokens/tool-count/
pass-fail data as a `results/*.json` file, plus the plugin repo's `gitSha`
and whether the working tree was `gitDirty` at run time. This is what makes
"did commit X regress this scenario" and "is this scenario's cost trending
up" answerable without re-deriving anything.

    node runner.js history review-catches-planted-bugs   # one scenario's history, newest first
    node runner.js history                                # most recent run per scenario

Pass `--no-record` on `run` to skip appending — useful while iterating on a
scenario's own definition, where the run doesn't represent a real benchmark
point. `--no-record` applies to every scenario in a `--all` batch.
```

- [ ] **Step 7: Commit**

```bash
cd evals
git add runner.js tests/runner.test.js README.md
git commit -m "Wire --no-record + history subcommand into runner.js"
```

---

### Task 3: Real confirming run

**Files:**
- Modify: `evals/history.jsonl` (created by this task — first real entry)

**Interfaces:**
- Consumes: the CLI surface built in Task 2 (`run <scenario> [--no-record]`, `history [scenario]`) as a black box.
- Produces: nothing new for later tasks — this is an end-to-end verification checkpoint.

This spends real API money (one scenario run, ~$0.44–$0.51 based on this scenario's prior observed cost).

- [ ] **Step 1: Run one real scenario with recording enabled (the default)**

Run: `cd evals && node runner.js run dispatch-local-files-preflight-stop`
Expected: prints `dispatch-local-files-preflight-stop: PASS (cost=$0.4X, tools=N, Nms)` (or FAIL — either way the run must complete and exit)

- [ ] **Step 2: Verify `evals/history.jsonl` was created with exactly one correct entry**

Run: `cat evals/history.jsonl`
Expected: exactly one line of JSON. `scenario` is `"dispatch-local-files-preflight-stop"`. `gitSha` is a 40-character hex string.

Run: `git rev-parse HEAD`
Expected: matches the `gitSha` value from the line above exactly.

Run: `git status --porcelain`
Expected: output is empty (Tasks 1 and 2 were already committed) — confirms the entry's `gitDirty` field is `false`.

- [ ] **Step 3: Verify the `history` command renders the new entry**

Run: `cd evals && node runner.js history dispatch-local-files-preflight-stop`
Expected: a table with one row matching Step 1's outcome (cost, tool count, PASS/FAIL)

- [ ] **Step 4: Verify the no-arg snapshot mode picks it up**

Run: `cd evals && node runner.js history`
Expected: one row, `dispatch-local-files-preflight-stop`, matching Step 1's outcome (the only scenario with any history yet)

- [ ] **Step 5: Run the full unit suite once more**

Run: `cd evals && node --test tests/`
Expected: all tests pass

- [ ] **Step 6: Commit the real history entry**

```bash
cd evals
git add history.jsonl
git commit -m "Record first real eval-benchmark history entry"
```

---

### Task 4: GitHub Action (`workflow_dispatch`)

**Files:**
- Create: `.github/workflows/eval-benchmark.yml`
- Modify: `evals/README.md`

**Interfaces:**
- Consumes: the CLI surface built in Task 2 exactly (`node runner.js run <scenario>|--all`, `node runner.js history`) as a black box — no new JS exports.
- Produces: nothing consumed by a later task in this plan.

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/eval-benchmark.yml`:

```yaml
name: Eval benchmark

on:
  workflow_dispatch:
    inputs:
      scenario:
        description: 'Scenario to run (or "all")'
        required: true
        default: 'all'
        type: choice
        options:
          - all
          - review-catches-planted-bugs
          - code-health-seeded-findings
          - simplify-fixes-planted-complexity
          - triage-permission-matrix-compliance
          - dispatch-local-files-preflight-stop

permissions:
  contents: write

jobs:
  run-eval:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install eval harness dependencies
        run: npm install
        working-directory: evals

      - name: Run scenario
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        working-directory: evals
        run: |
          if [ "${{ inputs.scenario }}" = "all" ]; then
            node runner.js run --all
          else
            node runner.js run "${{ inputs.scenario }}"
          fi

      - name: Write step summary
        working-directory: evals
        run: node runner.js history >> "$GITHUB_STEP_SUMMARY"

      - name: Commit history.jsonl
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add evals/history.jsonl
          if git diff --cached --quiet; then
            echo "No changes to commit."
          else
            git commit -m "Record eval benchmark run (${{ inputs.scenario }})"
            git push
          fi
```

- [ ] **Step 2: Validate YAML syntax**

Run: `cd evals && node -e "require('js-yaml').load(require('fs').readFileSync('../.github/workflows/eval-benchmark.yml', 'utf8')); console.log('valid yaml')"`
Expected: prints `valid yaml`

- [ ] **Step 3: Manually cross-check every `run:` command against the real CLI surface**

Read `.github/workflows/eval-benchmark.yml` and `evals/runner.js` side by side. Confirm:
- `node runner.js run --all` and `node runner.js run "<scenario>"` both match `parseRunArgs`'s accepted positional shapes from Task 2 (no `--no-record` needed here — the Action's runs are exactly the "real benchmark point" case recording exists for).
- `node runner.js history` (no argument) matches the no-arg snapshot branch added in Task 2.
- The five scenario names in the `options:` list match the five files under `evals/scenarios/*.yaml` exactly (`review-catches-planted-bugs`, `code-health-seeded-findings`, `simplify-fixes-planted-complexity`, `triage-permission-matrix-compliance`, `dispatch-local-files-preflight-stop`).

This workflow is not triggered as part of this plan — its first real dispatch is a manual, human-triggered action after an `ANTHROPIC_API_KEY` repository secret is configured (outside this plan's scope; see the README update below).

- [ ] **Step 4: Update `evals/README.md`**

Append to the end of the `## Tracking results over time` section added in Task 2 (after its last paragraph, before the next `##` heading):

```markdown

A `workflow_dispatch`-triggered GitHub Action (`.github/workflows/eval-benchmark.yml`)
runs the same CLI against a chosen scenario (or all five) and commits
`history.jsonl` back to the branch it ran against, so a manually-triggered
CI run and a local run land in the same durable log. Requires an
`ANTHROPIC_API_KEY` repository secret, configured once in the repo's
Settings → Secrets and variables → Actions (a one-time manual step outside
this repo's own tooling).
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/eval-benchmark.yml evals/README.md
git commit -m "Add manually-dispatched GitHub Action for eval benchmark runs"
```

---

## Self-Review Notes

**Spec coverage:** Storage mechanism (git-committed `history.jsonl`) → Task 1 + Task 2's append wiring. Entry schema (result object + gitSha/gitDirty) → Task 1's `resolveGitState`/`appendHistoryEntry` + Task 2's call site. Record-by-default / `--no-record` → Task 2's `parseRunArgs`. `history` viewer command (newest-first, inline failed-assertion names, no-arg snapshot) → Task 1's `formatHistoryTable` + Task 2's `main()` branch. GitHub Action (`workflow_dispatch`, scenario choice, commit-back, step summary) → Task 4. Verification (unit-tests-only + one real confirming run) → Tasks 1–2's tests, Task 3's real run. Error handling (git-sha resolution failure → null fields; concurrent-write safety; Action commit-back race) → Task 1's `resolveGitState` try/catch (null fields), sequential-execution already inherent to `main()`'s existing `for` loop (no change needed), Task 4's Step 3 note (accepted, not engineered around). Explicitly deferred items (dashboard integration, `compare` command, multi-run statistics) have no task — correctly absent, per the design's own Non-Goals.

**Placeholder scan:** No TBD/TODO markers. Every code block is complete, runnable code, not a description of what to write.

**Type consistency:** `resolveGitState(pluginRoot)` (Task 1) returns `{gitSha, gitDirty}` and is called identically in Task 1's own tests and Task 2's `runScenarioWith` (as `resolveGitStateFn(PLUGIN_ROOT)`). `appendHistoryEntry(historyPath, entry)` / `readHistory(historyPath)` / `formatHistoryTable(entries, scenario)` signatures match between Task 1's definition, Task 1's own tests, and Task 2's `main()` call sites (`formatHistoryTable(entries, rest[0])`). `parseRunArgs(rest)` returns `{record, arg}`, matching both its own test in Task 2 and its call site inside the rewritten `main()`.
