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
