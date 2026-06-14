const crypto = require('crypto');

// Remove :line and :line:col refs, collapse whitespace, lowercase. Keeps the
// fingerprint stable when a finding moves lines or is reformatted.
function normalizeSignature(sig) {
  return String(sig)
    .replace(/:\d+(:\d+)?/g, '')   // strip embedded :line(:col)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Stable id from lens + area + normalized signature (+ optional file).
// CORRECTED (PORT.md delta #1): the file's trailing :line(:col) is stripped
// BEFORE hashing, so a finding that moves lines keeps its id. JSON.stringify of
// the field array is an unambiguous, collision-free basis (no field can bleed
// into its neighbour).
function fingerprint({ lens, areaId, signature, file }) {
  const normFile = String(file || '').replace(/:\d+(:\d+)?$/, '');
  const basis = JSON.stringify([lens, areaId, normFile, normalizeSignature(signature)]);
  const hash = crypto.createHash('sha1').update(basis).digest('hex').slice(0, 8);
  return `recon-${hash}`;
}

module.exports = { fingerprint, normalizeSignature };
