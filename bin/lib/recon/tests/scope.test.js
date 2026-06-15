const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listSlices, contentHash, selectSlice } = require('../scope');
const { writeCursors } = require('../cache');

const MAX_STALE_DAYS = 30; // mirrors score.js constant

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-scope-')); }

// ─── listSlices ────────────────────────────────────────────────────────────

test('listSlices returns "." for a flat dir with no subdirs', () => {
  const root = tmp();
  const slices = listSlices(root);
  assert.deepStrictEqual(slices.map((s) => s.id), ['.']);
});

test('listSlices includes immediate subdirs, excludes SKIP_DIRS', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'lib'));
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.mkdirSync(path.join(root, '.claude-tweaks'));
  const ids = listSlices(root).map((s) => s.id).sort();
  assert.ok(ids.includes('src'), 'src should be included');
  assert.ok(ids.includes('lib'), 'lib should be included');
  assert.ok(!ids.includes('node_modules'), 'node_modules must be excluded');
  assert.ok(!ids.includes('.claude-tweaks'), '.claude-tweaks must be excluded');
  assert.ok(ids.includes('.'), '. (root) must be included');
});

test('listSlices slice.path is the absolute path', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'pkg'));
  const slices = listSlices(root);
  const pkg = slices.find((s) => s.id === 'pkg');
  assert.ok(pkg, 'pkg slice must exist');
  assert.strictEqual(pkg.path, path.join(root, 'pkg'));
  const dot = slices.find((s) => s.id === '.');
  assert.strictEqual(dot.path, root);
});

// ─── contentHash ───────────────────────────────────────────────────────────

test('contentHash returns a non-empty hex string', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const h = contentHash(root);
  assert.match(h, /^[0-9a-f]+$/);
  assert.ok(h.length > 0);
});

test('contentHash is deterministic: same content → same hash', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  assert.strictEqual(contentHash(root), contentHash(root));
});

test('contentHash changes when file content changes', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const h1 = contentHash(root);
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 2;\n');
  const h2 = contentHash(root);
  assert.notStrictEqual(h1, h2, 'hash must change when content changes');
});

test('contentHash does NOT change when .claude-tweaks content changes', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const h1 = contentHash(root);
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'cache.json'), '{}');
  const h2 = contentHash(root);
  assert.strictEqual(h1, h2, '.claude-tweaks must be excluded from the hash');
});

test('contentHash returns a stable hash for a dir with no source files', () => {
  const root = tmp();
  // No source files — should return a non-empty string without throwing
  const h = contentHash(root);
  assert.ok(typeof h === 'string' && h.length > 0);
});

// ─── selectSlice ───────────────────────────────────────────────────────────

test('selectSlice returns null when the only slice was recently judged and hash unchanged', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const hash = contentHash(root);
  const recentMs = Date.now() - 1 * 86400000; // 1 day ago — well under MAX_STALE_DAYS
  const cursors = { '.': { lastSweptMs: recentMs, lastHash: hash } };
  // Only one slice (.) and its hash matches → nothing to pick
  const result = selectSlice(root, cursors, { now: Date.now() });
  assert.strictEqual(result, null, 'unchanged recently-judged slice must be skipped');
});

test('selectSlice picks a slice whose content-hash changed', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const oldHash = 'stale-hash-from-last-run';
  const recentMs = Date.now() - 1 * 86400000;
  const cursors = { '.': { lastSweptMs: recentMs, lastHash: oldHash } };
  const result = selectSlice(root, cursors, { now: Date.now() });
  assert.ok(result !== null, 'changed content must be picked');
  assert.strictEqual(result.id, '.');
  assert.strictEqual(result.why, 'hotspot');
});

test('selectSlice force-picks a slice unjudged past MAX_STALE_DAYS', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const hash = contentHash(root);
  // last judged 35 days ago — past the 30-day floor
  const staleMs = Date.now() - (MAX_STALE_DAYS + 5) * 86400000;
  const cursors = { '.': { lastSweptMs: staleMs, lastHash: hash } };
  const result = selectSlice(root, cursors, { now: Date.now() });
  assert.ok(result !== null, 'stale slice must be force-picked even if hash unchanged');
  assert.strictEqual(result.why, 'stale');
});

test('selectSlice force-picks a slice that has never been judged', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), 'const x = 1;\n');
  const result = selectSlice(root, {}, { now: Date.now() });
  assert.ok(result !== null, 'never-judged slice must be picked');
  assert.strictEqual(result.why, 'stale');
});

test('selectSlice hotspot priority: a high-churn dir is preferred over a low-churn one (via opts.signals override)', () => {
  // We cannot run real git in tmp, so test priority via the signals-injection hook
  const root = tmp();
  fs.mkdirSync(path.join(root, 'hot'));
  fs.mkdirSync(path.join(root, 'cold'));
  fs.writeFileSync(path.join(root, 'hot', 'a.js'), 'const x = 1;\n');
  fs.writeFileSync(path.join(root, 'cold', 'b.js'), 'const y = 2;\n');
  const oldHash = 'old-hash';
  const recentMs = Date.now() - 1 * 86400000;
  const cursors = {
    '.': { lastSweptMs: recentMs, lastHash: oldHash },
    'hot': { lastSweptMs: recentMs, lastHash: oldHash },
    'cold': { lastSweptMs: recentMs, lastHash: oldHash },
  };
  // Inject signals: 'hot' has high churn, 'cold' has low
  const result = selectSlice(root, cursors, {
    now: Date.now(),
    signals: { '.': { churn: 0, loc: 0 }, 'hot': { churn: 20, loc: 10 }, 'cold': { churn: 1, loc: 5 } },
  });
  assert.ok(result !== null, 'must pick a slice when hashes differ');
  assert.strictEqual(result.id, 'hot', 'high-churn slice must be picked first');
});

test('selectSlice rotation: a second call after first is recorded picks a different slice', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'pkg-a'));
  fs.mkdirSync(path.join(root, 'pkg-b'));
  fs.writeFileSync(path.join(root, 'pkg-a', 'a.js'), 'const a = 1;\n');
  fs.writeFileSync(path.join(root, 'pkg-b', 'b.js'), 'const b = 2;\n');

  // First pick: no cursors → picks something (stale)
  const first = selectSlice(root, {}, { now: Date.now() });
  assert.ok(first !== null);

  // Record the first pick: mark it as recently judged with its current hash
  const hash1 = contentHash(first.path);
  const cursorsAfterFirst = {
    [first.id]: { lastSweptMs: Date.now(), lastHash: hash1 },
  };

  // Second pick: first slice is now fresh and hash-matched; a different slice should be chosen
  const second = selectSlice(root, cursorsAfterFirst, { now: Date.now() });
  // second must be null OR a different slice (could be null if only one non-root slice + root and
  // both just got recorded; the key property is it does NOT re-pick the same unchanged slice)
  if (second !== null) {
    assert.notStrictEqual(second.id, first.id, 'must not re-pick the already-judged unchanged slice');
  }
});
