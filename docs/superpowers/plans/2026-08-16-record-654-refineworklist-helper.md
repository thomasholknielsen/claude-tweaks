# Record #654 — refineWorklist Mechanical Helper + Ceiling-Gated Trust Fetch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace refine-mode.md's embedded split/slice scripts with one tested `refineWorklist` helper (re-keying Step 2's budget onto missing-priority — the #460 fix), and gate the trust-table fetch behind `trusted`+ or a new `--trust` flag.

**Architecture:** One new pure export in `bin/lib/issues/backlog.js` with `node --test` coverage plus a conformance pin on grant-mode.md's filter line (Task 1); then refine-mode.md Steps 1-3 rewritten onto the helper with ceiling-first ordering and the cheap trust path, plus the `--trust` flag documented in SKILL.md (Task 2).

**Tech Stack:** Node built-in test runner; markdown skill prose with embedded Node one-liners.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T190902-spec-654-655/spec-654/work/654-spec.md`

## Global Constraints

- The two `gh issue list` fetches stay exactly as they are — only post-fetch compute consolidates (starvation-avoidance rationale preserved verbatim).
- `bot:blocked` precedence in the split is byte-equivalent in behavior to the current Step 1 script; `grantSlice` semantics unchanged; `prioritySlice` re-keys onto missing-priority (a deliberate behavior change — the #460 fix).
- Steps 3.5-5 of refine-mode.md are untouched except where a narration line reads a number from the helper's output.
- The trust-table computation (`bin/lib/issues/trust.js`) is untouched — only when it is fetched changes.
- `counts` exposes exactly `{ fresh, blocked, inProgress, missingPriority, missingRiskSize }`.
- Skill references in actionable text use the fully-qualified `/claude-tweaks:{skill}` form.

---

### Task 1: refineWorklist + tests + grant-mode conformance pin

**Files:**
- Modify: `bin/lib/issues/backlog.js` (add one export after `selectBudgetSlice`)
- Create: `tests/bin-lib/issues/refine-worklist.test.js` (follow the directory's existing test-file conventions — check a sibling like the funnelBuckets tests for require style)
- Create: `tests/grant-mode-inprogress-pin.test.js`

**Interfaces:**
- Consumes: `selectBudgetSlice(unscored, budget)` (existing, unchanged).
- Produces: `refineWorklist({ allRows, readyRows, priorityBudget, grantBudget })` → `{ fresh, blocked, inProgress, missingPriority, missingRiskSize, prioritySlice, grantSlice, counts }` — Task 2's rewrite calls exactly this.

- [ ] **Step 1: Write the failing tests**

Create `tests/bin-lib/issues/refine-worklist.test.js` covering (build fixture rows as `{ number, facets: { grants: {build,merge}, bot: {blocked,inProgress}, priority, risk, size } }`):

- Partition: `fresh`/`blocked`/`inProgress` are mutually exclusive and jointly cover the ungranted `readyRows`; a record with both `bot.blocked` and `bot.inProgress` lands in `blocked` only; a granted record reaches no lane.
- Populations: a record with `priority` set but no `risk`/`size` appears in `missingRiskSize` and not `missingPriority`; the converse record appears in `missingPriority` only; a record missing all three appears in both.
- Slicing: `prioritySlice` draws from `missingPriority` only (a priority-carrying record never enters it, regardless of scoring); `remaining` math matches `selectBudgetSlice`'s.
- Counts: `assert.deepStrictEqual(Object.keys(result.counts).sort(), ['blocked','fresh','inProgress','missingPriority','missingRiskSize'])` and each value equals its array's length.

Create `tests/grant-mode-inprogress-pin.test.js`: read `skills/backlog/grant-mode.md` and assert it contains the literal filter expression `.filter((i) => !i.facets.bot.inProgress)` — the pin that keeps grant-mode's not-already-claimed exclusion from silently drifting from `refineWorklist`'s `inProgress` semantics.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/refine-worklist.test.js`
Expected: FAIL — `refineWorklist` is not a function / not exported.
Run: `node --test tests/grant-mode-inprogress-pin.test.js`
Expected: PASS already (the expression exists today) — that is fine; it is a pin, not TDD of new behavior.

- [ ] **Step 3: Implement refineWorklist**

In `bin/lib/issues/backlog.js`, after `selectBudgetSlice`, add (match the file's comment style — a one-block header comment stating the shape):

```js
// ({ allRows, readyRows, priorityBudget, grantBudget }) -> the refine sweep's
// mechanical prelude in one pass. allRows = the merged faceted open set;
// readyRows = the grant fetch's rows, already origin-filtered by the caller.
// prioritySlice keys on missingPriority — the population Step 2's sweep
// actually stamps (refs #460); grantSlice keys on fresh, unchanged.
function refineWorklist({ allRows, readyRows, priorityBudget, grantBudget }) {
  const worklist = readyRows.filter((r) => !r.facets.grants.build && !r.facets.grants.merge);
  const blocked = worklist.filter((r) => r.facets.bot.blocked);
  const inProgress = worklist.filter((r) => !r.facets.bot.blocked && r.facets.bot.inProgress);
  const fresh = worklist.filter((r) => !r.facets.bot.blocked && !r.facets.bot.inProgress);
  const missingPriority = allRows.filter((r) => r.facets.priority == null);
  const missingRiskSize = allRows.filter((r) => !(r.facets.risk && r.facets.size));
  return {
    fresh,
    blocked,
    inProgress,
    missingPriority,
    missingRiskSize,
    prioritySlice: selectBudgetSlice(missingPriority, priorityBudget),
    grantSlice: selectBudgetSlice(fresh, grantBudget),
    counts: {
      fresh: fresh.length,
      blocked: blocked.length,
      inProgress: inProgress.length,
      missingPriority: missingPriority.length,
      missingRiskSize: missingRiskSize.length,
    },
  };
}
```

Add `refineWorklist` to the module's exports (alongside `funnelBuckets` and the rest).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/refine-worklist.test.js tests/grant-mode-inprogress-pin.test.js tests/bin-lib/issues/backlog.test.js 2>/dev/null || node --test tests/bin-lib/issues/ tests/grant-mode-inprogress-pin.test.js`
Expected: all pass (run whatever existing backlog.js suite file the directory actually has, to confirm no regression in sibling exports).

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/backlog.js tests/bin-lib/issues/refine-worklist.test.js tests/grant-mode-inprogress-pin.test.js
git commit -m "Add refineWorklist helper with priority-keyed budget slice and grant-mode pin — refs #654"
```

### Task 2: Rewrite refine-mode.md Steps 1-3 onto the helper; ceiling-first + --trust

**Files:**
- Modify: `skills/backlog/refine-mode.md` (Steps 1-3 script blocks, the Trust signal section's fetch gating, narration-line sources)
- Modify: `skills/backlog/SKILL.md` (Input section — `--trust` bullet)

**Interfaces:**
- Consumes: Task 1's `refineWorklist` exactly as exported.
- Produces: `/tmp/backlog-refine-worklist.json` now holds `refineWorklist`'s full return value (superset of the old `{fresh, blocked, inProgress}` shape) — Steps 3.5-5 and the sibling record #655 read it.

- [ ] **Step 1: Ceiling-first ordering**

At the top of refine-mode.md Step 1 (immediately after the Step 1 heading's intro, before the Priority/Related fetch), insert a short block: resolve `autonomy` and `trust-revert-window-days` in the one existing `resolve-policy` call (move it here from the Trust signal section), with one sentence stating that resolving `trust-revert-window-days` on the skip path is accepted overhead. Update the Trust signal section (currently "Resolve `autonomy` and `trust-revert-window-days` in one canonical read...") to reference the values already resolved in Step 1 instead of re-running the call.

- [ ] **Step 2: Collapse the split/slice scripts into one compute**

- In Step 1's grant-fetch script (the `node -e` block ending `console.log(JSON.stringify({ fresh, blocked, inProgress }));`): delete the four split lines (`const worklist = ...` through the `console.log`) and end the script by writing the origin-filtered rows instead: `console.log(JSON.stringify(rows));` redirected to `/tmp/backlog-refine-ready-faceted.json`. The fetch, warning, and origin filter stay byte-identical.
- Immediately after, add the single compute block:

```bash
node -e "
  const { refineWorklist } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/backlog.js');
  const allRows = require('/tmp/backlog-refine-faceted.json');
  const readyRows = require('/tmp/backlog-refine-ready-faceted.json');
  console.log(JSON.stringify(refineWorklist({
    allRows, readyRows,
    priorityBudget: Number(process.env.PRIORITY_BUDGET || 40),
    grantBudget: Number(process.env.GRANT_BUDGET || 40),
  })));
" > /tmp/backlog-refine-worklist.json
```

- Step 2's own `node -e` block (`splitScoredUnscored` + `selectBudgetSlice` over the faceted file): delete it; rewrite the surrounding prose to read the priority sweep's slice from `/tmp/backlog-refine-worklist.json`'s `.prioritySlice` (`selected`/`remaining`), and rename that step's population language to **missing priority** (records with no `priority:*` label — the population the sweep actually stamps; keying on it is the #460 fix, state this with `refs #460` in the prose). The `--budget`/`PRIORITY_BUDGET` env-var documentation moves to the compute block above.
- Step 3's budget script (`selectBudgetSlice(data.fresh || [], ...)`): delete it; the grant pass reads `.grantSlice` and `.blocked` from the same file. `GRANT_BUDGET` documentation moves likewise.
- Narration sources: #576's in-flight exclusion line reads `.counts.inProgress`; Step 2's remaining line reads `.prioritySlice.remaining` (and names its population: "`{remaining}` more records missing priority exist beyond this run's `--budget {N}` — re-run to continue."); Step 3's reads `.grantSlice.remaining` (wording otherwise unchanged).

- [ ] **Step 3: Gate the trust fetch**

In the Trust signal section, replace the unconditional fetch instruction with: run the `_shared/trust-table.md` fetch (including its per-parent branches and the git-log read) only when the Step 1-resolved ceiling is `trusted` or higher, **or** `--trust` was passed. When skipped, the ceiling footer (the "Append the resolved ceiling once, below the table" paragraph) renders exactly: "Autonomy ceiling: `supervised` — trust not fetched this run (recorded, never acted on; pass `--trust` to render it)." and Trust evidence is omitted from the report for that run.

- [ ] **Step 4: Document --trust in SKILL.md**

In `skills/backlog/SKILL.md`'s Input section, alongside the existing `--origin` bullet, add: `--trust` → boolean presence flag, refine mode only — forces the trust-table fetch (and its Trust evidence rendering) at any ceiling; without it, refine fetches trust only when the `autonomy` ceiling resolves `trusted` or higher.

- [ ] **Step 5: Verify**

```bash
grep -c "refineWorklist" skills/backlog/refine-mode.md
```
Expected: 1 or more (the compute block).

```bash
grep -n "splitScoredUnscored\|selectBudgetSlice" skills/backlog/refine-mode.md
```
Expected: no output (no inline split/slice remains).

```bash
grep -n "trust not fetched this run" skills/backlog/refine-mode.md
```
Expected: exactly one hit (the footer wording).

```bash
grep -n "\-\-trust" skills/backlog/SKILL.md
```
Expected: 1 or more.

```bash
grep -rn "sub_issues\|git log" skills/backlog/refine-mode.md | grep -v -i "trust"
```
Expected: no hit outside the trust-gated section (confirms the supervised path's zero-calls claim).

- [ ] **Step 6: Commit**

```bash
git add skills/backlog/refine-mode.md skills/backlog/SKILL.md
git commit -m "Rewrite refine Steps 1-3 onto refineWorklist; gate trust fetch behind trusted+/--trust — refs #654 refs #460"
```
