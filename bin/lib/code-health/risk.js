'use strict';

// Risk is computed, not judged — the LLM judge emits severity (impact) and
// likelihood (exposure/blast-radius/exploitability, folded into one holistic
// call) as two separate, simpler qualitative fields; this pure function
// combines them into a single risk tier via a fixed lookup, mirroring the
// existing engine-computes/LLM-judges split already used by dedup.js#decide().
//
// Score low=1, medium=2, high=3; bucket the product: 1-2 -> low, 3-4 -> medium,
// 6-9 -> high. Symmetric and diagonal — see the design doc's risk matrix table.
const SCORE = { low: 1, medium: 2, high: 3 };

function bucket(score) {
  if (score <= 2) return 'low';
  if (score <= 4) return 'medium';
  return 'high';
}

function computeRisk(severity, likelihood) {
  if (!(severity in SCORE)) {
    throw new Error(`computeRisk: severity must be one of low|medium|high (got "${severity}")`);
  }
  if (!(likelihood in SCORE)) {
    throw new Error(`computeRisk: likelihood must be one of low|medium|high (got "${likelihood}")`);
  }
  return bucket(SCORE[severity] * SCORE[likelihood]);
}

module.exports = { computeRisk };
