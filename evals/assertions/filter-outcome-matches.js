// Compares each candidate question's per-token keep/drop outcome — as
// reported by /claude-tweaks:research verify's consequence filter — against
// the corpus's recorded expectation. The expectation lives in the fixture
// (consequence-filter-cases.json), never in the prompt, so the model cannot
// read the answer off its own input.
//
// Modelled on verdict-matches.js, but one resultText reports several
// outcomes (one per candidate question) rather than a single VERDICT: line,
// so this resolves an outcome per TOKEN instead of one last-match line: each
// candidate question carries a short unique token (e.g. Q-TTL) stated in the
// fixture brief, and for each mention of that token this takes the nearest
// following keep/drop word within a small window — then, like
// verdict-matches.js, takes the outcome from the token's LAST mention, since
// narrative earlier in the run may restate a question before its real
// keep/drop outcome is rendered.
const OUTCOME_WORD_RE = /\b(kept|keep|dropped|drop)\b/i;
const OUTCOME_WINDOW_CHARS = 200;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeOutcomeWord(word) {
  const w = word.toLowerCase();
  return (w === 'keep' || w === 'kept') ? 'keep' : 'drop';
}

// token -> { seen: boolean, outcome: 'keep' | 'drop' | null }
// seen=false means the token never appears in resultText at all.
// outcome=null (with seen=true) means the token appears but no keep/drop
// word was found near any of its mentions.
function outcomeForToken(text, token) {
  const tokenRe = new RegExp(`\\b${escapeRegExp(token)}\\b`, 'g');
  let seen = false;
  let outcome = null;
  let match;
  while ((match = tokenRe.exec(text))) {
    seen = true;
    const window = text.slice(match.index, match.index + token.length + OUTCOME_WINDOW_CHARS);
    const wordMatch = window.match(OUTCOME_WORD_RE);
    if (wordMatch) outcome = normalizeOutcomeWord(wordMatch[1]);
  }
  return { seen, outcome };
}

export function filterOutcomeMatches(resultText, { kept = [], dropped = [] }) {
  const text = String(resultText);
  const checks = [
    ...kept.map((token) => [token, 'keep']),
    ...dropped.map((token) => [token, 'drop']),
  ];
  for (const [token, expected] of checks) {
    const { seen, outcome } = outcomeForToken(text, token);
    if (!seen) {
      return { pass: false, message: `${token} does not appear anywhere in result: ${text.slice(0, 400)}` };
    }
    if (outcome == null) {
      return { pass: false, message: `${token} appears but no keep/drop outcome word was found nearby` };
    }
    if (outcome !== expected) {
      return {
        pass: false,
        message: `expected ${token} to be ${expected === 'keep' ? 'kept' : 'dropped'}, result stated ${outcome}`,
      };
    }
  }
  return { pass: true, message: `all tokens matched: kept=[${kept.join(', ')}], dropped=[${dropped.join(', ')}]` };
}
