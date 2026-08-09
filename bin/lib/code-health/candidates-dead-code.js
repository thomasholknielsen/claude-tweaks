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

module.exports = { detectEntrypoints, extractPathLikeStrings, collectStrings, extractModuleExports, isReferenced, escapeRegExp };
