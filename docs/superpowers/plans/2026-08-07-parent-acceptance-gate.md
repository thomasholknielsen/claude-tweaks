# Parent-Record Acceptance Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a `/claude-tweaks:specify` decomposition's parent record a demoable end-to-end checkpoint, so a multi-leaf family reaches an explicit human verdict on the assembled whole rather than only on its parts.

**Architecture:** Two pure helpers (`parseFamilyLeaves` in `record.js`, `familyGateState` in `acceptance.js`) compute a family's gate state from data the callers already fetch. `/wrap-up` applies the gate eagerly when it closes the last leaf; a new `/tidy` scope sweeps for families it missed; `/demo` resolves the verdict and closes the parent. A `family:parent` label makes parents enumerable, and a `hasParent` flag keeps decomposed leaves out of both `/tidy`'s un-dispositioned sweep and `trust.js`'s evidence population.

**Tech Stack:** Node 18+ CommonJS (`bin/lib/issues/`), `node --test`, markdown skill files, `gh` CLI.

## Global Constraints

- **Fail open, always.** Every new path skips silently when `gh` is unavailable, unauthenticated, the repo has no GitHub remote, or a parent cannot be resolved. The gate is an aid to a human decision, never a correctness mechanism, and must never block a wrap-up or a review.
- **`hasParent` is checked as an explicit boolean**, never by truthiness of a default-constructed object (`[IL-31]`). `record.hasParent === true` suppresses; an absent field preserves today's behavior.
- **`hasParent` is resolved from the parent side, never the leaf side.** `work-links: body-text` writes `Parent: #N` onto the leaf; `work-links: native` writes nothing onto the leaf. A leaf-side lookup silently returns `false` for every leaf under `native` (`[IL-64]`).
- **Producer and consumer land in the same task.** Tasks 4, 5, and 6 each pair a new signal with the code that reads it, because task-scoped review cannot catch a cross-file gap (`[IL-02]`).
- **No new `bin/lib/{name}/tests/` directories.** All new tests go in the existing `bin/lib/issues/tests/`, already covered by `package.json`'s glob (`[IL-84]`).
- **Skill prose edits are verified by reading the rendered result**, not the diff (`[IL-27]`), and by a whitespace-flexible grep, since hard-wrapped markdown splits phrases across lines (`[IL-66]`).
- Design doc: `docs/superpowers/specs/2026-08-07-parent-acceptance-gate-design.md`.

---

### Task 1: Predicate layer

Two pure functions and their tests. No behavior is visible to a user yet; this is the foundation Tasks 2-6 all call. Both mirror `parseDependencies`'s existing shape rather than inventing a new one.

**Files:**
- Modify: `bin/lib/issues/record.js` (add `FAMILY_LEAF_RE` near `DEP_RE:45`, `parseFamilyLeaves` near `parseDependencies:250`, export at `:338-343`)
- Modify: `bin/lib/issues/acceptance.js` (add `familyGateState`, export at `:61`)
- Test: `bin/lib/issues/tests/record.test.js`, `bin/lib/issues/tests/acceptance.test.js`

**Interfaces:**
- Consumes: `dispositionState(labels)` from `acceptance.js` (already exported).
- Produces:
  - `parseFamilyLeaves(body: string) → number[]` — deduped leaf issue numbers from a parent's task list, in order of first appearance.
  - `familyGateState({ leaves, parentLabels }) → 'incomplete' | 'due' | 'gated' | 'resolved'` where `leaves: Array<{number, state}>` and `parentLabels: string[]`.

- [ ] **Step 1: Write the failing tests for `parseFamilyLeaves`**

Append to `bin/lib/issues/tests/record.test.js`:

```js
test('parseFamilyLeaves reads a parent task list', () => {
  const body = 'Design summary\n\n- [ ] #46\n- [x] #47\n- [ ] #48\n';
  assert.deepEqual(parseFamilyLeaves(body), [46, 47, 48]);
});

test('parseFamilyLeaves ignores mid-line mentions and dedupes', () => {
  // Mirrors parseDependencies: only a line-anchored entry declares a leaf.
  const body = 'see - [ ] #99 inline\n- [ ] #46\n- [ ] #46\n';
  assert.deepEqual(parseFamilyLeaves(body), [46]);
});

test('parseFamilyLeaves returns empty for absent or non-string bodies', () => {
  assert.deepEqual(parseFamilyLeaves(''), []);
  assert.deepEqual(parseFamilyLeaves(undefined), []);
  assert.deepEqual(parseFamilyLeaves('no task list here'), []);
});
```

Add `parseFamilyLeaves` to that file's existing `require('../record.js')` destructure.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test bin/lib/issues/tests/record.test.js`
Expected: FAIL — `TypeError: parseFamilyLeaves is not a function`

- [ ] **Step 3: Implement `parseFamilyLeaves`**

In `bin/lib/issues/record.js`, beside `DEP_RE` (line 45):

```js
// Parent task-list entries (work-links: body-text), written by /specify as
// '- [ ] #{leafNum}' and checked off over time — both box states count.
const FAMILY_LEAF_RE = /^- \[[ xX]\] #(\d+)\b/gm;
```

Beside `parseDependencies` (after line 262):

```js
// parent body -> deduped array of leaf issue numbers from its task list, in order
// of first appearance. Mid-line occurrences don't count, exactly as with DEP_RE.
// Under work-links: native the parent body carries no task list at all — that
// caller reads sub_issues from the API and never calls this.
function parseFamilyLeaves(body) {
  if (typeof body !== 'string' || !body) return [];
  const seen = new Set();
  const result = [];
  for (const match of body.matchAll(FAMILY_LEAF_RE)) {
    const n = Number(match[1]);
    if (!seen.has(n)) {
      seen.add(n);
      result.push(n);
    }
  }
  return result;
}
```

Add `parseFamilyLeaves` to `module.exports` (line 338-343).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test bin/lib/issues/tests/record.test.js`
Expected: PASS

- [ ] **Step 5: Write the failing tests for `familyGateState`**

Append to `bin/lib/issues/tests/acceptance.test.js`, adding `familyGateState` to the existing destructure at lines 5-9:

```js
const CLOSED = (n) => ({ number: n, state: 'CLOSED' });
const OPEN = (n) => ({ number: n, state: 'OPEN' });

test('familyGateState is incomplete while any leaf is open', () => {
  assert.equal(familyGateState({ leaves: [CLOSED(1), OPEN(2)], parentLabels: [] }), 'incomplete');
});

test('familyGateState is due when every leaf is closed and the parent is unlabelled', () => {
  assert.equal(familyGateState({ leaves: [CLOSED(1), CLOSED(2)], parentLabels: [] }), 'due');
});

test('familyGateState is gated once the parent carries demo:pending', () => {
  assert.equal(familyGateState({ leaves: [CLOSED(1)], parentLabels: ['demo:pending'] }), 'gated');
});

test('familyGateState is resolved once a verdict is recorded', () => {
  assert.equal(familyGateState({ leaves: [CLOSED(1)], parentLabels: ['demo:approved'] }), 'resolved');
  assert.equal(
    familyGateState({ leaves: [CLOSED(1)], parentLabels: ['demo:changes-requested'] }),
    'resolved',
  );
});

test('familyGateState reports gated even if a leaf reopens after gating', () => {
  // The label is the authoritative record of what was applied; a reopened leaf
  // must not cause the sweep to re-gate an already-gated parent.
  assert.equal(familyGateState({ leaves: [OPEN(1)], parentLabels: ['demo:pending'] }), 'gated');
});

test('familyGateState never reports due for a family with no discoverable leaves', () => {
  // A parent whose leaves cannot be resolved is a resolution failure, not a
  // complete family — gating it would demand a verdict on work nobody built.
  assert.equal(familyGateState({ leaves: [], parentLabels: [] }), 'incomplete');
  assert.equal(familyGateState({}), 'incomplete');
  assert.equal(familyGateState(), 'incomplete');
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `node --test bin/lib/issues/tests/acceptance.test.js`
Expected: FAIL — `TypeError: familyGateState is not a function`

- [ ] **Step 7: Implement `familyGateState`**

In `bin/lib/issues/acceptance.js`, after `needsBackstop`:

```js
// A decomposition family's acceptance state. Reads the parent's own label first:
// the label is the authoritative record of what has already been applied, so a
// leaf reopening after the gate went on never re-opens the gating decision.
function familyGateState({ leaves, parentLabels } = {}) {
  const disposition = dispositionState(parentLabels);
  if (disposition === 'approved' || disposition === 'changes-requested') return 'resolved';
  if (disposition === 'pending') return 'gated';

  const all = Array.isArray(leaves) ? leaves : [];
  if (all.length === 0) return 'incomplete';
  return all.every((leaf) => leaf && leaf.state === 'CLOSED') ? 'due' : 'incomplete';
}
```

Extend `module.exports` (line 61) to `{ dispositionState, verificationSurface, needsBackstop, familyGateState }`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `node --test bin/lib/issues/tests/acceptance.test.js bin/lib/issues/tests/record.test.js`
Expected: PASS

- [ ] **Step 9: Confirm the tests discriminate**

Temporarily change `familyGateState`'s empty-`leaves` branch to `return 'due'`, re-run, and confirm the "never reports due" test fails. Revert. A selection-logic test that reads correctly but cannot fail is worth nothing.

- [ ] **Step 10: Commit**

```bash
git add bin/lib/issues/record.js bin/lib/issues/acceptance.js bin/lib/issues/tests/record.test.js bin/lib/issues/tests/acceptance.test.js
git diff --cached --name-only
git commit -m "Add the family gate predicate layer — refs #<record>"
```

Check `git diff --cached --name-only` output before committing: `git commit` with no pathspec commits the entire staged index, not just the files you named (`[IL-42]`).

---

### Task 2: `/wrap-up` applies the gate

The eager write path, and the first task with user-visible behavior: close a family's last leaf and its parent acquires `demo:pending` plus a rolled-up brief.

**Files:**
- Modify: `skills/wrap-up/execution-and-verification.md` (the Acceptance labeling bullet, line 21)
- Modify: `skills/wrap-up/verification-brief.md` (add the family-gate procedure and parent-brief composition)
- Modify: `skills/wrap-up/SKILL.md:416` (the Anti-Patterns row asserting the axis applies uniformly)

**Interfaces:**
- Consumes: `familyGateState({leaves, parentLabels})` and `parseFamilyLeaves(body)` from Task 1.
- Produces: a parent record carrying `demo:pending` and a `## Verification Brief` comment whose `### Confirmed` section exists — the shape `/demo` Step 1 already reads, and `execution-and-verification.md:42`'s existing verification line already asserts.

- [ ] **Step 1: Add the parent-resolution and gate procedure to `verification-brief.md`**

Add a new section. Resolve the leaf's parent exactly as `/claude-tweaks:review` Step 1.6 does (`skills/review/SKILL.md:147-154`) — `local-files`: `facets.parent`; `github-issues` + `work-links: native`: the sub-issue relationship; `github-issues` + `work-links: body-text`: the `Parent: #N` body line. No parent resolvable → skip this section entirely and apply `demo:pending` to the record itself, exactly as today.

With a parent resolved, enumerate the family's leaves from the **parent** side:

```bash
# work-links: native
gh api "repos/{owner}/{repo}/issues/$PARENT_NUM/sub_issues" --jq '.[].number'

# work-links: body-text — parse the parent's own task list
gh issue view $PARENT_NUM --json body -q .body > /tmp/wrapup-parent-body.md
node -e "
  const { parseFamilyLeaves } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/record.js');
  const fs = require('fs');
  console.log(JSON.stringify(parseFamilyLeaves(fs.readFileSync('/tmp/wrapup-parent-body.md','utf8'))));
"
```

- [ ] **Step 2: Write the self-inclusion rule explicitly**

In the same section, state as a numbered rule:

> The record `/wrap-up` is closing counts as `CLOSED` when building the `leaves` array, regardless of what `gh` reports for it. `/wrap-up` evaluates the gate while closing that very leaf, so reading its live state makes the last leaf always evaluate `incomplete` and the gate never fires.

This is the `[IL-65]` failure mode: a same-function self-inconsistency that no test catches, because the symptom is a silent no-op.

- [ ] **Step 3: Add the leaf-skip rule to `execution-and-verification.md`**

Modify the Acceptance labeling bullet (line 21). After `**Acceptance labeling** (record mode only — a materialized header exists for this run)`, insert:

> — **when this record has a resolvable parent, skip its own acceptance labeling entirely** and run the family-gate procedure in `verification-brief.md` instead. A decomposed leaf never carries `demo:pending`; the family's parent carries one gate for all of them.

- [ ] **Step 4: Specify the parent brief's two parts**

In `verification-brief.md`, state that a parent brief consists of:

1. One verification item per `## Cross-Spec Promises` row on the parent, phrased as the claim to confirm — e.g. `F1: #48 assumed #46 exposes getStatus() — confirm it does.` Rows still `open` are included and marked unverified; they **do not** block the gate from opening. The register is deliberately not a hard gate anywhere (`skills/review/SKILL.md:173-175`).
2. One walkthrough of the feature's primary path across the assembled leaves. For this repo the runnable unit is a skill invocation, not a deploy — name the invocation and the observable outcome.

Where no register exists (below `promise-register-min-leaves`, default `4`, or `work-backend: local-files`), part 2 alone is the brief.

- [ ] **Step 5: Apply the gate**

```bash
gh issue edit $PARENT_NUM --add-label demo:pending
gh issue comment $PARENT_NUM --body-file /tmp/parent-verification-brief.md
```

Post the brief **before** adding the label, matching `verification-brief.md:205`'s existing invariant that a reader never sees `demo:pending` without a brief already attached.

- [ ] **Step 6: Amend the Anti-Patterns row this task contradicts**

`skills/wrap-up/SKILL.md:416` currently reads:

> | Treating `demo:pending` as optional for "trivial" record-mode work | The Acceptance axis applies uniformly — triviality gets a fast path at `/demo`'s verdict step, not wrap-up's labeling step |

That row was true when written and nothing else contradicts it, which is exactly why it goes stale silently (`[IL-93]`). This task makes labeling conditional for one class of record, so amend the rationale to distinguish the two cases:

> | Treating `demo:pending` as optional for "trivial" record-mode work | Triviality is not an exemption — it gets a fast path at `/demo`'s verdict step, not wrap-up's labeling step. The one record class that *does* skip its own label is a leaf with a resolvable parent, and that is the gate moving to the family's parent, not going away |

Do not delete the row. The rule it enforces still holds for every non-decomposed record, and deleting it would license exactly the shortcut it exists to prevent.

- [ ] **Step 7: Verify the rendered result**

Read the edited regions of all three files in full — not the diff. A sentence inserted next to a fenced block lands *inside* the fence and breaks the snippet; one inserted next to prose can split an existing sentence and orphan its tail (`[IL-27]`). For the table row specifically, confirm the pipe count is unchanged and the row still renders as one row.

- [ ] **Step 8: Run the suites that read these files**

Run: `node --test tests/ bin/lib/skill-audit/tests/*.test.js`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add skills/wrap-up/execution-and-verification.md skills/wrap-up/verification-brief.md skills/wrap-up/SKILL.md
git diff --cached --name-only
git commit -m "Apply the family gate from /wrap-up when the last leaf closes — refs #<record>"
```

---

### Task 3: `/demo` resolves a parent

Completes the human loop. After this task the feature works end to end for the common path: a family gets gated, a human gives a verdict, the parent closes.

**Files:**
- Modify: `skills/demo/SKILL.md` (Step 1 entry resolution; the approve/changes-requested verdict actions near line 301-303)

**Interfaces:**
- Consumes: a parent carrying `demo:pending` plus a `## Verification Brief` comment, from Task 2.
- Produces: parent carrying `demo:approved` (and closed) or `demo:changes-requested` (and left open).

- [ ] **Step 1: Note that parents need no new entry-resolution branch**

A gated parent carries `demo:pending`, so it resolves through the existing label-backed branch (`skills/demo/SKILL.md:102`) with no change. Add one sentence to Step 1 recording that a `#N` may be a decomposition parent, and that its brief covers the whole family rather than one diff.

- [ ] **Step 2: Add parent closing to the approve action**

The current approve action (line 301) is:

```bash
gh issue edit {n} --remove-label demo:pending --add-label demo:approved
```

For a record carrying `family:parent`, follow it with:

```bash
gh issue close {n} --reason completed
```

State why explicitly: nothing else in the system ever closes a parent, so without this the parent stays open forever and the acceptance label is the only trace the family was ever accepted.

- [ ] **Step 3: State that changes-requested leaves the parent open**

The existing follow-up filing applies unchanged. The parent stays open, since the family's work is not done.

- [ ] **Step 4: Verify the rendered result and the untouched no-op**

Read the edited region. Confirm the existing `--remove-label demo:pending` note at line 301 — that removing an absent label is a silent no-op — still reads correctly beside the new close step.

- [ ] **Step 5: Run the suites**

Run: `node --test tests/ bin/lib/skill-audit/tests/*.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add skills/demo/SKILL.md
git diff --cached --name-only
git commit -m "Resolve a decomposition parent's verdict and close it — refs #<record>"
```

---

### Task 4: Parents become enumerable, and `/tidy` sweeps them

Producer and consumer in one task: the `family:parent` label exists *and* something reads it. Splitting these would ship a label nothing consumes (`[IL-02]`).

**Files:**
- Modify: `skills/specify/record-creation.md:58` (Parent record label)
- Modify: `skills/_shared/label-bootstrap.md` (add `family:parent`)
- Modify: `skills/_shared/github-pr-scan.md` (new `family-gate` scope after `acceptance-gap`, line 146-185)
- Modify: `skills/tidy/SKILL.md:104` and `skills/tidy/scan-procedures.md:286-296` (consume the new scope)
- Modify: `skills/tidy/step-6-auto.md:16` (staging tier for the new finding)

**Interfaces:**
- Consumes: `familyGateState` from Task 1.
- Produces: a `[family-gate]` finding row, `[family-gate] #{n}: {title} — family complete, no acceptance disposition — recommend /claude-tweaks:demo #{n}`.

- [ ] **Step 1: Give the parent its label at creation**

`record-creation.md:58` currently states `recordPayload` returns zero labels for the parent. Amend the Parent record section so creation adds `family:parent`:

```bash
# work-types: native
PARENT_URL=$(gh issue create --title "$PARENT_TITLE" --body-file /tmp/specify-parent-body.md --type feature --label family:parent)
# work-types: labels
PARENT_URL=$(gh issue create --title "$PARENT_TITLE" --body-file /tmp/specify-parent-body.md --label type:feature --label family:parent)
```

Update the surrounding prose: the parent now carries exactly one label beyond its Type expression, and the reason is that nothing else makes parents enumerable — the `{design-doc-slug}:parent` fingerprint is a body marker reachable only through `gh issue list --search`, which `record-creation.md:90` deliberately avoids.

- [ ] **Step 2: Bootstrap the label**

Add to `_shared/label-bootstrap.md`'s list:

```js
["family:parent", "Structure: decomposition parent — carries the family's acceptance gate"],
```

- [ ] **Step 3: Add the `family-gate` scope to `github-pr-scan.md`**

After the `acceptance-gap` scope. Record set: open records carrying `family:parent`.

```bash
gh issue list --label family:parent --state open --json number,title,body,labels --limit 200 \
  > /tmp/tidy-family-parents.json
```

For each parent, enumerate its leaves from the parent side (native: `gh api repos/{owner}/{repo}/issues/N/sub_issues --jq '.[].number'`; body-text: `parseFamilyLeaves` on its body), fetch each leaf's state, then:

```bash
node -e "
  const { familyGateState } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/acceptance.js');
  const families = require('/tmp/tidy-families.json'); // [{number, title, leaves, parentLabels}]
  families
    .filter(f => familyGateState({ leaves: f.leaves, parentLabels: f.parentLabels }) === 'due')
    .forEach(f => console.log('[family-gate] #' + f.number + ': ' + f.title + ' — family complete, no acceptance disposition — recommend /claude-tweaks:demo #' + f.number));
"
```

Emit at severity `info`, and state the same staging rule `acceptance-gap` carries: never auto-applied at any `tidy-aggressiveness`, because applying a disposition is a judgment about whether shipped work solved the problem.

- [ ] **Step 4: Wire the consumers**

Add `[family-gate]` to `tidy/SKILL.md:104`'s Step 4.8 row, to `scan-procedures.md:349`'s prefix list, and to `step-6-auto.md:16`'s staging table with the same "Auto (no-op, always surfaced)" treatment as `acceptance-gap`.

- [ ] **Step 5: Verify the wiring is complete**

Grep for the new prefix across the repo and confirm every consumer list that names `[acceptance-gap]` also names `[family-gate]`:

```bash
grep -rn "acceptance-gap" skills/ | grep -v "family-gate"
```

Read each remaining hit and confirm it is genuinely acceptance-gap-specific rather than a list that should have been extended. A dispatcher-inlined fragment's new subsection does not reach consumers just because it is documented — each consumer's own "what the dispatcher inlines" sentence must name it (`[IL-60]`).

- [ ] **Step 6: Run the suites and verify rendering**

Run: `node --test tests/ bin/lib/skill-audit/tests/*.test.js`
Expected: PASS. Then read each edited region rendered, per `[IL-27]`.

- [ ] **Step 7: Commit**

```bash
git add skills/specify/record-creation.md skills/_shared/label-bootstrap.md skills/_shared/github-pr-scan.md skills/tidy/SKILL.md skills/tidy/scan-procedures.md skills/tidy/step-6-auto.md
git diff --cached --name-only
git commit -m "Make decomposition parents enumerable and sweep un-gated families — refs #<record>"
```

---

### Task 5: Decomposed leaves stop flooding `acceptance-gap`

Under Task 2 every leaf closes un-dispositioned by design. Without this task, `/tidy`'s `acceptance-gap` scope emits a row per leaf — on a scope whose own docs warn it already returns a three-digit set on every run (`github-pr-scan.md:180-185`).

**Files:**
- Modify: `bin/lib/issues/acceptance.js` (`needsBackstop`, line 56-59)
- Modify: `skills/_shared/github-pr-scan.md` (the `acceptance-gap` scope's `node -e` caller, lines 159-173)
- Test: `bin/lib/issues/tests/acceptance.test.js`

**Interfaces:**
- Consumes: `needsBackstop(record)` from `acceptance.js`.
- Produces: `needsBackstop` accepting an optional `hasParent` field.

- [ ] **Step 1: Write the failing tests**

```js
test('needsBackstop suppresses a closed leaf that belongs to a family', () => {
  assert.equal(needsBackstop({ state: 'CLOSED', labels: [], hasParent: true }), false);
});

test('needsBackstop is unchanged when hasParent is absent or not literally true', () => {
  // Explicit-boolean check, not truthiness of a default object — an absent field
  // must preserve today's behavior for human-filed and /capture'd records.
  assert.equal(needsBackstop({ state: 'CLOSED', labels: [] }), true);
  assert.equal(needsBackstop({ state: 'CLOSED', labels: [], hasParent: false }), true);
  assert.equal(needsBackstop({ state: 'CLOSED', labels: [], hasParent: undefined }), true);
});
```

- [ ] **Step 2: Run to verify the first test fails**

Run: `node --test bin/lib/issues/tests/acceptance.test.js`
Expected: FAIL — the family-leaf case returns `true`

- [ ] **Step 3: Implement**

```js
function needsBackstop(record) {
  if (!record || record.state !== 'CLOSED') return false;
  // A decomposed leaf's acceptance lives on its family's parent, not on itself.
  if (record.hasParent === true) return false;
  return dispositionState(record.labels) === 'none';
}
```

- [ ] **Step 4: Run to verify all pass**

Run: `node --test bin/lib/issues/tests/acceptance.test.js`
Expected: PASS

- [ ] **Step 5: Update the caller — the half that is easy to forget**

In `github-pr-scan.md`'s `acceptance-gap` scope, the closed-record set must be marked with `hasParent` before `needsBackstop` sees it. Add a step that resolves the family-leaf number set from the `family:parent` records (the same parent-side enumeration Task 4 added), then:

```js
const familyLeaves = new Set(require('/tmp/tidy-family-leaves.json')); // numbers
const gaps = records
  .map(r => ({ ...r, labels: r.labels.map(l => l.name), hasParent: familyLeaves.has(r.number) }))
  .filter(r => needsBackstop({ state: 'CLOSED', labels: r.labels, hasParent: r.hasParent }));
```

Note the spread order: derived fields come **after** the parsed spread, never before (`[IL-01]`).

Adding `hasParent` to `needsBackstop` without this step changes nothing at all — the flag defaults absent, so every leaf still reports as a gap.

- [ ] **Step 6: Commit**

```bash
git add bin/lib/issues/acceptance.js bin/lib/issues/tests/acceptance.test.js skills/_shared/github-pr-scan.md
git diff --cached --name-only
git commit -m "Keep decomposed leaves out of the un-dispositioned sweep — refs #<record>"
```

---

### Task 6: Decomposed leaves leave the trust population

`trustRows` grades a cell `clean` on `total >= 8 && dispositioned >= 1` with no negative evidence, and un-dispositioned records still increment `total`. Under Task 2 a seven-leaf family plus one approved parent would read `clean` off a single click. This makes the family the unit of evidence as well as of acceptance.

**Files:**
- Modify: `bin/lib/issues/trust.js:106`
- Modify: `skills/_shared/trust-table.md` (the Fetch section, so `hasParent` is populated)
- Test: `bin/lib/issues/tests/trust.test.js`

**Interfaces:**
- Consumes: `trustRows(records)` where each record may carry `hasParent`.
- Produces: cells whose `total` counts only independently-graded records.

- [ ] **Step 1: Write the failing test**

```js
test('parent-linked leaves do not count toward a cell reaching MIN_SAMPLES', () => {
  // Seven un-dispositioned leaves plus one approved parent must not grade a cell
  // `clean` — the leaves were never judged, and total is what makes 8 mean 8.
  const leaves = Array.from({ length: 7 }, (_, i) => ({
    number: i + 1, state: 'CLOSED', labels: [], body: '', hasParent: true,
  }));
  const parent = { number: 99, state: 'CLOSED', labels: ['demo:approved'], body: '' };
  const rows = trustRows([...leaves, parent]);
  assert.equal(rows.every((r) => r.total < MIN_SAMPLES), true);
  assert.equal(rows.every((r) => r.verdict === 'insufficient-evidence'), true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test bin/lib/issues/tests/trust.test.js`
Expected: FAIL — a cell reaches `total: 8` and grades `clean`

- [ ] **Step 3: Implement**

`bin/lib/issues/trust.js:106` becomes:

```js
  // A decomposed leaf is not independently graded work — its family's parent
  // carries the one verdict. Counting leaves here would let `total >= 8` be
  // satisfied by records nobody judged.
  const closed = all.filter((r) => r && r.state === 'CLOSED' && r.hasParent !== true);
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test bin/lib/issues/tests/trust.test.js`
Expected: PASS

- [ ] **Step 5: Populate `hasParent` in the fetch — the consumer half**

In `skills/_shared/trust-table.md`'s Fetch section, add the same parent-side family-leaf resolution and mark each fetched record. Without this the filter never fires, since `hasParent` is absent on every record (`[IL-02]` again, and the third instance of this same pairing in this plan).

Because `trust-table.md` is inlined into `/help` Stage 4.8's dispatch prompt and rendered inline by `/backlog overview` Step 1.5, confirm **both** consumers' "what the dispatcher inlines" descriptions cover the new Fetch step (`[IL-60]`).

- [ ] **Step 6: Run the full issues suite**

Run: `node --test bin/lib/issues/tests/*.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add bin/lib/issues/trust.js bin/lib/issues/tests/trust.test.js skills/_shared/trust-table.md
git diff --cached --name-only
git commit -m "Make the family the unit of trust evidence, not the leaf — refs #<record>"
```

---

### Task 7: Whole-branch review, then release

The whole-branch review runs **before** the version bump, not after. Per-task reviews are scoped to one task's diff by construction and cannot see a producer and its consumers in different files — which is exactly what Tasks 4, 5, and 6 each contain. A plan that bumps first has decided that any cross-task defect ships as a patch (`[IL-97]`).

**Files:**
- Modify: `.claude-plugin/plugin.json`, `CHANGELOG.md`, `docs/shipped-versions.tsv`
- Modify (separate repo): `thomasholknielsen/claude-tweaks-marketplace` → `.claude-plugin/marketplace.json`

- [ ] **Step 1: Run the whole-branch review**

Invoke `/claude-tweaks:review` across the full branch diff, not per task. Specifically check the three producer/consumer pairs: does `github-pr-scan.md` actually pass `hasParent`; does `trust-table.md` actually populate it; does every consumer list naming `[acceptance-gap]` also name `[family-gate]`.

- [ ] **Step 2: Run the full suite, and check for competing runs first**

```bash
pgrep -fl "node --test"
```

Other worktree sessions running the suite concurrently will stall it and make any failure untrustworthy. If others are running, wait rather than interpret the result.

Run: `npm test > /tmp/final.txt 2>&1; echo "exit=$?"`
Expected: `exit=0`, `# fail 0`. Read the counts from the file — a backgrounded task's notification reports the *wrapper's* exit code, not npm's.

- [ ] **Step 3: Claim the version number**

Run all four checks; a number is claimed by whatever **ships** first, never reserved:

```bash
git fetch origin main
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
git show main:.claude-plugin/plugin.json
git worktree list
grep -rn "6\.5[0-9]\.[0-9]" docs/superpowers/plans/
```

Check `origin/main`, **local `main`** (it can sit far ahead with executed bumps invisible to `git log origin/main` — `[IL-98]`), every sibling worktree branch, and unexecuted plans. Re-check immediately before pushing: parallel sessions ship during your test run, and this has already happened twice in this feature's own history.

- [ ] **Step 4: Bump, changelog, and shipped-versions in one commit**

All three in the same commit. `tests/changelog-coverage.test.js` fails the suite when the manifest's version has no entry, so a deferred entry is a red suite rather than a forgotten step.

- `.claude-plugin/plugin.json` — minor bump (feature addition)
- `CHANGELOG.md` — `## v{version} — {one-line summary}` directly under `# Changelog`. The strict `X.Y.Z` and em-dash shape is load-bearing: `bin/lib/changelog.js`'s parser requires it.
- `docs/shipped-versions.tsv` — `{version}\t{YYYY-MM-DD}\trelease`

- [ ] **Step 5: Push, then mirror the marketplace**

Push `main` here, then edit the marketplace repo's `.claude-plugin/marketplace.json`: `plugins[].version` mirrors this plugin's version; `metadata.version` is the marketplace's own `2.x` scheme; keep `plugins[].description` aligned. Commit and push.

Do not stop to ask between the two pushes — the Releasing section authorizes both as one action, and pausing risks the mirror never happening (`[IL-59]`).

---

## Self-Review

**Spec coverage.** Every section of the design maps to a task: the predicate → Task 1; `/wrap-up` write site and the ordering rule and the brief's two parts → Task 2; `/demo` parent entry and parent closing → Task 3; `family:parent` and the `/tidy` `family-gate` scope → Task 4; the `acceptance-gap` consumer edit → Task 5; the trust population → Task 6. `/help` needs no change, as the design states, because Stage 4.7 already queries `--label demo:pending --state all`. Error handling appears as a Global Constraint rather than a task, since it is a property of every path rather than a deliverable. The design's two Open Questions are deliberately not tasks — raising `trust.js`'s `dispositioned >= 1` floor belongs to the earned-autonomy work, and the population measurement is a `gh` query to run before Task 6, noted there.

**Placeholder scan.** No `TBD`/`TODO`/"similar to Task N"/"add appropriate error handling". Every code step carries real code. The one deliberate placeholder is `#<record>` in commit messages, which the executing session fills with the actual record number — and it is `refs #N`, never `closes #N`, so a subagent echoing dispatch context cannot close the record early.

**Type consistency.** `familyGateState({leaves, parentLabels})` takes the same argument shape in Tasks 1, 4, and 6. `parseFamilyLeaves(body) → number[]` is consumed as an array of numbers in Tasks 2, 4, and 5. `hasParent` is checked as `=== true` in `needsBackstop` (Task 5) and `!== true` in `trustRows` (Task 6) — deliberately opposite predicates over the same explicit-boolean field, both treating an absent value as "not a family leaf". The four state strings are spelled identically everywhere.

**Known gap.** Tasks 2, 3, and 4 edit skill markdown, which has no unit-test cycle — their verification is a rendered read plus targeted greps, which is weaker than the code tasks' TDD loop. This is a property of the codebase, not a defect in the plan, but it means the whole-branch review in Task 7 is doing real work for those three tasks rather than being a formality.
