// bin/lib/recon/score.js
// Pure area scorer. Signals are pre-collected by the CLI (no child_process here).
'use strict';

const MAX_STALE_DAYS = 30;        // round-robin floor: areas past this are force-boosted
const STALE_BOOST = 1.0;          // additive boost applied once an area exceeds MAX_STALE_DAYS

// Normalization caps (raw signal value that maps to 1.0).
const CHURN_CAP = 50;
const LOC_CAP = 10000;
const PRIOR_CAP = 20;
const FANIN_CAP = 25;

// Weights sum to 1.0 across the five signals.
const WEIGHTS = {
  staleness: 0.30,
  churn: 0.25,
  fanIn: 0.20,   // blast radius
  loc: 0.10,
  priorFindings: 0.15,
};

function clamp01(n) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1 ? 1 : n;
}

// areas: Area[]; signals: { [areaId]: { lastSweptMs, churn, loc, priorFindings, fanIn } };
// now: ms epoch. Returns areas with a `score` field, sorted descending (alpha id tie-break).
function scoreAreas(areas, signals, now) {
  const scored = areas.map((area) => {
    const s = signals[area.id] || {};
    const lastSweptMs = s.lastSweptMs == null ? null : s.lastSweptMs;

    const stalenessRaw =
      lastSweptMs === null ? 1 : clamp01((now - lastSweptMs) / (MAX_STALE_DAYS * 86400000));
    const churnRaw = clamp01((s.churn || 0) / CHURN_CAP);
    const locRaw = clamp01((s.loc || 0) / LOC_CAP);
    const priorRaw = clamp01((s.priorFindings || 0) / PRIOR_CAP);
    const fanInRaw = clamp01((s.fanIn || 0) / FANIN_CAP);

    let score =
      WEIGHTS.staleness * stalenessRaw +
      WEIGHTS.churn * churnRaw +
      WEIGHTS.fanIn * fanInRaw +
      WEIGHTS.loc * locRaw +
      WEIGHTS.priorFindings * priorRaw;

    // Round-robin floor: any area never swept or past MAX_STALE_DAYS gets a boost,
    // guaranteeing eventual full coverage no matter how cold it is.
    const daysSinceSwept =
      lastSweptMs === null ? Infinity : (now - lastSweptMs) / 86400000;
    if (daysSinceSwept > MAX_STALE_DAYS) score += STALE_BOOST;

    return { ...area, score };
  });

  scored.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  return scored;
}

module.exports = { scoreAreas, MAX_STALE_DAYS, STALE_BOOST, WEIGHTS };
