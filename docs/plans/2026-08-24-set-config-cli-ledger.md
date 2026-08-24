# Open Items — wrap-up/review: ceremony-escape-hatch config.yml downgrade cannot be persisted from a worktree session (#1376)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build/ops | `checkBookkeepingStampsGate`'s record-pr branch (bin/lib/hooks/pre-tool-use.js ~line 983) deadlocks the sanctioned PR-early lifecycle in the owning session: `_shared/pr-early-run-lifecycle.md` Step 2's `git push` is itself a covered git write, denied while `run-state.json.pr` is unset — but the PR cannot be created before the branch is pushed. Only escape is logging the "FAILED" degrade line (hasLoggedPrDegrade), which this run did (see decisions.md 18:42:41) before retrying push + opening PR #1406. Gate needs a push exemption (or equivalent) for the PR-early Step 2 push (reason-not-auto: plugin-code fix outside this record's scope — needs its own backlog record at wrap-up routing) | open | — |
