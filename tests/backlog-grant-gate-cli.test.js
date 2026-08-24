'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { run } = require('../plugin/bin/backlog-grant-gate');

function deps(overrides = {}) {
  const calls = [];
  const d = {
    ghAvailable: () => true,
    readPolicyRaw: () => 'autonomy: unattended\ngrant-origination-enabled: true\nwork-links: body-text\nintegration-branch: main\n',
    runner: (args) => {
      calls.push(args);
      if (args[3] === 'ready') return JSON.stringify([]);
      if (args[3] === 'parent-issue') return JSON.stringify([]);
      if (args[3] === 'open') return JSON.stringify([]);
      if (args[3] === 'all') return JSON.stringify([]);
      throw new Error(`unexpected gh call: ${JSON.stringify(args)}`);
    },
    gitRunner: () => '',
    out: [], err: [],
    stdout(s) { this.out.push(s); }, stderr(s) { this.err.push(s); },
    ...overrides,
  };
  d.calls = calls;
  return d;
}

test('--help prints usage and exits 0, no gh check', () => {
  const d = deps({ ghAvailable: () => { throw new Error('should not be called'); } });
  assert.strictEqual(run(['--help'], d), 0);
  assert.match(d.out.join(''), /usage: backlog-grant-gate\.js/);
});

test('unknown flag is malformed — exit 2, no gh check', () => {
  const d = deps({ ghAvailable: () => { throw new Error('should not be called'); } });
  assert.strictEqual(run(['--bogus'], d), 2);
  assert.match(d.err.join(''), /unknown argument/);
});

test('gh absent exits 2', () => {
  const d = deps({ ghAvailable: () => false });
  assert.strictEqual(run([], d), 2);
  assert.match(d.err.join(''), /`gh` is required/);
});

test('ceiling not unattended short-circuits before any gh call', () => {
  const d = deps({
    readPolicyRaw: () => 'autonomy: supervised\n',
    runner: () => { throw new Error('should not be called'); },
  });
  assert.strictEqual(run([], d), 0);
  const out = JSON.parse(d.out.join(''));
  assert.strictEqual(out.shortcut, 'ceiling-gate');
});

test('ceiling clears, opt-in unset, still short-circuits (both must hold)', () => {
  const d = deps({ readPolicyRaw: () => 'autonomy: unattended\n' });
  assert.strictEqual(run([], d), 0);
  const out = JSON.parse(d.out.join(''));
  assert.strictEqual(out.shortcut, 'ceiling-gate');
});

test('happy path (no candidates, no records) prints the zero-candidate envelope, exit 0', () => {
  const d = deps();
  assert.strictEqual(run([], d), 0);
  const out = JSON.parse(d.out.join(''));
  assert.strictEqual(out.shortcut, 'zero-eligible');
  assert.deepStrictEqual(out.candidates, []);
  assert.deepStrictEqual(out.eligible, []);
});

test('--limit overrides the resolved backlog-fetch-limit', () => {
  const d = deps({
    runner: (args) => {
      d.calls.push(args);
      assert.ok(args.includes('7'), `expected --limit 7 in ${JSON.stringify(args)}`);
      if (args[3] === 'ready') return JSON.stringify([]);
      if (args[3] === 'parent-issue') return JSON.stringify([]);
      if (args[3] === 'open') return JSON.stringify([]);
      if (args[3] === 'all') return JSON.stringify([]);
      throw new Error(`unexpected gh call: ${JSON.stringify(args)}`);
    },
  });
  assert.strictEqual(run(['--limit', '7'], d), 0);
});

test('malformed --limit is rejected — exit 2', () => {
  const d = deps({ ghAvailable: () => { throw new Error('should not be called'); } });
  assert.strictEqual(run(['--limit', 'abc'], d), 2);
});

test('a required gh fetch failure exits 1 and names the error', () => {
  const d = deps({
    runner: () => { throw new Error('gh: connection reset'); },
  });
  assert.strictEqual(run([], d), 1);
  assert.match(d.err.join(''), /connection reset/);
});

test('integration-branch unresolved from policy falls back to git rev-parse origin/HEAD', () => {
  const gitCalls = [];
  const d = deps({
    readPolicyRaw: () => 'autonomy: unattended\ngrant-origination-enabled: true\nwork-links: body-text\n',
    gitRunner: (args) => {
      gitCalls.push(args);
      if (args[0] === 'rev-parse') return 'origin/main\n';
      return ''; // the subsequent `git log {branch} ...` call inside fetchGitLog
    },
  });
  assert.strictEqual(run([], d), 0);
  const out = JSON.parse(d.out.join(''));
  assert.strictEqual(out.shortcut, 'zero-eligible');
  assert.deepStrictEqual(gitCalls[0], ['rev-parse', '--abbrev-ref', 'origin/HEAD']);
  assert.deepStrictEqual(gitCalls[1], ['log', 'main', '--format=%H%x1f%B%x1e']);
});

test('native work-links with no --repo and no resolvable remote exits 2', () => {
  const d = deps({
    readPolicyRaw: () => 'autonomy: unattended\ngrant-origination-enabled: true\nwork-links: native\nintegration-branch: main\n',
    remoteUrl: () => { throw new Error('no remote'); },
  });
  assert.strictEqual(run([], d), 2);
  assert.match(d.err.join(''), /could not resolve owner\/repo/);
});
