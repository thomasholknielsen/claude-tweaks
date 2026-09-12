# ports/ensure.js single-read managed-region check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `plugin/bin/lib/ports/ensure.js`'s `ensure()` from reading and parsing `.env.local`'s managed region twice on the existing-lease-not-free branch, by extracting a `regionIsCurrent(region, ...)` helper that takes an already-parsed region and reusing the region `ensure()` already read into `regionBefore`, while keeping `isRegionCurrent(checkoutRoot, ...)`'s public signature and behavior unchanged as a thin file-reading wrapper.

**Architecture:** Split `isRegionCurrent`'s comparison logic (PORT match + `sameServices`) into a new `regionIsCurrent(region, base, leaseServices, policyServices)` that operates on an already-parsed region array. `isRegionCurrent(checkoutRoot, base, leaseServices, policyServices)` stays exported with its current signature, reimplemented to read + parse `.env.local` then delegate to `regionIsCurrent`. `ensure()`'s call site at line 90 switches from `isRegionCurrent(checkoutRoot, base, lease.services, policyServices)` to `regionIsCurrent(regionBefore, base, lease.services, policyServices)`, reusing the region already read into `regionBefore` at line ~76.

**Tech Stack:** Plain Node.js (`fs`, `path`), `node:test`/`node:assert` for the test — no new dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-09-11T202925-record-2031/work/2031-spec.md` (materialized from GitHub issue #2031) — the plan argues from that spec; the implementer reads both.

## Global Constraints

- Keep `isRegionCurrent(checkoutRoot, base, leaseServices, policyServices)`'s exported signature and behavior byte-for-byte unchanged — five existing assertions in `tests/bin-lib/ports/ensure.test.js` (lines 121, 181, 184, 187, 188) call it directly with a checkout path and must keep passing unmodified.
- `regionIsCurrent`'s missing-region handling must match `isRegionCurrent`'s existing missing-file branch: a falsy `region` argument returns `false` before comparing anything, the same way `readManagedRegion`'s own `if (!region) return false;` short-circuits inside the current function body.
- Only `ensure()`'s internal call site at line 90 changes; no other caller of `isRegionCurrent` exists outside this file and the test file (confirmed: `grep -rn "isRegionCurrent" plugin/ tests/` returns only `ensure.js`'s own definition/export/call-site and the five test assertions above).
- Touch only what the task requires — no reformatting of surrounding code, no changes to `ensure()`'s other branches (`!existingEntry`, `existingEntry && stillFree`), which never call `isRegionCurrent` today and must not start.

---

### Task 1: Extract `regionIsCurrent` and reuse `regionBefore` in `ensure()`

**Files:**
- Modify: `plugin/bin/lib/ports/ensure.js:34-46` (split `isRegionCurrent`, add `regionIsCurrent`), `plugin/bin/lib/ports/ensure.js:90` (call-site swap), `plugin/bin/lib/ports/ensure.js:138` (export)
- Test: `tests/bin-lib/ports/ensure.test.js` (existing suite; add one read-count assertion)

**Interfaces:**
- Consumes: `readManagedRegion(text)` (`./env-file`, unchanged), `fs.readFileSync` (unchanged).
- Produces: `regionIsCurrent(region, base, leaseServices, policyServices) -> boolean` — new, not exported (internal helper; `ensure()` is in the same file so no export needed). `isRegionCurrent(checkoutRoot, base, leaseServices, policyServices) -> boolean` — unchanged export, same signature and behavior, reimplemented as a wrapper.

- [ ] **Step 1: Write the failing read-count test first**

  Add to `tests/bin-lib/ports/ensure.test.js` (near the other `isRegionCurrent`-adjacent tests, e.g. after the block ending at line ~121 that already exercises the existing-lease-not-free branch): a test that spies on `fs.readFileSync` (or counts calls to it via a wrapper/mock) while calling `ensure()` on a fixture checkout with an existing, still-bound lease whose region is current (`stillFree` false, `isRegionCurrent`-equivalent true — the same branch line 90 guards), and asserts `.env.local` is read at most once for the managed-region check during that call.

  A simple approach that matches this file's existing style (no mocking library, plain Node fixtures): wrap `fs.readFileSync` for the duration of one `ensure()` call, count invocations whose path ends in `.env.local`, and assert the count is 1 (the read already performed by `ensure()` into `regionBefore`) — not 2 (which is today's behavior: once for `regionBefore`, once more inside `isRegionCurrent`).

  Run: `node --test tests/bin-lib/ports/ensure.test.js`
  Expected: FAIL — the new assertion fails (or the wrapped counter reads 2) against today's `ensure.js`, since `isRegionCurrent` still does its own independent read at line 90.

- [ ] **Step 2: Split the comparison logic out of `isRegionCurrent`**

  In `plugin/bin/lib/ports/ensure.js`, replace lines 34-46:

  ```javascript
  function isRegionCurrent(checkoutRoot, base, leaseServices, policyServices) {
    let text;
    try {
      text = fs.readFileSync(path.join(checkoutRoot, '.env.local'), 'utf8');
    } catch {
      return false;
    }
    const region = readManagedRegion(text);
    if (!region) return false;
    const portEntry = region.find(([k]) => k === 'PORT');
    if (!portEntry || Number(portEntry[1]) !== base) return false;
    return sameServices(leaseServices, policyServices);
  }
  ```

  with:

  ```javascript
  // Same comparison isRegionCurrent has always made, split out so ensure()
  // can pass an already-parsed region instead of forcing a second read+parse
  // of .env.local on the hot existing-lease-not-free path (#2031).
  function regionIsCurrent(region, base, leaseServices, policyServices) {
    if (!region) return false;
    const portEntry = region.find(([k]) => k === 'PORT');
    if (!portEntry || Number(portEntry[1]) !== base) return false;
    return sameServices(leaseServices, policyServices);
  }

  function isRegionCurrent(checkoutRoot, base, leaseServices, policyServices) {
    let text;
    try {
      text = fs.readFileSync(path.join(checkoutRoot, '.env.local'), 'utf8');
    } catch {
      return false;
    }
    return regionIsCurrent(readManagedRegion(text), base, leaseServices, policyServices);
  }
  ```

- [ ] **Step 3: Redirect `ensure()`'s call site to reuse `regionBefore`**

  At line 90 (inside the `else if` branch of the `existingEntry` conditional), replace:

  ```javascript
    } else if (isRegionCurrent(checkoutRoot, base, lease.services, policyServices)) {
  ```

  with:

  ```javascript
    } else if (regionIsCurrent(regionBefore, base, lease.services, policyServices)) {
  ```

  `regionBefore` is already in scope at this point (read at line ~76, before this conditional).

- [ ] **Step 4: Run the new test to confirm the read-count fix**

  Run: `node --test tests/bin-lib/ports/ensure.test.js`
  Expected: PASS — all tests, including Step 1's new assertion (now sees exactly 1 read of `.env.local` for the managed-region check on the existing-lease-not-free branch) and the five pre-existing `isRegionCurrent(dir, base, leaseServices, policyServices)` assertions at lines 121, 181, 184, 187, 188 (now exercising the wrapper, same signature and behavior, delegating to `regionIsCurrent`).

- [ ] **Step 5: Run the full suite**

  Run: `npm test`
  Expected: PASS — no regressions elsewhere; `ensure.js`'s exports (`{ ensure, isRegionCurrent }`) are unchanged (`regionIsCurrent` stays internal, not exported, since nothing outside this file needs it).

- [ ] **Step 6: Commit**

  ```bash
  git add plugin/bin/lib/ports/ensure.js tests/bin-lib/ports/ensure.test.js
  git commit -m "Stop ensure.js double-reading .env.local's managed region

  refs #2031"
  ```

## Self-Review Notes (for the implementer)

- **Spec coverage:** Deliverable 1 (extract `regionIsCurrent`) → Step 2. Deliverable 2 (`isRegionCurrent` thin wrapper, signature/behavior unchanged) → Step 2. Deliverable 3 (`ensure()` call-site swap) → Step 3. AC1 (at most one read per invocation on the existing-lease-not-free branch) → Step 1/4. AC2 (existing `isRegionCurrent` assertions pass unchanged) → Step 4.
- **Type consistency:** `regionIsCurrent`'s `region` parameter is the same shape `readManagedRegion` already returns (an array of `[key, value]` pairs, or a falsy value) — no new type introduced; `regionIsCurrent`'s falsy-region short-circuit exactly mirrors `isRegionCurrent`'s pre-existing `if (!region) return false;` line, just relocated.
- **No placeholders:** every step names an exact line range and exact before/after code; the test spy approach in Step 1 is fully specified (wrap `fs.readFileSync`, count `.env.local`-suffixed calls, assert count 1) rather than left to the implementer's invention.
