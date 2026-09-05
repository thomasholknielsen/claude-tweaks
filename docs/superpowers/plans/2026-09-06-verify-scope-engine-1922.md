# Verify Diff-Aware Scoping Engine (#1922) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `plugin/bin/verify.js` a `--scope <path>` mode that reads a project-declared `.claude-tweaks/verify-scope.json`, computes the changed-file set since the last full pass, selects which checks to run by a pure rule, runs only those, and writes a stamp whose `scope` names exactly what ran, anchored to the last full pass's SHA. Nothing in the pipeline calls `--scope` yet.

**Architecture:** Three new pure-ish modules under `plugin/bin/lib/verify/` — `declaration.js` (parse + validate the JSON declaration), `changed-files.js` (git-backed changed-file set and base resolution with an injectable exec seam), `scope.js` (pure selection rule) — plus one new export from `plugin/bin/lib/issues/blast-radius.js` (`globToRegExp`, the repo's one glob matcher). `verify.js` composes them behind `--scope`; `args.js` parses the three new flags; `report.js` carries a `scope` object on `report.json`. The stamp module already accepts every field the scoped stamp needs (#1921 reserved them).

**Tech Stack:** Node 18+ built-ins only (`node:fs`, `node:path`, `node:child_process`); `node --test`; no `minimatch`/`picomatch`.

**Spec:** `.claude-tweaks/pipelines/2026-09-05T193518-spec-1921-1922-1923-1924-1925-1926-1930-1932-1931-1792-1927-1928-1929/spec-1922/work/1922-spec.md` (materialized from GitHub issue #1922)

## Global Constraints

- Zero runtime npm dependencies. Reuse `blast-radius.js`'s `globToRegExp`; never add a second matcher.
- `verify.js` never reads `.claude-tweaks/policy.yml` or CLAUDE.md. The declaration is an explicit `--scope <path>` input. The ONE exception to "the caller resolves commands": tool-scoped mode substitutes `{base}` into `checks.tests` and runs that one command as the `tests` check.
- An unresolvable base is a thrown `ChangedFilesError` (CLI exit 2), never an empty file set.
- Only `mode: 'full'` may advance `fullSha`; every other mode carries the prior stamp's `fullSha` and sets `base === fullSha`. The first `--scope` run in a checkout with no prior stamp is always `full`.
- `mode: 'none'` runs nothing, exits 0, and still writes a stamp with `scope: 'none'`.
- `run.js`'s fail-fast ordering applies unchanged to the filtered check set.
- First matching rule wins; unmatched paths fail closed to `{suites: '*', static: true}` and are listed in `unmatched`.
- Paths are repo-relative with forward slashes (normalize `\` → `/`).
- Existing `cli.test.js` cases pass unmodified (AC7); every CLI invocation in tests passes an explicit temp `cwd` (never this repo).
- `plugin/skills/_shared/policy-schema.md` is 38,433 bytes against a 40 KB ceiling — the sibling-file note stays under 250 bytes.
- Commits use `refs #1922` (never `closes`/`fixes`) and end with the trailer `Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB`.
- Worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony`, branch `worktree-design-1904-pipeline-ceremony`; anchor every git/test command with `git -C "<worktree>"` or an absolute path.
- Commit tests only where the task asks; edit in place; do not reformat adjacent code.

---

### Task 1: Export `globToRegExp` from `blast-radius.js`

**Files:**
- Modify: `plugin/bin/lib/issues/blast-radius.js` (the `module.exports` line, currently `module.exports = { classifyDiffFiles, blastRadiusSummary, isSensitivePath };`)
- Test: `tests/bin-lib/issues/blast-radius.test.js`

**Interfaces:**
- Produces: `globToRegExp(glob) → RegExp` (memoized, unchanged behavior) as a named export alongside the three existing ones.

- [ ] **Step 1: Write the failing test**

Append to `tests/bin-lib/issues/blast-radius.test.js` (read the file first; it already destructures `classifyDiffFiles, blastRadiusSummary` from the module — add `globToRegExp` to that same destructuring, no second require):

```js
test('globToRegExp is exported so the verify scope engine can reuse the one matcher (#1922)', () => {
  assert.strictEqual(typeof globToRegExp, 'function');
  assert.ok(globToRegExp('docs/**/*.md').test('docs/a/b/c.md'));
  assert.ok(!globToRegExp('docs/**/*.md').test('src/a.md'));
  assert.ok(globToRegExp('apps/api/**').test('apps/api'));
  assert.ok(globToRegExp('apps/api/**').test('apps/api/src/a.ts'));
  assert.ok(!globToRegExp('apps/*/x.ts').test('apps/a/b/x.ts'));
});
```

- [ ] **Step 2: Run the probe to verify it fails**

Run: `node -e "const m=require('/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/bin/lib/issues/blast-radius.js'); if (typeof m.globToRegExp !== 'function') { console.error('globToRegExp not exported'); process.exit(1); }"`
Expected: FAIL — `globToRegExp not exported`, exit 1. Then `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/issues/blast-radius.test.js"` shows the new test failing.

- [ ] **Step 3: Add the export**

Change the export line to `module.exports = { classifyDiffFiles, blastRadiusSummary, isSensitivePath, globToRegExp };` — no other change.

- [ ] **Step 4: Run the test**

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/issues/blast-radius.test.js"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" add plugin/bin/lib/issues/blast-radius.js tests/bin-lib/issues/blast-radius.test.js
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" commit -m "Export globToRegExp from blast-radius for the verify scope engine (refs #1922)" -m "Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB"
```

---

### Task 2: `declaration.js` — parse and validate `verify-scope.json`

**Files:**
- Create: `plugin/bin/lib/verify/declaration.js`
- Test: `tests/bin-lib/verify/declaration.test.js`

**Interfaces:**
- Produces: `readDeclaration(filePath, fsImpl = fs)` → `{ ok: true, decl: null }` when the file does not exist; `{ ok: false, errors: [string, ...] }` naming every invalid field; `{ ok: true, decl }` where `decl` is the normalized shape:
  ```
  {
    checks: { types: string|null, lint: string|null, tests: string | {name: string} },
    suites: [string],            // declared suite names — Object.keys(checks.tests) for a map, ['tests'] for a string
    toolScoped: boolean,         // checks.tests is a string containing '{base}'
    retry: { [suite]: string },  // {} when absent
    rules: [{ match: string, suites: '*' | [string], static: boolean }],
    flaky: { files: [string], maxRetries: number }  // { files: [], maxRetries: 1 } when absent
  }
  ```
  Also exports `DEFAULT_MAX_RETRIES = 1`, `MAX_RETRIES_CEILING = 2`.

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/verify/declaration.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { readDeclaration } = require(path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'verify', 'declaration.js'));

function fakeFs(files) {
  return {
    readFileSync: (p) => {
      if (!(p in files)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return files[p];
    },
  };
}

const EXAMPLE = {
  checks: {
    types: 'pnpm typecheck',
    lint: 'pnpm lint',
    tests: { api: 'pnpm --filter api test', web: 'pnpm --filter web test' },
  },
  retry: { api: 'pnpm --filter api test -- {file}', web: 'pnpm --filter web test -- {file}' },
  rules: [
    { match: 'apps/api/**', suites: ['api'], static: true },
    { match: 'apps/web/**', suites: ['web'], static: true },
    { match: 'packages/shared/**', suites: '*', static: true },
    { match: 'docs/**/*.md', suites: [], static: false },
    { match: 'docs/plans/*-ledger.md', suites: [], static: false },
    { match: '.claude-tweaks/pipelines/**', suites: [], static: false },
  ],
  flaky: { files: ['apps/api/test/mailer.test.ts'], maxRetries: 1 },
};

test('a missing declaration file is ok with decl null (mode full), never a throw', () => {
  assert.deepStrictEqual(readDeclaration('/nope.json', fakeFs({})), { ok: true, decl: null });
});

test('the example declaration parses to the normalized shape', () => {
  const r = readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify(EXAMPLE) }));
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.decl.suites, ['api', 'web']);
  assert.strictEqual(r.decl.toolScoped, false);
  assert.strictEqual(r.decl.checks.types, 'pnpm typecheck');
  assert.strictEqual(r.decl.rules.length, 6);
  assert.deepStrictEqual(r.decl.rules[2], { match: 'packages/shared/**', suites: '*', static: true });
  assert.deepStrictEqual(r.decl.flaky, { files: ['apps/api/test/mailer.test.ts'], maxRetries: 1 });
  assert.deepStrictEqual(r.decl.retry, EXAMPLE.retry);
});

test('a string checks.tests declares the single suite "tests"; one carrying {base} is tool-scoped', () => {
  const plain = readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: { tests: 'npm test' }, rules: [] }) }));
  assert.strictEqual(plain.ok, true);
  assert.deepStrictEqual(plain.decl.suites, ['tests']);
  assert.strictEqual(plain.decl.toolScoped, false);
  assert.deepStrictEqual(plain.decl.flaky, { files: [], maxRetries: 1 });
  assert.deepStrictEqual(plain.decl.retry, {});
  const tool = readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: { tests: 'pnpm vitest --changed {base}' }, rules: [] }) }));
  assert.strictEqual(tool.ok, true);
  assert.strictEqual(tool.decl.toolScoped, true);
  assert.deepStrictEqual(tool.decl.suites, ['tests']);
});

test('unparseable JSON is ok:false with one error naming the parse failure', () => {
  const r = readDeclaration('/d.json', fakeFs({ '/d.json': '{ not json' }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
  assert.match(r.errors[0], /parse/i);
});

test('every invalid field is named, including the rule index and the unknown suite (AC6)', () => {
  const bad = {
    checks: { types: 7, tests: { api: 'x' } },
    retry: { web: 'no placeholder' },
    rules: [
      { match: 'a/**', suites: ['api', 'nope'], static: true },
      { match: 'b/**', suites: 'all', static: 'yes' },
      { suites: [], static: false },
    ],
    flaky: { files: 'not-an-array', maxRetries: 5 },
  };
  const r = readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify(bad) }));
  assert.strictEqual(r.ok, false);
  const joined = r.errors.join('\n');
  assert.match(joined, /checks\.types/);
  assert.match(joined, /rules\[0\].*nope/);
  assert.match(joined, /rules\[1\].*suites/);
  assert.match(joined, /rules\[1\].*static/);
  assert.match(joined, /rules\[2\].*match/);
  assert.match(joined, /retry\.web/);
  assert.match(joined, /flaky\.files/);
  assert.match(joined, /flaky\.maxRetries/);
  assert.ok(r.errors.length >= 8, `expected every invalid field named, got ${r.errors.length}`);
});

test('missing checks.tests, a non-object checks, and a non-array rules are errors', () => {
  assert.strictEqual(readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: {}, rules: [] }) })).ok, false);
  assert.strictEqual(readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: 'x', rules: [] }) })).ok, false);
  assert.strictEqual(readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: { tests: 'x' } }) })).ok, false);
});

test('flaky.maxRetries defaults to 1 and accepts 0..2 only', () => {
  const zero = readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: { tests: 'x' }, rules: [], flaky: { files: [], maxRetries: 0 } }) }));
  assert.strictEqual(zero.decl.flaky.maxRetries, 0);
  const two = readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: { tests: 'x' }, rules: [], flaky: { files: [], maxRetries: 2 } }) }));
  assert.strictEqual(two.decl.flaky.maxRetries, 2);
  const dflt = readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: { tests: 'x' }, rules: [], flaky: { files: ['a.js'] } }) }));
  assert.strictEqual(dflt.decl.flaky.maxRetries, 1);
  assert.strictEqual(readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: { tests: 'x' }, rules: [], flaky: { files: [], maxRetries: 3 } }) })).ok, false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/declaration.test.js"`
Expected: FAIL with "Cannot find module '.../plugin/bin/lib/verify/declaration.js'"

- [ ] **Step 3: Write the module**

Create `plugin/bin/lib/verify/declaration.js`:

```js
// plugin/bin/lib/verify/declaration.js — reads and validates the project's
// .claude-tweaks/verify-scope.json (#1922): the caller-named declaration that
// maps changed-path globs to test suites and static checks. Not a policy key
// (never read by resolve-policy.js); the runner receives its path as an
// explicit --scope input. A missing file is {ok: true, decl: null} — mode
// full, today's behavior — never a throw. Every invalid field is reported,
// not just the first, so a project fixes its declaration in one pass.
'use strict';

const fs = require('fs');

const DEFAULT_MAX_RETRIES = 1;
const MAX_RETRIES_CEILING = 2;

function isPlainObject(v) { return typeof v === 'object' && v !== null && !Array.isArray(v); }

function readDeclaration(filePath, fsImpl = fs) {
  let text;
  try {
    text = fsImpl.readFileSync(filePath, 'utf8');
  } catch {
    return { ok: true, decl: null };
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, errors: [`verify-scope.json: could not parse JSON: ${err.message}`] };
  }
  const errors = [];
  if (!isPlainObject(raw)) return { ok: false, errors: ['verify-scope.json: top level must be an object'] };

  // checks
  const checks = raw.checks;
  let suites = [];
  let toolScoped = false;
  let tests = null;
  if (!isPlainObject(checks)) {
    errors.push('checks: must be an object with a `tests` entry');
  } else {
    for (const key of ['types', 'lint']) {
      if (checks[key] !== undefined && typeof checks[key] !== 'string') errors.push(`checks.${key}: must be a string when present`);
    }
    if (typeof checks.tests === 'string' && checks.tests.trim() !== '') {
      tests = checks.tests;
      suites = ['tests'];
      toolScoped = checks.tests.includes('{base}');
    } else if (isPlainObject(checks.tests) && Object.keys(checks.tests).length > 0) {
      tests = {};
      for (const [name, cmd] of Object.entries(checks.tests)) {
        if (!/^[A-Za-z0-9_-]+$/.test(name)) errors.push(`checks.tests.${name}: suite name must match [A-Za-z0-9_-]+`);
        if (typeof cmd !== 'string' || cmd.trim() === '') errors.push(`checks.tests.${name}: command must be a non-empty string`);
        tests[name] = cmd;
      }
      suites = Object.keys(checks.tests);
    } else {
      errors.push('checks.tests: required — a command string or a map of suite name to command');
    }
  }
  const declared = new Set(suites);

  // retry
  const retry = {};
  if (raw.retry !== undefined) {
    if (!isPlainObject(raw.retry)) {
      errors.push('retry: must be a map of suite name to a per-file command template');
    } else {
      for (const [name, tmpl] of Object.entries(raw.retry)) {
        if (!declared.has(name)) errors.push(`retry.${name}: unknown suite (declared: ${suites.join(', ') || 'none'})`);
        if (typeof tmpl !== 'string' || !tmpl.includes('{file}')) errors.push(`retry.${name}: template must be a string containing {file}`);
        retry[name] = tmpl;
      }
    }
  }

  // rules
  const rules = [];
  if (!Array.isArray(raw.rules)) {
    errors.push('rules: required — an array of {match, suites, static}');
  } else {
    raw.rules.forEach((rule, i) => {
      const where = `rules[${i}]`;
      if (!isPlainObject(rule)) { errors.push(`${where}: must be an object`); return; }
      if (typeof rule.match !== 'string' || rule.match === '') errors.push(`${where}.match: must be a non-empty glob string`);
      let ruleSuites;
      if (rule.suites === '*') {
        ruleSuites = '*';
      } else if (Array.isArray(rule.suites)) {
        ruleSuites = rule.suites;
        for (const s of rule.suites) {
          if (typeof s !== 'string' || !declared.has(s)) errors.push(`${where}.suites: unknown suite "${s}" (declared: ${suites.join(', ') || 'none'})`);
        }
      } else {
        errors.push(`${where}.suites: must be "*" or an array of declared suite names`);
      }
      if (typeof rule.static !== 'boolean') errors.push(`${where}.static: must be a boolean`);
      rules.push({ match: rule.match, suites: ruleSuites, static: rule.static });
    });
  }

  // flaky
  let flaky = { files: [], maxRetries: DEFAULT_MAX_RETRIES };
  if (raw.flaky !== undefined) {
    if (!isPlainObject(raw.flaky)) {
      errors.push('flaky: must be an object');
    } else {
      const files = raw.flaky.files;
      if (files !== undefined && (!Array.isArray(files) || files.some((f) => typeof f !== 'string'))) errors.push('flaky.files: must be an array of path strings');
      let maxRetries = DEFAULT_MAX_RETRIES;
      if (raw.flaky.maxRetries !== undefined) {
        const n = raw.flaky.maxRetries;
        if (!Number.isInteger(n) || n < 0 || n > MAX_RETRIES_CEILING) errors.push(`flaky.maxRetries: must be an integer from 0 to ${MAX_RETRIES_CEILING}`);
        else maxRetries = n;
      }
      flaky = { files: Array.isArray(files) ? files.filter((f) => typeof f === 'string') : [], maxRetries };
    }
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    decl: {
      checks: { types: typeof checks.types === 'string' ? checks.types : null, lint: typeof checks.lint === 'string' ? checks.lint : null, tests },
      suites, toolScoped, retry, rules, flaky,
    },
  };
}

module.exports = { readDeclaration, DEFAULT_MAX_RETRIES, MAX_RETRIES_CEILING };
```

- [ ] **Step 4: Run the tests**

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/declaration.test.js"`
Expected: PASS

- [ ] **Step 5: Mutation probe** — temporarily drop the `!declared.has(s)` check; confirm the AC6 test goes red; restore byte-identical. Report tried/caught.

- [ ] **Step 6: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" add plugin/bin/lib/verify/declaration.js tests/bin-lib/verify/declaration.test.js
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" commit -m "Add verify-scope.json declaration parser with every-field validation (refs #1922)" -m "Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB"
```

---

### Task 3: `changed-files.js` — changed-file set and base resolution

**Files:**
- Create: `plugin/bin/lib/verify/changed-files.js`
- Test: `tests/bin-lib/verify/changed-files.test.js`

**Interfaces:**
- Produces:
  - `class ChangedFilesError extends Error`
  - `resolveBase({ stamp, integrationBranch, base, execImpl = execFileSync }) → string` (40-hex sha): an explicit `base` is verified as a commit (`git rev-parse --verify --end-of-options {base}^{commit}`); else the stamp's anchor (`stamp.fullSha`, falling back to `stamp.sha` for a legacy stamp with no `fullSha`) when `git merge-base --is-ancestor {anchor} HEAD` exits 0; else the merge-base against the integration branch (`integrationBranch` when given, preferring `origin/{name}` when that remote-tracking ref exists; when absent, `git symbolic-ref --quiet --short refs/remotes/origin/HEAD`); else throws `ChangedFilesError`.
  - `changedFiles({ base, execImpl = execFileSync }) → { base, files }`: `git diff --name-status --end-of-options {base}..HEAD` (an `R{score}\told\tnew` row contributes `new`; a `D\tpath` row contributes `path`; every other row its single path) ∪ `git status --porcelain` (an `R old -> new` entry contributes `new`; every other entry, `??` included, its path); backslashes normalized to `/`; sorted, de-duplicated.
- Every git call goes through `execImpl('git', args, { encoding: 'utf8' })` so tests inject a fake keyed by the joined args.

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/verify/changed-files.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  changedFiles, resolveBase, ChangedFilesError,
} = require(path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'verify', 'changed-files.js'));

const FULL = '0123456789abcdef0123456789abcdef01234567';
const MB = 'fedcba9876543210fedcba9876543210fedcba98';

// A fake exec seam keyed by the joined git argv; a missing key throws like
// execFileSync does on a non-zero exit.
function fakeExec(table) {
  const calls = [];
  const exec = (cmd, args) => {
    calls.push([cmd, ...args]);
    const key = args.join(' ');
    if (!(key in table)) { const e = new Error(`fake git: no entry for "${key}"`); e.status = 128; throw e; }
    const v = table[key];
    if (v instanceof Error) throw v;
    return v;
  };
  exec.calls = calls;
  return exec;
}

test('changedFiles unions the committed diff and the working tree, mapping renames to the new path and deletions to the old (#1922)', () => {
  const exec = fakeExec({
    [`diff --name-status --end-of-options ${FULL}..HEAD`]: 'M\tsrc/a.js\nR100\told/b.js\tnew/b.js\nD\tgone.js\nA\tdocs\\win.md\n',
    'status --porcelain': ' M src/a.js\n?? scratch.txt\nR  x.js -> y.js\n D removed.js\n',
  });
  const r = changedFiles({ base: FULL, execImpl: exec });
  assert.strictEqual(r.base, FULL);
  assert.deepStrictEqual(r.files, ['docs/win.md', 'gone.js', 'new/b.js', 'removed.js', 'scratch.txt', 'src/a.js', 'y.js']);
});

test('changedFiles with a clean tree and no commits since base is an empty set, not an error', () => {
  const exec = fakeExec({ [`diff --name-status --end-of-options ${FULL}..HEAD`]: '', 'status --porcelain': '' });
  assert.deepStrictEqual(changedFiles({ base: FULL, execImpl: exec }), { base: FULL, files: [] });
});

test('resolveBase returns the stamp fullSha when it is an ancestor of HEAD (AC3 case 1)', () => {
  const exec = fakeExec({ [`merge-base --is-ancestor ${FULL} HEAD`]: '' });
  assert.strictEqual(resolveBase({ stamp: { sha: 'x', fullSha: FULL }, integrationBranch: 'main', execImpl: exec }), FULL);
});

test('resolveBase falls back to the integration-branch merge-base when the stamp anchor is not an ancestor (rewritten history) or no stamp exists (AC3 case 2)', () => {
  const noAncestor = fakeExec({
    [`merge-base --is-ancestor ${FULL} HEAD`]: new Error('exit 1'),
    'rev-parse --verify --quiet refs/remotes/origin/main': 'abc\n',
    'merge-base --end-of-options origin/main HEAD': `${MB}\n`,
  });
  assert.strictEqual(resolveBase({ stamp: { sha: 'x', fullSha: FULL }, integrationBranch: 'main', execImpl: noAncestor }), MB);
  const noStamp = fakeExec({
    'rev-parse --verify --quiet refs/remotes/origin/main': 'abc\n',
    'merge-base --end-of-options origin/main HEAD': `${MB}\n`,
  });
  assert.strictEqual(resolveBase({ stamp: null, integrationBranch: 'main', execImpl: noStamp }), MB);
  const bareLocal = fakeExec({
    'rev-parse --verify --quiet refs/remotes/origin/main': new Error('no such ref'),
    'merge-base --end-of-options main HEAD': `${MB}\n`,
  });
  assert.strictEqual(resolveBase({ stamp: null, integrationBranch: 'main', execImpl: bareLocal }), MB);
});

test('resolveBase derives the integration branch from origin/HEAD when none is given', () => {
  const exec = fakeExec({
    'symbolic-ref --quiet --short refs/remotes/origin/HEAD': 'origin/main\n',
    'merge-base --end-of-options origin/main HEAD': `${MB}\n`,
  });
  assert.strictEqual(resolveBase({ stamp: null, execImpl: exec }), MB);
});

test('resolveBase throws ChangedFilesError when neither the stamp nor the integration branch resolves — never an empty set (AC3 case 3)', () => {
  const exec = fakeExec({
    [`merge-base --is-ancestor ${FULL} HEAD`]: new Error('exit 1'),
    'rev-parse --verify --quiet refs/remotes/origin/main': new Error('no'),
    'merge-base --end-of-options main HEAD': new Error('fatal: not a valid object name'),
  });
  assert.throws(() => resolveBase({ stamp: { sha: 'x', fullSha: FULL }, integrationBranch: 'main', execImpl: exec }), ChangedFilesError);
  const noInfo = fakeExec({ 'symbolic-ref --quiet --short refs/remotes/origin/HEAD': new Error('no origin') });
  assert.throws(() => resolveBase({ stamp: null, execImpl: noInfo }), ChangedFilesError);
});

test('resolveBase verifies an explicit base as a commit and never consults the stamp', () => {
  const exec = fakeExec({ [`rev-parse --verify --end-of-options ${MB}^{commit}`]: `${MB}\n` });
  assert.strictEqual(resolveBase({ stamp: { sha: 'x', fullSha: FULL }, base: MB, integrationBranch: 'main', execImpl: exec }), MB);
  assert.ok(!exec.calls.some((c) => c.includes('--is-ancestor')));
  const bad = fakeExec({ 'rev-parse --verify --end-of-options nope^{commit}': new Error('fatal') });
  assert.throws(() => resolveBase({ stamp: null, base: 'nope', execImpl: bad }), ChangedFilesError);
});

test('resolveBase uses stamp.sha as the anchor for a legacy stamp that carries no fullSha', () => {
  const exec = fakeExec({ [`merge-base --is-ancestor ${FULL} HEAD`]: '' });
  assert.strictEqual(resolveBase({ stamp: { sha: FULL, scope: 'full', legacy: true }, integrationBranch: 'main', execImpl: exec }), FULL);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/changed-files.test.js"`
Expected: FAIL with "Cannot find module '.../changed-files.js'"

- [ ] **Step 3: Write the module**

Create `plugin/bin/lib/verify/changed-files.js`:

```js
// plugin/bin/lib/verify/changed-files.js — the changed-file set the scope
// engine classifies (#1922), and the base it is measured from. Base
// resolution follows blast-radius-cli.js's posture: an explicit --base is
// verified as a commit, a stamp anchor is used only when it is an ancestor
// of HEAD, the integration branch prefers its origin/ remote-tracking ref,
// and an unresolvable base THROWS — never an empty set, which would clear
// every threshold and read as "nothing changed" ([IL-131]'s shape).
// Every git call goes through execImpl so tests inject a fake.
'use strict';

const { execFileSync } = require('child_process');

class ChangedFilesError extends Error {
  constructor(message) { super(message); this.name = 'ChangedFilesError'; }
}

function git(execImpl, args) {
  return String(execImpl('git', args, { encoding: 'utf8' }));
}

function tryGit(execImpl, args) {
  try { return git(execImpl, args); } catch { return null; }
}

function preferOriginRef(execImpl, integrationBranch) {
  if (integrationBranch.startsWith('origin/')) return integrationBranch;
  const candidate = `origin/${integrationBranch}`;
  return tryGit(execImpl, ['rev-parse', '--verify', '--quiet', `refs/remotes/${candidate}`]) === null
    ? integrationBranch : candidate;
}

function resolveBase({ stamp = null, integrationBranch = null, base = null, execImpl = execFileSync } = {}) {
  if (base) {
    const out = tryGit(execImpl, ['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`]);
    if (out === null || out.trim() === '') throw new ChangedFilesError(`--base "${base}" does not resolve to a commit`);
    return out.trim();
  }
  const anchor = stamp && typeof stamp.sha === 'string'
    ? (typeof stamp.fullSha === 'string' ? stamp.fullSha : stamp.sha)
    : null;
  if (anchor && tryGit(execImpl, ['merge-base', '--is-ancestor', anchor, 'HEAD']) !== null) return anchor;
  let branch = integrationBranch;
  if (!branch) {
    const head = tryGit(execImpl, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
    branch = head ? head.trim() : null;
  }
  if (!branch) throw new ChangedFilesError('could not resolve a base: no usable stamp anchor, no --integration-branch, and origin/HEAD is unset');
  const ref = preferOriginRef(execImpl, branch);
  const mb = tryGit(execImpl, ['merge-base', '--end-of-options', ref, 'HEAD']);
  if (mb === null || mb.trim() === '') {
    throw new ChangedFilesError(`could not resolve a base: no usable stamp anchor and no merge base of "${ref}" and HEAD`);
  }
  return mb.trim();
}

function norm(p) { return p.replace(/\\/g, '/'); }

function changedFiles({ base, execImpl = execFileSync }) {
  const set = new Set();
  const diff = git(execImpl, ['diff', '--name-status', '--end-of-options', `${base}..HEAD`]);
  for (const line of diff.split('\n')) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const status = cols[0];
    if (status.startsWith('R') || status.startsWith('C')) set.add(norm(cols[2]));
    else set.add(norm(cols[1]));
  }
  const status = git(execImpl, ['status', '--porcelain']);
  for (const line of status.split('\n')) {
    if (!line.trim()) continue;
    const entry = line.slice(3);
    const arrow = entry.indexOf(' -> ');
    set.add(norm(arrow === -1 ? entry : entry.slice(arrow + 4)));
  }
  return { base, files: [...set].sort() };
}

module.exports = { changedFiles, resolveBase, ChangedFilesError };
```

- [ ] **Step 4: Run the tests**

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/changed-files.test.js"`
Expected: PASS

- [ ] **Step 5: Mutation probe** — make `resolveBase` return `''` instead of throwing on the final merge-base failure; confirm the AC3-case-3 test goes red; restore.

- [ ] **Step 6: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" add plugin/bin/lib/verify/changed-files.js tests/bin-lib/verify/changed-files.test.js
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" commit -m "Add changed-files resolver for the verify scope engine — stamp-anchored base, fail-closed resolution (refs #1922)" -m "Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB"
```

---

### Task 4: `scope.js` — the pure selection rule

**Files:**
- Create: `plugin/bin/lib/verify/scope.js`
- Test: `tests/bin-lib/verify/scope.test.js`

**Interfaces:**
- Consumes: `globToRegExp` (Task 1); the normalized `decl` shape (Task 2).
- Produces: `selectScope({ decl, files, stamp })` → `{ mode, suites, static, base, unmatched, matched }` where `mode ∈ 'full' | 'scoped' | 'static-only' | 'none' | 'tool-scoped'`, `suites` is `'*'` or a sorted array of declared suite names, `static` is a boolean, `base` is the stamp's anchor (`fullSha`, or `sha` for a legacy stamp) or `null`, `unmatched` lists files no rule matched, `matched` lists `{ file, rule }` (rule index, or `null` for unmatched). Pure: no fs, no git.

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/verify/scope.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { selectScope } = require(path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'verify', 'scope.js'));
const { readDeclaration } = require(path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'verify', 'declaration.js'));

const FULL = '0123456789abcdef0123456789abcdef01234567';
const STAMP = { sha: 'deadbeef', fullSha: FULL, scope: 'full' };

function decl(json) {
  const r = readDeclaration('/d.json', { readFileSync: () => JSON.stringify(json) });
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
  return r.decl;
}

const EXAMPLE = decl({
  checks: { types: 't', lint: 'l', tests: { api: 'a', web: 'w' } },
  rules: [
    { match: 'apps/api/**', suites: ['api'], static: true },
    { match: 'apps/web/**', suites: ['web'], static: true },
    { match: 'packages/shared/**', suites: '*', static: true },
    { match: 'docs/**/*.md', suites: [], static: false },
    { match: 'docs/plans/*-ledger.md', suites: [], static: false },
    { match: '.claude-tweaks/pipelines/**', suites: [], static: false },
  ],
});

test('no declaration → full, byte-for-byte today (AC1)', () => {
  for (const files of [[], ['anything.js'], ['docs/x.md']]) {
    assert.deepStrictEqual(selectScope({ decl: null, files, stamp: STAMP }), { mode: 'full', suites: '*', static: true, base: FULL, unmatched: [], matched: [] });
  }
});

test('no prior stamp → full even with a declaration (the first run is always the anchor)', () => {
  const r = selectScope({ decl: EXAMPLE, files: ['docs/x.md'], stamp: null });
  assert.strictEqual(r.mode, 'full');
  assert.strictEqual(r.suites, '*');
  assert.strictEqual(r.static, true);
  assert.strictEqual(r.base, null);
});

test('the example declaration selects per AC2', () => {
  const sel = (files) => selectScope({ decl: EXAMPLE, files, stamp: STAMP });
  assert.strictEqual(sel(['docs/plans/x-ledger.md']).mode, 'none');
  assert.strictEqual(sel(['docs/guide.md']).mode, 'none');
  let r = sel(['apps/api/src/a.ts']);
  assert.strictEqual(r.mode, 'scoped'); assert.deepStrictEqual(r.suites, ['api']); assert.strictEqual(r.static, true);
  r = sel(['packages/shared/x.ts']);
  assert.strictEqual(r.mode, 'full'); assert.strictEqual(r.suites, '*');
  r = sel(['unknown/path.txt']);
  assert.strictEqual(r.mode, 'full'); assert.deepStrictEqual(r.unmatched, ['unknown/path.txt']);
  r = sel(['apps/api/src/a.ts', 'docs/plans/x-ledger.md']);
  assert.strictEqual(r.mode, 'scoped'); assert.deepStrictEqual(r.suites, ['api']);
  assert.deepStrictEqual(r.matched, [{ file: 'apps/api/src/a.ts', rule: 0 }, { file: 'docs/plans/x-ledger.md', rule: 3 }]);
});

test('every selected suite without static is scoped, not full; the anchoring base is the stamp fullSha', () => {
  const d = decl({ checks: { tests: { api: 'a', web: 'w' } }, rules: [{ match: 'src/**', suites: '*', static: false }] });
  const r = selectScope({ decl: d, files: ['src/a.js'], stamp: STAMP });
  assert.strictEqual(r.mode, 'scoped');
  assert.deepStrictEqual(r.suites, ['api', 'web']);
  assert.strictEqual(r.static, false);
  assert.strictEqual(r.base, FULL);
});

test('static-only: suites empty with static true (the branch no example rule exercises)', () => {
  const d = decl({ checks: { tests: 'npm test' }, rules: [{ match: 'config/**', suites: [], static: true }] });
  const r = selectScope({ decl: d, files: ['config/a.json'], stamp: STAMP });
  assert.strictEqual(r.mode, 'static-only');
  assert.deepStrictEqual(r.suites, []);
  assert.strictEqual(r.static, true);
});

test('first matching rule wins — order matters', () => {
  const shadowing = decl({ checks: { tests: 'npm test' }, rules: [
    { match: 'docs/**/*.md', suites: ['tests'], static: true },
    { match: 'docs/plans/*-ledger.md', suites: [], static: false },
  ] });
  assert.strictEqual(selectScope({ decl: shadowing, files: ['docs/plans/x-ledger.md'], stamp: STAMP }).mode, 'full');
  const ordered = decl({ checks: { tests: 'npm test' }, rules: [
    { match: 'docs/plans/*-ledger.md', suites: [], static: false },
    { match: 'docs/**/*.md', suites: ['tests'], static: true },
  ] });
  assert.strictEqual(selectScope({ decl: ordered, files: ['docs/plans/x-ledger.md'], stamp: STAMP }).mode, 'none');
});

test('an empty changed-file set with a declaration and a stamp is none', () => {
  const r = selectScope({ decl: EXAMPLE, files: [], stamp: STAMP });
  assert.strictEqual(r.mode, 'none');
  assert.deepStrictEqual(r.suites, []);
  assert.strictEqual(r.static, false);
});

test('tool-scoped: path rules do not pick suites, static still follows the rules', () => {
  const d = decl({ checks: { types: 't', tests: 'pnpm vitest --changed {base}' }, rules: [
    { match: 'src/**', suites: [], static: true },
    { match: 'docs/**', suites: [], static: false },
  ] });
  let r = selectScope({ decl: d, files: ['src/a.js'], stamp: STAMP });
  assert.strictEqual(r.mode, 'tool-scoped'); assert.deepStrictEqual(r.suites, ['tests']); assert.strictEqual(r.static, true);
  r = selectScope({ decl: d, files: ['docs/a.md'], stamp: STAMP });
  assert.strictEqual(r.mode, 'tool-scoped'); assert.strictEqual(r.static, false);
  r = selectScope({ decl: d, files: [], stamp: STAMP });
  assert.strictEqual(r.mode, 'none');
});

test('a legacy stamp with no fullSha anchors on its sha', () => {
  const r = selectScope({ decl: EXAMPLE, files: ['docs/x.md'], stamp: { sha: FULL, scope: 'full', legacy: true } });
  assert.strictEqual(r.base, FULL);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/scope.test.js"`
Expected: FAIL with "Cannot find module '.../scope.js'"

- [ ] **Step 3: Write the module**

Create `plugin/bin/lib/verify/scope.js`:

```js
// plugin/bin/lib/verify/scope.js — the pure scope-selection rule (#1922).
// No fs, no git: declaration + changed files + current stamp in,
// {mode, suites, static, base, unmatched, matched} out. Unmatched paths fail
// CLOSED to {suites: '*', static: true} ([IL-120]: a markdown edit tripped a
// size-ceiling test in an unrelated suite — only declared paths get cheaper).
// The anchoring invariant lives here: every non-full mode's base is the
// stamp's fullSha, never a prior scoped sha, so scoped runs never chain.
'use strict';

const { globToRegExp } = require('../issues/blast-radius');

function anchorOf(stamp) {
  if (!stamp || typeof stamp.sha !== 'string') return null;
  return typeof stamp.fullSha === 'string' ? stamp.fullSha : stamp.sha;
}

function selectScope({ decl, files, stamp }) {
  const base = anchorOf(stamp);
  // No declaration: today's behavior byte-for-byte. No prior full pass: the
  // first run IS the anchor everything later diffs against, so it is full too.
  if (!decl || base === null) {
    return { mode: 'full', suites: '*', static: true, base, unmatched: [], matched: [] };
  }
  const matched = [];
  const unmatched = [];
  const selected = new Set();
  let all = false;
  let isStatic = false;
  for (const file of files) {
    const idx = decl.rules.findIndex((r) => globToRegExp(r.match).test(file));
    if (idx === -1) {
      unmatched.push(file);
      matched.push({ file, rule: null });
      all = true;
      isStatic = true;
      continue;
    }
    const rule = decl.rules[idx];
    matched.push({ file, rule: idx });
    if (rule.suites === '*') all = true;
    else for (const s of rule.suites) selected.add(s);
    if (rule.static) isStatic = true;
  }
  if (decl.toolScoped) {
    if (files.length === 0) return { mode: 'none', suites: [], static: false, base, unmatched, matched };
    return { mode: 'tool-scoped', suites: ['tests'], static: isStatic, base, unmatched, matched };
  }
  const suites = all ? decl.suites.slice().sort() : [...selected].sort();
  const everySuite = suites.length > 0 && suites.length === decl.suites.length;
  let mode;
  if (everySuite && isStatic) mode = 'full';
  else if (suites.length === 0 && isStatic) mode = 'static-only';
  else if (suites.length === 0) mode = 'none';
  else mode = 'scoped';
  return { mode, suites: mode === 'full' ? '*' : suites, static: isStatic, base, unmatched, matched };
}

module.exports = { selectScope };
```

- [ ] **Step 4: Run the tests**

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/scope.test.js"`
Expected: PASS

- [ ] **Step 5: Mutation probe** — temporarily make an unmatched file contribute `{suites: [], static: false}`; confirm the AC2 `unknown/path.txt` assertion goes red; restore.

- [ ] **Step 6: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" add plugin/bin/lib/verify/scope.js tests/bin-lib/verify/scope.test.js
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" commit -m "Add the pure verify scope-selection rule — first match wins, unmatched fails closed, anchored to fullSha (refs #1922)" -m "Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB"
```

---

### Task 5: `verify.js --scope` — flags, check filtering, `none` short-circuit, scope line, scoped stamp, report.json `scope`

**Files:**
- Modify: `plugin/bin/lib/verify/args.js` (flags `--scope <path>`, `--base <ref>`, `--integration-branch <name>`; `USAGE`)
- Modify: `plugin/bin/lib/verify/report.js` (`composeReport` accepts `scope` and includes it on the report when non-null)
- Modify: `plugin/bin/verify.js` (the `--scope` flow in `main()`)
- Test: `tests/bin-lib/verify/args.test.js`, `tests/bin-lib/verify/report.test.js`, `tests/bin-lib/verify/cli.test.js`

**Interfaces:**
- Consumes: Task 2 `readDeclaration`; Task 3 `changedFiles`, `resolveBase`, `ChangedFilesError`; Task 4 `selectScope`; existing `composeStamp`/`writeStamp`/`readStamp`.
- Produces: `parseArgs` returns `scope: string|null`, `base: string|null`, `integrationBranch: string|null`; `composeReport({..., scope = null})` adds `report.scope = { mode, suites, static, base, unmatched, changedFiles }` when `scope` is not null; the CLI behaviors below.

**Behavior of `verify.js --scope <path>`** (all of it lives in `main()`, after the default-path resolution and before `runChecks`):

1. `readDeclaration(parsed.scope)`; on `ok: false` print each error and `USAGE` to stderr, exit 2, write nothing.
2. `stamp = gitDir ? readVerifyStamp(gitDir) : null`.
3. `resolvedBase = resolveBase({ stamp, integrationBranch: parsed.integrationBranch, base: parsed.base })` — on `ChangedFilesError` print its message + `USAGE` to stderr, exit 2.
4. `{ files } = changedFiles({ base: resolvedBase })`.
5. `sel = selectScope({ decl, files, stamp })` (when `decl` is null, `sel.mode` is `full` and steps 6-8 reduce to today's behavior).
6. Usage check (only when `decl` is non-null): every `--cmd` name must be `types`, `lint`, or a member of `decl.suites` — otherwise stderr `--scope: --cmd "{name}" is not types, lint, or a declared suite ({list})` + `USAGE`, exit 2, write nothing (AC5).
7. Filter: keep `types`/`lint` only when `sel.static`; keep a suite check when `sel.suites === '*'` or `sel.suites.includes(name)`. In tool-scoped mode, drop any caller `tests` entry and append `{ name: 'tests', command: decl.checks.tests.replace(/\{base\}/g, resolvedBase) }` (only when `sel.mode === 'tool-scoped'`).
8. `mode === 'none'`: run nothing — `results = []`, `report.pass = true` (an empty check set passes), print the scope line plus `still-verified: bookkeeping-only delta ({files joined by ", "})`, then the (empty) table and `report:` line; write the stamp (step 10) and exit 0.
9. Otherwise run the filtered set through `runChecks` exactly as today.
10. Stamp write (replaces today's block): `report.pass && fullSet && !parsed.noStamp && gitDir && git.sha && !parsed.gitDir` where `fullSet` = no check `skipped` (an empty set counts as full); fields: `scope: sel.mode`; when `sel.mode === 'full'` → `fullSha: git.sha, base: null, changedFiles: []`; otherwise → `fullSha: sel.base, base: resolvedBase, changedFiles: files`; `suitesRun` = names of the checks actually run that are neither `types` nor `lint`. Without `--scope` the block is byte-for-byte today's (scope `full`, `fullSha: git.sha`, `base: null`, `changedFiles: []`).
11. Scope line, printed before the table: `Scope: {mode} — {n} changed file(s) since {base-short}; suites: {list or none}; static: {yes|no}; unmatched: {n}` where `base-short` is the first 9 chars of `resolvedBase`, `list` is `sel.suites === '*' ? 'all' : sel.suites.join(', ')`. Printed only under `--scope`.
12. `composeReport({..., scope: sel ? { mode: sel.mode, suites: sel.suites, static: sel.static, base: resolvedBase, unmatched: sel.unmatched, changedFiles: files } : null })`.

- [ ] **Step 1: Write the failing tests**

(a) Append to `tests/bin-lib/verify/args.test.js` (reuse its existing require):

```js
test('--scope, --base, and --integration-branch parse as value flags (#1922)', () => {
  const p = parseArgs(['--cmd', 'tests=node -e 0', '--scope', '.claude-tweaks/verify-scope.json', '--base', 'abc', '--integration-branch', 'main']);
  assert.strictEqual(p.scope, '.claude-tweaks/verify-scope.json');
  assert.strictEqual(p.base, 'abc');
  assert.strictEqual(p.integrationBranch, 'main');
  const d = parseArgs(['--cmd', 'tests=node -e 0']);
  assert.strictEqual(d.scope, null); assert.strictEqual(d.base, null); assert.strictEqual(d.integrationBranch, null);
  assert.throws(() => parseArgs(['--cmd', 'tests=x', '--scope']), UsageError);
  for (const flag of ['--scope', '--base', '--integration-branch']) assert.ok(USAGE.includes(flag), flag);
});
```

Also update the pre-existing exact-shape `deepStrictEqual` assertion in that file (the one the #1921 work already widened with `gitDir`/`stampStatus`/`noStamp`) by adding `scope: null, base: null, integrationBranch: null`.

(b) Append to `tests/bin-lib/verify/report.test.js`:

```js
test('composeReport carries a scope object when given one and omits it otherwise (#1922)', () => {
  const git = { sha: 'abc', dirty: false };
  const checks = [{ name: 'tests', command: 'x', exitCode: 0, durationMs: 1, logPath: '/l' }];
  const without = composeReport({ checks, startedAt: 't', durationMs: 1, git });
  assert.ok(!('scope' in without));
  const scope = { mode: 'scoped', suites: ['api'], static: true, base: 'fff', unmatched: [], changedFiles: ['apps/api/a.ts'] };
  const withScope = composeReport({ checks, startedAt: 't', durationMs: 1, git, scope });
  assert.deepStrictEqual(withScope.scope, scope);
});
```

(c) Append to `tests/bin-lib/verify/cli.test.js` (reuse `tmpGitRepo`, `runCli`, `tmpDir`; add a helper):

```js
// A declaration file inside a temp repo, plus a marker-touching "unit" command
// so a test can prove a suite was or was not spawned.
function scopedRepo(rules, extra = {}) {
  const r = tmpGitRepo();
  const marker = path.join(r.repo, 'unit-ran.marker');
  const decl = { checks: { tests: { unit: 'placeholder' } }, rules, ...extra };
  fs.mkdirSync(path.join(r.repo, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(r.repo, '.claude-tweaks', 'verify-scope.json'), JSON.stringify(decl));
  r.git('add', '.claude-tweaks/verify-scope.json');
  r.git('commit', '-q', '-m', 'declare verify scope');
  const unitCmd = `node -e "require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')"`;
  // The temp repo has no origin, so --integration-branch names its own local
  // branch — whatever init.defaultBranch made it (master on this machine).
  const branch = r.git('symbolic-ref', '--short', 'HEAD').trim();
  return { ...r, marker, unitCmd, branch, declPath: '.claude-tweaks/verify-scope.json' };
}

function stampOf(gitDir) {
  return JSON.parse(fs.readFileSync(path.join(gitDir, 'claude-tweaks-verify-pass.json'), 'utf8'));
}

function commitFile(r, rel, content) {
  fs.mkdirSync(path.dirname(path.join(r.repo, rel)), { recursive: true });
  fs.writeFileSync(path.join(r.repo, rel), content);
  r.git('add', rel);
  r.git('commit', '-q', '-m', `add ${rel}`);
}

test('--scope: full → none → scoped across three commits, anchored to the first full pass (#1922 AC4)', async () => {
  const r = scopedRepo([
    { match: 'src/**', suites: ['unit'], static: true },
    { match: 'docs/**', suites: [], static: false },
  ]);
  const args = ['--scope', r.declPath, '--integration-branch', r.branch, '--cmd', `unit=${r.unitCmd}`];

  const run1 = await runCli(args, { cwd: r.repo });
  assert.strictEqual(run1.code, 0, run1.stderr);
  assert.match(run1.stdout, /^Scope: full/m);
  const s1 = stampOf(r.gitDir);
  assert.strictEqual(s1.scope, 'full');
  assert.strictEqual(s1.fullSha, r.git('rev-parse', 'HEAD').trim());
  assert.ok(fs.existsSync(r.marker), 'run 1 must spawn unit');
  fs.unlinkSync(r.marker);

  commitFile(r, 'docs/a.md', 'docs');
  const run2 = await runCli(args, { cwd: r.repo });
  assert.strictEqual(run2.code, 0, run2.stderr);
  assert.match(run2.stdout, /^Scope: none — 1 changed file\(s\) since/m);
  assert.match(run2.stdout, /still-verified: bookkeeping-only delta \(docs\/a\.md\)/);
  const s2 = stampOf(r.gitDir);
  assert.strictEqual(s2.scope, 'none');
  assert.strictEqual(s2.fullSha, s1.fullSha);
  assert.strictEqual(s2.base, s1.fullSha);
  assert.deepStrictEqual(s2.suitesRun, []);
  assert.deepStrictEqual(s2.changedFiles, ['docs/a.md']);
  assert.ok(!fs.existsSync(r.marker), 'run 2 must not spawn unit');
  const report2 = JSON.parse(fs.readFileSync(s2.reportPath, 'utf8'));
  assert.strictEqual(report2.scope.mode, 'none');
  assert.strictEqual(report2.pass, true);

  commitFile(r, 'src/a.js', 'module.exports = 1;');
  const run3 = await runCli(args, { cwd: r.repo });
  assert.strictEqual(run3.code, 0, run3.stderr);
  assert.match(run3.stdout, /^Scope: scoped — 2 changed file\(s\) since/m);
  const s3 = stampOf(r.gitDir);
  assert.strictEqual(s3.scope, 'scoped');
  assert.deepStrictEqual(s3.suitesRun, ['unit']);
  assert.strictEqual(s3.base, s1.fullSha);
  assert.strictEqual(s3.fullSha, s1.fullSha);
  assert.deepStrictEqual(s3.changedFiles, ['docs/a.md', 'src/a.js']);
  assert.ok(fs.existsSync(r.marker), 'run 3 must spawn unit');
});

test('--scope: an unmatched path fails closed to a full run and is listed as unmatched (#1922)', async () => {
  const r = scopedRepo([{ match: 'docs/**', suites: [], static: false }]);
  const args = ['--scope', r.declPath, '--integration-branch', r.branch, '--cmd', `unit=${r.unitCmd}`];
  await runCli(args, { cwd: r.repo });
  fs.unlinkSync(r.marker);
  commitFile(r, 'mystery/x.txt', 'x');
  const run = await runCli(args, { cwd: r.repo });
  assert.strictEqual(run.code, 0, run.stderr);
  assert.match(run.stdout, /^Scope: full — 1 changed file\(s\) since .*unmatched: 1/m);
  assert.ok(fs.existsSync(r.marker));
  const s = stampOf(r.gitDir);
  assert.strictEqual(s.scope, 'full');
  assert.strictEqual(s.fullSha, r.git('rev-parse', 'HEAD').trim(), 'a full run advances fullSha');
  const report = JSON.parse(fs.readFileSync(s.reportPath, 'utf8'));
  assert.deepStrictEqual(report.scope.unmatched, ['mystery/x.txt']);
});

test('--scope: a --cmd name that is neither types/lint nor a declared suite exits 2 naming it, and writes no stamp (#1922 AC5)', async () => {
  const r = scopedRepo([{ match: 'src/**', suites: ['unit'], static: true }]);
  const run = await runCli(['--scope', r.declPath, '--integration-branch', r.branch, '--cmd', 'smoke=node -e 0'], { cwd: r.repo });
  assert.strictEqual(run.code, 2);
  assert.match(run.stderr, /smoke/);
  assert.match(run.stderr, /usage:/);
  assert.ok(!fs.existsSync(path.join(r.gitDir, 'claude-tweaks-verify-pass.json')));
});

test('--scope: a declaration with an unknown suite in a rule exits 2 naming the rule index and suite, and writes no stamp (#1922 AC6)', async () => {
  const r = scopedRepo([{ match: 'src/**', suites: ['nope'], static: true }]);
  const run = await runCli(['--scope', r.declPath, '--integration-branch', r.branch, '--cmd', `unit=${r.unitCmd}`], { cwd: r.repo });
  assert.strictEqual(run.code, 2);
  assert.match(run.stderr, /rules\[0\].*nope/);
  assert.ok(!fs.existsSync(path.join(r.gitDir, 'claude-tweaks-verify-pass.json')));
  assert.ok(!fs.existsSync(r.marker));
});

test('--scope with no declaration file behaves as a full run and stamps full (#1922)', async () => {
  const r = tmpGitRepo();
  const branch = r.git('symbolic-ref', '--short', 'HEAD').trim();
  const run = await runCli(['--scope', '.claude-tweaks/verify-scope.json', '--integration-branch', branch, '--cmd', 'tests=node -e 0'], { cwd: r.repo });
  assert.strictEqual(run.code, 0, run.stderr);
  assert.match(run.stdout, /^Scope: full/m);
  assert.strictEqual(stampOf(r.gitDir).scope, 'full');
});

test('--scope tool-scoped: {base} is substituted into the single tests command and fullSha never advances (#1922 Gotchas)', async () => {
  const r = tmpGitRepo();
  const out = path.join(r.repo, 'base-seen.txt');
  const decl = {
    checks: { tests: `node -e "require('fs').writeFileSync(${JSON.stringify(out)}, '{base}')"` },
    rules: [{ match: 'src/**', suites: [], static: true }, { match: 'docs/**', suites: [], static: false }],
  };
  fs.mkdirSync(path.join(r.repo, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(r.repo, '.claude-tweaks', 'verify-scope.json'), JSON.stringify(decl));
  r.git('add', '.claude-tweaks/verify-scope.json');
  r.git('commit', '-q', '-m', 'declare');
  const args = ['--scope', '.claude-tweaks/verify-scope.json', '--integration-branch', r.git('symbolic-ref', '--short', 'HEAD').trim()];
  const run1 = await runCli(args, { cwd: r.repo });
  assert.strictEqual(run1.code, 0, run1.stderr);
  const s1 = stampOf(r.gitDir);
  assert.strictEqual(s1.scope, 'full');
  commitFile(r, 'src/a.js', '1');
  const run2 = await runCli(args, { cwd: r.repo });
  assert.strictEqual(run2.code, 0, run2.stderr);
  assert.match(run2.stdout, /^Scope: tool-scoped/m);
  assert.strictEqual(fs.readFileSync(out, 'utf8'), s1.fullSha, 'the resolved base replaced {base}');
  const s2 = stampOf(r.gitDir);
  assert.strictEqual(s2.scope, 'tool-scoped');
  assert.strictEqual(s2.fullSha, s1.fullSha);
  assert.strictEqual(s2.base, s1.fullSha);
  assert.deepStrictEqual(s2.suitesRun, ['tests']);
});

test('--scope: an unresolvable base exits 2 with a ChangedFilesError message, never an empty diff (#1922 AC3 posture)', async () => {
  const r = tmpGitRepo();
  fs.mkdirSync(path.join(r.repo, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(r.repo, '.claude-tweaks', 'verify-scope.json'), JSON.stringify({ checks: { tests: 'x' }, rules: [] }));
  const run = await runCli(['--scope', '.claude-tweaks/verify-scope.json', '--integration-branch', 'no-such-branch', '--cmd', 'tests=node -e 0'], { cwd: r.repo });
  assert.strictEqual(run.code, 2);
  assert.match(run.stderr, /could not resolve a base/);
});
```

Note: every temp repo has no `origin`, so `--integration-branch` is passed the repo's own current branch name (read via `git symbolic-ref --short HEAD`) — `init.defaultBranch` is `master` on this machine and must never be assumed.

- [ ] **Step 2: Run the probe to verify it fails**

Run: `node -e "const a=require('/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/bin/lib/verify/args.js'); a.parseArgs(['--cmd','tests=x','--scope','s.json'])"`
Expected: FAIL — throws `UsageError: unknown flag: --scope`. Then the three suites (`args`, `report`, `cli`) show the new tests failing.

- [ ] **Step 3: Implement**

(a) `args.js`: add `'--scope', '--base', '--integration-branch'` to `VALUE_FLAGS`; add `let scope = null; let base = null; let integrationBranch = null;`; route the three values in the same `if (flag === ...)` ladder; include them in the returned object; extend `USAGE`'s run form with ` [--scope <path>] [--base <ref>] [--integration-branch <name>]`. Nothing else changes.

(b) `report.js`: `composeReport({ checks, startedAt, durationMs, git, testCountRegression = null, scope = null })`; after the `testCountRegression` line add `if (scope !== null) report.scope = scope;`.

(c) `verify.js`: add the requires
```js
const { readDeclaration } = require('./lib/verify/declaration');
const { changedFiles, resolveBase, ChangedFilesError } = require('./lib/verify/changed-files');
const { selectScope } = require('./lib/verify/scope');
```
and, in `main()`, replace the block from `const startedAt = new Date().toISOString();` through the stamp-write block with this shape (keep every existing comment that still applies; the count-stamp block in the middle is unchanged):

```js
  // --scope (#1922): declaration → changed files since the anchor → pure
  // selection → filtered check set. Without --scope every value below is
  // its full-run default and the run is byte-for-byte today's.
  let sel = null;
  let resolvedBase = null;
  let files = [];
  let cmds = parsed.cmds;
  if (parsed.scope) {
    const read = readDeclaration(parsed.scope);
    if (!read.ok) {
      process.stderr.write(`${read.errors.join('\n')}\n${USAGE}\n`);
      process.exitCode = 2;
      return;
    }
    const decl = read.decl;
    const priorStamp = gitDir ? readVerifyStamp(gitDir) : null;
    try {
      resolvedBase = resolveBase({ stamp: priorStamp, integrationBranch: parsed.integrationBranch, base: parsed.base });
    } catch (err) {
      if (!(err instanceof ChangedFilesError)) throw err;
      process.stderr.write(`--scope: ${err.message}\n${USAGE}\n`);
      process.exitCode = 2;
      return;
    }
    files = changedFiles({ base: resolvedBase }).files;
    sel = selectScope({ decl, files, stamp: priorStamp });
    if (decl) {
      const allowed = new Set(['types', 'lint', ...decl.suites]);
      const bad = parsed.cmds.find((c) => !allowed.has(c.name));
      if (bad) {
        process.stderr.write(`--scope: --cmd "${bad.name}" is not types, lint, or a declared suite (${decl.suites.join(', ')})\n${USAGE}\n`);
        process.exitCode = 2;
        return;
      }
      cmds = parsed.cmds.filter((c) => {
        if (c.name === 'types' || c.name === 'lint') return sel.static;
        if (sel.mode === 'tool-scoped') return false;
        return sel.suites === '*' || sel.suites.includes(c.name);
      });
      if (sel.mode === 'tool-scoped') {
        cmds = cmds.concat([{ name: 'tests', command: decl.checks.tests.replace(/\{base\}/g, resolvedBase) }]);
      }
    }
  }

  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const results = sel && sel.mode === 'none' ? [] : (await runChecks({ cmds, logDir })).map(enrich);
  const git = gitInfo();

  // [count-stamp block unchanged]

  const report = composeReport({
    checks: results, startedAt, durationMs: Date.now() - startMs, git, testCountRegression,
    scope: sel ? { mode: sel.mode, suites: sel.suites, static: sel.static, base: resolvedBase, unmatched: sel.unmatched, changedFiles: files } : null,
  });
  writeJsonAtomic(jsonPath, report);

  // [stamp comment block unchanged, plus:] Under --scope the stamp's scope
  // names exactly what ran; only a full run advances fullSha (#1922).
  const fullSet = results.every((c) => !c.skipped);
  if (report.pass && fullSet && !parsed.noStamp && gitDir && git.sha && !parsed.gitDir) {
    const suitesRun = results.filter((c) => c.name !== 'types' && c.name !== 'lint').map((c) => c.name);
    const mode = sel ? sel.mode : 'full';
    const stamp = composeStamp({
      report, scope: mode,
      fullSha: mode === 'full' ? git.sha : sel.base,
      base: mode === 'full' ? null : resolvedBase,
      changedFiles: mode === 'full' ? [] : files,
      suitesRun, flakyRetried: [], reportPath: path.resolve(jsonPath), at: new Date().toISOString(),
    });
    try { writeStamp(gitDir, stamp); } catch { /* best-effort; next --stamp-status simply reads absent */ }
  }

  const lines = [];
  if (sel) {
    const suiteList = sel.suites === '*' ? 'all' : (sel.suites.length ? sel.suites.join(', ') : 'none');
    lines.push(`Scope: ${sel.mode} — ${files.length} changed file(s) since ${String(resolvedBase).slice(0, 9)}; suites: ${suiteList}; static: ${sel.static ? 'yes' : 'no'}; unmatched: ${sel.unmatched.length}`);
    if (sel.mode === 'none') lines.push(`still-verified: bookkeeping-only delta (${files.join(', ')})`);
    lines.push('');
  }
  lines.push('| Check | Status | Duration | Summary |', '|---|---|---|---|');
```

(the rest of the table/report-line printing is unchanged; `composeReport`'s `pass` over an empty check set is `true` by `Array.prototype.every`, which is what `mode: none` relies on).

- [ ] **Step 4: Run the four verify suites**

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/args.test.js" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/report.test.js" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/cli.test.js" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/verify/snippet-conformance.test.js"`
Expected: PASS — every pre-existing `cli.test.js` case unmodified (AC7)

- [ ] **Step 5: Mutation probe** — temporarily make a scoped run write `fullSha: git.sha`; confirm AC4's run-3 `fullSha` assertion goes red; restore. Confirm no stamp file leaked into this repo's own git dir: `ls "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.git/worktrees/design-1904-pipeline-ceremony/"`.

- [ ] **Step 6: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" add plugin/bin/lib/verify/args.js plugin/bin/lib/verify/report.js plugin/bin/verify.js tests/bin-lib/verify/args.test.js tests/bin-lib/verify/report.test.js tests/bin-lib/verify/cli.test.js
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" commit -m "verify.js --scope: declaration-driven check filtering, none short-circuit, scope line, scope-labelled stamp anchored to fullSha (refs #1922)" -m "Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB"
```

---

### Task 6: Docs — `plugin-structure.md` rows and the `policy-schema.md` sibling-file note

**Files:**
- Modify: `docs/plugin-structure.md` (line 40 `plugin/bin/lib/verify/` row; line 125 verify CLI row)
- Modify: `plugin/skills/_shared/policy-schema.md` (one sentence after the paragraph at line 5 that begins "`.claude-tweaks/policy.yml` is the canonical **and only** home")

- [ ] **Step 1: Measure the ceiling file**

Run: `wc -c "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills/_shared/policy-schema.md"`
Expected: `38433` (40,960-byte ceiling — the note below must be ≤ 250 bytes)

- [ ] **Step 2: Edit `docs/plugin-structure.md`**

In the line-40 row, after the `stamp.js (…)` clause insert `, declaration.js (#1922 — readDeclaration parses/validates .claude-tweaks/verify-scope.json, every invalid field named; a missing file is decl null = mode full), changed-files.js (#1922 — changedFiles: committed diff since a base ∪ working tree, renames→new path, deletions→old path; resolveBase: explicit --base, else the stamp's fullSha when an ancestor of HEAD, else the integration-branch merge-base, else ChangedFilesError — never an empty set), scope.js (#1922 — selectScope, the pure first-match-wins rule: unmatched fails closed to every suite + static; modes full | scoped | static-only | none | tool-scoped; anchored to fullSha)`.

In the line-125 row, add to the flag list after `[--git-dir <dir>]`: ` [--scope <path> [--base <ref>] [--integration-branch <name>]]`, and append to the description: `; --scope reads the project's verify-scope.json, computes changed files since the last full pass (the stamp's fullSha), runs only the selected checks (a --cmd outside types/lint/declared suites is a usage error), prints a Scope: line, writes a stamp whose scope names what ran (only a full run advances fullSha; none runs nothing and still stamps), and adds a scope object to report.json; tool-scoped mode substitutes {base} into checks.tests and runs that one command`.

- [ ] **Step 3: Edit `plugin/skills/_shared/policy-schema.md`**

Append this sentence to the end of the paragraph at line 5: ` Sibling file: \`.claude-tweaks/verify-scope.json\` — \`verify.js --scope\`'s path-to-suite declaration (#1922); not a policy key, never read by \`resolve-policy.js\`.`

- [ ] **Step 4: Verify**

Run: `wc -c "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/plugin/skills/_shared/policy-schema.md"`
Expected: ≤ 38700

Run: `node --test "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/bin-lib/skill-audit/context-cost.test.js" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony/tests/policy-schema-metadata.test.js"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" add docs/plugin-structure.md plugin/skills/_shared/policy-schema.md
git -C "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/design-1904-pipeline-ceremony" commit -m "Document the verify scope engine modules, --scope, and the verify-scope.json sibling file (refs #1922)" -m "Claude-Session: https://claude.ai/code/session_01L9hhTyzis8dqW87Qhy96DB"
```

---

### Task 7: Full-suite run through the runner (AC8)

**Files:** none modified.

- [ ] **Step 1: Run the full suite from the worktree in the foreground**

Run: `node "/Users/thomasholknielsen/.claude/plugins/cache/claude-tweaks-marketplace/claude-tweaks/6.116.0/bin/verify.js" --log-dir "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.git/worktrees/design-1904-pipeline-ceremony/claude-tweaks-verify" --count-stamp "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.git/worktrees/design-1904-pipeline-ceremony/claude-tweaks-test-count.json" --cmd tests="npm test"`
Expected: exit 1 with exactly the 4 pre-existing baseline failures (`tests/bin-lib/reconcile/reap-merged.test.js` ×3, `tests/impeccable-cli-contract.test.js:35`) and no other `not ok` line — `grep "^not ok" .../claude-tweaks-verify/tests.log` confirms the set.

---

## Self-review

- **Spec coverage:** `globToRegExp` export (T1); `declaration.js` incl. every named error, missing-file → null, flaky bounds (T2); `changed-files.js` union rules, rename/deletion mapping, `resolveBase` three cases + explicit `--base` + legacy stamp anchor + `ChangedFilesError` (T3); `scope.js` every branch incl. `static-only`, ordering, unmatched fail-closed, tool-scoped, no-stamp → full, `fullSha` anchor (T4); `--scope`/`--base`/`--integration-branch`, `--cmd` usage check (AC5), unknown-suite exit 2 with no stamp (AC6), `none` short-circuit + `still-verified` line, scope line, scoped stamp with `fullSha` carried (AC4), tool-scoped `{base}` substitution + `fullSha` unchanged, `report.json.scope`, AC7 unmodified cases (T5); docs rows + sibling note (T6); AC8 (T7).
- **Placeholder scan:** none.
- **Type consistency:** `readDeclaration` returns `decl.suites`/`decl.toolScoped`/`decl.rules[].suites`/`decl.checks.tests` exactly as `scope.js` and `verify.js` read them; `resolveBase({stamp, integrationBranch, base})` matches both call sites; `selectScope({decl, files, stamp})` returns `base` as the stamp anchor while `verify.js` writes `base: resolvedBase` (the same value by construction when the anchor was usable — AC4's run 3 pins `base === fullSha`).
