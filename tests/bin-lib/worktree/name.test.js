'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeWorktreeName } = require('../../../bin/lib/worktree/name');

// EnterWorktree's own charset (build/worktree-setup.md's Gotcha, mirrored from #689):
// letters, digits, dots, underscores, dashes per /-segment, <=64 chars total.
const VALID = /^[A-Za-z0-9._-]+$/;

test('issue #689 own example: + maps to -', () => {
  const out = sanitizeWorktreeName('flow+spec-654-655');
  assert.equal(out, 'flow-spec-654-655');
  assert.match(out, VALID);
});

test('space maps to -, runs of - collapse (adjacent space+# example)', () => {
  const out = sanitizeWorktreeName('spec #42');
  assert.equal(out, 'spec-42');
  assert.match(out, VALID);
});

test('/ maps to -', () => {
  const out = sanitizeWorktreeName('flow/spec/654/655');
  assert.equal(out, 'flow-spec-654-655');
  assert.match(out, VALID);
});

test('# maps to -', () => {
  const out = sanitizeWorktreeName('#42-fix-thing');
  assert.equal(out, '-42-fix-thing');
  assert.match(out, VALID);
});

test('already-valid characters (letters, digits, dot, underscore, dash) pass through unchanged', () => {
  const out = sanitizeWorktreeName('flow-spec.654_655');
  assert.equal(out, 'flow-spec.654_655');
  assert.match(out, VALID);
});

test('multiple adjacent invalid characters collapse to a single dash', () => {
  const out = sanitizeWorktreeName('flow   spec');
  assert.equal(out, 'flow-spec');
  assert.match(out, VALID);
});

test('length cap: truncated to 64 characters', () => {
  const long = 'a'.repeat(100);
  const out = sanitizeWorktreeName(long);
  assert.equal(out.length, 64);
  assert.equal(out, 'a'.repeat(64));
  assert.match(out, VALID);
});

test('sanitizing then capping does not leave a name over 64 chars even when invalid chars inflate collapsing', () => {
  // 70 valid chars separated by invalid runs that collapse down — cap still enforced post-collapse.
  const input = Array.from({ length: 70 }, (_, i) => `w${i}`).join('   ');
  const out = sanitizeWorktreeName(input);
  assert.ok(out.length <= 64, `expected <=64, got ${out.length}`);
  assert.match(out, VALID);
});

test('empty string stays empty', () => {
  assert.equal(sanitizeWorktreeName(''), '');
});
