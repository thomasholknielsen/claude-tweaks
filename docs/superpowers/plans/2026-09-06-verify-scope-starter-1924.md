# Verify-Scope Starter and This Repo's Declaration (#1924) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/claude-tweaks:init` generates a starter `.claude-tweaks/verify-scope.json` from the workspace it can detect (packages → suites, shared packages → every suite, pipeline bookkeeping → nothing), `init --update` reports suite/workspace drift, and this repo declares its own file so its ledger rows and run-dir files resolve to `none` while `plugin/**` and `tests/**` stay fully verified.

**Architecture:** One new module `plugin/bin/lib/init/verify-scope-starter.js` (pure, `fsImpl`-injectable: `detectWorkspace`, `composeStarter`, `diffAgainstWorkspace`) behind a thin CLI `plugin/bin/init-verify-scope.js` (`--root`, `--write` create-if-absent, `--json`); a new bootstrap sub-file `step-06-6-verify-scope.md` following `step-06-5-port-isolation.md`'s detect → propose → report-only pattern; one drift row in `update-mode.md`; this repo's declaration as a tracked file pinned by a test. `readDeclaration` (#1922) must first accept a declaration with no `checks.tests` — the spec assumed it already did; it does not.

**Tech Stack:** Node 18+ built-ins; `node --test`; no YAML dependency (`pnpm-workspace.yaml`'s `packages:` list is parsed by line regex, the `policy.yml` posture).

**Spec:** `.claude-tweaks/pipelines/2026-09-05T193518-spec-1921-1922-1923-1924-1925-1926-1930-1932-1931-1792-1927-1928-1929/spec-1924/work/1924-spec.md` (materialized from GitHub issue #1924)

## Global Constraints

- Byte ceilings measured now: `plugin/skills/init/SKILL.md` 39,226 B (1,734 B headroom) — the Step 6.6 entry is net-zero (trim Step 6.5's entry to pay for it); `plugin/skills/init/update-mode.md` 39,444 B (1,516 B headroom) — the drift row stays under 600 B total; `claude-md-template.md` 17,867 B has room.
- `--write` never overwrites: create-if-absent only; the declaration is project-owned.
- The starter never maps a source path to `[]`; only the four bookkeeping paths get the no-suite rule (`docs/plans/*-ledger.md`, `.claude-tweaks/pipelines/**`, `docs/superpowers/plans/**`, `docs/superpowers/specs/**`).
- "Shared" = a package another workspace package lists under `dependencies` (not dev/peer), one hop. A shared package's own rule is `suites: "*"` even when it has its own test script. A package with no `test` script gets no per-package rule unless shared.
- Suite command templates: pnpm `pnpm --filter {name} test`; yarn (`yarn.lock` present) `yarn workspace {name} test`; npm `npm test -w {path}`. `--filter` uses the package `name` from its `package.json`.
- Every `.md` under `plugin/skills/**` must stay under 40,960 B; `init/SKILL.md` and `update-mode.md` are the two near the ceiling.
- Commits use `refs #1924` (never `closes`/`fixes`) and end with `Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB`.
- Worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony`, branch `worktree-design-1904-pipeline-ceremony`; anchor every git/test command. Never `git stash`/`checkout --`/`reset`. Test fixtures live in temp dirs, never this checkout; any `node -e` fixture command is single-quoted with JS strings double-quoted inside.

---

### Task 1: `readDeclaration` accepts a declaration with no `checks.tests`

**Files:**
- Modify: `plugin/bin/lib/verify/declaration.js` (the `checks.tests` branch, lines 49-63)
- Test: `tests/bin-lib/verify/declaration.test.js`

**Interfaces:**
- Produces: `readDeclaration` on `{ checks: {}, rules: [...] }` or `{ checks: { lint: 'x' }, rules: [...] }` → `{ ok: true, decl }` with `decl.checks.tests = null`, `decl.suites = []`, `decl.toolScoped = false`. A `checks.tests` that is present but empty/wrong-typed stays an error (existing messages). With no suites, a rule's `suites` may only be `"*"` or `[]` (any named suite is still "unknown suite").

- [ ] **Step 1: Failing test** — append to `tests/bin-lib/verify/declaration.test.js`:

```js
test('a declaration with no checks.tests is valid — bookkeeping-only rules, zero suites (#1924)', () => {
  const r = readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: { lint: 'eslint .' }, rules: [{ match: 'docs/plans/*-ledger.md', suites: [], static: false }, { match: 'src/**', suites: '*', static: true }] }) }));
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
  assert.strictEqual(r.decl.checks.tests, null);
  assert.deepStrictEqual(r.decl.suites, []);
  assert.strictEqual(r.decl.toolScoped, false);
  const named = readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: {}, rules: [{ match: 'src/**', suites: ['api'], static: true }] }) }));
  assert.strictEqual(named.ok, false);
  assert.match(named.errors.join('\n'), /rules\[0\].*api/);
  const empty = readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: { tests: '' }, rules: [] }) }));
  assert.strictEqual(empty.ok, false);
});
```

- [ ] **Step 2: Probe** — `node -e 'const {readDeclaration}=require("/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/bin/lib/verify/declaration.js"); const r=readDeclaration("/d.json",{readFileSync:()=>JSON.stringify({checks:{},rules:[]})}); if(r.ok){console.error("already accepts absent checks.tests");process.exit(1)} console.log(r.errors)'` — Expected: prints the `checks.tests: required` error (exit 0 = the current behavior rejects it).

- [ ] **Step 3: Implement** — in the `checks` branch: `if (checks.tests === undefined) { tests = null; suites = []; }` before the existing string/map branches, and keep the `else` error for a present-but-invalid value. Update the header comment ("a declaration with no `checks.tests` declares zero suites — valid, its rules may only use `'*'` or `[]`"). Nothing else changes (`scope.js` already handles `decl.suites = []`: a `'*'` rule yields `suites: []` → `static-only`/`none`, unmatched → `full`).

- [ ] **Step 4: Run** `node --test "<worktree>/tests/bin-lib/verify/declaration.test.js" "<worktree>/tests/bin-lib/verify/scope.test.js" "<worktree>/tests/bin-lib/verify/cli.test.js"` — PASS.

- [ ] **Step 5: Commit** — `Accept a verify-scope declaration with no checks.tests — zero suites, bookkeeping-only rules (refs #1924)`.

---

### Task 2: `plugin/bin/lib/init/verify-scope-starter.js`

**Files:**
- Create: `plugin/bin/lib/init/verify-scope-starter.js`
- Test: `tests/bin-lib/init/verify-scope-starter.test.js` (new dir; picked up by the recursive glob)

**Interfaces:**
- `detectWorkspace({ root, fsImpl = fs })` → `{ tool: 'pnpm'|'yarn'|'npm'|null, packages: [{ name, path, hasTest, dependencies: [names] }] }`. Order: `pnpm-workspace.yaml` present → `tool: 'pnpm'`, globs from its `packages:` list (lines matching `^\s*-\s*['"]?([^'"#]+?)['"]?\s*$` after the `packages:` line until the next top-level key); else `package.json` `workspaces` (array, or `{ packages: [...] }`) → `tool: 'yarn'` when `yarn.lock` exists, else `'npm'`; else `{ tool: null, packages: [] }`. Glob support: a literal dir (`packages/shared`) and one trailing `/*` (`apps/*` → each direct child dir holding a `package.json`); anything else is ignored. `path` is root-relative with forward slashes; `hasTest` = the package's `scripts.test` is a non-empty string; `dependencies` = `Object.keys(pkg.dependencies || {})`.
- `composeStarter({ workspace, rootScripts = {}, bookkeeping = BOOKKEEPING_RULES })` → the declaration object. Multi-package (`workspace.packages.length > 0`): `checks.tests` = map `{ [name]: template }` over packages with `hasTest` (omit `checks.tests` entirely when none has one); `checks.types`/`checks.lint` from `rootScripts.typecheck`/`rootScripts.lint` when present; `rules` = for each package, shared (its `name` appears in another package's `dependencies`) → `{ match: '{path}/**', suites: '*', static: true }`, else with `hasTest` → `{ match: '{path}/**', suites: [name], static: true }`, else no rule; then the four bookkeeping rules `{ match, suites: [], static: false }`. Single package (`packages.length === 0`): `checks.tests = rootScripts.test` when non-empty (else omitted), `types`/`lint` as above, rules = bookkeeping only. Export `BOOKKEEPING_RULES` (the four `match` globs in that order).
- `diffAgainstWorkspace(decl, workspace)` → `{ missingSuites: [package names with hasTest and no suite of that name], extraSuites: [decl suites not matching any workspace package name] }` — `decl` is `readDeclaration`'s normalized shape; a string-form `checks.tests` (suite `tests`) on a workspace with packages reports every test-bearing package as missing and `tests` as extra only when packages exist.

- [ ] **Step 1: Failing tests** — create `tests/bin-lib/init/verify-scope-starter.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const M = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'init', 'verify-scope-starter.js');
const { detectWorkspace, composeStarter, diffAgainstWorkspace, BOOKKEEPING_RULES } = require(M);
const { readDeclaration } = require(path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'verify', 'declaration.js'));

// An in-memory fs keyed by absolute path; directories are listed from the file map.
function memFs(files) {
  const has = (p) => Object.prototype.hasOwnProperty.call(files, p);
  return {
    readFileSync: (p) => { if (!has(p)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; } return files[p]; },
    existsSync: (p) => has(p) || Object.keys(files).some((f) => f.startsWith(`${p}/`)),
    readdirSync: (p, opts) => {
      const names = new Set();
      for (const f of Object.keys(files)) if (f.startsWith(`${p}/`)) names.add(f.slice(p.length + 1).split('/')[0]);
      return [...names].map((name) => (opts && opts.withFileTypes ? { name, isDirectory: () => Object.keys(files).some((f) => f.startsWith(`${p}/${name}/`)) } : name));
    },
  };
}

const PNPM = {
  '/w/pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - packages/shared\n",
  '/w/package.json': JSON.stringify({ name: 'root', scripts: { typecheck: 'tsc -b', lint: 'eslint .' } }),
  '/w/apps/api/package.json': JSON.stringify({ name: 'api', scripts: { test: 'vitest run' }, dependencies: { shared: 'workspace:*' } }),
  '/w/apps/web/package.json': JSON.stringify({ name: 'web', scripts: { test: 'vitest run' }, dependencies: { shared: 'workspace:*' } }),
  '/w/packages/shared/package.json': JSON.stringify({ name: 'shared', scripts: { test: 'vitest run' } }),
};

test('detectWorkspace reads pnpm-workspace.yaml globs, package names, test scripts, and dependencies', () => {
  const ws = detectWorkspace({ root: '/w', fsImpl: memFs(PNPM) });
  assert.strictEqual(ws.tool, 'pnpm');
  assert.deepStrictEqual(ws.packages.map((p) => [p.name, p.path, p.hasTest, p.dependencies]), [
    ['api', 'apps/api', true, ['shared']], ['web', 'apps/web', true, ['shared']], ['shared', 'packages/shared', true, []],
  ]);
});

test('composeStarter on the pnpm fixture: suites api+web(+shared), shared → "*", per-package rules, four bookkeeping rules, and it passes readDeclaration (AC1)', () => {
  const ws = detectWorkspace({ root: '/w', fsImpl: memFs(PNPM) });
  const decl = composeStarter({ workspace: ws, rootScripts: { typecheck: 'tsc -b', lint: 'eslint .' } });
  assert.deepStrictEqual(decl.checks, { types: 'tsc -b', lint: 'eslint .', tests: { api: 'pnpm --filter api test', web: 'pnpm --filter web test', shared: 'pnpm --filter shared test' } });
  assert.deepStrictEqual(decl.rules.slice(0, 3), [
    { match: 'apps/api/**', suites: ['api'], static: true },
    { match: 'apps/web/**', suites: ['web'], static: true },
    { match: 'packages/shared/**', suites: '*', static: true },
  ]);
  assert.deepStrictEqual(decl.rules.slice(3).map((r) => r.match), BOOKKEEPING_RULES);
  for (const r of decl.rules.slice(3)) assert.deepStrictEqual([r.suites, r.static], [[], false]);
  const parsed = readDeclaration('/x.json', { readFileSync: () => JSON.stringify(decl) });
  assert.strictEqual(parsed.ok, true, JSON.stringify(parsed.errors));
});

test('npm and yarn workspaces are told apart by the lockfile and use their own suite templates', () => {
  const base = {
    '/w/package.json': JSON.stringify({ name: 'root', workspaces: ['apps/*'] }),
    '/w/apps/api/package.json': JSON.stringify({ name: 'api', scripts: { test: 'jest' } }),
  };
  const npm = composeStarter({ workspace: detectWorkspace({ root: '/w', fsImpl: memFs({ ...base, '/w/package-lock.json': '{}' }) }) });
  assert.deepStrictEqual(npm.checks.tests, { api: 'npm test -w apps/api' });
  const yarn = composeStarter({ workspace: detectWorkspace({ root: '/w', fsImpl: memFs({ ...base, '/w/yarn.lock': '' }) }) });
  assert.deepStrictEqual(yarn.checks.tests, { api: 'yarn workspace api test' });
  const bare = detectWorkspace({ root: '/w', fsImpl: memFs(base) });
  assert.strictEqual(bare.tool, 'npm');
});

test('a package with no test script gets no rule unless it is shared; no test scripts at all → checks.tests omitted', () => {
  const files = {
    '/w/package.json': JSON.stringify({ name: 'root', workspaces: ['apps/*', 'packages/*'] }),
    '/w/apps/api/package.json': JSON.stringify({ name: 'api', scripts: { test: 'jest' }, dependencies: { util: '*' } }),
    '/w/apps/docs/package.json': JSON.stringify({ name: 'docs', scripts: { build: 'x' } }),
    '/w/packages/util/package.json': JSON.stringify({ name: 'util', scripts: { build: 'x' } }),
  };
  const decl = composeStarter({ workspace: detectWorkspace({ root: '/w', fsImpl: memFs(files) }) });
  assert.deepStrictEqual(decl.rules.filter((r) => r.suites !== undefined && r.static === true).map((r) => [r.match, r.suites]), [['apps/api/**', ['api']], ['packages/util/**', '*']]);
  const none = composeStarter({ workspace: detectWorkspace({ root: '/w', fsImpl: memFs({ '/w/package.json': JSON.stringify({ name: 'root', workspaces: ['apps/*'] }), '/w/apps/docs/package.json': JSON.stringify({ name: 'docs' }) }) }) });
  assert.ok(!('tests' in none.checks));
  assert.deepStrictEqual(none.rules.map((r) => r.match), BOOKKEEPING_RULES);
  assert.strictEqual(readDeclaration('/x.json', { readFileSync: () => JSON.stringify(none) }).ok, true);
});

test('single-package repo: root test/lint scripts, no types, bookkeeping rules only (AC2)', () => {
  const ws = detectWorkspace({ root: '/w', fsImpl: memFs({ '/w/package.json': JSON.stringify({ name: 'one', scripts: { test: 'vitest run', lint: 'eslint .' } }) }) });
  assert.deepStrictEqual(ws, { tool: null, packages: [] });
  const decl = composeStarter({ workspace: ws, rootScripts: { test: 'vitest run', lint: 'eslint .' } });
  assert.deepStrictEqual(decl.checks, { lint: 'eslint .', tests: 'vitest run' });
  assert.deepStrictEqual(decl.rules.map((r) => r.match), BOOKKEEPING_RULES);
  assert.strictEqual(readDeclaration('/x.json', { readFileSync: () => JSON.stringify(decl) }).ok, true);
});

test('diffAgainstWorkspace reports extra declared suites and test-bearing packages without a suite (AC4)', () => {
  const ws = detectWorkspace({ root: '/w', fsImpl: memFs(PNPM) });
  const decl = readDeclaration('/x.json', { readFileSync: () => JSON.stringify({ checks: { tests: { api: 'a', legacy: 'l' } }, rules: [] }) }).decl;
  assert.deepStrictEqual(diffAgainstWorkspace(decl, ws), { missingSuites: ['web', 'shared'], extraSuites: ['legacy'] });
  const clean = readDeclaration('/x.json', { readFileSync: () => JSON.stringify(composeStarter({ workspace: ws })) }).decl;
  assert.deepStrictEqual(diffAgainstWorkspace(clean, ws), { missingSuites: [], extraSuites: [] });
});

test('BOOKKEEPING_RULES is the four pipeline-owned globs in order', () => {
  assert.deepStrictEqual(BOOKKEEPING_RULES, ['docs/plans/*-ledger.md', '.claude-tweaks/pipelines/**', 'docs/superpowers/plans/**', 'docs/superpowers/specs/**']);
});
```

- [ ] **Step 2: Probe** — `node -e 'require("/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/bin/lib/init/verify-scope-starter.js")'` — Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Write the module** — `plugin/bin/lib/init/verify-scope-starter.js`:

```js
// plugin/bin/lib/init/verify-scope-starter.js — /claude-tweaks:init's starter
// .claude-tweaks/verify-scope.json (#1924): detect the workspace, propose one
// suite per test-bearing package, map shared packages to every suite and the
// pipeline's own bookkeeping paths to nothing, and report suite/workspace
// drift for `init --update`. Conservative by construction — a path is its
// package's own tree, shared, bookkeeping, or unmatched (which the engine
// fails closed to full; scope.js). Pure: every fs read goes through fsImpl.
'use strict';

const fs = require('fs');
const path = require('path');

// The pipeline-owned paths no suite reads (ledger rows, run dirs, consumed
// plans and design docs). Always emitted; never a source path.
const BOOKKEEPING_RULES = [
  'docs/plans/*-ledger.md',
  '.claude-tweaks/pipelines/**',
  'docs/superpowers/plans/**',
  'docs/superpowers/specs/**',
];

function readJson(fsImpl, file) {
  try { return JSON.parse(fsImpl.readFileSync(file, 'utf8')); } catch { return null; }
}

function exists(fsImpl, file) {
  try { return fsImpl.existsSync(file); } catch { return false; }
}

// pnpm-workspace.yaml is a two-key file; read the `packages:` list with a line
// regex (the policy.yml posture) rather than a YAML dependency.
function pnpmGlobs(text) {
  const globs = [];
  let inList = false;
  for (const line of text.split('\n')) {
    if (/^packages:\s*$/.test(line)) { inList = true; continue; }
    if (inList && /^\S/.test(line)) break;
    const m = inList && line.match(/^\s*-\s*['"]?([^'"#]+?)['"]?\s*$/);
    if (m) globs.push(m[1].trim());
  }
  return globs;
}

// A literal dir, or one trailing `/*` expanded to its direct children that
// hold a package.json. Anything else is ignored — the starter proposes, it
// never guesses.
function expandGlob(fsImpl, root, glob) {
  const clean = glob.replace(/\/+$/, '');
  if (clean.endsWith('/*')) {
    const parent = clean.slice(0, -2);
    let entries;
    try { entries = fsImpl.readdirSync(path.join(root, parent), { withFileTypes: true }); } catch { return []; }
    return entries.filter((e) => e.isDirectory()).map((e) => `${parent}/${e.name}`);
  }
  if (clean.includes('*')) return [];
  return [clean];
}

function detectWorkspace({ root, fsImpl = fs }) {
  let tool = null;
  let globs = [];
  const pnpmFile = path.join(root, 'pnpm-workspace.yaml');
  if (exists(fsImpl, pnpmFile)) {
    tool = 'pnpm';
    globs = pnpmGlobs(String(fsImpl.readFileSync(pnpmFile, 'utf8')));
  } else {
    const rootPkg = readJson(fsImpl, path.join(root, 'package.json'));
    const ws = rootPkg && rootPkg.workspaces;
    const list = Array.isArray(ws) ? ws : (ws && Array.isArray(ws.packages) ? ws.packages : null);
    if (list) {
      tool = exists(fsImpl, path.join(root, 'yarn.lock')) ? 'yarn' : 'npm';
      globs = list;
    }
  }
  const packages = [];
  for (const glob of globs) {
    for (const rel of expandGlob(fsImpl, root, glob)) {
      const pkg = readJson(fsImpl, path.join(root, rel, 'package.json'));
      if (!pkg || typeof pkg.name !== 'string') continue;
      const test = pkg.scripts && pkg.scripts.test;
      packages.push({
        name: pkg.name,
        path: rel.replace(/\\/g, '/'),
        hasTest: typeof test === 'string' && test.trim() !== '',
        dependencies: Object.keys(pkg.dependencies || {}),
      });
    }
  }
  return { tool, packages };
}

function suiteCommand(tool, pkg) {
  if (tool === 'yarn') return `yarn workspace ${pkg.name} test`;
  if (tool === 'npm') return `npm test -w ${pkg.path}`;
  return `pnpm --filter ${pkg.name} test`;
}

function composeStarter({ workspace, rootScripts = {}, bookkeeping = BOOKKEEPING_RULES }) {
  const checks = {};
  const script = (k) => (typeof rootScripts[k] === 'string' && rootScripts[k].trim() !== '' ? rootScripts[k] : null);
  if (script('typecheck')) checks.types = script('typecheck');
  if (script('lint')) checks.lint = script('lint');
  const rules = [];
  const packages = workspace && Array.isArray(workspace.packages) ? workspace.packages : [];
  if (packages.length > 0) {
    const tested = packages.filter((p) => p.hasTest);
    if (tested.length) checks.tests = Object.fromEntries(tested.map((p) => [p.name, suiteCommand(workspace.tool, p)]));
    const dependedOn = new Set(packages.flatMap((p) => p.dependencies));
    for (const p of packages) {
      if (dependedOn.has(p.name)) rules.push({ match: `${p.path}/**`, suites: '*', static: true });
      else if (p.hasTest) rules.push({ match: `${p.path}/**`, suites: [p.name], static: true });
    }
  } else if (script('test')) {
    checks.tests = script('test');
  }
  for (const match of bookkeeping) rules.push({ match, suites: [], static: false });
  return { checks, rules };
}

// decl is readDeclaration's normalized shape (decl.suites). A string-form
// checks.tests declares the single suite `tests`, which matches no package.
function diffAgainstWorkspace(decl, workspace) {
  const packages = workspace && Array.isArray(workspace.packages) ? workspace.packages : [];
  const names = new Set(packages.map((p) => p.name));
  const suites = new Set(decl && Array.isArray(decl.suites) ? decl.suites : []);
  const missingSuites = packages.filter((p) => p.hasTest && !suites.has(p.name)).map((p) => p.name);
  const extraSuites = [...suites].filter((s) => !names.has(s) && packages.length > 0);
  return { missingSuites, extraSuites };
}

module.exports = {
  detectWorkspace, composeStarter, diffAgainstWorkspace, BOOKKEEPING_RULES,
};
```

- [ ] **Step 4: Run** `node --test "<worktree>/tests/bin-lib/init/verify-scope-starter.test.js"` — PASS. If the `memFs` `existsSync`/`readdirSync` shims and the module disagree on a detail, fix the shim (it is the fake) unless the module violates an Interface above.

- [ ] **Step 5: Mutation probe** — make `composeStarter` emit a shared package's own suite instead of `'*'`; AC1's test goes red; restore.

- [ ] **Step 6: Commit** — `Add verify-scope starter module — workspace detection, starter composition, drift diff (refs #1924)`.

---

### Task 3: `plugin/bin/init-verify-scope.js` CLI

**Files:**
- Create: `plugin/bin/init-verify-scope.js`
- Test: `tests/bin-lib/init/init-verify-scope-cli.test.js`
- Modify: `docs/plugin-structure.md` (new `plugin/bin/lib/init/` row beside the other `plugin/bin/lib/*/` rows, line ~20-31; new CLI row beside `wrap-up-state.js`, line ~116)

**Interfaces:**
- `node plugin/bin/init-verify-scope.js --root <dir> [--write] [--json]`. Resolves `rootScripts` from `{root}/package.json` `scripts`, `workspace` via `detectWorkspace`, `decl` via `composeStarter`. Output: without `--json`, a human block — `Proposed .claude-tweaks/verify-scope.json:` then the JSON pretty-printed (2 spaces), then one status line `exists: {path} (left unchanged)` / `written: {path}` / `not written (pass --write)`; with `--json`, one line `{ "declaration": {...}, "written": true|false, "existed": true|false, "path": "<abs>" }`. `--write` creates `{root}/.claude-tweaks/` (recursive) and the file (JSON + trailing newline) only when absent; when present it never touches the file and exits 0. Malformed invocation (unknown flag, missing `--root` value, `--root` not a directory) → usage on stderr, exit 2. Nothing detected (no workspace, no root `test` script) still exits 0 with the bookkeeping-only starter — the sub-file decides whether to offer it.

- [ ] **Step 1: Failing tests** — create `tests/bin-lib/init/init-verify-scope-cli.test.js`: spawn the CLI (`execFileSync(process.execPath, [CLI, ...args])`, catch non-zero) against temp dirs: (a) a temp single-package root (`package.json` with `scripts.test`) → `--json` output has `written: false`, `existed: false`, `declaration.checks.tests` equal to the script; (b) `--write` creates the file with `readDeclaration`-valid content; a second `--write` exits 0, prints `exists:`/`existed: true`, and the file's `mtimeMs` is unchanged (AC3) — write the file, record `statSync().mtimeMs`, wait `20ms`, re-run, compare; (c) `--root /nonexistent` → exit 2 with `usage:` on stderr; (d) an unknown flag → exit 2.

- [ ] **Step 2: Probe** — `node "<worktree>/plugin/bin/init-verify-scope.js" --root .` — Expected: FAIL, `Cannot find module`.

- [ ] **Step 3: Write the CLI** — `#!/usr/bin/env node`, `'use strict'`, a `parseArgs(argv)` → `{ root, write, json }` throwing `UsageError`, `main()` setting `process.exitCode` (never `process.exit`; the `gh-api-module-pattern` CLI wrapper contract: exit 0 success, 2 malformed invocation; header comment states the vocabulary and that the CLI shells out to nothing). Add the `--- MODULE` docs row: `plugin/bin/lib/init/            → verify-scope-starter.js (#1924 — detectWorkspace: pnpm-workspace.yaml globs or package.json workspaces, tool by lockfile; composeStarter: one suite per test-bearing package, shared packages → "*", the four pipeline bookkeeping globs → []; diffAgainstWorkspace for init --update). Consumed by plugin/bin/init-verify-scope.js and /claude-tweaks:init Step 6.6` and the CLI row: `node plugin/bin/init-verify-scope.js --root <dir> [--write] [--json]   # Verify-scope starter CLI (#1924) — prints the proposed .claude-tweaks/verify-scope.json for a project (pretty JSON, or one JSON line under --json with {declaration, written, existed, path}); --write creates the file only when absent and never overwrites; exit 0 always on a valid invocation (including "nothing detected" → bookkeeping-only starter), 2 malformed`. Both rows one line each.

- [ ] **Step 4: Run** `node --test "<worktree>/tests/bin-lib/init/init-verify-scope-cli.test.js" "<worktree>/tests/bin-lib/init/verify-scope-starter.test.js"` — PASS.

- [ ] **Step 5: Commit** — `Add init-verify-scope.js — thin CLI over the starter module, create-if-absent --write (refs #1924)`.

---

### Task 4: Init prose — Step 6.6 sub-file, SKILL.md entry (net-zero), update-mode drift row, CLAUDE.md template sentence, gitignore negation row, skill-graph edge

**Files:**
- Create: `plugin/skills/init/bootstrap/step-06-6-verify-scope.md`
- Modify: `plugin/skills/init/SKILL.md` (after the `### Step 6.5: Port Isolation` entry at line 117-119)
- Modify: `plugin/skills/init/update-mode.md` (a `### Verify-Scope Drift` block after `### Port Isolation Drift`, line ~397-404)
- Modify: `plugin/skills/init/claude-md-template.md` (the `## Commands` block, line ~40-43)
- Modify: `plugin/skills/init/bootstrap/step-04-gitignore-suggestions.md` (its suggestions table)
- Modify: `docs/skill-graph.md` (`## init` table, line ~293-305: a `/test` row)

- [ ] **Step 1: Measure** — `wc -c` on `init/SKILL.md` (39226) and `update-mode.md` (39444). Record.

- [ ] **Step 2: Write the sub-file** `step-06-6-verify-scope.md` (target ≤ 3,500 B):

```markdown
# Step 6.6 — Verify-Scope Starter (detailed procedure)

*Core Bootstrap step — runs unconditionally, once per project, right after Step 6.5. Generates the starter `.claude-tweaks/verify-scope.json` that `verify.js --scope` reads (#1922) so the pipeline's re-verify sites (`test/verification.md`'s scoping table, #1923) can shed suites the delta cannot affect. Without a declaration every site resolves `full` — today's behavior.*

## 1. Detect and propose

One plain command (the CLI shells out to nothing and reads only `pnpm-workspace.yaml`, `package.json` files, and lockfiles):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/init-verify-scope.js" --root .
```

It prints the proposed declaration: one suite per workspace package with a `test` script (`pnpm --filter {name} test` / `npm test -w {path}` / `yarn workspace {name} test`, told apart by `pnpm-workspace.yaml` and the lockfile), `packages/shared`-style packages that another package depends on mapped to every suite (`"*"`), each tested package's own tree mapped to its suite, and the pipeline's four bookkeeping globs (`docs/plans/*-ledger.md`, `.claude-tweaks/pipelines/**`, `docs/superpowers/plans/**`, `docs/superpowers/specs/**`) mapped to no suite. A single-package repo gets `checks.tests` from the root `test` script and the bookkeeping rules only. The starter never maps a source path to `[]`; everything it does not name stays unmatched, which the engine fails closed to `full`.

**Already declared** (`.claude-tweaks/verify-scope.json` exists): report `exists — left unchanged` and stop; the file is project-owned and reviewed like code. `--write` is create-if-absent only. Drift between the file and the workspace is `init --update`'s job (`update-mode.md`'s Verify-Scope Drift).

**Nothing detected** (no workspace, no root `test` script): the proposal is the bookkeeping-only starter. Report it and skip the write offer — a declaration with no suites is valid but buys nothing until a `test` script exists.

## 2. Offer the write

Render the proposed declaration as a table — `| Rule | Match | Suites | Static |` — plus the `checks` block, then:

- **Interactive:** one `AskUserQuestion` — `question`: `"Write this starter verify-scope.json? You can edit it afterwards; init --update reports drift."`, `header`: `"Verify scope"`, options `Write starter (Recommended)` / `Skip`. On Write: `node "${CLAUDE_PLUGIN_ROOT}/bin/init-verify-scope.js" --root . --write`.
- **`auto` mode:** write it (a reversible, project-owned file) and log `AUTO {time} — Step 6.6: wrote starter .claude-tweaks/verify-scope.json ({n} suites, {m} rules). Reversibility: high.`

If the project's `.gitignore` ignores `.claude-tweaks/` wholesale, Step 4's suggestions table already carries the `!.claude-tweaks/verify-scope.json` negation — the declaration must be tracked.

## 3. What this step never does

Rewrites test scripts or workspace config; maps a source path to `[]`; overwrites an existing declaration; adds a `policy.yml` key (the declaration is a sibling file — `_shared/policy-schema.md`).
```

- [ ] **Step 3: SKILL.md entry, net-zero.** Insert after the Step 6.5 entry:

```markdown
### Step 6.6: Verify-Scope Starter

Proposes a starter `.claude-tweaks/verify-scope.json` from the detected workspace (suites per tested package, shared packages → every suite, pipeline bookkeeping → none) and offers to write it — create-if-absent only. Read `bootstrap/step-06-6-verify-scope.md`.
```

Pay for it by trimming the Step 6.5 entry to: `Detects literal dev-server ports and offers a reviewable rewrite to env reads (never applied without the gate, even in \`auto\`); queues the \`port-services\` policy decision through the same deferred write as \`worktree-always\`. Read \`bootstrap/step-06-5-port-isolation.md\`.` and, if still over 39,226 B, trim connective words in the Step 15 entry (never a rule). Assert with `wc -c` ≤ 39,226 + 0 (net-zero or smaller); if that proves impossible within 150 B, stop and report NEEDS_CONTEXT with the exact count. `tests/init-port-isolation-conformance.test.js` pins only that the `### Step 6.5: Port Isolation` heading sits between Step 6 and Step 7 and that its stub cites `bootstrap/step-06-5-port-isolation.md` — the trimmed entry keeps both, and Step 6.6 slotting between 6.5 and 7 is fine.

- [ ] **Step 4: update-mode.md drift block** after `### Port Isolation Drift`'s table (≤ 600 B):

```markdown
### Verify-Scope Drift

| Signal | Detection | Surfacing |
|---|---|---|
| `.claude-tweaks/verify-scope.json`'s suites disagree with the workspace | `node "${CLAUDE_PLUGIN_ROOT}/bin/init-verify-scope.js --root . --json"` → compare `declaration` with the file via `diffAgainstWorkspace` (`plugin/bin/lib/init/verify-scope-starter.js`) | Report-only: "verify-scope: suites `{extra}` not in workspace; packages `{missing}` have no suite" — never rewritten |
```

- [ ] **Step 5: claude-md-template.md** — in the `## Commands` block's guidance (line ~43), append one sentence: `When \`.claude-tweaks/verify-scope.json\` exists, pipeline re-verifies run scoped against the last full pass (\`test/verification.md\`'s scoping table); \`init --update\` reports drift between its suites and the workspace.`

- [ ] **Step 6: step-04 negation row** — `step-04-gitignore-suggestions.md`'s decision table has the columns `| Current state | Action |` (line ~52). Add one row at its end: `| A blanket \`.claude-tweaks/\` line the project keeps (declined the migration above), and Step 6.6 proposes or finds a \`verify-scope.json\` | Suggest the negation \`!.claude-tweaks/verify-scope.json\` directly below the blanket line — the declaration is project-owned and must be tracked (#1924). |`

- [ ] **Step 7: skill-graph** — add to `## init`'s table (alphabetical position, after `/stories`): `| \`/test\` | Step 6.6 generates the starter \`.claude-tweaks/verify-scope.json\` that \`verify.js --scope\` reads at \`/test\`'s scoped re-verify sites (#1924); \`init --update\` reports drift between the declaration's suites and the workspace. |`

- [ ] **Step 8: Verify** — `wc -c` on `init/SKILL.md` (≤ 39226), `update-mode.md` (≤ 40100), `step-06-6-verify-scope.md`; `node --test "<worktree>/tests/bin-lib/skill-audit/context-cost.test.js" "<worktree>/tests/skill-invocation.test.js" "<worktree>/tests/skill-graph-table-structure.test.js"` plus any test named `init` under `tests/` (`ls "<worktree>/tests" | grep -i init`) — PASS.

- [ ] **Step 9: Commit** — `init Step 6.6: verify-scope starter sub-file, net-zero SKILL.md entry, update-mode drift row, CLAUDE.md template sentence, gitignore negation, skill-graph edge (refs #1924)`.

---

### Task 5: This repo's declaration and its pin

**Files:**
- Create: `.claude-tweaks/verify-scope.json`
- Create: `tests/verify-scope-declaration.test.js`

- [ ] **Step 1: Write the declaration** (tracked; `.gitignore` ignores only specific `.claude-tweaks/` subpaths, never the directory):

```json
{
  "checks": { "tests": "npm test" },
  "rules": [
    { "match": "plugin/skills/**", "suites": "*", "static": true },
    { "match": "plugin/**", "suites": "*", "static": true },
    { "match": "tests/**", "suites": "*", "static": true },
    { "match": "tools/**", "suites": "*", "static": true },
    { "match": "docs/plans/*-ledger.md", "suites": [], "static": false },
    { "match": ".claude-tweaks/pipelines/**", "suites": [], "static": false },
    { "match": "docs/superpowers/plans/**", "suites": [], "static": false },
    { "match": "docs/superpowers/specs/**", "suites": [], "static": false }
  ]
}
```

- [ ] **Step 2: Write the test** `tests/verify-scope-declaration.test.js`:

```js
// tests/verify-scope-declaration.test.js — pins this repo's own
// .claude-tweaks/verify-scope.json (#1924): it parses, no source path maps
// to [], and the engine classifies the two canonical deltas as the parent
// design intends (ledger rows → none, skill prose → full). Reads the live
// file deliberately — the declaration IS the contract.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const DECL = path.join(REPO_ROOT, '.claude-tweaks', 'verify-scope.json');
const { readDeclaration } = require(path.join(REPO_ROOT, 'plugin', 'bin', 'lib', 'verify', 'declaration.js'));
const { selectScope } = require(path.join(REPO_ROOT, 'plugin', 'bin', 'lib', 'verify', 'scope.js'));
const STAMP = { sha: 'a'.repeat(40), fullSha: 'a'.repeat(40), scope: 'full' };

test('this repo declares its own verify scope and it passes readDeclaration (#1924 AC5)', () => {
  assert.ok(fs.existsSync(DECL), 'missing .claude-tweaks/verify-scope.json');
  const r = readDeclaration(DECL);
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
  assert.deepStrictEqual(r.decl.suites, ['tests']);
  for (const rule of r.decl.rules) assert.ok(rule.suites === '*' || (Array.isArray(rule.suites) && rule.suites.length === 0), `rule ${rule.match} must be "*" or []`);
  for (const rule of r.decl.rules) {
    if (/^(plugin|tests|tools)\//.test(rule.match)) assert.strictEqual(rule.suites, '*', `${rule.match} must map to every suite`);
  }
});

test('a ledger-row delta resolves to none; a skill-prose delta resolves to full (#1924 AC5)', () => {
  const { decl } = readDeclaration(DECL);
  const sel = (files) => selectScope({ decl, files, stamp: STAMP });
  assert.strictEqual(sel(['docs/plans/2026-09-05-spec-1921-ledger.md']).mode, 'none');
  assert.strictEqual(sel(['.claude-tweaks/pipelines/2026-09-05T193518-x/spec-1/work/1-spec.md']).mode, 'none');
  assert.strictEqual(sel(['plugin/skills/test/SKILL.md']).mode, 'full');
  assert.strictEqual(sel(['plugin/bin/verify.js', 'docs/plans/x-ledger.md']).mode, 'full');
  assert.strictEqual(sel(['docs/skill-graph.md']).mode, 'full');
  assert.deepStrictEqual(sel(['docs/skill-graph.md']).unmatched, ['docs/skill-graph.md']);
});

test('init/SKILL.md lists Step 6.6 and its sub-file exists (#1924)', () => {
  const skill = fs.readFileSync(path.join(REPO_ROOT, 'plugin', 'skills', 'init', 'SKILL.md'), 'utf8');
  assert.ok(skill.includes('### Step 6.6: Verify-Scope Starter'));
  assert.ok(skill.includes('bootstrap/step-06-6-verify-scope.md'));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'plugin', 'skills', 'init', 'bootstrap', 'step-06-6-verify-scope.md')));
});
```

- [ ] **Step 3: Run** `node --test "<worktree>/tests/verify-scope-declaration.test.js"` — PASS. Then a live sanity probe from the worktree: `node plugin/bin/verify.js --changed-files --integration-branch main` (expected exit 0 with this branch's changed set — the declaration is not consulted by that mode; this only proves the repo still resolves a base), and `git -C "<worktree>" check-ignore -v .claude-tweaks/verify-scope.json` — Expected: exit 1 (not ignored).

- [ ] **Step 4: Commit** — `Declare this repo's verify scope — ledger rows and run-dir files resolve to none, plugin/tests/tools stay full (refs #1924)`.

---

### Task 6: Full suite (AC6)

- [ ] **Step 1:** `node "/Users/thomasholknielsen/.claude/plugins/cache/claude-tweaks-marketplace/claude-tweaks/6.116.0/bin/verify.js" --log-dir "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.git/worktrees/design-1904-pipeline-ceremony/claude-tweaks-verify" --count-stamp "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.git/worktrees/design-1904-pipeline-ceremony/claude-tweaks-test-count.json" --cmd tests="npm test"` — Expected: exit 1 with only the pre-existing baseline failures (`tests/bin-lib/reconcile/reap-merged.test.js` ×3, plus `tests/impeccable-cli-contract.test.js:35` when the environment pin drifts); `init/SKILL.md` under 40,960 (context-cost test green).

---

## Self-review

- **Spec coverage:** starter module with the three exports and templates (Task 2); Step 6.6 sub-file + net-zero entry (Task 4); drift row (Task 4); template sentence (Task 4); this repo's declaration (Task 5); module/CLI/declaration tests + Step 6.6 prose pin (Tasks 2, 3, 5); docs rows + skill-graph edge (Tasks 3, 4). AC1/AC2/AC4 (module tests), AC3 (CLI test), AC5 (declaration test), AC6 (Task 6 + context-cost).
- **Gotchas honored:** yarn template; no-test-script packages get no rule unless shared; shared wins over own suite; direct `dependencies` one hop; lockfile tells npm from yarn; four bookkeeping rules; auto-mode write is logged; no-test-script → `checks.tests` omitted (Task 1 makes the schema accept it — the spec's premise that it already did was false); unmatched → full is the engine's; `!verify-scope.json` negation row; never overwrite; never `[]` on a source path.
- **Placeholders:** none.
