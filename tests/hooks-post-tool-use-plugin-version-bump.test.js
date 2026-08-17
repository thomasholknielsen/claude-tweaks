// tests/hooks-post-tool-use-plugin-version-bump.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const post = require('../plugin/bin/lib/hooks/post-tool-use');

function gitEnv(dateOverride) {
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  if (dateOverride) {
    env.GIT_AUTHOR_DATE = dateOverride;
    env.GIT_COMMITTER_DATE = dateOverride;
  }
  return env;
}

// Creates a fresh repo with an initial commit, then a second commit that
// writes `plugin/.claude-plugin/plugin.json` with the given raw content (a string,
// so malformed-JSON cases can be exercised directly). Returns the repo dir.
function gitRepoWithManifestCommit(manifestContent, dateOverride) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-pvb-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-q', '-m', 'initial'], { env: gitEnv() });
  fs.mkdirSync(path.join(dir, 'plugin', '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin', '.claude-plugin', 'plugin.json'), manifestContent);
  execFileSync('git', ['-C', dir, 'add', 'plugin/.claude-plugin/plugin.json'], { env: gitEnv() });
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'Bump to 9.9.9'], { env: gitEnv(dateOverride) });
  return fs.realpathSync(dir);
}

function gitRepoWithUnrelatedCommit(dateOverride) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-pvb-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-q', '-m', 'a normal commit'], { env: gitEnv(dateOverride) });
  return fs.realpathSync(dir);
}

function runPostToolUse(repo) {
  return post.run({
    input: { tool_name: 'Bash', tool_input: { command: 'git commit -m "..."' }, cwd: repo },
    runDir: null,
    runState: null,
    cwd: repo,
  });
}

test('warns when a commit touches plugin/.claude-plugin/plugin.json for this project (name: claude-tweaks)', () => {
  const repo = gitRepoWithManifestCommit(JSON.stringify({ name: 'claude-tweaks', version: '9.9.9' }));
  const out = runPostToolUse(repo);
  assert.ok(out.json && typeof out.json.systemMessage === 'string', 'expected a systemMessage warning');
  // Both release follow-ups, asserted separately. A single /marketplace/ match
  // passed for months while the message said nothing about the changelog.
  assert.match(out.json.systemMessage, /marketplace/i);
  assert.match(out.json.systemMessage, /CHANGELOG/i);
  assert.match(out.json.systemMessage, /shipped-versions\.tsv/i);
  assert.match(out.json.systemMessage, /plugin\/\.claude-plugin\/plugin\.json/);
});

// #418: the catalog entry no longer carries a `version` field at all — it is a
// git-subdir source pinned by commit sha. A nudge still naming `plugins[].version`
// sends the reader to edit a key that does not exist.
test('the mirror line names the sha pin, not the retired plugins[].version field', () => {
  const repo = gitRepoWithManifestCommit(JSON.stringify({ name: 'claude-tweaks', version: '9.9.9' }));
  const msg = runPostToolUse(repo).json.systemMessage;
  assert.match(msg, /source\.sha/, `mirror line must name the sha pin: ${msg}`);
  assert.doesNotMatch(msg, /plugins\[\]\.version/, `still names the retired version field: ${msg}`);
});

// A repo (or a stretch of history) that predates the payload move still carries the
// manifest at the repo root. The nudge is about a release convention that spans that
// boundary, so it has to recognise both spellings.
test('still warns for a commit touching the pre-cutover root manifest path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-pvb-legacy-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-q', '-m', 'initial'], { env: gitEnv() });
  fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'claude-tweaks', version: '9.9.9' }));
  execFileSync('git', ['-C', dir, 'add', '.claude-plugin/plugin.json'], { env: gitEnv() });
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'Bump to 9.9.9'], { env: gitEnv() });
  const msg = runPostToolUse(fs.realpathSync(dir)).json.systemMessage;
  assert.match(msg, /marketplace/i);
  assert.match(msg, /CHANGELOG/i);
});

// The cutover boundary inside one repo's history: the parent commit's manifest lives
// at the old path. Reading only the new path there sees "no parent manifest" and
// fails open, so a hand-edited version bump straddling the move goes unflagged.
test('flags a bypassed bump whose parent manifest is still at the pre-cutover path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-pvb-cutover-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'claude-tweaks', version: '1.0.0' }));
  execFileSync('git', ['-C', dir, 'add', '-A'], { env: gitEnv() });
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'initial'], { env: gitEnv() });
  execFileSync('git', ['-C', dir, 'rm', '-q', '.claude-plugin/plugin.json'], { env: gitEnv() });
  fs.mkdirSync(path.join(dir, 'plugin', '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin', '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'claude-tweaks', version: '1.1.0' }));
  execFileSync('git', ['-C', dir, 'add', '-A'], { env: gitEnv() });
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'Bump version by hand while moving the payload'], { env: gitEnv() });
  const msg = runPostToolUse(fs.realpathSync(dir)).json.systemMessage;
  assert.match(msg, /`plugin\/bin\/release\.js` appears to have been bypassed/);
});

// Same repo shape, but the release's same-commit obligations can be satisfied
// selectively — the nudge is only useful if it stops naming what is already done.
function gitRepoWithRelease({ version = '9.9.9', changelog = null, record = null }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-pvb-rel-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  execFileSync('git', ['-C', dir, 'commit', '--allow-empty', '-q', '-m', 'initial'], { env: gitEnv() });
  fs.mkdirSync(path.join(dir, 'plugin', '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin', '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'claude-tweaks', version }));
  if (changelog !== null) fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), changelog);
  if (record !== null) {
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'shipped-versions.tsv'), record);
  }
  execFileSync('git', ['-C', dir, 'add', '-A'], { env: gitEnv() });
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', `Bump to ${version}`], { env: gitEnv() });
  return fs.realpathSync(dir);
}

test('stops naming the CHANGELOG once the same commit carries the entry', () => {
  const repo = gitRepoWithRelease({ changelog: '# Changelog\n\n## v9.9.9 — did the thing\n\nbody\n' });
  const msg = runPostToolUse(repo).json.systemMessage;
  assert.doesNotMatch(msg, /CHANGELOG/i, `still asked for the changelog: ${msg}`);
  assert.match(msg, /shipped-versions\.tsv/i, 'the record is still outstanding and must still be named');
});

test('stops naming the record once the same commit carries the line', () => {
  const repo = gitRepoWithRelease({ record: '# header\n9.9.9\t2026-08-06\trelease\n' });
  const msg = runPostToolUse(repo).json.systemMessage;
  assert.doesNotMatch(msg, /shipped-versions\.tsv/i, `still asked for the record: ${msg}`);
  assert.match(msg, /CHANGELOG/i, 'the changelog is still outstanding and must still be named');
});

test('a near-miss version in either file does not count as satisfying it', () => {
  // "9.9.99" contains "9.9.9" as a prefix. A substring test would read both as done.
  const repo = gitRepoWithRelease({
    changelog: '# Changelog\n\n## v9.9.99 — a different release\n',
    record: '# header\n9.9.99\t2026-08-06\trelease\n',
  });
  const msg = runPostToolUse(repo).json.systemMessage;
  assert.match(msg, /CHANGELOG/i);
  assert.match(msg, /shipped-versions\.tsv/i);
});

test('the marketplace mirror is always named — it lives in another repo and cannot be checked', () => {
  const repo = gitRepoWithRelease({
    changelog: '# Changelog\n\n## v9.9.9 — did the thing\n',
    record: '# header\n9.9.9\t2026-08-06\trelease\n',
  });
  const msg = runPostToolUse(repo).json.systemMessage;
  assert.match(msg, /marketplace/i);
  assert.doesNotMatch(msg, /CHANGELOG/i);
  assert.doesNotMatch(msg, /shipped-versions\.tsv/i);
});

test('does not warn when plugin.json belongs to a different project', () => {
  const repo = gitRepoWithManifestCommit(JSON.stringify({ name: 'some-other-plugin', version: '1.0.0' }));
  assert.deepStrictEqual(runPostToolUse(repo), {});
});

test('does not warn when the commit does not touch plugin.json at all', () => {
  const repo = gitRepoWithUnrelatedCommit();
  assert.deepStrictEqual(runPostToolUse(repo), {});
});

test('does not warn when the Bash command is not a git commit', () => {
  const repo = gitRepoWithManifestCommit(JSON.stringify({ name: 'claude-tweaks', version: '9.9.9' }));
  const out = post.run({
    input: { tool_name: 'Bash', tool_input: { command: 'npm test' }, cwd: repo },
    runDir: null, runState: null, cwd: repo,
  });
  assert.deepStrictEqual(out, {});
});

test('does not evaluate a stale HEAD left over from a git commit that never landed', () => {
  const repo = gitRepoWithManifestCommit(JSON.stringify({ name: 'claude-tweaks', version: '9.9.9' }), '2020-01-01T00:00:00');
  assert.deepStrictEqual(runPostToolUse(repo), {});
});

test('does not crash on malformed JSON in plugin.json at that commit, and does not warn', () => {
  const repo = gitRepoWithManifestCommit('{ this is not valid json');
  assert.deepStrictEqual(runPostToolUse(repo), {});
});

// ─── Release-bypass check (#307) ───────────────────────────────────────────
//
// Two commits: the first introduces plugin/.claude-plugin/plugin.json at `v1`; the
// second changes it to `v2` (or leaves it at v1) with `message2`. The
// bypass check compares the second commit's manifest against the FIRST
// commit's (its parent), via `git show {hash}^:...` — never a textual or
// staged-hunk heuristic.
// `note` makes the manifest's bytes differ between the two commits
// regardless of whether `version` itself changed — needed for the
// "touches the file without changing the version" case below, where v1 ===
// v2 would otherwise produce a byte-identical file that `git diff-tree`
// (correctly) does not report as changed at all, short-circuiting the whole
// check before it ever reaches the bypass comparison this is meant to
// exercise.
function gitRepoWithVersionSequence({ v1, v2, message2 }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-pvb-bypass-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  fs.mkdirSync(path.join(dir, 'plugin', '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin', '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'claude-tweaks', version: v1, note: 'a' }));
  execFileSync('git', ['-C', dir, 'add', 'plugin/.claude-plugin/plugin.json'], { env: gitEnv() });
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'initial'], { env: gitEnv() });
  fs.writeFileSync(path.join(dir, 'plugin', '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'claude-tweaks', version: v2, note: 'b' }));
  execFileSync('git', ['-C', dir, 'add', 'plugin/.claude-plugin/plugin.json'], { env: gitEnv() });
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', message2], { env: gitEnv() });
  return fs.realpathSync(dir);
}

test('flags a version change whose commit message does not match the release shape', () => {
  const repo = gitRepoWithVersionSequence({ v1: '1.0.0', v2: '1.1.0', message2: 'Bump version by hand' });
  const msg = runPostToolUse(repo).json.systemMessage;
  assert.match(msg, /`plugin\/bin\/release\.js` appears to have been bypassed/);
});

test('does not flag a version change whose commit message matches the release shape', () => {
  const repo = gitRepoWithVersionSequence({ v1: '1.0.0', v2: '1.1.0', message2: 'Release v1.1.0 — routine bump' });
  const msg = runPostToolUse(repo).json.systemMessage;
  assert.doesNotMatch(msg, /bypassed/i);
});

test('does not flag a commit that touches plugin.json without changing the version', () => {
  const repo = gitRepoWithVersionSequence({ v1: '1.2.3', v2: '1.2.3', message2: 'unrelated docs tweak' });
  const msg = runPostToolUse(repo).json.systemMessage;
  assert.doesNotMatch(msg, /bypassed/i);
});

test('does not flag the commit that first introduces plugin.json (no parent manifest to compare against)', () => {
  // gitRepoWithManifestCommit's own first commit is an EMPTY commit with no
  // plugin/.claude-plugin/plugin.json at all — `git show {hash}^:...` on the
  // manifest-introducing commit therefore fails to resolve, exactly the
  // "no parent manifest" case this check must fail open on.
  const repo = gitRepoWithManifestCommit(JSON.stringify({ name: 'claude-tweaks', version: '9.9.9' }));
  const msg = runPostToolUse(repo).json.systemMessage;
  assert.doesNotMatch(msg, /bypassed/i);
});

test('fires even when a runDir IS set (independent of the breadcrumb/other checks)', () => {
  const repo = gitRepoWithManifestCommit(JSON.stringify({ name: 'claude-tweaks', version: '9.9.9' }));
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-pvb-run-'));
  const out = post.run({
    input: { tool_name: 'Bash', tool_input: { command: 'git commit -m "..."' }, cwd: repo },
    runDir, runState: { status: 'active' }, cwd: repo,
  });
  assert.match(out.json.systemMessage, /marketplace/i);
  assert.match(out.json.systemMessage, /CHANGELOG/i);
});
