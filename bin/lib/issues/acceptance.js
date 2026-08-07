'use strict';

// Resolved verdicts are listed before `pending` deliberately: /claude-tweaks:demo
// removes demo:pending in the same operation it adds the verdict, but a partial
// write or a concurrent edit can leave both on the record. First-match-wins over
// this order means a resolved record is never re-swept as un-dispositioned.
const ACCEPTANCE_BY_LABEL = [
  ['demo:approved', 'approved'],
  ['demo:changes-requested', 'changes-requested'],
  ['demo:pending', 'pending'],
];

// Paths with no interactive verification surface. Mirrors the classification in
// skills/wrap-up/verification-brief.md Step 2.
const NON_INTERACTIVE = [
  /^docs\//,
  /^\.claude/,
  /^skills\/.*\.md$/,
  /^bin\//,
  /^tests\//,
  /^perf\//,
  /\.(ya?ml|json|toml|tsv)$/,
  /\.md$/,
];

// Markdown that IS a user-facing surface, checked before NON_INTERACTIVE so the
// broad `^docs/` and `\.md$` patterns cannot claim it first.
const INTERACTIVE_PATHS = [/^stories\//, /^docs\/journeys\//];

function dispositionState(labels) {
  const names = Array.isArray(labels) ? labels : [];
  for (const [label, state] of ACCEPTANCE_BY_LABEL) {
    if (names.includes(label)) return state;
  }
  return 'none';
}

function verificationSurface(changedPaths) {
  const paths = (Array.isArray(changedPaths) ? changedPaths : []).filter(Boolean);
  const anyInteractive = paths.some((path) => {
    if (INTERACTIVE_PATHS.some((re) => re.test(path))) return true;
    return !NON_INTERACTIVE.some((re) => re.test(path));
  });
  return anyInteractive ? 'interactive' : 'non-interactive';
}

function needsBackstop(record) {
  if (!record || record.state !== 'CLOSED') return false;
  return dispositionState(record.labels) === 'none';
}

module.exports = { dispositionState, verificationSurface, needsBackstop };
