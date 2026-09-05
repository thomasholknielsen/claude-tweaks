# set-config.js Batch-Write Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `plugin/bin/set-config.js` a batch-write mode (`--set key=value,key=value,...`) so a full 13-lever Manifesto `config.yml` can be written in one CLI call instead of 13 sequential single-key calls, then point `flow/manifesto.md`'s Approval flow at the new form.

**Architecture:** Add a new `--set <k1=v1,k2=v2,...>` flag to the existing `set-config.js` CLI, mutually exclusive with `--key`/`--value`. Parse the comma-joined pairs, validate every one against the existing `validateLever` (from `bin/lib/set-config/write.js`, unchanged) before writing anything, then loop `setConfigLever` once per pair. The single-key form's exact wiring is preserved by routing both forms through one shared `entries` array (`[{key, value}, ...]`) — a single-key call degrades to a one-entry batch, so its output byte-format never changes.

**Tech Stack:** Plain Node.js (no dependencies), `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-09-05T145253-record-1580/work/1580-spec.md` (record #1580)

## Global Constraints

- No lever value in the canonical Manifesto set (`MANIFESTO_LEVERS`, `plugin/bin/lib/set-config/write.js`) ever contains a comma — a plain `,`-split on `--set`'s value is safe with no escaping.
- The existing single-key form (`--key <lever> --value <value>`) must keep its exact current stdout/stderr wording and exit codes — every existing test in `tests/bin-lib/set-config/cli.test.js` must keep passing unmodified (AC2: additive, not a replacement).
- Exit codes stay as documented: 0 success, 2 malformed invocation (nothing written), 3 run-dir/write failure.

---

### Task 1: `--set` batch mode in `plugin/bin/set-config.js`

**Files:**
- Modify: `plugin/bin/set-config.js`
- Test: `tests/bin-lib/set-config/cli.test.js`

**Interfaces:**
- Consumes: `MANIFESTO_LEVERS`, `validateLever`, `setConfigLever` from `./lib/set-config/write` (already imported today, unchanged signatures); `resolveTarget` from `./lib/stage-item/write` (unchanged).
- Produces: `run(argv, deps)` — same exported signature as today. New CLI surface: `--set <lever1>=<value1>,<lever2>=<value2>,...`, mutually exclusive with `--key`/`--value` on the same invocation.

- [ ] **Step 1: Write the failing tests**

Append to `tests/bin-lib/set-config/cli.test.js` (after the existing `'cli: --help prints usage, exit 0'` test, same file, same `fixture()`/`fakeDeps()` helpers already defined at the top):

```javascript
test('cli: --set writes multiple levers in one call, printing one line per lever', () => {
  const { main, runDir } = fixture();
  const { deps, out } = fakeDeps(main);
  const code = run(['--run', runDir, '--set', 'mode=hybrid,ceremony-profile=standard'], deps);
  assert.equal(code, 0);
  const body = fs.readFileSync(path.join(runDir, 'config.yml'), 'utf8');
  assert.ok(body.includes('mode: hybrid'));
  assert.ok(body.includes('ceremony-profile: standard'));
  assert.ok(body.includes('spec: 12'));
  const printed = out.join('');
  assert.ok(printed.includes('mode: auto -> hybrid'));
  assert.ok(printed.includes('ceremony-profile: fast-lane -> standard'));
});

test('cli: --set validates the full set before writing any — one invalid value blocks the whole batch', () => {
  const { main, runDir } = fixture();
  const { deps, err } = fakeDeps(main);
  const code = run(['--run', runDir, '--set', 'mode=hybrid,ceremony-profile=turbo'], deps);
  assert.equal(code, 2);
  assert.ok(err.join('').includes('fast-lane'));
  const body = fs.readFileSync(path.join(runDir, 'config.yml'), 'utf8');
  assert.ok(body.includes('mode: auto'), 'mode must NOT have been written — all-or-nothing');
  assert.ok(!body.includes('mode: hybrid'));
});

test('cli: --set with an unknown key blocks the whole batch and names the canonical lever set', () => {
  const { main, runDir } = fixture();
  const { deps, err } = fakeDeps(main);
  const code = run(['--run', runDir, '--set', 'mode=hybrid,spec=13'], deps);
  assert.equal(code, 2);
  const msg = err.join('');
  assert.ok(/not a config\.yml policy lever/.test(msg));
  assert.ok(msg.includes('ceremony-profile'));
  const body = fs.readFileSync(path.join(runDir, 'config.yml'), 'utf8');
  assert.ok(body.includes('mode: auto'), 'nothing should have been written');
});

test('cli: --set with a malformed entry (no "=") is exit 2 and nothing is written', () => {
  const { main, runDir } = fixture();
  const { deps, err } = fakeDeps(main);
  const code = run(['--run', runDir, '--set', 'mode=hybrid,ceremony-profile-standard'], deps);
  assert.equal(code, 2);
  assert.ok(err.join('').includes('is not in key=value form'));
  const body = fs.readFileSync(path.join(runDir, 'config.yml'), 'utf8');
  assert.ok(body.includes('mode: auto'), 'nothing should have been written');
});

test('cli: --set combined with --key/--value is exit 2', () => {
  const { main, runDir } = fixture();
  const { deps, err } = fakeDeps(main);
  const code = run(['--run', runDir, '--set', 'mode=hybrid', '--key', 'ceremony-profile', '--value', 'standard'], deps);
  assert.equal(code, 2);
  assert.ok(err.join('').includes('cannot be combined'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/set-config/cli.test.js`
Expected: FAIL — the 5 new tests fail (`--set` is rejected today as `unknown argument: --set`, exit 2, so codes match by accident on some but the specific message assertions like `'is not in key=value form'`/`'cannot be combined'`/output-line assertions fail); every pre-existing test in the file still passes.

- [ ] **Step 3: Implement `--set` in `plugin/bin/set-config.js`**

Replace the full file with:

```javascript
#!/usr/bin/env node
// bin/set-config.js — write one or more config.yml policy levers into a
// run's directory, the sanctioned path for a worktree-isolated session
// (#1376).
//   node bin/set-config.js --run <run-dir> --key <lever> --value <value> [--help]
//   node bin/set-config.js --run <run-dir> --set <lever1>=<value1>,<lever2>=<value2>,... [--help]
// The two forms are mutually exclusive on one invocation. `--set` validates
// every lever/value pair in the comma-joined list against the canonical
// Manifesto lever set BEFORE writing any of them (all-or-nothing, same
// fail-closed posture as the single-key form) — see #1580. Lever values
// never contain a comma (all 13 are short enum tokens), so a plain
// comma-split is safe.
// Exit 0 on success (echoes, per lever, the config.yml path and the
// previous -> new value, so escape-hatch logs are evidence-based); 2 on a
// malformed invocation (missing/conflicting args, a `--set` entry not in
// key=value form, a key outside the canonical Manifesto lever set, or a
// value outside that lever's enum — batch or single, nothing is written on
// this exit code); 3 when the run dir is missing or not anchored under the
// main checkout (a worktree-local shadow — _shared/pipeline-run-dir.md's
// Anchoring section, [IL-127]), or config.yml is unwritable. The config.yml
// third of the sanctioned-write family: bin/log-decision.js (decisions.md),
// bin/stage-item.js (staged/), this (config.yml levers — the ceremony
// escape hatch's downgrade path, and the Manifesto's own batch write).
'use strict';

const { resolveTarget } = require('./lib/stage-item/write');
const { MANIFESTO_LEVERS, validateLever, setConfigLever } = require('./lib/set-config/write');

const USAGE = 'usage: set-config.js --run <run-dir> --key <lever> --value <value> [--help]\n' +
  '       set-config.js --run <run-dir> --set <lever1>=<value1>,<lever2>=<value2>,... [--help]\n';

function parseArgs(argv) {
  const o = { run: null, key: null, value: null, set: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? null;
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--run') o.run = next();
    else if (a === '--key') o.key = next();
    else if (a === '--value') o.value = next();
    else if (a === '--set') o.set = next();
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

// Splits a `--set` value into its comma-joined `key=value` pairs. Returns
// { entries } on success, or { malformed } — the raw entries with no `=` —
// on failure. A pair's key is everything before the FIRST `=`; no current
// lever value ever contains `=`, so this is not a meaningful ambiguity today.
function parseSetEntries(raw) {
  const entries = [];
  const malformed = [];
  for (const pair of raw.split(',')) {
    const eq = pair.indexOf('=');
    if (eq <= 0) { malformed.push(pair); continue; }
    entries.push({ key: pair.slice(0, eq), value: pair.slice(eq + 1) });
  }
  return malformed.length ? { malformed } : { entries };
}

function run(argv, deps = realDeps) {
  const o = parseArgs(argv);
  const usageError = (message) => { deps.stderr(`set-config.js: ${message}\n` + USAGE); return 2; };
  const usageErrors = (messages) => { deps.stderr(messages.map((m) => `set-config.js: ${m}\n`).join('') + USAGE); return 2; };
  if (o.error) { deps.stderr(o.error + '\n' + USAGE); return 2; }
  if (o.help) { deps.stdout(USAGE); return 0; }
  if (!o.run) return usageError('--run <run-dir> is required');

  const batchMode = o.set != null;
  if (batchMode && (o.key != null || o.value != null)) {
    return usageError('--set cannot be combined with --key/--value');
  }
  if (!batchMode) {
    if (!o.key) return usageError('--key <lever> is required (or use --set key=value,...)');
    if (o.value == null || o.value === '') return usageError('--value <value> is required (or use --set key=value,...)');
  } else if (o.set === '') {
    return usageError('--set requires at least one key=value pair');
  }

  let entries;
  if (batchMode) {
    const parsed = parseSetEntries(o.set);
    if (parsed.malformed) {
      return usageErrors(parsed.malformed.map((p) => `--set entry ${JSON.stringify(p)} is not in key=value form`));
    }
    entries = parsed.entries;
  } else {
    entries = [{ key: o.key, value: o.value }];
  }

  const problems = [];
  for (const { key, value } of entries) {
    const verdict = validateLever(key, value);
    if (verdict.ok) continue;
    if (verdict.reason === 'unknown-key') {
      problems.push(`--key ${JSON.stringify(key)} is not a config.yml policy lever (the canonical Manifesto set: ${MANIFESTO_LEVERS.join(', ')})`);
    } else {
      problems.push(`--value ${JSON.stringify(value)} is not valid for ${key} (allowed: ${verdict.allowed.join(', ')})`);
    }
  }
  if (problems.length) return usageErrors(problems);

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

  const results = [];
  try {
    for (const { key, value } of entries) {
      results.push({ key, value, ...setConfigLever({ runDir: target.dir, key, value }) });
    }
  } catch (err) {
    deps.stderr(`set-config.js: could not write config.yml (${err && err.message})\n`);
    return 3;
  }

  for (const r of results) {
    deps.stdout(`${r.file} (${r.key}: ${r.previous == null ? 'unset' : r.previous} -> ${r.value})\n`);
  }
  return 0;
}

module.exports = { run, parseArgs };

if (require.main === module) process.exitCode = run(process.argv.slice(2), realDeps);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/set-config/cli.test.js`
Expected: PASS — all tests in the file, both the pre-existing single-key ones and the 5 new `--set` ones.

- [ ] **Step 5: Run the full set-config suite (write.js + cli.js) to confirm no regression**

Run: `node --test tests/bin-lib/set-config/*.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/set-config.js tests/bin-lib/set-config/cli.test.js
git commit -m "Add --set batch-write mode to set-config.js (refs #1580)"
```

---

### Task 2: Point `flow/manifesto.md`'s Approval flow at the batch form

**Files:**
- Modify: `plugin/skills/flow/manifesto.md`

**Interfaces:**
- Consumes: Task 1's `--set` flag on `plugin/bin/set-config.js` (documented, not imported — this is a prose-only change).
- Produces: nothing new for other files to consume — this task only updates guidance text read by whoever executes the Manifesto's write step (`/claude-tweaks:flow` Step 3, and the recovery paths in `flow/steps-and-gates.md` cases 2/3/5 that cite "the sanctioned run-dir writers").

- [ ] **Step 1: Edit `plugin/skills/flow/manifesto.md`'s "Approval flow" section**

In `plugin/skills/flow/manifesto.md`, find this exact paragraph (the first paragraph under `## Approval flow`):

```
**In default `auto` mode (FYI, no gate):** write the computed values straight to `config.yml` (same schema as below), initialize `decisions.md` with the config snapshot header, create `staged/`, then proceed to Step 4 without waiting. The FYI table has already shown the user what was chosen; there is no approval step to process. This is the everyday path. The `Approve all / Override / Cancel` handling below applies only to `confirm` and `hybrid` modes.
```

Replace it with (same paragraph, plus one new paragraph immediately after it):

```
**In default `auto` mode (FYI, no gate):** write the computed values straight to `config.yml` (same schema as below), initialize `decisions.md` with the config snapshot header, create `staged/`, then proceed to Step 4 without waiting. The FYI table has already shown the user what was chosen; there is no approval step to process. This is the everyday path. The `Approve all / Override / Cancel` handling below applies only to `confirm` and `hybrid` modes.

**Write mechanism (all modes, #1580):** compose all 13 lever values, then write them in **one call** — `node "${CLAUDE_PLUGIN_ROOT}/bin/set-config.js" --run "{run-dir}" --set mode={v},scope-creep={v},overlap={v},design-intent={v},leftover-default={v},auto-fix-threshold={v},review-auto-apply-ceiling={v},tidy-aggressiveness={v},ceremony-profile={v},model-stance={v},merge-verification={v},design-critique={v},merge-authorization={v}` (all 13 `key=value` pairs, comma-joined, in the canonical lever order above) — never one `--key`/`--value` call per lever. The batch form validates the complete set against the canonical Manifesto lever list before writing any of it, the same fail-closed posture the single-key form already has (`bin/lib/set-config/write.js`). The single-key form (`--key <lever> --value <value>`) stays available for its other callers — the ceremony escape hatch's downgrade-in-place write and `steps-and-gates.md` case 3's targeted backfill — this is additive, not a replacement.
```

- [ ] **Step 2: Verify the pinned lever-conformance test still passes**

Run: `node --test tests/manifesto-lever-conformance.test.js`
Expected: PASS — this edit only inserts a new paragraph; it does not touch the `## On approval (option 1)` heading or its ` ```yaml ` example block, which is the only part that test parses.

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/flow/manifesto.md
git commit -m "Point manifesto.md's Approval flow at set-config.js's batch form (refs #1580)"
```

---

## Self-Review Notes (for the executor to skip re-deriving)

- **AC1** (single call writes all 13 levers, same fail-closed validation as single-key form): Task 1, Step 3 — `entries` loop validates every pair via the existing `validateLever` before any `setConfigLever` write runs.
- **AC2** (single-key form kept as-is, additive): Task 1's implementation routes the single-key call through the exact same one-entry-array path, byte-identical output — proven by every pre-existing `tests/bin-lib/set-config/cli.test.js` test passing unmodified (Step 4/5).
- No placeholders; every step's code block is complete and runnable.
- Type/shape consistency: `entries` is always `[{key, value}, ...]` whether single- or batch-derived; `setConfigLever`'s `{file, previous}` return shape is spread into each result unchanged from today's usage.
