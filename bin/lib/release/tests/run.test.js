'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runRelease } = require('../run.js');

const manifest = (v) => JSON.stringify({ name: 'claude-tweaks', version: v, description: 'Desc' }, null, 2);
const CHANGELOG = '# Changelog\n\nProse.\n\n## v6.70.1 — Prior\n\nBody.\n';

function makeDeps(overrides = {}) {
  const state = {
    files: {
      '.claude-plugin/plugin.json': manifest('6.70.1'),
      'CHANGELOG.md': CHANGELOG,
    },
    gitCalls: [], writes: [], appended: [], ghCalls: [],
    staged: overrides.staged, // lazily read below
    branch: overrides.branch || 'main',
    dirty: overrides.dirty || '',
    ancestorOk: overrides.ancestorOk !== false,
  };
  const deps = {
    repoRoot: '/repo',
    readFile: (p) => state.files[p],
    writeFile: (p, text) => { state.writes.push(p); state.files[p] = text; },
    appendShipped: (root, v, date) => { state.appended.push(`${v}@${date}`); return true; },
    git: (args) => {
      const key = args.join(' ');
      state.gitCalls.push(key);
      if (key === 'branch --show-current') return state.branch + '\n';
      if (key === 'status --porcelain') return state.dirty;
      if (key.startsWith('fetch')) return '';
      if (key.startsWith('show origin/main:')) return manifest('6.70.1');
      if (key.startsWith('show main:')) return manifest('6.70.1');
      if (key.startsWith('worktree list')) return 'worktree /repo\nbranch refs/heads/main\n';
      if (key.startsWith('add ')) return '';
      if (key === 'diff --cached --name-only') {
        return (state.staged || ['.claude-plugin/plugin.json', 'CHANGELOG.md', 'docs/shipped-versions.tsv']).join('\n');
      }
      if (key.startsWith('commit')) return '';
      if (key.startsWith('merge-base --is-ancestor')) {
        if (!state.ancestorOk) throw new Error('not an ancestor');
        return '';
      }
      if (key.startsWith('push')) return '';
      throw new Error(`unexpected git: ${key}`);
    },
    gh: (args) => {
      state.ghCalls.push(args.join(' '));
      if (args.join(' ').includes('PUT')) return '{}';
      return JSON.stringify({
        content: Buffer.from(JSON.stringify({ metadata: { version: '2.4.0' }, plugins: [{ name: 'claude-tweaks', version: '6.70.1', description: 'Old' }] })).toString('base64'),
        sha: 'sha1',
      });
    },
    listPlanFiles: () => [],
  };
  return { deps, state };
}

test('dry-run composes but writes nothing', () => {
  const { deps, state } = makeDeps();
  const out = runRelease(deps, { part: 'minor', summary: 'S', date: '2026-08-08', dryRun: true, log: () => {} });
  assert.strictEqual(out.version, '6.71.0');
  assert.strictEqual(out.pushed, false);
  assert.deepStrictEqual(state.writes, []);
  assert.deepStrictEqual(state.appended, []);
  assert.ok(!state.gitCalls.some((c) => c.startsWith('push')));
  assert.deepStrictEqual(state.ghCalls, []);
});

test('live run: write → add → verify staged → commit → ancestor check → push → mirror, in order', () => {
  const { deps, state } = makeDeps();
  const out = runRelease(deps, { part: 'minor', summary: 'S', date: '2026-08-08', dryRun: false, log: () => {} });
  assert.strictEqual(out.pushed, true);
  assert.strictEqual(out.mirrored, true);
  assert.deepStrictEqual(state.writes, ['.claude-plugin/plugin.json', 'CHANGELOG.md']);
  assert.deepStrictEqual(state.appended, ['6.71.0@2026-08-08']);
  const order = ['diff --cached --name-only', 'commit', 'merge-base --is-ancestor', 'push'].map(
    (needle) => state.gitCalls.findIndex((c) => c.startsWith(needle)),
  );
  assert.ok(order.every((i, n) => i !== -1 && (n === 0 || i > order[n - 1])), `order violated: ${state.gitCalls.join(' | ')}`);
  assert.strictEqual(state.ghCalls.filter((c) => c.includes('PUT')).length, 1);
});

test('refuses to run off main or with a dirty tree', () => {
  assert.throws(() => runRelease(makeDeps({ branch: 'feature' }).deps, { part: 'patch', summary: 'S', date: '2026-08-08', dryRun: true, log: () => {} }), /main/);
  assert.throws(() => runRelease(makeDeps({ dirty: ' M x.js' }).deps, { part: 'patch', summary: 'S', date: '2026-08-08', dryRun: true, log: () => {} }), /clean/i);
});

test('aborts before commit when the staged set is not exactly the release trio [IL-42]', () => {
  const { deps, state } = makeDeps({ staged: ['.claude-plugin/plugin.json', 'CHANGELOG.md', 'docs/shipped-versions.tsv', 'stray.js'] });
  assert.throws(() => runRelease(deps, { part: 'minor', summary: 'S', date: '2026-08-08', dryRun: false, log: () => {} }), /staged/i);
  assert.ok(!state.gitCalls.some((c) => c.startsWith('commit')), 'must not commit a stray index');
});

test('aborts before push when origin/main moved during compose', () => {
  const { deps, state } = makeDeps({ ancestorOk: false });
  assert.throws(() => runRelease(deps, { part: 'minor', summary: 'S', date: '2026-08-08', dryRun: false, log: () => {} }), /moved between pre-check and push[\s\S]*do NOT re-run/i);
  assert.ok(!state.gitCalls.some((c) => c.startsWith('push')), 'must not push over divergence');
});
