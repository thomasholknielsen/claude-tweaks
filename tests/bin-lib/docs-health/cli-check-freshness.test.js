'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'docs-health.js');

function makeTmpGitRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-cli-check-freshness-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
  return root;
}

test('check-freshness reports a missing tracked path', () => {
  const root = makeTmpGitRoot();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  const target = path.join(root, 'docs', 'tracked.md');
  fs.writeFileSync(target, '---\nfiles:\n  - src/nope.ts\n---\n\n# Doc\n');
  const out = execFileSync('node', [CLI, 'check-freshness', target, '--root', root], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.deepStrictEqual(parsed.result.missing, ['src/nope.ts']);
});

test('check-freshness reports no staleness with no prior audit cursor', () => {
  const root = makeTmpGitRoot();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const x = 1;\n');
  execFileSync('git', ['add', 'src/a.ts'], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', 'add a.ts'], { cwd: root });
  const target = path.join(root, 'docs', 'tracked.md');
  fs.writeFileSync(target, '---\nfiles:\n  - src/a.ts\n---\n\n# Doc\n');
  const out = execFileSync('node', [CLI, 'check-freshness', target, '--root', root], { encoding: 'utf8' });
  const parsed = JSON.parse(out);
  assert.deepStrictEqual(parsed.result.stale, []);
});

test('check-freshness exits 2 with no path argument', () => {
  const result = spawnSync('node', [CLI, 'check-freshness']);
  assert.strictEqual(result.status, 2);
});

test('check-freshness exits 1 for a missing file', () => {
  const root = makeTmpGitRoot();
  const result = spawnSync('node', [CLI, 'check-freshness', path.join(root, 'docs', 'nope.md'), '--root', root]);
  assert.strictEqual(result.status, 1);
});

// Regression: cmdCheckFreshness read fs.readFileSync(targetPath, 'utf8')
// using the raw, unresolved targetPath instead of resolving it against
// --root the way deriveDocId's own path.resolve(root, targetPath) correctly
// does. A relative targetPath invoked from a cwd other than --root (the
// exact "audit a project elsewhere" scenario --root exists to support)
// failed with "could not read file" even though the file genuinely exists
// under --root.
test('check-freshness resolves a relative path against --root, not the invoking cwd', () => {
  const root = makeTmpGitRoot();
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'tracked.md'), '---\nfiles:\n  - src/nope.ts\n---\n\n# Doc\n');

  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-health-cli-check-freshness-elsewhere-'));
  const out = execFileSync(
    'node', [CLI, 'check-freshness', 'docs/tracked.md', '--root', root],
    { cwd: elsewhere, encoding: 'utf8' },
  );
  const parsed = JSON.parse(out);
  assert.deepStrictEqual(parsed.result.missing, ['src/nope.ts']);
});
