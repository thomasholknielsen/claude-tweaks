// bin/lib/residue/finding.js — the shared residue finding shape.
//
// `id` is a fingerprint over identity fields only. Evidence is deliberately
// excluded from the basis: it is diagnostic text, and a probe that reformats
// its output must not mint a new id and re-file a finding already tracked.
'use strict';

const { createFingerprint } = require('../health-core/fingerprint');
const { requireNonEmptyStrings } = require('../health-core/finding-validation');

const KINDS = Object.freeze(['worktree', 'branch', 'pr', 'suite', 'release', 'pipeline-run', 'artifact']);
const REMEDIES = Object.freeze(['auto', 'record']);

const { fingerprint } = createFingerprint('residue', ['kind', 'scope', 'subject']);

function makeFinding({ kind, scope, subject, remedy, evidence } = {}) {
  const base = { kind, scope, subject, remedy, evidence };
  return { ...base, id: fingerprint(base) };
}

function validateFinding(finding = {}) {
  // `= {}` only substitutes on `undefined` — a literal `null` argument reaches
  // `requireNonEmptyStrings` unguarded and throws on its `obj[field]` read.
  // No current caller passes `null` (every consumer validates a `makeFinding()`
  // result), but this guard is future-proofing against external input.
  const safeFinding = finding || {};
  const errors = requireNonEmptyStrings(safeFinding, ['id', 'kind', 'scope', 'subject', 'remedy', 'evidence']);
  if (safeFinding.kind && !KINDS.includes(safeFinding.kind)) errors.push(`kind: must be one of ${KINDS.join(', ')} (got ${JSON.stringify(safeFinding.kind)})`);
  if (safeFinding.remedy && !REMEDIES.includes(safeFinding.remedy)) errors.push(`remedy: must be one of ${REMEDIES.join(', ')} (got ${JSON.stringify(safeFinding.remedy)})`);
  if (safeFinding.scope && !['blast-radius', 'observed'].includes(safeFinding.scope)) errors.push(`scope: must be blast-radius or observed (got ${JSON.stringify(safeFinding.scope)})`);
  return errors;
}

module.exports = { makeFinding, validateFinding, KINDS, REMEDIES };
