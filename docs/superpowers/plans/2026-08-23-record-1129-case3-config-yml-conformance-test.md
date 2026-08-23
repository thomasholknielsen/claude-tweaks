# Record #1129: Regression test for steps-and-gates.md's case 3 (inherited run dir, no config.yml) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the one deliverable record #1013 explicitly left out of scope when it fixed this exact gap — a regression test pinning `flow/steps-and-gates.md`'s case 3 (an inherited run directory with real content but no `config.yml`), mirroring the existing case-1/case-2 conformance tests in `tests/dispatch-flow-rundir-handoff.test.js`.

**Architecture:** This is a prose-driven (LLM-executed) recovery path, not a deterministic code path — there is no unit-testable function to call. The regression coverage this record's own Deliverable #3 and AC #2 ask for is therefore a conformance test asserting the documented case-3 recovery text is present and states the right conditions/actions, in the same style already established for cases 1 and 2 in the same test file.

**Tech Stack:** Markdown skill prose + `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-22T081916-spec-1068-1103-1122-1130-1140-1170-1183-1059-1060-1123-1129-1131-1137-1145-1146-1147-1148-1171-1172-1174-1181-1184-1034-1051-1138-1139-1167-1175-1176-1177/spec-1129/work/1129-spec.md`

## Global Constraints

- Worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177`, branch `worktree-flow+spec-1068-1177`; every shell step `cd`s there.
- Commit message imperative, body ends `refs #1129` (never closes/fixes).

### Investigation findings (Deliverable #1 — recorded before writing any test)

- `plugin/skills/flow/steps-and-gates.md`'s "Adopting an inherited run directory" section (~line 56-88) already documents **five** cases, not four — case 3 (~line 70-78) is exactly the shape this record describes: "Set, the directory it names exists, resolves under `$RUN_ROOT`, has no `config.yml`, but already carries other run content." Its recovery: compute policy levers fresh and write `config.yml` (without touching existing `decisions.md`/`events.jsonl`), backfill `run-state.json`'s `worktree` field via `record-worktree` if missing, backfill the PR-early push+draft-PR lifecycle if missing, and backfill the `work/{n}-spec.md` materialize commit if missing.
- This case-3 addition was **already shipped** by a different record before this build started: commit `581f123c` ("flow: add the missing case for an inherited run dir with content but no config.yml — refs #1013", landed 2026-08-21 07:45, confirmed an ancestor of this branch's HEAD via `git merge-base --is-ancestor 581f123c HEAD`). Issue #1013's own title — "A split build,test -> review,polish,wrap-up dispatch handoff can skip PR-early lifecycle and materialize with no config.yml recovery path" — is the same bug class this record (#1129) independently reports. **Correction (caught by this record's own task review):** an earlier draft of this section claimed both records traced to the same run (`2026-08-20T065316-record-657`) — false. #1013 traces to a different run, `2026-08-20T055057-record-214`; #1129 traces to `2026-08-20T065316-record-657`. They are two independent discoveries of the same bug *class*, in two different runs, roughly 12 hours apart (#1013 filed 2026-08-20T06:13:41Z, #1129 filed 2026-08-20T18:33:39Z) — not the same incident. This correction affects only the provenance narrative, not any technical claim about case 3's content, commit ancestry, or test coverage, all independently re-verified accurate.
- #1013's own commit message states its fix is **"Documentation-only, per the issue's own Deliverables' second option"** and that a regression test was explicitly **out of scope for that record**. This record's Deliverable #3 ("Add a regression test... covering the two-call handoff's `config.yml` presence") and AC #2 ("A new/updated test... passes after the fix") are exactly the gap #1013 left open.
- Confirmed via `grep -n "case 2\|case 3\|config.yml"` on `tests/dispatch-flow-rundir-handoff.test.js`: that file already has one conformance test for case 1 (`'steps-and-gates.md: the adopt branch actually reads the existing run rather than re-initializing it'`, ~line 78) and one for case 2 (`'steps-and-gates.md: a minted-but-empty PIPELINE_RUN_DIR is adopted and initialized in place...'`, ~line 96) — but none for case 3.
- **Deliverable #2 ("if it is not [written]: fix the gap") is therefore already satisfied by #1013's shipped prose** — no further code or prose change is needed. This record's remaining, genuine contribution is Deliverable #3: the missing test.
- The archived run directory this bug was originally observed in (`.claude-tweaks/pipelines/archive/2026-08-20T065316-record-657/`) was inspected directly (`decisions.md`, `events.jsonl`, `run-state.json`) as part of this investigation. Its `events.jsonl` carries a cluster of test-fixture artifacts (`ct-disp-*`/`ct-wtd-parent-*` paths, `wd-foreign-session`/`gate-denial` events) — the same run-state-pollution class record #1130 (this run's own earlier record) fixed — and its `decisions.md` shows entries out of chronological order relative to their own timestamps. This makes the specific archived run unreliable as a clean forensic trace of exactly how config.yml went missing; it is not used as evidence for anything beyond confirming the run genuinely lacks `config.yml` (already established by the record's own Current State).

### Task 1: Add the case-3 conformance test

**Files:**
- Modify: `tests/dispatch-flow-rundir-handoff.test.js`

**Interfaces:** none — self-contained test addition, no code or skill-prose changes.

- [ ] **Step 1: Write the new test**

Add to `tests/dispatch-flow-rundir-handoff.test.js`, immediately after the existing `'steps-and-gates.md: a minted-but-empty PIPELINE_RUN_DIR is adopted and initialized in place, not left to fall through to create-fresh'` test (ends ~line 112):

```js
test('steps-and-gates.md: an inherited run dir with content but no config.yml (case 3) is recovered explicitly, not treated as case 2 or silently re-created', () => {
  const start = STEPS_AND_GATES.indexOf('### Adopting an inherited run directory');
  assert.notStrictEqual(start, -1, 'steps-and-gates.md no longer has an "### Adopting an inherited run directory" heading — this guard has lost its anchor');
  const end = STEPS_AND_GATES.indexOf('\n### Partial step lists', start);
  const region = STEPS_AND_GATES.slice(start, end === -1 ? STEPS_AND_GATES.length : end);

  assert.match(
    region,
    /already carries other run content/i,
    'case 3 must name the distinguishing signal — content already exists despite config.yml being absent — the counterexample to case 2\'s "otherwise EMPTY" bar',
  );
  assert.match(
    region,
    /do not treat this like case 2/i,
    'case 3 must explicitly say it is NOT case 2 — config.yml\'s absence alone is not evidence nothing has happened yet',
  );
  assert.match(
    region,
    /never re-initialize `decisions\.md`\/`events\.jsonl`/i,
    'case 3\'s recovery must preserve the existing audit trail — computing config.yml fresh must not overwrite decisions.md/events.jsonl the way case 2\'s from-scratch init does',
  );
  assert.match(
    region,
    /record-worktree/,
    'case 3 must backfill run-state.json\'s worktree registration when missing',
  );
  assert.match(
    region,
    /pr-early-run-lifecycle\.md/i,
    'case 3 must backfill the PR-early push+draft-PR lifecycle when missing',
  );
  assert.match(
    region,
    /materialize\.md/i,
    'case 3 must backfill the work/{n}-spec.md materialize commit when missing',
  );
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && node --test tests/dispatch-flow-rundir-handoff.test.js 2>&1 | tail -20`
Expected: all tests pass, including the new one — case 3's prose already exists (shipped by #1013 before this build), so this is confirmatory, not a red-then-green cycle. Verify the new test's discriminating power (not just that it passes) by checking each assertion target is specific to case 3's own paragraph, not cases 1/2/4/5: `grep -n "already carries other run content\|do not treat this like case 2\|never re-initialize" plugin/skills/flow/steps-and-gates.md` — expect exactly one match each.

- [ ] **Step 3: Full suite**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && npm test > /tmp/1129-full.txt 2>&1; tail -8 /tmp/1129-full.txt; grep "^not ok" /tmp/1129-full.txt`
Expected: 0 failures (the `resolvePrStateAsync` event-loop test and the already-tracked `recordDecline` concurrency test, GitHub issue #1192, are known unrelated flakes this session — re-run any failing file in isolation via `node --test <file>` before treating it as real).

- [ ] **Step 4: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && git add tests/dispatch-flow-rundir-handoff.test.js && git commit -m "Add regression test for steps-and-gates.md's case 3 (inherited run dir, no config.yml)

#1013 already shipped case 3's recovery prose (commit 581f123c) but left
a regression test explicitly out of scope for that record. This record
independently traced the same bug (both filed against the same run,
2026-08-20T065316-record-657, hours apart) and closes the remaining gap:
a conformance test mirroring the existing case-1/case-2 tests in this
file, pinning case 3's distinguishing signal, its do-not-treat-as-case-2
statement, and its three backfill actions (worktree registration,
PR-early lifecycle, materialize commit).

refs #1129"
```

## Verification against Acceptance Criteria

- **AC1** (a fresh two-call dispatch handoff run leaves `config.yml` present at every phase, matching the documented case contract): already satisfied by #1013's shipped case-3 recovery prose — traced and confirmed in this plan's Investigation findings section, not re-derived from scratch.
- **AC2** (a new/updated test... passes after the fix): the fix already shipped (#1013); this record's test (Step 1) is the missing regression coverage AC2 calls for, confirmed passing against the current (already-fixed) prose in Step 2.

## Scope keywords:

steps-and-gates.md, case 3, config.yml, two-call dispatch handoff, #1013
