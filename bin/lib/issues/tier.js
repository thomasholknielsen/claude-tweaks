// Pure: the mechanical Tier Rule for /claude-tweaks:triage's bare (interactive)
// invocation. Given an issue's own risk/effort labels, decides which status:*
// tier to recommend. No discretionary judgment here — the recommendation is
// always subject to an explicit human batch-confirm before any label is written.
'use strict';

const RISK_RE = /^code-health:risk-(low|medium|high)$/;
const EFFORT_RE = /^code-health:effort-(low|medium|high)$/;

function extractRiskEffort(labels) {
  const names = (labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
  const risk = names.map((n) => RISK_RE.exec(n)).find(Boolean);
  const effort = names.map((n) => EFFORT_RE.exec(n)).find(Boolean);
  return { riskTier: risk ? risk[1] : undefined, effortTier: effort ? effort[1] : undefined };
}

function recommendTier({ riskTier, effortTier }) {
  if (riskTier === 'low' && effortTier === 'low') return 'fast-track';
  return 'approved';
}

module.exports = { extractRiskEffort, recommendTier };
