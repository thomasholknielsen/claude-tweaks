# /init Offers worktree.always Opt-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `worktree.always` opt-in question to `/init` Phase 0 Step 6, with the actual `.claude-tweaks/policy.yml` write deferred to the true last filesystem action of the invocation, so `/init` becomes the mechanism through which any project (not just this repo, which hand-authored its own `policy.yml`) adopts the mechanical worktree-enforcement hook that already ships with the plugin.

**Architecture:** Three markdown-only edits, no `bin/` code changes. `skills/init/bootstrap-steps.md` Step 6 gains the idempotency check + question + "queue, don't write" instruction. `skills/init/SKILL.md` gains two small new subsections (one at the Phase 0 tail for the `bootstrap`-only scope, one in Phase 9 for every other scope) that perform the actual deferred write, plus a Step 6 summary-line mention and an Actions Performed table row. `skills/_shared/git-discipline.md` gets a one-line cross-reference update so its existing description of the opt-in mechanism mentions `/init` now offers it.

**Tech Stack:** Markdown skill files only (no Node/JS). Verification is via `grep` against the literal inserted text — there is no code path to unit test.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-07-08-init-worktree-always-opt-in-design.md` — read it if any task below seems to contradict it; the spec wins.
- **Execute this entire plan inside the isolated worktree already created for this task** (`.claude/worktrees/init-worktree-always-rollout`, branch `worktree-init-worktree-always-rollout`) — this repo's own `.claude-tweaks/policy.yml` sets `worktree.always: true`, so any `Edit`/`Write`/`git commit` against the main checkout is mechanically denied. Before every task's commit step, run `pwd && git rev-parse --show-toplevel && git branch --show-current` and confirm the path contains `.claude/worktrees/init-worktree-always-rollout` and the branch is `worktree-init-worktree-always-rollout` — do not trust a stated working directory alone.
- Never `git add -A`/`git add .` — stage exact files by name.
- Commit messages: imperative voice, no Conventional Commit prefixes (e.g. `feat:`, `chore:`).
- No placeholders, no "TBD" — every insertion below is the literal text to write.

---

### Task 1: `bootstrap-steps.md` Step 6 — the question

**Files:**
- Modify: `skills/init/bootstrap-steps.md` (Step 6 section, currently lines 149-162)

**Interfaces:**
- Produces: the exact `AskUserQuestion` option labels `"Yes — enforce worktree.always (Recommended)"` and `"No — allow direct edits in the main checkout"`, and the exact phrase `Do not write \`.claude-tweaks/policy.yml\` here.` — Task 2's SKILL.md sections reference this same decision by name ("the queued `worktree.always` decision") but do not repeat these literal strings, so no cross-task type/name consistency risk.

- [ ] **Step 1: Make the edit**

Open `skills/init/bootstrap-steps.md`. Find this exact block (the end of Step 6, item 4, immediately before the `---` separator and the `### Step 7` heading):

```
   On yes, write `{ "worktree": { "baseRef": "head" } }` into `settings.json` (backup first, merge — don't clobber existing keys). In `auto` mode, set it without prompting and log the change.

---

### Step 7 — Browser / agent-browser (detailed procedure)
```

Replace it with:

```
   On yes, write `{ "worktree": { "baseRef": "head" } }` into `settings.json` (backup first, merge — don't clobber existing keys). In `auto` mode, set it without prompting and log the change.
5. **`worktree.always` policy** — check `.claude-tweaks/policy.yml` (repo root) for a `worktree.always:` line:

   | State found | Behavior |
   |---|---|
   | No `worktree.always:` line at all (no file, or file present without the key) | Ask the question below |
   | `worktree.always: true` | No-op — already enabled, skip silently |
   | `worktree.always: false` | Ask the question below (re-offer — matches Step 10/11/12's re-offer-on-decline convention) |

   When asking, call `AskUserQuestion`:
   - `question`: `"Require an isolated git worktree for every file edit in this project?"`, `header`: `"Worktree policy"`, `multiSelect`: `false`
   - Option 1 — `label`: `"Yes — enforce worktree.always (Recommended)"`, `description`: `"Mechanically denies Edit/Write/NotebookEdit/git commit outside a linked worktree from the first prompt of every future session. Prevents concurrent sessions from colliding on the main checkout."`
   - Option 2 — `label`: `"No — allow direct edits in the main checkout"`, `description`: `"Leaves the main checkout open for direct edits. You can enable this later by re-running /init."`

   **Do not write `.claude-tweaks/policy.yml` here.** Record the answer (`true` for Option 1, `false` for Option 2 — write `false` explicitly rather than leaving the key absent, so the idempotency check above can detect "already asked, declined" on a future run) and carry it forward to the end of this `/init` invocation. Writing it immediately would deny this same run's own remaining `Edit`/`Write` calls (Steps 7-14 below, and Phases 1-9 for any fuller scope) via the very policy this step turns on. See `SKILL.md`'s "Finalizing the worktree.always Decision" (Phase 0 tail, `bootstrap`-only scope) and "Worktree Policy Finalization" (Phase 9, every other scope) for where the write actually happens.

---

### Step 7 — Browser / agent-browser (detailed procedure)
```

- [ ] **Step 2: Verify the edit landed**

Run:
```bash
grep -n "worktree.always. policy" skills/init/bootstrap-steps.md
grep -F "Do not write \`.claude-tweaks/policy.yml\` here." skills/init/bootstrap-steps.md
grep -F "Yes — enforce worktree.always (Recommended)" skills/init/bootstrap-steps.md
```
Expected: each command prints exactly one matching line (the first uses `.` to match the backtick-wrapped `worktree.always` heading text).

- [ ] **Step 3: Commit**

```bash
git add skills/init/bootstrap-steps.md
git commit -m "Add worktree.always opt-in question to /init Step 6"
```

---

### Task 2: `SKILL.md` — deferred write + summary + Actions Performed row

**Files:**
- Modify: `skills/init/SKILL.md` (Step 6 summary line ~line 92-94; new section before `## Scope Selection Gate` ~line 130; Phase 9 section ~lines 347-376)

**Interfaces:**
- Consumes: the queued decision from Task 1 (referred to here as "the queued `worktree.always` decision" — no shared function signature since this is prose, but both finalization sections below must describe the identical write mechanics so a reader following either path ends up with the same `policy.yml` result).
- Produces: the exact heading strings `### Finalizing the worktree.always Decision` and `### Worktree Policy Finalization`, and the Actions Performed table row `| Worktree policy | ... | Step 6 |` — no downstream task consumes these by name, this is the terminal task for the SKILL.md file.

- [ ] **Step 1: Update the Step 6 summary line**

Find this exact block:

```
### Step 6: Worktree Configuration

Ensure `.worktrees/` exists in the project root; suggest migration if a legacy `.claude/worktrees/` is found. Read `bootstrap-steps.md` (Step 6) for the full procedure.
```

Replace it with:

```
### Step 6: Worktree Configuration

Ensure `.worktrees/` exists in the project root; suggest migration if a legacy `.claude/worktrees/` is found. Also offers the `worktree.always` policy opt-in (recommended default: on) — the decision is queued here but the file write is deferred to avoid this same run denying its own later writes; see "Finalizing the worktree.always Decision" and "Worktree Policy Finalization" below. Read `bootstrap-steps.md` (Step 6) for the full procedure.
```

- [ ] **Step 2: Add the Phase-0-tail finalization section**

Find this exact block (the end of the Optional Enhancements list, immediately before the Scope Selection Gate section):

```
### Step 14: Non-Default-Branch Issue Tracking (Optional Companion)

Offer only on projects with a GitHub remote — writes `.github/workflows/track-issue-fixes.yml`, which labels (`fix-on-<branch>`) and comments on issues fixed on non-default branches, then strips those labels once the fix reaches the default branch and GitHub closes the issue natively. Idempotent: skipped silently once the workflow file exists. Read `bootstrap-steps.md` (Step 14) for the full procedure.

---

## Scope Selection Gate
```

Replace it with:

```
### Step 14: Non-Default-Branch Issue Tracking (Optional Companion)

Offer only on projects with a GitHub remote — writes `.github/workflows/track-issue-fixes.yml`, which labels (`fix-on-<branch>`) and comments on issues fixed on non-default branches, then strips those labels once the fix reaches the default branch and GitHub closes the issue natively. Idempotent: skipped silently once the workflow file exists. Read `bootstrap-steps.md` (Step 14) for the full procedure.

---

### Finalizing the worktree.always Decision

If Step 6 (`bootstrap-steps.md`) queued a `worktree.always` decision and `$ARGUMENTS` was `bootstrap` (this invocation stops after Phase 0 — see "Input" above), write it now, as the last action before stopping: create `.claude-tweaks/` if it doesn't exist, then write or update the `worktree.always:` line in `.claude-tweaks/policy.yml` (merge into existing content — preserve every other line in the file untouched; create the file with just that one line if it didn't exist). If the decision was "Yes," tell the user: "`worktree.always` is now enforced — your next edit requires an isolated worktree; run `/superpowers:using-git-worktrees` first."

For every other scope, this decision is instead finalized at the end of Phase 9 — see "Worktree Policy Finalization" there.

---

## Scope Selection Gate
```

- [ ] **Step 3: Verify Step 2's edit landed**

Run:
```bash
grep -n "^### Finalizing the worktree.always Decision$" skills/init/SKILL.md
grep -c "^## Scope Selection Gate$" skills/init/SKILL.md
```
Expected: the first prints one matching line; the second prints `1` (confirms no accidental duplicate heading was introduced).

- [ ] **Step 4: Add the Phase 9 finalization section + Actions Performed row**

Find this exact block:

```
For the complete summary templates for both modes, read `summary-templates.md` in this skill's directory.

### Actions Performed
```

Replace it with:

```
For the complete summary templates for both modes, read `summary-templates.md` in this skill's directory.

### Worktree Policy Finalization

If Step 6 (`bootstrap-steps.md`) queued a `worktree.always` decision, write it now — this is the deferred write described in Step 6, deferred specifically so this run's own Steps 7-14 and Phases 1-8.5 writes were never blocked by a policy that turned on mid-run. (The `bootstrap`-only scope already wrote its queued decision immediately after Step 14 — see "Finalizing the worktree.always Decision" after Phase 0 — so there is nothing to do here for that scope.)

Create `.claude-tweaks/` if it doesn't exist. Read `.claude-tweaks/policy.yml` if present; if it has an existing `worktree.always:` line, replace that line, otherwise append a new `worktree.always: {true|false}` line (create the file with just that line if it didn't exist). Preserve every other line in the file untouched.

If the decision was "Yes," add one line to the Phase 9 summary: "`worktree.always` is now enforced — your next edit requires an isolated worktree; run `/superpowers:using-git-worktrees` first."

### Actions Performed
```

- [ ] **Step 5: Add the Actions Performed table row**

Find this exact block (the `Classification` row and its neighbor):

```
| shadcn integration | Set `shadcn-integration: {enabled/cli-only/disabled}` in CLAUDE.md | Step 12 |
| Routines | Instantiated {N} routine(s): `{list}` (or "Offered, none set up") | Step 13 |
| Classification | Confirmed maturity `{value}`, doc tier `{N}` | Phase 3 |
```

Replace it with:

```
| shadcn integration | Set `shadcn-integration: {enabled/cli-only/disabled}` in CLAUDE.md | Step 12 |
| Routines | Instantiated {N} routine(s): `{list}` (or "Offered, none set up") | Step 13 |
| Worktree policy | Set `worktree.always: {true/false}` in `.claude-tweaks/policy.yml` (only if Step 6 asked this run) | Step 6 |
| Classification | Confirmed maturity `{value}`, doc tier `{N}` | Phase 3 |
```

- [ ] **Step 6: Verify Steps 4-5 landed**

Run:
```bash
grep -n "^### Worktree Policy Finalization$" skills/init/SKILL.md
grep -F "| Worktree policy | Set \`worktree.always:" skills/init/SKILL.md
```
Expected: both commands print exactly one matching line each.

- [ ] **Step 7: Commit**

```bash
git add skills/init/SKILL.md
git commit -m "Add worktree.always finalization to /init Phase 0 and Phase 9"
```

---

### Task 3: `git-discipline.md` cross-reference + final consistency check

**Files:**
- Modify: `skills/_shared/git-discipline.md` (line 9)

**Interfaces:**
- Consumes: nothing from Task 1/2 by name — this is a standalone doc cross-reference update, verified independently.

- [ ] **Step 1: Make the edit**

Find this exact line:

```
Independent of any pipeline run, a project can opt into `worktree.always: true` in `.claude-tweaks/policy.yml` — when set, the same PreToolUse hook denies any `Edit`, `Write`, `NotebookEdit`, or `git commit` whose target isn't already inside a linked git worktree, even before `/build` or `/flow` has ever run. Unlike E1, this check needs no recorded run state; it fires from the first prompt of a session. Set up the worktree first via `/superpowers:using-git-worktrees`, then retry the edit inside it.
```

Replace it with:

```
Independent of any pipeline run, a project can opt into `worktree.always: true` in `.claude-tweaks/policy.yml` — when set, the same PreToolUse hook denies any `Edit`, `Write`, `NotebookEdit`, or `git commit` whose target isn't already inside a linked git worktree, even before `/build` or `/flow` has ever run. Unlike E1, this check needs no recorded run state; it fires from the first prompt of a session. `/init` Phase 0 Step 6 offers this opt-in during bootstrap (recommended by default, re-offered on later re-runs if declined) — the flag can also be hand-edited into `policy.yml` directly. Set up the worktree first via `/superpowers:using-git-worktrees`, then retry the edit inside it.
```

- [ ] **Step 2: Verify the edit landed**

Run:
```bash
grep -F "Phase 0 Step 6 offers this opt-in during bootstrap" skills/_shared/git-discipline.md
```
Expected: prints exactly one matching line.

- [ ] **Step 3: Cross-file consistency check**

Run all of the following and confirm every expected count:

```bash
# Task 1's heading text is present in bootstrap-steps.md
grep -c "worktree.always. policy" skills/init/bootstrap-steps.md
# Both SKILL.md finalization sections exist, exactly once each
grep -c "^### Finalizing the worktree.always Decision$" skills/init/SKILL.md
grep -c "^### Worktree Policy Finalization$" skills/init/SKILL.md
# The two finalization sections cross-reference each other by name
grep -c "Worktree Policy Finalization" skills/init/SKILL.md
grep -c "Finalizing the worktree.always Decision" skills/init/SKILL.md
```
Expected: `1`, `1`, `1`, `3` (one from its own heading, one from the Step 6 summary line's forward-reference, one from the Phase-0-tail section's forward-reference), `3` (one from its own heading, one from the Step 6 summary line's forward-reference, one from the Phase-9 section's back-reference).

- [ ] **Step 4: Run the full test suite as a regression guard**

```bash
npm test
```
Expected: all tests pass (this change touches no `bin/lib` code, so this is a pure regression check — a failure here would indicate an unrelated pre-existing issue, not a result of this plan's edits; compare against the pre-existing single flaky `tests/statusline.test.js` timing test noted in the worktree's baseline run before this plan started).

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/git-discipline.md
git commit -m "Cross-reference /init's worktree.always opt-in from git-discipline.md"
```

---

## Self-Review Notes

- **Spec coverage:** Task 1 covers the design's "The question" section. Task 2 Steps 2-5 cover "Write timing — avoiding self-lockout" and the Components table's `SKILL.md` row. Task 3 covers the Components table's `git-discipline.md` row. No design section is without a task.
- **No bin/ changes:** confirmed no task touches `bin/lib` — matches the design's "No `bin/` code changes" statement and the "Out of scope" section.
- **Type/name consistency:** the heading strings `### Finalizing the worktree.always Decision` and `### Worktree Policy Finalization` are used identically in both their defining task step and Task 3's cross-consistency grep — verified by literal copy-paste between Task 2 and Task 3 rather than paraphrase.
