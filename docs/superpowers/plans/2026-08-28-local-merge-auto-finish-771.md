# Local-Merge Auto-Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `integration-model: local-merge` a no-prompt, auto-mode-aware branch-finish path — mirroring `_shared/pr-first-merge.md`'s role for `pr-first` — so `wrap-up/cleanup-procedures-execution.md` Section C never blocks on `/superpowers:finishing-a-development-branch`'s interactive menu when the run is not `interactive` mode.

**Architecture:** A new canonical file, `plugin/skills/_shared/local-merge-auto-finish.md`, states the precondition (`integration-model: local-merge` + `{run-dir}/config.yml` exists), the default policy (merge locally; never PR/discard/keep-as-is as a default), and the concrete git/log procedure — reusing the git mechanics `wrap-up/auto-merge-short-circuit.md` already proved for its own (grant-gated) local-merge branch. `cleanup-procedures-execution.md` Section C's local-merge branch routes through it before ever falling back to the unmodified interactive skill. `review-console.md`'s stale line and `auto-mode-contract.md`'s silences table get a small accuracy update, plus one `docs/skill-graph.md` edge.

**Tech Stack:** Markdown skill files (prose-as-implementation); `node --test` prose-conformance tests (regex/string assertions against the shipped `.md` text, the same convention `tests/pr-first-merge.test.js` and `tests/integration-model.test.js` already use).

**Spec:** GitHub issue #771 (materialized at `.claude-tweaks/pipelines/2026-08-28T005735-record-771/work/771-spec.md` in this worktree).

## Global Constraints

- Never modify `/superpowers:finishing-a-development-branch` itself (third-party skill).
- Every auto-mode outcome (merged or parked) MUST be logged to `decisions.md` via `bin/log-decision.js`, per `_shared/auto-decision-log.md`'s canonical entry schema — no hand-rolled appends.
- Any file that mentions `integration-model` must cite `_shared/integration-model.md` literally, or `tests/integration-model.test.js`'s consumer-conformance test fails.
- Genuine merge conflicts must never be auto-resolved — abort and park, per `_shared/auto-mode-contract.md`'s existing "Resolution of merge conflicts in worktree finishing" row.
- Interactive/standalone runs (no `config.yml` in the run dir) must be byte-for-byte unaffected — the original `/superpowers:finishing-a-development-branch` call stays intact as the fallback branch.
- `plugin/skills/wrap-up/cleanup-procedures-execution.md` is ~30.4KB against a 40KB skill-file ceiling — verify `wc -c` stays under budget after editing.

---

### Task 1: Create `_shared/local-merge-auto-finish.md` and pin it with a conformance test

**Files:**
- Create: `plugin/skills/_shared/local-merge-auto-finish.md`
- Test: `tests/local-merge-auto-finish.test.js`

**Interfaces:**
- Produces: the canonical file `plugin/skills/_shared/local-merge-auto-finish.md`, with these exact headings later tasks and tests key on: `## Precondition`, `## Default policy`, `## Procedure`, `## Interactive mode is unaffected`. Outcome vocabulary used throughout the plan: `merged` / `pending-review` (matching `_shared/pr-first-merge.md`'s own vocabulary table).

- [ ] **Step 1: Write the failing test**

```javascript
// tests/local-merge-auto-finish.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'plugin', 'skills', '_shared', 'local-merge-auto-finish.md');
const read = () => fs.readFileSync(FILE, 'utf8');

test('the file exists', () => {
  assert.ok(fs.existsSync(FILE), 'plugin/skills/_shared/local-merge-auto-finish.md must exist');
});

test('cites _shared/integration-model.md (required by the repo-wide integration-model consumer-conformance test)', () => {
  const text = read();
  assert.match(text, /_shared\/integration-model\.md/);
});

test('the precondition requires both local-merge AND config.yml presence — never one alone', () => {
  const text = read();
  const section = text.slice(text.indexOf('## Precondition'), text.indexOf('## Default policy'));
  assert.match(section, /integration-model.*resolves.*local-merge/is);
  assert.match(section, /config\.yml.*exists/is);
});

test('the default policy is merge-locally only — discard and keep-as-is are explicitly never defaults', () => {
  const text = read();
  const section = text.slice(text.indexOf('## Default policy'), text.indexOf('## Procedure'));
  assert.match(section, /\*\*Merge locally\*\*/);
  assert.match(section, /Discard is never a default/i);
  assert.match(section, /[Kk]eep-as-is.*never a default/is);
});

test('the procedure never resolves a merge conflict itself — aborts and parks instead', () => {
  const text = read();
  const section = text.slice(text.indexOf('## Procedure'), text.indexOf('## Interactive mode is unaffected'));
  assert.match(section, /never attempt(s)? (conflict )?resolution/i);
  assert.match(section, /pending-review/);
});

test('the procedure logs both outcomes via bin/log-decision.js, per the canonical entry schema', () => {
  const text = read();
  const section = text.slice(text.indexOf('## Procedure'), text.indexOf('## Interactive mode is unaffected'));
  assert.match(section, /log-decision\.js/);
  assert.match(section, /outcome: merged/);
  assert.match(section, /outcome: pending-review/);
});

test('interactive/standalone runs fall back to the unmodified finishing-a-development-branch handoff', () => {
  const text = read();
  const section = text.slice(text.indexOf('## Interactive mode is unaffected'));
  assert.match(section, /finishing-a-development-branch/);
  assert.match(section, /unmodified/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/local-merge-auto-finish.test.js`
Expected: FAIL — `plugin/skills/_shared/local-merge-auto-finish.md` does not exist yet (ENOENT on the first test, cascading).

- [ ] **Step 3: Write the file**

```markdown
# Local-Merge Auto-Finish — no-prompt branch-finish default

Canonical for the `local-merge` + non-interactive-mode no-prompt path through
`/superpowers:finishing-a-development-branch`'s merge/PR/discard/keep-as-is decision. Cited from
`wrap-up/cleanup-procedures-execution.md` Section C. Mirrors `_shared/pr-first-merge.md`'s role for
`pr-first` — the default policy that applies when no human is present to answer the menu, adapted
for a purely local merge (no forge, no PR to arm or wait on, no CI to poll).

## Why this exists

`pr-first` has had a no-prompt finish path since `_shared/pr-first-merge.md` (#411): a run under
`auto`/`hybrid`/`confirm` never blocks on a human choosing what to do with the PR. `local-merge` —
the permanent no-forge fallback (`_shared/integration-model.md`) — had no equivalent:
`cleanup-procedures-execution.md` Section C called `/superpowers:finishing-a-development-branch`
unconditionally, presenting its interactive menu and waiting for an answer regardless of mode. This
file closes that gap (#771).

## Precondition

`integration-model` resolves `local-merge` (`_shared/integration-model.md`) for this run AND
`{run-dir}/config.yml` exists. The second condition is the established proxy for "this run is not
`interactive`" — `flow/manifesto.md` writes `config.yml` in every mode except `interactive`, and
`wrap-up/SKILL.md`'s own `ceremony-profile` read already leans on the same absence-means-interactive
signal rather than inventing a new one.

Absent either condition — `integration-model` resolves `pr-first` instead, or this run's directory
carries no `config.yml` (a standalone or `interactive` run, per `flow/manifesto.md`) — this file does
not apply. Fall back to the citing file's own unmodified `/superpowers:finishing-a-development-branch`
handoff, exactly as before this file existed.

## Default policy

The default outcome is **Merge locally** (`finishing-a-development-branch`'s Option 1) — the only
sane default for a run with nobody present to answer a menu:

- **Push + Create PR is never a default** — `local-merge` is the no-forge fallback by definition
  (`_shared/integration-model.md`); there may be nothing to open a PR against.
- **Discard is never a default** — `finishing-a-development-branch`'s own rule holds regardless of
  mode: "Discarding the work happens only in response to your human partner explicitly asking for
  it." An unattended run has no human present to ask, so this path is simply never reached.
- **Keep-as-is is never a default** — it would leave the worktree, branch, and issue claim open with
  nothing finished, defeating the entire point of a hands-off run. A run that cannot merge cleanly
  parks instead (see Procedure below) — parking is distinct from keep-as-is: it is an explicit,
  logged failure state, not a silent no-op.

This must not silently skip the merge decision: every run through this file ends in an explicit,
logged outcome (`merged` or `pending-review`) — never a bare pass-through.

## Procedure

Reuses the git mechanics `wrap-up/auto-merge-short-circuit.md`'s own `integration-model: local-merge`
branch (lines 123-207 as of this writing) already proved for its grant-gated fast-lane path — this
file reaches the same mechanics through a different, ungated gate (the Precondition above, not a
`merge-check` verdict or an `auto:merge` label). Cite that section's rationale rather than duplicating
it; the steps below restate the commands so this auto branch never needs to invoke
`finishing-a-development-branch`'s own interactive Step 4 menu.

**Shell state does not survive between separate Bash calls** — read every value first and substitute
it literally into the next call; never carry it in a shell variable across calls (same warning
`auto-merge-short-circuit.md` states for its own two-call shape).

1. **Resolve the base/integration branch** — `_shared/integration-branch.md`'s canonical resolution
   (never asked; this is exactly the "confirm before merging" step `finishing-a-development-branch`
   asks a human for, replaced here by the same resolution `auto-merge-short-circuit.md`'s local-merge
   branch already uses):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values integration-branch
   ```

2. **Clear this run's worktree assignment before merging** — `close-run` first, so the merge landing
   in the main checkout isn't denied as a wrong-checkout commit (same as
   `auto-merge-short-circuit.md`'s local-merge branch):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run "$RUN_DIR"
   ```

3. **Read the worktree path and feature branch** — from `run-state.json`'s own `worktree` field
   (`record-worktree` stamped it there), never `$RUN_DIR` itself (`$RUN_DIR` sits inside the main
   checkout per `_shared/pipeline-run-dir.md`'s anchoring rule):

   ```bash
   node -e "console.log(require('$RUN_DIR/run-state.json').worktree)"   # -> {worktree-path}
   git -C "{worktree-path}" branch --show-current                       # -> {feature-branch}
   ```

4. **Merge, from the main checkout.** Verify the main checkout is actually on the resolved base
   branch first — a concurrent session may have switched it underfoot (`[IL-05]`):

   ```bash
   CURRENT=$(git branch --show-current)
   if [ "$CURRENT" != "{base-branch}" ]; then
     echo "Main checkout is on '$CURRENT', not '{base-branch}' — a concurrent session switched it. Abort, do not merge." >&2
     exit 1
   fi
   git merge --no-ff {feature-branch} -m "[auto-finish] {one-line summary}

   Fixes #{issue}"
   ```

   `--no-ff` guarantees a real merge commit exists to carry the `Fixes #{issue}` closing keyword —
   the same reason `cleanup-procedures-execution.md` Section C step 2's own carrier commit exists.
   That carrier commit already guarantees closure regardless, so this is redundant-but-safe, never
   harmful.

   **On a conflict** (`git merge` exits non-zero with conflict markers, or reports `CONFLICT`): run
   `git merge --abort` immediately. This is the one point in this procedure that must never attempt
   resolution — `_shared/auto-mode-contract.md`'s "does NOT silence" table states plainly:
   "Resolution of merge conflicts in worktree finishing | Conflict resolution requires intent the
   model cannot infer." Go to the **Park** branch below.

5. **Verify on the merged result** — run the project's verification command
   (`skills/test/verification.md`'s shared procedure) against the now-merged base branch.

   - **Green** → proceed to step 6.
   - **Red** → `git reset --hard ORIG_HEAD` (undo the local merge — nothing has been pushed, so this
     is fully recoverable) and go to the **Park** branch below. A merged-result test failure gets the
     identical treatment as a merge conflict: leave the worktree and feature branch exactly as they
     were, never force anything.

6. **Push** (from inside the worktree — naming the branch explicitly, since a bare `git push` from
   the worktree would push the *feature* branch, not the just-updated base branch; same reason
   `auto-merge-short-circuit.md`'s own local-merge push step states):

   ```bash
   git -C "{worktree-path}" push origin {base-branch}
   ```

7. **Log the merged outcome:**

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/log-decision.js" --run "$RUN_DIR" --status AUTO \
     --section "/wrap-up" --step "Section C (local-merge-auto-finish)" \
     --text "Merged {feature-branch} into {base-branch} (commit {sha}), pushed. [outcome: merged]" \
     --reversibility high
   ```

   Report outcome `merged` to the caller — `cleanup-procedures-execution.md` Section C proceeds to
   its step 4 (worktree removal) exactly as though `finishing-a-development-branch` itself had
   reported "Merged, PR created, or discarded."

**Park branch (conflict or failed merged-result verification):**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/log-decision.js" --run "$RUN_DIR" --status AUTO \
  --section "/wrap-up" --step "Section C (local-merge-auto-finish)" \
  --text "Local merge into {base-branch} failed ({conflict|failed verification}) — reverted, worktree and branch preserved. [outcome: pending-review]" \
  --reversibility high
```

Report outcome `pending-review` to the caller. The worktree, feature branch, and issue claim all
stay exactly as they were — a human resolves it the ordinary way (check out the branch, resolve or
investigate, re-run finish). Never `git merge --abort` twice, never retry automatically, never widen
scope to attempt a fix.

## Interactive mode is unaffected

This procedure never runs unless the Precondition above holds. A standalone or `interactive` run
reaches `cleanup-procedures-execution.md` Section C with no `config.yml` in its run directory and
falls straight through to the unmodified `/superpowers:finishing-a-development-branch` handoff,
exactly as before this file existed — Section C's own text states this fallback explicitly.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/local-merge-auto-finish.test.js`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/_shared/local-merge-auto-finish.md tests/local-merge-auto-finish.test.js
git commit -m "Add local-merge auto-finish no-prompt path — refs #771"
```

---

### Task 2: Route `cleanup-procedures-execution.md` Section C through the new file

**Files:**
- Modify: `plugin/skills/wrap-up/cleanup-procedures-execution.md` (Section C, `integration-model: local-merge` branch, the "Not yet decided" bullet)
- Test: `tests/local-merge-auto-finish.test.js` (append)

**Interfaces:**
- Consumes: `plugin/skills/_shared/local-merge-auto-finish.md` (Task 1) — its Precondition, Default policy, Procedure, and outcome vocabulary (`merged` / `pending-review`).

- [ ] **Step 1: Write the failing test**

Append to `tests/local-merge-auto-finish.test.js`:

```javascript
const EXEC = fs.readFileSync(
  path.join(ROOT, 'plugin', 'skills', 'wrap-up', 'cleanup-procedures-execution.md'),
  'utf8',
);

test('Section C local-merge branch checks the precondition before falling back to the interactive skill', () => {
  const localMergeStart = EXEC.indexOf('**`integration-model: local-merge`:**');
  assert.ok(localMergeStart > 0, 'the local-merge branch heading must exist');
  const nextSectionStart = EXEC.indexOf('3.5.', localMergeStart);
  const section = EXEC.slice(localMergeStart, nextSectionStart > 0 ? nextSectionStart : undefined);
  assert.match(section, /local-merge-auto-finish\.md/);
  assert.match(section, /config\.yml/);
});

test('Section C still preserves the original unmodified finishing-a-development-branch fallback', () => {
  const localMergeStart = EXEC.indexOf('**`integration-model: local-merge`:**');
  const nextSectionStart = EXEC.indexOf('3.5.', localMergeStart);
  const section = EXEC.slice(localMergeStart, nextSectionStart > 0 ? nextSectionStart : undefined);
  assert.match(section, /unmodified/i);
  assert.match(section, /finishing-a-development-branch/);
});

test('Section C maps the new pending-review outcome onto the same posture as kept-as-is (no teardown)', () => {
  const localMergeStart = EXEC.indexOf('**`integration-model: local-merge`:**');
  const nextSectionStart = EXEC.indexOf('3.5.', localMergeStart);
  const section = EXEC.slice(localMergeStart, nextSectionStart > 0 ? nextSectionStart : undefined);
  assert.match(section, /pending-review/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/local-merge-auto-finish.test.js`
Expected: FAIL on the three new tests — the current Section C text has no `local-merge-auto-finish.md` citation and no `pending-review` handling.

- [ ] **Step 3: Edit `cleanup-procedures-execution.md`**

Read the file's current `**`integration-model: local-merge`:**` bullet first (Section C, around the
line following the `pr-first` skip-step-3 paragraph) and replace it with:

```markdown
   **`integration-model: local-merge`:** verify the feature branch reached an outcome (merged, PR
   created, discarded, or explicitly kept as-is) via `/superpowers:finishing-a-development-branch`:
   - **Already completed (merged, PR created, or discarded)** → proceed to step 4.
   - **Not yet decided** → check `_shared/local-merge-auto-finish.md`'s Precondition
     (`integration-model` resolves `local-merge` AND `{run-dir}/config.yml` exists — see
     `_shared/integration-model.md` for the resolution and `flow/manifesto.md` for why
     `config.yml`'s presence is the "not interactive" proxy). When it holds, read and follow that
     file's Procedure instead of invoking `/superpowers:finishing-a-development-branch` — it never
     presents that skill's interactive menu, and every outcome it produces is already logged per
     `_shared/auto-decision-log.md`'s canonical schema. Map its outcome onto this branch structure:
     - **`merged`** → proceed to step 4, same as "Merged, PR created, or discarded" above.
     - **`pending-review`** → a merge conflict or a failed merged-result verification — do NOT
       proceed to step 4. Skip steps 3.5, 3.6, 4, and 5 below entirely for this spec (do NOT close
       the run, do NOT remove the worktree, do NOT delete the branch) and skip Section E (issue
       claim release) — same posture as "Kept as-is" below, since the worktree and branch are
       exactly as `local-merge-auto-finish.md` left them: unmerged, unmodified, awaiting a human.
       Note in the wrap-up summary that this spec parked pending resolution of a merge conflict or
       failed post-merge verification, distinct from a deliberate keep-as-is.

     When the Precondition does not hold (an `interactive` or standalone run — no `config.yml` in
     this run's directory), run `/superpowers:finishing-a-development-branch` now, unmodified,
     exactly as before this file existed (do not stop and ask the user to run it separately).
     Present the merge/PR/discard/keep-as-is options as the skill normally would — step 2's carrier
     commit already guarantees closure regardless of which option is chosen, so this skill's own
     literal git commands need no adaptation. Then branch on the outcome:
     - **Merged, PR created, or discarded** → proceed to step 4.
     - **Kept as-is** → the user is deliberately continuing work in this worktree. Skip steps 3.5,
       3.6, 4, and 5 below entirely for this spec (do NOT close the run, do NOT remove the worktree,
       do NOT delete the branch) and skip Section E (issue claim release) — the claim stays held
       since the work is still in progress; releasing it here would let another agent claim an issue
       that's still mid-work. Note in the wrap-up summary that this spec's worktree/branch/claim
       cleanup is deliberately incomplete, pending a future finish decision (a later re-run of
       `/superpowers:finishing-a-development-branch`, directly or via `/claude-tweaks:wrap-up`).
```

Preserve every other line of Section C unchanged (the `current-branch` mode paragraph immediately
below this bullet, and everything from step 3.5 onward).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/local-merge-auto-finish.test.js`
Expected: PASS (10/10)

- [ ] **Step 5: Check the file-size ceiling**

Run: `wc -c plugin/skills/wrap-up/cleanup-procedures-execution.md`
Expected: comfortably under 40960 bytes (was ~30394; the added text is roughly 1.8KB).

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/wrap-up/cleanup-procedures-execution.md tests/local-merge-auto-finish.test.js
git commit -m "Route Section C's local-merge branch through the auto-finish no-prompt path — refs #771"
```

---

### Task 3: Fix `review-console.md`'s stale line and add the `auto-mode-contract.md` silences row

**Files:**
- Modify: `plugin/skills/wrap-up/review-console.md` (line ~109, the cleanup-actions step)
- Modify: `plugin/skills/_shared/auto-mode-contract.md` ("What `auto` silences" table)
- Test: `tests/local-merge-auto-finish.test.js` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/local-merge-auto-finish.test.js`:

```javascript
const CONSOLE = fs.readFileSync(
  path.join(ROOT, 'plugin', 'skills', 'wrap-up', 'review-console.md'),
  'utf8',
);
const CONTRACT = fs.readFileSync(
  path.join(ROOT, 'plugin', 'skills', '_shared', 'auto-mode-contract.md'),
  'utf8',
);

test('review-console.md no longer claims local-merge cleanup runs "unchanged" — it cites the auto-finish path', () => {
  assert.doesNotMatch(CONSOLE, /Under `local-merge`, cleanup runs unchanged/);
  assert.match(CONSOLE, /local-merge-auto-finish\.md/);
});

test('auto-mode-contract.md\'s "What auto silences" table lists the local-merge finish decision', () => {
  const start = CONTRACT.indexOf('## What `auto` silences');
  const end = CONTRACT.indexOf('## What `auto` does NOT silence');
  const section = CONTRACT.slice(start, end);
  assert.match(section, /local-merge-auto-finish\.md/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/local-merge-auto-finish.test.js`
Expected: FAIL on both new tests.

- [ ] **Step 3: Edit `review-console.md`**

In the "On approval (option 1)" numbered list, item 6, replace the sentence:

`Under \`local-merge\`, cleanup runs unchanged (Section C's own \`/superpowers:finishing-a-development-branch\` handoff)`

with:

`Under \`local-merge\`, cleanup routes through \`_shared/local-merge-auto-finish.md\`'s no-prompt path whenever this run's \`config.yml\` exists (every mode except \`interactive\`) — no second prompt on top of this console's own approval; an \`interactive\`/standalone run (no \`config.yml\`) still gets Section C's original \`/superpowers:finishing-a-development-branch\` handoff, unchanged.`

- [ ] **Step 4: Edit `auto-mode-contract.md`**

In the "What `auto` silences" table, add a new row directly after the "Merge authorization lever"
row (mirroring that row's shape):

```markdown
| Local-merge finish decision (`wrap-up/cleanup-procedures-execution.md` Section C) | `/superpowers:finishing-a-development-branch`'s interactive merge/PR/discard/keep-as-is menu | Routes through `_shared/local-merge-auto-finish.md` instead whenever this run's `config.yml` exists (every mode except `interactive`) — defaults to merge locally, logs the outcome, and parks (never auto-resolves) on a genuine merge conflict or failed merged-result verification, per that file's own Precondition and Default policy |
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test tests/local-merge-auto-finish.test.js`
Expected: PASS (12/12)

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/wrap-up/review-console.md plugin/skills/_shared/auto-mode-contract.md tests/local-merge-auto-finish.test.js
git commit -m "Fix stale local-merge cleanup text and list the auto-finish decision in the silences table — refs #771"
```

---

### Task 4: Add the `docs/skill-graph.md` edge

**Files:**
- Modify: `docs/skill-graph.md`
- Test: `tests/local-merge-auto-finish.test.js` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/local-merge-auto-finish.test.js`:

```javascript
const SKILL_GRAPH = fs.readFileSync(path.join(ROOT, 'docs', 'skill-graph.md'), 'utf8');

test('skill-graph.md documents the new local-merge-auto-finish.md edge(s)', () => {
  assert.match(SKILL_GRAPH, /local-merge-auto-finish\.md/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/local-merge-auto-finish.test.js`
Expected: FAIL — `docs/skill-graph.md` does not mention the new file yet.

- [ ] **Step 3: Add the edge**

Read `docs/skill-graph.md`'s existing entries for `_shared/pr-first-merge.md` (its citing
relationships) to match the file's exact existing format/section, then add the analogous entries
for `_shared/local-merge-auto-finish.md`: cited by `wrap-up/cleanup-procedures-execution.md`
(Section C) and `wrap-up/review-console.md` (cleanup-actions step), and citing
`_shared/integration-model.md`, `_shared/integration-branch.md`, and
`wrap-up/auto-merge-short-circuit.md` (mechanics reuse).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/local-merge-auto-finish.test.js`
Expected: PASS (13/13)

- [ ] **Step 5: Commit**

```bash
git add docs/skill-graph.md tests/local-merge-auto-finish.test.js
git commit -m "Add skill-graph edge for local-merge-auto-finish.md — refs #771"
```

---

### Task 5: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the new suite in isolation**

Run: `node --test tests/local-merge-auto-finish.test.js`
Expected: PASS (13/13)

- [ ] **Step 2: Run the repo-wide conformance tests this change touches**

Run: `node --test tests/integration-model.test.js tests/pr-first-merge.test.js`
Expected: PASS — confirms the new file's `_shared/integration-model.md` citation satisfies the
consumer-conformance test, and that `pr-first-merge.md`'s own tests are untouched.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS, no regressions.

- [ ] **Step 4: Final file-size check**

Run: `wc -c plugin/skills/wrap-up/cleanup-procedures-execution.md plugin/skills/wrap-up/review-console.md plugin/skills/_shared/auto-mode-contract.md plugin/skills/_shared/local-merge-auto-finish.md`
Expected: every file under 40960 bytes.
