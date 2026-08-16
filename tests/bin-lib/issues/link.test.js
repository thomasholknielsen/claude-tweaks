'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveDatabaseIds, linkSubIssues, linkBlockedBy, isAlreadyLinkedError,
} = require('../../../bin/lib/issues/link');

// Fake runners are lazy functions inspecting `args` only when called (CLAUDE.md's eager-IIFE ban).
const isGraphQL = (args) => args[0] === 'api' && args[1] === 'graphql';
const isPost = (args, path) => args[0] === 'api' && args[1] === '-X' && args[2] === 'POST' && args[3] === path;
const fieldOf = (args, name) => { const i = args.indexOf('-F'); const all = []; for (let k = 0; k < args.length; k++) if (args[k] === '-F') all.push(args[k + 1]); const hit = all.find((v) => v.startsWith(name + '=')); return hit ? hit.slice(name.length + 1) : undefined; };

function graphqlJSON(map) {
  const repository = {};
  for (const [n, id] of Object.entries(map)) repository[`i${n}`] = id == null ? null : { databaseId: id };
  return JSON.stringify({ data: { repository } });
}

test('resolveDatabaseIds: one GraphQL call with one alias per number, returns a Map', () => {
  const calls = [];
  const runner = (args) => { calls.push(args); if (isGraphQL(args)) return graphqlJSON({ 595: 5164237962, 597: 5164238330, 592: 5164219255 }); throw new Error('unexpected'); };
  const ids = resolveDatabaseIds({ owner: 'acme', repo: 'w', numbers: [595, 597, 592], runner });
  assert.equal(calls.length, 1, 'exactly one runner call');
  const q = calls[0].join(' ');
  assert.match(q, /i595: issue\(number:595\)\{ databaseId \}/);
  assert.match(q, /i597: issue\(number:597\)\{ databaseId \}/);
  assert.match(q, /i592: issue\(number:592\)\{ databaseId \}/);
  assert.match(q, /-F owner=acme -F repo=w/, 'owner/repo passed with -F');
  assert.equal(ids.get(595), 5164237962);
  assert.equal(ids.get(592), 5164219255);
});

test('resolveDatabaseIds: dedupes numbers and throws on any missing id (never a partial map)', () => {
  const runner = (args) => { if (isGraphQL(args)) return graphqlJSON({ 595: 1, 597: null }); throw new Error('unexpected'); };
  assert.throws(
    () => resolveDatabaseIds({ owner: 'a', repo: 'b', numbers: [595, 597, 595], runner }),
    /missing databaseId for #597/,
  );
});

test('linkSubIssues: one POST per sub with the databaseId (never the number); one failure leaves siblings in ok', () => {
  const ids = new Map([[595, 111], [597, 222]]);
  const runner = (args) => {
    if (isPost(args, 'repos/acme/w/issues/592/sub_issues')) {
      const v = fieldOf(args, 'sub_issue_id');
      if (v === '222') throw new Error('HTTP 500 boom');
      return '{}';
    }
    throw new Error('unexpected ' + args.join(' '));
  };
  const r = linkSubIssues({ owner: 'acme', repo: 'w', parent: 592, subs: [595, 597], ids, runner });
  assert.deepEqual(r.ok.map((o) => o.number), [595]);
  assert.equal(r.failed.length, 1);
  assert.equal(r.failed[0].number, 597);
  assert.match(r.failed[0].error, /boom/);
});

test('linkSubIssues: never sends the issue number as sub_issue_id', () => {
  const ids = new Map([[595, 111]]);
  const seen = [];
  const runner = (args) => { seen.push(fieldOf(args, 'sub_issue_id')); return '{}'; };
  linkSubIssues({ owner: 'a', repo: 'b', parent: 592, subs: [595], ids, runner });
  assert.deepEqual(seen, ['111']);
});

test('linkBlockedBy: POST on the dependent with the blocker databaseId; 422 already-exists lands in ok with already:true', () => {
  const ids = new Map([[608, 10], [610, 20]]);
  const runner = (args) => {
    if (isPost(args, 'repos/acme/w/issues/610/dependencies/blocked_by')) {
      assert.equal(fieldOf(args, 'issue_id'), '10');
      const e = new Error('HTTP 422: Validation Failed'); e.stderr = '{"message":"Issue is already blocked by this issue"}'; throw e;
    }
    throw new Error('unexpected ' + args.join(' '));
  };
  const r = linkBlockedBy({ owner: 'acme', repo: 'w', edges: [{ dependent: 610, blocker: 608 }], ids, runner });
  assert.equal(r.failed.length, 0);
  assert.deepEqual(r.ok, [{ dependent: 610, blocker: 608, already: true }]);
});

test('isAlreadyLinkedError: only a 422 whose message mentions already', () => {
  const e1 = new Error('HTTP 422'); e1.stderr = '{"message":"already a sub-issue"}';
  const e2 = new Error('HTTP 422'); e2.stderr = '{"message":"Validation Failed"}';
  const e3 = new Error('HTTP 500'); e3.stderr = '{"message":"already"}';
  assert.equal(isAlreadyLinkedError(e1), true);
  assert.equal(isAlreadyLinkedError(e2), false);
  assert.equal(isAlreadyLinkedError(e3), false);
});
