const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'recon.js'); // bin/recon.js

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'recon-cli-')); }
function runCli(args, root) {
  const out = execFileSync('node', [CLI, 'run', '--root', root, ...args], { encoding: 'utf8' });
  return JSON.parse(out);
}

test('run on a repo with a high-severity finding plans to file an issue', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'big.js'), 'x\n'.repeat(700)); // oversized -> high
  const res = runCli(['--area', '.'], root);
  const filed = res.plan.filter((p) => p.action === 'file');
  assert.ok(filed.length >= 1);
  assert.ok(filed[0].fingerprint.startsWith('recon-'));
  assert.ok(filed[0].payload.labels.includes('recon'));
  // cache was written (not a dry run) — contract path: .claude-tweaks/recon/cache.json
  assert.ok(fs.existsSync(path.join(root, '.claude-tweaks', 'recon', 'cache.json')));
});

test('--dry-run writes no cache and files nothing to disk', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'big.js'), 'x\n'.repeat(700));
  const res = runCli(['--area', '.', '--dry-run'], root);
  assert.ok(res.plan.some((p) => p.action === 'file'));
  assert.strictEqual(fs.existsSync(path.join(root, '.claude-tweaks', 'recon', 'cache.json')), false);
});

// IDEMPOTENCY (design §15): second run files zero new issues.
test('a second run against unchanged state files nothing new', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'big.js'), 'x\n'.repeat(700));
  const first = runCli(['--area', '.'], root);
  const filedFirst = first.summary.file;
  assert.ok(filedFirst >= 1);
  // Simulate the issues now being open: feed the filed fingerprints back as open issues.
  // --issues array shape: [{ number, state, labels, fingerprint }]
  const fps = first.plan.filter((p) => p.action === 'file').map((p) => p.fingerprint);
  const issuesFile = path.join(root, 'issues.json');
  fs.writeFileSync(issuesFile, JSON.stringify(fps.map((fp, n) => ({ number: n + 1, state: 'open', labels: ['recon'], fingerprint: fp }))));
  const second = runCli(['--area', '.', '--issues', issuesFile], root);
  assert.strictEqual(second.summary.file, 0);
  assert.ok(second.summary.skip >= filedFirst);
});

// SELF-POLLUTION (PORT.md delta #2) end-to-end: a "." run ignores its own cache dir.
test('a default "." run does not re-report findings from its own .claude-tweaks output', () => {
  const root = tmp();
  fs.writeFileSync(path.join(root, 'a.js'), '// TODO: real source todo\n');
  runCli(['--area', '.'], root); // writes .claude-tweaks/recon/cache.json
  const second = runCli(['--area', '.'], root);
  // No finding should reference a file under .claude-tweaks
  const polluted = second.plan.filter((p) => p.payload && p.payload.body.includes('.claude-tweaks'));
  assert.strictEqual(polluted.length, 0);
});
