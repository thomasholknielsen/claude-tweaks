QA pre-flight and discovery procedures — Phases 1, 2, 2.5. Read `qa-prompts.md` for parallel dispatch and `qa-reporting.md` for output handling.

# QA Review Procedures

Structured YAML story execution with parallel agents, dependency tiers, and pass/fail reporting. Invoked by `/claude-tweaks:test qa` and `/claude-tweaks:test all`.

## Prerequisites

- YAML stories must exist in `stories/` (or custom dir specified with `dir=`)
- A running dev server URL must be available
- `agent-browser` must be installed. The daemon auto-starts on port 4848 with the first command. Recovery on crash: `agent-browser doctor`.

Use the `/claude-tweaks:browse` skill's operation vocabulary for all browser operations. Concrete commands live in `agent-browser-reference.md` in that skill's directory.

### URL Resolution

When QA is triggered automatically (by `/claude-tweaks:test` in a `/claude-tweaks:flow` pipeline, or via `/claude-tweaks:test qa`), the dev server URL is auto-detected using the shared procedure from `dev-url-detection.md` in `skills/_shared/`. Stories may also contain their own URLs.

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
| AGENT_TIMEOUT | `300000` | `timeout=<ms>` | Agent timeout in milliseconds. Raise it for a slow-loading app or CI cold-start; lower it for fast-fail local iteration on a hung session. |
| SCREENSHOTS_BASE | `screenshots/qa` | — | Base directory for screenshots |
| TRACES_BASE | `traces` | — | Base directory for failure traces |
| RUN_DIR | `{SCREENSHOTS_BASE}/{timestamp}_{uuid}` | — | Generated once at start of run |

## Phase 1: Discover

> **Parallel execution:** Use parallel tool calls aggressively — reading each discovered story YAML file (step 4) is an independent, read-only operation and should run concurrently.

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
    # node -e "const d=new Date();const s=d.toISOString().replace(/[-T:.Z]/g,'').slice(0,14);console.log('screenshots/qa/'+s.slice(0,8)+'_'+s.slice(8,14)+'_'+require('crypto').randomBytes(3).toString('hex'))"
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

13. **Check auth requirements:** Scan all stories in the run for the story-level `auth: { vault: "<name>" }` field. If none require auth, skip to Phase 3.

14. **Resolve vault references (preferred path):**
    - Collect the set of unique vault names referenced across stories.
    - Run `agent-browser auth list` once. Each row is a vault name plus a username.
    - For every referenced vault, confirm it is present in the listing. If a vault is missing, log a warning: `Auth vault '{name}' not configured. Run: agent-browser auth set {name} <username> <password>`. Stories that reference the missing vault are marked `SKIPPED` with reason `missing-auth-vault` and their dependents cascade as `SKIPPED`.
    - The LLM never sees credentials. Vaults store passwords encrypted, locally. The runtime executes `agent-browser --session <story-id> auth use <vault-name>` after `open` and before the first interactive step (see Phase 3 prompt template in `qa-prompts.md`).

15. **Pre-flight failure handling:** If `agent-browser auth list` itself fails (daemon down, agent-browser not installed), abort the run with the agent-browser doctor recovery hint. Do not attempt per-story workarounds.

→ Continue with Phase 3 in `qa-prompts.md`.
