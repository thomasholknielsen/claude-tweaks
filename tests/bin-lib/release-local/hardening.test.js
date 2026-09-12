'use strict';
// tests/bin-lib/release-local/hardening.test.js — wrap-up fix wave (#2254,
// deferral-gate fix-now items, run ledger rows 48-53). Every new test the
// wave adds lives here, per the wave's own hard constraint: two staged
// review patches (review-1.patch, review-2.patch) must keep applying, so
// nothing here may touch the regions those patches own in release-local.js,
// cli.test.js, or manifest.js's applyVersion body.
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCommit } = require('../../../plugin/bin/lib/release-local/commits.js');
const { parseGitHubRemote } = require('../../../plugin/bin/lib/release-local/changelog.js');
const { run } = require('../../../plugin/bin/release-local.js');

// W1 (row 48): an unconventional subject's empty BREAKING CHANGE: footer
// falls back to the subject, same as the conventional path's own fallback.
test('W1: parseCommit — an unconventional subject with an empty BREAKING CHANGE: footer falls back to the subject', () => {
  const out = parseCommit({ sha: 'f'.repeat(40), subject: 'Merge branch x', body: 'BREAKING CHANGE:' });
  assert.strictEqual(out.breaking, true);
  assert.strictEqual(out.breakingNote, 'Merge branch x');
  assert.strictEqual(out.unconventional, true);
});

// W2 (row 49): GitHub remote forms with userinfo and case-insensitive host.
test('W2: parseGitHubRemote — userinfo-prefixed https and a case-insensitive host; credentials never leak into url', () => {
  assert.deepStrictEqual(parseGitHubRemote('https://user@github.com/o/r'), { owner: 'o', repo: 'r', url: 'https://github.com/o/r' });
  assert.deepStrictEqual(parseGitHubRemote('https://x-access-token:TOKEN@github.com/o/r.git'), { owner: 'o', repo: 'r', url: 'https://github.com/o/r' });
  assert.deepStrictEqual(parseGitHubRemote('https://GitHub.COM/o/r'), { owner: 'o', repo: 'r', url: 'https://github.com/o/r' });
  // existing four forms still parse
  for (const u of ['https://github.com/o/r', 'https://github.com/o/r.git', 'git@github.com:o/r.git', 'ssh://git@github.com/o/r.git']) {
    assert.deepStrictEqual(parseGitHubRemote(u), { owner: 'o', repo: 'r', url: 'https://github.com/o/r' });
  }
  assert.strictEqual(parseGitHubRemote('https://gitlab.com/o/r'), null);
});

// W3 (row 50): a `release-hook` policy value spelling "disabled" reads as
// unset, never as a literal command to run. A minimal fake deps, in the
// shape of cli.test.js's own makeDeps — copied rather than imported, per the
// wave's hard constraint that cli.test.js stays untouched here.
function makeReleaseHookDeps({ policyRaw } = {}) {
  const state = {
    files: {
      'release-please-config.json': JSON.stringify({ packages: { '.': { 'release-type': 'simple' } } }),
      '.release-please-manifest.json': '{\n  ".": "1.2.0"\n}\n',
      'version.txt': '1.2.0\n',
      'CHANGELOG.md': '# Changelog\n',
      ...(policyRaw !== undefined ? { '.claude-tweaks/policy.yml': policyRaw } : {}),
    },
    git: [], writes: [], out: '', err: '', hooks: [],
  };
  const LOG = (subjects) => subjects.map((s, i) => `${String(i).repeat(40)}\x1f${s}\x1f\x1e\n`).join('');
  const deps = {
    git: (args) => {
      const key = args.join(' ');
      state.git.push(key);
      if (key === 'branch --show-current') return 'main\n';
      if (key === 'status --porcelain --untracked-files=no') return '';
      if (key === 'remote get-url origin') throw new Error('fatal: No such remote');
      if (key.startsWith('describe')) return 'v1.2.0\n';
      if (key.startsWith('log --first-parent')) return LOG(['fix: a']);
      if (key.startsWith('show ')) {
        const p = key.slice(key.indexOf(':') + 1);
        if (p in state.files) return state.files[p];
        throw new Error(`fatal: path '${p}' does not exist`);
      }
      if (key === 'worktree list --porcelain') return 'worktree /repo\nbranch refs/heads/main\n';
      if (key === 'tag -l v*') return 'v1.2.0\n';
      if (key.startsWith('add ') || key.startsWith('commit ') || key.startsWith('tag -a')) return '';
      throw new Error(`unexpected git: ${key}`);
    },
    readFile: (p) => (p in state.files ? state.files[p] : null),
    writeFile: (p, text) => { state.writes.push(p); state.files[p] = text; },
    listPlanFiles: () => [],
    runHook: (cmd) => { state.hooks.push(cmd); return 0; },
    today: () => '2026-09-12',
    stdout: (t) => { state.out += t; },
    stderr: (t) => { state.err += t; },
  };
  return { deps, state };
}

test('W3: release-hook: false (and off/none/null, case-insensitive) reads as unset — no hook runs; an ordinary command still runs', () => {
  for (const spelling of ['false', 'off', 'none', 'null', 'FALSE', 'Off']) {
    const { deps, state } = makeReleaseHookDeps({ policyRaw: `release-hook: ${spelling}\n` });
    assert.strictEqual(run([], deps), 0, spelling);
    assert.match(state.out, /hook: no hook configured/, spelling);
    assert.deepStrictEqual(state.hooks, [], spelling);
  }
  const { deps, state } = makeReleaseHookDeps({ policyRaw: 'release-hook: npm run deploy\n' });
  assert.strictEqual(run([], deps), 0);
  assert.match(state.out, /hook: npm run deploy/);
  assert.deepStrictEqual(state.hooks, ['npm run deploy']);
});
