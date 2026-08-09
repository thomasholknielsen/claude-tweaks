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
//   - Reference detection is an identifier-bounded bare-symbol search across
//     every tracked, non-ignored file — an unrelated same-named identifier
//     elsewhere in the tree makes a dead export read live. Accepted
//     false-negative, per the spec's explicit policy. Bounded by the JS
//     identifier character class (which includes `$`), not by `\b`; see
//     identifierBounded below. A symbol whose own definition and only uses
//     share one line (e.g. a self-recursive function called nowhere else)
//     reads as unreferenced, since the whole line is skipped as a
//     definition — correct for the export question being asked.
//   - Reference detection is NOT transitive, and the two checks do not feed
//     each other: an export used only from a file this same scan reports as
//     an orphan still reads as referenced, because a dead file's text stays
//     in the reference-search set. Deleting an orphan can therefore expose
//     exports this run called live — one layer per run, found by re-running
//     after the removal lands, never in a single pass. Accepted false
//     negative, same conservative direction as the rest of this block.
//   - Orphan-file detection is specifier-NAME-based, not module-resolution
//     based: a file counts as referenced when any other tracked file's
//     require/import specifier ends in its basename (extension-insensitive),
//     whatever directory that specifier points at. Two same-named files in
//     different directories therefore rescue each other, and a stale
//     commented-out import rescues its target — both accepted false
//     negatives. A directory index (`x/index.js`) additionally accepts its
//     own directory's name, since `require('./x')` is the only form that
//     ever names it. Files nothing statically names but something invokes
//     externally are the entrypoint rules' job, not this function's.
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
//   - Files that cannot be read, and files containing a NUL byte (a real
//     source file can hold one in a string literal, not just a binary can),
//     are excluded from the scan entirely — never candidates, and never
//     searched for references to other files' symbols either. They are
//     reported by name and reason in `scanDeadCode`'s `skippedFiles`, so the
//     gap is visible in the coverage report rather than implied away.
//   - A test file that a runner discovers by glob or directory walk (e.g.
//     `node --test tests/`) rather than by require/import is, structurally,
//     an orphan to this scan: nothing statically names it. Whether that is
//     noise or signal is a policy question for the consuming skill, not for
//     this leaf — the generator reports what it finds, and the judge
//     (SKILL.md Step 5) is the filter of record.
//
// Why there is no `grep`/`find` subprocess here. File discovery is one
// `git ls-files` call — git's own authoritative .gitignore evaluation,
// producing one explicit file list (never a bare recursive grep, which
// silently skips gitignored files in one direction and reads them in the
// other). Everything after that runs in-process: the listed files are
// already read into memory for export extraction, so reference and orphan
// checking scan the same in-memory text with `RegExp` rather than spawning
// a second recursive tool that might disagree with git about what is
// ignored. A future reader should not go looking for a grep subprocess.
//
// Why two functions. `scanDeadCode` does the whole scan and returns the
// rich `{ candidates, scannedFiles, skippedFiles }` shape that
// focus-mode.md's zero-candidates report needs (IL-115: zero candidates on
// zero scanned files is a broken scan, not a clean repo). `candidatesDeadCode`
// is a thin wrapper returning just `.candidates`, matching the spec's pinned
// signature — needed as its own function because `JSON.stringify` of an array
// drops any extra properties hung off it, so the counts cannot ride along on
// the array that focus-mode.md's `node -e` wiring serializes.

const { execFileSync } = require('child_process');
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
      if (token === '' || !IDENTIFIER_RE.test(token)) continue;
      results.push({ symbol: token, startLine, endLine });
    }
    startRe.lastIndex = closeIdx;
  }
  return results;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Wraps an already-escaped symbol in identifier boundaries. Deliberately not
// `\b`: `$` is a legal JS identifier character (IDENTIFIER_RE accepts it) but
// a NON-word character to the regex engine, so `\b` is wrong in both
// directions around it — `\b\$fn\b` matches nothing at all (a live symbol
// would report dead), while `\bdead\b` matches inside `$dead` (a distinct
// identifier would mask a dead one). Lookarounds over the actual identifier
// character class are correct for both.
function identifierBounded(escapedSymbol) {
  return `(?<![A-Za-z0-9_$])${escapedSymbol}(?![A-Za-z0-9_$])`;
}

// True if `symbol` is used anywhere in `allFiles` in a way that is neither
// (a) its own mention inside the module.exports block it was extracted
// from (declFile + declRange), nor (b) its own function/const/let/var/class
// definition line (wherever that lives). Identifier-bounded bare-symbol
// search — an unrelated same-named identifier elsewhere reads as a reference
// (accepted false-negative, IL-79-safe: never a decorated-token match).
function isReferenced(symbol, declFile, declRange, allFiles, contentsByFile) {
  const bounded = identifierBounded(escapeRegExp(symbol));
  const symbolRe = new RegExp(bounded);
  const declPatternRe = new RegExp(`\\b(function|class)\\s+${bounded}|\\b(const|let|var)\\s+${bounded}`);
  for (const file of allFiles) {
    const text = contentsByFile.get(file);
    if (!text) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!symbolRe.test(line)) continue;
      const lineNo = i + 1;
      if (file === declFile && lineNo >= declRange.startLine && lineNo <= declRange.endLine) continue;
      if (declPatternRe.test(line)) continue;
      return true;
    }
  }
  return false;
}

// Every quoted specifier string that follows a `require(`, dynamic `import(`,
// `from `, or bare side-effect `import ` token in `text` — deliberately loose
// (matches inside a spread call, a destructured import, a comment, anywhere)
// since the only use is "does some specifier's last path segment name this
// file", not full JS parsing. A loose extra match can only make a file read as
// referenced, which is the accepted false-negative direction. The
// side-effect-only `import './x.js'` form has neither `from` nor a
// parenthesis, so it needs its own alternative — without it an
// imported-for-effect file reads as orphan, the direction the spec forbids.
// The regex is built per call (as in extractPathLikeStrings and
// extractModuleExports above) rather than hoisted: a `/g` regex carries
// mutable `lastIndex`, and module-level shared state there truncates a later
// scan if any caller ever leaves the loop early.
function referencedFileSpecifiers(text) {
  const re = /(?:require\s*\(|import\s*\(|from\s+|import\s+)\s*['"`]([^'"`]+)['"`]/g;
  const specs = [];
  let m;
  while ((m = re.exec(text))) specs.push(m[1]);
  return specs;
}

function basenameNoExt(p) {
  return path.basename(p).replace(/\.(js|ts|tsx|jsx|mjs|cjs)$/, '');
}

// True if no other file in `allFiles` require/import-references `relFile` —
// compared by exact basename-without-extension equality on the LAST path
// segment of each discovered specifier (never a substring/identifier-boundary
// regex against the whole basename, which would match a short name like "a"
// inside an unrelated word like "barrel"). A directory index additionally
// accepts its directory's own name, since `require('./lib')` names
// `lib/index.js` without the string "index" appearing anywhere.
function isFileOrphan(relFile, allFiles, contentsByFile) {
  const base = basenameNoExt(relFile);
  const names = new Set([base]);
  if (base === 'index') {
    const dirName = path.basename(path.dirname(relFile));
    if (dirName && dirName !== '.') names.add(dirName);
  }
  for (const other of allFiles) {
    if (other === relFile) continue;
    const text = contentsByFile.get(other);
    if (!text) continue;
    for (const spec of referencedFileSpecifiers(text)) {
      if (names.has(basenameNoExt(spec))) return false;
    }
  }
  return true;
}

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
// `scannedFiles` counts every tracked source file the scan considered,
// including the ones it then skipped; `skippedFiles` names that subset with
// a reason, so `scannedFiles - skippedFiles.length` is the number actually
// examined. A `scannedFiles` of 0 on a non-empty repo means discovery
// itself failed (IL-115) — which is why the count is of what git listed,
// not of what survived filtering.
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
