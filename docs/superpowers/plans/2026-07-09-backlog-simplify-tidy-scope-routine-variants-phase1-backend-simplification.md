# Backlog Backend Simplification — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `/claude-tweaks:init` Step 15 from asking a neutral A/B question when a GitHub remote is reachable — silently default `backlog-backend: github-issues` in that case, while leaving the no-remote path and Update-Mode's existing drift behavior unchanged.

**Architecture:** One task, one file. This is a pure skill-markdown prose edit to `skills/init/bootstrap-steps.md` Step 15 — no code, no tests in the `node --test` sense. Verification is grep-based content checks against the edited prose, matching the pattern already established by Phase 1 (foundations)'s Task 2/3 for this same feature.

**Tech Stack:** Markdown (skill prose) only. No JS, no new dependencies.

## Global Constraints

- Design doc: `docs/superpowers/specs/2026-07-09-backlog-simplify-tidy-scope-routine-variants-design.md`, Section A.
- Do not touch the no-GitHub-remote path — the design explicitly says "no behavior change for these repos."
- Do not touch the Update-Mode "remote newly became available" upgrade-offer branch — the design doesn't address it, so it stays exactly as-is (still an explicit offer, not silent).
- Do not touch the "already `local-files`, remote already existed" case beyond what the existing re-run condition already does — the existing condition only fires on a *newly* available remote, so a config where the remote already existed is already left alone without any code change.
- No new CLAUDE.md flag values — `github-issues` and `local-files` remain the only two.

---

### Task 1: Make Step 15's GitHub-remote branch silent

**Files:**
- Modify: `skills/init/bootstrap-steps.md:695-707` (Gate + Present), `skills/init/bootstrap-steps.md:731-734` (Existing-content migration intro phrase)

**Interfaces:**
- Consumes: nothing from other tasks (this is Phase 1's only task).
- Produces: no new interface — this changes prose behavior only. Phase 2 and Phase 3 do not depend on this task's content.

- [ ] **Step 1: Confirm the current exact text before editing**

Read `skills/init/bootstrap-steps.md` lines 695-707. Confirm it reads exactly:

```markdown
**Gate:** run the same GHE-safe two-tier check Step 9 uses. When it succeeds (a
GitHub-flavored remote is reachable), default the recommendation to option 1 below;
otherwise default to option 2.

**Present:**

```
How should claude-tweaks store captured ideas and deferred work?

1. GitHub issues (Recommended when a GitHub remote is available) — filterable,
   visible outside the repo, works with /flow --from-label and --from-milestone
2. Local markdown files (specs/INBOX.md, specs/DEFERRED.md) — no GitHub dependency
```
```

If the text differs (another session edited this file concurrently), stop and re-read the current file in full before proceeding — do not blindly apply the Step 2 edit below against stale line numbers.

- [ ] **Step 2: Edit the Gate + Present section**

Use the Edit tool on `skills/init/bootstrap-steps.md` with this exact `old_string`:

```
**Gate:** run the same GHE-safe two-tier check Step 9 uses. When it succeeds (a
GitHub-flavored remote is reachable), default the recommendation to option 1 below;
otherwise default to option 2.

**Present:**

```
How should claude-tweaks store captured ideas and deferred work?

1. GitHub issues (Recommended when a GitHub remote is available) — filterable,
   visible outside the repo, works with /flow --from-label and --from-milestone
2. Local markdown files (specs/INBOX.md, specs/DEFERRED.md) — no GitHub dependency
```
```

and this exact `new_string`:

```
**Gate:** run the same GHE-safe two-tier check Step 9 uses.

**When the gate succeeds** (a GitHub-flavored remote is reachable): skip the prompt
below entirely and go straight to "Write the flag to CLAUDE.md" with
`backlog-backend: github-issues`. GitHub issues is the richer, proven path
(filterable, visible outside the repo, works with `/flow --from-label` and
`--from-milestone`) — asking a neutral A/B question when the better option is
unambiguously available is unnecessary friction, not a meaningful decision. A user
who wants local files anyway (e.g. a public repo where backlog items shouldn't be
GitHub-visible) can still hand-edit CLAUDE.md's `backlog-backend` value afterward —
`/claude-tweaks:capture` and `/claude-tweaks:tidy` always honor whatever the flag
says, regardless of how it was set.

**When the gate fails** (no GitHub-flavored remote): present the choice below,
defaulted to option 2 — unchanged from today.

**Present (gate-fails case only):**

```
How should claude-tweaks store captured ideas and deferred work?

1. GitHub issues (Recommended when a GitHub remote is available) — filterable,
   visible outside the repo, works with /flow --from-label and --from-milestone
2. Local markdown files (specs/INBOX.md, specs/DEFERRED.md) — no GitHub dependency
```
```

- [ ] **Step 3: Verify the edit landed correctly**

Run:

```bash
grep -n "skip the prompt below entirely" skills/init/bootstrap-steps.md
grep -n "Present (gate-fails case only)" skills/init/bootstrap-steps.md
grep -c "^\*\*Gate:\*\*" skills/init/bootstrap-steps.md
```

Expected: the first two greps each match exactly once; the third prints `1` (only Step 15 uses this exact `**Gate:**` bold-lead-in — Step 9/14 phrase their gates differently, so this count staying at 1 confirms no duplicate was accidentally introduced).

- [ ] **Step 4: Update the "Existing-content migration" intro phrase**

Read the current text at (now-shifted) `skills/init/bootstrap-steps.md` around the "Existing-content migration" heading to confirm it still reads:

```
**Existing-content migration.** Whenever this step newly sets `backlog-backend:
github-issues` (fresh init choosing option 1, first run on a pre-existing project, or the
upgrade path below) and `specs/INBOX.md` and/or `specs/DEFERRED.md` contain entries beyond
```

Use the Edit tool with this exact `old_string`:

```
**Existing-content migration.** Whenever this step newly sets `backlog-backend:
github-issues` (fresh init choosing option 1, first run on a pre-existing project, or the
upgrade path below) and `specs/INBOX.md` and/or `specs/DEFERRED.md` contain entries beyond
```

and this exact `new_string`:

```
**Existing-content migration.** Whenever this step newly sets `backlog-backend:
github-issues` (a fresh init resolving to `github-issues` — whether via the silent
gate-succeeds default or an explicit choice in the gate-fails prompt — a first run on a
pre-existing project, or the upgrade path below) and `specs/INBOX.md` and/or
`specs/DEFERRED.md` contain entries beyond
```

- [ ] **Step 5: Verify the migration-intro edit landed correctly**

Run:

```bash
grep -n "whether via the silent" skills/init/bootstrap-steps.md
grep -n "fresh init choosing option 1" skills/init/bootstrap-steps.md
```

Expected: the first grep matches exactly once; the second grep matches **zero** times (the old "choosing option 1" phrasing is fully replaced, no longer accurate now that option 1 is often silent rather than chosen).

- [ ] **Step 6: Confirm the untouched sections are still intact**

Run:

```bash
grep -n "if a GitHub remote has since become available" skills/init/bootstrap-steps.md
grep -n "no behavior change for these repos" skills/init/bootstrap-steps.md
```

Expected: the first grep matches once (Re-run behavior's upgrade-offer branch, confirmed untouched — Global Constraints says this stays an explicit offer). The second grep matches **zero** times — that phrase is from this plan's own Global Constraints section, not something that should appear in `bootstrap-steps.md` itself; this check guards against accidentally pasting planning commentary into the skill file.

- [ ] **Step 7: Run the full test suite to confirm no regressions**

Run: `npm test`
Expected: all tests pass (this task touches only markdown prose, so no test file exercises it directly — this run just confirms nothing else broke).

- [ ] **Step 8: Commit**

```bash
git add skills/init/bootstrap-steps.md
git commit -m "Make /init Step 15 silent when a GitHub remote is reachable"
```

---

## Self-Review Notes

- **Spec coverage:** This plan implements the entirety of the design doc's Section A. The "manual CLAUDE.md override still works" requirement needed no code change — `/claude-tweaks:capture`/`/claude-tweaks:tidy` already read whatever the flag says regardless of how it was set, so Step 1's new prose explicitly calls that out as existing behavior rather than claiming a new capability. The "Update-Mode leaves pre-existing local-files configs alone" requirement needed no edit at all: the existing re-run condition only offers the upgrade when a remote is *newly* available, which already excludes the "remote already existed, user picked local-files anyway" case — Global Constraints documents why this is a verified no-op, not an oversight.
- **No placeholders:** every step has the exact old_string/new_string pair or an exact grep command with an exact expected result — nothing deferred to "handle appropriately."
- **Out of scope, confirmed absent from this plan:** Phase 2 (`/tidy --scope`) and Phase 3 (`/routine` variants) — this plan touches only `skills/init/bootstrap-steps.md`.
