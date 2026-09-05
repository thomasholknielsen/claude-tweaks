'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { readDeclaration } = require(path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'verify', 'declaration.js'));

function fakeFs(files) {
  return {
    readFileSync: (p) => {
      if (!(p in files)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return files[p];
    },
  };
}

const EXAMPLE = {
  checks: {
    types: 'pnpm typecheck',
    lint: 'pnpm lint',
    tests: { api: 'pnpm --filter api test', web: 'pnpm --filter web test' },
  },
  retry: { api: 'pnpm --filter api test -- {file}', web: 'pnpm --filter web test -- {file}' },
  rules: [
    { match: 'apps/api/**', suites: ['api'], static: true },
    { match: 'apps/web/**', suites: ['web'], static: true },
    { match: 'packages/shared/**', suites: '*', static: true },
    { match: 'docs/**/*.md', suites: [], static: false },
    { match: 'docs/plans/*-ledger.md', suites: [], static: false },
    { match: '.claude-tweaks/pipelines/**', suites: [], static: false },
  ],
  flaky: { files: ['apps/api/test/mailer.test.ts'], maxRetries: 1 },
};

test('a missing declaration file is ok with decl null (mode full), never a throw', () => {
  assert.deepStrictEqual(readDeclaration('/nope.json', fakeFs({})), { ok: true, decl: null });
});

test('the example declaration parses to the normalized shape', () => {
  const r = readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify(EXAMPLE) }));
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.decl.suites, ['api', 'web']);
  assert.strictEqual(r.decl.toolScoped, false);
  assert.strictEqual(r.decl.checks.types, 'pnpm typecheck');
  assert.strictEqual(r.decl.rules.length, 6);
  assert.deepStrictEqual(r.decl.rules[2], { match: 'packages/shared/**', suites: '*', static: true });
  assert.deepStrictEqual(r.decl.flaky, { files: ['apps/api/test/mailer.test.ts'], maxRetries: 1 });
  assert.deepStrictEqual(r.decl.retry, EXAMPLE.retry);
});

test('a string checks.tests declares the single suite "tests"; one carrying {base} is tool-scoped', () => {
  const plain = readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: { tests: 'npm test' }, rules: [] }) }));
  assert.strictEqual(plain.ok, true);
  assert.deepStrictEqual(plain.decl.suites, ['tests']);
  assert.strictEqual(plain.decl.toolScoped, false);
  assert.deepStrictEqual(plain.decl.flaky, { files: [], maxRetries: 1 });
  assert.deepStrictEqual(plain.decl.retry, {});
  const tool = readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: { tests: 'pnpm vitest --changed {base}' }, rules: [] }) }));
  assert.strictEqual(tool.ok, true);
  assert.strictEqual(tool.decl.toolScoped, true);
  assert.deepStrictEqual(tool.decl.suites, ['tests']);
});

test('unparseable JSON is ok:false with one error naming the parse failure', () => {
  const r = readDeclaration('/d.json', fakeFs({ '/d.json': '{ not json' }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 1);
  assert.match(r.errors[0], /parse/i);
});

test('every invalid field is named, including the rule index and the unknown suite (AC6)', () => {
  const bad = {
    checks: { types: 7, tests: { api: 'x' } },
    retry: { web: 'no placeholder' },
    rules: [
      { match: 'a/**', suites: ['api', 'nope'], static: true },
      { match: 'b/**', suites: 'all', static: 'yes' },
      { suites: [], static: false },
    ],
    flaky: { files: 'not-an-array', maxRetries: 5 },
  };
  const r = readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify(bad) }));
  assert.strictEqual(r.ok, false);
  const joined = r.errors.join('\n');
  assert.match(joined, /checks\.types/);
  assert.match(joined, /rules\[0\].*nope/);
  assert.match(joined, /rules\[1\].*suites/);
  assert.match(joined, /rules\[1\].*static/);
  assert.match(joined, /rules\[2\].*match/);
  assert.match(joined, /retry\.web/);
  assert.match(joined, /flaky\.files/);
  assert.match(joined, /flaky\.maxRetries/);
  assert.ok(r.errors.length >= 8, `expected every invalid field named, got ${r.errors.length}`);
});

test('missing checks.tests, a non-object checks, and a non-array rules are errors', () => {
  assert.strictEqual(readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: {}, rules: [] }) })).ok, false);
  assert.strictEqual(readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: 'x', rules: [] }) })).ok, false);
  assert.strictEqual(readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: { tests: 'x' } }) })).ok, false);
});

test('flaky.maxRetries defaults to 1 and accepts 0..2 only', () => {
  const zero = readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: { tests: 'x' }, rules: [], flaky: { files: [], maxRetries: 0 } }) }));
  assert.strictEqual(zero.decl.flaky.maxRetries, 0);
  const two = readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: { tests: 'x' }, rules: [], flaky: { files: [], maxRetries: 2 } }) }));
  assert.strictEqual(two.decl.flaky.maxRetries, 2);
  const dflt = readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: { tests: 'x' }, rules: [], flaky: { files: ['a.js'] } }) }));
  assert.strictEqual(dflt.decl.flaky.maxRetries, 1);
  assert.strictEqual(readDeclaration('/d.json', fakeFs({ '/d.json': JSON.stringify({ checks: { tests: 'x' }, rules: [], flaky: { files: [], maxRetries: 3 } }) })).ok, false);
});
