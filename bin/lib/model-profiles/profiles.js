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

const STANCES = ['economy', 'default', 'max-rigor'];
const PROFILE_ORDER = ['fast', 'standard', 'capable', 'frontier'];

function shiftEffort(effort, delta) {
  if (!effort) return effort; // fast has no dial
  const i = EFFORT_SCALE.indexOf(effort);
  const j = Math.min(Math.max(i + delta, 0), EFFORT_SCALE.length - 1);
  return EFFORT_SCALE[j];
}

function profileOfModel(model) {
  const name = PROFILE_ORDER.find((p) => PROFILES[p].model === model);
  if (!name) throw new Error(`unknown model "${model}" — not a profile family alias`);
  return name;
}

// Pure: no fs, no process, no I/O. The CLI owns all of that.
// Six stages in fixed order — table default, policy row, cliOverride, stance,
// model-ceiling, frontier gates — with the last transform that changed the
// result naming `source`.
function resolve(profile, opts = {}) {
  if (!PROFILES[profile]) throw new Error(`unknown profile "${profile}"`);
  const policy = opts.policy || {};
  const stance = opts.stance || policy['model-stance'] || 'default';
  if (!STANCES.includes(stance)) throw new Error(`unknown stance "${stance}"`);

  let model = PROFILES[profile].model;
  let effort = PROFILES[profile].effort;
  let source = 'default';

  const row = (policy['model-profiles'] || {})[profile];
  if (row) {
    if (row.model !== undefined) model = row.model;
    if (row.effort !== undefined) effort = row.effort;
    source = 'policy';
  }
  const cli = opts.cliOverride;
  if (cli) {
    if (cli.model !== undefined) model = cli.model;
    if (cli.effort !== undefined) effort = cli.effort;
    source = 'cli';
  }

  if (stance !== 'default') {
    const shifted = shiftEffort(effort, stance === 'economy' ? -1 : 1);
    if (shifted !== effort) { effort = shifted; source = 'stance'; }
    if (stance === 'economy' && profileOfModel(model) === 'frontier') {
      ({ model, effort } = { ...PROFILES.capable });
      source = 'degraded:stance';
    }
  }

  const ceiling = policy['model-ceiling'];
  if (ceiling && !cli) {
    if (!PROFILES[ceiling]) throw new Error(`unknown model-ceiling "${ceiling}"`);
    if (PROFILE_ORDER.indexOf(profileOfModel(model)) > PROFILE_ORDER.indexOf(ceiling)) {
      ({ model, effort } = { ...PROFILES[ceiling] });
      source = 'ceiling';
    }
  }

  if (profileOfModel(model) === 'frontier') {
    const cap = policy['frontier-run-cap'] !== undefined ? policy['frontier-run-cap'] : 3;
    if (opts.unattended) {
      ({ model, effort } = { ...PROFILES.capable });
      source = 'degraded:unattended';
    } else if ((opts.frontierUsed || 0) >= cap) {
      ({ model, effort } = { ...PROFILES.capable });
      source = 'degraded:cap';
    }
  }

  return { model, effort, source, effortLine: effortLine(effort) };
}

module.exports = { PROFILES, EFFORT_SCALE, POLICY_KEYS_READ, effortLine, resolve };
