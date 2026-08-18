'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { parseArgs, UsageError, USAGE } = require(path.join(
  __dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'verify', 'args.js'));

test('parses repeatable --cmd plus --json and --log-dir', () => {
  const got = parseArgs([
    '--cmd', 'types=tsc --noEmit',
    '--cmd', 'lint=eslint .',
    '--cmd', 'tests=npm test',
    '--json', '/tmp/r.json',
    '--log-dir', '/tmp/logs',
  ]);
  assert.deepStrictEqual(got, {
    cmds: [
      { name: 'types', command: 'tsc --noEmit' },
      { name: 'lint', command: 'eslint .' },
      { name: 'tests', command: 'npm test' },
    ],
    json: '/tmp/r.json',
    logDir: '/tmp/logs',
  });
});

test('json and logDir default to null when omitted', () => {
  const got = parseArgs(['--cmd', 'tests=npm test']);
  assert.strictEqual(got.json, null);
  assert.strictEqual(got.logDir, null);
});

test('a --cmd value keeps metacharacters and later = signs intact (AC10 parse half)', () => {
  const got = parseArgs(['--cmd', 'tests=FOO="a b" node -e "1 && 2" | cat']);
  assert.strictEqual(got.cmds[0].command, 'FOO="a b" node -e "1 && 2" | cat');
});

test('missing = in --cmd value throws UsageError', () => {
  assert.throws(() => parseArgs(['--cmd', 'testsnpm test']), UsageError);
});

test('empty name in --cmd value throws UsageError', () => {
  assert.throws(() => parseArgs(['--cmd', '=npm test']), UsageError);
});

test('empty command in --cmd value throws UsageError', () => {
  assert.throws(() => parseArgs(['--cmd', 'tests=']), UsageError);
});

test('unknown flag throws UsageError', () => {
  assert.throws(() => parseArgs(['--bogus']), UsageError);
});

test('flag missing its value throws UsageError', () => {
  assert.throws(() => parseArgs(['--cmd', 'tests=npm test', '--json']), UsageError);
});

test('zero --cmd flags throws UsageError', () => {
  assert.throws(() => parseArgs([]), UsageError);
});

test('duplicate --cmd name throws UsageError', () => {
  assert.throws(
    () => parseArgs(['--cmd', 'tests=a', '--cmd', 'tests=b']), UsageError);
});

test('USAGE names every flag', () => {
  for (const flag of ['--cmd', '--json', '--log-dir']) {
    assert.ok(USAGE.includes(flag), `USAGE missing ${flag}`);
  }
});
