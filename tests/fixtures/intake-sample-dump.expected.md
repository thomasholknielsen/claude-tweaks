# Graded expectations for intake-sample-dump.md

Compared by a human at dogfood time (spec 1704's AC 7). Every difference between
the dogfood run's rendered table and this file is explained in the PR body — no
test asserts the model's verdicts.

| F | Expected verdict | Why |
|---|---|---|
| 1 | shipped | Matches the merged commit subject "Tidy: delete 14 orphaned pipeline ledgers" |
| 2 | nudge | URL-only fragment — "what's in this?" |
| 3 | upstream (file in this repo — self-reference collapse) | Rule-1 claude-tweaks defect, but `$SELF_REPO` is true in this checkout, so it files instead |
| 4 | remember | A durable working preference, not a change to make |
| 5 | not-here | Off-repo — a personal blog, not this repo |
| 6 | file | New, relevant, actionable — a plausible `/claude-tweaks:tidy` flag idea |
| 7 | drop | Restatement of fragment 6 |
| 8 | nudge | Relevant but too vague — which skill, what backoff |
| 9 | not-here | Not actionable in this repo |
| 10 | file | New, relevant, actionable — a plausible `/claude-tweaks:capture` flag idea |
| 11 | remember | A durable working preference, not a change to make |
| 12 | not-here | Not actionable in this repo |
| 13 | nudge | Relevant but too vague — which review dimension, what accessibility check |
| 14 | not-here | Off-repo — a personal project idea, not this repo |
