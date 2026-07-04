# Parallel Development with Worktrees + Merge Reconciliation

For true parallel execution, run separate terminals with `worktree` mode — each terminal gets an isolated copy of the repository:

```
# Terminal 1                          # Terminal 2                          # Terminal 3
/claude-tweaks:flow 42 worktree      /claude-tweaks:flow 45 worktree      /claude-tweaks:flow 48 worktree
```

Each terminal creates its own worktree and feature branch. There is no file overlap risk because each worktree is a full, isolated copy.

## When to use worktree mode

- **Parallel work** — multiple specs building simultaneously in separate terminals
- **Team projects** — isolated branches ready for PR review
- **Risky changes** — experiment without affecting the main working tree

## When to use current-branch mode

- **Solo work** — simple, sequential, fast
- **Quick specs** — low risk, no isolation needed
- **Single terminal** — no need for parallel execution

## Merge Reconciliation (after parallel worktree runs)

After all terminals complete, merge the feature branches back. Run this once from the main working tree:

Before the merge/finish handoff begins, clear each run's worktree assignment — merge and push happen in the main checkout legitimately, and the working-directory hook (E1) would otherwise deny them as a wrong-checkout commit. A single bare `close-run` closes only the newest run, so with multiple parallel terminals this is not enough: list `.claude-tweaks/pipelines/*/` and, for every run dir whose `run-state.json` status is not already `clean`, run `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run "$dir"` explicitly before starting the merge/finish sequence.

### Merge Order

1. Sort completed branches by diff size (smallest first — run `git diff --stat main..{branch}` and read the summary line at the end of its output)
2. Merge branches sequentially into the base branch

### Merge Procedure

For each completed branch (in order):

1. Merge into the base branch. For from-recon runs (any spec on the branch has `recon-issue:`
   frontmatter), the merge commit message must carry the closing keywords — one line per issue
   (see "Close-via-merge" in `_shared/issue-claims.md`):

   ```bash
   git merge --no-ff {branch} -m "Merge {branch} — specs {list}

   Fixes #{issue}
   Fixes #{issue2}"
   ```

   Otherwise a plain `git merge {branch}` is fine. The issues close when the user pushes the
   base branch to the default remote branch.
2. **If merge succeeds** — continue to the next branch
3. **If merge conflicts** — present the conflicts:
   ```
   Merge conflict merging {branch}:

   Conflicting files:
   - {file1}
   - {file2}

   1. Resolve conflicts now **(Recommended)** — I'll resolve based on both specs' intent
   2. Skip this branch — merge remaining branches first, come back to this one
   3. Abort all remaining merges — I'll handle merges manually
   ```
4. After all merges, update `specs/INDEX.md` to reflect completed specs

### Post-Merge Summary

```markdown
### Merge Results

| Branch | Spec | Merge Status |
|--------|------|-------------|
| {branch} | {N} | Merged cleanly |
| {branch} | {N} | Merged with conflict resolution |
| {branch} | {N} | Skipped (pipeline failed) |

### Next Actions
- Failed specs: fix issues and re-run `/claude-tweaks:flow {spec} worktree {remaining steps}`
- All merged: run `/claude-tweaks:help` for full pipeline status
```
