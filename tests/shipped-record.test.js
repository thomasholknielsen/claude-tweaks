'use strict';

// The shipped-versions record, and the git topology that made it necessary.
//
// The suite had no case where a first-parent chain leaves the branch it started
// on, which is exactly why #144 shipped undetected: every existing fixture merged
// onto main, and the walk is correct for that shape. The fixture below builds the
// other shape — a branch that merges main INTO itself and is then pushed as main.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { fixtureGit, FIXTURE_TIMEOUT_MS } = require('./helpers/git-fixtures.js');
const { walkedVersions, shippedVersions } = require('../plugin/bin/lib/changelog-git.js');
const { RECORD_PATH, readShippedRecord, recordedVersions, appendShippedVersion } = require('../plugin/bin/lib/shipped-record.js');

function writeManifest(dir, version) {
  const manifestDir = path.join(dir, '.claude-plugin');
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(path.join(manifestDir, 'plugin.json'), JSON.stringify({ name: 'fixture', version }, null, 2));
}

function commitVersion(dir, version, message) {
  writeManifest(dir, version);
  fixtureGit(['-C', dir, 'add', '-A']);
  fixtureGit(['-C', dir, 'commit', '-q', '-m', message]);
}

function writeRecord(dir, lines) {
  fs.mkdirSync(path.join(dir, path.dirname(RECORD_PATH)), { recursive: true });
  fs.writeFileSync(path.join(dir, RECORD_PATH), `# fixture\n${lines.join('\n')}\n`);
}

// main:   A(1.0.0) ── B(1.1.0)
//                        \
// branch:   \── C(1.2.0) ── M   <- M's FIRST parent is C, second is B
//                            \
// main is then moved to M, which is what pushing the branch as main does.
//
// `git rev-list --first-parent M` therefore walks M -> C -> A and never sees B.
// v1.1.0 shipped; the walk says it did not.
function buildInvertedMergeRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-inverted-')));
  fixtureGit(['-C', dir, 'init', '-q', '-b', 'main']);
  fixtureGit(['-C', dir, 'config', 'user.email', 'fixture@example.com']);
  fixtureGit(['-C', dir, 'config', 'user.name', 'Fixture']);

  commitVersion(dir, '1.0.0', 'v1.0.0');
  const forkPoint = fixtureGit(['-C', dir, 'rev-parse', 'HEAD']).toString().trim();

  commitVersion(dir, '1.1.0', 'v1.1.0');

  fixtureGit(['-C', dir, 'checkout', '-q', '-b', 'feature', forkPoint]);
  commitVersion(dir, '1.2.0', 'v1.2.0');

  // The inverting move: main comes to the branch, not the other way round.
  // Both sides bumped the manifest, so this conflicts — as it does in real life,
  // and resolving it by renumbering past main's is exactly the sequence that
  // produced #144.
  try {
    fixtureGit(['-C', dir, 'merge', '--no-ff', '-m', 'Merge main into feature', 'main']);
  } catch {
    /* manifest conflict — resolved just below, same as a real renumber */
  }
  writeManifest(dir, '1.3.0');
  fixtureGit(['-C', dir, 'add', '-A']);
  fixtureGit(['-C', dir, 'commit', '-q', '--no-edit']);

  // ...and the branch becomes main.
  fixtureGit(['-C', dir, 'branch', '-f', 'main', 'HEAD']);
  fixtureGit(['-C', dir, 'checkout', '-q', 'main']);
  return dir;
}

// Building it costs several seconds of git; the three topology tests below all
// want the same shape, and each writes its own record before reading.
let cached = null;
function invertedMergeRepo() {
  if (!cached) cached = buildInvertedMergeRepo();
  return cached;
}

test('the first-parent walk loses a version when a merge inverts', { timeout: FIXTURE_TIMEOUT_MS }, () => {
  const repo = invertedMergeRepo();
  const walked = walkedVersions(repo, 'main');

  // The defect, pinned. If this ever starts including 1.1.0 the walk has been
  // fixed at the source and the record's supplementary role can be revisited.
  assert.ok(walked.includes('1.3.0'), 'the tip version is always visible');
  assert.ok(walked.includes('1.2.0'), "the branch's own history stays on the first-parent chain");
  assert.ok(
    !walked.includes('1.1.0'),
    'v1.1.0 was on main and reached users, but sits on the merge\'s second parent — ' +
      `the walk cannot see it. Walked: ${walked.join(', ')}`,
  );
});

test('the record survives the same topology', { timeout: FIXTURE_TIMEOUT_MS }, () => {
  const repo = invertedMergeRepo();
  writeRecord(repo, ['1.0.0\t2026-01-01\trelease', '1.1.0\t2026-01-02\trelease', '1.2.0\t2026-01-03\trelease', '1.3.0\t2026-01-04\trelease']);

  const shipped = shippedVersions(repo, 'main');
  for (const v of ['1.0.0', '1.1.0', '1.2.0', '1.3.0']) {
    assert.ok(shipped.includes(v), `v${v} shipped but shippedVersions() omitted it: ${shipped.join(', ')}`);
  }
});

test('the walk still adds versions the record is missing', { timeout: FIXTURE_TIMEOUT_MS }, () => {
  const repo = invertedMergeRepo();
  // A release that forgot to append. The union is what catches it — a
  // record-only lookup would report the version as never shipped.
  writeRecord(repo, ['1.0.0\t2026-01-01\trelease']);
  assert.ok(shippedVersions(repo, 'main').includes('1.3.0'), 'walk-visible versions must survive a short record');
});

test('a malformed record line is reported, never silently dropped', () => {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-record-')));
  writeRecord(repo, ['1.0.0\t2026-01-01\trelease', 'this line has no tab', '1.1.0\t2026-01-02\trelease']);

  const record = readShippedRecord(repo);
  assert.deepStrictEqual(record.rows.map((r) => r.version), ['1.0.0', '1.1.0']);
  assert.strictEqual(record.malformed.length, 1);
  assert.strictEqual(record.malformed[0].text, 'this line has no tab');
});

test('a missing record is reported as unreadable, not as an empty history', () => {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-record-')));
  const record = readShippedRecord(repo);
  assert.strictEqual(record.ok, false);
  assert.match(record.reason, /not found/);
  assert.deepStrictEqual(recordedVersions(repo), []);
});

test('appending is idempotent', () => {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-record-')));
  writeRecord(repo, ['1.0.0\t2026-01-01\trelease']);

  assert.strictEqual(appendShippedVersion(repo, '1.1.0', '2026-01-02'), true);
  assert.strictEqual(appendShippedVersion(repo, '1.1.0', '2026-01-02'), false, 're-appending must not duplicate');
  assert.deepStrictEqual(recordedVersions(repo), ['1.0.0', '1.1.0']);
});

test('appending refuses an incomplete row rather than writing a malformed line', () => {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-record-')));
  writeRecord(repo, ['1.0.0\t2026-01-01\trelease']);
  assert.throws(() => appendShippedVersion(repo, '1.1.0', ''), /requires both/);
  assert.deepStrictEqual(readShippedRecord(repo).malformed, []);
});
