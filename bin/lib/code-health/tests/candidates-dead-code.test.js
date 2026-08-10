'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { candidatesDeadCode, scanStats, computeEntrypoints, extractExports } = require('../candidates-dead-code');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codehealth-deadcode-'));
}

function write(root, relPath, content) {
  const abs = path.join(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function initGit(root) {
  execFileSync('git', ['-C', root, 'init', '-q']);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@test.com']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Test']);
}

function sortCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const ak = `${a.file}#${a.symbol || ''}#${a.kind}`;
    const bk = `${b.file}#${b.symbol || ''}#${b.kind}`;
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });
}

// ─── AC1 + AC2 + entrypoint + gitignore: the full fixture tree ────────────────
//
// One fixture, one assertion on the exact candidate set — not a count
// (IL-78/IL-105: a count-based check passes on wrong membership). Every file
// in this tree is deliberately unambiguous (AC6): no re-export or
// dynamic-require proximity to the export/orphan fixtures being asserted
// dead, so the deliberately conservative heuristic cannot also miss them.

function buildFixtureTree() {
  const root = tmp();
  initGit(root);

  // Entrypoint: direct child of bin/. References live.js's export by bare
  // name, and references computed.js so computed.js is not itself orphan.
  write(root, 'bin/entry.js', [
    "const { liveFn } = require('../live.js');",
    "require('../computed.js');",
    // dead.js is required (so the FILE is referenced, keeping it out of the
    // orphan-file bucket) but only for a side effect — its exported
    // `deadFn` is never named, so the unreferenced-export check is what
    // must catch it, not orphan-file.
    "require('../dead.js');",
    'liveFn();',
  ].join('\n') + '\n');

  // Implicit entrypoint: bin/lib/hooks/*.js, loaded only via bin/hooks.js's
  // string-keyed require — nothing statically requires it. Must never be
  // flagged despite looking exactly like an orphan file to a static scan.
  write(root, 'bin/lib/hooks/myhook.js', [
    "'use strict';",
    'function handle() { return true; }',
    'module.exports = { handle };',
  ].join('\n') + '\n');

  // Live: referenced (by bare name) from bin/entry.js — not flagged.
  write(root, 'live.js', [
    'function liveFn() { return 1; }',
    'module.exports = { liveFn };',
  ].join('\n') + '\n');

  // Dead: exported, referenced nowhere else in the tree — flagged
  // unreferenced-export.
  write(root, 'dead.js', [
    'function deadFn() { return 2; }',
    'module.exports = { deadFn };',
  ].join('\n') + '\n');

  // Orphan: nobody's static require/import specifier resolves to this file
  // — flagged orphan-file (and NOT also as unreferenced-export for its own
  // symbol; the orphan finding subsumes it).
  write(root, 'orphan.js', [
    'function helper() { return 3; }',
    'module.exports = { helper };',
  ].join('\n') + '\n');

  // Gitignored: would read as dead-export if scanned at all — must never
  // appear in the source-file list, let alone the candidate set.
  write(root, '.gitignore', 'ignored.js\n');
  write(root, 'ignored.js', [
    'function secretFn() { return 4; }',
    'module.exports = { secretFn };',
  ].join('\n') + '\n');

  // Dynamic pattern (computed require) + barrel re-export beyond one hop —
  // AC2: produces no candidate for its own content, and does not crash the
  // run. Referenced from bin/entry.js so it isn't independently orphan,
  // isolating the assertion to "the dynamic/barrel content itself is inert".
  write(root, 'computed.js', [
    "const name = 'live';",
    "module.exports = require('./' + name + '.js');",
  ].join('\n') + '\n');

  // NUL-byte / binary-ish tolerance (Gotchas: "a NUL byte or encoding
  // oddity... makes grep go silent while reads succeed"). Must not crash,
  // must not appear in the candidate set either way.
  fs.writeFileSync(path.join(root, 'binary.js'), Buffer.from('const x \0= 1;\n'));

  return root;
}

test('candidatesDeadCode: fixture tree yields exactly the dead export + orphan file, nothing else', () => {
  const root = buildFixtureTree();
  const candidates = candidatesDeadCode(root);

  const expected = sortCandidates([
    {
      file: 'dead.js',
      symbol: 'deadFn',
      kind: 'unreferenced-export',
    },
    {
      file: 'orphan.js',
      kind: 'orphan-file',
    },
  ]);

  const actual = sortCandidates(candidates).map((c) => ({
    file: c.file,
    ...(c.symbol ? { symbol: c.symbol } : {}),
    kind: c.kind,
  }));

  assert.deepStrictEqual(actual, expected);

  // Every candidate must carry non-empty evidence — the shape the judge
  // reads as its material, per the module's documented return shape.
  for (const c of candidates) {
    assert.ok(typeof c.evidence === 'string' && c.evidence.length > 0, `${c.file} candidate must carry evidence`);
  }
});

test('candidatesDeadCode: live export referenced by bare name from another file is never flagged', () => {
  const root = buildFixtureTree();
  const candidates = candidatesDeadCode(root);
  assert.ok(
    !candidates.some((c) => c.file === 'live.js'),
    'live.js exports liveFn, referenced from bin/entry.js — must not appear in the candidate set at all',
  );
});

test('candidatesDeadCode: gitignored file never reaches the scan, let alone the candidate set', () => {
  const root = buildFixtureTree();
  const candidates = candidatesDeadCode(root);
  assert.ok(
    !candidates.some((c) => c.file === 'ignored.js'),
    'ignored.js is covered by .gitignore and must never be flagged even though secretFn looks dead',
  );
});

test('candidatesDeadCode: entrypoint files (bin/*.js and bin/lib/hooks/*.js) are never flagged', () => {
  const root = buildFixtureTree();
  const candidates = candidatesDeadCode(root);
  assert.ok(
    !candidates.some((c) => c.file === 'bin/entry.js'),
    'bin/entry.js is a direct child of bin/ — an entrypoint by convention, never flagged',
  );
  assert.ok(
    !candidates.some((c) => c.file === 'bin/lib/hooks/myhook.js'),
    'bin/lib/hooks/myhook.js is loaded only via bin/hooks.js\'s string-keyed require — the implicit-entrypoint rule must cover it',
  );
});

test('candidatesDeadCode: dynamic require and barrel re-export produce no candidate and do not crash', () => {
  const root = buildFixtureTree();
  // The whole run must complete without throwing (AC2's "no crash" half).
  const candidates = candidatesDeadCode(root);
  assert.ok(
    !candidates.some((c) => c.file === 'computed.js'),
    'computed.js is referenced from bin/entry.js, and its own module.exports = require(...) barrel line yields ' +
      'no extractable export names — it must not appear in the candidate set',
  );
});

test('candidatesDeadCode: a NUL-byte file is skipped entirely, never flagged, never crashes the run', () => {
  const root = buildFixtureTree();
  const candidates = candidatesDeadCode(root);
  assert.ok(
    !candidates.some((c) => c.file === 'binary.js'),
    'binary.js contains a NUL byte and must be skipped, not flagged as orphan or unreferenced-export',
  );
});

test('scanStats: reports scanned/binary-skipped counts distinct from a clean-tree zero-candidate result', () => {
  const root = buildFixtureTree();
  const stats = scanStats(root);
  // 7 tracked/untracked-not-ignored source files: bin/entry.js,
  // bin/lib/hooks/myhook.js, live.js, dead.js, orphan.js, computed.js,
  // binary.js — ignored.js must not be among them (gitignored).
  assert.strictEqual(stats.scannedFiles, 7);
  assert.strictEqual(stats.binarySkipped, 1, 'binary.js is the one NUL-byte file');
});

// ─── computeEntrypoints ─────────────────────────────────────────────────────

test('computeEntrypoints: direct children of bin/ are entrypoints, nested bin/lib/*.js (non-hooks) are not', () => {
  const root = tmp();
  write(root, 'bin/cli.js', 'module.exports = {};\n');
  write(root, 'bin/lib/util.js', 'module.exports = {};\n');
  const files = [
    path.join(root, 'bin', 'cli.js'),
    path.join(root, 'bin', 'lib', 'util.js'),
  ];
  const entrypoints = computeEntrypoints(root, files);
  assert.ok(entrypoints.has(files[0]), 'bin/cli.js must be an entrypoint');
  assert.ok(!entrypoints.has(files[1]), 'bin/lib/util.js is not a direct bin/ child and not a hooks module — not an entrypoint');
});

test('computeEntrypoints: files referenced by hooks/hooks.json are entrypoints', () => {
  const root = tmp();
  write(root, 'hooks/hooks.json', JSON.stringify({ PreToolUse: 'bin/hooks.js' }));
  write(root, 'bin/hooks.js', 'module.exports = {};\n');
  const files = [path.join(root, 'bin', 'hooks.js')];
  const entrypoints = computeEntrypoints(root, files);
  assert.ok(entrypoints.has(files[0]), 'bin/hooks.js is referenced from hooks/hooks.json and must be an entrypoint');
});

test('computeEntrypoints: package.json bin/main/exports fields resolve to entrypoints when present', () => {
  const root = tmp();
  write(root, 'package.json', JSON.stringify({ main: 'index.js', bin: { mytool: 'bin/mytool.js' } }));
  write(root, 'index.js', 'module.exports = {};\n');
  write(root, 'bin/mytool.js', '#!/usr/bin/env node\n');
  const files = [path.join(root, 'index.js'), path.join(root, 'bin', 'mytool.js')];
  const entrypoints = computeEntrypoints(root, files);
  assert.ok(entrypoints.has(files[0]), 'package.json main must resolve to an entrypoint');
  assert.ok(entrypoints.has(files[1]), 'package.json bin.mytool must resolve to an entrypoint');
});

// ─── extractExports ─────────────────────────────────────────────────────────

test('extractExports: single-line module.exports with a rename extracts the public key, not the local name', () => {
  const names = extractExports("function foo() {}\nmodule.exports = { publicName: foo };\n");
  assert.deepStrictEqual(names, ['publicName']);
});

test('extractExports: multi-line module.exports extracts bare identifiers one per line', () => {
  const text = [
    'function a() {}',
    'function b() {}',
    'module.exports = {',
    '  a,',
    '  b,',
    '};',
  ].join('\n');
  assert.deepStrictEqual(new Set(extractExports(text)), new Set(['a', 'b']));
});

test('extractExports: exports.NAME = assignments are extracted', () => {
  const text = "exports.foo = function () {};\nexports.bar = 1;\n";
  assert.deepStrictEqual(new Set(extractExports(text)), new Set(['foo', 'bar']));
});

test('extractExports: ESM named function/const/class exports are extracted', () => {
  const text = [
    'export function foo() {}',
    'export const bar = 1;',
    'export class Baz {}',
  ].join('\n');
  assert.deepStrictEqual(new Set(extractExports(text)), new Set(['foo', 'bar', 'Baz']));
});

test('extractExports: a barrel re-export (module.exports = require(...)) yields no names', () => {
  assert.deepStrictEqual(extractExports("module.exports = require('./other.js');\n"), []);
});
