# Machine-Grant Outlook Origin Pre-Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `machineGrantOutlook`'s refusal counts consistent with `/claude-tweaks:backlog grant`'s own candidate-set size by pre-filtering human-filed records before running the gate chain, mirroring `grant-mode.md`'s own Step 1 cheap pre-pass, and disclosing the excluded count in the rendered annotation.

**Architecture:** `machineGrantOutlook` (`plugin/bin/lib/issues/backlog.js`) currently runs `evaluateGrantGate`'s gates 1-3 on every record with no origin filter, so a human-filed record whose class trust also happens to be non-clean gets misattributed to `refused.trust` instead of being recognized as structurally out of the machine-grant population entirely (gate 3 never even runs for it, since gate 2 short-circuits first). The fix adds an origin pre-filter — identical in spirit to `grant-mode.md`'s own `facets.origin !== null` pre-pass — directly inside `machineGrantOutlook`, before any record reaches `evaluateGrantGate`. Filtered-out records are counted via a new `excludedOrigin` field (additive to the existing `{ eligible, refused }` shape) rather than silently dropped, and the render template in `machine-grant-outlook.md` discloses that count so the funnel header's `specified N` total still reconciles with `eligible + refused + excludedOrigin`. `evaluateGrantGate`'s own gate order (grant-gate.js) is untouched — it is shared with grant-mode's real grant execution and its gate 2-before-gate-3 order is documented as load-bearing.

**Tech Stack:** Node.js (`node --test`), no external dependencies — pure functions in `plugin/bin/lib/issues/`.

**Spec:** `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-1387/.claude-tweaks/pipelines/2026-08-24T165051-record-1387/work/1387-spec.md` (GitHub issue #1387)

## Global Constraints

- Do not reorder `evaluateGrantGate`'s gate 2 (trust) / gate 3 (origin) — that order is documented as load-bearing in `grant-gate.js`'s own header comment and is shared with grant-mode's real grant execution (issue #269's Deliverables).
- The fix is additive only: `machineGrantOutlook`'s existing `{ eligible, refused }` return fields keep their exact current shape and values (minus the now-excluded human-filed records) — add `excludedOrigin` as a new third field, never remove or rename an existing one.
- `machine-grant-outlook.md`'s render template must keep its existing omit-when-empty conventions (the `{failedKey}: {count}` list omits when `refused` is empty; the `(≤{cap}/day)` parenthetical omits when the cap is unset) — the new exclusion disclosure follows the same convention: omitted when `excludedOrigin` is 0.
- Every test file in this repo runs via `node --test` — no test framework dependency, `assert`/`assert.deepEqual` from Node's built-in `node:assert`.

---

### Task 1: Add the origin pre-filter to `machineGrantOutlook`

**Files:**
- Modify: `plugin/bin/lib/issues/backlog.js:19` (import line) and `:240-269` (`machineGrantOutlook` function + its doc comment)
- Test: `tests/bin-lib/issues/backlog.test.js:521-605` (existing `machineGrantOutlook` suite)

**Interfaces:**
- Consumes: `parseRecordFacets(labels)` from `./record` (already exported, per `plugin/bin/lib/issues/record.js:281` / its `module.exports` at line 581) — same fallback pattern `evaluateGrantGate` itself already uses (`grant-gate.js`: `rec.facets || parseRecordFacets(rec.labels)`).
- Produces: `machineGrantOutlook(records, policy, trustRowsArray)` now returns `{ eligible: number[], refused: { [failedKey: string]: number[] }, excludedOrigin: number }` — `excludedOrigin` is a new field, `eligible`/`refused` keep their existing meaning for every record that has a non-null origin.

- [ ] **Step 1: Write the failing tests — update the two existing human-filed-record assertions and add a new regression test**

Read the current test file first to get exact surrounding context (imports, the `outlookRecord`/`cleanCodeHealthRow`/`unattendedPolicy` helpers are already defined at lines 521-531 — reuse them, do not redefine).

Replace the test currently at (approximately) line 562-570:

```javascript
test('machineGrantOutlook: human-filed record refuses under origin even with clean trust', () => {
  const out = machineGrantOutlook(
    [outlookRecord(4, ['ready', 'risk:low', 'size:low'])],
    unattendedPolicy,
    [{ key: 'human:human|low', verdict: 'clean' }],
  );
  assert.deepEqual(out.eligible, []);
  assert.deepEqual(out.refused, { origin: [4] });
});
```

with:

```javascript
test('machineGrantOutlook: human-filed record is pre-filtered via excludedOrigin, never reaches the gate chain', () => {
  const out = machineGrantOutlook(
    [outlookRecord(4, ['ready', 'risk:low', 'size:low'])],
    unattendedPolicy,
    [{ key: 'human:human|low', verdict: 'clean' }],
  );
  assert.deepEqual(out.eligible, []);
  assert.deepEqual(out.refused, {});
  assert.strictEqual(out.excludedOrigin, 1);
});
```

Replace the test currently at (approximately) line 581-596:

```javascript
test('machineGrantOutlook: refused ids aggregate per failedKey in input order alongside eligibles', () => {
  const out = machineGrantOutlook(
    [
      outlookRecord(6, ['by:code-health', 'ready', 'risk:low', 'size:low']),
      outlookRecord(7, ['ready', 'risk:low', 'size:low']),
      outlookRecord(8, ['ready', 'risk:low', 'size:low']),
    ],
    unattendedPolicy,
    [
      { key: 'producer:code-health|low', verdict: 'clean' },
      { key: 'human:human|low', verdict: 'clean' },
    ],
  );
  assert.deepEqual(out.eligible, [6]);
  assert.deepEqual(out.refused, { origin: [7, 8] });
});
```

with:

```javascript
test('machineGrantOutlook: refused ids aggregate per failedKey in input order alongside eligibles', () => {
  const out = machineGrantOutlook(
    [
      outlookRecord(6, ['by:code-health', 'ready', 'risk:low', 'size:low']),
      outlookRecord(7, ['ready', 'risk:low', 'size:low']),
      outlookRecord(8, ['ready', 'risk:low', 'size:low']),
    ],
    unattendedPolicy,
    [
      { key: 'producer:code-health|low', verdict: 'clean' },
      { key: 'human:human|low', verdict: 'clean' },
    ],
  );
  assert.deepEqual(out.eligible, [6]);
  assert.deepEqual(out.refused, {});
  assert.strictEqual(out.excludedOrigin, 2);
});
```

Add a new regression test immediately after the (now-updated) aggregation test, before the `non-unattended ceiling` test:

```javascript
test('machineGrantOutlook: human-filed record with failing trust is excluded via excludedOrigin, not misattributed to refused.trust (#1387)', () => {
  const out = machineGrantOutlook(
    [outlookRecord(10, ['ready', 'risk:low', 'size:low'])],
    unattendedPolicy,
    [{ key: 'human:human|low', verdict: 'mixed' }],
  );
  assert.deepEqual(out.eligible, []);
  assert.deepEqual(out.refused, {});
  assert.strictEqual(out.excludedOrigin, 1);
});
```

Do not modify the other five `machineGrantOutlook` tests (`clean-trust agent-filed record is eligible`, `mixed class trust refuses under failedKey trust`, `absent trust rows read as no-cell and refuse under trust`, `needs:definition refuses ahead of trust`, `a non-unattended ceiling refuses everything under ceiling`) — none of their records omit a `by:*` label, so none are affected by the origin pre-filter; their existing assertions stay exactly as-is.

- [ ] **Step 2: Run the tests to verify the three touched/new tests fail**

Run: `node --test tests/bin-lib/issues/backlog.test.js`
Expected: FAIL — the two updated tests fail because `machineGrantOutlook` still returns `refused: { origin: [...] }` and no `excludedOrigin` field (so `out.excludedOrigin` is `undefined`, not `1`/`2`); the new regression test fails because record 10 currently lands in `refused: { trust: [10] }`, not `excludedOrigin: 1`.

- [ ] **Step 3: Implement the origin pre-filter in `machineGrantOutlook`**

In `plugin/bin/lib/issues/backlog.js`, extend the existing import at line 19 from:

```javascript
const { PRIORITIES, TIERS } = require('./record');
```

to:

```javascript
const { PRIORITIES, TIERS, parseRecordFacets } = require('./record');
```

Replace the function's doc comment (currently the block starting `// (specifiedRecords, policy, trustRowsArray) -> the machine-grant outlook` through `// ids in input order.`, immediately above `function machineGrantOutlook`) with:

```javascript
// (specifiedRecords, policy, trustRowsArray) -> the machine-grant outlook
// overview's bare mode renders as the `specified` stage's config-aware
// annotation. A human-filed record (facets.origin null/undefined) is
// pre-filtered OUT before the gate chain runs at all — mirroring
// grant-mode.md's own Step 1 "cheap pre-pass on the same gate-3 condition"
// (skills/backlog/grant-mode.md) — so this outlook's population always
// matches grant-mode's own candidate set exactly. Without this pre-filter, a
// human-filed record whose class trust ALSO happens to be non-clean gets
// misattributed to refused.trust by evaluateGrantGate's gate order (gate 2
// runs before gate 3, so gate 3/origin never individually fires for it) even
// though grant-mode's own candidate fetch would never have considered it in
// the first place — this was #1387's reported discrepancy between overview's
// reported refusal counts and grant-mode's own candidate-set size for the
// same backlog state. Excluded records are counted via `excludedOrigin`
// rather than folded into `refused`, so a reader can reconcile the funnel
// header's `specified N` total against `eligible.length + refused-total +
// excludedOrigin`. Runs evaluateGrantGate's FIRST PHASE only (gates 1-3 —
// ceiling, opt-in, needs:definition, class trust — gate 3/origin is now
// structurally unreachable inside this call, since the pre-filter already
// removed every record it would have refused): gate 4's grant-check is an
// LLM judgment overview must never run, per its "entirely mechanical"
// contract. So `eligible` means "will reach the grant unit's own grant-check
// on a future firing", never "will be granted" — gates 4-5 can still refuse.
// policy is evaluateGrantGate's own policy shape ({ ceiling,
// grantOriginationEnabled } suffices for phase 1); trustRowsArray is
// trustRows() output (bin/lib/issues/trust.js), keyed into the Map shape the
// gate expects. Returns { eligible: [ids], refused: { [failedKey]: [ids] },
// excludedOrigin: count }, ids in input order.
```

Replace the function body:

```javascript
function machineGrantOutlook(records, policy, trustRowsArray) {
  const rows = Array.isArray(trustRowsArray) ? trustRowsArray : [];
  const trustVerdicts = new Map(rows.map((row) => [row.key, row]));
  const eligible = [];
  const refused = {};
  for (const r of records) {
    const id = r.number ?? r.id;
    const result = evaluateGrantGate({
      record: { number: id, labels: r.labels, body: r.body, facets: r.facets },
      policy,
      trustVerdicts,
    });
    if (result.needsGrantCheck === true) {
      eligible.push(id);
    } else {
      (refused[result.failedKey] = refused[result.failedKey] || []).push(id);
    }
  }
  return { eligible, refused };
}
```

with:

```javascript
function machineGrantOutlook(records, policy, trustRowsArray) {
  const rows = Array.isArray(trustRowsArray) ? trustRowsArray : [];
  const trustVerdicts = new Map(rows.map((row) => [row.key, row]));
  const eligible = [];
  const refused = {};
  let excludedOrigin = 0;
  for (const r of records) {
    const id = r.number ?? r.id;
    const facets = r.facets || parseRecordFacets(r.labels);
    if (facets.origin === null || facets.origin === undefined) {
      excludedOrigin += 1;
      continue;
    }
    const result = evaluateGrantGate({
      record: { number: id, labels: r.labels, body: r.body, facets },
      policy,
      trustVerdicts,
    });
    if (result.needsGrantCheck === true) {
      eligible.push(id);
    } else {
      (refused[result.failedKey] = refused[result.failedKey] || []).push(id);
    }
  }
  return { eligible, refused, excludedOrigin };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/bin-lib/issues/backlog.test.js`
Expected: PASS — all `machineGrantOutlook` tests green, including the two updated and one new test.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/issues/backlog.js tests/bin-lib/issues/backlog.test.js
git commit -m "Fix machineGrantOutlook to pre-filter human-filed records like grant-mode's Step 1 (refs #1387)"
```

**Post-implementation note (Beneficial architecture deviation, commit `468c9d58`):** this task's
Step 3 code, as literally written above, applies the origin pre-filter unconditionally — but
`grant-mode.md`'s own Step 1 pre-filter is only ever *reached* after that mode's Step 0 has already
confirmed `ceiling === 'unattended' && grantOriginationEnabled === true` (Step 0 stops the whole
mode before Step 1 otherwise). Outside that policy shape, this task's unconditional pre-filter
would silently exclude human-filed records from `refused` in a state where grant-mode itself never
runs at all, which is not the behavior the spec's Acceptance Criteria calls for. A follow-up commit
(`468c9d58`, after this plan's commits) gates the pre-filter on that identical
`ceiling`/`grantOriginationEnabled` condition, falling back to pre-fix (no-filter) behavior
otherwise (`excludedOrigin` stays 0) — matching `machine-grant-outlook.md`'s own precondition that
this whole file is loaded only under that exact policy state. Classified **Beneficial**: keeps the
implementation as committed, this note is the corresponding plan update.

---

### Task 2: Disclose `excludedOrigin` in the rendered annotation

**Files:**
- Modify: `plugin/skills/backlog/machine-grant-outlook.md`

**Interfaces:**
- Consumes: `machineGrantOutlook`'s new `excludedOrigin` field from Task 1 — `{ eligible, refused, excludedOrigin }`.
- Produces: an updated render template string for the `specified` stage's grant-gate outlook annotation line; no code, no new function.

- [ ] **Step 1: Update the file's prose above the render template**

In `plugin/skills/backlog/machine-grant-outlook.md`, under `## \`specified\` stage — grant-gate outlook`, the paragraph currently reads:

```
Compute the outlook mechanically — `machineGrantOutlook(funnel.specified, { ceiling, grantOriginationEnabled }, trustRows)`
(`bin/lib/issues/backlog.js`), with `trustRows` = the rows Step 1.5 already computed. This file is
loaded separately from `overview-mode.md`'s own fence, so re-resolve the path rather than
assuming its shell variable survived (`_shared/session-tmp-root.md`; `sessionTmpPath` is
idempotent per session+filename, so this resolves to the identical path Step 1.5 wrote):
```

Insert one new sentence immediately after that paragraph (before the `session-tmp-resolve.js` code fence), and keep everything else in the file unchanged:

```
`machineGrantOutlook` pre-filters human-filed records (`facets.origin` null/undefined) before
running the gate chain at all — mirroring `grant-mode.md`'s own Step 1 cheap pre-pass on the same
condition — so its `eligible`/`refused` population always matches grant-mode's own candidate set;
excluded records are counted separately via the returned `excludedOrigin` field rather than folded
into `refused` (#1387).
```

- [ ] **Step 2: Update the render template**

The template currently reads:

```
# machine-grant live (≤{cap}/day): {eligible.length} eligible pending grant-check; {refused-total} refused — {failedKey}: {count}, ... — refused records need a human grant via /claude-tweaks:backlog refine
```

Replace it with:

```
# machine-grant live (≤{cap}/day): {eligible.length} eligible pending grant-check; {refused-total} refused — {failedKey}: {count}, ...; {excludedOrigin} human-filed (excluded — never machine-granted) — refused records need a human grant via /claude-tweaks:backlog refine
```

Immediately below the template, the file already documents the omit-when-empty conventions in this paragraph:

```
The `{failedKey}: {count}` list renders in descending count order; when `refused` is empty, omit
it and the `— refused records need …` tail with it. `{cap}` is the resolved
`fleet-daily-grant-cap`; when unset, drop the `(≤{cap}/day)` parenthetical.
```

Replace it with (adding the new field's own omit rule as its own sentence, keeping the existing two rules unchanged):

```
The `{failedKey}: {count}` list renders in descending count order; when `refused` is empty, omit
it and the `— refused records need …` tail with it. The `; {excludedOrigin} human-filed (excluded
— never machine-granted)` segment renders only when `excludedOrigin` is non-zero — omit it
entirely (including its leading `; `) when zero, the same convention the `{failedKey}: {count}`
list already follows for an empty `refused`. `{cap}` is the resolved `fleet-daily-grant-cap`; when
unset, drop the `(≤{cap}/day)` parenthetical.
```

- [ ] **Step 3: Verify no other file restates this render template verbatim**

Run: `grep -rn "machine-grant live" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-1387/plugin" "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-1387/tests"`
Expected: only `plugin/skills/backlog/machine-grant-outlook.md` matches (this file owns the template exactly once, per CLAUDE.md's "every relationship stated once" convention) — no test currently byte-pins this specific line as a fixture. If a match turns up in `tests/`, read it before proceeding: a prose-conformance test pinning the old template text would need its own fixture update, which is not scoped by this plan and would need reporting as a blocker rather than silently reconciled.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/backlog/machine-grant-outlook.md
git commit -m "Document excludedOrigin disclosure in machine-grant outlook render template (refs #1387)"
```

---

## Self-Review Notes (completed during planning, not a task to execute)

1. **Spec coverage:** Deliverable ("apply the same origin pre-filter... so refused counts decompose consistently") → Task 1. Acceptance criteria's "or overview's report explicitly states how many... are excluded... and why" → Task 2 (belt-and-suspenders, satisfies the AC's second branch even though Task 1 already satisfies the first branch by construction — the two approaches are complementary here, not alternatives, since `funnel.specified`'s total should still reconcile visibly with `eligible + refused + excludedOrigin`).
2. **Placeholder scan:** No TBD/TODO; every step shows exact before/after code or exact template text.
3. **Type consistency:** `excludedOrigin` is a plain `number` everywhere it appears (Task 1's return value, Task 2's render field) — no naming drift (not `excluded_origin`, not `humanFiledCount`).
4. **Consumer sweep (already done during research, not a task):** `machineGrantOutlook` has exactly one production consumer — `plugin/skills/backlog/machine-grant-outlook.md` itself, which both computes and renders (confirmed via repo-wide grep — no other `.js` file destructures its return shape besides the test file). `overview-mode.md` only loads `machine-grant-outlook.md` as a companion file; it does not duplicate the render line itself. The additive `excludedOrigin` field is therefore safe — no consumer does a strict key-count or JSON-round-trip comparison that would break on an extra key.
