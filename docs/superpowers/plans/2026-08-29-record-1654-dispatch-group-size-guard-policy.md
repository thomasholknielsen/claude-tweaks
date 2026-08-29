# Dispatch Group-Size Guard Policy Lever Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `dispatch`'s file-overlap group-size guard (`plugin/bin/lib/issues/grouping.js`'s `GROUP_SIZE_GUARD_DEFAULT = 10`) a `policy.yml` lever so a project can raise or lower the headless `next` exclusion threshold without editing plugin source.

**Architecture:** `partitionGroupsBySizeGuard(groups, options)` already accepts a `groupSizeGuard` override (tested in `tests/bin-lib/issues/grouping.test.js`) — the gap is purely in wiring, not in the pure function itself. Register a new `dispatch-group-size-guard` integer key in `POLICY_KEYS` (the same `type: 'integer'` shape `dispatch-batch-size`/`dispatch-retry-ceiling` already use), resolve it in `queue-pull-script.md`'s inline script the same way `WORK_LINKS` is already resolved, and thread it into the existing `partitionGroupsBySizeGuard(groups)` call as `{ groupSizeGuard: N }`. Document the new key in both places existing dispatch levers are documented (`policy-schema.md`'s Dispatch & merge table, `work-record-config.md`'s Config Keys table — the two the codebase already keeps in sync for this key family) and add a resolver-level test mirroring the existing `health-open-cap` default/override pattern.

**Tech Stack:** Node.js (`bin/lib/policy-schema.js`'s data-driven `POLICY_KEYS` array + `resolvePolicyKeys`), `node --test`, markdown skill files with embedded bash/node.

**Spec:** `work/1654-spec.md` (materialized from GitHub issue #1654)

## Global Constraints

- Default behavior is unchanged (threshold of 10) when the lever is unset.
- A project setting the lever in `policy.yml` changes dispatch's headless `next` group-size exclusion threshold.
- Existing dispatch/grouping tests pass, plus a new test covering the policy-driven override.
- Follow the established `type: 'integer'` schema shape already used by `dispatch-batch-size`/`dispatch-retry-ceiling` — no new type vocabulary needed.

## Plan-authoring checks (self-review, before dispatch)

None of `plan-authoring-checks.md`'s seven checks apply to this plan: no return-shape widening (the pure function's signature and return shape are unchanged — only a `POLICY_KEYS` array gains a row and a script gains one resolve+pass), no blocking-verification downgrade, no deictic text reorder, no live verbatim command dictated to a task (the `resolve-policy.js --values` call in Task 2 is read-only and already exercised by existing tests the same way), no new degrade clause, no copied-config-with-grants, no renumbering of an enumerated structure, and no new validation gate over an existing output.

---

### Task 1: Register `dispatch-group-size-guard` in `POLICY_KEYS`

**Files:**
- Modify: `plugin/bin/lib/policy-schema.js:61` (immediately after the `dispatch-pick-max-concurrent` row, alongside its sibling dispatch integer levers)
- Test: `tests/resolve-policy-lib.test.js`

**Interfaces:**
- Consumes: nothing new — `resolvePolicyKeys` (existing) already handles any `type: 'integer'` row generically (see `dispatch-retry-ceiling`'s existing coverage).
- Produces: `dispatch-group-size-guard` resolves via `resolvePolicyKeys(['dispatch-group-size-guard'], opts)` and via the CLI `node bin/resolve-policy.js --values dispatch-group-size-guard`, default `10`, `source: 'default'` when unset.

- [ ] **Step 1: Write the failing test**

Add to `tests/resolve-policy-lib.test.js`, immediately after the existing `health-open-cap` test (same file, same pattern — that test is the model this mirrors):

```js
test('dispatch-group-size-guard is schema-registered — default 10, configured value wins', () => {
  const unset = resolvePolicyKeys(['dispatch-group-size-guard'], { policyRaw: null });
  assert.deepStrictEqual(unset['dispatch-group-size-guard'], { value: 10, source: 'default' });
  const set = resolvePolicyKeys(['dispatch-group-size-guard'], { policyRaw: 'dispatch-group-size-guard: 25\n' });
  assert.deepStrictEqual(set['dispatch-group-size-guard'], { value: 25, source: 'policy' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/resolve-policy-lib.test.js`
Expected: FAIL — `unset['dispatch-group-size-guard']` is `{ error: 'unknown-key' }` (or `undefined`), not `{ value: 10, source: 'default' }`, because the key does not exist in `POLICY_KEYS` yet.

- [ ] **Step 3: Write minimal implementation**

In `plugin/bin/lib/policy-schema.js`, insert immediately after the `dispatch-pick-max-concurrent` row (currently line 61, the last of the three `dispatch-*` integer siblings):

```js
  { key: 'dispatch-group-size-guard', type: 'integer', default: 10, summary: "Caps how many members a file-overlap dispatch group may have before headless `next` selection excludes it (still resolvable by name or bare/#N selection).", category: 'merge-safety', tier: 'advanced' },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/resolve-policy-lib.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/policy-schema.js tests/resolve-policy-lib.test.js
git commit -m "Register dispatch-group-size-guard as a policy.yml lever

refs #1654"
```

---

### Task 2: Wire the lever into `queue-pull-script.md`'s oversized-group computation

**Files:**
- Modify: `plugin/skills/dispatch/queue-pull-script.md` (the inline bash/node script referenced by `skills/dispatch/SKILL.md` Step 2)

**Interfaces:**
- Consumes: `dispatch-group-size-guard` from Task 1 (via `bin/resolve-policy.js --values dispatch-group-size-guard`); `partitionGroupsBySizeGuard(groups, { groupSizeGuard })` — the existing pure function's existing options parameter (`plugin/bin/lib/issues/grouping.js`, already tested for this exact option shape).
- Produces: no new interface — the script's `DISPATCH_OVERSIZED_EXCLUDED` output shape (`{records, size, threshold}[]`) is unchanged; only `threshold`'s runtime value now reflects the resolved policy instead of always being the hardcoded `10`.

- [ ] **Step 1: Resolve the lever alongside the existing `WORK_LINKS` resolve**

In `plugin/skills/dispatch/queue-pull-script.md`, immediately after the existing line

```bash
WORK_LINKS=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values work-links)
```

add:

```bash
DISPATCH_GROUP_SIZE_GUARD=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values dispatch-group-size-guard)
```

- [ ] **Step 2: Pass the resolved value into the `node -e` block that calls `partitionGroupsBySizeGuard`**

In the same file's final `node -e "..."` block, change:

```js
  const { oversized, threshold } = partitionGroupsBySizeGuard(groups);
```

to:

```js
  const groupSizeGuard = parseInt(process.argv[6], 10);
  const { oversized, threshold } = partitionGroupsBySizeGuard(groups, { groupSizeGuard });
```

and change the block's trailing positional-argument list from:

```bash
" "$DISPATCH_ELIGIBLE" "$DISPATCH_NATIVE_DEPS" "$DISPATCH_BLOCKED_EXCLUDED_BODY" "$DISPATCH_BLOCKED_EXCLUDED" "$DISPATCH_OVERSIZED_EXCLUDED" > "$DISPATCH_GROUPS"
```

to:

```bash
" "$DISPATCH_ELIGIBLE" "$DISPATCH_NATIVE_DEPS" "$DISPATCH_BLOCKED_EXCLUDED_BODY" "$DISPATCH_BLOCKED_EXCLUDED" "$DISPATCH_OVERSIZED_EXCLUDED" "$DISPATCH_GROUP_SIZE_GUARD" > "$DISPATCH_GROUPS"
```

(`process.argv[6]` is correct: `process.argv[0]` is the node binary, `[1]` is `-e`'s script placeholder in this invocation style is skipped by `-e`, and this script's existing five positional args already occupy `process.argv[1]`..`process.argv[5]` per the current `"$DISPATCH_ELIGIBLE" "$DISPATCH_NATIVE_DEPS" "$DISPATCH_BLOCKED_EXCLUDED_BODY" "$DISPATCH_BLOCKED_EXCLUDED" "$DISPATCH_OVERSIZED_EXCLUDED"` list — verify this against the file's live line before editing, since `node -e "code" arg1 arg2...` puts `arg1` at `process.argv[1]`.)

- [ ] **Step 3: Verify by reading the edited file**

Run: `grep -n "DISPATCH_GROUP_SIZE_GUARD\|groupSizeGuard\|partitionGroupsBySizeGuard" plugin/skills/dispatch/queue-pull-script.md`
Expected: shows the new resolve line, the `groupSizeGuard` parse + pass-through, and the updated positional-argument list — three call sites, none left referring to the old bare `partitionGroupsBySizeGuard(groups)` form.

This file has no automated test harness of its own (`queue-pull-script.md`'s bash/node is embedded prose, not a standalone script under `tests/`) — Task 1's resolver-level test plus `grouping.test.js`'s existing `groupSizeGuard` option coverage (already passing, unmodified) are the acceptance evidence for the wiring's two halves; this step's grep is the mechanical proof the wiring itself landed correctly in prose form.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/dispatch/queue-pull-script.md
git commit -m "Wire dispatch-group-size-guard policy lever into queue-pull-script.md

refs #1654"
```

---

### Task 3: Document the new key

**Files:**
- Modify: `plugin/skills/_shared/policy-schema.md` (Dispatch & merge table, immediately after the `dispatch-pick-max-concurrent` row)
- Modify: `plugin/skills/_shared/work-record-config.md` (Config Keys table, immediately after the `dispatch-batch-size` row — the canonical home `policy-schema.md`'s note says these dispatch keys must be kept in sync with)

**Interfaces:**
- Consumes: nothing — pure documentation.
- Produces: nothing new — a discoverable row in both tables a project owner already reads to find dispatch levers.

- [ ] **Step 1: Add the row to `policy-schema.md`**

In `plugin/skills/_shared/policy-schema.md`, in the "## Dispatch & merge" table, immediately after the `dispatch-pick-max-concurrent` row, add:

```markdown
| `dispatch-group-size-guard` | `policy.yml` | `/claude-tweaks:dispatch` | `10` | Caps how many members a file-overlap group may have before headless `next` selection excludes it — an oversized group still resolves normally via bare `/dispatch #N`/`#N,#M` (a human present, explicitly naming it, is itself the required surfacing) |
```

- [ ] **Step 2: Add the matching row to `work-record-config.md`**

In `plugin/skills/_shared/work-record-config.md`, in the Config keys table, immediately after the `dispatch-batch-size` row, add:

```markdown
| `dispatch-group-size-guard` | `10` | Caps how many members a file-overlap dispatch group may have before headless `next` selection excludes it (still resolvable by name or bare/#N selection) |
```

- [ ] **Step 3: Verify by reading both edited tables**

Run: `grep -n "dispatch-group-size-guard" plugin/skills/_shared/policy-schema.md plugin/skills/_shared/work-record-config.md`
Expected: one matching row in each file.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/_shared/policy-schema.md plugin/skills/_shared/work-record-config.md
git commit -m "Document dispatch-group-size-guard policy lever

refs #1654"
```

---

### Task 4: Full-suite verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: nothing — this task is the plan's own closing gate, run once all three prior tasks have landed.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — in particular `tests/resolve-policy-lib.test.js` (Task 1's new test), `tests/resolve-policy-cli.test.js` (unmodified — the CLI wrapper is data-driven off the same `POLICY_KEYS` array, so a new row needs no CLI-level test to already pass through it), and `tests/bin-lib/issues/grouping.test.js` (unmodified — `partitionGroupsBySizeGuard`'s own `groupSizeGuard` option coverage already exists and is untouched by this plan).

- [ ] **Step 2: Confirm no stray uncommitted changes**

Run: `git status`
Expected: clean working tree (everything from Tasks 1-3 already committed).
