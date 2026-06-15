const FINDING_FIELDS = [
  'id', 'title', 'lens', 'category', 'severity', 'confidence',
  'area', 'files', 'evidence', 'suggestion', 'acceptance', 'signature',
];

const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const CONFIDENCES = new Set(['high', 'med', 'low']);

// Single source of truth for the Finding shape. Lenses call this so the shape
// never drifts. `id` is null until the fingerprint step assigns it.
function makeFinding(partial) {
  const f = {
    id: null,
    title: partial.title || '',
    lens: partial.lens || '',
    category: partial.category || 'convention',
    severity: partial.severity || 'low',
    confidence: partial.confidence || 'high',
    area: partial.area || '.',
    files: Array.isArray(partial.files) ? partial.files : [],
    evidence: partial.evidence || '',
    suggestion: partial.suggestion || '',
    acceptance: partial.acceptance || '',
    signature: partial.signature || '',
  };
  if (!SEVERITIES.has(f.severity)) throw new Error(`invalid severity: ${f.severity}`);
  if (!CONFIDENCES.has(f.confidence)) throw new Error(`invalid confidence: ${f.confidence}`);
  return f;
}

module.exports = { makeFinding, FINDING_FIELDS };
