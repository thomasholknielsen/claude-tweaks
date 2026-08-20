'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { classifyOwnership } = require('../../../plugin/bin/lib/hooks/context');
const { gitRepo, linkedWorktreeOf } = require('../../helpers/git-fixtures');

test('foreign: both session ids present and different, regardless of cwd/binding', () => {
  const main = gitRepo();
  assert.strictEqual(
    classifyOwnership({ sessionId: 'session-a', cwd: main }, { sessionId: 'session-b' }),
    'foreign',
  );
});

test('foreign on distinct ids even when the caller sits inside the recorded worktree', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  assert.strictEqual(
    classifyOwnership({ sessionId: 'session-a', cwd: wt }, { sessionId: 'session-b', worktree: wt }),
    'foreign',
  );
});

test('indeterminate: caller cwd missing or empty', () => {
  assert.strictEqual(classifyOwnership({ sessionId: 's', cwd: '' }, { sessionId: 's' }), 'indeterminate');
  assert.strictEqual(classifyOwnership({ sessionId: 's' }, { sessionId: 's' }), 'indeterminate');
});
