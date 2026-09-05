# Claims-Registry Undefined-Content Write Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a claims-registry blob (`claims/issue-{n}.json` on the `claims-registry` branch) from ever being written as the literal string `"undefined"` (or any other non-JSON-object value) instead of valid claim/tombstone JSON — the defect `/claude-tweaks:tidy`'s 2026-08-17 claims sweep found on three already-closed, already-released issues (#781, #783, #784).

**Architecture:** `tests/claims-single-write-path.test.js` already proves there is exactly one module under `plugin/bin/` that performs the contents-API PUT to the `claims/` keyspace: `plugin/bin/lib/issues/claim-store.js`'s `writeClaimBlob` — every other writer (`bin/claim-targets.js`, `bin/release-claim.js`, `bin/repair-claim.js`, `bin/lib/reconcile/release-merged.js`) delegates its I/O there. Tracing every current caller (`bin/lib/claim-targets/claim-targets.js`'s batch loop, `bin/lib/release-claim/release.js`, `bin/lib/reconcile/release-merged.js`) shows each one composes its write content via `claims.js`'s `claimPayload`/`releasePayload` (`JSON.stringify(marker, null, 2)` assigned directly as an object property, never re-templated afterward) — none has a live, reproducible path to the literal string `"undefined"` today. That is consistent with the defect having already been fixed as a side effect of the unrelated `#787`/`#1467`/`#1486` consolidation work (which replaced multiple hand-rolled write call sites with this one shared module) rather than there being a currently-reachable bug to patch at a specific call site.

Given the single-write-path invariant the test above already pins, the correct, permanent fix is a content-shape guard **inside `writeClaimBlob` itself** — the one choke point every claim/release writer, present and future, is structurally required to pass through. This satisfies the acceptance criteria's own stated alternative ("either the write is rejected before it lands, or the value that would produce it is caught upstream") without inventing a speculative call-site-specific fix for a call site that no longer reproduces the bug.

**Tech Stack:** Node.js (`node --test`), no external dependencies — a pure addition inside an existing library module and its existing test file.

**Spec:** GitHub issue #821 (materialized at `.claude-tweaks/pipelines/2026-09-01T221814-record-821/work/821-spec.md`) — "claim-write bug: claims-registry blobs written as literal \"undefined\" instead of JSON".

## Global Constraints

- risk:medium, size:low, ceremony:fast-lane (this record's own labels) — keep the change narrowly scoped to the one write choke point; no redesign of the claim/release protocol.
- No data was lost (#781/#783/#784 are already closed, their orphaned claims already released by the tidy sweep) — this is a latent-bug prevention fix, not a data-recovery task.
- Fail closed: malformed content must be refused, never silently coerced or repaired into something writable.
- The guard must never be misclassified as `conflict`/`secondaryRateLimit` (which callers treat as retryable/contention) — a caller-computed bad value is a distinct, non-retryable failure.

---

### Task 1: Guard `writeClaimBlob` against malformed content

**Files:**
- Modify: `plugin/bin/lib/issues/claim-store.js` (new `isWellFormedClaimContent` helper + a guard at the top of `writeClaimBlob`)
- Test: `tests/bin-lib/issues/claim-store.test.js`

**Interfaces:**
- Produces: `isWellFormedClaimContent(content) -> boolean`, exported alongside `writeClaimBlob` for direct unit testing.
- Consumes: nothing new — the guard runs before `writeClaimBlob`'s existing `deps.gitRunner`/`deps.ghApi` branches, so it needs no new dependency.

- [x] **Step 1: Add the content-shape guard**

In `plugin/bin/lib/issues/claim-store.js`, add `isWellFormedClaimContent(content)`: rejects anything that is not a non-empty string, or that does not `JSON.parse` into a plain object (not `null`, not an array). This is exactly the shape every legitimate `claimPayload`/`releasePayload` output already has, so no legitimate caller is affected.

Call it as the first statement inside `writeClaimBlob`, before either the git-CAS branch or the contents-API branch: `if (!isWellFormedClaimContent(content)) return { ok: false, failure: 'invalid-content' };`. `'invalid-content'` is a new, distinct failure reason — never folded into `conflict`/`secondaryRateLimit`, so a caller bug surfaces as a clear stop rather than a retried contest.

- [x] **Step 2: Reproduce the exact defect condition in a regression test**

In `tests/bin-lib/issues/claim-store.test.js`, add a test that reproduces the literal mechanism the issue names: a batch caller keying a payload map by issue number, missing one entry, and templating the (JS) `undefined` lookup result — `` `${JSON.stringify(payloadMap[missingIssue])}` `` — which coerces to the literal 9-character string `"undefined"`. Assert `isWellFormedClaimContent` rejects it, and that `writeClaimBlob` refuses to write it (`{ ok: false, failure: 'invalid-content' }`) **without ever calling `ghApi` or `gitRunner`** — proving the malformed value never reaches either transport, on both the conditional-write and create-only paths, and also when `content` is `undefined` itself (not even coerced to a string).

- [x] **Step 3: Run the target test file to verify it passes**

Run: `node --test tests/bin-lib/issues/claim-store.test.js`
Result: 63/63 pass, including the new regression tests.

- [x] **Step 4: Run the sibling claim/release suites to check for regressions**

Run: `node --test tests/bin-lib/claim-targets/claim-targets.test.js tests/bin-lib/release-claim/release.test.js tests/bin-lib/release-claim/cli.test.js tests/bin-lib/repair-claim/repair.test.js tests/bin-lib/repair-claim/cli.test.js tests/claims-single-write-path.test.js tests/flow-claim-preflight.test.js`
Result: all pass — no caller's legitimate JSON content is affected by the new guard.

- [x] **Step 5: Run the full suite and triage any unrelated failures**

Run: `npm test`
Result: 7117/7145 pass; the 16 failures are pre-existing, environment-specific (this sandbox runs as `root`, so the permission-simulation tests — read-only/unreadable-directory checks — cannot actually deny root; plus one plugin-version-pin check and one reconcile-wiring check unrelated to claims). None reference `claim-store.js`, `writeClaimBlob`, or `claims.js`. Confirmed via `git stash` that two of the failing files fail identically without this change.

- [x] **Step 6: Commit**

```bash
git add plugin/bin/lib/issues/claim-store.js tests/bin-lib/issues/claim-store.test.js
git commit -m "Guard claims-registry writes against undefined-coerced content (refs #821)"
```
