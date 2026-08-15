'use strict';

// Wrap-up curation registry: declarative rows with gates, scopes, and dispositions.
// Gate philosophy: fact-gates are deterministic (computed by facts.js). Where the
// true condition is a judgment, the fact-gate is the deterministic superset and
// the judge applies the real criterion. Signal-gates take model-supplied booleans/counts.

const REGISTRY = [
  {
    id: 'skills',
    target: 'Skills',
    judge: 'skill-curation.md',
    disposition: 'apply-or-stage',
    gate: Object.freeze({ kind: 'facts', anyOf: ['skillsLibraryExists', 'multiFileDiff'] }),
    scope: Object.freeze({ kind: 'domain-overlap', cap: 5, fastLaneCap: 2, budgetFlag: 'skill-budget' }),
  },
  {
    id: 'docs',
    target: 'Docs',
    judge: 'docs-health-integration.md',
    disposition: 'apply-or-stage',
    gate: Object.freeze({ kind: 'facts', anyOf: ['docsTreeNonEmpty'] }),
    scope: Object.freeze({ kind: 'domain-overlap', cap: 3, fastLaneCap: 1, budgetFlag: 'doc-budget' }),
  },
  {
    id: 'journeys',
    target: 'Journeys',
    judge: 'journey-curation.md',
    disposition: 'apply-or-stage',
    gate: Object.freeze({ kind: 'facts', anyOf: ['journeysExist'] }),
    scope: Object.freeze({ kind: 'frontmatter-overlap' }),
  },
  {
    id: 'claude-md',
    target: 'CLAUDE.md & rules',
    judge: 'claude-md-curation.md',
    disposition: 'stage-only',
    gate: Object.freeze({ kind: 'facts', anyOf: ['claudeMdCommandRenamed', 'claudeMdOverBudget'], orSignals: ['dontCandidate', 'contradictedConvention', 'incidentRecorded'] }),
    scope: Object.freeze({ kind: 'fixed', paths: ['CLAUDE.md', '.claude/rules/'] }),
  },
  {
    id: 'decision-records',
    target: 'Decision records',
    judge: 'adr-curation.md',
    disposition: 'stage',
    gate: Object.freeze({ kind: 'signals', key: 'adrCandidateCount', nonZero: true }),
    scope: Object.freeze({ kind: 'signals' }),
  },
  {
    id: 'references',
    target: 'Broken references',
    judge: 'reference-sweep.md',
    disposition: 'apply-or-stage',
    gate: Object.freeze({ kind: 'facts', anyOf: ['renamedOrDeleted', 'headingRenamed'] }),
    scope: Object.freeze({ kind: 'renamed-deleted' }),
  },
  {
    id: 'memory',
    target: 'Memory',
    judge: 'memory-curation.md',
    disposition: 'stage',
    gate: Object.freeze({ kind: 'signals', key: 'd4Count', nonZero: true }),
    scope: Object.freeze({ kind: 'signals' }),
  },
  {
    id: 'upstream',
    target: 'Upstream feedback',
    judge: 'upstream-feedback.md',
    disposition: 'stage',
    gate: Object.freeze({ kind: 'signals', key: 'd5Count', nonZero: true }),
    scope: Object.freeze({ kind: 'signals' }),
  },
].map(Object.freeze);

Object.freeze(REGISTRY);

const ROW_IDS = Object.freeze(REGISTRY.map(r => r.id));

function rowById(id) {
  return REGISTRY.find(r => r.id === id);
}

module.exports = { REGISTRY, rowById, ROW_IDS };
