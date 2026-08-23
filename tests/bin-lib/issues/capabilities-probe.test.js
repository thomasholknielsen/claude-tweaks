'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { probeCapabilities, probeSchema, probeSchemaStrict } = require('../../../plugin/bin/lib/issues/capabilities-probe');

// Fakes are lazy functions: the runner only inspects/branches on `args` when
// the code under test actually calls it — nothing here is computed at
// test-definition time (the eager-IIFE ban in CLAUDE.md).
const isIntrospection = (args) => args.join(' ').includes('__type(name: "Issue")');
const isIssueTypesQuery = (args) => args.join(' ').includes('repository(owner');

function introspectionJSON(fieldNames) {
  return JSON.stringify({ data: { __type: { fields: fieldNames.map((name) => ({ name })) } } });
}

function issueTypesJSON(totalCount) {
  return JSON.stringify({
    data: { repository: { issueTypes: totalCount === null ? null : { totalCount } } },
  });
}

test('probeCapabilities: subIssues + blockedBy present, issueTypes non-null -> all true', () => {
  const runner = (args) => {
    if (isIntrospection(args)) return introspectionJSON(['subIssues', 'blockedBy', 'title']);
    if (isIssueTypesQuery(args)) return issueTypesJSON(3);
    throw new Error(`unexpected call: ${JSON.stringify(args)}`);
  };
  const result = probeCapabilities({ owner: 'acme', repo: 'widgets', runner });
  assert.deepStrictEqual(result, { types: true, subIssues: true, dependencies: true });
});

test('probeCapabilities: fields lack subIssues/blockedBy/issueDependenciesSummary, issueTypes null -> all false', () => {
  const runner = (args) => {
    if (isIntrospection(args)) return introspectionJSON(['title', 'body']);
    if (isIssueTypesQuery(args)) return issueTypesJSON(null);
    throw new Error(`unexpected call: ${JSON.stringify(args)}`);
  };
  const result = probeCapabilities({ owner: 'acme', repo: 'widgets', runner });
  assert.deepStrictEqual(result, { types: false, subIssues: false, dependencies: false });
});

test('probeCapabilities: introspection throws, issueTypes succeeds -> introspection failure does not mask issueTypes result', () => {
  const runner = (args) => {
    if (isIntrospection(args)) throw new Error('schema query unsupported on this host');
    if (isIssueTypesQuery(args)) return issueTypesJSON(1);
    throw new Error(`unexpected call: ${JSON.stringify(args)}`);
  };
  const result = probeCapabilities({ owner: 'acme', repo: 'widgets', runner });
  assert.deepStrictEqual(result, { types: true, subIssues: false, dependencies: false });
});

test('probeCapabilities: issueTypes returns garbage JSON, introspection has issueDependenciesSummary only -> dependencies false (count-only field is not sufficient), types false', () => {
  const runner = (args) => {
    if (isIntrospection(args)) return introspectionJSON(['issueDependenciesSummary', 'title']);
    if (isIssueTypesQuery(args)) return 'not valid json {{{';
    throw new Error(`unexpected call: ${JSON.stringify(args)}`);
  };
  const result = probeCapabilities({ owner: 'acme', repo: 'widgets', runner });
  assert.deepStrictEqual(result, { types: false, subIssues: false, dependencies: false });
});

// --- probeSchema / probeSchemaStrict (#1185) --------------------------------
//
// probeSchema (used by probeCapabilities/probeIssueTypes, i.e. /init) must
// keep failing safe to {subIssues:false, dependencies:false} on a throwing
// runner — unchanged from before probeSchemaStrict existed. probeSchemaStrict
// (used only by fetch-sub-issues.js's call site) must rethrow instead.

test('probeSchema still fails safe to false on a throwing runner (unchanged /init contract)', () => {
  const runner = () => { throw new Error('network timeout'); };
  assert.deepStrictEqual(probeSchema(runner), { subIssues: false, dependencies: false });
});

test('probeSchemaStrict rethrows a runner failure instead of failing safe', () => {
  const runner = () => { throw new Error('network timeout'); };
  assert.throws(() => probeSchemaStrict(runner), /network timeout/);
});

test('probeSchemaStrict returns the real result on a clean call reporting the field absent', () => {
  const runner = () => introspectionJSON(['title', 'body']);
  assert.deepStrictEqual(probeSchemaStrict(runner), { subIssues: false, dependencies: false });
});

test('probeCapabilities calls the runner exactly twice, lazily, and only when invoked', () => {
  const calls = [];
  const runner = (args) => {
    calls.push(args);
    if (isIntrospection(args)) return introspectionJSON(['subIssues']);
    if (isIssueTypesQuery(args)) return issueTypesJSON(1);
    throw new Error(`unexpected call: ${JSON.stringify(args)}`);
  };
  // Proves laziness: defining the runner above must not have called it yet.
  assert.strictEqual(calls.length, 0, 'no probe call may happen before probeCapabilities is invoked');
  probeCapabilities({ owner: 'acme', repo: 'widgets', runner });
  assert.strictEqual(calls.length, 2, 'exactly one call per probe');
});
