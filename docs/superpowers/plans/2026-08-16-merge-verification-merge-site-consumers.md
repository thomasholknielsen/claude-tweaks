# merge-verification: Merge-Site Consumers Gate on CI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the plugin's merge sites act on the resolved `merge-verification` value (`merge-when-green | wait | off`): one canonical merge-gate procedure stated once in `_shared`, applied by every `pr-first` merge site, with a red path that parks instead of merging — the unit that would have prevented PR #540's red merge.

**Architecture:** Prose-contract change. Since #559 shipped, `merge-verification` resolves via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values merge-verification`. Every `pr-first` merge site already delegates the merge itself to `_shared/pr-first-merge.md` (#411 — `dispatch/settle-and-merge.md`'s Auto-merge gate, `flow/worktree-merge.md`'s reconciliation, `wrap-up/review-console.md`'s short-circuit). The gate is therefore inserted **inside `_shared/pr-first-merge.md`, as a new Step 2.5 between "Mark the PR ready" and "Attempt auto-merge"**, so all three sites apply it by construction; its degrade-table row lands in `_shared/pr-early-run-lifecycle.md` (the file that owns the gh-absent degrade table), and the resume-to-merge confirmation gets a one-shot read-then-decide rule. This is a deliberate, recorded deviation from the spec's Key Files (which named `pr-early-run-lifecycle.md` for the section — written before `pr-first-merge.md` existed); the spec's *intent* ("state once in `_shared`; dispatch/flow/resume cite and apply") is met more directly this way. The AC1 grep therefore excludes `pr-first-merge.md` instead of `pr-early-run-lifecycle.md`.

**Tech Stack:** Markdown skill files; `gh` CLI signatures captured empirically (Task 0); one new `node --test` conformance suite pinning the single-statement rule and the citations.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T101528-spec-559-560/spec-560/work/560-spec.md`

## Global Constraints

- **Classification is state-read-first, never stderr-parsing-first:** before any merge attempt, `gh pr view {n} --json state,mergeStateStatus,statusCheckRollup`; a failing check in the rollup → red path immediately.
- Per resolved value: `merge-when-green` → attempt `gh pr merge --auto`; arming rejected (auto-merge unavailable, Task 0 signature (a)) → **degrade to `wait`** (never to an immediate merge — that is exactly the #540 race); `wait` → bounded `gh pr checks` watch, **15 minutes fixed** (not a policy key), red at any minute → red path immediately, `checks-pending-timeout` reserved strictly for checks still running at the bound; on green re-read state (`gh pr view --json state,mergeStateStatus,headRefOid`) and merge with the run's configured method — a new push or a closed PR re-enters the gate or reports, never merges blind; `off` → today's behavior unchanged.
- **Red path:** never merge; park — `bot:blocked` on the work-record issue(s) naming the failing check; one `AUTO` decision-log entry per `_shared/auto-decision-log.md`; `run-state.json` untouched; outcome `pending-review`. Timeout-still-pending → same parking, reason `checks-pending-timeout`.
- **Forge-cooperation path:** merge rejected by org-owned required checks → report the forge as enforcing a stricter policy, arm `--auto`, never retry-loop, never suggest bypass.
- **gh-absent:** lever unenforceable → proceed as `off`, disclosed at **warn** tier in the run summary (a row in `pr-early-run-lifecycle.md`'s degrade table).
- **Resume-to-merge** (`dispatch/SKILL.md`'s "Confirm before resuming"): one-shot read-then-decide — green → proceed; red → surface in the existing confirmation; pending → arm `--auto` where available, else offer the choice in that same confirmation; resume never runs the 15-minute blocking watch.
- Parking is a HARD-GATE-class stop written as park-and-surface — never an `AskUserQuestion` mid-pipeline.
- **Single statement:** the procedure appears exactly once (`_shared/pr-first-merge.md`); everywhere else names the value/reason and cites the section. `grep -ri "merge-when-green" skills/ | grep -v pr-first-merge` returns citation lines only (the #559 files `_shared/policy-schema.md`, `flow/manifesto.md`, `help/policy.md` name the value as a lever, not the procedure); same for `checks-pending-timeout`.
- Any text naming `integration-model` cites `skills/_shared/integration-model.md`; skill refs in actionable text are `/claude-tweaks:{skill}`; a default-branch resolver token needs `_shared/integration-branch.md`.
- **Sizes:** `skills/dispatch/SKILL.md` is 39,006 bytes (ceiling 40,000) — its edit must be a short pointer (≤ ~600 bytes); `wc -c` every edited skill file, each < 40,000. `_shared/pr-first-merge.md` (10,689) and `dispatch/settle-and-merge.md` (27,972) have room.
- Task 0's captured signatures are recorded **verbatim** (literal stderr/exit codes); anything not reproducible on this repo (no branch protection, `allow_auto_merge: false`) is recorded as **not captured — {reason}**, never guessed.
- Commit messages `{Verb} {what} — {detail} … — refs #560` (never `closes`/`fixes`).
- Work from the shared worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-559-560` (branch `worktree-flow+spec-559-560`); verify with `pwd` + `git rev-parse --show-toplevel` before any commit. Never touch the main checkout.

---

### Task 0: Empirical premise-check — capture real `gh` signatures (blocking)

**Files:**
- Create: `/private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/0664cff9-6d0f-4993-accc-7541265958b5/scratchpad/task0-captures.md` (scratch — consumed by Task 1, not committed)
- Touches GitHub state **temporarily**: two throwaway branches + one probe PR on `thomasholknielsen/claude-tweaks`, all removed at the end of this task.

**Interfaces:**
- Produces: `task0-captures.md` with sections `(a) auto-merge unavailable`, `(b) required-check rejection`, `(c) checks --watch failing`, `(c2) checks pending`, `(d) mergeStateStatus/statusCheckRollup shapes` — each holding the exact command, exit code, and stderr/stdout (first ~10 lines) verbatim, or `not captured — {reason}`.

**Hard safety rules (an implementer that cannot honor them reports BLOCKED instead):**
- The probe PR's **base is a throwaway branch, never `main`** — a merge that accidentally lands lands on the throwaway.
- The probe PR is opened **non-draft** with title `[task0 probe — do not merge] merge-verification gh signature capture` and a body line `Probe for #560 Task 0 — closed automatically by the run.`
- Never run `gh pr merge` (any flags) against any PR other than the probe PR. Never touch PR #588 or #582 except read-only `gh pr view`.
- Always finish with: close the probe PR, delete both throwaway branches locally and on origin, and confirm with `gh pr list --state open --head task0-probe-head` returning nothing.

- [ ] **Step 1: Verify repo facts (read-only)**

Run: `gh api repos/thomasholknielsen/claude-tweaks --jq '{allow_auto_merge, default_branch}'` → expected `{"allow_auto_merge":false,"default_branch":"main"}`; `gh api repos/thomasholknielsen/claude-tweaks/branches/main/protection` → expected 404 "Branch not protected"; `gh api repos/thomasholknielsen/claude-tweaks/rules/branches/main` → expected `[]`. Record all three outputs at the top of `task0-captures.md`.

- [ ] **Step 2: Create the throwaway base and head branches from the worktree**

From the worktree (`git rev-parse --show-toplevel` must be the worktree path):

```bash
git branch task0-probe-base 6b80ccf6
git push origin task0-probe-base
git checkout -b task0-probe-head 6b80ccf6
```

(`6b80ccf6` is `origin/main` at run start; any commit works — the point is the base is not `main`.) On `task0-probe-head`, create `tests/zz-task0-probe.test.js`:

```js
// Task 0 probe for #560 — deliberately failing so `gh pr checks --watch` observes a red run.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
test('task0 probe: this test fails on purpose', () => { assert.strictEqual(1, 2, 'probe failure'); });
```

Commit `Add task0 probe failing test — refs #560 (throwaway, never merged)` and push: `git push -u origin task0-probe-head`. Then return to the run branch: `git checkout worktree-flow+spec-559-560` (verify with `git branch --show-current`).

- [ ] **Step 3: Open the probe PR (non-draft, throwaway base)**

```bash
gh pr create --repo thomasholknielsen/claude-tweaks --base task0-probe-base --head task0-probe-head \
  --title "[task0 probe — do not merge] merge-verification gh signature capture" \
  --body "Probe for #560 Task 0 — closed automatically by the run."
```

Record the PR number as `PROBE`. Confirm `gh pr view $PROBE --json isDraft,baseRefName --jq '{isDraft,baseRefName}'` → `{"isDraft":false,"baseRefName":"task0-probe-base"}`.

- [ ] **Step 4: Capture (a) — `--auto` on a repo with auto-merge disabled**

```bash
gh pr merge $PROBE --repo thomasholknielsen/claude-tweaks --auto --merge -t "[probe] never lands" -b "probe"; echo "exit=$?"
```

Record stderr + exit verbatim under `(a)`. Then confirm nothing merged: `gh pr view $PROBE --json state,mergedAt` → `OPEN`, `null`. (If — unexpectedly — the PR merged, it merged into `task0-probe-base`, not `main`; note it and continue.)

- [ ] **Step 5: Capture (c2)/(d) — pending shapes, then (c) — `--watch` on a failing check**

While CI is still running (within ~1 min of push): `gh pr checks $PROBE --repo thomasholknielsen/claude-tweaks; echo "exit=$?"` → record (expected non-zero "pending" exit code — record the actual number); `gh pr view $PROBE --json state,mergeStateStatus,statusCheckRollup --jq '{state,mergeStateStatus,rollup:[.statusCheckRollup[]|{name,status,conclusion}]}'` → record under `(d) pending`.
Then: `gh pr checks $PROBE --repo thomasholknielsen/claude-tweaks --watch --fail-fast; echo "exit=$?"` → record the last ~10 lines + exit code under `(c)`. Then `gh pr view … --json state,mergeStateStatus,statusCheckRollup` again → record under `(d) failing`. Also record the green shape read-only from PR #588: `gh pr view 588 --json state,mergeStateStatus,statusCheckRollup --jq '{state,mergeStateStatus,rollup:[.statusCheckRollup[]|{name,status,conclusion}]}'` under `(d) green (draft PR #588, read-only)`.

- [ ] **Step 6: Capture (b) — required-check rejection**

This repo has no branch protection or rulesets (Step 1), so a merge rejected by *required* checks cannot be reproduced. Record under `(b)`: `not captured — repo has no branch protection/rulesets (Step 1 outputs); classification for this path relies on the state read (mergeStateStatus: BLOCKED) rather than a stderr signature.` Additionally capture what a plain merge attempt says on the red probe: `gh pr merge $PROBE --repo thomasholknielsen/claude-tweaks --merge -t "[probe] never lands" -b "probe"; echo "exit=$?"` — with no protection this may **succeed and merge into the throwaway base** (record that outcome verbatim too — it is itself evidence that, unprotected, `gh pr merge` does not consult check status at all, which is the #540 mechanism). If it merged, note `mergedAt`.

- [ ] **Step 7: Tear down**

```bash
gh pr close $PROBE --repo thomasholknielsen/claude-tweaks --delete-branch   # closes; deletes head branch on origin (skip --delete-branch if already merged into the throwaway base — then delete manually below)
git push origin --delete task0-probe-head 2>/dev/null; git push origin --delete task0-probe-base
git branch -D task0-probe-head; git branch -D task0-probe-base
gh pr list --repo thomasholknielsen/claude-tweaks --state open --head task0-probe-head   # expected: empty
git branch --show-current                                                                # expected: worktree-flow+spec-559-560
git status --short                                                                       # expected: clean
```

Confirm `git ls-remote --heads origin task0-probe-base task0-probe-head` prints nothing. Record the teardown confirmation at the bottom of `task0-captures.md`.

- [ ] **Step 8: Report** — return DONE with the capture file path; nothing to commit on the run branch.

---

### Task 1: The canonical merge-verification gate + degrade-table row

**Files:**
- Modify: `skills/_shared/pr-first-merge.md` (insert `## Step 2.5: Merge-verification gate` between Step 2 and Step 3; amend Step 3.1's degrade branch; extend the Outcome vocabulary table's `pending-review` row)
- Modify: `skills/_shared/pr-early-run-lifecycle.md` (one row in the Skip / degrade behavior table)
- Read: the Task 0 capture file (path above)

**Interfaces:**
- Produces: the section heading `## Step 2.5: Merge-verification gate` and the literal reason token `checks-pending-timeout` — Task 2's citations and Task 3's conformance test key on these exact strings.

- [ ] **Step 1: Insert Step 2.5 into `skills/_shared/pr-first-merge.md`** — immediately after Step 2's `gh pr ready` code block and before `## Step 3: Attempt auto-merge…`:

```markdown
## Step 2.5: Merge-verification gate

The one canonical statement of how much CI verification a merge waits for — every citing site
applies it here, none restates it. The lever is `merge-verification` (`_shared/policy-schema.md`'s
key row and coverage block own its meaning and derivation); this step owns what a merge site
*does* with the resolved value. Resolve it once, from the run's own config overlay:

```bash
MERGE_VERIFICATION=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values merge-verification)
```

**Read state first — never parse stderr first.** Before any merge attempt, regardless of value:

```bash
gh pr view {pr-number} --repo {owner}/{repo} --json state,mergeStateStatus,headRefOid,statusCheckRollup
```

Classify from the JSON, in this order:

- Any `statusCheckRollup[]` entry with `conclusion` in `FAILURE`, `TIMED_OUT`, `ERROR`, or `STARTUP_FAILURE`
  → **red** (the *PR being merged* has a failing check — distinct from #561's red *tip*, which is
  reconcile's concern). Take the **Red path** below now, before anything else. Under `off` this
  read still runs — `off` skips the *wait*, not the read — but the value `off` merges anyway
  (today's behavior); the red classification is logged and shown, not acted on.
- Any entry with `status` not `COMPLETED` (or `conclusion` null while `status: IN_PROGRESS`/`QUEUED`/`PENDING`)
  → **pending**.
- Otherwise (every entry `SUCCESS`/`NEUTRAL`/`SKIPPED`, or an empty rollup — no CI) → **green**.
- `state` not `OPEN` → report (`pending-review`, reason `pr-not-open`) and stop; never merge a closed or already-merged PR.

Then, per resolved value:

**Why `--auto` alone is not a wait (Task 0, captured on this repo).** On a repository with no
required status checks, `gh pr merge --auto --merge` **merges immediately** — exit `0`, empty stdout
and stderr, `autoMergeRequest: null`, the PR `MERGED` while its `test` check was still `pending`.
There is no distinguishing signature: `--auto`'s success looks identical whether it armed or merged.
That is the #540 mechanism itself. So "arm `--auto`" is a genuine wait **only when the state read
shows the forge would hold the merge** — `mergeStateStatus: BLOCKED` while checks are pending
(required checks / rulesets configured); anywhere else, arming *is* an immediate merge and this gate
must not lean on it. That is why the pending column below keys on `mergeStateStatus`, not on
`--auto`'s exit code.

| Value | Green | Pending | Red |
|---|---|---|---|
| `merge-when-green` | Step 3 as written — arm/merge (identical outcome when checks are already green) | `mergeStateStatus: BLOCKED` → Step 3 as written — arm `--auto` (the forge holds it; outcome `armed`). Any other value (`CLEAN`, `UNSTABLE`, `BEHIND`, `UNKNOWN`, …) → arming would merge immediately: **degrade to the `wait` row** — never to an immediate merge | Red path |
| `wait` | Re-read (`gh pr view … --json state,mergeStateStatus,headRefOid`) and merge with the run's configured method — Step 3's immediate-merge form | **Bounded watch** below | Red path |
| `off` | Step 3 as written (today's behavior, unchanged) | Step 3 as written (today's behavior — this is the #540-shaped race the lever exists to close; a repo derives `off` only when it has no PR CI or a non-default integration branch, `_shared/policy-schema.md`'s coverage block) | Step 3 as written; the red read is logged for the summary |

**Bounded watch (`wait`, and `merge-when-green` when arming would not hold) — 15 minutes, fixed.**
Not a policy key: `merge-when-green` (arming) is the no-wait path, `wait` is its fallback, and a
repo where 15 minutes is chronically wrong should enable required checks/auto-merge rather than
tune a knob (parent #558's one-lever decision; this paragraph is the timeout's own rationale). Poll
`gh pr checks` and key on its exit code — captured (Task 0): `0` all green, `8` at least one check
still pending, `1` at least one check failed — so a red result at any minute takes the Red path
immediately:

```bash
DEADLINE=$(( $(date +%s) + 900 ))
while :; do
  gh pr checks {pr-number} --repo {owner}/{repo} > /tmp/pr-checks-{n}.txt 2>&1; RC=$?
  case "$RC" in
    0) break ;;                                              # all green
    1) break ;;                                              # a check failed — red, stop watching
    8) [ "$(date +%s)" -ge "$DEADLINE" ] && RC=124 && break  # still pending at the bound
       sleep 30 ;;
    *) RC=2; break ;;                                        # gh/network error — do not merge on unknown state
  esac
done
```

- `RC=0` → **green**: re-read state (`gh pr view … --json state,mergeStateStatus,headRefOid`); if
  `headRefOid` changed since the first read (a new push landed) or `state` is not `OPEN`, re-enter this
  step from the top (one re-entry; a second change reports `pending-review`, reason `moving-target`)
  — never merge blind; otherwise merge with the run's configured method (Step 3's immediate-merge
  form, outcome `merged`, then Step 4).
- `RC=1` (a check failed during the watch) → **Red path**, reason `check-failed:{names}` (names from
  the `fail` rows of `/tmp/pr-checks-{n}.txt`).
- `RC=124` (still pending at the bound) → **Red path** with reason `checks-pending-timeout` —
  reserved strictly for checks still running at the bound, never for a check that failed.
- `RC=2` (unknown `gh` exit) → report `pending-review`, reason `checks-read-failed`; never merge on
  a state this gate could not read.

**Red path — never merge; park.**

1. Do not run any `gh pr merge`. Leave the PR ready (already undrafted; never re-draft).
2. Park the run on the work-record issue(s): bootstrap-then-add `bot:blocked` (`_shared/label-bootstrap.md`)
   on every record in `{issue-list}` — dispatch's existing `bot:*` home; `run-state.json` statuses are
   untouched (parking surfaces via label + log, not run-state) — and post one comment naming the
   failing check(s), the PR, and the reason:
   `Parked by merge-verification ({value}): {failing check names — or "checks still pending after 15m" for checks-pending-timeout} on PR #{n}. Resume once green.`
3. Log to `decisions.md` per `_shared/auto-decision-log.md` (an action taken autonomously — parked, not asked):
   `AUTO {HH:MM:SS} — merge-verification ({value}): parked — {reason: check-failed:{names} | checks-pending-timeout} on PR #{n}; bot:blocked applied to #{issue-list}. Reversibility: high (label removal + resume).`
4. Report outcome `pending-review`. This is a HARD-GATE-class stop written as park-and-surface — the
   `_shared/auto-mode-contract.md` strict rule holds: never a mid-pipeline prompt here; the human-facing
   surface is dispatch's resume confirmation (`dispatch/SKILL.md`, "Confirm before resuming").

**Forge-cooperation path.** A merge attempt rejected by *org-owned required checks* — the state read
shows `mergeStateStatus: BLOCKED` with every rollup entry green, or Step 3's call fails with the
required-status-check signature (Task 0 capture (b): not captured — this repo has no branch
protection or rulesets, so classification rests on the state read, never on a stderr string) — is
the forge enforcing a stricter policy than the lever. Report it as such, arm `--auto` (Step 3's own call — the merge lands when the
forge is satisfied), and stop: never retry-loop, never suggest bypassing protection.

**Signatures (Task 0, captured on this repo — literal, 2026-08-16, probe PR #591 against a throwaway base):**

- (a) `gh pr merge {n} --auto --merge -t … -b …` on this repo (`allow_auto_merge: false`, no branch protection, no rulesets): stdout empty, stderr empty, `exit=0` — and the PR **merged immediately** (`gh pr view … --json state,mergedAt,autoMergeRequest` → `{"autoMergeRequest":null,"mergedAt":"2026-08-16T11:40:57Z","state":"MERGED"}`) while its `test` check was still `pending`. No signature distinguishes "armed" from "merged" — only the follow-up `gh pr view` does (Step 3.6).
- (b) merge rejected by required checks: not captured — this repo has no branch protection or rulesets (`gh api repos/{owner}/{repo}/branches/main/protection` → HTTP 404 "Branch not protected"; `…/rules/branches/main` → `[]`); classification for this path rests on the state read (`mergeStateStatus: BLOCKED` with a green rollup), never on a stderr string.
- (c) `gh pr checks {n} --watch --fail-fast` on a failing check: rows like `test	fail	35s	https://github.com/…/actions/runs/…` (each check name / `pass`|`fail`|`pending`|`skipping` / duration / URL), `exit=1`. (c2) `gh pr checks {n}` while a check is still running: `test	pending	0	https://…`, `exit=8`.
- (d) `gh pr view {n} --json state,mergeStateStatus,statusCheckRollup` — green (open draft PR #588, read-only): `{"mergeStateStatus":"CLEAN","rollup":[{"conclusion":"SUCCESS","name":"label-fix-branch","status":"COMPLETED"},{"conclusion":"SUCCESS","name":"test","status":"COMPLETED"},{"conclusion":"SKIPPED","name":"cleanup-fix-labels","status":"COMPLETED"}],"state":"OPEN"}`; failing rollup entry: `{"conclusion":"FAILURE","name":"test","status":"COMPLETED"}` (observed on #591 after merge, `mergeStateStatus: UNKNOWN` — the value GitHub reports once a PR is `MERGED`); the `mergeStateStatus` value of an *open* PR with failing checks was not captured (the probe merged via (a) before its checks failed) — which is why red is classified from `statusCheckRollup[].conclusion`, not from `mergeStateStatus`.
- Also captured: `gh pr merge` against an already-merged PR: stderr `! Pull request {owner}/{repo}#{n} was already merged`, `exit=0` — a no-op, not an error; the state read (`state: MERGED`) catches it first.

**Resume-to-merge is one-shot.** `dispatch/SKILL.md`'s "Confirm before resuming" confirmation applies
this same lever as a single read-then-decide (green → proceed; red → surface in the confirmation;
pending → arm `--auto` where available, else offer the choice in that same confirmation) — a human is
present on resume, so it never runs the bounded watch.
```

The signature bullets above are already filled from Task 0's `task0-captures.md` (the plan was amended after Task 0 ran) — insert them verbatim; do not re-run any `gh pr merge`.

- [ ] **Step 2: Amend Step 3.1's degrade branch** — the sentence "degrade to an **immediate** merge, no `--auto`" becomes conditional: `under merge-verification: off — degrade to an immediate merge, no --auto (today's behavior); under merge-when-green — do NOT merge immediately: degrade to Step 2.5's wait row instead (the immediate merge is exactly the race the lever closes)`. Keep the code block.

- [ ] **Step 3: Extend the Outcome vocabulary table** — the `pending-review` row's Meaning gains: `…, checks red or still pending at Step 2.5's bound (parked with bot:blocked, reason check-failed:{names} or checks-pending-timeout), pr-not-open, moving-target, …`.

- [ ] **Step 4: Add the degrade row to `skills/_shared/pr-early-run-lifecycle.md`** — in `## Skip / degrade behavior`, after the `gh absent` row:

```markdown
| `gh` absent at merge time (`_shared/pr-first-merge.md` Step 2.5) | The `merge-verification` lever is unenforceable without `gh` — proceed as `off` and disclose it at **warn** tier in the run summary (a visible line, not a silent log entry): `merge-verification: {resolved} unenforceable — gh absent; proceeded as off`. Same no-MCP-fallback reason as the row above. |
```

- [ ] **Step 5: Verify** — `wc -c skills/_shared/pr-first-merge.md skills/_shared/pr-early-run-lifecycle.md` (< 40000 each); `grep -c "Step 2.5: Merge-verification gate" skills/_shared/pr-first-merge.md` → 1; `grep -rn "checks-pending-timeout" skills/ | grep -v _shared/pr-first-merge.md` → empty; `grep -n "{LITERAL" skills/_shared/pr-first-merge.md` → empty; `node --test tests/integration-model.test.js tests/integration-branch-conformance.test.js tests/skill-conventions.test.js` → PASS.

- [ ] **Step 6: Commit** — `git add skills/_shared/pr-first-merge.md skills/_shared/pr-early-run-lifecycle.md` · `git commit -m "Add merge-verification gate to the canonical pr-first merge — state-read-first, bounded wait, park on red — refs #560"`.

---

### Task 2: Merge sites cite and apply the gate

**Files:**
- Modify: `skills/dispatch/settle-and-merge.md` (Auto-merge gate — the "Both layers pass — merge (pr-first)" paragraph)
- Modify: `skills/dispatch/SKILL.md` ("Confirm before resuming" — one short sentence + citation; ≤ ~600 bytes added)
- Modify: `skills/flow/worktree-merge.md` (the `pr-first` reconciliation paragraph)
- Modify: `skills/wrap-up/review-console.md` — **only if** its Auto-merge short-circuit paragraph names Step 3 of `pr-first-merge.md` explicitly (grep first); otherwise no edit (it inherits Step 2.5 through the shared procedure).

**Interfaces:**
- Consumes: `## Step 2.5: Merge-verification gate` (Task 1).

- [ ] **Step 1: `skills/dispatch/settle-and-merge.md`** — in the "**Both layers pass — merge (`integration-model: pr-first`…)**" paragraph, after "run `_shared/pr-first-merge.md`'s procedure now, in this same Task call", insert: `— its Step 2.5 (Merge-verification gate) applies the resolved merge-verification lever before any merge attempt: green arms or merges, pending waits or arms, red parks the group with bot:blocked and reports pending-review, never merges (this is where a #540-shaped red merge is stopped) —`. Also, in the outcome sentence, extend "`merged` / `armed` / `pending-review`" with `(pending-review now also covers a red or timed-out check per that gate)`.

- [ ] **Step 2: `skills/dispatch/SKILL.md`** — in "**Confirm before resuming**", after the sentence beginning "Source the confirmation's values live…" ends its paragraph, add ONE sentence: `The CI status shown is also decided on, once, per _shared/pr-first-merge.md's Step 2.5 (Merge-verification gate) resume rule: green → resume proceeds; red → the confirmation says so and the run stays parked; pending → arm --auto where the repo allows it, else this same confirmation carries the choice — never the 15-minute watch.` Then `wc -c skills/dispatch/SKILL.md` must be < 40000 (expected ≈ 39,500). If it exceeds, shorten the sentence, do not delete other content.

- [ ] **Step 3: `skills/flow/worktree-merge.md`** — in the "**`integration-model: pr-first`**" paragraph, after "readying and merging each one via `_shared/pr-first-merge.md`'s procedure", insert `(its Step 2.5 Merge-verification gate included — a red PR in the sequence parks and reports pending-review; the remaining branches still merge in order)`.

- [ ] **Step 4: `skills/wrap-up/review-console.md`** — `grep -n "pr-first-merge" skills/wrap-up/review-console.md`; if the short-circuit says "run `_shared/pr-first-merge.md`'s procedure" (or equivalent whole-procedure citation) leave it untouched and note that in the report; only if it cites Step 3 by number, add ", Step 2.5 first" beside it. Check `wc -c` (that file is near the ceiling; #553 tracks it) — do not grow it beyond 40,000.

- [ ] **Step 5: Verify** — `wc -c` on all four; `grep -rn "Merge-verification gate" skills/` lists pr-first-merge (definition), settle-and-merge, dispatch/SKILL, flow/worktree-merge (and review-console only if edited); `grep -ri "merge-when-green" skills/ | grep -v pr-first-merge` → only #559's three files (policy-schema, manifesto, help/policy) — none of Task 2's edits name the value; `node --test tests/skill-conventions.test.js tests/integration-model.test.js` → PASS.

- [ ] **Step 6: Commit** — `git add` the edited files · `git commit -m "Cite the merge-verification gate from dispatch's auto-merge gate, the resume confirmation, and flow's reconciliation — refs #560"`.

---

### Task 3: skill-graph edges + conformance test

**Files:**
- Modify: `docs/skill-graph.md` (the `_shared/pr-first-merge.md` row under `## dispatch`; the `_shared/pr-early-run-lifecycle.md` row under `## build`)
- Create: `tests/merge-verification-gate-conformance.test.js`

**Interfaces:**
- Consumes: Task 1's heading + reason token; Task 2's citations.

- [ ] **Step 1: Write the failing conformance test** — `tests/merge-verification-gate-conformance.test.js`:

```js
// tests/merge-verification-gate-conformance.test.js — pins #560's single-statement rule:
// the merge-verification gate procedure lives once in skills/_shared/pr-first-merge.md
// (Step 2.5) and every pr-first merge site cites it. Mirrors the regex-plus-allowlist
// shape of tests/integration-model.test.js's consumer conformance.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS = path.join(__dirname, '..', 'skills');
const GATE_FILE = path.join(SKILLS, '_shared', 'pr-first-merge.md');
const read = (...p) => fs.readFileSync(path.join(SKILLS, ...p), 'utf8');

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc); else if (e.name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

test('the gate is stated once — Step 2.5 heading exists exactly once, only in pr-first-merge.md', () => {
  const gate = fs.readFileSync(GATE_FILE, 'utf8');
  assert.equal((gate.match(/^## Step 2\.5: Merge-verification gate$/gm) || []).length, 1);
  for (const file of walk(SKILLS)) {
    if (file === GATE_FILE) continue;
    assert.ok(!/^## Step 2\.5: Merge-verification gate$/m.test(fs.readFileSync(file, 'utf8')), `${path.relative(SKILLS, file)} restates the gate heading`);
  }
});

test('checks-pending-timeout is defined only in the gate; other files at most cite it', () => {
  const offenders = [];
  for (const file of walk(SKILLS)) {
    if (file === GATE_FILE) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes('checks-pending-timeout') && !text.includes('pr-first-merge.md')) offenders.push(path.relative(SKILLS, file));
  }
  assert.deepEqual(offenders, []);
});

test('merge-when-green appears outside the gate only as a lever value (#559 files) or a citation', () => {
  // The three #559 files name the value as a lever, never the procedure; anything else naming
  // the value must cite the gate's file.
  const LEVER_FILES = new Set(['_shared/policy-schema.md', 'flow/manifesto.md', 'help/policy.md']);
  const offenders = [];
  for (const file of walk(SKILLS)) {
    if (file === GATE_FILE) continue;
    const rel = path.relative(SKILLS, file);
    const text = fs.readFileSync(file, 'utf8');
    if (!/merge-when-green/i.test(text)) continue;
    if (LEVER_FILES.has(rel)) continue;
    if (!text.includes('pr-first-merge.md')) offenders.push(rel);
  }
  assert.deepEqual(offenders, []);
});

test('the gate reads state before any merge attempt and names the red-path pieces', () => {
  const gate = fs.readFileSync(GATE_FILE, 'utf8');
  const step25 = gate.indexOf('## Step 2.5: Merge-verification gate');
  const step3 = gate.indexOf('## Step 3:');
  assert.ok(step25 !== -1 && step3 !== -1 && step25 < step3, 'Step 2.5 must precede Step 3');
  const section = gate.slice(step25, step3);
  for (const needle of ['statusCheckRollup', 'mergeStateStatus', 'bot:blocked', 'checks-pending-timeout', 'AUTO ', '15 minutes', 'never', '--auto']) {
    assert.ok(section.includes(needle), `gate section missing "${needle}"`);
  }
  assert.ok(!/AskUserQuestion/.test(section), 'the gate is park-and-surface — no mid-pipeline prompt');
});

test('every pr-first merge site and the resume confirmation cite the gate', () => {
  for (const rel of ['dispatch/settle-and-merge.md', 'dispatch/SKILL.md', 'flow/worktree-merge.md']) {
    assert.ok(read(...rel.split('/')).includes('Merge-verification gate'), `${rel} does not cite the gate`);
  }
});

test('pr-early-run-lifecycle.md carries the gh-absent-at-merge degrade row (proceed as off, warn tier)', () => {
  const t = read('_shared', 'pr-early-run-lifecycle.md');
  assert.ok(/gh.*absent at merge time/i.test(t) && /proceed as `off`/.test(t) && /\*\*warn\*\*/.test(t));
});
```

- [ ] **Step 2: Run to verify current state** — `node --test tests/merge-verification-gate-conformance.test.js` — expected: PASS if Tasks 1–2 landed as specified (this test is the pin; if any assertion fails, fix the prose it names — never weaken the test).

- [ ] **Step 3: `docs/skill-graph.md` edges** — (a) in the `## dispatch` section's `_shared/pr-first-merge.md` row, append: `Since #560 its Step 2.5 (Merge-verification gate) applies the merge-verification lever (#559) before any merge attempt for every citing site — dispatch's Auto-merge gate, /flow's worktree-merge.md reconciliation, /wrap-up's short-circuit — and dispatch/SKILL.md's resume confirmation applies the same lever one-shot.` (b) in the `## build` section's `_shared/pr-early-run-lifecycle.md` row, append: `Its degrade table also carries the merge-time gh-absent row (lever unenforceable → proceed as off, warn tier), cited from _shared/pr-first-merge.md Step 2.5.`

- [ ] **Step 4: Verify** — `node --test tests/merge-verification-gate-conformance.test.js tests/skill-conventions.test.js tests/skill-catalog-completeness.test.js` → PASS.

- [ ] **Step 5: Commit** — `git add docs/skill-graph.md tests/merge-verification-gate-conformance.test.js` · `git commit -m "Pin the merge-verification gate's single statement and citations; add skill-graph edges — refs #560"`.

---

### Task 4: Full-suite verification

- [ ] **Step 1:** `npm test` redirected to `/private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/0664cff9-6d0f-4993-accc-7541265958b5/scratchpad/npm-test-560.txt`; `grep -E "^# (tests|pass|fail)"` → `# fail 0` (expect 3738 + 6 = 3744 pass).
- [ ] **Step 2:** any failure naming a touched file → fix + commit; otherwise re-run that file alone before concluding.

---

## Self-review

- **Spec coverage:** Task 0 captures (a)(b)(c) + shapes ✔; canonical section, state-read-first, per-value behavior, arm-rejected → wait, bounded 15-min watch, early red, `checks-pending-timeout` reserved, green re-read, `off` unchanged (Task 1) ✔; red path — never merge, `bot:blocked` on the record, AUTO log, timeout parking (Task 1) ✔; forge-cooperation (Task 1) ✔; gh-absent degrade row (Task 1 Step 4) ✔; dispatch gate + flow merge cite/apply, resume one-shot (Task 2) ✔; skill-graph edges (Task 3) ✔; AC1–AC5 pinned by Task 3's test with the file-location deviation stated ✔; AC6 full suite (Task 4) ✔.
- **Placeholder scan:** the `{LITERAL …}` markers in Task 1 are explicit fill-in slots for Task 0's captures, and Task 1 Step 5 greps that none survive.
- **Type/name consistency:** heading `## Step 2.5: Merge-verification gate` and token `checks-pending-timeout` identical in Tasks 1, 2, 3.
- **Deviation recorded:** section location (`pr-first-merge.md` vs spec's `pr-early-run-lifecycle.md`) — Common Step 4.5 will classify it (Update the spec).
