'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { gatherReleasePreflight, PROBE_NAMES, isBotAuthor, isReleasePr } = require('../../../plugin/bin/lib/release-preflight/pack.js');

const ROOT = '/repo';
const SHA = 'a'.repeat(40);
const LOG = (subjects) => subjects.map((s, i) => `${String(i).repeat(40)}\x1f${s}\x1f\x1e\n`).join('');

function fakeDeps(o = {}) {
  const files = { [path.join(ROOT, '.claude-tweaks/policy.yml')]: o.policy === undefined ? 'integration-model: pr-first\n' : o.policy, ...(o.files || {}) };
  const calls = { git: [], gh: [] };
  return {
    calls,
    deps: {
      git: (args) => {
        const key = args.join(' ');
        calls.git.push(key);
        if (key === 'rev-parse --show-toplevel') return `${ROOT}\n`;
        if (key.startsWith('rev-parse --verify --quiet refs/remotes/origin/')) { if (o.noOriginRef) throw new Error('fatal: Needed a single revision'); return `${SHA}\n`; }
        if (key.startsWith('rev-parse ')) return `${SHA}\n`;
        if (key.startsWith('describe')) { if (o.noTag) throw new Error('fatal: No names found, cannot describe anything.'); return 'v1.2.0\n'; }
        if (key.startsWith('log --first-parent')) return LOG(o.subjects === undefined ? ['feat: a'] : o.subjects);
        throw new Error(`unexpected git: ${key}`);
      },
      execFileAsync: async (cmd, args) => {
        calls.gh.push(`${cmd} ${args.join(' ')}`);
        if (o.ghFail) throw Object.assign(new Error(o.ghFail), { code: o.ghCode });
        const key = args.join(' ');
        if (key.startsWith('pr list')) return JSON.stringify(o.prs || []);
        if (key.startsWith('pr view')) return JSON.stringify({ commits: o.prCommits || [] });
        if (key.startsWith('repo view')) return JSON.stringify({ nameWithOwner: 'o/r' });
        if (key.startsWith('api repos/o/r/commits/')) return JSON.stringify(o.checkRuns || { total_count: 0, check_runs: [] });
        throw new Error(`unexpected gh: ${key}`);
      },
      readFile: (p) => (p in files ? files[p] : null),
      readdir: (p) => o.workflows && p === path.join(ROOT, '.github/workflows') ? Object.keys(o.workflows) : [],
      now: () => 1000,
      probeTimeoutMs: 2000,
    },
  };
}

test('PROBE_NAMES is the record\'s eight fields in order', () => {
  assert.deepStrictEqual(PROBE_NAMES, ['engine', 'lastTag', 'unreleased', 'proposedVersion', 'releasePr', 'ciTip', 'openReleasePrConflict', 'hook']);
});

test('AC 1 (pr-first): one unreleased feat since v1.2.0 → proposedVersion 1.3.0 minor, unreleased lists the parsed commit, tipRef is origin/main', async () => {
  const { deps } = fakeDeps();
  const pack = await gatherReleasePreflight({ cwd: ROOT, deps });
  assert.strictEqual(pack.engine.value, 'pr-first');
  assert.strictEqual(pack.tipRef, 'origin/main');
  assert.deepStrictEqual(pack.lastTag.value, { tag: 'v1.2.0', version: '1.2.0', tipRef: 'origin/main' });
  assert.strictEqual(pack.unreleased.value.commits.length, 1);
  assert.strictEqual(pack.unreleased.value.commits[0].type, 'feat');
  assert.deepStrictEqual(pack.proposedVersion.value, { version: '1.3.0', part: 'minor', base: '1.2.0', tipRef: 'origin/main' });
  for (const k of PROBE_NAMES) assert.ok(k in pack && typeof pack[k].ok === 'boolean', k);
});

test('AC 2: zero commits since the tag → unreleased is empty and proposedVersion degrades naming nothing to release', async () => {
  const { deps } = fakeDeps({ subjects: [] });
  const pack = await gatherReleasePreflight({ cwd: ROOT, deps });
  assert.deepStrictEqual(pack.unreleased.value.commits, []);
  assert.strictEqual(pack.proposedVersion.ok, false);
  assert.match(pack.proposedVersion.error, /nothing to release/);
});

test('AC 8 (local-merge): the same fixture yields the same unreleased/proposedVersion shape; releasePr is none, ciTip n/a, hook follows the policy key', async () => {
  const a = await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps({ policy: 'integration-model: local-merge\nrelease-hook: ./publish.sh\n' }).deps });
  assert.strictEqual(a.engine.value, 'local-merge');
  assert.deepStrictEqual(a.proposedVersion.value, { version: '1.3.0', part: 'minor', base: '1.2.0', tipRef: 'origin/main' });
  assert.strictEqual(a.unreleased.value.commits[0].type, 'feat');
  assert.deepStrictEqual(a.releasePr, { ok: true, value: 'none', durationMs: 0 });
  assert.deepStrictEqual(a.ciTip, { ok: true, value: 'n/a', durationMs: 0 });
  assert.deepStrictEqual(a.openReleasePrConflict.value, false);
  assert.strictEqual(a.hook.value, true);
  const b = await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps({ policy: 'integration-model: local-merge\nrelease-hook: false\n' }).deps });
  assert.strictEqual(b.hook.value, false);
});

test('AC 6: integration-model unset → engine, releasePr and hook all degrade naming engine unresolved; git fields still resolve', async () => {
  const { deps } = fakeDeps({ policy: '' });
  const pack = await gatherReleasePreflight({ cwd: ROOT, deps });
  assert.strictEqual(pack.engine.ok, false);
  assert.match(pack.engine.error, /integration-model unresolved/);
  for (const k of ['releasePr', 'hook', 'ciTip', 'openReleasePrConflict']) { assert.strictEqual(pack[k].ok, false, k); assert.match(pack[k].error, /engine unresolved/, k); }
  assert.strictEqual(pack.lastTag.ok, true);
  const bad = await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps({ policy: 'integration-model: gitlab\n' }).deps });
  assert.strictEqual(bad.engine.ok, false);
});

test('ruling 3: without origin/{branch} the tip is refs/heads/{branch}; integration-branch policy renames it', async () => {
  const { deps, calls } = fakeDeps({ noOriginRef: true, policy: 'integration-model: local-merge\nintegration-branch: develop\n' });
  const pack = await gatherReleasePreflight({ cwd: ROOT, deps });
  assert.strictEqual(pack.branch, 'develop');
  assert.strictEqual(pack.tipRef, 'refs/heads/develop');
  assert.ok(calls.git.some((c) => c === 'rev-parse --verify --quiet refs/remotes/origin/develop'));
});

test('ruling 7: no prior tag → lastTag degrades, unreleased covers the full history, base is the manifest file or 0.0.0', async () => {
  const withManifest = fakeDeps({ noTag: true, subjects: ['feat: first'], files: { [path.join(ROOT, '.release-please-manifest.json')]: '{\n  ".": "0.1.0"\n}\n' } });
  const a = await gatherReleasePreflight({ cwd: ROOT, deps: withManifest.deps });
  assert.strictEqual(a.lastTag.ok, false);
  assert.match(a.lastTag.error, /no v\* tag reachable from origin\/main/);
  assert.ok(withManifest.calls.git.some((c) => c.startsWith('log --first-parent') && c.endsWith(' origin/main')));
  assert.deepStrictEqual(a.proposedVersion.value, { version: '0.2.0', part: 'minor', base: '0.1.0', tipRef: 'origin/main' });
  const bare = await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps({ noTag: true, subjects: ['fix: x'] }).deps });
  assert.strictEqual(bare.proposedVersion.value.version, '0.0.1');
});

test('hook (pr-first): true only when a workflow declares a release trigger with published', async () => {
  const yes = fakeDeps({ workflows: { 'publish.yml': 'on:\n  release:\n    types: [published]\njobs: {}\n' } });
  yes.deps.readFile = ((orig) => (p) => (p === path.join(ROOT, '.github/workflows/publish.yml') ? 'on:\n  release:\n    types: [published]\njobs: {}\n' : orig(p)))(yes.deps.readFile);
  assert.strictEqual((await gatherReleasePreflight({ cwd: ROOT, deps: yes.deps })).hook.value, true);
  const no = fakeDeps({ workflows: { 'ci.yml': 'on: [push]\n' } });
  no.deps.readFile = ((orig) => (p) => (p === path.join(ROOT, '.github/workflows/ci.yml') ? 'on: [push]\n' : orig(p)))(no.deps.readFile);
  assert.strictEqual((await gatherReleasePreflight({ cwd: ROOT, deps: no.deps })).hook.value, false);
  assert.strictEqual((await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps().deps })).hook.value, false);
});

test('a caller-supplied root is used as-is — the pack never spawns its own rev-parse --show-toplevel', async () => {
  const { deps, calls } = fakeDeps();
  const pack = await gatherReleasePreflight({ cwd: ROOT, root: ROOT, deps });
  assert.strictEqual(pack.engine.value, 'pr-first');
  assert.deepStrictEqual(calls.git.filter((c) => c === 'rev-parse --show-toplevel'), []);
});

test('--only limits the probes gathered; the rest are absent from the pack', async () => {
  const pack = await gatherReleasePreflight({ cwd: ROOT, only: ['engine', 'lastTag'], deps: fakeDeps().deps });
  assert.deepStrictEqual(Object.keys(pack).filter((k) => PROBE_NAMES.includes(k)), ['engine', 'lastTag']);
});

test('a probe that throws degrades only itself (a git failure in describe leaves engine ok)', async () => {
  const { deps } = fakeDeps();
  deps.git = ((orig) => (args) => { if (args[0] === 'describe') throw new Error('fatal: not a git repository'); return orig(args); })(deps.git);
  const pack = await gatherReleasePreflight({ cwd: ROOT, deps });
  assert.strictEqual(pack.lastTag.ok, false);
  assert.match(pack.lastTag.error, /not a git repository/);
  assert.strictEqual(pack.engine.ok, true);
});

test('isBotAuthor / isReleasePr helpers', () => {
  assert.strictEqual(isBotAuthor({ login: 'github-actions', name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' }), true);
  assert.strictEqual(isBotAuthor({ login: 'release-please[bot]', name: '', email: '' }), true);
  assert.strictEqual(isBotAuthor({ login: 'thomas', name: 'Thomas', email: 't@x' }), false);
  assert.strictEqual(isReleasePr({ headRefName: 'release-please--branches--main', title: 'x' }), true);
  assert.strictEqual(isReleasePr({ headRefName: 'feature', title: 'chore(main): release 1.3.0' }), true);
  assert.strictEqual(isReleasePr({ headRefName: 'feature', title: 'chore: release notes' }), false);
});

test('releasePr (pr-first): the open release-please PR, or none', async () => {
  const withPr = fakeDeps({ prs: [{ number: 7, state: 'OPEN', mergeable: 'MERGEABLE', headRefName: 'feature', title: 'x' }, { number: 9, state: 'OPEN', mergeable: 'CONFLICTING', headRefName: 'release-please--branches--main', title: 'chore(main): release 1.3.0' }] });
  const a = await gatherReleasePreflight({ cwd: ROOT, deps: withPr.deps });
  assert.deepStrictEqual(a.releasePr.value, { number: 9, state: 'OPEN', mergeable: 'CONFLICTING', headRefName: 'release-please--branches--main', title: 'chore(main): release 1.3.0' });
  assert.ok(withPr.calls.gh.some((c) => c.startsWith('gh pr list --state open')));
  const none = await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps({ prs: [] }).deps });
  assert.strictEqual(none.releasePr.value, 'none');
  assert.strictEqual(none.openReleasePrConflict.value, false);
});

test('AC 7: openReleasePrConflict is true when the newest PR commit has a human author, false when every author is a bot', async () => {
  const pr = [{ number: 9, state: 'OPEN', mergeable: 'MERGEABLE', headRefName: 'release-please--branches--main', title: 'chore(main): release 1.3.0' }];
  const bot = { login: 'github-actions', name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' };
  const human = { login: 'thomas', name: 'Thomas', email: 't@x' };
  const clean = await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps({ prs: pr, prCommits: [{ oid: 'a', authors: [bot] }] }).deps });
  assert.strictEqual(clean.openReleasePrConflict.value, false);
  const edited = await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps({ prs: pr, prCommits: [{ oid: 'a', authors: [bot] }, { oid: 'b', authors: [human] }] }).deps });
  assert.strictEqual(edited.openReleasePrConflict.value, true);
});

test('ciTip (pr-first): check-run counts on the tip sha; AC 3: a gh failure degrades ciTip and releasePr alone', async () => {
  const runs = { total_count: 3, check_runs: [{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'failure' }, { status: 'in_progress', conclusion: null }] };
  const ok = await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps({ checkRuns: runs }).deps });
  assert.deepStrictEqual(ok.ciTip.value, { sha: SHA, tipRef: 'origin/main', state: 'failure', total: 3, success: 1, failure: 1, pending: 1 });
  const down = await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps({ ghFail: 'spawn gh ENOENT', ghCode: 'ENOENT' }).deps });
  assert.strictEqual(down.ciTip.ok, false);
  assert.strictEqual(down.releasePr.ok, false);
  assert.strictEqual(down.openReleasePrConflict.ok, false);
  assert.strictEqual(down.engine.ok, true);
  assert.strictEqual(down.proposedVersion.ok, true);
  assert.strictEqual(down.hook.ok, true);
});

test('a hung probe is bounded by the timeout and degrades itself only', async () => {
  const { deps } = fakeDeps();
  deps.execFileAsync = () => new Promise(() => {});
  deps.probeTimeoutMs = 20;
  const pack = await gatherReleasePreflight({ cwd: ROOT, deps });
  assert.strictEqual(pack.releasePr.ok, false);
  assert.match(pack.releasePr.error, /timeout after 20ms/);
  assert.strictEqual(pack.lastTag.ok, true);
});
