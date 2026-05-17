# Pipeline Creative Opportunities Survey

Loaded by /flow Step 5 (Present Pipeline Summary) when survey is enabled (default in `auto` and `interactive`; the wrapper handles `{skipped}` returns silently).

The survey produces the **Creative Opportunities** block rendered before Next Actions — ranked recommendations for creative Impeccable commands the user might want to run manually. Flow never invokes these commands automatically.

## When to run

Run the survey before rendering the Pipeline Summary, after the resolve gate completes (nothing-left-behind). Decline detection runs **before** the survey call so the wrapper can suppress repeatedly-declined recommendations.

## Survey procedure

**Creative Opportunities survey (v4.5.0).** Before rendering the summary, invoke `/claude-tweaks:design survey <changed-files>` against the full diff produced by the pipeline. The wrapper analyzes the diff heuristically (no screenshots are passed — `/flow` does not maintain its own browser session) and returns ranked recommendations for creative commands the user might want to run manually. Render the recommendations as a Creative Opportunities block (template in SKILL.md Step 5) before the Next Actions block.

Handle the wrapper return:

| Return shape | Action |
|--------------|--------|
| `{result: "ok", recommendations: [...]}` non-empty | Render the Creative Opportunities block from the template. Write the wrapper's `recommendations` cache (the wrapper does this itself — `docs/plans/...-recommendations.json`). |
| `{result: "ok", recommendations: []}` | Omit the block. Survey ran but matched nothing — not a failure. |
| `{skipped: ...}` | Omit the block. Skip reasons are non-frontend, no Impeccable, integration disabled — none of these warrant surfacing in the summary. |

## Decline detection

**`/flow` owns the decline-detection algorithm.** The `/claude-tweaks:design survey` wrapper is a read-only consumer: it reads the declined cache that `/flow` writes (and the `suppressed_count` the wrapper surfaces back is just the count of entries `survey` chose to drop based on that cache). `/flow` is the only writer of `docs/plans/...-declined.json` because it is the only caller that has both the prior recommendations cache AND the new pipeline diff to compare against.

**Decline detection (Phase 3).** Before invoking survey, read the prior `docs/plans/...-recommendations.json` cache (if it exists) for this spec. After the new pipeline diff is final (post-polish, post-re-verify), compare the prior recommendations against the diff:

- For each prior recommendation, check whether its expected file changes appear in the new diff. The expected change is "the suggested command was invoked and modified the recommended page" — heuristic: file paths that the recommendation's `page` substring matches AND have a polish-style diff signature (touched between the previous and current pipeline run).
- For prior recommendations whose expected changes did NOT appear, increment `decline_count` for that `(command, page)` in `docs/plans/...-declined.json`. Initialize the entry if absent.
- The wrapper's survey call (next step) reads this declined cache and suppresses observations whose `decline_count >= 2`.

Decline detection runs only when a prior recommendations cache exists for the same spec. First-run flows have no prior recommendations to compare against — skip detection silently. Reset path for the user: `/claude-tweaks:design reset-recommendations <spec>` deletes the declined cache.
