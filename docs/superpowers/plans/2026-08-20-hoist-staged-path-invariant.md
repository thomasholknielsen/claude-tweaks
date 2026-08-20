# Hoist the anchored-staged-path invariant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `plugin/skills/_shared/pipeline-run-dir.md`'s Anchoring section the single stated owner of the "a staged proposal lives at the absolute anchored `staged/` path, never a worktree-relative shadow" invariant, with `plugin/skills/_shared/staged-patch.md` and `plugin/skills/wrap-up/curation-engine.md` citing it instead of independently restating it.

**Architecture:** Pure documentation change — add one new paragraph to the owner file's existing Anchoring section, then trim the two consumer sites down to a short citation of that paragraph (their own procedures — `git apply --check`, the judge's `test -f` self-verification, the shadow sweep — are untouched). A conformance test pins that the invariant's marker sentence appears exactly once (in the owner) and that both consumers cite it.

**Tech Stack:** Markdown (skill files), Node's built-in `node --test` runner (repo-root `tests/`).

**Spec:** `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/record-737/.claude-tweaks/pipelines/2026-08-20T065924-record-737/work/737-spec.md` (GitHub issue #737)

## Global Constraints

- Plugin payload root is `plugin/` — the record's `skills/...` references mean `plugin/skills/...`.
- Repo-root `tests/` uses `node --test`, not a bundler-based runner — no new dependencies.
- Do not touch the three files' own operational procedures (the `git apply --check` gate in `staged-patch.md`, the judge `test -f` self-verification and the shadow-sweep bash snippet in `curation-engine.md` §4) — only the prose that restates the invariant's *definition*.
- Existing conformance tests (`tests/staged-patch-contract.test.js`, `tests/curation-judge-stagepath.test.js`) must keep passing unmodified in behavior — several assert the literal words `absolute`/`anchored`/`stagePath` are present in specific sections; edits must keep those words present (they're kept anyway, as citation language), only the restated *path-pattern-plus-shadow-consequence* prose is removed.

---

### Task 1: Add the staged-file invariant paragraph to `pipeline-run-dir.md`'s Anchoring section

**Files:**
- Modify: `plugin/skills/_shared/pipeline-run-dir.md` (Anchoring section, currently lines 52-111 in the worktree checkout)
- Test: `tests/staged-patch-contract.test.js` (new test appended)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a new paragraph in `pipeline-run-dir.md`'s `## Anchoring` section, marked by the exact bold lead-in text `**The staged-file invariant.**` — Task 2/3 cite this marker string; the new test in this task pins it appears exactly once repo-wide (in the owner file only).

- [ ] **Step 1: Write the failing test**

Append to `tests/staged-patch-contract.test.js` (after the existing `test('the fallback procedure heading is stated once — only in the contract', ...)` block, before the "Live discrimination probe" comment):

```javascript
// #737: the anchored-staged-path invariant is owned by pipeline-run-dir.md's Anchoring
// section — stated once there, cited (not restated) by staged-patch.md and curation-engine.md.
const RUN_DIR_DOC = path.join(SKILLS, '_shared', 'pipeline-run-dir.md');
const INVARIANT_MARKER = '**The staged-file invariant.**';
const CITATION_PHRASE = "the staged-file invariant `_shared/pipeline-run-dir.md`'s Anchoring section states as the single owner";

test('pipeline-run-dir.md Anchoring section states the staged-file invariant exactly once, repo-wide', () => {
  const walk = (dir, acc = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, acc);
      else if (e.name.endsWith('.md')) acc.push(full);
    }
    return acc;
  };
  let ownerHits = 0;
  for (const file of walk(SKILLS)) {
    const text = fs.readFileSync(file, 'utf8');
    const count = text.split(INVARIANT_MARKER).length - 1;
    if (file === RUN_DIR_DOC) { ownerHits = count; continue; }
    assert.equal(count, 0, `${path.relative(SKILLS, file)} restates the staged-file invariant marker`);
  }
  assert.equal(ownerHits, 1, 'pipeline-run-dir.md states the staged-file invariant marker exactly once');
  const anchoring = fs.readFileSync(RUN_DIR_DOC, 'utf8');
  const section = anchoring.slice(anchoring.indexOf('## Anchoring'));
  assert.ok(section.includes(INVARIANT_MARKER), 'marker lives inside the Anchoring section');
  assert.match(section, /worktree-relative shadow/, 'names the shadow failure mode');
  // pipeline-run-dir.md hard-wraps prose across lines — a `.` in a regex does not span a
  // newline, so a proximity check between two substrings that might land on different wrapped
  // lines must not rely on `.*` (see the sibling "Whitespace-spanning sweep greps" class of
  // bug). Two independent substring checks instead of one order/proximity-sensitive regex.
  assert.ok(section.includes('curation-engine.md'), 'names curation-engine.md as the remedy owner');
  assert.ok(section.includes('§4'), 'names §4 as the remedy location');
  assert.ok(section.includes('post-fan-out shadow sweep'), 'names the shadow-sweep remedy by name');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/staged-patch-contract.test.js`
Expected: FAIL — `pipeline-run-dir.md Anchoring section states the staged-file invariant exactly once, repo-wide` fails because `ownerHits` is 0, not 1 (the marker doesn't exist yet).

- [ ] **Step 3: Add the paragraph**

In `plugin/skills/_shared/pipeline-run-dir.md`, inside the `## Anchoring` section, insert a new paragraph immediately after the two-bullet list that ends with:

```
- **`work/{n}-spec.md` is the exception** and stays inside the worktree. It is git-tracked
  and must be committed onto the feature branch; it reaches the main checkout by merge.
```

and immediately before the paragraph that begins `The \`worktree-always\` PreToolUse gate permits writes...`. Insert this new paragraph (blank line before and after):

```markdown
**The staged-file invariant.** A staged proposal (`_shared/staged-patch.md`'s Artifact
format — a review/reflect/test-fix/deepen-collapse `.patch`) lives at the **absolute**
anchored path under `$RUN_ROOT/.claude-tweaks/pipelines/{run-id}/…/staged/`, never at a
worktree-relative shadow — the same rule as the bullet above, restated as its own
paragraph because a curation judge (`wrap-up/curation-engine.md` §3/§4) runs inside the
worktree by necessity, so a path resolved relatively from that cwd is the *default*
failure mode there, not agent carelessness. The staging-time `git apply --check` gate
(`_shared/staged-patch.md`'s Staging-time gate) and the judge's own `test -f`
self-verification (`curation-engine.md` §4) both check against this same anchored path
before anything is logged as staged; the post-fan-out shadow sweep (`curation-engine.md`
§4) is the routine remedy for a staged file that ends up in the shadow anyway.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/staged-patch-contract.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/pipeline-run-dir.md tests/staged-patch-contract.test.js
git commit -m "Add staged-file invariant paragraph to pipeline-run-dir.md's Anchoring section — refs #737"
```

---

### Task 2: `staged-patch.md` cites the invariant instead of restating it

**Files:**
- Modify: `plugin/skills/_shared/staged-patch.md` (Staging-time gate section)
- Test: `tests/staged-patch-contract.test.js` (new test appended)

**Interfaces:**
- Consumes: `INVARIANT_MARKER`, `CITATION_PHRASE`, `RUN_DIR_DOC` constants defined in Task 1's test additions (same file, module scope — reuse them, do not redeclare).
- Produces: `staged-patch.md`'s Staging-time gate section no longer contains the literal path pattern `$RUN_ROOT/.claude-tweaks/pipelines/{run-id}/staged/…` or the phrase `worktree-relative shadow`; it contains `CITATION_PHRASE` instead.

- [ ] **Step 1: Write the failing test**

Append to `tests/staged-patch-contract.test.js` (after Task 1's new test):

```javascript
test('staged-patch.md Staging-time gate cites the pipeline-run-dir.md staged-file invariant instead of restating it', () => {
  const text = fs.readFileSync(CONTRACT, 'utf8');
  const gate = text.slice(text.indexOf('## Staging-time gate'), text.indexOf('## Console apply with description fallback'));
  assert.ok(gate.includes(CITATION_PHRASE), 'Staging-time gate cites the staged-file invariant');
  assert.ok(!gate.includes('worktree-relative shadow'), 'Staging-time gate no longer restates the shadow phrase');
  assert.match(gate, /\*\*absolute\*\*/, 'still names the path as absolute (kept, not part of the restatement being removed)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/staged-patch-contract.test.js`
Expected: FAIL — the citation phrase isn't present yet and `worktree-relative shadow` is still there.

- [ ] **Step 3: Edit the Staging-time gate**

In `plugin/skills/_shared/staged-patch.md`, in the `## Staging-time gate` section, replace this text:

```
Immediately after composing the file, and before logging it as staged, run — from the worktree,
the same tree the diff was composed against. `$STAGE_PATH` is the staged file's **absolute**
path under the run directory resolved per `_shared/pipeline-run-dir.md`'s Anchoring section
(`$RUN_ROOT/.claude-tweaks/pipelines/{run-id}/staged/…` — the main checkout, never a
worktree-relative shadow); the command runs with cwd = the **worktree root** the diff was
composed against — always the `-C` form below, never a bare `git apply --check` from whatever cwd
happens to be current (a bare form validates against the wrong tree silently):
```

with:

```
Immediately after composing the file, and before logging it as staged, run — from the worktree,
the same tree the diff was composed against. `$STAGE_PATH` is the staged file's **absolute**
anchored path — the staged-file invariant `_shared/pipeline-run-dir.md`'s Anchoring section states as the single owner;
the command runs with cwd = the **worktree root** the diff was composed against — always the
`-C` form below, never a bare `git apply --check` from whatever cwd happens to be current (a bare
form validates against the wrong tree silently):
```

**Note on line-wrapping:** this file hard-wraps prose across ~90-char lines, but the
`CITATION_PHRASE` string the test in Step 1 searches for (`"the staged-file invariant
\`_shared/pipeline-run-dir.md\`'s Anchoring section states as the single owner"`) is a single
`.includes()` substring check against the raw file text — if that phrase gets wrapped onto two
physical lines, the literal newline character inside it will make the check fail even though the
prose reads correctly to a human. Keep that exact clause on one physical line, even though it
runs longer than the surrounding ~90-char wrap (as shown above) — do not re-wrap it for
cosmetic column-width consistency.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/staged-patch-contract.test.js`
Expected: PASS (all tests in the file, including Task 1's)

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/staged-patch.md tests/staged-patch-contract.test.js
git commit -m "staged-patch.md cites pipeline-run-dir.md's staged-file invariant instead of restating it — refs #737"
```

---

### Task 3: `curation-engine.md` §3/§4 cite the invariant instead of restating it

**Files:**
- Modify: `plugin/skills/wrap-up/curation-engine.md` (§3 `findings[].stagePath` row; §4 judge self-verification lead sentence)
- Test: `tests/curation-judge-stagepath.test.js` (new test appended)

**Interfaces:**
- Consumes: same `CITATION_PHRASE` string as Task 2 (`"the staged-file invariant \`_shared/pipeline-run-dir.md\`'s Anchoring section states as the single owner"` — reproduce it as a local constant in this test file since it's a separate file from Task 1/2's).
- Produces: §3's `stagePath` row and §4's judge self-verification lead sentence each contain the citation phrase; neither restates the literal `$RUN_ROOT/.claude-tweaks/pipelines/{run-id}/…/staged/` path pattern or the "lands in the worktree's shadow ... not in the anchored run directory" mechanism explanation (that explanation now lives only in the owner paragraph from Task 1).

- [ ] **Step 1: Write the failing test**

Append to `tests/curation-judge-stagepath.test.js` (after the existing `test('curation-engine.md §3 stagePath row requires the absolute anchored path and names the rejection', ...)` block):

```javascript
test('curation-engine.md §3/§4 cite the pipeline-run-dir.md staged-file invariant instead of restating it', () => {
  const CITATION_PHRASE = "the staged-file invariant `_shared/pipeline-run-dir.md`'s Anchoring section states as the single owner";
  const row = ENGINE.split('\n').find((l) => l.startsWith('| `findings[].stagePath` |'));
  assert.ok(row.includes(CITATION_PHRASE), '§3 stagePath row cites the staged-file invariant');
  assert.ok(!row.includes('$RUN_ROOT/.claude-tweaks/pipelines/{run-id}'), '§3 row no longer restates the literal anchored path pattern');

  const s4 = ENGINE.slice(ENGINE.indexOf('## 4. Parallel dispatch'));
  const verifyPara = s4.slice(s4.indexOf('**Judge self-verification'), s4.indexOf('**Post-fan-out shadow sweep'));
  assert.ok(verifyPara.includes(CITATION_PHRASE), '§4 judge self-verification paragraph cites the staged-file invariant');
  assert.ok(!verifyPara.includes("lands in the worktree's *shadow* of `.claude-tweaks/pipelines/…`, not in the anchored run directory"), '§4 no longer restates the shadow-vs-anchored mechanism explanation');
  // Procedure-specific mentions of "absolute" (the ABS_STAGE_DIR self-verification instruction,
  // the payload-validation prose) are untouched by this task and must still be present.
  assert.match(verifyPara, /literal absolute/);
  assert.match(verifyPara, /absolute path spelled out/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/curation-judge-stagepath.test.js`
Expected: FAIL — citation phrase absent from both §3 row and §4 paragraph.

- [ ] **Step 3: Edit §3's `stagePath` row**

In `plugin/skills/wrap-up/curation-engine.md`, replace the `findings[].stagePath` table row:

```
| `findings[].stagePath` | staged findings | The **absolute** anchored path of the `staged/` file holding the proposal — under `$RUN_ROOT/.claude-tweaks/pipelines/{run-id}/…/staged/` per `_shared/pipeline-run-dir.md`'s Anchoring section, exactly as the judge verified it with `test -f` (section 4). A relative value is a contract violation the controller rejects before `record` — see section 4. Same rendering caveat. The engine renders it as given — the console's Disposition cell shows the absolute path, deliberately, so a reader can open it from any cwd. |
```

with:

```
| `findings[].stagePath` | staged findings | The **absolute** anchored path of the `staged/` file holding the proposal — the staged-file invariant `_shared/pipeline-run-dir.md`'s Anchoring section states as the single owner, exactly as the judge verified it with `test -f` (section 4). A relative value is a contract violation the controller rejects before `record` — see section 4. Same rendering caveat. The engine renders it as given — the console's Disposition cell shows the absolute path, deliberately, so a reader can open it from any cwd. |
```

- [ ] **Step 4: Edit §4's judge self-verification lead sentence**

In the same file, in `## 4. Parallel dispatch and the learning-capture singleton`, replace:

```
**Judge self-verification of `stagePath` (both branches).** A judge that stages a finding runs inside the worktree by necessity — it reads and edits repo files there — so a run-dir path resolved relatively from that cwd lands in the worktree's *shadow* of `.claude-tweaks/pipelines/…`, not in the anchored run directory (`_shared/pipeline-run-dir.md`'s Anchoring section). That is the default failure mode, not agent carelessness, so the guard is structural.
```

with:

```
**Judge self-verification of `stagePath` (both branches).** A judge that stages a finding runs inside the worktree by necessity — it reads and edits repo files there, which is exactly the default failure mode the staged-file invariant `_shared/pipeline-run-dir.md`'s Anchoring section states as the single owner already names. Not agent carelessness — the guard here is structural.
```

Leave the rest of the paragraph (the `{ABS_STAGE_DIR}` self-verification instruction, the controller-side payload-validation prose) untouched — it is procedure, not the invariant's definition.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/curation-judge-stagepath.test.js`
Expected: PASS (all tests in the file)

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/wrap-up/curation-engine.md tests/curation-judge-stagepath.test.js
git commit -m "curation-engine.md §3/§4 cite pipeline-run-dir.md's staged-file invariant instead of restating it — refs #737"
```

---

### Task 4: Full-suite verification

**Files:**
- None modified — verification only.

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: nothing new; confirms no regression elsewhere in the suite (e.g. `tests/pipeline-run-dir*.test.js` if any exist, or any other file asserting the pre-edit wording of the three touched files).

- [ ] **Step 1: Run the full suite**

Run: `npm test`
Expected: PASS — 0 failures. If any pre-existing test elsewhere in the suite asserted the exact old wording this plan removed (the literal `$RUN_ROOT/.claude-tweaks/pipelines/{run-id}/staged/…` phrase or `worktree-relative shadow` inside `staged-patch.md`/`curation-engine.md` specifically), fix that test's assertion to match the new citation wording — the AC1 grep below is the actual acceptance bar, not the incidental old wording.

- [ ] **Step 2: Verify Acceptance Criterion 1 directly**

Run: `grep -rn "absolute" plugin/skills/_shared/staged-patch.md plugin/skills/wrap-up/curation-engine.md`
Expected: every matched line either cites `_shared/pipeline-run-dir.md` (the two edited sites from Tasks 2/3) or is one of `curation-engine.md` §4's untouched procedural mentions (`{ABS_STAGE_DIR}` self-verification, payload-validation prose) — none independently restates the anchored-staged-path rule's definition.

- [ ] **Step 3: No commit needed for this task** (verification only — if Step 1 required a fix, that fix gets its own commit per the standard fix-then-commit pattern, not folded silently into this task's non-existent diff).
