'use strict';

// Pure: the autonomy ceiling. Resolves which tier is in force and maps a trust
// row to the concrete permissions that tier allows for that class. Policy sets
// the ceiling; evidence sets the level — this module is where the two meet, and
// it grants nothing on its own. Callers apply the labels.
// See docs/superpowers/specs/2026-08-07-earned-autonomy-tier-design.md, Phase 3.

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

const DENY = (reason) => ({ bornReady: false, bornAuthorized: false, reason });

// `row` is one of trustRows()'s rows. `grantOriginationEnabled` is the separate,
// explicit opt-in described below — never inferred from the ceiling.
function permittedGrants({ ceiling, row, grantOriginationEnabled } = {}) {
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
  // as `ready`. That skips /claude-tweaks:specify, not the grant: `ready` asserts
  // shape, and _shared/work-record.md's human gate at /claude-tweaks:backlog
  // refine still stands between `ready` and any autonomous build.
  const bornReady = atLeast(tier, 'trusted');

  // `auto:build` is the actual authorization, and originating one from machinery
  // contradicts work-record.md's standing invariant that auto:* labels are only
  // ever added by an interactive human session — an invariant with a live eval
  // asserting it (evals/scenarios/backlog-refine-permission-matrix-compliance.yaml).
  // The tier is defined so the ceiling is complete; the grant path stays behind
  // its own opt-in until that invariant is deliberately amended, and reaching the
  // top tier is never by itself that amendment.
  if (!atLeast(tier, 'unattended')) {
    return { bornReady, bornAuthorized: false, reason: `class is clean and the ceiling is ${tier}` };
  }
  if (grantOriginationEnabled !== true) {
    return {
      bornReady,
      bornAuthorized: false,
      reason: 'ceiling is unattended, but machine-originated grants need their own explicit opt-in',
    };
  }
  return { bornReady, bornAuthorized: true, reason: 'class is clean, ceiling is unattended, grant origination opted in' };
}

module.exports = { CEILINGS, resolveCeiling, permittedGrants };
