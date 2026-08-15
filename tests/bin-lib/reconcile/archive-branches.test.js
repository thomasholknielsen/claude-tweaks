'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decideArchive, inScope, shouldAgeTag } = require('../../../bin/lib/reconcile/archive-branches');

const DAY = 24 * 60 * 60 * 1000;

// AC4: cherry-equivalent branch, no PR or closed PR -> delete (no tag)
test('decideArchive: cherry-equivalent + no PR -> delete', () => {
  const r = decideArchive({ branch: 'build/x', tipAgeDays: 2, cherryEquivalent: true, prState: null });
  assert.strictEqual(r.action, 'delete');
});
test('decideArchive: cherry-equivalent + closed PR -> delete', () => {
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 2, cherryEquivalent: true, prState: { number: 3, state: 'CLOSED' } }).action, 'delete');
});
test('decideArchive: cherry-equivalent + merged PR -> delete', () => {
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 2, cherryEquivalent: true, prState: { number: 3, state: 'MERGED' } }).action, 'delete');
});

// AC4: any OPEN PR -> skip, cherry-equivalent or not
test('decideArchive: open PR -> skip, even when cherry-equivalent', () => {
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 30, cherryEquivalent: true, prState: { number: 3, state: 'OPEN' } }).action, 'skip');
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 30, cherryEquivalent: false, prState: { number: 3, state: 'OPEN' } }).action, 'skip');
});

// AC4: genuinely unmerged, aged, no-pr / pr-closed-unmerged -> tag-and-delete
test('decideArchive: unmerged 15-day-old + closed-unmerged PR -> tag-and-delete', () => {
  const r = decideArchive({ branch: 'build/x', tipAgeDays: 15, cherryEquivalent: false, prState: { number: 3, state: 'CLOSED' } });
  assert.strictEqual(r.action, 'tag-and-delete');
});
test('decideArchive: unmerged 15-day-old + no PR -> tag-and-delete', () => {
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 15, cherryEquivalent: false, prState: null }).action, 'tag-and-delete');
});
test('decideArchive: unmerged 13-day-old -> skip (too young)', () => {
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 13, cherryEquivalent: false, prState: null }).action, 'skip');
});

// Fail closed on unknown PR state
test('decideArchive: transport failures -> skip', () => {
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 30, cherryEquivalent: true, prState: 'gh-absent' }).action, 'skip');
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 30, cherryEquivalent: false, prState: 'network-failure' }).action, 'skip');
});
test('decideArchive: unmerged + merged PR (rebased remnant) -> skip', () => {
  assert.strictEqual(decideArchive({ branch: 'build/x', tipAgeDays: 30, cherryEquivalent: false, prState: { number: 3, state: 'MERGED' } }).action, 'skip');
});

// AC4 scope guard: namespaces + worktree attachment
test('inScope: only build/*, worktree-*, demo/* namespaces', () => {
  assert.strictEqual(inScope('build/x', []), true);
  assert.strictEqual(inScope('worktree-record-42', []), true);
  assert.strictEqual(inScope('demo/y', []), true);
  assert.strictEqual(inScope('main', []), false);
  assert.strictEqual(inScope('feature/z', []), false);
  assert.strictEqual(inScope('flow/spec-1-2', []), false);
});
test('inScope: branch attached to a worktree is out of scope', () => {
  const wts = [{ path: '/w/a', branch: 'build/x' }];
  assert.strictEqual(inScope('build/x', wts), false);
  assert.strictEqual(inScope('build/y', wts), true);
});

// AC5: tag aging on committer date, 90-day threshold
test('shouldAgeTag: 91 days old -> true, 89 days -> false', () => {
  const now = Date.parse('2026-08-16T00:00:00Z');
  assert.strictEqual(shouldAgeTag(new Date(now - 91 * DAY).toISOString(), now), true);
  assert.strictEqual(shouldAgeTag(new Date(now - 89 * DAY).toISOString(), now), false);
});
test('shouldAgeTag: unparseable date -> false (fail closed)', () => {
  assert.strictEqual(shouldAgeTag('not-a-date', Date.now()), false);
});

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { archiveBranches } = require('../../../bin/lib/reconcile/archive-branches');
const { reconcile, ALL_CHECKS } = require('../../../bin/lib/reconcile');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-branches-'));
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-m', 'init');
  return dir;
}

test('archiveBranches: cherry-equivalent build/* branch is deleted; out-of-namespace branch untouched (dry-run reports, real run mutates)', () => {
  const dir = makeRepo();
  // cherry-equivalent branch: same patch as main's next commit
  git(dir, 'checkout', '-b', 'build/eq');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
  git(dir, 'add', 'b.txt');
  git(dir, 'commit', '-m', 'change');
  git(dir, 'checkout', 'main');
  git(dir, 'cherry-pick', 'build/eq');
  // out-of-namespace branch with the same shape
  git(dir, 'branch', 'feature/keep', 'build/eq');

  const dry = archiveBranches({ cwd: dir, integration: 'main', dryRun: true, resolvePr: () => null });
  const dryEq = dry.entries.find((e) => e.name === 'build/eq');
  assert.strictEqual(dryEq.action, 'delete');
  assert.match(git(dir, 'branch', '--list', 'build/eq'), /build\/eq/); // dry-run did not mutate

  const real = archiveBranches({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => null });
  const realEq = real.entries.find((e) => e.name === 'build/eq');
  assert.strictEqual(realEq.action, 'delete');
  assert.strictEqual(git(dir, 'branch', '--list', 'build/eq').trim(), ''); // gone
  assert.match(git(dir, 'branch', '--list', 'feature/keep'), /feature\/keep/); // out of scope, untouched
});

test('archiveBranches: unmerged aged branch gets archive tag then delete; young branch skipped', () => {
  const dir = makeRepo();
  const old = new Date(Date.now() - 20 * DAY).toISOString();
  git(dir, 'checkout', '-b', 'build/aged');
  fs.writeFileSync(path.join(dir, 'c.txt'), 'c\n');
  git(dir, 'add', 'c.txt');
  execFileSync('git', ['commit', '-m', 'aged'], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, GIT_COMMITTER_DATE: old, GIT_AUTHOR_DATE: old },
  });
  git(dir, 'checkout', 'main');
  git(dir, 'checkout', '-b', 'build/young');
  fs.writeFileSync(path.join(dir, 'd.txt'), 'd\n');
  git(dir, 'add', 'd.txt');
  git(dir, 'commit', '-m', 'young');
  git(dir, 'checkout', 'main');

  const r = archiveBranches({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => null });
  assert.strictEqual(r.entries.find((e) => e.name === 'build/aged').action, 'tag-and-delete');
  assert.strictEqual(r.entries.find((e) => e.name === 'build/young').action, 'skip');
  assert.match(git(dir, 'tag', '--list', 'archive/build/aged'), /archive\/build\/aged/);
  assert.strictEqual(git(dir, 'branch', '--list', 'build/aged').trim(), '');
  assert.match(git(dir, 'branch', '--list', 'build/young'), /build\/young/);
});

test('archiveBranches: same-pass survival — 120-day-old tip gets tagged AND the tag survives the same pass (annotated tag ages from taggerdate, not the old commit date)', () => {
  const dir = makeRepo();
  const ancient = new Date(Date.now() - 120 * DAY).toISOString();
  git(dir, 'checkout', '-b', 'build/veryold');
  fs.writeFileSync(path.join(dir, 'f.txt'), 'f\n');
  git(dir, 'add', 'f.txt');
  execFileSync('git', ['commit', '-m', 'very old'], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, GIT_COMMITTER_DATE: ancient, GIT_AUTHOR_DATE: ancient },
  });
  git(dir, 'checkout', 'main');

  const r = archiveBranches({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => null });
  const entry = r.entries.find((e) => e.name === 'build/veryold');
  assert.strictEqual(entry.action, 'tag-and-delete');
  assert.strictEqual(git(dir, 'branch', '--list', 'build/veryold').trim(), ''); // branch gone
  assert.match(git(dir, 'tag', '--list', 'archive/build/veryold'), /archive\/build\/veryold/); // tag survives — not aged out in the same pass
});

test('archiveBranches: retry idempotency — a pre-existing lightweight archive tag from an earlier failed pass is force-replaced, not a dead end', () => {
  const dir = makeRepo();
  const old = new Date(Date.now() - 20 * DAY).toISOString();
  git(dir, 'checkout', '-b', 'build/retry');
  fs.writeFileSync(path.join(dir, 'g.txt'), 'g\n');
  git(dir, 'add', 'g.txt');
  execFileSync('git', ['commit', '-m', 'retry'], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, GIT_COMMITTER_DATE: old, GIT_AUTHOR_DATE: old },
  });
  const tip = git(dir, 'rev-parse', 'build/retry').trim();
  git(dir, 'tag', `archive/build/retry`, tip); // pre-existing lightweight tag, same tip, from an earlier failed pass
  git(dir, 'checkout', 'main');

  const r = archiveBranches({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => null });
  const entry = r.entries.find((e) => e.name === 'build/retry');
  assert.strictEqual(entry.action, 'tag-and-delete');
  assert.notStrictEqual(entry.reason, 'tag-failed');
  assert.strictEqual(git(dir, 'branch', '--list', 'build/retry').trim(), '');
  assert.match(git(dir, 'tag', '--list', 'archive/build/retry'), /archive\/build\/retry/);
});

test('archiveBranches: archive/* tag older than 90 days is deleted, younger kept', () => {
  const dir = makeRepo();
  const ancient = new Date(Date.now() - 91 * DAY).toISOString();
  git(dir, 'checkout', '-b', 'build/tagsrc');
  fs.writeFileSync(path.join(dir, 'e.txt'), 'e\n');
  git(dir, 'add', 'e.txt');
  execFileSync('git', ['commit', '-m', 'ancient'], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, GIT_COMMITTER_DATE: ancient, GIT_AUTHOR_DATE: ancient },
  });
  git(dir, 'tag', 'archive/old-tag');
  git(dir, 'checkout', 'main');
  git(dir, 'branch', '-D', 'build/tagsrc');
  git(dir, 'tag', 'archive/fresh-tag'); // points at main's tip (fresh committer date)

  const r = archiveBranches({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => null });
  assert.strictEqual(r.entries.find((e) => e.name === 'archive/old-tag' && e.kind === 'tag').action, 'aged-out');
  assert.strictEqual(git(dir, 'tag', '--list', 'archive/old-tag').trim(), '');
  assert.match(git(dir, 'tag', '--list', 'archive/fresh-tag'), /archive\/fresh-tag/);
});

// AC6: index wiring
test("index: ALL_CHECKS includes 'archive-branches'; dispatch sits between 'archive' and 'reap'; result gains branches slot", () => {
  assert.ok(ALL_CHECKS.includes('archive-branches'));
  const src = fs.readFileSync(path.join(__dirname, '../../../bin/lib/reconcile/index.js'), 'utf8');
  const iArchive = src.indexOf("checks.includes('archive')");
  const iBranches = src.indexOf("checks.includes('archive-branches')");
  const iReap = src.indexOf("checks.includes('reap')", iArchive);
  assert.ok(iArchive > -1 && iBranches > iArchive && iReap > iBranches, 'dispatch order: archive < archive-branches < reap');
});

test('index: no-remote repo never dispatches archive-branches; result.branches stays null', () => {
  const dir = makeRepo();
  // no origin remote -> resolveIntegrationBranch fails -> skipped no-remote; that
  // still proves archive-branches never dispatches outside pr-first. Assert the
  // result shape carries the branches slot untouched.
  const r = reconcile({ cwd: dir, checks: ['archive-branches'] });
  assert.strictEqual(r.branches, null);
});
