'use strict';

// Pure: the supervised trust table. Groups closed work records by
// (provenance x risk band) and tallies outcome signals per cell so a later
// phase can decide which classes of work have earned more autonomy. This
// module acts on nothing — it computes and returns rows for display only.
// See docs/superpowers/plans/2026-08-07-supervised-trust-table.md.
const { resolveProvenance } = require('./provenance.js');
const { dispositionState } = require('./acceptance.js');

// At roughly ten closed records per class per month, eight is about a month
// of evidence — small enough to ever graduate, large enough that one lucky
// record cannot carry a cell. It is a starting value, deliberately
// conservative, and Phase 3 is where it earns or loses its keep.
const MIN_SAMPLES = 8;

const RISK_LABEL_RE = /^risk:(.+)$/;

// Absence of a risk score is not evidence of safety — an unscored record
// bands as 'elevated', never 'low'. Conflicting evidence gets the same
// conservative default: any non-'low' risk label disqualifies 'low', even if
// a 'risk:low' label is also present. The taxonomy caps one risk label per
// record (record.js), so this defends an invariant rather than expecting a
// real violation — but the failure direction still matters, and 'elevated'
// is the safe one.
function riskBand(labels) {
  const names = Array.isArray(labels) ? labels : [];
  let sawLow = false;
  for (const name of names) {
    const match = RISK_LABEL_RE.exec(name);
    if (!match) continue;
    if (match[1] !== 'low') return 'elevated';
    sawLow = true;
  }
  return sawLow ? 'low' : 'elevated';
}

// A follow-up record's Origin line names the record it corrects, e.g.
// "Origin: demo changes-requested from #7". Parsed BEFORE resolveProvenance
// normalizes the body — the normalizer strips exactly this trailing clause.
//
// Capture-then-normalize, same strategy as provenance.js's own ORIGIN_LINE +
// TRAILING_SOURCE pair: match the whole line first, then extract '#N' from
// the captured text, rather than hard-anchoring '#(\d+)' straight to the
// line's end. A single hard-anchored pattern breaks on any trailing
// punctuation after the digits (e.g. "from #7." never matches "from #7$"),
// which silently drops a real Origin-line variant and undercounts followUps
// — a negative signal, so undercounting it can falsely flip a cell's verdict
// from 'mixed' to 'clean'. Trailing punctuation is stripped before the '#N'
// match is attempted; the digits themselves are never touched, so '#71'
// still can never resolve to target 7.
const ORIGIN_LINE_RE = /^Origin:[ \t]*(.+?)[ \t]*$/m;
const TRAILING_PUNCTUATION_RE = /[.,;:)\]]+$/;
const FOLLOWUP_TAIL_RE = /\bfrom[ \t]+#(\d+)$/i;

function followUpTarget(body) {
  const line = ORIGIN_LINE_RE.exec(typeof body === 'string' ? body : '');
  if (!line) return null;
  const trimmed = line[1].replace(TRAILING_PUNCTUATION_RE, '');
  const match = FOLLOWUP_TAIL_RE.exec(trimmed);
  return match ? Number(match[1]) : null;
}

function trustRows(records) {
  const all = Array.isArray(records) ? records : [];
  const closed = all.filter((r) => r && r.state === 'CLOSED');

  // Build cells from closed records only. Key on kind:source (never source
  // alone — see provenance.js) plus the risk band, joined with '|'.
  const cells = new Map();
  const cellByNumber = new Map();

  for (const record of closed) {
    const { kind, source } = resolveProvenance({ labels: record.labels, body: record.body });
    const band = riskBand(record.labels);
    const key = `${kind}:${source}|${band}`;

    let cell = cells.get(key);
    if (!cell) {
      cell = {
        key,
        provenance: `${kind}:${source}`,
        band,
        total: 0,
        approved: 0,
        changesRequested: 0,
        undispositioned: 0,
        notPlanned: 0,
        followUps: 0,
      };
      cells.set(key, cell);
    }

    cell.total += 1;
    if (record.stateReason === 'NOT_PLANNED') cell.notPlanned += 1;

    const disposition = dispositionState(record.labels);
    if (disposition === 'approved') cell.approved += 1;
    else if (disposition === 'changes-requested') cell.changesRequested += 1;
    else cell.undispositioned += 1;

    cellByNumber.set(record.number, cell);
  }

  // Open records are still scanned for follow-up Origin references — an open
  // follow-up is evidence about the closed record it names, even though the
  // follow-up itself never forms a cell of its own.
  for (const record of all) {
    const target = followUpTarget(record.body);
    if (target === null) continue;
    const cell = cellByNumber.get(target);
    if (cell) cell.followUps += 1;
  }

  const rows = Array.from(cells.values()).map((cell) => {
    const dispositioned = cell.approved + cell.changesRequested;
    let verdict = 'insufficient-evidence';
    if (cell.total >= MIN_SAMPLES && dispositioned >= 1) {
      const clean = cell.changesRequested === 0 && cell.followUps === 0 && cell.notPlanned === 0;
      verdict = clean ? 'clean' : 'mixed';
    }
    return { ...cell, verdict };
  });

  rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return rows;
}

module.exports = { riskBand, trustRows, MIN_SAMPLES };
