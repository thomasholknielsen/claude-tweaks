// tests/resolve-blockers-cli.test.js — in-process tests for
// bin/resolve-blockers.js's run(argv, deps), mirroring
// tests/materialize-run-dir-anchoring.test.js's deps-injection style (never
// tests/resolve-policy-cli.test.js's spawnSync-a-real-process style, since
// this CLI's whole point is a `gh api graphql` call that must never be live
// in a test — a fake runner in deps.runner stands in for it). Covers
// argument parsing and the {blockedBy, openBlocker} output shape; the
// GraphQL query-building logic itself (buildNativeDependencyQuery) already
// has coverage in tests/bin-lib/issues/record.test.js and is not
// re-verified here.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../plugin/bin/resolve-blockers');

function fakeDeps(overrides = {}) {
  const calls = { runner: [], stdout: [], stderr: [] };
  return {
    calls,
    ghAvailable: () => true,
    remoteUrl: () => 'https://github.com/acme/widgets.git',
    runner: (args) => {
      calls.runner.push(args);
      return JSON.stringify({
        data: {
          repository: {
            i720: { number: 720, blockedBy: { nodes: [{ number: 700, state: 'OPEN' }] } },
          },
        },
      });
    },
    stdout: (s) => calls.stdout.push(s),
    stderr: (s) => calls.stderr.push(s),
    ...overrides,
  };
}

// --- argument parsing ---------------------------------------------------

test('missing <n> is a malformed invocation — exit 1, usage on stderr, gh never probed', () => {
  const deps = fakeDeps({ ghAvailable: () => { throw new Error('should not be called'); } });
  const code = run([], deps);
  assert.equal(code, 1);
  assert.match(deps.calls.stderr.join(''), /missing <n> argument/);
  assert.match(deps.calls.stderr.join(''), /usage: resolve-blockers\.js/);
});

test('non-integer <n> is malformed — exit 1', () => {
  const deps = fakeDeps();
  const code = run(['abc'], deps);
  assert.equal(code, 1);
  assert.match(deps.calls.stderr.join(''), /malformed <n>/);
});

test('non-positive <n> is malformed — exit 1', () => {
  const deps = fakeDeps();
  const code = run(['0'], deps);
  assert.equal(code, 1);
  assert.match(deps.calls.stderr.join(''), /malformed <n>/);
});

test('unknown flag is a malformed invocation — exit 1', () => {
  const deps = fakeDeps();
  const code = run(['720', '--bogus'], deps);
  assert.equal(code, 1);
  assert.match(deps.calls.stderr.join(''), /unknown argument: --bogus/);
});

test('--help prints usage and exits 0 without touching gh/git', () => {
  const deps = fakeDeps({
    ghAvailable: () => { throw new Error('should not be called'); },
    remoteUrl: () => { throw new Error('should not be called'); },
  });
  const code = run(['--help'], deps);
  assert.equal(code, 0);
  assert.match(deps.calls.stdout.join(''), /usage: resolve-blockers\.js/);
});

// --- gh / repo resolution ------------------------------------------------

test('`gh` absent — exit 2, no attempt to resolve owner/repo', () => {
  const deps = fakeDeps({
    ghAvailable: () => false,
    remoteUrl: () => { throw new Error('should not be called'); },
  });
  const code = run(['720'], deps);
  assert.equal(code, 2);
  assert.match(deps.calls.stderr.join(''), /`gh` is required/);
});

test('no --repo and no resolvable origin remote — exit 2', () => {
  const deps = fakeDeps({ remoteUrl: () => { throw new Error('no remote'); } });
  const code = run(['720'], deps);
  assert.equal(code, 2);
  assert.match(deps.calls.stderr.join(''), /could not resolve owner\/repo/);
});

test('--repo owner/name overrides the git remote', () => {
  const deps = fakeDeps({ remoteUrl: () => { throw new Error('should not be called'); } });
  const code = run(['720', '--repo', 'someone/else'], deps);
  assert.equal(code, 0);
  const q = deps.calls.runner[0].join(' ');
  assert.match(q, /-f owner=someone -f repo=else/);
});

// --- success / output shape ----------------------------------------------

test('success: one runner call, {blockedBy, openBlocker} JSON line on stdout, exit 0', () => {
  const deps = fakeDeps();
  const code = run(['720'], deps);
  assert.equal(code, 0);
  assert.equal(deps.calls.runner.length, 1, 'exactly one gh api graphql call');
  assert.equal(deps.calls.stderr.length, 0, 'success path writes nothing to stderr');
  assert.equal(deps.calls.stdout.length, 1, 'exactly one stdout write');
  assert.deepEqual(JSON.parse(deps.calls.stdout[0]), { blockedBy: [700], openBlocker: true });
});

test('success: owner/repo parsed from the origin remote when --repo is absent', () => {
  const deps = fakeDeps();
  run(['720'], deps);
  const q = deps.calls.runner[0].join(' ');
  assert.match(q, /-f owner=acme -f repo=widgets/);
});

test('success: no open blockers reports openBlocker false, blockedBy []', () => {
  const deps = fakeDeps({
    runner: (args) => JSON.stringify({
      data: { repository: { i720: { number: 720, blockedBy: { nodes: [] } } } },
    }),
  });
  const code = run(['720'], deps);
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(deps.calls.stdout[0]), { blockedBy: [], openBlocker: false });
});

// --- GraphQL failure propagation -----------------------------------------

test('a thrown GraphQL failure (missing data.repository) surfaces as exit 3, not a crash', () => {
  const deps = fakeDeps({ runner: () => JSON.stringify({ data: { repository: null } }) });
  const code = run(['720'], deps);
  assert.equal(code, 3);
  assert.match(deps.calls.stderr.join(''), /missing repository/);
  assert.equal(deps.calls.stdout.length, 0);
});
