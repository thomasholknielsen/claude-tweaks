# Open Items — #764: backlog refine: Apply step doesn't reverify live label state before writing

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | 3c-high: reverify's own `gh issue view` fetch had no specified failure branch (could fall through to write on unread premise) | fixed | commit 186feb7d — fail-closed to skip on fetch failure |
| 2 | review | 3c-medium: a fetch failure would misrepresent as a FAILED write via the generic template | fixed | commit 186feb7d — routed through the existing AUTO-skipped template instead |
| 3 | review | 3c-low: local-files `readRecord` failure had no failure-mode clause | fixed | commit 186feb7d — same fail-closed-to-skip rule applied |
| 4 | review | 3a-low: no-op skips reused the "premise changed" log wording, mislabeling a no-op as a race | fixed | commit 186feb7d — no-op case logs nothing (option a) |
| 5 | review | 3a-low: flag-back reverify checks labels only, not the body-shape signal behind Step 3.5's downgrade | fixed | commit 186feb7d — added an explicit accepted-scope-gap sentence, not implemented (narrower, separately-scoped per the finding) |
| 6 | review | 3f-medium: cross-reference regex `/tidy.*step-6-auto\.md/s` didn't pin adjacency | fixed | commit 186feb7d — tightened to a bounded-distance match on the actual cited sentence |
| 7 | review | 3f-low: vacuous final AC1 test duplicated test 1's coverage with no red-proof | fixed | commit 186feb7d — deleted (test 1 already covers it; AC1 grep is independently runnable) |
| 8 | ops | `skills/backlog/refine-mode.md` at 40946/40960 bytes (14 bytes headroom) — next edit will fail the ceiling test | accepted | filed #845 (priority:high) for a sub-file split; this run's own edits are complete and don't need further headroom |
