# Routine Setup Friction Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse `/claude-tweaks:routine create`'s per-routine flow from 3-4 sequential `AskUserQuestion` round-trips into 1 (defaults auto-resolved, one merged preview+confirm), and collapse `/claude-tweaks:init` Step 13's per-candidate walkthrough (up to 6 full CREATE flows today) into a single multiSelect picklist — via a new `--defaults --environment=<id>` non-interactive entry point on CREATE. Also fixes a real bug: today's cadence picker asks `AskUserQuestion` for 6 options against the tool's actual 4-option-per-question cap.

**Architecture:** A pure prose change to two skill files — `skills/routine/SKILL.md` (CREATE Steps 4/5/7, UPDATE Step 5, Anti-Patterns, Relationship table) and `skills/init/bootstrap-steps.md` + `skills/init/SKILL.md` (Step 13). No schema change (`skills/_shared/routine-template-schema.md` is untouched — the instantiated record and template shapes are unaffected). No code change — this plugin has no JS module governing routine creation; the entire mechanism is LLM-executed instructions.

**Tech Stack:** Markdown skill files, `AskUserQuestion` tool, `RemoteTrigger` MCP tool (unchanged call shapes).

## Global Constraints

- **`AskUserQuestion` caps `options` at 4 per question and `questions` at 4 per call**, regardless of `multiSelect`. Every edit in this plan must respect both caps — this is the mechanical root of the 6→4 option fix and the "split into groups of ≤4" behavior in Task 5.
- **All 6 shipped routine templates keep their existing `default_schedule.cron_expression` unchanged** — this plan never edits a `routine-template*.yml` file. Verified values (re-confirm at Task 6 in case a concurrent change altered them):
  - `skills/code-health/routine-template.yml`: `"0 3 * * *"` → Daily, 03:00 UTC.
  - `skills/harness-health/routine-template.yml`: `"0 5 * * *"` → Daily, 05:00 UTC.
  - `skills/journey-health/routine-template.yml`: `"0 4 * * *"` → Daily, 04:00 UTC.
  - `skills/tidy/routine-template.yml`: `"0 4 * * 0"` → Weekly, Sunday, 04:00 UTC.
  - `skills/tidy/routine-template-github-triage.yml`: `"0 */3 * * *"` → Every N hours, N=3.
  - `skills/triage/routine-template.yml`: `"0 4 * * 1-5"` → Weekdays only, 04:00 UTC.
- **New flags on `/claude-tweaks:routine create`:** `--defaults` (skip Step 5's interactive picker and Step 7's interactive confirm; use the template's own default schedule; still respects `--dry-run` and an unresolvable environment) and `--environment <id>` (use this environment ID directly in Step 4, skipping cache/list lookup). Both are independent of each other and of `--variant`/`--dry-run`/`--source`, which are all unchanged.
- **`skills/_shared/routine-template-schema.md` is not touched** — confirmed no field changes needed.
- All edits are literal text substitutions given verbatim in each task below.

---

### Task 1: CREATE Step 4 — silent environment resolution + new Input flags

**Files:**
- Modify: `skills/routine/SKILL.md`

**Interfaces:**
- Produces: the `--defaults` and `--environment <id>` flags in the `## Input` table, and Step 4's silent-resolution behavior that Tasks 2, 3, and 5 all depend on.

- [ ] **Step 1: Add `--defaults` and `--environment` rows to the Input table**

  Replace:

  ```
  | `--dry-run` (combine with `create`/`update`) | Assemble and display the `RemoteTrigger` body; never make a `create`/`update` call (read-only `list`/`get` calls to resolve values are still permitted), never write or rewrite the instantiated record. |
  | `--source <parent-skill>` | Used by a parent skill (e.g. `/claude-tweaks:init`) to identify itself as the caller; see Component-Skill Contract below. |
  ```

  with:

  ```
  | `--dry-run` (combine with `create`/`update`) | Assemble and display the `RemoteTrigger` body; never make a `create`/`update` call (read-only `list`/`get` calls to resolve values are still permitted), never write or rewrite the instantiated record. |
  | `--defaults` (combine with `create`) | Skip Step 5's interactive cadence picker (use the template's own `default_schedule.cron_expression` verbatim) and Step 7's interactive confirm (proceed straight to creation once the body is assembled) — for non-interactive/batch creation. Environment still resolves via Step 4 (cache, `list`, or `--environment`); if none of those yields a value, `--defaults` does not suppress that one unavoidable prompt. |
  | `--environment <id>` (combine with `--defaults`, or standalone) | Use this environment ID directly in Step 4, skipping cache/list lookup. |
  | `--source <parent-skill>` | Used by a parent skill (e.g. `/claude-tweaks:init`) to identify itself as the caller; see Component-Skill Contract below. |
  ```

- [ ] **Step 2: Replace CREATE Step 4 in full**

  Replace:

  ```
  **Step 4 — Resolve `environment_id`.** Check `.claude-tweaks/routine-environment-cache.yml` in the current project first. If it exists and contains an `environment_id` value, offer it as the default (let the user override). Otherwise, load the tool with `ToolSearch select:RemoteTrigger`, then call `{action: "list"}`. If existing routines are returned, read `job_config.ccr.environment_id` off the most recently created one and offer it as the default (let the user override). If none exist yet, ask the user directly which environment to use — present whatever environment names/IDs are available in context; if none are, ask the user to name one (they can check via `/schedule` once if unsure). Do not cache this value anywhere under `~/.claude-tweaks/` — that path is harness-owned, not skill-owned.

  After the user confirms an environment (whether sourced from the cache, `list`, or direct input), write it to `.claude-tweaks/routine-environment-cache.yml` (skip this write if `--dry-run` was passed):

  ```yaml
  environment_id: "<confirmed environment_id>"
  ```

  This file is project-local and must stay gitignored — it exists purely to spare a second skill in the same project from re-deriving the same environment, never to make the value portable across projects or accounts.
  ```

  with:

  ````markdown
  **Step 4 — Resolve `environment_id`.** If `--environment <id>` was passed, use it directly — skip every other source below. Otherwise: check `.claude-tweaks/routine-environment-cache.yml` in the current project first. If it exists and contains an `environment_id` value, use it silently — no confirmation prompt. Otherwise, load the tool with `ToolSearch select:RemoteTrigger`, then call `{action: "list"}`. If existing routines are returned, read `job_config.ccr.environment_id` off the most recently created one and use it silently. If none of these three sources yields a value, ask the user directly which environment to use — present whatever environment names/IDs are available in context; if none are, ask the user to name one (they can check via `/schedule` once if unsure). Do not cache this value anywhere under `~/.claude-tweaks/` — that path is harness-owned, not skill-owned.

  After an environment is resolved (from `--environment`, the cache, `list`, or direct user input), write it to `.claude-tweaks/routine-environment-cache.yml` (skip this write if `--dry-run` was passed):

  ```yaml
  environment_id: "<resolved environment_id>"
  ```

  This file is project-local and must stay gitignored — it exists purely to spare a second skill in the same project from re-deriving the same environment, never to make the value portable across projects or accounts.
  ````

- [ ] **Step 3: Verify**

  ```bash
  grep -n "use it silently\|If \`--environment <id>\` was passed" skills/routine/SKILL.md
  ```

  Expected: at least 2 hits (both new sentences present).

  ```bash
  grep -n "offer it as the default (let the user override)" skills/routine/SKILL.md
  ```

  Expected: no output — the old "offer as default" behavior is fully replaced.

- [ ] **Step 4: Commit**

  ```bash
  git add skills/routine/SKILL.md
  git commit -m "routine: resolve environment silently, add --defaults/--environment flags"
  ```

---

### Task 2: CREATE Step 5 — cadence picker collapses to 4 options, bundles follow-ups

**Files:**
- Modify: `skills/routine/SKILL.md`

**Interfaces:**
- Consumes: `--defaults` flag semantics from Task 1.
- Produces: the 4-option picker and bundled-follow-up structure that Task 3 (Step 7's Customize branch) and Task 4 (UPDATE Step 3's cross-reference) both point back to by name ("5a-5d").

- [ ] **Step 1: Replace CREATE Step 5 in full**

  Replace:

  ````
  **Step 5 — Resolve the schedule.**

  **5a. Parse a cron expression back into a cadence** (here, the template's `default_schedule.cron_expression`; UPDATE Step 3 reuses this same sub-step against the instantiated record's `schedule` field instead — the classification logic below is source-agnostic, it only looks at the cron string itself). Given the 5-field cron string `M H DOM MON DOW` (always UTC), classify it against these patterns in order — the first match wins:

  | # | Pattern (MON/DOM/DOW fixed values, H/M shape) | Cadence | Parsed value |
  |---|---|---|---|
  | 1 | `MON=*`, `DOM=*`, `DOW=*`, `H` matches `*/N` | Every N hours | N |
  | 2 | `MON=*`, `DOM=*`, `DOW=*`, `H`/`M` plain integers | Daily | time `H:M` UTC |
  | 3 | `MON=*`, `DOM=*`, `DOW=1-5`, `H`/`M` plain integers | Weekdays only | time `H:M` UTC |
  | 4 | `MON=*`, `DOM=*`, `DOW` a single digit 0-6, `H`/`M` plain integers | Weekly | day = DOW (0=Sun..6=Sat), time `H:M` UTC |
  | 5 | `MON=*`, `DOW=*`, `DOM` a plain integer 1-31, `H`/`M` plain integers | Monthly | day-of-month = DOM, time `H:M` UTC |
  | 6 | Anything else | (no match) | none — no cadence pre-selected |

  **5b. Present the cadence picker.** Call `AskUserQuestion` with `question`: `"How often should this routine run?"`, `header`: `"Cadence"`, `multiSelect`: `false`, and exactly these 6 options (mark the one 5a matched with `(Recommended)` in its label; if 5a found no match, none of the 6 carries `(Recommended)`):

  - Option 1 — `label`: `"Every N hours"`, `description`: `"Fires every N hours starting from UTC midnight (e.g. N=3 fires at 00:00, 03:00, 06:00 UTC, ...)"`
  - Option 2 — `label`: `"Daily"`, `description`: `"Fires once a day at a UTC time you choose"`
  - Option 3 — `label`: `"Weekdays only"`, `description`: `"Fires Monday-Friday at a UTC time you choose, skips weekends"`
  - Option 4 — `label`: `"Weekly"`, `description`: `"Fires once a week on a day you choose, at a UTC time you choose"`
  - Option 5 — `label`: `"Monthly"`, `description`: `"Fires once a month on a day-of-month you choose, at a UTC time you choose"`
  - Option 6 — `label`: `"Custom cron expression"`, `description`: `"Type a 5-field cron expression directly — for anything the structured options above don't cover"`

  **5c. Per-cadence follow-up**, based on which option was chosen in 5b:

  - **Every N hours:** call `AskUserQuestion` with `question`: `"Every how many hours?"`, `header`: `"Interval"`, `multiSelect`: `false`; if 5a pre-selected this cadence, pre-fill the recommended value from the parsed N — if that parsed N isn't among the common values offered as options, add it as its own explicit option so it can still carry `(Recommended)` (a value tucked inside `Other` can't be pre-marked recommended). Accept a free-text number via the tool's `Other` field (there is no fixed small set of sensible N values to enumerate as options — offer 2 or 3 common values as options, e.g. `"3"`, `"6"`, `"12"`, each undescribed beyond the number, plus rely on `Other` for anything else). Reject N < 1 with the same rejection wording the existing minimum-interval check uses today ("reject anything tighter and ask for a looser schedule"). Resulting cron: `0 */N * * *`. No time-of-day follow-up for this cadence — a sub-daily `*/N` cycle anchored at UTC hour 0 has no single time-of-day to anchor, unlike the four calendar-based cadences below.
  - **Daily:** ask for a UTC time-of-day (`HH:MM`, 24-hour). If 5a pre-selected this cadence, pre-fill the recommendation from the parsed `H:M`. State the conversion example explicitly in the prompt text, exactly as today's Step 5 did: "e.g. 9am Europe/Copenhagen = 7am UTC, so you'd enter `07:00` here." Resulting cron: `M H * * *`.
  - **Weekdays only:** same UTC time-of-day prompt as Daily. Resulting cron: `M H * * 1-5`.
  - **Weekly:** first ask for a day of week (Sunday through Saturday; if 5a pre-selected this cadence, pre-fill the recommendation from the parsed day), then the same UTC time-of-day prompt as Daily. Resulting cron: `M H * * D` (D = 0-6, Sunday=0).
  - **Monthly:** first ask for a day-of-month (1-31; if 5a pre-selected this cadence, pre-fill the recommendation from the parsed day), then the same UTC time-of-day prompt as Daily. Resulting cron: `M H D * *`.
  - **Custom cron expression:** unchanged from today — ask the user to type a 5-field cron expression directly. No parsing, no pre-selection, no time-of-day sub-prompt.

  **5d. Validate and lock in.** For every cadence except Custom, the resulting cron is assembled mechanically from the 5c inputs per the "Resulting cron" formulas above — no further confirmation prompt beyond what 5b/5c already gathered (mirrors today's single-confirm fast path when accepting the recommended cadence-as-is). For Custom, validate the typed cron against the same 1-hour minimum interval floor as today — reject anything tighter and ask for a looser schedule, identical wording to before this change.
  ````

  with:

  ````markdown
  **Step 5 — Resolve the schedule.**

  If `--defaults` was passed: use the template's `default_schedule.cron_expression` verbatim as the resolved cron — skip 5b-5d entirely. Still run 5a's classification below to produce the human-readable form Step 7's preview needs (e.g. "Daily, 03:00 UTC") — no picker is shown either way.

  **5a. Parse a cron expression back into a cadence** (here, the template's `default_schedule.cron_expression`; UPDATE Step 3 reuses this same sub-step against the instantiated record's `schedule` field instead — the classification logic below is source-agnostic, it only looks at the cron string itself). Given the 5-field cron string `M H DOM MON DOW` (always UTC), classify it against these patterns in order — the first match wins:

  | # | Pattern (MON/DOM/DOW fixed values, H/M shape) | Cadence | Parsed value |
  |---|---|---|---|
  | 1 | `MON=*`, `DOM=*`, `DOW=*`, `H` matches `*/N` | Every N hours | N |
  | 2 | `MON=*`, `DOM=*`, `DOW=*`, `H`/`M` plain integers | Daily | time `H:M` UTC |
  | 3 | `MON=*`, `DOM=*`, `DOW=1-5`, `H`/`M` plain integers | Weekdays only | time `H:M` UTC |
  | 4 | `MON=*`, `DOM=*`, `DOW` a single digit 0-6, `H`/`M` plain integers | Weekly | day = DOW (0=Sun..6=Sat), time `H:M` UTC |
  | 5 | `MON=*`, `DOW=*`, `DOM` a plain integer 1-31, `H`/`M` plain integers | Monthly | day-of-month = DOM, time `H:M` UTC |
  | 6 | Anything else | (no match) | none — no cadence pre-selected |

  **5b. Present the cadence picker.** (Skipped entirely when `--defaults` was passed — see above.) Call `AskUserQuestion` with `question`: `"How often should this routine run?"`, `header`: `"Cadence"`, `multiSelect`: `false`, and exactly these 4 options — a typed cron expression is still available via the tool's built-in `Other` field, so there is no separate "Custom cron expression" option consuming one of the 4 slots:

  - Option 1 — `label`: `"Every N hours"`, `description`: `"Fires every N hours starting from UTC midnight (e.g. N=3 fires at 00:00, 03:00, 06:00 UTC, ...)"`
  - Option 2 — `label`: `"Daily"`, `description`: `"Fires once a day (or on weekdays only) at a UTC time you choose"`
  - Option 3 — `label`: `"Weekly"`, `description`: `"Fires once a week on a day you choose, at a UTC time you choose"`
  - Option 4 — `label`: `"Monthly"`, `description`: `"Fires once a month on a day-of-month you choose, at a UTC time you choose"`

  Mark `(Recommended)` according to the 5a match: rows 1, 4, and 5 map directly to the same-named option above. Rows 2 and 3 (Daily and Weekdays only) both map to the **Daily** option — weekdays-only is now a follow-up modifier under Daily, not a separate top-level choice (see 5c). Row 6 (no match) also recommends **Daily**, as the sensible fallback rather than leaving nothing marked.

  **5c. Per-cadence follow-up**, based on which option was chosen in 5b. Each follow-up bundles every sub-answer it needs into a single `AskUserQuestion` call (multiple `questions` entries in one call) rather than one call per sub-answer:

  - **Every N hours:** call `AskUserQuestion` with one question, `question`: `"Every how many hours?"`, `header`: `"Interval"`, `multiSelect`: `false`; if 5a pre-selected this cadence, pre-fill the recommended value from the parsed N — if that parsed N isn't among the common values offered as options, add it as its own explicit option so it can still carry `(Recommended)` (a value tucked inside `Other` can't be pre-marked recommended). Accept a free-text number via the tool's `Other` field (there is no fixed small set of sensible N values to enumerate as options — offer 2 or 3 common values as options, e.g. `"3"`, `"6"`, `"12"`, each undescribed beyond the number, plus rely on `Other` for anything else). Reject N < 1 with the same rejection wording the existing minimum-interval check uses today ("reject anything tighter and ask for a looser schedule"). Resulting cron: `0 */N * * *`. No time-of-day follow-up for this cadence — a sub-daily `*/N` cycle anchored at UTC hour 0 has no single time-of-day to anchor, unlike the three calendar-based cadences below.
  - **Daily:** call `AskUserQuestion` with **two** `questions` entries in the same call: (1) `question`: `"Every day, or weekdays only?"`, `header`: `"Days"`, `multiSelect`: `false`, options `"Every day"` and `"Weekdays only"` — mark `(Recommended)` on `"Weekdays only"` if 5a's match was row 3, otherwise mark `(Recommended)` on `"Every day"` (covers both row 2 and the row-6 fallback); (2) `question`: `"What UTC time?"`, `header`: `"Time"`, `multiSelect`: `false`, free-text `HH:MM` (24-hour) via `Other`, pre-filled as the recommendation from the parsed `H:M` when 5a matched row 2 or row 3. State the conversion example explicitly in question (2)'s prompt text, exactly as before: "e.g. 9am Europe/Copenhagen = 7am UTC, so you'd enter `07:00` here." Resulting cron: `M H * * *` if "Every day" was chosen, `M H * * 1-5` if "Weekdays only" was chosen.
  - **Weekly:** call `AskUserQuestion` with **two** `questions` entries in the same call: (1) day of week (Sunday through Saturday; if 5a pre-selected this cadence, pre-fill the recommendation from the parsed day), (2) the same UTC time-of-day question as Daily's question (2) above. Resulting cron: `M H * * D` (D = 0-6, Sunday=0).
  - **Monthly:** call `AskUserQuestion` with **two** `questions` entries in the same call: (1) day-of-month (1-31; if 5a pre-selected this cadence, pre-fill the recommendation from the parsed day), (2) the same UTC time-of-day question as Daily's question (2) above. Resulting cron: `M H D * *`.

  A typed cron expression via `Other` on the 5b question bypasses 5c entirely — no parsing, no pre-selection, no time-of-day sub-prompt, identical to today's Custom cron path.

  **5d. Validate and lock in.** For every cadence produced by 5b/5c, the resulting cron is assembled mechanically from the 5c inputs per the "Resulting cron" formulas above — no further confirmation prompt beyond what 5b/5c already gathered. For a typed cron via `Other`, validate it against the same 1-hour minimum interval floor as today — reject anything tighter and ask for a looser schedule, identical wording to before this change.
  ````

- [ ] **Step 2: Verify**

  ```bash
  grep -n "^  - Option [1-6]" skills/routine/SKILL.md | grep -c "Option [5-6]"
  ```

  Expected: `0` (no `Option 5`/`Option 6` remains under the 5b picker — confirms the 6→4 collapse; this pattern only matches indented option lines, so it won't false-positive on Step 7's or the batch picklist's own differently-indented options).

  ```bash
  grep -n "Custom cron expression\|Weekdays only" skills/routine/SKILL.md
  ```

  Expected: `Custom cron expression` → no hits (dropped entirely). `Weekdays only` → hits only inside 5c's Daily follow-up and the 5a classification table, not as a 5b option label.

  ```bash
  grep -c "exactly these 4 options" skills/routine/SKILL.md
  ```

  Expected: `1`.

- [ ] **Step 3: Commit**

  ```bash
  git add skills/routine/SKILL.md
  git commit -m "routine: collapse cadence picker to 4 options, bundle per-cadence follow-ups"
  ```

---

### Task 3: CREATE Step 7 — merged preview + confirm, Customize branch

**Files:**
- Modify: `skills/routine/SKILL.md`

**Interfaces:**
- Consumes: `--defaults` flag semantics from Task 1; the 5b/5c picker structure from Task 2 (the Customize branch re-enters it).
- Produces: the "Yes, create with defaults (Recommended)" / "Customize" / "Cancel" confirm structure that Task 4's UPDATE Step 5 fix mirrors.

- [ ] **Step 1: Replace CREATE Step 7 in full**

  Replace:

  ```
  **Step 7 — Review gate.** Show the full assembled body before doing anything with it, along with the template's `notes` field (if present) so the user sees any tuning guidance before confirming. This creates live, billed infrastructure with no delete API — always confirm explicitly here, regardless of how automated everything upstream was.

  Call `AskUserQuestion` with `question`: `"Create this routine?"`, `header`: `"Confirm routine"`, `multiSelect`: `false`, and:
  - Option 1 — `label`: `"Create"`, `description`: `"Proceed with the assembled RemoteTrigger body shown above"`
  - Option 2 — `label`: `"Cancel"`, `description`: `"Do not create anything"`

  **Neither option carries `(Recommended)`** — this is a consequential, hard-to-reverse action (live, billed infrastructure with no delete API), so the tool's normal "mark a recommended default" convention is deliberately not followed here.

  If `--dry-run` was passed: print the assembled body and stop. Do not call `RemoteTrigger`. Do not write an instantiated record.
  ```

  with:

  ````markdown
  **Step 7 — Preview and confirm.** Render the resolved schedule (human-readable, e.g. "Nightly at 03:00 UTC") and environment (e.g. "environment `env-abc123` (cached)") as plain text, along with the template's `notes` field (if present) so the user sees any tuning guidance before confirming. This creates live, billed infrastructure with no delete API, so the preview must always be shown — regardless of how automated everything upstream was.

  If `--dry-run` was passed: print the assembled body and stop here. Do not call `RemoteTrigger`. Do not write an instantiated record. (This check applies whether or not `--defaults` was also passed — `--dry-run` always wins.)

  If `--defaults` was passed (and not `--dry-run`): skip the `AskUserQuestion` call below — proceed straight to Step 8. The preview above is still shown, as a report rather than a prompt.

  Otherwise, call `AskUserQuestion` with `question`: `"Create this routine with these settings?"`, `header`: `"Confirm routine"`, `multiSelect`: `false`, and:
  - Option 1 — `label`: `"Yes, create with defaults (Recommended)"`, `description`: `"Proceed with the settings shown above"`
  - Option 2 — `label`: `"Customize schedule or environment"`, `description`: `"Change the cadence, time, or environment before creating"`
  - Option 3 — `label`: `"Cancel"`, `description`: `"Do not create anything"`

  Marking "Yes, create with defaults" as `(Recommended)` is a deliberate change from this step's earlier no-bias convention — acceptable because the full assembled preview is always shown as part of the same round-trip; the safety property (review before commit) is preserved, only the bias-avoidance styling is relaxed.

  Selecting **Customize** re-asks environment (present the value resolved in Step 4 as the recommended option, still overridable) and runs the cadence picker (5b/5c), then re-renders this same preview and confirm with the customized values. Selecting **Yes** or **Cancel** proceeds exactly as before — Step 8 (create) or stop.
  ````

- [ ] **Step 2: Verify**

  ```bash
  grep -n "Create this routine with these settings\|Yes, create with defaults (Recommended)" skills/routine/SKILL.md
  ```

  Expected: at least 2 hits.

  ```bash
  grep -n "Neither option carries" skills/routine/SKILL.md
  ```

  Expected: exactly 1 hit — only UPDATE Step 5's own line remains until Task 4 fixes it; CREATE Step 7's copy is gone.

- [ ] **Step 3: Commit**

  ```bash
  git add skills/routine/SKILL.md
  git commit -m "routine: merge CREATE's review gate into one preview+confirm, add --defaults skip path"
  ```

---

### Task 4: routine/SKILL.md consistency fixes — UPDATE, Anti-Patterns, Relationship table

**Files:**
- Modify: `skills/routine/SKILL.md`

**Interfaces:**
- Consumes: the `(Recommended)` policy change from Task 3 (this task mirrors it into UPDATE for consistency); the `--defaults`/`--environment` flags from Task 1 (documented here in Anti-Patterns and Relationship).

- [ ] **Step 1: Update UPDATE Step 5's Recommended-marking to match CREATE Step 7**

  Replace:

  ```
  **Step 5.** Review gate — same standard as CREATE's review gate: show the diff, then call `AskUserQuestion` with `question`: `"Update this routine?"`, `header`: `"Confirm routine"`, `multiSelect`: `false`, and:
  - Option 1 — `label`: `"Update"`, `description`: `"Proceed with the assembled RemoteTrigger body shown above"`
  - Option 2 — `label`: `"Cancel"`, `description`: `"Do not update anything"`

  **Neither option carries `(Recommended)`** — same reasoning as CREATE Step 7 (live, billed infrastructure with no delete API).
  ```

  with:

  ```
  **Step 5.** Review gate — same standard as CREATE's Step 7: show the diff, then call `AskUserQuestion` with `question`: `"Update this routine?"`, `header`: `"Confirm routine"`, `multiSelect`: `false`, and:
  - Option 1 — `label`: `"Yes, update (Recommended)"`, `description`: `"Proceed with the assembled RemoteTrigger body shown above"`
  - Option 2 — `label`: `"Cancel"`, `description`: `"Do not update anything"`

  Marking "Yes, update" as `(Recommended)` follows the same reasoning as CREATE Step 7's confirm — the diff is always shown before this call, so the safety property (review before commit) is preserved even with a marked default.
  ```

- [ ] **Step 2: Add a new Anti-Patterns row for `--defaults` misuse**

  Replace:

  ```
  | Caching `environment_id` under `~/.claude-tweaks/` | That path is harness-owned runtime state, not skill-owned — cache it in the project-local `.claude-tweaks/routine-environment-cache.yml` file instead (checked before falling back to `RemoteTrigger list`, per CREATE Step 4). |

  ## Relationship to Other Skills
  ```

  with:

  ```
  | Caching `environment_id` under `~/.claude-tweaks/` | That path is harness-owned runtime state, not skill-owned — cache it in the project-local `.claude-tweaks/routine-environment-cache.yml` file instead (checked before falling back to `RemoteTrigger list`, per CREATE Step 4). |
  | Using `--defaults` to skip review on a single ad hoc `create` invocation the user hasn't already confirmed at a higher level | `--defaults` is `/init`'s sanctioned non-interactive entry point for a batch the user already confirmed via a multiSelect picklist (see the `/claude-tweaks:init` row below) — using it standalone removes the one safety check this billed, undeletable action has, for no batching benefit. |

  ## Relationship to Other Skills
  ```

- [ ] **Step 3: Update the `/claude-tweaks:init` Relationship row**

  Replace:

  ```
  | `/claude-tweaks:init` | Step 13 discovers skills with a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) and no existing record, then invokes `/claude-tweaks:routine create <skill> [--variant=<name>] --source init` for each the user selects — pure discovery + handoff, no logic duplicated. |
  ```

  with:

  ```
  | `/claude-tweaks:init` | Step 13 discovers skills with a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) and no existing record, presents them as a single multiSelect picklist with their default schedules, resolves environment once, then invokes `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — pure discovery + handoff, no logic duplicated; `--defaults` is `/routine`'s own sanctioned non-interactive entry point, not a shortcut `/init` invented around it. |
  ```

- [ ] **Step 4: Verify**

  ```bash
  grep -n "Yes, update (Recommended)\|Using \`--defaults\` to skip review\|resolves environment once, then invokes" skills/routine/SKILL.md
  ```

  Expected: 3 hits, one per edit above.

- [ ] **Step 5: Commit**

  ```bash
  git add skills/routine/SKILL.md
  git commit -m "routine: mirror Recommended policy into UPDATE, document --defaults in Anti-Patterns/Relationship"
  ```

---

### Task 5: `/init` Step 13 — batch multiSelect flow

**Files:**
- Modify: `skills/init/bootstrap-steps.md`
- Modify: `skills/init/SKILL.md`

**Interfaces:**
- Consumes: `--defaults --environment=<id>` from Task 1, the human-readable schedule form from Task 2's 5a classification (reused here for the candidate table).

- [ ] **Step 1: Replace `bootstrap-steps.md` Step 13 in full**

  Replace:

  ````
  ### Step 13 — Routine Installation (detailed procedure)

  claude-tweaks skills can ship one or more routine templates (schema: `skills/_shared/routine-template-schema.md`) — a skill's default template at `skills/{skill}/routine-template.yml`, plus optional named variants at `skills/{skill}/routine-template-<variant>.yml` — each enabling `/claude-tweaks:routine create <skill> [--variant=<name>]` to instantiate a scheduled cloud Routine for this project. Examples: code-health's nightly LLM-as-judge sweep, tidy's periodic backlog hygiene pass, or tidy's frequent GitHub-issue-triage variant. This step surfaces that option right after bootstrap instead of leaving it to be discovered later.

  **Detect candidates:**

  ```bash
  ls "${CLAUDE_PLUGIN_ROOT}"/skills/*/routine-template.yml "${CLAUDE_PLUGIN_ROOT}"/skills/*/routine-template-*.yml 2>/dev/null
  ```

  For each match, note the candidate skill name (the directory under `skills/`) and, for a `routine-template-<variant>.yml` match, the variant name (everything between `routine-template-` and `.yml`). Read each candidate's `routine_name` field.

  Derive `REPO_SLUG` once, the same way `/claude-tweaks:routine`'s own CREATE Step 2 does: resolve `git remote get-url origin`, take the resolved URL's `{repo}` segment, lowercase it, replace any run of characters outside `[a-z0-9]` with a single `-`, trim leading/trailing `-`. For each candidate, a record already exists iff `.claude-tweaks/routines/{REPO_SLUG}-{routine_name}.yml` exists in the current project — check per candidate, not per skill, since a skill with a default template plus a variant can have zero, one, or both already instantiated; the instantiated record's own `template:` field only names the skill, not which variant, so filename existence (not field content) is the correct check here. If `git remote get-url origin` fails (no remote configured), treat every candidate as un-instantiated and offer them all — `/claude-tweaks:routine`'s own CREATE workflow (Step 2) handles the actual missing-remote stop later, at the point the user selects a candidate to create. Only offer candidates without a matching record. If no candidates remain, skip this step silently.

  **Present:**

  ```
  {N} claude-tweaks routine(s) available to set up: {list, e.g. "code-health (nightly repo sweep), tidy (periodic backlog hygiene), tidy --variant=github-triage (frequent GitHub issue triage)"}.

  Set any of these up now?
  1. Yes — walk me through each **(Recommended)**
  2. Not now — I'll use `/claude-tweaks:routine create <skill> [--variant=<name>]` later
  ```

  **For option 1:** For each candidate the user selects, invoke `/claude-tweaks:routine create <skill> [--variant=<name>] --source init` directly (omit `--variant` for a default-template candidate). `/routine`'s own CREATE workflow (template load, repo/name resolution, idempotency check, environment/schedule resolution, review gate) handles everything end-to-end, including the mandatory explicit confirmation before any live `RemoteTrigger` call — the invocation may also include `--dry-run` if the user wants to inspect the assembled configuration first without creating anything live. `/init` does not reimplement, shortcut, or pre-answer any part of that workflow — it only discovers candidates and hands off.

  **For option 2:** Note the skipped candidates and continue. The same offer reappears on the next `/init` run for any candidate still missing a record.

  **Failure handling:** If a `create` invocation fails or the user backs out mid-flow, continue with the remaining selected candidates (or none) rather than aborting the rest of `/init`.
  ````

  with:

  ````markdown
  ### Step 13 — Routine Installation (detailed procedure)

  claude-tweaks skills can ship one or more routine templates (schema: `skills/_shared/routine-template-schema.md`) — a skill's default template at `skills/{skill}/routine-template.yml`, plus optional named variants at `skills/{skill}/routine-template-<variant>.yml` — each enabling `/claude-tweaks:routine create <skill> [--variant=<name>]` to instantiate a scheduled cloud Routine for this project. Examples: code-health's nightly LLM-as-judge sweep, tidy's periodic backlog hygiene pass, or tidy's frequent GitHub-issue-triage variant. This step surfaces that option right after bootstrap instead of leaving it to be discovered later.

  **Detect candidates:**

  ```bash
  ls "${CLAUDE_PLUGIN_ROOT}"/skills/*/routine-template.yml "${CLAUDE_PLUGIN_ROOT}"/skills/*/routine-template-*.yml 2>/dev/null
  ```

  For each match, note the candidate skill name (the directory under `skills/`) and, for a `routine-template-<variant>.yml` match, the variant name (everything between `routine-template-` and `.yml`). Read each candidate's `routine_name` field and its `default_schedule.cron_expression`, and derive its human-readable form via the same 5a classification table `/claude-tweaks:routine`'s CREATE Step 5 uses (e.g. `"0 3 * * *"` → "Daily, 03:00 UTC").

  Derive `REPO_SLUG` once, the same way `/claude-tweaks:routine`'s own CREATE Step 2 does: resolve `git remote get-url origin`, take the resolved URL's `{repo}` segment, lowercase it, replace any run of characters outside `[a-z0-9]` with a single `-`, trim leading/trailing `-`. For each candidate, a record already exists iff `.claude-tweaks/routines/{REPO_SLUG}-{routine_name}.yml` exists in the current project — check per candidate, not per skill, since a skill with a default template plus a variant can have zero, one, or both already instantiated; the instantiated record's own `template:` field only names the skill, not which variant, so filename existence (not field content) is the correct check here. If `git remote get-url origin` fails (no remote configured), treat every candidate as un-instantiated and offer them all — `/claude-tweaks:routine`'s own CREATE workflow (Step 2) handles the actual missing-remote stop later, at the point a candidate is actually created. Only offer candidates without a matching record. If no candidates remain, skip this step silently.

  **Present the candidate table** (plain text, not a tool call) — one row per candidate:

  ```
  {N} claude-tweaks routine(s) available to set up:

  | Routine | Default schedule | Notes |
  |---|---|---|
  | code-health | Daily, 03:00 UTC | {template's notes field, if present} |
  | tidy | Weekly, Sunday 04:00 UTC | ... |
  | tidy --variant=github-triage | Every 3 hours | ... |
  | ... | ... | ... |
  ```

  **Resolve environment once**, shared across every candidate the user may select: check `.claude-tweaks/routine-environment-cache.yml` first, then `RemoteTrigger {action: "list"}` (read `job_config.ccr.environment_id` off the most recent routine) — identical sources and order to `/claude-tweaks:routine`'s own CREATE Step 4. Use it silently if either source yields a value. Only ask the user directly when neither source has anything.

  **Present the picklist.** Call `AskUserQuestion` with one multiSelect question per group of up to 4 candidates (all groups issued together, in the same call — the tool caps `options` at 4 per question but allows up to 4 questions per call, so up to 16 candidates fit in a single call; today's 6 candidates need exactly 2 groups). For a single group of 4 or fewer candidates, one question is enough — omit the group-numbering suffix.

  - `question` (group 1): `"Which routines do you want to set up?"` (or, when there is more than one group, `"Which routines do you want to set up? (1/{G})"`), `header`: `"Routines"`, `multiSelect`: `true`, one option per candidate in this group: `label` = the candidate's routine identity (e.g. `"code-health"`, `"tidy"`, `"tidy --variant=github-triage"`), `description` = its human-readable default schedule (e.g. `"Daily, 03:00 UTC"`)
  - Repeat for each subsequent group, `question`: `"Which routines do you want to set up? ({i}/{G})"`

  Selecting a candidate in this call **is** the confirmation to create it — there is no separate follow-up confirm. Selecting none (in every group) means "not now" for every candidate; the same offer reappears on the next `/init` run for any candidate still missing a record.

  **For each selected candidate:** invoke `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<resolved id> --source init` directly (omit `--variant` for a default-template candidate). This flag combination skips `/routine`'s own interactive cadence picker and confirm — it uses the template's own default schedule and creates immediately, since the multiSelect selection above already served as the confirmation. `/init` still does not reimplement or duplicate any of `/routine`'s body-assembly, `RemoteTrigger`, or record-writing logic — `--defaults --environment=<id>` is `/routine`'s own sanctioned non-interactive entry point, not a shortcut `/init` invented around it.

  A user who wants a non-default schedule or environment for a specific routine declines it here and runs `/claude-tweaks:routine create <skill> [--variant=<name>]` (without `--defaults`) afterward, where the full interactive Customize path is available.

  **Failure handling:** If a `create` invocation fails for one selected candidate, continue with the remaining selected candidates rather than aborting the rest of `/init`. Report which candidates succeeded (with their console URLs) and which failed, in a single summary after all selected candidates have been attempted.
  ````

- [ ] **Step 2: Update `SKILL.md`'s Step 13 summary**

  Replace:

  ```
  ### Step 13: Routine Installation (Optional Companion)

  Always offered (not gated) — detect which claude-tweaks skills ship a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) without an existing instantiated record for this project, and offer to walk through `/claude-tweaks:routine create <skill> [--variant=<name>] --source init` for each candidate. Idempotent: candidates with an existing record are never re-offered. Read `bootstrap-steps.md` (Step 13) for the full procedure.
  ```

  with:

  ```
  ### Step 13: Routine Installation (Optional Companion)

  Always offered (not gated) — detect which claude-tweaks skills ship a `routine-template.yml` (plus any named `routine-template-<variant>.yml` siblings) without an existing instantiated record for this project, present them as a single multiSelect picklist with their default schedules, and invoke `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init` for each selected candidate — no per-candidate interactive walkthrough. Idempotent: candidates with an existing record are never re-offered. Read `bootstrap-steps.md` (Step 13) for the full procedure.
  ```

- [ ] **Step 3: Verify**

  ```bash
  grep -n "walk me through each" skills/init/bootstrap-steps.md skills/init/SKILL.md
  ```

  Expected: no output — the old per-candidate walkthrough offer is fully replaced in both files.

  ```bash
  grep -n "multiSelect.*true\|Present the picklist" skills/init/bootstrap-steps.md
  ```

  Expected: at least 1 hit.

- [ ] **Step 4: Commit**

  ```bash
  git add skills/init/bootstrap-steps.md skills/init/SKILL.md
  git commit -m "init: Step 13 batches routine setup into one multiSelect picklist"
  ```

---

### Task 6: Whole-repo verification sweep

**Files:** none modified — verification only.

- [ ] **Step 1: Confirm no `AskUserQuestion` call in either file exceeds 4 options or 4 questions**

  ```bash
  grep -n "Option 5\|Option 6" skills/routine/SKILL.md skills/init/bootstrap-steps.md skills/init/SKILL.md
  ```

  Expected: no output.

  Manually re-read every `AskUserQuestion` call site in the two modified sections (CREATE Steps 4/5/7, UPDATE Step 5, `/init` Step 13) and confirm none bundles more than 4 `questions` entries in one call.

- [ ] **Step 2: Confirm every cross-reference from UPDATE/STATUS to CREATE step numbers still resolves**

  ```bash
  grep -n "CREATE Step" skills/routine/SKILL.md
  ```

  Expected: references to "CREATE Step 1", "CREATE Step 2", "CREATE Step 4", "CREATE Step 5" (the "5a-5d" sub-structure), all still pointing at steps that exist with those numbers (Steps 1-9 were never renumbered by this plan — only the *content* of Steps 4, 5, 7 changed).

- [ ] **Step 3: Confirm all 6 shipped routine templates still classify correctly through the unchanged 5a table**

  ```bash
  grep -A2 "default_schedule" skills/code-health/routine-template.yml skills/harness-health/routine-template.yml skills/journey-health/routine-template.yml skills/tidy/routine-template.yml skills/tidy/routine-template-github-triage.yml skills/triage/routine-template.yml
  ```

  For each of the 6 cron strings, manually trace it through Task 2's 5a table (rule 1 through 6, first match wins) and confirm it resolves to the cadence in this plan's Global Constraints table. Additionally confirm `triage`'s `"0 4 * * 1-5"` (rule 3, Weekdays only) correctly maps to the **Daily** top-level option in the new 4-option picker with the "Weekdays only" sub-choice recommended, per Task 2's 5b/5c mapping rule.

- [ ] **Step 4: Confirm `skills/_shared/routine-template-schema.md` was not touched**

  ```bash
  git diff --stat main -- skills/_shared/routine-template-schema.md
  ```

  Expected: no output.

- [ ] **Step 5: Confirm no other file references the retired 6-option picker or the retired walkthrough offer**

  ```bash
  grep -rln "Custom cron expression\|walk me through each" skills/ docs/superpowers/specs/2026-07-12-routine-setup-friction-design.md 2>/dev/null
  ```

  Expected: no output (the frozen historical design doc `2026-07-10-routine-schedule-picker-design.md` is intentionally excluded from this grep and left untouched).

- [ ] **Step 6: Run the full test suite**

  ```bash
  npm test
  ```

  Expected: same baseline as this worktree's starting point — this plan makes no code changes, only prose, so no new failures should appear.

- [ ] **Step 7: Final commit (if Steps 1-5 surfaced any straggler fix)**

  If verification found any remaining gap, fix it now, re-verify, then:

  ```bash
  git add -A
  git commit -m "routine-setup-friction: fix stragglers found by whole-repo sweep"
  ```

  If nothing was found, skip this commit — Task 6 is verification-only.

## Self-Review Notes

- **Spec coverage:** Layer 1 (per-routine flow collapse) is Tasks 1-3; the `--defaults`/`--environment` interface bridging Layer 1 and Layer 2 is Task 1 plus the Anti-Patterns/Relationship documentation in Task 4; Layer 2 (batch flow) is Task 5; the discovered 6-option bug fix is Task 2; the Recommended-marking policy decision (and its UPDATE-side consistency implication) is Task 3 plus Task 4 Step 1; the design doc's "no schema change" and "templates unchanged" non-goals are enforced as Task 6 Steps 3-4.
- **Design decision resolved during planning, not left implicit:** the design doc's Layer 1 section didn't specify how "Weekdays only" survives losing its top-level slot — resolved here by folding it into a bundled sub-question under Daily (Task 2), with an explicit Recommended-mapping rule for 5a row 3, and cross-checked against `triage`'s real shipped default in Task 6 Step 3 rather than left as an abstract claim.
- **Bundling extended beyond what the user explicitly asked for, but consistent with the stated goal:** the design doc's Layer 1 goal was "collapse into as few round-trips as possible." Task 2 bundles Weekly's and Monthly's day+time follow-ups into single calls the same way Daily's days+time is bundled, even though the user's original request was about the top-level cadence-and-confirm bundling — this is a direct, mechanical application of the same already-approved principle (multiple `questions` in one `AskUserQuestion` call), not a new scope decision.
- **No placeholders:** every edit is literal before/after text; the 6 shipped templates' cron strings were traced against the unchanged classification table during planning (Global Constraints), matching the design doc's own verified table.
- **Type/reference consistency:** `--defaults` and `--environment <id>` are named identically everywhere they appear (Input table, Step 4, Step 5, Step 7, Anti-Patterns, Relationship table, `/init`'s Step 13, `/init`'s SKILL.md summary) — no `--environment=<id>` vs `--environment <id>` drift between the flag's definition and its invocations (both forms appear across the two files' existing conventions — `--variant=<name>` uses `=`, so invocation call-sites use `--environment=<id>` to match that convention, while the Input table's flag *definition* uses the space form `--environment <id>` matching how `--dry-run` and other space-separated-looking flags read in that table; this mirrors the existing file's own inconsistency between `--variant <name>` in prose and `--variant=<name>` at call sites, so it is not a new inconsistency introduced by this plan).
