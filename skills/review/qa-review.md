# QA Review Procedures

Structured YAML story execution with parallel agents, dependency tiers, and pass/fail reporting. Invoked by `/claude-tweaks:test qa` and `/claude-tweaks:test all`.

## Prerequisites

- YAML stories must exist in `stories/` (or custom dir specified with `dir=`)
- A running dev server URL must be available
- A browser backend must be available (playwright-cli or Chrome MCP)

### URL Resolution

When QA is triggered automatically (by `/claude-tweaks:test` in a `/claude-tweaks:flow` pipeline, or via `/claude-tweaks:test qa`), the dev server URL is auto-detected using the shared procedure from `dev-url-detection.md` in the `/claude-tweaks:stories` skill's directory. Stories may also contain their own URLs.

### Browser Check

1. Check `playwright-cli`: run `playwright-cli --version` and check if it succeeds
2. Fall back to Chrome MCP: check if `mcp__claude_in_chrome__navigate` tool exists
3. If neither: **stop** and suggest `/claude-tweaks:setup` (Step 6) or `/claude-tweaks:stories` to generate stories

### Story Check

If no stories exist, suggest:
```
No user stories found in `{STORIES_DIR}/*.yaml`. Generate stories with `/claude-tweaks:stories` or create YAML files manually. Use `dir=<path>` to specify a custom directory.
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
    RUN_DIR="screenshots/qa/{YYYYMMDD}_{HHMMSS}_{6-char-random-hex}"
    # Generate the timestamp and random suffix using a cross-platform method:
    # node -e "const d=new Date();console.log('screenshots/qa/'+d.toISOString().replace(/[-T:.Z]/g,'').slice(0,15)+'_'+require('crypto').randomBytes(3).toString('hex'))"
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

## Phase 2.5: Auth Pre-flight

Before dispatching any tier, check whether auth cookie injection is needed:

15. **Check auth requirements:** Scan all stories in the run for `requires: [auth]` or a `setup.auth` block. If none require auth, skip to Phase 3.

16. **Resolve auth credentials:**

    a. **Check for auth config:** Use the Glob tool to check for `{STORIES_DIR}/auth.yml`.

    b. **Config exists — resolve profiles:**
       - Read and parse `{STORIES_DIR}/auth.yml`.
       - For each story with `setup.auth` as a **string** (profile name): look up the named profile. If the profile exists, resolve its `url`, `username`, and `password` into the story's auth config. If the profile does not exist, log a warning: "Auth profile '{name}' not found in {STORIES_DIR}/auth.yml — falling back to per-story auth." and skip profile resolution for that story. If the story also has no inline `setup.auth` block, auth will be skipped for that story.
       - For each story with `requires: [auth]` but no `setup.auth` block: resolve the `default` profile. If no `default` profile exists, log a warning: "No 'default' auth profile in {STORIES_DIR}/auth.yml — stories with `requires: [auth]` will attempt auth without credentials."
       - For each story with `setup.auth` as an **object** (inline credentials): use the inline credentials as-is (backward compatible). Substitute `${VAR}` references from environment variables.
       - Resolve relative URLs: if a profile's `url` does not start with `http`, prepend `APP_URL`.

    c. **Config missing — use inline credentials:**
       - Read the auth config from the first story that has a `setup.auth` object (or the file-level setup auth block).
       - Substitute `${VAR}` references from environment variables.
       - This is the existing behavior.

17. **Run auth once per unique profile:** For each unique set of resolved credentials (typically one `default` profile, but possibly multiple if stories reference different profiles):
    a. Open a dedicated session: `playwright-cli -s=auth-{profile-name} open <auth.url>`
    b. Fill username/password fields and submit the form.
    c. Wait for the auth flow to complete (page navigation or success indicator).
    d. Capture cookies:
       ```bash
       playwright-cli -s=auth-{profile-name} evaluate "JSON.stringify(await page.context().cookies())"
       ```
    e. Store cookies in `AUTH_COOKIES_MAP[profile-name]`. When only one profile is used, also set `AUTH_COOKIES` directly for backward compatibility.
    f. Close the session: `playwright-cli -s=auth-{profile-name} close`

18. **Fallback on auth failure:** If the auth flow fails (login error, timeout, unexpected page state), log a warning and fall back to per-story auth — each story will handle its own resolved auth credentials independently.

The captured cookies (from `AUTH_COOKIES` or `AUTH_COOKIES_MAP`) are passed to each story agent that requires auth (see prompt templates in Phase 3). The qa-agent uses `page.context().addCookies()` to inject them before navigation and skips the story's `setup.auth` block when cookies are present.

## Phase 3: Spawn

20. For each tier (starting from Tier 0):

    a. **Playwright batch — streaming slot-fill:**

       Use a queue-based model to maximize concurrency. Instead of dispatching sub-batches and waiting for all to complete before starting the next sub-batch, fill slots as they open:

       ```
       Queue = [all Playwright stories in this tier]
       Active = {}          # map of agent_id -> story
       Results = []

       # Initial fill — dispatch up to MAX_PARALLEL agents
       While Active.size < MAX_PARALLEL and Queue is not empty:
         story = Queue.shift()
         agent = Task(story_prompt, run_in_background=true)
         Active[agent.id] = story

       # Streaming loop — poll and refill
       While Active is not empty:
         For each agent_id in Active:
           result = TaskOutput(agent_id, block=false)
           If result is complete:
             Active.remove(agent_id)
             Results.push(result)
             # Immediately fill the open slot
             If Queue is not empty:
               next_story = Queue.shift()
               next_agent = Task(next_story_prompt, run_in_background=true)
               Active[next_agent.id] = next_story
         # Brief pause before next poll cycle to avoid busy-waiting
       ```

       **Implementation with the Task tool:** Dispatch agents with `run_in_background=true`. Poll active agents using `TaskOutput` with `block=false`. When any agent completes, collect its result and immediately dispatch the next queued story into the open slot. Continue until both the queue and the active set are empty.

       **Progress updates:** After each completion, emit a progress line:
       ```
       Story {completed_count}/{total_count} completed ({active_count} active, {queue_count} queued)
       ```

    b. **Chrome batch — sequential:**
       After the Playwright batch completes, dispatch Chrome-batch agents one at a time. Chrome execution is unchanged — it remains strictly sequential.

21. **Detect story format** for each story:
    - If the story has a `steps` array -> structured format
    - If the story has a `workflow` string -> legacy format

22. For each Task call, use the appropriate prompt template. If auth cookies were captured in Phase 2.5 and the story requires auth, include the `**Cookies:**` field in the prompt. When multiple profiles are in use, select the cookies from `AUTH_COOKIES_MAP` matching the story's auth profile:

**Structured format prompt:**
```
Execute this user story and report results:

**ID:** {story.id}
**Story:** {story.name}
**URL:** {story.url}
**Browser:** {resolved browser preference for this story}
**Headed:** {HEADED}
**Vision:** {VISION}
**Cookies:** {AUTH_COOKIES JSON string from the story's resolved auth profile, or omit if no cookies captured / story does not require auth}

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
  RESULT: {PASS|PASS_WITH_CAVEATS|FAIL} | ID: {story.id} | Steps: {passed}/{total}
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
**Cookies:** {AUTH_COOKIES JSON string from the story's resolved auth profile, or omit if no cookies captured / story does not require auth}

**Workflow:**
{story.workflow}

Instructions:
- Follow each step in the workflow sequentially
- Take a screenshot after each significant step
- Save ALL screenshots to: {SCREENSHOT_PATH}
- Report each step as PASS or FAIL with a brief explanation
- At the end, provide a summary: total steps, passed, failed
- Use this exact format for your final summary line:
  RESULT: {PASS|PASS_WITH_CAVEATS|FAIL} | ID: {story.id or "legacy-" + slugified-name} | Steps: {passed}/{total}
```

23. **Record start time** for each story when it is dispatched and elapsed time when it completes (wall-clock seconds). Store timing data alongside the result for use in Phase 5.

24. After each tier completes, check results before spawning the next tier. If any story failed, mark its dependents as SKIPPED.

## Phase 4: Collect

25. Parse each agent's report to extract:
    - Story ID (from the `RESULT:` line or `REPORT_JSON` comment)
    - Overall result: PASS, PASS_WITH_CAVEATS, or FAIL
    - Steps completed vs total (from the `Steps: X/Y` portion)
    - Caveats array (from the `REPORT_JSON` comment's `caveats` field — may be empty)
    - Recovered selectors array (from the `REPORT_JSON` comment's `recovered_selectors` field — may be empty)
    - The full agent report text
    - Elapsed time (from the timing data recorded in Phase 3, step 23)
26. Be resilient: if an agent times out or crashes, mark that story as FAIL and include whatever output was available

### Finding Classification

After collecting all agent reports, classify each failure into one of 5 categories using heuristic rules. Classification is automated — override categories in the findings table if needed.

| Category | Signal | Default Severity | Suggested Fix Pattern |
|----------|--------|-----------------|----------------------|
| `stale-selector` | Error contains "selector not found" or "element not found" | Low | "Update selector in story YAML" |
| `code-bug` | Error contains "assertion" or "expected" or "verify failed" | High | "Investigate component behavior" |
| `ux-issue` | From caveats (PASS_WITH_CAVEATS stories) | Medium | Specific to the observation |
| `flaky-env` | Error contains "timeout" or "navigation failed" or "net::" | Low | "Re-run: `/test qa retry={RUN_DIR}`" |
| `story-bug` | Element exists but in wrong position, or step instructions don't match current UI flow | Medium | "Regenerate story: `/stories focus={area}`" |

**Classification rules (apply in order — first match wins):**
1. Error contains "selector not found" or "element not found" -> `stale-selector`
2. Error contains "timeout" or "navigation failed" or "net::" -> `flaky-env`
3. Error contains "assertion" or "expected" or "verify failed" -> `code-bug`
4. Error suggests the page structure changed (element exists but in wrong position) -> `story-bug`
5. No error match -> `code-bug` (default for unclassified failures)

**Caveat-to-finding conversion:** Each caveat from a PASS_WITH_CAVEATS story generates a `ux-issue` finding with severity Medium. These are informational and do not block the gate.

**Auto-recovered selector classification:** When a selector was auto-recovered by the qa-agent (present in the `recovered_selectors` array), classify it as `stale-selector` with status `auto-fixed` rather than `open`. These do not block the gate — the selector has already been corrected in the story YAML (see Phase 4.5).

## Phase 4.5: Apply Selector Recoveries

After ALL agents in a tier complete (not during execution — to avoid file write conflicts between parallel agents), apply any recovered selectors to the story YAML files.

**Important:** This phase runs once per tier, after Phase 4 (Collect) finishes for that tier. Recovered selectors are buffered by each qa-agent in its report — the agent never writes to YAML files directly.

**Procedure:**

1. Collect all `recovered_selectors` arrays across all agent reports in this tier. If none have recoveries, skip this phase.

2. Group recoveries by source YAML file (tracked in Phase 1, step 6 — each story knows which file it came from).

3. For each source file with recoveries:
   a. Read the YAML file using the Read tool.
   b. For each recovery in this file:
      - Find the story by its ID within the `stories` array.
      - Find the step by the `step_index` from the recovery record.
      - Replace the old `selector:` value with the recovered selector.
      - Add a YAML comment on the line above: `# auto-recovered from: {original_selector}`
   c. Use the Edit tool for each targeted replacement — do not rewrite the entire file. This preserves comments, ordering, and formatting.

4. Log a summary after all updates:
   ```
   Auto-recovered {N} selector(s) in {M} story file(s)
   ```

**Example Edit tool usage:**
```
old_string: '    selector: "#old-submit-btn"'
new_string: '    # auto-recovered from: #old-submit-btn\n    selector: "[data-testid=\"submit\"]"'
```

**Conflict avoidance:** Because this phase runs only after all agents in a tier have completed, there is no risk of concurrent writes to the same YAML file. If the same file has recoveries from multiple agents (multiple stories in the same file), apply them sequentially within this phase.

## Phase 5: Report

27. Record the total wall-clock time for the entire run (from the start of Phase 3 to the end of Phase 4).

28. Write report artifacts to disk:

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
    "pass_with_caveats": N,
    "failed": N,
    "skipped": N
  },
  "timing": {
    "wall_clock_seconds": N,
    "parallelism_factor": N.N
  },
  "findings": [
    {
      "story_id": "story-id",
      "category": "stale-selector|code-bug|ux-issue|flaky-env|story-bug",
      "severity": "Low|Medium|High",
      "finding": "Description of the finding",
      "suggested_fix": "Suggested remediation"
    }
  ],
  "caveats": [
    {
      "story_id": "story-id",
      "observation": "Observation text from the agent"
    }
  ],
  "recovered_selectors": [
    {
      "story_id": "story-id",
      "source_file": "filename.yaml",
      "step_index": 0,
      "original_selector": "old-selector",
      "recovered_selector": "new-selector",
      "target": "target description"
    }
  ],
  "stories": [
    {
      "id": "story-id",
      "name": "Story name",
      "source_file": "filename.yaml",
      "browser": "playwright|chrome",
      "status": "PASS|PASS_WITH_CAVEATS|FAIL|SKIPPED",
      "steps_passed": N,
      "steps_total": N,
      "elapsed_seconds": N,
      "error": null,
      "caveats": [],
      "screenshot_dir": "{SCREENSHOT_PATH}"
    }
  ]
}
```

The `summary.passed` count includes both PASS and PASS_WITH_CAVEATS stories (since caveats are informational). The `summary.pass_with_caveats` count is the subset of passed stories that had caveats. The `findings` array contains classified failure findings and caveat-derived ux-issue findings. The `caveats` array contains raw observations from PASS_WITH_CAVEATS stories. The `recovered_selectors` array contains all selector recoveries across all stories — each entry includes the source file and step index so the YAML update can be traced.

**`{RUN_DIR}/report.md`** — human-readable (same format as the report below).

29. Present the aggregated results:

```
# QA Review Summary

**Run:** {current date and time}
**Stories directory:** {STORIES_DIR}
**Browser:** {BROWSER}
**Filters:** {list active filters, or "none"}
**Stories:** {total} total | {pass} pass | {pass_with_caveats} pass (caveats) | {fail} fail | {skip} skipped
**Status:** ALL PASSED | PASSED WITH OBSERVATIONS | PARTIAL FAILURE | ALL FAILED

## Findings (action required)

(Only include if there are findings from failures)

| #   | Story        | Category         | Severity | Finding                          | Suggested Fix                       |
| --- | ------------ | ---------------- | -------- | -------------------------------- | ----------------------------------- |
| 1   | {story name} | stale-selector   | Low      | Selector "#old-btn" not found    | Update selector in story YAML       |
| 2   | {story name} | code-bug         | High     | Expected "Dashboard" in title    | Investigate component behavior      |

> Classification is automated — override categories in the findings table if needed.

## Observations (informational)

(Only include if there are caveats from PASS_WITH_CAVEATS stories)

| #   | Story        | Observation                                    |
| --- | ------------ | ---------------------------------------------- |
| 1   | {story name} | Missing aria-label on 3 interactive element(s) |
| 2   | {story name} | Page load took 4.2s                            |

## Recovered Selectors

(Only include if any selectors were auto-recovered during the run)

Auto-recovered {N} selector(s) in {M} story file(s). Story YAML files have been updated.

| #   | Story        | Step             | Original             | Recovered                |
| --- | ------------ | ---------------- | -------------------- | ------------------------ |
| 1   | {story name} | Step description | #old-selector        | [data-testid="submit"]   |
| 2   | {story name} | Step description | .stale-class         | #new-unique-id           |

## Results

| #   | ID           | Story        | Source File | Browser    | Status            | Steps            | Elapsed |
| --- | ------------ | ------------ | ----------- | ---------- | ----------------- | ---------------- | ------- |
| 1   | {story.id}   | {story name} | {filename}  | playwright | PASS              | {passed}/{total} | {N}s    |
| 2   | {story.id}   | {story name} | {filename}  | playwright | PASS_WITH_CAVEATS | {passed}/{total} | {N}s    |
| 3   | {story.id}   | {story name} | {filename}  | chrome     | FAIL              | {passed}/{total} | {N}s    |
| 4   | {story.id}   | {story name} | {filename}  | playwright | SKIPPED           | —                | —       |

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

## Timing

| Story        | Elapsed | Status            |
| ------------ | ------- | ----------------- |
| {story.id}   | {N}s    | PASS              |
| {story.id}   | {N}s    | PASS_WITH_CAVEATS |
| {story.id}   | {N}s    | FAIL              |

**Total wall-clock:** {M}m {S}s
**Parallelism factor:** {stories_run / (wall_clock / avg_story_time)}

(Parallelism factor indicates effective concurrency: 1.0 means fully serial, 4.0 means four stories ran in parallel on average. Only stories with PASS, PASS_WITH_CAVEATS, or FAIL status are counted — SKIPPED stories are excluded.)

## Screenshots
All screenshots saved to: `{RUN_DIR}/`

## Report Files
- Machine-readable: `{RUN_DIR}/report.json`
- Human-readable: `{RUN_DIR}/report.md`
```

**Status determination:**
- **ALL PASSED** — every story passed (PASS or PASS_WITH_CAVEATS), no failures (excluding skipped)
- **PASSED WITH OBSERVATIONS** — every story passed but at least one has PASS_WITH_CAVEATS status
- **PARTIAL FAILURE** — some stories passed and some failed
- **ALL FAILED** — no stories passed

## Phase 5.5: Ledger Integration

After reporting, write QA findings and observations to the open items ledger so they flow through `/claude-tweaks:review` and `/claude-tweaks:wrap-up`.

30. **Locate the ledger:**
    - Check for an existing ledger file matching `docs/plans/*-ledger.md` (e.g., from `/claude-tweaks:flow` or `/claude-tweaks:build`).
    - If running inside a `/claude-tweaks:flow` pipeline, the ledger was created at pipeline start — use that file.
    - If running standalone and no ledger exists, create `docs/plans/{YYYY-MM-DD}-qa-ledger.md` with the standard ledger table header:
      ```markdown
      # QA Open Items Ledger

      | # | Phase | Finding | Severity | Status | Resolution |
      |---|-------|---------|----------|--------|------------|
      ```

31. **Write finding entries:** For each item in the `findings[]` array (from the report), append a row to the ledger table:
    ```markdown
    | {N} | test/qa | {finding} [story: {story_id}, category: {category}] | {severity} | open | — |
    ```
    These entries have status `open` and represent failures that must be resolved before the pipeline completes.

32. **Write caveat entries:** For each item in the `caveats[]` array (from the report), append a row to the ledger table:
    ```markdown
    | {N} | test/qa | {observation} [story: {story_id}] | Info | observation | — |
    ```
    These entries have status `observation` and severity `Info`. They are informational and do not block the pipeline.

33. **Dedup:** Before writing each entry, check whether a ledger entry for the same story ID and finding text already exists (from a previous QA run). If a matching entry exists, do not create a duplicate — leave the existing entry in place. Match by story ID and finding content, not by exact string comparison (minor wording differences across runs should still be detected as duplicates).

## Gate for /flow

When QA review is part of a `/claude-tweaks:test` run inside a `/claude-tweaks:flow` pipeline:
- **ALL PASSED** or **PASSED WITH OBSERVATIONS** → set `TEST_PASSED=true`, proceed to the next pipeline step (PASS_WITH_CAVEATS counts as passed — caveats are informational, not blocking)
- **Any failures** → **STOP** the pipeline and present the failure report
