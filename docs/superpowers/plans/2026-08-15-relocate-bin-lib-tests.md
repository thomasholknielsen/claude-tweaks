# Relocate colocated bin/lib tests to the dev-side tests tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all 14 `bin/lib/{module}/tests/` directories to `tests/bin-lib/{module}/` so `bin/` becomes production-only (a precondition for #418's `plugin/` move), rewriting every relative `require()`/`require.resolve()` call to the new depth, and collapsing `package.json`'s test glob to one recursive `find tests` that auto-covers future modules (closing IL-84).

**Architecture:** A single generic Node script (`relocate-requires.js`, temporary — deleted before the final commit) computes, for any string-literal require target in a moved file, whether that target itself moved (another module's `tests/` dir — e.g. `health-core`'s two cross-module test helpers) or is a stable `bin/...` source file, and rewrites the require accordingly. Modules move one `git mv` + rewrite + verify + test + commit at a time; `health-core` moves first because five other modules' tests require its `tests/seed-durable-state.js` / `tests/skill-md-house-checks.js` helpers.

**Tech Stack:** Node.js (`node:test`, `node:assert`, `child_process`, `module.createRequire`), git.

**Spec:** `.claude-tweaks/pipelines/2026-08-15T100549-spec-417/work/417-spec.md` (work record #417)

## Global Constraints

- `npm test` must pass at the end, with identical per-module `# tests N` counts before and after (captured to files, never piped/tailed).
- No `bin/lib/*/tests/` directory may remain (`find bin/lib -type d -name tests` empty).
- Every string-literal `require`/`require.resolve` in a moved file must resolve via `require.resolve` semantics from the file's new location — verified by script, not grep.
- Root `tests/` (non-`bin-lib` files) and `tools/upstream-drift/tests` globs are unchanged; `perf/` is untouched.
- Do not run the full `npm test` suite concurrently with another session's build — a sibling `/flow` session is active in this repo on a different worktree; contention there reads as a false failure.
- The relocation script lives at `.claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js` inside this worktree only (gitignored — never committed) and is deleted in the final task.

---

### Task 1: Capture pre-move baseline and author the shared relocation script

**Files:**
- Create: `.claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js`
- Create: `.claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/run-module-tests.sh`
- Create (gitignored, not committed): `.claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/baseline-pre.txt`

**Interfaces:**
- Produces: `node .../relocate-requires.js rewrite <module>` (rewrites requires in `tests/bin-lib/<module>/**/*.js` in place, prints `rewrite <module>: N files scanned, M changed`), `node .../relocate-requires.js verify <module>` (checks every string-literal require resolves from the new location, prints `verify <module>: N files, K requires checked, all resolve` or lists failures and exits 1). Every later task invokes both.
- Produces: `bash .../run-module-tests.sh <dir>` — runs `node --test` over the explicit `*.test.js` glob under `<dir>`, matching `package.json`'s own invocation style. **Required because `node --test <dir>` (a bare directory argument) makes Node load the directory itself as a single test module and fail with `# fail 1` instead of recursively discovering test files** — this is not how `package.json`'s `test` script invokes `node --test` (it always passes an explicit `find ... -name '*.test.js'` file list), and every baseline/post-move test-count step in this plan must match that convention or the counts are meaningless. Every later task invokes this instead of calling `node --test` directly on a directory.

- [ ] **Step 1: Write the test-runner wrapper script**

Create `.claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/run-module-tests.sh`:

```bash
#!/bin/bash
# Runs node --test over the explicit *.test.js glob for a directory, matching
# package.json's own invocation style (never a bare directory argument).
exec node --test $(find "$1" -name '*.test.js' | sort)
```

No executable bit is required — every invocation in this plan calls it as `bash .../run-module-tests.sh <dir>`.

- [ ] **Step 2: Capture per-module baseline test counts**

Run, from the worktree root (`bin/lib` still holds all 14 `tests/` dirs at this point):

```bash
for m in code-health dispatch docs-health harness-health health-core init issues journey-health model-profiles record-graph release residue skill-audit wrap-up; do
  bash .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/run-module-tests.sh "bin/lib/$m/tests" > ".claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/baseline-$m.log" 2>&1
  echo "exit=$?" >> ".claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/baseline-$m.log"
done
```

(This is one `for` loop, not 14 separate commands — run it as a single Bash call. If the harness refuses this as "too complex" for a worktree-isolated session, decompose into 14 separate two-line calls, one per module — that is expected in this environment, not an error.)

- [ ] **Step 3: Extract the summary lines**

```bash
grep -H "^# tests\|^# pass\|^# fail" .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/baseline-*.log > .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/baseline-pre.txt
cat .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/baseline-pre.txt
```

Confirm every one of the 14 modules shows `# fail 0` (no pre-existing failures — the pipeline's own pre-flight sweep already confirmed the whole suite is green). If any module shows a failure, STOP and re-run the pre-flight sweep procedure instead of proceeding — a per-module baseline failure here would be indistinguishable from a relocation bug later.

- [ ] **Step 4: Write the relocation script**

Create `.claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js`. **Note (added after Task 2):** the version below already includes `path.join(__dirname, ...)` rewrite/verify support — Task 2 discovered that `require()`-only rewriting misses `path.join(__dirname, ...)` calls test files use to `fs.readFileSync` a fixture/source/doc file directly (found in `health-core/tests/purity.test.js`, then confirmed in 8 more modules — see each affected task's Step 3 note). Write the full script below verbatim; don't write a `require()`-only version and add this later.

```javascript
#!/usr/bin/env node
'use strict'
// One-off tool for work record #417: rewrites require()/require.resolve()
// calls in bin/lib/{module}/tests/ files being relocated to
// tests/bin-lib/{module}/, and verifies every string-literal require
// resolves from the new location. Not part of the shipped repo — deleted
// before the final commit (Task 16).
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { createRequire } = require('module')

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const OLD_ROOT = path.join(REPO_ROOT, 'bin/lib')
const NEW_ROOT = path.join(REPO_ROOT, 'tests/bin-lib')

const REQUIRE_RE = /require(\.resolve)?\(\s*(['"])(\.\.?\/[^'"]*)\2\s*\)/g
// path.join(__dirname, 'a', '..', maybeTrailingVar) or the path.resolve
// equivalent — used by several test files to fs.readFileSync a fixture,
// locate a CLI script, or read a doc outside the tests dir. Not a require()
// call, so REQUIRE_RE never sees it; needs its own rewrite. join/resolve are
// interchangeable here since every argument in every observed case is a
// relative segment (no absolute-path argument that would make resolve's
// semantics diverge from join's).
const PATH_JOIN_RE = /path\.(join|resolve)\(\s*__dirname\s*,\s*([^)]*)\)/g

function parsePathJoinArgs(argsStr) {
  const parts = argsStr.split(',').map((s) => s.trim()).filter(Boolean)
  const literals = []
  let trailingDynamic = null
  for (let i = 0; i < parts.length; i++) {
    const m = /^'([^']*)'$|^"([^"]*)"$/.exec(parts[i])
    if (m) {
      literals.push(m[1] !== undefined ? m[1] : m[2])
    } else if (i === parts.length - 1) {
      trailingDynamic = parts[i] // e.g. a bare variable name — kept unchanged
    } else {
      return null // dynamic arg in a non-trailing position — unsupported shape, skip
    }
  }
  return { literals, trailingDynamic }
}

function listFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(full))
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

function resolveNewTarget(oldFileDir, spec) {
  const oldTargetAbs = path.resolve(oldFileDir, spec)
  const relFromOldRoot = path.relative(OLD_ROOT, oldTargetAbs)
  const segs = relFromOldRoot.split(path.sep)
  if (!relFromOldRoot.startsWith('..') && segs[1] === 'tests') {
    // Target lives inside some module's tests/ dir — it also moved.
    const targetModule = segs[0]
    const remainder = segs.slice(2).join('/')
    return path.join(NEW_ROOT, targetModule, remainder)
  }
  // Target is a stable bin/... source file — unchanged absolute location.
  return oldTargetAbs
}

// Is `line[0..pos)` inside an unterminated string literal at `pos`? Used to
// skip a require()/path.join() match that is itself just TEXT sitting inside
// a larger string literal — e.g. a dead-code-detector test's fixture string
// `"const used = require('../lib/used')"` describing a synthetic, unrelated
// fake file tree. Naive quote/backslash scan; good enough for the single-line
// JS this repo's test fixtures use (no need for a real tokenizer here).
function isInsideStringLiteral(line, pos) {
  let quote = null
  for (let i = 0; i < pos; i++) {
    const c = line[i]
    if (quote) {
      if (c === '\\') { i++; continue }
      if (c === quote) quote = null
    } else if (c === "'" || c === '"' || c === '`') {
      quote = c
    }
  }
  return quote !== null
}

// Line-based so a `//` comment mentioning a require(...) string (e.g. one
// documenting what another file contains) is never treated as live code.
function forEachLiveRequire(src, fn) {
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const commentIdx = line.indexOf('//')
    const re = new RegExp(REQUIRE_RE.source, 'g')
    let m
    while ((m = re.exec(line))) {
      if (commentIdx !== -1 && m.index >= commentIdx) continue // commented out
      if (isInsideStringLiteral(line, m.index)) continue // fixture text, not live code
      fn(i, m)
    }
  }
  return lines
}

function forEachLivePathJoin(src, fn) {
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const commentIdx = line.indexOf('//')
    const re = new RegExp(PATH_JOIN_RE.source, 'g')
    let m
    while ((m = re.exec(line))) {
      if (commentIdx !== -1 && m.index >= commentIdx) continue // commented out
      if (isInsideStringLiteral(line, m.index)) continue // fixture text, not live code
      fn(i, m)
    }
  }
}

function rewriteModule(moduleName) {
  const oldDir = path.join(OLD_ROOT, moduleName, 'tests')
  const newDir = path.join(NEW_ROOT, moduleName)
  const files = listFiles(newDir)
  let changed = 0
  for (const newFile of files) {
    const relPath = path.relative(newDir, newFile)
    const oldFile = path.join(oldDir, relPath)
    const oldFileDir = path.dirname(oldFile)
    const newFileDir = path.dirname(newFile)
    const src = fs.readFileSync(newFile, 'utf8')
    let fileChanged = false
    const mutable = src.split('\n')
    forEachLiveRequire(src, (lineIdx, m) => {
      const [full, resolveSuffix, quote, spec] = m
      const newTargetAbs = resolveNewTarget(oldFileDir, spec)
      let newSpec = path.relative(newFileDir, newTargetAbs).split(path.sep).join('/')
      if (!newSpec.startsWith('.')) newSpec = './' + newSpec
      if (!spec.endsWith('.js') && newSpec.endsWith('.js')) newSpec = newSpec.slice(0, -3)
      if (newSpec !== spec) {
        const replacement = `require${resolveSuffix || ''}(${quote}${newSpec}${quote})`
        mutable[lineIdx] = mutable[lineIdx].slice(0, m.index) + replacement + mutable[lineIdx].slice(m.index + full.length)
        fileChanged = true
      }
    })
    // Second pass: path.join(__dirname, ...) — re-derived from the (possibly
    // already-mutated) content so column offsets stay valid either way.
    const afterRequires = mutable.join('\n')
    const mutable2 = afterRequires.split('\n')
    forEachLivePathJoin(afterRequires, (lineIdx, m) => {
      const [full, method, argsStr] = m
      const parsed = parsePathJoinArgs(argsStr)
      if (!parsed) {
        console.log(`  WARNING ${path.relative(REPO_ROOT, newFile)}:${lineIdx + 1}: path.${method}(__dirname, ...) has a non-trailing dynamic argument — left unchanged, check by hand: ${full}`)
        return
      }
      const spec = './' + parsed.literals.join('/')
      const newTargetAbs = resolveNewTarget(oldFileDir, spec)
      const newSegs = path.relative(newFileDir, newTargetAbs).split(path.sep)
      const newArgs = newSegs.map((s) => `'${s}'`)
      if (parsed.trailingDynamic) newArgs.push(parsed.trailingDynamic)
      const replacement = `path.${method}(__dirname, ${newArgs.join(', ')})`
      if (replacement !== full) {
        mutable2[lineIdx] = mutable2[lineIdx].slice(0, m.index) + replacement + mutable2[lineIdx].slice(m.index + full.length)
        fileChanged = true
      }
    })
    if (fileChanged) {
      fs.writeFileSync(newFile, mutable2.join('\n'))
      changed++
    }
  }
  console.log(`rewrite ${moduleName}: ${files.length} files scanned, ${changed} changed`)
}

function verifyModule(moduleName) {
  const newDir = path.join(NEW_ROOT, moduleName)
  const files = listFiles(newDir)
  const failures = []
  let checked = 0
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8')
    const req = createRequire(file)
    forEachLiveRequire(src, (lineIdx, m) => {
      const spec = m[3]
      checked++
      try {
        req.resolve(spec)
      } catch (e) {
        failures.push(`${path.relative(REPO_ROOT, file)}:${lineIdx + 1}: require('${spec}') -> ${e.message}`)
      }
    })
    const fileDir = path.dirname(file)
    forEachLivePathJoin(src, (lineIdx, m) => {
      const [full, method, argsStr] = m
      checked++
      const parsed = parsePathJoinArgs(argsStr)
      if (!parsed) {
        failures.push(`${path.relative(REPO_ROOT, file)}:${lineIdx + 1}: path.${method}(__dirname, ...) has a non-trailing dynamic arg, cannot verify: ${full}`)
        return
      }
      // With a trailing variable, `target` is the directory the variable names a file within — still checkable.
      const target = path.join(fileDir, ...parsed.literals)
      if (!fs.existsSync(target)) {
        failures.push(`${path.relative(REPO_ROOT, file)}:${lineIdx + 1}: path.${method}(__dirname, ...) target does not exist: ${path.relative(REPO_ROOT, target)}`)
      }
    })
  }
  if (failures.length) {
    console.log(`verify ${moduleName}: ${checked} requires checked, ${failures.length} FAILURES`)
    failures.forEach((f) => console.log('  ' + f))
    process.exitCode = 1
  } else {
    console.log(`verify ${moduleName}: ${files.length} files, ${checked} requires checked, all resolve`)
  }
}

const [, , cmd, moduleName] = process.argv
if (cmd === 'rewrite' && moduleName) rewriteModule(moduleName)
else if (cmd === 'verify' && moduleName) verifyModule(moduleName)
else {
  console.error('usage: node relocate-requires.js <rewrite|verify> <module>')
  process.exit(1)
}
```

- [ ] **Step 5: Smoke-test the script's resolution logic against the still-unmoved tree**

The script only operates on files already under `tests/bin-lib/<module>`, so it cannot run for real yet. Sanity-check its module-loading and argument handling now so a syntax error doesn't surface mid-relocation:

```bash
node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js verify health-core
```

Expected: `Error: ENOENT ... tests/bin-lib/health-core` (the directory doesn't exist yet — this confirms the script loads, parses its args, and reaches the real filesystem call without a syntax error). Any other error (e.g. a `SyntaxError` from the script itself) means fix the script before proceeding.

- [ ] **Step 6: No commit for this task**

Nothing here is committed — `scripts/` lives under the gitignored half of `.claude-tweaks/pipelines/`. Proceed directly to Task 2.

---

### Task 2: Relocate `health-core` (first — 5 other modules depend on its test helpers)

**Files:**
- Move: `bin/lib/health-core/tests/` → `tests/bin-lib/health-core/`

- [ ] **Step 1: Move the directory**

```bash
git mv bin/lib/health-core/tests tests/bin-lib/health-core
```

- [ ] **Step 2: Rewrite requires**

```bash
node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js rewrite health-core
```

- [ ] **Step 3: Verify require integrity**

```bash
node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js verify health-core
```

Expected: `verify health-core: 26 files, N requires checked, all resolve` (exit 0). If any failure lists, fix `resolveNewTarget`'s logic in the script (not the individual test file) and re-run rewrite + verify — a systematic bug must be fixed systematically.

- [ ] **Step 4: Run the moved suite and compare to baseline**

```bash
bash .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/run-module-tests.sh tests/bin-lib/health-core > .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-health-core.log 2>&1
echo "exit=$?" >> .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-health-core.log
grep "^# tests\|^# pass\|^# fail" .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-health-core.log
```

Compare the `# tests` / `# pass` / `# fail` counts to `baseline-health-core.log` from Task 1 — must match exactly.

- [ ] **Step 5: Commit**

```bash
git add tests/bin-lib/health-core
git commit -m "Relocate bin/lib/health-core/tests to tests/bin-lib/health-core

refs #417"
```

---

### Task 3: Relocate `code-health`

**Files:** Move: `bin/lib/code-health/tests/` → `tests/bin-lib/code-health/`

- [ ] **Step 1:** `git mv bin/lib/code-health/tests tests/bin-lib/code-health`
- [ ] **Step 2:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js rewrite code-health`
- [ ] **Step 3:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js verify code-health` — expect all resolve (exit 0). `skill-md.test.js` requires `health-core`'s moved helpers, which already moved in Task 2, so this must resolve cleanly. **Also expect 4 `path.join(__dirname, ...)` rewrites** (`durable-integration.test.js:9`, `skill-md.test.js:41` and `:50`, `candidates-dead-code.test.js:791`) and **7 `path.resolve(__dirname, ...)` rewrites** (`area-type.test.js:10`, `churn-v2.test.js:10`, `cli-nextslice.test.js:9`, `cli-pull-issues.test.js:9`, `cli-validate-findings.test.js:9`, `skill-md.test.js:13`, `status-v2.test.js:10`) — Task 2 found the shared script didn't originally handle `path.join`, and Task 3's first attempt found it also didn't handle the sibling `path.resolve` form; the controller extended it after each discovery. `verify`'s file/requires-checked count will include all of these.
- [ ] **Step 4:** `bash .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/run-module-tests.sh tests/bin-lib/code-health > .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-code-health.log 2>&1; echo "exit=$?" >> .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-code-health.log` then `grep "^# tests\|^# pass\|^# fail" .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-code-health.log` — compare to `baseline-code-health.log`.
- [ ] **Step 5:** `git add tests/bin-lib/code-health && git commit -m "Relocate bin/lib/code-health/tests to tests/bin-lib/code-health

refs #417"`

---

### Task 4: Relocate `dispatch`

**Files:** Move: `bin/lib/dispatch/tests/` → `tests/bin-lib/dispatch/`

- [ ] **Step 1:** `git mv bin/lib/dispatch/tests tests/bin-lib/dispatch`
- [ ] **Step 2:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js rewrite dispatch`
- [ ] **Step 3:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js verify dispatch` — expect all resolve.
- [ ] **Step 4:** `bash .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/run-module-tests.sh tests/bin-lib/dispatch > .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-dispatch.log 2>&1; echo "exit=$?" >> .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-dispatch.log` then `grep "^# tests\|^# pass\|^# fail" .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-dispatch.log` — compare to `baseline-dispatch.log`.
- [ ] **Step 5:** `git add tests/bin-lib/dispatch && git commit -m "Relocate bin/lib/dispatch/tests to tests/bin-lib/dispatch

refs #417"`

---

### Task 5: Relocate `docs-health`

**Files:** Move: `bin/lib/docs-health/tests/` → `tests/bin-lib/docs-health/`

- [ ] **Step 1:** `git mv bin/lib/docs-health/tests tests/bin-lib/docs-health`
- [ ] **Step 2:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js rewrite docs-health`
- [ ] **Step 3:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js verify docs-health` — expect all resolve. `derive-doc-id.test.js`'s `require('../../../docs-health')` (the top-level CLI, `bin/docs-health.js`) is the third require-shape from the spec; confirm it resolves to `bin/docs-health.js` and not a false match under `tests/bin-lib/`. **Also expect 4 `path.join(__dirname, ...)` rewrites** (`skill-md.test.js:45`, `cli-find-refs.test.js:9`, `durable-integration.test.js:9`, `cli-check-freshness.test.js:9`) and **5 `path.resolve(__dirname, ...)` rewrites** (`cli-word-count.test.js:8`, `cli-mark.test.js:8`, `cli-next-target.test.js:8`, `cli-validate-findings.test.js:11`, `skill-md.test.js:13`) — see Task 2/3's notes on the script's `path.join`/`path.resolve` support.
- [ ] **Step 4:** `bash .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/run-module-tests.sh tests/bin-lib/docs-health > .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-docs-health.log 2>&1; echo "exit=$?" >> .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-docs-health.log` then `grep "^# tests\|^# pass\|^# fail" .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-docs-health.log` — compare to `baseline-docs-health.log`.
- [ ] **Step 5:** `git add tests/bin-lib/docs-health && git commit -m "Relocate bin/lib/docs-health/tests to tests/bin-lib/docs-health

refs #417"`

---

### Task 6: Relocate `harness-health`

**Files:** Move: `bin/lib/harness-health/tests/` → `tests/bin-lib/harness-health/`

- [ ] **Step 1:** `git mv bin/lib/harness-health/tests tests/bin-lib/harness-health`
- [ ] **Step 2:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js rewrite harness-health`
- [ ] **Step 3:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js verify harness-health` — expect all resolve. `dedup.test.js` contains a `//` comment mentioning `require('../health-core/dedup')` describing another file's contents — confirm the verifier does NOT flag it (comment-skip guard) and does NOT rewrite it (it's prose, not code — diff the file after Step 2 to confirm the comment text is untouched). **Also expect 2 `path.join(__dirname, ...)` rewrites** (`durable-integration.test.js:9`, `skill-md.test.js:45`) and **6 `path.resolve(__dirname, ...)` rewrites** (`cli-mark.test.js:8`, `cli-next-target.test.js:10`, `skill-md.test.js:13`, `skill-md.test.js:69`, `skill-md.test.js:130`, `cli-validate-findings.test.js:11`) — see Task 2/3's notes on the script's `path.join`/`path.resolve` support.
- [ ] **Step 4:** `bash .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/run-module-tests.sh tests/bin-lib/harness-health > .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-harness-health.log 2>&1; echo "exit=$?" >> .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-harness-health.log` then `grep "^# tests\|^# pass\|^# fail" .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-harness-health.log` — compare to `baseline-harness-health.log`.
- [ ] **Step 5:** `git add tests/bin-lib/harness-health && git commit -m "Relocate bin/lib/harness-health/tests to tests/bin-lib/harness-health

refs #417"`

---

### Task 7: Relocate `init`

**Files:** Move: `bin/lib/init/tests/` → `tests/bin-lib/init/`

- [ ] **Step 1:** `git mv bin/lib/init/tests tests/bin-lib/init`
- [ ] **Step 2:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js rewrite init`
- [ ] **Step 3:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js verify init` — expect all resolve.
- [ ] **Step 4:** `bash .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/run-module-tests.sh tests/bin-lib/init > .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-init.log 2>&1; echo "exit=$?" >> .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-init.log` then `grep "^# tests\|^# pass\|^# fail" .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-init.log` — compare to `baseline-init.log`.
- [ ] **Step 5:** `git add tests/bin-lib/init && git commit -m "Relocate bin/lib/init/tests to tests/bin-lib/init

refs #417"`

---

### Task 8: Relocate `issues`

**Files:** Move: `bin/lib/issues/tests/` → `tests/bin-lib/issues/` (includes the `fixtures/` subdirectory with `record-146-body.md` and `record-150-body.md` — these move as part of the directory and are referenced via `__dirname`-relative paths, needing no rewrite)

- [ ] **Step 1:** `git mv bin/lib/issues/tests tests/bin-lib/issues`
- [ ] **Step 2:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js rewrite issues`
- [ ] **Step 3:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js verify issues` — expect all resolve. Additionally confirm the fixture files exist post-move: `test -f tests/bin-lib/issues/fixtures/record-146-body.md && test -f tests/bin-lib/issues/fixtures/record-150-body.md && echo fixtures-present`. **Also expect 1 `path.join(__dirname, ...)` rewrite** (`labels.test.js:63`) — see Task 2's note on the script's `path.join(__dirname, ...)` support.
- [ ] **Step 4:** `bash .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/run-module-tests.sh tests/bin-lib/issues > .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-issues.log 2>&1; echo "exit=$?" >> .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-issues.log` then `grep "^# tests\|^# pass\|^# fail" .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-issues.log` — compare to `baseline-issues.log`.
- [ ] **Step 5:** `git add tests/bin-lib/issues && git commit -m "Relocate bin/lib/issues/tests to tests/bin-lib/issues

refs #417"`

---

### Task 9: Relocate `journey-health`

**Files:** Move: `bin/lib/journey-health/tests/` → `tests/bin-lib/journey-health/`

- [ ] **Step 1:** `git mv bin/lib/journey-health/tests tests/bin-lib/journey-health`
- [ ] **Step 2:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js rewrite journey-health`
- [ ] **Step 3:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js verify journey-health` — expect all resolve. **Also expect 2 `path.join(__dirname, ...)` rewrites** (`skill-md.test.js:45`, `durable-integration.test.js:9`) and **5 `path.resolve(__dirname, ...)` rewrites** (`cli-mark.test.js:8`, `cli-next-target.test.js:8`, `cli-qa-evidence.test.js:9`, `cli-validate-findings.test.js:10`, `skill-md.test.js:13`) — see Task 2/3's notes on the script's `path.join`/`path.resolve` support.
- [ ] **Step 4:** `bash .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/run-module-tests.sh tests/bin-lib/journey-health > .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-journey-health.log 2>&1; echo "exit=$?" >> .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-journey-health.log` then `grep "^# tests\|^# pass\|^# fail" .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-journey-health.log` — compare to `baseline-journey-health.log`.
- [ ] **Step 5:** `git add tests/bin-lib/journey-health && git commit -m "Relocate bin/lib/journey-health/tests to tests/bin-lib/journey-health

refs #417"`

---

### Task 10: Relocate `model-profiles`

**Files:** Move: `bin/lib/model-profiles/tests/` → `tests/bin-lib/model-profiles/`

- [ ] **Step 1:** `git mv bin/lib/model-profiles/tests tests/bin-lib/model-profiles`
- [ ] **Step 2:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js rewrite model-profiles`
- [ ] **Step 3:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js verify model-profiles` — expect all resolve. **Also expect 2 `path.join(__dirname, ...)` rewrites** (`table-pinning.test.js:13`, `cli.test.js:9`) — see Task 2's note on the script's `path.join(__dirname, ...)` support.
- [ ] **Step 4:** `bash .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/run-module-tests.sh tests/bin-lib/model-profiles > .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-model-profiles.log 2>&1; echo "exit=$?" >> .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-model-profiles.log` then `grep "^# tests\|^# pass\|^# fail" .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-model-profiles.log` — compare to `baseline-model-profiles.log`.
- [ ] **Step 5:** `git add tests/bin-lib/model-profiles && git commit -m "Relocate bin/lib/model-profiles/tests to tests/bin-lib/model-profiles

refs #417"`

---

### Task 11: Relocate `record-graph`

**Files:** Move: `bin/lib/record-graph/tests/` → `tests/bin-lib/record-graph/` (includes `fixtures.js`, referenced same-directory as `./fixtures` — no rewrite needed)

- [ ] **Step 1:** `git mv bin/lib/record-graph/tests tests/bin-lib/record-graph`
- [ ] **Step 2:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js rewrite record-graph`
- [ ] **Step 3:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js verify record-graph` — expect all resolve. **Also expect 1 `path.resolve(__dirname, ...)` rewrite** (`cli-render.test.js:9`) — see Task 2/3's notes on the script's `path.join`/`path.resolve` support.
- [ ] **Step 4:** `bash .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/run-module-tests.sh tests/bin-lib/record-graph > .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-record-graph.log 2>&1; echo "exit=$?" >> .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-record-graph.log` then `grep "^# tests\|^# pass\|^# fail" .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-record-graph.log` — compare to `baseline-record-graph.log`.
- [ ] **Step 5:** `git add tests/bin-lib/record-graph && git commit -m "Relocate bin/lib/record-graph/tests to tests/bin-lib/record-graph

refs #417"`

---

### Task 12: Relocate `release`

**Files:** Move: `bin/lib/release/tests/` → `tests/bin-lib/release/`

- [ ] **Step 1:** `git mv bin/lib/release/tests tests/bin-lib/release`
- [ ] **Step 2:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js rewrite release`
- [ ] **Step 3:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js verify release` — expect all resolve. This module's tests reference `bin/lib/changelog.js` (a shared, non-module-specific `bin/lib` file) via `../../changelog.js` — confirm it resolves to `../../../bin/lib/changelog.js` post-move.
- [ ] **Step 4:** `bash .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/run-module-tests.sh tests/bin-lib/release > .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-release.log 2>&1; echo "exit=$?" >> .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-release.log` then `grep "^# tests\|^# pass\|^# fail" .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-release.log` — compare to `baseline-release.log`.
- [ ] **Step 5:** `git add tests/bin-lib/release && git commit -m "Relocate bin/lib/release/tests to tests/bin-lib/release

refs #417"`

---

### Task 13: Relocate `residue`

**Files:** Move: `bin/lib/residue/tests/` → `tests/bin-lib/residue/`

- [ ] **Step 1:** `git mv bin/lib/residue/tests tests/bin-lib/residue`
- [ ] **Step 2:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js rewrite residue`
- [ ] **Step 3:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js verify residue` — expect all resolve.
- [ ] **Step 4:** `bash .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/run-module-tests.sh tests/bin-lib/residue > .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-residue.log 2>&1; echo "exit=$?" >> .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-residue.log` then `grep "^# tests\|^# pass\|^# fail" .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-residue.log` — compare to `baseline-residue.log`.
- [ ] **Step 5:** `git add tests/bin-lib/residue && git commit -m "Relocate bin/lib/residue/tests to tests/bin-lib/residue

refs #417"`

---

### Task 14: Relocate `skill-audit`

**Files:** Move: `bin/lib/skill-audit/tests/` → `tests/bin-lib/skill-audit/`

- [ ] **Step 1:** `git mv bin/lib/skill-audit/tests tests/bin-lib/skill-audit`
- [ ] **Step 2:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js rewrite skill-audit`
- [ ] **Step 3:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js verify skill-audit` — expect all resolve. `csc-registry.test.js` and `house-structure.test.js` both require `health-core`'s moved helpers (already relocated in Task 2) — confirm clean resolution. **Also expect 5 `path.join(__dirname, ...)` rewrites** (`context-cost.test.js:23`, `csc-registry.test.js:35`, `bloat.test.js:25`, `anti-patterns.test.js:119` and `:120`) and **1 `path.resolve(__dirname, ...)` rewrite** (`house-structure.test.js:31`) — see Task 2/3's notes on the script's `path.join`/`path.resolve` support.
- [ ] **Step 4:** `bash .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/run-module-tests.sh tests/bin-lib/skill-audit > .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-skill-audit.log 2>&1; echo "exit=$?" >> .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-skill-audit.log` then `grep "^# tests\|^# pass\|^# fail" .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-skill-audit.log` — compare to `baseline-skill-audit.log`.
- [ ] **Step 5:** `git add tests/bin-lib/skill-audit && git commit -m "Relocate bin/lib/skill-audit/tests to tests/bin-lib/skill-audit

refs #417"`

---

### Task 15: Relocate `wrap-up`

**Files:** Move: `bin/lib/wrap-up/tests/` → `tests/bin-lib/wrap-up/` (includes `fixtures.js`, referenced same-directory as `./fixtures` — no rewrite needed)

- [ ] **Step 1:** `git mv bin/lib/wrap-up/tests tests/bin-lib/wrap-up`
- [ ] **Step 2:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js rewrite wrap-up`
- [ ] **Step 3:** `node .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js verify wrap-up` — expect all resolve. **Also expect 2 `path.join(__dirname, ...)` rewrites** (`engine-cli.test.js:15`, `cli.test.js:26`) — see Task 2's note on the script's `path.join(__dirname, ...)` support.
- [ ] **Step 4:** `bash .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/run-module-tests.sh tests/bin-lib/wrap-up > .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-wrap-up.log 2>&1; echo "exit=$?" >> .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-wrap-up.log` then `grep "^# tests\|^# pass\|^# fail" .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-wrap-up.log` — compare to `baseline-wrap-up.log`.
- [ ] **Step 5:** `git add tests/bin-lib/wrap-up && git commit -m "Relocate bin/lib/wrap-up/tests to tests/bin-lib/wrap-up

refs #417"`

---

### Task 16: Update package.json + docs, run full verification, clean up, prepare PR notes

**Files:**
- Modify: `package.json:7`
- Modify: `docs/plugin-structure.md:78-96`
- Delete (from git tracking, if accidentally staged) / delete from disk: `.claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/relocate-requires.js` and its log files

- [ ] **Step 1: Confirm no `bin/lib/*/tests` directories remain**

```bash
find bin/lib -type d -name tests
```

Expected: empty output.

- [ ] **Step 2: Confirm the new tree matches the moved set**

```bash
find tests/bin-lib -mindepth 1 -maxdepth 1 -type d | sort
```

Expected (14 lines): `tests/bin-lib/code-health`, `tests/bin-lib/dispatch`, `tests/bin-lib/docs-health`, `tests/bin-lib/harness-health`, `tests/bin-lib/health-core`, `tests/bin-lib/init`, `tests/bin-lib/issues`, `tests/bin-lib/journey-health`, `tests/bin-lib/model-profiles`, `tests/bin-lib/record-graph`, `tests/bin-lib/release`, `tests/bin-lib/residue`, `tests/bin-lib/skill-audit`, `tests/bin-lib/wrap-up`.

- [ ] **Step 3: Update `package.json`'s test script**

Change line 7 from:
```json
    "test": "node --test $(find tests bin/lib/*/tests tools/upstream-drift/tests -name '*.test.js' | sort)",
```
to:
```json
    "test": "node --test $(find tests tools/upstream-drift/tests -name '*.test.js' | sort)",
```

(`find tests` already recurses into the new `tests/bin-lib/{module}/` subtree — no separate glob token is needed, and any future `tests/bin-lib/{new-module}/` is automatically covered, closing IL-84.)

- [ ] **Step 4: Update `docs/plugin-structure.md`'s per-suite invocation lines**

Line 78, from:
```
npm test                            # Runs node --test over tests/, every bin/lib/*/tests directory, and tools/upstream-drift/tests (see package.json's `test` script — a glob, not a fixed list; new bin/lib/{x}/tests directories are picked up automatically)
```
to:
```
npm test                            # Runs node --test over tests/ (includes every tests/bin-lib/{module} suite) and tools/upstream-drift/tests (see package.json's `test` script — a recursive glob; new tests/bin-lib/{x} directories are picked up automatically)
```

Lines 79, 81, 83, 85, 87, 89, 90, 93 — replace `bin/lib/{module}/tests/*.test.js` with `tests/bin-lib/{module}/*.test.js` for: `code-health`, `harness-health`, `journey-health`, `docs-health`, `record-graph`, `init`, `wrap-up`, `residue` (the 8 modules that already had a documented per-suite line; the other 6 — `dispatch`, `health-core`, `issues`, `model-profiles`, `release`, `skill-audit` — had none before this change and are out of scope here).

Line 96, from:
```
node bin/release.js <minor|patch> "<summary>" [--dry-run]   # Release CLI — one-command release: 5-source collision pre-check, bump+CHANGELOG+tsv in one commit, push, marketplace mirror (fixture-tested in `bin/lib/release/tests/`)
```
to:
```
node bin/release.js <minor|patch> "<summary>" [--dry-run]   # Release CLI — one-command release: 5-source collision pre-check, bump+CHANGELOG+tsv in one commit, push, marketplace mirror (fixture-tested in `tests/bin-lib/release/`)
```

- [ ] **Step 5: Verify the recursive glob matches every relocated directory**

```bash
find tests/bin-lib -name "*.test.js" | sed -E 's#/[^/]+$##' | sort -u
```

Compare this list (14 unique directories) against the `find tests/bin-lib -mindepth 1 -maxdepth 1 -type d` list from Step 2 — every relocated module directory must contain at least one matched `.test.js` file (they do; every module had `*.test.js` files pre-move).

- [ ] **Step 6: Run the full suite and capture post-move counts**

```bash
npm test > .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-full.log 2>&1
echo "exit=$?" >> .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-full.log
tail -5 .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-full.log
```

Expected: `exit=0`.

- [ ] **Step 7: Assemble the per-module before/after parity table**

```bash
cat .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/baseline-pre.txt
grep "^# tests\|^# pass\|^# fail" .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts/post-*.log
```

Both captures — this is what goes into the PR description and the comment on issue #417, per the spec's deliverable ("captured to a file, both captures shown"). Every module's `# tests`/`# pass`/`# fail` line must match between baseline and post exactly.

- [ ] **Step 8: Delete the temporary relocation script and its logs**

```bash
rm -rf .claude-tweaks/pipelines/2026-08-15T100549-spec-417/scripts
```

(Nothing here was ever committed — this is a plain cleanup of gitignored working files, not a git operation.)

- [ ] **Step 9: Commit the package.json + docs update**

```bash
git add package.json docs/plugin-structure.md
git commit -m "Collapse bin/lib/*/tests glob to a recursive tests/bin-lib find

refs #417"
```

- [ ] **Step 10: Final confirmation**

```bash
find bin/lib -type d -name tests
git status --porcelain
```

Expected: both empty (no leftover `tests/` dirs under `bin/lib`, no uncommitted changes — everything from Tasks 2-15 plus this task's commit already landed).

---

## Self-Review Notes

**Spec coverage:** Every Deliverable and Acceptance Criterion maps to a task step above — `git mv` per module (Tasks 2-15 Step 1), require rewrite by resolved-location not fixed depth (the shared script's `resolveNewTarget`, which handles all three require classes named in the spec: own-module source, cross-module `health-core` test-helpers, and the `docs-health` top-level-CLI shape), the recursive `package.json` glob (Task 16 Step 3), `docs/plugin-structure.md` sync (Task 16 Step 4), per-module before/after counts (Task 1 + each module's Step 4 + Task 16 Step 7), no remaining `bin/lib/*/tests` (Task 16 Steps 1 and 10), recursive-glob-matches-moved-set proof (Task 16 Step 5), and require-integrity via `require.resolve` not grep (the shared script's `verify` mode, run once per module).

**Placeholder scan:** No TBD/TODO/"similar to Task N" — every task's commands are concrete and module-specific; the shared script is fully written once in Task 1 and referenced by its real path everywhere else.

**Type consistency:** The script's two entry points (`rewrite <module>`, `verify <module>`) are invoked identically in every task; `resolveNewTarget`'s return contract (an absolute path) and `forEachLiveRequire`'s callback signature `(lineIdx, match)` are used consistently in both `rewriteModule` and `verifyModule`.
