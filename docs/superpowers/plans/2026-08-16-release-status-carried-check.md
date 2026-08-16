# Release Status "Which Release Carried This" Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a pr-first merge, tell the operator whether the merge commit already sits inside a shipped version bump — and if it does, which records that version's CHANGELOG entry fails to name — so the "also carried in this build" backfill is staged automatically instead of discovered by a human.

**Architecture:** A pure module `bin/lib/release/status.js` (injectable `git` runner, same style as `precheck.js`) computes the answer from three git facts: the version-bump commits reachable from a ref (commits that changed `.claude-plugin/plugin.json#version`), whether the merge commit is an ancestor of each bump (walk newest→oldest, the *oldest* bump that still contains the merge is the carrying release), and which `#N` record tokens the carrying version's CHANGELOG entry names. `bin/release.js` gains a `status` subcommand wrapping it (`--json` / human line / `--backfill` section text). `_shared/pr-first-merge.md` Step 4 invokes it after reconcile and, on the "already carried" outcome, stages the backfill paragraph as a Review Console row — never editing `CHANGELOG.md` directly. `/flow`'s closing report carries the one-line human form.

**Tech Stack:** Node 18+ (no deps), `node --test`, git CLI via `execFileSync`; existing `bin/lib/changelog.js` (`parseChangelogVersions`).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T225409-spec-678-680-681-682-683-679/spec-678/work/678-spec.md` (record #678)

## Global Constraints

- The subcommand never calls `gh` and never guesses record numbers — `--records` is required and explicit (spec AC 4; must work under `local-merge`).
- `pr-first-merge.md` Step 4 forbids `git merge`/`commit`/`push` in the main checkout — the staged backfill row is *applied* later via a worktree PR, never inline (spec Gotchas).
- Skill files stay under the 40 KB per-file ceiling (`tests/bin-lib/skill-audit/context-cost.test.js`); `pr-first-merge.md` is 26 KB, `flow/summary-template.md` 4.6 KB.
- Commit messages: `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes; reference the record as `refs #678` — never `closes`/`fixes` (the bundle PR carries the closing keywords).
- Every git command in the module goes through `deps.git(argsArray)`; a non-zero exit throws (matches `execFileSync`), so "not an ancestor" is a caught throw, exactly as `run.js` already treats `merge-base --is-ancestor`.
- Verified live before authoring (read-only): `git log --format=%H origin/main -- .claude-plugin/plugin.json` lists bump commits newest-first (`5ce2a6e5` v6.88.0, `5cf3b26c` v6.87.1, `bed651df` v6.87.0); `git show 5cf3b26c^:.claude-plugin/plugin.json` returns the parent manifest (`6.87.0`); `git merge-base --is-ancestor f061ad86 5cf3b26c` exits 0 and `... bed651df` exits 1 — the #603 incident the spec cites.

---

### Task 1: `status.js` — the pure release-status module

**Files:**
- Create: `bin/lib/release/status.js`
- Test: `tests/bin-lib/release/status.test.js`

**Interfaces:**
- Consumes: `parseChangelogVersions(changelogText)` from `bin/lib/changelog.js` (returns `[{version, title, body}]`).
- Produces (used by Task 2 and Task 3's prose):
  - `findBumpCommits(deps, ref) → [{ sha, version }]` newest-first — every commit in `git log --format=%H <ref> -- .claude-plugin/plugin.json` whose manifest `version` differs from its first parent's (a parentless root commit that has a version counts as a bump).
  - `carryingBump(deps, mergeSha, bumps) → { sha, version } | null` — walks `bumps` newest→oldest via `git merge-base --is-ancestor <mergeSha> <bump.sha>`; returns the *oldest* bump that still contains the merge (the release that first carried it); `null` when the newest bump does not contain the merge (or there are no bumps).
  - `changelogCoverage(changelogText, version, records) → { entryFound: boolean, named: number[], missing: number[] }` — matches `#N` tokens (digit-boundary-safe: `#60` does not match `#603`) in the entry's `title + body`; when no entry exists for `version`, `entryFound: false` and every record is missing.
  - `releaseStatus(deps, { ref = 'HEAD', merge, records }) → { shipped: false } | { shipped: true, version, bumpCommit, entryFound, named, missing }` — the composed answer. Throws `Error` when `merge` is empty or `records` is not a non-empty array of positive integers.
  - `formatStatusLine(result) → string` — `not yet in a release — bump pending` / `already carried by v{version} — CHANGELOG backfill needed: #A, #B` / `already carried by v{version} — every record named in CHANGELOG`.
  - `formatBackfillSection(result, { merge }) → string` — the `### also carried in this build` paragraph per `docs/releasing.md`'s convention (see Step 3 for the exact text). Returns `''` when nothing is missing.
  - `deps` shape: `{ git: (args: string[]) => string, readFile: (relPath: string) => string }` — `readFile('CHANGELOG.md')` supplies the changelog text; the CLI (Task 2) reads it via `git show <ref>:CHANGELOG.md` so the check reflects the ref, not the working tree.

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/release/status.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/bin-lib/release/status.test.js`
Expected: FAIL — `Cannot find module '../../../bin/lib/release/status.js'`.

- [ ] **Step 3: Write the module**

Create `bin/lib/release/status.js`:

```js
'use strict';
const { parseChangelogVersions } = require('../changelog.js');

const MANIFEST = '.claude-plugin/plugin.json';
const CHANGELOG = 'CHANGELOG.md';

function manifestVersionAt(deps, spec) {
  return JSON.parse(deps.git(['show', `${spec}:${MANIFEST}`])).version;
}

// ref -> every commit reachable from it that changed the manifest's `version`,
// newest first. A manifest edit that leaves `version` alone (description, keywords)
// shows up in the path log but is not a bump — hence the parent comparison. A root
// commit (no parent) that carries a version counts as the first bump.
function findBumpCommits(deps, ref) {
  const shas = deps.git(['log', '--format=%H', ref, '--', MANIFEST]).split('\n').map((s) => s.trim()).filter(Boolean);
  const bumps = [];
  for (const sha of shas) {
    const version = manifestVersionAt(deps, sha);
    let parentVersion = null;
    try {
      parentVersion = manifestVersionAt(deps, `${sha}^`);
    } catch {
      parentVersion = null; // root commit — nothing to compare against
    }
    if (version !== parentVersion) bumps.push({ sha, version });
  }
  return bumps;
}

function isAncestor(deps, ancestor, descendant) {
  try {
    deps.git(['merge-base', '--is-ancestor', ancestor, descendant]);
    return true;
  } catch {
    return false; // non-zero exit = not an ancestor
  }
}

// The release that first carried the merge: walk newest -> oldest and keep the last
// bump that still contains it. Newest-not-containing means the merge is unshipped.
function carryingBump(deps, mergeSha, bumps) {
  let carrying = null;
  for (const bump of bumps) {
    if (!isAncestor(deps, mergeSha, bump.sha)) break;
    carrying = bump;
  }
  return carrying;
}

function changelogCoverage(changelogText, version, records) {
  const entry = parseChangelogVersions(changelogText).find((e) => e.version === version);
  if (!entry) return { entryFound: false, named: [], missing: [...records] };
  const haystack = `${entry.title}\n${entry.body}`;
  const named = [];
  const missing = [];
  for (const n of records) {
    const re = new RegExp(`(?<![0-9])#${n}(?![0-9])`);
    (re.test(haystack) ? named : missing).push(n);
  }
  return { entryFound: true, named, missing };
}

function releaseStatus(deps, { ref = 'HEAD', merge, records } = {}) {
  if (!merge || !String(merge).trim()) throw new Error('merge commit is required (--merge <sha>)');
  if (!Array.isArray(records) || records.length === 0 || !records.every((n) => Number.isInteger(n) && n > 0)) {
    throw new Error('at least one record number is required (--records 603,604)');
  }
  const bumps = findBumpCommits(deps, ref);
  const bump = carryingBump(deps, merge, bumps);
  if (!bump) return { shipped: false };
  const coverage = changelogCoverage(deps.readFile(CHANGELOG), bump.version, records);
  return { shipped: true, version: bump.version, bumpCommit: bump.sha, ...coverage };
}

function formatStatusLine(result) {
  if (!result.shipped) return 'not yet in a release — bump pending';
  if (result.missing.length === 0) return `already carried by v${result.version} — every record named in CHANGELOG`;
  return `already carried by v${result.version} — CHANGELOG backfill needed: ${result.missing.map((n) => `#${n}`).join(', ')}`;
}

// The `### also carried in this build` subsection, per docs/releasing.md's convention.
// Named after the fact and labelled, never folded into the surrounding entry.
function formatBackfillSection(result, { merge } = {}) {
  if (!result.shipped || result.missing.length === 0) return '';
  const list = result.missing.map((n) => `#${n}`).join(', ');
  const short = String(merge || '').slice(0, 8);
  const at = short ? ` (merge \`${short}\`)` : '';
  return [
    '### also carried in this build',
    '',
    `Records ${list}${at} reached \`main\` under v${result.version} without a bump of their own — the`,
    'release step that would have written them up never ran, so the build that first carried them',
    'is numbered for other work. Detected by `node bin/release.js status` at pr-first merge and',
    'backfilled after the fact (see `docs/releasing.md`).',
    '',
  ].join('\n');
}

module.exports = {
  findBumpCommits, carryingBump, changelogCoverage, releaseStatus,
  formatStatusLine, formatBackfillSection, MANIFEST, CHANGELOG,
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/release/status.test.js`
Expected: PASS — 13 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/release/status.js tests/bin-lib/release/status.test.js
git commit -m "Add release status module — resolves the bump that carried a merge and the CHANGELOG records it misses (refs #678)"
```

---

### Task 2: `node bin/release.js status` subcommand + real-git CLI test

**Files:**
- Modify: `bin/release.js` (whole file — 55 lines; the `main()` gains a `status` branch and `USAGE` grows a second form)
- Test: `tests/bin-lib/release/status-cli.test.js` (new — builds a temp git repo; the spec's fixture repo, exercised through the real CLI)
- Modify: `docs/plugin-structure.md:99` (the `node bin/release.js` command-reference line)

**Interfaces:**
- Consumes: `releaseStatus`, `formatStatusLine`, `formatBackfillSection` from Task 1.
- Produces: the CLI contract Task 3's prose invokes verbatim —
  `node bin/release.js status --merge <sha> --records <n>[,<m>...] [--ref <ref>] [--json] [--backfill]`
  - default output: the one-line human form (`formatStatusLine`), exit 0.
  - `--json`: `JSON.stringify(result)` — `{"shipped":false}` or `{"shipped":true,"version":"X","bumpCommit":"…","entryFound":true,"named":[…],"missing":[…]}`, exit 0.
  - `--backfill`: prints `formatBackfillSection` (empty output when nothing to backfill), exit 0.
  - `--ref` defaults to `HEAD`; the CHANGELOG is read from `git show <ref>:CHANGELOG.md`, so `--ref origin/main` judges origin, not the working tree.
  - exit 2 on a malformed invocation (missing `--merge`/`--records`, unknown flag); exit 1 when git fails (bad sha, unreadable ref).

- [ ] **Step 1: Write the failing CLI test**

Create `tests/bin-lib/release/status-cli.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CLI = path.resolve(__dirname, '../../../bin/release.js');

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' },
  }).trim();
}
function write(cwd, rel, text) {
  fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
  fs.writeFileSync(path.join(cwd, rel), text);
}
const manifest = (v) => JSON.stringify({ name: 'fixture', version: v }, null, 2) + '\n';
const changelog = (entries) => '# Changelog\n\n' + entries.map(([v, t]) => `## v${v} — ${t}\n\n${t}.\n`).join('\n');

// Fixture: v1.0.0 root → feature branch (records #603, #604) merged at M → bump to v1.1.0
// whose CHANGELOG entry names #604 only.
function buildFixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'release-status-'));
  git(cwd, ['init', '-q', '-b', 'main']);
  write(cwd, '.claude-plugin/plugin.json', manifest('1.0.0'));
  write(cwd, 'CHANGELOG.md', changelog([['1.0.0', 'Initial']]));
  git(cwd, ['add', '-A']); git(cwd, ['commit', '-q', '-m', 'Release v1.0.0 — Initial']);
  git(cwd, ['checkout', '-q', '-b', 'feature']);
  write(cwd, 'feature.txt', 'work for #603 and #604\n');
  git(cwd, ['add', '-A']); git(cwd, ['commit', '-q', '-m', 'Feature work (refs #603, refs #604)']);
  git(cwd, ['checkout', '-q', 'main']);
  git(cwd, ['merge', '-q', '--no-ff', '-m', 'Merge pull request #900 from feature', 'feature']);
  const merge = git(cwd, ['rev-parse', 'HEAD']);
  write(cwd, '.claude-plugin/plugin.json', manifest('1.1.0'));
  write(cwd, 'CHANGELOG.md', changelog([['1.1.0', 'Statusline fix (#604)'], ['1.0.0', 'Initial']]));
  git(cwd, ['add', '-A']); git(cwd, ['commit', '-q', '-m', 'Release v1.1.0 — Statusline fix (#604)']);
  const bump = git(cwd, ['rev-parse', 'HEAD']);
  return { cwd, merge, bump };
}

function run(cwd, args) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

test('status: merged then bumped, CHANGELOG omits #603 → already carried, backfill needed', () => {
  const { cwd, merge, bump } = buildFixture();
  const human = run(cwd, ['status', '--merge', merge, '--records', '603,604']);
  assert.equal(human.code, 0, human.stderr);
  assert.equal(human.stdout.trim(), 'already carried by v1.1.0 — CHANGELOG backfill needed: #603');
  const json = run(cwd, ['status', '--merge', merge, '--records', '603,604', '--json']);
  assert.equal(json.code, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout), {
    shipped: true, version: '1.1.0', bumpCommit: bump, entryFound: true, named: [604], missing: [603],
  });
  const backfill = run(cwd, ['status', '--merge', merge, '--records', '603,604', '--backfill']);
  assert.equal(backfill.code, 0, backfill.stderr);
  assert.match(backfill.stdout, /^### also carried in this build\n/);
  assert.match(backfill.stdout, /#603/);
  assert.doesNotMatch(backfill.stdout, /#604/);
});

test('status: no bump after the merge (--ref at the merge itself) → not yet in a release', () => {
  const { cwd, merge } = buildFixture();
  const human = run(cwd, ['status', '--merge', merge, '--records', '603,604', '--ref', merge]);
  assert.equal(human.code, 0, human.stderr);
  assert.equal(human.stdout.trim(), 'not yet in a release — bump pending');
  const json = run(cwd, ['status', '--merge', merge, '--records', '603,604', '--ref', merge, '--json']);
  assert.deepEqual(JSON.parse(json.stdout), { shipped: false });
});

test('status: every record named → shipped, missing empty, backfill prints nothing', () => {
  const { cwd, merge } = buildFixture();
  const json = run(cwd, ['status', '--merge', merge, '--records', '604', '--json']);
  assert.equal(json.code, 0, json.stderr);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.shipped, true);
  assert.deepEqual(parsed.missing, []);
  const backfill = run(cwd, ['status', '--merge', merge, '--records', '604', '--backfill']);
  assert.equal(backfill.code, 0);
  assert.equal(backfill.stdout, '');
});

test('status: a merge that is NOT an ancestor of the bump (landed after it) → not shipped', () => {
  const { cwd } = buildFixture();
  git(cwd, ['checkout', '-q', '-b', 'late']);
  write(cwd, 'late.txt', 'work for #700\n');
  git(cwd, ['add', '-A']); git(cwd, ['commit', '-q', '-m', 'Late work (refs #700)']);
  git(cwd, ['checkout', '-q', 'main']);
  git(cwd, ['merge', '-q', '--no-ff', '-m', 'Merge pull request #901 from late', 'late']);
  const lateMerge = git(cwd, ['rev-parse', 'HEAD']);
  const json = run(cwd, ['status', '--merge', lateMerge, '--records', '700', '--json']);
  assert.deepEqual(JSON.parse(json.stdout), { shipped: false });
});

test('status: usage errors exit 2; a bad sha exits 1', () => {
  const { cwd, merge } = buildFixture();
  assert.equal(run(cwd, ['status', '--records', '603']).code, 2);
  assert.equal(run(cwd, ['status', '--merge', merge]).code, 2);
  assert.equal(run(cwd, ['status', '--merge', merge, '--records', '603', '--bogus']).code, 2);
  const bad = run(cwd, ['status', '--merge', 'deadbeefdeadbeef', '--records', '603']);
  assert.equal(bad.code, 1);
});
```

- [ ] **Step 2: Run the CLI test to verify it fails**

Run: `node --test tests/bin-lib/release/status-cli.test.js`
Expected: FAIL — `status` is not `minor|patch`, so today's `main()` prints USAGE and exits 2 for every case (the first three tests fail on `code === 0`).

- [ ] **Step 3: Add the `status` branch to `bin/release.js`**

Replace the whole file with:

```js
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { runRelease } = require('./lib/release/run.js');
const { releaseStatus, formatStatusLine, formatBackfillSection, CHANGELOG } = require('./lib/release/status.js');
const { appendShippedVersion } = require('./lib/shipped-record.js');

const USAGE = `Usage: node bin/release.js <minor|patch> "<summary>" [--dry-run]
       node bin/release.js status --merge <sha> --records <n>[,<m>...] [--ref <ref>] [--json] [--backfill]

Performs a complete release from a clean main: collision pre-check, manifest
bump, CHANGELOG stub, shipped-versions.tsv append (one commit), push, and
marketplace mirror. The default is a LIVE release; pass --dry-run to preview
every action without writing. Aborts loudly on any collision or divergence.

status: reports which release (if any) already carries a merge commit — the
oldest version bump reachable from --ref (default HEAD) that has --merge as an
ancestor — and which of the given record numbers that version's CHANGELOG entry
fails to name. Prints one human line ("not yet in a release — bump pending" /
"already carried by vX.Y.Z — CHANGELOG backfill needed: #A"), or the JSON
result with --json, or the "### also carried in this build" subsection text
with --backfill (empty when nothing is missing). Never calls gh; never guesses
record numbers. Exit 0 on any resolved status, 2 on usage, 1 on a git failure.`;

function parseStatusArgs(args) {
  const opts = { ref: 'HEAD', json: false, backfill: false, merge: null, records: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') opts.json = true;
    else if (a === '--backfill') opts.backfill = true;
    else if (a === '--merge') opts.merge = args[++i];
    else if (a === '--ref') opts.ref = args[++i];
    else if (a === '--records') {
      opts.records = String(args[++i] || '').split(',').map((s) => s.trim()).filter(Boolean).map(Number);
    } else return null;
  }
  if (!opts.merge || !opts.records || opts.records.length === 0 || !opts.records.every((n) => Number.isInteger(n) && n > 0)) return null;
  return opts;
}

function status(args) {
  const opts = parseStatusArgs(args);
  if (!opts) { console.error(USAGE); return 2; }
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const git = (a) => execFileSync('git', a, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const deps = {
    git,
    // Read the CHANGELOG at the ref being judged, not the working tree — a backfill
    // already on origin/main counts even before the local checkout catches up.
    readFile: (p) => (p === CHANGELOG ? git(['show', `${opts.ref}:${CHANGELOG}`]) : fs.readFileSync(path.join(repoRoot, p), 'utf8')),
  };
  try {
    const result = releaseStatus(deps, { ref: opts.ref, merge: opts.merge, records: opts.records });
    if (opts.json) console.log(JSON.stringify(result));
    else if (opts.backfill) process.stdout.write(formatBackfillSection(result, { merge: opts.merge }));
    else console.log(formatStatusLine(result));
    return 0;
  } catch (err) {
    console.error(String(err.message || err));
    return 1;
  }
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { console.log(USAGE); return 0; }
  if (args[0] === 'status') return status(args.slice(1));
  const dryRun = args.includes('--dry-run');
  const positional = args.filter((a) => !a.startsWith('--'));
  const [part, summary] = positional;
  if (!['minor', 'patch'].includes(part) || !summary) { console.error(USAGE); return 2; }

  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const deps = {
    repoRoot,
    git: (a) => execFileSync('git', a, { cwd: repoRoot, encoding: 'utf8' }),
    gh: (a) => execFileSync('gh', a, { cwd: repoRoot, encoding: 'utf8' }),
    readFile: (p) => fs.readFileSync(path.join(repoRoot, p), 'utf8'),
    writeFile: (p, text) => fs.writeFileSync(path.join(repoRoot, p), text),
    appendShipped: appendShippedVersion,
    listPlanFiles: () => {
      const dir = path.join(repoRoot, 'docs/superpowers/plans');
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => path.join('docs/superpowers/plans', f));
    },
  };
  // readFile above resolves from repoRoot, but precheck's plan reads receive the
  // relative paths listPlanFiles returns — consistent by construction.
  const date = new Date().toISOString().slice(0, 10);
  try {
    const out = runRelease(deps, { part, summary, date, dryRun, log: (m) => console.log(m) });
    console.log(dryRun ? `[dry-run] v${out.version} — no changes written` : `released v${out.version}`);
    return 0;
  } catch (err) {
    console.error(String(err.message || err));
    return 1;
  }
}

process.exit(main(process.argv));
```

- [ ] **Step 4: Run the CLI test and the whole release suite**

Run: `node --test tests/bin-lib/release/`
Expected: PASS — all files (`compose`, `mirror`, `precheck`, `run`, `status`, `status-cli`), 0 failures.

- [ ] **Step 5: Register the subcommand in `docs/plugin-structure.md`**

In `docs/plugin-structure.md`, replace line 99:

```
node bin/release.js <minor|patch> "<summary>" [--dry-run]   # Release CLI — one-command release: 5-source collision pre-check, bump+CHANGELOG+tsv in one commit, push, marketplace mirror (fixture-tested in `tests/bin-lib/release/`)
```

with these two lines:

```
node bin/release.js <minor|patch> "<summary>" [--dry-run]   # Release CLI — one-command release: 5-source collision pre-check, bump+CHANGELOG+tsv in one commit, push, marketplace mirror (fixture-tested in `tests/bin-lib/release/`)
node bin/release.js status --merge <sha> --records <n>[,<m>...] [--ref <ref>] [--json] [--backfill]   # Release-status CLI — which version bump (oldest reachable from --ref, default HEAD) already carries the merge commit, and which record numbers that version's CHANGELOG entry misses; one human line by default, `--json` the result object, `--backfill` the "### also carried in this build" subsection text (empty when nothing is missing). Run by `_shared/pr-first-merge.md` Step 4 after reconcile; never calls gh (works under local-merge); exit 0 on any resolved status, 2 on usage, 1 on a git failure (`bin/lib/release/status.js`, tests in `tests/bin-lib/release/status*.test.js`)
```

- [ ] **Step 6: Commit**

```bash
git add bin/release.js tests/bin-lib/release/status-cli.test.js docs/plugin-structure.md
git commit -m "Add release.js status subcommand — reports which bump carried a merge and the CHANGELOG records it misses (refs #678)"
```

---

### Task 3: `pr-first-merge.md` Step 4 — run the check, stage the backfill; `docs/releasing.md`; flow release-status line

**Files:**
- Modify: `skills/_shared/pr-first-merge.md:295-308` (the `## Step 4: Post-merge reconcile (outcome \`merged\` only)` section — append a Step 4.5 subsection after the existing paragraph, before `## Conflict path`)
- Modify: `docs/releasing.md` (append a `## After the merge: which release carried it` section after `## After the push: the CI gate`)
- Modify: `skills/flow/summary-template.md` (add a `**Release status:**` line after the Step/Outcome table, inside the fenced template)
- Modify: `skills/flow/multi-spec.md` (the `## Multi-Spec Summary` template — same line, once for the run)
- Test: `tests/pr-first-merge.test.js` (append one structural test)

**Interfaces:**
- Consumes: the CLI contract from Task 2 (`node bin/release.js status --merge <sha> --records <n,m> --ref origin/{integration-branch} [--json|--backfill]`).
- Produces: the staged-file shape `staged/release-backfill-v{version}.md` and the `decisions.md` entries `/flow` Step 5 reads back for its release-status line.

- [ ] **Step 1: Write the failing structural test**

Append to `tests/pr-first-merge.test.js` (after the last existing `test(...)` block, before EOF):

```js
test('Step 4 runs the release-status check after reconcile and stages — never writes — the CHANGELOG backfill (#678)', () => {
  const step4 = MERGE.indexOf('## Step 4: Post-merge reconcile');
  const conflict = MERGE.indexOf('## Conflict path');
  assert.ok(step4 > 0 && conflict > step4, 'Step 4 must precede the Conflict path');
  const section = MERGE.slice(step4, conflict);
  assert.match(section, /node bin\/release\.js status --merge/, 'Step 4 invokes the status subcommand');
  assert.match(section, /--records/, 'record numbers are passed explicitly');
  assert.match(section, /staged\/release-backfill-v\{version\}\.md/, 'the already-carried outcome stages a Review Console row');
  assert.match(section, /STAGED \{time\}/, 'the staged row is auto-decision-logged');
  assert.match(section, /never (edits|writes) `CHANGELOG\.md`/i, 'Step 4 never writes CHANGELOG.md directly');
  const status = MERGE.indexOf('node bin/release.js status', step4);
  const reconcile = MERGE.indexOf('bin/hooks.js" reconcile', step4);
  assert.ok(reconcile > 0 && status > reconcile, 'the status check runs after the reconcile call');
});

test('/flow closing reports carry the release-status line verbatim (#678)', () => {
  const summary = read('skills', 'flow', 'summary-template.md');
  const multi = read('skills', 'flow', 'multi-spec.md');
  assert.match(summary, /\*\*Release status:\*\* \{/, 'single-spec summary renders the release-status line');
  assert.match(multi, /\*\*Release status:\*\* \{/, 'multi-spec summary renders the release-status line');
  assert.match(summary, /not yet in a release — bump pending/, 'the human form is quoted verbatim');
});
```

`read(...)` and `MERGE` are constants the file already declares at its top (`const ROOT = path.join(__dirname, '..'); const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8'); const MERGE = read('skills', '_shared', 'pr-first-merge.md');`) — reuse them; add no new root constant. Note the file imports `assert` from `node:assert` (not `/strict`); `assert.match`/`assert.doesNotMatch`/`assert.ok` behave identically.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/pr-first-merge.test.js`
Expected: FAIL — the two new tests fail on the first `assert.match` (no `node bin/release.js status` in Step 4; no `**Release status:**` line).

- [ ] **Step 3: Extend `pr-first-merge.md` Step 4**

In `skills/_shared/pr-first-merge.md`, immediately after the Step 4 paragraph ending `…so it needs no worktree, no branch guard, and no close-run relief.` and before `## Conflict path`, insert:

````markdown
### Step 4.5: Which release carried this? (after reconcile, outcome `merged` only)

A merge can land minutes before a sibling session's version bump and be swept into it with no
CHANGELOG line of its own — three records shipped that way under v6.87.1 (#603, the incident
behind #678). Reconcile says nothing about *where* the merge landed relative to the version
history, so ask, once, right after it:

```bash
git fetch origin {integration-branch}
node bin/release.js status --merge {merge-sha} --records {n}[,{m}...] --ref origin/{integration-branch} --json
```

`{merge-sha}` is the merge commit `gh pr view --json mergeCommit` reported for the confirmed
merge; `{n},{m}` are the record numbers this run carried — the materialized header's `record:`
(one per `spec-{N}/work/{N}-spec.md` for a bundle) or, identically, the PR body's `Fixes #{n}`
lines. Pass them explicitly — the subcommand never guesses record numbers, and never calls `gh`
(the same invocation applies under `local-merge` with the local merge commit and `--ref
{integration-branch}`). Read the bump commit **after** the merge is confirmed and after the
fetch above — the bump can land in a sibling session while this PR is being merged.

Branch on the JSON:

- `{"shipped": false}` — log `AUTO {time} — pr-first-merge Step 4.5: release status — not yet in
  a release — bump pending. Reversibility: n/a.` and carry that human line into the closing
  report (`flow/summary-template.md`'s `**Release status:**` line).
- `{"shipped": true, "missing": []}` — every record is already named under `v{version}`; log
  `AUTO {time} — pr-first-merge Step 4.5: release status — already carried by v{version} — every
  record named in CHANGELOG. Reversibility: n/a.` Stage nothing.
- `{"shipped": true, "missing": [...]}` — the backfill case. Generate the subsection text with
  `node bin/release.js status --merge {merge-sha} --records {n},{m} --ref origin/{integration-branch} --backfill`
  and **stage** it as a Review Console row at `{run-dir}/staged/release-backfill-v{version}.md`
  (a `Pending review` row — `wrap-up/console-template.md`), with this shape:

  ```markdown
  Apply: append the section below to CHANGELOG.md's `## v{version}` entry (before the next `## v` heading), through the ordinary pr-first path — scratch worktree, `tests/changelog-coverage.test.js` green, PR, merge. Never inline in the main checkout.
  Merge: {merge-sha}
  Records: #{a}, #{b}

  ### also carried in this build

  {the --backfill output, verbatim}
  ```

  Log `STAGED {time} — pr-first-merge Step 4.5: release status — already carried by v{version} —
  CHANGELOG backfill needed: #{a}, #{b}. Stage path: staged/release-backfill-v{version}.md.` and
  carry the human line into the closing report. This step never edits `CHANGELOG.md` itself —
  Step 4's rule stands: **no `git merge`, `git commit`, or `git push` in the main checkout**, so
  the staged row is applied later by a worktree-based PR (`docs/releasing.md`'s "After the merge"
  section), never here.

Like reconcile, this is convergent bookkeeping, not owed: a `git fetch` failure or a non-zero
exit from the subcommand is logged (`AUTO {time} — pr-first-merge Step 4.5: release status
unavailable ({reason}). Reversibility: n/a.`) and the closing report's line reads `release status
unavailable — {reason}`; it is never a reason to report anything other than `merged`.
````

- [ ] **Step 4: Add the release-status line to the two flow closing reports**

In `skills/flow/summary-template.md`, inside the fenced template, immediately after the `| wrap-up | Learnings captured, artifacts cleaned, ledger resolved |` table row and before `### Key Outputs`, insert:

```markdown

**Release status:** {the one-line human form from `_shared/pr-first-merge.md` Step 4.5, verbatim — `not yet in a release — bump pending` | `already carried by vX.Y.Z — CHANGELOG backfill needed: #A, #B` (a `staged/release-backfill-vX.Y.Z.md` row is waiting at the Review Console) | `already carried by vX.Y.Z — every record named in CHANGELOG` | `release status unavailable — {reason}` | `n/a — not merged in this run (outcome: {armed | pending-review})`}
```

In `skills/flow/multi-spec.md`, inside the `## Multi-Spec Summary` fenced template, immediately after the Spec/Build/Test/Review/Polish/Wrap-Up table (after its last example row `| {N} | — | — | — | — | — | Not run (previous spec failed) |`) and before `### Manual Steps Required (all specs)`, insert:

```markdown

**Release status:** {one line for the run's single shared branch, from `_shared/pr-first-merge.md` Step 4.5, verbatim — same vocabulary as `summary-template.md`'s line; `n/a — not merged in this run (outcome: {armed | pending-review})` when the bundle PR did not merge in this run}
```

- [ ] **Step 5: Document the check in `docs/releasing.md`**

Append to `docs/releasing.md`, after the `## After the push: the CI gate` section (at end of file):

```markdown

## After the merge: which release carried it

A pr-first merge that lands minutes before another session's bump is swept into that build with no CHANGELOG line of its own — nothing in the release step notices, because the release step never ran for it. `_shared/pr-first-merge.md` Step 4.5 asks the question once, right after reconcile:

```
node bin/release.js status --merge <merge-sha> --records <n>[,<m>...] --ref origin/main [--json | --backfill]
```

It resolves the *oldest* version-bump commit reachable from `--ref` (a commit that changed `.claude-plugin/plugin.json#version`) that has the merge as an ancestor, then checks whether that version's CHANGELOG entry names each record. Three outcomes, one line each: `not yet in a release — bump pending`; `already carried by vX.Y.Z — every record named in CHANGELOG`; `already carried by vX.Y.Z — CHANGELOG backfill needed: #A, #B`. `/claude-tweaks:flow`'s closing report carries the line verbatim. The subcommand never calls `gh` and never guesses record numbers — the same invocation works under `local-merge`.

**Applying a staged backfill.** On the backfill outcome, Step 4.5 stages the `### also carried in this build` subsection (`--backfill` output) at `{run-dir}/staged/release-backfill-vX.Y.Z.md` and the Review Console surfaces it as a Pending-review row. Approving it means: scratch worktree, append the section to CHANGELOG.md's `## vX.Y.Z` entry (before the next `## v` heading — the label is what keeps it from reading as a contemporaneous release note; the convention is stated at the top of `CHANGELOG.md`), `node --test tests/changelog-coverage.test.js`, PR, merge. Never edit CHANGELOG.md in the main checkout — Step 4's no-commit rule holds for the backfill too. This is detection, not prevention: a release-time gate that refuses to bump while a merge since the last bump is unnamed is a companion, tracked separately.
```

- [ ] **Step 6: Run the tests**

Run: `node --test tests/pr-first-merge.test.js tests/bin-lib/skill-audit/context-cost.test.js`
Expected: PASS — the two new structural tests pass; the context-cost ceiling still passes (`pr-first-merge.md` grows by ~3 KB to ~29 KB, under 40 KB).

Also run: `wc -c skills/_shared/pr-first-merge.md skills/flow/summary-template.md skills/flow/multi-spec.md`
Expected: every value under 40960.

- [ ] **Step 7: Commit**

```bash
git add skills/_shared/pr-first-merge.md skills/flow/summary-template.md skills/flow/multi-spec.md docs/releasing.md tests/pr-first-merge.test.js
git commit -m "Run the release-status check at pr-first merge Step 4.5 — stage the CHANGELOG backfill, carry the line into flow's closing reports (refs #678)"
```

---

### Task 4: Full-suite verification

**Files:** none modified unless a failure surfaces.

- [ ] **Step 1: Run the full suite to a file**

Run: `npm test > /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/d1f604d9-ebff-480f-bd4f-d8a47d784939/scratchpad/678-suite.log 2>&1; grep -E "^# (tests|pass|fail)" /private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/d1f604d9-ebff-480f-bd4f-d8a47d784939/scratchpad/678-suite.log`
Expected: `# fail 0`; `# tests` = 3876 + 13 (status.test.js) + 5 (status-cli.test.js) + 2 (pr-first-merge additions) = 3896.

- [ ] **Step 2: Fix and commit anything red**

A conformance test somewhere else in `tests/` may pin prose this build changed (e.g. a docs-conformance test enumerating `docs/plugin-structure.md` command lines). Read the failing assertion, adjust the prose or the pin to match the shipped behaviour, re-run that file in isolation, and commit as `Fix {test} — {detail} (refs #678)`.
