// bin/lib/policy-derived-defaults.js — the two computed-default blocks
// bin/resolve-policy.js runs after resolvePolicyConfig for keys that have no
// static schema default (`integration-model`, `merge-verification`):
// forge-detected / derived, never a literal. Extracted here (#604) so the
// integration-model -> merge-verification dedup (#559 M1 — reuse the
// already-computed integration-model instead of letting
// deriveMergeVerification's own resolveIntegrationModel() redo forge
// detection) is unit-testable via an injectable `deps` map, without a CLI
// subprocess and without a real git remote + authenticated `gh` in a temp
// repo (the non-determinism this extraction exists to avoid).
//
// production callers (bin/resolve-policy.js) pass deps.mcpReachable only —
// the two production lookups below apply unmodified otherwise. Tests inject
// deps.detectIntegrationModel (and/or deps.deriveMergeVerification) to
// observe/count calls.
//
// deps.mcpReachable (#1421) asserts the caller has already confirmed GitHub
// reachability via its own MCP probe this turn — see bin/resolve-policy.js's
// own --mcp-reachable header comment for the full contract. It forwards into
// detectIntegrationModel's mcpReachable override for the integration-model
// key, and (via resolveIntegrationModel) for merge-verification too whenever
// that key is derived in the same call.
'use strict';
const { detectIntegrationModel, resolveIntegrationModel } = require('./policy-schema');
const { deriveMergeVerification } = require('./merge-verification');

// Mutates `result` in place (same object bin/resolve-policy.js already reads
// keyed entries out of) and returns it. `keys` is the requested key list;
// `root` is the resolved repo root passed through to both lookups.
function computeDerivedDefaults(result, keys, root, deps = {}) {
  const detectModel = deps.detectIntegrationModel || detectIntegrationModel;
  const resolveModel = deps.resolveIntegrationModel || resolveIntegrationModel;
  const deriveVerification = deps.deriveMergeVerification || deriveMergeVerification;
  const mcpReachable = deps.mcpReachable === true;

  // integration-model has no static schema default (skills/_shared/integration-
  // model.md) — an absent value (not a typo'd/invalid one; `invalid: true`
  // stays visible as an error, never silently overwritten) is computed via
  // forge detection instead of a literal.
  if (keys.includes('integration-model')) {
    const entry = result['integration-model'];
    if (entry && entry.source === 'default' && !entry.invalid) {
      result['integration-model'] = { value: detectModel(root, { mcpReachable }), source: 'default' };
    }
  }

  // merge-verification (#559) has no static schema default either — an absent
  // value (never an invalid one; `invalid: true` stays visible) is derived by
  // bin/lib/merge-verification.js's four-branch ladder, whose prose statement
  // of record is skills/_shared/policy-schema-coverage.md's coverage block.
  if (keys.includes('merge-verification')) {
    const entry = result['merge-verification'];
    if (entry && entry.source === 'default' && !entry.invalid) {
      // When mcpReachable is set, always build a fresh integrationModel dep
      // that forwards it, regardless of whether integration-model is also in
      // keys — reusing this call's own integration-model result (the
      // avoid-running-forge-detection-twice optimization below) is only safe
      // when mcpReachable is false, since a bare fallback to
      // deriveMergeVerification's internal resolveIntegrationModel(root) with
      // no opts would silently drop the flag (the `gh` probe would run
      // despite the caller's assertion). Correctness beats the
      // micro-optimization here.
      const modelEntry = result['integration-model'];
      const mvDeps = mcpReachable
        ? { integrationModel: (r) => resolveModel(r, { mcpReachable }) }
        : keys.includes('integration-model') && modelEntry && typeof modelEntry.value === 'string'
          ? { integrationModel: () => modelEntry.value }
          : {};
      result['merge-verification'] = { value: deriveVerification(root, mvDeps), source: 'default' };
    }
  }

  return result;
}

module.exports = { computeDerivedDefaults };
