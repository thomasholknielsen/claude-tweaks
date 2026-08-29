# Issue-claims.md Lock-Step Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `_shared/issue-claims.md`'s "The lock" steps 1-2 so the prose read path (relied on by `gh`-absent/MCP environments and any manual follower) composes correctly — spelling out the 404→`__ABSENT__` exit-status branch in step 1, and the content-vs-wrapper extraction between steps 1 and 2 — then migrate `tidy/scan-procedures.md`'s hand-rolled claim read (which still has the exact broken form) to the corrected pattern, and add a conformance test that actually exercises the read rather than checking for a citation string.

**Architecture:** Pure documentation/prose fix plus one strengthened test file. No changes to `bin/lib/issues/claim-store.js` or `bin/claim-targets.js`, which already implement the correct behavior since #723 — this plan brings the prose path up to the same standard. `plugin/skills/_shared/issue-claims.md` is the canonical contract; `plugin/skills/tidy/scan-procedures.md` is a consumer that currently hand-rolls a broken copy of the read instead of matching the corrected canonical shape.

**Tech Stack:** Markdown (skill prose), `node --test` (conformance tests), `jq`/`gh api` (shell snippets embedded in the prose).

**Spec:** `/repo/var/repos/thomasholknielsen/claude-tweaks/.claude/worktrees/dispatch-record-780/.claude-tweaks/pipelines/2026-08-26T090717-record-780/work/780-spec.md`

## Global Constraints

- Do not modify `plugin/bin/lib/issues/claim-store.js` or `plugin/bin/claim-targets.js` — both already implement the fix correctly since #723. This is prose + test only.
- The false-contest bug is specific to the *present*-blob path — the absent-blob (`__ABSENT__` sentinel) path already classifies correctly today. Don't touch or restate the absent-path handling beyond adding the missing shell snippet for producing it.
- `grep -c 'base64 -d' plugin/skills/tidy/scan-procedures.md` must end at `0` (acceptance criterion 2), OR the surviving read must carry an explicit absent/failure branch. This plan removes the `base64 -d` form entirely by switching to `claim-targets.js`-backed tooling, which satisfies the criterion by count going to 0.
- `npm test` must stay green throughout — run it after every task's implementation step, not just at the end.

---

### Task 1: Fix `issue-claims.md`'s "The lock" step 1 — add the explicit 404→`__ABSENT__` shell snippet

**Files:**
- Modify: `plugin/skills/_shared/issue-claims.md:83-88` (step 1 of "The lock")
- Test: `tests/flow-claim-preflight.test.js` (new test appended)

**Interfaces:**
- Consumes: nothing new — this task only changes prose/shell-snippet text in an existing markdown file.
- Produces: `plugin/skills/_shared/issue-claims.md`'s step 1 now contains a shell snippet showing the non-zero-exit (404) → `__ABSENT__` sentinel branch, alongside the zero-exit → JSON-wrapper-emitting branch that already exists. Task 2 and Task 3 both read this snippet's exact wording.

- [ ] **Step 1: Write the failing test**

Add to `tests/flow-claim-preflight.test.js` (append near the other `#720`-tagged tests, after the existing `every base64 -d claim read` test at line 100):

```javascript
test('issue-claims.md step 1 spells out the 404->__ABSENT__ exit-status branch as a shell snippet (#780)', () => {
  const content = read('plugin/skills/_shared/issue-claims.md');
  const step1Start = content.indexOf('1. Read the claim file at the payload');
  assert.ok(step1Start !== -1, 'step 1 heading should exist');
  const step2Start = content.indexOf('2. Classify what step 1 read', step1Start);
  assert.ok(step2Start !== -1, 'step 2 heading should exist after step 1');
  const step1 = content.slice(step1Start, step2Start);
  // The 404 branch must be spelled out as an executable shell snippet inside step 1,
  // not left for a manual follower to invent.
  assert.match(step1, /```bash/);
  assert.match(step1, /404/);
  assert.match(step1, /__ABSENT__/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/flow-claim-preflight.test.js`
Expected: FAIL on the new test — step 1's current text (lines 83-88) describes the `gh api ... -q '{content: ..., sha: ...}'` command and the 404-is-normal-outcome note in prose, but has no `\`\`\`bash` fenced snippet showing the exit-status branch, and no `__ABSENT__` token appears before step 2's heading.

- [ ] **Step 3: Write minimal implementation**

Replace the current step 1 bullet (lines 83-88 of `plugin/skills/_shared/issue-claims.md`, i.e. the `1. Read the claim file...` bullet with its two sub-bullets for gh CLI / MCP) with:

```markdown
  1. Read the claim file at the payload's `claimPath` on `CLAIMS_BRANCH`, capturing both its
     content (or absence) and its current **blob sha** when it exists. A 404 (file does not
     exist) is a normal outcome, not an error — it means "never claimed." Emit the literal
     sentinel `__ABSENT__` on a 404 so step 2 can classify it the same way whether the read
     came from a live claim or a never-claimed issue:
     - **gh CLI:**
       ```bash
       if RAW=$(gh api "repos/{owner}/{repo}/contents/${CLAIM_PATH}?ref=${CLAIMS_BRANCH}" \
           -q '{content: (.content | @base64d), sha: .sha}' 2>/tmp/claim-read-err-${ISSUE}.txt); then
         echo "$RAW" > /tmp/claim-wrapper-${ISSUE}.json
         CONTENT_PATH_OR_ABSENT_SENTINEL="/tmp/claim-wrapper-${ISSUE}.json"
       elif grep -q 'HTTP 404\|Not Found' /tmp/claim-read-err-${ISSUE}.txt; then
         CONTENT_PATH_OR_ABSENT_SENTINEL="__ABSENT__"
       else
         # any other non-zero exit (network, auth, rate limit) — not a normal
         # absent-file outcome; handle per the Failure posture table below,
         # do not treat as absent.
         cat /tmp/claim-read-err-${ISSUE}.txt >&2
         exit 1
       fi
       ```
       The command's output (when it succeeds) is the **wrapper object**
       `{content: "<decoded blob text>", sha: "<blob sha>"}` — step 2 below needs only the
       `.content` field's *value*, not this wrapper, so extract it before classifying (see step 2).
     - **MCP:** the equivalent "get file contents" tool call against `claimPath` on
       `CLAIMS_BRANCH`; a not-found response is the same normal outcome — set
       `CONTENT_PATH_OR_ABSENT_SENTINEL="__ABSENT__"` in that case, otherwise write the tool's
       returned content to a file and use that path.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/flow-claim-preflight.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/issue-claims.md tests/flow-claim-preflight.test.js
git commit -m "Spell out 404->__ABSENT__ branch in issue-claims.md step 1 (#780)"
```

---

### Task 2: Fix `issue-claims.md`'s step 2 — state the content-vs-wrapper extraction explicitly

**Files:**
- Modify: `plugin/skills/_shared/issue-claims.md:89-95` (step 2 of "The lock")
- Test: `tests/flow-claim-preflight.test.js` (new test appended)

**Interfaces:**
- Consumes: Task 1's step 1 snippet — specifically the fact that a present blob is now written to a file (`/tmp/claim-wrapper-${ISSUE}.json`) holding the **wrapper object** `{content, sha}`, not raw blob content.
- Produces: `plugin/skills/_shared/issue-claims.md`'s step 2 now explicitly extracts `.content` before calling `classifyClaimBlob`, so a literal follower never hands the classifier the wrapper object.

- [ ] **Step 1: Write the failing test**

Add to `tests/flow-claim-preflight.test.js`:

```javascript
test('issue-claims.md step 2 extracts .content before classifying — never passes the wrapper object (#780)', () => {
  const content = read('plugin/skills/_shared/issue-claims.md');
  const step2Start = content.indexOf('2. Classify what step 1 read');
  assert.ok(step2Start !== -1, 'step 2 heading should exist');
  const step3Start = content.indexOf('3. **`state:', step2Start);
  assert.ok(step3Start !== -1, 'step 3 heading should exist after step 2');
  const step2 = content.slice(step2Start, step3Start);
  // Step 2 must state that the input is the .content field VALUE, not the wrapper object,
  // and must show the one-line extraction (jq -r .content or equivalent) before the
  // classifyClaimBlob call.
  assert.match(step2, /\.content.*field value|field value.*\.content/i);
  assert.match(step2, /not.*(the )?wrapper object|wrapper object.*not/i);
  assert.match(step2, /jq -r '\.content'|jq -r \.content/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/flow-claim-preflight.test.js`
Expected: FAIL — current step 2 text passes `${CONTENT_PATH_OR_ABSENT_SENTINEL}` straight to the `node -e` classify script with no extraction step and no wrapper-vs-content clarification.

- [ ] **Step 3: Write minimal implementation**

Replace the current step 2 bullet (the `2. Classify what step 1 read...` bullet and its fenced `bash` block) with:

```markdown
  2. **Extract the content before classifying.** When step 1 produced a real file (not the
     `__ABSENT__` sentinel), that file holds the **wrapper object** `{content, sha}` from the
     `gh api` call's `-q` filter — step 2's classifier needs the **`.content` field's value**
     (the decoded claim-blob text itself), never the wrapper object. Extract it first:
     ```bash
     if [ "$CONTENT_PATH_OR_ABSENT_SENTINEL" = "__ABSENT__" ]; then
       CLASSIFY_INPUT="__ABSENT__"
     else
       jq -r '.content' "$CONTENT_PATH_OR_ABSENT_SENTINEL" > /tmp/claim-content-${ISSUE}.txt
       CLASSIFY_INPUT="/tmp/claim-content-${ISSUE}.txt"
     fi
     ```
     Then classify:
     ```bash
     node -e "const c=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/claims.js');
       const content = process.argv[1] === '__ABSENT__' ? null : require('fs').readFileSync(process.argv[1],'utf8');
       console.log(JSON.stringify(c.classifyClaimBlob(content, Date.now())))" \
       "${CLASSIFY_INPUT}"
     ```
     A literal follower who skips the extraction and passes the wrapper-object file straight to
     this script hands `classifyClaimBlob` a JSON object with no `claimedAt`/`released` keys —
     it classifies `'unreadable'` (fails closed to *not reclaimable*, same as `'live'`), a false
     contest on a claim that may not exist or may be safely reclaimable. The extraction step
     above is what prevents this.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/flow-claim-preflight.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/issue-claims.md tests/flow-claim-preflight.test.js
git commit -m "State content-vs-wrapper extraction explicitly in issue-claims.md step 2 (#780)"
```

---

### Task 3: Update "Reading claim state" section's mirrored snippet to match

**Files:**
- Modify: `plugin/skills/_shared/issue-claims.md:207-220` ("Reading claim state" section — the same read-then-classify pattern restated for read-only callers)
- Test: `tests/flow-claim-preflight.test.js` (new test appended)

**Interfaces:**
- Consumes: Task 1 and Task 2's corrected step 1/step 2 snippets — this section is described in the file itself as restating "The lock" steps 1-2 above, so it must not drift from the now-corrected version.
- Produces: no new interface — this is a consistency fix so the file has exactly one correct read pattern, not two (one fixed, one still stale).

- [ ] **Step 1: Write the failing test**

Add to `tests/flow-claim-preflight.test.js`:

```javascript
test('issue-claims.md "Reading claim state" section does not restate the old wrapper-object bug (#780)', () => {
  const content = read('plugin/skills/_shared/issue-claims.md');
  const sectionStart = content.indexOf('## Reading claim state');
  assert.ok(sectionStart !== -1, 'Reading claim state section should exist');
  const sectionEnd = content.indexOf('## TTL and staleness');
  assert.ok(sectionEnd !== -1, 'TTL and staleness section should exist after it');
  const section = content.slice(sectionStart, sectionEnd);
  // This section's own node -e snippet reads process.argv[1] as a file path and
  // JSON.parses its raw content directly (no wrapper unwrapping needed, since this
  // section's own contract is "pass the already-extracted content path or __ABSENT__").
  // Pin that it explicitly says so, so a future edit to "The lock" doesn't leave this
  // section silently re-describing the old wrapper-object-shaped input.
  assert.match(section, /"The lock" step 1-2 above/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/flow-claim-preflight.test.js`
Expected: This test is likely to PASS immediately since the citation phrase already exists in the current file (line 209: "'The lock' step 1-2 above"). If it passes without modification, treat this as confirmation the section already correctly defers to "The lock" — skip to Step 5 (commit nothing, this task is a no-op verification). If it fails, proceed to Step 3.

- [ ] **Step 3: Write minimal implementation (only if Step 2 failed)**

Update the "Reading claim state" section's prose to explicitly note its `${CONTENT_PATH_OR_ABSENT_SENTINEL}` input is the already-extracted content path (per Task 2's corrected step 2), not a wrapper-object file — add one clarifying sentence immediately before its `node -e` snippet:

```markdown
This is the single source of truth for whether an issue is claimed, by whom, and whether the
claim is breakable. As in "The lock" step 2 above, `${CONTENT_PATH_OR_ABSENT_SENTINEL}` here is
the already-extracted claim-blob content (or `__ABSENT__`) — never the raw `{content, sha}`
wrapper object a fresh `gh api` read produces.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/flow-claim-preflight.test.js`
Expected: PASS

- [ ] **Step 5: Commit (only if Step 3 made changes)**

```bash
git add plugin/skills/_shared/issue-claims.md tests/flow-claim-preflight.test.js
git commit -m "Clarify Reading-claim-state section defers to corrected lock steps 1-2 (#780)"
```

If Step 2 passed without modification, still commit the new test alone:

```bash
git add tests/flow-claim-preflight.test.js
git commit -m "Pin Reading-claim-state section citation to corrected lock steps (#780)"
```

---

### Task 4: Migrate `scan-procedures.md`'s broken claim read to `claim-store.js`-backed tooling

**Files:**
- Modify: `plugin/skills/tidy/scan-procedures.md:199-214` (Step 4.7's "Primary: list the `claims/` blob keyspace" read)
- Test: `tests/flow-claim-preflight.test.js` (existing test strengthened + new test appended)

**Interfaces:**
- Consumes: none new.
- Produces: `scan-procedures.md`'s claim read no longer hand-rolls `gh api ... | base64 -d`; it either cites the corrected canonical read verbatim or invokes tooling. This plan chooses citing the corrected canonical pattern inline (matching Task 1/2's fixed shell snippets) since `/tidy`'s sweep needs to read *every* claim in the keyspace by name (a listing + per-entry loop), which `claim-targets.js` (built for claiming *named* targets, not sweeping the whole keyspace) doesn't directly serve — `bin/lib/issues/claim-store.js`'s `readClaimBlobContentsApi` is the right primitive, but there's no existing CLI wrapper for "read one claim's classification for a sweep" outside `claim-targets.js`'s claim-attempt flow. Reusing the corrected prose pattern from `issue-claims.md` (now fixed by Task 1/2) is simpler and keeps one canonical shape.

- [ ] **Step 1: Write the failing test**

Strengthen the existing test at `tests/flow-claim-preflight.test.js:90-100` (the citation-presence-only sweep) to also assert the specific broken pattern is gone from `scan-procedures.md` by name, not just swept generically. Add this new, more targeted test right after it:

```javascript
test('scan-procedures.md claim read no longer pipes to bare base64 -d with no absent branch (#780)', () => {
  const content = read('plugin/skills/tidy/scan-procedures.md');
  assert.doesNotMatch(content, /-q '\.content' \| base64 -d/);
  // The corrected read must extract .content via jq (matching issue-claims.md's fixed
  // step 2) or route through __ABSENT__ handling, not the old single-pipe form.
  assert.match(content, /__ABSENT__/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/flow-claim-preflight.test.js`
Expected: FAIL — line 206 of `scan-procedures.md` still contains exactly `-q '.content' | base64 -d` and no `__ABSENT__` token appears anywhere in the file.

- [ ] **Step 3: Write minimal implementation**

Replace lines 202-210 of `plugin/skills/tidy/scan-procedures.md` (the fenced `bash` block under "Primary: list the `claims/` blob keyspace") with the corrected read matching `issue-claims.md`'s now-fixed "The lock" steps 1-2 (Task 1/2 above):

```markdown
```bash
gh api "repos/{owner}/{repo}/contents/claims?ref=claims-registry" -q '.[].name'
# for each claims/issue-<n>.json:
gh issue view <n> --json state -q .state
if RAW=$(gh api "repos/{owner}/{repo}/contents/claims/issue-<n>.json?ref=claims-registry" \
    -q '{content: (.content | @base64d), sha: .sha}' 2>/tmp/tidy-claim-err-<n>.txt); then
  CLASSIFY_INPUT=$(echo "$RAW" | jq -r '.content')
else
  if grep -q 'HTTP 404\|Not Found' /tmp/tidy-claim-err-<n>.txt; then
    CLASSIFY_INPUT="__ABSENT__"
  else
    cat /tmp/tidy-claim-err-<n>.txt >&2
    continue  # transient failure on this entry — skip per the Failure posture table
  fi
fi
node -e "const c=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/claims.js');
  const content = process.argv[1] === '__ABSENT__' ? null : require('fs').readFileSync(process.argv[1] === '__ABSENT__' ? '/dev/null' : process.argv[1],'utf8');
  console.log(JSON.stringify(c.classifyClaimBlob(content, Date.now())))" "${CLASSIFY_INPUT}"
```
```

Wait — the `node -e` invocation above still expects a file path, but `CLASSIFY_INPUT` after the `jq` extraction is now the raw content string, not a path. Fix this before finalizing: write the extracted content to a temp file first, matching `issue-claims.md`'s corrected pattern exactly:

```markdown
```bash
gh api "repos/{owner}/{repo}/contents/claims?ref=claims-registry" -q '.[].name'
# for each claims/issue-<n>.json:
gh issue view <n> --json state -q .state
if RAW=$(gh api "repos/{owner}/{repo}/contents/claims/issue-<n>.json?ref=claims-registry" \
    -q '{content: (.content | @base64d), sha: .sha}' 2>/tmp/tidy-claim-err-<n>.txt); then
  echo "$RAW" | jq -r '.content' > /tmp/tidy-claim-<n>.json
  CLASSIFY_INPUT="/tmp/tidy-claim-<n>.json"
elif grep -q 'HTTP 404\|Not Found' /tmp/tidy-claim-err-<n>.txt; then
  CLASSIFY_INPUT="__ABSENT__"
else
  cat /tmp/tidy-claim-err-<n>.txt >&2
  continue  # transient failure on this entry — skip per the Failure posture table
fi
node -e "const c=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/claims.js');
  const content = process.argv[1] === '__ABSENT__' ? null : require('fs').readFileSync(process.argv[1],'utf8');
  console.log(JSON.stringify(c.classifyClaimBlob(content, Date.now())))" "${CLASSIFY_INPUT}"
```
```

Use this second (corrected) version as the actual replacement text.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/flow-claim-preflight.test.js`
Expected: PASS. Also manually verify: `grep -c "base64 -d" plugin/skills/tidy/scan-procedures.md` → `0` (acceptance criterion 2).

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/tidy/scan-procedures.md tests/flow-claim-preflight.test.js
git commit -m "Migrate scan-procedures.md claim read off broken base64 -d pipe (#780)"
```

---

### Task 5: Strengthen the existing sweep test so citation-presence alone no longer passes

**Files:**
- Modify: `tests/flow-claim-preflight.test.js:90-100` (the existing `every base64 -d claim read under skills/` test)

**Interfaces:**
- Consumes: nothing new.
- Produces: the sweep test now fails on any future `.md` file under `plugin/skills/` that reintroduces the broken `-q '.content' | base64 -d` single-pipe form, regardless of whether it cites `issue-claims.md` nearby — closing the exact gap #780's Current State bullet 3 describes ("citation-presence only... would not catch a regression").

- [ ] **Step 1: Write the failing test**

This step modifies an existing test rather than adding a new one. First, confirm the current (soon-to-be-replaced) test still passes with Task 4's fix applied:

Run: `node --test tests/flow-claim-preflight.test.js`
Expected: All tests pass (Task 4 already removed the offending pattern from `scan-procedures.md`, so the existing citation-presence sweep at lines 90-100 currently reports zero offenders — but it would still incorrectly accept a *new* file that reintroduces the bug with a citation nearby).

- [ ] **Step 2: Demonstrate the gap the current test misses**

Temporarily verify (do not commit this) that the current citation-presence test's logic (`cites && !absentBranch` still counts as OK per line 96-97's `if (!cites && !absentBranch) offenders.push(...)`) would accept a hypothetical new offender with a nearby citation and no absent-branch handling. This confirms the gap named in #780's Gotchas without needing to actually write such a file — read the test logic at lines 90-100 and confirm: a file matching `ref=claims-registry` + `base64 -d` + citing `_shared/issue-claims.md` is never flagged, even with zero `__ABSENT__`/absent-branch handling. This is the citation-presence-only gap.

- [ ] **Step 3: Write minimal implementation**

Replace the test body at `tests/flow-claim-preflight.test.js:90-100` (function `mdFilesUnder` stays; only the test body changes) to require the absent-branch handling regardless of citation:

```javascript
test('every base64 -d claim read under skills/ handles the absent-file case, not just cites issue-claims.md (#720, #780)', () => {
  const offenders = [];
  for (const file of mdFilesUnder(path.join(REPO_ROOT, 'plugin', 'skills'))) {
    const text = fs.readFileSync(file, 'utf8');
    if (!/ref=claims-registry/.test(text) || !/base64 -d/.test(text)) continue;
    // A citation to issue-claims.md is no longer sufficient on its own (#780) — the read
    // itself must show it handles the absent/404 case, via the __ABSENT__ sentinel or an
    // equivalent explicit `|| null` / not-found branch.
    const absentBranch = /__ABSENT__|\|\| null|404/.test(text);
    if (!absentBranch) offenders.push(path.relative(REPO_ROOT, file));
  }
  assert.deepStrictEqual(offenders, []);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/flow-claim-preflight.test.js`
Expected: PASS — after Task 4's fix, `scan-procedures.md` no longer matches `base64 -d` at all (it was migrated to `jq -r '.content'`), so this file is excluded from the sweep entirely by the first `continue` condition. Any remaining `base64 -d` + `ref=claims-registry` file in the tree must show explicit absent-branch handling.

Also run the full suite to confirm nothing else regressed:

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/flow-claim-preflight.test.js
git commit -m "Require absent-branch handling, not just citation, in claim-read sweep (#780)"
```

---

## Self-Review Notes (completed during planning, not a separate task)

**Spec coverage:**
- Deliverable 1 (content-vs-wrapper extraction stated explicitly) → Task 2.
- Deliverable 2 (404→`__ABSENT__` shell snippet in step 1) → Task 1.
- Deliverable 3 (migrate `scan-procedures.md`'s broken read) → Task 4.
- Deliverable 4 (conformance check that actually exercises the read, not just citation) → Task 5 (strengthens the existing sweep) plus Task 1/2's new targeted tests that pin the exact corrected wording.
- Acceptance criterion 1 (live→'live', never-claimed→'absent') is satisfied structurally: Task 1's snippet correctly routes a 404 to `__ABSENT__`→`classifyClaimBlob(null, now)`→`'absent'`, and Task 2's extraction correctly routes a present blob's `.content` value (not the wrapper) into `classifyClaimBlob`, which classifies a well-formed non-stale marker as `'live'`. No task treats this as behavior needing its own runtime test beyond the existing `claims.test.js` unit tests for `classifyClaimBlob` itself (already passing, untouched by this plan) — this plan's tests pin the *prose* composes correctly, since `classifyClaimBlob`'s own correctness is out of scope (Gotcha: don't touch code that isn't broken).
- Acceptance criterion 2 (`grep -c 'base64 -d' scan-procedures.md` → 0) → Task 4, verified explicitly in its Step 4.
- Acceptance criterion 3 (`npm test` green) → verified at the end of Task 5 and implicitly after every task's own test run.

**Placeholder scan:** No TBD/TODO markers. All shell snippets are complete and runnable (not sketched). Task 4 deliberately shows a first-draft-then-corrected snippet inline as part of the plan's own reasoning (catching a file-path-vs-content-string bug in the plan itself) rather than leaving a placeholder — the corrected version is what actually gets written.

**Type/shape consistency:** `CONTENT_PATH_OR_ABSENT_SENTINEL` (Task 1) and `CLASSIFY_INPUT` (Task 4) are both "a file path, or the literal string `__ABSENT__`" — consistent shape across `issue-claims.md` and `scan-procedures.md`. `classifyClaimBlob(content, now)`'s signature (string-or-null, epoch-ms) is unchanged and used identically in every snippet.
