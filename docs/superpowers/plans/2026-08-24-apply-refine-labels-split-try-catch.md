# apply-refine-labels.js: split edit/comment try-catch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `plugin/bin/apply-refine-labels.js`'s per-action label-edit and comment `gh` calls into independent try/catch blocks so a comment-call failure after a successful label edit no longer erases the edit's success from the batch summary and `decisions.md`.

**Architecture:** `run()`'s per-action loop currently wraps both `deps.gh(editArgs)` (label edit) and `deps.gh([...comment...])` (comment) in one try block, with a single catch that pushes the whole action to `failed` and logs one hand-composed FAILED line (added by #1072). This plan splits that into two independent try/catch regions inside the same loop iteration: an edit region (only entered when `addLabels`/`removeLabels` is non-empty) and a comment region (only entered when `commentFile` is set AND the edit region didn't fail). Each region logs its own outcome to `decisions.md` (an `AUTO` line via the existing `formatEntry` path on success, a hand-composed `FAILED` line — reusing #1072's exact convention — on failure) and, on failure, pushes its own `{issue, step, error}` entry to `failed`. `ok` is pushed only when every region an action actually ran completed successfully. No other file in the batch-actions pipeline changes.

**Tech Stack:** Node.js (`node --test`), no new dependencies — same `deps`-injection pattern (`gh-api-module-pattern`) already used throughout this file and its existing test suite.

**Spec:** `.claude-tweaks/pipelines/2026-08-24T170846-record-1073/work/1073-spec.md` (record #1073) — the plan argues from this spec; the executor reads both.

## Global Constraints

- Preserve #1072's exact FAILED-line convention verbatim (hand-composed via `hms`, not `formatEntry` — `FAILED` is not in `append.js`'s `STATUSES` enum) — do not reintroduce or clobber that catch-block structure, only split it per-step.
- `deps.appendEntry` calls remain best-effort: any logging failure (`try { } catch { /* logging is best-effort */ }`) must never fail the batch or throw out of the loop — same posture as today for both the AUTO and FAILED paths.
- Do not attempt the comment `gh` call for an action whose edit step failed — this preserves today's implicit short-circuit (the single try block currently means a thrown edit error skips the comment call entirely; the split must keep that behavior explicit rather than accidentally attempting the comment after a failed edit).
- `ok`/`failed` top-level JSON summary keys are unchanged (`{ ok: number[], failed: {issue, error, ...}[] }`); `failed` entries gain a new `step: 'edit' | 'comment'` field (additive — no existing test does a `deepStrictEqual` on a non-empty `failed` entry's full shape, only on `.issue`/`.error` individually, or on an empty `failed: []`).
- No behavior change to `parseArgs`, `validateAction`, the `--run` anchoring guard, or the `--repo`/remote-resolution logic — this plan touches only the per-action loop body inside `run()`.

---

### Task 1: Split the edit/comment try/catch and add per-step decisions.md logging

**Files:**
- Modify: `plugin/bin/apply-refine-labels.js:139-198` (the `ok`/`failed` arrays and the per-action `for` loop — everything from `const ok = [];` through the loop's closing `}`)
- Test: `tests/apply-refine-labels.test.js` (existing suite — add new cases; no existing test needs to change, per the Global Constraints additive-`step`-field note)

**Interfaces:**
- Consumes: `deps.gh(args)`, `deps.appendEntry({runDir, section, entry})`, `formatEntry({status, now, step, text, reversibility})`, `hms(ms)`, `hasItems(arr)` — all already imported/defined earlier in the file; no new imports needed.
- Produces: `run(argv, deps)` still returns an exit code and writes `JSON.stringify({ ok, failed })` to `deps.stdout` — same top-level shape, `failed[i].step` is new.

- [ ] **Step 1: Write the failing tests**

Add these five test cases to `tests/apply-refine-labels.test.js`, immediately after the existing `'run: --run given logs one FAILED decisions.md line per failed action, under /backlog'` test (after line 225, before the `'run: --run omitted never calls appendEntry even on a failed action'` test at line 227):

```javascript
// #1073: edit and comment are independent steps — a comment failure after a
// successful edit must not erase the edit's own success from decisions.md.
test('run: edit succeeds but comment fails — decisions.md logs the edit AUTO line distinct from the comment FAILED line; issue lands in failed with step "comment", not in ok', () => {
  const deps = fakeDeps({
    readFile: () => JSON.stringify([{ issue: 42, addLabels: ['auto:build'], commentFile: '/tmp/note.md' }]),
    gh: (args) => {
      deps.calls.gh.push(args);
      if (args[0] === 'issue' && args[1] === 'comment') { throw new Error('comment boom'); }
      return '';
    },
  });
  const code = run(['actions.json', '--run', '/repo/.claude-tweaks/pipelines/run-1'], deps);
  assert.strictEqual(code, 0);
  const summary = JSON.parse(deps.calls.stdout.join(''));
  assert.deepStrictEqual(summary.ok, []);
  assert.strictEqual(summary.failed.length, 1);
  assert.deepStrictEqual(summary.failed[0].issue, 42);
  assert.strictEqual(summary.failed[0].step, 'comment');
  assert.match(summary.failed[0].error, /comment boom/);

  // Both gh calls were attempted — the edit was not skipped, and the edit
  // landing is what this record is about.
  assert.strictEqual(deps.calls.gh.length, 2);

  // Two decisions.md entries: the edit's own AUTO success line, distinct
  // from the comment's own FAILED line.
  assert.strictEqual(deps.calls.appendEntry.length, 2);
  const editEntry = deps.calls.appendEntry.find((c) => /applied/.test(c.entry));
  const failedEntry = deps.calls.appendEntry.find((c) => /^- FAILED/.test(c.entry));
  assert.ok(editEntry, 'expected an AUTO entry recording the edit as landed');
  assert.match(editEntry.entry, /#42: applied \+auto:build/);
  assert.ok(failedEntry, 'expected a FAILED entry for the comment step');
  assert.match(failedEntry.entry, /^- FAILED \d{2}:\d{2}:\d{2} — apply-refine-labels: #42: comment failed: .*comment boom.*\.$/);
});

test('run: edit fails — the comment call is never attempted for that action (edit failure still short-circuits)', () => {
  const deps = fakeDeps({
    readFile: () => JSON.stringify([{ issue: 7, addLabels: ['a'], commentFile: '/tmp/note.md' }]),
    gh: () => { throw new Error('edit boom'); },
  });
  const code = run(['actions.json'], deps);
  assert.strictEqual(code, 0);
  const summary = JSON.parse(deps.calls.stdout.join(''));
  assert.deepStrictEqual(summary.ok, []);
  assert.strictEqual(summary.failed.length, 1);
  assert.strictEqual(summary.failed[0].step, 'edit');
  // Only the edit gh call was attempted, never the comment.
  assert.strictEqual(deps.calls.gh.length, 1);
  assert.strictEqual(deps.calls.gh[0][1], 'edit');
});

test('run: edit and comment both succeed — issue lands in ok, and decisions.md gets both the edit AUTO line and a comment-posted AUTO line', () => {
  const deps = fakeDeps({
    readFile: () => JSON.stringify([{ issue: 9, removeLabels: ['ready'], commentFile: '/tmp/note.md' }]),
  });
  const code = run(['actions.json', '--run', '/repo/.claude-tweaks/pipelines/run-1'], deps);
  assert.strictEqual(code, 0);
  const summary = JSON.parse(deps.calls.stdout.join(''));
  assert.deepStrictEqual(summary.ok, [9]);
  assert.deepStrictEqual(summary.failed, []);
  assert.strictEqual(deps.calls.appendEntry.length, 2);
  assert.match(deps.calls.appendEntry[0].entry, /#9: applied -ready/);
  assert.match(deps.calls.appendEntry[1].entry, /#9: comment posted/);
});

test('run: commentFile-only action (no labels) that succeeds logs a "comment posted" AUTO line', () => {
  const deps = fakeDeps({
    readFile: () => JSON.stringify([{ issue: 11, commentFile: '/tmp/note.md' }]),
  });
  const code = run(['actions.json', '--run', '/repo/.claude-tweaks/pipelines/run-1'], deps);
  assert.strictEqual(code, 0);
  const summary = JSON.parse(deps.calls.stdout.join(''));
  assert.deepStrictEqual(summary.ok, [11]);
  assert.strictEqual(deps.calls.appendEntry.length, 1);
  assert.match(deps.calls.appendEntry[0].entry, /#11: comment posted/);
});

test('run: edit-only failure (no commentFile) still logs the same FAILED line shape as before #1073 (regression guard on #1072 behavior)', () => {
  const deps = fakeDeps({
    readFile: () => JSON.stringify([{ issue: 1, addLabels: ['a'], removeLabels: ['b'] }]),
    gh: () => { throw new Error('boom'); },
  });
  const code = run(['actions.json', '--run', '/repo/.claude-tweaks/pipelines/run-1'], deps);
  assert.strictEqual(code, 0);
  assert.strictEqual(deps.calls.appendEntry.length, 1);
  assert.strictEqual(deps.calls.appendEntry[0].runDir, '/repo/.claude-tweaks/pipelines/run-1');
  assert.strictEqual(deps.calls.appendEntry[0].section, '/backlog');
  assert.match(deps.calls.appendEntry[0].entry, /^- FAILED \d{2}:\d{2}:\d{2} — apply-refine-labels: #1: \+a, -b failed: boom\.$/);
  const summary = JSON.parse(deps.calls.stdout.join(''));
  assert.strictEqual(summary.failed[0].step, 'edit');
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test tests/apply-refine-labels.test.js`
Expected: the five new tests FAIL (today's code pushes the whole action to `failed` with no `step` field and no separate edit-success AUTO line when a comment fails afterward; today's `ok`/`appendEntry` counts for the both-succeed and comment-only cases don't yet match the two-line expectation). The pre-existing tests in this file still PASS (nothing in the file has changed yet).

- [ ] **Step 3: Implement the split try/catch**

Replace `plugin/bin/apply-refine-labels.js` lines 139-198 (from `const ok = [];` through the loop's closing `}`, i.e. everything between the `repoFlag` line above it and the final `deps.stdout(...)` call below it) with:

```javascript
  const ok = [];
  const failed = [];
  for (const action of actions) {
    const hasAdd = hasItems(action.addLabels);
    const hasRemove = hasItems(action.removeLabels);
    let editFailed = false;
    let commentFailed = false;

    if (hasAdd || hasRemove) {
      try {
        const editArgs = ['issue', 'edit', String(action.issue), '--repo', repoFlag];
        for (const l of action.addLabels || []) editArgs.push('--add-label', l);
        for (const l of action.removeLabels || []) editArgs.push('--remove-label', l);
        deps.gh(editArgs);
        if (runDir) {
          const summaryParts = [];
          if (hasAdd) summaryParts.push(`+${action.addLabels.join(' +')}`);
          if (hasRemove) summaryParts.push(`-${action.removeLabels.join(' -')}`);
          try {
            deps.appendEntry({
              runDir,
              section: '/backlog',
              entry: formatEntry({
                status: 'AUTO',
                now: deps.now(),
                step: 'apply-refine-labels',
                text: `#${action.issue}: applied ${summaryParts.join(', ')}`,
                reversibility: 'high',
              }),
            });
          } catch { /* logging is best-effort — never fails the batch */ }
        }
      } catch (err) {
        editFailed = true;
        const message = [err && err.message, err && err.stderr, err && err.stdout].filter(Boolean).join(' ') || String(err);
        failed.push({ issue: action.issue, step: 'edit', error: message });
        if (runDir) {
          const attemptParts = [];
          if (hasAdd) attemptParts.push(`+${action.addLabels.join(' +')}`);
          if (hasRemove) attemptParts.push(`-${action.removeLabels.join(' -')}`);
          const summary = attemptParts.length ? attemptParts.join(', ') : 'batch action';
          try {
            // #1072: FAILED is not one of append.js's STATUSES (AUTO/STAGED/
            // KEPT-PROMPT/SCANNED/REFUSED) — refine-mode.md Step 5's own
            // `FAILED {time} — …` template predates that enum and was never
            // gated by it, so this line is composed by hand (reusing append.js's
            // own `hms` for a consistent timestamp) rather than through
            // formatEntry, which would reject the status.
            deps.appendEntry({
              runDir,
              section: '/backlog',
              entry: `- FAILED ${hms(deps.now())} — apply-refine-labels: #${action.issue}: ${summary} failed: ${message}.`,
            });
          } catch { /* logging is best-effort — never fails the batch */ }
        }
      }
    }

    // #1073: the comment step is independent of the edit step — it is only
    // attempted when the edit (if any) did not fail, so a failed edit still
    // short-circuits exactly like the original single try block did. But a
    // comment failure after a successful (or absent) edit no longer erases
    // the edit's own AUTO line above — it gets its own, separate FAILED line.
    if (action.commentFile && !editFailed) {
      try {
        deps.gh(['issue', 'comment', String(action.issue), '--repo', repoFlag, '--body-file', action.commentFile]);
        if (runDir) {
          try {
            deps.appendEntry({
              runDir,
              section: '/backlog',
              entry: formatEntry({
                status: 'AUTO',
                now: deps.now(),
                step: 'apply-refine-labels',
                text: `#${action.issue}: comment posted`,
                reversibility: 'high',
              }),
            });
          } catch { /* logging is best-effort — never fails the batch */ }
        }
      } catch (err) {
        commentFailed = true;
        const message = [err && err.message, err && err.stderr, err && err.stdout].filter(Boolean).join(' ') || String(err);
        failed.push({ issue: action.issue, step: 'comment', error: message });
        if (runDir) {
          try {
            deps.appendEntry({
              runDir,
              section: '/backlog',
              entry: `- FAILED ${hms(deps.now())} — apply-refine-labels: #${action.issue}: comment failed: ${message}.`,
            });
          } catch { /* logging is best-effort — never fails the batch */ }
        }
      }
    }

    if (!editFailed && !commentFailed) ok.push(action.issue);
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/apply-refine-labels.test.js`
Expected: all tests PASS — both the five new ones and every pre-existing test in the file (the pre-existing edit-only success/failure tests, the multi-action isolation test, the `--repo` override test, the empty/malformed-file tests, and every `parseArgs`/`validateAction` test, none of which touch the edit/comment split).

- [ ] **Step 5: Run the sibling anchoring test file too**

Run: `node --test tests/apply-refine-labels-run-dir-anchoring.test.js`
Expected: PASS, unchanged — this plan does not touch the `--run` anchoring guard (lines 91-110), only the per-action loop below it.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/apply-refine-labels.js tests/apply-refine-labels.test.js
git commit -m "apply-refine-labels.js: split edit/comment try-catch so a comment failure doesn't erase a landed edit (refs #1073)"
```

---

## Self-Review

**1. Spec coverage:**
- "Split the edit and comment gh calls into separate try/catch inside the loop body" → Step 3, the two independent `if` blocks.
- "Log the edit's success independently (its own appendEntry call) before attempting the comment" → Step 3's edit block calls `appendEntry` and completes before the `if (action.commentFile && !editFailed)` block is ever reached.
- "Push to failed only for whichever specific step actually threw" → each `catch` pushes its own `{issue, step, error}` — an edit success followed by a comment failure produces exactly one `failed` entry, tagged `step: 'comment'`, never re-blaming the edit.
- "Add a test asserting the label-only decisions.md line exists when the comment step is the one that fails" → Task 1 Step 1's first new test does exactly this, plus four more covering the edit-failure short-circuit, the both-succeed case, the comment-only case, and a regression guard on #1072's existing FAILED-line format.
- Acceptance Criteria ("still produces a decisions.md line... distinct from the comment's own failure — with a test proving it") → same first new test: asserts two distinct `appendEntry` calls, one AUTO (edit) and one FAILED (comment).

**2. Placeholder scan:** No TBD/TODO/"add appropriate handling" — every step shows the literal code and literal test assertions.

**3. Type consistency:** `failed` entries: `{ issue: number, step: 'edit' | 'comment', error: string }` — same field names (`issue`, `error`) as today, `step` is the only new field, used consistently across both catch blocks and every new test. `ok` stays `number[]`. No new exported functions or renamed identifiers — `run`, `parseArgs`, `validateAction` signatures are unchanged.
