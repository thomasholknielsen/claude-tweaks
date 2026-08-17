# Record #720 — Claim-Read Citation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `skills/flow/claim-targets.md`'s broken inline claim-read snippet (no 404/absent branch, newline-breaking `base64 -d`) with a citation of `_shared/issue-claims.md` steps 1-2, pinned by a conformance test.

**Architecture:** One prose edit (drop the incorrect fenced snippet, cite the canonical read and name its two load-bearing properties) plus two conformance tests appended to the existing `tests/flow-claim-preflight.test.js` (the established home for claim-targets conformance). No runtime code changes.

**Tech Stack:** Markdown skill files; `node --test` conformance tests.

**Spec:** `.claude-tweaks/pipelines/2026-08-17T044553-spec-720-721-722-723-724/spec-720/work/720-spec.md`

## Global Constraints

- `grep -c 'base64 -d' skills/flow/claim-targets.md` must end at `0` (AC 1).
- The replacement must keep the MCP-transport parity pointer (`_shared/github-write-transport.md`) — the citation must not re-fork the two transports (spec Gotcha 2).
- The conformance sweep must be scoped to claim reads — `skills/tidy/scan-procedures.md` and `skills/_shared/github-pr-scan.md` legitimately carry `base64 -d` claim reads today (the former cites `_shared/issue-claims.md` in its surrounding prose; the latter carries an explicit empty-content branch `process.argv[2] || null`); the test must pass them as-is (spec Gotcha 3).
- Work from the run worktree: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-720-721-722-723-724`.
- Commit messages reference the record as `refs #720` — never `closes`/`fixes` (the run PR carries the closing keywords).

---

### Task 1: Replace the inline claim-read snippet with the canonical citation, pinned by conformance tests

**Files:**
- Modify: `skills/flow/claim-targets.md:118-127`
- Test: `tests/flow-claim-preflight.test.js` (append two tests)

**Interfaces:**
- Consumes: `_shared/issue-claims.md` "The lock" steps 1-2 (the canonical read + classify: `__ABSENT__` sentinel on non-zero `gh api` exit; `{content: (.content | @base64d), sha: .sha}` in one `jq`).
- Produces: nothing consumed by later tasks (single-task plan).

- [ ] **Step 1: Write the failing conformance tests**

Append to `tests/flow-claim-preflight.test.js`:

```js
test('claim-targets.md claim read cites issue-claims.md steps 1-2 — no raw base64 -d pipe (#720)', () => {
  const content = read('skills/flow/claim-targets.md');
  assert.doesNotMatch(content, /base64 -d/);
  assert.match(content, /__ABSENT__/);
  assert.match(content, /@base64d/);
});

test('every base64 -d claim read under skills/ cites issue-claims.md or handles empty content (#720)', () => {
  const skillsRoot = path.join(REPO_ROOT, 'skills');
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) {
        const text = fs.readFileSync(full, 'utf8');
        if (/ref=claims-registry/.test(text) && /base64 -d/.test(text)) {
          const cites = /_shared\/issue-claims\.md/.test(text);
          const absentBranch = /\|\| null/.test(text);
          if (!cites && !absentBranch) offenders.push(path.relative(REPO_ROOT, full));
        }
      }
    }
  };
  walk(skillsRoot);
  assert.deepStrictEqual(offenders, []);
});
```

- [ ] **Step 2: Run the tests to verify the first fails**

Run: `node --test tests/flow-claim-preflight.test.js`
Expected: the `#720` claim-read citation test FAILS (`base64 -d` still present at `skills/flow/claim-targets.md:123`, no `__ABSENT__` mention); the sweep test already passes (both sibling files satisfy the rule).

- [ ] **Step 3: Replace the snippet in `skills/flow/claim-targets.md`**

Replace lines 118-127 (the paragraph `For each remaining target, read-classify-write exactly as` … through the closing fence of the ```bash block) with:

```markdown
For each remaining target, read-classify-write exactly as
`_shared/issue-claims.md`'s "The lock" section describes — its steps 1-2 are the one canonical
read + classify, and this file deliberately carries no second copy of them. Two properties of
that read are load-bearing here: a failed `gh api` read (404 — a never-claimed target, a normal
outcome) passes the `__ABSENT__` sentinel to `classifyClaimBlob`, never an empty file, so a
fresh target classifies `'absent'` on the first read; and a successful read extracts
`{content: (.content | @base64d), sha: .sha}` in one `jq` call, decoding GitHub's
newline-embedded base64 correctly and keeping the blob sha the conditional write (step 4 there)
needs. `gh` path and MCP path are both defined there — see `_shared/github-write-transport.md`
for transport routing.
```

The following paragraph (`Branch on the classification, per …`) stays unchanged — it already
consumes the classification states the cited read produces.

- [ ] **Step 4: Run the tests to verify both pass**

Run: `node --test tests/flow-claim-preflight.test.js`
Expected: PASS (all tests in the file).

Also run: `grep -c 'base64 -d' skills/flow/claim-targets.md`
Expected: `0` (exit code 1 — zero matching lines; this is AC 1).

- [ ] **Step 5: Commit**

```bash
git add skills/flow/claim-targets.md tests/flow-claim-preflight.test.js
git commit -m "Replace claim-targets inline claim read with issue-claims steps 1-2 citation — refs #720"
```
