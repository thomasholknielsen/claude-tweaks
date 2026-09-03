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
const { execFileSync } = require('node:child_process');

const { parseChangelogVersions, findHeadingDefects, findCoverageGaps } = require('../plugin/bin/lib/changelog.js');
const { historyAvailable, shippedVersions, shippedVersionRuns, walkedVersions } = require('../plugin/bin/lib/changelog-git.js');
const { RECORD_PATH, readShippedRecord, recordedVersions } = require('../plugin/bin/lib/shipped-record.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const CHANGELOG_PATH = path.join(REPO_ROOT, 'CHANGELOG.md');
const MANIFEST_PATH = path.join(REPO_ROOT, 'plugin', '.claude-plugin', 'plugin.json');

const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
const manifestVersion = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')).version;

// Versions introduced on `ref`'s first-parent chain after this branch's base
// (#1373). A branch created before a later release cannot carry that release's
// CHANGELOG.md/docs/shipped-versions.tsv lines, and its own diff never touched
// them — so the ref-comparing tests below excuse those versions as diagnostics,
// not failures; they are caught for real when the branch rebases or merges.
// When `headRef` already contains the ref's tip (main, or a caught-up branch),
// the merge base IS the tip and this returns [] — the strict path, unchanged.
const staleCache = new Map();
// Shared by staleWalkedVersions and its test's parent-resolvability probe below.
function gitQuiet(args) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'], // keep `fatal: …` off the test run's stderr on the fail-strict path
  }).trim();
}
function staleWalkedVersions(ref, headRef = 'HEAD') {
  const key = `${headRef}:${ref}`;
  if (staleCache.has(key)) return staleCache.get(key);
  let stale;
  try {
    const base = gitQuiet(['merge-base', '--end-of-options', headRef, ref]);
    const tip = gitQuiet(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]);
    if (base === tip) {
      stale = [];
    } else {
      const visibleAtBase = new Set(walkedVersions(REPO_ROOT, base));
      stale = walkedVersions(REPO_ROOT, ref).filter((v) => !visibleAtBase.has(v));
    }
  } catch {
    // No resolvable merge base (unrelated histories, bad ref): excuse nothing —
    // fail-strict is the safe direction for a coverage gate.
    stale = [];
  }
  staleCache.set(key, stale);
  return stale;
}

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

test('every version that shipped on the release branch has a CHANGELOG entry', (t) => {
  const availability = historyAvailable(REPO_ROOT);
  if (!availability.ok) {
    // Never pass silently on an unreadable history — say which question went
    // unasked. A shallow clone or tarball install cannot answer this one.
    t.skip(`git history unavailable: ${availability.reason}`);
    return;
  }
  const shipped = shippedVersions(REPO_ROOT, availability.ref);
  assert.ok(
    shipped.length > 0,
    `no versions resolved from ${RECORD_PATH} or the walk over ${availability.ref} — both sources are broken`,
  );

  const { missing } = findCoverageGaps(shipped, changelog);
  // Excuse only versions the branch demonstrably does NOT know about: a version
  // this branch's own docs/shipped-versions.tsv already lists breaks the "cannot
  // carry them" premise, so it stays a hard failure even when it postdates the base.
  const recorded = new Set(recordedVersions(REPO_ROOT));
  const stale = new Set(staleWalkedVersions(availability.ref));
  const basePredates = missing.filter((v) => stale.has(v) && !recorded.has(v));
  const missingHere = missing.filter((v) => !stale.has(v) || recorded.has(v));
  if (basePredates.length > 0) {
    t.diagnostic(
      `${basePredates.length} version(s) shipped on ${availability.ref} after this branch's base ` +
        `(${basePredates.join(', ')}) — not this branch's omission; caught on rebase/merge (#1373)`,
    );
  }
  assert.deepStrictEqual(
    missingHere,
    [],
    `${missingHere.length} version(s) shipped on ${availability.ref} with no CHANGELOG entry: ${missingHere.join(', ')}`,
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

test('the record accounts for every version the git walk can still see', (t) => {
  const availability = historyAvailable(REPO_ROOT);
  if (!availability.ok) {
    t.skip(`git history unavailable: ${availability.reason}`);
    return;
  }
  // One-directional by design. The walk losing versions the record holds is the
  // known defect and is fine — that is why the record exists. The walk seeing
  // one the record does NOT hold means a release skipped the append, and the
  // record is short by however many more went the same way unnoticed.
  const recorded = new Set(recordedVersions(REPO_ROOT));
  const notInRecord = walkedVersions(REPO_ROOT, availability.ref).filter((v) => !recorded.has(v));
  const stale = new Set(staleWalkedVersions(availability.ref));
  const basePredates = notInRecord.filter((v) => stale.has(v));
  const unrecorded = notInRecord.filter((v) => !stale.has(v));
  if (basePredates.length > 0) {
    t.diagnostic(
      `${basePredates.length} version(s) on ${availability.ref} postdate this branch's base ` +
        `(${basePredates.join(', ')}) — not this branch's omission; caught on rebase/merge (#1373)`,
    );
  }
  assert.deepStrictEqual(
    unrecorded,
    [],
    `${availability.ref} reports these versions but ${RECORD_PATH} does not list them: ` +
      `${unrecorded.join(', ')}. Append them.`,
  );
});

// --- stale-branch recognition (#1373) ----------------------------------------
//
// A worktree branch created before a later main release cannot carry that
// release's CHANGELOG/record lines, and its own diff never touched them. The
// two ref-comparing tests above excuse exactly those versions (as diagnostics,
// not failures); this test proves the recognition actually discriminates,
// deterministically, from real history.

test('stale-branch recognition discriminates by branch base', (t) => {
  const availability = historyAvailable(REPO_ROOT);
  if (!availability.ok) {
    t.skip(`git history unavailable: ${availability.reason}`);
    return;
  }
  // From a head that already contains the ref's tip, nothing is stale — the
  // strict path is unchanged. (The ref itself is the degenerate such head.)
  assert.deepStrictEqual(
    staleWalkedVersions(availability.ref, availability.ref),
    [],
    'a head at the ref tip must excuse nothing',
  );

  // Pick the newest run whose version appears for the FIRST time in that run
  // (a rollback re-ship like 6.24.0 appears in two runs; its later run would
  // be visible at the base via the earlier one and must not be the probe).
  const runs = shippedVersionRuns(REPO_ROOT, availability.ref);
  const seen = new Set();
  let candidate = null;
  for (const run of runs) {
    if (!seen.has(run.version)) candidate = run;
    seen.add(run.version);
  }
  if (!candidate || runs.length < 2) {
    t.skip('walk sees too little history to probe discrimination');
    return;
  }
  const introducing = candidate.commits[0].hash;
  // staleWalkedVersions never throws (its internal catch returns [] — fail-strict),
  // so probe the parent's resolvability explicitly: a root/shallow-cutoff commit
  // must skip, not surface as a misleading "got: (none)" assertion failure.
  try {
    gitQuiet(['rev-parse', '--verify', '--end-of-options', `${introducing}~1^{commit}`]);
  } catch {
    t.skip(`no parent commit for ${introducing} — cannot probe`);
    return;
  }
  const stale = staleWalkedVersions(availability.ref, `${introducing}~1`);
  assert.ok(
    stale.includes(candidate.version),
    `expected ${candidate.version} (introduced by ${introducing}) to be stale ` +
      `from ${introducing}~1; got: ${stale.join(', ') || '(none)'}`,
  );
});
