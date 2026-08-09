# Dispatch: Split Build/Review Task Calls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `/claude-tweaks:dispatch` Step 5's single per-group Task() dispatch into two sequential Task() calls — `flow #{n} build,test` then, only on a clean outcome, `flow #{n} review,polish,wrap-up` — so the reviewing agent is a genuinely fresh mind with no conversation history from the build, closing the gap #296 documents (a live dispatch test found build/test/review all ran in one continuous agent context, defeating `/review`'s adversarial multi-lens contract).

**Architecture:** Extract the current Task() prompt template out of `skills/dispatch/SKILL.md` into a new sub-file (`skills/dispatch/task-prompt.md`) first — this both creates the byte headroom the two-call rewrite needs (SKILL.md is at 40437/40960 bytes, only 523 bytes free) and gives the rewrite a home unconstrained by SKILL.md's own ceiling. The re-derive-from-artifacts guarantee (the second call must not trust the first call's claims, even ones written to files) is pinned as a small, independently testable module — `bin/lib/dispatch/artifact-verdict.js` — mirroring the pattern #295 already established with `bin/lib/issues/sequential-dispatch.js` for a prose-driven mechanism: the module doesn't run inside a live dispatch (Task-tool calls aren't Node-invocable), but it fixes the *shape* of "derive a verdict from the raw artifact, never from a decisions.md claim" so a regression toward "trust the claim" is mechanically detectable.

**Tech Stack:** Node.js (`node --test`), markdown skill files.

## Global Constraints

- `npm test` must stay green throughout.
- `skills/dispatch/SKILL.md` must stay under the 40960-byte (40 KB) ceiling with comfortable headroom (target: several hundred bytes minimum after this plan's edits — the prior branch state of 18 bytes headroom was itself flagged as fragile by the final review of #295 and must not recur).
- Every commit message uses "refs #296" — never "closes #296" or "fixes #296".
- The second Task() call's dispatch prompt must name only the record number(s) and `CLAIM_RUN_ID` — never a summary of the first call's outcome (conversational isolation is structural, not the dispatching session's discipline).
- IL-51/IL-43: this plan's own tasks, if dispatched to parallel implementer subagents, must not be given independent git access — sequence commits centrally.
- IL-84: a new `bin/lib/{name}/tests/` directory must be added to `package.json`'s `test` script glob list, or its tests silently never run.

---

### Task 1: Extract Step 5's Task() prompt template to a sub-file

**Files:**
- Create: `skills/dispatch/task-prompt.md`
- Modify: `skills/dispatch/SKILL.md` (Step 5's "Each group's `Task()` prompt" block and its closing note — currently the fenced template plus the sentence after it, roughly the region starting at "Each group's `Task()` prompt (per `_shared/subagent-output-contract.md`'s..." through "...the four-value status line, minimal input, and literal (not referenced) output format.")

**Interfaces:**
- Produces: `skills/dispatch/task-prompt.md` — a sub-file containing the CURRENT (pre-#296) single-call Task() prompt template verbatim, as a starting point Task 3 will rewrite into the two-call shape. This task makes NO behavioral change — it is a pure extraction, verified byte-identical in content (only relocated).

This task is preparatory: it exists solely to create room, and its own diff must be reviewable as "nothing changed except where the text lives."

- [ ] **Step 1: Locate the exact current template boundaries**

Read `skills/dispatch/SKILL.md` and find the paragraph starting `Each group's \`Task()\` prompt (per \`_shared/subagent-output-contract.md\`'s input discipline...` through the paragraph ending `...the four-value status line, minimal input, and literal (not referenced) output format.` (this spans the introductory sentence, the fenced Task() prompt block, and the closing note — three logical pieces, extract all three together).

- [ ] **Step 2: Create the sub-file with the extracted content verbatim**

`skills/dispatch/task-prompt.md`:

```markdown
# Dispatch Step 5 — Task() Prompt Template

Referenced by `skills/dispatch/SKILL.md` Step 5. Unlike `sequential-execution.md` and `deprecated-aliases.md` (background detail, read for understanding), **this file's content must be inlined verbatim into the actual `Task()` tool call** when dispatching a group — it is the operative template, not supplementary reading. Copy the fenced block(s) below exactly, substituting `{issue list}`, `{RUN_ID}`, etc. as SKILL.md's Step 5 directs.

{the exact extracted content: intro sentence, fenced Task() prompt block, closing note — verbatim from the current SKILL.md}
```

- [ ] **Step 3: Replace the extracted region in SKILL.md with a short stub**

```markdown
Each group's `Task()` prompt is defined in `task-prompt.md` in this skill's directory — read it and inline its content verbatim into your `Task()` tool call (per `_shared/subagent-output-contract.md`'s input discipline: minimal input, literal output template inlined, no conversation history). Do not paraphrase or summarize the template; the exact wording is load-bearing for the four-value status line and output format contracts downstream skills parse.
```

- [ ] **Step 4: Verify content-fidelity and byte counts**

```bash
wc -c skills/dispatch/SKILL.md skills/dispatch/task-prompt.md
```

Expected: `SKILL.md` dropped by roughly the size of the extracted block (~2.2-2.4 KB), landing comfortably under 40960 with several KB of headroom now available for Task 3's rewrite. `task-prompt.md` should contain the extracted text with nothing altered beyond the new header/intro sentence.

- [ ] **Step 5: Run the size-ceiling test**

```bash
node --test bin/lib/skill-audit/tests/context-cost.test.js
```

Expected: PASS (5/5).

- [ ] **Step 6: Commit**

```bash
git add skills/dispatch/SKILL.md skills/dispatch/task-prompt.md
git commit -m "Extract dispatch Step 5's Task() prompt template to task-prompt.md (refs #296)"
```

---

### Task 2: Artifact-verdict module + fixture-based test

**Files:**
- Create: `bin/lib/dispatch/artifact-verdict.js`
- Create: `bin/lib/dispatch/tests/artifact-verdict.test.js`
- Modify: `package.json` (add `bin/lib/dispatch/tests/*.test.js` to the `test` script glob — IL-84)

**Interfaces:**
- Produces: `deriveTestVerdict({ rawTestOutputPath })` — reads and parses ONLY the raw test-output artifact at the given path (a `node --test` TAP-format log, matching the `# pass N` / `# fail N` summary lines this repo's own `npm test` output already uses — see any existing `/tmp/*.log` capture pattern in this session for the exact format, or just the TAP spec's summary block). Returns `{ passed: boolean, failCount: number, source: 'raw-artifact' }`. Never reads any `decisions.md`, ledger, or transcript file — this is what makes the "cannot be swayed by a planted claim" guarantee structural rather than a matter of instruction-following.

- [ ] **Step 1: Write the failing test**

```javascript
// bin/lib/dispatch/tests/artifact-verdict.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { deriveTestVerdict } = require('../artifact-verdict');

function tmpFile(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-artifact-verdict-'));
  const file = path.join(dir, 'raw-output.log');
  fs.writeFileSync(file, content);
  return file;
}

test('derives a failing verdict from the raw artifact, ignoring a planted false claim elsewhere', () => {
  // Simulates the #296 threat model: a fixture decisions.md (never read by this
  // function) falsely claims "all tests pass", while the actual raw test-output
  // artifact shows real failures. The function must never even open the decisions.md
  // file -- it only reads what it's given.
  const fixtureDecisionsMd = tmpFile('AUTO 12:00:00 -- Step 5: all tests pass, 0 failures.\n');
  const rawOutput = tmpFile([
    'TAP version 13',
    '# Subtest: some real test',
    'not ok 1 - some real test',
    '1..1',
    '# tests 1',
    '# pass 0',
    '# fail 1',
    '',
  ].join('\n'));

  const verdict = deriveTestVerdict({ rawTestOutputPath: rawOutput });

  assert.strictEqual(verdict.passed, false, 'must derive FAILED from the raw artifact, not the planted claim');
  assert.strictEqual(verdict.failCount, 1);
  assert.strictEqual(verdict.source, 'raw-artifact');

  // Sanity: prove the fixture decisions.md was never touched -- if this function
  // ever grows a decisions.md/ledger fallback path, this line documents the
  // regression it must not reintroduce.
  assert.ok(fs.existsSync(fixtureDecisionsMd), 'fixture exists but must never be read by deriveTestVerdict');
});

test('derives a passing verdict from a clean raw artifact', () => {
  const rawOutput = tmpFile([
    'TAP version 13',
    '# Subtest: some real test',
    'ok 1 - some real test',
    '1..1',
    '# tests 1',
    '# pass 1',
    '# fail 0',
    '',
  ].join('\n'));

  const verdict = deriveTestVerdict({ rawTestOutputPath: rawOutput });

  assert.strictEqual(verdict.passed, true);
  assert.strictEqual(verdict.failCount, 0);
  assert.strictEqual(verdict.source, 'raw-artifact');
});

test('throws on a missing raw artifact rather than silently defaulting to passed', () => {
  assert.throws(() => deriveTestVerdict({ rawTestOutputPath: '/nonexistent/path.log' }));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
mkdir -p bin/lib/dispatch/tests
node --test bin/lib/dispatch/tests/artifact-verdict.test.js
```

Expected: FAIL — `Cannot find module '../artifact-verdict'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// bin/lib/dispatch/artifact-verdict.js
'use strict';
// The structural half of #296's "re-derive from raw artifacts" guarantee: a
// dispatch group's second Task() call (review,polish,wrap-up) must not trust
// the first call's (build,test) claims -- including claims persisted to files
// (decisions.md, ledger entries, staged proposals) the second call's own
// /wrap-up pass may read. This function is deliberately narrow: it reads
// ONLY the raw test-output artifact it's told to read, and nothing else --
// there is no code path here that could be swayed by a planted claim
// elsewhere, because there is no code path here that reads anything else.

const fs = require('fs');

function deriveTestVerdict({ rawTestOutputPath }) {
  const content = fs.readFileSync(rawTestOutputPath, 'utf8');
  const failMatch = content.match(/^# fail (\d+)$/m);
  const failCount = failMatch ? Number(failMatch[1]) : 0;
  return { passed: failCount === 0, failCount, source: 'raw-artifact' };
}

module.exports = { deriveTestVerdict };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test bin/lib/dispatch/tests/artifact-verdict.test.js
```

Expected: PASS (3/3)

- [ ] **Step 5: Register the new test directory in package.json (IL-84)**

In `package.json`'s `"test"` script, add `bin/lib/dispatch/tests/*.test.js` to the space-separated glob list (append after `bin/lib/issues/tests/*.test.js`, matching this repo's existing ordering convention of one glob per `bin/lib/{name}` directory).

- [ ] **Step 6: Verify the new glob picks up the test via the real npm script**

```bash
npm test -- --test-name-pattern="derives a failing verdict"
```

Expected: the new test runs and passes (confirms the glob addition works, without running the full ~20-minute suite).

- [ ] **Step 7: Commit**

```bash
git add bin/lib/dispatch/artifact-verdict.js bin/lib/dispatch/tests/artifact-verdict.test.js package.json
git commit -m "Add artifact-verdict module proving re-derive-from-raw-artifacts (refs #296)"
```

---

### Task 3: Rewrite the Task() prompt into two sequential calls

**Files:**
- Modify: `skills/dispatch/task-prompt.md` (the extracted template — full rewrite into the two-call shape)
- Modify: `skills/dispatch/SKILL.md` (Step 5's "Singleton group"/"Bundle group" lines — currently each invoking `/claude-tweaks:flow` once; rewrite to describe the two-call sequence and the intermediate-outcome gate)

**Interfaces:**
- Consumes: `bin/lib/dispatch/artifact-verdict.js`'s `deriveTestVerdict` (Task 2) — cited by name/path in the second call's dispatch prompt, the same citation pattern #295 used for `sequential-dispatch.js`.
- Produces: the intermediate-outcome vocabulary `build-test-ok | build-test-failed | build-test-blocked` — a first-call-only status distinct from `/flow`'s terminal outcome list (`merged | pr-opened | pending-review | failed | blocked`), consumed by Task 4's `steps-and-gates.md` documentation and by the dispatching session's own gate logic (second call fires only on `build-test-ok`; `NEEDS_CONTEXT`/`BLOCKED`/no report from the first call also blocks the second call).

- [ ] **Step 1: Rewrite `skills/dispatch/task-prompt.md`'s body**

Replace the file's template section (keep the header/intro paragraph from Task 1) with:

```markdown
## First call — build,test

```
Task scope: Execute claude-tweaks build+test for this already-claimed file-overlap group of
GitHub records: {issue list}. This firing's run id, for the ownership check downstream, is:
{RUN_ID} -- the same value already embedded as runId in each of this group's claim markers by
Step 4. Singleton -> run `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #{issue} build,test`.
Bundle (2+ issues) -> run `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow "#{n1},#{n2},..." build,test`
once, comma-joined. Stop after the test gate -- do not proceed to review, polish, or wrap-up;
a separate Task call handles those. If you reference any of these issue numbers in an
intermediate commit message, write "refs #N" -- never "closes #N" or "fixes #N".

Working directory: the dispatching session has ALREADY entered this group's worktree; you
inherit it. Do NOT create, enter, or switch worktrees, and do not invoke
/superpowers:using-git-worktrees. Echo `pwd` and `git rev-parse --show-toplevel` before any
commit and verify both resolve to that inherited worktree; if they resolve to the main
checkout instead, STOP and report BLOCKED rather than committing.

Status line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS
/ NEEDS_CONTEXT / BLOCKED.

OUTPUT FORMAT (required), after the status line -- return ONLY these lines, no preamble:

GROUP: {comma-joined issue numbers}
OUTCOME: {build-test-ok | build-test-failed | build-test-blocked}
MANIFEST: {path to this group's run-dir manifest.yml/decisions.md; for a singleton, the
  single-spec run dir path}

One line per issue in this group that hit a HARD-GATE (omit if none):
ISSUE #{n}: failed:{gate}

[Use: Standard model -- this dispatch wraps build+test execution, not analysis; the
pipeline's own steps select their own models as usual.]
```

## Second call — review,polish,wrap-up (gated on the first call)

**Only dispatch this call if the first call's status line was DONE or DONE_WITH_CONCERNS AND its OUTCOME was `build-test-ok`.** A `NEEDS_CONTEXT`/`BLOCKED` status, an `OUTCOME` of `build-test-failed`/`build-test-blocked`, or no parseable report at all means this second call is never dispatched — handle per `skills/dispatch/settle-and-merge.md`'s Settle procedure instead (retry ceiling / classification-driven `auto:merge` revocation), the same as any other HARD-GATE failure.

This call's prompt names ONLY the record number(s) and `CLAIM_RUN_ID` — never a summary of the first call's outcome. It is a fresh Task-tool dispatch with zero conversation history from the first call, and its own review step must re-derive its verdict from raw artifacts (the actual diff, the actual test-output artifact — via the same shape `bin/lib/dispatch/artifact-verdict.js`'s `deriveTestVerdict` pins as a testable invariant) rather than trusting any claim the first call made, including claims written to `decisions.md`, ledger entries, or staged proposals the first call produced. File-based state is readable across the two calls even though conversation history is not — the instruction below states this explicitly because that distinction is easy to lose.

```
Task scope: Execute claude-tweaks review+polish+wrap-up for this already-claimed file-overlap
group of GitHub records: {issue list}. This firing's run id is: {RUN_ID}. Singleton -> run
`CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #{issue} review,polish,wrap-up`. Bundle -> run
`CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow "#{n1},#{n2},..." review,polish,wrap-up` once,
comma-joined. This resumes a run a prior Task call already started -- /flow's own
pipeline-run-dir resolution (most-recent directory whose spec-slug matches) locates it; you
need no other input about what that prior call did or found.

CRITICAL: your review step must re-derive its verdict from raw artifacts -- the actual diff,
the actual test-output log in the run directory -- never from a prior claim, whether that
claim lives in conversation (you have none from the first call) or in a file the first call
wrote (decisions.md, ledger entries, staged proposals). Treat every such file's claims as
unverified until checked against the artifact it claims to summarize.

Handle any HARD-GATE failure per skills/dispatch/settle-and-merge.md's Settle procedure
(retry ceiling / classification-driven auto:merge revocation) before finishing -- do not
leave a failed record's claim or label state unresolved. If you reference any of these issue
numbers in an intermediate commit message, write "refs #N" -- never "closes #N" or "fixes
#N". The real closing keyword is stamped once, at the end, by wrap-up's carrier commit or the
merge commit (close-via-merge, `_shared/issue-claims.md`).

Working directory: the dispatching session is still in this group's worktree (unchanged since
the first call) -- you inherit it. Do NOT create, enter, or switch worktrees. Echo `pwd` and
`git rev-parse --show-toplevel` before any commit and verify both resolve to that inherited
worktree; if they resolve to the main checkout instead, STOP and report BLOCKED.

Status line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS
/ NEEDS_CONTEXT / BLOCKED.

OUTPUT FORMAT (required), after the status line -- return ONLY these lines, no preamble:

GROUP: {comma-joined issue numbers}
OUTCOME: {merged | pr-opened | pending-review | failed | blocked}
MANIFEST: {path to this group's run-dir manifest.yml/decisions.md; for a singleton, the
  single-spec run dir path}

One line per issue in this group that hit a HARD-GATE or the retry ceiling (omit if none):
ISSUE #{n}: {failed:{gate} | blocked:retry-ceiling}

[Use: Standard model -- this dispatch wraps full pipeline execution, not analysis; the
pipeline's own steps select their own models as usual.]
```

None of Templates A/B/C in `_shared/subagent-output-contract.md` fit an agent that executes pipeline stages rather than returning findings/locations/a yes-no, so these are their own minimal templates, inlined verbatim at every dispatch site. The universal parts of the contract still apply: the four-value status line, minimal input, and literal (not referenced) output format.
```

- [ ] **Step 2: Update `skills/dispatch/SKILL.md`'s Singleton/Bundle group lines**

Find the current text (the "Singleton group" and "Bundle group" paragraphs, immediately before the Task() prompt stub Task 1 left in place):

```markdown
**Singleton group** `[123]` — the agent's job is exactly today's single-record dispatch: invoke `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #123`.

**Bundle group** `[123, 456]` — a granted record is already spec-shaped (`ready` + spec-shaped body per `_shared/work-record.md`); there is no per-member `/specify` pre-step to run first. That derivation loop is deleted — bundle materialization is `/flow`'s own concern (an opaque executor from dispatch's point of view):

```bash
CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow "#123,#456"
```
```

Replace with:

```markdown
**Two Task() calls per group, not one.** The agent's job is now split: a first call runs `/claude-tweaks:flow {target} build,test` and stops; only on a clean `build-test-ok` outcome does a second, entirely fresh Task() call run `/claude-tweaks:flow {target} review,polish,wrap-up`. This gives the reviewing agent genuine conversational isolation from the build — a live dispatch test found build/test/review running in one continuous context, defeating `/review`'s own adversarial multi-lens contract. See `task-prompt.md` in this skill's directory for both calls' full templates — read it and inline the content verbatim, do not paraphrase.

**Singleton group** `[123]` — first call: `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #123 build,test`. Second call (gated): `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #123 review,polish,wrap-up`.

**Bundle group** `[123, 456]` — a granted record is already spec-shaped (`ready` + spec-shaped body per `_shared/work-record.md`); there is no per-member `/specify` pre-step to run first. First call: `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow "#123,#456" build,test`. Second call (gated): `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow "#123,#456" review,polish,wrap-up`.

**The gate between calls:** dispatch the second call only if the first call's status line was `DONE` or `DONE_WITH_CONCERNS` and its `OUTCOME` was `build-test-ok`. A `NEEDS_CONTEXT`/`BLOCKED` status, an `OUTCOME` of `build-test-failed`/`build-test-blocked`, or no parseable report at all means the second call is never dispatched for that group this firing — route to `skills/dispatch/settle-and-merge.md`'s Settle procedure instead, the same as any other HARD-GATE failure.
```

- [ ] **Step 3: Confirm byte budget**

```bash
wc -c skills/dispatch/SKILL.md
```

Expected: comfortably under 40960 (Task 1's extraction created headroom; this step's edit is roughly the same size as what it replaced, since it's describing two calls at similar prose density to the original one-call description — verify, and if it comes in over, move the "gate between calls" paragraph into `task-prompt.md` instead, leaving a one-line pointer in `SKILL.md`).

- [ ] **Step 4: Run focused tests**

```bash
node --test bin/lib/skill-audit/tests/context-cost.test.js
```

Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add skills/dispatch/SKILL.md skills/dispatch/task-prompt.md
git commit -m "Split dispatch Step 5 into build,test then review,polish,wrap-up Task calls (refs #296)"
```

---

### Task 4: Document the two-call shape in `steps-and-gates.md`

**Files:**
- Modify: `skills/flow/steps-and-gates.md` (the "Step Arguments" section's resume-mode documentation)

- [ ] **Step 1: Add a note confirming the two-call shape is an intentional, supported consumer**

Find the "Step Arguments" section's table/examples (documenting `/flow 42 review`, `/flow 42 review,wrap-up`, etc. as resume-mode examples). Immediately after the existing examples list, add:

```markdown
**Intentional two-call consumer:** `/claude-tweaks:dispatch` Step 5 (refs #296) is a deliberate, supported consumer of this resume contract — not an incidental one. It splits one group's pipeline into two sequential `/flow` invocations against the same run: `/flow {target} build,test` (first call, stops after the test gate), then `/flow {target} review,polish,wrap-up` (second call, a fresh Task-tool dispatch with zero conversation history from the first, resuming the same run via `_shared/pipeline-run-dir.md`'s spec-slug matching). This is the two-call form `review,polish,wrap-up` already covers in the table above (`polish,wrap-up` — valid; assumes build, test, and review are done — useful when iterating on polish manually` is the adjacent precedent for a mid-pipeline resume) — no new step-list grammar is introduced, only a new caller relying on the existing one.
```

- [ ] **Step 2: Commit**

```bash
git add skills/flow/steps-and-gates.md
git commit -m "Document dispatch's two-call shape as an intentional resume-contract consumer (refs #296)"
```

---

### Task 5: wd-foreign-session safety note, #222 re-verification, final verification

**Files:**
- Read-only check: `bin/lib/hooks/pre-tool-use.js` (the wd-foreign-session logic)
- Modify: `.claude-tweaks/pipelines/2026-08-09T191318-spec-295-296-297/spec-296/work/296-spec.md` (append a `## Build Notes` section, same pattern #295 used)
- Read-only check: current state of #222 (via `gh issue view`)

- [ ] **Step 1: Ground the wd-foreign-session safety claim in the actual hook code**

Read `bin/lib/hooks/pre-tool-use.js`'s worktree-assignment check (the function containing `wd-foreign-session`). Confirm this specific finding: the foreign-session branch only executes when the commit's target worktree path (`actual`) does NOT match the run's recorded worktree (`assigned`) — see the `if (actual === assigned) continue;` early-allow immediately before the foreign-session check. In #296's two-call design, both the first call (build,test) and the second call (review,polish,wrap-up) are Task-tool dispatches that inherit the SAME cwd — the dispatching session's currently-entered worktree for this group, unchanged between the two calls (the dispatching session only switches worktrees *between groups*, per #295, not between a group's two calls). So `actual` (the second call's commit target) equals `assigned` (the recorded worktree) on every commit either call makes, and the early-allow fires before the foreign-session branch is ever reached — the wd-foreign-session warn event does not merely fail to block the second call's commit, it is not triggered at all in the normal two-call flow. It would only trigger if the second call's commits somehow targeted a *different* worktree path than the first call's, which the design doesn't produce.

- [ ] **Step 2: Append the Build Notes section to the materialized spec file**

Append to `.claude-tweaks/pipelines/2026-08-09T191318-spec-295-296-297/spec-296/work/296-spec.md` (find the file's current end, mirror #295's own `## Build Notes` section shape):

```markdown
## Build Notes

wd-foreign-session safety re-verified against the actual hook code (2026-08-10): `bin/lib/hooks/pre-tool-use.js`'s worktree-assignment check contains an early `if (actual === assigned) continue;` allow that runs BEFORE the foreign-session branch. Both of #296's two Task() calls inherit the same cwd (the dispatching session's currently-entered worktree for this group, unchanged between the two calls per #295's design — the dispatching session only switches worktrees between groups). So every commit either call makes has `actual === assigned`, and the foreign-session branch is never reached at all in the normal flow — stronger than this spec's own Deliverables assumed ("the resulting wd-foreign-session warn event does not block the commit"): the event does not fire in the first place. It would only fire if the second call's commits somehow targeted a worktree different from the first call's, which this design does not produce.

#222 overlap re-verification at build start (2026-08-10): #222 remains open/unbuilt (confirmed via `gh issue view` — `state: OPEN`, `ready` label) — disjointness re-verified against its spec-declared Key Files only. #222 declares `skills/dispatch/SKILL.md`'s `[Use: {Profile}]` grammar line; this leaf's edits (Task 1's extraction, Task 3's Singleton/Bundle-group and gate-paragraph rewrite) are scoped to different regions of the same file and do not touch the `[Use: ...]` line. Disjoint.
```

- [ ] **Step 3: Check #222's current state**

```bash
gh issue view 222 --json state,labels,title
```

Confirm it matches what Step 2's note claims (still OPEN, still `ready`) before committing the note — if it has changed (e.g. merged since #295's own check), update the note to reflect the actual current diff-level comparison instead.

- [ ] **Step 4: Commit the Build Notes**

```bash
git add ".claude-tweaks/pipelines/2026-08-09T191318-spec-295-296-297/spec-296/work/296-spec.md"
git commit -m "Record wd-foreign-session safety reasoning and #222 disjointness re-verification (refs #296)"
```

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: all tests pass, including `bin/lib/dispatch/tests/artifact-verdict.test.js` (via Task 2's `package.json` glob addition).

- [ ] **Step 6: Final byte-budget confirmation**

```bash
wc -c skills/dispatch/SKILL.md skills/dispatch/task-prompt.md
```

Expected: `SKILL.md` well under 40960 with comfortable headroom (the whole point of Task 1's extraction).

---

## Self-Review Notes (for the plan author, not the implementer)

- **Spec coverage:** Every Deliverable in #296 maps to a task — the two-call split and the "never a summary of the first call" no-echo rule (Task 3), the re-derive-from-artifacts requirement structurally pinned (Task 2) and explicitly instructed in the second call's prompt (Task 3), the `steps-and-gates.md` documentation (Task 4), the intermediate-outcome vocabulary (Task 3), the fixture-based test with a planted false claim (Task 2), and the "verified: second call commits into first call's worktree, wd-foreign-session doesn't block" evidence (Task 5 — code-grounded, since a live two-call dispatch run isn't practical to assert in a unit test, matching the spec's own Deliverables list). Acceptance Criteria 1 (two distinct Task() invocations) and 2 (second call locates the run with no other input) are structural properties of the templates in Task 3, verifiable by inspection; AC3 is Task 2's test; AC4 (NEEDS_CONTEXT/BLOCKED blocks the second call) is Task 3's gate paragraph; AC5 (`npm test` green) is Task 5 Step 5.
- **Placeholder scan:** No TBD/TODO — every step has literal file content, code, or commands.
- **Type consistency:** `deriveTestVerdict({ rawTestOutputPath })`'s signature and return shape (`{ passed, failCount, source }`) are defined once in Task 2 and referenced, not redefined, by Task 3's citation in the second call's prompt.
