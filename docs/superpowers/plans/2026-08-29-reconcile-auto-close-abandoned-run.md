# Reconcile Auto-Close for an Abandoned Interrupted Run — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `reconcile`'s archive sweep resolve a run left `interrupted` by a session that never came back — auto-closing it exactly the way a manual `close-run` would, but only when nothing live owns it and #1672's evidence path says its work actually shipped.

**Architecture:** One new branch in `archiveMerged`'s per-run loop, placed after the orphaned-mint branch and **before** the `no-worktree`/`no-branch` skips (an abandoned run's worktree is gone, so it dies at those skips today and never reaches the merged-PR path). The branch is a conjunction of three independent gates — status is `interrupted`, nothing live owns it, and `checkRunIntegrity` returns `shipped-unclosed` — and on a match it calls `closeRunState` (the identical function `close-run` uses) and then archives the directory.

**Tech Stack:** Node 18+, CommonJS, `node --test`. Zero runtime npm deps. Git only through `runGit()`.

**Spec:** `.claude-tweaks/pipelines/2026-08-29T185308-spec-1463-1672-1673-1674/spec-1673/work/1673-spec.md` (GitHub record #1673)

## Global Constraints

- **A false auto-close is worse than the status quo.** The record says so explicitly, and the status quo is merely "a human runs `close-run` by hand." Every gate below is a conjunction; when any input is indeterminate the run is left alone. Never widen a gate to make more runs auto-closeable.
- **`closeRunState` is reused, never reimplemented.** It owns the `close-without-wrapup` event and the un-archived-`work/` advisory; an automated close must be indistinguishable from a manual one in the ledger.
- **Do not change `checkRunIntegrity`'s return shape** — #1672 just landed it and this is its consumer.
- **Archive as well as close (see Task 2 Step 3's comment).** `docs/hooks.md` documents that `iterRunDirsWithState` permanently skips any run already `status: 'clean'`, so a run marked clean *without* being moved is invisible to every future sweep — "not just delayed." Closing without archiving would manufacture exactly that orphan, and would also make `archived: N` count a directory that is still sitting in `pipelines/`. The record's Technical Approach says "call `closeRunState` directly"; it is silent on archival, and this plan reads that silence as under-specification rather than as a decision to create a documented permanent blind spot.
- Reuse `ORPHAN_MINT_TTL_MS`'s existing 24h value for the staleness window rather than inventing a second constant with a different number.
- Commit style `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes. Write `refs #1673`, never `closes`/`fixes`.
- Test command: `node --test tests/bin-lib/reconcile/archive-merged.test.js` (or whichever suite covers this module — locate it first). Do **not** run the full `npm test`; the orchestrator runs it centrally.

---

### Task 1: Locate the existing suite and pin current behavior

**Files:**
- Read: `plugin/bin/lib/reconcile/archive-merged.js`, `plugin/bin/lib/hooks/close-run-state.js`, `plugin/bin/lib/hooks/context.js`
- Test: whichever existing suite covers `archiveMerged` (find it — try `ls tests/bin-lib/reconcile/` and `grep -rln "archiveMerged" tests/`)

- [ ] **Step 1: Find the suite and its fixture shape**

Run: `grep -rln "archiveMerged\|archive-merged" /Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/agent-a8684862926814dff/tests/`

Read the suite you find. Note how it builds a repo + run dir fixture; every test you add in Task 2 reuses that shape rather than inventing a new one. Record the file path and the baseline `# tests`/`# pass`/`# fail` counts — you will report both.

- [ ] **Step 2: Confirm the gap is real before fixing it**

Add a temporary scratch assertion (do NOT commit it) or run a one-off `node -e` that builds an `interrupted` run dir whose recorded worktree no longer exists, calls `archiveMerged({cwd: root, dryRun: true})`, and prints the result. Confirm it comes back in `skipped` with reason `no-branch` (or `no-worktree`), i.e. the run is untouched today. Report the actual reason string you observed — this is the "before" evidence the new branch has to change.

---

### Task 2: The auto-close criterion

**Files:**
- Modify: `plugin/bin/lib/reconcile/archive-merged.js`
- Test: the suite located in Task 1

**Interfaces:**
- Consumes: `closeRunState` from `../hooks/close-run-state`, `checkRunIntegrity` from `../hooks/run-integrity` (both new imports in this file), plus `fs`/`path`/`readRunState` already present.
- Produces: two module-private helpers, `lastOwnEventMs(runDir) -> number|null` and `isAbandonedInterrupted(runDir, state, sessionId, now) -> boolean`, plus one new branch in `archiveMerged`'s loop. Both helpers are added to `module.exports` so the suite can unit-test them directly.

- [ ] **Step 1: Write the failing tests**

Add three tests to the suite from Task 1, matching its existing fixture style. The three cases the record requires:

1. **Auto-closes.** An `interrupted` run whose worktree is gone, whose recorded `sessionId` is not the current one, whose newest non-fallback event is older than 24h, and for which `checkRunIntegrity` returns `shipped-unclosed` (build this the way `tests/run-integrity.test.js`'s `fixtureTornDownRepo` does — a merged branch plus a `pr.branch` stamp or a `decisions.md` line, with a `skill_invoked` event and no wrap-up event). Assert: the run dir's `run-state.json` ends `status: 'clean'`, an event of type `close-without-wrapup` was appended, and the run appears in `result.archived`.
2. **Live owning session — not closed.** Same fixture, but `run-state.json`'s `sessionId` equals the session id the call runs under. Assert: the run is NOT in `result.archived`, and its `run-state.json` still reads `status: 'interrupted'`.
3. **Fallback-only events still read as abandoned.** Same fixture as case 1, but `events.jsonl` additionally carries a *recent* (now-ish) event line carrying `"attribution":"fallback"`. Assert: the run still auto-closes — a fallback event is another session's activity guessed into this run and must not make it look alive.

- [ ] **Step 2: Run the tests to verify they fail**

Run the suite. Expected: FAIL on cases 1 and 3 (the run is skipped, not closed). Case 2 passes already — it is the control that must stay green. Paste the raw counts and failing test names.

- [ ] **Step 3: Write the implementation**

In `plugin/bin/lib/reconcile/archive-merged.js`, add these imports beside the existing ones:

```js
const { closeRunState } = require('../hooks/close-run-state');
const { checkRunIntegrity } = require('../hooks/run-integrity');
```

Add the helpers immediately after `isOrphanedMint`:

```js
// Same 24h window as ORPHAN_MINT_TTL_MS, and for the same reason — longer than
// any plausible pause before a session resumes its own run, short enough that a
// genuinely abandoned one is swept the next day. Deliberately not a second,
// differently-tuned constant.
const STALE_INTERRUPTED_TTL_MS = ORPHAN_MINT_TTL_MS;

// Newest event this run can actually claim as its own, in ms — or null when
// there are none (or the log is unreadable).
//
// Deliberately NOT run-state's `updatedAt`, and deliberately excluding
// `attribution: 'fallback'` lines: a fallback event is one ANOTHER session's
// hook guessed into this run because the run had no provable owner
// (context.js's resolveRun). Those lines advance `updatedAt` without this run
// being alive at all, which is precisely how an abandoned run looks
// perpetually busy and never becomes closeable (#1673 Deliverable 4).
function lastOwnEventMs(runDir) {
  let raw;
  try { raw = fs.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8'); } catch { return null; }
  let newest = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (!ev || ev.attribution === 'fallback') continue;
    const t = Date.parse(ev.ts);
    if (Number.isNaN(t)) continue;
    if (newest === null || t > newest) newest = t;
  }
  return newest;
}

// The ownership half of the criterion, inverted from close-run-state.js's
// `foreignOwner`: that check asks "does a DIFFERENT session own this?" to
// refuse a close; here the same comparison answers "is this session's own
// run?" — if it is, we are that session and the run is by definition alive, so
// never auto-close it. A run owned by nobody, or by some other session, is a
// candidate only if it ALSO shows no self-attributed activity inside the
// staleness window. Both halves must hold; neither alone is evidence.
function isAbandonedInterrupted(runDir, state, sessionId, now = Date.now()) {
  if (!state || state.status !== 'interrupted') return false;
  const owner = typeof state.sessionId === 'string' && state.sessionId ? state.sessionId : null;
  if (owner && sessionId && owner === sessionId) return false; // our own live run
  const last = lastOwnEventMs(runDir);
  if (last !== null && (now - last) <= STALE_INTERRUPTED_TTL_MS) return false;
  return true;
}
```

In `archiveMerged`'s loop, insert this branch immediately after the `isOrphanedMint` block's `continue` and **before** the `if (!state || !state.worktree)` line:

```js
    // #1673: an abandoned `interrupted` run whose work actually shipped. This
    // has to sit ahead of the no-worktree/no-branch skips below: those are
    // exactly where such a run dies today, because its worktree was torn down
    // long ago and there is no live entry to derive a branch from. #1672's
    // fallback evidence is what lets checkRunIntegrity answer at all here.
    // Evaluated last of the three gates because it is the only one that spawns
    // git.
    if (isAbandonedInterrupted(dir, state, sessionId)
      && checkRunIntegrity(dir).state === 'shipped-unclosed') {
      if (dryRun) { archived.push(dir); continue; }
      // closeRunState, not a hand-rolled status write — it owns the
      // close-without-wrapup event and the un-archived-work advisory, which is
      // what makes an automated close indistinguishable from a manual one.
      // `explicit: true` because this IS a deliberate decision about this exact
      // run dir, not the implicit newest-run fallback its refusal guards.
      closeRunState(dir, { explicit: true, sessionId });
      // Then archive. Closing without moving would leave the dir `clean` and
      // therefore permanently invisible to iterRunDirsWithState (docs/hooks.md
      // names this as a blind spot that is "not just delayed"), and would let
      // `archived: N` count a directory still sitting in pipelines/.
      const closeResult = archiveRunDir(root, dir);
      trackArchiveResult(root, repoSlug, dir, closeResult);
      if (!closeResult.ok) { skipped.push({ runDir: dir, reason: closeResult.reason }); continue; }
      archived.push(dir);
      continue;
    }
```

`sessionId` is not currently in scope in `archiveMerged`. Add it to the function's options destructure and default it from the environment:

```js
function archiveMerged({ cwd, dryRun = false, sessionId = process.env.CLAUDE_CODE_SESSION_ID || null } = {}) {
```

Export the two new helpers by adding `lastOwnEventMs, isAbandonedInterrupted, STALE_INTERRUPTED_TTL_MS` to the existing `module.exports` object.

- [ ] **Step 4: Run the tests to verify they pass**

Run the suite. Expected: PASS, including every pre-existing test. Paste the raw counts.

- [ ] **Step 5: Confirm `archived: N` reports them**

`format-summary.js`'s `runs` category counts entries whose action is `archived` (see its `CATEGORIES` table). Because the branch above pushes onto the same `archived` array the merged-PR path uses, no change to `format-summary.js` is required — Deliverable 3 is satisfied by construction. **Verify this rather than asserting it:** find the test or code path that turns `archiveMerged`'s result into the summary line and confirm the auto-closed dir would be counted. If it would NOT be, say so in your report as a `DONE_WITH_CONCERNS` — do not silently edit `format-summary.js` to compensate without saying why.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/reconcile/archive-merged.js <the test file>
git commit -m "Auto-close an abandoned interrupted run whose work shipped — reconcile stops needing a human (refs #1673)"
```

---

## Self-Review

**1. Spec coverage.**
- Deliverable 1 (new criterion: interrupted + no owning session + shipped-unclosed evidence) → Task 2 Step 3's three-gate conjunction.
- Deliverable 2 (call `closeRunState`, indistinguishable from manual) → Task 2 Step 3 calls it directly; case 1's assertions check both the `clean` status and the `close-without-wrapup` event.
- Deliverable 3 (`archived: N` includes them) → Task 2 Step 5, verified rather than assumed.
- Deliverable 4 (recency signal excludes `attribution: fallback`) → `lastOwnEventMs`; case 3 pins it.
- Deliverable 5 (three test cases) → Task 2 Step 1, cases 1-3 exactly.
- AC1/AC2/AC3 → cases 1/2/3. AC4 → the orchestrator's central `npm test`.
- Gotcha "false auto-close is worse than status quo; reuse conservative ownership logic, don't invent a staleness window" → `isAbandonedInterrupted` inverts `foreignOwner`'s own session comparison and reuses `ORPHAN_MINT_TTL_MS`'s value rather than a new number. Stated in Global Constraints.
- Gotcha "blocked by #1672" → satisfied; #1672 landed on this branch, and `checkRunIntegrity`'s fallback is what makes the evidence gate answerable for a torn-down worktree.
- Gotcha "#1613 covers other skip reasons — coordinate, don't duplicate" → this branch adds one criterion and changes no existing skip reason.

**2. Placeholder scan.** Task 1 Step 1 asks the implementer to locate a file rather than naming it — that is a real instruction with a runnable command, because the suite's path is genuinely unknown at authoring time and guessing it would be the placeholder. Every code step carries literal code.

**3. Type consistency.** `lastOwnEventMs(runDir) -> number|null`; `isAbandonedInterrupted(runDir, state, sessionId, now) -> boolean` consumes it; the loop branch consumes `isAbandonedInterrupted` and `checkRunIntegrity(dir).state`. `archiveRunDir(root, dir) -> {ok, reason?}` and `trackArchiveResult(root, repoSlug, dir, result)` are existing signatures in this file, used exactly as the merged-PR path below already uses them.
