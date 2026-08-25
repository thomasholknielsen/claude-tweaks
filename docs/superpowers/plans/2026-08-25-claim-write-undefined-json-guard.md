# Claim-Write Undefined-JSON Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a claims-registry blob from ever being written as the literal string `undefined` instead of valid JSON, and close the documentation gap in `_shared/issue-claims.md` that let a hand-scripted MCP-fallback write produce that content in the first place.

**Architecture:** Add a defensive content-validation guard at the single JS write-path entry point (`claim-store.js`'s `writeClaimBlob`, which every real (non-doc-prose) writer — the `claim-targets.js` batch CLI, `release-claim.js`, `reconcile/release-merged.js` — funnels through for both the git-CAS and contents-API write mechanisms) that rejects any `content` which isn't valid, non-`undefined`-shaped JSON before it ever reaches `Buffer.from`/`hash-object`. Separately, fix `_shared/issue-claims.md`'s "The lock" bash snippets, which reference `$FILE_CONTENT`/`$CLAIM_PATH`/`$CURRENT_SHA` without ever showing how those shell variables are extracted from the JSON payload file built earlier in the same procedure — the gap an agent following that doc by hand has to improvise, which is the actual root cause the investigation traced (three consecutive issue numbers = one hand-scripted batch loop, one repeated mistake per iteration).

**Tech Stack:** Node.js (CommonJS), `node:test` + `node:assert/strict`, the injectable-runner (`ghApi`/`gitRunner`) seam documented in the `gh-api-module-pattern` skill.

**Spec:** `.claude-tweaks/pipelines/2026-08-25T203747-record-821/work/821-spec.md` (materialized from issue #821)

## Global Constraints

- No real `gh`/`git` invocations in any test — every test injects fake `ghApi(args)` / `gitRunner(args)` functions per the `gh-api-module-pattern` skill's seam, matching the existing tests in `tests/bin-lib/issues/claim-store.test.js`.
- The guard must reject *before* `Buffer.from(content, 'utf8')` (contents-API path) and before `runner(['hash-object', '-w', '--stdin'], { input: content })` (git-CAS path) — both are reachable from `writeClaimBlob`, so the guard must sit ahead of the `if (deps.gitRunner && sha)` branch that dispatches to git-CAS, not only ahead of the contents-API fallback further down.
- The new failure classification must be a distinct string (`'invalid-content'`) — never overload `'network-failure'`/`'transport-failure'`/`'secondary-rate-limit'`/`'gh-absent'`, since those drive different retry/backoff semantics elsewhere (`_shared/issue-claims.md`'s Failure posture table, `claim-targets.js`'s `write.failure || write.secondaryRateLimit` branch).
- Do not change `writeClaimBlob`'s existing return shape (`{ok, conflict?, secondaryRateLimit?, failure}`) beyond adding this new `failure` value — callers already treat any truthy `failure` as a named, reportable error (`claim-targets.js` line 261-266), so no caller-side change is required.
- `_shared/issue-claims.md` edits must stay consistent with its own established prose style (numbered steps, `gh CLI:`/`MCP:` sub-bullets) — do not restructure the surrounding sections.

---

### Task 1: Add the invalid-content guard to `writeClaimBlob`

**Files:**
- Modify: `plugin/bin/lib/issues/claim-store.js:265-316` (the `writeClaimBlob` function)
- Test: `tests/bin-lib/issues/claim-store.test.js`

**Interfaces:**
- Consumes: nothing new — this task only adds a guard inside the existing `writeClaimBlob(deps, repoSlug, issueNumber, { content, sha, createOnly, expectedContent, message })` signature.
- Produces: `writeClaimBlob` now returns `{ ok: false, failure: 'invalid-content' }` when `content` is not a string that parses as valid, non-`undefined` JSON — no other return shape changes. Later tasks (none in this plan) and existing callers (`claim-targets.js`, `release-claim.js`, `reconcile/release-merged.js`) consume this by checking `write.failure` truthiness, which they already do.

- [ ] **Step 1: Write the failing tests**

Add to `tests/bin-lib/issues/claim-store.test.js`, near the existing `writeClaimBlob` tests (after the `'writeClaimBlob: create-only omits sha from argv'` test, before `'writeClaimBlob: sha present -> conditional write sends it in argv'`):

```javascript
test('writeClaimBlob: literal string "undefined" content is rejected before any write attempt', () => {
  const ghApi = () => { throw new Error('ghApi must never be called for invalid content'); };
  const r = writeClaimBlob({ ghApi }, 'acme/w', 7, { content: 'undefined', message: 'Claim issue-7.json' });
  assert.equal(r.ok, false);
  assert.equal(r.failure, 'invalid-content');
});

test('writeClaimBlob: undefined content value is rejected before any write attempt', () => {
  const ghApi = () => { throw new Error('ghApi must never be called for invalid content'); };
  const r = writeClaimBlob({ ghApi }, 'acme/w', 7, { content: undefined, message: 'Claim issue-7.json' });
  assert.equal(r.ok, false);
  assert.equal(r.failure, 'invalid-content');
});

test('writeClaimBlob: non-JSON garbage content is rejected before any write attempt', () => {
  const ghApi = () => { throw new Error('ghApi must never be called for invalid content'); };
  const r = writeClaimBlob({ ghApi }, 'acme/w', 7, { content: '{not valid json', message: 'Claim issue-7.json' });
  assert.equal(r.ok, false);
  assert.equal(r.failure, 'invalid-content');
});

test('writeClaimBlob: invalid content is rejected even on the git-CAS path (before hash-object)', () => {
  const gitCalls = [];
  const gitRunner = (args) => { gitCalls.push(args); throw new Error('gitRunner must never be called for invalid content'); };
  const ghApi = () => { throw new Error('ghApi must never be called for invalid content'); };
  const r = writeClaimBlob({ ghApi, gitRunner }, 'acme/w', 7, {
    content: 'undefined', sha: 'deadbeef', message: 'Claim issue-7.json', expectedContent: null,
  });
  assert.equal(r.ok, false);
  assert.equal(r.failure, 'invalid-content');
  assert.equal(gitCalls.length, 0, 'git-CAS must never be attempted for invalid content');
});

test('writeClaimBlob: valid JSON content (the real claimPayload shape) still writes successfully', () => {
  const calls = [];
  const ghApi = (args) => {
    calls.push(args);
    if (args[0] === '--method' && args[1] === 'PUT' && args[2] === 'repos/acme/w/contents/claims/issue-7.json') {
      return { stdout: '{}', failure: null, status: null };
    }
    throw new Error(`unexpected ${args.join(' ')}`);
  };
  const r = writeClaimBlob({ ghApi }, 'acme/w', 7, {
    content: JSON.stringify({ runId: 'r1', sessionId: 's1', claimedAt: 1, ttlHours: 4, host: 'h' }, null, 2),
    message: 'Claim issue-7.json',
  });
  assert.equal(r.ok, true);
  assert.equal(r.failure, null);
  assert.equal(calls.length, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/bin-lib/issues/claim-store.test.js`
Expected: the four new rejection tests FAIL (either `ghApi`/`gitRunner` throws because the guard doesn't exist yet and the code proceeds to call them, or `r.failure` is not `'invalid-content'`). The final "valid JSON content" test PASSES already (no regression expected there).

- [ ] **Step 3: Implement the guard**

In `plugin/bin/lib/issues/claim-store.js`, add a small validator function above `writeClaimBlob` (after `classifyGhApiError`/`defaultGhApi`, near the other module-private helpers — place it directly above `writeClaimBlob` at line 265):

```javascript
// A claims-registry blob is always `JSON.stringify(...)` of a plain object
// (`claimPayload`/`releasePayload` in `./claims.js`) — never string
// concatenation or template interpolation. Any caller handing writeClaimBlob
// a `content` that isn't a string, or a string that doesn't parse as JSON,
// is a defect upstream of this module (issue #821: a hand-scripted write
// following `_shared/issue-claims.md`'s "The lock" procedure by hand — the
// doc's bash snippets reference $FILE_CONTENT without showing its jq
// extraction — produced the literal 9-character string "undefined" instead
// of a JSON blob). Reject here, before either write mechanism, rather than
// silently persisting corrupt content that only a later read discovers.
function isValidClaimContent(content) {
  if (typeof content !== 'string') return false;
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}
```

Then, at the very top of `writeClaimBlob` (line 265-267 currently reads `function writeClaimBlob(deps, repoSlug, issueNumber, { content, sha, createOnly = false, expectedContent, message, }) {`), add the guard as the function's first statement, before the existing `if (deps.gitRunner && sha) {` branch:

```javascript
function writeClaimBlob(deps, repoSlug, issueNumber, {
  content, sha, createOnly = false, expectedContent, message,
}) {
  if (!isValidClaimContent(content)) return { ok: false, failure: 'invalid-content' };
  if (deps.gitRunner && sha) {
    // ... existing git-CAS branch unchanged
```

Export `isValidClaimContent` alongside the module's other named exports (the `module.exports = { ... }` block starting at line 357) so the test file can unit-test it directly if desired — not required by the tests above, but keeps it consistent with how every other helper in this file is exported.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/bin-lib/issues/claim-store.test.js`
Expected: PASS — all tests, including the pre-existing ones (no regression) and the five new ones.

- [ ] **Step 5: Run the full claim/release test surface to check for regressions**

Run: `node --test tests/bin-lib/issues/claim-store.test.js tests/bin-lib/claim-targets/claim-targets.test.js tests/bin-lib/issues/claims.test.js tests/bin-lib/issues/claims-git-cas.test.js tests/claims-single-write-path.test.js tests/flow-claim-preflight.test.js`
Expected: PASS — the guard only rejects a `content` shape (`undefined`/non-JSON string) that no existing passing test ever supplies, since every existing caller already builds `content` via `claimPayload`/`releasePayload`'s `JSON.stringify(...)`.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/issues/claim-store.js tests/bin-lib/issues/claim-store.test.js
git commit -m "Guard writeClaimBlob against undefined/non-JSON content — refs #821"
```

---

### Task 2: Fix the missing shell-variable extraction in `_shared/issue-claims.md`

**Files:**
- Modify: `plugin/skills/_shared/issue-claims.md:53-110` ("The lock" section — the payload-build snippet at line 55-60, and steps 3-4's PUT commands referencing `$FILE_CONTENT`/`$CLAIM_PATH`/`$CURRENT_SHA` at lines 85, 98, 108)

**Interfaces:**
- Consumes: nothing code-level — this is a documentation-only task correcting the manual/MCP-fallback procedure an agent follows by hand.
- Produces: nothing code-level. No test exercises markdown prose in this repo (`skill-prose-conformance-tests` covers byte-pinning prose fixtures, not executing them) — this task is verified by inspection (Step 2 below), not `node --test`.

- [ ] **Step 1: Read the current section and identify every undeclared shell variable**

Read `plugin/skills/_shared/issue-claims.md` lines 53-130 in full. Confirm the three gaps (already verified during investigation, re-confirm before editing):
1. Line 59 writes the full payload object to `/tmp/claim-payload-${ISSUE}.json` via `node -e "... console.log(JSON.stringify(c.claimPayload({...})))" ... > /tmp/claim-payload-${ISSUE}.json` — this file holds `{owner, repo, claimPath, fileContent, commentBody}` (per `claimPayload`'s documented return shape, line 22 comment in `claims.js`), but no line anywhere afterward extracts `.claimPath`/`.fileContent` from it into `$CLAIM_PATH`/`$FILE_CONTENT`.
2. Line 85's read command uses `${CLAIM_PATH}` directly with no prior assignment.
3. Line 98/108's write commands use `$FILE_CONTENT` (and line 108 additionally `${CURRENT_SHA}`) with no prior assignment — `$CURRENT_SHA` is meant to come from step 1's read (`.sha` from the `-q` query at line 85), never explicitly captured into a named variable either.

- [ ] **Step 2: Add the missing extraction lines**

Edit `plugin/skills/_shared/issue-claims.md`. Immediately after the existing payload-build snippet (ending at line 59's `> /tmp/claim-payload-${ISSUE}.json`), insert a new line extracting `$CLAIM_PATH` and `$FILE_CONTENT` — both needed by every step below regardless of which classify-state branch is taken:

```bash
node -e "const p=require('/tmp/claim-payload-${ISSUE}.json');
  console.log(JSON.stringify({claimPath: p.claimPath, fileContent: p.fileContent}))" \
  > /tmp/claim-fields-${ISSUE}.json
CLAIM_PATH=$(node -e "console.log(require('/tmp/claim-fields-${ISSUE}.json').claimPath)")
FILE_CONTENT=$(node -e "console.log(require('/tmp/claim-fields-${ISSUE}.json').fileContent)")
```

(Use `node -e ... require(...)` rather than `jq` for the extraction, matching this file's existing convention of shelling out to `node -e` against `claims.js`'s helpers elsewhere in the same section — e.g. line 56-60's own payload-build call and line 91-95's `classifyClaimBlob` call — rather than introducing a new `jq` dependency this doc doesn't otherwise use.)

Immediately after step 1's read command (the `gh api ... -q '{content: ..., sha: .sha}'` call at line 85, and its MCP equivalent at line 87-88), add the `$CURRENT_SHA` extraction — scoped to apply only when the read found an existing blob (steps 3-4's branching already distinguishes `'absent'` from `'tombstone'`/`'stale'`, so state this is only needed for the latter):

```bash
# When step 1's read found an existing blob (state 'tombstone'/'stale' below),
# capture its blob sha for the conditional write in step 4:
CURRENT_SHA=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).sha)" /tmp/claim-read-${ISSUE}.json)
```

Update the surrounding prose in step 1 (currently "capturing both its content (or absence) and its current **blob sha** when it exists") to note that step 1's `gh api`/MCP output should be saved to `/tmp/claim-read-${ISSUE}.json` so this `$CURRENT_SHA` extraction (and step 2's classify call, which already reads a content path) has a concrete file to read from — currently the doc describes the capture in prose without naming where it lands.

- [ ] **Step 3: Verify the edited section is internally consistent**

Read the full edited "The lock" section top to bottom (lines 53-130 plus the new insertions) and confirm every `$VARIABLE` referenced in a `gh CLI:` bash snippet (`$CLAIM_PATH`, `$FILE_CONTENT`, `$CURRENT_SHA`, `$ISSUE`, `$RUN_ID`, `${CLAIMS_BRANCH}`, `${CONTENT_PATH_OR_ABSENT_SENTINEL}`) now has a prior assignment or is clearly an externally-supplied input (`$ISSUE`/`$RUN_ID` are caller-supplied per the file's own framing — leave those as-is). This is a manual read-through, not a scripted check — there is no test harness for markdown prose execution in this repo.

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/_shared/issue-claims.md
git commit -m "Fix missing shell-variable extraction in issue-claims.md's manual claim procedure — refs #821"
```

---

## Acceptance Criteria Cross-Check

- "The call site that wrote the three malformed blobs is identified and named." → Task 2's Step 1 documents the identified gap: `_shared/issue-claims.md`'s "The lock" section, referenced by any agent following the MCP-fallback/manual procedure by hand (every JS write path was verified structurally immune — `Buffer.from(undefined)`/`hash-object --stdin` with undefined input both throw rather than silently writing the string "undefined").
- "The fix prevents a claims-registry blob from ever being written as the literal string `undefined`... either the write is rejected before it lands, or the value that would produce it is caught upstream." → Task 1 adds the write-path guard (rejected before it lands, both write mechanisms) as defense-in-depth; Task 2 fixes the doc gap that actually produced the historical incident (caught upstream, at the source of the mistake).
- "A regression test reproduces the exact condition (an `undefined` value reaching the write path) and asserts the fix catches it." → Task 1 Step 1's five new tests in `tests/bin-lib/issues/claim-store.test.js`, including the literal string `'undefined'` case (the exact historical content) and a genuine `undefined` value case.
