'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRepo } = require('../../plugin/bin/lib/repo-resolve');

test('parseRepo: SSH remote URL', () => {
  assert.deepEqual(parseRepo('git@github.com:o/r.git'), { owner: 'o', repo: 'r' });
});

test('parseRepo: HTTPS remote URL', () => {
  assert.deepEqual(parseRepo('https://github.com/o/r.git'), { owner: 'o', repo: 'r' });
});

test('parseRepo: HTTPS remote URL without .git suffix', () => {
  assert.deepEqual(parseRepo('https://github.com/o/r'), { owner: 'o', repo: 'r' });
});

test('parseRepo: an owner/name string wrapped as github.com/owner/name (the --repo CLI flag shape)', () => {
  assert.deepEqual(parseRepo('github.com/o/r'), { owner: 'o', repo: 'r' });
});

test('parseRepo: non-GitHub or malformed URL -> null', () => {
  assert.equal(parseRepo('https://gitlab.com/o/r.git'), null);
  assert.equal(parseRepo(''), null);
  assert.equal(parseRepo(null), null);
  assert.equal(parseRepo(undefined), null);
});
