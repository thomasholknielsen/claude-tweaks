'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  changedFiles, resolveBase, ChangedFilesError,
} = require(path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'verify', 'changed-files.js'));

const FULL = '0123456789abcdef0123456789abcdef01234567';
const MB = 'fedcba9876543210fedcba9876543210fedcba98';

// A fake exec seam keyed by the joined git argv; a missing key throws like
// execFileSync does on a non-zero exit.
function fakeExec(table) {
  const calls = [];
  const exec = (cmd, args) => {
    calls.push([cmd, ...args]);
    const key = args.join(' ');
    if (!(key in table)) { const e = new Error(`fake git: no entry for "${key}"`); e.status = 128; throw e; }
    const v = table[key];
    if (v instanceof Error) throw v;
    return v;
  };
  exec.calls = calls;
  return exec;
}

test('changedFiles unions the committed diff and the working tree, mapping renames to the new path and deletions to the old (#1922)', () => {
  const exec = fakeExec({
    [`diff --name-status --end-of-options ${FULL}..HEAD`]: 'M\tsrc/a.js\nR100\told/b.js\tnew/b.js\nD\tgone.js\nA\tdocs\\win.md\n',
    'status --porcelain': ' M src/a.js\n?? scratch.txt\nR  x.js -> y.js\n D removed.js\n',
  });
  const r = changedFiles({ base: FULL, execImpl: exec });
  assert.strictEqual(r.base, FULL);
  assert.deepStrictEqual(r.files, ['docs/win.md', 'gone.js', 'new/b.js', 'removed.js', 'scratch.txt', 'src/a.js', 'y.js']);
});

test('changedFiles with a clean tree and no commits since base is an empty set, not an error', () => {
  const exec = fakeExec({ [`diff --name-status --end-of-options ${FULL}..HEAD`]: '', 'status --porcelain': '' });
  assert.deepStrictEqual(changedFiles({ base: FULL, execImpl: exec }), { base: FULL, files: [] });
});

test('resolveBase returns the stamp fullSha when it is an ancestor of HEAD (AC3 case 1)', () => {
  const exec = fakeExec({ [`merge-base --is-ancestor ${FULL} HEAD`]: '' });
  assert.strictEqual(resolveBase({ stamp: { sha: 'x', fullSha: FULL }, integrationBranch: 'main', execImpl: exec }), FULL);
});

test('resolveBase falls back to the integration-branch merge-base when the stamp anchor is not an ancestor (rewritten history) or no stamp exists (AC3 case 2)', () => {
  const noAncestor = fakeExec({
    [`merge-base --is-ancestor ${FULL} HEAD`]: new Error('exit 1'),
    'rev-parse --verify --quiet refs/remotes/origin/main': 'abc\n',
    'merge-base --end-of-options origin/main HEAD': `${MB}\n`,
  });
  assert.strictEqual(resolveBase({ stamp: { sha: 'x', fullSha: FULL }, integrationBranch: 'main', execImpl: noAncestor }), MB);
  const noStamp = fakeExec({
    'rev-parse --verify --quiet refs/remotes/origin/main': 'abc\n',
    'merge-base --end-of-options origin/main HEAD': `${MB}\n`,
  });
  assert.strictEqual(resolveBase({ stamp: null, integrationBranch: 'main', execImpl: noStamp }), MB);
  const bareLocal = fakeExec({
    'rev-parse --verify --quiet refs/remotes/origin/main': new Error('no such ref'),
    'merge-base --end-of-options main HEAD': `${MB}\n`,
  });
  assert.strictEqual(resolveBase({ stamp: null, integrationBranch: 'main', execImpl: bareLocal }), MB);
});

test('resolveBase derives the integration branch from origin/HEAD when none is given', () => {
  const exec = fakeExec({
    'symbolic-ref --quiet --short refs/remotes/origin/HEAD': 'origin/main\n',
    'merge-base --end-of-options origin/main HEAD': `${MB}\n`,
  });
  assert.strictEqual(resolveBase({ stamp: null, execImpl: exec }), MB);
});

test('resolveBase throws ChangedFilesError when neither the stamp nor the integration branch resolves — never an empty set (AC3 case 3)', () => {
  const exec = fakeExec({
    [`merge-base --is-ancestor ${FULL} HEAD`]: new Error('exit 1'),
    'rev-parse --verify --quiet refs/remotes/origin/main': new Error('no'),
    'merge-base --end-of-options main HEAD': new Error('fatal: not a valid object name'),
  });
  assert.throws(() => resolveBase({ stamp: { sha: 'x', fullSha: FULL }, integrationBranch: 'main', execImpl: exec }), ChangedFilesError);
  const noInfo = fakeExec({ 'symbolic-ref --quiet --short refs/remotes/origin/HEAD': new Error('no origin') });
  assert.throws(() => resolveBase({ stamp: null, execImpl: noInfo }), ChangedFilesError);
});

test('resolveBase verifies an explicit base as a commit and never consults the stamp', () => {
  const exec = fakeExec({ [`rev-parse --verify --end-of-options ${MB}^{commit}`]: `${MB}\n` });
  assert.strictEqual(resolveBase({ stamp: { sha: 'x', fullSha: FULL }, base: MB, integrationBranch: 'main', execImpl: exec }), MB);
  assert.ok(!exec.calls.some((c) => c.includes('--is-ancestor')));
  const bad = fakeExec({ 'rev-parse --verify --end-of-options nope^{commit}': new Error('fatal') });
  assert.throws(() => resolveBase({ stamp: null, base: 'nope', execImpl: bad }), ChangedFilesError);
});

test('resolveBase uses stamp.sha as the anchor for a legacy stamp that carries no fullSha', () => {
  const exec = fakeExec({ [`merge-base --is-ancestor ${FULL} HEAD`]: '' });
  assert.strictEqual(resolveBase({ stamp: { sha: FULL, scope: 'full', legacy: true }, integrationBranch: 'main', execImpl: exec }), FULL);
});
