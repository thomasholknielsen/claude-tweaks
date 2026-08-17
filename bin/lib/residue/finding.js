// bin/lib/residue/finding.js — the shared residue finding shape.
//
// `id` is a fingerprint over identity fields only. Evidence is deliberately
// excluded from the basis: it is diagnostic text, and a probe that reformats
// its output must not mint a new id and re-file a finding already tracked.
'use strict';

const { createFingerprint } = require('../health-core/fingerprint');
const { requireNonEmptyStrings } = require('../health-core/finding-validation');

const KINDS = Object.freeze(['worktree', 'branch', 'pr', 'suite', 'release', 'pipeline-run']);
const REMEDIES = Object.freeze(['auto', 'record']);

const { fingerprint } = createFingerprint('residue', ['kind', 'scope', 'subject']);

function makeFinding({ kind, scope, subject, remedy, evidence } = {}) {
  const base = { kind, scope, subject, remedy, evidence };
  return { ...base, id: fingerprint(base) };
}

function validateFinding(finding = {}) {
  const errors = requireNonEmptyStrings(finding, ['id', 'kind', 'scope', 'subject', 'remedy', 'evidence']);
  if (finding.kind && !KINDS.includes(finding.kind)) errors.push(`kind: must be one of ${KINDS.join(', ')} (got ${JSON.stringify(finding.kind)})`);
  if (finding.remedy && !REMEDIES.includes(finding.remedy)) errors.push(`remedy: must be one of ${REMEDIES.join(', ')} (got ${JSON.stringify(finding.remedy)})`);
  if (finding.scope && !['blast-radius', 'observed'].includes(finding.scope)) errors.push(`scope: must be blast-radius or observed (got ${JSON.stringify(finding.scope)})`);
  return errors;
}

module.exports = { makeFinding, validateFinding, KINDS, REMEDIES };
