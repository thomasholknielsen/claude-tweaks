# permittedGrants Per-Grant Reasons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `permittedGrants` returns a per-grant `{granted, reason}` pair for each grant decision, so a granted `bornReady` never carries a denial-shaped reason belonging to the withheld `bornAuthorized` decision.

**Architecture:** Expand-contract on the module's return shape. Expand: add a `grants: { bornReady: {granted, reason}, bornAuthorized: {granted, reason} }` object alongside the existing flat `bornReady`/`bornAuthorized`/`reason` keys, which stay byte-identical for one release with a recorded removal condition (the same transitional-twin convention `.claude-tweaks/policy.yml` uses for `worktree-always`). Per-grant rule: `reason` is non-empty exactly when that grant is withheld. Migrate every consumer: in-repo code (`grant-gate.js`) reads `grants.*` directly (ships atomically with `autonomy.js`); skill-text `node -e` snippets (`capture/SKILL.md`, `backlog/refine-mode.md`) read `grants.*` with a one-line fallback to the flat keys, because repo-HEAD skill text can run against an older installed plugin build's `autonomy.js` (dogfooding skew).

**Premise note (spec drift):** The record's Current State names `{ bornReady, autoBuild?, autoMerge?, reason }` — that was the shape when filed. Current `bin/lib/issues/autonomy.js` returns `{ bornReady, bornAuthorized, reason }`. This plan applies the record's intent (per-grant reasons, expand-contract, migrated consumers, the reason-pairing test invariants) to the current two-grant shape: `bornReady` and `bornAuthorized`. The record's AC-1 reads `bornReady.granted === true` (the post-contract end state); during the expand release the per-grant object lives at `grants.bornReady` — AC-1 is verified against `grants.bornReady.granted`.

**Tech Stack:** Node 18+ built-in `node --test`; no external deps.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T164927-spec-647-648/spec-647/work/647-spec.md`

## Global Constraints

- Flat `bornReady`/`bornAuthorized`/`reason` behavior stays byte-identical this release — every existing test in `tests/bin-lib/issues/autonomy.test.js` must pass unmodified.
- Per-grant reasons: non-empty exactly when that grant is withheld; empty string (`''`) when granted.
- Commit messages: `{Verb} {what} — {detail}`, imperative, `refs #647` (never `closes`/`fixes`).
- All work happens in the worktree at `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-647-648` — verify with `pwd` + `git rev-parse --show-toplevel` before any commit.
- Run only the targeted suite per task (`node --test tests/bin-lib/issues/autonomy.test.js` etc.) — the full suite runs centrally after the build.

---

### Task 1: Per-grant `grants` object in `permittedGrants` (TDD)

**Files:**
- Modify: `bin/lib/issues/autonomy.js` (the `DENY` const ~line 61, the three tail returns of `permittedGrants` ~lines 106-117, and the module-header comment block at the top of the file)
- Test: `tests/bin-lib/issues/autonomy.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `permittedGrants(input)` → `{ bornReady: boolean, bornAuthorized: boolean, reason: string, grants: { bornReady: { granted: boolean, reason: string }, bornAuthorized: { granted: boolean, reason: string } } }`. Tasks 2 and 3 rely on exactly the key names `grants.bornReady.granted`, `grants.bornReady.reason`, `grants.bornAuthorized.granted`, `grants.bornAuthorized.reason`.

- [ ] **Step 1: Check for whole-object assertions that a widened return would defang**

Run: `grep -n "deepEqual\|deepStrictEqual" tests/bin-lib/issues/autonomy.test.js tests/bin-lib/issues/grant-gate.test.js`
Expected: no hits against `permittedGrants(...)`'s whole return value (per-field `assert.equal` calls are fine). If a whole-object `deepEqual` against the full return exists, it will fail when `grants` is added — update that assertion in the same commit as the implementation, and say so in the commit body.

- [ ] **Step 2: Write the failing tests**

Append to `tests/bin-lib/issues/autonomy.test.js` (inside the existing file, after the last `permittedGrants` test, before the `clearsFloor` tests; reuse the file's existing `cleanRow` fixture — if the fixture's name differs, adapt to the file's actual fixture for a clean, gradable, agent-filed row):

```js
test('per-grant reasons: reason is non-empty exactly when that grant is withheld', () => {
  const cases = [
    permittedGrants({ ceiling: 'trusted', row: cleanRow }),
    permittedGrants({ ceiling: 'unattended', row: cleanRow }),
    permittedGrants({ ceiling: 'unattended', row: cleanRow, grantOriginationEnabled: true }),
    permittedGrants({ ceiling: 'supervised', row: cleanRow }),
    permittedGrants({ ceiling: 'trusted', row: null }),
  ];
  for (const result of cases) {
    for (const name of ['bornReady', 'bornAuthorized']) {
      const g = result.grants[name];
      if (g.granted) {
        assert.equal(g.reason, '', `${name} granted must carry an empty reason`);
      } else {
        assert.ok(g.reason.length > 0, `${name} withheld must carry a non-empty reason`);
      }
    }
  }
});

test('a granted bornReady never carries the withheld grant\'s opt-in denial', () => {
  const result = permittedGrants({ ceiling: 'unattended', row: cleanRow });
  assert.equal(result.grants.bornReady.granted, true);
  assert.equal(result.grants.bornReady.reason, '');
  assert.equal(result.grants.bornAuthorized.granted, false);
  assert.match(result.grants.bornAuthorized.reason, /opt-in/i);
  // The flat compat key keeps its historical single-string behavior unchanged.
  assert.match(result.reason, /opt-in/i);
});

test('flat compat keys mirror grants.*.granted across every branch', () => {
  const cases = [
    permittedGrants({ ceiling: 'supervised', row: cleanRow }),
    permittedGrants({ ceiling: 'trusted', row: cleanRow }),
    permittedGrants({ ceiling: 'unattended', row: cleanRow }),
    permittedGrants({ ceiling: 'unattended', row: cleanRow, grantOriginationEnabled: true }),
    permittedGrants({ ceiling: 'trusted', row: { ...cleanRow, kind: 'human' } }),
    permittedGrants(null),
  ];
  for (const result of cases) {
    assert.equal(result.bornReady, result.grants.bornReady.granted);
    assert.equal(result.bornAuthorized, result.grants.bornAuthorized.granted);
  }
});

test('a denial applies the same reason to both grants', () => {
  const result = permittedGrants({ ceiling: 'supervised', row: cleanRow });
  assert.equal(result.grants.bornReady.granted, false);
  assert.equal(result.grants.bornAuthorized.granted, false);
  assert.equal(result.grants.bornReady.reason, result.reason);
  assert.equal(result.grants.bornAuthorized.reason, result.reason);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/autonomy.test.js`
Expected: the four new tests FAIL (`Cannot read properties of undefined (reading 'bornReady')` — no `grants` key yet); every pre-existing test still passes.

- [ ] **Step 4: Implement the per-grant shape**

In `bin/lib/issues/autonomy.js`, replace the `DENY` const:

```js
const DENY = (reason) => ({
  bornReady: false,
  bornAuthorized: false,
  reason,
  grants: {
    bornReady: { granted: false, reason },
    bornAuthorized: { granted: false, reason },
  },
});
```

Replace the three tail returns of `permittedGrants` (the `!atLeast(tier, 'unattended')` branch, the `grantOriginationEnabled !== true` branch, and the final return). Note `bornReady` is always `true` at these three sites — the `!bornReady` case already returned via `DENY` above them:

```js
  if (!atLeast(tier, 'unattended')) {
    const reason = `class is clean and the ceiling is ${tier}`;
    return {
      bornReady,
      bornAuthorized: false,
      reason,
      grants: {
        bornReady: { granted: true, reason: '' },
        bornAuthorized: { granted: false, reason },
      },
    };
  }
  if (grantOriginationEnabled !== true) {
    const reason = 'ceiling is unattended, but machine-originated grants need their own explicit opt-in';
    return {
      bornReady,
      bornAuthorized: false,
      reason,
      grants: {
        bornReady: { granted: true, reason: '' },
        bornAuthorized: { granted: false, reason },
      },
    };
  }
  return {
    bornReady,
    bornAuthorized: true,
    reason: 'class is clean, ceiling is unattended, grant origination opted in',
    grants: {
      bornReady: { granted: true, reason: '' },
      bornAuthorized: { granted: true, reason: '' },
    },
  };
```

Add to the module-header comment block (top of file, after the existing "Callers apply the labels." paragraph):

```js
// Expand-contract (refs #647): permittedGrants' flat top-level
// `bornReady`/`bornAuthorized`/`reason` keys are a transitional twin of the
// per-grant `grants.{bornReady,bornAuthorized}.{granted,reason}` shape — the
// flat single `reason` could pair a granted bornReady with the other grant's
// denial text, which is the bug the per-grant shape fixes. Removal condition:
// delete the flat keys once the installed build's plugin.json version >= the
// release that ships #647 and `grep -rn "permittedGrants" skills/ bin/` shows
// every consumer reading `grants.*`.
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/autonomy.test.js`
Expected: PASS — all tests, new and pre-existing.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/autonomy.js tests/bin-lib/issues/autonomy.test.js
git commit -m "Add per-grant grants object to permittedGrants — flat keys kept as transitional twin, refs #647"
```

---

### Task 2: Migrate `grant-gate.js` to the per-grant shape

**Files:**
- Modify: `bin/lib/issues/grant-gate.js:122-130` (the comment block and the `autoMerge` read)
- Test: `tests/bin-lib/issues/grant-gate.test.js` (run only — no edit expected)

**Interfaces:**
- Consumes: Task 1's `grants.bornAuthorized.granted`.
- Produces: `evaluateGrantGate`'s own return shape is unchanged.

- [ ] **Step 1: Migrate the read**

In `bin/lib/issues/grant-gate.js`, the success return currently reads:

```js
    autoMerge: permitted.bornAuthorized === true,
```

Replace with:

```js
    autoMerge: permitted.grants.bornAuthorized.granted === true,
```

In the comment block directly above the `permittedGrants` call, replace the sentence fragment `bornAuthorized for this class` with `grants.bornAuthorized for this class` so the comment names the key actually read. `grant-gate.js` ships atomically with `autonomy.js` (same build), so no fallback read is needed here.

- [ ] **Step 2: Run the targeted suites**

Run: `node --test tests/bin-lib/issues/grant-gate.test.js tests/bin-lib/issues/autonomy.test.js`
Expected: PASS, no edits to either test file needed (the gate's observable behavior is unchanged).

- [ ] **Step 3: Commit**

```bash
git add bin/lib/issues/grant-gate.js
git commit -m "Read permittedGrants per-grant shape in grant-gate autoMerge decision — refs #647"
```

---

### Task 3: Migrate the skill-text consumers (capture, backlog refine)

**Files:**
- Modify: `skills/capture/SKILL.md` (the born-ready `node -e` block, ~lines 113-116)
- Modify: `skills/backlog/refine-mode.md` (the trust-table `node -e` block, ~lines 188-197)
- Verify only: `skills/_shared/autonomy-ceiling.md`, `skills/backlog/grant-mode.md`, `skills/_shared/work-record.md`, `skills/_shared/policy-schema.md` (prose mentions only — confirm no example log line or snippet reads the flat reason next to a granted flag; none found at plan time)

**Interfaces:**
- Consumes: Task 1's `grants.bornReady.{granted, reason}`.
- Produces: nothing downstream.

- [ ] **Step 1: Migrate capture's born-ready block**

In `skills/capture/SKILL.md`, replace:

```js
  const { bornReady, reason } = permittedGrants({ ceiling, row });
  console.log(JSON.stringify({ bornReady, reason, verdict: row ? row.verdict : 'no-cell' }));
```

with:

```js
  const permitted = permittedGrants({ ceiling, row });
  // Fallback to the flat keys: repo-HEAD skill text can run against an older
  // installed build's autonomy.js (no grants key yet). Remove with #647's
  // transitional twin (see bin/lib/issues/autonomy.js module header).
  const g = (permitted.grants || {}).bornReady || { granted: permitted.bornReady, reason: permitted.reason };
  console.log(JSON.stringify({ bornReady: g.granted, reason: g.reason, verdict: row ? row.verdict : 'no-cell' }));
```

The prose below the block keeps reading `bornReady` from the logged JSON — no prose change needed there, but scan the surrounding paragraph for any sentence asserting the reason accompanies a denial and adjust only if it contradicts the empty-when-granted rule.

- [ ] **Step 2: Migrate refine-mode's trust-table block**

In `skills/backlog/refine-mode.md`, replace:

```js
    const permitted = permittedGrants({ ceiling, row });
```

with (same fallback comment convention as capture):

```js
    const permitted = permittedGrants({ ceiling, row });
    // Fallback to the flat keys: repo-HEAD skill text can run against an older
    // installed build's autonomy.js (no grants key yet). Remove with #647's
    // transitional twin (see bin/lib/issues/autonomy.js module header).
    const gBornReady = (permitted.grants || {}).bornReady || { granted: permitted.bornReady, reason: permitted.reason };
```

and replace the two output fields:

```js
      bornReady: permitted.bornReady,
      reason: permitted.reason,
```

with:

```js
      bornReady: gBornReady.granted,
      reason: gBornReady.reason,
```

- [ ] **Step 3: Verify the prose-only consumers**

Run: `grep -rn -i "permittedGrants" skills/_shared/autonomy-ceiling.md skills/backlog/grant-mode.md skills/_shared/work-record.md skills/_shared/policy-schema.md`
Expected: prose references only (no `node -e` snippet destructuring the return, no example decisions.md log line pairing `bornReady` with a flat `reason`). If a hit does read the flat shape, migrate it with the same fallback pattern as Steps 1-2.

- [ ] **Step 4: Run the conformance-relevant suites**

Run: `node --test tests/skill-conventions.test.js tests/skill-invocation.test.js tests/skill-catalog-completeness.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/capture/SKILL.md skills/backlog/refine-mode.md
git commit -m "Migrate capture and refine-mode to permittedGrants per-grant shape — fallback reads for installed-build skew, refs #647"
```

---

### Task 4: Sweep for unmigrated flat-shape reads

**Files:**
- Test: repo-wide grep sweep (no file edits expected; fix in place if the sweep finds a straggler)

**Interfaces:**
- Consumes: Tasks 1-3 complete.
- Produces: the record's AC-2 evidence.

- [ ] **Step 1: Sweep for remaining flat-shape consumer reads**

Run: `grep -rn -i "permittedGrants" skills/ bin/ tests/ evals/ docs/`
Expected: every hit is one of — (a) `bin/lib/issues/autonomy.js` itself, (b) a consumer reading `grants.*` (directly or via the documented fallback), (c) prose that names the function without destructuring its return, (d) a test asserting the flat compat keys (deliberate — they pin the transitional twin until removal), or (e) a historical plan/doc file under `docs/superpowers/plans/`. Anything else is an unmigrated consumer: migrate it with the Task 3 fallback pattern and amend the sweep.

- [ ] **Step 2: AC-1 verification command**

Run (adapted from the record's AC-1 to the current shape — see the plan header's Premise note):

```bash
node -e "const { permittedGrants } = require('./bin/lib/issues/autonomy.js'); const r = permittedGrants({ ceiling: 'unattended', row: { verdict: 'clean', kind: 'producer' } }); console.log(JSON.stringify(r, null, 2)); if (!(r.grants.bornReady.granted === true && r.grants.bornReady.reason === '' && /opt-in/i.test(r.grants.bornAuthorized.reason))) { throw new Error('AC-1 failed'); }"
```

Expected: prints the full shape, exits 0.

- [ ] **Step 3: Targeted suites, final**

Run: `node --test tests/bin-lib/issues/autonomy.test.js tests/bin-lib/issues/grant-gate.test.js`
Expected: PASS.

- [ ] **Step 4: Commit (only if Step 1 found and fixed a straggler)**

```bash
git add -A -- ':!node_modules'
git commit -m "Migrate remaining permittedGrants flat-shape reads found by sweep — refs #647"
```
