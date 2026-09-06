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
