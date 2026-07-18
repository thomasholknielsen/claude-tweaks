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
  /\bapproval\b/i,
  // Product/design decision
  /product( or design)? decision/i,
  /design decision/i,
  // Not-yet-built dependency
  /not[ -]yet[ -]built/i,
  // Scope expansion: breaks many tests, long rebuild
  /scope expansion/i,
  /expands? (pipeline )?scope/i,
  /breaks? (more than )?\d+ unrelated tests/i,
  /long rebuild/i,
];

function clearsFloor(blockerReason) {
  if (typeof blockerReason !== 'string' || blockerReason.trim() === '') return false;
  return CATEGORY_PATTERNS.some((re) => re.test(blockerReason));
}

module.exports = { clearsFloor };
