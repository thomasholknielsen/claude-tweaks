'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  iterBumpCommits, findBumpCommits, carryingBump, changelogCoverage, releaseStatus,
  formatStatusLine, formatBackfillSection,
} = require('../../../plugin/bin/lib/release/status.js');

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
    if (key.startsWith('cat-file -e ')) return '';
    if (key.startsWith('log --format=%H ')) return 'B2\nB1\nE\nR\n';
    let m = /^show (\w+)\^:plugin\/\.claude-plugin\/plugin\.json$/.exec(key);
    if (m) {
      if (!parent[m[1]]) throw new Error(`fatal: invalid object name '${m[1]}^'`);
      return manifests[parent[m[1]]];
    }
    m = /^show (\w+):plugin\/\.claude-plugin\/plugin\.json$/.exec(key);
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

test('findBumpCommits scopes the log to the ref it was given, topologically ordered', () => {
  const { deps, calls } = makeDeps();
  findBumpCommits(deps, 'origin/main');
  assert.ok(calls.includes('log --format=%H --topo-order origin/main -- plugin/.claude-plugin/plugin.json .claude-plugin/plugin.json'), calls.join('\n'));
});

test('findBumpCommits rethrows git errors that are not "no parent"', () => {
  const git = (args) => {
    if (args.join(' ').startsWith('cat-file -e ')) return '';
    throw new Error('fatal: unable to read tree object');
  };
  const deps = { git, readFile: () => '' };
  assert.throws(() => findBumpCommits(deps, 'main'), /unable to read tree/);
});

test('findBumpCommits hard-fails when the ref has no plugin manifest at all', () => {
  const git = (args) => { if (args.join(' ').startsWith('cat-file -e ')) throw new Error("fatal: path 'plugin/.claude-plugin/plugin.json' does not exist in 'main'"); throw new Error('unreachable'); };
  const deps = { git, readFile: () => '' };
  assert.throws(() => findBumpCommits(deps, 'main'), /no plugin manifest at main/);
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

test('changelogCoverage treats range notation (#A-#B, #A-B) as naming every member number', () => {
  const changelog = [
    '# Changelog', '',
    '## v6.89.0 — Refine (#620-#625) and kernel (#528-530)', '', 'Refine work and kernel bookkeeping.', '',
  ].join('\n');
  const result = changelogCoverage(changelog, '6.89.0', [620, 623, 625, 528, 530, 529, 626, 527]);
  assert.deepEqual(result.named.sort((a, b) => a - b), [528, 529, 530, 620, 623, 625]);
  assert.deepEqual(result.missing.sort((a, b) => a - b), [527, 626]);
});

test('changelogCoverage range notation stays digit-boundary safe', () => {
  const changelog = [
    '# Changelog', '',
    '## v6.89.0 — Refine (#620-#625); also #6030 is unrelated', '', 'Body.', '',
  ].join('\n');
  assert.deepEqual(changelogCoverage(changelog, '6.89.0', [603]).missing, [603]);
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

// R1(b): defensive boundary check for non-CLI callers — a leading `-` would otherwise
// reach git as a bare positional and be parsed as an option.
test('releaseStatus rejects a --merge or --ref value that starts with "-"', () => {
  const { deps } = makeDeps();
  assert.throws(() => releaseStatus(deps, { merge: '-x', records: [1] }), /must not start with "-"/);
  assert.throws(() => releaseStatus(deps, { merge: 'M', ref: '-x', records: [1] }), /must not start with "-"/);
});

// R3: a real git failure (exit 128, invalid commit name) must not be swallowed the same
// way as the benign exit-1 "not an ancestor" case.
test('releaseStatus rethrows a genuine merge-base failure instead of reading it as "not an ancestor"', () => {
  const { deps } = makeDeps({ contains: { B2: ['M'], B1: ['M'] } });
  const badGit = (args) => {
    if (args.join(' ').startsWith('merge-base --is-ancestor')) {
      throw Object.assign(new Error('fatal: Not a valid commit name'), { status: 128 });
    }
    return deps.git(args);
  };
  assert.throws(
    () => releaseStatus({ ...deps, git: badGit }, { ref: 'main', merge: 'M', records: [603] }),
    /could not check ancestry of M in B2/,
  );
});

test('releaseStatus still reports not-shipped for a bare exit-1 ancestry failure (no .status)', () => {
  const { deps } = makeDeps({ contains: {} });
  const result = releaseStatus(deps, { ref: 'main', merge: 'M', records: [603] });
  assert.deepEqual(result, { shipped: false });
});

// R4: the primary manifest read (not just the parent-lookup one) gets commit context on failure.
test('iterBumpCommits wraps a malformed primary manifest with the commit it failed on', () => {
  const git = (args) => {
    const key = args.join(' ');
    if (key.startsWith('cat-file -e ')) return '';
    if (key.startsWith('log --format=%H ')) return 'X\n';
    if (key === 'show X:plugin/.claude-plugin/plugin.json') return 'not-json';
    throw new Error(`unexpected git: ${key}`);
  };
  const deps = { git, readFile: () => '' };
  assert.throws(() => findBumpCommits(deps, 'main'), /could not read X's manifest/);
});

// R5: the `cat-file -e` catch must distinguish "bad ref" from "genuinely missing manifest".
test('iterBumpCommits reports a bad ref as "could not resolve", not "no plugin manifest"', () => {
  const git = (args) => {
    if (args.join(' ').startsWith('cat-file -e ')) {
      throw new Error("fatal: invalid object name 'bogus'.");
    }
    throw new Error('unreachable');
  };
  const deps = { git, readFile: () => '' };
  assert.throws(() => findBumpCommits(deps, 'bogus'), /could not resolve bogus/);
});

test('iterBumpCommits still reports "no plugin manifest" for a genuinely missing path at a valid ref', () => {
  const git = (args) => {
    if (args.join(' ').startsWith('cat-file -e ')) {
      throw new Error("fatal: path 'plugin/.claude-plugin/plugin.json' does not exist in 'HEAD'");
    }
    throw new Error('unreachable');
  };
  const deps = { git, readFile: () => '' };
  assert.throws(() => findBumpCommits(deps, 'HEAD'), /no plugin manifest at HEAD/);
});

test('formatBackfillSection renders the also-carried subsection naming only the missing records', () => {
  const result = { shipped: true, version: '1.1.0', bumpCommit: 'B1', entryFound: true, named: [604], missing: [603, 605] };
  const text = formatBackfillSection(result, { merge: 'f061ad86deadbeef' });
  assert.match(text, /^### also carried in this build\n\n/);
  assert.match(text, /#603, #605/);
  assert.match(text, /`f061ad86`/);
  assert.match(text, /v1\.1\.0/);
  assert.doesNotMatch(text, /#604/);
  assert.doesNotMatch(text, /Detected by/, 'the tooling-meta sentence must be dropped');
});

test('formatStatusLine: entryFound false means the version has no CHANGELOG entry at all', () => {
  const result = { shipped: true, version: '1.1.0', bumpCommit: 'B1', entryFound: false, named: [], missing: [603, 604] };
  assert.equal(
    formatStatusLine(result),
    'already carried by v1.1.0 — CHANGELOG has no v1.1.0 entry; backfill needed: #603, #604',
  );
});

test('carryingBump walks iterBumpCommits lazily — never reads manifests past the break', () => {
  // C4 (newest, 1.4.0) -> C3 (1.3.0) -> C2 (1.2.0) -> C1 (root, 1.1.0). M is an ancestor of
  // C4 only, so carryingBump must stop after testing C3 and never touch C2 or C1's manifests.
  const manifests = { C4: manifest('1.4.0'), C3: manifest('1.3.0'), C2: manifest('1.2.0'), C1: manifest('1.1.0') };
  const parent = { C4: 'C3', C3: 'C2', C2: 'C1' }; // C1 is root
  const testedShas = new Set();
  const git = (args) => {
    const key = args.join(' ');
    if (key.startsWith('cat-file -e ')) return '';
    if (key.startsWith('log --format=%H ')) return 'C4\nC3\nC2\nC1\n';
    let m = /^show (\w+)\^:plugin\/\.claude-plugin\/plugin\.json$/.exec(key);
    if (m) {
      testedShas.add(m[1]);
      if (!parent[m[1]]) throw new Error(`fatal: invalid object name '${m[1]}^'`);
      return manifests[parent[m[1]]];
    }
    m = /^show (\w+):plugin\/\.claude-plugin\/plugin\.json$/.exec(key);
    if (m) { testedShas.add(m[1]); return manifests[m[1]]; }
    m = /^merge-base --is-ancestor (\w+) (\w+)$/.exec(key);
    if (m) {
      if (m[2] === 'C4') return '';
      throw new Error('exit 1');
    }
    throw new Error(`unexpected git: ${key}`);
  };
  const deps = { git, readFile: () => '' };
  const bump = carryingBump(deps, 'M', iterBumpCommits(deps, 'main'));
  assert.deepEqual(bump, { sha: 'C4', version: '1.4.0' });
  assert.deepEqual([...testedShas].sort(), ['C3', 'C4'], 'must never read C2 or C1\'s manifest after the break');
});
