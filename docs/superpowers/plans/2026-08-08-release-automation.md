# Release Automation (bin/release.js + marketplace mirror) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One command (`node bin/release.js <minor|patch> "<summary>"`) performs a complete release from a clean `main`: 5-source collision pre-check, manifest bump, CHANGELOG stub, `shipped-versions.tsv` append — all in one commit — then push, then marketplace mirror; aborting loudly on any collision or divergence.

**Architecture:** Pure composition/decision functions in `bin/lib/release/` (flat sibling modules per repo convention) with every external effect (git, gh, fs) injected as a `deps` object, so fixture tests exercise the full logic without ever running a real push. `bin/release.js` is a thin CLI that wires real deps. Reuses `bin/lib/changelog.js` (heading parse/validate) and `bin/lib/shipped-record.js` (`appendShippedVersion`).

**Tech Stack:** Node 18+ built-ins only (`node:child_process` `execFileSync`, `node:fs`, `node:path`), `node --test` + `node:assert/strict`.

**Record:** #234 (spec: `.claude-tweaks/pipelines/2026-08-08T231620-spec-234-233/spec-234/work/234-spec.md`). Commits reference `refs #234` — never closing keywords.

## Global Constraints

- No new npm dependencies; `'use strict';` at top of every module (matches `bin/lib/changelog.js`).
- Git/gh always via `execFileSync` with an args array — never a shell string.
- No test may run a live `git push` or any `gh` network call — fixture/injected deps only (spec Gotcha: the script is release infrastructure; a "test invocation" that writes durable shared state is not a test).
- Test doubles' `returns`/`throws` are lazily-called functions, never eagerly-invoked IIFEs (CLAUDE.md `[IL-30]`).
- CHANGELOG heading shape is exactly `## v{X.Y.Z} — {summary}` (em-dash) — validated by `findHeadingDefects` after composition.
- `docs/shipped-versions.tsv` line shape is `{version}\t{YYYY-MM-DD}\trelease` — written only via `appendShippedVersion`.
- **Decided at build time (spec left open):** the default is a **live run**; `--dry-run` is the opt-in preview. Rationale: the command is invoked deliberately ~20×/day, the pre-check aborts loudly on any anomaly, and a default that requires `--live` on every real invocation re-adds the friction the script exists to remove. Documented in CLI `--help` (Task 5).
- **Decided at build time (spec's stated start):** the mirror runs inside the script via `gh api` against the marketplace repo's `origin/main`; the GitHub Action variant stays a recorded follow-up, not built here.
- The version bump for shipping this feature itself is NOT part of this plan — it lands once at the end of the multi-spec flow run's branch finish (with #233), per the run manifest. `[IL-12]` satisfied by this explicit line.

---

### Task 1: Composition module — manifest bump, changelog stub, tsv paths

**Files:**
- Create: `bin/lib/release/compose.js`
- Test: `bin/lib/release/tests/compose.test.js`
- Modify: `package.json:7` (append `bin/lib/release/tests/*.test.js` to the `test` script glob list — enumerated globs do not pick up new directories on their own, CLAUDE.md `[IL-84]`)

**Interfaces:**
- Consumes: `parseChangelogVersions`, `findHeadingDefects`, `compareVersions` from `../changelog.js` (exact names, `bin/lib/changelog.js:91-97`).
- Produces:
  - `nextVersion(current, part)` → string. `part` ∈ `'minor'|'patch'`; `'minor'` → `X.(Y+1).0`, `'patch'` → `X.Y.(Z+1)`. Throws on invalid `part` or unparseable `current`.
  - `bumpManifest(manifestText, version)` → string. Parses JSON, sets `.version`, re-serializes `JSON.stringify(obj, null, 2) + '\n'`. Throws if `version` is not strictly greater than the current field (`compareVersions`).
  - `stubChangelogEntry(changelogText, version, summary)` → string. Inserts `## v{version} — {summary}\n\n{summary}.\n` immediately BEFORE the first existing `## v` heading (the file opens with a `# Changelog` prose block — insertion is before the first entry, not after line 1). Throws if `summary` is empty, if the version already has a heading (duplicate = parse failure), or if `findHeadingDefects` on the result reports the new heading as unparseable.
  - `RELEASE_FILES` = `['.claude-plugin/plugin.json', 'CHANGELOG.md', 'docs/shipped-versions.tsv']` — the exact same-commit set, consumed by Task 4's staged-set verification.

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { nextVersion, bumpManifest, stubChangelogEntry, RELEASE_FILES } = require('../compose.js');
const { parseChangelogVersions, findHeadingDefects } = require('../../changelog.js');

const CHANGELOG_FIXTURE = `# Changelog

Prose header kept verbatim.

## v6.70.1 — Prior release

Body of prior release.

## v6.70.0 — Older release

Older body.
`;

test('nextVersion bumps minor and patch', () => {
  assert.strictEqual(nextVersion('6.70.1', 'minor'), '6.71.0');
  assert.strictEqual(nextVersion('6.70.1', 'patch'), '6.70.2');
  assert.throws(() => nextVersion('6.70.1', 'major'), /part/);
  assert.throws(() => nextVersion('not-semver', 'patch'), /Invalid semver/);
});

test('bumpManifest rewrites only the version field and refuses regressions', () => {
  const out = bumpManifest('{\n  "name": "claude-tweaks",\n  "version": "6.70.1"\n}\n', '6.71.0');
  const parsed = JSON.parse(out);
  assert.strictEqual(parsed.version, '6.71.0');
  assert.strictEqual(parsed.name, 'claude-tweaks');
  assert.ok(out.endsWith('\n'));
  assert.throws(() => bumpManifest(out, '6.70.9'), /not ahead|greater/i);
});

test('stubChangelogEntry inserts a parseable heading before the first entry', () => {
  const out = stubChangelogEntry(CHANGELOG_FIXTURE, '6.71.0', 'Release automation');
  const entries = parseChangelogVersions(out);
  assert.strictEqual(entries[0].version, '6.71.0');
  assert.strictEqual(entries[0].title, 'Release automation');
  assert.strictEqual(entries[1].version, '6.70.1');
  const defects = findHeadingDefects(out);
  assert.deepStrictEqual(defects.unparseable, []);
  assert.deepStrictEqual(defects.duplicates, []);
  assert.ok(out.startsWith('# Changelog\n'), 'prose header survives');
});

test('stubChangelogEntry refuses duplicates and empty summaries', () => {
  assert.throws(() => stubChangelogEntry(CHANGELOG_FIXTURE, '6.70.1', 'Again'), /already/);
  assert.throws(() => stubChangelogEntry(CHANGELOG_FIXTURE, '6.71.0', ''), /summary/i);
});

test('RELEASE_FILES names exactly the same-commit trio', () => {
  assert.deepStrictEqual(RELEASE_FILES, ['.claude-plugin/plugin.json', 'CHANGELOG.md', 'docs/shipped-versions.tsv']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/release/tests/compose.test.js`
Expected: FAIL — `Cannot find module '../compose.js'`

- [ ] **Step 3: Implement `bin/lib/release/compose.js`**

```js
'use strict';
const { compareVersions, parseChangelogVersions, findHeadingDefects } = require('../changelog.js');

const RELEASE_FILES = ['.claude-plugin/plugin.json', 'CHANGELOG.md', 'docs/shipped-versions.tsv'];

function nextVersion(current, part) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(current).trim());
  if (!m) throw new Error(`Invalid semver version: "${current}"`);
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (part === 'minor') return `${major}.${minor + 1}.0`;
  if (part === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`part must be "minor" or "patch", got "${part}"`);
}

function bumpManifest(manifestText, version) {
  const manifest = JSON.parse(manifestText);
  if (compareVersions(version, manifest.version) <= 0) {
    throw new Error(`new version ${version} is not ahead of manifest ${manifest.version}`);
  }
  manifest.version = version;
  return JSON.stringify(manifest, null, 2) + '\n';
}

function stubChangelogEntry(changelogText, version, summary) {
  if (!summary || !String(summary).trim()) throw new Error('summary is required for the changelog stub');
  if (parseChangelogVersions(changelogText).some((e) => e.version === version)) {
    throw new Error(`CHANGELOG already documents v${version}`);
  }
  const firstHeading = changelogText.search(/^## v/m);
  if (firstHeading === -1) throw new Error('CHANGELOG has no version headings to insert before');
  const entry = `## v${version} — ${summary.trim()}\n\n${summary.trim()}.\n\n`;
  const out = changelogText.slice(0, firstHeading) + entry + changelogText.slice(firstHeading);
  const defects = findHeadingDefects(out);
  if (defects.unparseable.length || defects.duplicates.length) {
    throw new Error(`composed CHANGELOG has heading defects: ${JSON.stringify(defects)}`);
  }
  return out;
}

module.exports = { nextVersion, bumpManifest, stubChangelogEntry, RELEASE_FILES };
```

- [ ] **Step 4: Add the test glob to `package.json`**

In the `"test"` script, after `bin/lib/residue/tests/*.test.js`, insert ` bin/lib/release/tests/*.test.js` (keep `tools/upstream-drift/tests/*.test.js` last — order otherwise unchanged).

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test bin/lib/release/tests/compose.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add bin/lib/release/compose.js bin/lib/release/tests/compose.test.js package.json
git commit -m "Add release composition module — manifest bump, changelog stub, same-commit file set (refs #234)"
```

---

### Task 2: Collision pre-check module (5 sources)

**Files:**
- Create: `bin/lib/release/precheck.js`
- Test: `bin/lib/release/tests/precheck.test.js`

**Interfaces:**
- Consumes: `compareVersions` from `../changelog.js`; `nextVersion` from `./compose.js`.
- Produces:
  - `collectClaims(deps)` → `{ originMain, localMain, worktreeBranches, planClaims }`, where `deps` is `{ git(args) → string, listPlanFiles() → string[], readFile(path) → string }`. `originMain`/`localMain` are version strings read from `git(['show', 'origin/main:.claude-plugin/plugin.json'])` / `git(['show', 'main:.claude-plugin/plugin.json'])`. `worktreeBranches` is `[{ branch, version }]` — every branch from `git(['worktree', 'list', '--porcelain'])` except `main`, whose `git(['show', '<branch>:.claude-plugin/plugin.json'])` version differs from `localMain` (a committed-but-unmerged bump). `planClaims` is `[{ file, version }]` — every `docs/superpowers/plans/*.md` whose text matches `/\bv?(\d+\.\d+\.\d+)\b/` for a version GREATER than `originMain` (an unexecuted plan claiming a future number).
  - `checkCollisions(candidate, claims)` → `{ ok, conflicts, suggested }`. `conflicts` is one entry per source whose version is `>= candidate` (each `{ source, detail, version }`). `suggested` is the candidate re-derived above the highest claimed version (same bump part), so the caller can renumber loudly; `ok === conflicts.length === 0`.
  - `precheck(deps, part)` → `{ candidate, claims, result }` — fetches (`git(['fetch', 'origin', 'main'])`), collects, derives `candidate = nextVersion(max(originMain, localMain), part)`, checks. Note `max`: an unpushed local `main` holding an executed bump must raise the base, not collide with it (spec Gotcha; CLAUDE.md `[IL-98]`).

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectClaims, checkCollisions, precheck } = require('../precheck.js');

// Lazily-evaluated canned git — a function per invocation, never an IIFE [IL-30].
function fakeGit(responses) {
  const calls = [];
  const git = (args) => {
    calls.push(args.join(' '));
    const key = args.join(' ');
    for (const [prefix, respond] of responses) {
      if (key.startsWith(prefix)) return respond();
    }
    throw new Error(`unexpected git call: ${key}`);
  };
  git.calls = calls;
  return git;
}

const manifest = (v) => JSON.stringify({ name: 'claude-tweaks', version: v });

function baseDeps(overrides = {}) {
  return {
    git: fakeGit([
      ['fetch origin main', () => ''],
      ['show origin/main:.claude-plugin/plugin.json', () => manifest(overrides.origin || '6.70.1')],
      ['show main:.claude-plugin/plugin.json', () => manifest(overrides.local || '6.70.1')],
      ['worktree list --porcelain', () => overrides.worktrees || 'worktree /repo\nbranch refs/heads/main\n'],
      ['show wt-feature:.claude-plugin/plugin.json', () => manifest(overrides.wtVersion || '6.70.1')],
    ]),
    listPlanFiles: () => overrides.plans || [],
    readFile: (p) => (overrides.planText || {})[p] || '',
  };
}

test('clean state: candidate is next minor over origin, no conflicts', () => {
  const { candidate, result } = precheck(baseDeps(), 'minor');
  assert.strictEqual(candidate, '6.71.0');
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.conflicts, []);
});

test('a bump already on origin/main raises the base instead of colliding', () => {
  const { candidate, result } = precheck(baseDeps({ origin: '6.71.0' }), 'minor');
  assert.strictEqual(candidate, '6.72.0');
  assert.strictEqual(result.ok, true);
});

test('an executed bump on unpushed local main raises the base [IL-98]', () => {
  const { candidate, result } = precheck(baseDeps({ local: '6.71.0' }), 'minor');
  assert.strictEqual(candidate, '6.72.0');
  assert.strictEqual(result.ok, true);
});

test('a committed-but-unmerged bump on a sibling worktree branch conflicts', () => {
  const deps = baseDeps({
    worktrees: 'worktree /repo\nbranch refs/heads/main\n\nworktree /repo/.claude/worktrees/f\nbranch refs/heads/wt-feature\n',
    wtVersion: '6.71.0',
  });
  const { result } = precheck(deps, 'minor');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.conflicts.length, 1);
  assert.strictEqual(result.conflicts[0].source, 'worktree-branch');
  assert.strictEqual(result.suggested, '6.72.0');
});

test('a plan document claiming the candidate number conflicts', () => {
  const deps = baseDeps({
    plans: ['docs/superpowers/plans/2026-08-08-x.md'],
    planText: { 'docs/superpowers/plans/2026-08-08-x.md': 'bump to v6.71.0 in this plan' },
  });
  const { result } = precheck(deps, 'minor');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.conflicts[0].source, 'plan-claim');
  assert.strictEqual(result.suggested, '6.72.0');
});

test('plan versions at or below origin/main are not claims', () => {
  const deps = baseDeps({
    plans: ['docs/superpowers/plans/old.md'],
    planText: { 'docs/superpowers/plans/old.md': 'shipped back in v6.60.0' },
  });
  const { result } = precheck(deps, 'minor');
  assert.strictEqual(result.ok, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/release/tests/precheck.test.js`
Expected: FAIL — `Cannot find module '../precheck.js'`

- [ ] **Step 3: Implement `bin/lib/release/precheck.js`**

```js
'use strict';
const { compareVersions } = require('../changelog.js');
const { nextVersion } = require('./compose.js');

const VERSION_IN_TEXT = /\bv?(\d+\.\d+\.\d+)\b/g;

function manifestVersion(text) {
  return JSON.parse(text).version;
}

function collectClaims(deps) {
  const originMain = manifestVersion(deps.git(['show', 'origin/main:.claude-plugin/plugin.json']));
  const localMain = manifestVersion(deps.git(['show', 'main:.claude-plugin/plugin.json']));

  const worktreeBranches = [];
  const porcelain = deps.git(['worktree', 'list', '--porcelain']);
  for (const line of porcelain.split('\n')) {
    const m = /^branch refs\/heads\/(.+)$/.exec(line.trim());
    if (!m || m[1] === 'main') continue;
    let version;
    try {
      version = manifestVersion(deps.git(['show', `${m[1]}:.claude-plugin/plugin.json`]));
    } catch {
      continue; // branch without a manifest — not a claim
    }
    if (version !== localMain) worktreeBranches.push({ branch: m[1], version });
  }

  const planClaims = [];
  for (const file of deps.listPlanFiles()) {
    const text = deps.readFile(file);
    for (const match of text.matchAll(VERSION_IN_TEXT)) {
      if (compareVersions(match[1], originMain) > 0) {
        planClaims.push({ file, version: match[1] });
      }
    }
  }
  return { originMain, localMain, worktreeBranches, planClaims };
}

function checkCollisions(candidate, claims) {
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
    const part = candidate.endsWith('.0') ? 'minor' : 'patch';
    suggested = nextVersion(highest, part);
  }
  return { ok: conflicts.length === 0, conflicts, suggested };
}

function precheck(deps, part) {
  deps.git(['fetch', 'origin', 'main']);
  const claims = collectClaims(deps);
  const base = compareVersions(claims.localMain, claims.originMain) > 0 ? claims.localMain : claims.originMain;
  const candidate = nextVersion(base, part);
  return { candidate, claims, result: checkCollisions(candidate, claims) };
}

module.exports = { collectClaims, checkCollisions, precheck };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/release/tests/precheck.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/release/precheck.js bin/lib/release/tests/precheck.test.js
git commit -m "Add release collision pre-check — origin/local main, worktree branches, plan claims (refs #234)"
```

---

### Task 3: Marketplace mirror module

**Files:**
- Create: `bin/lib/release/mirror.js`
- Test: `bin/lib/release/tests/mirror.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks (standalone; orchestrated in Task 4).
- Produces:
  - `composeMirroredCatalog(catalogText, { version, description })` → `{ text, changed }`. Parses marketplace.json, finds `plugins[]` entry with `name === 'claude-tweaks'`, sets its `version` and (when provided) `description`; `metadata.version` is NEVER touched (it is the marketplace's own scheme, bumped on catalog-shape changes only — CLAUDE.md Releasing step 4). `changed` false when values already match. Throws if no `claude-tweaks` entry exists.
  - `mirrorRelease(deps, { version, description, dryRun })` → `{ changed, sha }`. `deps.gh(args) → string` wraps `gh api`. Reads the CURRENT file from the marketplace repo's live `main` via `gh api repos/thomasholknielsen/claude-tweaks-marketplace/contents/.claude-plugin/marketplace.json` (returns base64 `content` + blob `sha` — the API reads the ref directly, so the stale-working-checkout hazard `[IL-104]` cannot occur), composes, and (unless `dryRun` or `!changed`) writes back via `gh api -X PUT .../contents/.claude-plugin/marketplace.json -f message=... -f content=<base64> -f sha=<sha> -f branch=main`.

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { composeMirroredCatalog, mirrorRelease } = require('../mirror.js');

const CATALOG = JSON.stringify({
  name: 'claude-tweaks-marketplace',
  metadata: { version: '2.4.0' },
  plugins: [{ name: 'claude-tweaks', version: '6.70.1', description: 'Old description', source: 'https://github.com/thomasholknielsen/claude-tweaks' }],
}, null, 2);

test('composeMirroredCatalog updates plugin version and description, never metadata.version', () => {
  const { text, changed } = composeMirroredCatalog(CATALOG, { version: '6.71.0', description: 'New description' });
  const parsed = JSON.parse(text);
  assert.strictEqual(changed, true);
  assert.strictEqual(parsed.plugins[0].version, '6.71.0');
  assert.strictEqual(parsed.plugins[0].description, 'New description');
  assert.strictEqual(parsed.metadata.version, '2.4.0');
  assert.strictEqual(parsed.plugins[0].source, 'https://github.com/thomasholknielsen/claude-tweaks');
});

test('composeMirroredCatalog reports no change when already mirrored', () => {
  const { changed } = composeMirroredCatalog(CATALOG, { version: '6.70.1', description: 'Old description' });
  assert.strictEqual(changed, false);
});

test('composeMirroredCatalog throws when the plugin entry is missing', () => {
  const empty = JSON.stringify({ metadata: { version: '2.4.0' }, plugins: [] });
  assert.throws(() => composeMirroredCatalog(empty, { version: '6.71.0' }), /claude-tweaks/);
});

test('mirrorRelease reads live main, writes only when changed and not dry-run', () => {
  const writes = [];
  const deps = {
    gh: (args) => {
      const key = args.join(' ');
      if (key.includes('-X PUT')) { writes.push(args); return '{}'; }
      return JSON.stringify({ content: Buffer.from(CATALOG).toString('base64'), sha: 'abc123' });
    },
  };
  const dry = mirrorRelease(deps, { version: '6.71.0', description: 'D', dryRun: true });
  assert.strictEqual(dry.changed, true);
  assert.strictEqual(writes.length, 0, 'dry-run must not write');

  const live = mirrorRelease(deps, { version: '6.71.0', description: 'D', dryRun: false });
  assert.strictEqual(live.changed, true);
  assert.strictEqual(writes.length, 1, 'live run writes exactly once');
  assert.ok(writes[0].some((a) => a === 'sha=abc123' || a === '-f' ? true : String(a).includes('abc123')), 'PUT carries the blob sha');

  writes.length = 0;
  const noop = mirrorRelease(deps, { version: '6.70.1', description: 'Old description', dryRun: false });
  assert.strictEqual(noop.changed, false);
  assert.strictEqual(writes.length, 0, 'no-op mirror must not write');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/release/tests/mirror.test.js`
Expected: FAIL — `Cannot find module '../mirror.js'`

- [ ] **Step 3: Implement `bin/lib/release/mirror.js`**

```js
'use strict';

const MARKETPLACE_REPO = 'thomasholknielsen/claude-tweaks-marketplace';
const CATALOG_PATH = '.claude-plugin/marketplace.json';

function composeMirroredCatalog(catalogText, { version, description }) {
  const catalog = JSON.parse(catalogText);
  const entry = (catalog.plugins || []).find((p) => p.name === 'claude-tweaks');
  if (!entry) throw new Error(`no "claude-tweaks" entry in ${CATALOG_PATH}`);
  const changed = entry.version !== version || (description != null && entry.description !== description);
  entry.version = version;
  if (description != null) entry.description = description;
  return { text: JSON.stringify(catalog, null, 2) + '\n', changed };
}

function mirrorRelease(deps, { version, description, dryRun }) {
  const raw = deps.gh(['api', `repos/${MARKETPLACE_REPO}/contents/${CATALOG_PATH}`]);
  const { content, sha } = JSON.parse(raw);
  const current = Buffer.from(content, 'base64').toString('utf8');
  const { text, changed } = composeMirroredCatalog(current, { version, description });
  if (!changed || dryRun) return { changed, sha };
  deps.gh([
    'api', '-X', 'PUT', `repos/${MARKETPLACE_REPO}/contents/${CATALOG_PATH}`,
    '-f', `message=Mirror claude-tweaks v${version}`,
    '-f', `content=${Buffer.from(text).toString('base64')}`,
    '-f', `sha=${sha}`,
    '-f', 'branch=main',
  ]);
  return { changed, sha };
}

module.exports = { composeMirroredCatalog, mirrorRelease };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/release/tests/mirror.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/release/mirror.js bin/lib/release/tests/mirror.test.js
git commit -m "Add marketplace mirror module — live-main read via gh contents API (refs #234)"
```

---

### Task 4: Orchestrator — sequence, same-commit enforcement, push-time re-check

**Files:**
- Create: `bin/lib/release/run.js`
- Test: `bin/lib/release/tests/run.test.js`

**Interfaces:**
- Consumes: `precheck` (`./precheck.js`), `bumpManifest`/`stubChangelogEntry`/`RELEASE_FILES` (`./compose.js`), `mirrorRelease` (`./mirror.js`), `appendShippedVersion` (`../shipped-record.js`, signature `appendShippedVersion(repoRoot, version, date) → boolean`).
- Produces:
  - `runRelease(deps, { part, summary, date, dryRun, log })` → `{ version, pushed, mirrored }`. `deps` = `{ git, gh, readFile, writeFile, repoRoot, appendShipped }` (`appendShipped` injected so tests never touch the real tsv; the CLI wires the real `appendShippedVersion`). Sequence:
    1. Guard: `git(['branch', '--show-current'])` must be `main` and `git(['status', '--porcelain'])` must be empty (clean-main requirement; concurrent sessions switch branches underfoot `[IL-05]`) — else throw.
    2. `precheck(deps, part)` — on `result.ok === false`, throw an error listing every conflict and the suggested renumber (abort loudly; never auto-proceed).
    3. Compose all three writes in memory (manifest, changelog, tsv via `appendShipped`).
    4. Dry-run: `log` each intended action and return `{ version, pushed: false, mirrored: false }` — no `writeFile`, no commit, no push, no mirror.
    5. Live: write files, `git(['add', ...RELEASE_FILES])`, then verify `git(['diff', '--cached', '--name-only'])` equals exactly `RELEASE_FILES` (same-commit enforcement + `[IL-42]` stray-index guard) — mismatch throws before committing. `git(['commit', '-m', ...])` with message `Release v{version} — {summary}`.
    6. Push-time re-check: `git(['fetch', 'origin', 'main'])` again, then verify `git(['merge-base', '--is-ancestor', 'origin/main', 'HEAD'])` succeeds (throws → divergence: someone pushed during compose; abort with instructions, do not force). Then `git(['push', 'origin', 'main'])`.
    7. `mirrorRelease(deps, { version, description, dryRun: false })` where `description` is read from the freshly-written manifest's `.description`.

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { runRelease } = require('../run.js');

const manifest = (v) => JSON.stringify({ name: 'claude-tweaks', version: v, description: 'Desc' }, null, 2);
const CHANGELOG = '# Changelog\n\nProse.\n\n## v6.70.1 — Prior\n\nBody.\n';

function makeDeps(overrides = {}) {
  const state = {
    files: {
      '.claude-plugin/plugin.json': manifest('6.70.1'),
      'CHANGELOG.md': CHANGELOG,
    },
    gitCalls: [], writes: [], appended: [], ghCalls: [],
    staged: overrides.staged, // lazily read below
    branch: overrides.branch || 'main',
    dirty: overrides.dirty || '',
    ancestorOk: overrides.ancestorOk !== false,
  };
  const deps = {
    repoRoot: '/repo',
    readFile: (p) => state.files[p],
    writeFile: (p, text) => { state.writes.push(p); state.files[p] = text; },
    appendShipped: (root, v, date) => { state.appended.push(`${v}@${date}`); return true; },
    git: (args) => {
      const key = args.join(' ');
      state.gitCalls.push(key);
      if (key === 'branch --show-current') return state.branch + '\n';
      if (key === 'status --porcelain') return state.dirty;
      if (key.startsWith('fetch')) return '';
      if (key.startsWith('show origin/main:')) return manifest('6.70.1');
      if (key.startsWith('show main:')) return manifest('6.70.1');
      if (key.startsWith('worktree list')) return 'worktree /repo\nbranch refs/heads/main\n';
      if (key.startsWith('add ')) return '';
      if (key === 'diff --cached --name-only') {
        return (state.staged || ['.claude-plugin/plugin.json', 'CHANGELOG.md', 'docs/shipped-versions.tsv']).join('\n');
      }
      if (key.startsWith('commit')) return '';
      if (key.startsWith('merge-base --is-ancestor')) {
        if (!state.ancestorOk) throw new Error('not an ancestor');
        return '';
      }
      if (key.startsWith('push')) return '';
      throw new Error(`unexpected git: ${key}`);
    },
    gh: (args) => {
      state.ghCalls.push(args.join(' '));
      if (args.join(' ').includes('PUT')) return '{}';
      return JSON.stringify({
        content: Buffer.from(JSON.stringify({ metadata: { version: '2.4.0' }, plugins: [{ name: 'claude-tweaks', version: '6.70.1', description: 'Old' }] })).toString('base64'),
        sha: 'sha1',
      });
    },
    listPlanFiles: () => [],
  };
  return { deps, state };
}

test('dry-run composes but writes nothing', () => {
  const { deps, state } = makeDeps();
  const out = runRelease(deps, { part: 'minor', summary: 'S', date: '2026-08-08', dryRun: true, log: () => {} });
  assert.strictEqual(out.version, '6.71.0');
  assert.strictEqual(out.pushed, false);
  assert.deepStrictEqual(state.writes, []);
  assert.deepStrictEqual(state.appended, []);
  assert.ok(!state.gitCalls.some((c) => c.startsWith('push')));
  assert.deepStrictEqual(state.ghCalls, []);
});

test('live run: write → add → verify staged → commit → ancestor check → push → mirror, in order', () => {
  const { deps, state } = makeDeps();
  const out = runRelease(deps, { part: 'minor', summary: 'S', date: '2026-08-08', dryRun: false, log: () => {} });
  assert.strictEqual(out.pushed, true);
  assert.strictEqual(out.mirrored, true);
  assert.deepStrictEqual(state.writes, ['.claude-plugin/plugin.json', 'CHANGELOG.md']);
  assert.deepStrictEqual(state.appended, ['6.71.0@2026-08-08']);
  const order = ['diff --cached --name-only', 'commit', 'merge-base --is-ancestor', 'push'].map(
    (needle) => state.gitCalls.findIndex((c) => c.startsWith(needle)),
  );
  assert.ok(order.every((i, n) => i !== -1 && (n === 0 || i > order[n - 1])), `order violated: ${state.gitCalls.join(' | ')}`);
  assert.strictEqual(state.ghCalls.filter((c) => c.includes('PUT')).length, 1);
});

test('refuses to run off main or with a dirty tree', () => {
  assert.throws(() => runRelease(makeDeps({ branch: 'feature' }).deps, { part: 'patch', summary: 'S', date: '2026-08-08', dryRun: true, log: () => {} }), /main/);
  assert.throws(() => runRelease(makeDeps({ dirty: ' M x.js' }).deps, { part: 'patch', summary: 'S', date: '2026-08-08', dryRun: true, log: () => {} }), /clean/i);
});

test('aborts before commit when the staged set is not exactly the release trio [IL-42]', () => {
  const { deps, state } = makeDeps({ staged: ['.claude-plugin/plugin.json', 'CHANGELOG.md', 'docs/shipped-versions.tsv', 'stray.js'] });
  assert.throws(() => runRelease(deps, { part: 'minor', summary: 'S', date: '2026-08-08', dryRun: false, log: () => {} }), /staged/i);
  assert.ok(!state.gitCalls.some((c) => c.startsWith('commit')), 'must not commit a stray index');
});

test('aborts before push when origin/main moved during compose', () => {
  const { deps, state } = makeDeps({ ancestorOk: false });
  assert.throws(() => runRelease(deps, { part: 'minor', summary: 'S', date: '2026-08-08', dryRun: false, log: () => {} }), /diverg|ancestor/i);
  assert.ok(!state.gitCalls.some((c) => c.startsWith('push')), 'must not push over divergence');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/release/tests/run.test.js`
Expected: FAIL — `Cannot find module '../run.js'`

- [ ] **Step 3: Implement `bin/lib/release/run.js`**

```js
'use strict';
const { precheck } = require('./precheck.js');
const { bumpManifest, stubChangelogEntry, RELEASE_FILES } = require('./compose.js');
const { mirrorRelease } = require('./mirror.js');

function runRelease(deps, { part, summary, date, dryRun, log }) {
  const branch = deps.git(['branch', '--show-current']).trim();
  if (branch !== 'main') throw new Error(`releases run from main; current branch is "${branch}"`);
  if (deps.git(['status', '--porcelain']).trim() !== '') throw new Error('working tree is not clean');

  const { candidate: version, result } = precheck(deps, part);
  if (!result.ok) {
    const lines = result.conflicts.map((c) => `  - ${c.source}: ${c.detail} claims v${c.version}`);
    throw new Error(`version collision on v${version}:\n${lines.join('\n')}\nSuggested renumber: v${result.suggested}. Resolve and re-run.`);
  }

  const manifestPath = RELEASE_FILES[0];
  const changelogPath = RELEASE_FILES[1];
  const newManifest = bumpManifest(deps.readFile(manifestPath), version);
  const newChangelog = stubChangelogEntry(deps.readFile(changelogPath), version, summary);

  if (dryRun) {
    log(`[dry-run] would bump ${manifestPath} to v${version}`);
    log(`[dry-run] would stub CHANGELOG heading "## v${version} — ${summary}"`);
    log(`[dry-run] would append "${version}\t${date}\trelease" to docs/shipped-versions.tsv`);
    log('[dry-run] would commit the trio, verify ancestry, push origin main, and mirror the marketplace');
    return { version, pushed: false, mirrored: false };
  }

  deps.writeFile(manifestPath, newManifest);
  deps.writeFile(changelogPath, newChangelog);
  deps.appendShipped(deps.repoRoot, version, date);

  deps.git(['add', ...RELEASE_FILES]);
  const staged = deps.git(['diff', '--cached', '--name-only']).trim().split('\n').filter(Boolean).sort();
  const expected = [...RELEASE_FILES].sort();
  if (JSON.stringify(staged) !== JSON.stringify(expected)) {
    throw new Error(`staged set is not exactly the release trio: ${staged.join(', ')}`);
  }
  deps.git(['commit', '-m', `Release v${version} — ${summary}`]);

  deps.git(['fetch', 'origin', 'main']);
  try {
    deps.git(['merge-base', '--is-ancestor', 'origin/main', 'HEAD']);
  } catch {
    throw new Error('origin/main diverged between pre-check and push — rebase and re-run; never force');
  }
  deps.git(['push', 'origin', 'main']);
  log(`pushed v${version} to origin/main`);

  const description = JSON.parse(newManifest).description;
  const { changed } = mirrorRelease(deps, { version, description, dryRun: false });
  log(changed ? 'marketplace mirrored' : 'marketplace already current');
  return { version, pushed: true, mirrored: changed };
}

module.exports = { runRelease };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/release/tests/run.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full release suite together**

Run: `node --test bin/lib/release/tests/*.test.js`
Expected: PASS (all files)

- [ ] **Step 6: Commit**

```bash
git add bin/lib/release/run.js bin/lib/release/tests/run.test.js
git commit -m "Add release orchestrator — same-commit trio enforcement and push-time ancestry re-check (refs #234)"
```

---

### Task 5: CLI entry `bin/release.js` + docs

**Files:**
- Create: `bin/release.js`
- Modify: `docs/plugin-structure.md` (add `bin/release.js` to the CLI list — the same section that documents the four health sweeps, `record-graph`, and `wrap-up-state`; locate with `grep -n "wrap-up-state" docs/plugin-structure.md`)
- Test: none new (the CLI is a thin wire; logic is covered by Tasks 1-4 — matches the repo's existing pattern where `bin/*.js` entries delegate to tested `bin/lib/` modules)

**Interfaces:**
- Consumes: `runRelease` (`./lib/release/run.js`), `appendShippedVersion` (`./lib/shipped-record.js`).
- Produces: CLI grammar `node bin/release.js <minor|patch> "<summary>" [--dry-run]`. Exit 0 on success/dry-run, exit 1 with the error message on any abort. `--help` documents the grammar AND states the live-by-default decision explicitly ("The default is a live release; pass --dry-run to preview every action without writing").

- [ ] **Step 1: Implement `bin/release.js`**

```js
#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { runRelease } = require('./lib/release/run.js');
const { appendShippedVersion } = require('./lib/shipped-record.js');

const USAGE = `Usage: node bin/release.js <minor|patch> "<summary>" [--dry-run]

Performs a complete release from a clean main: collision pre-check, manifest
bump, CHANGELOG stub, shipped-versions.tsv append (one commit), push, and
marketplace mirror. The default is a LIVE release; pass --dry-run to preview
every action without writing. Aborts loudly on any collision or divergence.`;

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) { console.log(USAGE); return 0; }
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

- [ ] **Step 2: Smoke-verify the CLI wiring WITHOUT a live run**

Run: `node bin/release.js --help`
Expected: usage text, exit 0.
Run: `node bin/release.js minor 2>&1; echo "exit=$?"`
Expected: usage text on stderr, `exit=2` (missing summary).
Do NOT run a bare `node bin/release.js minor "x"` — this worktree is not `main`, so the branch guard would abort anyway, but the rule is the point: no live invocation during build (spec Gotcha; `[IL-73]`-class hazard).

- [ ] **Step 3: Update `docs/plugin-structure.md`**

Add one row/line for `bin/release.js` alongside the existing CLI entries: `node bin/release.js <minor|patch> "<summary>" [--dry-run]` — one-command release: 5-source collision pre-check, bump+CHANGELOG+tsv in one commit, push, marketplace mirror (fixture-tested in `bin/lib/release/tests/`).

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — including `tests/changelog-coverage.test.js` and `tests/shipped-record.test.js`, untouched and green (acceptance criterion).

- [ ] **Step 5: Commit**

```bash
git add bin/release.js docs/plugin-structure.md
git commit -m "Add bin/release.js CLI — one-command release with dry-run preview (refs #234)"
```

---

### Task 6: Shrink CLAUDE.md's Releasing section to invocation + judgment calls

**Files:**
- Modify: `CLAUDE.md` (the `### Releasing (two repos)` section only — surgical; no other section)

**Interfaces:**
- Consumes: the CLI grammar from Task 5.
- Produces: a Releasing section that (a) opens with the one-command invocation, (b) keeps ONLY the judgment calls the script cannot make, (c) drops the mechanical steps the script now performs (they live in `bin/release.js`'s implementation and `--help`). Record #233 (next in this run) evicts further; this task does the #234-scoped shrink so the section is rewritten once per record, in sequence.

- [ ] **Step 1: Rewrite the section**

Replace the body of `### Releasing (two repos)` with (keep the heading itself; preserve the intro sentence about two repos and the paragraph "**The whole-branch review gates the bump.**" verbatim — that is a judgment call the script cannot make):

```markdown
### Releasing (two repos)

A release touches **both** this repo and the separate marketplace repo (`thomasholknielsen/claude-tweaks-marketplace`).

**The whole-branch review gates the bump.** {existing paragraph verbatim — cross-task review before release, v6.48.0 → v6.48.1 (`[IL-97]`) example}

**Invocation:** `node bin/release.js <minor|patch> "<summary>"` from a clean `main` — runs the 5-source collision pre-check (origin/main, unpushed local main, sibling worktree branches, plan-document claims), lands bump + CHANGELOG entry + `docs/shipped-versions.tsv` line in one commit, re-checks ancestry, pushes, and mirrors the marketplace catalog from its live `main` via the contents API. Aborts loudly on any collision or divergence — `--dry-run` previews. Fixture-tested in `bin/lib/release/tests/`; never invoke a live run as a test (`[IL-73]`).

**Judgment calls the script cannot make:**
- minor vs patch (feature vs fix — CLAUDE.md's Versioning convention), and the one-line summary.
- Whether a collision means renumber-yours or keep (the script suggests; a shipped version's number is never renumbered — see the shipped-vs-never-shipped split below).
- If a renumber is forced: whether the old number reached `main`'s tip. Never shipped → renumber the CHANGELOG heading and tsv line. Shipped → keep both and add a second entry/line pointing at it (a duplicate heading is a parse failure; deleting a shipped tsv line erases release history) — `e4a79904`/6.64.1.
- `metadata.version` in the marketplace catalog is the marketplace's own scheme — the mirror never touches it; bump it manually on catalog-shape changes only.
```

Every dropped mechanical step must be verifiably performed by the script (cross-check against `bin/lib/release/run.js` — `[IL-102]`: the nearest thing that *executes* must carry the item, and here that is the script itself).

- [ ] **Step 2: Verify consumers still parse**

Run: `npm test`
Expected: PASS — `bin/lib/init/claude-md-conformance.js` and `tests/policy-schema.test.js` parse CLAUDE.md sections; confirm neither anchors on the Releasing section's removed prose (if one does, adjust the rewrite to keep that anchor, not the test).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "Shrink CLAUDE.md Releasing section to invocation plus judgment calls (refs #234)"
```

---

## Self-Review (performed at authoring)

- **Spec coverage:** pre-check 5 sources → Task 2 (fetch+origin, local main, worktree branches, plan claims; `git log origin/main -- plugin.json` is subsumed by reading origin/main's manifest value directly — the *value at tip* is what collides, not the log). Bump/stub/tsv/same-commit → Tasks 1+4. Push with abort-on-divergence → Task 4. Marketplace mirror from live main → Task 3. CLAUDE.md shrink → Task 6. Fixture-only tests → Global Constraints + every task. `--dry-run` + documented default → Tasks 4+5. Acceptance "one command, both repos pushed" → Task 5 wiring (push + mirror in one invocation).
- **Placeholder scan:** none — all code inline.
- **Type consistency:** `deps.git(argsArray) → string` and `deps.gh(argsArray) → string` uniform across Tasks 2-5; `appendShipped(root, version, date) → boolean` matches `bin/lib/shipped-record.js`'s real signature (verified against `tests/shipped-record.test.js:141`).
