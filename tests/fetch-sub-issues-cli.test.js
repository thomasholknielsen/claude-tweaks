'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { run } = require('../plugin/bin/fetch-sub-issues');

const probeOk = JSON.stringify({ data: { __type: { fields: [{ name: 'subIssues' }, { name: 'blockedBy' }] } } });
const probeNo = JSON.stringify({ data: { __type: { fields: [{ name: 'blockedBy' }] } } });

function deps(overrides = {}) {
  const calls = [];
  const d = {
    ghAvailable: () => true,
    remoteUrl: () => 'git@github.com:o/r.git',
    runner: (args) => {
      calls.push(args);
      const q = args.find((a) => a.startsWith('query='));
      if (q && q.includes('__type')) return probeOk;
      return JSON.stringify({ data: { repository: { i5: { number: 5, subIssues: { nodes: [{ number: 6 }], pageInfo: { hasNextPage: false } } } } } });
    },
    out: [], err: [],
    stdout(s) { this.out.push(s); }, stderr(s) { this.err.push(s); },
    ...overrides,
  };
  d.calls = calls;
  return d;
}

test('happy path prints byParent object and exits 0', () => {
  const d = deps();
  assert.strictEqual(run(['5'], d), 0);
  assert.deepStrictEqual(JSON.parse(d.out.join('')), { byParent: { 5: [6] }, retry: [] });
});

test('zero positionals is valid: empty envelope, exit 0, no GraphQL fetch', () => {
  const d = deps();
  assert.strictEqual(run([], d), 0);
  assert.deepStrictEqual(JSON.parse(d.out.join('')), { byParent: {}, retry: [] });
  assert.ok(!d.calls.some((args) => args.some((a) => a.includes('subIssues(first:100)'))));
});

// Review finding (whole-branch review, e90376a4..HEAD): the header comment guarantees zero
// positionals is "still a valid invocation" printing the empty envelope at exit 0, but run()
// used to call ghAvailable()/remoteUrl()/probeSchema() unconditionally before ever checking
// opts.numbers.length — so a zero-arg caller on a host where any of those fails got exit 2/4
// instead of the documented guarantee. The happy-path deps() fixture above wouldn't have caught
// this (ghAvailable/probeSchema both succeed there); these two force each dependency to fail and
// assert the guarantee holds anyway, proving the short-circuit runs before them.
test('zero positionals: guaranteed exit 0 even when gh is unavailable (finding regression)', () => {
  const d = deps({ ghAvailable: () => false });
  assert.strictEqual(run([], d), 0);
  assert.deepStrictEqual(JSON.parse(d.out.join('')), { byParent: {}, retry: [] });
});

test('zero positionals: guaranteed exit 0 even when the schema probe throws (finding regression)', () => {
  const d = deps({ runner: () => { throw new Error('gh api graphql: transient failure'); } });
  assert.strictEqual(run([], d), 0);
  assert.deepStrictEqual(JSON.parse(d.out.join('')), { byParent: {}, retry: [] });
});

test('probe reporting subIssues unavailable exits 4 before any fetch', () => {
  const d = deps({ runner: () => probeNo });
  assert.strictEqual(run(['5'], d), 4);
});

test('a GraphQL throw exits 3', () => {
  const d = deps({
    runner: (args) => {
      const q = args.find((a) => a.startsWith('query='));
      if (q && q.includes('__type')) return probeOk;
      return JSON.stringify({ data: { repository: null } });
    },
  });
  assert.strictEqual(run(['5'], d), 3);
});

test('non-integer positional exits 1; gh absent exits 2', () => {
  assert.strictEqual(run(['abc'], deps()), 1);
  assert.strictEqual(run(['5'], deps({ ghAvailable: () => false })), 2);
});

test('101 numbers fan out as three chunked fetch calls (50/50/1)', () => {
  const nums = Array.from({ length: 101 }, (_, i) => i + 1);
  const d = deps({
    runner(args) {
      d.calls.push(args);
      const q = args.find((a) => a.startsWith('query='));
      if (q && q.includes('__type')) return probeOk;
      const aliased = [...q.matchAll(/i(\d+): issue/g)].map((m) => Number(m[1]));
      assert.ok(aliased.length <= 50, `chunk exceeded 50: ${aliased.length}`);
      const repository = Object.fromEntries(aliased.map((n) => [`i${n}`, { number: n, subIssues: { nodes: [], pageInfo: { hasNextPage: false } } }]));
      return JSON.stringify({ data: { repository } });
    },
  });
  d.calls.length = 0;
  assert.strictEqual(run(nums.map(String), d), 0);
  const fetches = d.calls.filter((args) => args.some((a) => typeof a === 'string' && a.includes('subIssues(first:100)')));
  assert.strictEqual(fetches.length, 3);
});
