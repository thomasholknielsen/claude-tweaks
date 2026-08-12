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

// Paths with no interactive verification surface. This module is the source of that
// classification — skills/demo/SKILL.md Step 1's closing-commit reconstruction fallback,
// and the acceptance-gap sweep on both work-record drivers (_shared/github-pr-scan.md's scope
// under github-issues, skills/tidy/step-1-records.md's Shape 8 under local-files) all call in
// rather than restate it.
//
// Deliberately absent: "backend code with no route/component/page touched." That category is
// not decidable from a path list. In the layouts this runs against, UI and backend share a
// root (`src/`, `lib/`, `app/`), so any prefix broad enough to catch `src/services/pay.ts`
// also catches `src/components/Button.tsx`. Anything unmatched below falls through to
// `interactive` — that costs a browser walk which finds nothing, whereas a wrong
// non-interactive match skips acceptance verification silently. That asymmetry is why the
// category stays out rather than being half-covered by prefixes.
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
  // A decomposed sub-issue's acceptance lives on its parent issue, not on itself.
  if (record.hasParent === true) return false;
  return dispositionState(record.labels) === 'none';
}

// A parent issue's acceptance state across its sub-issues. Reads the parent's own label first:
// the label is the authoritative record of what has already been applied, so a
// sub-issue reopening after the gate went on never re-opens the gating decision.
function parentGateState({ leaves, parentLabels } = {}) {
  const disposition = dispositionState(parentLabels);
  if (disposition === 'approved' || disposition === 'changes-requested') return 'resolved';
  if (disposition === 'pending') return 'gated';

  const all = Array.isArray(leaves) ? leaves : [];
  if (all.length === 0) return 'incomplete';
  return all.every((leaf) => leaf && leaf.state === 'CLOSED') ? 'due' : 'incomplete';
}

module.exports = { dispositionState, verificationSurface, needsBackstop, parentGateState };
