const { test } = require('node:test');
const assert = require('node:assert');
const { resolveScope } = require('../../../plugin/bin/lib/residue/scope');

// Same stub shape as tests/bin-lib/wrap-up/state.test.js: a map of
// joined-args -> output, with null modelling a failing git invocation.
function stubRunner(responses) {
  return (args) => (Object.prototype.hasOwnProperty.call(responses, args.join(' ')) ? responses[args.join(' ')] : null);
}

// Verified against real `git worktree list --porcelain` output: the locked
// line carries a payload ("locked claude session … (pid 44923 …)"), it is NOT
// a bare "locked". A parser matching the bare token reports every live
// worktree as unlocked — which would mark a session in use for auto-removal.
const WORKTREE_PORCELAIN = [
  'worktree /repo', 'HEAD aaa', 'branch refs/heads/main', '',
  'worktree /repo/.claude/worktrees/feat', 'HEAD bbb', 'branch refs/heads/worktree-feat',
  'locked claude session feat (pid 44923 start Sat Aug  8 07:04:41 2026)', '',
].join('\n');

const REPO = {
  'rev-parse --is-inside-work-tree': 'true',
  'rev-parse --verify a1b2c3d': 'a1b2c3d',
  'branch --show-current': 'worktree-feat',
  'branch --format=%(refname:short) --merged HEAD': 'main\nworktree-feat\nworktree-old',
  'worktree list --porcelain': WORKTREE_PORCELAIN,
};

test('resolveScope lists branches merged into HEAD', () => {
  const s = resolveScope({ base: 'a1b2c3d', run: stubRunner(REPO) });
  assert.strictEqual(s.ran, true);
  assert.deepStrictEqual(s.branches, ['main', 'worktree-feat', 'worktree-old']);
});

test('resolveScope parses worktrees including their locked state', () => {
  const s = resolveScope({ base: 'a1b2c3d', run: stubRunner(REPO) });
  assert.deepStrictEqual(s.worktrees, [
    { path: '/repo', branch: 'main', locked: false, lockReason: null },
    {
      path: '/repo/.claude/worktrees/feat',
      branch: 'worktree-feat',
      locked: true,
      lockReason: 'claude session feat (pid 44923 start Sat Aug  8 07:04:41 2026)',
    },
  ]);
});

test('a lock line with a reason payload still reads as locked', () => {
  // Guards the exact defect this fixture was corrected for: matching only a
  // bare "locked" token marks every live session's worktree auto-removable.
  const s = resolveScope({ base: 'a1b2c3d', run: stubRunner(REPO) });
  assert.strictEqual(s.worktrees[1].locked, true);
});

test('an unresolvable base does not run, and says why', () => {
  const s = resolveScope({ base: 'nope', run: stubRunner(REPO) });
  assert.strictEqual(s.ran, false);
  assert.match(s.reason, /not a resolvable commit-ish/);
});

test('outside a repository the scope does not run, and says why', () => {
  const s = resolveScope({ base: 'a1b2c3d', run: stubRunner({}) });
  assert.strictEqual(s.ran, false);
  assert.match(s.reason, /not a git repository/);
});

test('a missing base is a malformed call, not a degraded read', () => {
  assert.throws(() => resolveScope({ run: stubRunner(REPO) }), /base is required/);
});
