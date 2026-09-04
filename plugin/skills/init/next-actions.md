# Init — Next Actions

Extracted from `SKILL.md` so that file stays under its own budget.

Resolve the recommended action from the signals that fired during this run. This lookup table is the assistant's own resolution logic — it stays internal and is never itself shown to the user or rendered as one of the markdown lines below. Resolve signals top-to-bottom; the first matching row is the recommendation. The last row is also the catch-all: the signal rows above it are not exhaustive over every possible post-init state (e.g. Update Mode completing a full pass with zero drift and no backlog writes matches none of them), so anything that doesn't match falls through to it, guaranteeing there is always a defined recommendation.

| Signal | Recommended Next Action |
|--------|------------------------|
| Update Mode ran AND total drift count > 0 | `/claude-tweaks:tidy` — clean up drifted/stale config and backlog items before resuming feature work |
| Backlog has work records written this run (deferred skills, pain points, doc work, skeleton enrichment) | `/claude-tweaks:tidy` — triage what /claude-tweaks:init just captured |
| Initial Mode ran AND backlog is empty | `/claude-tweaks:capture {idea}` — capture the first idea or feature into the backlog for triage |
| Everything is clean (Update Mode early-exit or a full pass ending with zero drift, OR Initial Mode with nothing routed to the backlog), or no row above matches | `/claude-tweaks:help` — see the full lifecycle overview and current pipeline status |

Once resolved to a single recommended row, render as plain markdown (docs/skill-authoring.md's Skill handoffs convention) — the resolved recommendation first, bolded, with `(recommended)`, plus the two "Always" lines below:

**{the resolved recommendation's full command text from the matched row}** — {short one-line summary of it} (recommended)
`/claude-tweaks:specify {first feature topic}` — jump straight to specifying the first lifecycle feature
`/claude-tweaks:tidy` — review backlog entries

If the resolved recommendation is itself `/claude-tweaks:tidy` (rows 1 or 2), it and the last line refer to the same command — collapse them into a single `(recommended)` line rather than repeating `/claude-tweaks:tidy` twice, leaving 2 lines for that render instead of 3.
