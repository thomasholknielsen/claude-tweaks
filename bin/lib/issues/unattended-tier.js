'use strict';

// Pure: the floor-check predicate for the unattended-tier lever. Decides whether a ledger
// item's Phase 1 "why not fixed now" blocker reason is one of the four categories
// ledger/resolve-gate.md's Phase 1 already requires as legitimate -- the only categories
// unattended-tier is allowed to auto-route without asking. See
// docs/superpowers/specs/2026-07-16-unattended-tier-design.md.

const CATEGORY_PATTERNS = [
  // External state: third-party data, prod traffic, approvals
  /external state/i,
  /third-party/i,
  /prod(uction)? traffic/i,
  /\bapprovals?\b/i,
  // Product/design decision
  /product( or design)? decision/i,
  /design decision/i,
  // Not-yet-built dependency
  /not[ -]yet[ -]built/i,
  // Scope expansion: breaks many tests, long rebuild
  /scope expansion/i,
  /expands? (pipeline )?scope/i,
  /long rebuild/i,
];

// A bare regex can only match a digit run, not compare its magnitude, so the
// '>10 unrelated tests' numeric threshold ledger/resolve-gate.md's Phase 1
// actually requires (not merely "some tests") is checked separately from
// CATEGORY_PATTERNS above. A bare 'breaks N unrelated tests' states the exact
// count, so N must be strictly >10; a 'breaks more than N unrelated tests'
// phrasing already asserts the count exceeds N, so N need only be >=10 (e.g.
// "more than 10", resolve-gate.md's own wording) to guarantee it's >10.
const UNRELATED_TESTS_RE = /breaks? (more than )?(\d+) unrelated tests/i;

function clearsFloor(blockerReason) {
  if (typeof blockerReason !== 'string' || blockerReason.trim() === '') return false;
  if (CATEGORY_PATTERNS.some((re) => re.test(blockerReason))) return true;
  const testsMatch = UNRELATED_TESTS_RE.exec(blockerReason);
  if (!testsMatch) return false;
  const moreThan = Boolean(testsMatch[1]);
  const count = Number(testsMatch[2]);
  return moreThan ? count >= 10 : count > 10;
}

module.exports = { clearsFloor };
