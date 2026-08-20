# Open Items — Worktree PreToolUse guard over-matches (#861)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | Doc `docs/hooks.md` covers changed areas (`plugin/bin/lib/hooks/**`) but wasn't updated for the #861 fix — its "Ambiguity resolves to allow" line (E1 denies only provable mismatches) is still accurate but doesn't yet call out the new foreign-repo case explicitly | observation | Informational (Lens 3i) — existing doc line remains correct; noting for wrap-up's docs curation to consider a one-line addition, not required |
| 2 | wrap-up | Residue sweep: merged branch `origin/worktree-record-627` not deleted (`remedy: auto`) | fixed | Deleted via `git push origin --delete worktree-record-627` |
| 3 | wrap-up | Residue sweep: merged branch `origin/worktree-record-789` not deleted (`remedy: auto`) | fixed | Deleted via `git push origin --delete worktree-record-789` |
| 4 | wrap-up | Residue sweep: merged branch `origin/worktree-record-893` not deleted (`remedy: auto`) | fixed | Deleted via `git push origin --delete worktree-record-893` |
| 5 | wrap-up | Residue sweep: PR #987 (head `worktree-record-861`) is open — this is this run's own PR, not outside its blast radius | accepted | This run's own in-flight PR; resolves via this same wrap-up's own Auto-merge/Review Console merge step, not a separate action |
