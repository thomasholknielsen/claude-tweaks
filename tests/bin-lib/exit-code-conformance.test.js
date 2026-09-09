// tests/bin-lib/exit-code-conformance.test.js
//
// #1903: mechanical backstop for the `require.main === module` guard
// contract (`gh-api-module-pattern` SKILL.md's CLI wrapper contract section)
// -- the guard must assign `process.exitCode = ...`, never call
// `process.exit(...)` directly, because the latter can truncate a pending
// stdout write for a piped consumer. Three prior records (#1176, #1313,
// #1535) each closed this same violation in a different `plugin/bin/*.js`
// file, found only by a manual grep sweep that missed at least one file each
// time. This test replaces the sweep with a mechanical scan of every
// `plugin/bin/**/*.js` file's own guard.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

// The two exceptions #1535's final whole-branch review verified safe:
// hooks.js's own stdout goes through a synchronous fs.writeSync(1, ...) with
// nothing pending to flush, and statusline-wrapper-source.js deliberately
// hard-stops on a child process's own exit code.
const ALLOWLIST = new Set([
  path.join('plugin', 'bin', 'hooks.js'),
  path.join('plugin', 'bin', 'lib', 'statusline-wrapper-source.js'),
]);

// Manual recursive walk -- same rationale (and shape) as
// pipeline-run-dir-arg-literal-conformance.test.js's walkFilesRelative:
// fs.readdirSync's `{ recursive: true }` needs a newer Node than this
// project's declared floor.
function walkFilesRelative(root, relBase = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, relBase), { withFileTypes: true })) {
    const rel = relBase ? path.join(relBase, entry.name) : entry.name;
    if (entry.isDirectory()) out.push(...walkFilesRelative(root, rel));
    else out.push(rel);
  }
  return out;
}

function getAllBinFiles() {
  const binDir = path.join(ROOT, 'plugin', 'bin');
  return walkFilesRelative(binDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join('plugin', 'bin', f));
}

// Naive comment stripping -- sufficient for this repo's own source, which
// never relies on a literal "//" or "/*...*/" inside a string on a line that
// also matters to this scan (the one real case in the wild,
// wrap-up-engine.js's `// Never process.exit() right after...` comment,
// would otherwise false-positive).
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// Extracts the text governed by a `require.main === module` guard: either a
// balanced `{ ... }` block, or (the dominant single-line form in this repo)
// the bare statement up to its terminating semicolon.
function extractGuard(src) {
  const m = src.match(/if\s*\(\s*require\.main\s*===\s*module\s*\)\s*/);
  if (!m) return null;
  let i = m.index + m[0].length;
  if (src[i] === '{') {
    let depth = 0;
    const start = i;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    return src.slice(start, i);
  }
  const semi = src.indexOf(';', i);
  return semi === -1 ? src.slice(i) : src.slice(i, semi + 1);
}

// A file with no `require.main === module` guard AND no `module.exports` is
// never imported for its exports -- its whole top-level body IS the entry
// point (statusline-wrapper-source.js's shape: a template script, always run
// standalone, never required as a library). A guard-less file that DOES
// export something is a pure library -- any process.exit() inside it lives
// inside a function invoked by some caller elsewhere, not an entry-point
// guard, so there is nothing here to check.
function guardRegionFor(content) {
  const guard = extractGuard(content);
  if (guard !== null) return guard;
  if (/module\.exports\b/.test(content)) return null;
  return content;
}

function findDirectProcessExit(guardText) {
  return guardText.match(/process\.exit\(/g) || [];
}

test('every require.main guard (or equivalent whole-file entry point) under plugin/bin/**/*.js sets process.exitCode, never process.exit() directly', () => {
  const files = getAllBinFiles();
  assert.ok(files.length > 50, 'sanity check: expected plugin/bin/**/*.js to contain many files');
  const violations = [];
  for (const rel of files) {
    if (ALLOWLIST.has(rel)) continue;
    const content = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    const guard = guardRegionFor(content);
    if (guard === null) continue;
    const hits = findDirectProcessExit(guard);
    if (hits.length > 0) {
      violations.push(`${rel}: ${hits.length} direct process.exit() call(s) in its entry-point guard`);
    }
  }
  assert.deepStrictEqual(
    violations,
    [],
    `plugin/bin files calling process.exit() directly instead of assigning process.exitCode (see gh-api-module-pattern SKILL.md's CLI wrapper contract):\n${violations.join('\n')}`,
  );
});

test('the allowlist names exactly the two reviewed exceptions, and each still actually needs it', () => {
  const expected = [
    path.join('plugin', 'bin', 'hooks.js'),
    path.join('plugin', 'bin', 'lib', 'statusline-wrapper-source.js'),
  ].sort();
  assert.deepStrictEqual([...ALLOWLIST].sort(), expected);
  for (const rel of ALLOWLIST) {
    const content = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    const guard = guardRegionFor(content);
    assert.ok(guard !== null, `${rel} is allowlisted but no longer has a detectable entry-point guard -- remove it from the allowlist`);
    assert.ok(
      findDirectProcessExit(guard).length > 0,
      `${rel} is allowlisted but no longer calls process.exit() directly -- remove it from the allowlist`,
    );
  }
});

test('the scanner actually detects a deliberately reintroduced violation (discrimination check)', () => {
  const clean = 'if (require.main === module) process.exitCode = run(process.argv.slice(2));';
  const dirtyBlock = 'if (require.main === module) { main(process.argv).then((code) => process.exit(code)); }';
  const dirtyOneLine = 'if (require.main === module) process.exit(run(process.argv.slice(2)));';
  const commentedOutOnly = stripComments(
    '// if (require.main === module) process.exit(1);\nif (require.main === module) process.exitCode = run();',
  );
  const libraryNoGuard = 'function run(argv) { process.exit(2); }\nmodule.exports = { run };';
  const wholeScriptNoGuard = 'try { process.exit(0); } catch { process.exit(1); }';

  assert.strictEqual(findDirectProcessExit(guardRegionFor(clean) || '').length, 0);
  assert.strictEqual(findDirectProcessExit(guardRegionFor(dirtyBlock) || '').length, 1);
  assert.strictEqual(findDirectProcessExit(guardRegionFor(dirtyOneLine) || '').length, 1);
  assert.strictEqual(findDirectProcessExit(guardRegionFor(commentedOutOnly) || '').length, 0);
  assert.strictEqual(guardRegionFor(libraryNoGuard), null);
  assert.strictEqual(findDirectProcessExit(guardRegionFor(wholeScriptNoGuard) || '').length, 2);
});
