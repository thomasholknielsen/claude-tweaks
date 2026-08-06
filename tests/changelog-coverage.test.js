'use strict';

// Gate: every version this plugin ships owes CHANGELOG.md an entry.
//
// Before this existed the release convention covered the version bump and the
// marketplace mirror but never the changelog, and 103 of 145 shipped versions
// had no entry — including whole feature releases. Nothing failed, because
// nothing was looking.
//
// These assert a relationship (manifest <-> changelog <-> git), never a
// specific release's wording, so they don't go stale as content is added.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseChangelogVersions, findHeadingDefects, findCoverageGaps } = require('../bin/lib/changelog.js');
const { historyAvailable, shippedVersions } = require('../bin/lib/changelog-git.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const CHANGELOG_PATH = path.join(REPO_ROOT, 'CHANGELOG.md');
const MANIFEST_PATH = path.join(REPO_ROOT, '.claude-plugin', 'plugin.json');

const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
const manifestVersion = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')).version;

test("the manifest's current version has a CHANGELOG entry", () => {
  const documented = parseChangelogVersions(changelog).map((e) => e.version);
  assert.ok(
    documented.includes(manifestVersion),
    `.claude-plugin/plugin.json is at ${manifestVersion} but CHANGELOG.md has no "## v${manifestVersion} — ..." entry. ` +
      `Add one in the same commit as the bump — see CLAUDE.md's "Releasing (two repos)".`,
  );
});

test('the newest CHANGELOG entry is the version being shipped', () => {
  // Catches an entry appended at the bottom, or under the wrong heading level.
  // Deliberately not a semver-ordering assertion over the whole file: main's
  // tip has genuinely gone backwards (6.24.0 -> 6.23.2, July 2026) when a
  // rollback landed, and the file records what shipped, not what should have.
  const documented = parseChangelogVersions(changelog);
  assert.ok(documented.length > 0, 'CHANGELOG.md has no parseable entries at all');
  assert.strictEqual(
    documented[0].version,
    manifestVersion,
    `The first CHANGELOG entry is v${documented[0].version} but the manifest says ${manifestVersion}. ` +
      'New entries go directly under the "# Changelog" header, newest first.',
  );
});

test('every version heading is parseable and unique', () => {
  const { unparseable, duplicates } = findHeadingDefects(changelog);
  assert.deepStrictEqual(
    unparseable,
    [],
    'These headings look like version headings but the parser cannot read them, so /init silently ' +
      'skips those releases in its upgrade notice. Required shape: "## v1.2.3 — Title".',
  );
  assert.deepStrictEqual(duplicates, [], 'A version is documented more than once');
});

test('every version that shipped on the release branch has a CHANGELOG entry', () => {
  const availability = historyAvailable(REPO_ROOT);
  if (!availability.ok) {
    // Never pass silently on an unreadable history — say which question went
    // unasked. A shallow clone or tarball install cannot answer this one.
    test.skip(`git history unavailable: ${availability.reason}`);
    return;
  }
  const shipped = shippedVersions(REPO_ROOT, availability.ref);
  assert.ok(shipped.length > 0, `no versions reconstructed from ${availability.ref} — the walk itself is broken`);

  const { missing } = findCoverageGaps(shipped, changelog);
  assert.deepStrictEqual(
    missing,
    [],
    `${missing.length} version(s) shipped on ${availability.ref} with no CHANGELOG entry: ${missing.join(', ')}`,
  );
});

test('no CHANGELOG entry names a version that never shipped', () => {
  const availability = historyAvailable(REPO_ROOT);
  if (!availability.ok) {
    test.skip(`git history unavailable: ${availability.reason}`);
    return;
  }
  // An orphan means a version-number collision between concurrent sessions was
  // resolved in the manifest but not in the changelog: the entry kept the number
  // the branch held, and the number a user's `/claude-tweaks:version` reports is
  // a different one. The entry should be renumbered to the version that carried
  // the work. The manifest's own in-flight version is excluded — on a feature
  // branch it legitimately has an entry before it reaches the release branch.
  const shipped = shippedVersions(REPO_ROOT, availability.ref);
  const { orphans } = findCoverageGaps(shipped, changelog);
  assert.deepStrictEqual(
    orphans.filter((v) => v !== manifestVersion),
    [],
    'CHANGELOG entries name versions that never reached the release branch',
  );
});
