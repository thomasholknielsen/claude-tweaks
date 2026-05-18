QA parallel dispatch + agent prompt templates — Phase 3. Read `qa-procedures.md` for pre-flight and `qa-reporting.md` for output handling.

# QA Phase 3: Spawn

This phase dispatches qa-agent subagents in parallel — one per story, bounded by `MAX_PARALLEL` and tier dependencies from Phase 2. Each agent owns a single `agent-browser` session named after the story id (kebab-case). One session per agent — never share a session across parallel stories.

> **Parallel execution:** Dispatch each tier's stories as parallel Task agents — each runs independently against its own `agent-browser` session and returns a `RESULT:` summary line (plus optional `TRACE:` line and `REPORT_JSON` comment). Assemble results after all agents in the tier complete. Follow the subagent contract in `skills/_shared/subagent-output-contract.md`: inline the prompt template below verbatim per agent (no references to sibling files), pick model tier `Standard` (qa-agent work is browser-driven step execution, not deep analysis), and treat the agent's first reply line as its status (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`). Anchor the working directory in each prompt when story YAML paths or screenshot/trace paths are relative.

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
- **Status line (required, line 1 of your reply):** emit exactly one of `DONE` | `DONE_WITH_CONCERNS` | `NEEDS_CONTEXT` | `BLOCKED`. Mapping:
  - `PASS` → `DONE`
  - `PASS_WITH_CAVEATS` → `DONE_WITH_CONCERNS`
  - `FAIL` → `DONE` (the test failed, but your execution completed normally — the failure is the result, not an agent error)
  - Cannot open the browser, server unreachable, or other infrastructure failure that prevents step execution → `BLOCKED`
  - Required input missing (auth vault not configured, env var not set, locator references something that doesn't exist in the prompt) → `NEEDS_CONTEXT`
- Use this exact format for your final summary line (after the status line):
  RESULT: {PASS|PASS_WITH_CAVEATS|FAIL} | ID: {story.id} | Steps: {passed}/{total}
- If a trace was captured, append a second line:
  TRACE: {trace path}
- After the summary line(s), emit a single-line HTML comment containing structured JSON named `REPORT_JSON`. The reporting pipeline parses this comment in Phase 4 (`qa-reporting.md`). Use exactly this shape:
  ```
  <!-- REPORT_JSON: {"caveats": ["{observation 1}", "{observation 2}"], "recovered_selectors": [{"step_index": {N}, "original_locator": "{old}", "recovered_locator": "{new}", "target": "{description}"}], "page_inventories": [{"url": "{absolute URL}", "element_counts": {"buttons": {N}, "inputs": {N}, "links": {N}, "headings": {N}}, "forms": [{"id_or_label": "{form name}", "field_count": {N}}], "nav_landmarks": ["{nav role/label}"], "accessibility": {"missing_alts": {N}, "missing_labels": {N}}, "viewport": {"width": {W}, "height": {H}}}]} -->
  ```
  All three arrays are required keys (use `[]` when empty — never omit). `caveats` is non-empty only when RESULT is `PASS_WITH_CAVEATS`. `recovered_selectors` lists any locators the agent auto-recovered during step execution. `page_inventories` is one entry per unique URL visited; use snapshot/snapshot-i data to populate element counts and form structure. Keep the entire comment on a single line so downstream parsing can use a simple regex.
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
- **Status line (required, line 1 of your reply):** emit exactly one of `DONE` | `DONE_WITH_CONCERNS` | `NEEDS_CONTEXT` | `BLOCKED`. Mapping:
  - `PASS` → `DONE`
  - `PASS_WITH_CAVEATS` → `DONE_WITH_CONCERNS`
  - `FAIL` → `DONE` (test failed, but execution completed normally)
  - Browser cannot open, server unreachable, or other infrastructure failure → `BLOCKED`
  - Missing auth vault, missing required env var, or workflow refers to undefined state → `NEEDS_CONTEXT`
- Use this exact format for your final summary line (after the status line):
  RESULT: {PASS|PASS_WITH_CAVEATS|FAIL} | ID: {story.id or "legacy-" + slugified-name} | Steps: {passed}/{total}
- If a trace was captured, append a second line:
  TRACE: {trace path}
- After the summary line(s), emit a `REPORT_JSON` HTML comment with the same shape documented in the structured-format prompt above (`caveats`, `recovered_selectors`, `page_inventories` — all keys required, use `[]` when empty). Legacy stories typically have no `recovered_selectors`; populate `page_inventories` from snapshot data at each URL transition.

**Note (legacy auth):** this prompt receives plaintext credentials in the `Auth (legacy)` field. The LLM sees them. Migrate to Auth Vault (`agent-browser auth set <vault> <user> <pass>`) as soon as possible — the structured prompt above never receives credentials, only the vault name. Treat this template as a deprecated fallback for legacy story files.
```

20. **Record start time** for each story when it is dispatched and elapsed time when it completes (wall-clock seconds). Store timing data alongside the result for use in Phase 5.

21. After each tier completes, check results before spawning the next tier. If any story failed, mark its dependents as SKIPPED.
