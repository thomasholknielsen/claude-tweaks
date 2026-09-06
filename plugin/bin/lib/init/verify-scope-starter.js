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
