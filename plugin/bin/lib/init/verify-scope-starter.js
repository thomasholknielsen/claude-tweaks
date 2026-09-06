// plugin/bin/lib/init/verify-scope-starter.js — /claude-tweaks:init's starter
// .claude-tweaks/verify-scope.json (#1924): detect the workspace, propose one
// suite per test-bearing package, map shared packages to every suite and the
// pipeline's own bookkeeping paths to nothing, and report suite/workspace
// drift for `init --update`. Conservative by construction — a path is its
// package's own tree, shared, bookkeeping, or unmatched (which the engine
// fails closed to full; scope.js). Pure: every fs read goes through fsImpl.
// A `dir/**` glob walks recursively (bounded depth, node_modules/.git/dot-dirs
// skipped) for every nested package.json, distinct from `dir/*`'s direct
// children; a `.`/`./` member is always skipped (its tree is the whole repo).
// detectWorkspace also returns `skipped` — per parse-signal-discipline, a
// glob that expanded to zero directories, a directory with no or unparseable
// package.json, or a package.json with no string `name` are distinguishable
// from "this workspace legitimately has nothing here": they're surfaced, not
// silently dropped into the same empty result. A single-package repo with no
// workspace but a root `test` script still falls back to that script's
// string form (composeStarter), and diffAgainstWorkspace treats that
// string-form `suites: ['tests']` sentinel as non-extra when no package is
// actually named `tests`.
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
    if (!inList) continue;
    const m = line.match(/^\s*-\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[1];
    const quote = value[0];
    if (quote === "'" || quote === '"') {
      // A `#` inside the quoted value is content, not a comment — take
      // everything between the opening quote and its matching close.
      const close = value.indexOf(quote, 1);
      if (close === -1) continue;
      value = value.slice(1, close);
    } else {
      // Unquoted: only a `#` preceded by whitespace is a trailing comment.
      value = value.replace(/\s+#.*$/, '').trim();
    }
    if (value) globs.push(value);
  }
  return globs;
}

const MAX_WALK_DEPTH = 6;

// Recursively collect every directory (relative to root) that holds a
// package.json, starting at relDir itself, bounded to MAX_WALK_DEPTH levels
// below it and skipping node_modules/.git/dot-dirs.
function walkForPackageDirs(fsImpl, root, relDir, depth, found) {
  if (exists(fsImpl, path.join(root, relDir, 'package.json'))) found.push(relDir.replace(/\\/g, '/'));
  if (depth >= MAX_WALK_DEPTH) return;
  let entries;
  try { entries = fsImpl.readdirSync(path.join(root, relDir), { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.')) continue;
    walkForPackageDirs(fsImpl, root, `${relDir}/${e.name}`, depth + 1, found);
  }
}

// True for a glob whose member is the repo root itself (`.`, `./`, or a
// `**` rooted at it) — its tree is the whole repo, never one member among
// others, so it is skipped entirely rather than expanded or diagnosed as
// "no packages under glob" (that reason is for a glob that legitimately
// tried and found nothing, not this deliberate no-op).
function isRootGlobMember(glob) {
  const clean = glob.replace(/\/+$/, '');
  if (clean === '.' || clean === '') return true;
  if (clean.endsWith('/**')) {
    const parent = clean.slice(0, -3);
    return parent === '.' || parent === '';
  }
  return false;
}

// A literal dir, a trailing `/*` expanded to its direct children, or a
// trailing `/**` walked recursively for every nested package.json (bounded,
// dir/node_modules/.git/dot-dirs skipped). A `.`/`./` member — the repo root
// itself — is always skipped: its tree is the whole repo, never one member
// among others. Anything else with a `*` is ignored — the starter proposes,
// it never guesses.
function expandGlob(fsImpl, root, glob) {
  if (isRootGlobMember(glob)) return [];
  const clean = glob.replace(/\/+$/, '');
  if (clean.endsWith('/**')) {
    const parent = clean.slice(0, -3);
    const found = [];
    walkForPackageDirs(fsImpl, root, parent, 0, found);
    return found.sort();
  }
  if (clean.endsWith('/*')) {
    const parent = clean.slice(0, -2);
    let entries;
    try { entries = fsImpl.readdirSync(path.join(root, parent), { withFileTypes: true }); } catch { return []; }
    return entries.filter((e) => e.isDirectory()).map((e) => `${parent}/${e.name}`);
  }
  if (clean.includes('*')) return [];
  return [clean];
}

// Distinguishes "no package.json here" from "package.json exists but is not
// valid JSON" from "valid JSON but no string name" — three different reasons
// a directory contributes no package, none of which is "this glob correctly
// has nothing" (parse-signal-discipline: a merged null would hide all three).
function readPackageAt(fsImpl, root, rel) {
  let text;
  try { text = fsImpl.readFileSync(path.join(root, rel, 'package.json'), 'utf8'); } catch { return { reason: 'no package.json' }; }
  let pkg;
  try { pkg = JSON.parse(text); } catch { return { reason: 'unparseable package.json' }; }
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg) || typeof pkg.name !== 'string') return { reason: 'package.json has no name' };
  return { pkg };
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
  const skipped = [];
  for (const glob of globs) {
    if (isRootGlobMember(glob)) continue;
    const expanded = expandGlob(fsImpl, root, glob);
    if (expanded.length === 0) { skipped.push({ glob, reason: 'no packages under glob' }); continue; }
    for (const rel of expanded) {
      const { pkg, reason } = readPackageAt(fsImpl, root, rel);
      if (reason) { skipped.push({ path: rel.replace(/\\/g, '/'), reason }); continue; }
      const test = pkg.scripts && pkg.scripts.test;
      packages.push({
        name: pkg.name,
        path: rel.replace(/\\/g, '/'),
        hasTest: typeof test === 'string' && test.trim() !== '',
        dependencies: Object.keys(pkg.dependencies || {}),
      });
    }
  }
  return { tool, packages, skipped };
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
    else if (script('test')) checks.tests = script('test');
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
// checks.tests declares the single suite `tests`, which matches no package —
// that sentinel is never reported as an extra suite unless some package is
// actually (confusingly) named `tests`.
function diffAgainstWorkspace(decl, workspace) {
  const packages = workspace && Array.isArray(workspace.packages) ? workspace.packages : [];
  const names = new Set(packages.map((p) => p.name));
  const declSuites = decl && Array.isArray(decl.suites) ? decl.suites : [];
  const isStringFormSentinel = declSuites.length === 1 && declSuites[0] === 'tests' && !names.has('tests');
  const suites = new Set(declSuites);
  const missingSuites = packages.filter((p) => p.hasTest && !suites.has(p.name)).map((p) => p.name);
  const extraSuites = isStringFormSentinel ? [] : [...suites].filter((s) => !names.has(s) && packages.length > 0);
  return { missingSuites, extraSuites };
}

module.exports = {
  detectWorkspace, composeStarter, diffAgainstWorkspace, BOOKKEEPING_RULES,
};
