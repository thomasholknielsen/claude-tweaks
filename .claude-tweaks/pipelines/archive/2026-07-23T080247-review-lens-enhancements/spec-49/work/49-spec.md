---
record: 49
origin: capture
risk: low
effort: medium
ceremony: fast-lane
grants: []
surface: backend
---
# 49: Review Step 2: distinguish branch's own commits from merged-in content

## Current State

`/claude-tweaks:review`'s Step 2 ("Identify What Changed," `skills/review/SKILL.md` lines 178-197) analyzes `git diff` (or `git diff` against the base branch) to determine which files changed, lines added/removed, and whether schema/API/infra changed. It treats the entire diff range as "this branch's own work" without distinguishing commits made directly on the branch from content that arrived by merging the base branch in mid-branch (e.g. a `git merge main` partway through the branch's history). When the base branch has moved and gets merged into the feature branch, files/lines that originated upstream (on the base branch) show up in the diff exactly like the branch's own changes, and downstream steps (Step 3's lenses, Step 3.5's debate) can misattribute that upstream content as work introduced by this branch. This was caught concretely during the #45 native-review prototype: a CHANGELOG entry that actually rode into the branch via a merge from `main` was flagged as if it were part of this branch's own work, and was only correctly attributed by manually tracing merge-commit parentage.

## Deliverables

- Step 2 detects merge commits within the review range: `git log --merges {base}..{branch} --oneline`.
- When merge commits are found, Step 2 computes the branch's own change set from `git log --first-parent --no-merges {base}..{branch} --name-only` (the first-parent chain skips content that only arrived via a merge commit's second parent — i.e. content pulled in from the base branch) and compares it against the full `git diff {base}...{branch} --name-only` file list.
- Files present in the full diff but absent from the branch's-own-commits file list are flagged as "arrived via merge from {base}, not this branch's own work" and are reported separately in Step 2's output rather than folded silently into "what changed."
- The scope handed to Step 3's lenses and Step 3.5's debate is the branch's-own-work file/line set — merged-in-only content is excluded from lens review scope by default (noted in the summary, not silently dropped: Step 2's output states how many files/lines were excluded and why).
- When `git log --merges {base}..{branch}` returns zero commits (the common case — no mid-branch merge), Step 2's behavior is unchanged from today: no new computation, no new output section.

## Acceptance Criteria

- On a branch with zero merge commits in range, Step 2 produces byte-identical output to the current behavior (regression check).
- On a synthetic branch built as: one commit on `main` that isn't on the feature branch yet, then `git merge main` into the feature branch (bringing that file in), then one own commit on the feature branch touching a different file — Step 2's branch-own-work file list contains only the feature branch's own commit's file, and separately reports the merged-in file as "arrived via merge, not this branch's own work."
- Step 3's lenses and Step 3.5's debate, when run against a branch with detected merge commits, do not produce findings whose `Path:Line` falls only within the merged-in-only file set (verified by construction of the synthetic branch above — no lens should flag the merged-in CHANGELOG-style file as "this work").
- The exclusion is reported, not silent: Step 2's own output (feeding Step 7's summary) states the count of merged-in-only files/lines excluded from review scope.

## Technical Approach

Modify `skills/review/SKILL.md`'s Step 2 section (lines 178-197, "Identify What Changed") to add a merge-provenance sub-step, run before the existing bullet list:

```bash
git log --merges {base}..{branch} --oneline                                      # detect
git log --first-parent --no-merges {base}..{branch} --name-only --pretty=format:  # own-work files
git diff {base}...{branch} --name-only                                           # full diff files
```

Diff the two file lists (own-work vs. full) to get the merged-in-only set. `{base}` and `{branch}` reuse whatever the existing "base branch" resolution already uses elsewhere in Step 2 (git diff against base branch / recent commits) — no new base-resolution logic needed. Thread the resulting "own-work scope" (file list, or file+line-range set if line-level precision is warranted) through to Step 3's lens dispatch and Step 3.5's debate dispatch as the effective review scope, replacing the raw `git diff` scope those steps currently read from Step 2. Add a short subsection to Step 2 documenting the merge-provenance check and its output format, consistent with the existing "Reusing a Prior Whole-Branch Review" subsection's style (lines 191-197).

## Gotchas

- `--first-parent` on the *feature branch's own* history is the key trick: if the branch itself contains a `git merge main` commit, that merge commit's second parent is main's history — `--first-parent --no-merges` walks only the sequential chain of the branch's own commits, correctly excluding content that only entered via that merge's second parent. Verify this against a real merge commit before trusting it in the acceptance-criteria test — don't just trust the description above.
- Do not confuse this with the existing "Reusing a Prior Whole-Branch Review" subsection (same Step 2, lines 191-197) — that handles multi-spec batches reusing an *already-completed* review's scope; this is about a single review correctly scoping *what's in the diff at all*. They're adjacent but orthogonal.
- Multi-spec pipeline runs (`/claude-tweaks:flow #47,#48,#49`) branch from a single worktree with no intermediate `git merge main` — this feature is for the general case (any branch reviewed standalone or via flow), not specific to how this very batch of three leaves gets built.
- `ceremony:fast-lane` verdict reflects a single, self-contained addition to one Step with a concrete, testable failure scenario — not a multi-package or public-surface change.

## Original request

Review Step 2: distinguish branch's own commits from merged-in content

**Related:** #45

Context: The #45 prototype caught a real finding (a CHANGELOG entry misattributed as this branch's own work when it actually rode in via a merge from main) only by tracing merge-commit parentage carefully; Step 2's change analysis doesn't currently make that distinction.

Scope: Have Step 2 (Identify What Changed) explicitly separate a branch's own commits from content that arrived via merging the base branch in, to avoid misattributing pre-existing upstream changes as "this work."
