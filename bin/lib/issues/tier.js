// Pure: reads a record's current colon-form risk:*/effort:* labels for
// assess-agent-autonomy's grant-check mode. The legacy code-health-prefixed
// hyphen form, bare hyphen form, and harness-health additive/restructural
// classification adapters that used to live here are retired — see
// docs/superpowers/specs/2026-07-15-assess-agent-autonomy-design.md's
// Retirements section for why each one was safe to remove (not a uniform
// reason: two were genuinely dead code, the third is redundant because its
// own producer already co-emits the canonical colon form on every issue it
// files). recommendGrants/recommendTier are also retired — grant-check
// (skills/assess-agent-autonomy/SKILL.md) replaces them as triage's
// recommendation signal.
'use strict';

const COLON_RISK_RE = /^risk:(low|medium|high)$/;
const COLON_EFFORT_RE = /^effort:(low|medium|high)$/;

function extractRiskEffort(labels) {
  const names = (labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
  const risk = names.map((n) => COLON_RISK_RE.exec(n)).find(Boolean);
  const effort = names.map((n) => COLON_EFFORT_RE.exec(n)).find(Boolean);
  return {
    riskTier: risk ? risk[1] : undefined,
    effortTier: effort ? effort[1] : undefined,
  };
}

module.exports = { extractRiskEffort };
