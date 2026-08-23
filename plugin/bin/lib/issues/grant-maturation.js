'use strict';

// Pure: decides whether a record's `auto:merge-pending` grant (#309) has
// matured into `auto:merge`, is still inside its veto window, or was never
// pending in the first place (including a permanent veto — a human removing
// `auto:merge-pending` before maturation, with nothing re-adding it — see
// `_shared/work-record.md`'s Grant semantics maturation carve-out).
//
// Called by dispatch's existing Auto-merge gate Authorization layer
// (`skills/dispatch/settle-and-merge.md`) at its normal merge-consult
// checkpoint — never a separate scheduled job, per `docs/donts.md`'s
// [IL-94].

const PENDING_GRANT_MARKER_RE = /<!--\s*grant-mode-audit:\s*date=(\S+)\s+auto-merge=pending\s*-->/g;

// commentBodies: string[] — an issue's fetched comment bodies (any order).
// Returns the Date of the LATEST `auto-merge=pending` grant-mode-audit
// marker found, or null when none is present. Markers with `auto-merge=true`
// or `auto-merge=false` are ignored — only a pending grant has a maturation
// clock to read.
function extractPendingGrantedAt(commentBodies) {
  const bodies = Array.isArray(commentBodies) ? commentBodies : [];
  let latest = null;
  for (const body of bodies) {
    if (typeof body !== 'string') continue;
    PENDING_GRANT_MARKER_RE.lastIndex = 0;
    let m;
    while ((m = PENDING_GRANT_MARKER_RE.exec(body)) !== null) {
      const parsed = new Date(m[1]);
      if (Number.isNaN(parsed.getTime())) continue;
      if (!latest || parsed.getTime() > latest.getTime()) latest = parsed;
    }
  }
  return latest;
}

// hasPendingLabel/hasMergeLabel: booleans from a fresh `gh issue view
// --json labels` read. pendingSince: Date | null — normally
// extractPendingGrantedAt's return value. vetoWindowHours: the resolved
// grant-veto-window-hours policy value (falls back to the schema default,
// 24, when absent/invalid — belt-and-braces alongside the resolver's own
// default). now: Date | epoch-ms (injected clock for tests).
//
// Returns { mature, state, reason, ageHours?, windowHours? }. `state` is one
// of:
//   'already-mature'    — auto:merge is already present; nothing to do.
//   'not-pending'        — no auto:merge-pending label (never granted, or a
//                          human vetoed it — both read identically here).
//   'unknown-age'        — pending label present but no discoverable grant
//                          timestamp; treated as not yet matured (fail safe).
//   'within-veto-window'  — pending, timestamped, but still younger than the
//                          veto window.
//   'matured'            — pending, timestamped, and past the veto window —
//                          the caller should promote it now.
function evaluateMaturation({ hasPendingLabel, hasMergeLabel, pendingSince, vetoWindowHours, now } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : (typeof now === 'number' ? now : Date.now());

  if (hasMergeLabel === true) {
    return { mature: true, state: 'already-mature', reason: 'auto:merge already present' };
  }
  if (hasPendingLabel !== true) {
    return { mature: false, state: 'not-pending', reason: 'no auto:merge-pending label present (never granted, or vetoed by a human removing it)' };
  }
  if (!(pendingSince instanceof Date) || Number.isNaN(pendingSince.getTime())) {
    return { mature: false, state: 'unknown-age', reason: 'pending grant timestamp could not be determined from the audit trail — treated as not yet matured' };
  }

  const windowHours = (typeof vetoWindowHours === 'number' && Number.isFinite(vetoWindowHours) && vetoWindowHours >= 0)
    ? vetoWindowHours
    : 24;
  const ageHours = (nowMs - pendingSince.getTime()) / (60 * 60 * 1000);

  if (ageHours < windowHours) {
    return { mature: false, state: 'within-veto-window', reason: `pending grant is ${ageHours.toFixed(1)}h old, veto window is ${windowHours}h`, ageHours, windowHours };
  }
  return { mature: true, state: 'matured', reason: `pending grant is ${ageHours.toFixed(1)}h old, past the ${windowHours}h veto window`, ageHours, windowHours };
}

module.exports = { evaluateMaturation, extractPendingGrantedAt, PENDING_GRANT_MARKER_RE };
