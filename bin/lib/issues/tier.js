// Pure: the mechanical Tier Rule for /claude-tweaks:triage's bare (interactive)
// invocation. Given an issue's own labels, decides which build/merge grants to
// recommend (recommendGrants) — colon-form risk:*/effort:* labels (the
// canonical vocabulary emitted by record.js consumers) are read at highest
// precedence, with legacy code-health-prefixed hyphen forms, legacy bare
// hyphen forms, and harness-health's additive/restructural classification
// read as fallback adapters so older issues still score. No discretionary
// judgment here — the recommendation is always subject to an explicit human
// batch-confirm before any label is written. recommendTier is a deprecated
// fast-track/approved alias kept for pre-migration callers.
'use strict';

// 1. Canonical colon form — highest precedence.
const COLON_RISK_RE = /^risk:(low|medium|high)$/;
const COLON_EFFORT_RE = /^effort:(low|medium|high)$/;

function extractColonRiskEffort(names) {
  const risk = names.map((n) => COLON_RISK_RE.exec(n)).find(Boolean);
  const effort = names.map((n) => COLON_EFFORT_RE.exec(n)).find(Boolean);
  if (!risk && !effort) return null;
  return { riskTier: risk ? risk[1] : undefined, effortTier: effort ? effort[1] : undefined };
}

// 2. Legacy code-health-prefixed hyphen form.
const CH_RISK_RE = /^code-health:risk-(low|medium|high)$/;
const CH_EFFORT_RE = /^code-health:effort-(low|medium|high)$/;

function extractCodeHealthRiskEffort(names) {
  const risk = names.map((n) => CH_RISK_RE.exec(n)).find(Boolean);
  const effort = names.map((n) => CH_EFFORT_RE.exec(n)).find(Boolean);
  if (!risk && !effort) return null;
  return { riskTier: risk ? risk[1] : undefined, effortTier: effort ? effort[1] : undefined };
}

// 3. Legacy bare hyphen form (no kind prefix).
const BARE_RISK_RE = /^risk-(low|medium|high)$/;
const BARE_EFFORT_RE = /^effort-(low|medium|high)$/;

function extractBareHyphenRiskEffort(names) {
  const risk = names.map((n) => BARE_RISK_RE.exec(n)).find(Boolean);
  const effort = names.map((n) => BARE_EFFORT_RE.exec(n)).find(Boolean);
  if (!risk && !effort) return null;
  return { riskTier: risk ? risk[1] : undefined, effortTier: effort ? effort[1] : undefined };
}

// 4. harness-health has no independent risk/effort dimensions — additive/restructural
// is a single classification label. additive (safe, mechanical patch) maps both
// tiers to 'low' so it satisfies recommendGrants' merge condition; restructural
// (needs human review) maps both to 'high' so it never does.
// harness-health:new-skill findings carry neither label and intentionally fall
// through unmatched — new-skill proposals should never be merge-eligible.
const HARNESS_HEALTH_CLASSIFICATION_RE = /^harness-health:(additive|restructural)$/;

function extractHarnessHealthRiskEffort(names) {
  const match = names.map((n) => HARNESS_HEALTH_CLASSIFICATION_RE.exec(n)).find(Boolean);
  if (!match) return null;
  return match[1] === 'additive'
    ? { riskTier: 'low', effortTier: 'low' }
    : { riskTier: 'high', effortTier: 'high' };
}

// Precedence order: colon (canonical) > code-health-prefixed hyphen (legacy) >
// bare hyphen (legacy) > harness-health classification (legacy, single-label).
const KIND_ADAPTERS = [
  extractColonRiskEffort,
  extractCodeHealthRiskEffort,
  extractBareHyphenRiskEffort,
  extractHarnessHealthRiskEffort,
];

// Each axis (riskTier/effortTier) is resolved independently: for each axis,
// take the value from the first adapter in precedence order that yields it —
// so a colon-form risk label combined with only a legacy code-health effort
// label still resolves both axes (mixed-vocabulary issues during migration).
function extractRiskEffort(labels) {
  const names = (labels || []).map((l) => (typeof l === 'string' ? l : l.name)).filter(Boolean);
  let riskTier;
  let effortTier;
  for (const adapter of KIND_ADAPTERS) {
    const result = adapter(names);
    if (!result) continue;
    if (riskTier === undefined && result.riskTier !== undefined) riskTier = result.riskTier;
    if (effortTier === undefined && result.effortTier !== undefined) effortTier = result.effortTier;
  }
  return { riskTier, effortTier };
}

const KNOWN_TIERS = new Set(['low', 'medium', 'high']);

// recommendGrants is the current interface: given a resolved { risk, effort }
// pair, decide which grants apply. low+low grants both build and merge; any
// other KNOWN pair grants build only (still needs a human merge); a missing
// or unknown tier on either axis grants neither — unscored issues are never
// recommended for anything.
function recommendGrants({ risk, effort } = {}) {
  if (!KNOWN_TIERS.has(risk) || !KNOWN_TIERS.has(effort)) return { build: false, merge: false };
  return { build: true, merge: risk === 'low' && effort === 'low' };
}

// DEPRECATED: pre-migration fast-track/approved alias. New callers should use
// recommendGrants directly; this delegates to it and folds the merge grant
// back onto the old two-value vocabulary so callers that haven't migrated
// yet keep working unchanged.
function recommendTier({ riskTier, effortTier }) {
  const { merge } = recommendGrants({ risk: riskTier, effort: effortTier });
  return merge ? 'fast-track' : 'approved';
}

module.exports = { extractRiskEffort, recommendGrants, recommendTier };
