# set-config CLI (record #1376) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give worktree-isolated pipeline sessions a sanctioned CLI (`bin/set-config.js`) to write a `config.yml` policy lever into a run directory — closing the gap where the ceremony escape hatch's "downgrade `ceremony-profile` in place" instruction cannot be executed from a worktree session — and wire the two documented call sites to invoke it.

**Architecture:** Mirror the existing sanctioned-write precedent exactly: a thin CLI (`plugin/bin/set-config.js`) over a pure module (`plugin/bin/lib/set-config/write.js`), reusing `plugin/bin/lib/stage-item/write.js`'s exported `resolveTarget` anchoring predicate verbatim (the record's Technical Approach names it "directly reusable" — import it, do not duplicate a third copy). Lever-name validation runs against the canonical 13-lever Manifesto set; lever-value validation runs against `POLICY_KEYS` enums where the lever has a schema row, with local enums for the two config.yml-only levers (`mode`, `ceremony-profile`).

**Tech Stack:** Node 18+ built-ins only (`fs`, `path`), `node --test`, no new dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-08-24T163411-record-1376/work/1376-spec.md` (materialized from GitHub issue #1376)

## Global Constraints

- Commit messages: `{Verb} {what} — {detail}` imperative style, referencing the record as `refs #1376` — NEVER `closes`/`fixes`.
- New module layout: `plugin/bin/lib/set-config/` flat sibling directory (repo convention: `plugin/bin/lib/{name}/`, NOT a nested `_shared/`).
- Tests live at `tests/bin-lib/set-config/` — picked up automatically by `npm test`'s recursive glob (satisfies the spec's "tests/bin/set-config.test.js (or equivalent)").
- The CLI's stdout/stderr/exit-code conventions mirror `plugin/bin/stage-item.js`: exit 0 success (echo file path), 2 malformed invocation (including unknown lever / invalid value), 3 run dir missing or not anchored under the main checkout, or unwritable.
- Injectable `deps` bag (`cwd`, `readFile` not needed here, `stdout`, `stderr`, `mainRoot`) mirroring `stage-item.js` so tests run against temp fixtures without spawning processes.
- All file paths below are worktree-relative; run every command from the worktree root (`cd` into it or `git -C`).

---

### Task 1: `bin/lib/set-config/write.js` — lever validation + idempotent config.yml write

**Files:**
- Create: `plugin/bin/lib/set-config/write.js`
- Test: `tests/bin-lib/set-config/write.test.js`

**Interfaces:**
- Consumes: `resolveTarget({ runDir, cwd, mainRoot })` from `plugin/bin/lib/stage-item/write.js` (returns `{ ok: true, dir }` or `{ ok: false, reason: 'missing' | 'not-anchored' }`); `POLICY_KEYS` array from `plugin/bin/lib/policy-schema.js` (rows `{ key, type, values?, ... }`).
- Produces (for Task 2):
  - `MANIFESTO_LEVERS`: frozen array of the 13 canonical config.yml lever names, in Manifesto numbering order: `['mode', 'scope-creep', 'overlap', 'design-intent', 'leftover-default', 'auto-fix-threshold', 'review-auto-apply-ceiling', 'tidy-aggressiveness', 'ceremony-profile', 'model-stance', 'merge-verification', 'design-critique', 'merge-authorization']`
  - `leverValues(key)` → `string[] | null` — allowed values for a lever, `null` when `key` is not in `MANIFESTO_LEVERS`
  - `validateLever(key, value)` → `{ ok: true }` | `{ ok: false, reason: 'unknown-key' }` | `{ ok: false, reason: 'invalid-value', allowed: string[] }`
  - `setConfigLever({ runDir, key, value })` → `{ file, previous }` — `previous` is the lever's prior raw value string or `null` when the line was absent; throws on fs errors (caller maps to exit 3)

- [ ] **Step 1: Write the failing test**

Create `tests/bin-lib/set-config/write.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  MANIFESTO_LEVERS, leverValues, validateLever, setConfigLever,
} = require('../../../plugin/bin/lib/set-config/write');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');

function fixtureRunDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'setcfg-'));
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-08-20T090000-spec-12');
  fs.mkdirSync(runDir, { recursive: true });
  return runDir;
}

test('validateLever: every canonical Manifesto lever is accepted with a known-good value', () => {
  const good = {
    mode: 'auto',
    'scope-creep': 'add-to-plan',
    overlap: 'companion',
    'design-intent': 'none',
    'leftover-default': 'defer',
    'auto-fix-threshold': 'lint+type',
    'review-auto-apply-ceiling': 'low',
    'tidy-aggressiveness': 'moderate',
    'ceremony-profile': 'standard',
    'model-stance': 'default',
    'merge-verification': 'merge-when-green',
    'design-critique': 'auto',
    'merge-authorization': 'ask',
  };
  assert.deepEqual(Object.keys(good).sort(), [...MANIFESTO_LEVERS].sort());
  for (const [key, value] of Object.entries(good)) {
    assert.deepEqual(validateLever(key, value), { ok: true }, `${key}=${value} should validate`);
  }
});

test('validateLever: a key outside the lever enum is refused (unknown-key) — including config.yml bookkeeping fields', () => {
  for (const key of ['spec', 'created', 'worktree-always', 'not-a-lever']) {
    assert.deepEqual(validateLever(key, 'x'), { ok: false, reason: 'unknown-key' });
  }
});

test('validateLever: a value outside the lever\'s enum is refused with the allowed list', () => {
  const res = validateLever('ceremony-profile', 'turbo');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'invalid-value');
  assert.deepEqual(res.allowed, ['fast-lane', 'standard']);
  const res2 = validateLever('design-critique', 'sometimes');
  assert.equal(res2.ok, false);
  assert.deepEqual(res2.allowed, ['off', 'auto', 'full']);
});

test('leverValues: schema-backed levers surface POLICY_KEYS enums; config-only levers surface local enums; non-levers null', () => {
  assert.deepEqual(leverValues('mode'), ['auto', 'hybrid', 'interactive']);
  assert.deepEqual(leverValues('ceremony-profile'), ['fast-lane', 'standard']);
  assert.deepEqual(leverValues('model-stance'), ['economy', 'default', 'max-rigor']);
  assert.equal(leverValues('spec'), null);
});

test('MANIFESTO_LEVERS matches manifesto.md\'s config.yml example block (the canonical lever set)', () => {
  const manifesto = fs.readFileSync(
    path.join(REPO_ROOT, 'plugin', 'skills', 'flow', 'manifesto.md'), 'utf8');
  const approvalIdx = manifesto.indexOf('On approval (option 1)');
  assert.ok(approvalIdx !== -1);
  const fenceStart = manifesto.indexOf('```yaml', approvalIdx);
  assert.ok(fenceStart !== -1);
  const fenceEnd = manifesto.indexOf('```', fenceStart + 7);
  const block = manifesto.slice(fenceStart + 7, fenceEnd);
  const keys = [];
  for (const rawLine of block.split('\n')) {
    const m = /^([a-z0-9-]+):/.exec(rawLine.trim());
    if (m && m[1] !== 'spec' && m[1] !== 'created') keys.push(m[1]);
  }
  assert.deepEqual(keys, [...MANIFESTO_LEVERS],
    'MANIFESTO_LEVERS must track manifesto.md\'s config.yml example block, in order');
});

test('setConfigLever: replaces an existing lever line in place, preserving every other line (comments included)', () => {
  const runDir = fixtureRunDir();
  const file = path.join(runDir, 'config.yml');
  fs.writeFileSync(file, [
    'mode: auto',
    '# a comment line',
    'ceremony-profile: fast-lane   # ceiling note',
    'spec: 12',
    '',
  ].join('\n'));
  const res = setConfigLever({ runDir, key: 'ceremony-profile', value: 'standard' });
  assert.equal(res.file, file);
  assert.equal(res.previous, 'fast-lane');
  assert.equal(fs.readFileSync(file, 'utf8'), [
    'mode: auto',
    '# a comment line',
    'ceremony-profile: standard',
    'spec: 12',
    '',
  ].join('\n'));
});

test('setConfigLever: appends the lever when the line is absent, and creates config.yml when missing', () => {
  const runDir = fixtureRunDir();
  const file = path.join(runDir, 'config.yml');
  fs.writeFileSync(file, 'mode: auto\n');
  const res = setConfigLever({ runDir, key: 'ceremony-profile', value: 'standard' });
  assert.equal(res.previous, null);
  assert.equal(fs.readFileSync(file, 'utf8'), 'mode: auto\nceremony-profile: standard\n');

  const runDir2 = fixtureRunDir();
  const res2 = setConfigLever({ runDir: runDir2, key: 'mode', value: 'interactive' });
  assert.equal(res2.previous, null);
  assert.equal(fs.readFileSync(path.join(runDir2, 'config.yml'), 'utf8'), 'mode: interactive\n');
});

test('setConfigLever: idempotent — setting the same value twice leaves one line', () => {
  const runDir = fixtureRunDir();
  fs.writeFileSync(path.join(runDir, 'config.yml'), 'ceremony-profile: fast-lane\n');
  setConfigLever({ runDir, key: 'ceremony-profile', value: 'standard' });
  const second = setConfigLever({ runDir, key: 'ceremony-profile', value: 'standard' });
  assert.equal(second.previous, 'standard');
  const body = fs.readFileSync(path.join(runDir, 'config.yml'), 'utf8');
  assert.equal(body, 'ceremony-profile: standard\n');
  assert.equal(body.match(/ceremony-profile:/g).length, 1);
});

test('setConfigLever: the written line is readable by policy-schema\'s parseFlatLines', () => {
  const { parseFlatLines } = require('../../../plugin/bin/lib/policy-schema');
  const runDir = fixtureRunDir();
  fs.writeFileSync(path.join(runDir, 'config.yml'), 'ceremony-profile: fast-lane   # note\n');
  setConfigLever({ runDir, key: 'ceremony-profile', value: 'standard' });
  const parsed = parseFlatLines(fs.readFileSync(path.join(runDir, 'config.yml'), 'utf8'));
  assert.equal(parsed['ceremony-profile'], 'standard');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/set-config/write.test.js`
Expected: FAIL with `Cannot find module '../../../plugin/bin/lib/set-config/write'`

- [ ] **Step 3: Write minimal implementation**

Create `plugin/bin/lib/set-config/write.js`:

```js
// bin/lib/set-config/write.js — validate and write one config.yml policy
// lever into a pipeline run directory. The config.yml half of the
// sanctioned-write family (#637/#686 precedent: bin/lib/stage-item/write.js
// for staged/, bin/lib/log-decision/append.js for decisions.md) — closes
// #1376's gap: a worktree-isolated session has no Edit/Write path to the
// run dir, so the ceremony escape hatch's "downgrade ceremony-profile in
// place" needs a CLI.
//
// Anchoring reuses bin/lib/stage-item/write.js's exported resolveTarget
// verbatim (the caller, bin/set-config.js, invokes it) — that predicate's
// header documents why it is duplicated across the two SMALL siblings and
// not a third time; importing is the record's own Technical Approach
// ("directly reusable").
//
// Lever names validate against the canonical 13-lever Manifesto set
// (plugin/skills/flow/manifesto.md's config.yml example block —
// tests/bin-lib/set-config/write.test.js pins parity). Values validate
// against POLICY_KEYS enums where a schema row exists; `mode` and
// `ceremony-profile` are config.yml-only levers with no POLICY_KEYS row
// (flow/manifesto.md computes them per run), so their enums live here.
'use strict';

const fs = require('fs');
const path = require('path');
const { POLICY_KEYS } = require('../policy-schema');

// Ordered per manifesto.md's canonical lever numbering (1=Mode ... 13=Merge
// authorization). spec:/created: are run bookkeeping, not levers — excluded.
const MANIFESTO_LEVERS = Object.freeze([
  'mode', 'scope-creep', 'overlap', 'design-intent', 'leftover-default',
  'auto-fix-threshold', 'review-auto-apply-ceiling', 'tidy-aggressiveness',
  'ceremony-profile', 'model-stance', 'merge-verification', 'design-critique',
  'merge-authorization',
]);

// The two levers with no POLICY_KEYS row: their value sets are defined by
// flow/manifesto.md (mode table; ceremony fold), stated here as data.
const CONFIG_ONLY_VALUES = Object.freeze({
  mode: Object.freeze(['auto', 'hybrid', 'interactive']),
  'ceremony-profile': Object.freeze(['fast-lane', 'standard']),
});

// key -> allowed values array, or null when key is not a config.yml lever.
function leverValues(key) {
  if (!MANIFESTO_LEVERS.includes(key)) return null;
  if (CONFIG_ONLY_VALUES[key]) return [...CONFIG_ONLY_VALUES[key]];
  const row = POLICY_KEYS.find((r) => r.key === key);
  if (row && row.type === 'enum') return [...row.values];
  return null; // a lever with no known enum would validate name-only; none exists today
}

// (key, value) -> { ok } | { ok:false, reason:'unknown-key' } |
// { ok:false, reason:'invalid-value', allowed }
function validateLever(key, value) {
  const allowed = leverValues(key);
  if (allowed === null) return { ok: false, reason: 'unknown-key' };
  if (!allowed.includes(value)) return { ok: false, reason: 'invalid-value', allowed };
  return { ok: true };
}

// { runDir, key, value } -> { file, previous }. Idempotent set: replace the
// first column-0 `key:` line in place (dropping any trailing comment on that
// line — the value change is the point), append when absent, create the file
// when missing. Every other line is preserved byte-for-byte. Throws on fs
// errors — the CLI maps those to exit 3.
function setConfigLever({ runDir, key, value }) {
  const file = path.join(runDir, 'config.yml');
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { text = ''; }
  const lines = text ? text.split('\n') : [];
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const re = new RegExp(`^${key}:\\s*([^#]*)`);
  let previous = null;
  let replaced = false;
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (!m) continue;
    previous = m[1].trim() || null;
    lines[i] = `${key}: ${value}`;
    replaced = true;
    break;
  }
  if (!replaced) lines.push(`${key}: ${value}`);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  return { file, previous };
}

module.exports = { MANIFESTO_LEVERS, leverValues, validateLever, setConfigLever };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/set-config/write.test.js`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/set-config/write.js tests/bin-lib/set-config/write.test.js
git commit -m "Add set-config lever-write module — validated idempotent config.yml lever set (refs #1376)"
```

---

### Task 2: `bin/set-config.js` CLI wrapper

**Files:**
- Create: `plugin/bin/set-config.js`
- Test: `tests/bin-lib/set-config/cli.test.js`

**Interfaces:**
- Consumes: `validateLever`, `setConfigLever`, `leverValues`, `MANIFESTO_LEVERS` from `plugin/bin/lib/set-config/write.js` (Task 1); `resolveTarget` from `plugin/bin/lib/stage-item/write.js`.
- Produces: `run(argv, deps)` export (exit-code-returning, same shape as `plugin/bin/stage-item.js`'s), and the executable CLI:
  `node bin/set-config.js --run <run-dir> --key <lever> --value <value> [--help]`

- [ ] **Step 1: Write the failing test**

Create `tests/bin-lib/set-config/cli.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run } = require('../../../plugin/bin/set-config');

// Same anchoring fixture shape as tests/bin-lib/stage-item/cli.test.js: a
// fake main checkout (.git directory) holding the real run dir, plus a
// worktree-local shadow copy (.git FILE) that must be refused.
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sccli-'));
  const main = path.join(root, 'main');
  const runDir = path.join(main, '.claude-tweaks', 'pipelines', '2026-08-20T090000-spec-12');
  const shadow = path.join(main, '.claude', 'worktrees', 'flow-spec-12', '.claude-tweaks', 'pipelines', '2026-08-20T090000-spec-12');
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(shadow, { recursive: true });
  fs.mkdirSync(path.join(main, '.git'));
  fs.writeFileSync(path.join(main, '.claude', 'worktrees', 'flow-spec-12', '.git'), 'gitdir: ../../../.git/worktrees/flow-spec-12\n');
  fs.writeFileSync(path.join(runDir, 'config.yml'), 'mode: auto\nceremony-profile: fast-lane\nspec: 12\n');
  fs.writeFileSync(path.join(shadow, 'config.yml'), 'mode: auto\nceremony-profile: fast-lane\nspec: 12\n');
  return { main, runDir, shadow };
}

function fakeDeps(cwd) {
  const out = []; const err = [];
  return {
    deps: { cwd: () => cwd, stdout: (s) => out.push(s), stderr: (s) => err.push(s) },
    out, err,
  };
}

test('cli: success path writes the lever and prints the config.yml path', () => {
  const { main, runDir } = fixture();
  const { deps, out } = fakeDeps(main);
  const code = run(['--run', runDir, '--key', 'ceremony-profile', '--value', 'standard'], deps);
  assert.equal(code, 0);
  const body = fs.readFileSync(path.join(runDir, 'config.yml'), 'utf8');
  assert.ok(body.includes('ceremony-profile: standard'));
  assert.ok(!body.includes('fast-lane'));
  assert.ok(body.includes('mode: auto'));
  assert.ok(body.includes('spec: 12'));
  assert.ok(out.join('').includes(path.join(runDir, 'config.yml')));
});

test('cli: missing --run/--key/--value is exit 2', () => {
  const { main, runDir } = fixture();
  assert.equal(run(['--key', 'mode', '--value', 'auto'], fakeDeps(main).deps), 2);
  assert.equal(run(['--run', runDir, '--value', 'auto'], fakeDeps(main).deps), 2);
  assert.equal(run(['--run', runDir, '--key', 'mode'], fakeDeps(main).deps), 2);
});

test('cli: a key outside the lever enum is exit 2 and names the enum source', () => {
  const { main, runDir } = fixture();
  const { deps, err } = fakeDeps(main);
  assert.equal(run(['--run', runDir, '--key', 'spec', '--value', '13'], deps), 2);
  const msg = err.join('');
  assert.ok(/not a config\.yml policy lever/.test(msg), msg);
  assert.ok(msg.includes('ceremony-profile'), 'error should list the valid levers');
});

test('cli: a value outside the lever enum is exit 2 and lists allowed values', () => {
  const { main, runDir } = fixture();
  const { deps, err } = fakeDeps(main);
  assert.equal(run(['--run', runDir, '--key', 'ceremony-profile', '--value', 'turbo'], deps), 2);
  assert.ok(err.join('').includes('fast-lane'));
  assert.ok(err.join('').includes('standard'));
});

test('cli: missing run dir is exit 3', () => {
  const { main } = fixture();
  const { deps } = fakeDeps(main);
  assert.equal(run(['--run', path.join(main, 'nope'), '--key', 'mode', '--value', 'auto'], deps), 3);
});

test('cli: a worktree-local shadow run dir is refused (exit 3), and its config.yml is untouched', () => {
  const { main, shadow } = fixture();
  const { deps, err } = fakeDeps(main);
  const code = run(['--run', shadow, '--key', 'ceremony-profile', '--value', 'standard'], deps);
  assert.equal(code, 3);
  assert.ok(/not anchored/.test(err.join('')));
  assert.ok(fs.readFileSync(path.join(shadow, 'config.yml'), 'utf8').includes('fast-lane'));
});

test('cli: --help prints usage, exit 0', () => {
  const { main } = fixture();
  const { deps, out } = fakeDeps(main);
  assert.equal(run(['--help'], deps), 0);
  assert.ok(out.join('').includes('usage:'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/set-config/cli.test.js`
Expected: FAIL with `Cannot find module '../../../plugin/bin/set-config'`

- [ ] **Step 3: Write minimal implementation**

Create `plugin/bin/set-config.js`:

```js
#!/usr/bin/env node
// bin/set-config.js — write one config.yml policy lever into a run's
// directory, the sanctioned path for a worktree-isolated session (#1376).
//   node bin/set-config.js --run <run-dir> --key <lever> --value <value> [--help]
// Exit 0 on success (echoes the config.yml path to stdout); 2 on a malformed
// invocation (missing args, a key outside the canonical Manifesto lever set,
// or a value outside that lever's enum); 3 when the run dir is missing or
// not anchored under the main checkout (a worktree-local shadow —
// _shared/pipeline-run-dir.md's Anchoring section, [IL-127]), or config.yml
// is unwritable. The config.yml third of the sanctioned-write family:
// bin/log-decision.js (decisions.md), bin/stage-item.js (staged/), this
// (config.yml levers — the ceremony escape hatch's downgrade path).
'use strict';

const { resolveTarget } = require('./lib/stage-item/write');
const { MANIFESTO_LEVERS, validateLever, setConfigLever } = require('./lib/set-config/write');

const USAGE = 'usage: set-config.js --run <run-dir> --key <lever> --value <value> [--help]\n';

function parseArgs(argv) {
  const o = { run: null, key: null, value: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? null;
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--run') o.run = next();
    else if (a === '--key') o.key = next();
    else if (a === '--value') o.value = next();
    else return { error: `unknown argument: ${a}` };
  }
  return o;
}

const realDeps = {
  cwd: () => process.cwd(),
  mainRoot: undefined,
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
};

function run(argv, deps = realDeps) {
  const o = parseArgs(argv);
  const usageError = (message) => { deps.stderr(`set-config.js: ${message}\n` + USAGE); return 2; };
  if (o.error) { deps.stderr(o.error + '\n' + USAGE); return 2; }
  if (o.help) { deps.stdout(USAGE); return 0; }
  if (!o.run) return usageError('--run <run-dir> is required');
  if (!o.key) return usageError('--key <lever> is required');
  if (o.value == null || o.value === '') return usageError('--value <value> is required');

  const verdict = validateLever(o.key, o.value);
  if (!verdict.ok) {
    if (verdict.reason === 'unknown-key') {
      return usageError(`--key ${JSON.stringify(o.key)} is not a config.yml policy lever (the canonical Manifesto set: ${MANIFESTO_LEVERS.join(', ')})`);
    }
    return usageError(`--value ${JSON.stringify(o.value)} is not valid for ${o.key} (allowed: ${verdict.allowed.join(', ')})`);
  }

  let target;
  try { target = resolveTarget({ runDir: o.run, cwd: deps.cwd(), mainRoot: deps.mainRoot }); } catch (err) {
    deps.stderr(`set-config.js: ${err && err.message}\n`);
    return 3;
  }
  if (!target.ok) {
    if (target.reason === 'missing') deps.stderr(`set-config.js: run dir does not exist: ${o.run}\n`);
    else deps.stderr(`set-config.js: run dir is not anchored under the main checkout (a worktree-local shadow): ${o.run} — resolve $RUN_ROOT per _shared/pipeline-run-dir.md's Anchoring section and pass the main-checkout path\n`);
    return 3;
  }

  let result;
  try { result = setConfigLever({ runDir: target.dir, key: o.key, value: o.value }); } catch (err) {
    deps.stderr(`set-config.js: could not write config.yml (${err && err.message})\n`);
    return 3;
  }
  deps.stdout(result.file + '\n');
  return 0;
}

module.exports = { run, parseArgs };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/set-config/cli.test.js tests/bin-lib/set-config/write.test.js`
Expected: PASS (all tests in both files)

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/set-config.js tests/bin-lib/set-config/cli.test.js
git commit -m "Add set-config.js CLI — sanctioned worktree-safe config.yml lever writer (refs #1376)"
```

---

### Task 3: Wire the two ceremony-escape-hatch call sites + document the CLI

**Files:**
- Modify: `plugin/skills/wrap-up/SKILL.md` (Phase 1 "Ceremony escape hatch" section — the line "If either is true, downgrade `config.yml`'s `ceremony-profile` to `standard` in place and log:")
- Modify: `plugin/skills/review/code-mode-steps.md` (the "Ceremony-Aware Step Selection" parenthetical citing wrap-up's hatch)
- Modify: `docs/plugin-structure.md` (the `plugin/bin` CLI listing — add `set-config.js`; match the surrounding row/entry format found at edit time)
- Test: full `npm test` (prose-conformance suites pin skill text repo-wide)

**Interfaces:**
- Consumes: the CLI invocation shape from Task 2. Skill prose must use the `${CLAUDE_PLUGIN_ROOT}` invocation form used by sibling prose (e.g. `node "${CLAUDE_PLUGIN_ROOT}/bin/log-decision.js" ...`) — `tests/skill-prose-plugin-root-invocations.test.js` pins that convention.
- Produces: nothing consumed by later tasks (final task).

- [ ] **Step 1: Edit `plugin/skills/wrap-up/SKILL.md`**

Replace the line:

```markdown
If either is true, downgrade `config.yml`'s `ceremony-profile` to `standard` in place and log:
```

with:

```markdown
If either is true, downgrade `config.yml`'s `ceremony-profile` via the sanctioned writer (worktree sessions cannot Edit/Write the run dir — same family as `log-decision.js`/`stage-item.js`, refs #1376):

`node "${CLAUDE_PLUGIN_ROOT}/bin/set-config.js" --run "$PIPELINE_RUN_DIR" --key ceremony-profile --value standard`

Then log:
```

(The existing `AUTO {time} — Ceremony profile downgraded ...` log block below the line stays unchanged.)

- [ ] **Step 2: Edit `plugin/skills/review/code-mode-steps.md`**

In the "Ceremony-Aware Step Selection" section, replace:

```markdown
(`/claude-tweaks:wrap-up`'s Phase 1 ceremony escape hatch downgrades `ceremony-profile` to `standard` for the rest of
the run) — unchanged.
```

with:

```markdown
(`/claude-tweaks:wrap-up`'s Phase 1 ceremony escape hatch downgrades `ceremony-profile` to `standard` for the rest of
the run, via `node "${CLAUDE_PLUGIN_ROOT}/bin/set-config.js" --run "$PIPELINE_RUN_DIR" --key ceremony-profile --value standard` — the sanctioned run-config writer a worktree session can actually execute, refs #1376) — unchanged.
```

- [ ] **Step 3: Edit `docs/plugin-structure.md`**

Find the section listing `plugin/bin/` CLIs (search for `log-decision.js` or `stage-item.js`); add a `set-config.js` entry in the same format as its siblings, describing it as: "write one `config.yml` policy lever into a run dir (the ceremony escape hatch's downgrade path; worktree-safe, mirrors `stage-item.js`'s anchoring)". Match the exact surrounding format (table row vs. list item) at edit time.

- [ ] **Step 4: Run the full suite**

Run: `cd "$WORKTREE" && npm test > /tmp/npm-test-1376.log 2>&1; tail -20 /tmp/npm-test-1376.log`
Expected: PASS (0 failures). Prose-conformance suites (`skill-prose-plugin-root-invocations`, `manifesto-lever-conformance`, skill-conventions, changelog-coverage, etc.) all green. If a conformance test flags the new prose, fix the prose to the pinned convention — never the test.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/wrap-up/SKILL.md plugin/skills/review/code-mode-steps.md docs/plugin-structure.md
git commit -m "Wire ceremony-escape-hatch call sites to set-config.js — replace unexecutable in-place edit instruction (refs #1376)"
```

---

## Verification (plan-level)

- `node --test tests/bin-lib/set-config/write.test.js tests/bin-lib/set-config/cli.test.js` — new suites green.
- `npm test` — full suite green (recursive glob picks up `tests/bin-lib/set-config/` automatically).
- Acceptance criteria trace:
  - "worktree-isolated session can downgrade a config.yml lever without an Edit/Write refusal" → Task 2 CLI (Bash `node` invocation, no Edit/Write involved; run-dir writes via Bash are hook-exempt per `bin/lib/hooks/pre-tool-use.js`'s `PIPELINE_STATE_DIR` exemption).
  - "a downstream step reading via `resolve-policy.js --run` observes the new value" → Task 1's parseFlatLines round-trip test (resolve-policy's run-config source parses config.yml with `parseFlatLines`).
  - "`npm test` green; new test pins the anchoring guard and the lever-enum refusal" → Task 2 Steps 1/4 (shadow-refusal + unknown-key tests), Task 3 Step 4 (full suite).
