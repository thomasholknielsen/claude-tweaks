# claim-targets.js Write-Transport Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every successful `claim-targets.js` claim a permanent, zero-extra-cost record of which transport (git-CAS vs contents-API) actually wrote it, and document why a full post-write network re-read was scoped out in favor of this diagnostic.

**Architecture:** `bin/lib/claim-targets/claim-targets.js`'s per-issue loop already knows, from `claimStore.writeClaimBlob`'s own return value, whether a successful write went through git-CAS (`write.commitSha` is a string) or fell back to the contents API (no `commitSha`). Surface that distinction as a new `transportByIssue: { [issue]: 'git' | 'contents-api' }` field on the CLI's final JSON envelope, built alongside the existing `claimedThisRun` bookkeeping — no new I/O.

**Tech Stack:** Node.js, `node --test`.

**Spec:** `.claude-tweaks/pipelines/2026-08-30T110750-spec-1486-1501-1502-1557-1558-1563-1564-1505-1543-1561-1571-1604-1613-1649-1651-1485-1507-1511-1512/spec-1486/work/1486-spec.md`

## Global Constraints

- No new network calls in the claim-write hot path — `bin/lib/claim-targets/claim-targets.js`'s the fleet's most-contended endpoint (per `bin/lib/issues/claim-store.js`'s own header comment, #787's whole point was moving load OFF the contents API), so an extra post-write `readClaimBlob` per successful claim is out of scope; this plan's Task 1 accordingly adds a field derived from data already returned by `writeClaimBlob`, not a new read.
- Existing test shape in `tests/bin-lib/claim-targets/claim-targets.test.js` must stay green with only additive assertions — no restructuring of the `reads`/`writes` fixture queues.

---

### Task 1: Add `transportByIssue` to the claim-targets.js JSON envelope

**Files:**
- Modify: `plugin/bin/lib/claim-targets/claim-targets.js:172-386` (the `run()` function — declare the map near `claimedThisRun`, populate it in the `write.ok === true` branch, include it in the final `deps.stdout(JSON.stringify(...))` call)
- Test: `tests/bin-lib/claim-targets/claim-targets.test.js`

**Interfaces:**
- Consumes: `write` — the return value of `claimStore.writeClaimBlob(...)`, already in scope at the `write.ok === true` branch (`plugin/bin/lib/claim-targets/claim-targets.js:337-361`). `write.commitSha` is a string only on a genuine git-CAS success (`claims-git-cas.js`'s `writeClaimBlobGit`); absent (`undefined`) on every contents-API-success path.
- Produces: `transportByIssue` — a plain object, `{ [issueNumber]: 'git' | 'contents-api' }`, containing one entry per issue in `claimedThisRun`, added as a sibling key to the existing `{claimed, alreadyOwned, skipped, labelFailures}` envelope. `alreadyOwned`/`skipped` issues never appear in it (no write happened for them).

- [ ] **Step 1: Write the failing test — contents-API transport recorded**

Add to `tests/bin-lib/claim-targets/claim-targets.test.js`, immediately after test `(a)`:

```javascript
test('(a5) successful contents-API claims report transportByIssue: contents-api', () => {
  const { ghApi } = makeGhApi({
    reads: { 720: [readAbsent] },
    writes: { 720: [writeOk] },
  });
  const { gh } = makeGh({});
  const { deps, io } = baseDeps({ ghApi, gh });

  const code = run(['--run-id', 'r1', '--targets', '720'], deps);

  assert.equal(code, 0);
  const body = JSON.parse(io.out[0]);
  assert.deepEqual(body.transportByIssue, { 720: 'contents-api' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/bin-lib/claim-targets/claim-targets.test.js`
Expected: FAIL — `(a5)` fails with `body.transportByIssue` being `undefined` (`AssertionError [ERR_ASSERTION]`); every other test still passes unchanged (this step adds no new fixture reads, so nothing else is affected).

- [ ] **Step 3: Write minimal implementation**

In `plugin/bin/lib/claim-targets/claim-targets.js`, inside `run()`:

```javascript
  const claimedThisRun = [];
  const alreadyOwned = [];
  const skipped = [];
  const labelFailures = [];
  const transportByIssue = {};
```

(add the `transportByIssue` declaration as a new line immediately after the existing `labelFailures` declaration, around line 176).

Then, in the `write.ok === true` branch (immediately after the existing `knownTip = typeof write.commitSha === 'string' ? write.commitSha : null;` line, before `claimedThisRun.push(issue);`):

```javascript
    // #1486: a permanent, zero-extra-cost record of which transport this
    // claim actually went through — `write.commitSha` is a string only on a
    // genuine git-CAS push success (claims-git-cas.js's writeClaimBlobGit);
    // every contents-API-success path (direct PUT, or the self-write
    // recheck after a rejected git-CAS/PUT) never sets it. This answers the
    // "trace which transport actually wrote" question a future incident
    // investigation would otherwise need temporary logging to answer.
    transportByIssue[issue] = typeof write.commitSha === 'string' ? 'git' : 'contents-api';

    claimedThisRun.push(issue);
```

Finally, update the final envelope:

```javascript
  deps.stdout(JSON.stringify({
    claimed: claimedThisRun, alreadyOwned, skipped, labelFailures, transportByIssue,
  }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/bin-lib/claim-targets/claim-targets.test.js`
Expected: PASS — every test in the file green, including the new `(a5)`.

- [ ] **Step 5: Write the failing test — git-CAS transport recorded**

Add immediately after `(a2)` (the existing git-CAS create-only test):

```javascript
test('(a2b) successful git-CAS claims report transportByIssue: git', () => {
  const TIP = 'a'.repeat(40);
  const gitRunner = (args) => {
    if (args[0] === 'fetch') return '';
    if (args[0] === 'rev-parse' && args[1] !== 'FETCH_HEAD') return `${TIP}\n`;
    if (args[0] === 'update-ref' && args[1] === '-d') return '';
    if (args[0] === 'show') throw new Error(`fatal: path 'claims/issue-720.json' does not exist in '${TIP}'`);
    if (args[0] === 'hash-object') return 'deadbeef\n';
    if (args[0] === 'read-tree') return '';
    if (args[0] === 'update-index') return '';
    if (args[0] === 'write-tree') return 'newtree\n';
    if (args[0] === 'commit-tree') return 'newcommit\n';
    if (args[0] === 'push') return '';
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
  const ghApi = (args) => { throw new Error(`contents-API must not be called when git-CAS works: ${args.join(' ')}`); };
  const { gh } = makeGh({});
  const { deps, io } = baseDeps({ ghApi, gh });
  deps.gitRunner = gitRunner;

  const code = run(['--run-id', 'r1', '--targets', '720'], deps);

  assert.equal(code, 0);
  const body = JSON.parse(io.out[0]);
  assert.deepEqual(body.transportByIssue, { 720: 'git' });
});
```

- [ ] **Step 6: Run test to verify it fails, then passes**

Run: `node --test tests/bin-lib/claim-targets/claim-targets.test.js`
Expected: with Step 3's implementation already in place from the contents-API task above, `(a2b)` should already PASS on first run (the implementation change is transport-agnostic) — this step is a verification run, not a red/green cycle. If it fails, the implementation in Step 3 has a bug; fix before proceeding.

- [ ] **Step 7: Run the full suite**

Run: `node --test tests/bin-lib/claim-targets/claim-targets.test.js`
Expected: PASS, all tests (including every pre-existing one) green.

- [ ] **Step 8: Commit**

```bash
git add plugin/bin/lib/claim-targets/claim-targets.js tests/bin-lib/claim-targets/claim-targets.test.js
git commit -m "Add transportByIssue diagnostic to claim-targets.js's claim envelope"
```

---

### Task 2: Document the investigation and scope decision on the spec

**Files:**
- Modify: `.claude-tweaks/pipelines/2026-08-30T110750-spec-1486-1501-1502-1557-1558-1563-1564-1505-1543-1561-1571-1604-1613-1649-1651-1485-1507-1511-1512/spec-1486/work/1486-spec.md` (append a new `## Investigation Findings` section after `## Gotchas`, before `## Original request`)

**Interfaces:**
- Consumes: nothing (documentation-only task)
- Produces: nothing consumed by later tasks — this is the deliverable's own "documented as a known limitation with a mitigation" half of Acceptance Criteria bullet 2

- [ ] **Step 1: Append the findings section**

Insert, after the existing `## Gotchas` section and before `## Original request`:

```markdown
## Investigation Findings

Code review of `bin/lib/issues/claim-store.js`'s `writeClaimBlob` and
`bin/lib/issues/claims-git-cas.js`'s `writeClaimBlobGit` (current
checkout, post-#787) shows both write-success paths are already backed by
a genuine confirmed transport acknowledgment:

- **git-CAS:** `writeClaimBlobGit` returns `ok: true` only when `git push
  --force-with-lease` exits without throwing — the compare-and-swap is
  enforced server-side by git's own push machinery, so a successful push
  IS the confirmation the commit landed on `claims-registry` at the
  expected tip.
- **contents-API:** `writeClaimBlob`'s direct PUT returns `ok: true` only
  on a genuine 2xx GitHub API response (`r.failure === null`). The two
  self-write reconciliation branches added by #787 (a git-CAS rejection or
  a PUT 422/409/404 whose fresh re-read shows THIS write's own content
  already live) report `ok: true` only when a live re-read positively
  confirms the target content, not merely on an ambiguous rejection.

On the current codebase, the specific failure mode described in this
record's Current State (a claim reported successful with no matching
`claims-registry` commit) is not reproducible from static analysis of
either write path — every `ok: true` return traces to a positive
transport or content confirmation. The most plausible explanation for the
original #1302 incident is that it predates #787's C1/I1 self-write-
reconciliation fixes, which shipped specifically to close this class of
gap.

A live, fresh `/claude-tweaks:dispatch next` reproduction run was judged
out of proportion for this fix inside an unrelated 19-record batch build
(see this run's `decisions.md`, Spec Step 3 scope decision) and was not
attempted. As a substitute for Acceptance Criteria bullet 1's "confirmed
by direct branch inspection," this build's OWN Step 2.8
`claim-targets.js` invocation — claiming all 19 records in this batch,
including this one — is available as live evidence: `git log --oneline
origin/claims-registry -- claims/issue-1486.json` shows the real commit
this run's own claim produced.

**Mitigation (Acceptance Criteria bullet 2's "documented as a known
limitation with a mitigation"):** `claim-targets.js`'s JSON envelope now
reports `transportByIssue: { [issue]: 'git' | 'contents-api' }` for every
claimed issue (Task 1) — a permanent record of which transport a claim
went through, replacing the "add temporary logging" step this record's
own Technical Approach section proposed. A future incident with the same
symptom (label/comment landed, no matching branch commit) can now be
triaged from this field directly instead of needing new instrumentation
added after the fact.
```

- [ ] **Step 2: Commit**

```bash
git add ".claude-tweaks/pipelines/2026-08-30T110750-spec-1486-1501-1502-1557-1558-1563-1564-1505-1543-1561-1571-1604-1613-1649-1651-1485-1507-1511-1512/spec-1486/work/1486-spec.md"
git commit -m "Record #1486 investigation findings and scope decision on the spec"
```
