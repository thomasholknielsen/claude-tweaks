// Compares the VERDICT: line assess-agent-autonomy's merge-check mode
// actually rendered against the corpus's recorded expectation. The
// expectation lives in the fixture (merge-check-cases.json), never in the
// prompt, so the model cannot read the answer off its own input. Modelled on
// routing-destination-matches.js: take the LAST match, since narrative text
// earlier in the run may restate both options before Step 3 renders the real
// one.
const VERDICT_RE = /\bVERDICT:\s*(auto-merge|needs-human)\b/gi;

export function verdictMatches(resultText, { expected }) {
  const found = [...String(resultText).matchAll(VERDICT_RE)].map((m) => m[1].toLowerCase());
  if (found.length === 0) {
    return { pass: false, message: `no VERDICT: line found in result: ${String(resultText).slice(0, 400)}` };
  }
  const stated = found[found.length - 1];
  if (stated !== expected) {
    return { pass: false, message: `expected ${expected}, skill stated ${stated} (all mentions: ${found.join(', ')})` };
  }
  return { pass: true, message: `verdict ${stated} matched` };
}
