# QA Review Procedures

Structured YAML story execution with parallel agents, dependency tiers, and pass/fail reporting. Invoked by `/claude-tweaks:test qa` and `/claude-tweaks:test all`.

## Prerequisites

- YAML stories must exist in `stories/` (or custom dir specified with `dir=`)
- A running dev server URL must be available
- `agent-browser` must be installed. The daemon auto-starts on port 4848 with the first command. Recovery on crash: `agent-browser doctor`.

Use the `/claude-tweaks:browse` skill's operation vocabulary for all browser operations. Concrete commands live in `agent-browser-reference.md` in that skill's directory.

### URL Resolution

When QA is triggered automatically (by `/claude-tweaks:test` in a `/claude-tweaks:flow` pipeline, or via `/claude-tweaks:test qa`), the dev server URL is auto-detected using the shared procedure from `dev-url-detection.md` in the `/claude-tweaks:stories` skill's directory. Stories may also contain their own URLs.

### Browser Check

Run `agent-browser --version`. If it fails, **stop** and report the missing dependency — suggest `npm install -g agent-browser` or re-run `/claude-tweaks:init` (Step 6).

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
| STORIES_DIR | `stories` | `dir=<path>` | Directory containing story YAML files |
| SINGLE_STORY | — | `story=<name>` | Run only matching story (substring match) |
| TAG_FILTER | — | `tag=<tag>` | Only run stories with this tag |
| PRIORITY_FILTER | — | `priority=<level>` | Only run stories at or above threshold (high > medium > low) |
| RETRY_RUN_DIR | — | `retry=<path>` | Re-run only failed stories from a previous run |
| JOURNEY_FILTER | — | `journey=<name>` | Only run stories with `journey: <name>` |
| MAX_PARALLEL | `4` | `max_parallel=N` | Max concurrent agents per tier |
| AGENT_TIMEOUT | `300000` | — | Agent timeout in milliseconds |
| SCREENSHOTS_BASE | `screenshots/qa` | — | Base directory for screenshots |
| TRACES_BASE | `traces` | — | Base directory for failure traces |
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
   - **Journey filter:** If JOURNEY_FILTER is set, keep only stories that have a `journey` field matching the specified name (exact match, case-insensitive). Stories without a `journey` field are excluded.
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

## Phase 2: Dependency Resolution

12. Build a dependency graph from `depends_on` fields:
    - **Tier 0:** Stories with no `depends_on` (or whose dependency is not in the current run)
    - **Tier 1:** Stories that depend on a Tier 0 story
    - **Tier 2:** Stories that depend on a Tier 1 story (and so on)
    - Stories within the same tier can run in parallel
    - A tier only starts after all stories in the previous tier have completed
    - If a story's dependency **failed**, mark the dependent story as **SKIPPED**

## Phase 2.5: Auth Vault Pre-flight

Before dispatching any tier, resolve auth vault references for stories that require login.

13. **Check auth requirements:** Scan all stories in the run for the story-level `auth: { vault: "<name>" }` field, or for `requires: [auth]` / `setup.auth` blocks (legacy). If none require auth, skip to Phase 3.

14. **Resolve vault references (preferred path):**
    - Collect the set of unique vault names referenced across stories.
    - Run `agent-browser auth list` once. Each row is a vault name plus a username.
    - For every referenced vault, confirm it is present in the listing. If a vault is missing, log a warning: `Auth vault '{name}' not configured. Run: agent-browser auth set {name} <username> <password>`. Stories that reference the missing vault are marked `SKIPPED` with reason `missing-auth-vault` and their dependents cascade as `SKIPPED`.
    - The LLM never sees credentials. Vaults store passwords encrypted, locally. The runtime executes `agent-browser --session <story-id> auth use <vault-name>` after `open` and before the first interactive step (see Phase 3 prompt template).

15. **Legacy `auth.yml` fallback:** If a story uses the legacy `setup.auth: <profile>` reference and `{STORIES_DIR}/auth.yml` exists:
    - Read and parse `{STORIES_DIR}/auth.yml`.
    - Resolve the named profile's `url`, `username`, and `password`. Substitute `${VAR}` references from environment variables.
    - Surface a one-line migration suggestion in the run summary: `Legacy auth.yml in use — consider migrating to Auth Vault via agent-browser auth set ...`.
    - Pass the resolved credentials to the qa-agent via the prompt's `**Auth (legacy):**` field. The agent performs the login flow inline as its first step. Vault references take precedence whenever both are present on the same story.

16. **Pre-flight failure handling:** If `agent-browser auth list` itself fails (daemon down, agent-browser not installed), abort the run with the agent-browser doctor recovery hint. Do not attempt per-story workarounds.

## Phase 3: Spawn

17. For each tier (starting from Tier 0):

    **Streaming slot-fill:** Use a queue-based model to maximize concurrency. Instead of dispatching sub-batches and waiting for all to complete before starting the next sub-batch, fill slots as they open:

    ```
    Queue = [all stories in this tier]
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

    Each story agent owns a single `agent-browser` session named after the story id (kebab-case). One session per agent — never share a session across parallel stories.

18. **Detect story format** for each story:
    - If the story has a `steps` array -> structured format
    - If the story has a `workflow` string -> legacy format

19. For each Task call, use the appropriate prompt template. If the story has `auth: { vault: "<name>" }`, include the `**Auth (vault):**` field. If the story uses legacy `setup.auth` resolved from `auth.yml`, include the `**Auth (legacy):**` field instead. The agent uses one or the other — never both.

**Structured format prompt:**
```
Execute this user story and report results using the agent-browser CLI.

**ID:** {story.id}
**Story:** {story.name}
**URL:** {story.url}
**Session:** {story.id}
**Headed:** {HEADED}

**Auth (vault):** {vault name from story.auth.vault — omit if not present}
**Auth (legacy):** {resolved url/username/password from auth.yml — omit if not present or if vault was used}

**Viewport:** {story.viewport or setup.viewport or omit}

**Setup:**
{serialize setup block as YAML, if present}

**Teardown:**
{serialize teardown block as YAML, if present}

**Steps:**
{serialize story.steps as YAML}

Instructions:
- Open the session: `agent-browser --session {story.id} open {story.url}`
- If `Auth (vault)` is present, run `agent-browser --session {story.id} auth use <vault-name>` immediately after `open` and before the first interactive step.
- If `Auth (legacy)` is present and no vault is configured, perform the login flow inline using the resolved credentials (navigate to auth.url, fill, submit).
- If a `Viewport` is set, run `agent-browser --session {story.id} set viewport <w> <h>`.
- For each step in the steps array sequentially:
  - Use semantic locators (role/name, testid, text, label, placeholder) — never CSS or `@eN` refs from prior snapshots.
  - For action steps: try the locator first; if it fails, take a snapshot (`snapshot -i -c`) and resolve the target from the fresh tree.
  - For verify-only steps: snapshot and evaluate the assertion.
  - Take an annotated screenshot after each step: `screenshot --annotate --filename {SCREENSHOT_PATH}/<NN>_<step>.png`.
- On any step failure (assertion mismatch, locator unrecoverable, navigation timeout, console error blocking the flow):
  - Capture a trace BEFORE closing the session:
    `agent-browser --session {story.id} trace save {TRACES_BASE}/{story.id}/{ISO-timestamp}.zip`
  - Include the trace path in the failure report.
  - Then close the session: `agent-browser --session {story.id} close`.
  - Stop executing remaining steps.
- On success, close the session at the end: `agent-browser --session {story.id} close`.
- Report each step as PASS or FAIL with a brief explanation.
- Use this exact format for your final summary line:
  RESULT: {PASS|PASS_WITH_CAVEATS|FAIL} | ID: {story.id} | Steps: {passed}/{total}
- If a trace was captured, append a second line:
  TRACE: {trace path}
```

**Legacy format prompt:**
```
Execute this user story and report results using the agent-browser CLI.

**ID:** {story.id or "legacy-" + slugified-name}
**Story:** {story.name}
**URL:** {story.url}
**Session:** {story.id or "legacy-" + slugified-name}
**Headed:** {HEADED}

**Auth (vault):** {vault name from story.auth.vault — omit if not present}
**Auth (legacy):** {resolved url/username/password from auth.yml — omit if not present or if vault was used}

**Workflow:**
{story.workflow}

Instructions:
- Open the session, apply auth (vault preferred, legacy fallback), follow the workflow steps sequentially.
- Take an annotated screenshot after each significant step into {SCREENSHOT_PATH}.
- On any failure: `agent-browser --session <session> trace save {TRACES_BASE}/<session>/<timestamp>.zip`, then `close`. Include the trace path in the report.
- On success: `agent-browser --session <session> close` at the end.
- Use this exact format for your final summary line:
  RESULT: {PASS|PASS_WITH_CAVEATS|FAIL} | ID: {story.id or "legacy-" + slugified-name} | Steps: {passed}/{total}
- If a trace was captured, append a second line:
  TRACE: {trace path}
```

20. **Record start time** for each story when it is dispatched and elapsed time when it completes (wall-clock seconds). Store timing data alongside the result for use in Phase 5.

21. After each tier completes, check results before spawning the next tier. If any story failed, mark its dependents as SKIPPED.

## Phase 4: Collect

22. Parse each agent's report to extract:
    - Story ID (from the `RESULT:` line or `REPORT_JSON` comment)
    - Overall result: PASS, PASS_WITH_CAVEATS, or FAIL
    - Steps completed vs total (from the `Steps: X/Y` portion)
    - Caveats array (from the `REPORT_JSON` comment's `caveats` field — may be empty)
    - Recovered selectors array (from the `REPORT_JSON` comment's `recovered_selectors` field — may be empty)
    - Trace path (from the `TRACE:` line, if present — only for failures)
    - The full agent report text
    - Elapsed time (from the timing data recorded in Phase 3, step 20)
23. Be resilient: if an agent times out or crashes, mark that story as FAIL and include whatever output was available. If a `TRACE:` line is present in the partial output, retain it.

### Finding Classification

After collecting all agent reports, classify each failure into one of 5 categories using heuristic rules. Classification is automated — override categories in the findings table if needed.

| Category | Signal | Default Severity | Suggested Fix Pattern |
|----------|--------|-----------------|----------------------|
| `stale-selector` | Error contains "locator not found" or "element not found" | Low | "Update locator in story YAML" |
| `code-bug` | Error contains "assertion" or "expected" or "verify failed" | High | "Investigate component behavior" |
| `ux-issue` | From caveats (PASS_WITH_CAVEATS stories) | Medium | Specific to the observation |
| `flaky-env` | Error contains "timeout" or "navigation failed" or "net::" | Low | "Re-run: `/test qa retry={RUN_DIR}`" |
| `story-bug` | Element exists but in wrong position, or step instructions don't match current UI flow | Medium | "Regenerate story: `/stories focus={area}`" |

**Classification rules (apply in order — first match wins):**
1. Error contains "locator not found" or "element not found" -> `stale-selector`
2. Error contains "timeout" or "navigation failed" or "net::" -> `flaky-env`
3. Error contains "assertion" or "expected" or "verify failed" -> `code-bug`
4. Error suggests the page structure changed (element exists but in wrong position) -> `story-bug`
5. No error match -> `code-bug` (default for unclassified failures)

**Caveat-to-finding conversion:** Each caveat from a PASS_WITH_CAVEATS story generates a `ux-issue` finding with severity Medium. These are informational and do not block the gate.

**Auto-recovered selector classification:** When a locator was auto-recovered by the qa-agent (present in the `recovered_selectors` array), classify it as `stale-selector` with status `auto-fixed` rather than `open`. These do not block the gate — the locator has already been corrected in the story YAML (see Phase 4.5).

## Phase 4.5: Apply Selector Recoveries

After ALL agents in a tier complete (not during execution — to avoid file write conflicts between parallel agents), apply any recovered locators to the story YAML files.

**Important:** This phase runs once per tier, after Phase 4 (Collect) finishes for that tier. Recovered locators are buffered by each qa-agent in its report — the agent never writes to YAML files directly.

**Procedure:**

1. Collect all `recovered_selectors` arrays across all agent reports in this tier. If none have recoveries, skip this phase.

2. Group recoveries by source YAML file (tracked in Phase 1, step 6 — each story knows which file it came from).

3. For each source file with recoveries:
   a. Read the YAML file using the Read tool.
   b. For each recovery in this file:
      - Find the story by its ID within the `stories` array.
      - Find the step by the `step_index` from the recovery record.
      - Replace the old `locator:` value with the recovered locator.
      - Add a YAML comment on the line above: `# auto-recovered from: {original_locator}`
   c. Use the Edit tool for each targeted replacement — do not rewrite the entire file. This preserves comments, ordering, and formatting.

4. Log a summary after all updates:
   ```
   Auto-recovered {N} locator(s) in {M} story file(s)
   ```

**Conflict avoidance:** Because this phase runs only after all agents in a tier have completed, there is no risk of concurrent writes to the same YAML file. If the same file has recoveries from multiple agents (multiple stories in the same file), apply them sequentially within this phase.

## Phase 5: Report

24. Record the total wall-clock time for the entire run (from the start of Phase 3 to the end of Phase 4).

25. Write report artifacts to disk:

**`{RUN_DIR}/report.json`** — machine-readable:
```json
{
  "run_dir": "{RUN_DIR}",
  "timestamp": "ISO-8601",
  "stories_dir": "{STORIES_DIR}",
  "filters": {
    "tag": "{TAG_FILTER or null}",
    "priority": "{PRIORITY_FILTER or null}",
    "retry": "{RETRY_RUN_DIR or null}",
    "journey": "{JOURNEY_FILTER or null}"
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
      "suggested_fix": "Suggested remediation",
      "trace": "{trace path or null}"
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
      "original_locator": "old-locator",
      "recovered_locator": "new-locator",
      "target": "target description"
    }
  ],
  "stories": [
    {
      "id": "story-id",
      "name": "Story name",
      "source_file": "filename.yaml",
      "status": "PASS|PASS_WITH_CAVEATS|FAIL|SKIPPED",
      "steps_passed": N,
      "steps_total": N,
      "elapsed_seconds": N,
      "error": null,
      "caveats": [],
      "trace": "{trace path or null}",
      "screenshot_dir": "{SCREENSHOT_PATH}"
    }
  ]
}
```

The `summary.passed` count includes both PASS and PASS_WITH_CAVEATS stories (since caveats are informational). The `summary.pass_with_caveats` count is the subset of passed stories that had caveats. The `findings` array contains classified failure findings and caveat-derived ux-issue findings. Each failure finding includes the `trace` path captured by the qa-agent before closing the session — open the trace with `agent-browser trace view <path>`. The `caveats` array contains raw observations from PASS_WITH_CAVEATS stories. The `recovered_selectors` array contains all locator recoveries across all stories — each entry includes the source file and step index so the YAML update can be traced.

**`{RUN_DIR}/report.md`** — human-readable (same format as the report below).

26. Present the aggregated results:

```
# QA Review Summary

**Run:** {current date and time}
**Stories directory:** {STORIES_DIR}
**Filters:** {list active filters, or "none"}
**Stories:** {total} total | {pass} pass | {pass_with_caveats} pass (caveats) | {fail} fail | {skip} skipped
**Status:** ALL PASSED | PASSED WITH OBSERVATIONS | PARTIAL FAILURE | ALL FAILED

## Findings (action required)

(Only include if there are findings from failures)

| #   | Story        | Category         | Severity | Finding                          | Trace                                | Suggested Fix                       |
| --- | ------------ | ---------------- | -------- | -------------------------------- | ------------------------------------ | ----------------------------------- |
| 1   | {story name} | stale-selector   | Low      | Locator "Submit" not found       | traces/{id}/{ts}.zip                 | Update locator in story YAML        |
| 2   | {story name} | code-bug         | High     | Expected "Dashboard" in title    | traces/{id}/{ts}.zip                 | Investigate component behavior      |

> Open a trace with `agent-browser trace view <path>`. Classification is automated — override categories in the findings table if needed.

## Observations (informational)

(Only include if there are caveats from PASS_WITH_CAVEATS stories)

| #   | Story        | Observation                                    |
| --- | ------------ | ---------------------------------------------- |
| 1   | {story name} | Missing aria-label on 3 interactive element(s) |
| 2   | {story name} | Page load took 4.2s                            |

## Recovered Locators

(Only include if any locators were auto-recovered during the run)

Auto-recovered {N} locator(s) in {M} story file(s). Story YAML files have been updated.

| #   | Story        | Step             | Original             | Recovered                |
| --- | ------------ | ---------------- | -------------------- | ------------------------ |
| 1   | {story name} | Step description | role:button "Submit" | testid:submit-cta        |
| 2   | {story name} | Step description | text:"Old label"     | label:"Email address"    |

## Results

| #   | ID           | Story        | Source File | Status            | Steps            | Elapsed |
| --- | ------------ | ------------ | ----------- | ----------------- | ---------------- | ------- |
| 1   | {story.id}   | {story name} | {filename}  | PASS              | {passed}/{total} | {N}s    |
| 2   | {story.id}   | {story name} | {filename}  | PASS_WITH_CAVEATS | {passed}/{total} | {N}s    |
| 3   | {story.id}   | {story name} | {filename}  | FAIL              | {passed}/{total} | {N}s    |
| 4   | {story.id}   | {story name} | {filename}  | SKIPPED           | —                | —       |

## Skipped (dependency or auth-vault failures)

(Only include if there are skipped stories)

| Story ID     | Story Name   | Reason                       |
| ------------ | ------------ | ---------------------------- |
| {story.id}   | {story name} | Blocked by {dep id} / missing-auth-vault: {vault name} |

## Failures

(Only include this section if there are failures)

### Story: {failed story name}
**ID:** {story.id}
**Source:** {filename}
**Trace:** `{trace path}` — open with `agent-browser trace view {trace path}`
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

## Journey Coverage

(Only include when JOURNEY_FILTER was set or when stories with `journey:` fields are present)

| Journey | Stories Run | Passed | Failed | Steps Covered | Status |
|---------|-----------|--------|--------|---------------|--------|
| {name} | {N} | {pass} | {fail} | {covered}/{total} | Full / Partial |

(Steps Covered counts how many of the journey's documented step URLs had at least one story exercised against them in this run.)

## Screenshots & Traces
- Screenshots: `{RUN_DIR}/`
- Failure traces: `{TRACES_BASE}/<story-id>/<timestamp>.zip` — open with `agent-browser trace view <path>`

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

After reporting, write findings and observations to the open items ledger (see `/claude-tweaks:ledger`) with phase `test/qa`. Findings from failures get status `open`. Observations from PASS_WITH_CAVEATS get status `observation`.

27. **Write finding entries:** For each item in the `findings[]` array (from the report), add an item to the ledger with phase `test/qa`, the finding description (including `[story: {story_id}, category: {category}, trace: {trace path or "none"}]`), severity from the finding, and status `open`. These represent failures that must be resolved before the pipeline completes.

28. **Write caveat entries:** For each item in the `caveats[]` array (from the report), add an item to the ledger with phase `test/qa`, the observation text (including `[story: {story_id}]`), severity `Info`, and status `observation`. These are informational and do not block the pipeline.

29. **Dedup:** Before writing each entry, check whether a ledger entry for the same story ID and finding text already exists (from a previous QA run). If a matching entry exists, do not create a duplicate — leave the existing entry in place. Match by story ID and finding content, not by exact string comparison (minor wording differences across runs should still be detected as duplicates).

## Gate for /flow

When QA review is part of a `/claude-tweaks:test` run inside a `/claude-tweaks:flow` pipeline:
- **ALL PASSED** or **PASSED WITH OBSERVATIONS** → set `TEST_PASSED=true`, proceed to the next pipeline step (PASS_WITH_CAVEATS counts as passed — caveats are informational, not blocking)
- **Any failures** → **STOP** the pipeline and present the failure report (with trace paths attached for each failure)
