# Policy Schema Metadata + resolve-policy --all (record #533) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every `POLICY_KEYS` row gains `summary`/`category`/`tier` metadata pinned complete by a new test, and `resolve-policy.js` gains `--all` emitting every key's envelope + metadata in one JSON object.

**Architecture:** Test-first: the completeness/pin test lands red, then the `.md` contract section, then the metadata authoring turns it green, then `--all` reuses the resolver's existing loop. No resolution-semantics changes.

**Tech Stack:** Plain Node, `node --test`, zero runtime deps.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T074746-spec-533-534-536/spec-533/work/533-spec.md`

## Global Constraints

- Verified at plan time: `POLICY_KEYS` has **47 rows** (`bin/lib/policy-schema.js:12-117`); #519 added no lever (it flipped `tidy-aggressiveness`'s default to `moderate` — already in the shipped row). The prose rule still holds: never write "47" into the `.md` ("every key", not a literal count); the core ≤ 12 cap is the one deliberate numeric exception.
- `POLICY_CATEGORIES = ['autonomy-trust', 'pipeline-behavior', 'merge-safety', 'health-sweeps', 'models', 'housekeeping']` — the spec's working list, confirmed sufficient against the actual sections (nothing fits none of them).
- Summaries: user language, behavioral consequence, ≤ ~120 chars target / 140 hard test ceiling, never containing the row's own key string verbatim, no implementation citations, no "controls whether".
- `resolveValue`, `--run` overlay, `RENAMED_KEYS`, `--values` semantics untouched. `fail()` is the error path for both `--all` conflict cases.
- `model-profiles` under `--all`: its existing carve-out envelope (`{value: null|parsed, source}`) + metadata + `type: "map"`, `default: null`. `integration-model` under `--all`: keep the CLI's existing computed-default block (forge detection when `source: default` and not invalid).
- The `.md` metadata contract section describes fields + mapping, never per-key values — the new test's no-duplication assertion enforces this from now on.
- **Tier assignments and per-key categories are locked in Task 3's tables** — the implementer transcribes them, not re-derives them. Core is exactly 12 keys (at the cap).
- File-size note: `skills/_shared/policy-schema.md` is a lazy-loaded sub-file subject to the 40,960-byte ceiling test — check `wc -c` before/after Task 2 (measured headroom must fit the ~2.2KB section; if it does not, flag BLOCKED rather than trimming unrelated content).

---

### Task 1: Write the failing metadata pin test

**Files:**
- Create: `tests/policy-schema-metadata.test.js`

**Interfaces:**
- Consumes: `POLICY_KEYS`, `POLICY_CATEGORIES` (Task 3 adds the export — red until then), `skills/_shared/policy-schema.md`'s `## Metadata fields` section (Task 2 adds it).
- Produces: the pin every later task turns green.

- [ ] **Step 1: Write the test file**

```js
'use strict';
// tests/policy-schema-metadata.test.js — pins the human-facing metadata
// contract on POLICY_KEYS (summary/category/tier) and its prose twin in
// skills/_shared/policy-schema.md. Same prose<->constant pattern as
// tests/hooks-gate-coverage.test.js.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { POLICY_KEYS, POLICY_CATEGORIES } = require('../bin/lib/policy-schema');

const MD_PATH = path.join(__dirname, '..', 'skills', '_shared', 'policy-schema.md');
const md = fs.readFileSync(MD_PATH, 'utf8');

test('every POLICY_KEYS row carries summary, category, and tier', () => {
  for (const row of POLICY_KEYS) {
    assert.strictEqual(typeof row.summary, 'string', `${row.key}: summary missing`);
    assert.ok(row.summary.trim().length > 0, `${row.key}: summary empty`);
    assert.ok(row.summary.length <= 140, `${row.key}: summary is ${row.summary.length} chars (> 140 ceiling)`);
    assert.ok(!row.summary.includes(row.key), `${row.key}: summary contains its own key verbatim`);
    assert.ok(POLICY_CATEGORIES.includes(row.category), `${row.key}: category "${row.category}" not in POLICY_CATEGORIES`);
    assert.ok(['core', 'advanced'].includes(row.tier), `${row.key}: tier "${row.tier}" invalid`);
  }
});

test('core tier count stays at or under the enforced cap of 12', () => {
  const core = POLICY_KEYS.filter((row) => row.tier === 'core').map((row) => row.key);
  assert.ok(core.length <= 12, `core tier has ${core.length} keys (cap 12): ${core.join(', ')}`);
});

test('POLICY_CATEGORIES matches the mapping table in policy-schema.md', () => {
  const start = md.indexOf('## Metadata fields');
  assert.notStrictEqual(start, -1, 'policy-schema.md has no "## Metadata fields" section');
  const next = md.indexOf('\n## ', start + 1);
  const section = md.slice(start, next === -1 ? md.length : next);
  const tableCategories = new Set();
  for (const match of section.matchAll(/^\|[^|]+\|\s*`([a-z-]+)`\s*\|$/gm)) {
    tableCategories.add(match[1]);
  }
  assert.ok(tableCategories.size > 0, 'no section-to-category mapping rows found under "## Metadata fields"');
  assert.deepStrictEqual([...tableCategories].sort(), [...POLICY_CATEGORIES].sort(),
    'mapping-table category set diverges from POLICY_CATEGORIES');
});

test('no summary string is duplicated verbatim into policy-schema.md', () => {
  for (const row of POLICY_KEYS) {
    assert.ok(!md.includes(row.summary), `${row.key}: summary text appears verbatim in policy-schema.md`);
  }
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --test tests/policy-schema-metadata.test.js`
Expected: FAIL — `POLICY_CATEGORIES` is undefined / rows lack `summary` (this is the red state; do not fix here).

- [ ] **Step 3: Commit**

```bash
git add tests/policy-schema-metadata.test.js
git commit -m "Add failing metadata pin test for POLICY_KEYS summary/category/tier — refs #533"
```

---

### Task 2: Metadata contract section + --all paragraph in `_shared/policy-schema.md`

**Files:**
- Modify: `skills/_shared/policy-schema.md` (new `## Metadata fields` section inserted after the `## resolveValue — canonical coercion contract` section, i.e. before `## Worktree & execution`; one `--all` paragraph appended to the `## Canonical read path` section)

**Interfaces:**
- Produces: the mapping table Task 1's third test parses (row format `| {Section} | \`{category}\` |` — the backticked category must be the row's last cell, matching the test's regex).

- [ ] **Step 1: Append the --all paragraph to `## Canonical read path`**

Add at the end of that section:

```markdown
`--all` emits the whole resolved config in one call: every schema key mapped to its `{value, source}` envelope plus its metadata fields and shape (`summary`, `category`, `tier`, `type`, `default` — `default` is JSON `null` when the row has none, which consumers read as "no default"). It composes with `--run`, takes no key arguments, and is mutually exclusive with `--values`. Renderers (the `/claude-tweaks:help` policy mode, init's policy review) consume this instead of enumerating key names by hand.
```

- [ ] **Step 2: Insert the `## Metadata fields` section**

````markdown
## Metadata fields

Every `POLICY_KEYS` row carries three human-facing fields alongside its shape: `summary`, `category`, and `tier`. `tests/policy-schema-metadata.test.js` pins completeness (a future lever cannot ship metadata-less), the category set against the mapping table below, the core-tier cap, and the no-duplication rule — the same prose↔constant pattern as `tests/hooks-gate-coverage.test.js`.

- **`summary`** — one plain-language sentence stating *what changes when you move this lever* (style target ≤ ~120 chars; hard test ceiling 140). It never restates the key name or type, and carries no implementation citations. This is a different altitude from each key's Meaning column in the sections below: the summary is for a project owner scanning their config; the Meaning prose is the deep contract for skill authors. Neither replaces the other, and no summary text may be duplicated into this file (test-enforced).
- **`category`** — one of the values in `POLICY_CATEGORIES` (exported beside `POLICY_KEYS`). The mapping below assigns every key-bearing section of this file to a category; it is many-sections-to-one-category, and a key may individually carry a different category than its section when its subject genuinely differs (the section mapping is orientation, the per-key field is truth).
- **`tier`** — `core` or `advanced`. Decision rule: `core` = levers that change what the pipeline may *do without a human* — enforcement gates, autonomy/trust posture, merge/execution defaults, integration identity. Tuning caps, thresholds, retention, and cosmetic/reporting knobs are `advanced`. The core tier is capped at 12 keys (enforced, not advisory).

| Section | Category |
|---------|----------|
| Worktree & execution | `pipeline-behavior` |
| Integration model | `merge-safety` |
| Project facts | `autonomy-trust` |
| Dispatch & merge | `merge-safety` |
| Review | `pipeline-behavior` |
| Documentation | `housekeeping` |
| Harness-health budgets | `health-sweeps` |
| Health-sweep filing | `health-sweeps` |
| Code-health focus verticals | `health-sweeps` |
| Auto-mode levers | `pipeline-behavior` |
| Model profiles | `models` |
| Additional levers | `housekeeping` |
````

- [ ] **Step 3: Verify size and shape**

Run: `wc -c skills/_shared/policy-schema.md`
Expected: ≤ 40,950 (flag BLOCKED if over — do not trim unrelated content)

Run: `grep -c "## Metadata fields" skills/_shared/policy-schema.md`
Expected: `1`

- [ ] **Step 4: Commit**

```bash
git add skills/_shared/policy-schema.md
git commit -m "Add metadata-fields contract section and --all documentation to policy-schema.md — refs #533"
```

---

### Task 3: Author the metadata on every row + POLICY_CATEGORIES export

**Files:**
- Modify: `bin/lib/policy-schema.js` (three fields per row, `POLICY_CATEGORIES` const + export)

**Interfaces:**
- Produces: `POLICY_CATEGORIES: string[]` export; `summary`/`category`/`tier` on all 47 rows. Turns Task 1's test green.

- [ ] **Step 1: Add the categories constant + export**

```js
const POLICY_CATEGORIES = ['autonomy-trust', 'pipeline-behavior', 'merge-safety', 'health-sweeps', 'models', 'housekeeping'];
```
Add `POLICY_CATEGORIES` to `module.exports`.

- [ ] **Step 2: Add the three fields to every row — tier and category transcribed from these locked tables**

**Core tier (exactly these 12; everything else `advanced`):** `worktree.always`, `execution-strategy`, `git-strategy`, `project.maturity`, `integration-model`, `autonomy`, `grant-origination-enabled`, `risk-floor`, `size-floor`, `housekeeping-auto-merge`, `automerge-max-lines`, `automerge-max-files`.

**Per-key category:**
- `autonomy-trust`: `autonomy`, `trust-revert-window-days`, `grant-origination-enabled`, `fleet-daily-grant-cap`, `risk-floor`, `size-floor`
- `merge-safety`: `integration-model`, `integration-branch`, `dispatch-retry-ceiling`, `dispatch-batch-size`, `dispatch-pick-max-concurrent`, `automerge-max-lines`, `automerge-max-files`, `merge-sensitive-paths`, `pr-unarmed-age-hours`, `unsettled-age-hours`, `housekeeping-auto-merge`
- `models`: `model-stance`, `frontier-run-cap`, `model-ceiling`, `model-profiles`
- `health-sweeps`: `harness-health.scoped-rule-budget`, `harness-health.always-loaded-budget`, `health-open-cap`, `experiment-flag-patterns`, `experiment-flag-exclude`
- `housekeeping`: `doc-convention.adr`, `depth-survey`, `creative-survey`, `backlog-fetch-limit`, `work-links`, `superpowers-plans-retention`
- `pipeline-behavior`: everything else (`worktree.always`, `execution-strategy`, `git-strategy`, `project.maturity`, `auto-mode`, `scope-creep`, `overlap`, `design-intent`, `leftover-default`, `auto-fix-threshold`, `review-severity-floor`, `tidy-aggressiveness`, `review-effort-floor`, `scope-keywords-required`, `branch-divergence-check`, `research-mode`)

**Summaries — author per the Global Constraints rules.** Worked examples to match in register (note none contains its own key string):

- `worktree.always`: `Every covered edit and commit must happen inside a linked worktree — the hook denies it elsewhere.`
- `autonomy`: `Caps how much the pipeline may do without a human — trust that classes earn can never exceed this ceiling.`
- `automerge-max-lines`: `Bounds how large a diff an unattended merge will accept before a human is required — a weighted guideline, not a hard cutoff.`
- `backlog-fetch-limit`: `Caps how many backlog issues one scan pulls before warning that the list was truncated.`
- `tidy-aggressiveness`: `Sets how boldly cleanup sweeps act on what they find — from keep-unless-certain to delete-unless-doubtful.`
- `model-stance`: `Shifts every dispatched agent's reasoning effort one notch cheaper or more rigorous, without changing which model tier is chosen.`
- `risk-floor`: `The risk tier at which machine-originated grants and demo fast-paths stop and require human review.`
- `integration-model`: `Whether finished work lands through GitHub pull requests or by local merges into the integration branch.`

Watch two mechanical traps: a summary must not contain the row's own key string even as a substring (e.g. the `overlap` summary cannot use the word "overlap"), and dot-namespaced keys (`worktree.always`, `project.maturity`, `harness-health.*`, `doc-convention.adr`) likewise cannot embed their literal dotted names.

- [ ] **Step 3: Run the pin test — green**

Run: `node --test tests/policy-schema-metadata.test.js`
Expected: PASS (all 4 subtests)

- [ ] **Step 4: Run neighbors to catch regressions**

Run: `node --test tests/policy-schema.test.js tests/resolve-policy-lib.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add bin/lib/policy-schema.js
git commit -m "Author summary/category/tier metadata on every POLICY_KEYS row — refs #533"
```

---

### Task 4: `--all` flag on resolve-policy.js + CLI tests

**Files:**
- Modify: `bin/resolve-policy.js`
- Modify: `tests/resolve-policy-cli.test.js` (append `--all` cases, following that file's existing invocation style)

**Interfaces:**
- Consumes: `POLICY_KEYS` (add to the existing require from `./lib/policy-schema`).
- Produces: `--all [--run <dir>]` → `{ [key]: {value, source, summary, category, tier, type, default} }`.

- [ ] **Step 1: Write the failing CLI tests**

Append to `tests/resolve-policy-cli.test.js`, following its existing exec/temp-dir patterns:
1. `--all` exits 0; output parses as JSON; its key set deep-equals `POLICY_KEYS.map(r => r.key)` sorted; every entry has all seven fields; `model-profiles` entry has `type: 'map'`, `default: null`; `default` is `null` exactly for the rows with no schema `default`.
2. `--all --values` exits non-zero, stderr contains `resolve-policy:`.
3. `--all some-key` exits non-zero, stderr contains `resolve-policy:`.
4. `--all --run <fixture-dir>` where the fixture `config.yml` sets `scope-creep: drop` → entry is `{value: 'drop', source: 'run-config', ...}` (reuse/extend the file's existing run-dir fixture helper if one exists).
5. Spot-check: `--all`'s `scope-creep` entry's `{value, source}` deep-equals the entry from a plain `resolve-policy.js scope-creep` invocation in the same fixture state.

Run: `node --test tests/resolve-policy-cli.test.js`
Expected: FAIL on the new cases (flag unknown → treated as a key today).

- [ ] **Step 2: Implement `--all`**

In `main()`'s arg loop add `else if (arg === '--all') { allMode = true; }` (declare `let allMode = false`). After the loop, before the zero-keys check:

```js
if (allMode && valuesMode) {
  fail('--all and --values are mutually exclusive — --all always emits the JSON object');
  return;
}
if (allMode && keys.length > 0) {
  fail('--all takes no key arguments — it already emits every schema key');
  return;
}
if (allMode) keys.push(...POLICY_KEYS.map((row) => row.key));
```

The zero-keys usage check then never fires under `--all`; update the usage string to `[--values | --all] [--run <dir>] <key> [<key>…]`. The existing pipeline (resolvePolicyKeys → integration-model computed default → model-profiles fragment reader) runs unchanged since `keys` now simply contains every schema key. Before printing, when `allMode`, decorate:

```js
if (allMode) {
  const decorated = {};
  for (const row of POLICY_KEYS) {
    decorated[row.key] = {
      ...result[row.key],
      summary: row.summary,
      category: row.category,
      tier: row.tier,
      type: row.type,
      default: row.default ?? null,
    };
  }
  process.stdout.write(`${JSON.stringify(decorated)}\n`);
  return;
}
```

- [ ] **Step 3: Run the CLI tests — green**

Run: `node --test tests/resolve-policy-cli.test.js`
Expected: PASS (existing + new cases)

- [ ] **Step 4: Manual AC-2/AC-3 spot check**

Run: `node bin/resolve-policy.js --all` → exit 0, valid JSON.
Run: `node bin/resolve-policy.js --all --values` → exit 1, one-line stderr.
Run: `node bin/resolve-policy.js --all scope-creep` → exit 1, one-line stderr.

- [ ] **Step 5: Commit**

```bash
git add bin/resolve-policy.js tests/resolve-policy-cli.test.js
git commit -m "Add --all mode to resolve-policy.js with metadata-decorated envelopes — refs #533"
```

---

### Task 5: Discrimination checks and full-suite verification

**Files:**
- Read-only mutations (each reverted): `bin/lib/policy-schema.js`, `skills/_shared/policy-schema.md`

- [ ] **Step 1: Verify the pin test discriminates (AC 1) — mutate, observe failure, revert**

Three checks, each: apply the mutation, run `node --test tests/policy-schema-metadata.test.js`, confirm FAIL, revert with `git checkout -- <file>` (expect the harness's "modified externally" reminder after checkout — it is the revert's own side effect, not real signal):
1. Delete one row's `summary` field in `bin/lib/policy-schema.js` → FAIL.
2. Re-tier one `advanced` key to `core` (pushing the count to 13) → FAIL.
3. Edit one category name in the `.md` mapping table (e.g. `models` → `modelz`) → FAIL.

After all three reverts: `git status --porcelain` → clean; run the pin test once more → PASS.

- [ ] **Step 2: Full suite (AC 5)**

Run: `npm test > /tmp/npm-test-533.log 2>&1; tail -10 /tmp/npm-test-533.log`
Expected: PASS. If failure counts vary run-to-run on identical code, re-run the affected file in isolation before concluding breakage.

- [ ] **Step 3: No commit** (nothing to commit — mutations reverted; note results in the task report)
