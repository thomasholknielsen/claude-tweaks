# Residue CLI Subprocess Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a subprocess-level CLI test for `plugin/bin/residue.js` so its arg-parsing/wiring layer (`parseArgs`, the required `--base` check, `--json`/`--no-suite`/`--scope`/`--integration-branch`, and the usage-error exit path) is exercised end-to-end, the way `tests/bin-lib/record-graph/cli-render.test.js` already exercises `record-graph.js`.

**Architecture:** One new test file, `tests/bin-lib/residue/cli.test.js`, spawns `plugin/bin/residue.js` via `execFileSync`/`spawnSync` against this repo's own checkout (a `--no-suite --scope repo` read is non-mutating) — no new fixtures, no changes to `bin/residue.js` itself.

**Tech Stack:** Node's built-in `node:test` + `node:assert`, `child_process.execFileSync`/`spawnSync` — same as every other `tests/bin-lib/**/*.test.js` file.

**Spec:** `{run-dir}/work/231-spec.md` (record #231, materialized)

## Global Constraints

- New test file must be picked up by `npm test`'s existing glob (`find tests tools/upstream-drift/tests -name '*.test.js'`) with no `package.json` change.
- Assertions must check exit code and output *shape* only, never exact forge-derived content (no `gh`/network dependency).

---

### Task 1: Subprocess CLI test for `bin/residue.js`

**Files:**
- Create: `tests/bin-lib/residue/cli.test.js`

**Interfaces:**
- Consumes: `plugin/bin/residue.js`'s CLI contract — `--base <commit-ish>` (required), `--scope repo|blast-radius`, `--integration-branch <ref>`, `--no-suite`, `--json`; missing `--base` → stderr `usage: residue.js --base <commit-ish> [--scope repo|blast-radius] [--integration-branch <ref>] [--no-suite] [--json]` + exit 2; `--json` mode prints `{ scope, results }` where `results` is an array of `{ ran, ... }` probe-result objects (`plugin/bin/lib/residue/scope-filter.js`'s `filterResultsByScope` output); plain-text mode prints `renderOutstanding`'s output, which always starts with `### Outstanding (`.
- Produces: nothing consumed by later tasks — this is the only task.

- [ ] **Step 1: Write the failing tests**

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'plugin', 'bin', 'residue.js');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// assert.throws(/Command failed/) would pass for ANY nonzero exit code — this
// captures the error so status and stderr can both be checked directly
// (tests/bin-lib/record-graph/cli-render.test.js's own pattern).
function runExpectingFailure(args) {
  let error;
  try {
    execFileSync('node', [CLI, ...args], {
      cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch (e) {
    error = e;
  }
  assert.ok(error, `expected a nonzero exit for: ${args.join(' ')}`);
  return error;
}

test('omitting --base exits 2 with the usage message on stderr', () => {
  const error = runExpectingFailure([]);
  assert.strictEqual(error.status, 2);
  assert.match(error.stderr, /usage: residue\.js --base <commit-ish>/);
});

test('--base HEAD --no-suite runs and renders the Outstanding table', () => {
  const out = execFileSync('node', [CLI, '--base', 'HEAD', '--no-suite'], {
    cwd: REPO_ROOT, encoding: 'utf8',
  });
  assert.match(out, /^### Outstanding \(\d+\)/);
});

test('--base HEAD --no-suite --json prints a parseable {scope, results} shape', () => {
  const out = execFileSync('node', [CLI, '--base', 'HEAD', '--no-suite', '--json'], {
    cwd: REPO_ROOT, encoding: 'utf8',
  });
  const parsed = JSON.parse(out);
  assert.ok(parsed.scope && typeof parsed.scope === 'object', 'scope is an object');
  assert.ok(Array.isArray(parsed.results), 'results is an array');
  assert.ok(parsed.results.length > 0, 'at least one probe result present');
  for (const r of parsed.results) {
    assert.strictEqual(typeof r.ran, 'boolean', `result ${JSON.stringify(r).slice(0, 80)} carries a boolean ran field`);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/residue/cli.test.js`
Expected: FAIL — `tests/bin-lib/residue/cli.test.js` does not exist yet (module not found), so all three `test()` calls report as failing/erroring.

- [ ] **Step 3: Create the file with the exact content from Step 1**

The Step 1 code block above **is** the complete file content — write `tests/bin-lib/residue/cli.test.js` verbatim as shown, no changes needed since `plugin/bin/residue.js`'s existing behavior already satisfies every assertion (confirmed by reading `plugin/bin/residue.js`, `plugin/bin/lib/residue/scope.js`, and `plugin/bin/lib/residue/render.js` directly — no production-code changes are part of this task).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/residue/cli.test.js`
Expected: PASS — 3 passing tests, 0 failing.

- [ ] **Step 5: Confirm `npm test`'s glob picks up the new file with no `package.json` change**

Run: `find tests tools/upstream-drift/tests -name '*.test.js' | grep residue/cli.test.js`
Expected: prints `tests/bin-lib/residue/cli.test.js` — confirms the existing glob (`package.json`'s `test` script) already covers it.

- [ ] **Step 6: Commit**

```bash
git add tests/bin-lib/residue/cli.test.js
git commit -m "Add subprocess-level CLI test for bin/residue.js

refs #231"
```
