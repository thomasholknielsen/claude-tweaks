'use strict';
// tests/bin-lib/flow/artifact-overwrite-check.test.js — refs #2014
//
// Pins bin/lib/flow/artifact-overwrite-check.js's checkArtifactOverwrite:
// the multi-spec artifact-overwrite completion check (#786) extended to
// distinguish an append-only shared-journey edit from a real overwrite.
// Unit tests pin the small parsers directly; the synthetic-repo tests below
// build real git history (add-then-append, a same-spec self-correction, a
// shared "list reflow" edit, and a genuine cross-spec overwrite) and run the
// real algorithm against real `git log`/`git diff`/`git blame` output —
// proving the gate fires only on the overwrite shape, not merely that the
// parsers agree with themselves.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const MOD = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'flow', 'artifact-overwrite-check.js');
const {
  checkArtifactOverwrite,
  extractRefs,
  parseHunks,
  isListReflow,
} = require(MOD);

const FIXTURE_TIMEOUT_MS = 30000;

function repo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-artifact-overwrite-')));
  const git = (...a) => execFileSync('git', a, {
    cwd: dir, encoding: 'utf8', timeout: FIXTURE_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'pipe'],
  });
  git('init', '-q');
  git('config', 'user.email', 't@example.invalid');
  git('config', 'user.name', 'Test');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  const base = git('rev-parse', 'HEAD').trim();
  return { dir, git, base };
}

function write(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function commit(fx, message) {
  fx.git('add', '-A');
  fx.git('commit', '-q', '-m', message);
  return fx.git('rev-parse', 'HEAD').trim();
}

// --- Unit tests: the small parsers ---

test('extractRefs: matches a standalone "refs #N" trailer line', () => {
  const refs = extractRefs('Some subject\n\nBody text.\n\nrefs #2014');
  assert.deepStrictEqual([...refs], [2014]);
});

test('extractRefs: matches "refs #N" embedded inline in parens at end of subject (real repo shape)', () => {
  const refs = extractRefs('Fix manifesto.md mode markers (refs #1991)\n\nBody.');
  assert.deepStrictEqual([...refs], [1991]);
});

test('extractRefs: matches multiple comma-joined refs', () => {
  const refs = extractRefs('Consolidated close (refs #1988, #1989)');
  assert.deepStrictEqual([...refs].sort((a, b) => a - b), [1988, 1989]);
});

test('extractRefs: no trailer -> empty set', () => {
  assert.strictEqual(extractRefs('Just a subject, no trailer.').size, 0);
});

test('parseHunks + isListReflow: a list entry replaced by >= as many list entries is a reflow', () => {
  const diff = [
    '--- a/f.md',
    '+++ b/f.md',
    '@@ -56 +68,2 @@ files:',
    '-- Related specs: #1987, #1990.',
    '+- Step 6 added during build of #1989.',
    '+- Related specs: #1987, #1990, #1991.',
  ].join('\n');
  const hunks = parseHunks(diff);
  assert.strictEqual(hunks.length, 1);
  assert.strictEqual(hunks[0].deletedLines.length, 1);
  assert.strictEqual(hunks[0].deletedLines[0].lineNo, 56);
  assert.ok(isListReflow(hunks[0]));
});

test('parseHunks + isListReflow: deleting a non-list content line is not a reflow', () => {
  const diff = [
    '--- a/f.md',
    '+++ b/f.md',
    '@@ -4 +4 @@',
    '-First content.',
    '+Something else entirely.',
  ].join('\n');
  const hunks = parseHunks(diff);
  assert.strictEqual(hunks[0].deletedLines.length, 1);
  assert.strictEqual(isListReflow(hunks[0]), false);
});

test('parseHunks + isListReflow: a list shrinking (fewer entries added than removed) is not a reflow', () => {
  const diff = [
    '--- a/f.md',
    '+++ b/f.md',
    '@@ -10,2 +10 @@',
    '-- Entry A',
    '-- Entry B',
    '+- Entry A',
  ].join('\n');
  const hunks = parseHunks(diff);
  assert.strictEqual(isListReflow(hunks[0]), false);
});

// --- Synthetic-repo tests: the real algorithm against real git history ---

test('add-then-append history (0 deletions) passes clean', () => {
  const fx = repo();
  write(fx.dir, 'docs/journeys/demo.md', '# Demo\n\n## Step 1\nFirst content.\n');
  commit(fx, 'Add demo journey step 1 (refs #10)');
  write(fx.dir, 'docs/journeys/demo.md', '# Demo\n\n## Step 1\nFirst content.\n\n## Step 2\nSecond content.\n');
  commit(fx, 'Add demo journey step 2 (refs #11)');

  const result = checkArtifactOverwrite({ base: fx.base, paths: ['docs/journeys/'], cwd: fx.dir });
  assert.strictEqual(result.clean, true);
  assert.deepStrictEqual(result.overwrites, []);
});

test('same-spec self-correction (deletes a line it added earlier) passes clean', () => {
  const fx = repo();
  write(fx.dir, 'docs/journeys/demo.md', '# Demo\n\n## Step 1\nFirst content.\n');
  commit(fx, 'Add demo journey step 1 (refs #10)');
  write(fx.dir, 'docs/journeys/demo.md', '# Demo\n\n## Step 1\nFirst content, fixed.\n');
  commit(fx, 'Fix step 1 typo (refs #10)');

  const result = checkArtifactOverwrite({ base: fx.base, paths: ['docs/journeys/'], cwd: fx.dir });
  assert.strictEqual(result.clean, true, JSON.stringify(result.overwrites));
});

test('shared bookkeeping list reflow (a different spec reformats a running list) passes clean', () => {
  const fx = repo();
  write(fx.dir, 'docs/journeys/demo.md', [
    '# Demo',
    '',
    '## Step 1',
    'First content.',
    '',
    '## Origin',
    '- Created during build of #10.',
    '- Related specs: #11, #12.',
    '',
  ].join('\n'));
  commit(fx, 'Add demo journey (refs #10)');
  write(fx.dir, 'docs/journeys/demo.md', [
    '# Demo',
    '',
    '## Step 1',
    'First content.',
    '',
    '## Step 2',
    'Second content.',
    '',
    '## Origin',
    '- Created during build of #10.',
    '- Step 2 added during build of #11.',
    '- Related specs: #12.',
    '',
  ].join('\n'));
  commit(fx, 'Add demo journey step 2 (refs #11)');

  const result = checkArtifactOverwrite({ base: fx.base, paths: ['docs/journeys/'], cwd: fx.dir });
  assert.strictEqual(result.clean, true, JSON.stringify(result.overwrites));
});

test('cross-spec overwrite (a later spec deletes an earlier spec\'s own step content) still HARD-GATEs', () => {
  const fx = repo();
  write(fx.dir, 'docs/journeys/demo.md', '# Demo\n\n## Step 1\nFirst content.\n\n## Step 2\nSecond content.\n');
  commit(fx, 'Add demo journey steps 1-2 (refs #10)');
  write(fx.dir, 'docs/journeys/demo.md', '# Demo\n\n## Step 1\nReplaced without attribution.\n\n## Step 2\nSecond content.\n');
  commit(fx, 'Unrelated cleanup that happens to clobber step 1 (refs #12)');

  const result = checkArtifactOverwrite({ base: fx.base, paths: ['docs/journeys/'], cwd: fx.dir });
  assert.strictEqual(result.clean, false);
  assert.strictEqual(result.overwrites.length, 1);
  assert.strictEqual(result.overwrites[0].path, 'docs/journeys/demo.md');
});

test('a path with no add-then-modify shape in range is ignored (modify-only, no add)', () => {
  const fx = repo();
  write(fx.dir, 'docs/journeys/demo.md', '# Demo\nOriginal.\n');
  execFileSync('git', ['-C', fx.dir, 'add', '-A']);
  execFileSync('git', ['-C', fx.dir, 'commit', '-q', '-m', 'pre-range add (not part of the walked range)']);
  const rangeBase = execFileSync('git', ['-C', fx.dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  write(fx.dir, 'docs/journeys/demo.md', '# Demo\nChanged, but never added within range.\n');
  commit(fx, 'Modify only, refs #99');

  const result = checkArtifactOverwrite({ base: rangeBase, paths: ['docs/journeys/'], cwd: fx.dir });
  assert.strictEqual(result.clean, true);
});

test('the real #1988-#1997 journey history in this repo passes with no manual ruling (AC1)', () => {
  const repoRoot = path.join(__dirname, '..', '..', '..');
  let head;
  try {
    head = execFileSync('git', ['-C', repoRoot, 'cat-file', '-t', 'b247a02d3'], { encoding: 'utf8' }).trim();
  } catch {
    head = null;
  }
  if (head !== 'commit') {
    // The specific historical commits this AC names are not reachable in
    // whatever checkout is running the suite (a shallow clone, or a fork
    // whose history was rewritten) — skip rather than fail on an
    // environment precondition this test doesn't control.
    return;
  }
  const result = checkArtifactOverwrite({
    base: '4c6e76733',
    head: 'b247a02d3',
    paths: ['docs/journeys/compose-a-per-run-context-bundle-1988.md'],
    cwd: repoRoot,
  });
  assert.strictEqual(result.clean, true, JSON.stringify(result.overwrites));
});
