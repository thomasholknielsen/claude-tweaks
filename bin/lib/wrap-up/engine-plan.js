// bin/lib/wrap-up/engine-plan.js — pure worklist builder for the wrap-up
// curation engine. buildWorklist() maps REGISTRY (registry.js) to a worklist
// of gate/scope decisions. It never shells out, never reads the filesystem,
// and never reads the clock: facts, signals, ceremonyProfile, budgets, and
// journeyFrontmatter all arrive as arguments. Any I/O needed to produce those
// arguments belongs to the CLI, not here.
'use strict';

const { REGISTRY } = require('./registry');

// Plain-language reasons for the deterministic fact gates. Each entry names
// the fact both when it opens the gate and when its absence keeps it closed.
const FACT_REASONS = {
  skillsLibraryExists: { open: '.claude/skills/ exists', closed: 'no .claude/skills/ directory' },
  multiFileDiff: { open: '2+ files changed', closed: 'fewer than 2 files changed' },
  docsTreeNonEmpty: { open: 'docs/ tree exists', closed: 'no docs/ tree' },
  journeysExist: { open: 'docs/journeys/ exists', closed: 'no journeys' },
  claudeMdCommandRenamed: { open: 'CLAUDE.md Commands section changed', closed: 'CLAUDE.md Commands section unchanged' },
  claudeMdOverBudget: { open: 'CLAUDE.md/rules over the size budget', closed: 'CLAUDE.md/rules within budget' },
  renamedOrDeleted: { open: 'renames or deletions in diff', closed: 'no renames or deletions in diff' },
  headingRenamed: { open: 'a heading was renamed in a modified file', closed: 'no renamed headings' },
};

// Plain-language reasons for the boolean orSignals used by the claude-md
// hybrid gate — these only ever contribute an "open" reason since the gate
// falls through to the fact-closed reason when none of them fire.
const SIGNAL_BOOL_REASONS = {
  dontCandidate: "don't-repeat candidate found",
  contradictedConvention: 'convention contradicted',
  incidentRecorded: 'incident recorded',
};

// Plain-language reasons for the numeric signal gates.
const SIGNAL_COUNT_REASONS = {
  adrCandidateCount: {
    open: (n) => `${n} ADR candidate${n === 1 ? '' : 's'} found`,
    closed: 'no ADR candidates found',
  },
  d4Count: {
    open: (n) => `${n} insight${n === 1 ? '' : 's'} routed to memory`,
    closed: 'no insights routed to memory',
  },
  d5Count: {
    open: (n) => `${n} learning${n === 1 ? '' : 's'} routed upstream`,
    closed: 'no learnings routed upstream',
  },
};

function evaluateGate(row, facts, signals) {
  const g = row.gate;

  if (g.kind === 'facts') {
    const openFactKey = g.anyOf.find((key) => facts[key]);
    if (openFactKey) {
      return { gate: 'open', gateReason: (FACT_REASONS[openFactKey] || {}).open || `${openFactKey} true` };
    }

    const openSignalKey = g.orSignals && g.orSignals.find((key) => signals[key]);
    if (openSignalKey) {
      return { gate: 'open', gateReason: SIGNAL_BOOL_REASONS[openSignalKey] || `${openSignalKey} true` };
    }

    const closedParts = g.anyOf.map((key) => (FACT_REASONS[key] || {}).closed || `no ${key}`);
    if (g.orSignals && g.orSignals.length) closedParts.push('no signals raised');
    return { gate: 'closed', gateReason: closedParts.join(', ') };
  }

  if (g.kind === 'signals') {
    const value = signals[g.key] || 0;
    const opened = g.nonZero ? value > 0 : Boolean(value);
    const reasonDef = SIGNAL_COUNT_REASONS[g.key];
    if (opened) {
      return { gate: 'open', gateReason: reasonDef ? reasonDef.open(value) : `${g.key}=${value}` };
    }
    return { gate: 'closed', gateReason: reasonDef ? reasonDef.closed : `no ${g.key}` };
  }

  throw new Error(`engine-plan: unknown gate kind '${g.kind}'`);
}

function resolveDomainOverlapScope(row, { ceremonyProfile, budgets }) {
  const s = row.scope;
  const flagValue = budgets ? budgets[s.budgetFlag] : undefined;
  let cap;
  let capSource;
  if (flagValue !== undefined && flagValue !== null) {
    cap = flagValue;
    capSource = 'flag';
  } else if (ceremonyProfile === 'fast-lane') {
    cap = s.fastLaneCap;
    capSource = 'fast-lane';
  } else {
    cap = s.cap;
    capSource = 'default';
  }
  return { kind: s.kind, cap, capSource, candidates: null };
}

function resolveFrontmatterOverlapScope(row, { facts, journeyFrontmatter }) {
  const map = journeyFrontmatter || {};
  const changed = new Set(facts.changedFiles || []);
  const candidates = Object.keys(map).filter((journeyPath) =>
    (map[journeyPath] || []).some((file) => changed.has(file)));
  return { kind: row.scope.kind, cap: null, capSource: null, candidates };
}

function resolveScope(row, ctx) {
  switch (row.scope.kind) {
    case 'domain-overlap':
      return resolveDomainOverlapScope(row, ctx);
    case 'frontmatter-overlap':
      return resolveFrontmatterOverlapScope(row, ctx);
    case 'fixed':
      return { kind: row.scope.kind, cap: null, capSource: null, candidates: row.scope.paths };
    case 'signals':
      return { kind: row.scope.kind, cap: null, capSource: null, candidates: null };
    case 'renamed-deleted':
      return { kind: row.scope.kind, cap: null, capSource: null, candidates: ctx.facts.renamedDeleted || [] };
    default:
      throw new Error(`engine-plan: unknown scope kind '${row.scope.kind}'`);
  }
}

function buildWorklist({ facts, signals = {}, ceremonyProfile, budgets = {}, journeyFrontmatter } = {}) {
  const ctx = { facts, signals, ceremonyProfile, budgets, journeyFrontmatter };
  const rows = REGISTRY.map((row) => {
    const { gate, gateReason } = evaluateGate(row, facts, signals);
    const scope = resolveScope(row, ctx);
    return {
      id: row.id,
      target: row.target,
      judge: row.judge,
      disposition: row.disposition,
      gate,
      gateReason,
      scope,
    };
  });

  return { version: 1, ceremonyProfile, rows };
}

module.exports = { buildWorklist };
