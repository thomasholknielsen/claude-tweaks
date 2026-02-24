# QA Review Procedures

Structured YAML story execution with parallel agents, dependency tiers, and pass/fail reporting. This file contains the detailed procedures for the `qa` review mode of `/claude-tweaks:review`.

## Prerequisites

- YAML stories must exist in `stories/` (or custom dir specified with `dir=`)
- A browser backend must be available (playwright-cli or Chrome MCP)

Check availability:
1. Check `playwright-cli`: `command -v playwright-cli >/dev/null 2>&1`
2. Fall back to Chrome MCP: check if `mcp__claude_in_chrome__navigate` tool exists
3. If neither: **stop** and suggest `/claude-tweaks:setup` (Step 6) or `/claude-tweaks:stories` to generate stories

If no stories exist, suggest:
```
No user stories found in `{STORIES_DIR}/*.yaml`. Generate stories with `/claude-tweaks:stories <url>` or create YAML files manually. Use `dir=<path>` to specify a custom directory.
```

## Variables

Parse from `$ARGUMENTS` after the `qa` keyword (keyword detection, case-insensitive):

| Variable | Default | Keyword | Description |
|----------|---------|---------|-------------|
| HEADED | `true` | `headless` | Set to `false` for invisible browser windows |
| VISION | `false` | `vision` | Screenshots returned in context (Playwright only) |
| BROWSER | `auto` | `browser=<value>` | `auto`, `playwright`, or `chrome` |
| STORIES_DIR | `stories` | `dir=<path>` | Directory containing story YAML files |
| SINGLE_STORY | — | `story=<name>` | Run only matching story (substring match) |
| TAG_FILTER | — | `tag=<tag>` | Only run stories with this tag |
| PRIORITY_FILTER | — | `priority=<level>` | Only run stories at or above threshold (high > medium > low) |
| RETRY_RUN_DIR | — | `retry=<path>` | Re-run only failed stories from a previous run |
| MAX_PARALLEL | `4` | `max_parallel=N` | Max concurrent Playwright agents per tier. Chrome is always 1. |
| AGENT_TIMEOUT | `300000` | — | Agent timeout in milliseconds |
| SCREENSHOTS_BASE | `screenshots/qa` | — | Base directory for screenshots |
| RUN_DIR | `{SCREENSHOTS_BASE}/{timestamp}_{uuid}` | — | Generated once at start of run |

## Phase 1: Discover

1. **Retry mode check:** If RETRY_RUN_DIR is set:
   a. Read `{RETRY_RUN_DIR}/report.json`
   b. Extract the list of story IDs with `"status": "FAIL"`
   c. If no failures found, report "No failures to retry in {RETRY_RUN_DIR}" and stop
   d. Continue discovery as normal, but filter to only the failed story IDs

2. Use the Glob tool to find all files matching `{STORIES_DIR}/*.yaml`
3. If a filename filter remains from arguments, filter the file list to only include matching files
4. Read each YAML file and parse the `stories` array
5. If a file fails to parse, log a warning and skip it
6. Build a flat list of all stories across all files, tracking which source file each story came from
7. If SINGLE_STORY is provided, filter to only stories whose name contains that substring (case-insensitive)
8. **Apply filters:**
   - **Retry filter:** If RETRY_RUN_DIR was set, keep only stories whose `id` is in the failed IDs list
   - **Tag filter:** If TAG_FILTER is set, keep only stories that have a `tags` array containing the specified tag
   - **Priority filter:** If PRIORITY_FILTER is set, keep only stories at or above the threshold. Priority ranking: `high` > `medium` > `low`. Stories without `priority` are treated as `medium`.
9. If no stories remain after filtering, report and stop
10. Generate `RUN_DIR`:
    ```bash
    RUN_DIR="screenshots/qa/$(date +%Y%m%d_%H%M%S)_$(uuidgen | tr '[:upper:]' '[:lower:]' | head -c 6)"
    ```
11. For each story, build its `SCREENSHOT_PATH`:
    - `{RUN_DIR}/{file-stem}/{story-id-or-slug}/`
    - Example: `screenshots/qa/20260210_143022_a1b2c3/myapp-customer/checkout-flow-completes/`

12. **Resolve browser preference per story:**
    - If run-level BROWSER is set (not `auto`): all stories use that backend
    - Otherwise: use each story's `browser:` field (default `auto`)

## Phase 2: Dependency Resolution

13. Build a dependency graph from `depends_on` fields:
    - **Tier 0:** Stories with no `depends_on` (or whose dependency is not in the current run)
    - **Tier 1:** Stories that depend on a Tier 0 story
    - **Tier 2:** Stories that depend on a Tier 1 story (and so on)
    - Stories within the same tier can run in parallel
    - A tier only starts after all stories in the previous tier have completed
    - If a story's dependency **failed**, mark the dependent story as **SKIPPED**

14. **Separate Chrome stories:** Within each tier, split stories into:
    - **Playwright batch:** stories resolving to Playwright — run in parallel
    - **Chrome batch:** stories resolving to Chrome — run sequentially after the Playwright batch

## Phase 3: Spawn

15. For each tier (starting from Tier 0):

    a. **Playwright batch — parallel with concurrency cap:**
       Split the Playwright batch into sub-batches of MAX_PARALLEL size (default 4). Dispatch each sub-batch as parallel Task agents (subagent_type: `qa-agent`), wait for completion, then spawn the next sub-batch.

    b. **Chrome batch — sequential:**
       After the Playwright batch completes, dispatch Chrome-batch agents one at a time.

16. **Detect story format** for each story:
    - If the story has a `steps` array -> structured format
    - If the story has a `workflow` string -> legacy format

17. For each Task call, use the appropriate prompt template:

**Structured format prompt:**
```
Execute this user story and report results:

**ID:** {story.id}
**Story:** {story.name}
**URL:** {story.url}
**Browser:** {resolved browser preference for this story}
**Headed:** {HEADED}
**Vision:** {VISION}

**Viewport:** {story.viewport or setup.viewport or omit}

**Setup:**
{serialize setup block as YAML, if present}

**Teardown:**
{serialize teardown block as YAML, if present}

**Steps:**
{serialize story.steps as YAML}

Instructions:
- The URL above will be auto-navigated before steps execute
- Follow each step in the steps array sequentially
- For action steps: try the selector first (fast path), fall back to snapshot + target match
- For verify-only steps: snapshot the page and evaluate the assertion
- Take a screenshot after each step
- Save ALL screenshots to: {SCREENSHOT_PATH}
- Report each step as PASS or FAIL with a brief explanation
- At the end, provide a summary: total steps, passed, failed
- Use this exact format for your final summary line:
  RESULT: {PASS|FAIL} | ID: {story.id} | Steps: {passed}/{total}
```

**Legacy format prompt:**
```
Execute this user story and report results:

**ID:** {story.id or "legacy-" + slugified-name}
**Story:** {story.name}
**URL:** {story.url}
**Browser:** {resolved browser preference for this story}
**Headed:** {HEADED}
**Vision:** {VISION}

**Workflow:**
{story.workflow}

Instructions:
- Follow each step in the workflow sequentially
- Take a screenshot after each significant step
- Save ALL screenshots to: {SCREENSHOT_PATH}
- Report each step as PASS or FAIL with a brief explanation
- At the end, provide a summary: total steps, passed, failed
- Use this exact format for your final summary line:
  RESULT: {PASS|FAIL} | ID: {story.id or "legacy-" + slugified-name} | Steps: {passed}/{total}
```

18. After each tier completes, check results before spawning the next tier. If any story failed, mark its dependents as SKIPPED.

## Phase 4: Collect

19. Parse each agent's report to extract:
    - Story ID (from the `RESULT:` line or `REPORT_JSON` comment)
    - Overall result: PASS or FAIL
    - Steps completed vs total (from the `Steps: X/Y` portion)
    - The full agent report text
20. Be resilient: if an agent times out or crashes, mark that story as FAIL and include whatever output was available

## Phase 5: Report

21. Write report artifacts to disk:

**`{RUN_DIR}/report.json`** — machine-readable:
```json
{
  "run_dir": "{RUN_DIR}",
  "timestamp": "ISO-8601",
  "stories_dir": "{STORIES_DIR}",
  "browser": "{BROWSER}",
  "filters": {
    "tag": "{TAG_FILTER or null}",
    "priority": "{PRIORITY_FILTER or null}",
    "retry": "{RETRY_RUN_DIR or null}"
  },
  "summary": {
    "total": N,
    "passed": N,
    "failed": N,
    "skipped": N
  },
  "stories": [
    {
      "id": "story-id",
      "name": "Story name",
      "source_file": "filename.yaml",
      "browser": "playwright|chrome",
      "status": "PASS|FAIL|SKIPPED",
      "steps_passed": N,
      "steps_total": N,
      "error": null,
      "screenshot_dir": "{SCREENSHOT_PATH}"
    }
  ]
}
```

**`{RUN_DIR}/report.md`** — human-readable (same format as the report below).

22. Present the aggregated results:

```
# QA Review Summary

**Run:** {current date and time}
**Stories directory:** {STORIES_DIR}
**Browser:** {BROWSER}
**Filters:** {list active filters, or "none"}
**Stories:** {total} total | {passed} passed | {failed} failed | {skipped} skipped
**Status:** ALL PASSED | PARTIAL FAILURE | ALL FAILED

## Results

| #   | ID           | Story        | Source File | Browser    | Status  | Steps            |
| --- | ------------ | ------------ | ----------- | ---------- | ------- | ---------------- |
| 1   | {story.id}   | {story name} | {filename}  | playwright | PASS    | {passed}/{total} |
| 2   | {story.id}   | {story name} | {filename}  | chrome     | FAIL    | {passed}/{total} |
| 3   | {story.id}   | {story name} | {filename}  | playwright | SKIPPED | —                |

## Skipped (dependency failures)

(Only include if there are skipped stories)

| Story ID     | Story Name   | Blocked By   |
| ------------ | ------------ | ------------ |
| {story.id}   | {story name} | {dep id}     |

## Failures

(Only include this section if there are failures)

### Story: {failed story name}
**ID:** {story.id}
**Source:** {filename}
**Browser:** {browser}
**Agent Report:**
{full agent report for this story}

---

(Repeat for each failed story)

## Screenshots
All screenshots saved to: `{RUN_DIR}/`

## Report Files
- Machine-readable: `{RUN_DIR}/report.json`
- Human-readable: `{RUN_DIR}/report.md`
```

Use ALL PASSED for status only when every story passed (excluding skipped). Use PARTIAL FAILURE when some passed and some failed. Use ALL FAILED when none passed.

## Gate for /flow

When QA review is part of a `/claude-tweaks:flow` pipeline:
- **ALL PASSED** → proceed to the next step
- **Any failures** → **STOP** the pipeline and present the failure report
