# Record-creation Step 4 linking identifiers (#608) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `skills/specify/record-creation.md` Step 4's two native-linking `gh api` snippets correct — the `sub_issues` write sends the sub-issue's database ID, and the `blocked_by` dependency endpoint is named with its identifier — and pin both with a prose test that discriminates.

**Architecture:** Two prose edits in one markdown procedure file plus one new `node:test` file that reads the markdown and asserts on literal strings. The test is written first (red), then the prose is fixed (green). No runtime code changes.

**Tech Stack:** Markdown skill files; Node 18+ built-in `node:test` / `node:assert/strict`; `npm test` picks up any `tests/*.test.js` automatically.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T163452-spec-608-610/spec-608/work/608-spec.md`

## Global Constraints

- Only two files may change: `skills/specify/record-creation.md` and the new `tests/specify-record-creation-linking.test.js` (spec AC 6).
- Never write the literal placeholder tokens `TBD` / `TODO` / `<!-- ambiguity:` into any skill file — a repo-wide spec-shape check greps for them (`skills/specify/shaping-mode.md`).
- The read call sites for `sub_issues` (`skills/wrap-up/verification-brief.md`, `skills/_shared/trust-table.md`, `skills/_shared/github-pr-scan-acceptance.md`) are correct and out of scope — do not touch them.
- Use `-F` (typed) for numeric REST fields so ids are sent as integers; ask GraphQL for `databaseId` (the integer), never the node `id` (`I_kwDO…`).
- Commit messages: `{Verb} {what} — {detail}` imperative, no conventional-commit prefixes; reference the record as `refs #608`, never `closes`/`fixes`.

---

### Task 1: Prose-pin test for the two linking snippets (red)

**Files:**
- Create: `tests/specify-record-creation-linking.test.js`

**Interfaces:**
- Consumes: `skills/specify/record-creation.md` (read as text at test time).
- Produces: three assertions Task 2 must satisfy — (a) no `sub_issue_id=$SUB_ISSUE_NUM`; (b) `sub_issue_id=$SUB_ISSUE_DB_ID` present; (c) `dependencies/blocked_by` present together with `-F issue_id=$BLOCKER_DB_ID`; plus (d) `databaseId` appears before both write calls.

- [ ] **Step 1: Write the failing test**

Create `tests/specify-record-creation-linking.test.js`:

```js
'use strict';

// Pins the two native-linking write snippets in skills/specify/record-creation.md
// Step 4 (work-backend: github-issues, work-links: native). Both were wrong or
// missing once (#608): the sub_issues endpoint takes the sub-issue's database ID,
// not its number, and the blocked_by dependency endpoint was described but never
// named. This test discriminates on the identifier kind, so a future edit cannot
// quietly reintroduce the number.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FILE = path.join(__dirname, '..', 'skills', 'specify', 'record-creation.md');
const text = fs.readFileSync(FILE, 'utf8');

test('sub_issues write sends the database ID, never the issue number', () => {
  assert.ok(
    !/sub_issue_id=\$SUB_ISSUE_NUM\b/.test(text),
    'record-creation.md still passes $SUB_ISSUE_NUM to sub_issues — the endpoint takes the database ID',
  );
  assert.ok(
    /sub_issue_id=\$SUB_ISSUE_DB_ID\b/.test(text),
    'record-creation.md must show the sub_issues write with sub_issue_id=$SUB_ISSUE_DB_ID',
  );
});

test('blocked_by dependency endpoint is named, with a database-ID identifier', () => {
  assert.ok(
    /dependencies\/blocked_by/.test(text),
    'record-creation.md must name the POST issues/{n}/dependencies/blocked_by endpoint',
  );
  assert.ok(
    /-F issue_id=\$BLOCKER_DB_ID\b/.test(text),
    'the blocked_by write must send -F issue_id=$BLOCKER_DB_ID',
  );
});

test('a databaseId resolution precedes both write calls', () => {
  const idx = text.indexOf('databaseId');
  const subIdx = text.indexOf('sub_issue_id=$SUB_ISSUE_DB_ID');
  const depIdx = text.indexOf('dependencies/blocked_by');
  assert.ok(idx > -1, 'record-creation.md must resolve databaseId via GraphQL before linking');
  assert.ok(subIdx > idx, 'the databaseId lookup must appear before the sub_issues write');
  assert.ok(depIdx > idx, 'the databaseId lookup must appear before the blocked_by write');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/specify-record-creation-linking.test.js`
Expected: FAIL — first test's first assertion ("still passes $SUB_ISSUE_NUM"), and the second and third tests fail because `dependencies/blocked_by`, `$BLOCKER_DB_ID`, and `databaseId` are absent from the file today.

- [ ] **Step 3: Commit the red test**

```bash
git add tests/specify-record-creation-linking.test.js
git commit -m "Add prose-pin test for record-creation Step 4 native-linking identifiers — refs #608"
```

---

### Task 2: Correct the two snippets in record-creation.md (green)

**Files:**
- Modify: `skills/specify/record-creation.md:230-239` (the `work-backend: github-issues`, `work-links: native` block under Step 4 "Linking")

**Interfaces:**
- Consumes: the assertions from Task 1.
- Produces: the corrected prose block below, verbatim.

- [ ] **Step 1: Replace the native-linking block**

Find this exact block (lines ~230-239):

````markdown
**`work-backend: github-issues`, `work-links: native`:**

- Parent ↔ sub-issue — a sub-issue link, once per sub-issue:

  ```bash
  gh api repos/{owner}/{repo}/issues/$PARENT_NUM/sub_issues -f sub_issue_id=$SUB_ISSUE_NUM
  ```

- Sub-issue ↔ sub-issue, and sub-issue ↔ any pre-existing open record from Step 1's companion overlaps or Step 2's implicit-dependency notes — the blocked-by dependency endpoint (the same GitHub issue-dependencies feature `capabilities-probe.js`'s `probeSchema` checks for, via the `blockedBy` GraphQL field — the sibling `issueDependenciesSummary` field is count-only and insufficient, see that file's header comment). Call it once per dependency edge, dependent sub-issue pointing at blocking record.
- No body edits needed for native linking — the relationships live in GitHub's own graph, not in text.
````

Replace it with exactly:

````markdown
**`work-backend: github-issues`, `work-links: native`:**

- **Resolve database IDs first, once for the whole batch.** Both native write endpoints below take
  the target issue's integer database ID (`databaseId` — the REST `id`), **not** its issue number;
  passing `$SUB_ISSUE_NUM` fails. One aliased GraphQL call resolves every number this pass will
  link — the parent, every sub-issue, and any pre-existing blocking record from Step 1's companion
  overlaps or Step 2's implicit-dependency notes (`{owner}`/`{repo}` as in the surrounding calls;
  add one `iN:` alias per number). Ask for `databaseId`, never the node `id`:

  ```bash
  gh api graphql -f query='query($owner:String!,$repo:String!){ repository(owner:$owner,name:$repo){
    iPARENT: issue(number:'"$PARENT_NUM"'){ databaseId }
    i595: issue(number:595){ databaseId }
    i597: issue(number:597){ databaseId }
  } }' -f owner={owner} -f repo={repo} > /tmp/specify-database-ids.json
  # SUB_ISSUE_DB_ID / BLOCKER_DB_ID below are read from this file by alias, e.g.:
  SUB_ISSUE_DB_ID=$(jq -r '.data.repository.i595.databaseId' /tmp/specify-database-ids.json)
  ```

- Parent ↔ sub-issue — a sub-issue link, once per sub-issue, sending the sub-issue's database ID
  (`-F`, typed, so it lands as an integer):

  ```bash
  gh api -X POST repos/{owner}/{repo}/issues/$PARENT_NUM/sub_issues -F sub_issue_id=$SUB_ISSUE_DB_ID
  ```

- Sub-issue ↔ sub-issue, and sub-issue ↔ any pre-existing open record from Step 1's companion
  overlaps or Step 2's implicit-dependency notes — the issue-dependencies endpoint (the same GitHub
  feature `capabilities-probe.js`'s `probeSchema` checks for, via the `blockedBy` GraphQL field —
  the sibling `issueDependenciesSummary` field is count-only and insufficient, see that file's
  header comment). Call it once per dependency edge, **on the dependent** sub-issue, naming the
  **blocking** record's database ID:

  ```bash
  gh api -X POST repos/{owner}/{repo}/issues/$DEPENDENT_NUM/dependencies/blocked_by -F issue_id=$BLOCKER_DB_ID
  ```

- No body edits needed for native linking — the relationships live in GitHub's own graph, not in text.
````

- [ ] **Step 2: Run the pin test to verify it passes**

Run: `node --test tests/specify-record-creation-linking.test.js`
Expected: PASS — 3 tests, 0 failures.

- [ ] **Step 3: Verify the negative and the untouched read sites**

Run: `grep -n 'sub_issue_id=\$SUB_ISSUE_NUM' skills/specify/record-creation.md`
Expected: no output.

Run: `grep -rn "sub_issues" skills/wrap-up/verification-brief.md skills/_shared/trust-table.md skills/_shared/github-pr-scan-acceptance.md | grep -c "jq"`
Expected: a non-zero count, unchanged from before this task (these are reads and are untouched). Then `git diff --stat` must list only `skills/specify/record-creation.md`.

- [ ] **Step 4: Discrimination check — revert, expect red, restore**

Run: `git stash push -m "608-discrim" -- skills/specify/record-creation.md` is **not** allowed in this repo's shared stash convention — instead, temporarily copy the file aside:

```bash
cp skills/specify/record-creation.md /tmp/608-rc.md && git checkout -- skills/specify/record-creation.md && node --test tests/specify-record-creation-linking.test.js; cp /tmp/608-rc.md skills/specify/record-creation.md
```

Expected: the middle `node --test` FAILS (the test discriminates), and after the trailing `cp` the file is restored — confirm with `node --test tests/specify-record-creation-linking.test.js` → PASS. Run the swap-and-restore in **one** command so a timeout cannot leave the reverted file in the tree.

- [ ] **Step 5: Commit**

```bash
git add skills/specify/record-creation.md
git commit -m "Correct record-creation Step 4 native linking — sub_issues takes databaseId, name the blocked_by endpoint — refs #608"
```

---

### Task 3: Whole-suite verification

**Files:**
- (none modified)

- [ ] **Step 1: Run the full suite to a file**

Run: `npm test > /tmp/608-full.log 2>&1; echo "exit=$?"; grep -E "^# (tests|pass|fail)" /tmp/608-full.log`
Expected: `exit=0`, `# fail 0`, and `# tests` three higher than the baseline (3759 → 3762: three new tests in one file).

- [ ] **Step 2: Confirm the diff envelope**

Run: `git diff --stat main...HEAD -- . ':!.claude-tweaks' ':!docs/superpowers/plans'`
Expected: exactly `skills/specify/record-creation.md` and `tests/specify-record-creation-linking.test.js`.
