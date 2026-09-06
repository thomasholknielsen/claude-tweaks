// bin/lib/timing/derive.js — pure derivation of per-phase timing (#1928).
//
// Input: a run's events (as appendEvent wrote them), its manifest (optional,
// phases[] is the manifest-side boundary source), and run-state (optional,
// pr.mergedAt ends the merge phase under pr-first). Output: the canonical
// ten-phase list, each with a span, an exclusive duration, and the source
// that bounded it. No I/O, no clock reads beyond the injectable `now`.
//
// Nested skills attribute to the enclosing phase via NESTED_PARENT. The map
// is NOT exhaustive by design: an un-mapped `claude-tweaks:*` skill_invoked
// event opens a new top-level phase named after the skill — the safe default
// (an unrecognized skill gets its own attributed span rather than silently
// nesting into an unrelated phase). A maintainer adding a new nested-skill
// call site inside review/wrap-up/build must add its name here, or every
// run will grow a spurious top-level phase.
'use strict';

const PHASES = ['call-1', 'call-2', 'build', 'plan', 'tasks', 'test', 'review', 'polish', 'wrap-up', 'merge'];

const NESTED_PARENT = Object.freeze({
  simplify: 'enclosing', reflect: 'enclosing', 'visual-review': 'enclosing', capture: 'enclosing',
  'design-wrapper': 'enclosing', challenge: 'enclosing', 'assess-agent-autonomy': 'enclosing',
  ledger: 'enclosing', journeys: 'enclosing',
});

const TERMINAL_TYPES = new Set(['session-end', 'close-run', 'worktree-reaped']);
const NS = 'claude-tweaks:';

function ms(iso) { const t = Date.parse(iso); return Number.isFinite(t) ? t : null; }
function minutesBetween(a, b) { return a === null || b === null || b < a ? 0 : Math.round((b - a) / 60000); }
function iso(t) { return t === null ? null : new Date(t).toISOString(); }
function skillName(ev) { return typeof ev.skill === 'string' && ev.skill.startsWith(NS) ? ev.skill.slice(NS.length) : null; }
function isTopLevel(ev) { const n = skillName(ev); return n !== null && !(n in NESTED_PARENT); }

// { events, manifest?, runState?, now? } -> { phases, totals }
function derivePhases({ events, manifest = null, runState = null, now = new Date() } = {}) {
  const evs = (Array.isArray(events) ? events : [])
    .filter((e) => e && typeof e === 'object' && ms(e.ts) !== null)
    .map((e) => ({ ...e, t: ms(e.ts) }))
    .sort((a, b) => a.t - b.t);
  const nowT = now instanceof Date ? now.getTime() : (ms(now) ?? Date.now());
  const terminal = evs.find((e) => TERMINAL_TYPES.has(e.type));
  const endOfRun = terminal ? terminal.t : nowT;

  const skillEvents = evs.filter((e) => e.type === 'skill_invoked');
  const flows = skillEvents.filter((e) => e.skill === `${NS}flow`);
  const topLevel = skillEvents.filter(isTopLevel);
  const verifies = evs.filter((e) => e.type === 'verify');
  const pushes = evs.filter((e) => e.type === 'commit' && e.action === 'push');
  const merges = evs.filter((e) => e.type === 'commit' && e.action === 'merge');

  const wrapUpStart = (() => { const w = topLevel.find((e) => e.skill === `${NS}wrap-up`); return w ? w.t : null; })();
  const mergeStart = wrapUpStart === null ? null : (pushes.find((e) => e.t > wrapUpStart) || { t: null }).t;

  // A top-level span ends at the earliest of: the next top-level event, the
  // merge phase's start, the terminal event (decision 3 in the plan).
  function spanEnd(startT, startIndexInTopLevel) {
    const next = topLevel[startIndexInTopLevel + 1];
    const candidates = [endOfRun];
    if (next) candidates.push(next.t);
    if (mergeStart !== null && mergeStart > startT) candidates.push(mergeStart);
    return Math.min(...candidates);
  }

  const spans = new Map(); // name -> [{start, end, source}]
  const add = (name, start, end, source) => {
    if (!spans.has(name)) spans.set(name, []);
    spans.get(name).push({ start, end: end < start ? start : end, source });
  };

  topLevel.forEach((e, i) => {
    const name = skillName(e);
    if (name === 'flow') return; // calls are handled below
    add(name, e.t, spanEnd(e.t, i), 'skill_invoked');
  });

  flows.forEach((f, i) => {
    const next = flows[i + 1];
    add(`call-${i + 1}`, f.t, next ? next.t : endOfRun, 'skill_invoked');
  });

  // plan / tasks nest in build.
  const plans = skillEvents.filter((e) => e.skill === 'superpowers:writing-plans');
  const sdds = skillEvents.filter((e) => e.skill === 'superpowers:subagent-driven-development');
  plans.forEach((p) => {
    const sdd = sdds.find((s) => s.t >= p.t);
    if (sdd) add('plan', p.t, sdd.t, 'skill_invoked');
  });
  sdds.forEach((s) => {
    const v = verifies.find((e) => e.t >= s.t);
    if (v) add('tasks', s.t, v.t, 'verify');
  });

  // polish: the LAST design-wrapper strictly after review's own first one
  // and before wrap-up's start (review's Step 6.5 always precedes polish's).
  const reviewStart = (() => { const r = topLevel.find((e) => e.skill === `${NS}review`); return r ? r.t : null; })();
  if (reviewStart !== null && wrapUpStart !== null) {
    const dws = skillEvents.filter((e) => e.skill === `${NS}design-wrapper` && e.t > reviewStart && e.t < wrapUpStart);
    if (dws.length >= 2) add('polish', dws[dws.length - 1].t, wrapUpStart, 'skill_invoked');
  }

  // merge: first push after wrap-up start → pr.mergedAt | merge commit | terminal.
  if (mergeStart !== null) {
    const mergedAt = runState && runState.pr && runState.pr.mergedAt ? ms(runState.pr.mergedAt) : null;
    const mergeCommit = merges.find((e) => e.t >= mergeStart);
    const end = mergedAt !== null ? mergedAt : (mergeCommit ? mergeCommit.t : endOfRun);
    add('merge', mergeStart, end, 'commit');
  }

  // Manifest phases[] fill gaps the events could not: a phase with no
  // skill_invoked span but a manifest transition gets its manifest span.
  const specs = manifest && manifest.multispec && Array.isArray(manifest.multispec.specs) ? manifest.multispec.specs : [];
  for (const spec of specs) {
    const log = Array.isArray(spec.phases) ? spec.phases : [];
    log.forEach((entry, i) => {
      if (spans.has(entry.phase)) return;
      const start = ms(entry.at);
      const next = log[i + 1];
      if (start === null) return;
      add(entry.phase, start, next && ms(next.at) !== null ? ms(next.at) : endOfRun, 'manifest');
    });
  }

  const names = [...PHASES, ...[...spans.keys()].filter((n) => !PHASES.includes(n))];
  const rows = names.map((name) => {
    const list = spans.get(name) || [];
    if (!list.length) {
      const unattributedStart = name === 'polish' && wrapUpStart !== null ? wrapUpStart : null;
      return { phase: name, start: iso(unattributedStart), end: iso(unattributedStart), minutes: 0, ownMinutes: 0, source: 'unattributed', verify: [] };
    }
    const start = Math.min(...list.map((s) => s.start));
    const end = Math.max(...list.map((s) => s.end));
    const minutes = list.reduce((sum, s) => sum + minutesBetween(s.start, s.end), 0);
    const verify = verifies.filter((v) => list.some((s) => v.t >= s.start && v.t <= s.end))
      .map((v) => ({ mode: v.mode ?? null, suitesRun: Array.isArray(v.suitesRun) ? v.suitesRun : [], durationMs: v.durationMs ?? null, pass: v.pass ?? null, at: v.ts }));
    return { phase: name, start: iso(start), end: iso(end), minutes, ownMinutes: minutes, source: list[0].source, verify, _list: list };
  });

  // Exclusive minutes: build minus plan/tasks; each call minus the top-level
  // phases whose spans fall inside it. Nothing is counted twice in totals.
  const byName = Object.fromEntries(rows.map((r) => [r.phase, r]));
  const nestedIn = (inner, outer) => inner._list && outer._list && inner._list.every((s) => outer._list.some((o) => s.start >= o.start && s.end <= o.end));
  if (byName.build._list) {
    byName.build.ownMinutes = Math.max(0, byName.build.minutes - byName.plan.minutes - byName.tasks.minutes);
  }
  for (const call of rows.filter((r) => /^call-\d+$/.test(r.phase) && r._list)) {
    let inner = 0;
    for (const r of rows) {
      if (r === call || /^call-\d+$/.test(r.phase) || r.phase === 'plan' || r.phase === 'tasks') continue;
      if (nestedIn(r, call)) inner += r.minutes;
    }
    call.ownMinutes = Math.max(0, call.minutes - inner);
  }
  // A verify event belongs to the innermost phase only — drop it from build
  // when tasks already claims it, so sub-rows are not double-listed.
  if (byName.build._list && byName.tasks._list) {
    const taskAts = new Set(byName.tasks.verify.map((v) => v.at));
    byName.build.verify = byName.build.verify.filter((v) => !taskAts.has(v.at));
  }
  for (const call of rows.filter((r) => /^call-\d+$/.test(r.phase))) call.verify = [];

  const phases = rows.map(({ _list, ...r }) => r);
  const totals = {
    minutes: phases.reduce((s, r) => s + r.ownMinutes, 0),
    verifyRuns: verifies.length,
    verifyModes: [...new Set(verifies.map((v) => v.mode).filter((m) => typeof m === 'string'))],
  };
  return { phases, totals };
}

module.exports = { derivePhases, PHASES, NESTED_PARENT };
