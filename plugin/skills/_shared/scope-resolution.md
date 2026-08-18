# No-Argument Scope Resolution — the deterministic fallback ladder

Canonical answer to "which files are in scope" when a recent-work skill is invoked with no
explicit file, directory, or record argument. Stated once here; the consumers (`/deepen`,
`/simplify`, `/review`, `/reflect`, `/journeys` — edges in `docs/skill-graph.md`) cite this file
instead of restating the ladder. Replaces the retired "use `git diff` against the base branch or
recent commits" phrasing, whose two unspecified choices — which base? how recent? — let two runs
on the same tree resolve different file sets.

The first rung that yields files wins:

1. **Uncommitted work** — `git diff --name-only HEAD`, plus untracked source files from
   `git status --porcelain`.
2. **On a feature branch** — files changed since the fork point from the integration branch
   (resolved per `_shared/integration-branch.md`, never a hardcoded `main`):
   `git merge-base HEAD {integration-branch}`, then `git diff --name-only {merge-base}..HEAD` —
   two plain commands, since worktree sessions refuse composed forms
   (`_shared/scratch-worktree.md`, "## 7. Shell constraint").
3. **On the integration branch itself** — files changed in the last 5 commits:
   `git diff --name-only HEAD~5`.

State which rung resolved the scope in the run's opening line — the reader should never have to
infer it, and two runs on the same tree must resolve the same file set.

This file owns only which files are in scope. Consumers own everything after resolution — source
filtering, deletion handling, mode selection, and what their pass does with the files — and a
consumer that diffs *content* (not just names) still selects its file set by this ladder, then
reads the full diffs of that set.

## Anti-patterns

| Pattern | Why it fails |
|---|---|
| Restating the ladder in a consumer skill | Five copies drift independently — the exact ambiguity this file retired |
| "Against the base branch or recent commits" | Which base? How recent? Unspecified choices make scope nondeterministic |
| Composing rung 2 as one `$(...)` command | Worktree sessions refuse composed forms; the two-command form works everywhere |
