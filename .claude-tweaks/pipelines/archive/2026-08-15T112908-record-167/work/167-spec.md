---
record: 167
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: feedback-63635acc
surface: backend
---
# 167: tidy: `git branch -d` refusal is misdiagnosed as "unmerged work" in a repo with more than one long-lived base branch

Surface: backend

## Current State

`skills/tidy/scan-procedures.md` Step 4.5 (`scan-procedures.md:101`) and the matching row in
`skills/tidy/SKILL.md`'s Anti-Patterns table (`SKILL.md:255`) both treat a `git branch -d`
refusal as proof the branch carries unmerged work:

> `scan-procedures.md:101` — "Use `git -C "{REPO_ROOT}" branch -d {branch}` (safe delete,
> **refuses if unmerged**)... If `-d` refuses, surface the branch as **`unmerged — manual
> review required`**..."
>
> `SKILL.md:255` — "**`-d` refusing means unmerged work.** Surface as `unmerged — manual
> review required`; never destructive-delete autonomously."

`git branch -d` only checks containment against `HEAD` or the branch's own `@{upstream}` — it
says nothing about whether the branch is merged into a *different* long-lived base. In a repo
with a promotion chain (e.g. `dev` → `staging` → `main`), a branch created off `main`, merged
to `main` via PR, and left behind locally refuses `-d` identically to a genuinely unmerged
branch when `/tidy` runs from a worktree checked out on a `dev`-based branch. One real sweep
produced 9 such false positives, every one already fully merged into `main`
(`git branch --merged origin/main` confirms it), all reported as `unmerged — manual review
required`.

The recommendation itself (don't auto-escalate to `-D`) is correct and stays unchanged. The
defect is the stated *reason* — it sends the reader to look for unmerged work that doesn't
exist.

## Deliverables

- `skills/tidy/scan-procedures.md` Step 4.5: before concluding from a `-d` refusal, check the
  branch against every configured base — `integration-branch` from `.claude-tweaks/policy.yml`
  (when pinned) plus the repo's own default branch (`origin/HEAD`) — via
  `git branch --merged origin/{base}` for each, and distinguish three outcomes instead of two:
  - merged into `HEAD`/current base → safe `-d` (today's row, unchanged)
  - merged into a *different* configured base only → safe, but needs `-D`; surface with that
    reason and require manual approval before deleting (a new row — never auto-`-D`)
  - merged into none of them → genuinely unmerged, surfaced as today
- `skills/tidy/SKILL.md`'s Anti-Patterns table row (currently at line 255): reword so it no
  longer equates "`-d` refused" with "unmerged" — state the actual three-way distinction and
  that `-d` alone only proves containment in `HEAD`/upstream, not non-merge into every base.

## Acceptance Criteria

- Running `/claude-tweaks:tidy` Step 4.5 against a branch merged into a base other than the
  worktree's current `HEAD` reports it as merged-elsewhere-needs-`-D`-approval, not
  `unmerged — manual review required`.
- A genuinely unmerged branch still reports `unmerged — manual review required`, unchanged.
- A branch merged into the current `HEAD`/upstream still resolves to safe `-d`, unchanged —
  this fix adds a case, it does not alter the existing two.
- `-D` is never invoked autonomously in any of the three outcomes — the existing "never
  destructive-delete autonomously" constraint holds for the new merged-into-another-base case
  too, requiring the same manual-review gate as the unmerged case, just with an accurate reason.
- Both files' prose stop stating "`-d` refused" implies "unmerged" as a general fact.

## Technical Approach

In Step 4.5, before the existing `git -C "{REPO_ROOT}" branch -d {branch}` call: resolve the
list of configured bases (project's `integration-branch` policy value, when set, plus
`origin/HEAD`'s resolved default branch — dedup if they're the same). Run
`git -C "{REPO_ROOT}" branch --merged origin/{base}` for each and check membership before (or
instead of, to avoid a redundant `-d` attempt against a base other than `HEAD`) invoking `-d`.
Keep the existing `-d` call for the `HEAD`-merged case since it's the actual deletion mechanism;
add a new manual-review row for merged-into-another-base, using `-D`'s status only as
information surfaced to the human, never executed.

## Gotchas

- Bases to check should come from the same `integration-branch` resolution ladder used
  elsewhere in this file (`{merge-base}` resolution above already documents a related but
  distinct case — reuse its base-resolution convention rather than inventing a second one).
- When no `integration-branch` is pinned in policy (as in this project today), the check
  degrades to just `origin/HEAD` — identical to today's single-base behavior — so this fix is a
  strict superset, never a regression for projects with only one long-lived base.
- Keep the "never destructive-delete autonomously" invariant explicit on the new
  merged-into-another-base row; it would be an easy mistake to read "safe" as "auto-`-D`."

## Original request

tidy: `git branch -d` refusal is misdiagnosed as "unmerged work" in a repo with more than one long-lived base branch

**Summary:** /tidy Step 4.5 treats a `git branch -d` refusal as proof of unmerged work, but `-d` only checks containment in HEAD or the branch's upstream — a branch fully merged into a *different* base refuses identically.

**Kind:** Defect

**Affected component:** `skills/tidy/scan-procedures.md` Step 4.5, and the matching row in `skills/tidy/SKILL.md`'s Anti-Patterns table.

Both currently assert:

> `skills/tidy/scan-procedures.md:148` — "Use `git -C \"{REPO_ROOT}\" branch -d {branch}` (safe delete, **refuses if unmerged**)."
>
> `skills/tidy/SKILL.md:239` — "**`-d` refusing means unmerged work.** Surface as `unmerged — manual review required`; never destructive-delete autonomously."

**Repro steps:**

1. Use a repo with a promotion chain of long-lived branches — e.g. `dev` -> `staging` -> `main`.
2. Create a branch off `main`, merge it to `main` via PR, and leave the local branch behind. (A backport or hotfix landing on `main` first is the common shape.)
3. Run `/claude-tweaks:tidy` from a worktree checked out on a `dev`-based branch.
4. Step 4.5 runs `git branch -d <branch>`. It refuses: `error: the branch '<branch>' is not fully merged`.

**Expected vs. actual:**

Expected: the branch is recognised as merged (into `main`) and offered for cleanup, or at minimum surfaced with an accurate reason.

Actual: it is reported as `unmerged — manual review required`, which states something false. The branch has no unmerged work at all — `git branch --merged origin/main` lists it. `git branch -d` cannot see this because it only considers HEAD (a `dev`-based branch here) and the branch's own upstream.

**Impact:** the *recommendation* (don't auto-escalate to `-D`) is still correct and should stay. The problem is the stated **reason**, which sends the reader to look for work that does not exist. In one real sweep this produced 9 such branches, every one fully merged, all reported as needing manual review for unmerged work.

**Suggested fix:** before concluding, check the branch against the other known bases rather than only the current HEAD — e.g. `git branch --merged origin/<base>` for each configured base (`integration-branch` from `.claude-tweaks/policy.yml` plus the repo default branch), and distinguish three outcomes: merged into HEAD (safe `-d`), merged into another base (safe, but needs `-D`, so surface with that reason and require approval), genuinely unmerged (surface as today). The wording in both files should stop equating "-d refused" with "unmerged".

**Plugin version:** 6.50.1

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: feedback-63635acc -->
