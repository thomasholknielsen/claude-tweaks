// Pure: the mechanical Tier Rule for /claude-tweaks:triage's bare (interactive)
// invocation. Given an issue's own labels, decides which status:* tier to
// recommend. No discretionary judgment here — the recommendation is always
// subject to an explicit human batch-confirm before any label is written.
'use strict';

const RISK_RE = /^code-health:risk-(low|medium|high)$/;
const EFFORT_RE = /^code-health:effort-(low|medium|high)$/;
const HARNESS_HEALTH_CLASSIFICATION_RE = /^harness-health:(additive|restructural)$/;

function extractCodeHealthRiskEffort(names) {
  const risk = names.map((n) => RISK_RE.exec(n)).find(Boolean);
  const effort = names.map((n) => EFFORT_RE.exec(n)).find(Boolean);
  if (!risk && !effort) return null;
  return { riskTier: risk ? risk[1] : undefined, effortTier: effort ? effort[1] : undefined };
}

// harness-health has no independent risk/effort dimensions — additive/restructural
// is a single classification label. additive (safe, mechanical patch) maps both
// tiers to 'low' so it satisfies recommendTier's fast-track condition;
// restructural (needs human review) maps both to 'high' so it never does.
// harness-health:new-skill findings carry neither label and intentionally fall
// through unmatched — new-skill proposals should never be fast-track-eligible.
function extractHarnessHealthRiskEffort(names) {
  const match = names.map((n) => HARNESS_HEALTH_CLASSIFICATION_RE.exec(n)).find(Boolean);
  if (!match) return null;
  return match[1] === 'additive'
    ? { riskTier: 'low', effortTier: 'low' }
    : { riskTier: 'high', effortTier: 'high' };
}

const KIND_ADAPTERS = [extractCodeHealthRiskEffort, extractHarnessHealthRiskEffort];

function extractRiskEffort(labels) {
  const names = (labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
  for (const adapter of KIND_ADAPTERS) {
    const result = adapter(names);
    if (result) return result;
  }
  return { riskTier: undefined, effortTier: undefined };
}

function recommendTier({ riskTier, effortTier }) {
  if (riskTier === 'low' && effortTier === 'low') return 'fast-track';
  return 'approved';
}

module.exports = { extractRiskEffort, recommendTier };
