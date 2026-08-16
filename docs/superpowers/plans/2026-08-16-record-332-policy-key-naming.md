# Policy Key Naming Convention + Rename Program (#332) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write the policy-key naming convention once, pin it with a test, and rename seven policy keys (six dot→dash / spelling, one misnomer) through the existing `RENAMED_KEYS` alias machinery with recorded removal conditions.

**Architecture:** `bin/lib/policy-schema.js` is schema-as-data — a rename is one `POLICY_KEYS` row renamed plus one `RENAMED_KEYS` alias (identity `migrate`); the resolver already handles `renamed-from` attribution and old+new precedence generically (`resolvePolicyKeys`, `auditPolicy`). Everything else is a documentation entry (`_shared/policy-deprecations.md`) plus a citation sweep of live prose. `worktree.always` is deliberately NOT renamed here — #602 owns it — so the new conformance test carries a `PENDING_RENAMES = ['worktree.always']` allowance.

**Tech Stack:** Node 18+ (`node --test`), zero runtime deps, markdown skill prose.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T122937-spec-332-602-334/spec-332/work/332-spec.md`

## Global Constraints

- Work from the run's shared worktree — verify with `pwd` + `git rev-parse --show-toplevel` before every commit; both must print `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-332-602-334`.
- Commit messages: `{Verb} {what} — {detail}`, imperative, ending with `refs #332` (never `closes`/`fixes` — the PR body carries `Fixes`).
- One plain Bash command per tool call inside the worktree session (no `&&` chains, no heredoc appends to repo files — use the Edit tool for edits, `git add <paths>` then `git commit -m ...` as separate calls).
- Never touch `docs/incident-log.md`, `docs/shipped-versions.tsv`, `docs/superpowers/plans/*` (other than this plan), or anything under `.claude-tweaks/pipelines/**` — those are history/tombstones.
- Never write the placeholder tokens `TBD` / `TODO` into any file.
- Do not run the full `npm test` inside a task; run only the named suites. The controller runs the full suite once after the last task.

## Rename table (single source for every task below)

| Old key | New key | Type / default (unchanged) |
|---|---|---|
| `review-severity-floor` | `review-auto-apply-ceiling` | enum `none`/`low`/`medium`, default `low` |
| `automerge-max-lines` | `auto-merge-max-lines` | integer, default `40` |
| `automerge-max-files` | `auto-merge-max-files` | integer, default `2` |
| `project.maturity` | `project-maturity` | enum, default `greenfield` |
| `harness-health.scoped-rule-budget` | `harness-health-scoped-rule-budget` | integer, default `30` |
| `harness-health.always-loaded-budget` | `harness-health-always-loaded-budget` | integer, default `150` |
| `doc-convention.adr` | `doc-convention-adr` | enum `plugin`/`project`, no default |

---

### Task 1: Schema rename + aliases (test-first)

**Files:**
- Modify: `bin/lib/policy-schema.js:22,37,38,52,53,63,101` (the seven `POLICY_KEYS` rows) and `:134-178` (`RENAMED_KEYS`)
- Modify: `tests/policy-schema.test.js:257-286` (`RENAMED_KEYS names every alias and retirement…`), `:305-311` (integer-invalid fixture uses `automerge-max-lines`), `:375-393` (`doc-convention.adr` enum test)
- Test: `tests/policy-schema.test.js`

**Interfaces:**
- Produces: `POLICY_KEYS` rows keyed by the seven new names (same `type`/`values`/`default`/`summary`/`category`/`tier`); `RENAMED_KEYS` gains seven entries `{ key: '<old>', replacedBy: '<new>', migrate: (value) => value }`. Later tasks and #602 rely on these exact new names.

- [ ] **Step 1: Update the alias-enumeration test to expect the seven new aliases**

In `tests/policy-schema.test.js`, in the test `RENAMED_KEYS names every alias and retirement, each with its migration`, change `assert.strictEqual(RENAMED_KEYS.length, 7);` to `14` and add, immediately before the closing `});` of that test:

```js
  // 7 -> 14, #332 (naming convention + rename program): seven identity
  // renames — one misnomer (review-severity-floor is a max, so -ceiling),
  // two spelling fixes (automerge -> auto-merge), four dot -> dash. Every
  // one carries the value across unchanged; only the name moved.
  const RENAMES_332 = {
    'review-severity-floor': 'review-auto-apply-ceiling',
    'automerge-max-lines': 'auto-merge-max-lines',
    'automerge-max-files': 'auto-merge-max-files',
    'project.maturity': 'project-maturity',
    'harness-health.scoped-rule-budget': 'harness-health-scoped-rule-budget',
    'harness-health.always-loaded-budget': 'harness-health-always-loaded-budget',
    'doc-convention.adr': 'doc-convention-adr',
  };
  for (const [oldKey, newKey] of Object.entries(RENAMES_332)) {
    const entry = byKey.get(oldKey);
    assert.ok(entry, `${oldKey} missing from RENAMED_KEYS`);
    assert.strictEqual(entry.replacedBy, newKey);
    assert.strictEqual(entry.migrate('anything'), 'anything', `${oldKey}: identity migrate — value shape unchanged`);
  }
```

Leave the existing `// 2 -> 7, #331 (key collapse): …` comment in place — it documents history; the new comment block sits after the existing assertions.

- [ ] **Step 2: Add a POLICY_KEYS-side test for the seven renames**

Append to `tests/policy-schema.test.js` (after the `the three #331-retired keys are gone from POLICY_KEYS` test):

```js
test('#332 renames: seven new names are in POLICY_KEYS with unchanged shape; old names live only in RENAMED_KEYS', () => {
  const byKey = new Map(POLICY_KEYS.map((k) => [k.key, k]));
  const expect = [
    ['review-severity-floor', 'review-auto-apply-ceiling', { type: 'enum', values: ['none', 'low', 'medium'], default: 'low' }],
    ['automerge-max-lines', 'auto-merge-max-lines', { type: 'integer', default: 40 }],
    ['automerge-max-files', 'auto-merge-max-files', { type: 'integer', default: 2 }],
    ['project.maturity', 'project-maturity', { type: 'enum', values: ['greenfield', 'pre-launch', 'early-production', 'established'], default: 'greenfield' }],
    ['harness-health.scoped-rule-budget', 'harness-health-scoped-rule-budget', { type: 'integer', default: 30 }],
    ['harness-health.always-loaded-budget', 'harness-health-always-loaded-budget', { type: 'integer', default: 150 }],
    ['doc-convention.adr', 'doc-convention-adr', { type: 'enum', values: ['plugin', 'project'] }],
  ];
  for (const [oldKey, newKey, shape] of expect) {
    assert.ok(!byKey.has(oldKey), `${oldKey} must not remain in POLICY_KEYS (renamed in #332)`);
    const row = byKey.get(newKey);
    assert.ok(row, `${newKey} missing from POLICY_KEYS`);
    assert.strictEqual(row.type, shape.type, `${newKey}: type`);
    if ('values' in shape) assert.deepStrictEqual(row.values, shape.values, `${newKey}: values`);
    if ('default' in shape) assert.strictEqual(row.default, shape.default, `${newKey}: default`);
    else assert.strictEqual(row.default, undefined, `${newKey}: must stay default-less`);
    assert.strictEqual(typeof row.summary, 'string', `${newKey}: metadata carried across`);
  }
});

test('#332 renames: a stray old-name line resolves under the new name with renamed-from attribution and audits under renamedKeys', () => {
  const pairs = [
    ['review-severity-floor', 'review-auto-apply-ceiling', 'medium', 'medium'],
    ['automerge-max-lines', 'auto-merge-max-lines', '55', 55],
    ['automerge-max-files', 'auto-merge-max-files', '4', 4],
    ['project.maturity', 'project-maturity', 'established', 'established'],
    ['harness-health.scoped-rule-budget', 'harness-health-scoped-rule-budget', '12', 12],
    ['harness-health.always-loaded-budget', 'harness-health-always-loaded-budget', '99', 99],
    ['doc-convention.adr', 'doc-convention-adr', 'project', 'project'],
  ];
  for (const [oldKey, newKey, raw, coerced] of pairs) {
    const resolved = resolvePolicyKeys([newKey], { policyRaw: `${oldKey}: ${raw}\n` });
    assert.strictEqual(resolved[newKey].value, coerced, `${oldKey}: value migrates`);
    assert.strictEqual(resolved[newKey]['renamed-from'], oldKey, `${oldKey}: renamed-from attribution`);
    const asked = resolvePolicyKeys([oldKey], { policyRaw: `${oldKey}: ${raw}\n` });
    assert.strictEqual(asked[oldKey].value, coerced, `${oldKey}: requesting the old name resolves the replacement key (established alias contract — tests/resolve-policy-lib.test.js), never unknown-key`);
    assert.strictEqual(asked[oldKey].source, 'policy');
    const repo = tmpRepo();
    writePolicy(repo, `${oldKey}: ${raw}\n`);
    const audit = auditPolicy(repo);
    const hit = audit.renamedKeys.find((r) => r.key === oldKey);
    assert.ok(hit, `${oldKey}: audit lists it under renamedKeys`);
    assert.strictEqual(hit.replacedBy, newKey);
    assert.deepStrictEqual(audit.unrecognizedKeys, [], `${oldKey}: never also unrecognized`);
  }
});
```

The file's line 7 currently reads `const { POLICY_KEYS, RENAMED_KEYS, auditPolicy, resolveValue } = require('../bin/lib/policy-schema');` — add `resolvePolicyKeys` to that destructure (it is exported; `tests/resolve-policy-lib.test.js` already uses it). `tmpRepo`/`writePolicy` are the file's own helpers (lines 9-17). A `renamedKeys` audit entry has the shape `{ key, value, replacedBy, suggestedValue, currentReplacementValue }` (see the existing test at ~line 222) — the `find` by `key` and the `replacedBy` assertion above match it.

- [ ] **Step 3: Update the two existing tests that use old names as fixtures**

- `tests/policy-schema.test.js` ~line 305-311 (`recognized integer key with a non-integer value -> flagged`): change `automerge-max-lines` → `auto-merge-max-lines` in both the `writePolicy` line and the `invalidValues[0].key` assertion.
- `tests/policy-schema.test.js` ~line 375-393 (`doc-convention.adr is an enum with no default …`): rename every `doc-convention.adr` to `doc-convention-adr` (test title, `find`, `writePolicy` lines, assertion messages).
- Leave `tests/policy.test.js:127-131` (`readListKey: a dotted key name …`) exactly as it is — its fixture line `doc-convention.adr: plugin` is a deliberate dotted *input* proving `parseFlatLines` regex safety, and dotted inputs remain real (they are exactly the alias lines).

- [ ] **Step 4: Run the suite to see the new assertions fail**

Run: `node --test tests/policy-schema.test.js`
Expected: FAIL — `RENAMED_KEYS.length` is 7 not 14; `review-auto-apply-ceiling missing from POLICY_KEYS`; etc.

- [ ] **Step 5: Rename the seven POLICY_KEYS rows**

In `bin/lib/policy-schema.js`, change only the `key:` string of each of these rows (everything else on the line unchanged):

- line 22: `key: 'project.maturity'` → `key: 'project-maturity'`
- line 37: `key: 'automerge-max-lines'` → `key: 'auto-merge-max-lines'`
- line 38: `key: 'automerge-max-files'` → `key: 'auto-merge-max-files'`
- line 52: `key: 'harness-health.scoped-rule-budget'` → `key: 'harness-health-scoped-rule-budget'`
- line 53: `key: 'harness-health.always-loaded-budget'` → `key: 'harness-health-always-loaded-budget'`
- line 63: `key: 'review-severity-floor'` → `key: 'review-auto-apply-ceiling'`
- line 101: `key: 'doc-convention.adr'` → `key: 'doc-convention-adr'`

- [ ] **Step 6: Add the seven RENAMED_KEYS entries**

In `bin/lib/policy-schema.js`, immediately before the `];` that closes `RENAMED_KEYS` (line 178), insert:

```js
  // Renamed in #332 (naming convention + rename program). All seven are
  // identity migrates — the value's shape and meaning did not change, only
  // the name. Removal condition for each: skills/_shared/policy-deprecations.md.
  //
  // review-severity-floor was a misnomer: it is the MAX severity that gets
  // auto-applied (`medium` -> Low AND Medium auto-apply), i.e. a ceiling, and
  // this schema already spells "max" as -ceiling (model-ceiling,
  // dispatch-retry-ceiling). The old name also collided with
  // review-effort-floor, which IS a floor.
  { key: 'review-severity-floor', replacedBy: 'review-auto-apply-ceiling', migrate: (value) => value },
  // automerge -> auto-merge: one spelling, matching housekeeping-auto-merge
  // and the auto:merge label.
  { key: 'automerge-max-lines', replacedBy: 'auto-merge-max-lines', migrate: (value) => value },
  { key: 'automerge-max-files', replacedBy: 'auto-merge-max-files', migrate: (value) => value },
  // dot -> dash: keys are flat kebab-case identifiers; grouping is the
  // `category` metadata, never the key (a dotted key reads as a nested-YAML
  // path in a flat-line parser and silently defaults when written nested).
  { key: 'project.maturity', replacedBy: 'project-maturity', migrate: (value) => value },
  { key: 'harness-health.scoped-rule-budget', replacedBy: 'harness-health-scoped-rule-budget', migrate: (value) => value },
  { key: 'harness-health.always-loaded-budget', replacedBy: 'harness-health-always-loaded-budget', migrate: (value) => value },
  { key: 'doc-convention.adr', replacedBy: 'doc-convention-adr', migrate: (value) => value },
```

- [ ] **Step 7: Run the schema suites**

Run: `node --test tests/policy-schema.test.js tests/policy-schema-metadata.test.js tests/policy.test.js tests/resolve-policy-lib.test.js tests/resolve-policy-cli.test.js`
Expected: PASS. If `tests/policy-schema-metadata.test.js` fails with `summary contains its own key verbatim`, reword that one summary minimally (it should not — none of the seven summaries contain their new key — but check the output rather than assuming). If `tests/resolve-policy-*.test.js` fail on a fixture that names an old key, fix the fixture to the new name and note it in the commit body.

- [ ] **Step 8: Commit**

```bash
git add bin/lib/policy-schema.js tests/policy-schema.test.js
git commit -m "Rename seven policy keys via RENAMED_KEYS aliases — review-auto-apply-ceiling, auto-merge-max-*, four dot→dash; identity migrates with renamed-from attribution, refs #332"
```

---

### Task 2: Naming convention section + conformance test (test-first)

**Files:**
- Create: `tests/policy-key-naming.test.js`
- Modify: `skills/_shared/policy-schema.md` — new `## Key naming` section inserted after the `## Metadata fields` section (i.e. immediately before the `## Worktree & execution` heading, line 68); plus the seven per-key table rows renamed (lines 129, 148, 149, 166, 172, 173, 199) so the doc-row assertion passes
- Test: `tests/policy-key-naming.test.js`

**Interfaces:**
- Produces: `tests/policy-key-naming.test.js` exporting nothing; it holds `const PENDING_RENAMES = ['worktree.always'];` which #602 empties (deletes the constant and its filter, not sets it to `[]`).

- [ ] **Step 1: Write the conformance test**

Create `tests/policy-key-naming.test.js`:

```js
'use strict';
// Pins the policy-key naming convention documented in
// skills/_shared/policy-schema.md's "## Key naming" section (#332): keys are
// flat kebab-case identifiers — never dotted (a dotted key reads as a
// nested-YAML path in a flat-line parser and silently defaults when a user
// writes it nested), grouping lives in the `category` metadata, not the key.
// Also pins that every POLICY_KEYS key has a documented row in that file, so
// a rename that touches the schema but not the doc fails here.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { POLICY_KEYS, RENAMED_KEYS } = require('../bin/lib/policy-schema');

const KEY_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Keys still awaiting their rename record. #602 renames worktree.always ->
// worktree-always (the hook's bespoke read path in bin/lib/policy.js needs
// its own alias handling); it deletes this constant and the filter below —
// it must not leave an empty array behind.
const PENDING_RENAMES = ['worktree.always'];

const MD_PATH = path.join(__dirname, '..', 'skills', '_shared', 'policy-schema.md');

test('every POLICY_KEYS key is flat kebab-case — no dots, no uppercase, no underscores', () => {
  const offenders = POLICY_KEYS.map((row) => row.key)
    .filter((key) => !PENDING_RENAMES.includes(key))
    .filter((key) => !KEY_NAME.test(key));
  assert.deepStrictEqual(offenders, [], `non-conforming key names (see policy-schema.md "## Key naming"): ${offenders.join(', ')}`);
});

test('every RENAMED_KEYS replacement name is flat kebab-case (the retired names may be anything — they are what is being migrated away from)', () => {
  const offenders = RENAMED_KEYS.map((entry) => entry.replacedBy)
    .filter((name) => name !== null)
    .filter((name) => !KEY_NAME.test(name));
  assert.deepStrictEqual(offenders, [], `non-conforming replacement names: ${offenders.join(', ')}`);
});

test('PENDING_RENAMES only names keys that actually exist in POLICY_KEYS (a stale allowance is a bug)', () => {
  const keys = new Set(POLICY_KEYS.map((row) => row.key));
  for (const pending of PENDING_RENAMES) {
    assert.ok(keys.has(pending), `${pending} is in PENDING_RENAMES but no longer in POLICY_KEYS — delete the allowance`);
  }
});

test('policy-schema.md documents a "## Key naming" section and every POLICY_KEYS key has a table row there', () => {
  const md = fs.readFileSync(MD_PATH, 'utf8');
  assert.ok(md.includes('\n## Key naming\n'), 'policy-schema.md has no "## Key naming" section');
  const missing = POLICY_KEYS.map((row) => row.key).filter((key) => !md.includes(`| \`${key}\` |`));
  assert.deepStrictEqual(missing, [], `POLICY_KEYS keys with no documented row in policy-schema.md: ${missing.join(', ')}`);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/policy-key-naming.test.js`
Expected: FAIL — `policy-schema.md has no "## Key naming" section` and (until the doc rows are renamed) `POLICY_KEYS keys with no documented row: review-auto-apply-ceiling, auto-merge-max-lines, …`. The kebab-case test must PASS already (Task 1 renamed the schema; only `worktree.always` is dotted and it is allowed).

- [ ] **Step 3: Rename the seven table rows in policy-schema.md**

In `skills/_shared/policy-schema.md`, change the leading `` | `old` | `` cell of each row, and any old-name mention inside the same row's other cells:

- line 129: `` | `project.maturity` | `` → `` | `project-maturity` | ``
- line 148: `` | `automerge-max-lines` | `` → `` | `auto-merge-max-lines` | ``
- line 149: `` | `automerge-max-files` | `` → `` | `auto-merge-max-files` | ``
- line 166: `` | `doc-convention.adr` | `` → `` | `doc-convention-adr` | ``
- line 172: `` | `harness-health.scoped-rule-budget` | `` → `` | `harness-health-scoped-rule-budget` | ``
- line 173: `` | `harness-health.always-loaded-budget` | `` → `` | `harness-health-always-loaded-budget` | ``
- line 199: `` | `review-severity-floor` | `` → `` | `review-auto-apply-ceiling` | ``; in the same row's Meaning cell change `auto-apply cutoff` → `auto-apply ceiling — the maximum severity applied without asking (`medium` = Low and Medium auto-apply, High staged, Critical prompted)`.

- [ ] **Step 4: Insert the `## Key naming` section**

In `skills/_shared/policy-schema.md`, insert this block immediately before the line `## Worktree & execution` (keep one blank line on each side):

```markdown
## Key naming

Every key in `POLICY_KEYS` (and every `RENAMED_KEYS` replacement name) is a **flat kebab-case identifier**: `^[a-z0-9]+(-[a-z0-9]+)*$`. Pinned by `tests/policy-key-naming.test.js`, which also checks that every key has a row in this file.

- **No dots.** `policy.yml` is read by a flat-line parser (`parseFlatLines`) — a dotted key reads to a human as a nested-YAML path, and a user who writes it nested (`worktree:` / `  always: true`) is silently defaulted; neither `auditPolicy` nor the hook can tell that from "unset". Grouping is the `category` metadata field, never the key: a key is an identity, not a classification.
- **Suffix vocabulary.** `-floor` = the minimum a value may fall to (`review-effort-floor`, `risk-floor`, `size-floor`); `-ceiling` = the maximum permitted (`model-ceiling`, `dispatch-retry-ceiling`, `review-auto-apply-ceiling`); `-cap` = a count limit (`health-open-cap`, `fleet-daily-grant-cap`). Name the direction the value bounds, not the concept it configures.
- **One spelling per concept.** `auto-merge` (matching the `auto:merge` label and `housekeeping-auto-merge`), never `automerge`.
- **Renames go through `RENAMED_KEYS`** with a `migrate` function and an entry in `_shared/policy-deprecations.md` carrying the shared removal predicate — never a bare rename. A `policy.yml` still using the old name resolves under the new one with `"renamed-from"` attribution and is reported by `auditPolicy` / `/claude-tweaks:init --update` until the alias's removal condition is met.

**Deliberately not renamed — `auto-mode`.** It reads as a sibling of `autonomy`, but the two are orthogonal axes (interaction stops vs. authority) and the confusion is conceptual, not spelling — any name containing "auto" stays proximate, and a key not named after the `auto-mode` contract it toggles (`_shared/auto-mode-contract.md`) would be worse. Their `category` values (`pipeline-behavior` / `autonomy-trust`) are the disambiguation surface. Judged 2026-08-16 (#332); do not re-open without new evidence.

**Pending:** `worktree.always` — renamed to `worktree-always` by #602 (the hook's read path in `bin/lib/policy.js` needs its own alias handling); until then it is the one allowed exception, listed in the test's `PENDING_RENAMES`.
```

- [ ] **Step 5: Run the test to see it pass, then the discrimination check**

Run: `node --test tests/policy-key-naming.test.js`
Expected: PASS (4 tests).

Discrimination check (`[IL-105]` — name what red looks like): temporarily add a row `{ key: 'x.dotted', type: 'boolean', default: false, summary: "tmp", category: 'housekeeping', tier: 'advanced' },` at the top of `POLICY_KEYS` in `bin/lib/policy-schema.js`, run `node --test tests/policy-key-naming.test.js`, confirm it FAILS on both the kebab-case test (`non-conforming key names … x.dotted`) and the doc-row test (`no documented row … x.dotted`), then remove the row and re-run to green. Record the failing assertion text in the commit body.

- [ ] **Step 6: Run the metadata suite too (it reads policy-schema.md)**

Run: `node --test tests/policy-schema-metadata.test.js tests/policy-key-naming.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/policy-key-naming.test.js skills/_shared/policy-schema.md
git commit -m "Document the policy-key naming convention and pin it — flat kebab-case, suffix vocabulary, auto-mode keep verdict, worktree.always pending allowance for #602, refs #332"
```

---

### Task 3: Deprecation entries + generalized removal predicate

**Files:**
- Modify: `skills/_shared/policy-deprecations.md` (intro paragraph, predicate paragraph, seven new `##` entries appended at the end)

**Interfaces:**
- Produces: seven `## \`{old}\` (renamed to \`{new}\`, #332)` sections; #602 adds an eighth in the same shape.

- [ ] **Step 1: Generalize the intro and predicate**

In `skills/_shared/policy-deprecations.md`:

- First paragraph: change `for the five policy keys collapsed or retired in #331.` → `for every policy key collapsed, retired, or renamed since #331 (five in #331, seven in #332).`
- Predicate paragraph: change `All five share one predicate form: **(a)** …, and **(b)** the release that shipped #331 is at least 6 months old per its date row in \`docs/shipped-versions.tsv\`` → `Every entry shares one predicate form: **(a)** \`grep -n "{key}" .claude-tweaks/policy.yml\` in this repo returns nothing, and **(b)** the release that shipped the entry's rename or retirement (named in the entry's heading — #331 or #332) is at least 6 months old per its date row in \`docs/shipped-versions.tsv\``. Keep the rest of that paragraph verbatim.

- [ ] **Step 2: Append the seven entries**

Append at the end of the file (after the `section-confirmation` entry):

```markdown
## `review-severity-floor` (renamed to `review-auto-apply-ceiling`, #332)

Now: migrates at read — identity `migrate`, enum semantics unchanged, `renamed-from` attribution. Renamed because the value is the *maximum* severity auto-applied (`medium` → Low and Medium auto-apply, High staged), i.e. a ceiling, and the `-floor` suffix collided with `review-effort-floor`, which is a genuine floor. `auditPolicy` reports the stray line under `renamedKeys` with the suggested replacement; a file setting both keys follows the resolver's uniform alias rule (new key wins).

Removal condition: the shared predicate above, with `{key}` = `review-severity-floor`.

## `automerge-max-lines` (renamed to `auto-merge-max-lines`, #332)

Now: migrates at read — identity `migrate`, integer semantics unchanged, `renamed-from` attribution. Spelling unified with `housekeeping-auto-merge` and the `auto:merge` label.

Removal condition: the shared predicate above, with `{key}` = `automerge-max-lines`.

## `automerge-max-files` (renamed to `auto-merge-max-files`, #332)

Now: as `automerge-max-lines` above.

Removal condition: the shared predicate above, with `{key}` = `automerge-max-files`.

## `project.maturity` (renamed to `project-maturity`, #332)

Now: migrates at read — identity `migrate`, enum semantics unchanged, `renamed-from` attribution. Dot → dash per `policy-schema.md`'s `## Key naming` rule. `/claude-tweaks:init` writes the new name into generated `policy.yml` files; a pre-#332 project's dotted line keeps resolving until the removal condition is met.

Removal condition: the shared predicate above, with `{key}` = `project.maturity`.

## `harness-health.scoped-rule-budget` (renamed to `harness-health-scoped-rule-budget`, #332)

Now: migrates at read — identity `migrate`, integer semantics unchanged, `renamed-from` attribution. Dot → dash per `## Key naming`.

Removal condition: the shared predicate above, with `{key}` = `harness-health.scoped-rule-budget`.

## `harness-health.always-loaded-budget` (renamed to `harness-health-always-loaded-budget`, #332)

Now: as the entry above.

Removal condition: the shared predicate above, with `{key}` = `harness-health.always-loaded-budget`.

## `doc-convention.adr` (renamed to `doc-convention-adr`, #332)

Now: migrates at read — identity `migrate`, enum semantics unchanged (still no schema default — unset means "detect and ask"), `renamed-from` attribution. Dot → dash per `## Key naming`.

Removal condition: the shared predicate above, with `{key}` = `doc-convention.adr`.
```

- [ ] **Step 3: Verify the file has the expected entry count and commit**

Run: `grep -c "^## " skills/_shared/policy-deprecations.md`
Expected: `12` (five #331 entries + seven #332 entries).

```bash
git add skills/_shared/policy-deprecations.md
git commit -m "Record removal conditions for the seven #332 policy-key renames — predicate generalized to name each entry's release, refs #332"
```

---

### Task 4: Code sweep — the one literal read site + init writers

**Files:**
- Modify: `bin/lib/wrap-up/facts.js:131` (`harness-health.*` literals passed to the resolver)
- Modify: `skills/init/phase-3-classification.md`, `skills/init/summary-templates.md`, `skills/init/update-mode.md` (`project.maturity` writer/reader sites), `skills/init/rules-template.md`, `skills/init/claude-md-template.md` (`harness-health.*`)
- Test: `tests/bin-lib/wrap-up/*.test.js` (whichever suite covers `facts.js` — find with `grep -rl "facts" tests/bin-lib/wrap-up/`)

- [ ] **Step 1: Fix the resolver call in facts.js**

In `bin/lib/wrap-up/facts.js` line 131, change the two literals `'harness-health.scoped-rule-budget', 'harness-health.always-loaded-budget'` → `'harness-health-scoped-rule-budget', 'harness-health-always-loaded-budget'`. Then grep the same file for any code that reads the resolver's returned object by the old key (`result['harness-health.scoped-rule-budget']` or a destructure) and update it — the resolver returns an object keyed by the requested name, so a stale key lookup would silently read `undefined`.

- [ ] **Step 2: Run the wrap-up module suite**

Run: `node --test tests/bin-lib/wrap-up/`
Expected: PASS. If a test fixture stubs the resolver's output keyed by the old name, rename the fixture key too.

- [ ] **Step 3: Sweep the init writers**

For each of `skills/init/phase-3-classification.md`, `skills/init/summary-templates.md`, `skills/init/update-mode.md`, `skills/init/rules-template.md`, `skills/init/claude-md-template.md`: open the file, replace every `project.maturity` → `project-maturity` and every `harness-health.scoped-rule-budget` / `harness-health.always-loaded-budget` → the dashed forms. These files *write* keys into generated `policy.yml`/`CLAUDE.md` content (`[IL-97]` — sweeping reads only would leave init minting deprecated names), so check the replaced lines are the write templates, not just descriptions.

- [ ] **Step 4: Negative control and commit**

Run: `grep -rn "project\.maturity\|harness-health\.scoped\|harness-health\.always" bin skills/init`
Expected: no output.

```bash
git add bin/lib/wrap-up/facts.js skills/init/phase-3-classification.md skills/init/summary-templates.md skills/init/update-mode.md skills/init/rules-template.md skills/init/claude-md-template.md
git commit -m "Sweep the harness-health resolver literal and init's policy writers onto the #332 key names — [IL-97] write-side sweep, refs #332"
```

---

### Task 5: Prose sweep — every remaining live citation

**Files:**
- Modify (from the sweep at plan-authoring time; re-derive with the grep in Step 1 — the list is the expected set, the grep is the truth):
  - `review-severity-floor` → `review-auto-apply-ceiling`: `docs/journeys/resolve-a-policy-key.md`, `skills/_shared/auto-decision-log.md`, `skills/_shared/auto-mode-contract.md`, `skills/_shared/autonomy-ceiling.md`, `skills/_shared/git-discipline.md`, `skills/_shared/policy-schema.md` (any remaining prose mentions outside the row Task 2 renamed and the `## Key naming` section), `skills/flow/SKILL.md`, `skills/flow/manifesto.md`, `skills/help/context-flow.md`, `skills/help/reference-card.md`, `skills/review/review-effort-derivation.md`, `skills/review/step3-debate-and-refutation.md`, `skills/review/step3-routing.md`
  - `automerge-max-lines` / `automerge-max-files` → `auto-merge-max-*`: `docs/journeys/routine-fleet-on.md`, `skills/_shared/auto-decision-log.md`, `skills/_shared/work-record-config.md`, `skills/assess-agent-autonomy/merge-check.md`, `skills/dispatch/SKILL.md`, `skills/dispatch/settle-and-merge.md`, `skills/routine/fleet.md`
  - `project.maturity` → `project-maturity`: `docs/skill-graph.md`, `skills/build/SKILL.md`, `skills/help/policy.md`, `skills/specify/decomposition-mode.md`
  - `harness-health.*` → dashed: `docs/superpowers/specs/2026-08-07-doc-prior-art-detection-design.md`, `skills/_shared/harness-health-analysis.md`, `skills/harness-health/judge-procedure.md`, `skills/wrap-up/claude-md-curation.md`
  - `doc-convention.adr` → `doc-convention-adr`: `docs/skill-graph.md`, `docs/superpowers/specs/2026-08-07-doc-prior-art-detection-design.md`, `skills/_shared/decision-records.md`, `skills/wrap-up/adr-curation.md`, `skills/wrap-up/console-template.md`, `skills/wrap-up/execution-and-verification.md`

**Interfaces:** none — prose only.

- [ ] **Step 1: Derive the live sweep list**

Run: `node -e 'const {execSync}=require("child_process");const keys=["review-severity-floor","automerge-max-lines","automerge-max-files","project.maturity","harness-health.scoped-rule-budget","harness-health.always-loaded-budget","doc-convention.adr"];for(const k of keys){let out="";try{out=execSync(`grep -rlF -- "${k}" skills bin tests docs README.md agents hooks CLAUDE.md 2>/dev/null`).toString();}catch(e){out=e.stdout?e.stdout.toString():"";}const files=out.split("\n").filter(Boolean).filter(f=>!/docs\/incident-log\.md|docs\/shipped-versions\.tsv|docs\/superpowers\/plans\//.test(f));console.log("=== "+k+" ("+files.length+")\n"+files.join("\n"));}'`

Expected: the file lists above (minus files already fixed in Tasks 1-4), plus the tombstones that must NOT be edited: `bin/lib/policy-schema.js` (the `RENAMED_KEYS` entries), `skills/_shared/policy-deprecations.md`, `tests/policy-schema.test.js` / `tests/policy.test.js` (old names as fixtures / alias tests), `tests/policy-key-naming.test.js` (no old names — only `worktree.always`), and `skills/_shared/policy-schema.md`'s `## Key naming` section (mentions old spellings as counter-examples — leave those; rename any *other* mention).

- [ ] **Step 2: Sweep each file**

For every non-tombstone file in the list, open it and replace each old name with its new name from the Rename table. Two rules: (1) when a `resolve-policy.js` invocation names the key, the shell variable name may stay (`REVIEW_SEVERITY_FLOOR=…`) but prefer renaming it to match (`REVIEW_AUTO_APPLY_CEILING`) when it is only used within the same file; (2) `skills/flow/manifesto.md`'s lever table (`| 7 | Review severity floor |`) and `skills/_shared/auto-mode-contract.md`'s lever list are the human-facing names of the same lever — rename the label to `Review auto-apply ceiling` and its `config.yml` example key to `review-auto-apply-ceiling`, keeping lever number 7 (the canonical numbering is stable).

Note for `skills/review/step3-routing.md`: rename the key at lines ~51 and ~75 but do NOT restructure the read (it still reads `config.yml` directly) — #334, later in this run, migrates the read itself; leave that to it.

- [ ] **Step 3: Negative control**

Run the Step 1 command again.
Expected: only the tombstone files listed in Step 1 remain, and inside `skills/_shared/policy-schema.md` the only hits are inside the `## Key naming` section (verify with `grep -n "automerge\|review-severity-floor\|project\.maturity\|doc-convention\.adr\|harness-health\." skills/_shared/policy-schema.md` — every hit's line number must fall between the `## Key naming` heading and the `## Worktree & execution` heading).

- [ ] **Step 4: Run the prose-pinning suites**

Run: `node --test tests/sweep-backstop.test.js tests/policy-key-naming.test.js tests/policy-schema-metadata.test.js tests/hooks-gate-coverage.test.js`
Expected: PASS. Then run `ls tests/*.test.js | grep -i "manifesto\|flow\|review\|dispatch\|help\|conform"` and run any suite whose name matches a swept skill — conformance tests pin prose repo-wide.

- [ ] **Step 5: Commit**

Run `git status --short` first and confirm every listed path is one you edited in this task — no stray files. Then:

```bash
git add -A skills docs README.md
git commit -m "Sweep live prose onto the #332 policy-key names — manifesto lever 7 renamed to review auto-apply ceiling, dispatch/merge-check auto-merge caps, init/wrap-up dotted keys, refs #332"
```

---

## Self-review notes

- Spec coverage: Deliverable 1 → Task 2 Step 4; 2 → Task 2 Steps 1/5; 3 → Task 1; 4 → Task 3 Step 1; 5 → Tasks 4-5; 6 → verified at plan time (none of the seven keys are set in `.claude-tweaks/policy.yml`; the controller re-verifies at Common Step 5); 7 → Task 2 Step 4.
- Acceptance criteria: resolver behavior → Task 1 Step 2 second test — note the spec's "old name returns unknown-key" criterion is wrong against the resolver's pinned alias contract (`tests/resolve-policy-lib.test.js:162`: an alias's old name resolves the replacement; `unknown-key` is retirements only), so the test pins the real contract; ruling in the SDD ledger; alias resolution + audit → same; conformance test + discrimination → Task 2 Step 5; grep negative control → Task 5 Step 3; doc table + section → Task 2; deprecations entries → Task 3; `npm test` → controller after Task 5.
- The spec's claim that "the schema-doc parity test already pins" the per-key table was inaccurate at plan-authoring time — no such test existed; Task 2's doc-row assertion is what now pins it. Stated here so the review does not go looking for a pre-existing test.
