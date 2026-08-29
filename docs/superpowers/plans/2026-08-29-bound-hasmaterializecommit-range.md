# Bound `hasMaterializeCommit` to the Integration Range — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the IL-131 bookkeeping-stamps gate from denying a fresh worktree whose only "materialize commit" match is history it *inherited* from an unrelated, already-merged run.

**Architecture:** One call changes. `hasMaterializeCommit`'s `git log` currently walks all of `HEAD`'s reachable history for the run-id pathspec; it gains an `{integration}..HEAD` range so only commits unique to this worktree count. `integration` comes from `resolveIntegrationBranch` — the same helper `run-integrity.js` already imports from `./worktree-reap`, so no second resolution path is introduced. An unresolvable integration branch fails open (`return false`, gate not armed), matching every other check in that file.

**Tech Stack:** Node 18+, CommonJS, `node --test`. Zero runtime npm deps. Git only through `runGit()`.

**Spec:** `.claude-tweaks/pipelines/2026-08-29T185308-spec-1463-1672-1673-1674/spec-1674/work/1674-spec.md` (GitHub record #1674)

## Global Constraints

- **Get the range direction right.** `{integration}..HEAD` means "reachable from HEAD but not from integration" — this worktree's own unique history. Reversing it silently breaks both this fix and IL-131's original protection, with no test failure until a real regression. The record's own Gotchas call this out; AC1 and AC2 test the two directions explicitly.
- **Fail open, never closed.** `hasMaterializeCommit` returning `false` means "gate not armed". An unresolvable integration branch, a git failure, or an unusable `runDir` must all return `false` — same posture as the rest of `pre-tool-use.js`, whose header says ambiguity never triggers the gate.
- Reuse `resolveIntegrationBranch` from `./worktree-reap` (signature `(repoRoot, cache) -> string|null`; `cache` is optional). Do not add a second resolution path and do not modify `worktree-reap.js`.
- Do not change the pathspec strings. The `spec-*/work/*` trailing-wildcard form is load-bearing and its own comment explains why — leave both entries exactly as they are.
- Commit style `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes. Write `refs #1674`, never `closes`/`fixes`.
- Test command: `node --test tests/hooks-pre-tool-use.test.js`. Do **not** run the full `npm test` — the orchestrator runs it centrally.

---

### Task 1: Bound the range

**Files:**
- Modify: `plugin/bin/lib/hooks/pre-tool-use.js` (`hasMaterializeCommit`, ~line 827)
- Test: `tests/hooks-pre-tool-use.test.js`

**Interfaces:**
- Consumes: `resolveIntegrationBranch` from `./worktree-reap`. Check whether `pre-tool-use.js` already imports anything from that module and extend the existing destructure rather than adding a duplicate require.
- Produces: no signature change. `hasMaterializeCommit(worktreeRoot, runDir) -> boolean` is unchanged for every caller.

- [ ] **Step 1: Write the failing tests**

Read `tests/hooks-pre-tool-use.test.js` first and follow its existing fixture style for building a repo + linked worktree + run dir. Add three tests:

1. **AC1 — inherited history must not arm the gate.** A worktree with zero commits beyond the integration branch, where a materialize commit for *this run id* exists in the integration branch's own history (i.e. it was merged there by an unrelated earlier run). Assert `hasMaterializeCommit(wtRoot, runDir) === false`. Against the unbounded implementation this returns `true` — that is the bug.
2. **AC2 — regression guard, the original IL-131 protection.** A worktree that itself carries an unmerged materialize commit for this run id, i.e. a commit inside `{integration}..HEAD`. Assert `hasMaterializeCommit(wtRoot, runDir) === true`. This must stay true; it is record #991's original fix.
3. **AC3 — unresolvable integration branch fails open.** A repo where `resolveIntegrationBranch` returns `null` (no `policy.yml` integration key and no `origin/HEAD` — a fixture repo with no remote already satisfies the second half; confirm the first). Assert `hasMaterializeCommit(...) === false` even when a matching commit exists.

`hasMaterializeCommit` is module-private today. Check whether the test file can reach it; if not, either export it (additive, alongside the existing exports) or drive it through `run()` the way the file's other gate tests do. Prefer whichever the existing suite already does for sibling helpers — say which you chose and why.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/hooks-pre-tool-use.test.js`
Expected: FAIL on AC1 and AC3. AC2 passes already — it is the control that must stay green. Paste the raw counts and failing names.

- [ ] **Step 3: Write the implementation**

In `plugin/bin/lib/hooks/pre-tool-use.js`, add `resolveIntegrationBranch` to the imports from `./worktree-reap`, then change `hasMaterializeCommit`'s git call. Replace:

```js
  const { stdout, failure } = runGit(
    ['log', '--oneline', '-1', '--', `${runRel}/work`, `${runRel}/spec-*/work/*`],
    worktreeRoot,
  );
  if (failure) return false;
  return Boolean(stdout && stdout.trim());
```

with:

```js
  // Range-bound to this worktree's own commits (#1674). The unbounded walk
  // this replaces matched the run-id pathspec anywhere in HEAD's reachable
  // history — so once a run's materialize commit shipped and merged into the
  // integration branch, it became part of every LATER worktree's inherited
  // history and armed this gate against runs that had never materialized
  // anything of their own. `{integration}..HEAD` is "reachable from HEAD but
  // not from integration": exactly the commits unique to this worktree.
  //
  // Fail open when the integration branch can't be resolved — an unbounded
  // fallback would reinstate the very false positive this fixes, and a gate
  // that can't scope itself must not fire (same posture as every other check
  // in this file).
  const integration = resolveIntegrationBranch(worktreeRoot);
  if (!integration) return false;
  const { stdout, failure } = runGit(
    ['log', '--oneline', '-1', `${integration}..HEAD`, '--', `${runRel}/work`, `${runRel}/spec-*/work/*`],
    worktreeRoot,
  );
  if (failure) return false;
  return Boolean(stdout && stdout.trim());
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/hooks-pre-tool-use.test.js`
Expected: PASS, including every pre-existing test. Paste raw counts.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/lib/hooks/pre-tool-use.js tests/hooks-pre-tool-use.test.js
git commit -m "Bound hasMaterializeCommit to the integration range — inherited history no longer arms the IL-131 gate (refs #1674)"
```

---

### Task 2: Update the two docs the record names

**Files:**
- Modify: `docs/hooks.md` (the bookkeeping-stamps gate bullet)
- Modify: `docs/incident-log.md` (the IL-131 entry)

- [ ] **Step 1: Update `docs/hooks.md`**

Find the bullet beginning `**Bookkeeping-stamps gate (block tier, IL-131):**`. It describes `hasMaterializeCommit` as firing once "**this run's own** materialize commit has landed on the run's branch". Add a sentence recording that the check is now range-bounded to `{integration}..HEAD`, that this exists because a merged materialize commit otherwise becomes part of every later worktree's inherited history and arms the gate against innocent runs, and that an unresolvable integration branch fails open.

Keep it to one or two sentences — that file is already dense, and this repo's convention is rule-plus-brief-why, not narrative.

- [ ] **Step 2: Update `docs/incident-log.md`**

Locate the `IL-131` entry. Append a short correction paragraph noting that the guard's original implementation walked unbounded history, that this produced a second false-positive class (a fresh worktree denied for a *predecessor's* merged materialize commit), and that #1674 bounded it to `{integration}..HEAD`. Match the file's existing entry style — read a neighbouring entry first and follow its shape rather than inventing a format.

- [ ] **Step 3: Commit**

```bash
git add docs/hooks.md docs/incident-log.md
git commit -m "Record the IL-131 guard's range bound in the hooks contract and incident log (refs #1674)"
```

---

## Self-Review

**1. Spec coverage.**
- Deliverable 1 (bound to `{integration}..HEAD` via `resolveIntegrationBranch` from `./worktree-reap`) → Task 1 Step 3.
- Deliverable 2 (unresolvable integration branch fails open / returns `false`) → the `if (!integration) return false;` guard; AC3 pins it.
- Deliverable 3 (`docs/hooks.md` IL-131 description) → Task 2 Step 1.
- Deliverable 4 (`docs/incident-log.md` entry) → Task 2 Step 2.
- AC1 → Task 1 test 1. AC2 → test 2 (explicitly the #991 regression guard). AC3 → test 3. AC4 → the orchestrator's central `npm test`.
- Gotcha "get the range direction/inclusivity right; test both directions" → AC1 and AC2 are the two directions, and AC2 fails if the range is inverted.
- Gotcha "docs updates are prose-only, don't conflate with #1100's broader ownership-contract work" → Task 2 touches only the IL-131 description and entry.
- Non-goal "not tracking worktree ownership as a new concept" → no new state, no new field; one argument added to one git call.

**2. Placeholder scan.** Task 1 Step 1 asks the implementer to determine how the suite reaches a module-private function rather than prescribing it — that is a genuine unknown with a stated decision procedure and a required justification, not a blank. Every code step carries literal code.

**3. Type consistency.** `resolveIntegrationBranch(repoRoot, cache) -> string|null`, called with one argument (cache optional, matching `run-integrity.js`'s own uncached call sites). `hasMaterializeCommit(worktreeRoot, runDir) -> boolean` is unchanged, so `checkBookkeepingStampsGate`'s call site needs no edit.

## Known limitation to state, not fix

`resolveIntegrationBranch` returns a **local** branch name (e.g. `main`), so the range is computed against the local ref, which can sit behind `origin/main`. When it does, `{integration}..HEAD` is wider than the worktree's true own-work set and the gate stays armed on a few inherited commits — the conservative direction (a false *deny*, the pre-existing behavior, rather than a false allow). Narrowing that further would mean resolving `origin/{integration}` and fetching, which `pre-tool-use.js` must not do: it runs on every covered tool call and is required to stay offline and cheap. Note this in the implementation comment; do not attempt to fix it here.
