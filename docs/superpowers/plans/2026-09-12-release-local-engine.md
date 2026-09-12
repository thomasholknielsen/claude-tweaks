# Local Release Engine (`bin/release-local.js`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `local-merge` release engine — a plugin-owned CLI that reads first-parent conventional commits since the last `v*` tag, computes the semver bump, byte-splices the manifest, prepends a release-please-grammar CHANGELOG section, commits, tags, pushes, and runs the `release-hook` — emitting artifacts byte-compatible with release-please.

**Architecture:** Four pure lib modules under `plugin/bin/lib/release-local/` (`commits.js` parse, `bump.js` derive, `manifest.js` byte-splice, `changelog.js` render) plus a thin `run(argv, deps)` CLI in `plugin/bin/release-local.js` that sequences them. The existing `plugin/bin/lib/release/precheck.js` gains a `keySource` option (`'tsv'` today's behaviour for `release.js`, `'tags'` for this engine) and `plugin/bin/lib/release/run.js` exports its clean-tree/branch guard and fetch → ancestry-recheck → push ordering as two helpers that `runRelease` itself now calls — no duplicate implementation. The release-please grammar is pinned by two captured fixtures.

**Tech Stack:** Node 18+ built-ins only (`fs`, `path`, `child_process`), `node --test`, `tests/helpers/git-fixtures.js` for real-git fixture repos.

**Spec:** `.claude-tweaks/pipelines/2026-09-11T204239-spec-2251-2252-2253-2254-2255-2256-2258/spec-2254/work/2254-spec.md` (record #2254; design doc Phase 4 recovered at `docs/superpowers/specs/2026-09-11-release-skill-design.md` in commit `f92db978c`).

## Global Constraints

- Every `plugin/bin/**/*.js` CLI: `run(argv, deps)` seam, every side effect through `deps`, `process.exitCode = run(...)` under `require.main === module`, never `process.exit` (pinned by `tests/bin-lib/exit-code-conformance.test.js`) — `.claude/skills/gh-api-module-pattern/SKILL.md` "The CLI wrapper contract".
- Exit vocabulary for `release-local.js`: `0` released / dry-run plan printed, `1` git or engine failure (nothing written, or a **named partial state with a recovery command**), `2` usage, `3` nothing to release, `4` version collision, `5` `release-hook` failed after the tag (and its push) landed — spelled out in the file header and `USAGE`.
- Unparseable commit subjects surface as `unconventional` in the plan output, never dropped (`.claude/skills/parse-signal-discipline/SKILL.md`).
- Manifest edits are raw string splices of the version token only — never `JSON.parse`+`stringify`, never a TOML re-emit.
- The changelog fixtures are the grammar contract: a failing fixture test means "re-capture the fixture", never "loosen the assertion".
- Commit messages: `{Verb} {what} — {detail}` with `refs #2254` (never closes/fixes); every commit ends with the trailer `Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH`.
- No `--no-verify`, no `git stash`, work only in this worktree.

## Rulings (recorded for the Review Console)

1. **Commit links follow the same GitHub-origin condition as the compare URL.** release-please's bullet `([sha7](repo/commit/sha))` needs a repo URL; without a GitHub `origin` the bullet is `* subject` and the heading is `## X.Y.Z (date)`.
2. **Hidden types render only when breaking**, exactly as release-please's default `changelog-sections` (feat/fix/perf/revert visible; docs/style/chore/refactor/test/build/ci hidden unless the commit carries a breaking marker).
3. **No-tag base = the current manifest version** (`.release-please-manifest.json` `"."`, else the stack manifest, else `0.0.0`) — AC 7's "0.1.0's next minor equivalent" on a bootstrap-seeded `0.1.0` manifest is `0.2.0`.
4. **`.release-please-manifest.json` is updated too** (release-please does on every release; stance 4 "same manifest handling") and `package-lock.json`'s two root version tokens under `node` when the file exists — both byte-spliced.
5. **`java`, `ruby`, `dotnet` manifest edits are unsupported by the local engine** (exit 1 naming the type and pointing at `simple` + `extra-files`); `go` has no manifest (tag only). Ledger row for a follow-up.
6. **Integration branch** = policy `integration-branch` when set, else `main`; overridable with `--branch`.
7. **`BREAKING-CHANGE:`** (hyphen) is accepted as a synonym of `BREAKING CHANGE:` — the Conventional Commits spec declares them equivalent.
8. **`manifest.js` skips only path absence** (`does not exist` / `exists on disk, but not in`); a bad ref (`invalid object name`) propagates. Found by Task 3's implementer: the brief reused `manifest-path.js`'s `NOT_FOUND_ERROR_RE`, which folds both, against a test that requires the throw.
9. **`package-lock.json` splices are structural, not counted** — the root `version` plus the `packages[""]` entry's own `version` (bounded by the first `"node_modules/` key), never a dependency's. Task 3's reviewer caught the brief's "first two occurrences" corrupting a lockfileVersion 1 file's first dependency.

---

### Task 1: `commits.js` — first-parent conventional history

**Files:**
- Create: `plugin/bin/lib/release-local/commits.js`
- Test: `tests/bin-lib/release-local/commits.test.js`

**Interfaces:**
- Produces: `HEADER_RE`, `lastTag(git) -> string|null`, `parseCommit({sha, subject, body}) -> Commit`, `readCommits(git, tag) -> Commit[]`, `conventionalHistory(git) -> {lastTag, commits}` where `Commit = {sha, subject, type, scope, breaking, breakingNote, description, unconventional}` and `git(args) -> stdout string` throws on failure.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCommit, readCommits, lastTag, conventionalHistory } = require('../../../plugin/bin/lib/release-local/commits.js');

test('parseCommit: type, scope, description', () => {
  const c = parseCommit({ sha: 'a'.repeat(40), subject: 'fix(deps): bump x', body: '' });
  assert.deepStrictEqual(c, { sha: 'a'.repeat(40), subject: 'fix(deps): bump x', type: 'fix', scope: 'deps', breaking: false, breakingNote: null, description: 'bump x', unconventional: false });
});

test('parseCommit: ! marker is breaking with the description as its note', () => {
  const c = parseCommit({ sha: 'b'.repeat(40), subject: 'feat!: drop node 16', body: '' });
  assert.strictEqual(c.breaking, true);
  assert.strictEqual(c.breakingNote, 'drop node 16');
});

test('parseCommit: BREAKING CHANGE footer (both spellings) is breaking with the footer text as its note', () => {
  const a = parseCommit({ sha: 'c'.repeat(40), subject: 'fix: y', body: 'body\n\nBREAKING CHANGE: config key renamed' });
  const b = parseCommit({ sha: 'd'.repeat(40), subject: 'fix: y', body: 'BREAKING-CHANGE: hyphen form' });
  assert.strictEqual(a.breakingNote, 'config key renamed');
  assert.strictEqual(b.breakingNote, 'hyphen form');
});

test('parseCommit: an unconventional subject is reported, never dropped, and a breaking footer still counts', () => {
  const c = parseCommit({ sha: 'e'.repeat(40), subject: 'Merge branch x', body: 'BREAKING CHANGE: removed api' });
  assert.strictEqual(c.unconventional, true);
  assert.strictEqual(c.type, null);
  assert.strictEqual(c.breaking, true);
  assert.strictEqual(c.description, 'Merge branch x');
});

test('lastTag: the first-parent v* tag, null when git reports no tag', () => {
  const calls = [];
  const git = (args) => { calls.push(args.join(' ')); return 'v1.2.0\n'; };
  assert.strictEqual(lastTag(git), 'v1.2.0');
  assert.strictEqual(calls[0], 'describe --tags --match v[0-9]* --abbrev=0 --first-parent HEAD');
  const none = () => { throw new Error('fatal: No names found, cannot describe anything.'); };
  assert.strictEqual(lastTag(none), null);
  const boom = () => { throw new Error('fatal: not a git repository'); };
  assert.throws(() => lastTag(boom), /not a git repository/);
});

test('readCommits: parses the record-separated log; the no-tag range is the full first-parent history', () => {
  const calls = [];
  const log = 'x'.repeat(40) + '\x1ffeat: a\x1fbody a\n\x1e\n' + 'y'.repeat(40) + '\x1fchore: b\x1f\x1e\n';
  const git = (args) => { calls.push(args); return log; };
  const commits = readCommits(git, null);
  assert.strictEqual(calls[0][calls[0].length - 1], 'HEAD');
  assert.deepStrictEqual(commits.map((c) => [c.type, c.description]), [['feat', 'a'], ['chore', 'b']]);
  readCommits(git, 'v1.2.0');
  assert.strictEqual(calls[1][calls[1].length - 1], 'v1.2.0..HEAD');
});

test('conventionalHistory: combines lastTag and the range', () => {
  const git = (args) => (args[0] === 'describe' ? 'v1.2.0\n' : 'z'.repeat(40) + '\x1ffix: c\x1f\x1e\n');
  const h = conventionalHistory(git);
  assert.strictEqual(h.lastTag, 'v1.2.0');
  assert.strictEqual(h.commits[0].type, 'fix');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node -e "require('./plugin/bin/lib/release-local/commits.js')"`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write the implementation**

```js
'use strict';
// bin/lib/release-local/commits.js — first-parent conventional-commit history
// since the last v* tag (#2254, design stance 3: the local engine reads
// --first-parent, so --no-ff merges are one composer-written subject each).
// An unparseable subject is reported as `unconventional`, never dropped
// (.claude/skills/parse-signal-discipline): it is real signal that someone
// bypassed the merge-time composer.
const HEADER_RE = /^(\w+)(\([^)]*\))?(!)?: (.+)$/;
// Conventional Commits declares `BREAKING CHANGE:` and `BREAKING-CHANGE:` equivalent.
const BREAKING_FOOTER_RE = /^BREAKING[ -]CHANGE: ?(.*)$/m;
const RECORD = '\x1e';
const FIELD = '\x1f';
const NO_TAG_RE = /No names found|No tags can describe|cannot describe anything/i;

function lastTag(git) {
  try {
    const out = git(['describe', '--tags', '--match', 'v[0-9]*', '--abbrev=0', '--first-parent', 'HEAD']).trim();
    return out || null;
  } catch (err) {
    if (NO_TAG_RE.test(String(err.message || err))) return null;
    throw err;
  }
}

function parseCommit({ sha, subject, body = '' }) {
  const m = HEADER_RE.exec(subject);
  const footer = BREAKING_FOOTER_RE.exec(body);
  if (!m) {
    return { sha, subject, type: null, scope: null, breaking: footer !== null, breakingNote: footer ? footer[1].trim() : null, description: subject, unconventional: true };
  }
  const breaking = m[3] === '!' || footer !== null;
  const breakingNote = footer ? (footer[1].trim() || m[4]) : (breaking ? m[4] : null);
  return { sha, subject, type: m[1], scope: m[2] ? m[2].slice(1, -1) : null, breaking, breakingNote, description: m[4], unconventional: false };
}

function readCommits(git, tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const raw = git(['log', '--first-parent', `--format=%H${FIELD}%s${FIELD}%b${RECORD}`, range]);
  return raw.split(RECORD)
    .map((chunk) => chunk.replace(/^\n/, ''))
    .filter((chunk) => chunk.trim() !== '')
    .map((chunk) => {
      const [sha, subject, body = ''] = chunk.split(FIELD);
      return parseCommit({ sha: sha.trim(), subject: subject.trim(), body });
    });
}

function conventionalHistory(git) {
  const tag = lastTag(git);
  return { lastTag: tag, commits: readCommits(git, tag) };
}

module.exports = { HEADER_RE, lastTag, parseCommit, readCommits, conventionalHistory };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/release-local/commits.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/release-local/commits.js tests/bin-lib/release-local/commits.test.js
git commit -m "Add release-local commits.js — first-parent conventional history since the last v* tag, unconventional subjects surfaced, refs #2254

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

### Task 2: `bump.js` + `nextVersion('major')`

**Files:**
- Create: `plugin/bin/lib/release-local/bump.js`
- Modify: `plugin/bin/lib/release/compose.js:9-16` (`nextVersion` gains `major`)
- Test: `tests/bin-lib/release-local/bump.test.js`, `tests/bin-lib/release/compose.test.js` (one added case)

**Interfaces:**
- Consumes: `nextVersion(current, part)` from `plugin/bin/lib/release/compose.js`.
- Produces: `bumpPart(commits) -> 'major'|'minor'|'patch'|'none'`, `nextVersionFor(base, part) -> string|null`.

- [ ] **Step 1: Write the failing tests**

`tests/bin-lib/release-local/bump.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bumpPart, nextVersionFor } = require('../../../plugin/bin/lib/release-local/bump.js');

const c = (type, breaking = false) => ({ type, breaking });

test('precedence: breaking > feat > fix > none', () => {
  assert.strictEqual(bumpPart([c('fix'), c('chore', true)]), 'major');
  assert.strictEqual(bumpPart([c('fix'), c('feat')]), 'minor');
  assert.strictEqual(bumpPart([c('chore'), c('fix')]), 'patch');
  assert.strictEqual(bumpPart([c('chore'), c('docs')]), 'none');
  assert.strictEqual(bumpPart([]), 'none');
});

test('an unconventional commit with a breaking footer still forces major', () => {
  assert.strictEqual(bumpPart([{ type: null, breaking: true }]), 'major');
});

test('nextVersionFor: major/minor/patch over the base, null for none', () => {
  assert.strictEqual(nextVersionFor('1.2.3', 'major'), '2.0.0');
  assert.strictEqual(nextVersionFor('1.2.3', 'minor'), '1.3.0');
  assert.strictEqual(nextVersionFor('1.2.3', 'patch'), '1.2.4');
  assert.strictEqual(nextVersionFor('0.1.0', 'minor'), '0.2.0');
  assert.strictEqual(nextVersionFor('1.2.3', 'none'), null);
});
```

Append to `tests/bin-lib/release/compose.test.js`:

```js
test('nextVersion: major resets minor and patch', () => {
  assert.strictEqual(nextVersion('6.70.1', 'major'), '7.0.0');
  assert.throws(() => nextVersion('6.70.1', 'huge'), /part must be/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node -e "const {nextVersion}=require('./plugin/bin/lib/release/compose.js'); nextVersion('1.0.0','major')"`
Expected: FAIL with `part must be "minor" or "patch"`

- [ ] **Step 3: Implement**

In `plugin/bin/lib/release/compose.js` replace the body of `nextVersion` after the destructuring line:

```js
  if (part === 'major') return `${major + 1}.0.0`;
  if (part === 'minor') return `${major}.${minor + 1}.0`;
  if (part === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`part must be "major", "minor" or "patch", got "${part}"`);
```

`plugin/bin/lib/release-local/bump.js`:

```js
'use strict';
// bin/lib/release-local/bump.js — semver bump derivation over a conventional
// commit list (#2254): breaking marker → major; any feat → minor; any fix →
// patch; nothing releasable → 'none' (the CLI exits 3). The same precedence
// applies on a first release (no prior tag) over the full first-parent history.
const { nextVersion } = require('../release/compose.js');

function bumpPart(commits) {
  if (commits.some((c) => c.breaking)) return 'major';
  if (commits.some((c) => c.type === 'feat')) return 'minor';
  if (commits.some((c) => c.type === 'fix')) return 'patch';
  return 'none';
}

function nextVersionFor(base, part) {
  return part === 'none' ? null : nextVersion(base, part);
}

module.exports = { bumpPart, nextVersionFor };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/release-local/bump.test.js tests/bin-lib/release/compose.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/release-local/bump.js plugin/bin/lib/release/compose.js tests/bin-lib/release-local/bump.test.js tests/bin-lib/release/compose.test.js
git commit -m "Add release-local bump.js — breaking > feat > fix > none precedence; nextVersion learns major, refs #2254

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

### Task 3: `manifest.js` — config-driven, byte-preserving version splices

**Files:**
- Create: `plugin/bin/lib/release-local/manifest.js`
- Test: `tests/bin-lib/release-local/manifest.test.js`

**Interfaces:**
- Consumes: `release-please-config.json` as `plugin/bin/lib/init/release-bootstrap.js`'s `renderConfig` writes it (`{ packages: { '.': { 'release-type', 'extra-files'? } } }`), `.release-please-manifest.json` as `renderManifest` writes it (`{ '.': version }`); the stack table in `plugin/skills/init/bootstrap/step-21-release.md` (cited, not re-derived).
- Produces: `readConfig(readFile) -> {releaseType, extraFiles}|null`, `resolveTargets(config) -> Target[]` (`Target = {path, kind: 'json'|'json-lock'|'toml'|'text'|'generic'|'manifest', sections?, optional}`), `currentVersion(targets, readFile) -> string|null`, `versionAtRef(targets, show) -> string|null` (throws git errors through), `applyVersion(targets, from, to, readFile, writeFile) -> {path, previous}[]`, `spliceVersion(kind, text, to, opts) -> {text, found, previous}`, `ManifestError`. `readFile(path)` returns `null` when the file is absent.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../../plugin/bin/lib/release-local/manifest.js');

const files = (map) => ({ readFile: (p) => (Object.prototype.hasOwnProperty.call(map, p) ? map[p] : null), map });
const config = (releaseType, extraFiles) => JSON.stringify({ packages: { '.': { 'release-type': releaseType, ...(extraFiles ? { 'extra-files': extraFiles } : {}) } } });

test('readConfig: null without a config, release-type + extra-files with one', () => {
  assert.strictEqual(M.readConfig(files({}).readFile), null);
  assert.deepStrictEqual(M.readConfig(files({ 'release-please-config.json': config('node') }).readFile), { releaseType: 'node', extraFiles: [] });
  const ef = [{ type: 'json', path: 'plugin/.claude-plugin/plugin.json', jsonpath: '$.version' }];
  assert.deepStrictEqual(M.readConfig(files({ 'release-please-config.json': config('simple', ef) }).readFile).extraFiles, ef);
});

test('resolveTargets: one row per stack type, the manifest file always, unsupported types throw naming the type', () => {
  assert.deepStrictEqual(M.resolveTargets({ releaseType: 'node', extraFiles: [] }).map((t) => [t.path, t.kind]),
    [['.release-please-manifest.json', 'manifest'], ['package.json', 'json'], ['package-lock.json', 'json-lock']]);
  assert.deepStrictEqual(M.resolveTargets({ releaseType: 'python', extraFiles: [] }).map((t) => t.path), ['.release-please-manifest.json', 'pyproject.toml']);
  assert.deepStrictEqual(M.resolveTargets({ releaseType: 'rust', extraFiles: [] }).map((t) => t.path), ['.release-please-manifest.json', 'Cargo.toml']);
  assert.deepStrictEqual(M.resolveTargets({ releaseType: 'php', extraFiles: [] }).map((t) => t.path), ['.release-please-manifest.json', 'composer.json']);
  assert.deepStrictEqual(M.resolveTargets({ releaseType: 'go', extraFiles: [] }).map((t) => t.path), ['.release-please-manifest.json']);
  assert.deepStrictEqual(M.resolveTargets({ releaseType: 'simple', extraFiles: ['VERSION.txt', { type: 'json', path: 'p.json', jsonpath: '$.version' }] }).map((t) => [t.path, t.kind]),
    [['.release-please-manifest.json', 'manifest'], ['version.txt', 'text'], ['VERSION.txt', 'generic'], ['p.json', 'json']]);
  assert.throws(() => M.resolveTargets({ releaseType: 'java', extraFiles: [] }), (e) => e instanceof M.ManifestError && /java/.test(e.message) && /simple/.test(e.message));
  assert.throws(() => M.resolveTargets({ releaseType: 'simple', extraFiles: [{ type: 'yaml', path: 'x.yml' }] }), /yaml/);
  assert.throws(() => M.resolveTargets({ releaseType: 'simple', extraFiles: [{ type: 'json', path: 'p.json', jsonpath: '$.nested.version' }] }), /jsonpath/);
});

test('spliceVersion json: only the version token changes, formatting untouched, previous reported', () => {
  const text = '{\n\t"name": "x",\n\t"version": "1.2.0",\n\t"dependencies": {"y": {"version": "9.9.9"}}\n}\n';
  const out = M.spliceVersion('json', text, '1.3.0');
  assert.strictEqual(out.text, text.replace('"1.2.0"', '"1.3.0"'));
  assert.strictEqual(out.previous, '1.2.0');
  assert.strictEqual(M.spliceVersion('json', '{"name":"x"}', '1.3.0').found, false);
});

test('spliceVersion json-lock: the first two root tokens change, nested dependency versions do not', () => {
  const text = '{\n  "name": "x",\n  "version": "1.2.0",\n  "packages": {\n    "": {\n      "version": "1.2.0"\n    },\n    "node_modules/y": {\n      "version": "1.2.0"\n    }\n  }\n}\n';
  const out = M.spliceVersion('json-lock', text, '1.3.0');
  assert.strictEqual((out.text.match(/1\.3\.0/g) || []).length, 2);
  assert.ok(out.text.includes('"node_modules/y": {\n      "version": "1.2.0"'));
  // lockfileVersion 1: no packages block — only the root token changes, never the first dependency's pin (ruling 9)
  const v1 = '{\n  "name": "x",\n  "version": "1.2.0",\n  "lockfileVersion": 1,\n  "dependencies": {\n    "y": {\n      "version": "1.2.0"\n    }\n  }\n}\n';
  const o1 = M.spliceVersion('json-lock', v1, '1.3.0');
  assert.strictEqual((o1.text.match(/1\.3\.0/g) || []).length, 1);
  assert.ok(o1.text.includes('"y": {\n      "version": "1.2.0"'));
  // a packages[""] entry without its own version must not leak the second splice into a dependency
  const noInner = '{\n  "version": "1.2.0",\n  "packages": {\n    "": {\n      "name": "x"\n    },\n    "node_modules/y": {\n      "version": "1.2.0"\n    }\n  }\n}\n';
  assert.strictEqual((M.spliceVersion('json-lock', noInner, '1.3.0').text.match(/1\.3\.0/g) || []).length, 1);
});

test('spliceVersion toml: the version under the named section, other sections untouched', () => {
  const text = '[build-system]\nversion = "0.0.1"\n\n[project]\nname = "x"\nversion = "1.2.0"   # keep comment\n\n[tool.poetry]\nversion = "1.2.0"\n';
  const out = M.spliceVersion('toml', text, '1.3.0', { sections: ['project', 'tool.poetry'] });
  assert.strictEqual(out.text, text.replace('version = "1.2.0"   # keep', 'version = "1.3.0"   # keep'));
  assert.strictEqual(out.previous, '1.2.0');
  const poetryOnly = '[tool.poetry]\nversion = "1.2.0"\n';
  assert.strictEqual(M.spliceVersion('toml', poetryOnly, '1.3.0', { sections: ['project', 'tool.poetry'] }).text, '[tool.poetry]\nversion = "1.3.0"\n');
});

test('spliceVersion text/generic/manifest', () => {
  assert.deepStrictEqual(M.spliceVersion('text', '1.2.0\n', '1.3.0'), { text: '1.3.0\n', found: true, previous: '1.2.0' });
  assert.deepStrictEqual(M.spliceVersion('text', null, '1.3.0'), { text: '1.3.0', found: false, previous: null });
  const gen = 'FOO=1\nAPP_VERSION=1.2.0 # x-release-please-version\nOTHER=1.2.0\n';
  assert.strictEqual(M.spliceVersion('generic', gen, '1.3.0').text, 'FOO=1\nAPP_VERSION=1.3.0 # x-release-please-version\nOTHER=1.2.0\n');
  assert.strictEqual(M.spliceVersion('manifest', '{\n  ".": "1.2.0"\n}\n', '1.3.0').text, '{\n  ".": "1.3.0"\n}\n');
});

test('currentVersion / versionAtRef: manifest file first, then the stack manifest, null when nothing carries a version', () => {
  const t = M.resolveTargets({ releaseType: 'node', extraFiles: [] });
  assert.strictEqual(M.currentVersion(t, files({ '.release-please-manifest.json': '{".": "1.2.0"}', 'package.json': '{"version": "1.1.0"}' }).readFile), '1.2.0');
  assert.strictEqual(M.currentVersion(t, files({ 'package.json': '{"version": "1.1.0"}' }).readFile), '1.1.0');
  assert.strictEqual(M.currentVersion(t, files({}).readFile), null);
  const show = (p) => { if (p === 'package.json') return '{"version": "1.1.0"}'; throw new Error(`fatal: path '${p}' does not exist in 'main'`); };
  assert.strictEqual(M.versionAtRef(t, show), '1.1.0');
  const bad = () => { throw new Error('fatal: invalid object name'); };
  assert.throws(() => M.versionAtRef(t, bad), /invalid object name/);
});

test('applyVersion: writes only files that exist (optional targets skipped, text created), reports previous values', () => {
  const store = { 'package.json': '{"version": "1.2.0"}\n' };
  const writes = [];
  const t = M.resolveTargets({ releaseType: 'node', extraFiles: [] });
  const out = M.applyVersion(t, '1.2.0', '1.3.0', (p) => (p in store ? store[p] : null), (p, text) => { writes.push(p); store[p] = text; });
  assert.deepStrictEqual(writes, ['package.json']);
  assert.deepStrictEqual(out, [{ path: 'package.json', previous: '1.2.0' }]);
  assert.strictEqual(store['package.json'], '{"version": "1.3.0"}\n');
  const simple = M.resolveTargets({ releaseType: 'simple', extraFiles: [] });
  const s2 = {}; const w2 = [];
  M.applyVersion(simple, null, '0.2.0', (p) => (p in s2 ? s2[p] : null), (p, text) => { w2.push(p); s2[p] = text; });
  assert.deepStrictEqual(w2, ['version.txt']);
  assert.strictEqual(s2['version.txt'], '0.2.0');
  assert.throws(() => M.applyVersion(t, '1.2.0', '1.3.0', () => '{"name":"x"}', () => {}), /no version token/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node -e "require('./plugin/bin/lib/release-local/manifest.js')"`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write the implementation**

```js
'use strict';
// bin/lib/release-local/manifest.js — byte-preserving version edits for the
// local release engine (#2254). The stack → manifest mapping cites
// skills/init/bootstrap/step-21-release.md's table (code twin
// RELEASE_STACK_TABLE in bin/lib/init/release-bootstrap.js); the engine reads
// the bootstrap-written release-please-config.json rather than re-detecting.
// Every edit is a raw string splice of the version token — never
// JSON.parse+stringify, never a TOML re-emit — so a release diff shows one
// token per file (spec: byte-preserving AC).

// Only genuine path absence reads as "no version here". A bad ref (`invalid
// object name`) is a git error and propagates — unlike manifest-path.js's
// NOT_FOUND_ERROR_RE, which folds both because its callers key on the
// distinction downstream. (Plan ruling 8: Task 3's implementer caught the
// brief's original NOT_FOUND_ERROR_RE reuse contradicting its own test.)
const PATH_ABSENT_RE = /does not exist|exists on disk, but not in/i;

const CONFIG_FILE = 'release-please-config.json';
const MANIFEST_FILE = '.release-please-manifest.json';
const SEMVER = '\\d+\\.\\d+\\.\\d+';
// Stack manifests by release-type (step-21-release.md's table). go has no
// manifest (tag only); java/ruby/dotnet need per-project version files the
// local engine does not model — point them at `simple` + extra-files.
const STACK_TARGETS = {
  node: [{ path: 'package.json', kind: 'json' }, { path: 'package-lock.json', kind: 'json-lock', optional: true }],
  php: [{ path: 'composer.json', kind: 'json' }],
  python: [{ path: 'pyproject.toml', kind: 'toml', sections: ['project', 'tool.poetry'] }],
  rust: [{ path: 'Cargo.toml', kind: 'toml', sections: ['package'] }],
  go: [],
  simple: [{ path: 'version.txt', kind: 'text', create: true }],
};
const UNSUPPORTED = new Set(['java', 'ruby', 'dotnet']);

class ManifestError extends Error {}

function readConfig(readFile) {
  const text = readFile(CONFIG_FILE);
  if (text === null || text === undefined) return null;
  let cfg;
  try { cfg = JSON.parse(text); } catch (e) { throw new ManifestError(`${CONFIG_FILE} is not valid JSON: ${e.message}`); }
  const pkg = (cfg.packages && cfg.packages['.']) || {};
  const releaseType = pkg['release-type'] || cfg['release-type'] || null;
  const extraFiles = pkg['extra-files'] || cfg['extra-files'] || [];
  if (!releaseType) throw new ManifestError(`${CONFIG_FILE} names no release-type for package "."`);
  return { releaseType, extraFiles };
}

function extraFileTarget(entry) {
  if (typeof entry === 'string') return { path: entry, kind: 'generic' };
  if (entry && entry.type === 'json') {
    if (entry.jsonpath !== '$.version') throw new ManifestError(`extra-files jsonpath ${entry.jsonpath} is unsupported — the local engine splices $.version only`);
    return { path: entry.path, kind: 'json' };
  }
  throw new ManifestError(`extra-files entry of type ${entry && entry.type} is unsupported by the local engine (json or a generic x-release-please-version path)`);
}

function resolveTargets({ releaseType, extraFiles = [] }) {
  if (UNSUPPORTED.has(releaseType)) {
    throw new ManifestError(`release-type ${releaseType} manifest edits are unsupported by the local engine — use release-type simple with extra-files naming the version-bearing file`);
  }
  const stack = STACK_TARGETS[releaseType];
  if (!stack) throw new ManifestError(`unknown release-type ${releaseType}`);
  return [{ path: MANIFEST_FILE, kind: 'manifest', optional: true }, ...stack, ...extraFiles.map(extraFileTarget)];
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function spliceMatch(text, re, to, group) {
  const m = re.exec(text);
  if (!m) return { text, found: false, previous: null };
  const start = m.index + m[0].indexOf(m[group], m[1].length);
  return { text: text.slice(0, start) + to + text.slice(start + m[group].length), found: true, previous: m[group] };
}

function spliceJsonKey(text, key, to, occurrences = 1) {
  const re = new RegExp(`("${escapeRe(key)}"\\s*:\\s*")(${SEMVER})(")`, 'g');
  let out = text; let previous = null; let found = 0; let shift = 0;
  let m;
  while (found < occurrences && (m = re.exec(text)) !== null) {
    const start = m.index + m[1].length + shift;
    out = out.slice(0, start) + to + out.slice(start + m[2].length);
    shift += to.length - m[2].length;
    if (previous === null) previous = m[2];
    found += 1;
  }
  return { text: out, found: found > 0, previous };
}

// package-lock.json: the root "version" plus, on lockfileVersion 2/3, the
// packages[""] entry's own "version" — never a dependency's. A v1 lockfile
// has no packages block, and a blind second occurrence there would be the
// first dependency's pin (ruling 9, Task 3 review). The packages[""] search
// is bounded by the first "node_modules/ key so an entry without a version
// cannot leak the match into a dependency either.
function spliceJsonLock(text, to) {
  const root = spliceJsonKey(text, 'version', to, 1);
  const block = /"packages"\s*:\s*\{\s*""\s*:\s*\{/.exec(root.text);
  if (!block) return root;
  const at = block.index + block[0].length;
  const end = root.text.indexOf('"node_modules/', at);
  const scope = end === -1 ? root.text.slice(at) : root.text.slice(at, end);
  const inner = spliceJsonKey(scope, 'version', to, 1);
  const rest = end === -1 ? '' : root.text.slice(end);
  return { text: root.text.slice(0, at) + inner.text + rest, found: root.found || inner.found, previous: root.previous };
}

function spliceToml(text, sections, to) {
  for (const section of sections) {
    const header = new RegExp(`^\\[${escapeRe(section)}\\][ \\t]*$`, 'm').exec(text);
    if (!header) continue;
    const bodyStart = header.index + header[0].length;
    const rest = text.slice(bodyStart);
    const next = /^\[/m.exec(rest);
    const body = next ? rest.slice(0, next.index) : rest;
    const vm = new RegExp(`^([ \\t]*version[ \\t]*=[ \\t]*")(${SEMVER})(")`, 'm').exec(body);
    if (!vm) continue;
    const start = bodyStart + vm.index + vm[1].length;
    return { text: text.slice(0, start) + to + text.slice(start + vm[2].length), found: true, previous: vm[2] };
  }
  return { text, found: false, previous: null };
}

function spliceVersion(kind, text, to, opts = {}) {
  switch (kind) {
    case 'json': return spliceJsonKey(text, 'version', to, 1);
    case 'json-lock': return spliceJsonLock(text, to);
    case 'manifest': return spliceJsonKey(text, '.', to, 1);
    case 'toml': return spliceToml(text, opts.sections || [], to);
    case 'text': {
      if (text === null || text === undefined) return { text: to, found: false, previous: null };
      return spliceMatch(text, new RegExp(`()(${SEMVER})`), to, 2);
    }
    case 'generic': {
      const lines = text.split('\n');
      let previous = null;
      const out = lines.map((line) => {
        if (previous !== null || !line.includes('x-release-please-version')) return line;
        const m = new RegExp(SEMVER).exec(line);
        if (!m) return line;
        previous = m[0];
        return line.slice(0, m.index) + to + line.slice(m.index + m[0].length);
      });
      return { text: out.join('\n'), found: previous !== null, previous };
    }
    default: throw new ManifestError(`unknown manifest kind ${kind}`);
  }
}

function versionOfText(target, text) {
  if (text === null || text === undefined) return null;
  const probe = spliceVersion(target.kind, text, '0.0.0', target);
  return probe.found ? probe.previous : null;
}

// First target whose file carries a version token: manifest file, then the
// stack manifest, then extra-files. Absent files read as null; anything else
// the reader throws propagates (a git error is never "no version").
function firstVersion(targets, read) {
  for (const target of targets) {
    if (target.kind === 'generic') continue;
    let text;
    try {
      text = read(target.path);
    } catch (err) {
      if (PATH_ABSENT_RE.test(String(err.message || err))) continue;
      throw err;
    }
    const v = versionOfText(target, text);
    if (v !== null) return v;
  }
  return null;
}

function currentVersion(targets, readFile) { return firstVersion(targets, readFile); }
function versionAtRef(targets, show) { return firstVersion(targets, show); }

function applyVersion(targets, from, to, readFile, writeFile) {
  const written = [];
  for (const target of targets) {
    const text = readFile(target.path);
    if ((text === null || text === undefined) && !target.create) {
      if (target.optional) continue;
      throw new ManifestError(`${target.path} is missing — the release-type names it as the manifest`);
    }
    const out = spliceVersion(target.kind, text, to, target);
    if (!out.found && !target.create) throw new ManifestError(`${target.path} carries no version token to bump`);
    if (out.text === text) continue;
    writeFile(target.path, out.text);
    written.push({ path: target.path, previous: out.previous });
  }
  return written;
}

module.exports = {
  CONFIG_FILE, MANIFEST_FILE, STACK_TARGETS, ManifestError,
  readConfig, resolveTargets, spliceVersion, currentVersion, versionAtRef, applyVersion,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/release-local/manifest.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/release-local/manifest.js tests/bin-lib/release-local/manifest.test.js
git commit -m "Add release-local manifest.js — config-driven targets and byte-preserving version splices for json, toml, text and generic files, refs #2254

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

### Task 4: `changelog.js` — release-please grammar, pinned by captured fixtures

**Files:**
- Create: `plugin/bin/lib/release-local/changelog.js`
- Test: `tests/bin-lib/release-local/changelog.test.js`, `tests/bin-lib/release-local/changelog-fixture.test.js`
- Fixtures (already committed with this plan — do not edit): `tests/bin-lib/release-local/fixtures/release-please-17.11.0.md` (sha256 `4e4609632595afb3692dbd057e51d936de0c9b408d2271b4253d559d8e975e03`) and `tests/bin-lib/release-local/fixtures/release-please-17.0.0.md` (sha256 `e1dccde9de592640a41cce2ab39162844f740ba601e53f9fcd377806e814a49a`), captured verbatim from `googleapis/release-please`'s own `CHANGELOG.md` at `c65408d9f68b2772c6e61dcdc4a8b6f5969bb4e1` (release-please 17.11.2's tree, 2026-09-12).

**Interfaces:**
- Consumes: `Commit` objects from Task 1.
- Produces: `SECTIONS`, `parseGitHubRemote(url) -> {owner, repo, url}|null`, `renderSection({version, previousTag, date, commits, repo}) -> string`, `prependSection(existing, section) -> string`.

**Grammar (derived byte-for-byte from the fixtures):** heading `## [X.Y.Z](repo/compare/vPREV...vX.Y.Z) (YYYY-MM-DD)` (or `## X.Y.Z (date)` without a GitHub origin or a previous tag) + `\n\n\n`; an optional `### ⚠ BREAKING CHANGES\n\n` block of `* [**scope:** ]note\n` lines followed by one `\n`; then groups `### Title\n\n` + `* [**scope:** ]description[ ([sha7](repo/commit/sha))]\n` lines, groups joined by `\n\n`; the section ends after its last bullet's `\n`. PR links are never emitted (local-merge has none).

- [ ] **Step 1: Write the failing tests**

`tests/bin-lib/release-local/changelog.test.js`:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderSection, prependSection, parseGitHubRemote } = require('../../../plugin/bin/lib/release-local/changelog.js');

const sha = (ch) => ch.repeat(40);
const commit = (type, description, extra = {}) => ({ sha: sha(description[0]), type, scope: null, breaking: false, breakingNote: null, description, unconventional: false, ...extra });

test('parseGitHubRemote: https, ssh, scp-like, .git-suffixed; non-GitHub is null', () => {
  for (const u of ['https://github.com/o/r', 'https://github.com/o/r.git', 'git@github.com:o/r.git', 'ssh://git@github.com/o/r.git']) {
    assert.deepStrictEqual(parseGitHubRemote(u), { owner: 'o', repo: 'r', url: 'https://github.com/o/r' });
  }
  assert.strictEqual(parseGitHubRemote('https://gitlab.com/o/r.git'), null);
  assert.strictEqual(parseGitHubRemote(null), null);
});

test('renderSection without a GitHub origin: unlinked heading, no commit links, hidden types omitted', () => {
  const out = renderSection({ version: '1.3.0', previousTag: 'v1.2.0', date: '2026-09-12', repo: null,
    commits: [commit('fix', 'b'), commit('feat', 'a'), commit('chore', 'c'), commit('fix', 'd')] });
  assert.strictEqual(out, '## 1.3.0 (2026-09-12)\n\n\n### Features\n\n* a\n\n\n### Bug Fixes\n\n* b\n* d\n');
});

test('renderSection with a GitHub origin and no previous tag: unlinked heading, linked commits', () => {
  const repo = { owner: 'o', repo: 'r', url: 'https://github.com/o/r' };
  const out = renderSection({ version: '1.0.0', previousTag: null, date: '2026-09-12', repo, commits: [commit('feat', 'a')] });
  assert.strictEqual(out, `## 1.0.0 (2026-09-12)\n\n\n### Features\n\n* a ([aaaaaaa](https://github.com/o/r/commit/${sha('a')}))\n`);
});

test('renderSection: breaking notes block, and a hidden type renders when breaking', () => {
  const out = renderSection({ version: '2.0.0', previousTag: 'v1.3.0', date: '2026-09-12', repo: null,
    commits: [commit('chore', 'z', { scope: 'deps', breaking: true, breakingNote: 'drop node 16' }), commit('fix', 'b')] });
  assert.strictEqual(out, '## 2.0.0 (2026-09-12)\n\n\n### ⚠ BREAKING CHANGES\n\n* **deps:** drop node 16\n\n### Bug Fixes\n\n* b\n\n\n### Miscellaneous Chores\n\n* **deps:** z\n');
});

test('prependSection: before the first version heading, blank-line separated; a fresh file gets the Changelog title', () => {
  const existing = '# Changelog\n\nintro\n\n## [1.2.0](u) (2026-01-01)\n\n\n### Features\n\n* old\n';
  const section = '## 1.3.0 (2026-09-12)\n\n\n### Bug Fixes\n\n* b\n';
  assert.strictEqual(prependSection(existing, section), '# Changelog\n\nintro\n\n' + section + '\n## [1.2.0](u) (2026-01-01)\n\n\n### Features\n\n* old\n');
  assert.strictEqual(prependSection(null, section), '# Changelog\n\n' + section);
  assert.strictEqual(prependSection('# Changelog\n\n## v6.70.0 — old grammar\n\nBody.\n', section), '# Changelog\n\n' + section + '\n## v6.70.0 — old grammar\n\nBody.\n');
});
```

`tests/bin-lib/release-local/changelog-fixture.test.js`:

```js
'use strict';
// The grammar pin behind design stance 4: the local engine must reproduce a
// real release-please section byte-for-byte (minus PR links, which do not
// exist under local-merge). A failure here means release-please's grammar
// moved — re-capture the fixture; never loosen this assertion.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { renderSection } = require('../../../plugin/bin/lib/release-local/changelog.js');

const FIXTURES = path.join(__dirname, 'fixtures');
const read = (name) => fs.readFileSync(path.join(FIXTURES, name), 'utf8');
const stripPrLinks = (text) => text.replace(/ \(\[#\d+\]\(https:\/\/github\.com\/[^)]*\/issues\/\d+\)\)/g, '');
const repo = { owner: 'googleapis', repo: 'release-please', url: 'https://github.com/googleapis/release-please' };
const commit = (type, scope, description, sha, extra = {}) => ({ sha, type, scope, description, subject: `${type}${scope ? `(${scope})` : ''}: ${description}`, breaking: false, breakingNote: null, unconventional: false, ...extra });

test('17.11.0: two features and a scoped fix reproduce the captured section byte-for-byte', () => {
  const out = renderSection({
    version: '17.11.0', previousTag: 'v17.10.4', date: '2026-07-28', repo,
    commits: [
      commit('fix', 'deps', 'update brace-expansion to address Dependabot alerts [#99](https://github.com/googleapis/release-please/issues/99) and [#100](https://github.com/googleapis/release-please/issues/100)', 'e9e921a89fc7ae36dbd10184ffc1dfbfb33c29b2'),
      commit('feat', null, 'add ruby-librarian strategy', 'cb1b17992ca4b9f97b838c6e3466cc8f654bcc04'),
      commit('feat', null, 'add PHPLibrarian strategy', '9aa4fc069f502094b3e79c323677af860c9d64d8'),
    ].reverse(),
  });
  assert.strictEqual(out, stripPrLinks(read('release-please-17.11.0.md')));
});

test('17.0.0: a breaking scoped feat renders the notes block and the Features bullet', () => {
  const out = renderSection({
    version: '17.0.0', previousTag: 'v16.18.0', date: '2025-03-11', repo,
    commits: [commit('feat', 'deps', 'update octokit to v20', '9f3b6699474b0ff1987ef3ad4ca5a96ce69d9a6a', { breaking: true, breakingNote: 'update octokit to v20' })],
  });
  assert.strictEqual(out, stripPrLinks(read('release-please-17.0.0.md')));
});

test('the fixtures are the captured bytes (re-capture, never edit)', () => {
  const crypto = require('crypto');
  const sha256 = (name) => crypto.createHash('sha256').update(fs.readFileSync(path.join(FIXTURES, name))).digest('hex');
  assert.strictEqual(sha256('release-please-17.11.0.md'), '4e4609632595afb3692dbd057e51d936de0c9b408d2271b4253d559d8e975e03');
  assert.strictEqual(sha256('release-please-17.0.0.md'), 'e1dccde9de592640a41cce2ab39162844f740ba601e53f9fcd377806e814a49a');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node -e "require('./plugin/bin/lib/release-local/changelog.js')"`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write the implementation**

```js
'use strict';
// bin/lib/release-local/changelog.js — renders one CHANGELOG section in
// release-please's grammar (design stance 5) so a project can move between
// pr-first (release-please) and local-merge (this engine) with no format
// boundary. The byte grammar is pinned by tests/bin-lib/release-local/
// changelog-fixture.test.js against sections captured from release-please's
// own CHANGELOG; change this file only with a re-captured fixture in hand.
// Under local-merge there are no PRs, so no PR links; commit links and the
// compare URL need a repo URL, so both appear only when `origin` parses as a
// GitHub remote (ruling 1 in the plan).

// release-please's default changelog-sections: order is render order; hidden
// types render only when the commit is breaking (ruling 2).
const SECTIONS = [
  { type: 'feat', title: 'Features', hidden: false },
  { type: 'fix', title: 'Bug Fixes', hidden: false },
  { type: 'perf', title: 'Performance Improvements', hidden: false },
  { type: 'revert', title: 'Reverts', hidden: false },
  { type: 'docs', title: 'Documentation', hidden: true },
  { type: 'style', title: 'Styles', hidden: true },
  { type: 'chore', title: 'Miscellaneous Chores', hidden: true },
  { type: 'refactor', title: 'Code Refactoring', hidden: true },
  { type: 'test', title: 'Tests', hidden: true },
  { type: 'build', title: 'Build System', hidden: true },
  { type: 'ci', title: 'Continuous Integration', hidden: true },
];

const GITHUB_REMOTE_RE = /^(?:https?:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/;

function parseGitHubRemote(url) {
  const m = GITHUB_REMOTE_RE.exec(String(url || '').trim());
  return m ? { owner: m[1], repo: m[2], url: `https://github.com/${m[1]}/${m[2]}` } : null;
}

const scopePrefix = (c) => (c.scope ? `**${c.scope}:** ` : '');

function bullet(c, repo) {
  const link = repo ? ` ([${c.sha.slice(0, 7)}](${repo.url}/commit/${c.sha}))` : '';
  return `* ${scopePrefix(c)}${c.description}${link}\n`;
}

function note(c) { return `* ${scopePrefix(c)}${c.breakingNote}\n`; }

function renderSection({ version, previousTag, date, commits, repo }) {
  const heading = repo && previousTag
    ? `## [${version}](${repo.url}/compare/${previousTag}...v${version}) (${date})`
    : `## ${version} (${date})`;
  const breaking = commits.filter((c) => c.breaking);
  const groups = [];
  for (const section of SECTIONS) {
    const list = commits.filter((c) => c.type === section.type && (!section.hidden || c.breaking));
    if (list.length) groups.push(`### ${section.title}\n\n${list.map((c) => bullet(c, repo)).join('')}`);
  }
  const notes = breaking.length ? `### ⚠ BREAKING CHANGES\n\n${breaking.map(note).join('')}\n` : '';
  return `${heading}\n\n\n${notes}${groups.join('\n\n')}`;
}

// Insert before the first version heading (release-please's `## [x](…)`,
// `## x (…)`, or this repo's legacy `## vX.Y.Z — …` — the boundary case the
// design's Non-goals keep: pre-boundary entries stay in their old form).
const FIRST_VERSION_HEADING_RE = /^##+ \[?v?\d+\.\d+\.\d+/m;

function prependSection(existing, section) {
  if (existing === null || existing === undefined || existing.trim() === '') return `# Changelog\n\n${section}`;
  const at = existing.search(FIRST_VERSION_HEADING_RE);
  if (at === -1) return `${existing.replace(/\s*$/, '')}\n\n${section}`;
  return `${existing.slice(0, at)}${section}\n${existing.slice(at)}`;
}

module.exports = { SECTIONS, parseGitHubRemote, renderSection, prependSection };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/release-local/changelog.test.js tests/bin-lib/release-local/changelog-fixture.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/release-local/changelog.js tests/bin-lib/release-local/changelog.test.js tests/bin-lib/release-local/changelog-fixture.test.js
git commit -m "Add release-local changelog.js — release-please grammar renderer pinned byte-for-byte by the captured fixtures, refs #2254

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

### Task 5: `precheck.js` `keySource` + `run.js` guard/push helpers

**Files:**
- Modify: `plugin/bin/lib/release/precheck.js` (whole file — `collectClaims`/`precheck` gain an `opts` argument; `'tsv'` default keeps every existing test green)
- Modify: `plugin/bin/lib/release/run.js:62-74` (also lines 7-12; extract `guardReleasableTree` and `pushAfterAncestryCheck`; `runRelease` calls them)
- Test: `tests/bin-lib/release/precheck.test.js` (append AC 8 cases), `tests/bin-lib/release/run.test.js` (append two helper tests)

**Interfaces:**
- Produces: `collectClaims(deps, opts)`, `precheck(deps, part, opts)` with `opts = { keySource: 'tsv'|'tags' (default 'tsv'), branch (default 'main'), hasOrigin (default true), versionAtRef(ref) (default manifestVersionAtRef) }`; claims gain `tagTip`. `checkCollisions(candidate, claims, part?)`. `guardReleasableTree(deps, {branch})`, `pushAfterAncestryCheck(deps, {branch, refs, onDiverged})` from `run.js`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/release/precheck.test.js`:

```js
// AC 8: the same module serves release.js ('tsv') and release-local.js ('tags')
// without either caller's collision detection changing under the other.
function tagDeps({ tags, local = '1.2.0', origin = '1.2.0', hasOrigin = true, worktrees = 'worktree /repo\nbranch refs/heads/main\n', wtVersion = '1.2.0' } = {}) {
  const versions = { main: local, 'origin/main': origin, 'wt-feature': wtVersion };
  const git = fakeGit([
    ['fetch origin main', () => ''],
    ['worktree list --porcelain', () => worktrees],
    ['tag -l v*', () => tags],
  ]);
  return { git, listPlanFiles: () => [], readFile: () => '', versionAtRef: (ref) => versions[ref] };
}

test('keySource tags: the highest v* tag raises the base past a stale manifest; no tsv read', () => {
  const deps = tagDeps({ tags: 'v1.0.0\nv1.2.0\nv1.2.1\nv2.0.0-rc.1\n', local: '1.2.0', origin: '1.2.0' });
  const { candidate, claims, result } = precheck(deps, 'minor', { keySource: 'tags', versionAtRef: deps.versionAtRef });
  assert.strictEqual(claims.tagTip, '1.2.1');
  assert.strictEqual(claims.tsvTip, null);
  assert.strictEqual(candidate, '1.3.0');
  assert.strictEqual(result.ok, true);
  assert.ok(!deps.git.calls.some((c) => c.includes('shipped-versions.tsv')));
});

test('keySource tags without an origin: no fetch, no origin read, base from the tag', () => {
  const deps = tagDeps({ tags: 'v1.2.0\n' });
  const { candidate } = precheck(deps, 'major', { keySource: 'tags', hasOrigin: false, versionAtRef: (ref) => (ref === 'main' ? '1.2.0' : assert.fail(`unexpected ref ${ref}`)) });
  assert.strictEqual(candidate, '2.0.0');
  assert.ok(!deps.git.calls.some((c) => c.startsWith('fetch')));
});

test('keySource tags: a sibling worktree bump still collides; the renumber follows the requested part', () => {
  const deps = tagDeps({ tags: 'v1.2.0\n', worktrees: SIBLING_WORKTREES, wtVersion: '1.3.0' });
  const { result } = precheck(deps, 'minor', { keySource: 'tags', versionAtRef: deps.versionAtRef });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.conflicts[0].source, 'worktree-branch');
  assert.strictEqual(result.suggested, '1.4.0');
});

test('keySource tags: a stack with no manifest at all (go) bases on the tag alone', () => {
  const deps = tagDeps({ tags: 'v0.4.0\n' });
  const { candidate } = precheck(deps, 'patch', { keySource: 'tags', versionAtRef: () => null });
  assert.strictEqual(candidate, '0.4.1');
});

test('keySource tsv is byte-for-byte the pre-#2254 path (default when opts are omitted)', () => {
  const a = precheck(baseDeps({ tsv: '6.70.1\t2026-08-09\trelease\n6.71.0\t2026-08-09\twip-never-shipped\n' }), 'minor');
  const b = precheck(baseDeps({ tsv: '6.70.1\t2026-08-09\trelease\n6.71.0\t2026-08-09\twip-never-shipped\n' }), 'minor', { keySource: 'tsv' });
  assert.deepStrictEqual(a, b);
  assert.strictEqual(a.claims.tagTip, null);
  assert.throws(() => precheck(baseDeps(), 'minor', { keySource: 'labels' }), /keySource/);
});
```

Append to `tests/bin-lib/release/run.test.js` (the file already imports `runRelease`; add `guardReleasableTree, pushAfterAncestryCheck` to that require):

```js
test('guardReleasableTree: branch and clean-tree checks, parameterized by branch', () => {
  const calls = [];
  const deps = { git: (a) => { calls.push(a.join(' ')); return a[0] === 'branch' ? 'develop\n' : ''; } };
  assert.throws(() => guardReleasableTree(deps, { branch: 'main' }), /releases run from main; current branch is "develop"/);
  guardReleasableTree(deps, { branch: 'develop' });
  const dirty = { git: (a) => (a[0] === 'branch' ? 'main\n' : ' M x.js\n') };
  assert.throws(() => guardReleasableTree(dirty, { branch: 'main' }), /tracked modifications/);
});

test('pushAfterAncestryCheck: fetch → ancestry → push of every ref; divergence throws the caller\'s message and pushes nothing', () => {
  const calls = [];
  const ok = { git: (a) => { calls.push(a.join(' ')); return ''; } };
  pushAfterAncestryCheck(ok, { branch: 'main', refs: ['main', 'v1.3.0'], onDiverged: 'moved' });
  assert.deepStrictEqual(calls, ['fetch origin main', 'merge-base --is-ancestor origin/main HEAD', 'push origin main v1.3.0']);
  const diverged = { git: (a) => { if (a[0] === 'merge-base') throw new Error('no'); calls.push(`d:${a[0]}`); return ''; } };
  assert.throws(() => pushAfterAncestryCheck(diverged, { branch: 'main', refs: ['main'], onDiverged: 'origin moved — recover by hand' }), /origin moved — recover by hand/);
  assert.ok(!calls.includes('d:push'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node -e "const p=require('./plugin/bin/lib/release/precheck.js'); const r=require('./plugin/bin/lib/release/run.js'); if (typeof r.guardReleasableTree !== 'function') throw new Error('guardReleasableTree missing'); p.precheck({git:()=>''},'minor',{keySource:'labels'})"`
Expected: FAIL with "guardReleasableTree missing"

- [ ] **Step 3: Implement**

`plugin/bin/lib/release/precheck.js` — replace `collectClaims` and `precheck` (keep `VERSION_IN_TEXT`, `checkCollisions` otherwise as-is; `checkCollisions` gains the optional third argument):

```js
// keySource: 'tsv' — this repo's own release.js path (docs/shipped-versions.tsv
// tombstones raise the base, manifest reads at plugin/.claude-plugin/plugin.json);
// 'tags' — release-local.js (#2254): the highest strict-semver v* tag raises
// the base instead, manifest reads go through the caller's versionAtRef, and
// hasOrigin:false skips the fetch and the origin read. One keySource per call —
// never both in one check (spec Gotchas).
function highestTag(deps) {
  let tip = null;
  for (const line of deps.git(['tag', '-l', 'v*']).split('\n')) {
    const v = line.trim().replace(/^v/, '');
    if (/^\d+\.\d+\.\d+$/.test(v) && (!tip || compareVersions(v, tip) > 0)) tip = v;
  }
  return tip;
}

function tsvTip(deps) {
  // The tsv's own tip participates in the base: a version can be documented
  // (a wip-never-shipped tombstone line) without the manifest ever reaching it,
  // and deriving the candidate from the manifest alone then lands exactly on
  // the burned number — compose's duplicate-heading guard aborts, and no
  // renumber suggestion ever fires because the tombstone is not a "claim".
  // Observed live releasing after 6.75.0's reverted premature bump. A missing
  // tsv (a repo predating it) contributes nothing rather than aborting.
  let tip = null;
  try {
    const tsv = deps.git(['show', 'main:docs/shipped-versions.tsv']);
    for (const line of tsv.split('\n')) {
      const v = line.split('\t')[0];
      if (/^\d+\.\d+\.\d+$/.test(v) && (!tip || compareVersions(v, tip) > 0)) tip = v;
    }
  } catch (err) {
    if (!NOT_FOUND_ERROR_RE.test(String(err.message))) {
      throw new Error(`pre-check could not read docs/shipped-versions.tsv: ${err.message}`);
    }
  }
  return tip;
}

function collectClaims(deps, opts = {}) {
  const { keySource = 'tsv', branch = 'main', hasOrigin = true, versionAtRef = (ref) => manifestVersionAtRef(deps, ref) } = opts;
  if (keySource !== 'tsv' && keySource !== 'tags') throw new Error(`unknown keySource: ${keySource}`);
  const localMain = versionAtRef(branch);
  const originMain = hasOrigin ? versionAtRef(`origin/${branch}`) : localMain;

  const worktreeBranches = [];
  const porcelain = deps.git(['worktree', 'list', '--porcelain']);
  for (const line of porcelain.split('\n')) {
    const m = /^branch refs\/heads\/(.+)$/.exec(line.trim());
    if (!m || m[1] === branch) continue;
    let version;
    try {
      version = versionAtRef(m[1]);
    } catch (err) {
      // Only a genuinely absent manifest is "not a claim" — any other failure
      // (git error, malformed manifest JSON) aborts rather than silently weakening the check.
      if (NOT_FOUND_ERROR_RE.test(String(err.message))) {
        continue;
      }
      throw new Error(`pre-check could not read ${m[1]}'s manifest: ${err.message}`);
    }
    if (version !== null && version !== localMain) worktreeBranches.push({ branch: m[1], version });
  }

  const tags = keySource === 'tags' ? highestTag(deps) : null;
  const tsv = keySource === 'tsv' ? tsvTip(deps) : null;
  // Same-major only: a plan naming v20.12.0 in a repo at 6.x is citing a
  // dependency's version, not claiming a future plugin number.
  const reference = originMain || localMain || tags || '0.0.0';
  const planClaims = [];
  const referenceMajor = reference.split('.')[0];
  for (const file of deps.listPlanFiles()) {
    const text = deps.readFile(file);
    for (const match of text.matchAll(VERSION_IN_TEXT)) {
      if (match[1].split('.')[0] === referenceMajor && compareVersions(match[1], reference) > 0) {
        planClaims.push({ file, version: match[1] });
      }
    }
  }

  return { originMain, localMain, worktreeBranches, planClaims, tsvTip: tsv, tagTip: tags };
}

function checkCollisions(candidate, claims, part) {
  const conflicts = [];
  for (const wt of claims.worktreeBranches) {
    if (compareVersions(wt.version, candidate) >= 0) {
      conflicts.push({ source: 'worktree-branch', detail: wt.branch, version: wt.version });
    }
  }
  for (const claim of claims.planClaims) {
    if (compareVersions(claim.version, candidate) >= 0) {
      conflicts.push({ source: 'plan-claim', detail: claim.file, version: claim.version });
    }
  }
  let suggested = candidate;
  if (conflicts.length) {
    const highest = conflicts.map((c) => c.version).sort(compareVersions).pop();
    suggested = nextVersion(highest, part || (candidate.endsWith('.0') ? 'minor' : 'patch'));
  }
  return { ok: conflicts.length === 0, conflicts, suggested };
}

function precheck(deps, part, opts = {}) {
  const branch = opts.branch || 'main';
  if (opts.hasOrigin !== false) deps.git(['fetch', 'origin', branch]);
  const claims = collectClaims(deps, opts);
  const known = [claims.localMain, claims.originMain, claims.tsvTip, claims.tagTip].filter(Boolean);
  const base = known.length ? known.sort(compareVersions).pop() : '0.0.0';
  const candidate = nextVersion(base, part);
  return { candidate, claims, result: checkCollisions(candidate, claims, part) };
}
```

Keep `module.exports = { collectClaims, checkCollisions, precheck };`. Note the existing tsv-mode base rule (`localMain` vs `originMain` by `compareVersions`, then the tsv tip if higher) is exactly "max of the known values" — behaviour unchanged.

`plugin/bin/lib/release/run.js` — add the two helpers above `runRelease` and use them:

```js
// Reused by bin/release-local.js (#2254): the branch/clean-tree guard, and the
// fetch → ancestry re-check → push ordering. `onDiverged` is the caller's own
// partial-state message (the commit/tag already exist locally — do NOT re-run).
function guardReleasableTree(deps, { branch = 'main' } = {}) {
  const current = deps.git(['branch', '--show-current']).trim();
  if (current !== branch) throw new Error(`releases run from ${branch}; current branch is "${current}"`);
  if (deps.git(['status', '--porcelain', '--untracked-files=no']).trim() !== '') {
    throw new Error('working tree has tracked modifications — commit or restore them first');
  }
}

function pushAfterAncestryCheck(deps, { branch = 'main', refs = [branch], onDiverged }) {
  deps.git(['fetch', 'origin', branch]);
  try {
    deps.git(['merge-base', '--is-ancestor', `origin/${branch}`, 'HEAD']);
  } catch {
    throw new Error(onDiverged);
  }
  deps.git(['push', 'origin', ...refs]);
}
```

In `runRelease`: replace the first four lines of the body (branch + dirty checks) with `guardReleasableTree(deps, { branch: 'main' });` and replace the block from `deps.git(['fetch', 'origin', 'main']);` through `deps.git(['push', 'origin', 'main']);` with:

```js
  pushAfterAncestryCheck(deps, {
    branch: 'main',
    onDiverged: 'origin/main moved between pre-check and push. The release commit already exists locally — ' +
      'do NOT re-run the full release (it would bump a second time). Recover manually: ' +
      'git pull --rebase origin main, then git push origin main, then retry the marketplace mirror alone.',
  });
```

Export: `module.exports = { runRelease, guardReleasableTree, pushAfterAncestryCheck };`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/release/`
Expected: PASS — every pre-existing test unchanged, plus the seven new ones.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/release/precheck.js plugin/bin/lib/release/run.js tests/bin-lib/release/precheck.test.js tests/bin-lib/release/run.test.js
git commit -m "Parameterize release precheck by keySource (tsv | tags) and export run.js's guard and ancestry-checked push for the local engine, refs #2254

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

### Task 6: `plugin/bin/release-local.js` — the `run(argv, deps)` CLI

**Files:**
- Create: `plugin/bin/release-local.js`
- Test: `tests/bin-lib/release-local/cli.test.js`

**Interfaces:**
- Consumes: Tasks 1–5's exports; `resolvePolicyKeys` from `plugin/bin/lib/policy-schema.js` (`release-hook`, `integration-branch`).
- Produces: `run(argv, deps) -> exit code`, `parseArgs(argv)`, `USAGE`, `defaultDeps(root)`. `deps = { git(args), readFile(relPath) -> string|null, writeFile(relPath, text), runHook(command) -> exit code, today() -> 'YYYY-MM-DD', stdout(text), stderr(text) }`.

**Sequence:** parse → config (missing → 2) → branch → `guardReleasableTree` → history → bump (`none` → 3) → targets/current version → `precheck` (`keySource: 'tags'`; collision → 4) → hook lookup → render section → print plan → (`--dry-run` → 0) → manifest + CHANGELOG writes → `git add` + `git commit -m "chore(release): v{version}"` → `git tag -a v{version} -m "v{version}"` → `pushAfterAncestryCheck` (skipped without `origin`; failure → named partial + 1) → `release-hook` (non-zero → named partial + 5) → 0. Any throw before the first write → 1 "nothing written"; a throw after a write → 1 with the stage-named partial state and its recovery command.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { run, parseArgs } = require('../../../plugin/bin/release-local.js');

const SHA = 'f'.repeat(40);
const CONFIG = JSON.stringify({ packages: { '.': { 'release-type': 'node' } } });
const LOG = (subjects) => subjects.map((s, i) => `${String(i).repeat(40)}\x1f${s}\x1f\x1e\n`).join('');

function makeDeps(o = {}) {
  const state = {
    files: { 'release-please-config.json': CONFIG, '.release-please-manifest.json': '{\n  ".": "1.2.0"\n}\n', 'package.json': '{\n  "name": "x",\n  "version": "1.2.0"\n}\n', 'CHANGELOG.md': '# Changelog\n', ...(o.files || {}) },
    git: [], writes: [], out: '', err: '', hooks: [],
  };
  const deps = {
    git: (args) => {
      const key = args.join(' ');
      state.git.push(key);
      if (o.gitFail && o.gitFail(key)) throw new Error(`fatal: ${key} failed`);
      if (key === 'branch --show-current') return `${o.branch || 'main'}\n`;
      if (key === 'status --porcelain --untracked-files=no') return o.dirty || '';
      if (key === 'remote get-url origin') { if (o.noOrigin) throw new Error('fatal: No such remote'); return 'git@github.com:o/r.git\n'; }
      if (key.startsWith('describe')) { if (o.noTag) throw new Error('fatal: No names found, cannot describe anything.'); return 'v1.2.0\n'; }
      if (key.startsWith('log --first-parent')) return LOG(o.subjects || ['fix: a', 'feat: b', 'fix: c']);
      if (key.startsWith('fetch')) return '';
      if (key.startsWith('show ')) { const p = key.slice(key.indexOf(':') + 1); if (p in state.files) return state.files[p]; throw new Error(`fatal: path '${p}' does not exist`); }
      if (key === 'worktree list --porcelain') return o.worktrees || 'worktree /repo\nbranch refs/heads/main\n';
      if (key === 'tag -l v*') return o.tags === undefined ? 'v1.2.0\n' : o.tags;
      if (key.startsWith('add ') || key.startsWith('commit ') || key.startsWith('tag -a') || key.startsWith('push ') || key.startsWith('merge-base')) return '';
      throw new Error(`unexpected git: ${key}`);
    },
    readFile: (p) => (p in state.files ? state.files[p] : null),
    writeFile: (p, text) => { state.writes.push(p); state.files[p] = text; },
    runHook: (cmd) => { state.hooks.push(cmd); return o.hookExit === undefined ? 0 : o.hookExit; },
    today: () => '2026-09-12',
    stdout: (t) => { state.out += t; },
    stderr: (t) => { state.err += t; },
  };
  return { deps, state };
}

test('parseArgs: flags, unknown argument, --root without value', () => {
  assert.deepStrictEqual(parseArgs(['--dry-run', '--branch', 'develop']), { dryRun: false || true, branch: 'develop', root: null, help: false });
  assert.match(parseArgs(['--bogus']).error, /unknown argument/);
  assert.match(parseArgs(['--root']).error, /requires a value/);
});

test('exit 2: unknown flag, and a repo with no release-please-config.json (bootstrap first)', () => {
  const a = makeDeps();
  assert.strictEqual(run(['--bogus'], a.deps), 2);
  assert.match(a.state.err, /usage/);
  const b = makeDeps({ files: { 'release-please-config.json': null } });
  delete b.state.files['release-please-config.json'];
  assert.strictEqual(run([], b.deps), 2);
  assert.match(b.state.err, /release-please-config\.json/);
  assert.deepStrictEqual(b.state.writes, []);
});

test('AC 1: --dry-run reports 1.3.0, three bullets, no hook, and writes nothing', () => {
  const { deps, state } = makeDeps();
  assert.strictEqual(run(['--dry-run'], deps), 0);
  assert.match(state.out, /v1\.3\.0 \(minor\) from v1\.2\.0/);
  assert.strictEqual((state.out.match(/^\* /gm) || []).length, 3);
  assert.match(state.out, /no hook configured/);
  assert.deepStrictEqual(state.writes, []);
  assert.ok(!state.git.some((c) => /^(add|commit|tag -a|push)/.test(c)));
});

test('AC 2 (fake runner): the live run edits both manifests and the CHANGELOG, commits, tags, pushes branch + tag, exit 0', () => {
  const { deps, state } = makeDeps();
  assert.strictEqual(run([], deps), 0);
  assert.deepStrictEqual(state.writes, ['.release-please-manifest.json', 'package.json', 'CHANGELOG.md']);
  assert.strictEqual(state.files['package.json'], '{\n  "name": "x",\n  "version": "1.3.0"\n}\n');
  assert.match(state.files['CHANGELOG.md'], /^# Changelog\n\n## \[1\.3\.0\]\(https:\/\/github\.com\/o\/r\/compare\/v1\.2\.0\.\.\.v1\.3\.0\) \(2026-09-12\)\n\n\n### Features\n\n\* b \(\[1111111\]/);
  const i = (p) => state.git.findIndex((c) => c.startsWith(p));
  assert.ok(i('add ') < i('commit -m chore(release): v1.3.0') && i('commit') < i('tag -a v1.3.0 -m v1.3.0') && i('tag -a') < i('fetch origin main') && i('fetch') < i('merge-base') && i('merge-base') < i('push origin main v1.3.0'));
  assert.match(state.out, /released v1\.3\.0/);
});

test('AC 3: only chore commits → exit 3, nothing written', () => {
  const { deps, state } = makeDeps({ subjects: ['chore: x', 'docs: y'] });
  assert.strictEqual(run([], deps), 3);
  assert.match(state.out, /nothing to release/);
  assert.deepStrictEqual(state.writes, []);
});

test('AC 5: feat! or a BREAKING CHANGE footer computes a major even among fix/chore', () => {
  const { deps, state } = makeDeps({ subjects: ['fix: a', 'feat!: b', 'chore: c'] });
  assert.strictEqual(run(['--dry-run'], deps), 0);
  assert.match(state.out, /v2\.0\.0 \(major\)/);
  assert.match(state.out, /BREAKING CHANGES/);
});

test('AC 7: no prior tag → the full history, base from the manifest, 0.1.0 + feat → 0.2.0', () => {
  const { deps, state } = makeDeps({ noTag: true, tags: '', subjects: ['feat: first'], files: { '.release-please-manifest.json': '{".": "0.1.0"}', 'package.json': '{"version": "0.1.0"}' } });
  assert.strictEqual(run(['--dry-run'], deps), 0);
  assert.match(state.out, /v0\.2\.0 \(minor\) from no prior tag/);
  assert.ok(state.git.some((c) => c.startsWith('log --first-parent') && c.endsWith(' HEAD')));
});

test('unconventional subjects are listed in the plan, never dropped', () => {
  const { deps, state } = makeDeps({ subjects: ['fix: a', 'Merge branch feature'] });
  assert.strictEqual(run(['--dry-run'], deps), 0);
  assert.match(state.out, /unconventional \(1\):\n {2}[0-9a-f]{7} Merge branch feature/);
});

test('exit 4: a sibling worktree already claims 1.3.0', () => {
  const { deps, state } = makeDeps({ worktrees: 'worktree /repo\nbranch refs/heads/main\n\nworktree /w\nbranch refs/heads/wt\n', files: {} });
  deps.git = ((orig) => (args) => (args.join(' ') === 'show wt:.release-please-manifest.json' ? '{".": "1.3.0"}' : orig(args)))(deps.git);
  assert.strictEqual(run([], deps), 4);
  assert.match(state.err, /collision on v1\.3\.0/);
  assert.match(state.err, /wt claims v1\.3\.0/);
  assert.deepStrictEqual(state.writes, []);
});

test('exit 1 (nothing written): a dirty tree, or a wrong branch', () => {
  const dirty = makeDeps({ dirty: ' M x.js\n' });
  assert.strictEqual(run([], dirty.deps), 1);
  assert.match(dirty.state.err, /tracked modifications/);
  assert.deepStrictEqual(dirty.state.writes, []);
  const branch = makeDeps({ branch: 'feature' });
  assert.strictEqual(run([], branch.deps), 1);
  assert.match(branch.state.err, /releases run from main; current branch is "feature"/);
});

test('exit 1 (named partial state): the push fails after the commit and tag landed', () => {
  const { deps, state } = makeDeps({ gitFail: (k) => k.startsWith('push ') });
  assert.strictEqual(run([], deps), 1);
  assert.match(state.err, /partial: v1\.3\.0 is committed and tagged locally but NOT pushed/);
  assert.match(state.err, /do NOT re-run/i);
  assert.match(state.err, /git push origin main v1\.3\.0/);
  assert.deepStrictEqual(state.hooks, []);
});

test('exit 1 (named partial state): a commit failure after the files were edited', () => {
  const { deps, state } = makeDeps({ gitFail: (k) => k.startsWith('commit ') });
  assert.strictEqual(run([], deps), 1);
  assert.match(state.err, /partial: manifest and CHANGELOG edits are on disk but NOT committed/);
  assert.match(state.err, /git checkout -- \.release-please-manifest\.json package\.json CHANGELOG\.md/);
});

test('exit 5: the release-hook fails after the tag and push landed; the tag is final', () => {
  const { deps, state } = makeDeps({ files: { '.claude-tweaks/policy.yml': 'release-hook: "npm run deploy"\n' }, hookExit: 7 });
  assert.strictEqual(run([], deps), 5);
  assert.deepStrictEqual(state.hooks, ['npm run deploy']);
  assert.match(state.err, /partial: v1\.3\.0 is committed, tagged and pushed; the release-hook exited 7/);
  assert.match(state.err, /re-run the hook alone: npm run deploy/);
  assert.ok(state.git.some((c) => c.startsWith('push ')));
});

test('a configured hook that succeeds is run after the push and reported', () => {
  const { deps, state } = makeDeps({ files: { '.claude-tweaks/policy.yml': 'release-hook: ./publish.sh\n' } });
  assert.strictEqual(run([], deps), 0);
  assert.deepStrictEqual(state.hooks, ['./publish.sh']);
  assert.match(state.out, /hook: \.\/publish\.sh/);
});

test('no origin: no fetch, no push, unlinked CHANGELOG heading, still exit 0', () => {
  const { deps, state } = makeDeps({ noOrigin: true });
  assert.strictEqual(run([], deps), 0);
  assert.ok(!state.git.some((c) => /^(fetch|push|merge-base)/.test(c)));
  assert.match(state.files['CHANGELOG.md'], /^# Changelog\n\n## 1\.3\.0 \(2026-09-12\)\n/);
});

test('integration-branch policy selects the branch; --branch overrides it', () => {
  const a = makeDeps({ branch: 'develop', files: { '.claude-tweaks/policy.yml': 'integration-branch: develop\n' } });
  assert.strictEqual(run(['--dry-run'], a.deps), 0);
  const b = makeDeps({ branch: 'develop' });
  assert.strictEqual(run(['--dry-run', '--branch', 'develop'], b.deps), 0);
  const c = makeDeps({ branch: 'develop' });
  assert.strictEqual(run(['--dry-run'], c.deps), 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node -e "require('./plugin/bin/release-local.js')"`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write the implementation**

```js
#!/usr/bin/env node
// bin/release-local.js — the local-merge release engine (#2254, design
// stance 4: pr-first → release-please, local-merge → this CLI, byte-compatible
// artifacts). Reads first-parent conventional commits since the last v* tag,
// derives the semver bump, byte-splices the manifest(s), prepends a
// release-please-grammar CHANGELOG section, commits `chore(release): vX.Y.Z`,
// tags `vX.Y.Z` (annotated), pushes branch + tag when `origin` exists, then
// runs the `release-hook` policy command. run(argv, deps) per
// .claude/skills/gh-api-module-pattern's CLI wrapper contract.
//
//   node plugin/bin/release-local.js [--dry-run] [--root <dir>] [--branch <name>]
//
// Exit codes: 0 released (or the --dry-run plan printed); 1 git/engine
// failure — nothing written, OR a named partial state with a recovery
// command (the commit/tag landed but the push did not; the edits are on disk
// but not committed) — never re-run blind; 2 usage (also: no
// release-please-config.json — run /claude-tweaks:init first); 3 nothing to
// release; 4 version collision (sibling worktree / plan claim); 5 the
// release-hook failed after the tag (and its push) fully landed — the tag is
// final, re-run the hook alone.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { conventionalHistory } = require('./lib/release-local/commits.js');
const { bumpPart } = require('./lib/release-local/bump.js');
const manifest = require('./lib/release-local/manifest.js');
const { renderSection, prependSection, parseGitHubRemote } = require('./lib/release-local/changelog.js');
const { precheck } = require('./lib/release/precheck.js');
const { guardReleasableTree, pushAfterAncestryCheck } = require('./lib/release/run.js');
const { resolvePolicyKeys } = require('./lib/policy-schema.js');

const USAGE = [
  'usage: release-local.js [--dry-run] [--root <dir>] [--branch <name>]',
  'exit 0 released (or dry-run plan printed); 1 git/engine failure — nothing written, or a NAMED PARTIAL STATE with a recovery command;',
  '     2 usage (or no release-please-config.json — run /claude-tweaks:init first); 3 nothing to release; 4 version collision;',
  '     5 release-hook failed after the tag (and push) landed — re-run the hook alone',
].join('\n');
const VALUE_FLAGS = new Set(['--root', '--branch']);
const POLICY_FILE = '.claude-tweaks/policy.yml';

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { dryRun: false, branch: null, root: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { opts.help = true; continue; }
    if (a === '--dry-run') { opts.dryRun = true; continue; }
    if (VALUE_FLAGS.has(a)) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) return { error: `${a} requires a value` };
      i += 1;
      if (a === '--root') opts.root = next; else opts.branch = next;
      continue;
    }
    return { error: `unknown argument: ${a}` };
  }
  return opts;
}

function policyValue(deps, key) {
  const resolved = resolvePolicyKeys([key], { policyRaw: deps.readFile(POLICY_FILE), runConfigRaw: null })[key];
  const value = resolved && resolved.value;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function remoteUrl(deps) {
  try { return deps.git(['remote', 'get-url', 'origin']).trim() || null; } catch { return null; }
}

function planLines({ version, part, history, hook, edits, unconventional }) {
  const counts = { feat: 0, fix: 0, breaking: 0 };
  for (const c of history.commits) {
    if (c.breaking) counts.breaking += 1;
    if (c.type === 'feat') counts.feat += 1;
    if (c.type === 'fix') counts.fix += 1;
  }
  const lines = [
    `release-local: v${version} (${part}) from ${history.lastTag || 'no prior tag'} — ${history.commits.length} commit(s): ${counts.feat} feat, ${counts.fix} fix, ${counts.breaking} breaking`,
    `hook: ${hook || 'no hook configured'}`,
    `manifest: ${edits.length ? edits.join(', ') : 'none (tag only)'}`,
  ];
  if (unconventional.length) {
    lines.push(`unconventional (${unconventional.length}):`);
    for (const c of unconventional) lines.push(`  ${c.sha.slice(0, 7)} ${c.subject}`);
  }
  return lines;
}

function run(argv, deps) {
  const opts = parseArgs(argv);
  if (opts.error) { deps.stderr(`${opts.error}\n${USAGE}\n`); return 2; }
  if (opts.help) { deps.stdout(`${USAGE}\n`); return 0; }

  // Stage tracks what is already on disk / in git so a failure names the
  // exact partial state and its recovery command (run.js's "do NOT re-run").
  let stage = 'planning';
  let version = null;
  let branch = null;
  let editedPaths = [];
  let hook = null;
  let hasOrigin = false;
  try {
    const config = manifest.readConfig(deps.readFile);
    if (!config) throw new UsageError(`${manifest.CONFIG_FILE} not found — run /claude-tweaks:init to bootstrap the release process first`);
    branch = opts.branch || policyValue(deps, 'integration-branch') || 'main';
    guardReleasableTree(deps, { branch });
    hasOrigin = remoteUrl(deps) !== null;

    const history = conventionalHistory(deps.git);
    const part = bumpPart(history.commits);
    if (part === 'none') {
      deps.stdout(`nothing to release: ${history.commits.length} commit(s) since ${history.lastTag || 'the first commit'}, none feat/fix/breaking\n`);
      return 3;
    }
    const targets = manifest.resolveTargets(config);
    const current = manifest.currentVersion(targets, deps.readFile);
    const check = precheck(deps, part, {
      keySource: 'tags', branch, hasOrigin,
      versionAtRef: (ref) => manifest.versionAtRef(targets, (p) => deps.git(['show', `${ref}:${p}`])),
    });
    version = check.candidate;
    if (!check.result.ok) {
      const lines = check.result.conflicts.map((c) => `  - ${c.source}: ${c.detail} claims v${c.version}`);
      deps.stderr(`version collision on v${version}:\n${lines.join('\n')}\nSuggested renumber: v${check.result.suggested}. Resolve and re-run.\n`);
      return 4;
    }
    hook = policyValue(deps, 'release-hook');
    const repo = hasOrigin ? parseGitHubRemote(remoteUrl(deps)) : null;
    const section = renderSection({ version, previousTag: history.lastTag, date: deps.today(), commits: history.commits, repo });
    const unconventional = history.commits.filter((c) => c.unconventional);
    const edits = targets.filter((t) => t.create || deps.readFile(t.path) !== null).map((t) => t.path);
    for (const line of planLines({ version, part, history, hook, edits, unconventional })) deps.stdout(`${line}\n`);
    if (history.lastTag && current && current !== history.lastTag.replace(/^v/, '')) {
      deps.stdout(`manifest-drift: manifest says ${current}, last tag is ${history.lastTag} — the tag is the version of record\n`);
    }
    deps.stdout(`\n${section}\n`);
    if (opts.dryRun) { deps.stdout(`[dry-run] v${version} — no changes written\n`); return 0; }

    stage = 'editing';
    const written = manifest.applyVersion(targets, current, version, deps.readFile, deps.writeFile);
    editedPaths = written.map((w) => w.path);
    deps.writeFile('CHANGELOG.md', prependSection(deps.readFile('CHANGELOG.md'), section));
    editedPaths.push('CHANGELOG.md');
    deps.git(['add', ...editedPaths]);
    deps.git(['commit', '-m', `chore(release): v${version}`]);
    stage = 'committed';
    deps.git(['tag', '-a', `v${version}`, '-m', `v${version}`]);
    stage = 'tagged';
    if (hasOrigin) {
      pushAfterAncestryCheck(deps, { branch, refs: [branch, `v${version}`], onDiverged: `origin/${branch} moved between pre-check and push` });
      stage = 'pushed';
    }
    if (hook) {
      const code = deps.runHook(hook);
      if (code !== 0) {
        deps.stderr(`partial: v${version} is committed, tagged${hasOrigin ? ' and pushed' : ''}; the release-hook exited ${code}. ` +
          `Do NOT re-run release-local (the tag is final). Recover: re-run the hook alone: ${hook}\n`);
        return 5;
      }
    }
    deps.stdout(`released v${version}\n`);
    return 0;
  } catch (err) {
    const message = String((err && err.message) || err);
    if (err instanceof UsageError) { deps.stderr(`${message}\n${USAGE}\n`); return 2; }
    if (stage === 'planning') { deps.stderr(`release-local: ${message} — nothing written\n`); return 1; }
    if (stage === 'editing') {
      deps.stderr(`partial: manifest and CHANGELOG edits are on disk but NOT committed (${message}). ` +
        `Do NOT re-run release-local. Recover: git checkout -- ${editedPaths.join(' ')}\n`);
      return 1;
    }
    if (stage === 'committed') {
      deps.stderr(`partial: the chore(release): v${version} commit landed but the tag did NOT (${message}). ` +
        `Do NOT re-run release-local (it would bump again). Recover: git tag -a v${version} -m v${version}${hasOrigin ? ` && git push origin ${branch} v${version}` : ''}${hook ? `, then run the hook: ${hook}` : ''}\n`);
      return 1;
    }
    deps.stderr(`partial: v${version} is committed and tagged locally but NOT pushed (${message}). ` +
      `Do NOT re-run release-local (it would bump again). Recover: git pull --rebase origin ${branch} && git push origin ${branch} v${version}${hook ? `, then run the hook: ${hook}` : ''}\n`);
    return 1;
  }
}

function defaultDeps(root) {
  const abs = (p) => path.join(root, p);
  return {
    git: (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    readFile: (p) => { try { return fs.readFileSync(abs(p), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
    writeFile: (p, text) => fs.writeFileSync(abs(p), text),
    // The hook is the project's own shell command (policy release-hook) — a
    // shell string by design; its exit code becomes this CLI's exit 5.
    runHook: (cmd) => { const r = spawnSync(cmd, { cwd: root, shell: true, stdio: 'inherit' }); return r.status === null ? 1 : r.status; },
    today: () => new Date().toISOString().slice(0, 10),
    stdout: (t) => process.stdout.write(t),
    stderr: (t) => process.stderr.write(t),
  };
}

function main(argv) {
  const opts = parseArgs(argv);
  const root = opts.root ? path.resolve(opts.root) : process.cwd();
  let stat;
  try { stat = fs.statSync(root); } catch { stat = null; }
  if (!stat || !stat.isDirectory()) { process.stderr.write(`root is not a directory: ${root}\n${USAGE}\n`); return 2; }
  return run(argv, defaultDeps(root));
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { run, parseArgs, defaultDeps, USAGE };
```

Note for the test's `parseArgs` assertion: `dryRun` is `true` for `--dry-run` (the test's `false || true` literal is `true`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/release-local/cli.test.js`
Expected: PASS (16 tests — every exit code 0/1/2/3/4/5 exercised, AC 6)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/release-local.js tests/bin-lib/release-local/cli.test.js
git commit -m "Add release-local.js — the local-merge release CLI: guard → plan → edit → commit → tag → push → hook with named partial states, refs #2254

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

### Task 7: Real-git acceptance fixtures + docs row

**Files:**
- Test: `tests/bin-lib/release-local/acceptance.test.js`
- Modify: `docs/plugin-structure.md` (one `plugin/bin/lib/release-local/` row after the `plugin/bin/lib/release-claim/` row at line 29; one CLI command line after the `node plugin/bin/release-bootstrap.js …` line at line 165; add `release-local` to the line-18 parenthetical CLI list after `release`)

**Interfaces:**
- Consumes: `tests/helpers/git-fixtures.js`'s `gitRepo`, `fixtureGit`; the real `plugin/bin/release-local.js` spawned with `--root`.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
// Acceptance criteria 1, 2, 3, 5 and 7 against real git repos: the CLI is
// spawned as a user would run it. Fixture repos have no origin (local-merge's
// common case) unless a test adds one.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { gitRepo, fixtureGit } = require('../../helpers/git-fixtures.js');

const CLI = path.join(__dirname, '../../../plugin/bin/release-local.js');
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' };

function runCli(root, args = []) {
  try {
    const stdout = execFileSync('node', [CLI, '--root', root, ...args], { encoding: 'utf8', env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '', stderr: e.stderr || '' };
  }
}

function commit(root, subject, files = {}) {
  for (const [p, text] of Object.entries(files)) fs.writeFileSync(path.join(root, p), text);
  fixtureGit(['-C', root, 'add', '-A'], { env: ENV });
  fixtureGit(['-C', root, 'commit', '-q', '--allow-empty', '-m', subject], { env: ENV });
}

function bootstrapped(version) {
  const root = gitRepo();
  fixtureGit(['-C', root, 'branch', '-M', 'main']);
  commit(root, 'chore: bootstrap', {
    'release-please-config.json': JSON.stringify({ packages: { '.': { 'release-type': 'node' } } }, null, 2) + '\n',
    '.release-please-manifest.json': `{\n  ".": "${version}"\n}\n`,
    'package.json': `{\n  "name": "fixture",\n  "version": "${version}",\n  "private": true\n}\n`,
    'CHANGELOG.md': '# Changelog\n',
  });
  return root;
}

function tagged(version) {
  const root = bootstrapped(version);
  fixtureGit(['-C', root, 'tag', '-a', `v${version}`, '-m', `v${version}`], { env: ENV });
  return root;
}

test('AC 1: v1.2.0 + fix, fix, feat → --dry-run reports 1.3.0, three bullets, no hook, writes nothing', () => {
  const root = tagged('1.2.0');
  commit(root, 'fix: one'); commit(root, 'fix: two'); commit(root, 'feat: three');
  const before = fixtureGit(['-C', root, 'rev-parse', 'HEAD']).toString();
  const r = runCli(root, ['--dry-run']);
  assert.strictEqual(r.code, 0, r.stderr);
  assert.match(r.stdout, /v1\.3\.0 \(minor\) from v1\.2\.0/);
  assert.strictEqual((r.stdout.match(/^\* /gm) || []).length, 3);
  assert.match(r.stdout, /no hook configured/);
  assert.strictEqual(fixtureGit(['-C', root, 'status', '--porcelain']).toString(), '');
  assert.strictEqual(fixtureGit(['-C', root, 'rev-parse', 'HEAD']).toString(), before);
  assert.strictEqual(fixtureGit(['-C', root, 'tag', '-l']).toString().trim(), 'v1.2.0');
});

test('AC 2: the live run lands the manifest edit, the CHANGELOG section, the chore(release) commit and the annotated tag', () => {
  const root = tagged('1.2.0');
  commit(root, 'fix: one'); commit(root, 'fix: two'); commit(root, 'feat: three');
  const r = runCli(root);
  assert.strictEqual(r.code, 0, r.stderr);
  // git 2.55 prints `v1.3.0^0` when HEAD is the tagged commit itself (probed 2026-09-12); the design doc's bare `v1.3.0` is the tag-name half.
  assert.match(fixtureGit(['-C', root, 'describe', '--contains', 'HEAD']).toString().trim(), /^v1\.3\.0(\^0)?$/);
  assert.strictEqual(fixtureGit(['-C', root, 'log', '-1', '--format=%s']).toString().trim(), 'chore(release): v1.3.0');
  assert.strictEqual(fixtureGit(['-C', root, 'cat-file', '-t', 'v1.3.0']).toString().trim(), 'tag');
  assert.strictEqual(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), '{\n  "name": "fixture",\n  "version": "1.3.0",\n  "private": true\n}\n');
  assert.strictEqual(fs.readFileSync(path.join(root, '.release-please-manifest.json'), 'utf8'), '{\n  ".": "1.3.0"\n}\n');
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, /^# Changelog\n\n## 1\.3\.0 \(\d{4}-\d{2}-\d{2}\)\n\n\n### Features\n\n\* three\n\n\n### Bug Fixes\n\n\* two\n\* one\n$/);
  assert.strictEqual(fixtureGit(['-C', root, 'status', '--porcelain']).toString(), '');
});

test('AC 3: only chore commits since the tag → exit 3, nothing written', () => {
  const root = tagged('1.2.0');
  commit(root, 'chore: a'); commit(root, 'docs: b');
  const before = fixtureGit(['-C', root, 'rev-parse', 'HEAD']).toString();
  const r = runCli(root);
  assert.strictEqual(r.code, 3, r.stderr);
  assert.match(r.stdout, /nothing to release/);
  assert.strictEqual(fixtureGit(['-C', root, 'rev-parse', 'HEAD']).toString(), before);
  assert.strictEqual(fixtureGit(['-C', root, 'tag', '-l']).toString().trim(), 'v1.2.0');
  assert.match(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), /"version": "1\.2\.0"/);
});

test('AC 5: a BREAKING CHANGE footer among fix/chore commits computes a major', () => {
  const root = tagged('1.2.0');
  commit(root, 'fix: a'); commit(root, 'chore: b');
  fixtureGit(['-C', root, 'commit', '-q', '--allow-empty', '-m', 'fix: rename key\n\nBREAKING CHANGE: config key renamed'], { env: ENV });
  const r = runCli(root, ['--dry-run']);
  assert.strictEqual(r.code, 0, r.stderr);
  assert.match(r.stdout, /v2\.0\.0 \(major\)/);
  assert.match(r.stdout, /### ⚠ BREAKING CHANGES\n\n\* config key renamed\n/);
});

test('AC 7: no prior v* tag → the full first-parent history, base from the seeded manifest: 0.1.0 + feat → 0.2.0', () => {
  const root = bootstrapped('0.1.0');
  commit(root, 'feat: first');
  const r = runCli(root, ['--dry-run']);
  assert.strictEqual(r.code, 0, r.stderr);
  assert.match(r.stdout, /v0\.2\.0 \(minor\) from no prior tag/);
});

test('a first-parent merge keeps branch commits out of the plan (design stance 3)', () => {
  const root = tagged('1.2.0');
  fixtureGit(['-C', root, 'checkout', '-q', '-b', 'feature']);
  commit(root, 'wip: branch noise'); commit(root, 'feat!: branch-only breaking');
  fixtureGit(['-C', root, 'checkout', '-q', 'main']);
  fixtureGit(['-C', root, 'merge', '-q', '--no-ff', '-m', 'fix: merged feature', 'feature'], { env: ENV });
  const r = runCli(root, ['--dry-run']);
  assert.strictEqual(r.code, 0, r.stderr);
  assert.match(r.stdout, /v1\.2\.1 \(patch\)/);
  assert.ok(!r.stdout.includes('branch-only breaking'));
  assert.ok(!r.stdout.includes('unconventional'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/release-local/acceptance.test.js`
Expected: FAIL only if Task 6's CLI misbehaves against real git — this test is written after Task 6 lands, so a first run may already PASS; a PASS here is acceptance evidence, not a skipped red step.

- [ ] **Step 3: Docs rows**

In `docs/plugin-structure.md`:

1. Line 18's parenthetical list: change `release, residue,` to `release, release-local, residue,`.
2. After the `plugin/bin/lib/release-claim/` row (line 29) insert:

```
plugin/bin/lib/release-local/     → The local-merge release engine's modules (#2254): commits.js (first-parent conventional history since the last v* tag — `describe --first-parent`, header regex + BREAKING CHANGE footer, unconventional subjects surfaced never dropped), bump.js (breaking > feat > fix > none), manifest.js (release-please-config.json-driven targets — .release-please-manifest.json, the stack manifest per step-21-release.md's table, extra-files — byte-spliced version tokens, never a JSON/TOML re-emit), changelog.js (release-please's CHANGELOG grammar, pinned byte-for-byte by tests/bin-lib/release-local/fixtures/ captured from release-please's own CHANGELOG; compare URL + commit links only when origin parses as GitHub, never PR links). Consumed by plugin/bin/release-local.js; reuses plugin/bin/lib/release/precheck.js (`keySource: 'tags'`) and run.js's exported guard + ancestry-checked push
```

3. After the `node plugin/bin/release-bootstrap.js …` command line (line 165) insert:

```
node plugin/bin/release-local.js [--dry-run] [--root <dir>] [--branch <name>]   # Local-merge release engine (#2254) — first-parent conventional commits since the last v* tag → semver bump → byte-spliced manifest(s) + release-please-grammar CHANGELOG section → `chore(release): vX.Y.Z` commit → annotated tag → push branch + tag (when origin exists) → `release-hook` policy command; exit 0 released / dry-run plan, 1 git failure (nothing written, or a NAMED partial state with its recovery command), 2 usage / not bootstrapped, 3 nothing to release, 4 version collision, 5 hook failed after the tag landed (`plugin/bin/lib/release-local/`, tests in `tests/bin-lib/release-local/`)
```

- [ ] **Step 4: Run the new suite and the docs pins**

Run: `node --test tests/bin-lib/release-local/*.test.js tests/bin-lib/release/*.test.js tests/bin-lib/exit-code-conformance.test.js tests/skill-catalog-completeness.test.js` (glob form — node 22's `--test` does not expand a bare directory, as Task 5 found)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/bin-lib/release-local/acceptance.test.js docs/plugin-structure.md
git commit -m "Add release-local acceptance fixtures against real git repos and the plugin-structure rows for the local engine, refs #2254

Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH"
```

---

## Self-Review

**Spec coverage:** commits.js → T1; bump.js (+ exit 3) → T2/T6; manifest.js byte-preserving → T3; changelog.js + fixture test (AC 4) → T4; precheck `keySource` (AC 8) + run.js reuse → T5; sequence wiring, exit vocabulary 0–5 with named partial states for 1 and 5 (AC 6), first-release path (AC 7) → T6; AC 1/2/3/5/7 on real git → T7; `docs/plugin-structure.md` row → T7. Non-goal respected: `plugin/bin/release.js`'s call site is untouched (T5's `'tsv'` default).

**Placeholder scan:** every code step carries its code; T7 Step 2's "may already pass" is stated, not deferred.

**Type consistency:** `Commit` shape (`sha, subject, type, scope, breaking, breakingNote, description, unconventional`) is identical in T1's producer, T4's renderer and T6's fake log; `precheck(deps, part, opts)` / `versionAtRef(ref)` in T5 matches T6's call; `guardReleasableTree`/`pushAfterAncestryCheck` signatures match between T5 and T6; `Target` fields (`path, kind, sections, optional, create`) match T3's `resolveTargets` and T6's `edits` derivation.
