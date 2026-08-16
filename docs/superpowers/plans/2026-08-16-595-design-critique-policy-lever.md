# design-critique policy lever (#595) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `design-critique` policy lever — `off | auto | full`, default `auto` — to the policy schema (resolvable immediately through the schema-driven resolver), pin it in tests, document it in `_shared/policy-schema.md`, and surface it as Pipeline Config Manifesto lever 12.

**Architecture:** One `POLICY_KEYS` entry beside `design-intent`; test pins (count + per-key + resolver default); one row in `_shared/policy-schema.md`'s Auto-mode levers table; Manifesto edits (numbering line, suppression row, lever-table row, override-semantics rows, recommendation-defaults row, `config.yml` example line). One-word update in `skills/design-wrapper/critics.md` so the shipped roster names the same key. No resolver code, no consumer wiring (#598), no `policy.yml` change.

**Tech Stack:** Node (`bin/lib/policy-schema.js`), `node --test`, Markdown.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T160107-spec-597-595-598-599-601/spec-595/work/595-spec.md`

## Global Constraints

- **Key name is `design-critique` (flat kebab-case), NOT the spec's `design.critique`.** Controller ruling: PR #603 (review-passed, at wrap-up) lands `_shared/policy-schema.md`'s "## Key naming" convention (flat kebab-case, never dotted) with `tests/policy-key-naming.test.js` failing any dotted `POLICY_KEYS` key and requiring a `| \`key\` |` row in `_shared/policy-schema.md`; a dotted key would fail on merge. Every place the spec says `design.critique`, write `design-critique`. Values and default are unchanged: `['off', 'auto', 'full']`, default `'auto'`.
- Schema entry fields verbatim: `{ key: 'design-critique', type: 'enum', values: ['off', 'auto', 'full'], default: 'auto', summary: "Sets whether project-local design critics run at review time: never, when the project shows design investment or the record asks, or always.", category: 'pipeline-behavior', tier: 'advanced' }` — placed immediately after the `design-intent` entry. Summary is 118 chars, contains neither `design-critique` nor `design.critique`.
- The `_shared/policy-schema.md` row's Meaning column must NOT be the summary string verbatim (`tests/policy-schema-metadata.test.js` forbids duplicating summaries into that file).
- Manifesto: canonical number **12**; description text literally `off (never) / auto (critics when DESIGN.md exists or the record asks) / full (always)`; suppressed when every record in the run is non-frontend (materialized `surface:` input, same as Design intent (4)); read via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values design-critique`; resolution logged as `AUTO {time} — Manifesto: design-critique resolved to {value} (source: {source}). Reversibility: n/a.`
- No consumer wiring, no change to `design-intent` or any other lever, no `.claude-tweaks/policy.yml` edit.
- Files touched: `bin/lib/policy-schema.js`, `tests/policy-schema.test.js`, `tests/resolve-policy-lib.test.js`, `skills/_shared/policy-schema.md`, `skills/flow/manifesto.md`, `skills/design-wrapper/critics.md`. Nothing else.
- Commit messages: `{Verb} {what} — {detail}` ending `refs #595` (never `closes`/`fixes`).
- Work from the worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-597-595-598-599-601`; verify with `pwd` + `git rev-parse --show-toplevel` before any edit or commit.
- Do not run the full `npm test` inside a task — only the targeted `node --test` files named per task.

---

### Task 1: Schema entry + test pins (TDD)

**Files:**
- Modify: `bin/lib/policy-schema.js:70` (insert after the `design-intent` entry)
- Test: `tests/policy-schema.test.js:53-54` (count pin 49 → 50, plus a new per-key test)
- Test: `tests/resolve-policy-lib.test.js` (new resolver-default test, appended)

**Interfaces:**
- Consumes: `POLICY_KEYS` array shape `{ key, type, values?, default?, summary, category, tier }`; `resolvePolicyKeys(keys, { policyRaw, runConfigRaw })` from `bin/lib/policy-schema.js`.
- Produces: `POLICY_KEYS` entry `design-critique` (enum `off|auto|full`, default `auto`), which Task 2 documents and Task 3 surfaces.

- [ ] **Step 1: Write the failing tests**

In `tests/policy-schema.test.js`, change the count pin (currently `49` on both lines) to `50` and add a comment line in the existing sequence, immediately above the two `assert.strictEqual(... 49)` lines:

```js
  // 49 -> 50, #595 (design-critique lever): off | auto | full, default auto —
  // governs whether project-local design critics run at review time.
  assert.strictEqual(POLICY_KEYS.length, 50);
  assert.strictEqual(new Set(POLICY_KEYS.map((k) => k.key)).size, 50);
```

Then append this test at the end of `tests/policy-schema.test.js`:

```js
test('design-critique is registered as an enum off|auto|full defaulting to auto (#595)', () => {
  const lever = POLICY_KEYS.find((k) => k.key === 'design-critique');
  assert.ok(lever, 'design-critique missing from POLICY_KEYS');
  assert.strictEqual(lever.type, 'enum');
  assert.deepStrictEqual(lever.values, ['off', 'auto', 'full']);
  assert.strictEqual(lever.default, 'auto');
  assert.strictEqual(lever.category, 'pipeline-behavior');
  assert.strictEqual(lever.tier, 'advanced');
  assert.ok(!POLICY_KEYS.some((k) => k.key === 'design.critique'), 'the dotted spelling must not be registered — keys are flat kebab-case');
});
```

Append this test at the end of `tests/resolve-policy-lib.test.js`:

```js
test('design-critique resolves to the schema default auto with source: "default" when unset (#595)', () => {
  const result = resolvePolicyKeys(['design-critique'], { policyRaw: null, runConfigRaw: null });
  assert.deepStrictEqual(result['design-critique'], { value: 'auto', source: 'default' });
  const set = resolvePolicyKeys(['design-critique'], { policyRaw: 'design-critique: full\n' });
  assert.deepStrictEqual(set['design-critique'], { value: 'full', source: 'policy' });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/policy-schema.test.js tests/resolve-policy-lib.test.js 2>&1 | tail -15`
Expected: FAIL — the count pin (`50` vs actual `49`), `design-critique missing from POLICY_KEYS`, and the resolver test (`value: null`/unknown key) all fail.

- [ ] **Step 3: Add the schema entry**

In `bin/lib/policy-schema.js`, immediately after the line beginning `  { key: 'design-intent', type: 'enum', ...` (line 70), insert exactly:

```js
  { key: 'design-critique', type: 'enum', values: ['off', 'auto', 'full'], default: 'auto', summary: "Sets whether project-local design critics run at review time: never, when the project shows design investment or the record asks, or always.", category: 'pipeline-behavior', tier: 'advanced' },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/policy-schema.test.js tests/policy-schema-metadata.test.js tests/resolve-policy-lib.test.js 2>&1 | tail -8`
Expected: `# fail 0` (all three files).

Also run: `node bin/resolve-policy.js --values design-critique`
Expected output: `auto`

- [ ] **Step 5: Commit**

```bash
git add bin/lib/policy-schema.js tests/policy-schema.test.js tests/resolve-policy-lib.test.js
git commit -m "Add design-critique policy lever to the schema — enum off|auto|full, default auto, with count/per-key/resolver pins — refs #595"
```

---

### Task 2: Document the key in `_shared/policy-schema.md` and align `critics.md`

**Files:**
- Modify: `skills/_shared/policy-schema.md` (the `## Auto-mode levers` table — insert one row after the `design-intent` row)
- Modify: `skills/design-wrapper/critics.md:22` (rename `design.critique` → `design-critique`)

**Interfaces:**
- Consumes: Task 1's key name `design-critique`.
- Produces: the `| \`design-critique\` |` row that #603's `policy-key-naming` test will look for on merge; the roster's Lever bullet naming the real key.

- [ ] **Step 1: Add the policy-schema.md row**

In `skills/_shared/policy-schema.md`, in the `## Auto-mode levers` table, insert this row immediately after the `| \`design-intent\` | ...` row:

```markdown
| `design-critique` | `policy.yml` (via `/flow` Manifesto/`config.yml`; a standalone `/claude-tweaks:review` resolves it directly) | `/claude-tweaks:design-wrapper` `review` mode (Step 3.8 critic dispatch, #598) | `auto` | `off`/`auto`/`full` — how eagerly project-local craft critics run at review time; `auto` keys on `DESIGN.md` presence or a `Design-intent:` line, per `skills/design-wrapper/critics.md`. Critique only — writing-context assembly (`_shared/design-craft.md`) is untouched by every value |
```

- [ ] **Step 2: Align critics.md**

In `skills/design-wrapper/critics.md`, on the `- **Lever** —` bullet, change the single occurrence of `` `design.critique` `` to `` `design-critique` ``. No other change to that file.

- [ ] **Step 3: Verify**

```bash
grep -c "| \`design-critique\` |" skills/_shared/policy-schema.md
grep -n "design\.critique" skills/design-wrapper/critics.md skills/_shared/policy-schema.md
grep -c "design-critique" skills/design-wrapper/critics.md
node --test tests/policy-schema-metadata.test.js 2>&1 | tail -3
```

Expected: `1`; the dotted grep prints nothing; `1`; `# fail 0`.

- [ ] **Step 4: Commit**

```bash
git add skills/_shared/policy-schema.md skills/design-wrapper/critics.md
git commit -m "Document design-critique in policy-schema.md's auto-mode levers table and name the flat key in critics.md — refs #595"
```

---

### Task 3: Manifesto lever 12 — Design critique

**Files:**
- Modify: `skills/flow/manifesto.md` (six edits: suppression table, canonical numbering line, lever table, Suppressed footer example, override-semantics table, recommendation-defaults table, `config.yml` example)

**Interfaces:**
- Consumes: key `design-critique` (Task 1), the `resolve-policy.js --run` read shape already used by lever 11.
- Produces: Manifesto lever 12 that `/flow` Step 3 renders and writes to `config.yml`.

- [ ] **Step 1: Suppression table**

In the `## Determine lever suppressions` table, add this row immediately after the `| **Merge verification** (11) | ...` row:

```markdown
| **Design critique** (12) | Every record in the run is non-frontend (materialized `surface:` header is `backend`/`infra` on all of them — the same input Design intent (4) reads; critics never dispatch on a non-frontend diff). Still written to `config.yml` per the "suppression is a UI affordance" rule below |
```

- [ ] **Step 2: Canonical numbering line**

Change `10=Model stance, 11=Merge verification.` to `10=Model stance, 11=Merge verification, 12=Design critique.` (the line beginning `**Canonical lever numbering**`).

- [ ] **Step 3: Lever table row**

Immediately after the `| 11 | Merge verification | ...` row, add:

```markdown
| 12 | Design critique | **{resolved}** | off / **auto** / full | `off (never) / auto (critics when DESIGN.md exists or the record asks) / full (always)` — governs whether project-local craft critics run at review time (`skills/design-wrapper/critics.md`, dispatched by `review` mode Step 3.8). Read via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values design-critique`; Recommended = the resolved value; log its resolution to `decisions.md` as `AUTO {time} — Manifesto: design-critique resolved to {value} (source: {source}). Reversibility: n/a.` |
```

- [ ] **Step 4: Suppressed footer example**

In the example line beginning `**Suppressed (not applicable to this run):** 3 (overlap — ...`, change the ending `**Valid overrides for this run:** 1, 2, 5, 6, 7, 9, 10, 11.` to `**Valid overrides for this run:** 1, 2, 5, 6, 7, 9, 10, 11, 12.` — and, in the same sentence's suppressed list, no change (the example run's records are frontend-eligible; keep the example consistent by not adding 12 to the suppressed list).

- [ ] **Step 5: Override semantics rows**

In the `#### Override semantics` table, immediately after the `| Merge verification | \`off\` | ...` row, add:

```markdown
| Design critique | `full` | Every web-track UI diff gets the full critic roster at review time regardless of `DESIGN.md` presence |
| Design critique | `off` | No project-local critics run at review time; Impeccable's own `critique`/`audit` and the finish reviewer are unaffected |
```

- [ ] **Step 6: Recommendation defaults row**

In the `## Recommendation defaults (when no arg and no policy)` table, immediately after the `| Merge verification | derived (...) | ...` row, add:

```markdown
| Design critique | `auto` | Critics run when the project shows design investment (`DESIGN.md`) or the record asks (`Design-intent:`); `full`/`off` are explicit opt-in/opt-out |
```

- [ ] **Step 7: config.yml example**

In the `config.yml` YAML example under `**On approval (option 1):**`, add the line `design-critique: auto` immediately after `merge-verification: merge-when-green`.

- [ ] **Step 8: Verify**

```bash
grep -n "Design critique" skills/flow/manifesto.md
grep -n "critics when DESIGN.md exists" skills/flow/manifesto.md
grep -n "design-critique" skills/flow/manifesto.md
grep -c "12=Design critique" skills/flow/manifesto.md
node --test tests/flow-run-dir-anchoring.test.js tests/merge-verification-gate-conformance.test.js 2>&1 | tail -3
```

Expected: "Design critique" appears on ≥5 lines (suppression row, numbering line, lever row, two override rows, recommendation row); the description grep returns the lever row; `design-critique` appears on ≥3 lines (suppression row's mention is optional; lever row resolver call + AUTO line, config.yml line, and the recommendation row's parenthetical if any); count `1`; `# fail 0` for both test files.

- [ ] **Step 9: Commit**

```bash
git add skills/flow/manifesto.md
git commit -m "Add Manifesto lever 12 Design critique — resolver-read, suppressed on all-non-frontend runs, logged on resolution — refs #595"
```
