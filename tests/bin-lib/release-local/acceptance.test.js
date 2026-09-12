'use strict';
// Acceptance criteria 1, 2, 3, 5 and 7 against real git repos: the CLI is
// spawned as a user would run it. Fixture repos have no origin (local-merge's
// common case) unless a test adds one.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { gitRepo, fixtureGit } = require('../../helpers/git-fixtures.js');

const CLI = path.join(__dirname, '../../../plugin/bin/release-local.js');
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' };

function runCli(root, args = []) {
  try {
    const stdout = execFileSync('node', [CLI, '--root', root, ...args], { encoding: 'utf8', env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '', stderr: e.stderr || '' };
  }
}

function commit(root, subject, files = {}) {
  for (const [p, text] of Object.entries(files)) fs.writeFileSync(path.join(root, p), text);
  fixtureGit(['-C', root, 'add', '-A'], { env: ENV });
  fixtureGit(['-C', root, 'commit', '-q', '--allow-empty', '-m', subject], { env: ENV });
}

function bootstrapped(version) {
  const root = gitRepo();
  fixtureGit(['-C', root, 'branch', '-M', 'main']);
  commit(root, 'chore: bootstrap', {
    'release-please-config.json': JSON.stringify({ packages: { '.': { 'release-type': 'node' } } }, null, 2) + '\n',
    '.release-please-manifest.json': `{\n  ".": "${version}"\n}\n`,
    'package.json': `{\n  "name": "fixture",\n  "version": "${version}",\n  "private": true\n}\n`,
    'CHANGELOG.md': '# Changelog\n',
  });
  return root;
}

function tagged(version) {
  const root = bootstrapped(version);
  fixtureGit(['-C', root, 'tag', '-a', `v${version}`, '-m', `v${version}`], { env: ENV });
  return root;
}

test('AC 1: v1.2.0 + fix, fix, feat → --dry-run reports 1.3.0, three bullets, no hook, writes nothing', () => {
  const root = tagged('1.2.0');
  commit(root, 'fix: one'); commit(root, 'fix: two'); commit(root, 'feat: three');
  const before = fixtureGit(['-C', root, 'rev-parse', 'HEAD']).toString();
  const r = runCli(root, ['--dry-run']);
  assert.strictEqual(r.code, 0, r.stderr);
  assert.match(r.stdout, /v1\.3\.0 \(minor\) from v1\.2\.0/);
  assert.strictEqual((r.stdout.match(/^\* /gm) || []).length, 3);
  assert.match(r.stdout, /no hook configured/);
  assert.strictEqual(fixtureGit(['-C', root, 'status', '--porcelain']).toString(), '');
  assert.strictEqual(fixtureGit(['-C', root, 'rev-parse', 'HEAD']).toString(), before);
  assert.strictEqual(fixtureGit(['-C', root, 'tag', '-l']).toString().trim(), 'v1.2.0');
});

test('AC 2: the live run lands the manifest edit, the CHANGELOG section, the chore(release) commit and the annotated tag', () => {
  const root = tagged('1.2.0');
  commit(root, 'fix: one'); commit(root, 'fix: two'); commit(root, 'feat: three');
  const r = runCli(root);
  assert.strictEqual(r.code, 0, r.stderr);
  // git 2.55 prints `v1.3.0^0` when HEAD is the tagged commit itself (probed 2026-09-12); the design doc's bare `v1.3.0` is the tag-name half.
  assert.match(fixtureGit(['-C', root, 'describe', '--contains', 'HEAD']).toString().trim(), /^v1\.3\.0(\^0)?$/);
  assert.strictEqual(fixtureGit(['-C', root, 'log', '-1', '--format=%s']).toString().trim(), 'chore(release): v1.3.0');
  assert.strictEqual(fixtureGit(['-C', root, 'cat-file', '-t', 'v1.3.0']).toString().trim(), 'tag');
  assert.strictEqual(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), '{\n  "name": "fixture",\n  "version": "1.3.0",\n  "private": true\n}\n');
  assert.strictEqual(fs.readFileSync(path.join(root, '.release-please-manifest.json'), 'utf8'), '{\n  ".": "1.3.0"\n}\n');
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, /^# Changelog\n\n## 1\.3\.0 \(\d{4}-\d{2}-\d{2}\)\n\n\n### Features\n\n\* three\n\n\n### Bug Fixes\n\n\* two\n\* one\n$/);
  assert.strictEqual(fixtureGit(['-C', root, 'status', '--porcelain']).toString(), '');
});

test('AC 3: only chore commits since the tag → exit 3, nothing written', () => {
  const root = tagged('1.2.0');
  commit(root, 'chore: a'); commit(root, 'docs: b');
  const before = fixtureGit(['-C', root, 'rev-parse', 'HEAD']).toString();
  const r = runCli(root);
  assert.strictEqual(r.code, 3, r.stderr);
  assert.match(r.stdout, /nothing to release/);
  assert.strictEqual(fixtureGit(['-C', root, 'rev-parse', 'HEAD']).toString(), before);
  assert.strictEqual(fixtureGit(['-C', root, 'tag', '-l']).toString().trim(), 'v1.2.0');
  assert.match(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), /"version": "1\.2\.0"/);
});

test('AC 5: a BREAKING CHANGE footer among fix/chore commits computes a major', () => {
  const root = tagged('1.2.0');
  commit(root, 'fix: a'); commit(root, 'chore: b');
  fixtureGit(['-C', root, 'commit', '-q', '--allow-empty', '-m', 'fix: rename key\n\nBREAKING CHANGE: config key renamed'], { env: ENV });
  const r = runCli(root, ['--dry-run']);
  assert.strictEqual(r.code, 0, r.stderr);
  assert.match(r.stdout, /v2\.0\.0 \(major\)/);
  assert.match(r.stdout, /### ⚠ BREAKING CHANGES\n\n\* config key renamed\n/);
});

test('AC 7: no prior v* tag → the full first-parent history, base from the seeded manifest: 0.1.0 + feat → 0.2.0', () => {
  const root = bootstrapped('0.1.0');
  commit(root, 'feat: first');
  const r = runCli(root, ['--dry-run']);
  assert.strictEqual(r.code, 0, r.stderr);
  assert.match(r.stdout, /v0\.2\.0 \(minor\) from no prior tag/);
});

test('a first-parent merge keeps branch commits out of the plan (design stance 3)', () => {
  const root = tagged('1.2.0');
  fixtureGit(['-C', root, 'checkout', '-q', '-b', 'feature']);
  commit(root, 'wip: branch noise'); commit(root, 'feat!: branch-only breaking');
  fixtureGit(['-C', root, 'checkout', '-q', 'main']);
  fixtureGit(['-C', root, 'merge', '-q', '--no-ff', '-m', 'fix: merged feature', 'feature'], { env: ENV });
  const r = runCli(root, ['--dry-run']);
  assert.strictEqual(r.code, 0, r.stderr);
  assert.match(r.stdout, /v1\.2\.1 \(patch\)/);
  assert.ok(!r.stdout.includes('branch-only breaking'));
  assert.ok(!r.stdout.includes('unconventional'));
});
