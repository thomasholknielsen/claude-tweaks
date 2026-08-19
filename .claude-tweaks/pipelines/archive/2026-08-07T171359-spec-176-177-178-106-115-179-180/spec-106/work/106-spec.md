---
record: 106
origin: human
risk: low
effort: low
ceremony: fast-lane
grants: []
surface: harness
---
# 106: IL-45's SHA-identity check can never pass after a rebase-merged PR

Surface: harness

## Current State

`CLAUDE.md:240` (and `docs/incident-log.md`'s IL-45 entry) prescribes:

> Verify `git rev-parse HEAD` is identical on both the worktree branch and `main` before overriding with `discard_changes: true`.

That check is correct only when the branch was **fast-forwarded or merge-committed** into `main`. It cannot pass when the branch was merged via `gh pr merge --rebase`, because rebasing rewrites the commit SHA — the branch and `main` hold byte-identical content under two different hashes, permanently.

Hit concretely while wrapping up PR #103:

```
worktree branch: 7565153  Bound main-thread context cost in verification...
main:            98f8c297  Bound main-thread context cost in verification...   <- rebased twin
git diff worktree-issues-79-85-87-context-budget main -- <the 4 changed files>  ->  0 lines
```

`git log main..<branch>` reports 1 "unmerged" commit, and `git rev-parse HEAD` differs — yet nothing would be lost by removing the worktree.

This matters because the repo's own merge convention favors rebase: recent `main` is strictly linear (last 20 commits have `all` == `first-parent`, zero merge commits), so the rebase path is the *common* case here, not an edge case.

## Why it's worth fixing

The rule fails in the more dangerous direction. Someone following it literally finds the check never passes, and the available responses are both bad:

- Refuse to clean up, leaving orphaned worktrees accumulating (this repo currently has 8 live).
- Conclude the check is noise and skip verification entirely — losing the protection IL-45 exists to provide.

## Deliverables

- Correct IL-45's entry in `docs/incident-log.md` to cover the rebase-merge case.
- Update the compressed rule at `CLAUDE.md:240` to prescribe a check that works under all three merge strategies.

## Acceptance Criteria

- The rule prescribes a **content** check rather than a SHA-identity check, e.g. `git diff <branch> <default-branch> -- <changed files>` returning empty, or comparing tree hashes.
- The rebase-merge case is named explicitly, so a reader hitting a differing SHA knows whether it is benign.
- The existing fork-point insight (the commit-count refusal counts against the fork point, not `main`'s tip) is preserved — this extends IL-45, it does not replace it.

## Technical Approach

### Key Files

- `docs/incident-log.md` — the IL-45 entry
- `CLAUDE.md:240` — the compressed rule carrying the `[IL-45]` tag

Follow CLAUDE.md's own documented procedure (line 173): write the incident-log entry first, then compress to the rule. Extending IL-45 is likely correct rather than allocating a new `IL-nn`, since this is the same hazard with a wider trigger — but that is the implementer's call.

## Gotchas

- Do not file this as a new IL number without first checking whether extending IL-45 reads better; the rules explicitly say gaps are fine and renumbering is forbidden, but they are silent on extend-vs-add.
- At the time this was filed, `CLAUDE.md` and `docs/incident-log.md` were both uncommitted in the `agent-a-claude-md` worktree. Check that session has landed before editing either file, or the edit will race.

## Original request

Surfaced by `/claude-tweaks:wrap-up` Step 3 reflection (Surprises lens) after PR #103.
