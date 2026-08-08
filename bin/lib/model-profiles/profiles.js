// bin/lib/model-profiles/profiles.js
//
// Canonical work-profile data. The markdown table in
// skills/_shared/subagent-output-contract.md §Model Selection is pinned to
// PROFILES by bin/lib/model-profiles/tests/table-pinning.test.js — change
// them together or the suite goes red.
'use strict';

const PROFILES = {
  fast: { model: 'haiku', effort: null },
  standard: { model: 'sonnet', effort: 'high' },
  capable: { model: 'opus', effort: 'high' },
  frontier: { model: 'fable', effort: 'high', singletonOnly: true, degradeTo: 'capable' },
};

const EFFORT_SCALE = ['low', 'medium', 'high', 'xhigh', 'max'];

// The four policy.yml keys the resolver reads. #219 pins policy-schema.js
// registration against this export — the names here are authoritative.
const POLICY_KEYS_READ = ['model-profiles', 'model-stance', 'model-ceiling', 'frontier-run-cap'];

function effortLine(effort) {
  if (!effort) return '';
  return `[Effort: ${effort} — apply ${effort}-level reasoning depth to this task.]`;
}

module.exports = { PROFILES, EFFORT_SCALE, POLICY_KEYS_READ, effortLine };
