# Work-Profile Table and Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the contract's `Fast|Standard|Capable` tier prose with a four-profile work-profile table resolving to (model, effort) pairs, mechanically resolved by a new `bin/` resolver with a tested override chain (spec: `#216`, materialized at `.claude-tweaks/pipelines/2026-08-08T163319-spec-216-217-218/spec-216/work/216-spec.md`).

**Architecture:** A pure data+logic module `bin/lib/model-profiles/profiles.js` (table, effort scale, policy key names, pure `resolve()`), a tiny policy-fragment parser in the same module directory, and a CLI wrapper `bin/resolve-profile.js` that owns all I/O (policy read, frontier tally read/append). The contract's markdown table is pinned to the exported data by a test, following the `GATE_COVERAGE` precedent.

**Tech Stack:** Node 18+ built-ins only (`node:test`, `fs`, `path`) — this plugin ships zero runtime npm deps, so the policy fragment is parsed by hand (the existing `bin/lib/policy-schema.js` `parseFlatLines` is flat-only and cannot read the nested `model-profiles` key; do not extend it here — #219 owns schema registration).

## Global Constraints

- No new npm dependencies; `'use strict';` headers matching existing `bin/lib/` modules.
- All work happens in the shared worktree: before every commit, `pwd` and `git rev-parse --show-toplevel` must print `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/model-profile-strategy-design`.
- Commit messages: `{Verb} {what} — {detail}`, imperative, ending with `refs #216` (never "closes").
- Stage specific files only (`git add <paths>`); run `git diff --cached --name-only` before each commit.
- Model values are family aliases (`haiku|sonnet|opus|fable`), never versioned IDs.
- Effort scale, ordered: `low < medium < high < xhigh < max`.
- Fail loud: unknown profile / malformed policy throw (module) or exit non-zero with the error named on stderr (CLI). Never silently resolve a default.

---

### Task 1: Profile data module + effortLine + test glob

**Files:**
- Create: `bin/lib/model-profiles/profiles.js`
- Create: `bin/lib/model-profiles/tests/profiles.test.js`
- Modify: `package.json:7` (append `bin/lib/model-profiles/tests/*.test.js` to the `test` script's glob list)

**Interfaces:**
- Consumes: nothing.
- Produces: `PROFILES` (object: `{fast: {model: 'haiku', effort: null}, standard: {model: 'sonnet', effort: 'high'}, capable: {model: 'opus', effort: 'high'}, frontier: {model: 'fable', effort: 'high', singletonOnly: true, degradeTo: 'capable'}}`), `EFFORT_SCALE` (`['low','medium','high','xhigh','max']`), `POLICY_KEYS_READ` (`['model-profiles','model-stance','model-ceiling','frontier-run-cap']`), `effortLine(effort)` (string function). Tasks 2, 4, 5, 6 rely on these exact names.

- [ ] **Step 1: Write the failing test**

```js
// bin/lib/model-profiles/tests/profiles.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { PROFILES, EFFORT_SCALE, POLICY_KEYS_READ, effortLine } = require('../profiles');

test('PROFILES carries the four canonical rows with family-alias models', () => {
  assert.deepStrictEqual(Object.keys(PROFILES), ['fast', 'standard', 'capable', 'frontier']);
  assert.deepStrictEqual(PROFILES.fast, { model: 'haiku', effort: null });
  assert.deepStrictEqual(PROFILES.standard, { model: 'sonnet', effort: 'high' });
  assert.deepStrictEqual(PROFILES.capable, { model: 'opus', effort: 'high' });
  assert.deepStrictEqual(PROFILES.frontier, {
    model: 'fable', effort: 'high', singletonOnly: true, degradeTo: 'capable',
  });
});

test('EFFORT_SCALE is the ordered five-level ladder', () => {
  assert.deepStrictEqual(EFFORT_SCALE, ['low', 'medium', 'high', 'xhigh', 'max']);
});

test('POLICY_KEYS_READ names exactly the four policy keys', () => {
  assert.deepStrictEqual(POLICY_KEYS_READ,
    ['model-profiles', 'model-stance', 'model-ceiling', 'frontier-run-cap']);
});

test('effortLine renders the pinned template, empty for null', () => {
  assert.strictEqual(effortLine('high'),
    '[Effort: high — apply high-level reasoning depth to this task.]');
  assert.strictEqual(effortLine(null), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/model-profiles/tests/profiles.test.js`
Expected: FAIL with `Cannot find module '../profiles'`

- [ ] **Step 3: Write minimal implementation**

```js
// bin/lib/model-profiles/profiles.js
//
// Canonical work-profile data. The markdown table in
// skills/_shared/subagent-output-contract.md §Model Selection is pinned to
// PROFILES by bin/lib/model-profiles/tests/table-pinning.test.js — change
// them together or the suite goes red.
'use strict';

const PROFILES = {
  fast: { model: 'haiku', effort: null },
  standard: { model: 'sonnet', effort: 'high' },
  capable: { model: 'opus', effort: 'high' },
  frontier: { model: 'fable', effort: 'high', singletonOnly: true, degradeTo: 'capable' },
};

const EFFORT_SCALE = ['low', 'medium', 'high', 'xhigh', 'max'];

// The four policy.yml keys the resolver reads. #219 pins policy-schema.js
// registration against this export — the names here are authoritative.
const POLICY_KEYS_READ = ['model-profiles', 'model-stance', 'model-ceiling', 'frontier-run-cap'];

function effortLine(effort) {
  if (!effort) return '';
  return `[Effort: ${effort} — apply ${effort}-level reasoning depth to this task.]`;
}

module.exports = { PROFILES, EFFORT_SCALE, POLICY_KEYS_READ, effortLine };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bin/lib/model-profiles/tests/profiles.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the test glob to package.json**

In `package.json`, the `test` script currently ends with `... bin/lib/wrap-up/tests/*.test.js tools/upstream-drift/tests/*.test.js`. Insert `bin/lib/model-profiles/tests/*.test.js` before `tools/upstream-drift/tests/*.test.js` (position is cosmetic; presence is the requirement). Then run `npm test` once and confirm the new file's 4 tests appear in the total.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/model-profiles/profiles.js bin/lib/model-profiles/tests/profiles.test.js package.json
git diff --cached --name-only
git commit -m "Add model-profiles data module — PROFILES, EFFORT_SCALE, POLICY_KEYS_READ, effortLine — refs #216"
```

---

### Task 2: Pure resolve() with the six-stage transform pipeline

**Files:**
- Modify: `bin/lib/model-profiles/profiles.js` (add `resolve`)
- Create: `bin/lib/model-profiles/tests/resolve.test.js`

**Interfaces:**
- Consumes: Task 1's `PROFILES`, `EFFORT_SCALE`, `effortLine`.
- Produces: `resolve(profile, opts)` where `opts = {policy?, stance?, cliOverride?, unattended?, frontierUsed?}` → `{model, effort, source, effortLine}`. `policy` is the parsed object Task 3 produces (`{'model-profiles'?, 'model-stance'?, 'model-ceiling'?, 'frontier-run-cap'?}`). `source` is one of `default|policy|cli|stance|ceiling|degraded:cap|degraded:stance|degraded:unattended` (last transform that changed the result wins). Task 4's CLI calls this; it performs no I/O.

Pipeline order (fixed, from the spec): (1) table default row → (2) policy `model-profiles` row, partial rows merging field-wise → (3) `cliOverride`, same field-wise merge → (4) stance (from `opts.stance` if given, else `policy['model-stance']`, else `default`): shifts effort one notch along `EFFORT_SCALE` (economy down, max-rigor up, clamped at the ends; `fast`/null-effort untouched); economy additionally re-points a still-`frontier` resolution at `capable`'s pair with `source: 'degraded:stance'` → (5) `model-ceiling` clamp: when the current model is more expensive than the ceiling profile's model (compare by profile order `fast<standard<capable<frontier` via each model's owning profile), replace with the ceiling profile's pair — **skipped entirely when a `cliOverride` was supplied** → (6) frontier gates, only when the resolved profile is still `frontier`: `unattended` → capable pair, `degraded:unattended`; `frontierUsed >= cap` (cap = `policy['frontier-run-cap']`, default 3) → capable pair, `degraded:cap`.

- [ ] **Step 1: Write the failing tests**

```js
// bin/lib/model-profiles/tests/resolve.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { resolve } = require('../profiles');

test('table default resolves with source default', () => {
  assert.deepStrictEqual(resolve('standard', {}), {
    model: 'sonnet', effort: 'high', source: 'default',
    effortLine: '[Effort: high — apply high-level reasoning depth to this task.]',
  });
});

test('policy row overrides the table; partial rows merge field-wise', () => {
  const policy = { 'model-profiles': { standard: { model: 'opus', effort: 'low' } } };
  const r = resolve('standard', { policy });
  assert.strictEqual(r.model, 'opus');
  assert.strictEqual(r.effort, 'low');
  assert.strictEqual(r.source, 'policy');
  const partial = resolve('standard', { policy: { 'model-profiles': { standard: { effort: 'low' } } } });
  assert.strictEqual(partial.model, 'sonnet'); // default model kept
  assert.strictEqual(partial.effort, 'low');
});

test('cliOverride beats policy', () => {
  const policy = { 'model-profiles': { standard: { model: 'opus' } } };
  const r = resolve('standard', { policy, cliOverride: { model: 'haiku' } });
  assert.strictEqual(r.model, 'haiku');
  assert.strictEqual(r.source, 'cli');
});

test('economy stance drops effort one notch; max-rigor raises capped at max; fast is stance-invariant', () => {
  assert.strictEqual(resolve('standard', { stance: 'economy' }).effort, 'medium');
  assert.strictEqual(resolve('standard', { stance: 'max-rigor' }).effort, 'xhigh');
  assert.strictEqual(resolve('standard', {
    policy: { 'model-profiles': { standard: { effort: 'max' } } }, stance: 'max-rigor',
  }).effort, 'max'); // clamped
  assert.deepStrictEqual(resolve('fast', { stance: 'economy' }),
    resolve('fast', {}));
});

test('stance comes from policy model-stance when opts.stance is absent, and opts.stance wins', () => {
  const policy = { 'model-stance': 'economy' };
  assert.strictEqual(resolve('standard', { policy }).effort, 'medium');
  assert.strictEqual(resolve('standard', { policy, stance: 'default' }).effort, 'high');
});

test('economy resolves frontier as capable with degraded:stance', () => {
  const r = resolve('frontier', { stance: 'economy' });
  assert.strictEqual(r.model, 'opus');
  assert.strictEqual(r.source, 'degraded:stance');
});

test('model-ceiling clamps non-cli resolutions and never a cliOverride', () => {
  const policy = { 'model-ceiling': 'standard' };
  const clamped = resolve('capable', { policy });
  assert.strictEqual(clamped.model, 'sonnet');
  assert.strictEqual(clamped.source, 'ceiling');
  const cli = resolve('capable', { policy, cliOverride: { model: 'opus' } });
  assert.strictEqual(cli.model, 'opus');
  assert.strictEqual(cli.source, 'cli');
});

test('frontier gates: unattended and cap degrade to capable with named sources', () => {
  const un = resolve('frontier', { unattended: true });
  assert.strictEqual(un.model, 'opus');
  assert.strictEqual(un.source, 'degraded:unattended');
  const cap = resolve('frontier', { frontierUsed: 3 });
  assert.strictEqual(cap.source, 'degraded:cap');
  const under = resolve('frontier', { frontierUsed: 2 });
  assert.strictEqual(under.model, 'fable');
  const raised = resolve('frontier', { frontierUsed: 3, policy: { 'frontier-run-cap': 5 } });
  assert.strictEqual(raised.model, 'fable');
  const disabled = resolve('frontier', { frontierUsed: 0, policy: { 'frontier-run-cap': 0 } });
  assert.strictEqual(disabled.source, 'degraded:cap');
});

test('stance never promotes a model upward', () => {
  assert.strictEqual(resolve('capable', { stance: 'max-rigor' }).model, 'opus');
});

test('unknown profile and unknown stance throw with the name in the message', () => {
  assert.throws(() => resolve('turbo', {}), /turbo/);
  assert.throws(() => resolve('standard', { stance: 'frugal' }), /frugal/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/model-profiles/tests/resolve.test.js`
Expected: FAIL — `resolve` is not exported.

- [ ] **Step 3: Implement resolve() in profiles.js**

```js
const STANCES = ['economy', 'default', 'max-rigor'];
const PROFILE_ORDER = ['fast', 'standard', 'capable', 'frontier'];

function shiftEffort(effort, delta) {
  if (!effort) return effort; // fast has no dial
  const i = EFFORT_SCALE.indexOf(effort);
  const j = Math.min(Math.max(i + delta, 0), EFFORT_SCALE.length - 1);
  return EFFORT_SCALE[j];
}

function profileOfModel(model) {
  const name = PROFILE_ORDER.find((p) => PROFILES[p].model === model);
  if (!name) throw new Error(`unknown model "${model}" — not a profile family alias`);
  return name;
}

function resolve(profile, opts = {}) {
  if (!PROFILES[profile]) throw new Error(`unknown profile "${profile}"`);
  const policy = opts.policy || {};
  const stance = opts.stance || policy['model-stance'] || 'default';
  if (!STANCES.includes(stance)) throw new Error(`unknown stance "${stance}"`);

  let model = PROFILES[profile].model;
  let effort = PROFILES[profile].effort;
  let source = 'default';

  const row = (policy['model-profiles'] || {})[profile];
  if (row) {
    if (row.model !== undefined) model = row.model;
    if (row.effort !== undefined) effort = row.effort;
    source = 'policy';
  }
  const cli = opts.cliOverride;
  if (cli) {
    if (cli.model !== undefined) model = cli.model;
    if (cli.effort !== undefined) effort = cli.effort;
    source = 'cli';
  }

  if (stance !== 'default') {
    const shifted = shiftEffort(effort, stance === 'economy' ? -1 : 1);
    if (shifted !== effort) { effort = shifted; source = 'stance'; }
    if (stance === 'economy' && profileOfModel(model) === 'frontier') {
      ({ model, effort } = { ...PROFILES.capable });
      source = 'degraded:stance';
    }
  }

  const ceiling = policy['model-ceiling'];
  if (ceiling && !cli) {
    if (!PROFILES[ceiling]) throw new Error(`unknown model-ceiling "${ceiling}"`);
    if (PROFILE_ORDER.indexOf(profileOfModel(model)) > PROFILE_ORDER.indexOf(ceiling)) {
      ({ model, effort } = { ...PROFILES[ceiling] });
      source = 'ceiling';
    }
  }

  if (profileOfModel(model) === 'frontier') {
    const cap = policy['frontier-run-cap'] !== undefined ? policy['frontier-run-cap'] : 3;
    if (opts.unattended) {
      ({ model, effort } = { ...PROFILES.capable });
      source = 'degraded:unattended';
    } else if ((opts.frontierUsed || 0) >= cap) {
      ({ model, effort } = { ...PROFILES.capable });
      source = 'degraded:cap';
    }
  }

  return { model, effort, source, effortLine: effortLine(effort) };
}
```

Export `resolve` alongside the Task 1 exports. Note the capable spread `{ ...PROFILES.capable }` yields `{model, effort}` only — destructure exactly those two.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/model-profiles/tests/resolve.test.js`
Expected: PASS (10 tests). Also re-run Task 1's file — still green.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/model-profiles/profiles.js bin/lib/model-profiles/tests/resolve.test.js
git diff --cached --name-only
git commit -m "Add pure resolve() — six-stage override pipeline with named sources — refs #216"
```

---

### Task 3: Policy fragment parser

**Files:**
- Create: `bin/lib/model-profiles/policy-fragment.js`
- Create: `bin/lib/model-profiles/tests/policy-fragment.test.js`

**Interfaces:**
- Consumes: Task 1's `POLICY_KEYS_READ` (for the comment only; the parser hardcodes nothing else from it).
- Produces: `parsePolicyModelConfig(raw)` → object with only the keys present among `model-stance` (string), `model-ceiling` (string), `frontier-run-cap` (integer), `model-profiles` (nested object `{profileName: {model?, effort?}}`). Throws `Error` naming the line on malformed input (non-integer cap; a `model-profiles` child key with no indented `model:`/`effort:` lines and no recognized sub-key). Task 4's CLI consumes this.

Supported policy.yml shape for the nested key (two-level indentation, 2 spaces per level — matching how `.claude-tweaks/policy.yml` files in this ecosystem are hand-written):

```yaml
model-stance: economy
model-ceiling: capable
frontier-run-cap: 5
model-profiles:
  standard:
    model: opus
    effort: low
  capable:
    effort: medium
```

- [ ] **Step 1: Write the failing tests**

```js
// bin/lib/model-profiles/tests/policy-fragment.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parsePolicyModelConfig } = require('../policy-fragment');

const SAMPLE = [
  'worktree.always: true',
  'model-stance: economy',
  'model-ceiling: capable',
  'frontier-run-cap: 5',
  'model-profiles:',
  '  standard:',
  '    model: opus',
  '    effort: low',
  '  capable:',
  '    effort: medium',
  '',
].join('\n');

test('parses the four keys and ignores unrelated flat keys', () => {
  assert.deepStrictEqual(parsePolicyModelConfig(SAMPLE), {
    'model-stance': 'economy',
    'model-ceiling': 'capable',
    'frontier-run-cap': 5,
    'model-profiles': {
      standard: { model: 'opus', effort: 'low' },
      capable: { effort: 'medium' },
    },
  });
});

test('empty or absent input yields an empty object', () => {
  assert.deepStrictEqual(parsePolicyModelConfig(''), {});
  assert.deepStrictEqual(parsePolicyModelConfig('worktree.always: true\n'), {});
});

test('comments and trailing whitespace are tolerated', () => {
  const raw = 'model-stance: economy   # save money\n';
  assert.deepStrictEqual(parsePolicyModelConfig(raw), { 'model-stance': 'economy' });
});

test('non-integer frontier-run-cap throws naming the value', () => {
  assert.throws(() => parsePolicyModelConfig('frontier-run-cap: soon\n'), /soon/);
});

test('unknown sub-key under a model-profiles row throws naming the line', () => {
  const raw = 'model-profiles:\n  standard:\n    speed: fast\n';
  assert.throws(() => parsePolicyModelConfig(raw), /speed/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/model-profiles/tests/policy-fragment.test.js`
Expected: FAIL with `Cannot find module '../policy-fragment'`

- [ ] **Step 3: Implement the parser**

```js
// bin/lib/model-profiles/policy-fragment.js
//
// Minimal hand-rolled reader for the resolver's four policy.yml keys
// (POLICY_KEYS_READ in ./profiles.js). bin/lib/policy-schema.js's
// parseFlatLines is deliberately flat-only; the nested model-profiles map
// needs this dedicated reader. No YAML library — the plugin ships zero
// runtime npm deps.
'use strict';

function stripComment(line) {
  const hash = line.indexOf('#');
  return (hash === -1 ? line : line.slice(0, hash)).trimEnd();
}

function parsePolicyModelConfig(raw) {
  const out = {};
  if (!raw) return out;
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = stripComment(lines[i]);
    if (!line.trim() || line.startsWith(' ')) continue;
    const m = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, key, value] = m;
    if (key === 'model-stance' || key === 'model-ceiling') {
      out[key] = value.trim();
    } else if (key === 'frontier-run-cap') {
      const n = Number.parseInt(value.trim(), 10);
      if (Number.isNaN(n) || String(n) !== value.trim()) {
        throw new Error(`frontier-run-cap must be an integer, got "${value.trim()}"`);
      }
      out[key] = n;
    } else if (key === 'model-profiles') {
      const map = {};
      let profile = null;
      let j = i + 1;
      for (; j < lines.length; j += 1) {
        const sub = stripComment(lines[j]);
        if (!sub.trim()) continue;
        const rowM = /^ {2}([A-Za-z-]+):\s*$/.exec(sub);
        const fieldM = /^ {4}(model|effort):\s*(\S+)$/.exec(sub);
        const badField = /^ {4}([A-Za-z-]+):/.exec(sub);
        if (rowM) { profile = rowM[1]; map[profile] = {}; continue; }
        if (fieldM && profile) { map[profile][fieldM[1]] = fieldM[2]; continue; }
        if (badField && profile) {
          throw new Error(`model-profiles.${profile}: unknown field "${badField[1]}" (only model/effort)`);
        }
        break; // dedent — nested block ended
      }
      i = j - 1;
      out[key] = map;
    }
  }
  return out;
}

module.exports = { parsePolicyModelConfig };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/model-profiles/tests/policy-fragment.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/model-profiles/policy-fragment.js bin/lib/model-profiles/tests/policy-fragment.test.js
git diff --cached --name-only
git commit -m "Add policy-fragment parser — the resolver's four keys incl. nested model-profiles — refs #216"
```

---

### Task 4: CLI wrapper with frontier tally

**Files:**
- Create: `bin/resolve-profile.js`
- Create: `bin/lib/model-profiles/tests/cli.test.js`

**Interfaces:**
- Consumes: Task 2's `resolve`, Task 3's `parsePolicyModelConfig`.
- Produces: the CLI contract every dispatch site cites: `node bin/resolve-profile.js <profile> [--stance <s>] [--unattended] [--run-dir <path>]` — reads `.claude-tweaks/policy.yml` under `process.cwd()` (missing file → empty policy; unreadable/malformed → exit 1), prints the resolution JSON to stdout, exit 0. With `--run-dir`: `frontierUsed` = count of lines starting `frontier\t` in `{run-dir}/frontier-tally.log` (missing file → 0); when the final resolution's model is `fable`, appends `frontier\t{new Date().toISOString()}\n` to that file. Unknown profile/stance/flag → exit 1, error message on stderr naming the problem.

- [ ] **Step 1: Write the failing tests**

```js
// bin/lib/model-profiles/tests/cli.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CLI = path.join(__dirname, '..', '..', '..', 'resolve-profile.js');

function run(args, cwd) {
  return JSON.parse(execFileSync('node', [CLI, ...args], { cwd, encoding: 'utf8' }));
}

function tmpProject(policyText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-cli-'));
  if (policyText !== null) {
    fs.mkdirSync(path.join(dir, '.claude-tweaks'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude-tweaks', 'policy.yml'), policyText);
  }
  return dir;
}

test('resolves from the table when no policy file exists', () => {
  const dir = tmpProject(null);
  assert.deepStrictEqual(run(['standard'], dir), {
    model: 'sonnet', effort: 'high', source: 'default',
    effortLine: '[Effort: high — apply high-level reasoning depth to this task.]',
  });
});

test('reads policy.yml from cwd and applies rows and stance', () => {
  const dir = tmpProject('model-profiles:\n  standard:\n    model: opus\n    effort: low\n');
  assert.strictEqual(run(['standard'], dir).model, 'opus');
  assert.strictEqual(run(['standard', '--stance', 'economy'], dir).effort, 'low'); // already at floor
});

test('frontier tally: counts prior lines, appends on frontier result only', () => {
  const dir = tmpProject(null);
  const runDir = path.join(dir, 'run');
  fs.mkdirSync(runDir);
  const tally = path.join(runDir, 'frontier-tally.log');
  const first = run(['frontier', '--run-dir', runDir], dir);
  assert.strictEqual(first.model, 'fable');
  assert.strictEqual(fs.readFileSync(tally, 'utf8').split('\n').filter(Boolean).length, 1);
  run(['frontier', '--run-dir', runDir], dir);
  run(['frontier', '--run-dir', runDir], dir);
  // fourth resolution hits the default cap of 3 → degraded, no new line
  const fourth = run(['frontier', '--run-dir', runDir], dir);
  assert.strictEqual(fourth.source, 'degraded:cap');
  assert.strictEqual(fs.readFileSync(tally, 'utf8').split('\n').filter(Boolean).length, 3);
});

test('--unattended degrades frontier and appends nothing', () => {
  const dir = tmpProject(null);
  const runDir = path.join(dir, 'run');
  fs.mkdirSync(runDir);
  const r = run(['frontier', '--unattended', '--run-dir', runDir], dir);
  assert.strictEqual(r.source, 'degraded:unattended');
  assert.ok(!fs.existsSync(path.join(runDir, 'frontier-tally.log')));
});

test('unknown profile exits non-zero naming it', () => {
  const dir = tmpProject(null);
  assert.throws(
    () => execFileSync('node', [CLI, 'turbo'], { cwd: dir, encoding: 'utf8' }),
    (e) => /turbo/.test(String(e.stderr)),
  );
});

test('malformed policy exits non-zero naming the problem', () => {
  const dir = tmpProject('frontier-run-cap: soon\n');
  assert.throws(
    () => execFileSync('node', [CLI, 'standard'], { cwd: dir, encoding: 'utf8' }),
    (e) => /soon/.test(String(e.stderr)),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/model-profiles/tests/cli.test.js`
Expected: FAIL — `bin/resolve-profile.js` does not exist (`ENOENT`/module error surfaces in stderr).

- [ ] **Step 3: Implement the CLI**

```js
#!/usr/bin/env node
// bin/resolve-profile.js
//
// CLI wrapper around bin/lib/model-profiles — owns ALL I/O (policy read,
// frontier tally read/append). resolve() itself stays pure. Contract cited
// by dispatch sites: skills/_shared/subagent-output-contract.md §Model
// Selection.
'use strict';
const fs = require('fs');
const path = require('path');
const { resolve } = require('./lib/model-profiles/profiles');
const { parsePolicyModelConfig } = require('./lib/model-profiles/policy-fragment');

function fail(msg) {
  process.stderr.write(`resolve-profile: ${msg}\n`);
  process.exit(1);
}

function main(argv) {
  const args = argv.slice(2);
  const profile = args.shift();
  if (!profile) fail('usage: resolve-profile.js <profile> [--stance <s>] [--unattended] [--run-dir <path>]');
  let stance;
  let unattended = false;
  let runDir;
  while (args.length) {
    const a = args.shift();
    if (a === '--stance') stance = args.shift();
    else if (a === '--unattended') unattended = true;
    else if (a === '--run-dir') runDir = args.shift();
    else fail(`unknown argument "${a}"`);
  }

  let policy = {};
  const policyPath = path.join(process.cwd(), '.claude-tweaks', 'policy.yml');
  if (fs.existsSync(policyPath)) {
    try {
      policy = parsePolicyModelConfig(fs.readFileSync(policyPath, 'utf8'));
    } catch (e) {
      fail(`malformed ${policyPath}: ${e.message}`);
    }
  }

  let frontierUsed = 0;
  const tallyPath = runDir ? path.join(runDir, 'frontier-tally.log') : null;
  if (tallyPath && fs.existsSync(tallyPath)) {
    frontierUsed = fs.readFileSync(tallyPath, 'utf8')
      .split('\n').filter((l) => l.startsWith('frontier\t')).length;
  }

  let result;
  try {
    result = resolve(profile, { policy, stance, unattended, frontierUsed });
  } catch (e) {
    fail(e.message);
  }

  if (tallyPath && result.model === 'fable') {
    fs.appendFileSync(tallyPath, `frontier\t${new Date().toISOString()}\n`);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main(process.argv);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/model-profiles/tests/cli.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/resolve-profile.js bin/lib/model-profiles/tests/cli.test.js
git diff --cached --name-only
git commit -m "Add resolve-profile CLI — policy read, frontier tally, fail-loud exits — refs #216"
```

---

### Task 5: Rewrite the contract's Model Selection section

**Files:**
- Modify: `skills/_shared/subagent-output-contract.md:85-97` (the `## Model Selection` section — currently the 13 lines from the `## Model Selection` heading through the `When dispatching, name the tier...` paragraph, ending just before `## Template A — Review-style (returns findings)`)

**Interfaces:**
- Consumes: Task 1's table values and effortLine template, Task 4's CLI grammar (the prose cites both verbatim).
- Produces: the contract text Task 6's pinning test parses. The literal table below is load-bearing — Task 6 parses its rows.

- [ ] **Step 1: Replace the section**

Replace everything from the `## Model Selection` heading up to (not including) the `## Template A` heading with exactly:

```markdown
## Model Selection

Match the profile to the work. A **work profile** names the kind of work; this table — the single canonical resolution — says what runs it:

| Profile | Model | Effort | Constraints |
|---|---|---|---|
| Fast | haiku | — | No effort dial (Haiku ignores effort) |
| Standard | sonnet | high | — |
| Capable | opus | high | — |
| Frontier | fable | high | Singleton-only; degrades to Capable |

This table is pinned to `bin/lib/model-profiles/profiles.js` by test — change them together. Models are family aliases, never versioned IDs. The effort scale is ordered `low < medium < high < xhigh < max`.

**Dispatching.** Name the profile in the prompt as `[Use: {Profile}]`, and resolve it mechanically: run `node bin/resolve-profile.js {profile}` from the checkout root (add `--run-dir "$PIPELINE_RUN_DIR"` inside a pipeline, `--unattended` in any headless context) and copy the returned `model` into the Agent tool's `model` parameter. Append the returned `effortLine` to the dispatch prompt. (`${CLAUDE_PLUGIN_ROOT}` is not reliably set in Bash tool calls — #170 tracks it; the repo-local invocation above is the documented form.) Effort binds mechanically only where an agent definition carries `effort:` frontmatter — the Agent tool has no per-dispatch effort parameter, so `effortLine` is a best-effort prompt instruction. Upstream watch item: adopt a per-dispatch effort parameter the release it exists.

**Overrides.** The resolver merges, in precedence order: CLI/per-invocation override > run stance > project policy (`model-profiles`, `model-stance`, `model-ceiling`, `frontier-run-cap` in `.claude-tweaks/policy.yml`) > the table. Stances shift effort, never the model upward: `economy` drops one notch and resolves Frontier as Capable; `max-rigor` raises one notch capped at `max`. `CLAUDE_CODE_SUBAGENT_MODEL` and the session's `/model`/`/effort` are harness-level and always win — the plugin defers to them.

**Selection and upgrade.** Default to the cheapest profile that can do the job. Upgrade one profile when the agent comes back `BLOCKED` for reasoning reasons (not for context reasons). Capable→Frontier upgrades are valid only at the singleton slots enumerated in this section.

**Frontier is singleton-only.** Profiles govern *dispatches*; inline steps ride the session model by design. Frontier is never valid in a parallel fan-out — one agent whose judgment is the bottleneck, at an enumerated slot only. Preconditions (all enforced by the resolver): interactive context, stance at `default` or above, and the per-run cap (`frontier-run-cap`, default 3, tallied in the run dir's `frontier-tally.log`; standalone skill invocations get 1 per invocation, enforced by the calling skill). Any miss degrades to Capable with the reason in the resolution's `source`. Best-effort rule: a harness usage-limit warning observed in-session degrades Frontier to Capable for the remainder of the run — best-effort, no mechanism claimed.

**Session-inherit protection.** No fresh-agent dispatch omits `model` — inheriting the session model is only ever an explicit, stated choice (`[Use: inherit — {reason}]`), never a silent default; this is what makes running a session on Fable or Opus safe. Fork dispatches are exempt (the Agent tool ignores a fork's `model` override structurally; fork usage is already restricted — see the incident-log rule on forks). Every agent definition under `agents/` must declare `model:` in its frontmatter.
```

- [ ] **Step 2: Update the inherited-context sizing rule**

In the same file's Input Discipline section, locate the paragraph beginning `**Inherited project context is the dominant per-agent cost.**` and append this sentence to it: `Sonnet 5's tokenizer emits roughly 30% more tokens for the same text than its predecessor, so the inherited payload's cost rose with it — the lever is unchanged: keep CLAUDE.md lean.`

- [ ] **Step 3: Verify the section renders correctly**

Run: `grep -n "## Model Selection" skills/_shared/subagent-output-contract.md` and read the 10 lines around the boundary with `## Template A` to confirm no stray text landed inside a fence or split a paragraph (IL-27).
Expected: clean section boundaries; the old `(Haiku)`/`(Sonnet)`/`(Opus)` parentheticals and `[Use: Fast model — ...]` sentence are gone from this section.

- [ ] **Step 4: Commit**

```bash
git add skills/_shared/subagent-output-contract.md
git diff --cached --name-only
git commit -m "Rewrite contract Model Selection — work-profile table, resolver mechanics, Frontier rules, inherit protection — refs #216"
```

---

### Task 6: Table-pinning and effortLine-pinning test

**Files:**
- Create: `bin/lib/model-profiles/tests/table-pinning.test.js`

**Interfaces:**
- Consumes: Task 1's `PROFILES`/`effortLine`, Task 5's contract text.
- Produces: the drift guard. This test deliberately reads live prose (IL-80 exception, same as `tests/hooks-gate-coverage.test.js` — the update IS the intended action when the table changes).

- [ ] **Step 1: Write the test**

```js
// bin/lib/model-profiles/tests/table-pinning.test.js
//
// Pins the contract's Model Selection table to PROFILES, the GATE_COVERAGE
// precedent. Reads live prose deliberately (IL-80 exception): the coverage
// table is a declared contract whose update IS the intended action.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { PROFILES, effortLine } = require('../profiles');

const CONTRACT = path.join(__dirname, '..', '..', '..', '..', 'skills', '_shared', 'subagent-output-contract.md');

function modelSelectionSection() {
  const text = fs.readFileSync(CONTRACT, 'utf8');
  const start = text.indexOf('## Model Selection');
  assert.ok(start !== -1, 'contract must contain a ## Model Selection section');
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end === -1 ? undefined : end);
}

function tableRows(section) {
  return section.split('\n')
    .filter((l) => /^\| (Fast|Standard|Capable|Frontier) \|/.test(l))
    .map((l) => l.split('|').map((c) => c.trim()).filter(Boolean));
}

test('the contract table rows match PROFILES exactly', () => {
  const rows = tableRows(modelSelectionSection());
  assert.strictEqual(rows.length, 4, 'exactly four profile rows');
  for (const [name, model, effort] of rows) {
    const key = name.toLowerCase();
    assert.ok(PROFILES[key], `row "${name}" has a PROFILES entry`);
    assert.strictEqual(model, PROFILES[key].model, `${name}: model`);
    assert.strictEqual(effort === '—' ? null : effort, PROFILES[key].effort, `${name}: effort`);
  }
});

test('the Frontier row states its constraints', () => {
  const rows = tableRows(modelSelectionSection());
  const frontier = rows.find((r) => r[0] === 'Frontier');
  assert.match(frontier[3], /Singleton-only/);
  assert.match(frontier[3], /degrades to Capable/i);
});

test('the section cites the resolver CLI and the effortLine template shape', () => {
  const section = modelSelectionSection();
  assert.match(section, /node bin\/resolve-profile\.js/);
  assert.match(section, /\[Use: \{Profile\}\]/);
  // effortLine's rendered form for high must be derivable from the pinned template
  assert.strictEqual(effortLine('high'), '[Effort: high — apply high-level reasoning depth to this task.]');
});
```

- [ ] **Step 2: Run the test — it must pass, then prove it can fail (IL-105)**

Run: `node --test bin/lib/model-profiles/tests/table-pinning.test.js` → Expected: PASS.
Then, one claim at a time, in a scratch copy of the contract (`cp` the file, point `CONTRACT` at the copy temporarily or edit and revert): (a) change the Standard row's model to `opus` → run → must FAIL on `Standard: model`; (b) delete the Frontier row → must FAIL on the four-rows assertion; (c) remove the `node bin/resolve-profile.js` citation → must FAIL on the CLI-citation match. Revert every negation; run once more → PASS. Record in the commit message that the negation drill was run.

- [ ] **Step 3: Run the full suite**

Run: `npm test > /tmp/npm-test-216.log 2>&1; tail -5 /tmp/npm-test-216.log`
Expected: all suites green (prior 2510 + the new module's tests).

- [ ] **Step 4: Commit**

```bash
git add bin/lib/model-profiles/tests/table-pinning.test.js
git diff --cached --name-only
git commit -m "Pin the contract profile table to PROFILES — negation drill run per IL-105 — refs #216"
```

---

### Task 7: CLAUDE.md contract paragraph

**Files:**
- Modify: `CLAUDE.md` (two spots inside `### Subagent Contract (v4.2+)` and the Conventions bullet above it)

**Interfaces:**
- Consumes: Task 5's vocabulary.
- Produces: nothing downstream; doc-sync only.

- [ ] **Step 1: Update the two tier sentences**

In `CLAUDE.md`, exactly two lines restate the tier vocabulary (verify with `grep -n "Fast | Standard | Capable" CLAUDE.md` — expect 2 hits, in the Parallel-execution-directives section and the Subagent Contract section):

1. `Each dispatch picks a model tier (\`Fast | Standard | Capable\`); default to the cheapest that fits the work.` → `Each dispatch picks a work profile (\`Fast | Standard | Capable | Frontier\`) resolved via \`bin/resolve-profile.js\`; default to the cheapest that fits the work.`
2. `**model tier selection** (\`Fast | Standard | Capable\`) appropriate to the work` → `**model profile selection** (\`Fast | Standard | Capable | Frontier\`, resolved per the contract's Model Selection section) appropriate to the work`

- [ ] **Step 2: Verify no other CLAUDE.md line restates the old triple**

Run: `grep -cn "Fast | Standard | Capable\b" CLAUDE.md` — after the edit, every remaining hit (if any) must be the new four-value form; a hit showing the old three-value form without `Frontier` is a missed restatement — fix it.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git diff --cached --name-only
git commit -m "Update CLAUDE.md contract paragraphs to work-profile vocabulary — refs #216"
```

---

## Self-Review

Ran against the spec (216-spec.md) after drafting:

1. **Spec coverage:** table+scale+grammar+stances+upgrade+inherit+fork-exemption+dispatch-scope note+usage-warning rule+tokenizer sentence → Task 5; profiles.js exports incl. `POLICY_KEYS_READ` → Task 1; pipeline order incl. partial-row merge, ceiling-not-over-cli, frontier gates → Task 2; CLI + tally format + fail-loud → Tasks 3-4; pinning + IL-105 drill → Task 6; package.json glob → Task 1; CLAUDE.md → Task 7. AC1-8 each map to a test or verification step.
2. **Placeholder scan:** none.
3. **Type consistency:** `resolve` signature identical in Tasks 2 and 4; `parsePolicyModelConfig` name identical in Tasks 3 and 4; `PROFILES` field names (`singletonOnly`, `degradeTo`) consistent between Tasks 1 and 6 (the pinning test checks constraints via prose substrings, not those field names — deliberate, since the markdown row carries prose).
