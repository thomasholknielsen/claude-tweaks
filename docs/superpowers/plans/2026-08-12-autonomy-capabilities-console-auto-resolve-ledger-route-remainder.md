# Autonomy Capabilities: consoleAutoResolve and ledgerRouteRemainder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two `unattended`-only bookkeeping capabilities — `consoleAutoResolve` and `ledgerRouteRemainder` — to `bookkeepingPermissions(ceiling)` in `bin/lib/issues/autonomy.js`, and document them in the autonomy-ceiling contract and policy schema. This sub-issue (#348) is deliberately inert: no consumer file reads these new keys yet.

**Architecture:** `bookkeepingPermissions(ceiling)` already returns a flat object of boolean capability flags computed from `atLeast(tier, minimum)`. The two new keys follow the exact same shape as the existing `opsAckAutoAcknowledge` (gated at `unattended` only) — no new helper functions, no new module exports, no signature change.

**Tech Stack:** Node.js (CommonJS), `node --test` (built-in test runner), Markdown docs.

## Global Constraints

- Pure permissions only — do not add behavior, logging, or side effects to `autonomy.js` (spec Gotchas).
- An unrecognized ceiling value must resolve the two new keys to `false`, same as every other capability (existing `isCeiling` fallback-to-`supervised` path).
- Do not touch `skills/_shared/auto-mode-contract.md`, `wrap-up/review-console.md`, `ledger/resolve-gate.md`, or `review/step3-routing.md` — those are sibling sub-issues' scope (Non-Goals).
- Per CLAUDE.md's cardinality rule: describe sets by reference, not literal counts, in any prose you touch.
- Read `docs/skill-authoring.md` before editing either `skills/_shared/*.md` file (Task 2, Task 3).

---

### Task 1: Extend `bookkeepingPermissions` with the two new capability keys

**Files:**
- Modify: `bin/lib/issues/autonomy.js:170-177` (the `bookkeepingPermissions` function)
- Test: `bin/lib/issues/tests/autonomy.test.js:312-316` (extend the existing fallback test), plus three new tier-specific tests

**Interfaces:**
- Consumes: nothing new — reuses `isCeiling(ceiling)` and `atLeast(tier, minimum)`, both already defined above `bookkeepingPermissions` in the same file.
- Produces: `bookkeepingPermissions(ceiling)` return shape gains `consoleAutoResolve: boolean` and `ledgerRouteRemainder: boolean`, both `true` only when `atLeast(tier, 'unattended')`. No other function in this codebase calls these two keys yet (this sub-issue is deliberately inert — Acceptance Criterion 5 checks nothing outside this file/its test/the two docs reads them).

- [ ] **Step 1: Write the failing tests for the two new keys at all three tiers**

Add these tests immediately after the existing `bookkeepingPermissions at unattended unlocks all three` test (after line 310) in `bin/lib/issues/tests/autonomy.test.js`:

```javascript
test('bookkeepingPermissions at supervised unlocks neither consoleAutoResolve nor ledgerRouteRemainder', () => {
  const result = bookkeepingPermissions('supervised');
  assert.strictEqual(result.consoleAutoResolve, false);
  assert.strictEqual(result.ledgerRouteRemainder, false);
});

test('bookkeepingPermissions at trusted unlocks neither consoleAutoResolve nor ledgerRouteRemainder', () => {
  const result = bookkeepingPermissions('trusted');
  assert.strictEqual(result.consoleAutoResolve, false);
  assert.strictEqual(result.ledgerRouteRemainder, false);
});

test('bookkeepingPermissions at unattended unlocks consoleAutoResolve and ledgerRouteRemainder', () => {
  const result = bookkeepingPermissions('unattended');
  assert.strictEqual(result.consoleAutoResolve, true);
  assert.strictEqual(result.ledgerRouteRemainder, true);
});
```

Then update the three existing `assert.deepEqual(bookkeepingPermissions(...), {...})` object-literal assertions (lines 288-310) to include the two new keys at their expected values, so `deepEqual` doesn't fail on the now-larger returned object:

```javascript
test('bookkeepingPermissions at supervised unlocks nothing', () => {
  assert.deepEqual(bookkeepingPermissions('supervised'), {
    ledgerNarrowing: false,
    queueWriteAutoFile: false,
    opsAckAutoAcknowledge: false,
    consoleAutoResolve: false,
    ledgerRouteRemainder: false,
  });
});

test('bookkeepingPermissions at trusted unlocks ledger narrowing and queue-write auto-file, not ops-ack', () => {
  assert.deepEqual(bookkeepingPermissions('trusted'), {
    ledgerNarrowing: true,
    queueWriteAutoFile: true,
    opsAckAutoAcknowledge: false,
    consoleAutoResolve: false,
    ledgerRouteRemainder: false,
  });
});

test('bookkeepingPermissions at unattended unlocks all three', () => {
  assert.deepEqual(bookkeepingPermissions('unattended'), {
    ledgerNarrowing: true,
    queueWriteAutoFile: true,
    opsAckAutoAcknowledge: true,
    consoleAutoResolve: true,
    ledgerRouteRemainder: true,
  });
});
```

Also extend the existing fallback test (lines 312-316) — it already compares full-object equality against a freshly computed `supervised` baseline, so it automatically covers the two new keys once Step 1's `assert.deepEqual` calls above are updated; no change needed to that test's body itself, but re-read it after this step to confirm it still reads correctly with the new keys present in `supervised`'s shape:

```javascript
test('bookkeepingPermissions falls back to supervised for undefined or an unrecognized tier', () => {
  const supervised = bookkeepingPermissions('supervised');
  assert.deepEqual(bookkeepingPermissions(undefined), supervised);
  assert.deepEqual(bookkeepingPermissions('bogus-tier'), supervised);
});
```

Finally, extend the discrimination test (lines 318-332) so it also proves the new keys are tier-gated correctly (mirrors the existing `queueWriteAutoFile` mis-gating check):

```javascript
test('reverting bookkeepingPermissions\' new-key tier thresholds fails the unattended-tier assertion (test discriminates)', () => {
  // Confirms the unattended-tier test above actually distinguishes unattended
  // from trusted for the two new keys, not just reads correct -- gate
  // consoleAutoResolve/ledgerRouteRemainder on 'trusted' instead of 'unattended'
  // and the unattended-tier case must fail.
  const wronglyGated = (ceiling) => {
    const tier = CEILINGS.includes(ceiling) ? ceiling : 'supervised';
    const atLeastLocal = (t, min) => CEILINGS.indexOf(t) >= CEILINGS.indexOf(min);
    return {
      ledgerNarrowing: atLeastLocal(tier, 'trusted'),
      queueWriteAutoFile: atLeastLocal(tier, 'trusted'),
      opsAckAutoAcknowledge: atLeastLocal(tier, 'unattended'),
      consoleAutoResolve: atLeastLocal(tier, 'trusted'),
      ledgerRouteRemainder: atLeastLocal(tier, 'trusted'),
    };
  };
  assert.notDeepEqual(wronglyGated('unattended'), bookkeepingPermissions('unattended'));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/issues/tests/autonomy.test.js`
Expected: FAIL — the three updated `deepEqual` assertions and the three new tier tests fail because `bookkeepingPermissions` does not yet return `consoleAutoResolve`/`ledgerRouteRemainder`.

- [ ] **Step 3: Implement the two new keys**

In `bin/lib/issues/autonomy.js`, replace the `bookkeepingPermissions` function (lines 170-177):

```javascript
function bookkeepingPermissions(ceiling) {
  const tier = isCeiling(ceiling) ? ceiling : 'supervised';
  return {
    ledgerNarrowing: atLeast(tier, 'trusted'),
    queueWriteAutoFile: atLeast(tier, 'trusted'),
    opsAckAutoAcknowledge: atLeast(tier, 'unattended'),
    consoleAutoResolve: atLeast(tier, 'unattended'),
    ledgerRouteRemainder: atLeast(tier, 'unattended'),
  };
}
```

Also update the comment immediately above it (lines 162-169) — it currently says "The three bookkeeping capabilities" and enumerates only the original three; update it to describe the set by reference rather than a literal count (mirrors the cardinality-rule fix Task 2 makes in `autonomy-ceiling.md`):

```javascript
// The bookkeeping capabilities the retired unattended-tier lever used to gate
// as one on/off boolean, now unlocked individually by the merged autonomy
// ceiling: ledger Phase 2 narrowing and queue-write auto-file at 'trusted'+;
// ops-ack auto-acknowledge, console auto-resolve, and ledger route-remainder
// held back to 'unattended' (see skills/_shared/autonomy-ceiling.md for what
// each one does). An unrecognized ceiling falls through to 'supervised' --
// same handling as permittedGrants, so a typo denies everything rather than
// granting it.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/issues/tests/autonomy.test.js`
Expected: PASS — all tests green, including the three new tier tests and the updated discrimination test.

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/autonomy.js bin/lib/issues/tests/autonomy.test.js
git commit -m "Add consoleAutoResolve and ledgerRouteRemainder bookkeeping capabilities

Both unlocked at the unattended ceiling only, exactly parallel to the
existing opsAckAutoAcknowledge gating. Pure permission bits -- no
consumer reads them yet (deliberately inert, expand-contract).

refs #348"
```

---

### Task 2: Document the two capabilities in `skills/_shared/autonomy-ceiling.md`

**Files:**
- Modify: `skills/_shared/autonomy-ceiling.md` (header referenced-by list ~line 9, "What it authorizes" table ~line 87, Bookkeeping capabilities intro ~line 91, Bookkeeping capabilities table ~line 94-98)

**Interfaces:**
- Consumes: nothing (pure documentation).
- Produces: nothing consumed by code — Task 3 only needs to know this file's path exists to point at it (already true before this task runs).

- [ ] **Step 1: Read `docs/skill-authoring.md`**

Read the file in full before editing — this is a required pre-check per this plan's Global Constraints and the spec's Gotchas.

- [ ] **Step 2: Reword the Bookkeeping capabilities intro away from the literal count**

Current text (line 91):

```
Three narrow, opt-in, logged, fully reversible bookkeeping behaviors, resolved by
```

Replace with:

```
The narrow, opt-in, logged, fully reversible bookkeeping behaviors in the table below, resolved by
```

- [ ] **Step 3: Add the two new rows to the Bookkeeping capabilities table**

After the `opsAckAutoAcknowledge` row (line 98) in the table starting at line 94, add:

```
| `consoleAutoResolve` | `unattended` only | The Review Console resolves every section (batch table, `M#`, `Q#`, `U#`) per its own defaults with zero `AskUserQuestion` calls, rendering as an informational report instead of a prompt. |
| `ledgerRouteRemainder` | `unattended` only | Extends `ledgerNarrowing` -- a ledger item whose blocker reason misses the four-category floor also auto-routes to `Route to a record -> Keep (backlog)` (never `Fix anyway`/`Accept`/`Drop`). |
```

- [ ] **Step 4: Update the `unattended` row of "What it authorizes"**

Current text (line 87):

```
| `unattended` | Everything `trusted` allows, plus a third bookkeeping capability (`opsAckAutoAcknowledge`) and machine-originated `auto:build`. **The `auto:build` half is shut behind its own opt-in** — see below. |
```

Replace with:

```
| `unattended` | Everything `trusted` allows, plus the `unattended`-only rows of the Bookkeeping capabilities table below (`opsAckAutoAcknowledge`, `consoleAutoResolve`, `ledgerRouteRemainder`) and machine-originated `auto:build`. **The `auto:build` half is shut behind its own opt-in** — see below. |
```

- [ ] **Step 5: Update the header's referenced-by list and cardinality wording**

Current text (lines 9-12):

```
bookkeeping capabilities this file also documents — `ledger/resolve-gate.md` (Phase 2 narrowing),
`wrap-up/review-console.md` (queue-write auto-file), and `wrap-up/nothing-left-behind.md` (ops-ack
auto-acknowledge).
```

Replace with (append each new capability's consumer file to its existing per-file parenthetical rather than adding duplicate file entries):

```
bookkeeping capabilities this file also documents — `ledger/resolve-gate.md` (Phase 2 narrowing,
route remainder), `wrap-up/review-console.md` (queue-write auto-file, console auto-resolve), and
`wrap-up/nothing-left-behind.md` (ops-ack auto-acknowledge).
```

And reword the preceding "for the three bookkeeping capabilities" (line 9) away from the literal count — the full sentence spans lines 9-10, so replace `"and — for the three\nbookkeeping capabilities this file also documents —"` with `"and — for the bookkeeping capabilities this file also documents —"`.

- [ ] **Step 6: Add the review-floor ceiling-conditional default paragraph**

Immediately after the "Restricted-disposition rule" content that follows the Floor rule section (i.e., after the Bookkeeping capabilities subsection's existing content ends, before the next top-level `##` heading), add a new paragraph:

```markdown
### Review-severity-floor ceiling-conditional default

At the `unattended` ceiling, `review-severity-floor`'s skill default is `medium` instead of the
project-wide `low` (see `_shared/policy-schema.md`'s lever row). An explicit CLI arg, run config, or
project-policy value still wins under the standard precedence chain (`_shared/auto-mode-contract.md`)
— the ceiling only moves the *default*, it never overrides a stated choice.

This paragraph documents an intended future behavior, not a code change landed by this sub-issue: no
file this sub-issue touches reads the ceiling to compute this default. The actual read/default site
is `skills/review/step3-routing.md` (not `skills/review/SKILL.md`, which never mentions this lever) —
wiring the ceiling into that resolution is a later sub-issue's scope.
```

- [ ] **Step 7: Commit**

```bash
git add skills/_shared/autonomy-ceiling.md
git commit -m "Document consoleAutoResolve and ledgerRouteRemainder in the autonomy-ceiling contract

New Bookkeeping capabilities rows, unattended row of What it authorizes,
referenced-by list, and the review-severity-floor ceiling-conditional
default note (documentation only -- the read site isn't wired yet).

refs #348"
```

---

### Task 3: Note the ceiling-conditional default in `skills/_shared/policy-schema.md`

**Files:**
- Modify: `skills/_shared/policy-schema.md:149` (the `review-severity-floor` lever row)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by code — this is the schema table's description column, pointing at Task 2's new paragraph in `autonomy-ceiling.md`.

- [ ] **Step 1: Read `docs/skill-authoring.md`**

Already read in Task 2, Step 1 if these tasks run in the same session — otherwise read it again before this edit, per this plan's Global Constraints.

- [ ] **Step 2: Update the `review-severity-floor` row's description**

Current text (line 149):

```
| `review-severity-floor` | `policy.yml` (via `/flow` Manifesto/`config.yml` only — no standalone direct-read site exists) | `/claude-tweaks:review` | `low` | `none`/`low`/`medium` auto-apply cutoff |
```

Replace the last column with a version that adds the ceiling-conditional default pointer, keeping the row's existing column shape (do not restate the mechanism — point at `_shared/autonomy-ceiling.md`):

```
| `review-severity-floor` | `policy.yml` (via `/flow` Manifesto/`config.yml` only — no standalone direct-read site exists) | `/claude-tweaks:review` | `low` | `none`/`low`/`medium` auto-apply cutoff; ceiling-conditional default at `unattended` — see `_shared/autonomy-ceiling.md` |
```

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/policy-schema.md
git commit -m "Point review-severity-floor's schema row at the ceiling-conditional default

refs #348"
```

---

### Task 4: Final verification sweep

**Files:**
- None modified — this task only runs checks.

**Interfaces:**
- Consumes: the full state of the working tree after Tasks 1-3.
- Produces: nothing — this task is the acceptance-criteria gate before handoff.

- [ ] **Step 1: Run the full autonomy test suite**

Run: `node --test bin/lib/issues/tests/autonomy.test.js`
Expected: PASS — all tests green, including every test added/modified in Task 1.

- [ ] **Step 2: Run the full project test suite**

Run: `npm test > /tmp/npm-test-output.txt 2>&1; tail -100 /tmp/npm-test-output.txt`
Expected: PASS — redirect to a file first (long runs truncate in the terminal), then inspect the tail for the final pass/fail summary. If anything fails, fix it and re-run before proceeding.

- [ ] **Step 3: Confirm the two new capability names appear only where this sub-issue put them**

Run: `git grep -n "consoleAutoResolve\|ledgerRouteRemainder"`
Expected: matches only in `bin/lib/issues/autonomy.js`, `bin/lib/issues/tests/autonomy.test.js`, `skills/_shared/autonomy-ceiling.md`, and `skills/_shared/policy-schema.md` — zero matches under `skills/wrap-up/`, `skills/ledger/`, or `skills/review/`. This proves the sub-issue stayed inert (Acceptance Criterion 5).

- [ ] **Step 4: Confirm the two doc-grep acceptance criteria**

Run: `grep -in "consoleautoresolve" skills/_shared/autonomy-ceiling.md` and `grep -in "ledgerrouteremainder" skills/_shared/autonomy-ceiling.md`
Expected: each returns at least one match inside a Bookkeeping-capabilities table row, and that row's text contains a verb describing what happens (not just the capability name) — matches Task 2 Step 3's added rows.

Run: `grep -in "unattended" skills/_shared/policy-schema.md`
Expected: matches the `review-severity-floor` row's description added in Task 3, and that match points at `_shared/autonomy-ceiling.md`.

No commit for this task — it is a verification gate only. If any check fails, return to the relevant task, fix, and re-commit there.
