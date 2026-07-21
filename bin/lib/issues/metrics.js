// Pure: feedback-loop metrics for the work-record pipeline (backlog -> ready ->
// authorized -> closed). Computes durations and rates from data the caller
// already fetched via `gh api` (issue timeline events, comments, closed-issue
// lists) — no network calls here, matching every sibling module in this
// directory. Consumed by /claude-tweaks:tidy's --scope=github rolling digest.
'use strict';

const { normalizeLabelNames, ORIGINS } = require('./record');
const { hasOrigin } = require('./grouping');

const AUTHORIZATION_LABELS = ['auto:build', 'auto:merge'];

// Single-label convenience wrapper around record.js's normalizeLabelNames — the
// canonical label normalizer (gh's real API returns labels, and timeline "label"
// fields, as {name, color} objects, not plain strings) — for call sites here that
// only ever have one label at a time (a timeline event's `label` field) rather
// than a whole labels array.
function labelName(label) {
  return normalizeLabelNames([label])[0] || '';
}

// A single labeled event's timestamp for the first occurrence of `label` in
// `events` ([{event: 'labeled'|'unlabeled', label, created_at}]), or null when
// that label never appears — never fabricated as 0.
function firstLabelTime(events, label) {
  const match = (events || []).find((e) => e.event === 'labeled' && labelName(e.label) === label);
  return match ? new Date(match.created_at).getTime() : null;
}

// Earliest timestamp among the given labels' first occurrences, or null when
// none of them appear at all.
function earliestLabelTime(events, labels) {
  const times = labels.map((label) => firstLabelTime(events, label)).filter((t) => t !== null);
  return times.length > 0 ? Math.min(...times) : null;
}

// x -> parsed epoch ms, or null when x is falsy OR does not parse to a valid
// date. A truthy-but-unparseable timestamp must degrade exactly like the
// already-handled missing case, never survive as a poisoning NaN that flows
// into a duration subtraction and then a median (see summarizeFunnel) — the
// resulting NaN would still pass a bare `!== null` guard and, once
// JSON.stringify'd for a downstream consumer, silently render as `null`,
// indistinguishable from ordinary "no data".
function safeTimestamp(x) {
  if (!x) return null;
  const t = new Date(x).getTime();
  return Number.isFinite(t) ? t : null;
}

// { createdAt, closedAt, events } -> { shapingMs?, grantMs?, buildMs? }.
// Each key is present only when both its start and end timestamps are known —
// an issue still in an earlier stage yields fewer keys, not zeroed ones, so a
// later aggregate median is never silently corrupted by a fabricated 0.
function computeStageDurations({ createdAt, closedAt, events } = {}) {
  const created = safeTimestamp(createdAt);
  const readyAt = firstLabelTime(events, 'ready');
  const grantAt = earliestLabelTime(events || [], AUTHORIZATION_LABELS);
  const closed = safeTimestamp(closedAt);

  const durations = {};
  if (created !== null && readyAt !== null) durations.shapingMs = readyAt - created;
  if (readyAt !== null && grantAt !== null) durations.grantMs = grantAt - readyAt;
  if (grantAt !== null && closed !== null) durations.buildMs = closed - grantAt;
  return durations;
}

// Sorted-ascending numeric array -> median. Standard odd/even handling.
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// closedIssues: [{number, labels: string[], stateReason}] -> per-origin
// wontfix rate. Origin is whichever known ORIGINS entry the issue's labels
// carry — checked via grouping.js's hasOrigin, which (unlike a bare `by:`
// prefix scan) also recognizes the bare pre-migration label form
// (code-health/harness-health only ever had this form before the by:*
// migration; see grouping.js's own hasOrigin doc comment) — or 'human' when
// none match (_shared/work-record.md's origin axis convention). An origin
// with zero closed issues never occurs here by construction (it's only ever
// computed from issues that exist), so no div-by-zero guard is needed beyond
// total > 0.
function computeWontfixRate(closedIssues) {
  const byOrigin = {};
  for (const issue of closedIssues || []) {
    const names = normalizeLabelNames(issue.labels);
    const matchedOrigin = ORIGINS.find((candidate) => hasOrigin(names, candidate));
    const origin = matchedOrigin || 'human';
    if (!byOrigin[origin]) byOrigin[origin] = { total: 0, wontfix: 0 };
    byOrigin[origin].total += 1;
    if (issue.stateReason === 'NOT_PLANNED') byOrigin[origin].wontfix += 1;
  }
  const result = {};
  for (const [origin, { total, wontfix }] of Object.entries(byOrigin)) {
    result[origin] = { total, wontfix, rate: total > 0 ? (wontfix / total) * 100 : 0 };
  }
  return result;
}

// perIssueDurations: array of computeStageDurations() outputs.
// wontfixByOrigin: computeWontfixRate() output.
// retryStats: { failedAttempts, totalAttempts } (from retry.js's
// countFailedAttempts, summed across the sampled records by the caller).
// -> { transitions: { shapingMs/grantMs/buildMs: {medianMs, sampleSize} },
//      retryRate, wontfixByOrigin }.
function summarizeFunnel(perIssueDurations, wontfixByOrigin, retryStats) {
  const transitions = {};
  for (const key of ['shapingMs', 'grantMs', 'buildMs']) {
    const values = (perIssueDurations || []).map((d) => d[key]).filter((v) => v !== undefined);
    if (values.length > 0) transitions[key] = { medianMs: median(values), sampleSize: values.length };
  }
  const { failedAttempts = 0, totalAttempts = 0 } = retryStats || {};
  const retryRate = totalAttempts > 0 ? (failedAttempts / totalAttempts) * 100 : 0;
  return { transitions, retryRate, wontfixByOrigin: wontfixByOrigin || {} };
}

module.exports = { computeStageDurations, computeWontfixRate, summarizeFunnel };
