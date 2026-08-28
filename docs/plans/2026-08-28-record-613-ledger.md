# Open Items — tidy worktree scan: reclaim net-empty branches (#613)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | High-severity lens 3c (Error Handling) finding: `plugin/skills/tidy/step-6-auto.md:48`'s net-empty override text groups `dirty: unknown` with `dirty: true` as blocking the `-D` delete, but the general "Dirty-worktree override" it cites (`scan-procedures.md:146-150`, pre-existing #1424 text) explicitly states `dirty: unknown` does NOT block. Ambiguous precedence on a destructive git operation. | open | Staged — `staged/review-1.patch` |
| 2 | review | Medium-severity lens 3c finding: net-empty collect-line string mismatch between `scan-procedures.md` and `step-6-auto.md`. | fixed | Auto-applied — commit 8fb95ba25 |
| 3 | review | Low-severity lens 3c finding: net-empty check's merge-base/diff-error failure mode left unnamed. | fixed | Auto-applied — commit 8fb95ba25 |
