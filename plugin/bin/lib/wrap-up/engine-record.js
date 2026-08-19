// bin/lib/wrap-up/engine-record.js — wrap-up curation engine: state
// initialization, judgment-payload validation, uniform SCANNED decision
// lines, and outcome telemetry.
//
// Two entry points:
//   initState({ runDir, worklist, now, telemetryPath }) — called once by
//     `plan`. Writes engine-state.json (worklist + empty results map), then
//     immediately pre-resolves every CLOSED row: result 'na', a SCANNED line,
//     and a telemetry line.
//   recordResult({ runDir, payload, now, dryRun, telemetryPath }) — called
//     once per OPEN row with the model's judgment payload. Validates,
//     appends one SCANNED line and one telemetry line (unless dryRun), and
//     updates engine-state.json.
//
// IL-01 discipline: stored results are built by picking named fields off the
// payload into a fresh object alongside derived fields (target from
// REGISTRY, rowId) — never `{ ...payload }`. A payload cannot smuggle extra
// keys or override a derived field this way.
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STATE_FILE = 'engine-state.json';
const DECISIONS_FILE = 'decisions.md';

// ---- time helpers -----------------------------------------------------

function toDate(now) {
  if (now instanceof Date) return now;
  if (typeof now === 'string' && now) return new Date(now);
  return new Date();
}

function isoTime(now) {
  return toDate(now).toISOString();
}

function dateOnly(now) {
  return isoTime(now).slice(0, 10);
}

// ---- state file I/O ----------------------------------------------------

function statePath(runDir) {
  return path.join(runDir, STATE_FILE);
}

function readEngineState(runDir) {
  return JSON.parse(fs.readFileSync(statePath(runDir), 'utf8'));
}

function writeEngineState(runDir, state) {
  fs.writeFileSync(statePath(runDir), `${JSON.stringify(state, null, 2)}\n`);
}

function worklistRows(worklist) {
  return worklist && Array.isArray(worklist.rows) ? worklist.rows : worklist;
}

// ---- decisions.md (append-only audit log) ------------------------------

function appendDecisionLine(runDir, line) {
  fs.appendFileSync(path.join(runDir, DECISIONS_FILE), `${line}\n`);
}

// ---- SCANNED line rendering ---------------------------------------------

function formatReadPaths(read) {
  if (!read || read.length === 0) return 'none';
  return read.map((r) => r.path).join(', ');
}

function formatResultText(result, findings) {
  if (result === 'na') return 'n/a';
  if (result === 'clean') return 'clean';
  if (result === 'findings') {
    const applied = (findings || []).filter((f) => f.action === 'applied').length;
    const staged = (findings || []).filter((f) => f.action === 'staged').length;
    return `${applied} applied, ${staged} staged`;
  }
  return String(result);
}

function hasAppliedFinding(findings) {
  return (findings || []).some((f) => f.action === 'applied');
}

function buildScannedLine({ isoTime: time, target, gate, gateReason, read, gapDetection, result, findings }) {
  const n = read ? read.length : 0;
  const paths = formatReadPaths(read);
  const gapText = gapDetection === 'run' ? 'run' : 'not run';
  const resultText = formatResultText(result, findings);
  const reversibility = hasAppliedFinding(findings) ? 'high (separate commit)' : 'N/A';
  return `SCANNED ${time} — ${target}: gate ${gate} (${gateReason}); read ${n} (${paths}); gap detection: ${gapText}. Result: ${resultText}. Reversibility: ${reversibility}.`;
}

// ---- telemetry -----------------------------------------------------------

function telemetryOutcome(result, findings) {
  if (result === 'na') return 'na';
  if (result === 'clean') return 'clean';
  if (result === 'findings') return hasAppliedFinding(findings) ? 'applied' : 'staged';
  return String(result);
}

// Coupled reader: plugin/bin/lib/calibration/tsv-reader.js parses this exact column shape.
function appendTelemetry(telemetryPath, { now, runId, rowId, gate, findings, result }) {
  // telemetryPath is an explicit param, not defaulted here — the CLI resolves
  // the production path. When absent (e.g. a caller that hasn't wired it up
  // yet), skip the append silently rather than throw or guess a location.
  if (!telemetryPath) return;
  const date = dateOnly(now);
  const count = (findings || []).length;
  const outcome = telemetryOutcome(result, findings);
  const line = `${date}\t${runId}\t${rowId}\t${gate}\t${count}\t${outcome}\n`;
  fs.appendFileSync(telemetryPath, line);
}

// ---- payload validation ---------------------------------------------------

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error("recordResult: payload is missing or not an object");
  }
  if (typeof payload.rowId !== 'string' || !payload.rowId) {
    throw new Error("recordResult: payload.rowId is missing or not a string");
  }
  if (payload.result !== 'clean' && payload.result !== 'findings') {
    throw new Error(`recordResult: payload.result must be 'clean' or 'findings' (rowId '${payload.rowId}')`);
  }
  if (payload.gapDetection !== 'run' && payload.gapDetection !== 'not-run') {
    throw new Error(`recordResult: payload.gapDetection must be 'run' or 'not-run' (rowId '${payload.rowId}')`);
  }
  if (payload.read !== undefined && !Array.isArray(payload.read)) {
    throw new Error(`recordResult: payload.read must be an array (rowId '${payload.rowId}')`);
  }
  if (payload.result === 'findings') {
    if (!Array.isArray(payload.findings) || payload.findings.length === 0) {
      throw new Error(`recordResult: payload.findings must be a non-empty array when result is 'findings' (rowId '${payload.rowId}')`);
    }
    // Each entry drives formatResultText/hasAppliedFinding/telemetryOutcome,
    // all of which filter on f.action — an unvalidated model judgment output
    // with a malformed or missing 'action' would silently render as 0
    // applied/0 staged in the permanent decisions.md audit line while
    // findings.length still counts it. Validate every entry.
    payload.findings.forEach((finding, index) => {
      if (!finding || typeof finding !== 'object') {
        throw new Error(`recordResult: payload.findings[${index}] must be an object (rowId '${payload.rowId}')`);
      }
      if (finding.action !== 'applied' && finding.action !== 'staged') {
        throw new Error(`recordResult: payload.findings[${index}].action must be 'applied' or 'staged' (rowId '${payload.rowId}')`);
      }
      if (typeof finding.kind !== 'string' || !finding.kind) {
        throw new Error(`recordResult: payload.findings[${index}].kind must be a non-empty string (rowId '${payload.rowId}')`);
      }
      if (typeof finding.summary !== 'string' || !finding.summary) {
        throw new Error(`recordResult: payload.findings[${index}].summary must be a non-empty string (rowId '${payload.rowId}')`);
      }
    });
  } else if (payload.findings !== undefined && !Array.isArray(payload.findings)) {
    throw new Error(`recordResult: payload.findings must be an array (rowId '${payload.rowId}')`);
  }
}

// A row's disposition (from REGISTRY, via the worklist row) governs whether
// findings may be auto-applied. 'stage' and 'stage-only' rows — e.g.
// claude-md, memory, upstream — exist precisely because their findings must
// never land without a human seeing them first (claude-md: CLAUDE.md/rules
// edits are ceremony-gated by design). validatePayload alone can't check
// this: disposition lives on the worklist row, not the payload, so this
// runs in recordResult once the row is in hand — after the closed/
// already-recorded checks, before anything is written.
function validateDispositionForRow(payload, row) {
  if (payload.result !== 'findings') return;
  if (row.disposition !== 'stage' && row.disposition !== 'stage-only') return;
  payload.findings.forEach((finding, index) => {
    if (finding.action === 'applied') {
      throw new Error(
        `recordResult: payload.findings[${index}].action cannot be 'applied' — row '${payload.rowId}' has disposition '${row.disposition}'`
      );
    }
  });
}

// ---- public API -----------------------------------------------------------

function initState({ runDir, worklist, now, telemetryPath }) {
  const rows = worklistRows(worklist);
  const time = isoTime(now);
  const runId = path.basename(runDir);
  const results = {};

  for (const row of rows) {
    if (row.gate !== 'closed') continue;
    results[row.id] = { rowId: row.id, target: row.target, result: 'na', detail: row.gateReason };

    const line = buildScannedLine({
      isoTime: time, target: row.target, gate: row.gate, gateReason: row.gateReason,
      read: [], gapDetection: 'not-run', result: 'na', findings: [],
    });
    appendDecisionLine(runDir, line);

    appendTelemetry(telemetryPath, { now, runId, rowId: row.id, gate: 'closed', findings: [], result: 'na' });
  }

  const state = { version: 1, worklist, results };
  writeEngineState(runDir, state);
  return state;
}

function recordResult({ runDir, payload, now, dryRun, telemetryPath }) {
  validatePayload(payload);

  const state = readEngineState(runDir);
  const rows = worklistRows(state.worklist);
  const row = rows.find((r) => r.id === payload.rowId);

  if (!row) {
    throw new Error(`recordResult: unknown rowId '${payload.rowId}' (not in the worklist)`);
  }
  if (row.gate === 'closed') {
    throw new Error(`recordResult: row '${payload.rowId}' is closed and cannot be recorded (${row.gateReason})`);
  }
  if (state.results[payload.rowId]) {
    throw new Error(`recordResult: row '${payload.rowId}' was already recorded`);
  }

  validateDispositionForRow(payload, row);

  const findings = Array.isArray(payload.findings) ? payload.findings : [];
  const read = Array.isArray(payload.read) ? payload.read : [];

  // IL-01: pick named fields into a fresh object alongside derived fields.
  // Never `{ ...payload }` — a payload cannot smuggle extra keys or override
  // 'target', which is always sourced from the worklist row (REGISTRY).
  const stored = {
    rowId: payload.rowId,
    target: row.target,
    result: payload.result,
    detail: payload.detail,
    findings,
    read,
    gapDetection: payload.gapDetection,
  };

  const time = isoTime(now);
  const line = buildScannedLine({
    isoTime: time, target: row.target, gate: row.gate, gateReason: row.gateReason,
    read, gapDetection: payload.gapDetection, result: payload.result, findings,
  });
  appendDecisionLine(runDir, line);

  if (!dryRun) {
    appendTelemetry(telemetryPath, {
      now, runId: path.basename(runDir), rowId: payload.rowId, gate: row.gate, findings, result: payload.result,
    });
  }

  state.results[payload.rowId] = stored;
  writeEngineState(runDir, state);

  return stored;
}

module.exports = { initState, recordResult, appendTelemetry };
