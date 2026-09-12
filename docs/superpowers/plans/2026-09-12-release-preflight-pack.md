# Release Preflight Fact Pack (`bin/release-preflight.js`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One anchored, read-only CLI that gathers everything `/claude-tweaks:release`'s console needs — engine, last tag, unreleased commits, proposed version, open release PR, CI on the tip, a human-edited release PR, hook presence — into per-field `{ok, value | error}` envelopes written to `release-preflight.json`.

**Architecture:** `plugin/bin/lib/release-preflight/pack.js` gathers eight probes concurrently (each degrading only itself, bounded by a timeout) reusing `bin/lib/release-local/commits.js` (given an optional `ref`) and `bump.js`, `bin/lib/policy-schema.js`'s resolver, and `bin/lib/wrap-up/pack.js`'s `wrapProbe`/`withTimeout`; `plugin/bin/release-preflight.js` owns argv, run-dir anchoring (`--run` > `PIPELINE_RUN_DIR` > a fresh scratch dir), the 0/2/3 exit vocabulary and the atomic write — the same shape as `flow-preflight.js` / `wrap-up-pack.js`.

**Tech Stack:** Node 18+ built-ins, `node --test`, `tests/helpers/git-fixtures.js`.

**Spec:** `.claude-tweaks/pipelines/2026-09-11T204239-spec-2251-2252-2253-2254-2255-2256-2258/spec-2255/work/2255-spec.md` (record #2255); pattern: `.claude/skills/run-directory-fact-packs/SKILL.md`.

## Global Constraints

- Fact-pack contract (`run-directory-fact-packs`): per-field `{ok: true, value} | {ok: false, error}`, never a thrown probe aborting the pack; exit `0` pack produced (any field mix), `2` malformed invocation, `3` a structural precondition (`--run`/`PIPELINE_RUN_DIR` not anchored under the main checkout, or not inside a git checkout at all) — **no exit 1**; read-only apart from the pack file; atomic write; `--only`.
- `run(argv, deps)` seam, `process.exitCode` never `process.exit`; every fs/git/gh call through `deps`.
- Reuse by reference: `commits.js`'s header regex and `bump.js`'s precedence — no second copy.
- Node built-ins only; `'use strict'`, 2-space indent, single quotes, semicolons; commits `{Verb} {what} — {detail}, refs #2255`, trailer `Claude-Session: https://claude.ai/code/session_018rz67jb18j1RLSqhjEdYWH`; plain single git commands, never stash/reset/checkout ./clean.

## Field trace (the three questions, answered before writing)

| Field | Where it lives at gather time | Freshness step owed | Consumer timing |
|---|---|---|---|
| `engine` | `.claude-tweaks/policy.yml` (`integration-model`, explicit only — AC 6 forbids guessing) | none | console, before any action |
| `lastTag`, `unreleased`, `proposedVersion` | git: `origin/{branch}` when that ref exists locally, else `refs/heads/{branch}` (`tipRef` recorded in each value) | the caller fetches if it wants newer — the pack records which ref it read | console |
| `releasePr`, `openReleasePrConflict` | GitHub via `gh pr list`/`gh pr view` (pr-first); the literal `none`/`false` under local-merge | none (live read) | console |
| `ciTip` | GitHub check-runs for `tipRef`'s sha (pr-first); `n/a` under local-merge | none | console |
| `hook` | `.github/workflows/*.yml` text (pr-first) / `release-hook` policy (local-merge) | none | console |

## Rulings

1. **Exit 3 is only "not a git checkout" or "run dir not anchored".** The record's "no `origin`" wording contradicts its own AC 3 (no origin → `ciTip` degrades, siblings resolve); AC 3 wins, and the deviation is staged for the console.
2. **`engine` reads the explicit policy value only** (`source: 'policy'`, one of the two enum values); unset or invalid → `{ok: false, error: 'integration-model unresolved'}` (AC 6). No forge detection here.
3. **The tip ref** is `origin/{branch}` when `git rev-parse --verify` resolves it, else `refs/heads/{branch}`, `{branch}` from policy `integration-branch` else `main`; every git-derived value carries `tipRef`.
4. **A release PR** is an open PR whose `headRefName` starts with `release-please--` or whose title matches `/^chore(\([^)]*\))?: release /`; the first match wins.
5. **A bot author** is any author whose `login` or `name` ends with `[bot]` or whose email matches `[bot]@users.noreply.github.com`; a commit with no authors is treated as non-bot (conservative: conflict `true`).
6. **`hook` under pr-first** is true when any `.github/workflows/*.yml|yaml` contains a `release:` trigger with `published` among its types (a regex over the text, no YAML parser); under local-merge it is true when `release-hook` is set to something other than the disabled spellings `false/off/none/null`.
7. **No prior tag** → `lastTag` `{ok: false, error: 'no v* tag reachable from {tipRef}'}`; `unreleased` covers the full first-parent history and `proposedVersion`'s base is `.release-please-manifest.json`'s `"."` when present, else `0.0.0` — the same first-release rule the local engine uses.
8. **`bin/lib/wrap-up/pack.js` exports `withTimeout`** (one additive line) so the three packs share one bound rather than a third copy.
9. **A release-PR title must carry a version** — `isReleasePr`'s title regex is `/^chore(\([^)]*\))?: release \d/`; the plan's original `/…: release /` matched `chore: release notes` against its own test, caught by Task 2's implementer.
10. **`hook` reads the `on:` trigger, not any `release:` line** — a small text scanner over the `on:` block (block form, flow form, bare `on: release`, a `release` entry in a flow list) requiring `published` among the release types; a job named `release` never counts. Whole-branch review Critical 1 replaced the two whole-file regexes.
11. **`ciTip` asks GitHub for the branch by name** (`/commits/{branch}/check-runs`, `per_page=100`, `truncated` when `total_count` exceeds the page) and records `localSha` vs `headSha` as `tipBehind` — the pack never fetches, so the local `origin/{branch}` ref is not the tip. The field trace's "freshness: none" for `ciTip` was wrong. Whole-branch review Critical 2 / Important 3.
12. **The version base is derived like the engine's**: max of the highest strict `v*` tag, the manifest version at `tipRef` (through `release-local/manifest.js` when a config exists, else the manifest file's `"."`), and the first-parent tag — recorded as `baseSource`; when none resolves the field degrades with "no version base resolvable" instead of guessing `0.0.0`. Supersedes ruling 7 (this repo, the first consumer, has no `v*` tag and would have been offered `0.1.0` at 6.121.0). Important 5.
13. **Envelope discipline covers the preamble; a crash is exit 1.** A failing policy/root/tip resolution degrades every probe (`preamble failed: …`) and still writes the pack (exit 0); an undecided throw in `run()` exits 1 like both sibling packs — the 0/2/3 vocabulary governs decided outcomes. `engine` honours a run's pinned `config.yml` through `resolvePolicyConfig`; `openReleasePrConflict` flags any non-bot commit and degrades (never guesses) when authorship is unavailable; `releasePr` search declares itself inconclusive past its page. Important 4, 7, 8, 9, 11.

---

### Task 1: `commits.js` takes a `ref`

**Files:**
- Modify: `plugin/bin/lib/release-local/commits.js:12-19` (`lastTag`), `:31-41` (`readCommits`, `conventionalHistory`)
- Test: `tests/bin-lib/release-local/commits.test.js` (append two cases)

**Interfaces:**
- Produces: `lastTag(git, ref = 'HEAD')`, `readCommits(git, tag, ref = 'HEAD')`, `conventionalHistory(git, ref = 'HEAD')` — every existing caller passes no `ref` and is unchanged.

- [ ] **Step 1: Append the failing tests**

```js
test('lastTag/readCommits/conventionalHistory: an explicit ref replaces HEAD in every git call', () => {
  const calls = [];
  const git = (args) => { calls.push(args.join(' ')); return args[0] === 'describe' ? 'v1.2.0\n' : 'z'.repeat(40) + '\x1ffix: c\x1f\x1e\n'; };
  const h = conventionalHistory(git, 'origin/main');
  assert.strictEqual(h.lastTag, 'v1.2.0');
  assert.strictEqual(calls[0], 'describe --tags --match v[0-9]* --abbrev=0 --first-parent origin/main');
  assert.ok(calls[1].endsWith(' v1.2.0..origin/main'), calls[1]);
  readCommits(git, null, 'refs/heads/main');
  assert.ok(calls[2].endsWith(' refs/heads/main'), calls[2]);
});

test('lastTag/readCommits: the default ref is still HEAD', () => {
  const calls = [];
  const git = (args) => { calls.push(args.join(' ')); return args[0] === 'describe' ? 'v1.2.0\n' : ''; };
  lastTag(git); readCommits(git, 'v1.2.0');
  assert.ok(calls[0].endsWith(' HEAD') && calls[1].endsWith(' v1.2.0..HEAD'), calls.join(' | '));
});
```

- [ ] **Step 2: Run to verify failure** — Run: `node --test tests/bin-lib/release-local/commits.test.js` — Expected: FAIL (`origin/main` never appears in the describe call).

- [ ] **Step 3: Implement** — in `commits.js`:

```js
function lastTag(git, ref = 'HEAD') {
  try {
    const out = git(['describe', '--tags', '--match', 'v[0-9]*', '--abbrev=0', '--first-parent', ref]).trim();
    return out || null;
  } catch (err) {
    if (NO_TAG_RE.test(String(err.message || err))) return null;
    throw err;
  }
}
// … parseCommit unchanged …
function readCommits(git, tag, ref = 'HEAD') {
  const range = tag ? `${tag}..${ref}` : ref;
  const raw = git(['log', '--first-parent', `--format=%H${FIELD}%s${FIELD}%b${RECORD}`, range]);
  // … body unchanged …
}

function conventionalHistory(git, ref = 'HEAD') {
  const tag = lastTag(git, ref);
  return { lastTag: tag, commits: readCommits(git, tag, ref) };
}
```

- [ ] **Step 4: Run to verify pass** — Run: `node --test tests/bin-lib/release-local/*.test.js` — Expected: PASS (every existing release-local test unchanged).
- [ ] **Step 5: Commit** — `git add plugin/bin/lib/release-local/commits.js tests/bin-lib/release-local/commits.test.js` / `git commit -m "Let release-local commits.js read history from an explicit ref — the preflight pack reads the integration tip, not HEAD, refs #2255"` + trailer.

---

### Task 2: `pack.js` — the git and policy probes

**Files:**
- Create: `plugin/bin/lib/release-preflight/pack.js`
- Modify: `plugin/bin/lib/wrap-up/pack.js:459` (export `withTimeout`)
- Test: `tests/bin-lib/release-preflight/pack.test.js`

**Interfaces:**
- Consumes: `conventionalHistory(git, ref)` (Task 1), `bumpPart` (`bin/lib/release-local/bump.js`), `nextVersion` (`bin/lib/release/compose.js`), `resolvePolicyKeys` (`bin/lib/policy-schema.js`), `wrapProbe`/`withTimeout` (`bin/lib/wrap-up/pack.js`).
- Produces: `PROBE_NAMES`, `defaultDeps(cwd)`, `isBotAuthor(author)`, `isReleasePr(pr)`, `gatherReleasePreflight({cwd, only, deps}) -> pack` where `pack = {generatedAt, tipRef, branch, durationMs, <probe>: {ok, value|error, durationMs}…}`; `deps = {git(args), execFileAsync(cmd, args), readFile(absPath) -> string|null, readdir(absPath) -> string[], now(), env}`.

- [ ] **Step 1: Write the failing tests** (`tests/bin-lib/release-preflight/pack.test.js`)

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { gatherReleasePreflight, PROBE_NAMES, isBotAuthor, isReleasePr } = require('../../../plugin/bin/lib/release-preflight/pack.js');

const ROOT = '/repo';
const SHA = 'a'.repeat(40);
const LOG = (subjects) => subjects.map((s, i) => `${String(i).repeat(40)}\x1f${s}\x1f\x1e\n`).join('');

function fakeDeps(o = {}) {
  const files = { [path.join(ROOT, '.claude-tweaks/policy.yml')]: o.policy === undefined ? 'integration-model: pr-first\n' : o.policy, ...(o.files || {}) };
  const calls = { git: [], gh: [] };
  return {
    calls,
    deps: {
      git: (args) => {
        const key = args.join(' ');
        calls.git.push(key);
        if (key === 'rev-parse --show-toplevel') return `${ROOT}\n`;
        if (key.startsWith('rev-parse --verify --quiet refs/remotes/origin/')) { if (o.noOriginRef) throw new Error('fatal: Needed a single revision'); return `${SHA}\n`; }
        if (key.startsWith('rev-parse ')) return `${SHA}\n`;
        if (key.startsWith('describe')) { if (o.noTag) throw new Error('fatal: No names found, cannot describe anything.'); return 'v1.2.0\n'; }
        if (key.startsWith('log --first-parent')) return LOG(o.subjects === undefined ? ['feat: a'] : o.subjects);
        throw new Error(`unexpected git: ${key}`);
      },
      execFileAsync: async (cmd, args) => {
        calls.gh.push(`${cmd} ${args.join(' ')}`);
        if (o.ghFail) throw Object.assign(new Error(o.ghFail), { code: o.ghCode });
        const key = args.join(' ');
        if (key.startsWith('pr list')) return JSON.stringify(o.prs || []);
        if (key.startsWith('pr view')) return JSON.stringify({ commits: o.prCommits || [] });
        if (key.startsWith('repo view')) return JSON.stringify({ nameWithOwner: 'o/r' });
        if (key.startsWith('api repos/o/r/commits/')) return JSON.stringify(o.checkRuns || { total_count: 0, check_runs: [] });
        throw new Error(`unexpected gh: ${key}`);
      },
      readFile: (p) => (p in files ? files[p] : null),
      readdir: (p) => o.workflows && p === path.join(ROOT, '.github/workflows') ? Object.keys(o.workflows) : [],
      now: () => 1000,
      probeTimeoutMs: 2000,
    },
  };
}

test('PROBE_NAMES is the record\'s eight fields in order', () => {
  assert.deepStrictEqual(PROBE_NAMES, ['engine', 'lastTag', 'unreleased', 'proposedVersion', 'releasePr', 'ciTip', 'openReleasePrConflict', 'hook']);
});

test('AC 1 (pr-first): one unreleased feat since v1.2.0 → proposedVersion 1.3.0 minor, unreleased lists the parsed commit, tipRef is origin/main', async () => {
  const { deps } = fakeDeps();
  const pack = await gatherReleasePreflight({ cwd: ROOT, deps });
  assert.strictEqual(pack.engine.value, 'pr-first');
  assert.strictEqual(pack.tipRef, 'origin/main');
  assert.deepStrictEqual(pack.lastTag.value, { tag: 'v1.2.0', version: '1.2.0', tipRef: 'origin/main' });
  assert.strictEqual(pack.unreleased.value.commits.length, 1);
  assert.strictEqual(pack.unreleased.value.commits[0].type, 'feat');
  assert.deepStrictEqual(pack.proposedVersion.value, { version: '1.3.0', part: 'minor', base: '1.2.0', tipRef: 'origin/main' });
  for (const k of PROBE_NAMES) assert.ok(k in pack && typeof pack[k].ok === 'boolean', k);
});

test('AC 2: zero commits since the tag → unreleased is empty and proposedVersion degrades naming nothing to release', async () => {
  const { deps } = fakeDeps({ subjects: [] });
  const pack = await gatherReleasePreflight({ cwd: ROOT, deps });
  assert.deepStrictEqual(pack.unreleased.value.commits, []);
  assert.strictEqual(pack.proposedVersion.ok, false);
  assert.match(pack.proposedVersion.error, /nothing to release/);
});

test('AC 8 (local-merge): the same fixture yields the same unreleased/proposedVersion shape; releasePr is none, ciTip n/a, hook follows the policy key', async () => {
  const a = await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps({ policy: 'integration-model: local-merge\nrelease-hook: ./publish.sh\n' }).deps });
  assert.strictEqual(a.engine.value, 'local-merge');
  assert.deepStrictEqual(a.proposedVersion.value, { version: '1.3.0', part: 'minor', base: '1.2.0', tipRef: 'origin/main' });
  assert.strictEqual(a.unreleased.value.commits[0].type, 'feat');
  assert.deepStrictEqual(a.releasePr, { ok: true, value: 'none', durationMs: 0 });
  assert.deepStrictEqual(a.ciTip, { ok: true, value: 'n/a', durationMs: 0 });
  assert.deepStrictEqual(a.openReleasePrConflict.value, false);
  assert.strictEqual(a.hook.value, true);
  const b = await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps({ policy: 'integration-model: local-merge\nrelease-hook: false\n' }).deps });
  assert.strictEqual(b.hook.value, false);
});

test('AC 6: integration-model unset → engine, releasePr and hook all degrade naming engine unresolved; git fields still resolve', async () => {
  const { deps } = fakeDeps({ policy: '' });
  const pack = await gatherReleasePreflight({ cwd: ROOT, deps });
  assert.strictEqual(pack.engine.ok, false);
  assert.match(pack.engine.error, /integration-model unresolved/);
  for (const k of ['releasePr', 'hook', 'ciTip', 'openReleasePrConflict']) { assert.strictEqual(pack[k].ok, false, k); assert.match(pack[k].error, /engine unresolved/, k); }
  assert.strictEqual(pack.lastTag.ok, true);
  const bad = await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps({ policy: 'integration-model: gitlab\n' }).deps });
  assert.strictEqual(bad.engine.ok, false);
});

test('ruling 3: without origin/{branch} the tip is refs/heads/{branch}; integration-branch policy renames it', async () => {
  const { deps, calls } = fakeDeps({ noOriginRef: true, policy: 'integration-model: local-merge\nintegration-branch: develop\n' });
  const pack = await gatherReleasePreflight({ cwd: ROOT, deps });
  assert.strictEqual(pack.branch, 'develop');
  assert.strictEqual(pack.tipRef, 'refs/heads/develop');
  assert.ok(calls.git.some((c) => c === 'rev-parse --verify --quiet refs/remotes/origin/develop'));
});

test('ruling 7: no prior tag → lastTag degrades, unreleased covers the full history, base is the manifest file or 0.0.0', async () => {
  const withManifest = fakeDeps({ noTag: true, subjects: ['feat: first'], files: { [path.join(ROOT, '.release-please-manifest.json')]: '{\n  ".": "0.1.0"\n}\n' } });
  const a = await gatherReleasePreflight({ cwd: ROOT, deps: withManifest.deps });
  assert.strictEqual(a.lastTag.ok, false);
  assert.match(a.lastTag.error, /no v\* tag reachable from origin\/main/);
  assert.ok(withManifest.calls.git.some((c) => c.startsWith('log --first-parent') && c.endsWith(' origin/main')));
  assert.deepStrictEqual(a.proposedVersion.value, { version: '0.2.0', part: 'minor', base: '0.1.0', tipRef: 'origin/main' });
  const bare = await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps({ noTag: true, subjects: ['fix: x'] }).deps });
  assert.strictEqual(bare.proposedVersion.value.version, '0.0.1');
});

test('hook (pr-first): true only when a workflow declares a release trigger with published', async () => {
  const yes = fakeDeps({ workflows: { 'publish.yml': 'on:\n  release:\n    types: [published]\njobs: {}\n' } });
  yes.deps.readFile = ((orig) => (p) => (p === path.join(ROOT, '.github/workflows/publish.yml') ? yes.deps.readdir && 'on:\n  release:\n    types: [published]\njobs: {}\n' : orig(p)))(yes.deps.readFile);
  assert.strictEqual((await gatherReleasePreflight({ cwd: ROOT, deps: yes.deps })).hook.value, true);
  const no = fakeDeps({ workflows: { 'ci.yml': 'on: [push]\n' } });
  no.deps.readFile = ((orig) => (p) => (p === path.join(ROOT, '.github/workflows/ci.yml') ? 'on: [push]\n' : orig(p)))(no.deps.readFile);
  assert.strictEqual((await gatherReleasePreflight({ cwd: ROOT, deps: no.deps })).hook.value, false);
  assert.strictEqual((await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps().deps })).hook.value, false);
});

test('--only limits the probes gathered; the rest are absent from the pack', async () => {
  const pack = await gatherReleasePreflight({ cwd: ROOT, only: ['engine', 'lastTag'], deps: fakeDeps().deps });
  assert.deepStrictEqual(Object.keys(pack).filter((k) => PROBE_NAMES.includes(k)), ['engine', 'lastTag']);
});

test('a probe that throws degrades only itself (a git failure in describe leaves engine ok)', async () => {
  const { deps } = fakeDeps();
  deps.git = ((orig) => (args) => { if (args[0] === 'describe') throw new Error('fatal: not a git repository'); return orig(args); })(deps.git);
  const pack = await gatherReleasePreflight({ cwd: ROOT, deps });
  assert.strictEqual(pack.lastTag.ok, false);
  assert.match(pack.lastTag.error, /not a git repository/);
  assert.strictEqual(pack.engine.ok, true);
});

test('isBotAuthor / isReleasePr helpers', () => {
  assert.strictEqual(isBotAuthor({ login: 'github-actions', name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' }), true);
  assert.strictEqual(isBotAuthor({ login: 'release-please[bot]', name: '', email: '' }), true);
  assert.strictEqual(isBotAuthor({ login: 'thomas', name: 'Thomas', email: 't@x' }), false);
  assert.strictEqual(isReleasePr({ headRefName: 'release-please--branches--main', title: 'x' }), true);
  assert.strictEqual(isReleasePr({ headRefName: 'feature', title: 'chore(main): release 1.3.0' }), true);
  assert.strictEqual(isReleasePr({ headRefName: 'feature', title: 'chore: release notes' }), false);
});
```

- [ ] **Step 2: Run to verify failure** — Run: `node -e "require('./plugin/bin/lib/release-preflight/pack.js')"` — Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement** — first the one-line export in `plugin/bin/lib/wrap-up/pack.js`: `module.exports = { gatherPack, resolveInputs, wrapProbe, withTimeout, parseLedger, PROBE_NAMES };`. Then `plugin/bin/lib/release-preflight/pack.js`:

```js
'use strict';
// bin/lib/release-preflight/pack.js — the /claude-tweaks:release Step 1 fact
// pack (#2255): engine, last tag, unreleased commits, proposed version, open
// release PR, CI on the tip, a human-edited release PR, hook presence — one
// {ok, value | error} envelope per field, gathered concurrently, each
// degrading only itself (run-directory-fact-packs). Read-only. Every fs, git
// and gh call goes through `deps`. Reuses bin/lib/release-local's commit
// parser and bump precedence by reference — never a second copy.
const fs = require('fs');
const path = require('path');
const { execFile: execFileCb, execFileSync } = require('child_process');
const { promisify } = require('util');
const { conventionalHistory } = require('../release-local/commits.js');
const { bumpPart } = require('../release-local/bump.js');
const { nextVersion } = require('../release/compose.js');
const { resolvePolicyKeys } = require('../policy-schema.js');
const { wrapProbe, withTimeout } = require('../wrap-up/pack.js');

const PROBE_NAMES = ['engine', 'lastTag', 'unreleased', 'proposedVersion', 'releasePr', 'ciTip', 'openReleasePrConflict', 'hook'];
const PROBE_TIMEOUT_MS = 60000;
const EXEC_OPTS = { maxBuffer: 32 * 1024 * 1024, timeout: 30000 };
const ENGINES = new Set(['pr-first', 'local-merge']);
const HOOK_DISABLED = new Set(['false', 'off', 'none', 'null']);
const RELEASE_TRIGGER_RE = /^\s*release:\s*$/m;
const PUBLISHED_RE = /\bpublished\b/;

function defaultDeps(cwd) {
  const execFileAsync = promisify(execFileCb);
  return {
    git: (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    execFileAsync: async (cmd, args, opts = {}) => (await execFileAsync(cmd, args, { cwd, encoding: 'utf8', ...EXEC_OPTS, ...opts })).stdout,
    readFile: (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null; throw e; } },
    readdir: (p) => { try { return fs.readdirSync(p); } catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return []; throw e; } },
    now: () => Date.now(),
  };
}

// Ruling 5: a bot is any author identity GitHub renders with a [bot] suffix.
function isBotAuthor(a) {
  if (!a) return false;
  return /\[bot\]$/.test(String(a.login || '')) || /\[bot\]$/.test(String(a.name || '')) || /\[bot\]@users\.noreply\.github\.com$/.test(String(a.email || ''));
}

// Ruling 4: release-please's own branch prefix, or its PR title shape.
function isReleasePr(pr) {
  return /^release-please--/.test(String(pr.headRefName || '')) || /^chore(\([^)]*\))?: release /.test(String(pr.title || ''));
}

function policyString(entry) {
  const v = entry && entry.value;
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function memo(fn) {
  let p;
  return () => { if (p === undefined) p = Promise.resolve().then(fn); return p; };
}

async function gatherReleasePreflight({ cwd = process.cwd(), only = null, deps: overrides = {} } = {}) {
  const deps = { ...defaultDeps(cwd), ...overrides };
  const limit = Number.isFinite(deps.probeTimeoutMs) ? deps.probeTimeoutMs : PROBE_TIMEOUT_MS;
  const t0 = deps.now();
  const root = deps.git(['rev-parse', '--show-toplevel']).trim();
  const policyRaw = deps.readFile(path.join(root, '.claude-tweaks', 'policy.yml'));
  const policy = resolvePolicyKeys(['integration-model', 'integration-branch', 'release-hook'], { policyRaw, runConfigRaw: null });
  const branch = policyString(policy['integration-branch']) || 'main';
  let tipRef = `refs/heads/${branch}`;
  try { deps.git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`]); tipRef = `origin/${branch}`; } catch { /* no remote-tracking ref: read the local branch */ }

  // Ruling 2: the explicit policy value only — a guessed engine is exactly what AC 6 forbids.
  const engineEntry = policy['integration-model'];
  const engine = engineEntry && engineEntry.source === 'policy' && ENGINES.has(engineEntry.value) ? engineEntry.value : null;
  const needEngine = () => { if (!engine) throw new Error('engine unresolved'); return engine; };

  const history = memo(() => conventionalHistory(deps.git, tipRef));
  const releasePr = memo(async () => {
    if (needEngine() === 'local-merge') return 'none';
    const prs = JSON.parse(await deps.execFileAsync('gh', ['pr', 'list', '--state', 'open', '--limit', '50', '--json', 'number,state,mergeable,headRefName,title']));
    const pr = prs.find(isReleasePr);
    return pr ? { number: pr.number, state: pr.state, mergeable: pr.mergeable, headRefName: pr.headRefName, title: pr.title } : 'none';
  });

  const probes = {
    engine: () => { if (!engine) throw new Error('integration-model unresolved'); return engine; },
    lastTag: async () => {
      const { lastTag } = await history();
      if (!lastTag) throw new Error(`no v* tag reachable from ${tipRef}`);
      return { tag: lastTag, version: lastTag.replace(/^v/, ''), tipRef };
    },
    unreleased: async () => {
      const { lastTag, commits } = await history();
      return { since: lastTag, tipRef, commits: commits.map((c) => ({ sha: c.sha, type: c.type, scope: c.scope, breaking: c.breaking, subject: c.subject, description: c.description, unconventional: c.unconventional })) };
    },
    proposedVersion: async () => {
      const { lastTag, commits } = await history();
      const part = bumpPart(commits);
      if (part === 'none') throw new Error(`nothing to release: ${commits.length} commit(s) since ${lastTag || 'the first commit'}, none feat/fix/breaking`);
      let base = lastTag ? lastTag.replace(/^v/, '') : null;
      if (!base) {
        // Ruling 7: the first release computes from the bootstrap-seeded manifest, else 0.0.0.
        const manifest = deps.readFile(path.join(root, '.release-please-manifest.json'));
        const m = manifest && /"\.":\s*"(\d+\.\d+\.\d+)"/.exec(manifest);
        base = m ? m[1] : '0.0.0';
      }
      return { version: nextVersion(base, part), part, base, tipRef };
    },
    releasePr,
    ciTip: async () => {
      if (needEngine() === 'local-merge') return 'n/a';
      const sha = deps.git(['rev-parse', tipRef]).trim();
      const { nameWithOwner } = JSON.parse(await deps.execFileAsync('gh', ['repo', 'view', '--json', 'nameWithOwner']));
      const runs = JSON.parse(await deps.execFileAsync('gh', ['api', `repos/${nameWithOwner}/commits/${sha}/check-runs`]));
      const counts = { total: runs.total_count || 0, success: 0, failure: 0, pending: 0 };
      for (const r of runs.check_runs || []) {
        if (r.status !== 'completed') counts.pending += 1;
        else if (r.conclusion === 'success' || r.conclusion === 'skipped' || r.conclusion === 'neutral') counts.success += 1;
        else counts.failure += 1;
      }
      const state = counts.total === 0 ? 'none' : counts.failure ? 'failure' : counts.pending ? 'pending' : 'success';
      return { sha, tipRef, state, ...counts };
    },
    openReleasePrConflict: async () => {
      const pr = await releasePr();
      if (pr === 'none') return false;
      const { commits } = JSON.parse(await deps.execFileAsync('gh', ['pr', 'view', String(pr.number), '--json', 'commits']));
      const last = commits && commits.length ? commits[commits.length - 1] : null;
      if (!last || !last.authors || !last.authors.length) return true;
      return !last.authors.every(isBotAuthor);
    },
    hook: () => {
      if (needEngine() === 'local-merge') {
        const v = policyString(policy['release-hook']);
        return v !== null && !HOOK_DISABLED.has(v.toLowerCase());
      }
      const dir = path.join(root, '.github', 'workflows');
      return deps.readdir(dir).filter((f) => /\.ya?ml$/.test(f)).some((f) => {
        const text = deps.readFile(path.join(dir, f)) || '';
        return RELEASE_TRIGGER_RE.test(text) && PUBLISHED_RE.test(text);
      });
    },
  };

  const names = PROBE_NAMES.filter((n) => !only || only.includes(n));
  const pack = { generatedAt: new Date(t0).toISOString(), branch, tipRef };
  const results = await Promise.all(names.map((n) => wrapProbe(n, withTimeout(probes[n], limit), deps.now)));
  names.forEach((n, i) => { pack[n] = results[i]; });
  pack.durationMs = deps.now() - t0;
  return pack;
}

module.exports = { PROBE_NAMES, defaultDeps, isBotAuthor, isReleasePr, gatherReleasePreflight };
```

Note for the implementer: `wrapProbe`'s envelope from `bin/lib/wrap-up/pack.js` is `{ok, durationMs, value}` / `{ok, durationMs, error}` — the AC 8 assertions above spell that key order.

- [ ] **Step 4: Run to verify pass** — Run: `node --test tests/bin-lib/release-preflight/pack.test.js tests/bin-lib/wrap-up/*.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add plugin/bin/lib/release-preflight/pack.js plugin/bin/lib/wrap-up/pack.js tests/bin-lib/release-preflight/pack.test.js` / `git commit -m "Add release-preflight pack.js — eight independently-degrading probes over the integration tip, policy and GitHub, refs #2255"` + trailer.

---

### Task 3: `pack.js` — the GitHub probes' tests

**Files:**
- Test: `tests/bin-lib/release-preflight/pack.test.js` (append)

**Interfaces:** consumes Task 2's `gatherReleasePreflight` and `fakeDeps`.

- [ ] **Step 1: Append the tests**

```js
test('releasePr (pr-first): the open release-please PR, or none', async () => {
  const withPr = fakeDeps({ prs: [{ number: 7, state: 'OPEN', mergeable: 'MERGEABLE', headRefName: 'feature', title: 'x' }, { number: 9, state: 'OPEN', mergeable: 'CONFLICTING', headRefName: 'release-please--branches--main', title: 'chore(main): release 1.3.0' }] });
  const a = await gatherReleasePreflight({ cwd: ROOT, deps: withPr.deps });
  assert.deepStrictEqual(a.releasePr.value, { number: 9, state: 'OPEN', mergeable: 'CONFLICTING', headRefName: 'release-please--branches--main', title: 'chore(main): release 1.3.0' });
  assert.ok(withPr.calls.gh.some((c) => c.startsWith('gh pr list --state open')));
  const none = await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps({ prs: [] }).deps });
  assert.strictEqual(none.releasePr.value, 'none');
  assert.strictEqual(none.openReleasePrConflict.value, false);
});

test('AC 7: openReleasePrConflict is true when the newest PR commit has a human author, false when every author is a bot', async () => {
  const pr = [{ number: 9, state: 'OPEN', mergeable: 'MERGEABLE', headRefName: 'release-please--branches--main', title: 'chore(main): release 1.3.0' }];
  const bot = { login: 'github-actions', name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' };
  const human = { login: 'thomas', name: 'Thomas', email: 't@x' };
  const clean = await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps({ prs: pr, prCommits: [{ oid: 'a', authors: [bot] }] }).deps });
  assert.strictEqual(clean.openReleasePrConflict.value, false);
  const edited = await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps({ prs: pr, prCommits: [{ oid: 'a', authors: [bot] }, { oid: 'b', authors: [human] }] }).deps });
  assert.strictEqual(edited.openReleasePrConflict.value, true);
});

test('ciTip (pr-first): check-run counts on the tip sha; AC 3: a gh failure degrades ciTip and releasePr alone', async () => {
  const runs = { total_count: 3, check_runs: [{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'failure' }, { status: 'in_progress', conclusion: null }] };
  const ok = await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps({ checkRuns: runs }).deps });
  assert.deepStrictEqual(ok.ciTip.value, { sha: SHA, tipRef: 'origin/main', state: 'failure', total: 3, success: 1, failure: 1, pending: 1 });
  const down = await gatherReleasePreflight({ cwd: ROOT, deps: fakeDeps({ ghFail: 'spawn gh ENOENT', ghCode: 'ENOENT' }).deps });
  assert.strictEqual(down.ciTip.ok, false);
  assert.strictEqual(down.releasePr.ok, false);
  assert.strictEqual(down.openReleasePrConflict.ok, false);
  assert.strictEqual(down.engine.ok, true);
  assert.strictEqual(down.proposedVersion.ok, true);
  assert.strictEqual(down.hook.ok, true);
});

test('a hung probe is bounded by the timeout and degrades itself only', async () => {
  const { deps } = fakeDeps();
  deps.execFileAsync = () => new Promise(() => {});
  deps.probeTimeoutMs = 20;
  const pack = await gatherReleasePreflight({ cwd: ROOT, deps });
  assert.strictEqual(pack.releasePr.ok, false);
  assert.match(pack.releasePr.error, /timeout after 20ms/);
  assert.strictEqual(pack.lastTag.ok, true);
});
```

- [ ] **Step 2: Run** — `node --test tests/bin-lib/release-preflight/pack.test.js` — Expected: PASS (Task 2's implementation already covers these; a failure here is a Task 2 defect to fix in this task).
- [ ] **Step 3: Commit** — `git add tests/bin-lib/release-preflight/pack.test.js` / `git commit -m "Cover the release-preflight GitHub probes — release PR detection, bot-vs-human conflict, check-run counts, gh-down degradation, timeout bound, refs #2255"` + trailer.

---

### Task 4: `plugin/bin/release-preflight.js` — the anchored CLI

**Files:**
- Create: `plugin/bin/release-preflight.js`
- Test: `tests/bin-lib/release-preflight/cli.test.js`

**Interfaces:**
- Consumes: `gatherReleasePreflight`, `PROBE_NAMES` (Task 2), `resolveTarget` (`bin/lib/stage-item/write.js`), `safeReal` (`bin/lib/hooks/worktree-detect.js`), `writeFileAtomic` (`bin/lib/atomic-write.js`).
- Produces: `run(argv, deps) -> Promise<exit code>`, `parseArgs`, `USAGE`; `deps = {cwd(), env, stdout(s), stderr(s), mainRoot?, mkdtemp(prefix), packDeps}`.

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'release-preflight.js');
const { run, parseArgs } = require(CLI);

function mainCheckoutWithRun() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'release-preflight-cli-')));
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q'); git('config', 'user.email', 't@example.invalid'); git('config', 'user.name', 't'); git('commit', '-q', '--allow-empty', '-m', 'init'); git('branch', '-M', 'main');
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'policy.yml'), 'integration-model: local-merge\n');
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-09-12T000000-record-2255');
  fs.mkdirSync(runDir, { recursive: true });
  return { root, runDir };
}

const packDeps = { execFileAsync: async () => { const e = new Error('spawn gh ENOENT'); e.code = 'ENOENT'; throw e; } };

function baseDeps(fx, env = {}) {
  let out = ''; let err = '';
  return { d: { cwd: () => fx.root, mainRoot: fx.root, env, stdout: (s) => { out += s; }, stderr: (s) => { err += s; }, packDeps }, out: () => out, err: () => err };
}

test('parseArgs: --run/--json/--only, unknown flags and unknown probes are usage errors', () => {
  assert.deepStrictEqual(parseArgs(['--run', '/r', '--only', 'engine,lastTag']), { run: '/r', json: null, only: ['engine', 'lastTag'] });
  assert.throws(() => parseArgs(['--bogus']), /unknown flag/);
  assert.throws(() => parseArgs(['--only', 'nope']), /unknown probe: nope/);
  assert.throws(() => parseArgs(['--run']), /requires a value/);
});

test('AC 4a: --run anchored under the main checkout → exit 0, release-preflight.json written there with every field, printed to stdout', async () => {
  const fx = mainCheckoutWithRun();
  const { d, out } = baseDeps(fx);
  assert.strictEqual(await run(['--run', fx.runDir], d), 0);
  const file = JSON.parse(fs.readFileSync(path.join(fx.runDir, 'release-preflight.json'), 'utf8'));
  for (const k of ['engine', 'lastTag', 'unreleased', 'proposedVersion', 'releasePr', 'ciTip', 'openReleasePrConflict', 'hook']) assert.ok(k in file, k);
  assert.strictEqual(file.engine.value, 'local-merge');
  assert.strictEqual(file.releasePr.value, 'none');
  assert.strictEqual(JSON.parse(out()).engine.value, 'local-merge');
});

test('AC 4b: PIPELINE_RUN_DIR in the environment is the run dir when --run is absent', async () => {
  const fx = mainCheckoutWithRun();
  const { d } = baseDeps(fx, { PIPELINE_RUN_DIR: fx.runDir });
  assert.strictEqual(await run([], d), 0);
  assert.ok(fs.existsSync(path.join(fx.runDir, 'release-preflight.json')));
});

test('AC 4c: no run dir at all → a fresh scratch dir under the temp dir, its path on stderr', async () => {
  const fx = mainCheckoutWithRun();
  const { d, err } = baseDeps(fx);
  assert.strictEqual(await run([], d), 0);
  const m = /release-preflight\.json written to (\S+)/.exec(err());
  assert.ok(m, err());
  assert.ok(m[1].startsWith(fs.realpathSync(os.tmpdir())) || m[1].startsWith(os.tmpdir()), m[1]);
  assert.ok(fs.existsSync(m[1]));
});

test('exit 3: --run not anchored under the main checkout, or a cwd outside any git checkout', async () => {
  const fx = mainCheckoutWithRun();
  const { d, err } = baseDeps(fx);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'release-preflight-outside-'));
  assert.strictEqual(await run(['--run', outside], d), 3);
  assert.match(err(), /refused/);
  const nogit = fs.mkdtempSync(path.join(os.tmpdir(), 'release-preflight-nogit-'));
  const { d: d2, err: err2 } = baseDeps({ root: nogit });
  d2.mainRoot = undefined;
  assert.strictEqual(await run([], d2), 3);
  assert.match(err2(), /not inside a git checkout/);
});

test('exit 2: usage errors print USAGE and write nothing', async () => {
  const fx = mainCheckoutWithRun();
  const { d, err } = baseDeps(fx);
  assert.strictEqual(await run(['--only', 'nope'], d), 2);
  assert.match(err(), /usage:/);
  assert.ok(!fs.existsSync(path.join(fx.runDir, 'release-preflight.json')));
});

test('--only writes a partial pack; --json redirects it (parent must resolve under the main checkout)', async () => {
  const fx = mainCheckoutWithRun();
  const { d } = baseDeps(fx);
  const target = path.join(fx.runDir, 'sub', 'pack.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  assert.strictEqual(await run(['--run', fx.runDir, '--only', 'engine', '--json', target], d), 0);
  const file = JSON.parse(fs.readFileSync(target, 'utf8'));
  assert.deepStrictEqual(Object.keys(file).filter((k) => ['engine', 'lastTag'].includes(k)), ['engine']);
});

test('the real binary: exit 0 on the fixture with no origin — ciTip and releasePr are data, not exit codes (AC 3)', () => {
  const fx = mainCheckoutWithRun();
  fs.writeFileSync(path.join(fx.root, '.claude-tweaks', 'policy.yml'), 'integration-model: pr-first\n');
  const out = execFileSync('node', [CLI, '--run', fx.runDir], { cwd: fx.root, encoding: 'utf8', env: { ...process.env, PATH: '/nonexistent' } });
  const pack = JSON.parse(out);
  assert.strictEqual(pack.ciTip.ok, false);
  assert.strictEqual(pack.releasePr.ok, false);
  assert.strictEqual(pack.engine.ok, true);
});
```

Note on the last test: `PATH: '/nonexistent'` makes `gh` (and `git` for the child's own `execFileSync`) unfindable — if the fixture then fails on `git` too, replace the env with a `PATH` that contains git's directory but not gh's (`path.dirname(execFileSync('which', ['git']).toString().trim())`).

- [ ] **Step 2: Run to verify failure** — `node -e "require('./plugin/bin/release-preflight.js')"` — Expected: FAIL "Cannot find module".

- [ ] **Step 3: Implement**

```js
#!/usr/bin/env node
// plugin/bin/release-preflight.js — /claude-tweaks:release Step 1's fact pack
// (#2255): engine, last tag, unreleased commits, proposed version, open
// release PR, CI on the tip, human-edited release PR, hook presence — one
// process, one JSON, per-field {ok, value | error} envelopes. Read-only apart
// from the pack file. Exit 0 whenever the pack was produced (a degraded
// field is data the skill acts on, never an exit code), 2 on a malformed
// invocation, 3 when --run / PIPELINE_RUN_DIR does not resolve under the
// main checkout ([IL-127]/[IL-150] — decided on the real path) or the cwd is
// not inside a git checkout at all. With no run dir the pack goes to a fresh
// scratch directory under the system temp dir (run-directory-fact-packs'
// documented fallback); its path is printed on stderr.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { gatherReleasePreflight, PROBE_NAMES } = require('./lib/release-preflight/pack');
const { resolveTarget } = require('./lib/stage-item/write');
const { safeReal } = require('./lib/hooks/worktree-detect');
const { writeFileAtomic } = require('./lib/atomic-write');

const USAGE = 'usage: release-preflight.js [--run <dir>] [--json <path>] [--only <probe,...>]';
const FILE = 'release-preflight.json';

class UsageError extends Error {}

function parseArgs(argv) {
  const out = { run: null, json: null, only: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--run' || flag === '--json' || flag === '--only') {
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${flag} requires a value`);
      if (flag === '--only') {
        const names = value.split(',').map((s) => s.trim()).filter(Boolean);
        const bad = names.find((n) => !PROBE_NAMES.includes(n));
        if (bad) throw new UsageError(`unknown probe: ${bad} (known: ${PROBE_NAMES.join(', ')})`);
        out.only = names;
      } else {
        out[flag.slice(2)] = value;
      }
      i += 1;
      continue;
    }
    throw new UsageError(`unknown flag: ${flag}`);
  }
  return out;
}

function insideGitCheckout(cwd) {
  try { execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); return true; } catch { return false; }
}

async function run(argv, deps = {}) {
  const cwd = deps.cwd || (() => process.cwd());
  const env = deps.env || process.env;
  const stdout = deps.stdout || ((s) => process.stdout.write(s));
  const stderr = deps.stderr || ((s) => process.stderr.write(s));
  const mkdtemp = deps.mkdtemp || ((prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  const inCheckout = deps.insideGitCheckout || insideGitCheckout;
  let o;
  try { o = parseArgs(argv); } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    stderr(`release-preflight.js: ${err.message}\n${USAGE}\n`);
    return 2;
  }
  if (!inCheckout(cwd())) {
    stderr('release-preflight.js: not inside a git checkout — nothing written\n');
    return 3;
  }
  // --run, else PIPELINE_RUN_DIR, else a fresh scratch dir. Both explicit
  // sources must resolve under the main checkout (exit 3), exactly as the
  // sibling packs demand; the scratch fallback is what the pattern permits
  // when no run directory exists to anchor to.
  let dir;
  let scratch = false;
  const requested = o.run || env.PIPELINE_RUN_DIR || null;
  if (requested) {
    const target = resolveTarget({ runDir: requested, cwd: cwd(), mainRoot: deps.mainRoot });
    if (!target.ok) {
      stderr(`release-preflight.js: run dir ${requested} refused (${target.reason === 'missing' ? 'missing' : 'not anchored under the main checkout'}) — nothing written\n`);
      return 3;
    }
    dir = target.dir;
  } else {
    dir = mkdtemp('release-preflight-');
    scratch = true;
  }
  let file = path.join(dir, FILE);
  if (o.json) {
    const wanted = path.resolve(cwd(), o.json);
    const parent = safeReal(path.dirname(wanted));
    if (!parent || !resolveTarget({ runDir: parent, cwd: cwd(), mainRoot: deps.mainRoot }).ok) {
      stderr(`release-preflight.js: --json ${o.json} refused (its directory does not resolve under the main checkout) — nothing written\n`);
      return 3;
    }
    file = path.join(parent, path.basename(wanted));
  }
  const pack = await gatherReleasePreflight({ cwd: cwd(), only: o.only, deps: deps.packDeps || {} });
  const text = `${JSON.stringify(pack, null, 2)}\n`;
  writeFileAtomic(file, text);
  if (scratch) stderr(`release-preflight.js: no run directory resolved — ${FILE} written to ${file}\n`);
  stdout(text);
  return 0;
}

if (require.main === module) {
  run(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => { process.stderr.write(`release-preflight.js: ${err && err.stack ? err.stack : err}\n`); process.exitCode = 2; });
}

module.exports = { run, parseArgs, USAGE };
```

- [ ] **Step 4: Run** — `node --test tests/bin-lib/release-preflight/*.test.js tests/bin-lib/exit-code-conformance.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add plugin/bin/release-preflight.js tests/bin-lib/release-preflight/cli.test.js` / `git commit -m "Add release-preflight.js — the anchored, read-only fact pack CLI with the 0/2/3 vocabulary and the scratch-dir fallback, refs #2255"` + trailer.

---

### Task 5: Real-git acceptance + docs rows

**Files:**
- Test: `tests/bin-lib/release-preflight/acceptance.test.js`
- Modify: `docs/plugin-structure.md` (the `plugin/bin/` roster parenthetical — add `release-preflight` after `release-local`; a `plugin/bin/lib/release-preflight/` row after the `plugin/bin/lib/release-local/` row; a `node plugin/bin/release-preflight.js …` command line after the `release-local.js` one — each a single line)

- [ ] **Step 1: Write the acceptance test**

```js
'use strict';
// AC 1, 2, 8 against a real repo through the real CLI: a v1.2.0 tag and one
// feat: commit on main, read from refs/heads/main (no origin) under both
// engines; gh is absent from PATH so the GitHub fields degrade (AC 3).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { gitRepo, fixtureGit } = require('../../helpers/git-fixtures.js');

const CLI = path.join(__dirname, '../../../plugin/bin/release-preflight.js');
const GIT_DIR = path.dirname(execFileSync('which', ['git'], { encoding: 'utf8' }).trim());
const ENV = { ...process.env, PATH: GIT_DIR, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' };

function fixture(engine, { feat = true } = {}) {
  const root = gitRepo();
  fixtureGit(['-C', root, 'branch', '-M', 'main']);
  fixtureGit(['-C', root, 'tag', '-a', 'v1.2.0', '-m', 'v1.2.0'], { env: ENV });
  if (feat) fixtureGit(['-C', root, 'commit', '-q', '--allow-empty', '-m', 'feat: one'], { env: ENV });
  fs.mkdirSync(path.join(root, '.claude-tweaks', 'pipelines', 'run-1'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'policy.yml'), `integration-model: ${engine}\n`);
  return root;
}

function pack(root) {
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', 'run-1');
  const out = execFileSync('node', [CLI, '--run', runDir], { cwd: root, encoding: 'utf8', env: ENV });
  return { stdout: JSON.parse(out), file: JSON.parse(fs.readFileSync(path.join(runDir, 'release-preflight.json'), 'utf8')) };
}

test('AC 1: one feat since v1.2.0 → proposedVersion 1.3.0 minor, unreleased lists the feat, read from refs/heads/main', () => {
  const { file } = pack(fixture('pr-first'));
  assert.strictEqual(file.tipRef, 'refs/heads/main');
  assert.strictEqual(file.lastTag.value.version, '1.2.0');
  assert.strictEqual(file.proposedVersion.value.version, '1.3.0');
  assert.strictEqual(file.proposedVersion.value.part, 'minor');
  assert.strictEqual(file.unreleased.value.commits.length, 1);
  assert.strictEqual(file.unreleased.value.commits[0].type, 'feat');
  assert.strictEqual(file.ciTip.ok, false, 'no gh on PATH: ciTip degrades');
  assert.strictEqual(file.engine.ok, true);
});

test('AC 2: nothing since the tag → unreleased empty, proposedVersion degrades, exit 0', () => {
  const { file } = pack(fixture('pr-first', { feat: false }));
  assert.deepStrictEqual(file.unreleased.value.commits, []);
  assert.strictEqual(file.proposedVersion.ok, false);
  assert.match(file.proposedVersion.error, /nothing to release/);
});

test('AC 8: local-merge yields the same unreleased/proposedVersion shape; releasePr none, ciTip n/a', () => {
  const { file } = pack(fixture('local-merge'));
  assert.strictEqual(file.proposedVersion.value.version, '1.3.0');
  assert.strictEqual(file.unreleased.value.commits[0].type, 'feat');
  assert.strictEqual(file.releasePr.value, 'none');
  assert.strictEqual(file.ciTip.value, 'n/a');
  assert.strictEqual(file.hook.value, false);
});
```

- [ ] **Step 2: Run** — `node --test tests/bin-lib/release-preflight/acceptance.test.js` — Expected: PASS (or a first-run failure that is a Task 4 defect — fix it here).
- [ ] **Step 3: Docs rows** — in `docs/plugin-structure.md`: the roster list `release, release-bootstrap, release-local, residue,` → `release, release-bootstrap, release-local, release-preflight, residue,`; after the `plugin/bin/lib/release-local/` row insert one line: `plugin/bin/lib/release-preflight/ → pack.js — /claude-tweaks:release Step 1's fact pack (#2255): eight probes (engine from the explicit integration-model policy, lastTag / unreleased / proposedVersion over the integration tip via release-local's commits.js and bump.js, releasePr / ciTip / openReleasePrConflict through gh under pr-first, hook from the release: published workflow or the release-hook policy) gathered concurrently into {ok, value | error} envelopes, each degrading only itself; shares wrap-up/pack.js's wrapProbe/withTimeout. Consumed by plugin/bin/release-preflight.js`; after the `node plugin/bin/release-local.js …` command line insert: `node plugin/bin/release-preflight.js [--run <dir>] [--json <path>] [--only <probe,...>]   # Release preflight fact pack (#2255) — read-only; writes release-preflight.json to --run, else $PIPELINE_RUN_DIR, else a fresh scratch dir (path on stderr); exit 0 pack produced (degraded fields are data), 2 usage, 3 run dir not anchored under the main checkout or not inside a git checkout (plugin/bin/lib/release-preflight/, tests in tests/bin-lib/release-preflight/)`.
- [ ] **Step 4: Run** — `node --test tests/bin-lib/release-preflight/*.test.js tests/bin-lib/release-local/*.test.js tests/bin-lib/wrap-up/*.test.js tests/bin-lib/exit-code-conformance.test.js tests/skill-catalog-completeness.test.js` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add tests/bin-lib/release-preflight/acceptance.test.js docs/plugin-structure.md` / `git commit -m "Add release-preflight real-git acceptance tests and the plugin-structure rows, refs #2255"` + trailer.

---

## Self-Review

**Spec coverage:** D1 CLI → T4; D2 pack.js with the eight fields → T2/T3; envelope shape → T2 (`wrapProbe`); run-dir-or-scratch → T4 (AC 4 three paths); exit 0/2/3 → T4; unit tests per field incl. pr-first vs local-merge branching → T2/T3; docs row → T5. AC 1/2/8 real git → T5; AC 3 → T3 (fake gh down) + T4/T5 (real, gh absent); AC 5 → T2 (AC 8 test); AC 6 → T2; AC 7 → T3.

**Placeholder scan:** every code step carries code. **Type consistency:** `gatherReleasePreflight({cwd, only, deps})` in T2 = T4's call; `PROBE_NAMES` in T2 = T4's `--only` validation; `conventionalHistory(git, ref)` in T1 = T2's use; `fakeDeps` shape in T2 = T3's use.
