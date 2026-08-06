// Compares the destination (and, for D5, the kind) the skill actually stated
// against the corpus's recorded expectation. The expectation lives in the
// fixture, never in the prompt, so the model cannot read the answer off its
// own input.
const DESTINATION_RE = /\b(D[1-5])\b/g;
const KIND_RE = /\b(defect|gap)\b/i;

export function routingDestinationMatches(resultText, { expectedDestination, expectedKind }) {
  const found = [...String(resultText).matchAll(DESTINATION_RE)].map((m) => m[1]);
  if (found.length === 0) {
    return { pass: false, message: `no destination (D1-D5) stated in result: ${String(resultText).slice(0, 400)}` };
  }
  const stated = found[found.length - 1];
  if (stated !== expectedDestination) {
    return { pass: false, message: `expected ${expectedDestination}, skill stated ${stated} (all mentions: ${found.join(', ')})` };
  }
  if (expectedKind) {
    const kindMatch = String(resultText).match(KIND_RE);
    const statedKind = kindMatch ? kindMatch[1].toLowerCase() : null;
    if (statedKind !== expectedKind) {
      return { pass: false, message: `expected kind ${expectedKind}, skill stated ${statedKind ?? 'none'}` };
    }
  }
  return { pass: true, message: `destination ${stated}${expectedKind ? ` kind ${expectedKind}` : ''} matched` };
}
