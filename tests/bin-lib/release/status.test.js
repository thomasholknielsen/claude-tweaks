'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  findBumpCommits, carryingBump, changelogCoverage, releaseStatus,
  formatStatusLine, formatBackfillSection,
} = require('../../../bin/lib/release/status.js');

const manifest = (v) => JSON.stringify({ name: 'claude-tweaks', version: v }, null, 2);

// Fixture history (newest first): B2 bumps 1.2.0, B1 bumps 1.1.0, E edits plugin.json's
// description only, R is the root that introduced version 1.0.0.
// Ancestry table drives merge-base: which merges each bump contains.
function makeDeps({ contains = {}, changelog = '' } = {}) {
  const manifests = { B2: manifest('1.2.0'), B1: manifest('1.1.0'), E: manifest('1.0.0'), R: manifest('1.0.0') };
  const parent = { B2: 'B1', B1: 'E', E: 'R' }; // R has no parent
  // E's parent R has the same version → E is NOT a bump; the description-only edit still
  // appears in the path log, which is exactly why version comparison is required.
  const calls = [];
  const git = (args) => {
    const key = args.join(' ');
    calls.push(key);
    if (key.startsWith('log --format=%H ')) return 'B2\nB1\nE\nR\n';
    let m = /^show (\w+)\^:\.claude-plugin\/plugin\.json$/.exec(key);
    if (m) {
      if (!parent[m[1]]) throw new Error(`fatal: invalid object name '${m[1]}^'`);
      return manifests[parent[m[1]]];
    }
    m = /^show (\w+):\.claude-plugin\/plugin\.json$/.exec(key);
    if (m) return manifests[m[1]];
    m = /^merge-base --is-ancestor (\w+) (\w+)$/.exec(key);
    if (m) {
      if ((contains[m[2]] || []).includes(m[1])) return '';
      throw new Error('exit 1');
    }
    throw new Error(`unexpected git: ${key}`);
  };
  return { deps: { git, readFile: () => changelog }, calls };
}

const CHANGELOG_MISSING_603 = [
  '# Changelog', '',
  '## v1.2.0 — Later work (#700)', '', 'Later work.', '',
  '## v1.1.0 — Statusline fix (#604)', '', 'Statusline fix; also #6030 is a different record.', '',
  '## v1.0.0 — Initial', '', 'Initial.', '',
].join('\n');

test('findBumpCommits keeps only commits whose manifest version differs from the parent', () => {
  const { deps } = makeDeps();
  assert.deepEqual(findBumpCommits(deps, 'main'), [
    { sha: 'B2', version: '1.2.0' },
    { sha: 'B1', version: '1.1.0' },
    { sha: 'R', version: '1.0.0' },
  ]);
});

test('findBumpCommits scopes the log to the ref it was given', () => {
  const { deps, calls } = makeDeps();
  findBumpCommits(deps, 'origin/main');
  assert.ok(calls.includes('log --format=%H origin/main -- .claude-plugin/plugin.json'), calls.join('\n'));
});

test('findBumpCommits rethrows git errors that are not "no parent"', () => {
  const git = () => { throw new Error('fatal: unable to read tree object'); };
  const deps = { git, readFile: () => '' };
  assert.throws(() => findBumpCommits(deps, 'main'), /unable to read tree/);
});

test('carryingBump returns the OLDEST bump that still contains the merge, not the newest', () => {
  // M merged before B1: both B1 and B2 contain it → B1 carried it first.
  const { deps } = makeDeps({ contains: { B2: ['M'], B1: ['M'] } });
  const bumps = findBumpCommits(deps, 'main');
  assert.deepEqual(carryingBump(deps, 'M', bumps), { sha: 'B1', version: '1.1.0' });
});

test('carryingBump returns null when the newest bump does not contain the merge', () => {
  const { deps } = makeDeps({ contains: {} });
  assert.equal(carryingBump(deps, 'M', findBumpCommits(deps, 'main')), null);
});

test('carryingBump returns null with no bumps at all', () => {
  const { deps } = makeDeps();
  assert.equal(carryingBump(deps, 'M', []), null);
});

test('changelogCoverage is digit-boundary safe and reports named vs missing', () => {
  assert.deepEqual(changelogCoverage(CHANGELOG_MISSING_603, '1.1.0', [603, 604]), {
    entryFound: true, named: [604], missing: [603],
  });
  // '#6030' in the v1.1.0 body must not satisfy #603.
  assert.deepEqual(changelogCoverage(CHANGELOG_MISSING_603, '1.1.0', [603]).missing, [603]);
  // Leading direction: '#60' in the body must not satisfy '#603'.
  assert.deepEqual(changelogCoverage('# Changelog\n\n## v1.0.0 — X\n\nfixes #60.\n', '1.0.0', [603]).missing, [603]);
});

test('changelogCoverage with no entry for the version marks every record missing', () => {
  assert.deepEqual(changelogCoverage(CHANGELOG_MISSING_603, '9.9.9', [603, 604]), {
    entryFound: false, named: [], missing: [603, 604],
  });
});

// Spec AC 1: merged, later bump omits #603 → shipped, backfill needed for #603.
test('releaseStatus: already carried, CHANGELOG backfill needed', () => {
  const { deps } = makeDeps({ contains: { B2: ['M'], B1: ['M'] }, changelog: CHANGELOG_MISSING_603 });
  const result = releaseStatus(deps, { ref: 'main', merge: 'M', records: [603, 604] });
  assert.deepEqual(result, {
    shipped: true, version: '1.1.0', bumpCommit: 'B1', entryFound: true, named: [604], missing: [603],
  });
  assert.equal(formatStatusLine(result), 'already carried by v1.1.0 — CHANGELOG backfill needed: #603');
});

// Spec AC 2: no bump after the merge → not shipped.
test('releaseStatus: not yet in a release', () => {
  const { deps } = makeDeps({ contains: {}, changelog: CHANGELOG_MISSING_603 });
  const result = releaseStatus(deps, { ref: 'main', merge: 'M', records: [603, 604] });
  assert.deepEqual(result, { shipped: false });
  assert.equal(formatStatusLine(result), 'not yet in a release — bump pending');
});

// Spec AC 3: every merged record already named → shipped, missing empty.
test('releaseStatus: shipped and every record named — nothing to backfill', () => {
  const { deps } = makeDeps({ contains: { B2: ['M'], B1: ['M'] }, changelog: CHANGELOG_MISSING_603 });
  const result = releaseStatus(deps, { ref: 'main', merge: 'M', records: [604] });
  assert.equal(result.shipped, true);
  assert.deepEqual(result.missing, []);
  assert.equal(formatStatusLine(result), 'already carried by v1.1.0 — every record named in CHANGELOG');
  assert.equal(formatBackfillSection(result, { merge: 'M' }), '');
});

// Spec AC 7 discrimination: an inverted ancestry check (bump-contains-merge read as
// merge-contains-bump) would flip both of these — the fake answers only the (merge, bump)
// argument order, so a swapped call throws and reads as "not shipped".
test('releaseStatus queries ancestry as merge-base --is-ancestor <merge> <bump>, in that order', () => {
  const { deps, calls } = makeDeps({ contains: { B2: ['M'], B1: ['M'] }, changelog: CHANGELOG_MISSING_603 });
  releaseStatus(deps, { ref: 'main', merge: 'M', records: [603] });
  assert.ok(calls.includes('merge-base --is-ancestor M B2'), calls.join('\n'));
  assert.ok(!calls.includes('merge-base --is-ancestor B2 M'), calls.join('\n'));
});

test('releaseStatus validates its inputs', () => {
  const { deps } = makeDeps();
  assert.throws(() => releaseStatus(deps, { merge: '', records: [1] }), /merge commit is required/);
  assert.throws(() => releaseStatus(deps, { merge: 'M', records: [] }), /at least one record number/);
  assert.throws(() => releaseStatus(deps, { merge: 'M', records: ['x'] }), /at least one record number/);
});

test('formatBackfillSection renders the also-carried subsection naming only the missing records', () => {
  const result = { shipped: true, version: '1.1.0', bumpCommit: 'B1', entryFound: true, named: [604], missing: [603, 605] };
  const text = formatBackfillSection(result, { merge: 'f061ad86deadbeef' });
  assert.match(text, /^### also carried in this build\n\n/);
  assert.match(text, /#603, #605/);
  assert.match(text, /`f061ad86`/);
  assert.match(text, /v1\.1\.0/);
  assert.doesNotMatch(text, /#604/);
});
