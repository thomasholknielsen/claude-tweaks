# housekeeping-auto-merge Derived Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `housekeeping-auto-merge`'s unset value derives from the resolved `autonomy` ceiling (`trusted`/`unattended` → `true`, else `false`) instead of static `false`; explicit values win unchanged.

**Architecture:** A private helper in `bin/lib/policy-schema.js` resolves `autonomy` from the same parsed `sources` array (never from `requestedKeys` — the per-key loop shares no resolved-so-far state) and maps it to a boolean; a two-line hook in `resolvePolicyKeys` replaces the value whenever the entry resolved with `source: 'default'` (unset, or set-but-invalid per `resolveIntegrationModel`'s precedent). The entry's `source` field stays `'default'` — that is the derived-vs-explicit attribution surface sibling record #581 reads.

**Tech Stack:** Node 18+ (zero deps), `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T114842-spec-580/work/580-spec.md`

## Global Constraints

- No new policy keys, flags, or output fields; `POLICY_KEYS.length` stays 48 (pinned in `tests/policy-schema.test.js`)
- The schema row keeps `type: 'boolean'`, `default: false`, and its #533 metadata fields (`summary`/`category`/`tier`) — `tests/sweep-backstop.test.js:162` pins the row shape; the static default remains the `supervised` base value
- The derivation helper is NOT exported (spec Non-Goal: private until a second caller exists)
- No logic in `bin/resolve-policy.js` (its header: "No resolution logic lives here")
- All new tests use inline string fixtures in `tests/resolve-policy-lib.test.js` — never read the live `.claude-tweaks/policy.yml` (that file's IL-80 header rule)
- Behavior-change release note obligation is noted in the spec's Gotchas; this plan does not bump the version (release is out of scope for a build run)

---

### Task 1: Derivation in the resolver, test-first

**Files:**
- Modify: `tests/resolve-policy-lib.test.js` (append tests at end of file)
- Modify: `bin/lib/policy-schema.js:46-49` (row comment), `~305-360` (`resolvePolicyKeys` hook + new helper above it)

**Interfaces:**
- Consumes: existing `resolvePolicyKeys(requestedKeys, { policyRaw, runConfigRaw })`, `SCHEMA_BY_KEY`, `hasOwn`, `isValidValue`, `resolveValue` — all already in module scope
- Produces: private `deriveHousekeepingAutoMerge(sources) → boolean` (module-local, NOT added to `module.exports`); unchanged `resolvePolicyKeys` signature

- [ ] **Step 1: Write the failing tests**

Append to `tests/resolve-policy-lib.test.js`:

```js
// --- housekeeping-auto-merge autonomy-derived default (#580) ---
// The key is requested ALONE in every case below: the derivation must
// internally resolve autonomy from the same sources, never rely on
// autonomy appearing in requestedKeys (the per-key loop shares no state).

test('AC 1: unset + autonomy supervised (or unset) derives false', () => {
  const unsetBoth = resolvePolicyKeys(['housekeeping-auto-merge'], { policyRaw: null });
  assert.deepStrictEqual(unsetBoth['housekeeping-auto-merge'], { value: false, source: 'default' });
  const supervised = resolvePolicyKeys(['housekeeping-auto-merge'], { policyRaw: 'autonomy: supervised\n' });
  assert.deepStrictEqual(supervised['housekeeping-auto-merge'], { value: false, source: 'default' });
});

test('AC 2: unset + autonomy trusted derives true', () => {
  const result = resolvePolicyKeys(['housekeeping-auto-merge'], { policyRaw: 'autonomy: trusted\n' });
  assert.deepStrictEqual(result['housekeeping-auto-merge'], { value: true, source: 'default' });
});

test('AC 3+4: unset + autonomy unattended derives true, with the key requested alone', () => {
  const requested = ['housekeeping-auto-merge'];
  assert.ok(!requested.includes('autonomy'), 'invariant: autonomy must not be in requestedKeys');
  const result = resolvePolicyKeys(requested, { policyRaw: 'autonomy: unattended\n' });
  assert.deepStrictEqual(result['housekeeping-auto-merge'], { value: true, source: 'default' });
});

test('AC 5: explicit false at unattended wins with a non-default source', () => {
  const result = resolvePolicyKeys(['housekeeping-auto-merge'], {
    policyRaw: 'housekeeping-auto-merge: false\nautonomy: unattended\n',
  });
  assert.deepStrictEqual(result['housekeeping-auto-merge'], { value: false, source: 'policy' });
});

test('AC 6: explicit true at supervised wins with a non-default source', () => {
  const result = resolvePolicyKeys(['housekeeping-auto-merge'], {
    policyRaw: 'housekeeping-auto-merge: true\nautonomy: supervised\n',
  });
  assert.deepStrictEqual(result['housekeeping-auto-merge'], { value: true, source: 'policy' });
});

test('AC 7: set-but-invalid keeps invalid: true and falls back to the derived value', () => {
  const result = resolvePolicyKeys(['housekeeping-auto-merge'], {
    policyRaw: 'housekeeping-auto-merge: maybe\nautonomy: unattended\n',
  });
  assert.deepStrictEqual(result['housekeeping-auto-merge'], { value: true, source: 'default', invalid: true });
});

test('run-config explicit value beats a policy autonomy derivation', () => {
  const result = resolvePolicyKeys(['housekeeping-auto-merge'], {
    policyRaw: 'autonomy: unattended\n',
    runConfigRaw: 'housekeeping-auto-merge: false\n',
  });
  assert.deepStrictEqual(result['housekeeping-auto-merge'], { value: false, source: 'run-config' });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test tests/resolve-policy-lib.test.js`
Expected: FAIL — AC 2, AC 3+4, and AC 7 fail (`value: false` where `true` expected); AC 1, 5, 6, and the run-config case already pass under current behavior (that is expected — they pin the unchanged half of the contract).

- [ ] **Step 3: Implement the derivation**

In `bin/lib/policy-schema.js`, replace the comment on lines 46-48 (above the `housekeeping-auto-merge` row):

```js
  // The row default (false) is the `supervised` base only: the EFFECTIVE
  // unset default is derived in resolvePolicyKeys from the resolved autonomy
  // ceiling — trusted/unattended derive true (#580; was opt-in-only, #414).
  // See deriveHousekeepingAutoMerge below and tidy/SKILL.md Step 7.
```

Immediately above `function resolvePolicyKeys(...)` (line ~281), insert:

```js
// housekeeping-auto-merge's effective default derives from the resolved
// autonomy ceiling (skills/_shared/autonomy-ceiling.md): a project declaring
// trusted/unattended has already opted into click-free bookkeeping, and a
// tidy housekeeping PR is bookkeeping whose content judgment passed at tidy
// Step 6, before the PR opened (#580). Invariants: (1) autonomy is resolved
// HERE, from the same parsed sources — never via requestedKeys, whose per-key
// loop shares no resolved-so-far state, so requesting the key alone still
// derives correctly; (2) positive-list mapping — a future autonomy enum value
// lands on false until this mapping is deliberately revisited; (3) the
// derived entry keeps source: 'default' — that field is the derived-vs-
// explicit attribution surface tidy Step 7.5 reads (#581); never tag a
// distinct source for a derived value.
function deriveHousekeepingAutoMerge(sources) {
  const schemaEntry = SCHEMA_BY_KEY.get('autonomy');
  let autonomy = schemaEntry.default;
  for (const source of sources) {
    if (!hasOwn(source.values, 'autonomy')) continue;
    const raw = source.values.autonomy;
    // Mirrors the main loop's invalid handling: an invalid value resolves the
    // schema default, never the next source's value.
    if (isValidValue(schemaEntry, raw)) autonomy = resolveValue('autonomy', raw);
    break;
  }
  return autonomy === 'trusted' || autonomy === 'unattended';
}
```

Inside `resolvePolicyKeys`, immediately before `result[requested] = resolved;` (after the `if (!resolved) { ... }` block, line ~356), insert:

```js
    // Derived default (#580): source 'default' covers both unset and
    // set-but-invalid — both fall back to the autonomy-derived value, the
    // same set-but-invalid posture resolveIntegrationModel documents.
    if (canonical === 'housekeeping-auto-merge' && resolved.source === 'default') {
      resolved = { ...resolved, value: deriveHousekeepingAutoMerge(sources) };
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/resolve-policy-lib.test.js`
Expected: PASS (all pre-existing tests in the file must also still pass)

- [ ] **Step 5: Run the adjacent pinned suites**

Run: `node --test tests/policy-schema.test.js tests/sweep-backstop.test.js`
Expected: PASS — the row pin (`default: false`, 48-key count) is deliberately untouched by the implementation shape above.

- [ ] **Step 6: Commit**

```bash
git add tests/resolve-policy-lib.test.js bin/lib/policy-schema.js
git commit -m "Derive housekeeping-auto-merge's unset default from the autonomy ceiling — refs #580"
```

---

### Task 2: Documentation rows, pin honesty, and consumer list

**Files:**
- Modify: `skills/_shared/policy-schema.md:151` (the lever's row, Default column)
- Modify: `skills/_shared/autonomy-ceiling.md:3-15` (opening consumer list)
- Modify: `tests/sweep-backstop.test.js:162` (test name + one comment line — assertions unchanged)
- Test: `tests/policy-schema.test.js`, `tests/sweep-backstop.test.js` (existing suites re-run)

**Interfaces:**
- Consumes: Task 1's shipped derivation (the doc text describes it)
- Produces: nothing downstream in this plan

- [ ] **Step 1: Update the lever's Default column in `skills/_shared/policy-schema.md`**

On line 151, the row currently reads (Default column value `false`):

```markdown
| `housekeeping-auto-merge` | `policy.yml` | `/claude-tweaks:tidy` Step 7, `_shared/github-pr-scan.md`'s `repo-wide` scope | `false` | When set, the sweep may arm `--auto` on tidy's own green, marker-stamped Step-7 PRs — otherwise they stage like any other unarmed PR |
```

Replace the row with:

```markdown
| `housekeeping-auto-merge` | `policy.yml` | `/claude-tweaks:tidy` Step 7, `_shared/github-pr-scan.md`'s `repo-wide` scope | derived from `autonomy`: `true` at `trusted`/`unattended`, else `false` | When it resolves true, tidy's own green, marker-stamped Step-7 PRs may arm `--auto` — otherwise they stage like any other unarmed PR. An explicit key wins over the derivation in both directions (#580) |
```

- [ ] **Step 2: Add the consumer to `skills/_shared/autonomy-ceiling.md`'s reference list**

In the opening paragraph's consumer enumeration (the sentence beginning "Referenced, not restated, by every consumer:"), append one clause before the final consumer's terminating period — after the `dispatch/settle-and-merge.md` entry and before "and — for the bookkeeping capabilities":

```markdown
`bin/lib/policy-schema.js` (the `housekeeping-auto-merge` derived default — unset resolves `true` at `trusted`/`unattended`, #580),
```

- [ ] **Step 3: Make the sweep-backstop pin honest**

In `tests/sweep-backstop.test.js` line 162, change only the test name (assertions stay byte-identical):

```js
test('housekeeping-auto-merge row: boolean, static default false (the supervised base — effective default derives from autonomy, #580)', () => {
```

- [ ] **Step 4: Run the affected suites**

Run: `node --test tests/policy-schema.test.js tests/sweep-backstop.test.js tests/resolve-policy-lib.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/policy-schema.md skills/_shared/autonomy-ceiling.md tests/sweep-backstop.test.js
git commit -m "Document the autonomy-derived housekeeping-auto-merge default — refs #580"
```
