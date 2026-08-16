// tests/staged-patch-contract.test.js — pins #674's single-statement rule: the staged-patch
// artifact format, the staging-time `git apply --check` gate, and the console apply-with-
// description-fallback procedure live once in skills/_shared/staged-patch.md, and every
// patch-staging site and console apply step cites it. Also runs the live `git apply --check`
// discrimination probe the contract's prose relies on (preamble accepted; malformed and stale
// rejected) so the mechanism is proven on this machine, not asserted.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { FIXTURE_TIMEOUT_MS } = require('./helpers/git-fixtures');

const SKILLS = path.join(__dirname, '..', 'skills');
const CONTRACT = path.join(SKILLS, '_shared', 'staged-patch.md');
const read = (...p) => fs.readFileSync(path.join(SKILLS, ...p), 'utf8');

test('contract file exists with its three named sections', () => {
  const text = fs.readFileSync(CONTRACT, 'utf8');
  for (const h of ['## Artifact format', '## Staging-time gate', '## Console apply with description fallback']) {
    assert.equal(text.split('\n').filter((l) => l === h).length, 1, `${h} stated exactly once`);
  }
  for (const field of ['Target:', 'Invariant:', 'Finding:', 'Staged-at:']) {
    assert.ok(text.includes(field), `contract names the ${field} preamble field`);
  }
  assert.match(text, /git apply --check/);
});

// Every site that writes a `.patch` under staged/ must cite the contract; the console apply
// steps must cite it too. Anchored on the literal filenames each site already uses.
const STAGING_SITES = [
  ['review', 'step3-routing.md', /staged\/review-\{n\}\.patch/],
  ['test', 'SKILL.md', /staged\/test-fix-\{n\}\.patch/],
  ['_shared', 'multi-agent-coordination.md', /staged\/review-unconfirmed-\{n\}\.patch/],
];
for (const [dir, file, anchor] of STAGING_SITES) {
  test(`${dir}/${file} still stages a .patch and cites _shared/staged-patch.md`, () => {
    const text = read(dir, file);
    assert.match(text, anchor, 'staging site anchor present');
    assert.ok(text.includes('_shared/staged-patch.md'), `${dir}/${file} must cite the contract`);
    assert.match(text, /git apply --check/, `${dir}/${file} must name the staging-time gate`);
  });
}

const CONSOLE_SITES = [
  ['wrap-up', 'review-console.md'],
  ['flow', 'multispec-review-console.md'],
];
for (const [dir, file] of CONSOLE_SITES) {
  test(`${dir}/${file} apply step cites the contract and names the staleness case`, () => {
    const text = read(dir, file);
    assert.ok(text.includes('_shared/staged-patch.md'), `${dir}/${file} must cite the contract`);
    assert.match(text, /stale/i, 'must document the staleness case');
    assert.match(text, /Invariant:/, 'must name the description fallback field');
  });
}

test('the fallback procedure heading is stated once — only in the contract', () => {
  const walk = (dir, acc = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, acc);
      else if (e.name.endsWith('.md')) acc.push(full);
    }
    return acc;
  };
  for (const file of walk(SKILLS)) {
    if (file === CONTRACT) continue;
    assert.ok(!/^## Console apply with description fallback$/m.test(fs.readFileSync(file, 'utf8')), `${path.relative(SKILLS, file)} restates the fallback heading`);
  }
});

// ---- Live discrimination probe: the mechanism the contract's prose relies on ----
// Spawn env hardened against a global commit.gpgsign=true or template hook affecting the
// fixture; every spawn (setup and probes) is bounded so a hang fails fast and names itself.
const FIXTURE_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
function gitFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staged-patch-probe-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', timeout: FIXTURE_TIMEOUT_MS, env: FIXTURE_ENV });
  const runOk = (...args) => {
    const r = git(...args);
    assert.equal(r.status, 0, r.stderr);
    return r;
  };
  runOk('init', '-q');
  runOk('config', 'user.email', 'probe@example.invalid');
  runOk('config', 'user.name', 'probe');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'line1\nline2\nline3\n');
  runOk('add', 'a.txt');
  runOk('commit', '-q', '-m', 'base');
  return { dir, git };
}

const PREAMBLE_PATCH = [
  'Target: a.txt',
  'Invariant: the second line reads "line2-fixed"',
  'Finding: medium correctness — example',
  'Staged-at: 0000000',
  '',
  'diff --git a/a.txt b/a.txt',
  '--- a/a.txt',
  '+++ b/a.txt',
  '@@ -1,3 +1,3 @@',
  ' line1',
  '-line2',
  '+line2-fixed',
  ' line3',
  '',
].join('\n');

test('probe: git apply --check accepts a patch carrying the Target:/Invariant: preamble', (t) => {
  const { dir, git } = gitFixture(t);
  fs.writeFileSync(path.join(dir, 'p.patch'), PREAMBLE_PATCH);
  const r = git('apply', '--check', 'p.patch');
  assert.equal(r.status, 0, r.stderr);
});

test('probe: git apply --check rejects a malformed hunk and a description-only file (no diff)', (t) => {
  const { dir, git } = gitFixture(t);
  fs.writeFileSync(path.join(dir, 'bad.patch'), PREAMBLE_PATCH.replace('@@ -1,3 +1,3 @@', '@@ broken @@'));
  const bad = git('apply', '--check', 'bad.patch');
  assert.notEqual(bad.status, 0, 'malformed hunk must be rejected');
  fs.writeFileSync(path.join(dir, 'nodiff.patch'), 'Target: a.txt\nInvariant: something\n');
  const nodiff = git('apply', '--check', 'nodiff.patch');
  assert.notEqual(nodiff.status, 0, 'description-only file must be rejected as a patch');
  assert.match(nodiff.stderr, /No valid patches in input/);
});

test('probe: a patch staged before the target moved is rejected as stale, distinguishable from malformed', (t) => {
  const { dir, git } = gitFixture(t);
  fs.writeFileSync(path.join(dir, 'p.patch'), PREAMBLE_PATCH);
  assert.equal(git('apply', '--check', 'p.patch').status, 0);
  fs.writeFileSync(path.join(dir, 'a.txt'), 'line0\nline1\nlineX\nline2\nline3\n');
  git('commit', '-qam', 'restructure');
  const stale = git('apply', '--check', 'p.patch');
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /patch does not apply/);
});
