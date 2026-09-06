# Auto-Mode Ceremony Gate + console-resolve.js Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply wrap-up's diff-derived ceremony downgrade on every `auto`-mode run (not only headless firings), and resolve an `unattended` Review Console in one process via a new `console-resolve.js` CLI that also writes the `console.json` the archiver needs (#1854).

**Architecture:** The ceremony change is a gate swap — a two-line pure helper (`shouldDerive`) in the existing `ceremony-derive.js` plus the prose that cites it. The resolver is a pure classification-and-stance module (`plugin/bin/lib/console/resolve.js`) over one in-memory snapshot of the run dir (decisions, staged files, engine rows, member grants via an injected reader) and a thin CLI (`plugin/bin/console-resolve.js`) that owns the three writes: one decisions block, `console.json`, the rendered table. Side effects that need a model or an external call (memory writes, upstream filings, the merge itself) stay in the skill and consume the resolver's output.

**Tech Stack:** Node 18+ (no deps), `node:test`, existing modules `bin/lib/log-decision/append.js`, `bin/lib/stage-item/write.js` (`resolveTarget`), `bin/lib/issues/autonomy.js`, `bin/lib/issues/grant-maturation.js`, `bin/lib/policy-schema.js`, `bin/lib/atomic-write.js`, `bin/lib/dispatch/ceremony-derive.js`.

**Spec:** `.claude-tweaks/pipelines/2026-09-05T193518-spec-1921-1922-1923-1924-1925-1926-1930-1932-1931-1792-1927-1928-1929/spec-1932/work/1932-spec.md` (record #1932)

## Global Constraints

- Every `plugin/skills/**/*.md` touched stays ≤ 40,960 bytes; `plugin/skills/wrap-up/SKILL.md` (40,893 B now) must not grow (AC7); `review-console.md` (23,957 B) contains `console-resolve.js --run` exactly once.
- `ceremony-derivation.md` ends with no `DISPATCH_HEADLESS` literal (AC1); `dispatch/task-prompt.md`'s marker stays; `tests/flow-claim-preflight.test.js` pins it against `task-prompt.md`/`claim-targets.md` only (verified at plan time — no re-scope needed).
- The CLI never merges: no `gh pr merge`/`git merge` invocation anywhere in module or CLI (Task 3 pins it with a spy). The merge half is computed, never executed.
- The CLI re-checks `consoleAutoResolve` itself and exits 4 unless the resolved ceiling is `unattended`.
- Commit subjects end `(refs #1932)`; the PR (not commits) carries `Fixes #1854`.
- `plugin/bin/lib/console/` is a new flat sibling dir (`CLAUDE.md`: never a nested `_shared/`).

### Design decisions locked here (deviations from the record's literal text, staged as build deviations at Common Step 4.5)

1. **The mode gate has a code twin.** `ceremony-derive.js` gains `shouldDerive({mode, ceremonyProfile})` (`mode === 'auto' && ceremonyProfile === 'standard'`); the prose gate cites it and AC1's harness calls it, so prose and test cannot drift (the #1926/#1930 hindsight — a behavioral claim needs a named mechanism).
2. **Group members come from the fact pack.** The console runs after `wrap-up-pack.js` (#1930), so the resolver reads `{run-dir}/wrap-up-pack.json`'s `inputs.records` for the member list and falls back to `work/*-spec.md` `record:` lines; an empty list resolves the merge half to `leave-open` with `reason: 'members-unresolved'` — never merge on an unknown group.
3. **`needs-human` detection needs a producer.** No wrap-up prose today logs a `needs-human` verdict to `decisions.md` (only the merge path logs `assess-agent-autonomy verdict auto-merge`, `auto-merge-short-circuit.md:166`). Task 4 adds the symmetric line to that file's "Any layer fails" outcome; the resolver matches `/needs-human/i` on any `decisions.md` line that also mentions `merge-check` or `assess-agent-autonomy`.
4. **Low-confidence and Contested findings resolve to `keep-staged`.** `review-console.md` gives these rows no pre-checked default ("the user decides whether to apply, ignore, or escalate"), so "Approve all" has nothing to apply; the stance retains the staged file, never applies it, and says so in `SECTION_STANCES`.
5. **Cleanup actions are a section-level stance.** `cleanup-procedures.md`'s planned items are not files; the resolver returns `sections.cleanup = {resolution: 'approve'}` and the skill runs its own cleanup list as it does after a human "Approve all".
6. **Prefix table extended from the live corpus.** Beyond the record's table: `build-deviation-*`, `simplify-*`, `deepen-*` → Pending review; `review-unconfirmed-*` → Low-confidence; `review-debate-*` → Contested; `journeys-*` → Journey updates; `tidy-claude-md-rule-*` → Configuration updates; `tidy-doc-*` → Documentation updates; other `tidy-*`, `plan-retention-*`, `feedback-drafts*`, `specify-redteam-*`, `reflect-staged-*` → `Q#`. Anything else → Pending review, `reason: 'unmapped-prefix'`, never auto-approved.
7. **`readGrants` returns labels plus the pending-grant timestamp** (`{number: {labels, pendingSince}}`) so maturity is computed by the existing `evaluateMaturation` (`bin/lib/issues/grant-maturation.js`), not re-derived.
8. **`SKILL.md`'s citing sentence shrinks by 5 bytes** (heading "(auto-mode firings, #1545)", "an auto-mode run's") — the record's "net-zero" was an estimate; shrinking satisfies "does not grow".

---

## File Structure

| File | Responsibility |
|---|---|
| `plugin/bin/lib/dispatch/ceremony-derive.js` (modify) | `shouldDerive` — the auto-mode gate, pure |
| `plugin/skills/wrap-up/ceremony-derivation.md` (modify) | prose gate on `config.yml`'s `mode`, cites `shouldDerive` |
| `plugin/skills/wrap-up/SKILL.md:114-116` (modify) | heading + citing sentence |
| `plugin/bin/lib/console/resolve.js` (create) | `SECTION_MAP`, `SECTION_STANCES`, `classifyStagedItem`, `readSnapshot`, `resolveAll`, `renderTable` — pure through `deps` |
| `plugin/bin/console-resolve.js` (create) | CLI: args, anchoring, ceiling check, `gh`-backed `readGrants`, the three writes |
| `plugin/skills/wrap-up/review-console.md:79-93` (modify) | short-circuit calls the CLI once; exit-code fallthrough |
| `plugin/skills/wrap-up/auto-merge-short-circuit.md:267` (modify) | logs the `needs-human` verdict line the resolver reads |
| `plugin/skills/_shared/autonomy-ceiling.md:166` (modify) | one sentence naming the CLI |
| `tests/bin-lib/dispatch/ceremony-derive.test.js` (modify), `tests/ceremony-derivation-mode-gate.test.js` (create) | AC1 |
| `tests/bin-lib/console/resolve.test.js`, `tests/bin-lib/console/cli.test.js` (create) | AC2-AC5 |
| `tests/bin-lib/reconcile/archive-merged.test.js` (modify) | AC6 |
| `tests/console-resolve-conformance.test.js` (create) | AC7 prose pins |
| `docs/plugin-structure.md`, `docs/skill-graph.md` (modify) | rows |

---

### Task 1: The auto-mode ceremony gate

**Files:**
- Modify: `plugin/bin/lib/dispatch/ceremony-derive.js` (append `shouldDerive`, export it)
- Modify: `plugin/skills/wrap-up/ceremony-derivation.md` (heading, the skip paragraph)
- Modify: `plugin/skills/wrap-up/SKILL.md:114-116`
- Test: `tests/bin-lib/dispatch/ceremony-derive.test.js` (append), `tests/ceremony-derivation-mode-gate.test.js` (create)

**Interfaces:**
- Produces: `shouldDerive({mode, ceremonyProfile}) → boolean` — true only for `mode === 'auto'` and `ceremonyProfile === 'standard'`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/dispatch/ceremony-derive.test.js` (read its top to reuse its `require` line for the module; add `shouldDerive` to the destructure):

```js
test('shouldDerive: only an auto-mode run whose profile is still standard derives (#1932 AC1)', () => {
  assert.strictEqual(shouldDerive({ mode: 'auto', ceremonyProfile: 'standard' }), true);
  for (const mode of ['confirm', 'hybrid', 'interactive', undefined, null, '']) {
    assert.strictEqual(shouldDerive({ mode, ceremonyProfile: 'standard' }), false, `mode ${mode} never derives`);
  }
  assert.strictEqual(shouldDerive({ mode: 'auto', ceremonyProfile: 'fast-lane' }), false, 'already fast-lane: nothing to narrow');
  assert.strictEqual(shouldDerive({}), false, 'no config at all (standalone wrap-up) never derives');
});
```

Create `tests/ceremony-derivation-mode-gate.test.js` — the AC1 harness: it follows `ceremony-derivation.md`'s steps against a fixture run dir, using the real `set-config.js` writer:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SET_CONFIG = path.join(ROOT, 'plugin', 'bin', 'set-config.js');
const { shouldDerive, deriveCeremonyProfile } = require(path.join(ROOT, 'plugin', 'bin', 'lib', 'dispatch', 'ceremony-derive'));

// A test-only diff: one test file plus its materialized spec doc — the #1545 evidence shape.
const LOW_SURFACE = [
  { path: 'tests/x.test.js', additions: 75, deletions: 2 },
  { path: '.claude-tweaks/pipelines/r/work/7-spec.md', additions: 40, deletions: 0 },
];

function runDirWith(mode) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ceremony-gate-')));
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q'); git('config', 'user.email', 't@example.invalid'); git('config', 'user.name', 't'); git('commit', '-q', '--allow-empty', '-m', 'init');
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-09-06T000000-record-7');
  fs.mkdirSync(runDir, { recursive: true });
  if (mode !== null) fs.writeFileSync(path.join(runDir, 'config.yml'), `mode: ${mode}\nceremony-profile: standard\n`);
  return { root, runDir };
}

function readConfig(runDir) {
  try { return fs.readFileSync(path.join(runDir, 'config.yml'), 'utf8'); } catch { return null; }
}

// The file's own procedure, mechanized: read mode + profile, gate, derive, write via the sanctioned writer.
function followDerivation({ root, runDir }, files) {
  const cfg = readConfig(runDir) || '';
  const mode = (/^mode:\s*(\S+)/m.exec(cfg) || [])[1];
  const ceremonyProfile = (/^ceremony-profile:\s*(\S+)/m.exec(cfg) || [])[1];
  if (!shouldDerive({ mode, ceremonyProfile })) return { wrote: false };
  const derived = deriveCeremonyProfile(files, ceremonyProfile);
  if (derived === ceremonyProfile) return { wrote: false };
  execFileSync('node', [SET_CONFIG, '--run', runDir, '--key', 'ceremony-profile', '--value', derived], { cwd: root, encoding: 'utf8' });
  return { wrote: true };
}

test('mode auto + standard + low-surface diff → ceremony-profile becomes fast-lane via set-config.js (#1932 AC1)', () => {
  const fx = runDirWith('auto');
  assert.deepStrictEqual(followDerivation(fx, LOW_SURFACE), { wrote: true });
  assert.match(readConfig(fx.runDir), /^ceremony-profile:\s*fast-lane$/m);
});

for (const mode of ['confirm', 'hybrid', 'interactive']) {
  test(`mode ${mode} writes nothing (#1932 AC1)`, () => {
    const fx = runDirWith(mode);
    const before = readConfig(fx.runDir);
    assert.deepStrictEqual(followDerivation(fx, LOW_SURFACE), { wrote: false });
    assert.strictEqual(readConfig(fx.runDir), before);
  });
}

test('no config.yml (standalone wrap-up) writes nothing (#1932 AC1)', () => {
  const fx = runDirWith(null);
  assert.deepStrictEqual(followDerivation(fx, LOW_SURFACE), { wrote: false });
  assert.strictEqual(readConfig(fx.runDir), null);
});

test('mode auto but a diff touching production code leaves config.yml untouched (#1932 AC1)', () => {
  const fx = runDirWith('auto');
  const before = readConfig(fx.runDir);
  const mixed = [...LOW_SURFACE, { path: 'plugin/bin/x.js', additions: 3, deletions: 1 }];
  assert.deepStrictEqual(followDerivation(fx, mixed), { wrote: false });
  assert.strictEqual(readConfig(fx.runDir), before);
});

test('ceremony-derivation.md states the auto-mode gate and carries no DISPATCH_HEADLESS literal (#1932 AC1)', () => {
  const text = fs.readFileSync(path.join(ROOT, 'plugin', 'skills', 'wrap-up', 'ceremony-derivation.md'), 'utf8');
  assert.ok(!text.includes('DISPATCH_HEADLESS'));
  assert.match(text, /`mode` is `auto`/);
  assert.match(text, /`confirm`, `hybrid`, or `interactive`/);
  assert.match(text, /shouldDerive/);
  assert.ok(Buffer.byteLength(text, 'utf8') <= 40960);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node -e 'const m=require("./plugin/bin/lib/dispatch/ceremony-derive"); process.exit(typeof m.shouldDerive === "function" ? 0 : 1)'`
Expected: FAIL (exit 1 — `shouldDerive` is not exported yet). Then `node --test tests/ceremony-derivation-mode-gate.test.js` — Expected: FAIL (the harness throws on `shouldDerive` not being a function; the prose test fails on the `DISPATCH_HEADLESS` literal).

- [ ] **Step 3: Add `shouldDerive`**

Append to `plugin/bin/lib/dispatch/ceremony-derive.js` before `module.exports` and export it:

```js
// #1932: the gate is the run's MODE, not the presence of a human. In `auto`
// mode the Manifesto renders as a read-only FYI (`flow/manifesto.md`'s
// auto-mode variant never calls AskUserQuestion), so nobody could have
// adjusted `ceremony-profile` and the derivation applies whether or not a
// person is watching. `confirm`/`hybrid`/`interactive` presented the lever
// as a real question, so its value may be a human's answer — never touched.
// A standalone wrap-up has no config.yml and therefore no mode: never derives.
function shouldDerive({ mode, ceremonyProfile } = {}) {
  return mode === 'auto' && ceremonyProfile === 'standard';
}

module.exports = { computeDiffFacts, deriveCeremonyProfile, isDocsPath, shouldDerive };
```

- [ ] **Step 4: Rewrite the gate in `ceremony-derivation.md`**

Replace the heading line `# Diff-derived ceremony default (headless firings only, #1545)` with `# Diff-derived ceremony default (auto-mode firings, #1545)`.

Replace the sentence in the first paragraph `This file matters only for a headless firing whose header default is still `standard`.` with `This file matters only for an `auto`-mode run whose header default is still `standard`.` and, in that paragraph, `this file only decides which profile a headless firing gets` with `this file only decides which profile an `auto`-mode run gets`.

Replace the whole paragraph beginning `Skip entirely when `DISPATCH_HEADLESS=1` was not set on this run's invocation` and ending `so there is nothing here to\nclobber:` (read the file for the exact wrap) with:

```markdown
Skip entirely when `config.yml`'s `mode` is not `auto` — under `confirm`, `hybrid`, or `interactive`
the Manifesto presented `ceremony-profile` as a real question and its value may be a human's answer,
never to be clobbered — or when no `config.yml` exists (standalone wrap-up). In `auto` mode the
Manifesto is a read-only FYI table (`flow/manifesto.md`'s auto-mode variant never calls
`AskUserQuestion`), so nobody could have adjusted the lever whether or not a person was watching
the run (#1932; the earlier `DISPATCH_HEADLESS`-only gate left a human-present `auto` run paying the
full `standard` ceremony for a `size:low` single-module fix — 12 minutes of full-mode reflect on
#1535). The gate is `shouldDerive({mode, ceremonyProfile})` in
`bin/lib/dispatch/ceremony-derive.js` — true only when `mode` is `auto` and `ceremony-profile`
currently reads `standard`, the header-fold default (`flow/manifesto.md`'s Ceremony profile
computation), so there is nothing here to clobber:
```

Then replace, further down, `Evidence: Dispatch hub run #9,` … keep as is (it is history), and check with `grep -n "DISPATCH_HEADLESS\|headless" plugin/skills/wrap-up/ceremony-derivation.md` that no `DISPATCH_HEADLESS` literal remains; a remaining `headless firing` in the evidence sentences is fine (it describes the 2026-08-26 run), but the phrase `a headless (`auto`-mode, no Manifesto stop) firing` in the old gate paragraph must be gone with the paragraph.

- [ ] **Step 5: Shrink the citing sentence in `wrap-up/SKILL.md`**

Line 114: `### Diff-derived ceremony default (headless firings only, #1545)` → `### Diff-derived ceremony default (auto-mode firings, #1545)`.
Line 116: `it can narrow a headless firing's `standard` default down to `fast-lane`` → `it can narrow an auto-mode run's `standard` default down to `fast-lane``.
Measure: `wc -c plugin/skills/wrap-up/SKILL.md` must print a number ≤ 40893.

- [ ] **Step 6: Run the tests**

Run: `node --test tests/bin-lib/dispatch/ceremony-derive.test.js tests/ceremony-derivation-mode-gate.test.js tests/flow-claim-preflight.test.js tests/ceremony-profile-roster.test.js tests/wrap-up-pack-conformance.test.js`
Expected: all pass (flow-claim-preflight still finds `DISPATCH_HEADLESS` in `task-prompt.md`/`claim-targets.md`).

- [ ] **Step 7: Commit**

```bash
git add plugin/bin/lib/dispatch/ceremony-derive.js plugin/skills/wrap-up/ceremony-derivation.md plugin/skills/wrap-up/SKILL.md tests/bin-lib/dispatch/ceremony-derive.test.js tests/ceremony-derivation-mode-gate.test.js
git commit -m "Gate the diff-derived ceremony default on auto mode, not on DISPATCH_HEADLESS (refs #1932)"
```

---

### Task 2: `plugin/bin/lib/console/resolve.js` — classification, stances, `resolveAll`

**Files:**
- Create: `plugin/bin/lib/console/resolve.js`
- Test: `tests/bin-lib/console/resolve.test.js`

**Interfaces:**
- Produces: `classifyStagedItem(filename) → {section, reason?}`; `SECTION_MAP` (ordered `[RegExp, section]` pairs); `SECTION_STANCES` (section → `{resolution, reason}`); `readSnapshot({runDir, deps}) → snapshot`; `resolveAll({runDir, policy, deps}) → {items, sections, merge, table, ceiling: 'unattended', snapshot}`; `renderTable(result) → string`. `deps` = `{readFile(p), readdir(p), gitApplyCheck(patchPath) → {ok, error}, readGrants(numbers) → {n: {labels: [], pendingSince: Date|null}}, now() → ms, vetoWindowHours?}`. `policy` must be `'console-auto'` (anything else throws `RangeError`).
- Section names are exactly: `Auto-applied`, `Pending review`, `Low-confidence findings`, `Contested findings`, `Skill updates`, `Documentation updates`, `Journey updates`, `Configuration updates`, `Reference repairs`, `Cleanup actions`, `Queue writes`, `Memory updates`, `Upstream feedback`.
- Resolutions are one of: `applied`, `apply`, `stale`, `keep-staged`, `approve`, `filed`, `pending`.

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/console/resolve.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MOD = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'console', 'resolve');
const { classifyStagedItem, resolveAll, SECTION_STANCES, SECTION_MAP } = require(MOD);

function fixture({ decisions = '', staged = {}, engineState = null, pack = null, headers = [] } = {}) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'console-resolve-'));
  fs.mkdirSync(path.join(runDir, 'staged'), { recursive: true });
  fs.mkdirSync(path.join(runDir, 'work'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'decisions.md'), decisions);
  for (const [name, body] of Object.entries(staged)) fs.writeFileSync(path.join(runDir, 'staged', name), body);
  if (engineState) fs.writeFileSync(path.join(runDir, 'engine-state.json'), JSON.stringify(engineState));
  if (pack) fs.writeFileSync(path.join(runDir, 'wrap-up-pack.json'), JSON.stringify(pack));
  for (const n of headers) fs.writeFileSync(path.join(runDir, 'work', `${n}-spec.md`), `---\nrecord: ${n}\n---\n`);
  return runDir;
}

const PATCH = 'Target: src/a.js\nInvariant: the guard runs before the read\nFinding: medium error-handling — x\nStaged-at: abc123\nLedger: docs/plans/x-ledger.md#4\n\ndiff --git a/src/a.js b/src/a.js\n--- a/src/a.js\n+++ b/src/a.js\n@@ -1 +1 @@\n-a\n+b\n';

function deps(overrides = {}) {
  return {
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    readdir: (p) => { try { return fs.readdirSync(p); } catch { return []; } },
    gitApplyCheck: () => ({ ok: true }),
    readGrants: (numbers) => Object.fromEntries(numbers.map((n) => [n, { labels: ['auto:merge'], pendingSince: null }])),
    now: () => Date.parse('2026-09-06T12:00:00Z'),
    ...overrides,
  };
}

const EVERY_SECTION = {
  'review-2.patch': PATCH,
  'review-unconfirmed-3.md': 'unconfirmed',
  'review-contested-4.md': 'contested',
  'polish-suggestion-1.md': 'polish',
  'wrap-up-skill-1.md': 'skill',
  'wrap-up-doc-1.md': 'doc',
  'wrap-up-journey-1.md': 'journey',
  'tidy-claude-md-rule-1.md': 'rule',
  'reflect-1.md': 'reflect',
  'wrap-up-memory-1.md': 'memory',
  'wrap-up-upstream-1.md': 'upstream',
  'mystery-9.md': 'unmapped',
};

test('classifyStagedItem maps every known prefix to its console section and unknown prefixes to Pending review/unmapped-prefix (#1932)', () => {
  const expect = {
    'review-2.patch': 'Pending review', 'test-fix-1.patch': 'Pending review', 'deepen-collapse-1.patch': 'Pending review', 'simplify-1.patch': 'Pending review',
    'review-unconfirmed-3.md': 'Low-confidence findings', 'review-contested-4.md': 'Contested findings', 'review-debate-1.md': 'Contested findings',
    'polish-suggestion-1.md': 'Pending review', 'visual-review-skipped.md': 'Pending review', 'design-decision-2.md': 'Pending review', 'build-deviation-1.md': 'Pending review',
    'wrap-up-skill-1.md': 'Skill updates', 'wrap-up-skill-new-auth.md': 'Skill updates', 'wrap-up-skill-restructure.md': 'Skill updates',
    'wrap-up-doc-1.md': 'Documentation updates', 'release-backfill-v6.md': 'Documentation updates', 'tidy-doc-1.md': 'Documentation updates',
    'wrap-up-journey-1.md': 'Journey updates', 'journeys-convention.md': 'Journey updates',
    'tidy-claude-md-rule-1.md': 'Configuration updates',
    'reflect-1.md': 'Queue writes', 'digest-promotion-1.md': 'Queue writes', 'leftover-add-oauth.md': 'Queue writes', 'ledger-record-1.md': 'Queue writes',
    'upstream-unfiled-1.md': 'Queue writes', 'red-team-1.md': 'Queue writes', 'specify-overlap-1.md': 'Queue writes', 'flaky-allowlist-x.md': 'Queue writes',
    'tidy-parked-1.md': 'Queue writes', 'plan-retention-1.md': 'Queue writes', 'feedback-drafts.md': 'Queue writes',
    'wrap-up-memory-1.md': 'Memory updates', 'wrap-up-upstream-1.md': 'Upstream feedback',
  };
  for (const [name, section] of Object.entries(expect)) {
    assert.strictEqual(classifyStagedItem(name).section, section, name);
    assert.strictEqual(classifyStagedItem(name).reason, undefined, `${name} is mapped`);
  }
  assert.deepStrictEqual(classifyStagedItem('mystery-9.md'), { section: 'Pending review', reason: 'unmapped-prefix' });
  assert.ok(Array.isArray(SECTION_MAP) && SECTION_MAP.length > 10);
});

test('resolveAll resolves one item per section per the short-circuit stances and merges absent carve-outs (#1932 AC2)', () => {
  const runDir = fixture({ staged: EVERY_SECTION, headers: [7] });
  const r = resolveAll({ runDir, policy: 'console-auto', deps: deps() });
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  assert.strictEqual(by['review-2.patch'].resolution, 'apply');
  assert.strictEqual(by['review-unconfirmed-3.md'].resolution, 'keep-staged');
  assert.strictEqual(by['review-contested-4.md'].resolution, 'keep-staged');
  assert.strictEqual(by['polish-suggestion-1.md'].resolution, 'apply');
  assert.strictEqual(by['wrap-up-skill-1.md'].resolution, 'approve');
  assert.strictEqual(by['wrap-up-doc-1.md'].resolution, 'approve');
  assert.strictEqual(by['wrap-up-journey-1.md'].resolution, 'approve');
  assert.strictEqual(by['tidy-claude-md-rule-1.md'].resolution, 'approve');
  assert.strictEqual(by['reflect-1.md'].resolution, 'apply');
  assert.strictEqual(by['wrap-up-memory-1.md'].resolution, 'apply');
  assert.strictEqual(by['wrap-up-upstream-1.md'].resolution, 'filed');
  assert.deepStrictEqual({ resolution: by['mystery-9.md'].resolution, reason: by['mystery-9.md'].reason }, { resolution: 'pending', reason: 'unmapped-prefix' });
  assert.strictEqual(r.sections.cleanup.resolution, 'approve');
  assert.deepStrictEqual(r.merge, { resolution: 'merge', reason: 'every member carries auto:merge or a matured auto:merge-pending; no needs-human verdict' });
  assert.strictEqual(r.items.length, Object.keys(EVERY_SECTION).length);
  assert.strictEqual(r.ceiling, 'unattended');
});

test('a needs-human merge-check verdict in decisions.md resolves the merge half to leave-open (#1932 AC3)', () => {
  const decisions = '## /wrap-up\n- AUTO 12:00:00 — Auto-merge short-circuit: #7 assess-agent-autonomy verdict needs-human — Review Console renders normally. Reversibility: n/a.\n';
  const r = resolveAll({ runDir: fixture({ decisions, staged: { 'reflect-1.md': 'x' }, headers: [7] }), policy: 'console-auto', deps: deps() });
  assert.strictEqual(r.merge.resolution, 'leave-open');
  assert.match(r.merge.reason, /needs-human/);
});

test('an ungranted member (no auto:merge, no matured auto:merge-pending) resolves the merge half to leave-open (#1932 AC3)', () => {
  const grants = { 7: { labels: ['auto:merge'], pendingSince: null }, 8: { labels: ['auto:merge-pending'], pendingSince: new Date('2026-09-06T11:00:00Z') } };
  const r = resolveAll({ runDir: fixture({ staged: { 'reflect-1.md': 'x' }, headers: [7, 8] }), policy: 'console-auto', deps: deps({ readGrants: () => grants }) });
  assert.strictEqual(r.merge.resolution, 'leave-open');
  assert.match(r.merge.reason, /#8/);
  assert.match(r.merge.reason, /veto window/);
});

test('a matured auto:merge-pending counts as granted (#1932 AC3)', () => {
  const grants = { 7: { labels: ['auto:merge-pending'], pendingSince: new Date('2026-09-01T00:00:00Z') } };
  const r = resolveAll({ runDir: fixture({ staged: { 'reflect-1.md': 'x' }, headers: [7] }), policy: 'console-auto', deps: deps({ readGrants: () => grants }) });
  assert.strictEqual(r.merge.resolution, 'merge');
});

test('readGrants throwing resolves the merge half to leave-open with reason grants-unreadable (#1932 AC3)', () => {
  const r = resolveAll({ runDir: fixture({ staged: { 'reflect-1.md': 'x' }, headers: [7] }), policy: 'console-auto', deps: deps({ readGrants: () => { throw new Error('gh: not found'); } }) });
  assert.deepStrictEqual(r.merge, { resolution: 'leave-open', reason: 'grants-unreadable' });
});

test('no resolvable members resolves the merge half to leave-open with reason members-unresolved (#1932 decision 2)', () => {
  const r = resolveAll({ runDir: fixture({ staged: { 'reflect-1.md': 'x' } }), policy: 'console-auto', deps: deps() });
  assert.deepStrictEqual(r.merge, { resolution: 'leave-open', reason: 'members-unresolved' });
});

test('members come from wrap-up-pack.json inputs.records when present (#1932 decision 2)', () => {
  const calls = [];
  const runDir = fixture({ staged: { 'reflect-1.md': 'x' }, pack: { inputs: { records: [41, 42] } }, headers: [7] });
  resolveAll({ runDir, policy: 'console-auto', deps: deps({ readGrants: (n) => { calls.push(n); return Object.fromEntries(n.map((x) => [x, { labels: ['auto:merge'], pendingSince: null }])); } }) });
  assert.deepStrictEqual(calls, [[41, 42]]);
});

test('a staged patch that fails git apply --check resolves to stale with its Invariant echoed, never apply (#1932 AC4)', () => {
  const r = resolveAll({ runDir: fixture({ staged: { 'review-2.patch': PATCH }, headers: [7] }), policy: 'console-auto', deps: deps({ gitApplyCheck: () => ({ ok: false, error: 'patch failed: src/a.js:1' }) }) });
  const item = r.items.find((i) => i.id === 'review-2.patch');
  assert.strictEqual(item.resolution, 'stale');
  assert.match(item.reason, /re-derive from Invariant: the guard runs before the read/);
});

test('engine-state.json staged findings classify into their curation sections; applied ones render as applied (#1932)', () => {
  const engineState = { results: { skills: { result: 'findings', findings: [{ target: 'auth', action: 'staged', stagePath: 'staged/wrap-up-skill-1.md' }] }, references: { result: 'findings', findings: [{ target: 'docs/a.md', action: 'applied', commit: 'abc1234' }] } } };
  const r = resolveAll({ runDir: fixture({ staged: { 'wrap-up-skill-1.md': 'skill' }, engineState, headers: [7] }), policy: 'console-auto', deps: deps() });
  const ref = r.items.find((i) => i.section === 'Reference repairs');
  assert.deepStrictEqual({ resolution: ref.resolution, id: ref.id }, { resolution: 'applied', id: 'references:docs/a.md' });
  assert.strictEqual(r.items.filter((i) => i.id === 'wrap-up-skill-1.md').length, 1, 'a staged engine finding and its staged file are one item');
});

test('decisions.md STAGED coordination entries render as Low-confidence / Contested items (#1932)', () => {
  const decisions = '## /review\n- STAGED 10:00:00 — Single-read (low tier): lens "3b" finding src/a.js:4 not directly verified. Staged to Review Console as low-confidence. Reversibility: high.\n- STAGED 10:00:01 — Cross-lens debate inconclusive on src/b.js:9: staged/review-contested-1.md. Reversibility: high.\n';
  const r = resolveAll({ runDir: fixture({ decisions, staged: { 'review-contested-1.md': 'c' }, headers: [7] }), policy: 'console-auto', deps: deps() });
  assert.ok(r.items.some((i) => i.section === 'Low-confidence findings' && i.resolution === 'keep-staged'));
  assert.strictEqual(r.items.filter((i) => i.section === 'Contested findings').length, 1, 'the staged file and its decisions line are one item');
});

test('the snapshot is read once before any resolution: a second read would throw (#1932 Gotcha)', () => {
  let reads = 0;
  const runDir = fixture({ staged: EVERY_SECTION, headers: [7] });
  const d = deps({ readdir: (p) => { reads += 1; return fs.readdirSync(p); } });
  resolveAll({ runDir, policy: 'console-auto', deps: d });
  assert.strictEqual(reads, 2, 'staged/ and work/ each listed exactly once');
});

test('policy other than console-auto throws RangeError (#1932)', () => {
  assert.throws(() => resolveAll({ runDir: fixture(), policy: 'console-manual', deps: deps() }), RangeError);
});

test('SECTION_STANCES names a stance for every section the console renders (#1932)', () => {
  for (const s of ['Auto-applied', 'Pending review', 'Low-confidence findings', 'Contested findings', 'Skill updates', 'Documentation updates', 'Journey updates', 'Configuration updates', 'Reference repairs', 'Cleanup actions', 'Queue writes', 'Memory updates', 'Upstream feedback']) {
    assert.ok(SECTION_STANCES[s] && typeof SECTION_STANCES[s].resolution === 'string', s);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node -e 'try { require("./plugin/bin/lib/console/resolve"); process.exit(0); } catch { process.exit(1); }'`
Expected: FAIL (exit 1 — module does not exist).

- [ ] **Step 3: Write the module**

Create `plugin/bin/lib/console/resolve.js`:

```js
// plugin/bin/lib/console/resolve.js — one-process resolution of an
// `unattended` Review Console (#1932). Pure through `deps`: reads the run
// dir's decisions.md, staged/ items, engine-state.json, the fact pack's
// member list, and member grants via an injected reader, into ONE snapshot,
// then maps each item to the stance `wrap-up/review-console.md`'s
// "Auto-resolution short-circuit" states. Computes the merge half; never
// executes it. The CLI (bin/console-resolve.js) owns every write.
'use strict';

const path = require('path');
const { evaluateMaturation } = require('../issues/grant-maturation');

// Section names exactly as the console renders them (console-template.md;
// engine-render.js's SECTION_SPECS for the five curation sections).
const SECTIONS = {
  AUTO: 'Auto-applied',
  PENDING: 'Pending review',
  LOW: 'Low-confidence findings',
  CONTESTED: 'Contested findings',
  SKILL: 'Skill updates',
  DOC: 'Documentation updates',
  JOURNEY: 'Journey updates',
  CONFIG: 'Configuration updates',
  REF: 'Reference repairs',
  CLEANUP: 'Cleanup actions',
  QUEUE: 'Queue writes',
  MEMORY: 'Memory updates',
  UPSTREAM: 'Upstream feedback',
};

// Ordered: first match wins. Keyed on the staged file's id prefix — the
// `--id <kind>-<n>` stage-item.js wrote, or the filename a skill names.
// Verified against every `staged/…` prefix the skill corpus names (#1932
// plan, decision 6). An unknown prefix is NOT in this table on purpose:
// classifyStagedItem maps it to Pending review with reason 'unmapped-prefix'
// so a new producer can never slip past the console.
const SECTION_MAP = [
  [/^review-unconfirmed-/, SECTIONS.LOW],
  [/^review-(contested|debate)-/, SECTIONS.CONTESTED],
  [/\.patch$/, SECTIONS.PENDING],
  [/^(polish-suggestion|visual-review|design-decision|build-deviation|simplify|deepen)-/, SECTIONS.PENDING],
  [/^wrap-up-skill(-|\b)/, SECTIONS.SKILL],
  [/^(wrap-up-doc|release-backfill|tidy-doc)-/, SECTIONS.DOC],
  [/^(wrap-up-journey|journeys)(-|\b)/, SECTIONS.JOURNEY],
  [/^tidy-claude-md-rule-/, SECTIONS.CONFIG],
  [/^(reflect|digest-promotion|leftover|ledger-record|upstream-unfiled|red-team|specify-overlap|specify-redteam|flaky-allowlist|tidy|plan-retention|feedback-drafts)(-|\b)/, SECTIONS.QUEUE],
  [/^wrap-up-memory-/, SECTIONS.MEMORY],
  [/^wrap-up-upstream-/, SECTIONS.UPSTREAM],
];

// The short-circuit's stances, verbatim from review-console.md:
// - every batch section resolves as "Approve all" — Pending review patches
//   apply (after git apply --check), curation rows approve;
// - Low-confidence / Contested rows have no pre-checked default ("the user
//   decides whether to apply, ignore, or escalate") — Approve-all applies
//   nothing, so they stay staged (never auto-applied);
// - Q#/M# resolve to Apply, their pre-checked default;
// - U# resolves to FILED — the one point where unattended diverges from an
//   interactive Approve all (#347's Decision Rationale).
const SECTION_STANCES = {
  [SECTIONS.AUTO]: { resolution: 'applied', reason: 'already in commits — override = revert' },
  [SECTIONS.PENDING]: { resolution: 'apply', reason: 'Approve-all default (patch validated with git apply --check first)' },
  [SECTIONS.LOW]: { resolution: 'keep-staged', reason: 'unconfirmed finding — no Approve-all default; never auto-applied' },
  [SECTIONS.CONTESTED]: { resolution: 'keep-staged', reason: 'debate inconclusive — no Approve-all default; never auto-applied' },
  [SECTIONS.SKILL]: { resolution: 'approve', reason: 'Approve-all default' },
  [SECTIONS.DOC]: { resolution: 'approve', reason: 'Approve-all default' },
  [SECTIONS.JOURNEY]: { resolution: 'approve', reason: 'Approve-all default' },
  [SECTIONS.CONFIG]: { resolution: 'approve', reason: 'Approve-all default (stage-only row — the write happens at execution, never silently)' },
  [SECTIONS.REF]: { resolution: 'approve', reason: 'Approve-all default' },
  [SECTIONS.CLEANUP]: { resolution: 'approve', reason: 'Approve-all default — cleanup-procedures.md items run as planned' },
  [SECTIONS.QUEUE]: { resolution: 'apply', reason: 'pre-checked Apply default (batched-item-drill.md)' },
  [SECTIONS.MEMORY]: { resolution: 'apply', reason: 'pre-checked Apply default (batched-item-drill.md)' },
  [SECTIONS.UPSTREAM]: { resolution: 'filed', reason: 'unattended files upstream feedback like M#/Q# (#347)' },
};

const ENGINE_ROW_SECTIONS = { skills: SECTIONS.SKILL, docs: SECTIONS.DOC, journeys: SECTIONS.JOURNEY, 'claude-md': SECTIONS.CONFIG, 'decision-records': SECTIONS.CONFIG, references: SECTIONS.REF };

function classifyStagedItem(filename) {
  for (const [re, section] of SECTION_MAP) if (re.test(filename)) return { section };
  return { section: SECTIONS.PENDING, reason: 'unmapped-prefix' };
}

function readText(deps, file) {
  try { return deps.readFile(file); } catch { return null; }
}

function readJson(deps, file) {
  const text = readText(deps, file);
  if (text === null) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// Members: the fact pack's resolved record list when a pack exists (#1930
// gathers it before the console), else the run dir's materialized headers.
function readMembers(deps, runDir) {
  const pack = readJson(deps, path.join(runDir, 'wrap-up-pack.json'));
  const fromPack = pack && pack.inputs && Array.isArray(pack.inputs.records) ? pack.inputs.records.map(Number).filter(Number.isFinite) : [];
  if (fromPack.length) return fromPack;
  const nums = [];
  for (const name of deps.readdir(path.join(runDir, 'work'))) {
    const m = /^(\d+)-spec\.md$/.exec(name);
    if (!m) continue;
    const text = readText(deps, path.join(runDir, 'work', name)) || '';
    const rec = /^record:\s*(\d+)\s*$/m.exec(text);
    nums.push(Number(rec ? rec[1] : m[1]));
  }
  return [...new Set(nums)].sort((a, b) => a - b);
}

function parseInvariant(patchText) {
  const m = /^Invariant:\s*(.+)$/m.exec(patchText || '');
  return m ? m[1].trim() : null;
}

// Everything resolveAll reads, read once. No resolution is computed here.
function readSnapshot({ runDir, deps }) {
  const decisions = readText(deps, path.join(runDir, 'decisions.md')) || '';
  const stagedDir = path.join(runDir, 'staged');
  const staged = deps.readdir(stagedDir).filter((n) => !n.startsWith('.')).sort().map((name) => ({
    name,
    path: path.join(stagedDir, name),
    text: name.endsWith('.patch') ? readText(deps, path.join(stagedDir, name)) : null,
  }));
  const engineState = readJson(deps, path.join(runDir, 'engine-state.json'));
  const members = readMembers(deps, runDir);
  let grants = null;
  let grantsError = null;
  if (members.length) {
    try { grants = deps.readGrants(members) || {}; } catch (err) { grantsError = err; }
  }
  const patchChecks = {};
  for (const item of staged) {
    if (item.name.endsWith('.patch')) patchChecks[item.name] = deps.gitApplyCheck(item.path);
  }
  return { decisions, staged, engineState, members, grants, grantsError, patchChecks };
}

function decisionLines(decisions) {
  return decisions.split('\n').filter((l) => /^- (AUTO|STAGED|SKIP|KEPT-PROMPT|SCANNED|FAILED) /.test(l));
}

function needsHumanVerdict(decisions) {
  return decisionLines(decisions).find((l) => /needs-human/i.test(l) && /merge-check|assess-agent-autonomy/i.test(l)) || null;
}

function mergeResolution(snapshot, deps) {
  const verdict = needsHumanVerdict(snapshot.decisions);
  if (verdict) return { resolution: 'leave-open', reason: `merge-check verdict needs-human takes precedence: ${verdict.replace(/^- /, '')}` };
  if (!snapshot.members.length) return { resolution: 'leave-open', reason: 'members-unresolved' };
  if (snapshot.grantsError) return { resolution: 'leave-open', reason: 'grants-unreadable' };
  for (const n of snapshot.members) {
    const g = snapshot.grants[n] || { labels: [], pendingSince: null };
    const labels = g.labels || [];
    const mat = evaluateMaturation({
      hasMergeLabel: labels.includes('auto:merge'),
      hasPendingLabel: labels.includes('auto:merge-pending'),
      pendingSince: g.pendingSince || null,
      vetoWindowHours: deps.vetoWindowHours,
      now: deps.now(),
    });
    if (!mat.mature) return { resolution: 'leave-open', reason: `#${n} lacks auto:merge and a matured auto:merge-pending (${mat.reason})` };
  }
  return { resolution: 'merge', reason: 'every member carries auto:merge or a matured auto:merge-pending; no needs-human verdict' };
}

function stagedItems(snapshot) {
  return snapshot.staged.map((s) => {
    const { section, reason } = classifyStagedItem(s.name);
    if (reason) return { id: s.name, section, resolution: 'pending', reason };
    const stance = SECTION_STANCES[section];
    if (s.name.endsWith('.patch')) {
      const check = snapshot.patchChecks[s.name] || { ok: false, error: 'not checked' };
      if (!check.ok) {
        const inv = parseInvariant(s.text);
        return { id: s.name, section, resolution: 'stale', reason: `git apply --check failed (${check.error || 'unknown'}) — re-derive from Invariant: ${inv || '(no Invariant: line)'}` };
      }
    }
    return { id: s.name, section, resolution: stance.resolution, reason: stance.reason };
  });
}

// engine-state.json: { results: { <rowId>: { result, findings: [{target, action, commit?, stagePath?}] } } }
// (engine-render.js's worklistRows/collectFindings shape). A staged finding
// whose stagePath names a staged/ file is the same item as that file.
function engineItems(snapshot, stagedIds) {
  const out = [];
  const results = (snapshot.engineState && snapshot.engineState.results) || {};
  for (const [rowId, section] of Object.entries(ENGINE_ROW_SECTIONS)) {
    const entry = results[rowId];
    if (!entry || entry.result !== 'findings') continue;
    for (const f of entry.findings || []) {
      if (f.action === 'staged') {
        const base = f.stagePath ? path.basename(f.stagePath) : null;
        if (base && stagedIds.has(base)) continue; // already an item via staged/
        out.push({ id: `${rowId}:${f.target}`, section, resolution: SECTION_STANCES[section].resolution, reason: SECTION_STANCES[section].reason });
      } else if (f.action === 'applied') {
        out.push({ id: `${rowId}:${f.target}`, section, resolution: 'applied', reason: `applied (${f.commit || 'commit unknown'})` });
      }
    }
  }
  return out;
}

// decisions.md STAGED lines from review coordination that have no staged/
// file of their own (single-read unconfirmed findings). A line naming a
// staged/ path that exists is the same item as that file.
function coordinationItems(snapshot, stagedIds) {
  const out = [];
  for (const line of decisionLines(snapshot.decisions)) {
    if (!/^- STAGED /.test(line)) continue;
    const named = /staged\/([A-Za-z0-9._-]+)/.exec(line);
    if (named && stagedIds.has(named[1])) continue;
    if (/low-confidence|not directly verified|unconfirmed/i.test(line)) {
      out.push({ id: `decision:${line.slice(2, 60)}`, section: SECTIONS.LOW, resolution: 'keep-staged', reason: SECTION_STANCES[SECTIONS.LOW].reason });
    } else if (/contested|debate/i.test(line)) {
      out.push({ id: `decision:${line.slice(2, 60)}`, section: SECTIONS.CONTESTED, resolution: 'keep-staged', reason: SECTION_STANCES[SECTIONS.CONTESTED].reason });
    }
  }
  return out;
}

function renderTable(result) {
  const autoCount = decisionLines(result.snapshot.decisions).filter((l) => /^- AUTO /.test(l)).length;
  const lines = ['### Wrap-Up Review Console (auto-resolved at unattended)', '', `Auto-applied entries in decisions.md: ${autoCount} (already in commits — override = revert).`, '', '| # | Section | Item | Resolution | Reason |', '|---|---|---|---|---|'];
  result.items.forEach((it, i) => lines.push(`| ${i + 1} | ${it.section} | ${it.id} | AUTO-RESOLVED: ${it.resolution} | ${it.reason.replace(/\|/g, '\\|')} |`));
  lines.push(`| ${result.items.length + 1} | Cleanup actions | cleanup-procedures.md items | AUTO-RESOLVED: ${result.sections.cleanup.resolution} | ${result.sections.cleanup.reason} |`);
  lines.push('', `Merge: **${result.merge.resolution}** — ${result.merge.reason}`);
  return lines.join('\n');
}

function resolveAll({ runDir, policy, deps }) {
  if (policy !== 'console-auto') throw new RangeError(`unsupported policy: ${policy} (expected console-auto)`);
  const snapshot = readSnapshot({ runDir, deps });
  const stagedIds = new Set(snapshot.staged.map((s) => s.name));
  const items = [...stagedItems(snapshot), ...engineItems(snapshot, stagedIds), ...coordinationItems(snapshot, stagedIds)];
  const sections = { cleanup: { ...SECTION_STANCES[SECTIONS.CLEANUP] } };
  const merge = mergeResolution(snapshot, deps);
  const result = { ceiling: 'unattended', items, sections, merge, snapshot };
  result.table = renderTable(result);
  return result;
}

module.exports = { SECTIONS, SECTION_MAP, SECTION_STANCES, classifyStagedItem, readSnapshot, resolveAll, renderTable };
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/bin-lib/console/resolve.test.js`
Expected: all pass. If the "snapshot is read once" test counts more than 2 `readdir` calls, the module is re-listing a directory — fix the module, not the count.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/console/resolve.js tests/bin-lib/console/resolve.test.js
git commit -m "Add the console resolver: staged-item classification, short-circuit stances, computed merge half (refs #1932)"
```

---

### Task 3: `plugin/bin/console-resolve.js` — the CLI and its three writes

**Files:**
- Create: `plugin/bin/console-resolve.js`
- Test: `tests/bin-lib/console/cli.test.js`

**Interfaces:**
- Consumes: Task 2's `resolveAll`; `resolveTarget` (`bin/lib/stage-item/write.js`); `appendEntry`/`formatEntry` (`bin/lib/log-decision/append.js`); `resolvePolicyConfig` (`bin/lib/policy-schema.js`); `resolveCeiling`/`bookkeepingPermissions` (`bin/lib/issues/autonomy.js`); `writeFileAtomic` (`bin/lib/atomic-write.js`); `extractPendingGrantedAt` (`bin/lib/issues/grant-maturation.js`).
- Produces: `run(argv, deps) → Promise<exit code>` with `deps = {cwd, mainRoot, stdout, stderr, now, execFile (sync: (cmd, args, opts) → stdout string), policyReader?, resolverDeps?}`; exit 0 success, 2 malformed, 3 not anchored, 4 ceiling not granted. Writes (unless `--dry-run`): one decisions block under section `/wrap-up`, `{run-dir}/console.json` = `{resolved: true, mode: 'auto-resolve', at, ceiling: 'unattended', items, merge}`, and the table to stdout (`--json` prints the JSON result instead).

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/console/cli.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'console-resolve.js');
const { run } = require(CLI);

function mainCheckoutWithRun({ autonomy = 'unattended', staged = {}, decisions = '' } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'console-resolve-cli-')));
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q'); git('config', 'user.email', 't@example.invalid'); git('config', 'user.name', 't'); git('commit', '-q', '--allow-empty', '-m', 'init');
  fs.mkdirSync(path.join(root, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(root, '.claude-tweaks', 'policy.yml'), `autonomy: ${autonomy}\n`);
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-09-06T000000-record-7');
  fs.mkdirSync(path.join(runDir, 'staged'), { recursive: true });
  fs.mkdirSync(path.join(runDir, 'work'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'work', '7-spec.md'), '---\nrecord: 7\n---\n');
  fs.writeFileSync(path.join(runDir, 'decisions.md'), decisions);
  for (const [n, b] of Object.entries(staged)) fs.writeFileSync(path.join(runDir, 'staged', n), b);
  return { root, runDir };
}

const THREE = { 'reflect-1.md': 'r', 'wrap-up-memory-1.md': 'm', 'wrap-up-upstream-1.md': 'u' };

// The ceiling read runs `git rev-parse --show-toplevel` through the same execFile
// seam, so the fake must answer it with the fixture root — otherwise
// resolvePolicyConfig falls back to process.cwd() and reads THIS repo's policy.yml.
function fakeExec(calls, root) {
  return (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'git' && args[0] === 'rev-parse') return `${root}\n`;
    if (cmd === 'gh' && args[0] === 'issue' && args[1] === 'view') return JSON.stringify({ labels: [{ name: 'auto:merge' }], comments: [] });
    if (cmd === 'git' && args[0] === 'apply') return '';
    throw new Error(`unexpected exec: ${cmd} ${args.join(' ')}`);
  };
}

function baseDeps(fx, calls, over = {}) {
  let out = '';
  let err = '';
  const d = { cwd: () => fx.root, mainRoot: fx.root, stdout: (s) => { out += s; }, stderr: (s) => { err += s; }, now: () => Date.parse('2026-09-06T12:00:00Z'), execFile: fakeExec(calls, fx.root), ...over };
  return { d, out: () => out, err: () => err };
}

test('unattended: exit 0, one decisions block of items+1 lines, console.json resolved, one table row per item (#1932 AC5)', async () => {
  const fx = mainCheckoutWithRun({ staged: THREE });
  const calls = [];
  const { d, out } = baseDeps(fx, calls);
  const code = await run(['--run', fx.runDir, '--policy', 'console-auto'], d);
  assert.strictEqual(code, 0);
  const decisions = fs.readFileSync(path.join(fx.runDir, 'decisions.md'), 'utf8');
  const block = decisions.split('\n').filter((l) => /^- AUTO .*Console/.test(l));
  assert.strictEqual(block.length, 3 + 1, 'header + one line per item');
  assert.match(block[0], /Console auto-resolved 3 item\(s\) at unattended \(console-resolve\.js\)\. Reversibility: per item\./);
  const cj = JSON.parse(fs.readFileSync(path.join(fx.runDir, 'console.json'), 'utf8'));
  assert.strictEqual(cj.resolved, true);
  assert.strictEqual(cj.mode, 'auto-resolve');
  assert.strictEqual(cj.ceiling, 'unattended');
  assert.strictEqual(cj.items.length, 3);
  assert.deepStrictEqual(cj.merge, { resolution: 'merge', reason: 'every member carries auto:merge or a matured auto:merge-pending; no needs-human verdict' });
  const rows = out().split('\n').filter((l) => /AUTO-RESOLVED/.test(l));
  assert.strictEqual(rows.length, 3 + 1, 'one row per item plus the cleanup row');
});

test('trusted: exit 4 and nothing written (#1932 AC5)', async () => {
  const fx = mainCheckoutWithRun({ autonomy: 'trusted', staged: THREE });
  const before = fs.readFileSync(path.join(fx.runDir, 'decisions.md'), 'utf8');
  const { d, err } = baseDeps(fx, []);
  assert.strictEqual(await run(['--run', fx.runDir, '--policy', 'console-auto'], d), 4);
  assert.match(err(), /consoleAutoResolve/);
  assert.strictEqual(fs.readFileSync(path.join(fx.runDir, 'decisions.md'), 'utf8'), before);
  assert.ok(!fs.existsSync(path.join(fx.runDir, 'console.json')));
});

test('--dry-run at unattended prints the table and writes nothing (#1932 AC5)', async () => {
  const fx = mainCheckoutWithRun({ staged: THREE });
  const before = fs.readFileSync(path.join(fx.runDir, 'decisions.md'), 'utf8');
  const { d, out } = baseDeps(fx, []);
  assert.strictEqual(await run(['--run', fx.runDir, '--policy', 'console-auto', '--dry-run'], d), 0);
  assert.match(out(), /AUTO-RESOLVED/);
  assert.strictEqual(fs.readFileSync(path.join(fx.runDir, 'decisions.md'), 'utf8'), before);
  assert.ok(!fs.existsSync(path.join(fx.runDir, 'console.json')));
});

test('--json prints the result object instead of the table (#1932)', async () => {
  const fx = mainCheckoutWithRun({ staged: THREE });
  const { d, out } = baseDeps(fx, []);
  assert.strictEqual(await run(['--run', fx.runDir, '--policy', 'console-auto', '--json'], d), 0);
  const parsed = JSON.parse(out());
  assert.strictEqual(parsed.items.length, 3);
  assert.ok(!('snapshot' in parsed), 'the snapshot is internal');
});

test('malformed: a policy other than console-auto, or a --run that is not a directory, exits 2 (#1932 Gotcha)', async () => {
  const fx = mainCheckoutWithRun();
  const { d } = baseDeps(fx, []);
  assert.strictEqual(await run(['--run', fx.runDir, '--policy', 'manual'], d), 2);
  assert.strictEqual(await run(['--run', path.join(fx.runDir, 'nope'), '--policy', 'console-auto'], d), 2);
  assert.strictEqual(await run(['--policy', 'console-auto'], d), 2);
});

test('a --run outside the main checkout exits 3 and writes nothing (#1932 AC5)', async () => {
  const fx = mainCheckoutWithRun();
  const shadow = fs.mkdtempSync(path.join(os.tmpdir(), 'console-resolve-shadow-'));
  fs.mkdirSync(path.join(shadow, 'staged'));
  fs.writeFileSync(path.join(shadow, 'decisions.md'), '');
  const { d, err } = baseDeps(fx, []);
  assert.strictEqual(await run(['--run', shadow, '--policy', 'console-auto'], d), 3);
  assert.match(err(), /not anchored|missing/);
  assert.ok(!fs.existsSync(path.join(shadow, 'console.json')));
});

test('the merge is computed, never executed: no gh pr merge / git merge across a full run (#1932 Gotcha)', async () => {
  const fx = mainCheckoutWithRun({ staged: THREE });
  const calls = [];
  const { d } = baseDeps(fx, calls);
  assert.strictEqual(await run(['--run', fx.runDir, '--policy', 'console-auto'], d), 0);
  for (const c of calls) {
    assert.ok(!(c[0] === 'gh' && c[1] === 'pr' && c[2] === 'merge'), `gh pr merge invoked: ${c.join(' ')}`);
    assert.ok(!(c[0] === 'git' && c[1] === 'merge'), `git merge invoked: ${c.join(' ')}`);
  }
  assert.ok(calls.some((c) => c[0] === 'gh' && c[1] === 'issue' && c[2] === 'view'), 'grants were read live');
});

test('a gh failure while reading grants leaves the PR open with reason grants-unreadable (#1932 AC3)', async () => {
  const fx = mainCheckoutWithRun({ staged: THREE });
  const { d } = baseDeps(fx, [], { execFile: (cmd, args) => { if (cmd === 'gh') throw new Error('gh: not logged in'); if (cmd === 'git' && args[0] === 'rev-parse') return `${fx.root}\n`; return ''; } });
  assert.strictEqual(await run(['--run', fx.runDir, '--policy', 'console-auto'], d), 0);
  const cj = JSON.parse(fs.readFileSync(path.join(fx.runDir, 'console.json'), 'utf8'));
  assert.deepStrictEqual(cj.merge, { resolution: 'leave-open', reason: 'grants-unreadable' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node -e 'try { require("./plugin/bin/console-resolve.js"); process.exit(0); } catch { process.exit(1); }'`
Expected: FAIL (exit 1).

- [ ] **Step 3: Write the CLI**

Create `plugin/bin/console-resolve.js`:

```js
#!/usr/bin/env node
// plugin/bin/console-resolve.js — resolve an `unattended` Review Console in
// one process (#1932): every staged item, one decisions block, one
// console.json (the write the auto-resolve path never made — #1854, so
// archive-merged.js never archived an unattended run), one rendered table.
// The merge half is computed, never executed — `gh pr merge` stays in the
// skill's own path. Exit 0 resolved, 2 malformed, 3 --run not anchored under
// the main checkout ([IL-127]), 4 consoleAutoResolve not granted at the
// resolved ceiling (never resolve a console at supervised/trusted).
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { resolveAll } = require('./lib/console/resolve');
const { resolveTarget } = require('./lib/stage-item/write');
const { appendEntry, formatEntry } = require('./lib/log-decision/append');
const { resolvePolicyConfig } = require('./lib/policy-schema');
const { resolveCeiling, bookkeepingPermissions } = require('./lib/issues/autonomy');
const { extractPendingGrantedAt } = require('./lib/issues/grant-maturation');
const { writeFileAtomic } = require('./lib/atomic-write');

const USAGE = 'usage: console-resolve.js --run <dir> --policy console-auto [--dry-run] [--json]';

class UsageError extends Error {}

function parseArgs(argv) {
  const out = { run: null, policy: null, dryRun: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--run' || flag === '--policy') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${flag} requires a value`);
      out[flag === '--run' ? 'run' : 'policy'] = value;
      i += 1;
    } else if (flag === '--dry-run') out.dryRun = true;
    else if (flag === '--json') out.json = true;
    else throw new UsageError(`unknown flag: ${flag}`);
  }
  if (!out.run) throw new UsageError('--run <dir> is required');
  if (out.policy !== 'console-auto') throw new UsageError(`--policy must be console-auto (got ${out.policy || 'nothing'})`);
  return out;
}

function defaultExecFile(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024, timeout: 30000, ...opts });
}

// The ceiling, resolved in-process with the same precedence resolve-policy.js
// applies (run config over project policy): `resolvePolicyKeys` already folds
// config.yml over policy.yml, so the single resolved value is what
// resolveCeiling sees as runConfig.
function readCeiling({ execFile, cwd, runDir }) {
  const git = (args) => execFile('git', args, { cwd });
  const readFile = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
  const { result } = resolvePolicyConfig({ git, readFile, runDir, keys: ['autonomy'] });
  const entry = result.autonomy;
  const value = entry && entry.error === undefined ? entry.value : null;
  return resolveCeiling({ runConfig: value });
}

// Live grants per member — the Authorization read is never a snapshot
// (auto-merge-short-circuit.md's Authorization layer): labels and, for a
// pending grant, the grant timestamp from the audit-trail comment marker.
function ghReadGrants(execFile, cwd) {
  return (numbers) => {
    const out = {};
    for (const n of numbers) {
      const raw = execFile('gh', ['issue', 'view', String(n), '--json', 'labels,comments'], { cwd });
      const parsed = JSON.parse(raw);
      const labels = (parsed.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
      const bodies = (parsed.comments || []).map((c) => (typeof c === 'string' ? c : c.body || ''));
      out[n] = { labels, pendingSince: extractPendingGrantedAt(bodies) };
    }
    return out;
  };
}

function gitApplyCheck(execFile, cwd) {
  return (patchPath) => {
    try { execFile('git', ['apply', '--check', patchPath], { cwd }); return { ok: true }; } catch (err) {
      const msg = err && (err.stderr || err.message) ? String(err.stderr || err.message).trim() : 'git apply --check failed';
      return { ok: false, error: msg };
    }
  };
}

async function run(argv, deps = {}) {
  const cwd = deps.cwd || (() => process.cwd());
  const stdout = deps.stdout || ((s) => process.stdout.write(s));
  const stderr = deps.stderr || ((s) => process.stderr.write(s));
  const now = deps.now || (() => Date.now());
  const execFile = deps.execFile || defaultExecFile;
  let o;
  try { o = parseArgs(argv); } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    stderr(`console-resolve.js: ${err.message}\n${USAGE}\n`);
    return 2;
  }
  let isDir = false;
  try { isDir = fs.statSync(o.run).isDirectory(); } catch { isDir = false; }
  if (!isDir) { stderr(`console-resolve.js: --run ${o.run} is not a directory\n${USAGE}\n`); return 2; }
  const target = resolveTarget({ runDir: o.run, cwd: cwd(), mainRoot: deps.mainRoot });
  if (!target.ok) {
    stderr(`console-resolve.js: --run ${o.run} refused (${target.reason === 'missing' ? 'missing' : 'not anchored under the main checkout'}) — nothing written\n`);
    return 3;
  }
  const runDir = target.dir;
  const ceiling = readCeiling({ execFile, cwd: cwd(), runDir });
  if (!bookkeepingPermissions(ceiling).consoleAutoResolve) {
    stderr(`console-resolve.js: consoleAutoResolve is not granted at ceiling ${ceiling} (unattended only) — nothing written\n`);
    return 4;
  }
  const resolverDeps = {
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    readdir: (p) => { try { return fs.readdirSync(p); } catch { return []; } },
    gitApplyCheck: gitApplyCheck(execFile, cwd()),
    readGrants: ghReadGrants(execFile, cwd()),
    now,
    ...(deps.resolverDeps || {}),
  };
  const result = resolveAll({ runDir, policy: o.policy, deps: resolverDeps });
  const { snapshot, table, ...publicResult } = result;
  const at = new Date(now()).toISOString();
  if (!o.dryRun) {
    const header = formatEntry({ status: 'AUTO', now: now(), step: 'Review Console', text: `Console auto-resolved ${result.items.length} item(s) at unattended (console-resolve.js)`, reversibility: 'per item' });
    const lines = result.items.map((it) => formatEntry({ status: 'AUTO', now: now(), step: 'Review Console', text: `Console item ${it.id} (${it.section}): ${it.resolution} — ${it.reason}`, reversibility: it.resolution === 'keep-staged' || it.resolution === 'pending' ? 'n/a' : it.resolution === 'apply' ? 'medium' : 'high' }));
    appendEntry({ runDir, section: '/wrap-up', entry: [header, ...lines].join('\n') });
    writeFileAtomic(path.join(runDir, 'console.json'), `${JSON.stringify({ resolved: true, mode: 'auto-resolve', at, ceiling: 'unattended', items: result.items, merge: result.merge }, null, 2)}\n`);
  }
  stdout(o.json ? `${JSON.stringify({ ...publicResult, at, dryRun: o.dryRun }, null, 2)}\n` : `${table}\n`);
  return 0;
}

if (require.main === module) {
  run(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => { process.stderr.write(`console-resolve.js: ${err && err.stack ? err.stack : err}\n`); process.exitCode = 1; });
}

module.exports = { run, parseArgs };
```

Read `bin/lib/log-decision/append.js`'s `hms(now)` before relying on `formatEntry({now})` — pass whatever type it expects (a number of ms, per its `hms` helper); if it expects a `Date`, wrap `now()` in `new Date(...)` at both call sites. Read `extractPendingGrantedAt(commentBodies)`'s return type (a `Date` or `null`) — it is what `pendingSince` must be.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/bin-lib/console/cli.test.js tests/bin-lib/console/resolve.test.js`
Expected: all pass. The decisions block assertion counts lines matching `/^- AUTO .*Console/` — `formatEntry` renders `- AUTO HH:MM:SS — Review Console: Console …`, so both the header and each item line match.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/console-resolve.js tests/bin-lib/console/cli.test.js
git commit -m "Add console-resolve.js — one-process unattended console resolution that writes console.json (refs #1932)"
```

---

### Task 4: The skill prose calls the CLI; the needs-human verdict gets a producer

**Files:**
- Modify: `plugin/skills/wrap-up/review-console.md:79-93` (the short-circuit section)
- Modify: `plugin/skills/wrap-up/auto-merge-short-circuit.md:267` ("Any layer fails")
- Modify: `plugin/skills/_shared/autonomy-ceiling.md:166` (the `consoleAutoResolve` row)
- Test: `tests/console-resolve-conformance.test.js` (create)

**Interfaces:**
- Consumes: the CLI's flags and exit codes (Task 3); the resolver's resolutions (Task 2).

- [ ] **Step 1: Write the failing test**

Create `tests/console-resolve-conformance.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('review-console.md calls console-resolve.js --run exactly once, inside the short-circuit section, and stays under the ceiling (#1932 AC7)', () => {
  const t = read('plugin/skills/wrap-up/review-console.md');
  assert.strictEqual((t.match(/console-resolve\.js" --run/g) || []).length, 1);
  const section = t.indexOf('## Auto-resolution short-circuit');
  const next = t.indexOf('## Present a real stop');
  const call = t.indexOf('console-resolve.js" --run');
  assert.ok(section < call && call < next, 'the call lives in the short-circuit section');
  assert.match(t, /exit code 4/);
  assert.match(t, /exit codes 2 and 3/);
  assert.match(t, /HARD-GATE/);
  assert.match(t, /--dry-run/);
  assert.ok(Buffer.byteLength(t, 'utf8') <= 40960);
});

test('auto-merge-short-circuit.md logs the needs-human verdict the resolver reads (#1932 decision 3)', () => {
  const t = read('plugin/skills/wrap-up/auto-merge-short-circuit.md');
  assert.match(t, /assess-agent-autonomy verdict needs-human/);
  assert.ok(Buffer.byteLength(t, 'utf8') <= 40960);
});

test('autonomy-ceiling.md names console-resolve.js as consoleAutoResolve\'s execution (#1932)', () => {
  const t = read('plugin/skills/_shared/autonomy-ceiling.md');
  assert.match(t, /console-resolve\.js/);
  assert.ok(Buffer.byteLength(t, 'utf8') <= 40960);
});

test('wrap-up/SKILL.md did not grow past its pre-#1932 size (#1932 AC7)', () => {
  assert.ok(Buffer.byteLength(read('plugin/skills/wrap-up/SKILL.md'), 'utf8') <= 40893);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/console-resolve-conformance.test.js`
Expected: FAIL (no `console-resolve.js" --run` call; no `needs-human` log line; no CLI mention in autonomy-ceiling.md). The SKILL.md test passes already if Task 1 landed (it shrank the file) — that is fine.

- [ ] **Step 3: `review-console.md` — replace the per-item loop with the one call**

In the "## Auto-resolution short-circuit (`consoleAutoResolve`)" section, replace the paragraph beginning `Execute each resolution via the normal "On approval" procedure below. Two differences from a human-driven "Approve all":` and ending `…even though nothing prompted at `unattended`.` with:

```markdown
Resolve every item in one process instead of one turn each (#1932): `node "${CLAUDE_PLUGIN_ROOT}/bin/console-resolve.js" --run "$PIPELINE_RUN_DIR" --policy console-auto` (append `--dry-run` when this wrap-up runs `--dry-run` — it then prints without writing). The CLI applies exactly the stances above to every staged item (`bin/lib/console/resolve.js`'s `SECTION_STANCES`, its prefix table `SECTION_MAP`; a staged patch is `git apply --check`ed first and resolves to `stale — re-derive from Invariant:` when it no longer applies, never applied blind, per `_shared/staged-patch.md`; an unrecognized staged prefix lands in Pending review as `pending — unmapped-prefix`, never auto-approved), computes the merge half with both carve-outs above (`merge.resolution` = `merge` | `leave-open`, with the reason — it **never** runs the merge itself), appends one decisions block (`AUTO {time} — Review Console: Console auto-resolved {n} item(s) at unattended (console-resolve.js). Reversibility: per item.` plus one line per item), writes `{run-dir}/console.json` (`{resolved: true, mode: 'auto-resolve', at, ceiling, items, merge}` — the write the reconciler's archival needs, #1854), and prints the console table once — every row stamped `AUTO-RESOLVED`. Render that table verbatim. Then execute the returned resolutions through the normal "On approval" procedure below: the merge half per `merge.resolution` (`_shared/pr-first-merge.md` under `pr-first`; branch-finish under `local-merge`), the `M#` memory writes per `_shared/learning-routing.md`, the `U#` filings via `/claude-tweaks:feedback --pre-confirmed`, and the `apply` patches — **retain `staged/` files** rather than deleting them (they stay as revert artifacts, the same way the auto-merge short-circuit's own commit is still revertible). Non-zero exits: exit code 4 (ceiling not granted) → skip this section and proceed to "Present a real stop" below, the ordinary path; exit codes 2 and 3 (malformed invocation / `--run` not anchored) → a HARD-GATE failure: stop the wrap-up and report the CLI's stderr — an unattended run has nobody to answer a real stop. Send one consolidated `PushNotification` summarizing the run, at the same point the auto-merge short-circuit sends its own FYI (`_shared/autonomy-ceiling.md`'s Notification section) — one notification for the whole run, never one per item. End with the absolute path to `decisions.md`, `console.json`, and any retained `staged/*` files, so the operator has a concrete pointer even though nothing prompted at `unattended`.
```

Keep the stance bullets above it byte-identical (Task 2's comments quote them). Keep the closing `After resolving, proceed directly to the phase-trace report…` sentence.

- [ ] **Step 4: `auto-merge-short-circuit.md` — the needs-human producer**

At the `**Any layer fails:**` outcome (line ~267: `proceed to render the console normally, exactly as an …`), append one sentence to that paragraph:

```markdown
When the failing layer is a `merge-check` verdict of `needs-human`, log it first so the Review Console's own short-circuit (`review-console.md`, `console-resolve.js`) honours the carve-out: `AUTO {time} — Auto-merge short-circuit: #{n} assess-agent-autonomy verdict needs-human — Review Console renders normally. Reversibility: n/a.`
```

The inserted text must not contain the token `fast-lane` (the ceremony-roster test scans this file).

- [ ] **Step 5: `_shared/autonomy-ceiling.md` — one sentence**

In the `consoleAutoResolve` row (line ~166), after `Two sanctioned callers: …` add: `The zero-click resolution itself is executed by `bin/console-resolve.js` (#1932) — one process for every staged item, one decisions block, one `console.json`; the skill executes the returned resolutions.` Keep the row on one line (it is a table row).

- [ ] **Step 6: Verify**

Run: `node --test tests/console-resolve-conformance.test.js tests/ceremony-profile-roster.test.js tests/skill-prose-plugin-root-invocations.test.js tests/wrap-up-pack-conformance.test.js tests/console-on-pr.test.js` and `wc -c plugin/skills/wrap-up/review-console.md plugin/skills/wrap-up/auto-merge-short-circuit.md plugin/skills/_shared/autonomy-ceiling.md` (each ≤ 40960). Then `grep -rl "review-console.md\|auto-merge-short-circuit" tests/ | head` and run every suite listed.
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/wrap-up/review-console.md plugin/skills/wrap-up/auto-merge-short-circuit.md plugin/skills/_shared/autonomy-ceiling.md tests/console-resolve-conformance.test.js
git commit -m "Route the unattended console through console-resolve.js; log the needs-human verdict it reads (refs #1932)"
```

---

### Task 5: `archive-merged.js` accepts the auto-resolve `console.json` (#1854 regression test)

**Files:**
- Modify: `tests/bin-lib/reconcile/archive-merged.test.js` (append)

**Interfaces:**
- Consumes: `readConsoleState(runDir)`, `decideArchive(prState, consoleState)` (already exported; the test file destructures both at line ~13). The record's red-team resolution confirmed `readConsoleState` returns `'resolved'` on `parsed.resolved === true` with no `mode` check — no code change.

- [ ] **Step 1: Write the test**

Append (reusing the file's existing tmp-dir helpers — read lines 100-130 for the pattern used at line ~119):

```js
test('#1854: an auto-resolve console.json ({resolved:true, mode:"auto-resolve", …}) reads as resolved and archives, never console-never-rendered (#1932 AC6)', () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-merged-auto-resolve-'));
  fs.writeFileSync(path.join(runDir, 'console.json'), JSON.stringify({ resolved: true, mode: 'auto-resolve', at: '2026-09-06T12:00:00.000Z', ceiling: 'unattended', items: [], merge: { resolution: 'merge', reason: 'x' } }));
  assert.strictEqual(readConsoleState(runDir), 'resolved');
  const decision = decideArchive({ state: 'MERGED' }, readConsoleState(runDir));
  assert.notStrictEqual(decision.reason, 'console-never-rendered');
  assert.deepStrictEqual(decision, { action: 'archive' });
});
```

`decideArchive(prState, consoleState)` takes the PR state as an object (`prState.state === 'MERGED'`, `archive-merged.js:~258-274`) and returns `{ action: 'archive' }` or `{ action: 'skip', reason }` — verified at plan time.

- [ ] **Step 2: Run the test**

Run: `node --test tests/bin-lib/reconcile/archive-merged.test.js`
Expected: PASS (the shape already reads as resolved — this pins #1854's fix from the writer side). Prove discrimination once: `node -e 'const {readConsoleState}=require("./plugin/bin/lib/reconcile/archive-merged"); const fs=require("fs"),os=require("os"),p=require("path"); const d=fs.mkdtempSync(p.join(os.tmpdir(),"x-")); fs.writeFileSync(p.join(d,"console.json"), JSON.stringify({mode:"auto-resolve"})); console.log(readConsoleState(d))'` → prints `unresolved` (a console.json without `resolved: true` is not accepted — the test's assertion is not vacuous).

- [ ] **Step 3: Commit**

```bash
git add tests/bin-lib/reconcile/archive-merged.test.js
git commit -m "Pin #1854: an auto-resolve console.json archives (refs #1932)"
```

---

### Task 6: Docs rows

**Files:**
- Modify: `docs/plugin-structure.md` (a `plugin/bin/lib/console/` row after the `plugin/bin/lib/log-decision/` row at line ~31; a CLI command row after the `wrap-up-pack.js` row at line ~118)
- Modify: `docs/skill-graph.md` (`## wrap-up` table: one row)

- [ ] **Step 1: `docs/plugin-structure.md`**

After the `plugin/bin/lib/log-decision/` row insert (match the column alignment of the neighbouring rows):

```
plugin/bin/lib/console/           → resolve.js — one-process Review Console resolution for `unattended` (#1932): SECTION_MAP (staged-id prefix → console section; unknown → Pending review/unmapped-prefix), SECTION_STANCES (review-console.md's short-circuit stances verbatim), readSnapshot (decisions.md + staged/ + engine-state.json + the fact pack's members + live grants via an injected reader, read once), resolveAll → {items, sections, merge, table}; the merge half is computed, never executed. Consumed by plugin/bin/console-resolve.js
```

After the `wrap-up-pack.js` command row insert:

```
node plugin/bin/console-resolve.js --run <dir> --policy console-auto [--dry-run] [--json]   # Unattended console resolver (#1932) — one decisions block, {run-dir}/console.json (#1854), the rendered table; exit 0 resolved, 2 malformed, 3 unanchored --run, 4 consoleAutoResolve not granted
```

- [ ] **Step 2: `docs/skill-graph.md`**

In `## wrap-up`'s table add a row in its column shape (read the table header first): `| \`/claude-tweaks:wrap-up\` (self, unattended) | The Review Console's auto-resolution short-circuit runs \`console-resolve.js\` once per run (#1932) — every staged item resolved per the short-circuit's stances in one process, \`console.json\` written so \`bin/hooks.js reconcile\`'s archival sees a rendered console (#1854); the merge, memory, and upstream side effects stay in the skill. |` — if the table forbids self-rows (check how other skills phrase intra-skill CLI edges), attach the sentence to the existing `/assess-agent-autonomy` row instead and say which in the report.

- [ ] **Step 3: Verify and commit**

Run: `node --test tests/skill-graph-table-structure.test.js tests/console-resolve-conformance.test.js`
Expected: PASS.

```bash
git add docs/plugin-structure.md docs/skill-graph.md
git commit -m "Document console-resolve.js and the console resolver module (refs #1932)"
```

---

## Self-review

- **Spec coverage:** Deliverable 1 → Task 1; 2 → Task 2; 3 → Task 3; 4 → Task 4; 5 → Task 5 (test only, per the record's own red-team resolution); 6 → Tasks 1-5's tests; 7 → Task 6 + Task 4's autonomy-ceiling sentence. AC1 → Task 1's harness (auto / confirm / hybrid / interactive / missing config); AC2-AC4 → Task 2; AC5 → Task 3; AC6 → Task 5; AC7 → Task 4's conformance test + Common Step 5's full suite.
- **Placeholder scan:** none.
- **Type consistency:** `resolveAll` returns `{ceiling, items, sections, merge, table, snapshot}` in Task 2 and Task 3 destructures `{snapshot, table, ...publicResult}`; `readGrants` returns `{n: {labels, pendingSince}}` in both; `gitApplyCheck` returns `{ok, error}` in both; resolutions vocabulary `applied|apply|stale|keep-staged|approve|filed|pending` used consistently; section names identical across Tasks 2, 3 (table), and 4 (prose).
- **Plan-authoring checks:** Behavioral-claim — the AC1 harness names `shouldDerive` + `set-config.js` as the mechanism; Consumer-timing — the resolver reads `wrap-up-pack.json` gathered in Phase 3, before the console, and reads grants live (never the pack's snapshot) for the authorization decision; Verbatim-command — `gh issue view --json labels,comments` is the same call `auto-merge-short-circuit.md` already documents; Degrade-clause — exit 2/3 as HARD-GATE cites the record's red-team resolution and the codebase's fail-loud convention; Size-headroom — `review-console.md` 23,957 B + ~2.3 KB stays far under 40,960; `SKILL.md` shrinks.
