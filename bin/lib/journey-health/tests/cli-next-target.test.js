const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'journey-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-cli-next-')); }

// Wraps `git` with a logging shim on PATH so a test can count how many times
// the CLI shells out to git (fetch/show), without needing a real GitHub-hosted
// remote. Mirrors bin/lib/harness-health/tests/cli-next-target.test.js's
// makeGitSpy.
function makeGitSpy() {
  const spyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-nt-gitspy-'));
  const logFile = path.join(spyDir, 'git-calls.log');
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(
    path.join(spyDir, 'git'),
    `#!/bin/sh\necho "$@" >> "${logFile}"\nexec "${realGit}" "$@"\n`,
  );
  fs.chmodSync(path.join(spyDir, 'git'), 0o755);
  return logFile;
}

// Seeds a real local `origin` remote with a health-state branch so
// readDurableState's `git fetch origin health-state` succeeds for real,
// without needing live GitHub credentials. Mirrors
// bin/lib/harness-health/tests/cli-next-target.test.js's seedDurableCursors.
function seedDurableCursors(root, cursors) {
  const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-nt-bare-'));
  execFileSync('git', ['init', '--bare', '-q', bareDir]);
  const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-nt-seed-'));
  execFileSync('git', ['init', '-q', seedDir]);
  execFileSync('git', ['-C', seedDir, 'checkout', '-q', '-b', 'health-state']);
  fs.mkdirSync(path.join(seedDir, 'journey-health'), { recursive: true });
  fs.writeFileSync(path.join(seedDir, 'journey-health', 'cursors.json'), JSON.stringify(cursors));
  execFileSync('git', ['-C', seedDir, 'add', '-A']);
  execFileSync(
    'git',
    ['-C', seedDir, '-c', 'user.email=test@example.com', '-c', 'user.name=test', 'commit', '-q', '-m', 'seed'],
  );
  execFileSync('git', ['-C', seedDir, 'push', '-q', bareDir, 'health-state']);
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['remote', 'add', 'origin', bareDir], { cwd: root });
}

function writeJourney(root, name) {
  const dir = path.join(root, 'docs', 'journeys');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.md`), `---\nfiles:\n  - src/${name}.tsx\n---\n\n# ${name}\n`, 'utf8');
  const filePath = path.join(root, 'src', `${name}.tsx`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '', 'utf8');
}

test('next-target returns null target and coverageScanDue:true when no journeys exist yet', () => {
  const root = tmp();
  const raw = execFileSync('node', [CLI, 'next-target', '--root', root], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.strictEqual(result.target, null);
  assert.strictEqual(result.coverageScanDue, true);
});

test('next-target defaults to the light tier and force-picks a never-audited journey', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow');
  const raw = execFileSync('node', [CLI, 'next-target', '--root', root], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.strictEqual(result.target.id, 'checkout-flow');
  assert.strictEqual(result.target.why, 'stale');
});

test('next-target --target bypasses selection with why: "manual"', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow');
  writeJourney(root, 'signup-flow');
  const raw = execFileSync('node', [CLI, 'next-target', '--target', 'signup-flow', '--root', root], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.strictEqual(result.target.id, 'signup-flow');
  assert.strictEqual(result.target.why, 'manual');
});

test('next-target --tier deep uses the deep-tier cursor field', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow');
  const raw = execFileSync('node', [CLI, 'next-target', '--tier', 'deep', '--root', root], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.strictEqual(result.target.id, 'checkout-flow');
  assert.strictEqual(result.target.why, 'stale');
});

test('next-target --budget 2 does not repeat the same deleted-file journey across multiple targets', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow');
  writeJourney(root, 'signup-flow');
  fs.rmSync(path.join(root, 'src', 'checkout-flow.tsx'));
  const raw = execFileSync('node', [CLI, 'next-target', '--budget', '2', '--root', root], { encoding: 'utf8' });
  const result = JSON.parse(raw);
  assert.strictEqual(result.targets.length, 2);
  const ids = result.targets.map((t) => t.id).sort();
  assert.deepStrictEqual(ids, ['checkout-flow', 'signup-flow']);
  assert.strictEqual(result.targets.find((t) => t.id === 'checkout-flow').why, 'deleted-file');
});

test('next-target (default no --target path) fetches durable state exactly once, not twice', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow');
  seedDurableCursors(root, {});
  const logFile = makeGitSpy();
  execFileSync('node', [CLI, 'next-target', '--root', root], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${path.dirname(logFile)}:${process.env.PATH}` },
  });
  const log = fs.readFileSync(logFile, 'utf8');
  const fetchCalls = log.split('\n').filter((line) => /(^|\s)fetch(\s|$)/.test(line)).length;
  assert.strictEqual(
    fetchCalls,
    1,
    'cmdNextTarget must call readDurableState exactly once per invocation (a second call would double the git fetch/show round-trips)',
  );
});
