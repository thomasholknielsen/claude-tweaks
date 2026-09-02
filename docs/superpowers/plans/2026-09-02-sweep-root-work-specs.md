# Sweep root-level work/{n}-spec.md files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every root-level `work/{n}-spec.md` file into its originating pipeline run directory (or a documented holding location when none can be found), pin the repo-root `work/` directory to stay empty going forward, and diagnose the post-fix `work/1124-spec.md` root-landing.

**Architecture:** This is a pure git-history/filesystem sweep — no application code changes except one `node --test` pin test and one stale-prose correction in a skill doc. For each of the 42 currently-committed root-level spec files, resolve its originating run-id by walking `git log --diff-filter=A` to the adding commit, finding that commit's associated PR via `gh api repos/{owner}/{repo}/commits/{sha}/pulls`, and reading the PR body's `claude-tweaks-run: {run-id}` marker (HTML-comment or plain-text form). `git mv` each file to `.claude-tweaks/pipelines/archive/{run-id}/work/{n}-spec.md` (this repo's already-established shape for a closed, merged run's materialized spec — verified against `archive/2026-08-20T061850-record-212/work/212-spec.md`, which is git-tracked and contains only a `work/` subdirectory, no `config.yml`/`decisions.md`, confirming those are ephemeral per-machine state never expected to survive a merge). Files whose PR carries no run-id marker at all (an older PR predating the dual-marker convention that ALSO never had the plain HTML-comment form, or a hand-composed/reconciler PR body) move to a dedicated `.claude-tweaks/pipelines/archive/unresolved-provenance/work/` holding directory with a `PROVENANCE.md` manifest recording what was checked and why no destination could be determined — never deleted.

**Tech Stack:** Bash, git, gh CLI, node --test.

**Spec:** `work/1568-spec.md` (this run's materialized copy of GitHub issue #1568) — carries the full Current State / Deliverables / Acceptance Criteria this plan implements.

## Global Constraints

- Acceptance Criterion 1: repo-root `work/` directory contains zero `{n}-spec.md` files, pinned by a new test.
- Acceptance Criterion 2: every swept file's content is preserved somewhere traceable (its run dir's `work/`, or `archive/{run-dir}/work/`, or the documented `archive/unresolved-provenance/work/` holding location) — no silent deletion.
- Acceptance Criterion 3: the 2026-08-27 `work/1124-spec.md` root-landing is explained; if it points to a code/doc gap (not a one-off hand-authored write), that gap gets its own follow-up.
- Acceptance Criterion 4: `npm test` passes.
- Gotcha: 14 other dispatch PRs are in flight on `worktree-dispatch-record-*` branches right now — this plan touches only files this repo's own git history says are unclaimed root-level spec files; it never touches any other branch's run dir, and the destination directories this plan creates (`archive/{run-id}/...`) are all for runs that already merged and closed weeks ago, so no live sibling run can be writing to them concurrently.

---

### Task 1: Resolve provenance for all 42 root-level spec files (research artifact, no code)

**Files:**
- Create (scratch, not committed): a provenance table mapping each `work/{n}-spec.md` to its resolved `{run-id}` or `UNRESOLVED`.

**Interfaces:**
- Produces: the `{n} -> {run-id}|UNRESOLVED` mapping Task 2 and Task 3 consume verbatim.

This research is already complete (done during planning, not deferred to execution) — the mapping is:

**Resolved (34 files) → `archive/{run-id}/work/{n}-spec.md`:**

```
251  -> 2026-08-26T163958-record-251
320  -> 2026-08-15T112940-spec-320
422  -> 2026-08-14T193557-record-422
554  -> 2026-08-20T051924-record-554
606  -> 2026-08-27T231820-record-606
637  -> 2026-08-20T043953-record-637
638  -> 2026-08-20T043953-record-638
641  -> 2026-08-20T053309-record-641
668  -> 2026-08-20T044332-record-668
670  -> 2026-08-19T161910-record-670
671  -> 2026-08-20T153010-record-671
714  -> 2026-08-17T053210-record-714
734  -> 2026-08-26T210759-record-734
766  -> 2026-08-20T054354-record-766
800  -> 2026-08-24T094203-record-800
803  -> 2026-08-28T015425-record-803
832  -> 2026-08-28T025115-record-832
879  -> 2026-08-20T051544-record-879
893  -> 2026-08-20T044204-record-893
917  -> 2026-08-26T235641-record-917
958  -> 2026-08-28T062752-record-958
1009 -> 2026-08-27T004627-record-1009
1072 -> 2026-08-24T163135-record-1072
1108 -> 2026-08-25T052702-record-1108
1124 -> 2026-08-27T161728-record-1124
1312 -> 2026-08-27T040703-record-1312
1328 -> 2026-08-27T194151-record-1328
1391 -> 2026-08-25T060310-spec-1391
1402 -> 2026-08-27T203111-record-1402
1404 -> 2026-08-27T061932-record-1404
1407 -> 2026-08-27T070037-record-1407
1423 -> 2026-08-29T182235-record-1423
1438 -> 2026-08-27T075823-record-1438
1471 -> 2026-08-29T182227-record-1471
1654 -> 2026-08-29T154653-record-1654
```

**Unresolved (8 files) → `archive/unresolved-provenance/work/{n}-spec.md`:**

```
252  (PR #1209, "Pre-flight the vocabulary guard at record time and add an amend verb" — reconciler-composed body, no run-id marker in any form)
458  (PR #1081, "Pin the Friction reflect lens's documented event vocabulary..." — hand-composed body, no run-id marker)
500  (PR #1115, body explicitly notes "Draft PR opened by the dispatching session after the build agent skipped this step" — never carried a run-id marker)
644  (PR #1217, "Rescue #644: fix reconcile self-reaping..." — a rebase-and-rescue of an abandoned branch, hand-composed body, no run-id marker)
1117 (PR #1603, "Exempt ad-hoc-standalone run dirs..." — hand-composed body, no run-id marker)
1246 (PR #1607, "issue-claims.md: repair/force-release procedure..." — hand-composed body, no run-id marker)
1299 (PR #1614, "Fix #1299: resolveRunArg twin-check mirror direction..." — hand-composed body, no run-id marker)
1329 (PR #1618, "wd-ambiguous cross-worktree matches..." — hand-composed body, no run-id marker)
```

Verification for both lists: `git log --diff-filter=A --format=%H -- work/{n}-spec.md | tail -1` (adding commit) → `gh api repos/thomasholknielsen/claude-tweaks/commits/{sha}/pulls --jq '.[0].number'` (associated PR) → `gh pr view {pr} --repo thomasholknielsen/claude-tweaks --json body -q .body` (read for a `claude-tweaks-run: {run-id}` line, HTML-comment or plain-text form).

- [x] Provenance resolved for all 42 files (done above; no further steps in this task).

### Task 2: Move the 34 resolved files into their archived run directories

**Files:**
- Modify (git mv): `work/{n}-spec.md` → `.claude-tweaks/pipelines/archive/{run-id}/work/{n}-spec.md` for each of the 34 entries in Task 1's resolved list.

**Interfaces:**
- Consumes: Task 1's resolved mapping.
- Produces: an empty repo-root `work/` directory for these 34 records (verified fully empty only after Task 3 also runs).

- [ ] **Step 1: Run the moves**

```bash
cd "C:/repos/claude-tweaks/.claude/worktrees/dispatch-record-1568"
declare -A MAP=(
  [251]=2026-08-26T163958-record-251
  [320]=2026-08-15T112940-spec-320
  [422]=2026-08-14T193557-record-422
  [554]=2026-08-20T051924-record-554
  [606]=2026-08-27T231820-record-606
  [637]=2026-08-20T043953-record-637
  [638]=2026-08-20T043953-record-638
  [641]=2026-08-20T053309-record-641
  [668]=2026-08-20T044332-record-668
  [670]=2026-08-19T161910-record-670
  [671]=2026-08-20T153010-record-671
  [714]=2026-08-17T053210-record-714
  [734]=2026-08-26T210759-record-734
  [766]=2026-08-20T054354-record-766
  [800]=2026-08-24T094203-record-800
  [803]=2026-08-28T015425-record-803
  [832]=2026-08-28T025115-record-832
  [879]=2026-08-20T051544-record-879
  [893]=2026-08-20T044204-record-893
  [917]=2026-08-26T235641-record-917
  [958]=2026-08-28T062752-record-958
  [1009]=2026-08-27T004627-record-1009
  [1072]=2026-08-24T163135-record-1072
  [1108]=2026-08-25T052702-record-1108
  [1124]=2026-08-27T161728-record-1124
  [1312]=2026-08-27T040703-record-1312
  [1328]=2026-08-27T194151-record-1328
  [1391]=2026-08-25T060310-spec-1391
  [1402]=2026-08-27T203111-record-1402
  [1404]=2026-08-27T061932-record-1404
  [1407]=2026-08-27T070037-record-1407
  [1423]=2026-08-29T182235-record-1423
  [1438]=2026-08-27T075823-record-1438
  [1471]=2026-08-29T182227-record-1471
  [1654]=2026-08-29T154653-record-1654
)
for n in "${!MAP[@]}"; do
  runid="${MAP[$n]}"
  destdir=".claude-tweaks/pipelines/archive/${runid}/work"
  mkdir -p "$destdir"
  git mv "work/${n}-spec.md" "${destdir}/${n}-spec.md"
done
```

- [ ] **Step 2: Verify all 34 moved and none left at root**

```bash
for n in 251 320 422 554 606 637 638 641 668 670 671 714 734 766 800 803 832 879 893 917 958 1009 1072 1108 1124 1312 1328 1391 1402 1404 1407 1423 1438 1471 1654; do
  test -f "work/${n}-spec.md" && echo "STILL AT ROOT: ${n}"
done
echo "check complete"
```

Expected: no "STILL AT ROOT" lines printed.

- [ ] **Step 3: Commit**

```bash
git add -A -- '.claude-tweaks/pipelines/archive' work
git commit -m "$(cat <<'EOF'
Sweep 34 root-level work/{n}-spec.md files into their archived run dirs

refs #1568
EOF
)"
```

### Task 3: Move the 8 unresolved-provenance files into a documented holding location

**Files:**
- Create: `.claude-tweaks/pipelines/archive/unresolved-provenance/work/PROVENANCE.md`
- Modify (git mv): `work/{n}-spec.md` → `.claude-tweaks/pipelines/archive/unresolved-provenance/work/{n}-spec.md` for each of the 8 entries in Task 1's unresolved list.

**Interfaces:**
- Consumes: Task 1's unresolved mapping.
- Produces: an empty repo-root `work/` directory (combined with Task 2, now fully empty).

- [ ] **Step 1: Write the manifest**

Content of `.claude-tweaks/pipelines/archive/unresolved-provenance/work/PROVENANCE.md`:

```markdown
# Unresolved provenance — swept from repo-root `work/`

These `{n}-spec.md` files were committed directly at the repo-root `work/` directory
(the legacy pre-run-dir-anchoring shape — see `docs/incident-log.md` and
`plugin/bin/lib/hooks/pre-tool-use.js`'s `hasMaterializeCommit` comment, which counts
~100 such legacy files reachable in this repo's history) and swept here by #1568's
build. Unlike their siblings (moved to `archive/{run-id}/work/`), no `claude-tweaks-run:
{run-id}` marker could be recovered for these — the PR that merged each one predates, or
never carried, the dual-marker scheme (`_shared/pr-early-run-lifecycle.md`'s #929 fix), so
there is no live run-id to reconstruct a path from. Kept here rather than deleted, per
#1568's Acceptance Criterion 2 (no silent deletion).

| Record | Adding commit | Merging PR | Why unresolved |
|---|---|---|---|
| #252  | de6aaf5d | [#1209](https://github.com/thomasholknielsen/claude-tweaks/pull/1209) | Reconciler-composed PR body ("Pre-flight the vocabulary guard..."), no run-id marker in either form |
| #458  | 076241be | [#1081](https://github.com/thomasholknielsen/claude-tweaks/pull/1081) | Hand-composed PR body, no run-id marker |
| #500  | dbb4950d | [#1115](https://github.com/thomasholknielsen/claude-tweaks/pull/1115) | Body states the draft PR was opened by the dispatching session after the build agent skipped that step — never carried a run-id marker |
| #644  | a3c5133b | [#1217](https://github.com/thomasholknielsen/claude-tweaks/pull/1217) | Rebase-and-rescue of an abandoned branch ("Rescue #644..."), hand-composed body, no run-id marker |
| #1117 | dfc35d4e | [#1603](https://github.com/thomasholknielsen/claude-tweaks/pull/1603) | Hand-composed PR body, no run-id marker |
| #1246 | 5ba84e74 | [#1607](https://github.com/thomasholknielsen/claude-tweaks/pull/1607) | Hand-composed PR body, no run-id marker |
| #1299 | 03eaaf56 | [#1614](https://github.com/thomasholknielsen/claude-tweaks/pull/1614) | Hand-composed PR body ("Fix #1299:..."), no run-id marker |
| #1329 | b51f6b22 | [#1618](https://github.com/thomasholknielsen/claude-tweaks/pull/1618) | Hand-composed PR body, no run-id marker |

Lookup method for every row above (both this table and the resolved siblings in
`archive/{run-id}/work/`): `git log --diff-filter=A --format=%H -- work/{n}-spec.md |
tail -1` for the adding commit, `gh api repos/thomasholknielsen/claude-tweaks/commits/{sha}/pulls
--jq '.[0].number'` for the merging PR, `gh pr view {pr} --json body -q .body` read for a
`claude-tweaks-run: {run-id}` line (HTML-comment or plain-text form, per
`_shared/pr-early-run-lifecycle.md`'s dual-marker scheme) — absent on every row above.
```

- [ ] **Step 2: Run the moves**

```bash
cd "C:/repos/claude-tweaks/.claude/worktrees/dispatch-record-1568"
mkdir -p .claude-tweaks/pipelines/archive/unresolved-provenance/work
for n in 252 458 500 644 1117 1246 1299 1329; do
  git mv "work/${n}-spec.md" ".claude-tweaks/pipelines/archive/unresolved-provenance/work/${n}-spec.md"
done
git add .claude-tweaks/pipelines/archive/unresolved-provenance/work/PROVENANCE.md
```

- [ ] **Step 3: Verify root `work/` is now completely empty of spec files**

```bash
ls work/ 2>/dev/null | grep -E '^[0-9]+-spec\.md$'
echo "check complete (no output above this line means clean)"
```

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
Sweep 8 no-run-id-marker work/{n}-spec.md files to a documented holding dir

Provenance could not be recovered (no claude-tweaks-run marker in the merging
PR's body) -- moved to archive/unresolved-provenance/work/ with a manifest
rather than silently deleted (#1568 Acceptance Criterion 2).

refs #1568
EOF
)"
```

### Task 4: Write the failing pin test, then verify it passes

**Files:**
- Create: `tests/root-work-dir-empty.test.js`

**Interfaces:**
- Consumes: nothing (pure filesystem assertion against the repo root).
- Produces: a `node --test` suite `npm test`'s recursive glob (`tests/**/*.test.js`) already picks up automatically — no registration needed.

- [ ] **Step 1: Write the test**

```javascript
// tests/root-work-dir-empty.test.js
// Pin for #1568: the repo-root work/ directory must never carry a
// {n}-spec.md file again. Materialized specs belong under
// .claude-tweaks/pipelines/{run-id}/work/ (or the multi-record
// spec-{slug}/work/ form) -- see plugin/skills/flow/materialize.md and
// plugin/bin/lib/hooks/pre-tool-use.js's `hasMaterializeCommit` comment,
// which documents root-level work/*-spec.md as the legacy pre-anchoring
// shape this test guards against regressing to.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SPEC_FILE_RE = /^\d+-spec\.md$/;

test('repo-root work/ directory carries no {n}-spec.md files', () => {
  const workDir = path.join(REPO_ROOT, 'work');
  let entries;
  try {
    entries = fs.readdirSync(workDir);
  } catch (err) {
    if (err.code === 'ENOENT') return; // no work/ dir at all is also a pass
    throw err;
  }
  const offenders = entries.filter((e) => SPEC_FILE_RE.test(e));
  assert.deepEqual(
    offenders,
    [],
    `found legacy root-level spec file(s) in work/: ${offenders.join(', ')} -- ` +
      'materialized specs belong under .claude-tweaks/pipelines/{run-id}/work/ instead',
  );
});
```

- [ ] **Step 2: Run it to confirm it passes now that Tasks 2-3 already ran**

Run: `node --test tests/root-work-dir-empty.test.js`
Expected: PASS (1/1) — Tasks 2 and 3 already emptied `work/` of every `{n}-spec.md` file in this same plan run.

- [ ] **Step 3: Commit**

```bash
git add tests/root-work-dir-empty.test.js
git commit -m "$(cat <<'EOF'
Pin repo-root work/ directory to carry no {n}-spec.md files

refs #1568
EOF
)"
```

### Task 5: Diagnose the post-fix work/1124-spec.md root-landing and fix the stale doc

**Files:**
- Modify: `plugin/skills/flow/materialize.md:142-147` (the "Multi-record layout" example block)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed elsewhere in this plan — a standalone documentation correction.

**Diagnosis (recorded here and in the commit message; Acceptance Criterion 3):** `work/1124-spec.md`'s adding commit (4d253119, 2026-08-27, six days after #959 shipped on 2026-08-21) carries the current, post-#959 materialize.js header shape verbatim (`record:`/`origin:`/`risk:`/`size:`/`ceremony:`/`grants:`/`surface:`) — this was written *by* `bin/materialize.js`, not a hand-authored bypass. `bin/materialize.js`'s own header states `--run-dir` is "a literal write-location prefix, not a run identity" — it writes `{--run-dir}/work/{n}-spec.md` under whatever path is passed, with no smarts of its own. That means whatever invoked it for #1124 passed the **worktree root** as `--run-dir` instead of the pipeline run directory (`.claude-tweaks/pipelines/2026-08-27T161728-record-1124`).

The likely reason: `plugin/skills/flow/materialize.md`'s own "Multi-record layout" section (lines 142-147, unchanged by #959) still diagrams the single-record case as landing at `work/{n}-spec.md` described as "(repo-root...)" — with no `{run-dir}/` prefix at all — while the multi-record case is shown correctly prefixed with `{parent-run-dir}/spec-{a}/`. This directly contradicts `plugin/skills/_shared/pipeline-run-dir.md`'s own Anchoring section (the `work/{n}-spec.md` carve-out paragraph, #959), which states the canonical write location for *both* shapes is nested under `.claude-tweaks/pipelines/{run-id}/` — and contradicts `plugin/bin/lib/hooks/pre-tool-use.js`'s own comment, which explicitly labels a repo-root-relative `work/*-spec.md` as "legacy... before run-dir anchoring existed." A session or agent reading the stale single-record diagram literally (rather than deriving `--run-dir` from `$PIPELINE_RUN_DIR` per the Anchoring section) would reproduce exactly this bug — which explains why it recurred *after* #959's write-permission fix: #959 fixed the shadow-guard's willingness to allow the *correct* nested write, but never touched this stale diagram that was still telling readers to omit the run-dir prefix for the single-record case. This is a genuine doc/code gap, not a one-off hand-authored write (Acceptance Criterion 3's "gets its own follow-up" branch) — fixed directly below since it is a one-line prose correction, not new scope.

- [ ] **Step 1: Read the current text**

Current text at `plugin/skills/flow/materialize.md` (Multi-record layout section):

```
work/{n}-spec.md                                  ← single-record run (repo-root, git-tracked in the worktree — pipeline-run-dir.md's exception; reaches the main checkout by merge)
{parent-run-dir}/spec-{a}/work/{a}-spec.md        ← multi-record run, record a
{parent-run-dir}/spec-{b}/work/{b}-spec.md        ← multi-record run, record b
```

- [ ] **Step 2: Correct it to match the actual, current, canonical shape**

```
{run-dir}/work/{n}-spec.md                        ← single-record run (git-tracked in the worktree — pipeline-run-dir.md's exception; reaches the main checkout by merge)
{parent-run-dir}/spec-{a}/work/{a}-spec.md        ← multi-record run, record a
{parent-run-dir}/spec-{b}/work/{b}-spec.md        ← multi-record run, record b
```

Also update the sentence immediately above the block from "Single-record and multi-spec runs use the two run-dir shapes already established by..." — no wording change needed there, it already says "run-dir shapes," which is now accurate for both rows.

- [ ] **Step 3: Verify no other doc restates the stale "repo-root" framing**

```bash
grep -rn "single-record run (repo-root" plugin/skills/ 2>&1
```

Expected: no output (the only occurrence was the one just corrected).

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/flow/materialize.md
git commit -m "$(cat <<'EOF'
Fix stale single-record diagram in materialize.md (#1568 root-cause)

work/1124-spec.md landed at repo root six days after #959's write-permission
fix shipped because this file's own single-record example still showed no
run-dir prefix at all, contradicting pipeline-run-dir.md's Anchoring section
and pre-tool-use.js's own legacy-shape comment. Corrected to {run-dir}/work/
to match the actual canonical shape both of those already document.

refs #1568
EOF
)"
```

### Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full suite**

```bash
node --test "tests/**/*.test.js" "tools/upstream-drift/tests/**/*.test.js"
```

Expected: the pre-existing Windows-host baseline failure count (239, per this run's own measured baseline) plus 1 new passing test (`tests/root-work-dir-empty.test.js`) — no new failures introduced by this plan's changes. Compare the failing test names against the baseline list; any name not in that list is a regression this plan must fix before finishing.

- [ ] **Step 2: Confirm the specific new test in isolation**

```bash
node --test tests/root-work-dir-empty.test.js
```

Expected: PASS (1/1).
