const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { parseJourneyFiles, listJourneys, domainChurn, selectTarget } = require('../scope');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'journey-health-scope-')); }

function writeJourney(root, name, filesFrontmatter) {
  const dir = path.join(root, 'docs', 'journeys');
  fs.mkdirSync(dir, { recursive: true });
  const frontmatter = filesFrontmatter.length
    ? `---\nfiles:\n${filesFrontmatter.map((f) => `  - ${f}`).join('\n')}\n---\n`
    : '';
  fs.writeFileSync(path.join(dir, `${name}.md`), `${frontmatter}\n# ${name}\n`, 'utf8');
  for (const relPath of filesFrontmatter) {
    const filePath = path.join(root, relPath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '', 'utf8');
  }
}

test('parseJourneyFiles returns [] when there is no frontmatter', () => {
  assert.deepStrictEqual(parseJourneyFiles('# Checkout\n\n## Steps\n'), []);
});

test('parseJourneyFiles parses a files: list', () => {
  const content = '---\nfiles:\n  - src/checkout/Cart.tsx\n  - src/checkout/Payment.tsx\n---\n\n# Checkout\n';
  assert.deepStrictEqual(parseJourneyFiles(content), ['src/checkout/Cart.tsx', 'src/checkout/Payment.tsx']);
});

test('listJourneys returns [] when docs/journeys does not exist', () => {
  const root = tmp();
  assert.deepStrictEqual(listJourneys(root), []);
});

test('listJourneys finds and parses journey files, sorted by id', () => {
  const root = tmp();
  writeJourney(root, 'signup-flow', ['src/signup/Form.tsx']);
  writeJourney(root, 'checkout-flow', ['src/checkout/Cart.tsx']);
  const journeys = listJourneys(root);
  assert.strictEqual(journeys.length, 2);
  assert.strictEqual(journeys[0].id, 'checkout-flow');
  assert.strictEqual(journeys[1].id, 'signup-flow');
  assert.deepStrictEqual(journeys[0].filesFrontmatter, ['src/checkout/Cart.tsx']);
});

test('domainChurn returns 0 when relPaths is empty', () => {
  const root = tmp();
  assert.strictEqual(domainChurn(root, [], 0), 0);
});

test('domainChurn returns 0 when git is unavailable or the path has no history', () => {
  const root = tmp();
  assert.strictEqual(domainChurn(root, ['src/nonexistent.ts'], 0), 0);
});

test('selectTarget returns null when there are no journeys', () => {
  const root = tmp();
  assert.strictEqual(selectTarget(root, {}, { now: Date.now(), tier: 'light' }), null);
});

test('selectTarget force-picks a journey unaudited past STALE_DAYS_LIGHT on the light tier', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow', ['src/checkout/Cart.tsx']);
  const now = Date.now();
  const cursors = { 'checkout-flow': { lastLightAuditMs: now - 31 * 86400000 } };
  const result = selectTarget(root, cursors, { now, tier: 'light' });
  assert.strictEqual(result.id, 'checkout-flow');
  assert.strictEqual(result.why, 'stale');
});

test('selectTarget does not force-pick a light-stale journey on the deep tier (independent thresholds)', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow', ['src/checkout/Cart.tsx']);
  const now = Date.now();
  // 31 days is past the light threshold (30) but well under the deep threshold (90),
  // and there is no churn signal, so the deep-tier pick must be null.
  const cursors = { 'checkout-flow': { lastDeepAuditMs: now - 31 * 86400000 } };
  const result = selectTarget(root, cursors, { now, tier: 'deep', signals: {} });
  assert.strictEqual(result, null);
});

test('selectTarget picks the highest-churn journey via the signals injection hook', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow', ['src/checkout/Cart.tsx']);
  writeJourney(root, 'signup-flow', ['src/signup/Form.tsx']);
  const now = Date.now();
  const cursors = {
    'checkout-flow': { lastLightAuditMs: now - 1 * 86400000 },
    'signup-flow': { lastLightAuditMs: now - 1 * 86400000 },
  };
  const result = selectTarget(root, cursors, { now, tier: 'light', signals: { 'checkout-flow': 5, 'signup-flow': 2 } });
  assert.strictEqual(result.id, 'checkout-flow');
  assert.strictEqual(result.why, 'hotspot');
  assert.strictEqual(result.churnCount, 5);
});

test('selectTarget returns null when no candidate is stale and none has churn', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow', ['src/checkout/Cart.tsx']);
  const now = Date.now();
  const cursors = { 'checkout-flow': { lastLightAuditMs: now - 1 * 86400000 } };
  const result = selectTarget(root, cursors, { now, tier: 'light', signals: {} });
  assert.strictEqual(result, null);
});

test('selectTarget force-picks a journey with a missing declared file on the light tier, ahead of staleness', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow', ['src/checkout/Cart.tsx']);
  fs.rmSync(path.join(root, 'src/checkout/Cart.tsx'));
  const now = Date.now();
  // Not stale (audited "now"), no churn signal — would otherwise return null.
  const cursors = { 'checkout-flow': { lastLightAuditMs: now } };
  const result = selectTarget(root, cursors, { now, tier: 'light', signals: {} });
  assert.strictEqual(result.id, 'checkout-flow');
  assert.strictEqual(result.why, 'deleted-file');
  assert.deepStrictEqual(result.missingFiles, ['src/checkout/Cart.tsx']);
});

test('selectTarget does not force-pick a missing-file journey on the deep tier', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow', ['src/checkout/Cart.tsx']);
  fs.rmSync(path.join(root, 'src/checkout/Cart.tsx'));
  const now = Date.now();
  const cursors = { 'checkout-flow': { lastDeepAuditMs: now } };
  const result = selectTarget(root, cursors, { now, tier: 'deep', signals: {} });
  assert.strictEqual(result, null);
});

test('selectTarget respects alreadyPicked so Phase 0 does not repeat the same deleted-file journey within a batch', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow', ['src/checkout/Cart.tsx']);
  fs.rmSync(path.join(root, 'src/checkout/Cart.tsx'));
  writeJourney(root, 'signup-flow', ['src/signup/Form.tsx']);
  const now = Date.now();
  const cursors = { 'checkout-flow': { lastLightAuditMs: now }, 'signup-flow': { lastLightAuditMs: now } };
  const alreadyPicked = new Set(['checkout-flow']);
  const result = selectTarget(root, cursors, { now, tier: 'light', signals: {}, alreadyPicked });
  assert.strictEqual(result, null);
});

// ─── caching regression tests ───────────────────────────────────────────────
// Covers the efficiency finding: selectTarget used to unconditionally
// re-list+re-read every journey file (and re-spawn `git log` per candidate in
// Phase 2) on every call, so a --budget > 1 loop redid the full scan from
// scratch on every slot even though nothing on disk changes between
// iterations of the same run.

test('listJourneys caches parsed content across calls when the directory is unchanged (regression: a --budget>1 loop must not re-read every file every slot)', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow', ['src/checkout/Cart.tsx']);
  writeJourney(root, 'signup-flow', ['src/signup/Form.tsx']);

  const originalReadFileSync = fs.readFileSync;
  let readCount = 0;
  fs.readFileSync = (...fsArgs) => {
    readCount += 1;
    return originalReadFileSync(...fsArgs);
  };
  try {
    const first = listJourneys(root);
    assert.strictEqual(readCount, 2); // one read per journey file on the cold call
    const second = listJourneys(root);
    assert.strictEqual(readCount, 2); // unchanged directory -> no additional reads
    assert.strictEqual(second, first); // cache hit returns the same array reference
    // Simulate a --budget=5 loop hitting the same unchanged directory 5 times.
    for (let i = 0; i < 3; i++) listJourneys(root);
    assert.strictEqual(readCount, 2);
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
});

test('listJourneys re-reads a journey after its content changes (cache correctly invalidates, not just wins on staleness)', () => {
  const root = tmp();
  writeJourney(root, 'checkout-flow', ['src/checkout/Cart.tsx']);
  const first = listJourneys(root);
  assert.deepStrictEqual(first[0].filesFrontmatter, ['src/checkout/Cart.tsx']);

  fs.writeFileSync(
    path.join(root, 'docs', 'journeys', 'checkout-flow.md'),
    '---\nfiles:\n  - src/checkout/Cart.tsx\n  - src/checkout/Payment.tsx\n---\n\n# checkout-flow\n',
    'utf8',
  );
  const second = listJourneys(root);
  assert.deepStrictEqual(second[0].filesFrontmatter, ['src/checkout/Cart.tsx', 'src/checkout/Payment.tsx']);
});

test('domainChurn caches identical (root, paths, sinceMs) calls instead of re-spawning git', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'a.ts'), '', 'utf8');
  execFileSync('git', ['-C', root, 'init', '-q']);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'test']);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'init']);

  const first = domainChurn(root, ['src/a.ts'], 0);
  assert.ok(first > 0);

  // Remove .git so a second, uncached call would fall through to the
  // execFileSync catch block and silently return 0 — proves the second call
  // below is served from the cache, not a fresh `git log` subprocess.
  fs.rmSync(path.join(root, '.git'), { recursive: true, force: true });
  const second = domainChurn(root, ['src/a.ts'], 0);
  assert.strictEqual(second, first);
});

test('domainChurn(root, paths, 0) counts a commit from well in the past, not just one made in the same instant as the query (regression: git --since=@0 and --since=1970-01-01 are both silently mishandled)', () => {
  // sinceMs=0 is the value rotation.js's selectByStaleThenChurn passes for any
  // never-before-audited journey (lastAuditedMs is null -> sinceMs = 0). The
  // fix must mean "since the beginning of git history," not "since whenever
  // this process happens to run." A backdated commit (via GIT_AUTHOR_DATE /
  // GIT_COMMITTER_DATE) proves this deterministically, without relying on
  // wall-clock sleep or how fast the test happens to execute: two known-bad
  // implementations both pass a naive "commit immediately before querying"
  // check yet fail this one --
  //   - new Date(0).toISOString().slice(0, 10) ("1970-01-01", no time-of-day)
  //     is parsed by git as local midnight and underflows to a pre-epoch
  //     boundary in positive-UTC-offset timezones, silently matching nothing.
  //   - git's numeric `--since=@<seconds>` epoch-literal syntax, for small
  //     second counts, is parsed by git's fuzzy approxidate grammar as an
  //     ambiguous *relative* offset from "now" rather than an absolute
  //     timestamp -- so `--since=@0` silently degrades to "since right now"
  //     once any wall-clock time at all has elapsed since the commit.
  const root = tmp();
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'b.ts'), '', 'utf8');
  execFileSync('git', ['-C', root, 'init', '-q']);
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'test']);
  execFileSync('git', ['-C', root, 'add', '.']);
  const backdated = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes in the past
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'init'], {
    env: { ...process.env, GIT_AUTHOR_DATE: backdated, GIT_COMMITTER_DATE: backdated },
  });

  const count = domainChurn(root, ['src/b.ts'], 0);
  assert.ok(count > 0, `expected the backdated commit to be counted since sinceMs=0, got ${count}`);
});
