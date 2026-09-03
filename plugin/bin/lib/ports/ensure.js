// bin/lib/ports/ensure.js — turns Unit 1's registry on for a project (#1792).
// Called from SessionStart when the `port-services` policy resolves
// non-empty: allocates (idempotently) a block for this checkout, then
// decides whether that block is still trustworthy — see isRegionCurrent's
// header comment for the "stale region vs bound port" rule this exists to
// implement.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const registry = require('./registry');
const { blockFree } = require('./probe');
const { readManagedRegion } = require('./env-file');
const { runGit } = require('../hooks/git-exec');

function defaultResolveRoot(cwd) {
  const { stdout, failure } = runGit(['rev-parse', '--show-toplevel'], cwd);
  return failure ? null : stdout;
}

function sameServices(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

// A checkout's .env.local managed region is CURRENT iff it exists, parses,
// its PORT value equals this lease's own base, AND the registry's persisted
// services list for this lease matches what THIS run is asking for. Anything
// else (region absent, unparseable, base mismatch, or a changed service
// list) is STALE — see #1792's Technical Approach for why: a changed
// `port-services` list moves URLs the same way a foreign-takeover
// reallocation does, so it gets the same loud treatment, not a silent skip.
function isRegionCurrent(checkoutRoot, base, leaseServices, policyServices) {
  let text;
  try {
    text = fs.readFileSync(path.join(checkoutRoot, '.env.local'), 'utf8');
  } catch {
    return false;
  }
  const region = readManagedRegion(text);
  if (!region) return false;
  const portEntry = region.find(([k]) => k === 'PORT');
  if (!portEntry || Number(portEntry[1]) !== base) return false;
  return sameServices(leaseServices, policyServices);
}

// (cwd, { home, policyServices, probe, resolveRoot }) ->
//   Promise<{ active: false } | { active: true, base, ports, vars, reallocated: {from,to}|null, envWriteError }>
async function ensure(cwd, {
  home = os.homedir(),
  policyServices = [],
  probe = blockFree,
  resolveRoot = defaultResolveRoot,
} = {}) {
  if (!policyServices.length) return { active: false };

  const checkoutRoot = resolveRoot(cwd);
  if (!checkoutRoot) return { active: false };

  // Staleness must be judged from the .env.local content and the registry
  // lease as they stand BEFORE this call touches anything — registry.allocate
  // rewrites .env.local unconditionally (even on its idempotent no-new-lease
  // path, since a caller may have edited/deleted the file out from under a
  // still-valid lease), so calling it first would destroy the very evidence
  // (an absent or mismatched region) this staleness check needs to read.
  const realPath = fs.realpathSync(checkoutRoot);
  const existing = registry.status({ home });
  const existingEntry = Object.entries(existing.leases).find(([, lease]) => lease.path === realPath);

  let reallocated = null;
  let result;

  if (!existingEntry) {
    result = await registry.allocate(checkoutRoot, { services: policyServices, home, probe });
  } else {
    const [baseStr, lease] = existingEntry;
    const base = Number(baseStr);
    const stillFree = await probe(base, { size: registry.BLOCK_SIZE });
    if (stillFree) {
      result = await registry.allocate(checkoutRoot, { services: policyServices, home, probe });
    } else if (isRegionCurrent(checkoutRoot, base, lease.services, policyServices)) {
      // Bound, but the region is current — assume it's this checkout's own
      // already-running dev server, not a foreign takeover. Keep the lease.
      result = await registry.allocate(checkoutRoot, { services: policyServices, home, probe });
    } else {
      result = await registry.reallocate(checkoutRoot, { services: policyServices, home, probe });
      reallocated = { from: base, to: result.base };
    }
  }

  return {
    active: true,
    base: result.base,
    ports: result.ports,
    vars: result.vars,
    reallocated,
    envWriteError: result.envWriteError,
  };
}

module.exports = { ensure, isRegionCurrent };
