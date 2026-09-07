# flow-preflight.js Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse `/flow`'s second-call preflight — run-dir adoption, the resume-freshness probe, the staged-inventory check, the Manifesto levers, the materialized-spec check, the PR record and its phase checklist, the runner stamp, and the changed-file set — into one `flow-preflight.js --run <dir> --steps <list>` call whose JSON `steps-and-gates.md` and `manifesto.md` read instead of probing.

**Architecture:** A pure module `plugin/bin/lib/flow/preflight.js` computes the adoption case from the same predicates the prose states (the five note-line literals move into the module as constants and the prose cites them — one source), calls `checkResumeFreshness`/`checkStagedInventory` directly, resolves policy levers in-process, and spawns exactly three bounded subprocesses (`gh pr view`, `verify.js --stamp-status`, `verify.js --changed-files`); every field is a `{ok, value | error}` envelope, gathered concurrently, one snapshot. A thin CLI anchors `--run` under the main checkout, writes `{run-dir}/preflight.json` atomically, and exits 0 whenever a pack was produced (adoption `BLOCKED` is data). Prose then branches on fields.

**Tech Stack:** Node 18+ (no deps), `node:test`; reused modules `bin/lib/hooks/resume-freshness.js`, `bin/lib/hooks/staged-inventory.js`, `bin/lib/hooks/context.js` (`readRunState`), `bin/lib/policy-schema.js` (`resolvePolicyConfig`), `bin/lib/stage-item/write.js` (`resolveTarget`), `bin/lib/atomic-write.js`, `bin/verify.js` (`--stamp-status`, `--changed-files`).

**Spec:** `.claude-tweaks/pipelines/2026-09-05T193518-spec-1921-1922-1923-1924-1925-1926-1930-1932-1931-1792-1927-1928-1929/spec-1931/work/1931-spec.md` (record #1931)

## Global Constraints

- `plugin/skills/flow/SKILL.md` (40,271 B now) and `plugin/skills/flow/steps-and-gates.md` (27,151 B) stay ≤ 40,960; SKILL.md's Step 3 change is net-zero-or-negative bytes.
- `steps-and-gates.md` contains `flow-preflight.js" --run` exactly once and `check-resume-freshness --run` zero times; it MUST still contain the bare verb name `check-resume-freshness` (a pre-existing pin, `tests/flow-resume-freshness-citations.test.js`, requires every resume path to cite the verb — the pack runs that check in-process, and the prose says so by name).
- The five adoption note literals are relocated verbatim (placeholders included), never reworded; `steps-and-gates.md`'s case 5 creation paragraph is untouched (`tests/flow-run-dir-anchoring.test.js` pins it).
- The CLI never writes outside the anchored run dir; `gatherPreflight` computes every field regardless of `--steps` (metadata only); `pr.ok === true, value: null` when `run-state.json` has no `pr`; `ok: false` only when a probe itself failed.
- Never spread a parsed `run-state.json`/`config.yml` object after computing derived fields.
- Commit subjects end `(refs #1931)`.

### Design decisions locked here (deviations from the record's literal text, staged at Common Step 4.5)

1. **Lever sources use the resolver's real vocabulary** — `run-config` | `policy` | `default` (`policy-schema.js:370`), not the record's guessed `config.yml`/`cli-override`/`project-policy`. `ceremony-profile` is not a policy-schema key (`resolve-policy.js` answers `unknown-key`); the pack reads it from `config.yml` with `source: 'header'` (its documented Manifesto source). `mode` is read from `config.yml` into a top-level `mode` field — it is lever 1 in the FYI table but not in the record's twelve-key list.
2. **Freshness/inventory keep their CLI line text.** `freshness.line` and `inventory.line` are exactly the lines `hooks.js check-resume-freshness`/`check-staged-inventory` print today (`hooks.js:970-972`, `:994-995`), so the prose's "report that line verbatim" stays byte-identical; `verdict` is `OK`/`BLOCKED` (mapped from `safe`), `detail` carries the module's own verdict word.
3. **Stamp and changed-files spawn `verify.js`** (bounded: 32 MiB `maxBuffer`, 30 s) rather than re-implementing `stampStatus()` — it is an unexported function inside `verify.js`. `--changed-files` needs a base: the pack passes `--integration-branch {policy integration-branch, default main}` and, when the run's stamp anchors a base, still lets `verify.js` prefer the stamp (its own rule).
4. **Case 5 has no note.** The record says "case 1..5 plus the note"; the prose defines a note literal for cases 1-4 only (case 5 is the creation path whose paragraph the anchoring test pins). The module returns `case: 5, note: null` when `runDir` is unset; the CLI is not called on that path.
5. **"Committed on the branch" is checked from `$RUN_ROOT`'s git**: `git -C {mainRoot} ls-tree --name-only {branch} -- {runDir relative to mainRoot}/work/` where `{branch}` is `run-state.json`'s `pr.branch`, else the worktree's current branch (`git -C {state.worktree} rev-parse --abbrev-ref HEAD`), else unknown → `specMaterialized: null` (counts as "no other content" only when decisions/events are also empty — otherwise case 3, never case 2).
6. **Case 3's backfill list is computed**: the placeholder `{worktree registration | PR-early lifecycle | materialize commit}` renders the applicable items joined by `, ` (worktree missing from `run-state.json`; `pr` missing under `integration-model: pr-first`; spec not materialized); case 4's `{does not exist | is not anchored to the main checkout}` renders from `resolveTarget`'s reason.
7. **The PR checklist is parsed from the body's `<!-- phases-start -->`/`<!-- phases-end -->` span** as `{phase, done}` rows (`- [ ] build` / `- [x] build`), the shape `_shared/pr-early-run-lifecycle.md` writes.

---

## File Structure

| File | Responsibility |
|---|---|
| `plugin/bin/lib/flow/preflight.js` (create) | `ADOPTION_NOTES`, `computeAdoption`, `parseChecklist`, `gatherPreflight` — pure through `deps` |
| `plugin/bin/flow-preflight.js` (create) | CLI: args, anchoring, the one write, exit 0/2/3 |
| `plugin/skills/flow/steps-and-gates.md` (modify, ~56-90) | adoption section reads the pack |
| `plugin/skills/flow/manifesto.md` (modify, "Present the Manifesto", "Source values") | FYI table from `preflight.levers`; pack as a source |
| `plugin/skills/flow/SKILL.md:149-159` (modify) | one clause naming the pack (net-zero) |
| `tests/bin-lib/flow/preflight.test.js`, `tests/bin-lib/flow/preflight-cli.test.js` (create) | AC1-AC4 |
| `tests/flow-preflight-conformance.test.js` (create) | AC5/AC6 prose pins + literal equality |
| `docs/plugin-structure.md`, `docs/skill-graph.md` (modify) | rows |

---

### Task 1: `plugin/bin/lib/flow/preflight.js` — adoption predicates, note literals, the pack

**Files:**
- Create: `plugin/bin/lib/flow/preflight.js`
- Test: `tests/bin-lib/flow/preflight.test.js`

**Interfaces:**
- Produces: `ADOPTION_NOTES` (`{1, 2, 3, 4}` → template strings with `{path}` and, for 3/4, the choice placeholders, verbatim from the prose); `computeAdoption({runDir, mainRoot, cwd, deps}) → {case, note, path, anchored, hasConfig, hasOtherContent, specMaterialized, backfills}`; `parseChecklist(body) → [{phase, done}]`; `gatherPreflight({runDir, steps, cwd, mainRoot, deps}) → {generatedAt, steps, durationMs, mode, adoption, freshness, inventory, levers, spec, pr, stamp, changedFiles}` — every probe field `{ok, value | error, durationMs}`.
- `deps` = `{readFile(p), readdir(p), git(args, {cwd}) → stdout, execFile(cmd, args, opts) → stdout (sync), checkResumeFreshness(runDir, opts), checkStagedInventory(runDir), readRunState(runDir), resolvePolicy(keys, runDir) → {key: {value, source}}, resolveTarget({runDir, cwd, mainRoot}), now() → ms, sessionId?: string}`. `LEVER_KEYS` = the record's twelve: `scope-creep, overlap, design-intent, leftover-default, auto-fix-threshold, review-auto-apply-ceiling, tidy-aggressiveness, ceremony-profile, model-stance, merge-verification, design-critique, merge-authorization`.

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/flow/preflight.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MOD = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'lib', 'flow', 'preflight');
const { ADOPTION_NOTES, computeAdoption, parseChecklist, gatherPreflight, LEVER_KEYS } = require(MOD);

// A fake main checkout with one run dir under .claude-tweaks/pipelines/.
function mainRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-preflight-'));
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-09-06T000000-record-7');
  fs.mkdirSync(runDir, { recursive: true });
  return { root, runDir };
}

const STAMP = JSON.stringify({ present: true, sha: 'abc', head: 'abc', dirty: false, scope: 'full', fullSha: 'abc', match: true, verifiedHead: true });
const CHANGED = JSON.stringify({ base: 'abc', files: ['src/a.js'] });
const PR_BODY = 'intro\n<!-- phases-start -->\n- [x] build\n- [x] test\n- [ ] review\n- [ ] polish\n- [ ] wrap-up\n<!-- phases-end -->\ntail';

function deps(fx, overrides = {}) {
  return {
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    readdir: (p) => { try { return fs.readdirSync(p); } catch { return []; } },
    git: (args) => (args[0] === 'ls-tree' ? `x/work/7-spec.md\n` : 'feat-branch\n'),
    execFile: (cmd, args) => {
      if (cmd === 'gh') return JSON.stringify({ state: 'OPEN', isDraft: true, body: PR_BODY });
      if (args.includes('--stamp-status')) return STAMP;
      if (args.includes('--changed-files')) return CHANGED;
      throw new Error(`unexpected exec ${cmd} ${args.join(' ')}`);
    },
    checkResumeFreshness: () => ({ safe: true, verdict: 'not-interrupted' }),
    checkStagedInventory: () => ({ checked: 2, missing: [] }),
    readRunState: (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'run-state.json'), 'utf8')); } catch { return null; } },
    resolvePolicy: (keys) => Object.fromEntries(keys.map((k) => [k, k === 'integration-branch' ? { value: 'main', source: 'default' } : { value: `v-${k}`, source: 'policy' }])),
    resolveTarget: ({ runDir }) => (fs.existsSync(runDir) ? { ok: true, dir: fs.realpathSync(runDir) } : { ok: false, reason: 'missing' }),
    now: () => Date.parse('2026-09-06T12:00:00Z'),
    ...overrides,
  };
}

function seedCase1(fx) {
  fs.writeFileSync(path.join(fx.runDir, 'config.yml'), 'mode: auto\nceremony-profile: standard\nscope-creep: add-to-plan\n');
  fs.writeFileSync(path.join(fx.runDir, 'run-state.json'), JSON.stringify({ worktree: '/w/tree', status: 'active', pr: { number: 1901, branch: 'feat-branch' } }));
  fs.mkdirSync(path.join(fx.runDir, 'work'));
  fs.writeFileSync(path.join(fx.runDir, 'work', '7-spec.md'), '---\nrecord: 7\n---\n');
}

test('case 1: anchored dir with config.yml → adopt, the case-1 literal, OK freshness/inventory, twelve levers with sources, stamp match, changed files (#1931 AC1)', async () => {
  const fx = mainRoot();
  seedCase1(fx);
  const pack = await gatherPreflight({ runDir: fx.runDir, steps: ['review', 'polish', 'wrap-up'], cwd: fx.root, mainRoot: fx.root, deps: deps(fx) });
  assert.deepStrictEqual(pack.steps, ['review', 'polish', 'wrap-up']);
  assert.strictEqual(pack.mode, 'auto');
  assert.strictEqual(pack.adoption.ok, true);
  assert.strictEqual(pack.adoption.value.case, 1);
  assert.strictEqual(pack.adoption.value.note, ADOPTION_NOTES[1].replace('{path}', fs.realpathSync(fx.runDir)));
  assert.strictEqual(pack.freshness.value.verdict, 'OK');
  assert.match(pack.freshness.value.line, /resume freshness OK for 2026-09-06T000000-record-7 \(not-interrupted\)/);
  assert.strictEqual(pack.inventory.value.status, 'OK');
  assert.strictEqual(pack.levers.value.length, 12);
  for (const l of pack.levers.value) { assert.ok(LEVER_KEYS.includes(l.key)); assert.ok('value' in l && typeof l.source === 'string', l.key); }
  const ceremony = pack.levers.value.find((l) => l.key === 'ceremony-profile');
  assert.deepStrictEqual(ceremony, { key: 'ceremony-profile', value: 'standard', source: 'header' });
  assert.deepStrictEqual(pack.spec.value, { path: 'work/7-spec.md', present: true, record: 7 });
  assert.strictEqual(pack.pr.value.number, 1901);
  assert.deepStrictEqual(pack.pr.value.checklist, [{ phase: 'build', done: true }, { phase: 'test', done: true }, { phase: 'review', done: false }, { phase: 'polish', done: false }, { phase: 'wrap-up', done: false }]);
  assert.strictEqual(pack.stamp.value.match, true);
  assert.ok(Array.isArray(pack.changedFiles.value.files));
});

test('case 3: decisions.md content but no config.yml → the #1013-recovery literal with the computed backfills; case 2: empty dir → the minted literal (#1931 AC2)', () => {
  const fx = mainRoot();
  fs.writeFileSync(path.join(fx.runDir, 'decisions.md'), '## /build\n- AUTO 10:00:00 — x. Reversibility: high.\n');
  const d = deps(fx, { git: (args) => (args[0] === 'ls-tree' ? '' : 'feat-branch\n') });
  const a3 = computeAdoption({ runDir: fx.runDir, mainRoot: fx.root, cwd: fx.root, deps: d });
  assert.strictEqual(a3.case, 3);
  assert.strictEqual(a3.note, ADOPTION_NOTES[3].replace('{path}', fs.realpathSync(fx.runDir)).replace('{worktree registration | PR-early lifecycle | materialize commit}', 'worktree registration, PR-early lifecycle, materialize commit'));
  assert.deepStrictEqual(a3.backfills, ['worktree registration', 'PR-early lifecycle', 'materialize commit']);
  const fx2 = mainRoot();
  const a2 = computeAdoption({ runDir: fx2.runDir, mainRoot: fx2.root, cwd: fx2.root, deps: d });
  assert.strictEqual(a2.case, 2);
  assert.strictEqual(a2.note, ADOPTION_NOTES[2].replace('{path}', fs.realpathSync(fx2.runDir)));
});

test('case 4: a missing dir and an unanchored dir each render the case-4 literal with the matching reason; case 5: unset → no note (#1931 AC2)', () => {
  const fx = mainRoot();
  const missing = path.join(fx.root, '.claude-tweaks', 'pipelines', 'nope');
  const a = computeAdoption({ runDir: missing, mainRoot: fx.root, cwd: fx.root, deps: deps(fx) });
  assert.strictEqual(a.case, 4);
  assert.strictEqual(a.note, ADOPTION_NOTES[4].replace('{path}', missing).replace('{does not exist | is not anchored to the main checkout}', 'does not exist'));
  const shadow = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-preflight-shadow-'));
  const b = computeAdoption({ runDir: shadow, mainRoot: fx.root, cwd: fx.root, deps: deps(fx, { resolveTarget: () => ({ ok: false, reason: 'not-anchored' }) }) });
  assert.strictEqual(b.case, 4);
  assert.match(b.note, /is not anchored to the main checkout/);
  const c = computeAdoption({ runDir: null, mainRoot: fx.root, cwd: fx.root, deps: deps(fx) });
  assert.deepStrictEqual({ case: c.case, note: c.note }, { case: 5, note: null });
});

test('a BLOCKED freshness verdict propagates as data with the CLI line, and does not fail the pack (#1931 AC3)', async () => {
  const fx = mainRoot();
  seedCase1(fx);
  const d = deps(fx, { checkResumeFreshness: () => ({ safe: false, verdict: 'BLOCKED', reason: 'worktree lock pid 4242 is live' }) });
  const pack = await gatherPreflight({ runDir: fx.runDir, steps: ['review'], cwd: fx.root, mainRoot: fx.root, deps: d });
  assert.strictEqual(pack.freshness.ok, true);
  assert.strictEqual(pack.freshness.value.verdict, 'BLOCKED');
  assert.strictEqual(pack.freshness.value.line, 'claude-tweaks: resume freshness BLOCKED for 2026-09-06T000000-record-7 — run appears actively owned (worktree lock pid 4242 is live)');
  assert.strictEqual(pack.adoption.value.case, 1, 'adoption is computed independently; the skill decides to stop');
});

test('a staged-inventory MISMATCH renders the CLI line verbatim (#1931)', async () => {
  const fx = mainRoot();
  seedCase1(fx);
  const d = deps(fx, { checkStagedInventory: () => ({ checked: 3, missing: ['staged/review-2.patch'] }) });
  const pack = await gatherPreflight({ runDir: fx.runDir, steps: ['review'], cwd: fx.root, mainRoot: fx.root, deps: d });
  assert.strictEqual(pack.inventory.value.status, 'MISMATCH');
  assert.strictEqual(pack.inventory.value.line, 'claude-tweaks: staged inventory MISMATCH for 2026-09-06T000000-record-7 — 1 of 3 STAGED entries missing from staged/: staged/review-2.patch');
});

test('gh absent → pr.ok false with the error, every other field intact; no pr in run-state.json → pr.ok true with value null (#1931 AC4)', async () => {
  const fx = mainRoot();
  seedCase1(fx);
  const d = deps(fx, { execFile: (cmd, args) => { if (cmd === 'gh') { const e = new Error('spawn gh ENOENT'); e.code = 'ENOENT'; throw e; } if (args.includes('--stamp-status')) return STAMP; return CHANGED; } });
  const pack = await gatherPreflight({ runDir: fx.runDir, steps: ['review'], cwd: fx.root, mainRoot: fx.root, deps: d });
  assert.strictEqual(pack.pr.ok, false);
  assert.match(pack.pr.error, /gh-absent/);
  for (const k of ['adoption', 'freshness', 'inventory', 'levers', 'spec', 'stamp', 'changedFiles']) assert.strictEqual(pack[k].ok, true, k);
  fs.writeFileSync(path.join(fx.runDir, 'run-state.json'), JSON.stringify({ worktree: '/w/tree', status: 'active' }));
  const pack2 = await gatherPreflight({ runDir: fx.runDir, steps: ['review'], cwd: fx.root, mainRoot: fx.root, deps: deps(fx) });
  assert.deepStrictEqual(pack2.pr, { ...pack2.pr, ok: true, value: null });
});

test('a single lever failing to resolve degrades that entry only (#1931 Gotcha)', async () => {
  const fx = mainRoot();
  seedCase1(fx);
  const d = deps(fx, { resolvePolicy: (keys) => Object.fromEntries(keys.map((k) => [k, k === 'model-stance' ? { error: 'unknown-key' } : { value: 'x', source: 'default' }])) });
  const pack = await gatherPreflight({ runDir: fx.runDir, steps: ['review'], cwd: fx.root, mainRoot: fx.root, deps: d });
  assert.strictEqual(pack.levers.ok, true);
  const bad = pack.levers.value.find((l) => l.key === 'model-stance');
  assert.deepStrictEqual(bad, { key: 'model-stance', value: null, source: null, error: 'unknown-key' });
});

test('one probe throwing degrades only its field, and the probes run concurrently (#1931)', async () => {
  const fx = mainRoot();
  seedCase1(fx);
  const slow = (v) => new Promise((r) => setTimeout(() => r(v), 150));
  const d = deps(fx, {
    checkResumeFreshness: () => { throw new Error('probe exploded'); },
    execFile: (cmd, args) => { if (cmd === 'gh') return JSON.stringify({ state: 'OPEN', isDraft: true, body: PR_BODY }); return args.includes('--stamp-status') ? STAMP : CHANGED; },
  });
  const t0 = Date.now();
  const pack = await gatherPreflight({ runDir: fx.runDir, steps: ['review'], cwd: fx.root, mainRoot: fx.root, deps: { ...d, execFileAsync: async (cmd, args) => slow(d.execFile(cmd, args)) } });
  assert.strictEqual(pack.freshness.ok, false);
  assert.match(pack.freshness.error, /probe exploded/);
  assert.strictEqual(pack.pr.ok, true);
  assert.ok(Date.now() - t0 < 450, 'three 150 ms subprocess probes overlap');
});

test('parseChecklist reads the phases span and ignores rows outside it (#1931 decision 7)', () => {
  assert.deepStrictEqual(parseChecklist('- [ ] stray\n<!-- phases-start -->\n- [x] build\n- [ ] test\n<!-- phases-end -->\n- [x] other'), [{ phase: 'build', done: true }, { phase: 'test', done: false }]);
  assert.deepStrictEqual(parseChecklist('no markers'), []);
});

test('ADOPTION_NOTES carry the four prose literals with their placeholders (#1931 AC5)', () => {
  assert.strictEqual(ADOPTION_NOTES[1], 'Resuming existing run directory: {path}');
  assert.strictEqual(ADOPTION_NOTES[2], 'Adopting minted run directory: {path}');
  assert.strictEqual(ADOPTION_NOTES[3], 'Recovering inherited run directory: {path} (missing config.yml; backfilled {worktree registration | PR-early lifecycle | materialize commit} before proceeding).');
  assert.strictEqual(ADOPTION_NOTES[4], 'PIPELINE_RUN_DIR was set to {path}, which {does not exist | is not anchored to the main checkout} — created a fresh run directory instead.');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node -e 'try { require("./plugin/bin/lib/flow/preflight"); process.exit(0); } catch { process.exit(1); }'`
Expected: FAIL (exit 1 — module does not exist).

- [ ] **Step 3: Write the module**

Create `plugin/bin/lib/flow/preflight.js`:

```js
// plugin/bin/lib/flow/preflight.js — one fact pack for /flow's second-call
// preflight (#1931): run-dir adoption (the five cases steps-and-gates.md
// states, their note literals living HERE as the single source), the
// resume-freshness probe, the staged-inventory check, the Manifesto levers,
// the materialized spec, the PR record + phase checklist, the runner stamp,
// and the changed-file set — gathered concurrently into per-field
// {ok, value | error} envelopes. Read-only. Every fs/git/subprocess call
// goes through `deps` so tests inject fakes. Same shape as
// bin/lib/wrap-up/pack.js (#1930).
'use strict';

const fs = require('fs');
const path = require('path');
const { execFile: execFileCb, execFileSync } = require('child_process');
const { promisify } = require('util');
const { checkResumeFreshness } = require('../hooks/resume-freshness');
const { checkStagedInventory } = require('../hooks/staged-inventory');
const { readRunState } = require('../hooks/context');
const { resolvePolicyConfig } = require('../policy-schema');
const { resolveTarget } = require('../stage-item/write');

const BIN = path.join(__dirname, '..', '..');
const EXEC_OPTS = { maxBuffer: 32 * 1024 * 1024, timeout: 30000 };

// The Manifesto's lever list (flow/SKILL.md Step 3), minus `mode` (lever 1,
// read separately from config.yml). ceremony-profile is NOT a policy-schema
// key — it is written into config.yml by the Manifesto's header fold
// (source `header`), so it is read from config.yml, not resolved.
const LEVER_KEYS = ['scope-creep', 'overlap', 'design-intent', 'leftover-default', 'auto-fix-threshold', 'review-auto-apply-ceiling', 'tidy-aggressiveness', 'ceremony-profile', 'model-stance', 'merge-verification', 'design-critique', 'merge-authorization'];
const CONFIG_ONLY_LEVERS = new Set(['ceremony-profile']);

// The adoption note lines, verbatim from steps-and-gates.md's five cases —
// this module is their single source; the prose renders them and
// tests/flow-preflight-conformance.test.js pins the two equal. Case 5
// (PIPELINE_RUN_DIR unset) is the creation path and has no note.
const ADOPTION_NOTES = Object.freeze({
  1: 'Resuming existing run directory: {path}',
  2: 'Adopting minted run directory: {path}',
  3: 'Recovering inherited run directory: {path} (missing config.yml; backfilled {worktree registration | PR-early lifecycle | materialize commit} before proceeding).',
  4: 'PIPELINE_RUN_DIR was set to {path}, which {does not exist | is not anchored to the main checkout} — created a fresh run directory instead.',
});
const CASE3_PLACEHOLDER = '{worktree registration | PR-early lifecycle | materialize commit}';
const CASE4_PLACEHOLDER = '{does not exist | is not anchored to the main checkout}';

function defaultDeps(cwd) {
  const execFileAsync = promisify(execFileCb);
  return {
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    readdir: (p) => { try { return fs.readdirSync(p); } catch { return []; } },
    git: (args, opts = {}) => execFileSync('git', args, { cwd: opts.cwd || cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    execFile: (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...EXEC_OPTS, ...opts }),
    execFileAsync: async (cmd, args, opts = {}) => (await execFileAsync(cmd, args, { cwd, encoding: 'utf8', ...EXEC_OPTS, ...opts })).stdout,
    checkResumeFreshness,
    checkStagedInventory,
    readRunState,
    resolvePolicy: (keys, runDir) => {
      const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const readFile = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
      return resolvePolicyConfig({ git, readFile, runDir, keys }).result;
    },
    resolveTarget,
    now: () => Date.now(),
    sessionId: process.env.CLAUDE_CODE_SESSION_ID || null,
  };
}

function readText(deps, file) {
  try { return deps.readFile(file); } catch { return null; }
}

function configValue(text, key) {
  const m = new RegExp(`^${key}:\\s*(\\S+)\\s*$`, 'm').exec(text || '');
  return m ? m[1] : null;
}

function nonEmpty(deps, file) {
  const t = readText(deps, file);
  return t !== null && t.trim().length > 0;
}

// "work/{n}-spec.md committed on the run's branch", checked from the main
// checkout's git ($RUN_ROOT), never the cwd worktree: the branch is the
// PR's recorded branch, else the worktree's current branch. null = unknown.
function specOnBranch(deps, { mainRoot, runDirReal, state }) {
  let branch = state && state.pr && state.pr.branch ? state.pr.branch : null;
  if (!branch && state && typeof state.worktree === 'string') {
    try { branch = deps.git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: state.worktree }).trim() || null; } catch { branch = null; }
  }
  if (!branch) return null;
  const rel = path.relative(mainRoot, runDirReal).split(path.sep).join('/');
  try {
    const out = deps.git(['ls-tree', '--name-only', branch, '--', `${rel}/work/`], { cwd: mainRoot });
    return out.split('\n').some((l) => /\/work\/\d+-spec\.md$/.test(l));
  } catch { return null; }
}

function computeAdoption({ runDir, mainRoot, cwd, deps }) {
  if (!runDir) return { case: 5, note: null, path: null, anchored: false, hasConfig: false, hasOtherContent: false, specMaterialized: null, backfills: [] };
  const target = deps.resolveTarget({ runDir, cwd, mainRoot });
  if (!target.ok) {
    const why = target.reason === 'missing' ? 'does not exist' : 'is not anchored to the main checkout';
    return { case: 4, note: ADOPTION_NOTES[4].replace('{path}', runDir).replace(CASE4_PLACEHOLDER, why), path: runDir, anchored: target.reason !== 'missing' && false, hasConfig: false, hasOtherContent: false, specMaterialized: null, backfills: [] };
  }
  const real = target.dir;
  const hasConfig = readText(deps, path.join(real, 'config.yml')) !== null;
  const state = deps.readRunState(real);
  const specMaterialized = specOnBranch(deps, { mainRoot, runDirReal: real, state });
  const hasOtherContent = nonEmpty(deps, path.join(real, 'decisions.md')) || nonEmpty(deps, path.join(real, 'events.jsonl')) || specMaterialized === true;
  if (hasConfig) return { case: 1, note: ADOPTION_NOTES[1].replace('{path}', real), path: real, anchored: true, hasConfig, hasOtherContent, specMaterialized, backfills: [] };
  if (!hasOtherContent) return { case: 2, note: ADOPTION_NOTES[2].replace('{path}', real), path: real, anchored: true, hasConfig, hasOtherContent, specMaterialized, backfills: [] };
  const backfills = [];
  if (!state || typeof state.worktree !== 'string') backfills.push('worktree registration');
  if (!state || !state.pr) backfills.push('PR-early lifecycle');
  if (specMaterialized !== true) backfills.push('materialize commit');
  return { case: 3, note: ADOPTION_NOTES[3].replace('{path}', real).replace(CASE3_PLACEHOLDER, backfills.join(', ')), path: real, anchored: true, hasConfig, hasOtherContent, specMaterialized, backfills };
}

function parseChecklist(body) {
  const start = (body || '').indexOf('<!-- phases-start -->');
  const end = (body || '').indexOf('<!-- phases-end -->');
  if (start === -1 || end === -1 || end < start) return [];
  const rows = [];
  for (const line of body.slice(start, end).split('\n')) {
    const m = /^- \[( |x)\] ([a-z-]+)\s*$/.exec(line.trim());
    if (m) rows.push({ phase: m[2], done: m[1] === 'x' });
  }
  return rows;
}

async function wrapProbe(name, fn, now) {
  const t0 = now();
  try {
    const value = await fn();
    return { ok: true, value, durationMs: now() - t0 };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err), durationMs: now() - t0 };
  }
}

// Which subprocess seam to use: an injected async seam wins; an injected
// SYNC `execFile` fake (the unit tests' usual shape) must not be shadowed by
// the default async seam, so it is wrapped; only with neither injected does
// the real async seam run (concurrent by construction).
function pickExec(overrides, deps) {
  if (overrides.execFileAsync) return overrides.execFileAsync;
  if (overrides.execFile) return async (cmd, args, opts) => overrides.execFile(cmd, args, opts);
  return deps.execFileAsync;
}

function buildProbes({ runDirReal, runId, mainRoot, cwd, config, state, deps, exec }) {
  return {
    freshness: () => {
      const r = deps.checkResumeFreshness(runDirReal, { sessionId: deps.sessionId || null });
      const line = r.safe
        ? `claude-tweaks: resume freshness OK for ${runId} (${r.verdict})`
        : `claude-tweaks: resume freshness BLOCKED for ${runId} — run appears actively owned (${r.reason})`;
      return { verdict: r.safe ? 'OK' : 'BLOCKED', detail: r.verdict, reason: r.reason || null, line };
    },
    inventory: () => {
      const r = deps.checkStagedInventory(runDirReal);
      const status = r.missing.length === 0 ? 'OK' : 'MISMATCH';
      const line = status === 'OK'
        ? `claude-tweaks: staged inventory OK for ${runId} (${r.checked} STAGED entries)`
        : `claude-tweaks: staged inventory MISMATCH for ${runId} — ${r.missing.length} of ${r.checked} STAGED entries missing from staged/: ${r.missing.join(', ')}`;
      return { status, checked: r.checked, missing: r.missing, line };
    },
    levers: () => {
      const policyKeys = LEVER_KEYS.filter((k) => !CONFIG_ONLY_LEVERS.has(k));
      const resolved = deps.resolvePolicy(policyKeys, runDirReal) || {};
      return LEVER_KEYS.map((key) => {
        if (CONFIG_ONLY_LEVERS.has(key)) {
          const value = configValue(config, key);
          return value === null ? { key, value: null, source: null, error: 'absent from config.yml' } : { key, value, source: 'header' };
        }
        const entry = resolved[key];
        if (!entry || entry.error !== undefined) return { key, value: null, source: null, error: entry && entry.error ? String(entry.error) : 'unresolved' };
        return { key, value: entry.value === undefined ? null : entry.value, source: entry.source || 'default' };
      });
    },
    spec: () => {
      const names = deps.readdir(path.join(runDirReal, 'work')).filter((n) => /^\d+-spec\.md$/.test(n)).sort();
      if (!names.length) return { path: null, present: false, record: null };
      return { path: `work/${names[0]}`, present: true, record: Number(names[0].split('-')[0]) };
    },
    pr: async () => {
      if (!state || !state.pr || !state.pr.number) return null;
      let raw;
      try { raw = await exec('gh', ['pr', 'view', String(state.pr.number), '--json', 'state,isDraft,body'], { cwd: mainRoot }); } catch (err) {
        if (err && err.code === 'ENOENT') throw new Error('gh-absent');
        throw err;
      }
      const view = JSON.parse(raw);
      return { number: state.pr.number, url: state.pr.url || null, branch: state.pr.branch || null, state: view.state, isDraft: view.isDraft, checklist: parseChecklist(view.body) };
    },
    stamp: async () => JSON.parse(await exec('node', [path.join(BIN, 'verify.js'), '--stamp-status'], { cwd: state && typeof state.worktree === 'string' ? state.worktree : cwd })),
    changedFiles: async () => {
      const ib = (deps.resolvePolicy(['integration-branch'], runDirReal) || {})['integration-branch'];
      const branch = ib && ib.value ? String(ib.value) : 'main';
      return JSON.parse(await exec('node', [path.join(BIN, 'verify.js'), '--changed-files', '--integration-branch', branch], { cwd: state && typeof state.worktree === 'string' ? state.worktree : cwd }));
    },
  };
}

async function gatherPreflight({ runDir, steps = [], cwd = process.cwd(), mainRoot = null, deps: overrides = {} }) {
  const deps = { ...defaultDeps(cwd), ...overrides };
  const t0 = deps.now();
  const adoption = computeAdoption({ runDir, mainRoot, cwd, deps });
  const runDirReal = adoption.path && adoption.anchored ? adoption.path : null;
  const runId = runDirReal ? path.basename(runDirReal) : null;
  const config = runDirReal ? readText(deps, path.join(runDirReal, 'config.yml')) : null;
  const state = runDirReal ? deps.readRunState(runDirReal) : null;
  const pack = { generatedAt: new Date(deps.now()).toISOString(), steps: [...steps], mode: configValue(config, 'mode'), adoption: { ok: true, value: adoption, durationMs: deps.now() - t0 } };
  if (!runDirReal) {
    // Cases 4/5: nothing to probe — every probe field reports why.
    for (const k of ['freshness', 'inventory', 'levers', 'spec', 'pr', 'stamp', 'changedFiles']) pack[k] = { ok: false, error: 'run dir not adopted (adoption case ' + adoption.case + ')', durationMs: 0 };
    pack.durationMs = deps.now() - t0;
    return pack;
  }
  const probes = buildProbes({ runDirReal, runId, mainRoot, cwd, config, state, deps, exec: pickExec(overrides, deps) });
  const names = Object.keys(probes);
  const results = await Promise.all(names.map((n) => wrapProbe(n, probes[n], deps.now)));
  names.forEach((n, i) => { pack[n] = results[i]; });
  pack.durationMs = deps.now() - t0;
  return pack;
}

module.exports = { ADOPTION_NOTES, LEVER_KEYS, computeAdoption, parseChecklist, gatherPreflight };
```

Note for the implementer: `computeAdoption`'s case-4 `anchored` field is `false` in both sub-cases (the `target.reason !== 'missing' && false` expression is a leftover — write it as `anchored: false`). The subprocess seam is chosen by `pickExec(overrides, deps)`: the unit tests inject a sync `execFile` fake, the concurrency test injects `execFileAsync`, the CLI's real path injects neither.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/bin-lib/flow/preflight.test.js`
Expected: all pass. If the concurrency test's 450 ms bound is flaky under load, raise it to 600 — never serialize the probes to make it pass.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/flow/preflight.js tests/bin-lib/flow/preflight.test.js
git commit -m "Add the flow preflight pack: adoption predicates with their note literals, freshness, inventory, levers, spec, PR, stamp, changed files (refs #1931)"
```

---

### Task 2: `plugin/bin/flow-preflight.js` — the CLI

**Files:**
- Create: `plugin/bin/flow-preflight.js`
- Test: `tests/bin-lib/flow/preflight-cli.test.js`

**Interfaces:**
- Consumes: Task 1's `gatherPreflight`; `resolveTarget` (`bin/lib/stage-item/write.js`); `writeFileAtomic` (`bin/lib/atomic-write.js`); `mainCheckoutRoot`/`safeReal` (`bin/lib/hooks/worktree-detect.js`) for the `--json` anchoring the same way `wrap-up-pack.js` does.
- Produces: `run(argv, deps) → Promise<exit>`; `deps = {cwd, mainRoot, stdout, stderr, packDeps}`; exit 0 when produced (adoption `BLOCKED` is data), 2 malformed (`--run` missing, `--steps` missing or empty, unknown flag), 3 `--run` not anchored / `--json` parent not anchored. Writes `{run-dir}/preflight.json` (or `--json <path>`), prints the pack to stdout.

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/flow/preflight-cli.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CLI = path.join(__dirname, '..', '..', '..', 'plugin', 'bin', 'flow-preflight.js');
const { run } = require(CLI);

function mainCheckoutWithRun() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-preflight-cli-')));
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git('init', '-q'); git('config', 'user.email', 't@example.invalid'); git('config', 'user.name', 't'); git('commit', '-q', '--allow-empty', '-m', 'init');
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-09-06T000000-record-7');
  fs.mkdirSync(path.join(runDir, 'work'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'config.yml'), 'mode: auto\nceremony-profile: standard\n');
  fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify({ worktree: root, status: 'active', pr: { number: 42, branch: 'main' } }));
  fs.writeFileSync(path.join(runDir, 'work', '7-spec.md'), '---\nrecord: 7\n---\n');
  return { root, runDir };
}

const packDeps = {
  execFileAsync: async (cmd, args) => {
    if (cmd === 'gh') { const e = new Error('spawn gh ENOENT'); e.code = 'ENOENT'; throw e; }
    if (args.includes('--stamp-status')) return JSON.stringify({ present: false, match: false, verifiedHead: false });
    return JSON.stringify({ base: 'abc', files: [] });
  },
  resolvePolicy: (keys) => Object.fromEntries(keys.map((k) => [k, { value: k === 'integration-branch' ? 'main' : 'x', source: 'default' }])),
  checkResumeFreshness: () => ({ safe: true, verdict: 'not-interrupted' }),
  checkStagedInventory: () => ({ checked: 0, missing: [] }),
};

function baseDeps(fx) {
  let out = ''; let err = '';
  return { d: { cwd: () => fx.root, mainRoot: fx.root, stdout: (s) => { out += s; }, stderr: (s) => { err += s; }, packDeps }, out: () => out, err: () => err };
}

test('run: an anchored run dir → exit 0, preflight.json written with every field, pr.ok false under a missing gh (#1931 AC4)', async () => {
  const fx = mainCheckoutWithRun();
  const { d, out } = baseDeps(fx);
  const code = await run(['--run', fx.runDir, '--steps', 'review,polish,wrap-up'], d);
  assert.strictEqual(code, 0);
  const file = JSON.parse(fs.readFileSync(path.join(fx.runDir, 'preflight.json'), 'utf8'));
  assert.deepStrictEqual(file.steps, ['review', 'polish', 'wrap-up']);
  for (const k of ['adoption', 'freshness', 'inventory', 'levers', 'spec', 'pr', 'stamp', 'changedFiles']) assert.ok(k in file, k);
  assert.strictEqual(file.pr.ok, false);
  assert.strictEqual(file.adoption.value.case, 1);
  assert.strictEqual(JSON.parse(out()).adoption.value.case, 1, 'the pack is printed to stdout');
});

test('run: a BLOCKED freshness verdict is data — still exit 0 (#1931 AC3)', async () => {
  const fx = mainCheckoutWithRun();
  const { d } = baseDeps(fx);
  d.packDeps = { ...packDeps, checkResumeFreshness: () => ({ safe: false, verdict: 'BLOCKED', reason: 'lock pid live' }) };
  assert.strictEqual(await run(['--run', fx.runDir, '--steps', 'review'], d), 0);
  const file = JSON.parse(fs.readFileSync(path.join(fx.runDir, 'preflight.json'), 'utf8'));
  assert.strictEqual(file.freshness.value.verdict, 'BLOCKED');
});

test('run: a --run outside the main checkout exits 3 and writes nothing (#1931 AC4)', async () => {
  const fx = mainCheckoutWithRun();
  const shadow = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-preflight-shadow-'));
  fs.writeFileSync(path.join(shadow, 'config.yml'), 'mode: auto\n');
  const { d, err } = baseDeps(fx);
  assert.strictEqual(await run(['--run', shadow, '--steps', 'review'], d), 3);
  assert.match(err(), /not anchored|missing/);
  assert.ok(!fs.existsSync(path.join(shadow, 'preflight.json')));
});

test('run: malformed invocations exit 2 — missing --run, missing --steps, unknown flag (#1931)', async () => {
  const fx = mainCheckoutWithRun();
  const { d } = baseDeps(fx);
  assert.strictEqual(await run(['--steps', 'review'], d), 2);
  assert.strictEqual(await run(['--run', fx.runDir], d), 2);
  assert.strictEqual(await run(['--run', fx.runDir, '--steps', 'review', '--bogus'], d), 2);
});

test('run: --json redirects the write inside the anchored target; a symlinked escape is refused (#1931, [IL-150])', async () => {
  const fx = mainCheckoutWithRun();
  const { d } = baseDeps(fx);
  const dest = path.join(fx.root, 'preflight-copy.json');
  assert.strictEqual(await run(['--run', fx.runDir, '--steps', 'review', '--json', dest], d), 0);
  assert.ok(fs.existsSync(dest));
  assert.ok(!fs.existsSync(path.join(fx.runDir, 'preflight.json')));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-preflight-escape-'));
  fs.symlinkSync(outside, path.join(fx.runDir, 'escape'));
  assert.strictEqual(await run(['--run', fx.runDir, '--steps', 'review', '--json', path.join(fx.runDir, 'escape', 'p.json')], d), 3);
  assert.ok(!fs.existsSync(path.join(outside, 'p.json')));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node -e 'try { require("./plugin/bin/flow-preflight.js"); process.exit(0); } catch { process.exit(1); }'`
Expected: FAIL (exit 1).

- [ ] **Step 3: Write the CLI**

Create `plugin/bin/flow-preflight.js`:

```js
#!/usr/bin/env node
// plugin/bin/flow-preflight.js — one fact pack for /flow's second-call
// preflight (#1931): adoption case + note, resume freshness, staged
// inventory, Manifesto levers, materialized spec, PR + phase checklist,
// runner stamp, changed files — one process, one JSON. Read-only apart from
// the pack file. Exit 0 whenever the pack was produced (a BLOCKED freshness
// verdict is data the skill acts on, never an exit code), 2 on a malformed
// invocation, 3 when --run (or --json's parent) does not resolve under the
// main checkout ([IL-127]/[IL-150] — the decision is made on the real path).
'use strict';

const path = require('path');
const { gatherPreflight } = require('./lib/flow/preflight');
const { resolveTarget } = require('./lib/stage-item/write');
const { safeReal } = require('./lib/hooks/worktree-detect');
const { writeFileAtomic } = require('./lib/atomic-write');

const USAGE = 'usage: flow-preflight.js --run <dir> --steps <a,b,c> [--json <path>]';

class UsageError extends Error {}

function parseArgs(argv) {
  const out = { run: null, steps: null, json: null };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--run' || flag === '--steps' || flag === '--json') {
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${flag} requires a value`);
      out[flag.slice(2)] = value;
      i += 1;
      continue;
    }
    throw new UsageError(`unknown flag: ${flag}`);
  }
  if (!out.run) throw new UsageError('--run <dir> is required');
  const steps = (out.steps || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!steps.length) throw new UsageError('--steps <a,b,c> is required (metadata — every field is computed regardless)');
  out.steps = steps;
  return out;
}

async function run(argv, deps = {}) {
  const cwd = deps.cwd || (() => process.cwd());
  const stdout = deps.stdout || ((s) => process.stdout.write(s));
  const stderr = deps.stderr || ((s) => process.stderr.write(s));
  let o;
  try { o = parseArgs(argv); } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    stderr(`flow-preflight.js: ${err.message}\n${USAGE}\n`);
    return 2;
  }
  const target = resolveTarget({ runDir: o.run, cwd: cwd(), mainRoot: deps.mainRoot });
  if (!target.ok) {
    stderr(`flow-preflight.js: --run ${o.run} refused (${target.reason === 'missing' ? 'missing' : 'not anchored under the main checkout'}) — nothing written\n`);
    return 3;
  }
  let file = path.join(target.dir, 'preflight.json');
  if (o.json) {
    const requested = path.resolve(cwd(), o.json);
    const parent = safeReal(path.dirname(requested));
    if (!parent || !resolveTarget({ runDir: parent, cwd: cwd(), mainRoot: deps.mainRoot }).ok) {
      stderr(`flow-preflight.js: --json ${o.json} refused (its directory does not resolve under the main checkout) — nothing written\n`);
      return 3;
    }
    file = path.join(parent, path.basename(requested));
  }
  const mainRoot = deps.mainRoot || path.dirname(path.dirname(path.dirname(target.dir)));
  const pack = await gatherPreflight({ runDir: target.dir, steps: o.steps, cwd: cwd(), mainRoot, deps: deps.packDeps || {} });
  const text = `${JSON.stringify(pack, null, 2)}\n`;
  writeFileAtomic(file, text);
  stdout(text);
  return 0;
}

if (require.main === module) {
  run(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => { process.stderr.write(`flow-preflight.js: ${err && err.stack ? err.stack : err}\n`); process.exitCode = 1; });
}

module.exports = { run, parseArgs };
```

The `mainRoot` fallback (three `dirname`s up from `{root}/.claude-tweaks/pipelines/{run}`) is for the `require.main` path where no `deps.mainRoot` is injected; read `bin/lib/hooks/worktree-detect.js`'s `mainCheckoutRoot` and prefer it if it takes a cwd and returns the main checkout — say which you used in the report.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/bin-lib/flow/preflight-cli.test.js tests/bin-lib/flow/preflight.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/flow-preflight.js tests/bin-lib/flow/preflight-cli.test.js
git commit -m "Add flow-preflight.js — one anchored call writes {run-dir}/preflight.json (refs #1931)"
```

---

### Task 3: The prose reads the pack; the conformance pins

**Files:**
- Modify: `plugin/skills/flow/steps-and-gates.md` (the "Adopting an inherited run directory" section, ~56-86)
- Modify: `plugin/skills/flow/manifesto.md` ("Present the Manifesto" FYI paragraph, "Source values")
- Modify: `plugin/skills/flow/SKILL.md:149-159` (Step 3)
- Test: `tests/flow-preflight-conformance.test.js` (create)

**Interfaces:**
- Consumes: Task 1's `ADOPTION_NOTES` and field names; Task 2's CLI flags.

- [ ] **Step 1: Write the failing test**

Create `tests/flow-preflight-conformance.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const { ADOPTION_NOTES } = require(path.join(ROOT, 'plugin', 'bin', 'lib', 'flow', 'preflight'));

test('steps-and-gates.md calls flow-preflight.js --run exactly once in the adoption section, no longer invokes check-resume-freshness --run, still names the verb, and checks BLOCKED right after the call (#1931 AC5)', () => {
  const t = read('plugin/skills/flow/steps-and-gates.md');
  assert.strictEqual((t.match(/flow-preflight\.js" --run/g) || []).length, 1);
  assert.strictEqual((t.match(/check-resume-freshness --run/g) || []).length, 0);
  assert.ok(t.includes('check-resume-freshness'), 'the verb is still cited by name (resume-freshness-citations pin)');
  const call = t.indexOf('flow-preflight.js" --run');
  const section = t.indexOf('### Adopting an inherited run directory');
  const next = t.indexOf('### Partial step lists');
  assert.ok(section < call && call < next, 'the call lives in the adoption section');
  const after = t.slice(call, call + 1200);
  assert.match(after, /freshness\.value\.verdict === 'BLOCKED'/, 'a literal check-and-stop on the freshness verdict follows the call');
  assert.match(after, /stop/i);
  assert.match(t, /inventory\.value\.status === 'MISMATCH'/);
  assert.match(t, /adoption\.value\.note/);
  assert.ok(Buffer.byteLength(t, 'utf8') <= 40960);
});

test('the four adoption note literals in preflight.js equal the ones steps-and-gates.md renders (#1931 AC5)', () => {
  const t = read('plugin/skills/flow/steps-and-gates.md');
  for (const n of [1, 2, 3, 4]) {
    assert.ok(t.includes('`' + ADOPTION_NOTES[n] + '`'), `case ${n} literal rendered verbatim in the prose`);
  }
});

test('manifesto.md renders the auto FYI table from preflight.levers and lists the pack as a source (#1931)', () => {
  const t = read('plugin/skills/flow/manifesto.md');
  assert.match(t, /preflight\.levers/);
  assert.match(t, /preflight\.json/);
  assert.ok(Buffer.byteLength(t, 'utf8') <= 40960);
});

test('flow/SKILL.md names the pack in Step 3 and did not grow (#1931 AC6)', () => {
  const t = read('plugin/skills/flow/SKILL.md');
  assert.match(t, /flow-preflight\.js/);
  assert.ok(Buffer.byteLength(t, 'utf8') <= 40271);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/flow-preflight-conformance.test.js`
Expected: FAIL (no call, literals not yet cited as constants, no `preflight.levers`).

- [ ] **Step 3: `steps-and-gates.md` — the adoption section reads the pack**

Read lines 56-90 in full first. Rewrite the section so it opens, right after the intro sentence ("`flow/SKILL.md` Step 3 branches on the `PIPELINE_RUN_DIR` env var… Five cases, checked in this order:"), with this paragraph (one physical paragraph):

```markdown
**Gather the facts once (#1931).** Run `node "${CLAUDE_PLUGIN_ROOT}/bin/flow-preflight.js" --run "$PIPELINE_RUN_DIR" --steps "{steps}"` — one process writes `{run-dir}/preflight.json`: `adoption` (the case below and its note line, computed by `bin/lib/flow/preflight.js` from the same predicates the cases state — the note literals live there and are rendered here verbatim), `freshness` (`check-resume-freshness`'s verdict and its exact line), `inventory` (`check-staged-inventory`'s status and line), `levers`, `spec`, `pr` (with the phase checklist), `stamp`, and `changedFiles`, each `{ok, value | error}`. Branch on `preflight.adoption.value.case` and print `adoption.value.note` verbatim. **Then, before anything else:** if `freshness.value.verdict === 'BLOCKED'`, report `freshness.value.line` verbatim and stop the pipeline before Step 3 — do not adopt; a pack that was produced is never evidence that adoption is safe. If `inventory.value.status === 'MISMATCH'`, note `inventory.value.line` verbatim (non-blocking). An `ok: false` field takes that read's own failure path (a `pr` probe failure is the `gh`-absent MCP/no-forge path; never fabricate checklist state). When `PIPELINE_RUN_DIR` is unset the pack is not called — case 5 below creates the run directory as before.
```

Then, in each numbered case, replace the probe commands with field reads and keep the descriptions and the note literals byte-identical:
- Case 1: replace `First run `_shared/run-resume-freshness.md`'s probe against this directory: `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" check-resume-freshness --run "{run-dir}"`.` with `The freshness probe (`_shared/run-resume-freshness.md`, `check-resume-freshness`) already ran inside the pack — read `freshness`.`; replace `Also run that file's staged-inventory companion check (`check-staged-inventory --run "{run-dir}"`) at the same time — non-blocking; note a `MISMATCH` line verbatim in the pipeline's output if one comes back.` with `The staged-inventory companion (`check-staged-inventory`) ran in the same pack — `inventory`, non-blocking.`; replace `Read the existing `config.yml` for this run's policy levers instead of recomputing them from the precedence chain, and render the mode's Manifesto behavior` with `Read this run's policy levers from `preflight.levers` (the pack read `config.yml`; never recompute them from the precedence chain), and render the mode's Manifesto behavior`. Keep the `A `BLOCKED` result means …` sentence (it explains the stop the paragraph above performs).
- Case 2: `(no `decisions.md`/`events.jsonl` content, no `work/{n}-spec.md` committed on the run's branch)` stays; append after it ` — `adoption.value.hasOtherContent === false``.
- Case 3: after the first sentence's closing, add ` — `adoption.value.backfills` names which of the three backfills the note lists.` Leave the bullet list of recovery actions unchanged (they are writes the skill performs).
- Case 4: after the literal, add one sentence: `The pack reports which reason applied (`adoption.value.anchored`, `resolveTarget`'s verdict).`
- Case 5 paragraph: untouched.
- The paragraph beginning `The distinction between case 1 and cases 2/3 is a single `fs.existsSync` check` → `The distinction between case 1 and cases 2/3 is `adoption.value.hasConfig`; the distinction between case 2 and case 3 is `adoption.value.hasOtherContent` — `config.yml`'s absence alone is not evidence that nothing has happened yet (case 3 is exactly the counterexample).`

Verify: `grep -c "check-resume-freshness --run" plugin/skills/flow/steps-and-gates.md` → 0; `grep -c "check-resume-freshness" …` ≥ 1; `wc -c` ≤ 40,960 (the section should shrink or stay roughly even — the probe commands leave, one paragraph arrives).

- [ ] **Step 4: `manifesto.md` — FYI table from the pack**

In "## Present the Manifesto", after the paragraph `**In default `auto` mode, render the FYI variant instead:** …Do not wait for input.` add:

```markdown
**Lever values come from the pack (#1931).** When `{run-dir}/preflight.json` exists for this run (an adopted run directory — `steps-and-gates.md`'s adoption section ran `flow-preflight.js`), fill the policy-levers table's Recommended column from `preflight.levers` (`value`) and the log line's source from its `source` (`run-config` | `policy` | `default`; `ceremony-profile`'s source is `header`), and lever 1 from the pack's `mode`; do not re-resolve any lever with `resolve-policy.js`. A lever entry carrying `error` renders its Recommended cell as `unresolved` and is logged, never guessed. A fresh run (no pack — case 5 created the directory) resolves the levers as this file already describes.
```

In "## Source values", add a row: `| `preflight.json` | Read from the adopted run's fact pack (`flow-preflight.js`, #1931) — carries the resolver's own `source` per lever; the FYI table cites that inner source, this row names where the values came from |`.

- [ ] **Step 5: `flow/SKILL.md` Step 3 — one clause, net-zero**

Measure first: `wc -c plugin/skills/flow/SKILL.md` (40,271). In the "Adopt-if-set, before creating:" paragraph, replace `is adopted as-is (nothing created or re-initialized, levers read from that file)` with `is adopted as-is (nothing created or re-initialized, levers read from `flow-preflight.js`'s pack)`. That adds bytes; compensate in the same paragraph by replacing `Set-but-missing, unanchored, or unset creates fresh as below.` with `Missing, unanchored, or unset creates fresh as below.` and, if still above 40,271, shorten `Branch: `steps-and-gates.md`'s **Adopting an inherited run directory**.` to `Branch: `steps-and-gates.md`'s **Adopting an inherited run directory** section.` only if that shrinks (it does not — instead trim `exactly as a from-scratch run would be` to `as a from-scratch run would be`). Measure until `wc -c` ≤ 40,271 and report the final count.

- [ ] **Step 6: Verify**

Run: `node --test tests/flow-preflight-conformance.test.js tests/flow-resume-freshness-citations.test.js tests/flow-run-dir-anchoring.test.js tests/flow-claim-preflight.test.js tests/flow-subfile-table-completeness.test.js tests/ceremony-profile-roster.test.js tests/skill-prose-plugin-root-invocations.test.js` and every suite from `grep -rl "steps-and-gates\|manifesto.md\|flow/SKILL" tests/ | head -30`.
Expected: all pass; `wc -c` of the three files quoted.

- [ ] **Step 7: Commit**

```bash
git add plugin/skills/flow/steps-and-gates.md plugin/skills/flow/manifesto.md plugin/skills/flow/SKILL.md tests/flow-preflight-conformance.test.js
git commit -m "Read the second call's preflight from flow-preflight.js's pack; pin the adoption literals to their one source (refs #1931)"
```

---

### Task 4: Docs rows

**Files:**
- Modify: `docs/plugin-structure.md` (the `plugin/bin/lib/flow/` row; a command row after the `console-resolve.js` row)
- Modify: `docs/skill-graph.md` (`## flow` table: one row)

- [ ] **Step 1: `docs/plugin-structure.md`**

Find the `plugin/bin/lib/flow/` row (`grep -n "plugin/bin/lib/flow/" docs/plugin-structure.md`) and append to its description: `; preflight.js (#1931 — gatherPreflight: the second call's fact pack — adoption case + note literals (the single source steps-and-gates.md renders), resume freshness, staged inventory, Manifesto levers, materialized spec, PR + phase checklist, runner stamp, changed files — each in a {ok, value|error, durationMs} envelope). Consumed by plugin/bin/flow-preflight.js`. After the `console-resolve.js` command row add:

```
node plugin/bin/flow-preflight.js --run <dir> --steps <a,b,c> [--json <path>]   # Flow second-call preflight pack (#1931) — writes {run-dir}/preflight.json; exit 0 whenever produced (a BLOCKED freshness verdict is data), 2 malformed, 3 unanchored --run or --json
```

- [ ] **Step 2: `docs/skill-graph.md`**

In `## flow`'s table add a row in its column shape (read the header): the relationship is flow → its own second-call preflight — if the table has no self-row precedent, attach the sentence to the row for `/dispatch` (the two-call handoff whose second call this pack serves): `The second Task call's preflight (adoption, freshness, inventory, levers, PR, stamp, changed files) is one `flow-preflight.js` call (#1931); the adoption note literals live in `bin/lib/flow/preflight.js` and `steps-and-gates.md` renders them.` Say which you did.

- [ ] **Step 3: Verify and commit**

Run: `node --test tests/skill-graph-table-structure.test.js tests/flow-preflight-conformance.test.js`
Expected: PASS.

```bash
git add docs/plugin-structure.md docs/skill-graph.md
git commit -m "Document flow-preflight.js and the flow preflight module (refs #1931)"
```

---

## Self-review

- **Spec coverage:** Deliverable 1 → Task 1; 2 → Task 2; 3, 4, 5 → Task 3; 6 → Tasks 1-3's tests; 7 → Task 4. AC1 → Task 1's case-1 test; AC2 → cases 2/3/4/5 tests; AC3 → the BLOCKED tests (module + CLI); AC4 → the CLI tests (file written, `gh` absent, exit 3); AC5 → Task 3's conformance test (call once, no `--run` probe, literal equality); AC6 → byte assertions + Common Step 5's suite.
- **Placeholder scan:** none.
- **Type consistency:** `gatherPreflight({runDir, steps, cwd, mainRoot, deps})` in Tasks 1-2; `deps.packDeps` passes through as `deps`; `execFileAsync` preferred by `buildProbes` and injected by both test files; `ADOPTION_NOTES` keys 1-4 in Tasks 1 and 3; field names `adoption/freshness/inventory/levers/spec/pr/stamp/changedFiles` identical in Tasks 1, 2, 3 (prose reads `preflight.{field}.value.{…}`).
- **Plan-authoring checks:** Consumer-timing — every field is a read the prose consumed at the same point it now reads the pack (no fetch-first or post-merge consumer); Gate-over-producers (mechanized judgment) — the adoption predicates' evidence producers are `config.yml` (Manifesto), `decisions.md`/`events.jsonl` (log-decision/hooks), the branch's `work/` (materialize), `run-state.json` (record-worktree/record-pr) — all enumerated in `computeAdoption`; the levers the manual path resolved (`resolve-policy.js --run --values …`) are resolved with the same run-config precedence in-process; Behavioral-claim — "the pack runs check-resume-freshness in-process" names `checkResumeFreshness` in `buildProbes`; Verbatim-command — `gh pr view --json state,isDraft,body` and `verify.js --stamp-status`/`--changed-files --integration-branch` were run once at plan time (output shapes captured above); Size-headroom — SKILL.md 40,271 with a net-zero clause and a measured trim; steps-and-gates.md shrinks.
