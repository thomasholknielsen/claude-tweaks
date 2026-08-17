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

const { parseChangelogVersions, findHeadingDefects, findCoverageGaps } = require('../plugin/bin/lib/changelog.js');
const { historyAvailable, shippedVersions, walkedVersions } = require('../plugin/bin/lib/changelog-git.js');
const { RECORD_PATH, readShippedRecord, recordedVersions } = require('../plugin/bin/lib/shipped-record.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const CHANGELOG_PATH = path.join(REPO_ROOT, 'CHANGELOG.md');
const MANIFEST_PATH = path.join(REPO_ROOT, 'plugin', '.claude-plugin', 'plugin.json');

const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
const manifestVersion = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')).version;

test("the manifest's current version has a CHANGELOG entry", () => {
  const documented = parseChangelogVersions(changelog).map((e) => e.version);
  assert.ok(
    documented.includes(manifestVersion),
    `plugin/.claude-plugin/plugin.json is at ${manifestVersion} but CHANGELOG.md has no "## v${manifestVersion} — ..." entry. ` +
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
  assert.ok(
    shipped.length > 0,
    `no versions resolved from ${RECORD_PATH} or the walk over ${availability.ref} — both sources are broken`,
  );

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
  // the branch held, and the number a user's `/claude-tweaks:help` reports is
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

// --- the shipped-versions record (#144) -------------------------------------
//
// The record is what makes the two checks above answerable at all. A git walk
// cannot answer them: see bin/lib/shipped-record.js's header.

test("the manifest's current version is in the shipped-versions record", () => {
  const recorded = new Set(recordedVersions(REPO_ROOT));
  assert.ok(
    recorded.has(manifestVersion),
    `plugin/.claude-plugin/plugin.json is at ${manifestVersion} but ${RECORD_PATH} has no line for it. ` +
      `Append "${manifestVersion}\t<YYYY-MM-DD>\trelease" in the same commit as the bump — ` +
      `see CLAUDE.md's "Releasing (two repos)". This is the step that keeps the record from ` +
      'drifting back into something that has to be inferred.',
  );
});

test('the shipped-versions record parses cleanly and lists each version once', () => {
  const record = readShippedRecord(REPO_ROOT);
  assert.ok(record.ok, `${RECORD_PATH} is unreadable: ${record.reason}`);
  assert.deepStrictEqual(
    record.malformed,
    [],
    `Lines that are neither a comment nor "version<TAB>date[<TAB>source]". A dropped line ` +
      'understates what shipped, which is the failure direction this record exists to remove.',
  );
  const counts = new Map();
  for (const row of record.rows) counts.set(row.version, (counts.get(row.version) || 0) + 1);
  assert.deepStrictEqual(
    [...counts.entries()].filter(([, n]) => n > 1).map(([v]) => v),
    [],
    'A version is recorded more than once',
  );
});

test('the record accounts for every version the git walk can still see', () => {
  const availability = historyAvailable(REPO_ROOT);
  if (!availability.ok) {
    test.skip(`git history unavailable: ${availability.reason}`);
    return;
  }
  // One-directional by design. The walk losing versions the record holds is the
  // known defect and is fine — that is why the record exists. The walk seeing
  // one the record does NOT hold means a release skipped the append, and the
  // record is short by however many more went the same way unnoticed.
  const recorded = new Set(recordedVersions(REPO_ROOT));
  const unrecorded = walkedVersions(REPO_ROOT, availability.ref).filter((v) => !recorded.has(v));
  assert.deepStrictEqual(
    unrecorded,
    [],
    `${availability.ref} reports these versions but ${RECORD_PATH} does not list them: ` +
      `${unrecorded.join(', ')}. Append them.`,
  );
});
