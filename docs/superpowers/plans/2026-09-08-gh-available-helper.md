# ghAvailable() Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every near-verbatim `gh --version` availability probe in `plugin/bin` with calls to one injectable `ghAvailable(deps)` helper, so a future rule (a timeout bound, an env override) only needs to change in one place.

**Architecture:** Upgrade the existing `ghAvailable()` function already exported by `plugin/bin/lib/repo-resolve.js` (today the shared home for `parseRepo`, called directly with no args by six other CLIs) into an injectable-runner helper per `gh-api-module-pattern`: `ghAvailable(deps = {})` uses `deps.execFileSync` when supplied, else the real `execFileSync`, and bounds the call with a `timeout`. Every call site that hand-rolled its own copy switches to importing and calling this one function instead.

**Tech Stack:** Plain Node.js (`child_process.execFileSync`), `node --test`.

**Spec:** `C:/repos/claude-tweaks/.claude/worktrees/record-2017/.claude-tweaks/pipelines/2026-09-08T152417-record-2017/work/2017-spec.md`

## Global Constraints

- Injectable-runner convention: argv array only, never a shell string (`gh-api-module-pattern` skill).
- Bound every remote-contacting call with a `timeout` — this repo's convention is `GH_TIMEOUT_MS = 5000` (`plugin/bin/lib/issues/claim-store.js`, `plugin/bin/claim-targets.js`, and until this plan's Task 3, `plugin/bin/lib/compose-context/resolve-conditions.js`).
- `grep -rn "'--version'" plugin/bin` must return **exactly one** production site when this plan is complete (spec's Acceptance Criteria, verbatim).
- **Scope note verified against the live repo, not just the spec's prose (materialize.md's Named-location drift rule):** running `grep -rn "'--version'" plugin/bin` today returns **seven** matches, not six — the spec's Current State names six (`release-claim.js`, `plugin/bin/file-feedback.js` — the spec calls it `lib/feedback/file-feedback.js`, which is a different file that does *not* contain this probe; the CLI wrapper at `plugin/bin/file-feedback.js` is the real site — `link-records.js`, `materialize.js`, `lib/repo-resolve.js`, and `lib/compose-context/resolve-conditions.js`), but `plugin/bin/lib/wrap-up/engine-verify.js:374` (`deps.gh(['--version'], cwd)`, inside its own local `ghAvailable(deps, cwd)` helper) is a seventh, unnamed in the spec body. Since the Acceptance Criteria demands exactly one site and is the mechanical gate, Task 4 below migrates this seventh site too — a three-line, low-risk change reusing the same helper this plan already builds — rather than leaving the grep check failing. This is flagged here explicitly per the plan-authoring blocking-verification-downgrade check: it is a scope addition beyond the spec's own Deliverables list, made to satisfy the spec's own Acceptance Criteria.
- No test in this repo asserts against any of the six-or-seven inline `ghAvailable` implementations' *options object* (`stdio`/`timeout`/`encoding`) — every consuming test injects its own fake `deps.ghAvailable`/`deps.execFileSync`/`deps.gh`, confirmed by reading `tests/materialize-drift.test.js`, `tests/materialize-record-json.test.js`, `tests/materialize-run-dir-anchoring.test.js`, `tests/bin-lib/feedback/file-feedback.test.js`, `tests/bin-lib/release-claim/cli.test.js`, `tests/bin-lib/compose-context/resolve-conditions.test.js`, and `tests/bin-lib/wrap-up/engine-verify.test.js`. Migrating each call site's `realDeps`/module-level implementation is therefore a pure refactor with no new failing test to write per site — verification is "existing suite still green," not new red→green.

---

## Task 1: Upgrade `ghAvailable()` in `plugin/bin/lib/repo-resolve.js` to an injectable, bounded helper

**Files:**
- Modify: `plugin/bin/lib/repo-resolve.js`
- Test: `tests/bin-lib/repo-resolve.test.js`

**Interfaces:**
- Produces: `ghAvailable(deps = {})` — `deps.execFileSync` optional, shaped `(cmd: string, args: string[], opts: object) => string` (throws on failure, exactly `child_process.execFileSync`'s contract). Returns `true` when the probe succeeds, `false` when it throws (any reason — absent binary, non-zero exit, timeout). Backward compatible with the existing zero-arg call sites (`fetch-sub-issues.js`, `backlog-grant-gate.js`, `apply-refine-labels.js`, `resolve-linked-prs.js`, `repair-claim.js`, `resolve-blockers.js`), which all call `ghAvailable()` with no arguments today and continue to receive a real, bounded `gh --version` probe.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/repo-resolve.test.js` (existing file only tests `parseRepo` today):

```javascript
const { parseRepo, ghAvailable } = require('../../plugin/bin/lib/repo-resolve');

test('ghAvailable: injected runner succeeds -> true', () => {
  const calls = [];
  const result = ghAvailable({
    execFileSync: (cmd, args, opts) => { calls.push([cmd, args, opts]); return 'gh version 2.0.0\n'; },
  });
  assert.equal(result, true);
  assert.deepEqual(calls.length, 1);
  assert.deepEqual(calls[0][0], 'gh');
  assert.deepEqual(calls[0][1], ['--version']);
  assert.equal(typeof calls[0][2].timeout, 'number');
  assert.ok(calls[0][2].timeout > 0);
});

test('ghAvailable: injected runner throws ENOENT (gh absent) -> false', () => {
  const result = ghAvailable({
    execFileSync: () => { const e = new Error('spawnSync gh ENOENT'); e.code = 'ENOENT'; throw e; },
  });
  assert.equal(result, false);
});

test('ghAvailable: injected runner throws a generic error (non-zero exit) -> false', () => {
  const result = ghAvailable({
    execFileSync: () => { throw new Error('gh: some other failure'); },
  });
  assert.equal(result, false);
});

test('ghAvailable: no deps passed -> defaults to the real execFileSync (does not throw at call time)', () => {
  // Not asserting the boolean result (depends on whether `gh` is on this
  // machine's PATH) -- only that the zero-arg call shape used by every
  // pre-existing direct importer (fetch-sub-issues.js, backlog-grant-gate.js,
  // etc.) still resolves without throwing.
  assert.doesNotThrow(() => ghAvailable());
});
```

The existing `const { parseRepo } = require(...)` line at the top of the file becomes `const { parseRepo, ghAvailable } = require(...)` (already imports `assert`/`test` — only the destructure changes).

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/repo-resolve.test.js`
Expected: FAIL — the first three new tests fail because `ghAvailable()` today ignores any `deps` argument entirely (it takes no parameters and always calls the real `execFileSync`), so the injected fake is never invoked and `calls.length` stays `0`.

- [ ] **Step 3: Write the implementation**

Replace in `plugin/bin/lib/repo-resolve.js`:

```javascript
function ghAvailable() {
  try {
    execFileSync('gh', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
```

with:

```javascript
// gh-api-module-pattern: bound every remote-contacting call on the seam.
// --version is local-only, but the bound is free and keeps this the one
// options object every call site below now shares.
const GH_TIMEOUT_MS = 5000;

function ghAvailable(deps = {}) {
  const exec = deps.execFileSync || execFileSync;
  try {
    exec('gh', ['--version'], { stdio: 'ignore', timeout: GH_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}
```

Update the file's header comment (lines 1-10) to note that `ghAvailable` is now also the injectable, canonical `gh --version` probe (the six-call-site consolidation), not just `parseRepo`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/repo-resolve.test.js`
Expected: PASS (all tests, including the five pre-existing `parseRepo` tests, which are unaffected).

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/repo-resolve.js tests/bin-lib/repo-resolve.test.js
git commit -m "Make repo-resolve.js's ghAvailable() injectable and timeout-bounded (refs #2017)"
```

---

## Task 2: Migrate the four `realDeps.ghAvailable` inline copies to the shared helper

**Files:**
- Modify: `plugin/bin/file-feedback.js`
- Modify: `plugin/bin/link-records.js`
- Modify: `plugin/bin/materialize.js`
- Modify: `plugin/bin/release-claim.js`

**Interfaces:**
- Consumes: `ghAvailable(deps)` from Task 1 (`plugin/bin/lib/repo-resolve.js`).
- No new test file — every consuming test in `tests/materialize-drift.test.js`, `tests/materialize-record-json.test.js`, `tests/materialize-run-dir-anchoring.test.js`, and `tests/bin-lib/feedback/file-feedback.test.js` already injects its own fake `deps.ghAvailable` when calling each CLI's exported `run(argv, deps)`, bypassing `realDeps` entirely — this task only changes what `realDeps.ghAvailable` resolves to when the CLI is invoked for real (`require.main === module`), which none of those tests exercise. `release-claim.js`'s `realDeps` is exercised the same way by `tests/bin-lib/release-claim/cli.test.js`.

All four files get the identical two-line change:

- [ ] **Step 1: `plugin/bin/file-feedback.js`**

Change the import (near the top, alongside the existing `require('./lib/repo-resolve')`):

```javascript
const { parseRepo } = require('./lib/repo-resolve');
```
to:
```javascript
const { parseRepo, ghAvailable } = require('./lib/repo-resolve');
```

Change the `realDeps` entry:
```javascript
  ghAvailable: () => { try { execFileSync('gh', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } },
```
to:
```javascript
  ghAvailable,
```

- [ ] **Step 2: `plugin/bin/link-records.js`** — identical change (import line, then `realDeps.ghAvailable`).

- [ ] **Step 3: `plugin/bin/materialize.js`** — identical change. Note: `materialize.js`'s `realDeps` also has `ghView`, which stays untouched — only the `ghAvailable:` line changes.

- [ ] **Step 4: `plugin/bin/release-claim.js`** — identical change.

- [ ] **Step 5: Run every affected test file to confirm no regression**

Run: `node --test tests/bin-lib/feedback/file-feedback.test.js tests/bin-lib/release-claim/cli.test.js tests/bin-lib/release-claim/release.test.js tests/materialize-drift.test.js tests/materialize-record-json.test.js tests/materialize-run-dir-anchoring.test.js tests/bin-lib/issues/materialize-format.test.js`
Expected: PASS (unchanged pass/fail counts vs. before this task — these tests never exercise `realDeps`, so this run is a regression check, not new red→green).

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/file-feedback.js plugin/bin/link-records.js plugin/bin/materialize.js plugin/bin/release-claim.js
git commit -m "Migrate file-feedback/link-records/materialize/release-claim to the shared ghAvailable() helper (refs #2017)"
```

---

## Task 3: Migrate `resolve-conditions.js`'s transport probe to the shared helper

**Files:**
- Modify: `plugin/bin/lib/compose-context/resolve-conditions.js`
- Test: `tests/bin-lib/compose-context/resolve-conditions.test.js` (existing — regression check only, no new test needed; its fakes assert `cmd`/`args`, never the options object, confirmed by reading the file)

**Interfaces:**
- Consumes: `ghAvailable(deps)` from Task 1.

- [ ] **Step 1: Implementation**

In `plugin/bin/lib/compose-context/resolve-conditions.js`, add the import alongside the existing requires:

```javascript
const { ghAvailable } = require('../repo-resolve');
```

Remove the now-unused local constant (its only use is the block being replaced below):

```javascript
const GH_TIMEOUT_MS = 5000; // remote-contacting seam convention; --version is local, but the bound is free
```

Replace:

```javascript
  let transport;
  try {
    d.execFileSync('gh', ['--version'], { encoding: 'utf8', stdio: 'pipe', timeout: GH_TIMEOUT_MS });
    transport = 'gh';
  } catch {
    transport = 'mcp';
  }
  conditions.transport = transport;
```

with:

```javascript
  conditions.transport = ghAvailable({ execFileSync: d.execFileSync }) ? 'gh' : 'mcp';
```

This keeps the module's own `d.execFileSync` injection seam intact (tests that fake `execFileSync` via `deps: { execFileSync: ... }` still exercise the exact same fake, now called *through* the shared helper rather than directly) and drops the module-local option-object drift (`stdio: 'pipe'` + `encoding: 'utf8'` vs. the shared helper's `stdio: 'ignore'`) the spec's Current State names as the actual problem — return-value content was never read (only whether the call throws), so dropping `encoding`/switching `stdio` to `'ignore'` changes no observable behavior.

Update the file's header comment (the paragraph starting "The `gh --version` probe (transport) is therefore this module's only shell-out...") to say it now calls the shared `ghAvailable` helper rather than shelling out inline.

- [ ] **Step 2: Run tests to confirm no regression**

Run: `node --test tests/bin-lib/compose-context/resolve-conditions.test.js`
Expected: PASS (same pass count as before this task — the fakes assert `cmd === 'gh'` and `args`, not the options object, so routing the call through the shared helper changes nothing observable).

- [ ] **Step 3: Commit**

```bash
git add plugin/bin/lib/compose-context/resolve-conditions.js
git commit -m "Migrate resolve-conditions.js's transport probe to the shared ghAvailable() helper (refs #2017)"
```

---

## Task 4: Migrate `engine-verify.js`'s local `ghAvailable(deps, cwd)` to the shared helper (the unnamed seventh site)

**Files:**
- Modify: `plugin/bin/lib/wrap-up/engine-verify.js`
- Test: `tests/bin-lib/wrap-up/engine-verify.test.js` (existing — regression check only; every `runVerify(...)` call in this file passes its own fake `deps.gh`/`deps.git`, confirmed by reading the file)

**Interfaces:**
- Consumes: `ghAvailable(deps)` from Task 1, wrapped in a one-call adapter so `engine-verify.js`'s own `deps.gh(args, cwd)` injectable-runner shape (documented in its header comment, shared with every other `gh`/`git` call in this module) needs no change and every existing test's fake `deps.gh` keeps being exercised exactly as before.

- [ ] **Step 1: Implementation**

Add the import near the top of `plugin/bin/lib/wrap-up/engine-verify.js`, alongside the existing `require('../hooks/worktree-reap')`:

```javascript
const { ghAvailable: sharedGhAvailable } = require('../repo-resolve');
```

Replace:

```javascript
// ---- gh availability probe ------------------------------------------------
function ghAvailable(deps, cwd) {
  try {
    deps.gh(['--version'], cwd);
    return true;
  } catch {
    return false;
  }
}
```

with:

```javascript
// ---- gh availability probe ------------------------------------------------
// Delegates to the shared plugin/bin/lib/repo-resolve.js helper (the
// six-call-site consolidation, #2017) via a one-call adapter: this module's
// own deps.gh(args, cwd) seam takes a cwd the shared helper's
// deps.execFileSync(cmd, args, opts) shape has no slot for, so the adapter
// closes over cwd and discards the shared helper's own cmd/opts arguments
// (deps.gh always means "gh", and this module's own makeDefaultRunner
// already carries the timeout bound).
function ghAvailable(deps, cwd) {
  return sharedGhAvailable({ execFileSync: (_cmd, args) => deps.gh(args, cwd) });
}
```

Every existing call site in this file (`ghAvailable(deps, cwd)` at what are today lines 448 and 577) is unchanged — same name, same two-argument call shape.

- [ ] **Step 2: Run tests to confirm no regression**

Run: `node --test tests/bin-lib/wrap-up/engine-verify.test.js`
Expected: PASS (same pass count as before this task — every test's fake `deps.gh` is still invoked with the exact same `(['--version'], cwd)` arguments as before, just via one extra indirection).

- [ ] **Step 3: Commit**

```bash
git add plugin/bin/lib/wrap-up/engine-verify.js
git commit -m "Migrate engine-verify.js's ghAvailable() to the shared helper -- the unnamed seventh --version site (refs #2017)"
```

---

## Task 5: Grep-backed test pinning the single production site, plus final Acceptance Criteria verification

**Files:**
- Test: `tests/bin-lib/repo-resolve.test.js` (append)

**Interfaces:**
- None (a static test over the repo tree, no module interface).

- [ ] **Step 1: Write the failing test**

Append to `tests/bin-lib/repo-resolve.test.js`:

```javascript
const fs = require('fs');
const path = require('path');

test("'--version' appears in plugin/bin only inside repo-resolve.js's ghAvailable()", () => {
  const binDir = path.join(__dirname, '..', '..', 'plugin', 'bin');
  const hits = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) {
        const content = fs.readFileSync(p, 'utf8');
        content.split('\n').forEach((line, i) => {
          if (line.includes("'--version'")) hits.push(`${path.relative(binDir, p)}:${i + 1}`);
        });
      }
    }
  };
  walk(binDir);
  assert.deepEqual(hits, ['lib' + path.sep + 'repo-resolve.js:' + '<PIN-AFTER-STEP-3>']);
});
```

(The exact line number placeholder above is resolved in Step 3 below, after the implementation lands — this is a pin, not a guess, per the plan's Verbatim-command run-once discipline: the real line number is read off the file, not predicted.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/repo-resolve.test.js`
Expected: FAIL — as of the end of Task 4, `hits` contains exactly one entry (`lib/repo-resolve.js:<real line>`), which will not equal the literal placeholder string above until Step 3 substitutes the real number.

- [ ] **Step 3: Resolve the real line number and fix the test**

Run: `grep -n "'--version'" plugin/bin/lib/repo-resolve.js`
Read the single reported line number `N`, then edit the test's assertion to:

```javascript
  assert.deepEqual(hits, [`lib${path.sep}repo-resolve.js:${N}`]);
```

substituting the literal integer for `N`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/repo-resolve.test.js`
Expected: PASS.

- [ ] **Step 5: Verify the spec's own Acceptance Criteria commands directly**

Run: `grep -rn "'--version'" plugin/bin`
Expected: exactly one line of output, naming `plugin/bin/lib/repo-resolve.js`.

Run: `node --test tests/bin-lib/repo-resolve.test.js tests/bin-lib/feedback/file-feedback.test.js tests/bin-lib/release-claim/cli.test.js tests/bin-lib/release-claim/release.test.js tests/materialize-drift.test.js tests/materialize-record-json.test.js tests/materialize-run-dir-anchoring.test.js tests/bin-lib/issues/materialize-format.test.js tests/bin-lib/compose-context/resolve-conditions.test.js tests/bin-lib/wrap-up/engine-verify.test.js`
Expected: PASS, every file, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add tests/bin-lib/repo-resolve.test.js
git commit -m "Add grep-backed test pinning ghAvailable() as the single --version production site (refs #2017)"
```
