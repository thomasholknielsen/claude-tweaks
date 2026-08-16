'use strict';

// Pure: the autonomy ceiling. Resolves which tier is in force and maps a trust
// row to the concrete permissions that tier allows for that class. Policy sets
// the ceiling; evidence sets the level — this module is where the two meet, and
// it grants nothing on its own. Callers apply the labels.
// Was docs/superpowers/specs/2026-08-07-earned-autonomy-tier-design.md, Phase
// 3 — deleted (bdb2f4f6): all 4 phases shipped, v6.50.0-6.59.0.
//
// Expand-contract (refs #647): permittedGrants' flat top-level
// `bornReady`/`bornAuthorized`/`reason` keys are a transitional twin of the
// per-grant `grants.{bornReady,bornAuthorized}.{granted,reason}` shape — the
// flat single `reason` could pair a granted bornReady with the other grant's
// denial text, which is the bug the per-grant shape fixes. Removal condition:
// delete the flat keys at the first release on or after 2026-11-16 (ship date + 3 months, policy-deprecations.md's dated-backstop shape), re-running `grep -rn "permittedGrants" skills/ bin/` first to confirm every consumer still reads `grants.*`.

// record.js requires only ./facet-shape; this import is one-directional by
// contract (autonomy -> record, never record -> autonomy) so the two never cycle.
const { DEFER_REASONS } = require('./record');

// Ordered least to most permissive. Index comparison is the tier test, so the
// order is load-bearing, not cosmetic.
const CEILINGS = ['supervised', 'trusted', 'unattended'];

// The kinds provenance.js emits that name a real class: 'producer' (a by:*
// label), 'side-effect' (an Origin: body line), 'human' (absence of both). Its
// fourth kind, 'unstructured', is the classifier reporting it could not reduce
// a record to a class at all, and is absent here deliberately — trust.js already
// pins that kind's verdict to 'insufficient-evidence', and a redundant deny means
// neither module can open the bucket on its own.
//
// An allowlist, not a denylist naming 'unstructured'. The design's Phase 3 note
// warns that "a consumer switching over three kinds silently drops" the fourth;
// a denylist inverts that failure rather than fixing it — it would grant to any
// fifth kind a later provenance change introduces, and to a row whose `kind` is
// an empty string. Both were reachable and both granted before this became an
// allowlist. Unrecognized input must deny, which is only true if recognition is
// what is being tested.
const GRADABLE_KINDS = new Set(['producer', 'side-effect', 'human']);

// Of those, the ones that describe work an AGENT filed. Born-`ready` authorizes
// an agent to file spec-shaped, so a class whose records a human filed has no
// agent whose filing could be authorized — its verdict says something real about
// how that work turned out, but nothing about an agent's filing discipline.
// Granting on it would license agent filings using evidence generated entirely by
// human ones, and it is not a corner case: `human:human|elevated` (50 records) and
// `human:human|low` (40) are this repo's two largest cells and the first likely to
// clear both floors.
const AGENT_FILED_KINDS = new Set(['producer', 'side-effect']);

function isCeiling(value) {
  return typeof value === 'string' && CEILINGS.includes(value);
}

// Precedence per _shared/auto-mode-contract.md: CLI arg > run config > project
// policy > skill default. An unrecognized value at any level is skipped rather
// than honored or thrown on — a typo must never resolve to a tier nobody named,
// and falling through to the next source lands on 'supervised' in the worst case.
function resolveCeiling(sources) {
  const { cliArg, runConfig, policy } = sources || {};
  for (const candidate of [cliArg, runConfig, policy]) {
    if (isCeiling(candidate)) return candidate;
  }
  return 'supervised';
}

function atLeast(ceiling, minimum) {
  return CEILINGS.indexOf(ceiling) >= CEILINGS.indexOf(minimum);
}

const DENY = (reason) => ({
  bornReady: false,
  bornAuthorized: false,
  reason,
  grants: {
    bornReady: { granted: false, reason },
    bornAuthorized: { granted: false, reason },
  },
});

// `row` is one of trustRows()'s rows. `grantOriginationEnabled` is the separate,
// explicit opt-in described below — never inferred from the ceiling.
function permittedGrants(input) {
  // `|| {}` rather than a default parameter: defaults fire only on `undefined`,
  // so `= {}` left an explicit null throwing while resolveCeiling(null) returned
  // a value. A caller sweeping a record list should not crash on one bad entry.
  const { ceiling, row, grantOriginationEnabled } = input || {};
  const tier = isCeiling(ceiling) ? ceiling : 'supervised';

  if (!row || typeof row !== 'object' || typeof row.verdict !== 'string' || typeof row.kind !== 'string') {
    return DENY('no trust row for this class — nothing has been measured');
  }
  if (!GRADABLE_KINDS.has(row.kind)) {
    return DENY(`class is unclassifiable (kind ${JSON.stringify(row.kind)}) — provenance could not reduce these records to a class this module recognizes`);
  }
  if (tier === 'supervised') {
    return DENY('autonomy ceiling is supervised — trust is recorded and displayed, never acted on');
  }
  if (row.verdict !== 'clean') {
    return DENY(`class verdict is ${row.verdict} — only a clean class earns anything`);
  }

  // At `trusted`, a class that has earned it may file spec-shaped work directly
  // as `ready`. That skips the human shaping round-trip, not the grant: `ready` asserts
  // shape, and _shared/work-record.md's human gate at /claude-tweaks:backlog
  // refine still stands between `ready` and any autonomous build. Agent-filed
  // classes only — see AGENT_FILED_KINDS.
  const bornReady = atLeast(tier, 'trusted') && AGENT_FILED_KINDS.has(row.kind);
  if (!bornReady) {
    return DENY(`class ${row.kind} is human-filed — born-ready authorizes an agent's filing, and there is no agent filing here`);
  }

  // `auto:build` is the actual authorization, and originating one from machinery
  // contradicts work-record.md's standing invariant that auto:* labels are only
  // ever added by an interactive human session. That invariant was written after
  // a real run treated a low-risk, well-scoped, `ready` record as license to run
  // a full build-to-close lifecycle on its own judgment
  // (evals/scenarios/backlog-refine-permission-matrix-compliance.yaml exists
  // because of it, though what that scenario can actually assert is the
  // local-files boundary — its own description says the grant path is untestable
  // in the sandbox, so it is the incident and not the eval that carries the
  // weight here). The tier is defined so the ceiling is complete; the grant path
  // stays behind its own opt-in until that invariant is deliberately amended, and
  // reaching the top tier is never by itself that amendment.
  if (!atLeast(tier, 'unattended')) {
    const reason = `class is clean and the ceiling is ${tier}`;
    return {
      bornReady,
      bornAuthorized: false,
      reason,
      grants: {
        bornReady: { granted: bornReady, reason: '' },
        bornAuthorized: { granted: false, reason },
      },
    };
  }
  if (grantOriginationEnabled !== true) {
    const reason = 'ceiling is unattended, but machine-originated grants need their own explicit opt-in';
    return {
      bornReady,
      bornAuthorized: false,
      reason,
      grants: {
        bornReady: { granted: bornReady, reason: '' },
        bornAuthorized: { granted: false, reason },
      },
    };
  }
  return {
    bornReady,
    bornAuthorized: true,
    reason: 'class is clean, ceiling is unattended, grant origination opted in',
    grants: {
      bornReady: { granted: bornReady, reason: '' },
      bornAuthorized: { granted: true, reason: '' },
    },
  };
}

// Floor-check predicate for the autonomy ceiling's ledger-narrowing bookkeeping
// capability. Decides whether an item's "why not fixed now" reason is one of the
// categories skills/_shared/deferral-gate.md's floor mapping marks as clearing
// the floor -- the only categories bookkeeping narrowing is allowed to auto-route
// without asking. Two paths: a structured Defer-reason: value (exact member of
// DEFER_REASONS) resolves from the mapping table below; anything else falls back
// to the regex categories that predate the vocabulary, moved verbatim from the
// retired unattended-tier.js -- same patterns, same logic, no behavior change.
// Was docs/superpowers/specs/2026-07-16-unattended-tier-design.md — deleted (652a97c4).
//
// Removal condition for the regex fallback (stated in the same words in
// skills/_shared/deferral-gate.md's "Removal condition" section):
// Remove CATEGORY_PATTERNS/UNRELATED_TESTS_RE once every consumer named in skills/_shared/deferral-gate.md stamps a structured Defer-reason: (#621, #624) and tests/deferral-gate-conformance.test.js has been green for one shipped release; tracked by the follow-up record filed at build time.

// Structured verdicts, per deferral-gate.md's floor mapping: blocked-external <->
// the external-state group, needs-human-decision <-> the product/design group,
// blocked-dependency <-> not-yet-built, genuinely-larger <-> scope expansion +
// UNRELATED_TESTS_RE; tangential and pre-existing-outside-diff map to no group.
const STRUCTURED_FLOOR = Object.freeze({
  'tangential': false,
  'needs-human-decision': true,
  'pre-existing-outside-diff': false,
  'genuinely-larger': true,
  'blocked-external': true,
  'blocked-dependency': true,
});

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
  // Structured path first: an exact vocabulary member never reaches the regexes,
  // so a free-prose reason that merely contains a vocabulary word still takes
  // the regex path below.
  if (DEFER_REASONS.includes(blockerReason)) return STRUCTURED_FLOOR[blockerReason] === true;
  if (CATEGORY_PATTERNS.some((re) => re.test(blockerReason))) return true;
  const testsMatch = UNRELATED_TESTS_RE.exec(blockerReason);
  if (!testsMatch) return false;
  const moreThan = Boolean(testsMatch[1]);
  const count = Number(testsMatch[2]);
  return moreThan ? count >= 10 : count > 10;
}

// The bookkeeping capabilities the retired unattended-tier lever used to gate
// as one on/off boolean, now unlocked individually by the merged autonomy
// ceiling: ledger Phase 2 narrowing and queue-write auto-file at 'trusted'+;
// ops-ack auto-acknowledge, console auto-resolve, and ledger route-remainder
// held back to 'unattended' (see skills/_shared/autonomy-ceiling.md for what
// each one does). An unrecognized ceiling falls through to 'supervised' --
// same handling as permittedGrants, so a typo denies everything rather than
// granting it.
function bookkeepingPermissions(ceiling) {
  const tier = isCeiling(ceiling) ? ceiling : 'supervised';
  return {
    ledgerNarrowing: atLeast(tier, 'trusted'),
    queueWriteAutoFile: atLeast(tier, 'trusted'),
    opsAckAutoAcknowledge: atLeast(tier, 'unattended'),
    consoleAutoResolve: atLeast(tier, 'unattended'),
    ledgerRouteRemainder: atLeast(tier, 'unattended'),
  };
}

module.exports = { CEILINGS, resolveCeiling, permittedGrants, clearsFloor, bookkeepingPermissions };
