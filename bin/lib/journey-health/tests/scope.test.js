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
