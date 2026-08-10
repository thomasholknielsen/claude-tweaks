'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// ─── Coverage statement (read before extending this module) ─────────────────
//
// candidatesDeadCode() is the first focus-mode candidate generator
// (skills/code-health/SKILL.md's "Focus Mode" section, #271). It is a
// deterministic, grep-anchored heuristic — no AST dependency in v1 — that
// finds two shapes of dead code:
//
//   - 'unreferenced-export': a symbol exported from a file whose bare name
//     never appears, word-bounded, in any OTHER scanned file.
//   - 'orphan-file': a file that no other scanned file's static
//     require/import specifier resolves to.
//
// Explicit scope limits, stated once here rather than implied:
//   - JS/TS only (.js/.ts/.tsx/.jsx/.mjs/.cjs). Markdown is out of scope
//     entirely — prose-reachable, not import-reachable.
//   - .gitignore-respecting via `git ls-files` (tracked + untracked-but-not-
//     ignored). A non-git root falls back to an unfiltered directory walk —
//     best effort, no ignore support — logged to stderr once.
//   - Reference detection is a word-bounded BARE-SYMBOL grep across the whole
//     tree, not an import-graph walk. An unrelated identically-named
//     identifier anywhere in the tree makes a genuinely dead export read as
//     referenced. This is an accepted false-negative, chosen deliberately:
//     prefer missing a dead export over flagging a live one. The judge
//     (SKILL.md Step 5) and the verify gate (Step 7) are the second and third
//     filters.
//   - Dynamic patterns — a computed `require(x + y)`, a barrel re-export
//     beyond one hop (`module.exports = require('./other')`) — are not
//     resolved. They produce no candidate for the file(s) they touch and
//     never throw; the generator simply has nothing to say about them.
//   - `module.exports = { ... }` parsing handles this repo's dominant shape:
//     bare identifiers or `key: value` renames, one entry per line or all on
//     one line, with NO nested object/array literal as a member's value. A
//     nested literal inside the braces is out of scope (the naive
//     `[^{}]*` capture stops at the first `}`, which would be the nested
//     literal's own close, not the export block's) — such a file simply
//     yields fewer or zero extracted export names rather than crashing.
//   - Entrypoints are never flagged (neither kind) — see computeEntrypoints
//     below for the exact rule set, including the bin/lib/hooks/*.js special
//     case: those files are loaded by bin/hooks.js's string-keyed
//     `require('./lib/hooks/' + event)`, which this generator's static
//     specifier scan cannot see.
//   - A file that can't be read as clean UTF-8 (a NUL byte, or any other
//     read failure) is skipped entirely — never flagged, never crashes the
//     run. Binary-ish content is exactly the case a grep-anchored scanner
//     must not choke on.
//
// candidatesDeadCode(rootDir, opts) → [{file, symbol?, kind, evidence}]
// Pure given the tree: no network, no git writes, no mutation.

const SOURCE_EXTS = ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs'];
const SOURCE_EXT_SET = new Set(SOURCE_EXTS);
// Belt-and-suspenders even under a git-filtered file list — a root with no
// .gitignore covering these (or the git-absent fallback walk) must still
// never descend into them.
const SKIP_DIR_SEGMENTS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.turbo',
  '.claude', '.worktrees', '.claude-tweaks',
]);

// ─── File discovery ──────────────────────────────────────────────────────────

function pathSegments(relPath) {
  return relPath.split(path.sep);
}

function isSkippedRelPath(relPath) {
  return pathSegments(relPath).some((seg) => SKIP_DIR_SEGMENTS.has(seg));
}

function walkDirFallback(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (SKIP_DIR_SEGMENTS.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(abs);
      else if (entry.isFile()) out.push(path.relative(root, abs));
    }
  }
  return out;
}

// Returns absolute paths of every JS/TS source file under root, honoring
// .gitignore when root is inside a git repo (tracked + untracked-but-not-
// ignored files via `git ls-files`). Falls back to an unfiltered walk — no
// ignore support — when git is unavailable or root isn't a repo, logging
// once to stderr so a report never silently implies gitignore coverage it
// didn't have.
function listSourceFiles(root) {
  let relPaths;
  try {
    const tracked = execFileSync(
      'git', ['-C', root, 'ls-files', '-z'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 },
    );
    const untracked = execFileSync(
      'git', ['-C', root, 'ls-files', '-z', '--others', '--exclude-standard'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 },
    );
    const all = [...tracked.split('\0'), ...untracked.split('\0')].filter(Boolean);
    relPaths = [...new Set(all)];
  } catch {
    process.stderr.write(
      '[code-health] candidates-dead-code: not a git repo (or git unavailable) — ' +
      'falling back to an unfiltered directory walk with no .gitignore support\n',
    );
    relPaths = walkDirFallback(root);
  }
  return relPaths
    .filter((relPath) => SOURCE_EXT_SET.has(path.extname(relPath)))
    .filter((relPath) => !isSkippedRelPath(relPath))
    .map((relPath) => path.resolve(root, relPath))
    .sort();
}

// ─── Entrypoints ──────────────────────────────────────────────────────────────

// Recursively collects every string leaf value from a parsed JSON structure.
function collectStringLeaves(value, out) {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStringLeaves(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectStringLeaves(v, out);
  }
}

function addResolvedIfSourceFile(entrypoints, root, candidatePath) {
  if (typeof candidatePath !== 'string') return;
  if (!SOURCE_EXT_SET.has(path.extname(candidatePath))) return;
  const abs = path.resolve(root, candidatePath);
  try {
    if (fs.statSync(abs).isFile()) entrypoints.add(abs);
  } catch {
    /* referenced path doesn't exist on disk — nothing to add */
  }
}

function addEntrypointsFromJsonFile(entrypoints, root, absJsonPath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(absJsonPath, 'utf8'));
  } catch {
    return;
  }
  const leaves = [];
  collectStringLeaves(parsed, leaves);
  for (const leaf of leaves) addResolvedIfSourceFile(entrypoints, root, leaf);
}

// Entrypoints, by explicit convention (this repo's package.json declares no
// bin/main/exports fields, so those alone would find nothing here):
//   - files directly under bin/ (bin/*.js, not bin/lib/**)
//   - files referenced anywhere in hooks/hooks.json or .claude-plugin/plugin.json
//   - package.json's bin/main/exports fields, when a consumer repo has them
//   - bin/lib/hooks/*.js — implicit entrypoints loaded by bin/hooks.js's
//     string-keyed require('./lib/hooks/' + event), invisible to this
//     generator's static specifier scan
function computeEntrypoints(root, files) {
  const entrypoints = new Set();

  for (const f of files) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    if (/^bin\/[^/]+\.[^/.]+$/.test(rel)) entrypoints.add(f);
    if (/^bin\/lib\/hooks\/[^/]+\.js$/.test(rel)) entrypoints.add(f);
  }

  addEntrypointsFromJsonFile(entrypoints, root, path.join(root, 'hooks', 'hooks.json'));
  addEntrypointsFromJsonFile(entrypoints, root, path.join(root, '.claude-plugin', 'plugin.json'));

  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const leaves = [];
    collectStringLeaves(pkg.bin, leaves);
    collectStringLeaves(pkg.main, leaves);
    collectStringLeaves(pkg.exports, leaves);
    for (const leaf of leaves) addResolvedIfSourceFile(entrypoints, root, leaf);
  } catch {
    /* no package.json, or fields absent — fine, other rules still apply */
  }

  return entrypoints;
}

// ─── Export extraction ────────────────────────────────────────────────────────

const IDENT_RE = /^[A-Za-z_$][\w$]*$/;

// Extracts the set of exported symbol names a file declares, via the
// grep-anchored patterns this repo's dominant shapes actually use. See the
// module header for the nested-literal and barrel-re-export scope limits.
function extractExports(text) {
  const names = new Set();

  // module.exports = { a, b: renamed, c, } — single- or multi-line, bare
  // identifiers per entry, no nested {}/[] as a member's value.
  const meMatch = text.match(/module\.exports\s*=\s*\{([^{}]*)\}/);
  if (meMatch) {
    for (const rawEntry of meMatch[1].split(',')) {
      const entry = rawEntry.trim();
      if (!entry) continue;
      const key = entry.split(':')[0].trim();
      if (IDENT_RE.test(key)) names.add(key);
    }
  }

  for (const m of text.matchAll(/^\s*exports\.([A-Za-z_$][\w$]*)\s*=/gm)) names.add(m[1]);
  for (const m of text.matchAll(/^\s*export\s+(?:async\s+)?function\s*\*?\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of text.matchAll(/^\s*export\s+(?:const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);

  return [...names];
}

// ─── Reference resolution (for orphan-file detection) ─────────────────────────

const RELATIVE_SPECIFIER_PATTERNS = [
  /require\(\s*['"](\.[^'"]+)['"]\s*\)/g,
  /\bfrom\s+['"](\.[^'"]+)['"]/g,
  /import\(\s*['"](\.[^'"]+)['"]\s*\)/g,
];

// Static relative specifiers only ('./x', '../x') — a computed specifier
// (`'./lib/' + name`) has non-string-literal content between the parens/
// quotes and simply doesn't match any of these patterns. That is the
// intended out-of-scope behavior (module header), not a bug to fix here.
function extractRelativeSpecifiers(text) {
  const specs = [];
  for (const re of RELATIVE_SPECIFIER_PATTERNS) {
    for (const m of text.matchAll(re)) specs.push(m[1]);
  }
  return specs;
}

function resolveSpecifier(spec, fromDir) {
  const base = path.resolve(fromDir, spec);
  if (path.extname(base) && SOURCE_EXT_SET.has(path.extname(base))) {
    try {
      if (fs.statSync(base).isFile()) return base;
    } catch { /* named an extension but doesn't exist — fall through */ }
  }
  for (const ext of SOURCE_EXTS) {
    const withExt = base + ext;
    try {
      if (fs.statSync(withExt).isFile()) return withExt;
    } catch { /* try next extension */ }
  }
  for (const ext of SOURCE_EXTS) {
    const asIndex = path.join(base, 'index' + ext);
    try {
      if (fs.statSync(asIndex).isFile()) return asIndex;
    } catch { /* try next extension */ }
  }
  return null;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isReferencedElsewhere(symbol, fileTexts, exceptFile) {
  const re = new RegExp(`\\b${escapeRegExp(symbol)}\\b`);
  for (const [f, text] of fileTexts) {
    if (f === exceptFile || text == null) continue;
    if (re.test(text)) return true;
  }
  return false;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

// Shared implementation behind both public entry points below. Not exported
// directly — candidatesDeadCode's pure-array contract (see module header's
// Data/API Surface note) and scanStats' coverage-counting need are two
// different callers of the same one-pass scan, not two independent scans.
function scan(rootDir) {
  const root = path.resolve(rootDir);
  const files = listSourceFiles(root);
  const entrypoints = computeEntrypoints(root, files);

  const fileTexts = new Map(); // absPath -> string, or null when unreadable/binary
  let binarySkipped = 0;
  for (const f of files) {
    let buf;
    try {
      buf = fs.readFileSync(f);
    } catch {
      fileTexts.set(f, null);
      binarySkipped += 1;
      continue;
    }
    if (buf.includes(0)) {
      // NUL byte — binary-ish content grep would go silent on. Skip
      // entirely rather than flag or crash (module header).
      fileTexts.set(f, null);
      binarySkipped += 1;
      continue;
    }
    fileTexts.set(f, buf.toString('utf8'));
  }

  const referencedModules = new Set();
  for (const f of files) {
    const text = fileTexts.get(f);
    if (text == null) continue;
    for (const spec of extractRelativeSpecifiers(text)) {
      const resolved = resolveSpecifier(spec, path.dirname(f));
      if (resolved) referencedModules.add(resolved);
    }
  }

  const candidates = [];
  for (const f of files) {
    if (entrypoints.has(f)) continue;
    const text = fileTexts.get(f);
    if (text == null) continue;
    const relFile = path.relative(root, f).split(path.sep).join('/');

    if (!referencedModules.has(f)) {
      candidates.push({
        file: relFile,
        kind: 'orphan-file',
        evidence: `${relFile} is not the resolved target of any static relative require/import ` +
          'specifier found elsewhere in the scanned tree',
      });
      // An orphan file's own exports are moot — nothing statically loads
      // this file at all, so a per-symbol finding on top would restate the
      // same root cause under a second candidate.
      continue;
    }

    for (const symbol of extractExports(text)) {
      if (isReferencedElsewhere(symbol, fileTexts, f)) continue;
      candidates.push({
        file: relFile,
        symbol,
        kind: 'unreferenced-export',
        evidence: `"${symbol}" is exported from ${relFile} but its bare name was not found, ` +
          'word-bounded, in any other scanned file',
      });
    }
  }

  return { candidates, scannedFiles: files.length, entrypointFiles: entrypoints.size, binarySkipped };
}

function candidatesDeadCode(rootDir, opts = {}) {
  return scan(rootDir).candidates;
}

// Coverage counters for the "zero candidates" report (SKILL.md's focus-mode
// section, IL-115): scannedFiles distinguishes a genuinely clean tree (many
// files scanned, nothing dead) from a broken invocation that scanned
// effectively nothing (wrong root, git ls-files failure and empty fallback
// walk) — the two degrade to the same empty candidates array otherwise.
function scanStats(rootDir) {
  const { candidates, ...stats } = scan(rootDir);
  return stats;
}

module.exports = { candidatesDeadCode, scanStats, listSourceFiles, computeEntrypoints, extractExports };
