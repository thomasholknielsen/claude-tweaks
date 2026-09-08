'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { fetchLinkedPRs } = require('../../../plugin/bin/lib/issues/linked-prs');

const resp = (repository) => JSON.stringify({ data: { repository } });

test('fetchLinkedPRs maps each alias to its open linked PR number', () => {
  const runner = () => resp({
    i1224: { number: 1224, closedByPullRequestsReferences: { nodes: [{ number: 1572, state: 'OPEN' }] } },
    i257: { number: 257, closedByPullRequestsReferences: { nodes: [{ number: 900, state: 'MERGED' }] } },
  });
  const out = fetchLinkedPRs({ numbers: [1224, 257], owner: 'o', repo: 'r', runner });
  assert.deepStrictEqual(out.get(1224), { openPR: 1572 });
  assert.deepStrictEqual(out.get(257), { openPR: null });
});

test('no linked PR at all reports openPR: null', () => {
  const runner = () => resp({ i42: { number: 42, closedByPullRequestsReferences: { nodes: [] } } });
  const out = fetchLinkedPRs({ numbers: [42], owner: 'o', repo: 'r', runner });
  assert.deepStrictEqual(out.get(42), { openPR: null });
});

test('a missing alias throws rather than returning a partial map', () => {
  const runner = () => resp({ i1224: { number: 1224, closedByPullRequestsReferences: { nodes: [] } } });
  assert.throws(() => fetchLinkedPRs({ numbers: [1224, 257], owner: 'o', repo: 'r', runner }), /missing linked-PR data for #257/);
});

test('null repository throws rather than returning a partial map', () => {
  const runner = () => JSON.stringify({ data: { repository: null }, errors: [{ message: 'boom' }] });
  assert.throws(() => fetchLinkedPRs({ numbers: [5], owner: 'o', repo: 'r', runner }), /boom|missing repository/);
});

test('a malformed nodes array (not an array) degrades to openPR: null rather than throwing', () => {
  const runner = () => resp({ i9: { number: 9, closedByPullRequestsReferences: { nodes: 'not-an-array' } } });
  assert.doesNotThrow(() => fetchLinkedPRs({ numbers: [9], owner: 'o', repo: 'r', runner }));
});

test('empty input returns empty result without calling the runner', () => {
  const out = fetchLinkedPRs({ numbers: [], owner: 'o', repo: 'r', runner: () => { throw new Error('must not run'); } });
  assert.strictEqual(out.size, 0);
});
