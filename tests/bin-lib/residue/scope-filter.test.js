// tests/bin-lib/residue/scope-filter.test.js
//
// Covers the CLI --scope flag: it was parsed but never read (bin/residue.js
// discarded `opts.scope` after assigning it), so `--scope repo` and
// `--scope blast-radius` produced byte-identical output. These tests exist
// to fail if that regresses.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { filterResultsByScope } = require('../../../plugin/bin/lib/residue/scope-filter');
const { renderOutstanding } = require('../../../plugin/bin/lib/residue/render');
const { makeFinding } = require('../../../plugin/bin/lib/residue/finding');

const BLAST = makeFinding({
  kind: 'branch', scope: 'blast-radius', subject: 'origin/worktree-old', remedy: 'auto', evidence: 'merged, not deleted',
});
const OBSERVED = makeFinding({
  kind: 'worktree', scope: 'observed', subject: 'sibling worktree', remedy: 'record', evidence: 'on a branch this work did not produce',
});
const UNRUN = { ran: false, reason: 'gh unavailable or not authenticated', findings: [] };

test('--scope blast-radius drops an observed finding and keeps a blast-radius one', () => {
  const filtered = filterResultsByScope([{ ran: true, reason: null, findings: [BLAST, OBSERVED] }], 'blast-radius');
  const out = renderOutstanding({ results: filtered });
  assert.match(out, /origin\/worktree-old/);
  assert.doesNotMatch(out, /sibling worktree/);
});

test('--scope repo keeps both a blast-radius and an observed finding', () => {
  const filtered = filterResultsByScope([{ ran: true, reason: null, findings: [BLAST, OBSERVED] }], 'repo');
  const out = renderOutstanding({ results: filtered });
  assert.match(out, /origin\/worktree-old/);
  assert.match(out, /sibling worktree/);
});

test("an unrun probe's unknown line survives --scope blast-radius", () => {
  const filtered = filterResultsByScope([{ ran: true, reason: null, findings: [BLAST, OBSERVED] }, UNRUN], 'blast-radius');
  const out = renderOutstanding({ results: filtered });
  assert.match(out, /unknown: gh unavailable or not authenticated/);
});

test("an unrun probe's unknown line survives --scope repo", () => {
  const filtered = filterResultsByScope([{ ran: true, reason: null, findings: [BLAST, OBSERVED] }, UNRUN], 'repo');
  const out = renderOutstanding({ results: filtered });
  assert.match(out, /unknown: gh unavailable or not authenticated/);
});

test('a value other than "blast-radius" (including an unrecognized one) behaves like repo — no filtering', () => {
  const filtered = filterResultsByScope([{ ran: true, reason: null, findings: [BLAST, OBSERVED] }], 'nonsense');
  const out = renderOutstanding({ results: filtered });
  assert.match(out, /origin\/worktree-old/);
  assert.match(out, /sibling worktree/);
});
