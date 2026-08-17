'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CLI = path.resolve(__dirname, '../../../plugin/bin/release.js');

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' },
  }).trim();
}
function write(cwd, rel, text) {
  fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
  fs.writeFileSync(path.join(cwd, rel), text);
}
const manifest = (v) => JSON.stringify({ name: 'fixture', version: v }, null, 2) + '\n';
const changelog = (entries) => '# Changelog\n\n' + entries.map(([v, t]) => `## v${v} — ${t}\n\n${t}.\n`).join('\n');

// Fixture: v1.0.0 root → feature branch (records #603, #604) merged at M → bump to v1.1.0
// whose CHANGELOG entry names #604 only.
function buildFixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'release-status-'));
  git(cwd, ['init', '-q', '-b', 'main']);
  write(cwd, 'plugin/.claude-plugin/plugin.json', manifest('1.0.0'));
  write(cwd, 'CHANGELOG.md', changelog([['1.0.0', 'Initial']]));
  git(cwd, ['add', '-A']); git(cwd, ['commit', '-q', '-m', 'Release v1.0.0 — Initial']);
  git(cwd, ['checkout', '-q', '-b', 'feature']);
  write(cwd, 'feature.txt', 'work for #603 and #604\n');
  git(cwd, ['add', '-A']); git(cwd, ['commit', '-q', '-m', 'Feature work (refs #603, refs #604)']);
  git(cwd, ['checkout', '-q', 'main']);
  git(cwd, ['merge', '-q', '--no-ff', '-m', 'Merge pull request #900 from feature', 'feature']);
  const merge = git(cwd, ['rev-parse', 'HEAD']);
  write(cwd, 'plugin/.claude-plugin/plugin.json', manifest('1.1.0'));
  write(cwd, 'CHANGELOG.md', changelog([['1.1.0', 'Statusline fix (#604)'], ['1.0.0', 'Initial']]));
  git(cwd, ['add', '-A']); git(cwd, ['commit', '-q', '-m', 'Release v1.1.0 — Statusline fix (#604)']);
  const bump = git(cwd, ['rev-parse', 'HEAD']);
  return { cwd, merge, bump };
}

function run(cwd, args) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

test('status: merged then bumped, CHANGELOG omits #603 → already carried, backfill needed', () => {
  const { cwd, merge, bump } = buildFixture();
  const human = run(cwd, ['status', '--merge', merge, '--records', '603,604']);
  assert.equal(human.code, 0, human.stderr);
  assert.equal(human.stdout.trim(), 'already carried by v1.1.0 — CHANGELOG backfill needed: #603');
  const json = run(cwd, ['status', '--merge', merge, '--records', '603,604', '--json']);
  assert.equal(json.code, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout), {
    shipped: true, version: '1.1.0', bumpCommit: bump, entryFound: true, named: [604], missing: [603],
  });
  const backfill = run(cwd, ['status', '--merge', merge, '--records', '603,604', '--backfill']);
  assert.equal(backfill.code, 0, backfill.stderr);
  assert.match(backfill.stdout, /^### also carried in this build\n/);
  assert.match(backfill.stdout, /#603/);
  assert.doesNotMatch(backfill.stdout, /#604/);
});

test('status: no bump after the merge (--ref at the merge itself) → not yet in a release', () => {
  const { cwd, merge } = buildFixture();
  const human = run(cwd, ['status', '--merge', merge, '--records', '603,604', '--ref', merge]);
  assert.equal(human.code, 0, human.stderr);
  assert.equal(human.stdout.trim(), 'not yet in a release — bump pending');
  const json = run(cwd, ['status', '--merge', merge, '--records', '603,604', '--ref', merge, '--json']);
  assert.deepEqual(JSON.parse(json.stdout), { shipped: false });
});

test('status: every record named → shipped, missing empty, backfill prints nothing', () => {
  const { cwd, merge } = buildFixture();
  const json = run(cwd, ['status', '--merge', merge, '--records', '604', '--json']);
  assert.equal(json.code, 0, json.stderr);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.shipped, true);
  assert.deepEqual(parsed.missing, []);
  const backfill = run(cwd, ['status', '--merge', merge, '--records', '604', '--backfill']);
  assert.equal(backfill.code, 0);
  assert.equal(backfill.stdout, '');
});

test('status: a merge that is NOT an ancestor of the bump (landed after it) → not shipped', () => {
  const { cwd } = buildFixture();
  git(cwd, ['checkout', '-q', '-b', 'late']);
  write(cwd, 'late.txt', 'work for #700\n');
  git(cwd, ['add', '-A']); git(cwd, ['commit', '-q', '-m', 'Late work (refs #700)']);
  git(cwd, ['checkout', '-q', 'main']);
  git(cwd, ['merge', '-q', '--no-ff', '-m', 'Merge pull request #901 from late', 'late']);
  const lateMerge = git(cwd, ['rev-parse', 'HEAD']);
  const json = run(cwd, ['status', '--merge', lateMerge, '--records', '700', '--json']);
  assert.deepEqual(JSON.parse(json.stdout), { shipped: false });
});

test('status: usage errors exit 2; a bad sha exits 1', () => {
  const { cwd, merge } = buildFixture();
  assert.equal(run(cwd, ['status', '--records', '603']).code, 2);
  assert.equal(run(cwd, ['status', '--merge', merge]).code, 2);
  assert.equal(run(cwd, ['status', '--merge', merge, '--records', '603', '--bogus']).code, 2);
  const bad = run(cwd, ['status', '--merge', 'deadbeefdeadbeef', '--records', '603']);
  assert.equal(bad.code, 1);
});

test('status: a nonexistent 40-hex sha exits 1 — plain `git rev-parse` echoes it without checking it exists', () => {
  const { cwd } = buildFixture();
  const bad = run(cwd, ['status', '--merge', '0123456789abcdef0123456789abcdef01234567', '--records', '1']);
  assert.equal(bad.code, 1, bad.stdout);
});

// #418's payload move is inside the history the walk reads: commits before it carry
// the manifest at the repo root, commits after it under plugin/. A single-path read
// sees only one side of that boundary and reports the other side's release as never
// having happened.
test('status: a history spanning the plugin/ payload cutover still resolves the carrying bump', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'release-status-cutover-'));
  git(cwd, ['init', '-q', '-b', 'main']);
  // Pre-cutover: manifest at the repo root.
  write(cwd, '.claude-plugin/plugin.json', manifest('1.0.0'));
  write(cwd, 'CHANGELOG.md', changelog([['1.0.0', 'Initial']]));
  git(cwd, ['add', '-A']); git(cwd, ['commit', '-q', '-m', 'Release v1.0.0 — Initial']);

  git(cwd, ['checkout', '-q', '-b', 'feature']);
  write(cwd, 'feature.txt', 'work for #603\n');
  git(cwd, ['add', '-A']); git(cwd, ['commit', '-q', '-m', 'Feature work (refs #603)']);
  git(cwd, ['checkout', '-q', 'main']);
  git(cwd, ['merge', '-q', '--no-ff', '-m', 'Merge pull request #900 from feature', 'feature']);
  const merge = git(cwd, ['rev-parse', 'HEAD']);

  // The cutover itself: same version, new location.
  git(cwd, ['rm', '-q', '.claude-plugin/plugin.json']);
  write(cwd, 'plugin/.claude-plugin/plugin.json', manifest('1.0.0'));
  git(cwd, ['add', '-A']); git(cwd, ['commit', '-q', '-m', 'Move plugin payload into plugin/']);

  // Post-cutover release, at the new path only.
  write(cwd, 'plugin/.claude-plugin/plugin.json', manifest('1.1.0'));
  write(cwd, 'CHANGELOG.md', changelog([['1.1.0', 'Post-cutover release (#604)'], ['1.0.0', 'Initial']]));
  git(cwd, ['add', '-A']); git(cwd, ['commit', '-q', '-m', 'Release v1.1.0 — Post-cutover release (#604)']);
  const bump = git(cwd, ['rev-parse', 'HEAD']);

  const json = run(cwd, ['status', '--merge', merge, '--records', '603,604', '--json']);
  assert.equal(json.code, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout), {
    shipped: true, version: '1.1.0', bumpCommit: bump, entryFound: true, named: [604], missing: [603],
  });
});

test('status: a ref with no plugin manifest hard-fails rather than reporting "not yet in a release"', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'release-status-nomanifest-'));
  git(cwd, ['init', '-q', '-b', 'main']);
  write(cwd, 'README.md', 'no plugin manifest in this repo\n');
  git(cwd, ['add', '-A']); git(cwd, ['commit', '-q', '-m', 'Initial']);
  const merge = git(cwd, ['rev-parse', 'HEAD']);
  const res = run(cwd, ['status', '--merge', merge, '--records', '1']);
  assert.equal(res.code, 1);
  assert.match(res.stderr, /no plugin manifest/);
});

// R1(a)/R2: a --merge or --ref value that's missing or looks like an option must fail as
// usage (exit 2), never reach git as a bare positional argument.
test('status: --merge or --ref with a leading-`-` or missing value is a usage error, not a git call', () => {
  const { cwd, merge } = buildFixture();
  const badMerge = run(cwd, ['status', '--merge', '--output=x', '--records', '1']);
  assert.equal(badMerge.code, 2, badMerge.stderr);
  const badRef = run(cwd, ['status', '--merge', merge, '--records', '1', '--ref', '--output=x']);
  assert.equal(badRef.code, 2, badRef.stderr);
  const trailingRef = run(cwd, ['status', '--merge', merge, '--records', '1', '--ref']);
  assert.equal(trailingRef.code, 2, trailingRef.stderr);
});

// R5: a bad --ref surfaces as "could not resolve", not misread as "no plugin manifest".
test('status: a nonexistent --ref exits 1 with "could not resolve", not "no plugin manifest"', () => {
  const { cwd, merge } = buildFixture();
  const res = run(cwd, ['status', '--merge', merge, '--records', '1', '--ref', 'no-such-branch']);
  assert.equal(res.code, 1);
  assert.match(res.stderr, /could not resolve/);
});
