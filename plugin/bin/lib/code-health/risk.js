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
  // Object.prototype.hasOwnProperty, not the bare `in` operator — `in` also
  // matches inherited Object.prototype property names ('toString',
  // 'constructor', 'valueOf', 'hasOwnProperty', ...), which would let a
  // malformed severity/likelihood value silently read an inherited function
  // instead of a number, coerce to NaN, and fall through bucket()'s
  // comparisons to the highest risk tier — defeating this validation
  // instead of throwing as documented.
  if (!Object.prototype.hasOwnProperty.call(SCORE, severity)) {
    throw new Error(`computeRisk: severity must be one of low|medium|high (got "${severity}")`);
  }
  if (!Object.prototype.hasOwnProperty.call(SCORE, likelihood)) {
    throw new Error(`computeRisk: likelihood must be one of low|medium|high (got "${likelihood}")`);
  }
  return bucket(SCORE[severity] * SCORE[likelihood]);
}

module.exports = { computeRisk };
