'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decideArchive, inScope, shouldAgeTag, encodeArchiveTagSuffix } = require('../../../plugin/bin/lib/reconcile/archive-branches');

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

// #548: encodeArchiveTagSuffix — flat (never contains '/') and injective
// (two distinct branch names never collide), the fix for the D/F ref
// conflict between e.g. archive/build/foo and archive/build/foo/bar.
test('encodeArchiveTagSuffix: never returns a string containing "/"', () => {
  assert.strictEqual(encodeArchiveTagSuffix('build/foo').includes('/'), false);
  assert.strictEqual(encodeArchiveTagSuffix('build/foo/bar').includes('/'), false);
  assert.strictEqual(encodeArchiveTagSuffix('worktree-record-42').includes('/'), false);
  assert.strictEqual(encodeArchiveTagSuffix('build/foo-bar').includes('/'), false);
});
test('encodeArchiveTagSuffix: the reported example does not collide', () => {
  assert.notStrictEqual(encodeArchiveTagSuffix('build/foo'), encodeArchiveTagSuffix('build/foo/bar'));
});
test('encodeArchiveTagSuffix: adversarial pair constructed to collide under naive "/"->"-" substitution does not collide', () => {
  // Naive `branch.replace(/\//g, '-')` maps both of these to the same
  // string ('build-foo-bar') because one input already contains a literal
  // '-' where the other's flattened '/' would land. Percent-encoding only
  // '/' (and '%' itself) keeps '-' untouched entirely, so the two stay
  // distinguishable.
  const a = encodeArchiveTagSuffix('build/foo-bar');
  const b = encodeArchiveTagSuffix('build/foo/bar');
  assert.notStrictEqual(a, b);
  assert.strictEqual(a, 'build%2ffoo-bar');
  assert.strictEqual(b, 'build%2ffoo%2fbar');
});
// A prior fix attempt for this same function ("escape literal '-' as '--',
// then replace '/' with '-'") was itself not injective: a literal '-'
// immediately adjacent to a '/' collapses the run-length information that
// distinguishes the two cases. Caught in review (#548) before shipping —
// pinned here so it can never silently regress.
test('encodeArchiveTagSuffix: a literal "-" immediately adjacent to "/" does not collide (regression for a prior non-injective fix attempt)', () => {
  const a = encodeArchiveTagSuffix('ab-/cd');
  const b = encodeArchiveTagSuffix('ab/-cd');
  assert.notStrictEqual(a, b);
  assert.strictEqual(a, 'ab-%2fcd');
  assert.strictEqual(b, 'ab%2f-cd');
});
test('encodeArchiveTagSuffix: a literal "%2f" substring does not collide with an actual encoded slash', () => {
  assert.notStrictEqual(encodeArchiveTagSuffix('a%2fb'), encodeArchiveTagSuffix('a/b'));
});
test('encodeArchiveTagSuffix: a branch with no "/" or "%" passes through unchanged', () => {
  assert.strictEqual(encodeArchiveTagSuffix('worktree-record-42'), 'worktree-record-42');
});

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { archiveBranches } = require('../../../plugin/bin/lib/reconcile/archive-branches');
const { reconcile, ALL_CHECKS } = require('../../../plugin/bin/lib/reconcile');

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
  assert.match(git(dir, 'tag', '--list', 'archive/build%2faged'), /archive\/build%2faged/);
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
  assert.match(git(dir, 'tag', '--list', 'archive/build%2fveryold'), /archive\/build%2fveryold/); // tag survives — not aged out in the same pass
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
  git(dir, 'tag', `archive/build%2fretry`, tip); // pre-existing lightweight tag, same tip, from an earlier failed pass
  git(dir, 'checkout', 'main');

  const r = archiveBranches({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => null });
  const entry = r.entries.find((e) => e.name === 'build/retry');
  assert.strictEqual(entry.action, 'tag-and-delete');
  assert.notStrictEqual(entry.reason, 'tag-failed');
  assert.strictEqual(git(dir, 'branch', '--list', 'build/retry').trim(), '');
  assert.match(git(dir, 'tag', '--list', 'archive/build%2fretry'), /archive\/build%2fretry/);
});

// #548: the reported D/F-collision scenario. build/foo and build/foo/bar can
// never exist as branches at the same time (git refuses that ref-prefix
// overlap), so the repro archives-then-deletes build/foo first, then creates
// and archives the unrelated build/foo/bar — proving the old unencoded
// scheme's directory/file tag conflict (archive/build/foo would need to
// become a directory to hold archive/build/foo/bar) no longer happens.
test('archiveBranches: build/foo archived-and-deleted, then unrelated build/foo/bar archived — both succeed, two distinct tags, neither tag-failed', () => {
  const dir = makeRepo();
  const old = new Date(Date.now() - 20 * DAY).toISOString();

  git(dir, 'checkout', '-b', 'build/foo');
  fs.writeFileSync(path.join(dir, 'h1.txt'), 'h1\n');
  git(dir, 'add', 'h1.txt');
  execFileSync('git', ['commit', '-m', 'foo'], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, GIT_COMMITTER_DATE: old, GIT_AUTHOR_DATE: old },
  });
  git(dir, 'checkout', 'main');

  const first = archiveBranches({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => null });
  const fooEntry = first.entries.find((e) => e.name === 'build/foo');
  assert.strictEqual(fooEntry.action, 'tag-and-delete');
  assert.notStrictEqual(fooEntry.reason, 'tag-failed');
  assert.strictEqual(git(dir, 'branch', '--list', 'build/foo').trim(), ''); // deleted, so build/foo/bar can now be created

  git(dir, 'checkout', '-b', 'build/foo/bar');
  fs.writeFileSync(path.join(dir, 'h2.txt'), 'h2\n');
  git(dir, 'add', 'h2.txt');
  execFileSync('git', ['commit', '-m', 'foo/bar'], {
    cwd: dir, encoding: 'utf8',
    env: { ...process.env, GIT_COMMITTER_DATE: old, GIT_AUTHOR_DATE: old },
  });
  git(dir, 'checkout', 'main');

  const second = archiveBranches({ cwd: dir, integration: 'main', dryRun: false, resolvePr: () => null });
  const barEntry = second.entries.find((e) => e.name === 'build/foo/bar');
  assert.strictEqual(barEntry.action, 'tag-and-delete'); // never 'skip'/'tag-failed' — the reported D/F conflict
  assert.notStrictEqual(barEntry.reason, 'tag-failed');
  assert.strictEqual(git(dir, 'branch', '--list', 'build/foo/bar').trim(), '');

  // Two distinct, flat tags — neither a directory, both independently listable.
  assert.match(git(dir, 'tag', '--list', 'archive/build%2ffoo'), /archive\/build%2ffoo$/m);
  assert.match(git(dir, 'tag', '--list', 'archive/build%2ffoo%2fbar'), /archive\/build%2ffoo%2fbar/);
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
  const src = fs.readFileSync(path.join(__dirname, '../../../plugin/bin/lib/reconcile/index.js'), 'utf8');
  const iArchive = src.indexOf("checks.includes('archive')");
  const iBranches = src.indexOf("checks.includes('archive-branches')");
  const iReap = src.indexOf("checks.includes('reap')", iArchive);
  assert.ok(iArchive > -1 && iBranches > iArchive && iReap > iBranches, 'dispatch order: archive < archive-branches < reap');
});

test('index: no-remote repo never dispatches archive-branches; result.branches stays null', async () => {
  const dir = makeRepo();
  // no origin remote -> resolveIntegrationBranch fails -> skipped no-remote; that
  // still proves archive-branches never dispatches outside pr-first. Assert the
  // result shape carries the branches slot untouched.
  const r = await reconcile({ cwd: dir, checks: ['archive-branches'] });
  assert.strictEqual(r.branches, null);
});
