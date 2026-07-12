const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CLI = path.resolve(__dirname, '..', '..', '..', 'journey-health.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-cli-next-')); }

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
