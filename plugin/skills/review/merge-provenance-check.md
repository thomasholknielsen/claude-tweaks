# Merge-Provenance Check — /claude-tweaks:review Step 2

Read from `code-mode-steps.md`'s Step 2 only when the detect command there reported at least one merge
commit. With no merge commits the check is a no-op and this file is never read.

Before analyzing the diff, check whether the base branch was merged into this branch mid-history — content that arrived via such a merge should not be misattributed as work this branch introduced. This was caught concretely during the #45 native-review prototype: a CHANGELOG entry that actually rode into the branch via a merge from `main` was flagged as if it were part of this branch's own work, and was only correctly attributed by manually tracing merge-commit parentage.

```bash
git log --first-parent --no-merges {base}..{branch} --name-only --pretty=format:  # own-work files
git diff {base}...{branch} --name-only                                           # full diff files
```

`{base}`/`{branch}` reuse whatever base-branch resolution the rest of this step already uses (the base branch, or the fallback ladder from Input resolution rule 7 — `_shared/scope-resolution.md`) — no new base-resolution logic needed.

- **Merge commits detected** — diff the "own-work files" list above against the full diff's file list. `--first-parent --no-merges` walks only the branch's own sequential commit chain, skipping content that entered solely through a merge commit's second parent — so files present in the full diff but absent from this list arrived via merge from `{base}`, not this branch's own work. Report them separately ("arrived via merge from {base}, not this branch's own work"), stating the count of files/lines excluded and why, feeding Step 7's summary. Do not fold them silently into "what changed."
- The **own-work scope** (not the raw `git diff` scope) is what feeds the change analysis below, and what Step 3's lens dispatch and Step 3.5's debate dispatch review — merged-in-only content is excluded from review scope by default.

"The change analysis below" is the diff-shape analysis in `code-mode-steps.md`'s Step 2, which resumes after this check; Step 5 (`/claude-tweaks:simplify`) takes the same own-work scope.
