'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const { ensure, isRegionCurrent } = require('../../../plugin/bin/lib/ports/ensure');
const { registryPath } = require('../../../plugin/bin/lib/ports/registry');
const { writeEnvFiles, serviceVars } = require('../../../plugin/bin/lib/ports/env-file');

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ports-ensure-'));
}
function tmpCheckout(home, name) {
  const p = path.join(home, 'checkouts', name);
  fs.mkdirSync(p, { recursive: true });
  return p;
}
function listenOn(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

test('ensure: empty policyServices is a no-op, no registry file created', async () => {
  const home = tmpHome();
  const checkout = tmpCheckout(home, 'a');
  const result = await ensure(checkout, { home, policyServices: [], resolveRoot: () => checkout });
  assert.deepEqual(result, { active: false });
  assert.equal(fs.existsSync(registryPath({ home })), false);
});

test('ensure: an unresolvable checkout root is a no-op', async () => {
  const home = tmpHome();
  const result = await ensure('/nowhere', { home, policyServices: ['web'], resolveRoot: () => null });
  assert.deepEqual(result, { active: false });
});

// AC3. `probe: async () => true` avoids real socket use — this test's
// assertion is about registry/env-file bookkeeping, not bind detection,
// and the shared 20000+ pool range otherwise contends with the tests below
// (and registry.test.js's) when multiple test FILES run concurrently.
test('ensure: fresh registry activates, returns the leased block, writes .env.local', async () => {
  const home = tmpHome();
  const checkout = tmpCheckout(home, 'fresh');
  const result = await ensure(checkout, { home, policyServices: ['web', 'api'], resolveRoot: () => checkout, probe: async () => true });
  assert.equal(result.active, true);
  assert.equal(result.reallocated, null);
  assert.deepEqual(result.vars, [['CLAUDE_TWEAKS_LEASE', String(result.base)], ['PORT', String(result.base)], ['API_PORT', String(result.base + 1)]]);
  const envLocal = fs.readFileSync(path.join(checkout, '.env.local'), 'utf8');
  assert.match(envLocal, new RegExp(`PORT=${result.base}`));
});

// AC4: lease present, a port bound, but the .env.local region is current -> keep the lease.
test('ensure: a bound port with a current region keeps the lease (assumed to be our own dev server)', async () => {
  const home = tmpHome();
  const checkout = tmpCheckout(home, 'current-region');
  // Fake probe for the initial allocation only — no real port needed until
  // the actual bind-detection assertion below, which uses the real probe.
  const first = await ensure(checkout, { home, policyServices: ['web'], resolveRoot: () => checkout, probe: async () => true });
  assert.equal(first.reallocated, null);

  const server = await listenOn(first.base);
  try {
    const second = await ensure(checkout, { home, policyServices: ['web'], resolveRoot: () => checkout });
    assert.equal(second.reallocated, null);
    assert.equal(second.base, first.base);
  } finally {
    server.close();
  }
});

// AC5: lease present, a port bound, and the region is absent -> reallocate.
test('ensure: a bound port with no managed region reallocates to a fresh block', async () => {
  const home = tmpHome();
  const checkout = tmpCheckout(home, 'stale-region');
  const first = await ensure(checkout, { home, policyServices: ['web'], resolveRoot: () => checkout, probe: async () => true });
  fs.rmSync(path.join(checkout, '.env.local'));

  const server = await listenOn(first.base);
  try {
    const second = await ensure(checkout, { home, policyServices: ['web'], resolveRoot: () => checkout });
    assert.deepEqual(second.reallocated, { from: first.base, to: second.base });
    assert.notEqual(second.base, first.base);
    const envLocal = fs.readFileSync(path.join(checkout, '.env.local'), 'utf8');
    assert.match(envLocal, new RegExp(`PORT=${second.base}`));
  } finally {
    server.close();
  }
});

test('ensure: a bound port with a region for a DIFFERENT service list reallocates (a changed port-services list moves URLs too)', async () => {
  const home = tmpHome();
  const checkout = tmpCheckout(home, 'changed-services');
  const first = await ensure(checkout, { home, policyServices: ['web'], resolveRoot: () => checkout, probe: async () => true });
  // Region on disk still says services=['web'], but this run asks for ['web','api'] —
  // isRegionCurrent must catch the services mismatch even though PORT still matches.
  const server = await listenOn(first.base);
  try {
    const second = await ensure(checkout, { home, policyServices: ['web', 'api'], resolveRoot: () => checkout });
    assert.deepEqual(second.reallocated, { from: first.base, to: second.base });
  } finally {
    server.close();
  }
});

test('isRegionCurrent: false when .env.local is missing, has no region, has the wrong PORT, or a different services list', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ports-region-'));
  assert.equal(isRegionCurrent(dir, 20000, ['web'], ['web']), false, 'no .env.local at all');

  fs.writeFileSync(path.join(dir, '.env.local'), 'FOO=bar\n');
  assert.equal(isRegionCurrent(dir, 20000, ['web'], ['web']), false, 'no managed region');

  writeEnvFiles(dir, serviceVars(['web'], 20010));
  assert.equal(isRegionCurrent(dir, 20000, ['web'], ['web']), false, 'PORT does not match the given base');
  assert.equal(isRegionCurrent(dir, 20010, ['web'], ['web']), true, 'base and services both match');
  assert.equal(isRegionCurrent(dir, 20010, ['web'], ['api']), false, 'lease services differ from policyServices');
});
