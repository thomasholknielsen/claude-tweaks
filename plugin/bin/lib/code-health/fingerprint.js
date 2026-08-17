const { fingerprintFromBasis } = require('../health-core/fingerprint');

// Remove :line and :line:col refs, collapse whitespace, lowercase. Keeps the
// fingerprint stable when a finding moves lines or is reformatted.
function normalizeSignature(sig) {
  return String(sig)
    .replace(/:\d+(:\d+)?/g, '')   // strip embedded :line(:col)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// v2: normalize a stable anchor ("relfile#NearestSymbol").
// Rules:
//   1. Trim surrounding whitespace.
//   2. Split on the first '#'. Normalize each side independently.
//   3. Path side: lowercase; strip any trailing :line(:col) artifact.
//   4. Symbol side: strip any trailing :line(:col) artifact; trim whitespace.
//      Do NOT lowercase the symbol — symbol names are case-sensitive identifiers.
//   5. Re-join with '#'. If there is no '#', treat the whole string as the path side.
function normalizeAnchor(anchor) {
  const s = String(anchor).trim();
  const hashIdx = s.indexOf('#');
  if (hashIdx === -1) {
    // No symbol — normalize the whole thing as a path.
    return s.replace(/:\d+(:\d+)?$/, '').replace(/\s+/g, '').toLowerCase();
  }
  const pathPart = s.slice(0, hashIdx).replace(/:\d+(:\d+)?$/, '').replace(/\s+/g, '').toLowerCase();
  const symbolPart = s.slice(hashIdx + 1).replace(/:\d+(:\d+)?$/, '').trim();
  return `${pathPart}#${symbolPart}`;
}

// v2 form: stable id from criterion + areaId + normalized anchor.
// v1 form: stable id from lens + areaId + normalized signature (+ optional file).
// Both are detected by checking which keys are present.
function fingerprint({ lens, areaId, signature, file, criterion, anchor }) {
  if (criterion !== undefined) {
    // v2: LLM-judge finding. Hash criterion + areaId + normalizeAnchor(anchor).
    // Uses the shared health-core primitive (same one harness-health,
    // journey-health, and docs-health use) so a future change to the id
    // format lands in one place and propagates to code-health automatically,
    // instead of code-health's inline copy silently drifting out of sync.
    return fingerprintFromBasis('codehealth', [criterion, areaId, normalizeAnchor(anchor || '')]);
  }
  // v1: mechanical-lens finding. Keep the existing logic exactly.
  const normFile = String(file || '').replace(/:\d+(:\d+)?$/, '');
  return fingerprintFromBasis('codehealth', [lens, areaId, normFile, normalizeSignature(signature)]);
}

module.exports = { fingerprint, normalizeSignature, normalizeAnchor };
