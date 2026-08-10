# Code-Health Focus Mode: Candidate-Driven Scoping + Dead-Code Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `focus=<vertical>` scoping mode to `/claude-tweaks:code-health` — a candidate-driven alternative to `next-slice` directory rotation — and ship its first (and only, in this leaf) vertical: a deterministic `dead-code` candidate generator that finds unreferenced `module.exports` symbols and orphaned files, judged by the existing `dead-code` criterion.

**Architecture:** One new deterministic module, `bin/lib/code-health/candidates-dead-code.js`, built bottom-up from four small grep-anchored helpers (entrypoint detection, export extraction, reference checking, orphan-file checking) into one orchestrating `scanDeadCode`/`candidatesDeadCode` pair, registered in a small `FOCUS_GENERATORS` map that is the framework's extension point for later verticals. `skills/code-health/SKILL.md` gets a short "Focus Mode" pointer section; the full procedure lives in a new sub-file, `skills/code-health/focus-mode.md`, kept under the 40 KB soft ceiling from the start. `skills/code-health/routine-template.yml` and `skills/_shared/routine-template-schema.md` gain a documented, currently-unset `focus` field so a later fleet leaf can instantiate one routine per vertical from this same template. Steps 5 (JUDGE) onward in SKILL.md, `criteriaForArea`, the criteria catalog, dedup, and filing are all untouched.

**Tech Stack:** Node.js (`node --test`), no new dependencies — no AST library, grep-anchored heuristics via `git ls-files` (gitignore-respecting file listing) and in-process `RegExp` line scanning (no `find`/`grep` subprocess spawns beyond the one `git ls-files` call — see Task 5's design note for why this still satisfies the "explicit file-list, not bare recursive grep" principle).

## Global Constraints

Copied verbatim from the spec (`.claude-tweaks/pipelines/2026-08-09T122833-spec-271-267/spec-271/work/271-spec.md`) — do not weaken any of these while implementing:

- Never test by running `bin/code-health.js` with real arguments — it pushes durable state to the shared `health-state` branch and stamps a 90-day rotation cursor (IL-73). Exercise the new module and its unit suite only.
- A NUL byte or encoding oddity in a scanned file makes grep go silent while reads succeed — the generator must tolerate binary-ish files by skipping them explicitly, and the fixture suite includes one.
- `{result}`-style token greps can't match populated text (IL-79) — reference detection must search the bare symbol name, word-bounded, not a decorated pattern.
- The focus mode's scoping swap must not touch the rotation cursor or content-hash state — a focus firing is cursor-neutral (the generalist rotation's state belongs to the generalist); state this in SKILL.md and assert the state files untouched in the fixture-level test if reachable (there is no on-disk rotation state reachable from a pure fixture-tree unit test — the assertion here is that `scanDeadCode`/`candidatesDeadCode` never call `next-slice` or touch `bin/lib/code-health/scope.js` at all, verified by the module never importing it).
- Sweep SKILL.md prose for slice-assumptions that become wrong under focus mode ("the slice", "this directory") — the same fact restated in multiple sections drifts (IL-17); read the whole file, don't keyword-grep.
- No AST dependency in v1 — grep-anchored heuristics with the false-negative direction chosen deliberately: prefer missing a dead export over flagging a live one; the judge is the second filter, the verify gate the third.
- `criteriaForArea` and the criteria catalog (`bin/lib/code-health/criteria.js`) are untouched by this leaf — `git diff` on that file must be empty (AC3).
- Coverage is stated in the module header and in the SKILL.md/`focus-mode.md` section — never implied total (IL-110).
- `bin/code-health.js`'s arg parser is untouched in v1 — the focus mode is SKILL.md-prose-driven, invoking the generator via a `node -e` require, exactly the call pattern Step 4 already uses for `criteriaForArea`.

---

## Design notes (read before Task 1)

**Why the module exports both a narrow and a rich function.** The spec's own Data/API Surface line pins `candidatesDeadCode(rootDir, opts) → [{file, symbol, kind, evidence}]` — a bare array. But SKILL.md's zero-candidates report (deliverable 1, IL-115) needs `scannedFiles`/`skippedFiles` counts too, and `JSON.stringify` of a JS array only serializes its numeric indices — any extra properties attached to the array (e.g. `result.scannedFiles = n`) are silently dropped by `JSON.stringify`, which is exactly how SKILL.md's `node -e ... console.log(JSON.stringify(...))` wiring will consume it. So the module does the full scan once in a private `scanDeadCode(rootDir, opts)` that returns `{ candidates, scannedFiles, skippedFiles }`, and `candidatesDeadCode` is a thin wrapper returning just `.candidates` — matching the spec's literal signature exactly (used directly by the AC1/AC2 unit tests, where comparing a bare array is simpler) while `scanDeadCode` is what `focus-mode.md`'s real invocation and the `FOCUS_GENERATORS` registry use.

**Why `git ls-files`, not `find`.** The spec requires `.gitignore`-respecting file discovery. `bin/lib/code-health/scope.js`'s existing `sourceFiles()` uses `find` with a hardcoded `SKIP_DIRS` exclusion list — a convention, not real `.gitignore` parsing. `git ls-files --cached --others --exclude-standard` is git's own authoritative `.gitignore` evaluation (no need to hand-roll gitignore glob semantics, and no need for the fixture trees to `git add`/commit anything — `--others --exclude-standard` lists untracked-but-not-ignored working-tree files as soon as a `.gitignore` is present, no commit required). This satisfies the "explicit file-list, not bare recursive grep" principle from the recursive-grep-skips-gitignored-files lesson: `git ls-files` produces one explicit list, consumed via in-process `RegExp` scanning of each listed file's content rather than a second recursive tool that might disagree with git about what's ignored.

**Why the extraction/reference/orphan logic runs in-process instead of shelling `grep`/`find`.** The Technical Approach section names `find`+`xargs grep` as what NOT to replace with bare recursive grep — the principle is "explicit file list, gitignore-respecting", not "must be a spawned grep process". Once `git ls-files` has produced that explicit list and the files are already read into memory for export extraction, scanning the same in-memory text with `RegExp` for reference/orphan checks is simpler, more portable, and equally deterministic. This choice is called out explicitly in the module's header comment (Task 5) so a future reader doesn't go looking for a `grep` subprocess that isn't there.

---

### Task 1: Entrypoint detection (`detectEntrypoints`)

**Files:**
- Create: `bin/lib/code-health/candidates-dead-code.js`
- Create: `bin/lib/code-health/tests/candidates-dead-code.test.js`

**Interfaces:**
- Produces: `detectEntrypoints(rootDir, files) → Set<string>` — `files` is an array of repo-relative POSIX paths (as later produced by Task 5's `listTrackedSourceFiles`); returns the subset that are entrypoints, never candidates for dead-code flagging.
- Produces (helper, used only internally by `detectEntrypoints` in this task): `extractPathLikeStrings(text) → string[]`, `collectStrings(value, acc) → string[]`.

- [ ] **Step 1: Write the failing test**

Create `bin/lib/code-health/tests/candidates-dead-code.test.js` with:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { detectEntrypoints } = require('../candidates-dead-code');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codehealth-deadcode-'));
}

// ── detectEntrypoints ────────────────────────────────────────────────────────

test('detectEntrypoints: direct children of bin/ are entrypoints, nested bin/lib files are not', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'bin', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'bin', 'cli.js'), 'module.exports = {};\n');
  fs.writeFileSync(path.join(root, 'bin', 'lib', 'helper.js'), 'module.exports = {};\n');
  const files = ['bin/cli.js', 'bin/lib/helper.js'];
  const eps = detectEntrypoints(root, files);
  assert.ok(eps.has('bin/cli.js'));
  assert.ok(!eps.has('bin/lib/helper.js'));
});

test('detectEntrypoints: files referenced inside hooks/hooks.json are entrypoints', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'hooks', 'hooks.json'),
    JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" session-start' }] }],
      },
    }),
  );
  fs.writeFileSync(path.join(root, 'bin', 'hooks.js'), 'module.exports = {};\n');
  const files = ['bin/hooks.js', 'hooks/hooks.json'];
  const eps = detectEntrypoints(root, files);
  assert.ok(eps.has('bin/hooks.js'));
});

test('detectEntrypoints: files referenced inside .claude-plugin/plugin.json are entrypoints', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'x', agents: ['./agents/qa-agent.js'] }),
  );
  fs.writeFileSync(path.join(root, 'agents', 'qa-agent.js'), 'module.exports = {};\n');
  const files = ['agents/qa-agent.js', '.claude-plugin/plugin.json'];
  const eps = detectEntrypoints(root, files);
  assert.ok(eps.has('agents/qa-agent.js'));
});

test('detectEntrypoints: package.json bin/main/exports fields name entrypoints', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'index.js'), 'module.exports = {};\n');
  fs.writeFileSync(path.join(root, 'src', 'cli.js'), 'module.exports = {};\n');
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ main: './src/index.js', bin: { mytool: './src/cli.js' } }),
  );
  const files = ['src/index.js', 'src/cli.js', 'package.json'];
  const eps = detectEntrypoints(root, files);
  assert.ok(eps.has('src/index.js'));
  assert.ok(eps.has('src/cli.js'));
});

test('detectEntrypoints: bin/lib/hooks/*.js is an implicit entrypoint set when bin/hooks.js dynamically requires from it', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'bin', 'lib', 'hooks'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'bin', 'hooks.js'),
    "function loadModule(event) { try { return require('./lib/hooks/' + event); } catch { return null; } }\nmodule.exports = { loadModule };\n",
  );
  fs.writeFileSync(path.join(root, 'bin', 'lib', 'hooks', 'session-start.js'), 'function run() { return 1; }\nmodule.exports = { run };\n');
  const files = ['bin/hooks.js', 'bin/lib/hooks/session-start.js'];
  const eps = detectEntrypoints(root, files);
  assert.ok(eps.has('bin/lib/hooks/session-start.js'), 'dynamically-loaded hook module must be treated as an entrypoint');
});

test('detectEntrypoints: bin/lib/hooks/*.js is NOT an implicit entrypoint when bin/hooks.js does not use the dynamic-require pattern', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'bin', 'lib', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'bin', 'hooks.js'), "const x = require('./lib/hooks/session-start');\nmodule.exports = { x };\n");
  fs.writeFileSync(path.join(root, 'bin', 'lib', 'hooks', 'session-start.js'), 'module.exports = {};\n');
  const files = ['bin/hooks.js', 'bin/lib/hooks/session-start.js'];
  const eps = detectEntrypoints(root, files);
  assert.ok(!eps.has('bin/lib/hooks/session-start.js'), 'a literal (non-computed) require must not trigger the implicit-entrypoint carve-out');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/code-health/tests/candidates-dead-code.test.js`
Expected: FAIL — `Cannot find module '../candidates-dead-code'` (the file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `bin/lib/code-health/candidates-dead-code.js`:

```js
'use strict';

// candidates-dead-code.js — deterministic dead-code candidate generator for
// code-health's `focus=dead-code` scoping mode (see skills/code-health/
// focus-mode.md). Finds unreferenced module.exports symbols and orphaned
// files via grep-anchored heuristics — no AST. Candidates are INPUT to the
// judge (skills/code-health/SKILL.md Step 5), never filed directly; the
// judge and the verify gate remain the filter of record.
//
// Coverage (stated explicitly, never implied total — IL-110):
//   - JS/TS files only (.js/.ts/.tsx/.jsx/.mjs/.cjs). Markdown is out of
//     scope entirely (prose-reachable, not import-reachable).
//   - Only the CommonJS `module.exports = { a, b, c }` shorthand-brace
//     export shape is recognized (single- or multi-line). ESM `export`
//     statements, the `module.exports.NAME = ...` single-assignment form,
//     and aliased (`{ a: renamed }`) or computed keys are NOT extracted —
//     accepted false negatives, consistent with the conservative direction.
//   - Reference detection is a word-bounded bare-symbol search across every
//     tracked, non-ignored file — an unrelated same-named identifier
//     elsewhere in the tree makes a dead export read live. Accepted
//     false-negative, per the spec's explicit policy.
//   - Dynamic patterns are out of scope by construction: a computed
//     `require(x + y)` call site is never treated as a static reference to
//     whatever it might load at runtime, and a spread-based barrel
//     (`{ ...require('./a') }`) extracts no symbols from the spread token
//     (skipped, not crashed). Re-exported names are still caught as
//     referenced if used by their bare name anywhere, since reference
//     detection is symbol-name-based, not import-statement-based.
//   - The one hardcoded exception: `bin/lib/hooks/*.js` is treated as an
//     implicit entrypoint set whenever `bin/hooks.js` exists and contains
//     the string-keyed `require('./lib/hooks/' + event)` pattern — this
//     repo's own hook dispatcher convention, invisible to every other rule
//     here because the required path is never a string literal.

const fs = require('fs');
const path = require('path');

const SOURCE_EXTS = new Set(['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs']);

// Pulls substrings that look like a relative source-file path (ending in a
// known extension) out of raw JSON/text — e.g.
// `"node \"${CLAUDE_PLUGIN_ROOT}/bin/hooks.js\" session-start"` -> `bin/hooks.js`,
// `"./agents/qa-agent.md"` -> `agents/qa-agent.md`. Used to read entrypoint
// references out of hooks/hooks.json and .claude-plugin/plugin.json without
// a full command-line parser — those files just need their path-shaped
// substrings, not their exact shell semantics.
function extractPathLikeStrings(text) {
  const found = [];
  const re = /[\w./${}-]+\.(?:js|ts|tsx|jsx|mjs|cjs|md)\b/g;
  let m;
  while ((m = re.exec(text))) {
    let p = m[0];
    p = p.replace(/^\$\{[^}]*\}\//, ''); // strip a leading "${VAR}/" expansion
    p = p.replace(/^\.\//, ''); // strip a leading "./"
    found.push(p);
  }
  return found;
}

// Recursively collects every string value out of an arbitrarily-nested
// JSON value (used for package.json's `exports` field, which can be a
// string, an array, or a nested conditional-exports object).
function collectStrings(value, acc = []) {
  if (typeof value === 'string') acc.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, acc));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectStrings(v, acc));
  return acc;
}

// Returns the subset of `files` (repo-relative POSIX paths) that are
// entrypoints — invoked externally even when nothing else in the tree
// references them, so never flagged as dead code. Convention-based, not
// package.json-field-only, since this repo's own package.json declares no
// bin/main/exports fields at all.
function detectEntrypoints(rootDir, files) {
  const entrypoints = new Set();
  const fileSet = new Set(files);

  // Rule 1: files directly under bin/ (direct children only — bin/lib/**
  // is not covered by this rule; see Rule 5 for its one carve-out).
  for (const f of files) {
    const parts = f.split('/');
    if (parts.length === 2 && parts[0] === 'bin') entrypoints.add(f);
  }

  // Rules 2 & 3: paths named inside hooks/hooks.json and
  // .claude-plugin/plugin.json — this repo's own convention for what a
  // hook or plugin manifest invokes externally.
  for (const configRel of ['hooks/hooks.json', '.claude-plugin/plugin.json']) {
    let text;
    try {
      text = fs.readFileSync(path.join(rootDir, configRel), 'utf8');
    } catch {
      continue; // not every target repo is a claude-tweaks-style plugin
    }
    for (const rel of extractPathLikeStrings(text)) {
      if (fileSet.has(rel)) entrypoints.add(rel);
    }
  }

  // Rule 4: package.json's bin/main/exports fields, when present.
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    const pkgPaths = [];
    if (typeof pkg.main === 'string') pkgPaths.push(pkg.main);
    if (typeof pkg.bin === 'string') pkgPaths.push(pkg.bin);
    else if (pkg.bin && typeof pkg.bin === 'object') pkgPaths.push(...Object.values(pkg.bin));
    pkgPaths.push(...collectStrings(pkg.exports));
    for (const p of pkgPaths) {
      if (typeof p !== 'string') continue;
      const norm = p.replace(/^\.\//, '');
      if (fileSet.has(norm)) entrypoints.add(norm);
    }
  } catch {
    // no package.json, or it doesn't parse — this rule simply contributes nothing
  }

  // Rule 5: bin/lib/hooks/*.js as implicit entrypoints, when bin/hooks.js
  // exists and dynamically requires from that directory by string
  // concatenation — a pattern invisible to Rules 1-4 because the required
  // path is never a string literal anywhere in the tree.
  let hooksJsText = null;
  try {
    hooksJsText = fs.readFileSync(path.join(rootDir, 'bin', 'hooks.js'), 'utf8');
  } catch {
    // no bin/hooks.js in this target repo — rule contributes nothing
  }
  if (hooksJsText && /require\(\s*['"`]\.\/lib\/hooks\/['"`]\s*\+/.test(hooksJsText)) {
    for (const f of files) {
      if (f.startsWith('bin/lib/hooks/') && f.split('/').length === 4) entrypoints.add(f);
    }
  }

  return entrypoints;
}

module.exports = { detectEntrypoints, extractPathLikeStrings, collectStrings };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/code-health/tests/candidates-dead-code.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/code-health/candidates-dead-code.js bin/lib/code-health/tests/candidates-dead-code.test.js
git commit -m "Add entrypoint detection to the dead-code candidate generator — refs #271"
```

---

### Task 2: Export extraction (`extractModuleExports`)

**Files:**
- Modify: `bin/lib/code-health/candidates-dead-code.js` (append below Task 1's code, before `module.exports`)
- Modify: `bin/lib/code-health/tests/candidates-dead-code.test.js` (append)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `extractModuleExports(text) → [{ symbol: string, startLine: number, endLine: number }]` — `startLine`/`endLine` are 1-based, inclusive, spanning the `module.exports = { ... }` block the symbol was found in. Used by Task 5's orchestration and by Task 3's `isReferenced` (via the `declRange` it receives).

- [ ] **Step 1: Write the failing test**

Append to `bin/lib/code-health/tests/candidates-dead-code.test.js`:

```js
const { extractModuleExports } = require('../candidates-dead-code');

// ── extractModuleExports ─────────────────────────────────────────────────────

test('extractModuleExports: single-line brace form', () => {
  const text = "function a() {}\nfunction b() {}\nmodule.exports = { a, b };\n";
  const found = extractModuleExports(text);
  assert.deepStrictEqual(found.map((f) => f.symbol).sort(), ['a', 'b']);
});

test('extractModuleExports: this repo\'s dominant multi-line brace shape', () => {
  const text = [
    'function usedFn() {}',
    'function deadFn() {}',
    'module.exports = {',
    '  usedFn,',
    '  deadFn,',
    '};',
    '',
  ].join('\n');
  const found = extractModuleExports(text);
  assert.deepStrictEqual(found.map((f) => f.symbol).sort(), ['deadFn', 'usedFn']);
  // The block spans the "module.exports = {" line through the closing "};" line.
  const usedFn = found.find((f) => f.symbol === 'usedFn');
  assert.strictEqual(usedFn.startLine, 3);
  assert.strictEqual(usedFn.endLine, 6);
});

test('extractModuleExports: no module.exports block yields an empty array, no crash', () => {
  assert.deepStrictEqual(extractModuleExports('const x = 1;\nexport default x;\n'), []);
});

test('extractModuleExports: aliased/computed keys are skipped, not crashed on (conservative)', () => {
  const text = 'function a() {}\nmodule.exports = { a, renamed: a, [computed()]: a };\n';
  const found = extractModuleExports(text);
  assert.deepStrictEqual(found.map((f) => f.symbol), ['a']);
});

test('extractModuleExports: a spread-based barrel re-export extracts no symbols and does not crash (AC2)', () => {
  const text = "module.exports = { ...require('./a'), ...require('./b') };\n";
  assert.deepStrictEqual(extractModuleExports(text), []);
});

test('extractModuleExports: an unterminated module.exports block is skipped, not crashed on', () => {
  const text = 'module.exports = { a, b\n// no closing brace in this file\n';
  assert.deepStrictEqual(extractModuleExports(text), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/code-health/tests/candidates-dead-code.test.js`
Expected: FAIL — `extractModuleExports is not a function` (not exported yet).

- [ ] **Step 3: Write minimal implementation**

Insert into `bin/lib/code-health/candidates-dead-code.js`, after `detectEntrypoints`'s closing brace and before the `module.exports` line:

```js
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// Extracts every bare identifier out of every `module.exports = { ... }`
// brace block in `text` — this repo's dominant export shape, single- or
// multi-line alike (a single-line block is just the one-line case of the
// same brace scan). Character-by-character brace-depth tracking, not a
// line-by-line split, so a nested object value can't prematurely end the
// block. Tokens that aren't bare identifiers (spread `...x`, aliased
// `a: b`, computed `[x]: y`) are silently skipped — conservative by
// design (AC2): prefer missing a dead export over flagging a live one.
function extractModuleExports(text) {
  const results = [];
  const startRe = /module\.exports\s*=\s*\{/g;
  let m;
  while ((m = startRe.exec(text))) {
    const openIdx = m.index + m[0].length - 1; // index of the '{'
    let depth = 0;
    let closeIdx = -1;
    for (let i = openIdx; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) {
          closeIdx = i;
          break;
        }
      }
    }
    if (closeIdx === -1) {
      // Unterminated block (malformed or truncated file) — skip gracefully,
      // never throw. startRe.lastIndex is already past openIdx, so the
      // outer while loop simply finds no further "module.exports = {" and
      // exits.
      continue;
    }
    const inner = text.slice(openIdx + 1, closeIdx);
    const startLine = text.slice(0, openIdx).split('\n').length;
    const endLine = text.slice(0, closeIdx).split('\n').length;
    for (const rawToken of inner.split(',')) {
      const token = rawToken.trim();
      if (token === '' || token.startsWith('...') || !IDENTIFIER_RE.test(token)) continue;
      results.push({ symbol: token, startLine, endLine });
    }
    startRe.lastIndex = closeIdx;
  }
  return results;
}
```

Update the `module.exports` line at the bottom of the file:

```js
module.exports = { detectEntrypoints, extractPathLikeStrings, collectStrings, extractModuleExports };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/code-health/tests/candidates-dead-code.test.js`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/code-health/candidates-dead-code.js bin/lib/code-health/tests/candidates-dead-code.test.js
git commit -m "Add module.exports symbol extraction to the dead-code candidate generator — refs #271"
```

---

### Task 3: Reference checking (`isReferenced`)

**Files:**
- Modify: `bin/lib/code-health/candidates-dead-code.js`
- Modify: `bin/lib/code-health/tests/candidates-dead-code.test.js`

**Interfaces:**
- Consumes: the `{startLine, endLine}` shape produced by Task 2's `extractModuleExports`, passed in as `declRange`.
- Produces: `isReferenced(symbol, declFile, declRange, allFiles, contentsByFile) → boolean` — `allFiles` is an array of repo-relative paths, `contentsByFile` is a `Map<string, string>` keyed by the same paths. Used by Task 5's orchestration.

- [ ] **Step 1: Write the failing test**

Append to the test file:

```js
const { isReferenced } = require('../candidates-dead-code');

// ── isReferenced ──────────────────────────────────────────────────────────────

test('isReferenced: a symbol used elsewhere in another file is referenced', () => {
  const contentsByFile = new Map([
    ['lib/used.js', 'function usedFn() {}\nfunction deadFn() {}\nmodule.exports = { usedFn, deadFn };\n'],
    ['lib/caller.js', "const { usedFn } = require('./used');\nusedFn();\n"],
  ]);
  const allFiles = ['lib/used.js', 'lib/caller.js'];
  assert.strictEqual(isReferenced('usedFn', 'lib/used.js', { startLine: 3, endLine: 3 }, allFiles, contentsByFile), true);
});

test('isReferenced: a symbol with no use anywhere but its own export-block mention and definition line is NOT referenced', () => {
  const contentsByFile = new Map([
    ['lib/used.js', 'function usedFn() {}\nfunction deadFn() {}\nmodule.exports = { usedFn, deadFn };\n'],
    ['lib/caller.js', "const { usedFn } = require('./used');\nusedFn();\n"],
  ]);
  const allFiles = ['lib/used.js', 'lib/caller.js'];
  assert.strictEqual(isReferenced('deadFn', 'lib/used.js', { startLine: 3, endLine: 3 }, allFiles, contentsByFile), false);
});

test('isReferenced: a same-named identifier elsewhere in the tree is treated as a reference (accepted false-negative)', () => {
  const contentsByFile = new Map([
    ['lib/a.js', 'function helper() {}\nmodule.exports = { helper };\n'],
    ['lib/unrelated.js', 'const helper = 42; // totally unrelated variable, same bare name\nconsole.log(helper);\n'],
  ]);
  const allFiles = ['lib/a.js', 'lib/unrelated.js'];
  // 'helper' is genuinely dead in lib/a.js's own sense, but the word-bounded
  // bare-symbol search cannot distinguish it from the unrelated identifier —
  // this is the spec's explicitly accepted false-negative policy.
  assert.strictEqual(isReferenced('helper', 'lib/a.js', { startLine: 2, endLine: 2 }, allFiles, contentsByFile), true);
});

test('isReferenced: the symbol\'s own function/const/class definition line is not itself counted as a use', () => {
  const contentsByFile = new Map([
    ['lib/a.js', 'const deadConst = 1;\nfunction deadFn() {}\nclass DeadClass {}\nmodule.exports = { deadConst, deadFn, DeadClass };\n'],
  ]);
  const allFiles = ['lib/a.js'];
  assert.strictEqual(isReferenced('deadConst', 'lib/a.js', { startLine: 4, endLine: 4 }, allFiles, contentsByFile), false);
  assert.strictEqual(isReferenced('deadFn', 'lib/a.js', { startLine: 4, endLine: 4 }, allFiles, contentsByFile), false);
  assert.strictEqual(isReferenced('DeadClass', 'lib/a.js', { startLine: 4, endLine: 4 }, allFiles, contentsByFile), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/code-health/tests/candidates-dead-code.test.js`
Expected: FAIL — `isReferenced is not a function`.

- [ ] **Step 3: Write minimal implementation**

Insert into `candidates-dead-code.js`, after `extractModuleExports` and before `module.exports`:

```js
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// True if `symbol` is used anywhere in `allFiles` in a way that is neither
// (a) its own mention inside the module.exports block it was extracted
// from (declFile + declRange), nor (b) its own function/const/let/var/class
// definition line (wherever that lives). Word-bounded bare-symbol search —
// an unrelated same-named identifier elsewhere reads as a reference
// (accepted false-negative, IL-79-safe: never a decorated-token match).
function isReferenced(symbol, declFile, declRange, allFiles, contentsByFile) {
  const esc = escapeRegExp(symbol);
  const wordRe = new RegExp(`\\b${esc}\\b`);
  const declPatternRe = new RegExp(`\\b(function|class)\\s+${esc}\\b|\\b(const|let|var)\\s+${esc}\\b`);
  for (const file of allFiles) {
    const text = contentsByFile.get(file);
    if (!text) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!wordRe.test(line)) continue;
      const lineNo = i + 1;
      if (file === declFile && lineNo >= declRange.startLine && lineNo <= declRange.endLine) continue;
      if (declPatternRe.test(line)) continue;
      return true;
    }
  }
  return false;
}
```

Update `module.exports`:

```js
module.exports = { detectEntrypoints, extractPathLikeStrings, collectStrings, extractModuleExports, isReferenced, escapeRegExp };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/code-health/tests/candidates-dead-code.test.js`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/code-health/candidates-dead-code.js bin/lib/code-health/tests/candidates-dead-code.test.js
git commit -m "Add word-bounded reference checking to the dead-code candidate generator — refs #271"
```

---

### Task 4: Orphan-file checking (`isFileOrphan`)

**Files:**
- Modify: `bin/lib/code-health/candidates-dead-code.js`
- Modify: `bin/lib/code-health/tests/candidates-dead-code.test.js`

**Interfaces:**
- Consumes: nothing from Tasks 1-3 directly (independent helper).
- Produces: `isFileOrphan(relFile, allFiles, contentsByFile) → boolean`. Used by Task 5's orchestration.

- [ ] **Step 1: Write the failing test**

Append to the test file:

```js
const { isFileOrphan } = require('../candidates-dead-code');

// ── isFileOrphan ──────────────────────────────────────────────────────────────

test('isFileOrphan: a file required by another file (relative path, any depth) is not orphan', () => {
  const contentsByFile = new Map([
    ['lib/used.js', 'module.exports = {};\n'],
    ['bin/main.js', "const used = require('../lib/used');\n"],
  ]);
  const allFiles = ['lib/used.js', 'bin/main.js'];
  assert.strictEqual(isFileOrphan('lib/used.js', allFiles, contentsByFile), false);
});

test('isFileOrphan: a file nothing requires is orphan', () => {
  const contentsByFile = new Map([
    ['orphan.js', 'module.exports = { orphanFn: () => 1 };\n'],
    ['other.js', 'module.exports = {};\n'],
  ]);
  const allFiles = ['orphan.js', 'other.js'];
  assert.strictEqual(isFileOrphan('orphan.js', allFiles, contentsByFile), true);
});

test('isFileOrphan: a short basename is not falsely matched inside an unrelated longer name (no substring false-positive)', () => {
  const contentsByFile = new Map([
    ['a.js', "function fromA() {}\nmodule.exports = { fromA };\n"],
    ['barrel.js', "module.exports = { ...require('./a') };\n"],
    ['main.js', "const x = require('./barrel');\n"],
  ]);
  const allFiles = ['a.js', 'barrel.js', 'main.js'];
  // 'a' is a substring of 'barrel', 'main' etc. — must not count as a match
  // unless it is genuinely the last path segment of a require/import specifier.
  assert.strictEqual(isFileOrphan('a.js', allFiles, contentsByFile), false, 'a.js IS required (by barrel.js) — must not be orphan');
});

test('isFileOrphan: an ES-module `from` specifier also counts as a reference', () => {
  const contentsByFile = new Map([
    ['lib/util.js', 'export function helper() {}\n'],
    ['src/app.js', "import { helper } from '../lib/util.js';\n"],
  ]);
  const allFiles = ['lib/util.js', 'src/app.js'];
  assert.strictEqual(isFileOrphan('lib/util.js', allFiles, contentsByFile), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/code-health/tests/candidates-dead-code.test.js`
Expected: FAIL — `isFileOrphan is not a function`.

- [ ] **Step 3: Write minimal implementation**

Insert into `candidates-dead-code.js`, after `isReferenced` and before `module.exports`:

```js
const REQUIRE_STRING_RE = /(?:require\(|from\s+|import\()\s*['"`]([^'"`]+)['"`]/g;

// Every quoted specifier string that follows a `require(`, `from `, or
// `import(` token in `text` — deliberately loose (matches inside a spread
// call, a destructured import, anywhere) since the only use is "does some
// specifier's last path segment name this file", not full JS parsing.
function referencedFileSpecifiers(text) {
  const specs = [];
  REQUIRE_STRING_RE.lastIndex = 0;
  let m;
  while ((m = REQUIRE_STRING_RE.exec(text))) specs.push(m[1]);
  return specs;
}

function basenameNoExt(p) {
  return path.basename(p).replace(/\.(js|ts|tsx|jsx|mjs|cjs)$/, '');
}

// True if no other file in `allFiles` require/import-references `relFile` —
// compared by exact basename-without-extension equality on the LAST path
// segment of each discovered specifier (never a substring/word-boundary
// regex against the whole basename, which would false-positive a short
// name like "a" inside an unrelated word like "barrel").
function isFileOrphan(relFile, allFiles, contentsByFile) {
  const base = basenameNoExt(relFile);
  for (const other of allFiles) {
    if (other === relFile) continue;
    const text = contentsByFile.get(other);
    if (!text) continue;
    for (const spec of referencedFileSpecifiers(text)) {
      const specBase = basenameNoExt(spec.split('/').pop());
      if (specBase === base) return false;
    }
  }
  return true;
}
```

Update `module.exports`:

```js
module.exports = {
  detectEntrypoints,
  extractPathLikeStrings,
  collectStrings,
  extractModuleExports,
  isReferenced,
  escapeRegExp,
  isFileOrphan,
  referencedFileSpecifiers,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/code-health/tests/candidates-dead-code.test.js`
Expected: PASS (20 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/code-health/candidates-dead-code.js bin/lib/code-health/tests/candidates-dead-code.test.js
git commit -m "Add orphan-file checking to the dead-code candidate generator — refs #271"
```

---

### Task 5: Orchestration (`scanDeadCode`/`candidatesDeadCode`/`FOCUS_GENERATORS`) + fixture-tree integration tests (AC1, AC2, AC6)

**Files:**
- Modify: `bin/lib/code-health/candidates-dead-code.js`
- Modify: `bin/lib/code-health/tests/candidates-dead-code.test.js`

**Interfaces:**
- Consumes: `detectEntrypoints` (Task 1), `extractModuleExports` (Task 2), `isReferenced` (Task 3), `isFileOrphan` (Task 4).
- Produces: `listTrackedSourceFiles(rootDir) → string[]`; `scanDeadCode(rootDir, opts) → { candidates: [{file, symbol?, kind, evidence}], scannedFiles: number, skippedFiles: [{file, reason}] }`; `candidatesDeadCode(rootDir, opts) → [{file, symbol?, kind, evidence}]` (spec's pinned Data/API Surface signature — `= scanDeadCode(rootDir, opts).candidates`); `FOCUS_GENERATORS → { 'dead-code': scanDeadCode }`. Used by Task 6's `focus-mode.md` wiring.

- [ ] **Step 1: Write the failing tests**

Append to the test file:

```js
const { execFileSync } = require('child_process');
const { candidatesDeadCode, scanDeadCode, FOCUS_GENERATORS } = require('../candidates-dead-code');

function gitInit(root) {
  execFileSync('git', ['-C', root, 'init', '-q']);
}

// ── AC1: a fixture tree with a known dead export, a live export, an orphan
// file, an entrypoint, and a gitignored file yields EXACTLY the dead export +
// orphan as candidates. Deliberately unambiguous per AC6 — no re-export or
// dynamic-require proximity anywhere in this tree.

function buildAc1Fixture() {
  const root = tmp();
  gitInit(root);
  fs.writeFileSync(path.join(root, '.gitignore'), 'ignored.js\n');

  // Live export ('usedFn') + dead export ('deadFn') in the same file.
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'lib', 'used.js'),
    'function usedFn() { return 1; }\nfunction deadFn() { return 2; }\nmodule.exports = { usedFn, deadFn };\n',
  );
  // Calls usedFn — the only reference to it anywhere in the tree.
  fs.writeFileSync(path.join(root, 'lib', 'caller.js'), "const { usedFn } = require('./used');\nusedFn();\n");

  // A file nothing requires — orphan-file candidate.
  fs.writeFileSync(path.join(root, 'orphan.js'), 'function orphanFn() { return 3; }\nmodule.exports = { orphanFn };\n');

  // An entrypoint (direct child of bin/) whose own export would otherwise
  // read as dead — must never be flagged, either as an orphan file or for
  // its export.
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'bin', 'entry.js'),
    'function entryOnlyFn() { return 4; }\nmodule.exports = { entryOnlyFn };\n',
  );

  // A gitignored file containing an otherwise-dead-looking export — must
  // never appear as a candidate.
  fs.writeFileSync(path.join(root, 'ignored.js'), 'function neverSeen() {}\nmodule.exports = { neverSeen };\n');

  // A NUL-byte / binary-ish file — must be skipped silently (no crash, no
  // candidate), and must show up in scanStats().skippedFiles with a reason.
  fs.writeFileSync(path.join(root, 'blob.js'), Buffer.from([0x6d, 0x00, 0x6f, 0x64]));

  return root;
}

test('AC1: fixture tree yields exactly the dead export + orphan as candidates', () => {
  const root = buildAc1Fixture();
  const candidates = candidatesDeadCode(root);
  const simplified = candidates.map((c) => ({ file: c.file, symbol: c.symbol, kind: c.kind })).sort((a, b) => a.file.localeCompare(b.file));
  assert.deepStrictEqual(simplified, [
    { file: 'lib/used.js', symbol: 'deadFn', kind: 'unreferenced-export' },
    { file: 'orphan.js', symbol: undefined, kind: 'orphan-file' },
  ]);
});

test('AC1: entrypoint files are never flagged (export-level or file-level)', () => {
  const root = buildAc1Fixture();
  const candidates = candidatesDeadCode(root);
  assert.ok(!candidates.some((c) => c.file === 'bin/entry.js'));
});

test('AC1: gitignored files are never flagged', () => {
  const root = buildAc1Fixture();
  const candidates = candidatesDeadCode(root);
  assert.ok(!candidates.some((c) => c.file === 'ignored.js'));
});

test('AC1/Gotchas: a NUL-byte file is skipped, never a candidate, and reported in skippedFiles with a reason', () => {
  const root = buildAc1Fixture();
  const { candidates, scannedFiles, skippedFiles } = scanDeadCode(root);
  assert.ok(!candidates.some((c) => c.file === 'blob.js'));
  assert.ok(scannedFiles > 0, 'scannedFiles must be nonzero — a zero count on a real tree signals a broken scan, not a clean one (IL-115)');
  const blobSkip = skippedFiles.find((s) => s.file === 'blob.js');
  assert.ok(blobSkip, 'blob.js must appear in skippedFiles');
  assert.strictEqual(blobSkip.reason, 'binary-or-nul');
});

// ── AC2: dynamic patterns produce no candidate and no crash — asserted on
// fixtures containing them, kept structurally separate from the AC1 tree above.

test('AC2: a bin/hooks.js-style computed require makes its dynamically-loaded target an entrypoint (no candidate, no crash)', () => {
  const root = tmp();
  gitInit(root);
  fs.mkdirSync(path.join(root, 'bin', 'lib', 'hooks'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'bin', 'hooks.js'),
    "function loadModule(event) { try { return require('./lib/hooks/' + event); } catch { return null; } }\nmodule.exports = { loadModule };\n",
  );
  fs.writeFileSync(
    path.join(root, 'bin', 'lib', 'hooks', 'session-start.js'),
    'function run() { return 1; }\nmodule.exports = { run };\n',
  );
  const candidates = candidatesDeadCode(root);
  assert.deepStrictEqual(candidates, []);
});

test('AC2: a spread-based barrel re-export beyond one hop produces no candidate and no crash', () => {
  const root = tmp();
  gitInit(root);
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'lib', 'a.js'), 'function fromA() { return 1; }\nmodule.exports = { fromA };\n');
  fs.writeFileSync(path.join(root, 'lib', 'b.js'), 'function fromB() { return 2; }\nmodule.exports = { fromB };\n');
  fs.writeFileSync(
    path.join(root, 'lib', 'barrel.js'),
    "module.exports = { ...require('./a'), ...require('./b') };\n",
  );
  fs.writeFileSync(
    path.join(root, 'bin', 'main.js'),
    "const { fromA, fromB } = require('../lib/barrel');\nfromA();\nfromB();\n",
  );
  const candidates = candidatesDeadCode(root);
  assert.deepStrictEqual(candidates, []);
});

// ── FOCUS_GENERATORS registry ────────────────────────────────────────────────

test('FOCUS_GENERATORS: registers "dead-code" mapped to scanDeadCode (the rich {candidates,scannedFiles,skippedFiles} shape)', () => {
  assert.deepStrictEqual(Object.keys(FOCUS_GENERATORS), ['dead-code']);
  const root = buildAc1Fixture();
  const result = FOCUS_GENERATORS['dead-code'](root);
  assert.ok(Array.isArray(result.candidates));
  assert.strictEqual(typeof result.scannedFiles, 'number');
  assert.ok(Array.isArray(result.skippedFiles));
});

// ── Zero-candidates is a clean no-op, not a crash ───────────────────────────

test('an empty tree (git repo, no source files) returns zero candidates with scannedFiles: 0', () => {
  const root = tmp();
  gitInit(root);
  const { candidates, scannedFiles, skippedFiles } = scanDeadCode(root);
  assert.deepStrictEqual(candidates, []);
  assert.strictEqual(scannedFiles, 0);
  assert.deepStrictEqual(skippedFiles, []);
});

test('a non-git root fails open to zero candidates and zero scannedFiles rather than throwing', () => {
  const root = tmp(); // no git init
  const { candidates, scannedFiles } = scanDeadCode(root);
  assert.deepStrictEqual(candidates, []);
  assert.strictEqual(scannedFiles, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/code-health/tests/candidates-dead-code.test.js`
Expected: FAIL — `candidatesDeadCode is not a function` (and `scanDeadCode`, `FOCUS_GENERATORS` undefined).

- [ ] **Step 3: Write minimal implementation**

Insert into `candidates-dead-code.js`, after `isFileOrphan` and before `module.exports`:

```js
// Files git would track or allow to be tracked, respecting .gitignore —
// `--cached` (tracked/staged) + `--others --exclude-standard` (untracked
// but not ignored) together, so a fixture tree needs only `git init` and a
// `.gitignore` on disk; nothing needs to be `git add`ed or committed for
// exclusion to take effect. Filters to JS/TS source extensions and sorts
// for deterministic ordering. Fails open to [] on any git error (not a
// repo, git unavailable) rather than throwing — a focus-mode firing must
// degrade to "zero candidates" (Step F2's clean no-op contract), never
// crash the sweep.
function listTrackedSourceFiles(rootDir) {
  let raw;
  try {
    raw = execFileSync(
      'git',
      ['-C', rootDir, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 },
    );
  } catch {
    return [];
  }
  return raw
    .split('\0')
    .filter(Boolean)
    .filter((f) => SOURCE_EXTS.has(path.extname(f)))
    .sort();
}

function hasNulByte(buffer) {
  return buffer.includes(0);
}

// The full scan, in one pass: lists tracked source files, classifies
// entrypoints, reads every remaining file once (skipping unreadable/binary
// ones with a reason), then for each non-entrypoint file checks orphan
// status FIRST (an orphan file's own exports are not separately flagged —
// that would double-count the same root cause) and otherwise checks each
// of its module.exports symbols for a reference. Returns the rich shape
// `{ candidates, scannedFiles, skippedFiles }` — `candidatesDeadCode` below
// is the spec-pinned narrow wrapper returning just `.candidates`.
//
// `opts` is accepted for signature parity with the spec's pinned
// `candidatesDeadCode(rootDir, opts)` API and reserved for future use;
// nothing in this leaf reads any property off it.
function scanDeadCode(rootDir, opts = {}) {
  const files = listTrackedSourceFiles(rootDir);
  const entrypoints = detectEntrypoints(rootDir, files);
  const contentsByFile = new Map();
  const skippedFiles = [];
  const scannable = [];

  for (const rel of files) {
    let buf;
    try {
      buf = fs.readFileSync(path.join(rootDir, rel));
    } catch {
      skippedFiles.push({ file: rel, reason: 'unreadable' });
      continue;
    }
    if (hasNulByte(buf)) {
      skippedFiles.push({ file: rel, reason: 'binary-or-nul' });
      continue;
    }
    contentsByFile.set(rel, buf.toString('utf8'));
    scannable.push(rel);
  }

  const candidates = [];
  for (const rel of scannable) {
    if (entrypoints.has(rel)) {
      skippedFiles.push({ file: rel, reason: 'entrypoint' });
      continue;
    }
    if (isFileOrphan(rel, scannable, contentsByFile)) {
      candidates.push({
        file: rel,
        kind: 'orphan-file',
        evidence: `no other tracked file's require/import specifier resolves to ${rel}`,
      });
      continue;
    }
    const exportsFound = extractModuleExports(contentsByFile.get(rel));
    for (const { symbol, startLine, endLine } of exportsFound) {
      const referenced = isReferenced(symbol, rel, { startLine, endLine }, scannable, contentsByFile);
      if (!referenced) {
        candidates.push({
          file: rel,
          symbol,
          kind: 'unreferenced-export',
          evidence: `"${symbol}" is exported from ${rel} (module.exports) but no other line in any tracked file references it by name`,
        });
      }
    }
  }

  candidates.sort((a, b) => (a.file === b.file ? String(a.symbol || '').localeCompare(String(b.symbol || '')) : a.file.localeCompare(b.file)));

  return { candidates, scannedFiles: files.length, skippedFiles };
}

// Spec-pinned Data/API Surface signature — a bare array, matching
// `candidatesDeadCode(rootDir, opts) → [{file, symbol, kind, evidence}]`
// exactly. Note this drops scannedFiles/skippedFiles (see the module
// header's "why two functions" note) — callers that need scan coverage
// (SKILL.md's zero-candidates report) go through `scanDeadCode` or the
// `FOCUS_GENERATORS` registry instead.
function candidatesDeadCode(rootDir, opts) {
  return scanDeadCode(rootDir, opts).candidates;
}

// The framework's focus-vertical registry (shared machinery this leaf
// introduces, per the parent design doc): focus value -> generator function
// returning the rich `{ candidates, scannedFiles, skippedFiles }` shape,
// so SKILL.md's zero-candidates report (IL-115) works uniformly regardless
// of which focus fired. Exactly one entry ships in this leaf — the other
// three verticals (test-hygiene, abstraction-police, experiment-cleanup)
// are separate leaves, blocked on this framework (see the spec's
// Non-Goals); each adds its own key here rather than inventing a second
// registry.
const FOCUS_GENERATORS = { 'dead-code': scanDeadCode };
```

Update `module.exports`:

```js
module.exports = {
  detectEntrypoints,
  extractPathLikeStrings,
  collectStrings,
  extractModuleExports,
  isReferenced,
  escapeRegExp,
  isFileOrphan,
  referencedFileSpecifiers,
  listTrackedSourceFiles,
  scanDeadCode,
  candidatesDeadCode,
  FOCUS_GENERATORS,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/code-health/tests/candidates-dead-code.test.js`
Expected: PASS (28 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/code-health/candidates-dead-code.js bin/lib/code-health/tests/candidates-dead-code.test.js
git commit -m "Wire up scanDeadCode/candidatesDeadCode orchestration + FOCUS_GENERATORS registry, AC1/AC2 fixture coverage — refs #271"
```

---

### Task 6: `skills/code-health/SKILL.md` Focus Mode section + `skills/code-health/focus-mode.md`

**Files:**
- Modify: `skills/code-health/SKILL.md`
- Create: `skills/code-health/focus-mode.md`

**Interfaces:**
- Consumes: `FOCUS_GENERATORS` and `candidatesDeadCode`/`scanDeadCode` from Task 5's `bin/lib/code-health/candidates-dead-code.js` (referenced by path in the `node -e` snippets — never actually executed by this task, since `focus-mode.md` is prose, not code); `getCriterion` from `bin/lib/code-health/criteria.js` (read-only, matches the spec's AC3 — no edit to that file).
- Produces: no new JS interfaces — this task is documentation only.

- [ ] **Step 1: Add the `focus=<vertical>` argument-hint token**

In `skills/code-health/SKILL.md`, edit the frontmatter:

```
Old:
argument-hint: "[--area <path>] [--budget <n>] [--min-risk low|medium|high] [--dry-run] [--root <dir>]"

New:
argument-hint: "[--area <path>] [focus=<vertical>] [--budget <n>] [--min-risk low|medium|high] [--dry-run] [--root <dir>]"
```

- [ ] **Step 2: Add the `focus=` bullet to `## Input`**

```
Old:
- `--area <path>` — manual override: scope the run to one specific area, bypassing `next-slice` rotation. Use for targeted re-inspection.
- `--dry-run` — emit the plan but write nothing (cache untouched, no issues filed). Use for the smoke check.

New:
- `--area <path>` — manual override: scope the run to one specific area, bypassing `next-slice` rotation. Use for targeted re-inspection.
- `focus=<vertical>` — candidate-driven scoping: bypass `next-slice` rotation entirely and instead run a deterministic candidate generator for the named vertical, judging its candidates with that vertical's pinned criterion instead of `criteriaForArea`'s area-type lookup. Mutually exclusive with `--area`. See "Focus Mode" below — full procedure in `focus-mode.md` in this skill's directory. `--budget`, `--min-risk`, `--dry-run`, and `--root` all still apply.
- `--dry-run` — emit the plan but write nothing (cache untouched, no issues filed). Use for the smoke check.
```

- [ ] **Step 3: Insert a new `## Focus Mode` section between `## Input` and `## Workflow`**

Insert immediately before the `## Workflow` heading:

```markdown
## Focus Mode

`focus=<vertical>` swaps ONLY the scoping strategy (Steps 1 and 3 below) and the criterion selection (Step 4): a deterministic generator produces a fixed set of candidate files/symbols repo-wide, instead of `next-slice` picking one directory-shaped slice per firing, and the focus pins its own criterion instead of `criteriaForArea`'s area-type lookup. Step 2 (gather open issues for dedup) and Steps 5 onward (JUDGE through SUMMARIZE) run completely unchanged — a focus firing is still judged holistically, still passes the verify gate, still gets fingerprinted, deduped, and filed exactly like a generalist run. A focus firing never touches the generalist rotation's cursor or content-hash state (both live in `bin/lib/code-health/scope.js`, which the focus-mode generator never imports) — it is cursor-neutral by design.

Read `focus-mode.md` in this skill's directory for the full procedure: candidate generation, the zero-candidates no-op contract, criterion pinning, and the unrecognized-focus fail-loud rule. The only shipped vertical today is `dead-code`; `focus-mode.md`'s registry lookup names every currently-known value — never hand-list them here, in `focus-mode.md`, or anywhere else (a list restated in two places drifts, IL-40).

## Workflow
```

(The trailing `## Workflow` line above is the existing heading — this step only inserts the new section text immediately before it.)

- [ ] **Step 4: Gate Step 1 (SCOPE) behind a focus-mode redirect**

```
Old:
**Step 1 — SCOPE: select the target slice.**

Unless `--area` was provided, call the engine to pick the next slice to judge:

New:
**Step 1 — SCOPE: select the target slice.**

If `focus=<vertical>` was provided, skip this step entirely — `focus-mode.md`'s own procedure replaces it, and hands off directly to Step 4's criterion pinning. Otherwise, unless `--area` was provided, call the engine to pick the next slice to judge:
```

- [ ] **Step 5: Gate Step 3 (READ THE SLICE) behind a focus-mode redirect**

```
Old:
**Step 3 — READ THE SLICE.**

Stamp a freshness marker before reading anything, so Step 7.5 can later detect whether the slice changed underneath this run — a concurrent fix pass, another parallel code-health sweep, or an ordinary human edit landing between this read and eventual filing:

New:
**Step 3 — READ THE SLICE.**

If `focus=<vertical>` was provided, skip this step entirely — `focus-mode.md`'s Step F3 reads every candidate file under this same 60 KB read-budget discipline, restated there rather than here. Otherwise, stamp a freshness marker before reading anything, so Step 7.5 can later detect whether the slice changed underneath this run — a concurrent fix pass, another parallel code-health sweep, or an ordinary human edit landing between this read and eventual filing:
```

- [ ] **Step 6: Gate Step 4 (CLASSIFY) behind a focus-mode redirect**

```
Old:
**Step 4 — CLASSIFY: detect area type + select criteria.**

Call the `classify` command to determine the area's type:

New:
**Step 4 — CLASSIFY: detect area type + select criteria.**

If `focus=<vertical>` was provided, skip this step entirely — the focus pins its own criterion (`focus-mode.md`'s Criterion pinning table), so there is no area to classify and no `criteriaForArea` call. Otherwise, call the engine to determine the area's type:
```

- [ ] **Step 7: Fix Step 10's slice-coverage report for the focus-mode case**

```
Old:
Also report the slice's read coverage, so the summary can never imply more coverage than the sweep had: the slice id, whether it was read recursively or own-files-only (Step 1's `recursive`), bytes read, and — if Step 3's read budget was reached — every **deferred** file with its size, under a `Deferred (read budget)` heading. When nothing was deferred, say so in one line rather than omitting the section; an absent section is indistinguishable from a forgotten one.

New:
Also report the slice's read coverage, so the summary can never imply more coverage than the sweep had: the slice id, whether it was read recursively or own-files-only (Step 1's `recursive`), bytes read, and — if Step 3's read budget was reached — every **deferred** file with its size, under a `Deferred (read budget)` heading. When nothing was deferred, say so in one line rather than omitting the section; an absent section is indistinguishable from a forgotten one. Under focus mode, there is no slice id or `recursive` flag — report `focus-mode.md`'s scanned-file and skipped-file counts instead (Step F2).
```

- [ ] **Step 8: Note focus-mode routines don't follow the one-slice-per-run shape**

```
Old:
**Headless run flow:** SCOPE(`next-slice`) → CLASSIFY → JUDGE → VERIFY GATE → FRESHNESS RE-CHECK → `validate-findings` → file issues (dropping any finding still flagged `possiblyStale`). Triage happens later in GitHub — the Routine does not wait for interactive input. The template's prompt omits `--area` so `next-slice` always picks the highest-priority slice automatically. Code-health's own `--budget` flag (default 1 slice per run) governs how deep each firing goes — raise it via a manual `/claude-tweaks:code-health --budget <n>` run if you want a one-off deeper sweep; the routine itself always uses the template's single-slice default, and token cost scales with whatever budget is in effect for that invocation.

New:
**Headless run flow:** SCOPE(`next-slice`) → CLASSIFY → JUDGE → VERIFY GATE → FRESHNESS RE-CHECK → `validate-findings` → file issues (dropping any finding still flagged `possiblyStale`). Triage happens later in GitHub — the Routine does not wait for interactive input. The template's prompt omits `--area` so `next-slice` always picks the highest-priority slice automatically. Code-health's own `--budget` flag (default 1 slice per run) governs how deep each firing goes — raise it via a manual `/claude-tweaks:code-health --budget <n>` run if you want a one-off deeper sweep; the routine itself always uses the template's single-slice default, and token cost scales with whatever budget is in effect for that invocation.

A focus-mode routine (`routine-template.yml`'s `focus` field, currently unset in every shipped template — see `skills/_shared/routine-template-schema.md`) does not follow this one-slice-per-run shape at all: it sweeps every candidate the generator finds, repo-wide, on every firing. See `focus-mode.md` for its own routine framing.
```

- [ ] **Step 9: Create `skills/code-health/focus-mode.md`**

```markdown
# Focus Mode — candidate-driven scoping

Referenced from `skills/code-health/SKILL.md`'s "Focus Mode" section. This file owns the full procedure for `focus=<vertical>` runs — the candidate-driven alternative to `next-slice` directory rotation. SKILL.md Step 2 (gather open issues) and Steps 5 (JUDGE) onward are unmodified and apply exactly as written once this procedure hands off a criterion and a set of already-read candidate files.

## Known values

The generator registry is the single source of truth for which `focus=` values are recognized — never hand-maintain a separate list here or in SKILL.md, since a list restated in two places drifts (IL-40):

```bash
node -e "const {FOCUS_GENERATORS}=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/code-health/candidates-dead-code.js'); console.log(Object.keys(FOCUS_GENERATORS).join(', '))"
```

If `$ARGUMENTS` names a `focus=` value not in that list, fail loud and stop — report the unrecognized value and the known values printed above. Do not guess or silently fall back to the generalist mode.

## Criterion pinning

Each focus pins exactly one criterion — no `classify`/`criteriaForArea` call, since focus-mode candidates are scattered across the whole repo rather than confined to one classified area:

| Focus | Criterion id | Fragment |
|---|---|---|
| `dead-code` | `dead-code` | none (`fragment: null` in `criteria.js` — judge from SKILL.md Step 5's guidance alone, same as any other `fragment: null` criterion) |

Look the pinned criterion up via `getCriterion` (`bin/lib/code-health/criteria.js`) rather than hand-copying its fields, exactly as SKILL.md Step 4 already does for the generalist path:

```bash
node -e "const {getCriterion}=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/code-health/criteria.js'); console.log(JSON.stringify(getCriterion('dead-code')))"
```

## F1 — Run the generator

```bash
node -e "
const { FOCUS_GENERATORS } = require('${CLAUDE_PLUGIN_ROOT}/bin/lib/code-health/candidates-dead-code.js');
const gen = FOCUS_GENERATORS['${FOCUS}'];
console.log(JSON.stringify(gen('${ROOT:-$PWD}')));
" > /tmp/code-health-focus-scan.json
```

Read `/tmp/code-health-focus-scan.json`. It is `{ candidates, scannedFiles, skippedFiles }` — always the rich shape, never the bare `candidatesDeadCode(rootDir, opts) → [...]` array (that narrower signature exists too, for direct unit testing, but this wiring always goes through the registry's richer generator function so scan coverage is always reportable, per the zero-candidates contract below).

## F2 — Zero candidates is a clean no-op, not an error

If `candidates` is an empty array, this firing is done. Do not treat it as a failure and do not retry. Report exactly:

```
focus=<vertical>: no candidates this firing (scanned: <scannedFiles> files, skipped: <skippedFiles.length>)
```

Write the run record via the same convention the generalist run already uses (Step 8's `validate-findings` with an empty findings array, `--slice "focus:<vertical>"`, so the run-log entry exists) and stop. Reporting both counts is what makes a genuinely clean tree distinguishable from a silent total skip (IL-115) — a `scannedFiles: 0` line is a signal something is wrong (non-git root, `git` unavailable), not evidence of a clean repo.

## F3 — Read candidate files

For every distinct `file` named across `candidates`, read it in full under SKILL.md Step 3's existing 60 KB read-budget discipline — the byte-tracking, the bounded-read fallback past budget, and the "never silently skip, report deferred" rule all apply unchanged. A focus-mode candidate set is typically far smaller than a directory slice, so hitting the budget here is the exception, not the rule — but the same discipline applies exactly the same way if it happens.

## F4 — Judge

Hand the judge: the criterion pinned above (with its fragment, if any, embedded per SKILL.md Step 4's existing convention), and the candidate list itself as the material to judge — each candidate's `file`, `symbol` (if present), `kind`, and `evidence` field is a starting pointer, not a finding. The judge still applies the criterion holistically (SKILL.md Step 5) and may reject a candidate outright — a candidate the judge rejects files nothing. Continue at SKILL.md Step 6 (EMIT FINDINGS) exactly as written; `areaId` for a focus-mode finding is the candidate's own `file` path (there is no directory-shaped area).

## F5 — Everything from Step 7 onward is unmodified

VERIFY GATE, FRESHNESS RE-CHECK, VALIDATE/FINGERPRINT/DEDUP, FILE/REOPEN, and SUMMARIZE all run exactly as SKILL.md documents them. Use `--slice "focus:<vertical>"` as the `SLICE_ID` for Step 8's `validate-findings` call — a stable, non-colliding cursor key distinct from every directory-shaped generalist slice id.

## Cursor neutrality

A focus firing never touches `next-slice`'s rotation cursor or content-hash state — those belong to the generalist path and are keyed by directory-shaped slice ids, never by `focus:<vertical>`. Nothing in this procedure calls `next-slice`, so there is nothing to accidentally advance.
```

- [ ] **Step 10: Run the tests that gate SKILL.md structure and the 40 KB budgets**

Run:
```bash
node --test bin/lib/code-health/tests/skill-md.test.js
node --test bin/lib/skill-audit/tests/context-cost.test.js
```
Expected: PASS. If `context-cost.test.js` fails with `code-health SKILL.md` or `code-health/focus-mode.md` over the 40 KB ceiling, trim `focus-mode.md`'s prose (it is already the extraction target — do not inline more of it back into SKILL.md).

Also measure directly, matching AC5's "measure before merging" instruction literally:
```bash
wc -c skills/code-health/SKILL.md skills/code-health/focus-mode.md
```
Expected: both well under 40960 bytes (SKILL.md started at 34564 bytes; this task's SKILL.md edits add roughly 2 KB of prose).

- [ ] **Step 11: Commit**

```bash
git add skills/code-health/SKILL.md skills/code-health/focus-mode.md
git commit -m "Add code-health focus mode: SKILL.md pointer section + focus-mode.md procedure — refs #271"
```

---

### Task 7: `routine-template.yml` focus-field documentation + AC4 byte-identity regression pin

**Files:**
- Modify: `skills/code-health/routine-template.yml`
- Modify: `tests/routine-template-schema.test.js`

**Interfaces:**
- Consumes: nothing new — `parseRoutineTemplate` (`bin/lib/routine-template-parser.js`) already parses any top-level `key: value` scalar generically; no parser change is needed for a new optional `focus` field.
- Produces: nothing new for other tasks to consume — `focus` stays unset in the shipped template in this leaf (the fleet leaf that actually instantiates per-vertical routines is later work, per the spec's Non-Goals).

- [ ] **Step 1: Write the failing test**

Append to `tests/routine-template-schema.test.js`, after the existing `for (const templatePath of findTemplates())` loops (end of file):

```js
// AC4: the parameterless (as-shipped) template's kickoff line must stay
// byte-identical — no `focus=` argument — so today's generalist routine
// keeps firing exactly as it does now once the `focus` field exists in the
// schema. This is a narrower, more precise pin than re-snapshotting the
// whole ~4 KB preamble (already covered by the canonical-preamble test
// above): what actually varies with focus's presence/absence is the
// kickoff line's argument, nothing else.
test('code-health/routine-template.yml: parameterless template has no focus field and its kickoff carries no focus= argument (AC4/IL-115 regression pin)', () => {
  const templatePath = path.join(SKILLS_DIR, 'code-health', 'routine-template.yml');
  const tpl = parseRoutineTemplate(fs.readFileSync(templatePath, 'utf8'));
  assert.equal(
    tpl.focus,
    undefined,
    'the shipped generalist template must not set focus — presence would change which routine this template instantiates',
  );
  const kickoffAt = tpl.prompt.lastIndexOf('Then: ');
  const kickoffLine = tpl.prompt.slice(kickoffAt).trim();
  assert.equal(
    kickoffLine,
    'Then: /claude-tweaks:code-health',
    "the parameterless template's kickoff must stay exactly this — no focus= suffix",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/routine-template-schema.test.js`
Expected: This specific new test actually PASSES immediately (the field is genuinely absent today and the kickoff line is already exactly `Then: /claude-tweaks:code-health`) — there is no code change this test is driving. Run it anyway to confirm the assertions are well-formed and the test file still parses/loads cleanly; a syntax typo in the appended block would otherwise surface only when the whole suite runs.

Run: `node --test tests/routine-template-schema.test.js 2>&1 | tail -20`
Expected: all tests pass, including the new one.

- [ ] **Step 3: Document the `focus` convention in the template file (no behavior change)**

Add a comment near the top of `skills/code-health/routine-template.yml`, immediately after the existing `branch:` comment line (`# Optional: \`branch: <name>\` pins the prompt's {{TARGET_BRANCH}}. ...`):

```
Old:
# Optional: `branch: <name>` pins the prompt's {{TARGET_BRANCH}}. Normally unset here — a
# branch is project-specific, so /claude-tweaks:routine resolves it at instantiation.
model: claude-sonnet-5

New:
# Optional: `branch: <name>` pins the prompt's {{TARGET_BRANCH}}. Normally unset here — a
# branch is project-specific, so /claude-tweaks:routine resolves it at instantiation.
# Optional: `focus: <vertical>` (e.g. `dead-code`) appends `focus=<vertical>` to this
# template's kickoff line when a future per-vertical routine is instantiated from this
# same generalist template — see skills/_shared/routine-template-schema.md's Template
# field table and skills/code-health/focus-mode.md. Unset here: this shipped copy stays
# the generalist routine; instantiating one routine per vertical is later fleet work.
model: claude-sonnet-5
```

- [ ] **Step 4: Run tests to verify everything still passes**

Run: `node --test tests/routine-template-schema.test.js`
Expected: PASS (all tests, including the schema-conformance and canonical-preamble tests for every template — the comment addition doesn't touch any parsed field, since YAML comments aren't part of any scalar value).

- [ ] **Step 5: Commit**

```bash
git add skills/code-health/routine-template.yml tests/routine-template-schema.test.js
git commit -m "Document the routine-template focus field convention + pin the parameterless kickoff line — refs #271"
```

---

### Task 8: `routine-template-schema.md` field docs + final AC3 verification + full suite

**Files:**
- Modify: `skills/_shared/routine-template-schema.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — documentation only, plus this plan's final verification steps.

- [ ] **Step 1: Add the `focus` row to the Template field table**

```
Old:
| `branch` | string | no | An explicit target branch for the preamble's `{{TARGET_BRANCH}}` placeholder. **Normally unset in a plugin-shipped template** — which branch a routine should audit is a property of the project, not of the plugin, so `/claude-tweaks:routine` resolves it per project (CREATE Step 5.5's precedence list) and this field is only the pin that outranks everything below an explicit `--branch`. Set it only in a template vendored alongside exactly one project. Unset *and* unresolvable → the placeholder falls back to the pre-`branch` wording, preserving the behavior every template had before this field existed. |
| `model` | string | yes | Default model for the routine's session (e.g. `claude-sonnet-5`). |

New:
| `branch` | string | no | An explicit target branch for the preamble's `{{TARGET_BRANCH}}` placeholder. **Normally unset in a plugin-shipped template** — which branch a routine should audit is a property of the project, not of the plugin, so `/claude-tweaks:routine` resolves it per project (CREATE Step 5.5's precedence list) and this field is only the pin that outranks everything below an explicit `--branch`. Set it only in a template vendored alongside exactly one project. Unset *and* unresolvable → the placeholder falls back to the pre-`branch` wording, preserving the behavior every template had before this field existed. |
| `focus` | string | no | Names a focus vertical (e.g. `dead-code`) this instantiated routine should scope to, via the target skill's `focus=<vertical>` grammar (see `skills/code-health/focus-mode.md`). When set, instantiation appends `focus=<value>` to the template's kickoff line, producing `Then: /claude-tweaks:{skill} focus=<value>` instead of the bare kickoff. **Unset in every plugin-shipped template today** — the fleet mechanism that instantiates one routine per vertical from a single template is later work (blocked on this framework, per the parent design doc's fleet leaves); until then this field exists in the schema so a later leaf has somewhere to write it, but no shipped template sets it. |
| `model` | string | yes | Default model for the routine's session (e.g. `claude-sonnet-5`). |
```

- [ ] **Step 2: Run the schema doc's own tests**

Run: `node --test tests/routine-template-schema.test.js`
Expected: PASS — the `FORBIDDEN_KEYS` list doesn't include `focus` (it's portable, not account-specific, same status as `branch`), so no test needs updating for this doc-only change.

- [ ] **Step 3: Final AC3 verification — `criteria.js` untouched**

Run: `git diff --stat -- bin/lib/code-health/criteria.js`
Expected: empty output (no changes on this branch to that file at all).

- [ ] **Step 4: Run the full suite**

Run: `npm test 2>&1 | tail -60`
Expected: all suites pass, including:
- `bin/lib/code-health/tests/candidates-dead-code.test.js` (new, from Tasks 1-5)
- `bin/lib/code-health/tests/skill-md.test.js` (unchanged by this leaf's edits — still passes)
- `bin/lib/skill-audit/tests/context-cost.test.js` (SKILL.md and `focus-mode.md` both under the 40 KB ceiling)
- `tests/routine-template-schema.test.js` (new AC4 test + all existing template-conformance tests)

No `package.json` edit is needed for the new test file — `bin/lib/code-health/tests/*.test.js` is already in `scripts.test`'s glob.

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/routine-template-schema.md
git commit -m "Document the focus field in the routine-template schema — refs #271"
```

---

## Self-Review

**Spec coverage** — every Deliverable and every Acceptance Criterion (including the out-of-numeric-order AC5/AC6) is implemented or verified:

- Deliverable "SKILL.md focus mode section" → Task 6 (SKILL.md edits + `focus-mode.md`), including the zero-candidates no-op contract with scanned/skipped counts (IL-115), pinned criterion selection, and the fail-loud unrecognized-focus rule reading `FOCUS_GENERATORS`.
- Deliverable "`candidates-dead-code.js` generator" → Tasks 1-5, including the module-header + SKILL.md coverage statement (IL-110), the multi-line `module.exports = { a,\n b,\n }` shape (Task 2), the four-part entrypoint convention including the `bin/lib/hooks/*.js` implicit carve-out (Task 1), and the stated name-collision policy (Task 3's header comment + explicit test).
- Deliverable "`candidates-dead-code.test.js`" → Tasks 1-5 (all in one file per the spec's Key Files list), covering: unreferenced export detected, referenced export not flagged, dynamic-require/re-export out-of-scope cases (flagged nothing, asserted), entrypoint files never flagged, gitignored files never flagged.
- Deliverable "`routine-template.yml` focus parameterization, generalist unchanged when absent" → Task 7.
- Deliverable "candidates are input to judgment, not findings" → Task 6's F4 in `focus-mode.md` ("a candidate the judge rejects files nothing").
- AC1 (exact candidate set on the known fixture) → Task 5's `buildAc1Fixture` test.
- AC2 (dynamic patterns, no candidate, no crash) → Task 5's two AC2 tests, plus Task 2's extraction-level spread/unterminated-block tests.
- AC3 (`criteria.js` untouched) → verified in Task 8 Step 3 (no task in this plan ever modifies that file).
- AC4 (byte-identical parameterless prompt, regression-pinned in `tests/routine-template-schema.test.js`, plus the schema doc's field entry) → Task 7 (test) + Task 8 (doc).
- AC5 (40 KB budget, measured before merging, extracted if needed) → Task 6 Step 10 (`context-cost.test.js` + `wc -c`), satisfied by construction since `focus-mode.md` is extracted from the start rather than inlined-then-extracted (IL-72).
- AC6 (AC1's fixture kept unambiguous, no re-export/dynamic-require proximity) → Task 5's `buildAc1Fixture` deliberately contains none of AC2's patterns; AC2's dynamic/barrel cases live in their own separate fixture-building code in the same test.

**Placeholder scan** — no "TBD", no "similar to Task N" hand-waving; every task's Step 3 is complete, real code or complete, real prose. No task references a function/type not defined by an earlier task (verified below).

**Type consistency across tasks:**
- `detectEntrypoints(rootDir, files) → Set<string>` — defined Task 1, consumed unchanged by Task 5.
- `extractModuleExports(text) → [{symbol, startLine, endLine}]` — defined Task 2, consumed unchanged by Task 5 (and its shape matches what Task 3's tests pass as `declRange`).
- `isReferenced(symbol, declFile, declRange, allFiles, contentsByFile) → boolean` — defined Task 3, consumed unchanged by Task 5.
- `isFileOrphan(relFile, allFiles, contentsByFile) → boolean` — defined Task 4, consumed unchanged by Task 5.
- `scanDeadCode(rootDir, opts) → {candidates, scannedFiles, skippedFiles}` and `candidatesDeadCode(rootDir, opts) → [...]` — defined Task 5, consumed unchanged (by reference, via `node -e`) in Task 6's `focus-mode.md`, and by Task 5's own `FOCUS_GENERATORS` registry.
- `FOCUS_GENERATORS → {'dead-code': scanDeadCode}` — defined Task 5, consumed unchanged in Task 6's `focus-mode.md` Known-values and F1 snippets.

No issues found requiring inline fixes.
