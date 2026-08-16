# Open Items — #535: Lever attribution field in the auto-decision log and Review Console

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | ops | Pre-flight divergence: origin/main is 25 commits ahead of worktree HEAD (2 local commits: consumed design-doc add/delete). Build's unconditional catch-up merge must reconcile before implementation. reason-not-auto: divergence noted pre-merge; resolved by build Common Step 1 catch-up | fixed | Catch-up merge of origin/main completed cleanly (merge commit before 847bdf5c materialize; ort strategy, no conflicts) |
| 2 | review | Final review minor: `skills/research/verify-mode.md:113` carries a verbatim copy of the auto-decision-log entry grammar, now missing the new optional lever element — the exact multi-copy drift the state-once rule prevents. Outside #535's AC-5 file list | open | — |
| 3 | review | Final review minor: `skills/wrap-up/review-console.md:113`/`:209` fast-lane auto-merge log templates consult the same levers but were left un-adopted — file has no byte headroom under the 40KB ceiling (40,899/40,960 after fix). Deferred under the contract's adopt-when-touched rule | open | — |
| 4 | review/hindsight | review-console.md sits 61 bytes under the 40KB sub-file ceiling — next edit fails tests; blocks item #3's deferred adoptions | deferred | Staged as Queue-write candidate at Review Console (staged/reflect-1.md) |
| 5 | review/hindsight | plan-audit Check A has no byte-headroom warning — #535's ceiling collision reached final review before being caught | deferred | Staged as Queue-write candidate at Review Console (staged/reflect-2.md) |
