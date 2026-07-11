# Routine Schedule Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/claude-tweaks:routine`'s "confirm the template's default cron expression, or type your own" schedule step with a structured cadence picker (Every N hours / Daily / Weekdays only / Weekly / Monthly / Custom cron), pre-selected by parsing the template's (CREATE) or instantiated record's (UPDATE) existing cron expression back into a cadence, so accepting the recommendation stays a single confirm while every other cadence becomes discoverable without knowing cron syntax.

**Architecture:** A pure prose change to one skill file, `skills/routine/SKILL.md` — no schema change (`skills/_shared/routine-template-schema.md` is untouched, confirmed: `default_schedule.cron_expression` and the instantiated record's `schedule` are both already plain strings), no code change (this plugin has no JS module governing routine schedule resolution — the entire mechanism is LLM-executed instructions). CREATE Step 5 gets the full picker + cron-parsing logic; UPDATE Step 3's schedule sub-step gets updated to reference it with the record's own cron as the parse-back source instead of the template's.

## Global Constraints

- **Six cadence options**, in this order, matching the design doc exactly: Every N hours, Daily, Weekdays only, Weekly (day-of-week), Monthly (day-of-month), Custom cron expression (the existing raw-input path, unchanged).
- **Pre-selection via cron parsing.** Given a 5-field cron string `M H DOM MON DOW` (always UTC per the schema), classify it against these patterns in order — the first match wins:
  1. `MON == "*"`, `DOM == "*"`, `DOW == "*"`, `H` matches `*/N` (N a positive integer) → **Every N hours**, value = N.
  2. `MON == "*"`, `DOM == "*"`, `DOW == "*"`, `H` and `M` are both plain integers → **Daily**, time = `H:M` UTC.
  3. `MON == "*"`, `DOM == "*"`, `DOW == "1-5"`, `H` and `M` are both plain integers → **Weekdays only**, time = `H:M` UTC.
  4. `MON == "*"`, `DOM == "*"`, `DOW` is a single integer 0-6 (not a range, not `*`), `H` and `M` are both plain integers → **Weekly**, day = DOW (0=Sunday .. 6=Saturday), time = `H:M` UTC.
  5. `MON == "*"`, `DOW == "*"`, `DOM` is a plain integer 1-31, `H` and `M` are both plain integers → **Monthly**, day-of-month = DOM, time = `H:M` UTC.
  6. Anything else (including any cron this plugin's shipped templates don't currently produce) → no pre-selection; the picker still renders all six options, none marked `(Recommended)`, and the raw cron is shown verbatim as context.
- **Verified against every currently shipped routine template** (5 files, not the design doc's stated "four" — the design doc predates the `triage` routine template, which the already-merged `triage-status-lifecycle` and `backlog-entry-unification` work added after this design was written; this plan's cadence taxonomy already covers it correctly, only the design doc's illustrative count is stale, which needs no fix since the design doc is a frozen historical record):
  - `skills/code-health/routine-template.yml`: `"0 3 * * *"` → Daily, 03:00 UTC.
  - `skills/harness-health/routine-template.yml`: `"0 5 * * *"` → Daily, 05:00 UTC.
  - `skills/tidy/routine-template.yml`: `"0 4 * * 0"` → Weekly, Sunday, 04:00 UTC.
  - `skills/tidy/routine-template-github-triage.yml`: `"0 */3 * * *"` → Every N hours, N=3.
  - `skills/triage/routine-template.yml`: `"0 4 * * 1-5"` → Weekdays only, 04:00 UTC (this is the design doc's "flow runs weekdays-only" reference — the design was written referring to the weekdays-only cadence that ended up shipping as `triage`'s template, not a separate `flow` template, which doesn't exist).
- **"Every N hours" has no time-of-day follow-up.** Unlike the other four structured cadences (Daily/Weekdays/Weekly/Monthly), a sub-daily repeating cycle anchored at `*/N` in the hour field has no single "time of day" to additionally prompt for — the resulting cron is simply `0 */N * * *`, matching the existing shipped `tidy-github-triage` pattern exactly. Only ask for N (with the 1-hour-minimum floor: reject N < 1, same rejection wording the existing minimum-interval check uses today). This is a deliberate, narrow interpretation of the design's "whichever cadence is chosen (all except Custom) is followed by a time-of-day prompt" — that sentence describes the four calendar-based cadences; "every N hours" has no calendar anchor to convert.
- **Time-of-day stays in UTC, matching today's existing convention — no new timezone-detection logic.** Step 5 today already presents the cron in UTC and asks the user to confirm it lands off-peak *in their own timezone* (i.e., the skill never auto-detects or converts timezones — the user does the mental conversion and either confirms or supplies a different UTC value). This plan preserves that exact convention: for Daily/Weekdays/Weekly/Monthly, ask for the UTC hour:minute directly (pre-filled from the parsed cron when a pre-selection exists), using the same "state the conversion explicitly" phrasing pattern already in Step 5 ("9am Europe/Copenhagen = 7am UTC, so the value you'd enter here is `07:00`") as a *worked example in the prompt text*, not as new automated conversion logic.
- **The Custom cron expression option is the existing raw-input path, completely unchanged** — typing a 5-field cron string directly, validated against the same 1-hour minimum interval floor as today.
- **`/init` Step 13 needs no changes** — confirmed per the design doc: it delegates entirely to `/routine`'s workflow and never touches schedule resolution directly. No task in this plan touches `skills/init/*`.
- All edits are literal text substitutions given verbatim below.

---

### Task 1: CREATE Step 5 — structured cadence picker

**Files:**
- Modify: `skills/routine/SKILL.md`

**Interfaces:**
- Produces: the cron-parsing classification rules and the six-option picker flow that Task 2 (UPDATE Step 3) references and reuses against the instantiated record's cron instead of the template's.

- [ ] **Step 1: Replace CREATE Step 5 in full**

  Replace:

  ```
  **Step 5 — Resolve the schedule.** Present the template's `default_schedule.cron_expression` (always UTC) and ask the user to confirm it actually lands off-peak in their own timezone, or supply a different cron expression. Use the same UTC-conversion-and-confirm discipline `/schedule` itself uses: state the conversion explicitly ("9am Europe/Copenhagen = 7am UTC, so `0 7 * * *`") before locking it in. Minimum interval is 1 hour — reject anything tighter and ask for a looser schedule.
  ```

  with:

  ````markdown
  **Step 5 — Resolve the schedule.**

  **5a. Parse the template's `default_schedule.cron_expression` back into a cadence.** Given the 5-field cron string `M H DOM MON DOW` (always UTC), classify it against these patterns in order — the first match wins:

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

  - **Every N hours:** call `AskUserQuestion` with `question`: `"Every how many hours?"`, `header`: `"Interval"`, `multiSelect`: `false`; if 5a pre-selected this cadence, pre-fill the recommended value from the parsed N. Accept a free-text number via the tool's `Other` field (there is no fixed small set of sensible N values to enumerate as options — offer 2 or 3 common values as options, e.g. `"3"`, `"6"`, `"12"`, each undescribed beyond the number, plus rely on `Other` for anything else). Reject N < 1 with the same rejection wording the existing minimum-interval check uses today ("reject anything tighter and ask for a looser schedule"). Resulting cron: `0 */N * * *`. No time-of-day follow-up for this cadence (see Global Constraints in the plan this step was implemented from for why).
  - **Daily:** ask for a UTC time-of-day (`HH:MM`, 24-hour). If 5a pre-selected this cadence, pre-fill the recommendation from the parsed `H:M`. State the conversion example explicitly in the prompt text, exactly as today's Step 5 did: "e.g. 9am Europe/Copenhagen = 7am UTC, so you'd enter `07:00` here." Resulting cron: `M H * * *`.
  - **Weekdays only:** same UTC time-of-day prompt as Daily. Resulting cron: `M H * * 1-5`.
  - **Weekly:** first ask for a day of week (Sunday through Saturday; if 5a pre-selected this cadence, pre-fill the recommendation from the parsed day), then the same UTC time-of-day prompt as Daily. Resulting cron: `M H * * D` (D = 0-6, Sunday=0).
  - **Monthly:** first ask for a day-of-month (1-31; if 5a pre-selected this cadence, pre-fill the recommendation from the parsed day), then the same UTC time-of-day prompt as Daily. Resulting cron: `M H D * *`.
  - **Custom cron expression:** unchanged from today — ask the user to type a 5-field cron expression directly. No parsing, no pre-selection, no time-of-day sub-prompt.

  **5d. Validate and lock in.** For every cadence except Custom, the resulting cron is assembled mechanically from the 5c inputs per the "Resulting cron" formulas above — no further confirmation prompt beyond what 5b/5c already gathered (mirrors today's single-confirm fast path when accepting the recommended cadence-as-is). For Custom, validate the typed cron against the same 1-hour minimum interval floor as today — reject anything tighter and ask for a looser schedule, identical wording to before this change.
  ````

- [ ] **Step 2: Verify**

  ```bash
  grep -n "Every N hours\|Weekdays only\|Custom cron expression" skills/routine/SKILL.md
  ```

  Expected: at least 3 hits (the picker option labels appear at minimum once each).

  ```bash
  grep -c "^## Step 5\|^\*\*Step 5" skills/routine/SKILL.md
  ```

  Expected: exactly 1 (no duplicated Step 5 header from a botched replacement).

- [ ] **Step 3: Commit**

  ```bash
  git add skills/routine/SKILL.md
  git commit -m "routine: replace raw-cron schedule step with a structured cadence picker"
  ```

---

### Task 2: UPDATE Step 3 — reuse the picker against the instantiated record's cron

**Files:**
- Modify: `skills/routine/SKILL.md`

**Interfaces:**
- Consumes: the cron-parsing classification rules and picker flow from Task 1.

- [ ] **Step 1: Update UPDATE Step 3's schedule-resolution sentence**

  Replace:

  ```
  **Step 3.** Re-resolve environment and schedule — the two fields pre-fill from different sources, not both from the record. For environment, follow CREATE Step 4's procedure exactly: check `.claude-tweaks/routine-environment-cache.yml` first, falling back to `RemoteTrigger list` if the cache is empty — never the instantiated record itself, since the record schema deliberately never stores `environment_id` (see `skills/_shared/routine-template-schema.md`). For schedule, follow CREATE Step 5's procedure but pre-fill the default from the existing record's `schedule` field instead of asking from scratch. (Repo URL and `PREFIXED_NAME` were already resolved in Step 1 — do not re-derive them.)
  ```

  with:

  ```
  **Step 3.** Re-resolve environment and schedule — the two fields pre-fill from different sources, not both from the record. For environment, follow CREATE Step 4's procedure exactly: check `.claude-tweaks/routine-environment-cache.yml` first, falling back to `RemoteTrigger list` if the cache is empty — never the instantiated record itself, since the record schema deliberately never stores `environment_id` (see `skills/_shared/routine-template-schema.md`). For schedule, follow CREATE Step 5's full cadence-picker procedure (5a-5d), but parse the existing record's `schedule` field for the 5a pre-selection instead of the template's `default_schedule.cron_expression` — the record's own currently-active cron is the more relevant "what's running today" starting point on an update than the template's shipped default, which may no longer match what this project actually instantiated. (Repo URL and `PREFIXED_NAME` were already resolved in Step 1 — do not re-derive them.)
  ```

- [ ] **Step 2: Verify**

  ```bash
  grep -n "5a-5d\|cadence-picker procedure" skills/routine/SKILL.md
  ```

  Expected: at least 1 hit.

- [ ] **Step 3: Commit**

  ```bash
  git add skills/routine/SKILL.md
  git commit -m "routine: UPDATE reuses the cadence picker, pre-selecting from the record's own cron"
  ```

---

### Task 3: Whole-repo verification sweep

**Files:** none modified — verification only.

- [ ] **Step 1: Confirm the picker's cron-parsing table correctly classifies every currently shipped routine template**

  For each of the 5 template files below, read its `default_schedule.cron_expression` directly and manually trace it through the classification table in Task 1's Step 1 (rule 1 through 6, first match wins). Confirm each resolves to the cadence stated:

  ```bash
  grep -A2 "default_schedule" skills/code-health/routine-template.yml skills/harness-health/routine-template.yml skills/tidy/routine-template.yml skills/tidy/routine-template-github-triage.yml skills/triage/routine-template.yml
  ```

  Expected classifications (per this plan's Global Constraints, already verified during planning): `code-health` → Daily 03:00 UTC; `harness-health` → Daily 05:00 UTC; `tidy` → Weekly, Sunday, 04:00 UTC; `tidy-github-triage` → Every N hours, N=3; `triage` → Weekdays only, 04:00 UTC. If any of these 5 cron strings has changed since this plan was written (a template file was edited by unrelated work), re-verify the classification still holds — do not assume the values above are frozen forever.

- [ ] **Step 2: Confirm `skills/_shared/routine-template-schema.md` was not touched**

  ```bash
  git diff --stat main -- skills/_shared/routine-template-schema.md
  ```

  Expected: no output (the design explicitly requires zero schema change).

- [ ] **Step 3: Confirm `skills/init/*` was not touched**

  ```bash
  git diff --stat main -- skills/init/
  ```

  Expected: no output (the design explicitly states `/init` Step 13 needs no changes).

- [ ] **Step 4: Confirm no duplicate or orphaned Step 5 content**

  ```bash
  grep -n "^\*\*Step 5" skills/routine/SKILL.md
  ```

  Expected: exactly 1 line (CREATE's Step 5 — UPDATE's Step 3 references it by name, it doesn't duplicate the procedure).

- [ ] **Step 5: Run the full test suite**

  ```bash
  npm test
  ```

  Expected: same baseline as this worktree's own starting point (717 tests, with the one pre-existing, unrelated `statusline.test.js` timing flake as the only occasionally-failing test — no new failures introduced by this plan's doc-only change).

- [ ] **Step 6: Final commit (if Step 1-4 surfaced any straggler fix)**

  If verification found any remaining gap, fix it now, re-verify, then:

  ```bash
  git add -A
  git commit -m "routine-schedule-picker: fix stragglers found by whole-repo sweep"
  ```

  If nothing was found, skip this commit — Task 3 is verification-only.

## Self-Review Notes

- **Spec coverage:** all 6 cadence options from the design's Solution list are present in Task 1's picker; the pre-selection mechanism (design's "Pre-selection, so the fast path stays fast" paragraph) is Task 1's 5a classification table; "no schema change needed" is confirmed and enforced as a Task 3 verification step; "`/init` Step 13 unchanged" is confirmed and enforced as a Task 3 verification step. All 5 of the design's Testing/verification scenarios map to this plan: scenario 1 (tidy default → Weekly pre-selection) and scenario 2 (github-triage variant → Every N hours, N=3 pre-selection) are directly covered by Task 1's 5a table and independently re-verified in Task 3 Step 1; scenario 3 (Daily + UTC conversion) is Task 1's 5c Daily follow-up; scenario 4 (Custom cron unchanged) is Task 1's 5c Custom follow-up, explicitly stated as unchanged; scenario 5 (sub-1-hour rejection) is Task 1's 5c Every-N-hours floor check and 5d's Custom floor check.
- **Design decision resolved during planning, documented not left implicit:** the design's blanket "whichever cadence is chosen (all except Custom) is followed by a time-of-day prompt" doesn't literally apply to Every N hours (no single time-of-day concept for a sub-daily `*/N` cycle) — resolved by narrowing that sentence's scope to the four calendar-based cadences, documented explicitly in Global Constraints rather than silently building something the design's literal text would have required but that doesn't make mechanical sense.
- **No new timezone-conversion automation invented** — preserved today's existing "present UTC, user does the mental conversion" convention rather than adding auto-detection, matching the design's explicit YAGNI framing ("no schema change needed... the picker is purely a friendlier way to produce that string").
- **No placeholders:** every edit is literal before/after text; the cron-classification table's 6 rules were manually traced against all 5 real shipped templates during planning (not just described abstractly) and all 5 produce the cadence the design doc's own testing scenarios expect.
