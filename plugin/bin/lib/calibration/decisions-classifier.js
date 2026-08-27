'use strict';

// Closed vocabulary the terminal-decision log line writes (Task 3 adds the
// writer in wrap-up/review-console-interactive.md and flow/multispec-review-console.md;
// this array is the single source both prose and this parser cite).
const TERMINAL_DECISION_VALUES = ['approve-all', 'approve-all-merge', 'leave-pr-open', 'override', 'stop'];

const KIND_RE = /^-\s+(AUTO|STAGED|KEPT-PROMPT|REFUSED|SCANNED|FAILED)\b/;
const TERMINAL_RE = new RegExp(
  `Review Console: terminal decision (${TERMINAL_DECISION_VALUES.join('|')})\\.`,
);
const REVERSIBILITY_RE = /Reversibility:\s*(high|med|low|n\/a)/;

function classifyDecisionLine(line) {
  const kindMatch = KIND_RE.exec(line);
  if (!kindMatch) return { kind: 'other' };
  const result = { kind: kindMatch[1] };
  const terminalMatch = TERMINAL_RE.exec(line);
  if (terminalMatch) result.terminalDecision = terminalMatch[1];
  const reversibilityMatch = REVERSIBILITY_RE.exec(line);
  if (reversibilityMatch) result.reversibility = reversibilityMatch[1];
  if (/auto-resolved/.test(line)) result.autoResolved = true;
  return result;
}

module.exports = { classifyDecisionLine, TERMINAL_DECISION_VALUES };
