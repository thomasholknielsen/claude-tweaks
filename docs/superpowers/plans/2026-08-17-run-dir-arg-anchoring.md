# Run-Dir Argument Anchoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the `[IL-127]` failure class at every CLI entry point that accepts an untrusted `--run`/`--run-dir` path argument, so a worktree-relative shadow copy of a pipeline run directory can never be created or adopted through the argument, not just through the `PIPELINE_RUN_DIR` env var (already guarded by `bin/lib/hooks/run-dir-resolve.js`).

**Architecture:** `bin/lib/hooks/worktree-detect.js` already exports `mainCheckoutRoot(cwd)` and `isAnchoredUnderRoot(resolvedPath, root)` — the same two primitives `run-dir-resolve.js`'s `resolve()` uses to reject an unanchored `PIPELINE_RUN_DIR`. Both primitives are existence-independent (they walk up via `nearestExistingDir` to whichever ancestor directory actually exists), so they work correctly whether the candidate path already exists (`bin/hooks.js`'s five `resolveRunArg` callers) or is about to be created (`bin/wrap-up-engine.js`'s `plan` verb, `bin/materialize.js`). No new module — every fix below composes these two exports directly.

**Tech Stack:** Node.js (`node --test`), no new dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-08-17T181730-spec-790/work/790-spec.md`

## Global Constraints

- Reuse `bin/lib/hooks/worktree-detect.js`'s `mainCheckoutRoot()` / `isAnchoredUnderRoot()` — do not reimplement anchoring logic.
- Do not touch `bin/lib/log-decision/append.js` — its `resolveTarget` already anchors correctly.
- `resolveRunArg`'s existing `isRealDir` check in `bin/hooks.js` must stay — the anchoring check is additive, not a replacement.
- `npm test` must pass in full after every task.

## Scope note (logged to this run's `decisions.md` as an `add-to-plan` scope-creep decision)

While auditing the actual call sites (not just the two named in the original issue), `bin/materialize.js`'s `--run-dir` parsing was found to have the identical gap — no anchoring validation before `fs.mkdirSync`/`fs.writeFileSync`. It is folded into this plan as Task 3, using the same helpers as Tasks 1-2.

---

### Task 1: Anchor `bin/hooks.js`'s `resolveRunArg`

**Files:**
- Modify: `bin/hooks.js:1-51` (add a require near the top; edit `resolveRunArg`'s `isRealDir` branch)
- Test: `tests/hooks-run-arg-anchoring.test.js` (new)

**Interfaces:**
- Consumes: `wtDetect.mainCheckoutRoot(cwd)` → `string|null`; `wtDetect.isAnchoredUnderRoot(resolvedPath, root)` → `boolean` (both already exported by `bin/lib/hooks/worktree-detect.js`).
- Produces: `resolveRunArg(args, cwd, env)` unchanged shape `{ runDir, invalidRunArg, rest, explicit }` — only the `invalidRunArg` value's content changes for the new rejection case. All five existing callers (`record-worktree`, `record-pr`, `spec-status`, `close-run`, `check-resume-freshness`) already branch on `if (invalidRunArg)` and need no changes.

- [ ] **Step 1: Write the failing tests**

Create `tests/hooks-run-arg-anchoring.test.js`:

```js
// tests/hooks-run-arg-anchoring.test.js
//
// #790: bin/hooks.js's resolveRunArg validated an explicit --run <path> only
// via fs.statSync(...).isDirectory() — true for a worktree-relative directory
// just as readily as a main-checkout-anchored one. CLI-level coverage
// (spawns the real process, like tests/hooks-resolve-run-dir-cli.test.js)
// proving --run is now rejected when it resolves inside a linked worktree,
// whether passed as a relative or an absolute path, and still accepted when
// it genuinely resolves under the main checkout.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { gitRepo, linkedWorktreeOf } = require('./helpers/git-fixtures');

const HOOKS_JS = path.join(__dirname, '..', 'bin', 'hooks.js');

function runRecordWorktree(args, cwd) {
  try {
    const stdout = execFileSync('node', [HOOKS_JS, 'record-worktree', ...args], {
      cwd, timeout: 15000,
    });
    return { code: 0, stdout: stdout.toString('utf8') };
  } catch (e) {
    return {
      code: typeof e.status === 'number' ? e.status : 1,
      stdout: e.stdout ? e.stdout.toString('utf8') : '',
    };
  }
}

function mkRunDir(base, relParts) {
  const dir = path.join(base, ...relParts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test('reject: --run is a relative path that resolves inside the linked worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  mkRunDir(wt, ['.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-790']);
  const out = runRecordWorktree(
    ['--run', path.join('.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-790'), wt],
    wt,
  );
  assert.match(out.stdout, /not anchored|resolves outside the main checkout/i);
  assert.doesNotMatch(out.stdout, /worktree recorded/);
});

test('reject: --run is an absolute path that resolves inside the linked worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const trapped = mkRunDir(wt, ['.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-791']);
  const out = runRecordWorktree(['--run', trapped, wt], wt);
  assert.match(out.stdout, /not anchored|resolves outside the main checkout/i);
  assert.doesNotMatch(out.stdout, /worktree recorded/);
});

test('accept: --run is an absolute path correctly anchored under the main checkout', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const anchored = mkRunDir(main, ['.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-792']);
  // Invoked from inside the worktree (the real-world shape) — the anchoring
  // check must accept a --run value that genuinely resolves under $RUN_ROOT.
  const out = runRecordWorktree(['--run', anchored, wt], wt);
  assert.match(out.stdout, /worktree recorded/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/hooks-run-arg-anchoring.test.js`
Expected: the first two tests FAIL (stdout says `claude-tweaks: worktree recorded for ...` instead of naming the unanchored path — the current bug).

- [ ] **Step 3: Add the anchoring check**

In `bin/hooks.js`, add the require near the existing hook-module requires (after line 17's `resumeFreshness` require):

```js
const wtDetect = require('./lib/hooks/worktree-detect');
```

Replace the `isRealDir` branch inside `resolveRunArg` (currently):

```js
  const isRealDir = candidate ? (() => { try { return fs.statSync(candidate).isDirectory(); } catch { return false; } })() : false;
  if (isRealDir) {
    return { runDir: candidate, invalidRunArg: null, rest, explicit: true };
  }
  return { runDir: null, invalidRunArg: candidate || '(missing value)', rest, explicit: true };
```

with:

```js
  const isRealDir = candidate ? (() => { try { return fs.statSync(candidate).isDirectory(); } catch { return false; } })() : false;
  if (isRealDir) {
    // #790/[IL-127]: a real directory is not enough — it must also resolve
    // under the main checkout, never a worktree-relative shadow copy. Mirrors
    // run-dir-resolve.js's identical adoption-time check for PIPELINE_RUN_DIR.
    const mainRoot = wtDetect.mainCheckoutRoot(cwd);
    if (!wtDetect.isAnchoredUnderRoot(path.resolve(candidate), mainRoot)) {
      return {
        runDir: null,
        invalidRunArg: `${candidate} (exists, but not anchored under the main checkout${mainRoot ? ` at ${mainRoot}` : ''} — refusing a worktree-relative shadow run dir; see resolve-run-dir)`,
        rest,
        explicit: true,
      };
    }
    return { runDir: candidate, invalidRunArg: null, rest, explicit: true };
  }
  return { runDir: null, invalidRunArg: candidate || '(missing value)', rest, explicit: true };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/hooks-run-arg-anchoring.test.js`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add bin/hooks.js tests/hooks-run-arg-anchoring.test.js
git commit -m "Anchor bin/hooks.js's resolveRunArg --run argument under the main checkout"
```

---

### Task 2: Anchor `bin/wrap-up-engine.js`'s `--run-dir`

**Files:**
- Modify: `bin/wrap-up-engine.js:1-27` (add a require), `bin/wrap-up-engine.js:289-298` (`main()`)
- Test: `tests/wrap-up-engine-run-dir-anchoring.test.js` (new)

**Interfaces:**
- Consumes: same `wtDetect.mainCheckoutRoot` / `wtDetect.isAnchoredUnderRoot` as Task 1.
- Produces: no change to `parseArgs`'s return shape; `main()` gains one early-exit branch before dispatching to `runPlan`/`runRecord`/`runRender`.

- [ ] **Step 1: Write the failing tests**

Create `tests/wrap-up-engine-run-dir-anchoring.test.js`:

```js
// tests/wrap-up-engine-run-dir-anchoring.test.js
//
// #790: bin/wrap-up-engine.js's --run-dir had no validation at all before
// `plan`'s fs.mkdirSync(args.runDir, { recursive: true }) — a bare relative
// value, or an absolute value resolving inside a linked worktree, silently
// created the run's audit trail as a worktree-relative shadow copy
// ([IL-127]'s shape). Unlike bin/hooks.js's resolveRunArg (which only ever
// operates on an ALREADY-EXISTING run dir), --run-dir here often names a
// directory that doesn't exist yet — so these tests deliberately never
// pre-create the target, proving the check does not depend on existence.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { gitRepo, linkedWorktreeOf } = require('./helpers/git-fixtures');

const ENGINE_JS = path.join(__dirname, '..', 'bin', 'wrap-up-engine.js');

function runPlan(args, cwd) {
  try {
    const stdout = execFileSync('node', [ENGINE_JS, 'plan', ...args], { cwd, timeout: 15000 });
    return { code: 0, stdout: stdout.toString('utf8'), stderr: '' };
  } catch (e) {
    return {
      code: typeof e.status === 'number' ? e.status : 1,
      stdout: e.stdout ? e.stdout.toString('utf8') : '',
      stderr: e.stderr ? e.stderr.toString('utf8') : '',
    };
  }
}

test('reject: --run-dir is a bare-relative path (never created)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const rel = path.join('.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-790');
  const out = runPlan(['--run-dir', rel, '--base', 'HEAD'], wt);
  assert.strictEqual(out.code, 2);
  assert.match(out.stderr, /resolves outside the main checkout/i);
  assert.ok(!fs.existsSync(path.join(wt, rel)), 'the shadow directory must never be created');
});

test('reject: --run-dir is absolute but resolves inside the linked worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const abs = path.join(wt, '.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-791');
  const out = runPlan(['--run-dir', abs, '--base', 'HEAD'], wt);
  assert.strictEqual(out.code, 2);
  assert.match(out.stderr, /resolves outside the main checkout/i);
  assert.ok(!fs.existsSync(abs), 'the shadow directory must never be created');
});

test('accept: --run-dir is absolute and anchored under the main checkout', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const abs = path.join(main, '.claude-tweaks', 'pipelines', '2026-01-01T000000-spec-792');
  const out = runPlan(['--run-dir', abs, '--base', 'HEAD'], wt);
  // Whatever happens downstream (gatherFacts against a minimal fixture repo),
  // the anchoring gate itself must not be what rejects it.
  assert.doesNotMatch(out.stderr, /resolves outside the main checkout/i);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/wrap-up-engine-run-dir-anchoring.test.js`
Expected: the first two tests FAIL — `plan` currently creates the shadow directory instead of rejecting it (`fs.existsSync` assertion fails, exit code is 0 not 2).

- [ ] **Step 3: Add the anchoring check**

In `bin/wrap-up-engine.js`, add the require after the existing `path` require (after line 21):

```js
const wtDetect = require('./lib/hooks/worktree-detect');
```

Replace `main()` (currently):

```js
function main() {
  const verb = process.argv[2];
  const args = parseArgs(process.argv.slice(3));

  if (verb === 'plan') { runPlan(args); return; }
  if (verb === 'record') { runRecord(args); return; }
  if (verb === 'render') { runRender(args); return; }

  usageExit();
}
```

with:

```js
function main() {
  const verb = process.argv[2];
  const args = parseArgs(process.argv.slice(3));

  // #790/[IL-127]: reject an unanchored --run-dir before any verb reads or
  // creates anything there. Existence-independent — plan's own
  // fs.mkdirSync(args.runDir) means the target often doesn't exist yet, and
  // isAnchoredUnderRoot already walks up to whichever ancestor does.
  if (args.runDir) {
    const mainRoot = wtDetect.mainCheckoutRoot(process.cwd());
    if (!wtDetect.isAnchoredUnderRoot(path.resolve(args.runDir), mainRoot)) {
      process.stderr.write(
        `wrap-up-engine.js: --run-dir ${args.runDir} resolves outside the main checkout`
        + `${mainRoot ? ` (${mainRoot})` : ''} — refusing a worktree-relative shadow run dir; see resolve-run-dir\n`,
      );
      process.exit(2);
    }
  }

  if (verb === 'plan') { runPlan(args); return; }
  if (verb === 'record') { runRecord(args); return; }
  if (verb === 'render') { runRender(args); return; }

  usageExit();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/wrap-up-engine-run-dir-anchoring.test.js`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add bin/wrap-up-engine.js tests/wrap-up-engine-run-dir-anchoring.test.js
git commit -m "Anchor bin/wrap-up-engine.js's --run-dir under the main checkout"
```

---

### Task 3: Anchor `bin/materialize.js`'s `--run-dir` (scope addition — see Scope note above)

**Files:**
- Modify: `bin/materialize.js:16-22` (add a require), `bin/materialize.js:66` (`run()`)
- Test: `tests/materialize-run-dir-anchoring.test.js` (new)

**Interfaces:**
- Consumes: same `wtDetect.mainCheckoutRoot` / `wtDetect.isAnchoredUnderRoot` as Tasks 1-2.
- Produces: `run(argv, deps)`'s exported shape is unchanged; the new check runs before `deps.ghAvailable()` is ever called, so a rejection never touches `gh`/network.

- [ ] **Step 1: Write the failing tests**

Create `tests/materialize-run-dir-anchoring.test.js`:

```js
// tests/materialize-run-dir-anchoring.test.js
//
// #790: bin/materialize.js's --run-dir had zero validation before
// deps.mkdirp(workDir)/deps.writeFile(outFile, ...) — the same [IL-127] gap
// as bin/hooks.js and bin/wrap-up-engine.js. run(argv, deps) is directly
// callable (deps-injected, per its own header comment: "All I/O through deps
// so tests never touch gh, git, or the filesystem") — these tests exercise
// it in-process against real gitRepo()/linkedWorktreeOf() fixtures, chdir'd
// per test, with deps stubbed to prove the anchoring check runs BEFORE any
// gh/network call: a rejection must never reach deps.ghAvailable.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { gitRepo, linkedWorktreeOf } = require('./helpers/git-fixtures');
const { run } = require('../bin/materialize');

function withCwd(dir, fn) {
  const prev = process.cwd();
  process.chdir(dir);
  try { return fn(); } finally { process.chdir(prev); }
}

function fakeDeps(overrides = {}) {
  const calls = { ghAvailable: 0 };
  return {
    calls,
    ghAvailable: () => { calls.ghAvailable += 1; return false; }, // stop right after, if reached
    ghView: () => { throw new Error('ghView should never be called in these tests'); },
    remoteUrl: () => { throw new Error('remoteUrl should never be called in these tests'); },
    mkdirp: () => { throw new Error('mkdirp should never be called when --run-dir is rejected'); },
    writeFile: () => { throw new Error('writeFile should never be called when --run-dir is rejected'); },
    stdout: () => {},
    stderr: () => {},
    ...overrides,
  };
}

test('reject: --run-dir is a bare-relative path resolving inside the linked worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const deps = fakeDeps();
  let stderrText = '';
  deps.stderr = (s) => { stderrText += s; };
  const code = withCwd(wt, () => run(['1', '--run-dir', path.join('.claude-tweaks', 'pipelines', 'x')], deps));
  assert.strictEqual(code, 2);
  assert.match(stderrText, /resolves outside the main checkout/i);
  assert.strictEqual(deps.calls.ghAvailable, 0, 'must reject before ever checking gh availability');
});

test('reject: --run-dir is absolute but resolves inside the linked worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const deps = fakeDeps();
  let stderrText = '';
  deps.stderr = (s) => { stderrText += s; };
  const abs = path.join(wt, '.claude-tweaks', 'pipelines', 'x');
  const code = withCwd(wt, () => run(['1', '--run-dir', abs], deps));
  assert.strictEqual(code, 2);
  assert.match(stderrText, /resolves outside the main checkout/i);
  assert.strictEqual(deps.calls.ghAvailable, 0);
});

test('accept: --run-dir is absolute and anchored under the main checkout', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  const deps = fakeDeps();
  let stderrText = '';
  deps.stderr = (s) => { stderrText += s; };
  const abs = path.join(main, '.claude-tweaks', 'pipelines', 'x');
  const code = withCwd(wt, () => run(['1', '--run-dir', abs], deps));
  // Rejected downstream by the stubbed ghAvailable()=false, NOT by anchoring.
  assert.strictEqual(code, 2);
  assert.doesNotMatch(stderrText, /resolves outside the main checkout/i);
  assert.strictEqual(deps.calls.ghAvailable, 1, 'a correctly anchored --run-dir must reach the gh-availability check');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/materialize-run-dir-anchoring.test.js`
Expected: the first two tests FAIL (`deps.calls.ghAvailable` is 1, not 0 — `mkdirp`/`ghAvailable` stub semantics mean the current code sails straight past to the gh-availability check).

- [ ] **Step 3: Add the anchoring check**

In `bin/materialize.js`, add the require after the existing requires (after line 21):

```js
const wtDetect = require('./lib/hooks/worktree-detect');
```

Replace the existing `--run-dir` presence check (line 66):

```js
  if (!opts.runDir) { deps.stderr('missing required --run-dir\n' + USAGE); return 2; }
```

with:

```js
  if (!opts.runDir) { deps.stderr('missing required --run-dir\n' + USAGE); return 2; }
  {
    // #790/[IL-127]: reject an unanchored --run-dir before any gh/git/fs work.
    const mainRoot = wtDetect.mainCheckoutRoot(process.cwd());
    if (!wtDetect.isAnchoredUnderRoot(path.resolve(opts.runDir), mainRoot)) {
      deps.stderr(
        `materialize.js: --run-dir ${opts.runDir} resolves outside the main checkout`
        + `${mainRoot ? ` (${mainRoot})` : ''} — refusing a worktree-relative shadow run dir; see resolve-run-dir\n`,
      );
      return 2;
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/materialize-run-dir-anchoring.test.js`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add bin/materialize.js tests/materialize-run-dir-anchoring.test.js
git commit -m "Anchor bin/materialize.js's --run-dir under the main checkout"
```

---

### Task 4: Prose-conformance test for a bare-relative `--run`/`--run-dir` literal

**Files:**
- Create: `tests/pipeline-run-dir-arg-literal-conformance.test.js`

**Interfaces:**
- Consumes: nothing from Tasks 1-3 (pure prose scan).
- Produces: nothing consumed elsewhere — a standalone `node --test` file, following `tests/pipeline-run-dir-adoption-anchoring.test.js`'s existing pinning convention (read the real skill files, assert on their content).

- [ ] **Step 1: Write the failing test**

Create `tests/pipeline-run-dir-arg-literal-conformance.test.js`:

```js
// tests/pipeline-run-dir-arg-literal-conformance.test.js
//
// #790: static backstop for the same failure class Tasks 1-3 fixed at
// runtime — a skill .md citing `--run`/`--run-dir` with a bare-relative
// `.claude-tweaks/pipelines/` literal instead of an anchored value
// ($RUN_ROOT/..., "$PIPELINE_RUN_DIR", or a {run-dir} placeholder) would
// silently teach a future reader/agent the exact worktree-relative-shadow
// mistake this record fixed. Scans the three skill files
// _shared/pipeline-run-dir.md's own Resolution order names as citing
// `--run`/`--run-dir`: flow/steps-and-gates.md, flow/materialize.md,
// wrap-up/SKILL.md.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'skills/flow/steps-and-gates.md',
  'skills/flow/materialize.md',
  'skills/wrap-up/SKILL.md',
];

// A bare-relative literal: `--run`/`--run-dir` (or `--run-dir=`) directly
// followed by a quoted or bare `.claude-tweaks/pipelines/...` path — never
// preceded by `$RUN_ROOT`, `"$PIPELINE_RUN_DIR"`, or a `{...}` placeholder,
// all of which are already-anchored forms this test must NOT flag.
function findBareRelativeRunArgLiterals(content) {
  const re = /--run(?:-dir)?[= ]"?\.claude-tweaks\/pipelines\//g;
  return content.match(re) || [];
}

test('shipped skill prose never passes a bare-relative .claude-tweaks/pipelines/ literal to --run/--run-dir', () => {
  for (const rel of FILES) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const hits = findBareRelativeRunArgLiterals(content);
    assert.deepStrictEqual(hits, [], `${rel} carries a bare-relative --run/--run-dir literal: ${JSON.stringify(hits)}`);
  }
});

test('the scanner actually detects a deliberately reintroduced violation (discrimination check)', () => {
  const clean = 'run `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" check-resume-freshness --run "$PIPELINE_RUN_DIR"`';
  const dirty = 'run `node bin/wrap-up-engine.js plan --run-dir .claude-tweaks/pipelines/2026-01-01T000000-spec-1`';
  assert.deepStrictEqual(findBareRelativeRunArgLiterals(clean), []);
  assert.strictEqual(findBareRelativeRunArgLiterals(dirty).length, 1);
});
```

- [ ] **Step 2: Run the test to verify it passes against current shipped prose**

Run: `node --test tests/pipeline-run-dir-arg-literal-conformance.test.js`
Expected: PASS (2/2) — the codebase-grep already run during plan authoring confirmed zero current violations in the three files, and the second test proves the regex actually discriminates clean from dirty input rather than passing vacuously.

- [ ] **Step 3: Commit**

```bash
git add tests/pipeline-run-dir-arg-literal-conformance.test.js
git commit -m "Add prose-conformance test for bare-relative --run/--run-dir literals"
```

---

## Self-Review

**1. Spec coverage:** Deliverable 1 (runtime guard) → Tasks 1-3 (all three real `--run`/`--run-dir` CLI entry points, including the scope-creep addition). Deliverable 2 (static lint/test) → Task 4. Every Acceptance Criterion in the spec maps to an assertion in Tasks 1-4's tests.

**2. Placeholder scan:** No `TBD`/`TODO`/vague steps — every step shows the actual diff or full test file content.

**3. Type consistency:** `wtDetect.mainCheckoutRoot`/`wtDetect.isAnchoredUnderRoot` signatures are used identically (same argument order, same return semantics) across Tasks 1-3 — verified against `bin/lib/hooks/worktree-detect.js`'s actual exports read during plan authoring, not assumed.
