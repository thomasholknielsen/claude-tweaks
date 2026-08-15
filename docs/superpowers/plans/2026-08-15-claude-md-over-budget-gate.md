# Claude-MD Over-Budget Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the wrap-up `claude-md` curation row's gate open purely because `CLAUDE.md`/rules grew past its size budget, not only on a renamed command, a Don't candidate, a contradicted convention, or a recorded incident.

**Architecture:** Add one new deterministic fact, `claudeMdOverBudget`, to `bin/lib/wrap-up/facts.js`'s `gatherFacts()` — a static filesystem re-check of the same `harness-health.always-loaded-budget`/`harness-health.scoped-rule-budget` policy keys `skills/_shared/harness-health-analysis.md`'s existing tiered line-budget check already reads. Wire the new fact into the `claude-md` row's gate `anyOf` array in `bin/lib/wrap-up/registry.js`, and add its plain-language reason pair to `bin/lib/wrap-up/engine-plan.js`'s `FACT_REASONS`. No new budget concept, no changes to the existing check itself — only a new trigger that reaches it.

**Tech Stack:** Node.js (`node --test`), no external dependencies. Reuses `bin/lib/harness-health/scope.js`'s `listClaudeMd`/`listRules` and `bin/resolve-policy.js`'s `--values` CLI mode.

**Spec:** Record #320 (materialized at `work/320-spec.md` in this worktree) — "wrap-up: claude-md-curation has no aggregate CLAUDE.md/rules size-budget check."

## Global Constraints

- Reuse the existing tiered-budget comparison (`wc -l` vs. `harness-health.always-loaded-budget` / `harness-health.scoped-rule-budget`, resolved via `bin/resolve-policy.js`) — never a second, hand-maintained budget constant.
- The new fact is a static snapshot at HEAD, not a diff signal — it must never be nested inside `gatherFacts()`'s `if (isRepo)` block.
- Check every in-scope target (`CLAUDE.md`, each rule file) independently against its own tier's budget — never a summed total across all of them.

---

## File Structure

- `bin/lib/wrap-up/facts.js` — add `lineCount()`, `resolveBudgets()`, `computeClaudeMdOverBudget()`; wire the result into `gatherFacts()`'s return object as `claudeMdOverBudget`.
- `bin/lib/wrap-up/tests/facts.test.js` — add coverage for the new fact (over-budget CLAUDE.md, in-budget CLAUDE.md, over-budget scoped rule).
- `bin/lib/wrap-up/registry.js` — add `claudeMdOverBudget` to the `claude-md` row's gate `anyOf`.
- `bin/lib/wrap-up/tests/registry.test.js` — no changes needed (asserted in Task 2; it has no hardcoded gate shape).
- `bin/lib/wrap-up/engine-plan.js` — add a `FACT_REASONS.claudeMdOverBudget` entry.
- `bin/lib/wrap-up/tests/engine-plan.test.js` — add a test asserting the `claude-md` gate opens on `claudeMdOverBudget` alone, and stays closed when every signal (including the new fact) is false.
- `skills/wrap-up/claude-md-curation.md` — add a `claudeMdOverBudget` row to the "What opened this row" table (documentation only, no test).

---

### Task 1: Add `computeClaudeMdOverBudget()` to `facts.js` and wire it into `gatherFacts()`

**Files:**
- Modify: `bin/lib/wrap-up/facts.js`
- Test: `bin/lib/wrap-up/tests/facts.test.js`

**Interfaces:**
- Consumes: `listClaudeMd(root)` / `listRules(root)` from `bin/lib/harness-health/scope.js` (`listClaudeMd` returns `[{ kind: 'claude-md', id: 'CLAUDE', path }]` or `[]`; `listRules` returns `[{ kind: 'rule', id, path, pathGlobs }]`, `pathGlobs` empty for an unscoped/always-loaded rule).
- Produces: `gatherFacts({ cwd, base }).claudeMdOverBudget` (boolean) — read by Task 2's registry gate and Task 3's `FACT_REASONS`.

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `bin/lib/wrap-up/tests/facts.test.js` (after the existing `claudeMdCommandRenamed is false when CLAUDE.md is absent at base` test, same file, no new `describe`/`before` needed — each test below builds its own throwaway temp dir the same way the existing `headingRenamed` tests do):

```javascript
test('gatherFacts claudeMdOverBudget is true when CLAUDE.md exceeds the always-loaded budget', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapup-facts-budget-'));
  try {
    git(['init', '-q'], dir);
    git(['config', 'user.email', 'test@example.com'], dir);
    git(['config', 'user.name', 'Test'], dir);
    // Default always-loaded-budget is 150 lines (bin/lib/policy-schema.js) —
    // no .claude-tweaks/policy.yml in this temp dir, so the schema default applies.
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), `${'line\n'.repeat(151)}`);
    git(['add', '.'], dir);
    git(['commit', '-q', '-m', 'over budget'], dir);
    const sha = git(['rev-parse', 'HEAD'], dir);
    const f = gatherFacts({ cwd: dir, base: sha });
    assert.strictEqual(f.claudeMdOverBudget, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('gatherFacts claudeMdOverBudget is false when CLAUDE.md is within budget and no rules exist', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapup-facts-budget-ok-'));
  try {
    git(['init', '-q'], dir);
    git(['config', 'user.email', 'test@example.com'], dir);
    git(['config', 'user.name', 'Test'], dir);
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'short\n');
    git(['add', '.'], dir);
    git(['commit', '-q', '-m', 'in budget'], dir);
    const sha = git(['rev-parse', 'HEAD'], dir);
    const f = gatherFacts({ cwd: dir, base: sha });
    assert.strictEqual(f.claudeMdOverBudget, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('gatherFacts claudeMdOverBudget is true when a scoped rule exceeds the scoped-rule budget', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrapup-facts-budget-rule-'));
  try {
    git(['init', '-q'], dir);
    git(['config', 'user.email', 'test@example.com'], dir);
    git(['config', 'user.name', 'Test'], dir);
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'short\n');
    fs.mkdirSync(path.join(dir, '.claude', 'rules'), { recursive: true });
    // Default scoped-rule-budget is 30 lines. A `paths:` key makes this a
    // scoped rule, not an always-loaded one.
    const ruleBody = ['---', 'paths:', '  - src/**', '---', ...Array(31).fill('line')].join('\n');
    fs.writeFileSync(path.join(dir, '.claude', 'rules', 'scoped.md'), `${ruleBody}\n`);
    git(['add', '.'], dir);
    git(['commit', '-q', '-m', 'scoped rule over budget'], dir);
    const sha = git(['rev-parse', 'HEAD'], dir);
    const f = gatherFacts({ cwd: dir, base: sha });
    assert.strictEqual(f.claudeMdOverBudget, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test bin/lib/wrap-up/tests/facts.test.js`
Expected: FAIL — `claudeMdOverBudget` is `undefined`, not `true`/`false` (the fact doesn't exist yet).

- [ ] **Step 3: Implement `computeClaudeMdOverBudget()` and wire it in**

In `bin/lib/wrap-up/facts.js`, add near the top (after the existing `require` lines):

```javascript
const { listClaudeMd, listRules } = require('../harness-health/scope');
```

Add these three functions after `computeClaudeMdCommandRenamed` (before `gatherFacts`):

```javascript
// wc -l semantics: count of newline characters. Matches
// harness-health-analysis.md Step 1 check 4's own `wc -l` invocation exactly,
// so this fact and that check never disagree about what "over budget" means
// for the same file.
function lineCount(filePath) {
  try {
    const out = execFileSync('wc', ['-l', filePath], { encoding: 'utf8' });
    return Number(out.trim().split(/\s+/)[0]);
  } catch {
    return 0;
  }
}

// Re-resolves the same two policy keys harness-health-analysis.md's tiered
// line-budget check reads, via the same CLI (bin/resolve-policy.js) — never a
// second, hand-maintained budget constant. Falls back to the schema defaults
// (bin/lib/policy-schema.js: 30 / 150) if resolution fails for any reason,
// matching this file's existing fail-open shape for every other check.
function resolveBudgets(cwd) {
  try {
    const scriptPath = path.join(__dirname, '..', '..', 'resolve-policy.js');
    const out = execFileSync(
      process.execPath,
      [scriptPath, '--values', 'harness-health.scoped-rule-budget', 'harness-health.always-loaded-budget'],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const [scopedRuleBudget, alwaysLoadedBudget] = out.trim().split('\n').map(Number);
    return { scopedRuleBudget, alwaysLoadedBudget };
  } catch {
    return { scopedRuleBudget: 30, alwaysLoadedBudget: 150 };
  }
}

// A static filesystem snapshot at HEAD, not a diff signal — unlike
// claudeMdCommandRenamed/headingRenamed/renamedOrDeleted, this has no isRepo
// dependency and must not be nested inside gatherFacts()'s `if (isRepo)`
// block. Checks CLAUDE.md and every rule file independently against its own
// tier's budget (never a summed total) — one over-budget target is enough.
function computeClaudeMdOverBudget(cwd) {
  const { scopedRuleBudget, alwaysLoadedBudget } = resolveBudgets(cwd);
  const targets = [
    ...listClaudeMd(cwd).map((t) => ({ path: t.path, budget: alwaysLoadedBudget })),
    ...listRules(cwd).map((t) => ({
      path: t.path,
      budget: t.pathGlobs.length > 0 ? scopedRuleBudget : alwaysLoadedBudget,
    })),
  ];
  return targets.some((t) => lineCount(t.path) > t.budget);
}
```

In `gatherFacts()`, add the computed fact after the existing static checks and include it in the returned object:

```javascript
  const skillsLibraryExists = fs.existsSync(path.join(cwd, '.claude', 'skills'));
  const docsTreeNonEmpty = dirNonEmpty(path.join(cwd, 'docs'));
  const journeyFiles = listMarkdownFiles(path.join(cwd, 'docs', 'journeys'), 'docs/journeys');
  const claudeMdOverBudget = computeClaudeMdOverBudget(cwd);

  return {
    isRepo,
    changedFiles,
    renamedDeleted,
    skillsLibraryExists,
    multiFileDiff: changedFiles.length >= 2,
    docsTreeNonEmpty,
    journeysExist: journeyFiles.length > 0,
    journeyFiles,
    claudeMdCommandRenamed,
    renamedOrDeleted: renamedDeleted.length > 0,
    headingRenamed,
    claudeMdOverBudget,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/wrap-up/tests/facts.test.js`
Expected: PASS (all tests, including the 3 new ones and every pre-existing one in this file).

- [ ] **Step 5: Commit**

```bash
git add bin/lib/wrap-up/facts.js bin/lib/wrap-up/tests/facts.test.js
git commit -m "wrap-up: add claudeMdOverBudget fact to facts.js"
```

---

### Task 2: Wire `claudeMdOverBudget` into the `claude-md` row's gate

**Files:**
- Modify: `bin/lib/wrap-up/registry.js:38`
- Test: `bin/lib/wrap-up/tests/engine-plan.test.js`

**Interfaces:**
- Consumes: `facts.claudeMdOverBudget` (Task 1's boolean output), read by `bin/lib/wrap-up/engine-plan.js`'s `evaluateGate()` (unmodified — `g.anyOf.find((key) => facts[key])` already supports multiple keys with no code change).
- Produces: the `claude-md` row's gate opens whenever `claudeMdOverBudget` is `true`, independent of the other three signals.

- [ ] **Step 1: Write the failing test**

Add to `bin/lib/wrap-up/tests/engine-plan.test.js`, immediately after the existing `'claude-md gate opens on fact OR signal'` test:

```javascript
test('claude-md gate opens on claudeMdOverBudget alone', () => {
  const wl = buildWorklist({ facts: { ...FACTS, claudeMdOverBudget: true }, signals: {}, ceremonyProfile: 'standard', budgets: {} });
  assert.strictEqual(wl.rows.find((r) => r.id === 'claude-md').gate, 'open');
});

test('claude-md gate stays closed when claudeMdOverBudget is false alongside every other signal', () => {
  const wl = buildWorklist({ facts: { ...FACTS, claudeMdOverBudget: false }, signals: {}, ceremonyProfile: 'standard', budgets: {} });
  assert.strictEqual(wl.rows.find((r) => r.id === 'claude-md').gate, 'closed');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/wrap-up/tests/engine-plan.test.js`
Expected: FAIL on `'claude-md gate opens on claudeMdOverBudget alone'` — the fact isn't in the row's `anyOf` yet, so `facts.claudeMdOverBudget = true` has no effect and the gate reads `closed`.

- [ ] **Step 3: Add the fact to the registry gate**

In `bin/lib/wrap-up/registry.js`, change the `claude-md` row's gate:

```javascript
    gate: Object.freeze({ kind: 'facts', anyOf: ['claudeMdCommandRenamed', 'claudeMdOverBudget'], orSignals: ['dontCandidate', 'contradictedConvention', 'incidentRecorded'] }),
```

(only the `anyOf` array changes — `orSignals` and everything else on the row stays as-is).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test bin/lib/wrap-up/tests/engine-plan.test.js bin/lib/wrap-up/tests/registry.test.js`
Expected: PASS — both new tests, the pre-existing `'claude-md gate opens on fact OR signal'` test (unaffected — `claudeMdCommandRenamed: true` still opens it), and every `registry.test.js` test (no hardcoded gate shape there).

- [ ] **Step 5: Commit**

```bash
git add bin/lib/wrap-up/registry.js bin/lib/wrap-up/tests/engine-plan.test.js
git commit -m "wrap-up: open claude-md gate on claudeMdOverBudget"
```

---

### Task 3: Add the plain-language gate reason and document the new signal

**Files:**
- Modify: `bin/lib/wrap-up/engine-plan.js:18` (insert after the `claudeMdCommandRenamed` entry)
- Modify: `skills/wrap-up/claude-md-curation.md` ("What opened this row" table)

**Interfaces:**
- Consumes: nothing new — reads the `claudeMdOverBudget` key already present on `facts` since Task 1, and the row's `anyOf` array already updated in Task 2.
- Produces: `evaluateGate()`'s rendered `gateReason` string now names `claudeMdOverBudget` in both its open and closed forms, instead of falling back to the generic `` `${key} true` ``/`` `no ${key}` `` default.

- [ ] **Step 1: Write the failing test**

Add to `bin/lib/wrap-up/tests/engine-plan.test.js`:

```javascript
test('claude-md gateReason names claudeMdOverBudget in both directions', () => {
  const open = buildWorklist({ facts: { ...FACTS, claudeMdOverBudget: true }, signals: {}, ceremonyProfile: 'standard', budgets: {} });
  assert.strictEqual(
    open.rows.find((r) => r.id === 'claude-md').gateReason,
    'CLAUDE.md/rules over the size budget');

  const closed = buildWorklist({ facts: { ...FACTS, claudeMdOverBudget: false }, signals: {}, ceremonyProfile: 'standard', budgets: {} });
  assert.strictEqual(
    closed.rows.find((r) => r.id === 'claude-md').gateReason,
    'CLAUDE.md Commands section unchanged, CLAUDE.md/rules within budget, no signals raised');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/wrap-up/tests/engine-plan.test.js`
Expected: FAIL — with no `FACT_REASONS.claudeMdOverBudget` entry, `evaluateGate()` falls back to `` `claudeMdOverBudget true` `` (open case) and `` `no claudeMdOverBudget` `` (closed case), not the asserted strings.

- [ ] **Step 3: Add the `FACT_REASONS` entry**

In `bin/lib/wrap-up/engine-plan.js`, add immediately after the `claudeMdCommandRenamed` line (line 18):

```javascript
  claudeMdOverBudget: { open: 'CLAUDE.md/rules over the size budget', closed: 'CLAUDE.md/rules within budget' },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bin/lib/wrap-up/tests/engine-plan.test.js`
Expected: PASS.

- [ ] **Step 5: Document the new signal in `claude-md-curation.md`**

In `skills/wrap-up/claude-md-curation.md`, the "## What opened this row" table currently reads:

```markdown
| Signal | What it means |
|---|---|
| `dontCandidate` | `/claude-tweaks:reflect` or the ledger produced a Don't candidate — a `[claude-md: …]`-tagged ledger entry, or a reflection insight naming a pattern that should not be repeated |
| `contradictedConvention` | A convention asserted in CLAUDE.md's `## Conventions` section is contradicted by this work's diff |
| `incidentRecorded` | An incident account was recorded for this work |
| `claudeMdCommandRenamed` (fact) | A command listed in CLAUDE.md's `## Commands` section was renamed or removed in this work's diff |
```

Add one row after `claudeMdCommandRenamed`:

```markdown
| `claudeMdOverBudget` (fact) | `CLAUDE.md` or an in-scope `.claude/rules/*.md` file exceeds its tier's line budget (`harness-health.always-loaded-budget` / `harness-health.scoped-rule-budget`) — opens the row purely on aggregate size, independent of the other three signals |
```

No test for this step — documentation only.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/wrap-up/engine-plan.js bin/lib/wrap-up/tests/engine-plan.test.js skills/wrap-up/claude-md-curation.md
git commit -m "wrap-up: name claudeMdOverBudget in gate reasons and row docs"
```

---

## Self-Review

**1. Spec coverage:**
- Deliverable 1 (`computeClaudeMdOverBudget` in `facts.js`, computed outside `if (isRepo)`) → Task 1.
- Deliverable 2 (wire into `gatherFacts()`'s return) → Task 1.
- Deliverable 3 (`claudeMdOverBudget` in the registry gate `anyOf`) → Task 2.
- Deliverable 4 (`FACT_REASONS` entry) → Task 3.
- Deliverable 5 (`claude-md-curation.md` signal table row) → Task 3.
- Acceptance Criterion 1 (gate opens on the new fact alone) → Task 2's `'claude-md gate opens on claudeMdOverBudget alone'` test.
- Acceptance Criterion 2 (gate stays closed with everything false) → Task 2's `'claude-md gate stays closed...'` test.
- Acceptance Criterion 3 (`registry.test.js` still passes) → verified in Task 2 Step 4; confirmed by reading `registry.test.js` during planning — it has no hardcoded gate shape, so no edit is needed there.
- Acceptance Criterion 4 (`npm test` passes) → verified by running the full suite after Task 3.

**2. Placeholder scan:** No `TBD`/`TODO`/"handle appropriately" language found. Every step shows real code.

**3. Type consistency:** `claudeMdOverBudget` is a `boolean` everywhere it's referenced — `facts.js`'s return object, `registry.js`'s `anyOf` array (a string key name, matched dynamically), `engine-plan.js`'s `FACT_REASONS` key, and every test assertion (`assert.strictEqual(f.claudeMdOverBudget, true/false)`). `computeClaudeMdOverBudget(cwd)` takes a single `cwd: string` parameter, matching every other per-cwd helper already in `facts.js` (`dirNonEmpty`, `listMarkdownFiles`).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-15-claude-md-over-budget-gate.md`. Two execution options:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
