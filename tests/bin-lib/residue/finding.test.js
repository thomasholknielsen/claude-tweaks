const { test } = require('node:test');
const assert = require('node:assert');
const { makeFinding, validateFinding, KINDS, REMEDIES } = require('../../../plugin/bin/lib/residue/finding');

const BRANCH = {
  kind: 'branch', scope: 'blast-radius', subject: 'worktree-foo',
  remedy: 'auto', evidence: 'git branch -r --merged origin/main',
};

test('makeFinding assigns a stable id for identical input', () => {
  assert.strictEqual(makeFinding(BRANCH).id, makeFinding(BRANCH).id);
});

test('makeFinding assigns different ids to different subjects', () => {
  const other = makeFinding({ ...BRANCH, subject: 'worktree-bar' });
  assert.notStrictEqual(makeFinding(BRANCH).id, other.id);
});

test('the id is stable across cosmetic evidence rewording', () => {
  // Evidence is diagnostic text, not identity — re-running a probe that
  // formats its output differently must not re-file the same finding.
  const reworded = makeFinding({ ...BRANCH, evidence: 'git   branch -r  --merged   origin/main' });
  assert.strictEqual(makeFinding(BRANCH).id, reworded.id);
});

test('validateFinding rejects an unknown kind', () => {
  const errors = validateFinding(makeFinding({ ...BRANCH, kind: 'nonsense' }));
  assert.ok(errors.some((e) => e.includes('kind')), `expected a kind error, got ${JSON.stringify(errors)}`);
});

test('validateFinding rejects a missing subject', () => {
  const errors = validateFinding(makeFinding({ ...BRANCH, subject: '' }));
  assert.ok(errors.some((e) => e.includes('subject')), `expected a subject error, got ${JSON.stringify(errors)}`);
});

test('validateFinding accepts a well-formed finding', () => {
  assert.deepStrictEqual(validateFinding(makeFinding(BRANCH)), []);
});

test('validateFinding(null) returns a non-throwing error array', () => {
  const errors = validateFinding(null);
  assert.ok(Array.isArray(errors));
  assert.ok(errors.length > 0);
  assert.ok(errors.some((e) => e.includes('id')), `expected an id error, got ${JSON.stringify(errors)}`);
});

test('KINDS and REMEDIES are frozen', () => {
  assert.ok(Object.isFrozen(KINDS) && Object.isFrozen(REMEDIES));
});

test('pipeline-run is a valid finding kind', () => {
  assert.ok(KINDS.includes('pipeline-run'));
  const finding = makeFinding({
    kind: 'pipeline-run', scope: 'blast-radius', subject: '.claude-tweaks/pipelines/2026-01-01T000000-spec-1',
    remedy: 'auto', evidence: 'run-state.json status: clean, not under archive/',
  });
  assert.deepStrictEqual(validateFinding(finding), []);
});
