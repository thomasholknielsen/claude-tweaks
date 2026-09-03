'use strict';
// Fleet counter derivation — pure data-in/data-out (#276).
// Callers (skills/routine/fleet.md's `fleet status` procedure) fetch records,
// comments, and trust reads themselves and feed plain objects in; this module
// never touches the network or the filesystem, which is what lets
// tests/bin-lib/issues/fleet-counters.test.js pin AC1 as an automated test.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Mirrors skills/backlog/refine-headless.md's audit-comment marker (#269) — the
// machine-grant signal. A grant with no marker anywhere is human-granted.
const GRANT_AUDIT_RE = /<!--\s*grant-mode-audit:\s*date=\S+\s+auto-merge=(?:true|false|pending)\s*-->/;

// Rolling 7x24h window ending at nowMs. Full ISO datetimes, never a
// date-only boundary (IL-47).
function weeklyWindow(nowMs) {
  const startMs = nowMs - WEEK_MS;
  return {
    startMs,
    endMs: nowMs,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(nowMs).toISOString(),
  };
}

// 'unattended' posture = grant unit provisioned AND both unattended keys set;
// anything else is 'supervised'. Same two-key rule as fleet.md Step 3 — no
// third key, no paraphrase. grantOriginationEnabled accepts either the JS
// boolean true or the string 'true' — fleet.md S3 sources it from
// resolve-policy.js --values, which emits plain-text scalars, never JSON
// booleans (#276 final review F1).
function fleetPosture({ grantUnitProvisioned, autonomy, grantOriginationEnabled }) {
  const originationEnabled = grantOriginationEnabled === true || grantOriginationEnabled === 'true';
  return grantUnitProvisioned && autonomy === 'unattended' && originationEnabled
    ? 'unattended'
    : 'supervised';
}

function inWindow(iso, w) {
  if (!iso) return false;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms >= w.startMs && ms <= w.endMs;
}

function isMachineGrant(grant) {
  const bodies = grant && grant.commentBodies;
  return Array.isArray(bodies) && bodies.some((body) => GRANT_AUDIT_RE.test(body || ''));
}

// input:
//   routines:  [{ name, lastFiringIso|null }]           — from per-routine STATUS
//   findings:  [{ number, createdAtIso }]               — health-swept records created in-window
//   grants:    [{ number, grantedAtIso, commentBodies }] — records granted auto:* ; marker => machine
//   merges:    [{ number, closedAtIso, viaMergeCommit }] — closed records; merge-closed only counts
//   negativeEvidence: [{ trustClass, atIso, source }]    — markers + detected reverts, per trust class
// returns { window, firings: {fired, total}, findings, grants: {machine, human}, merges, revocations }
function deriveFleetCounters(input, nowMs) {
  const w = weeklyWindow(nowMs);
  const routines = input.routines || [];
  const fired = routines.filter((r) => r && inWindow(r.lastFiringIso, w)).length;
  const findings = (input.findings || []).filter((f) => f && inWindow(f.createdAtIso, w)).length;

  const grantsInWindow = (input.grants || []).filter((g) => g && inWindow(g.grantedAtIso, w));
  const machine = grantsInWindow.filter(isMachineGrant).length;
  const human = grantsInWindow.length - machine;

  const merges = (input.merges || [])
    .filter((m) => m && m.viaMergeCommit && inWindow(m.closedAtIso, w)).length;

  // Revocations count per class-downgrade event, not per marker: N pieces of
  // in-window negative evidence on one trust class are one revocation.
  // A missing trustClass is not a revocation (e.g. a bare timestamp marker).
  const revokedClasses = new Set(
    (input.negativeEvidence || [])
      .filter((e) => e && e.trustClass && inWindow(e.atIso, w))
      .map((e) => e.trustClass),
  );

  return {
    window: w,
    firings: { fired, total: routines.length },
    findings,
    grants: { machine, human },
    merges,
    revocations: revokedClasses.size,
  };
}

module.exports = { WEEK_MS, weeklyWindow, GRANT_AUDIT_RE, fleetPosture, deriveFleetCounters, isMachineGrant };
