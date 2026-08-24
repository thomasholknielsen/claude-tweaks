# Bookkeeping-Stamps Gate: record-worktree Foreign-Session Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen `checkBookkeepingStampsGate`'s `record-worktree` deny branch (`plugin/bin/lib/hooks/pre-tool-use.js`) so it can distinguish a genuinely-unowned run from a live sibling session's run that just hasn't stamped ownership yet, without weakening the already-effective PR-stamp branch.

**Architecture:** `isForeignSessionCall`'s owner-vs-caller `sessionId` comparison is structurally blind on the `record-worktree` branch, because `sessionId` is stamped together with `worktree` — so on this exact branch (`!ctx.runState.worktree`), `ctx.runState.sessionId` is almost always also unset, meaning `owner` is empty and the comparison can essentially never prove "foreign." `ctx.ownedRun` (`bin/hooks.js`'s own session-scoped `resolveRun` call, independent of this gate's session-agnostic `ctx.runDir`) supplies the missing signal: when the calling session already owns a *different*, already-recorded run than the one this gate is about to deny against, that run more plausibly belongs to a live sibling. Add a second, narrowly-scoped predicate (`hasDistinctOwnedRun`) and OR it into the `record-worktree` branch's foreign check only; the `record-pr` branch keeps calling `isForeignSessionCall` alone.

**Tech Stack:** Node.js (`node --test`), no new dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-08-24T050225-record-1259/work/1259-spec.md`

## Global Constraints

- Preserve the PR-stamp branch's existing foreign-session guard unchanged (spec Deliverable 2).
- Ambiguity resolves to allow throughout — same posture as every other check in this gate and E1.
- No new exported API surface; `hasDistinctOwnedRun` is module-private, same visibility as `isForeignSessionCall`.

---

### Task 1: Add `hasDistinctOwnedRun` and wire it into the record-worktree branch only

**Files:**
- Modify: `plugin/bin/lib/hooks/pre-tool-use.js:788-792` (add predicate after `isForeignSessionCall`), `:829-837` (`stampCheckOutcome` — take the foreign verdict as a parameter instead of computing it internally), `:921-932` (record-worktree branch — pass `isForeignSessionCall(ctx) || hasDistinctOwnedRun(ctx)`), `:934-960` (record-pr branch — pass `isForeignSessionCall(ctx)` unchanged)
- Test: `tests/hooks-bookkeeping-stamps-gate.test.js`

**Interfaces:**
- Consumes: `ctx.ownedRun` (`{ dir: string|null, attribution: string|null }`, already threaded by `bin/hooks.js`'s `main()` via `ctxLib.resolveRun(cwd, process.env, input.session_id)`), `ctx.runDir` (this gate's own session-agnostic run resolution).
- Produces: `hasDistinctOwnedRun(ctx): boolean` — `true` only when `ctx.ownedRun.dir` is a non-empty string, `ctx.runDir` is truthy, and the two differ.

- [x] **Step 1: Write the failing tests**

Three new cases in `tests/hooks-bookkeeping-stamps-gate.test.js`, inserted before the `--- I2 ---` section:
1. Distinct `ownedRun` + unstamped run → warn, not deny (`wd-foreign-session` event, `stamp: 'record-worktree'`).
2. `ownedRun` matching `ctx.runDir` (ordinary single-session case) → still denies.
3. Distinct `ownedRun` on the already-worktree-stamped (PR-stamp) branch → still denies — proves the PR branch is untouched.

- [x] **Step 2: Run tests to verify the first one fails**

Run: `node --test tests/hooks-bookkeeping-stamps-gate.test.js`
Expected: 1 failure (`a caller with its own distinct owned run must not be denied`), 30 pass (including the two control cases, which already pass against unpatched code since `ownedRun` was previously ignored everywhere).

- [x] **Step 3: Implement `hasDistinctOwnedRun` and parameterize `stampCheckOutcome`**

```javascript
function hasDistinctOwnedRun(ctx) {
  const owned = ctx.ownedRun && typeof ctx.ownedRun.dir === 'string' ? ctx.ownedRun.dir : '';
  return Boolean(owned && ctx.runDir && owned !== ctx.runDir);
}

function stampCheckOutcome(ctx, stamp, wtRoot, warnings, warnText, denyText, isForeign) {
  if (isForeign) {
    ctxLib.appendEvent(ctx.runDir, 'wd-foreign-session', { stamp, worktree: wtRoot });
    warnings.push(warnText);
    return {};
  }
  ctxLib.appendEvent(ctx.runDir, 'bookkeeping-stamp-deny', { stamp, worktree: wtRoot });
  return denyResult(denyText);
}
```

Update the record-worktree call site's trailing argument to `isForeignSessionCall(ctx) || hasDistinctOwnedRun(ctx)`, and the record-pr call site's to `isForeignSessionCall(ctx)`.

- [x] **Step 4: Run tests to verify all pass**

Run: `node --test tests/hooks-bookkeeping-stamps-gate.test.js`
Expected: 31/31 pass.

- [x] **Step 5: Run sibling hooks suites + full repo suite**

Run: `node --test tests/hooks-dispatcher.test.js tests/teardown-gate.test.js && npm test`
Expected: all green — no other suite reads `stampCheckOutcome`/`isForeignSessionCall` directly (`grep -rl` confirms `checkBookkeepingStampsGate`/`isForeignSessionCall` matches only this file's own tests plus `hooks-dispatcher.test.js`, which exercises the gate only through `pre.run()`, not the internals).

- [x] **Step 6: Commit**

```bash
git add plugin/bin/lib/hooks/pre-tool-use.js tests/hooks-bookkeeping-stamps-gate.test.js
git commit -m "Strengthen bookkeeping-stamps gate's record-worktree branch via ctx.ownedRun (#1259)"
```

## Scope note (recorded, not a task)

Sibling issues #1099/#1012 (open, unbuilt) also touch ownership classification in `pre-tool-use.js`/`context.js`, but at different sites: #1099 targets `checkWorktreeRequired`'s commit-mismatch check (`wd-push-mismatch`/`wd-deny`/`wd-foreign-session` at the git-target-mismatch site, ~line 1050-1070) and `checkTeardownGate`, both using `classifyOwnership` (#1098) because those sites always have a `runState.worktree` binding to compare against. `checkBookkeepingStampsGate`'s `record-worktree` branch is a third, distinct site where `runState.worktree` is *provably absent* by construction — `classifyOwnership`'s binding-dependent rows can never fire there, so it isn't the right tool for this branch; `ctx.ownedRun`, a different existing signal, is. No overlap confirmed by reading both issues in full before implementing.
