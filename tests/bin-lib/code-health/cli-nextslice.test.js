const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { contentHash, sliceRecursive } = require('../../../plugin/bin/lib/code-health/scope');

const CLI = path.resolve(__dirname, '..', '..', '..', 'plugin', 'bin', 'code-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'codehealth-ns-')); }
function runNextSlice(args, root) {
  const raw = execFileSync('node', [CLI, 'next-slice', '--root', root, ...args], { encoding: 'utf8' });
  return JSON.parse(raw);
}

// Cursors are now durable (health-state branch), not local disk (writeCursors
// no longer exists — see bin/lib/code-health/cache.js). readDurableState's
// read path is pure git plumbing (fetch + show), so it CAN be exercised for
// real without gh/network: seed a local bare repo as `origin`, commit the
// cursors file directly onto a `health-state` branch, and point `root`'s own
// `origin` remote at it. Only the WRITE path (gh api blob/tree/commit/ref
// calls) requires live GitHub credentials — this helper never touches it.
function seedDurableCursors(root, cursors) {
  const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codehealth-ns-bare-'));
  execFileSync('git', ['init', '--bare', '-q', bareDir]);
  const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codehealth-ns-seed-'));
  execFileSync('git', ['init', '-q', seedDir]);
  execFileSync('git', ['-C', seedDir, 'checkout', '-q', '-b', 'health-state']);
  fs.mkdirSync(path.join(seedDir, 'code-health'), { recursive: true });
  fs.writeFileSync(path.join(seedDir, 'code-health', 'cursors.json'), JSON.stringify(cursors));
  execFileSync('git', ['-C', seedDir, 'add', '-A']);
  execFileSync(
    'git',
    ['-C', seedDir, '-c', 'user.email=test@example.com', '-c', 'user.name=test', 'commit', '-q', '-m', 'seed'],
  );
  execFileSync('git', ['-C', seedDir, 'push', '-q', bareDir, 'health-state']);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', bareDir], { cwd: root });
}

test('next-slice returns a slice object for a new repo', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const result = runNextSlice([], root);
  assert.ok(result !== null, 'must pick a slice when nothing has been judged');
  assert.ok(typeof result.id === 'string');
  assert.ok(typeof result.why === 'string');
});

test('next-slice returns null when the only slice has an unchanged hash', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  // Seed with the SAME { recursive } mode the real CLI now persists for the
  // '.' slice (see cmdNextSlice's buildCursorPatch / cmdValidateFindings in
  // bin/code-health.js) — recursive:false for '.', via sliceRecursive('.').
  const hash = contentHash(root, null, { recursive: sliceRecursive('.') });
  seedDurableCursors(root, { '.': { lastSweptMs: Date.now(), lastHash: hash } });
  const result = runNextSlice([], root);
  assert.strictEqual(result, null, 'unchanged recently-judged slice must yield null');
});

test('next-slice --budget 2 returns an array of up to 2 slices', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'pkg-a'));
  fs.mkdirSync(path.join(root, 'pkg-b'));
  fs.writeFileSync(path.join(root, 'pkg-a', 'a.js'), 'const a = 1;\n');
  fs.writeFileSync(path.join(root, 'pkg-b', 'b.js'), 'const b = 2;\n');
  // No cursors → all slices are stale → budget=2 returns up to 2
  const raw = execFileSync('node', [CLI, 'next-slice', '--root', root, '--budget', '2'], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.ok(Array.isArray(result), '--budget must return an array');
  assert.ok(result.length >= 1 && result.length <= 2);
  // IDs must be unique
  const ids = result.map((s) => s.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'budget results must have unique ids');
});

test('next-slice exits 0 and writes nothing to disk', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  // A hash-matched cursor means nothing is due. Seed with the SAME
  // { recursive } mode the real CLI now persists for the '.' slice.
  const hash = contentHash(root, null, { recursive: sliceRecursive('.') });
  seedDurableCursors(root, { '.': { lastSweptMs: Date.now(), lastHash: hash } });
  // Must exit 0 even when returning null
  const raw = execFileSync('node', [CLI, 'next-slice', '--root', root], { encoding: 'utf8' });
  assert.strictEqual(JSON.parse(raw), null);
  // Cache must be untouched
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'code-health', 'cache.json')), false);
});

test('next-slice: a change inside a subdirectory does not make the "." slice look changed (regression for #66)', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  fs.mkdirSync(path.join(root, 'sub'));
  fs.writeFileSync(path.join(root, 'sub', 'b.js'), 'const y = 1;\n');
  const now = Date.now();
  // Seed BOTH slices with cursors matching their current content, using each
  // slice's own real { recursive } mode (recursive:false for '.', true for
  // 'sub') — exactly what the real CLI now persists.
  const rootHash = contentHash(root, null, { recursive: sliceRecursive('.') });
  const subHash = contentHash(path.join(root, 'sub'), null, { recursive: sliceRecursive('sub') });
  seedDurableCursors(root, {
    '.': { lastSweptMs: now, lastHash: rootHash },
    sub: { lastSweptMs: now, lastHash: subHash },
  });
  // Modify ONLY the file inside the subdirectory — the root-level a.js is untouched.
  fs.writeFileSync(path.join(root, 'sub', 'b.js'), 'const y = 2;\n');
  const result = runNextSlice([], root);
  // Before the #66 fix, '.' scanned recursively and would have picked up
  // sub/b.js's change too, making '.' look changed (and, on a score tie,
  // win the alphabetical tie-break ahead of 'sub'). After the fix, '.' only
  // covers direct root-level files, so it correctly still matches its
  // cursor and is excluded from Phase 2 — only 'sub' (whose own content
  // actually changed) is picked.
  assert.ok(result !== null, 'the changed "sub" slice should still be picked');
  assert.strictEqual(result.id, 'sub', 'a change inside "sub" must not make "." look changed instead');
});
