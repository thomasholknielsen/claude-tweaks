# Routine — Schedule Resolution (CREATE Step 5's 5a-5d)

Loaded by `/claude-tweaks:routine`'s CREATE Step 5 and UPDATE Step 3 (`create-and-update.md` in this
skill's directory), and cited by `/claude-tweaks:init`'s Step 15 (`skills/init/bootstrap/step-15-routine-installation.md`)
for 5a's classification table alone. Kept out of `SKILL.md` because a `status` run never resolves a
schedule at all, and `update --defaults` skips schedule re-resolution entirely.

Sub-step numbering (`5a`-`5d`) matches CREATE Step 5, so existing cross-references from other skills
keep pointing at the right sub-step. 5a runs on every CREATE path (its classification produces the
human-readable form Step 7's preview needs); 5b-5d — the interactive picker — are reached only via
Step 7's Customize branch on CREATE, or directly from UPDATE Step 3.

---

**5a. Parse a cron expression back into a cadence** (here, the template's `default_schedule.cron_expression`; UPDATE Step 3 reuses this same sub-step against the instantiated record's `schedule` field instead — the classification logic below is source-agnostic, it only looks at the cron string itself). **First check the input record's own `cadence` field** (only ever set on UPDATE re-resolution against an existing record — a template has no `cadence` field, so CREATE always falls straight through to the cron classification below): when `cadence` is `once`, skip cron-pattern classification entirely, recommend the **One-off** class at 5b below, and carry the record's `run_once_at` value forward as 5c-once's pre-fill. Otherwise (no `cadence` field, or `cadence: recurring`), classify the 5-field cron string `M H DOM MON DOW` (always UTC) against these patterns in order — the first match wins:

| # | Pattern (MON/DOM/DOW fixed values, H/M shape) | Cadence | Parsed value |
|---|---|---|---|
| 1 | `MON=*`, `DOM=*`, `DOW=*`, `M=0`, `H` matches `*/N` | Every N hours | N |
| 2 | `MON=*`, `DOM=*`, `DOW=*`, `H`/`M` plain integers | Daily | time `H:M` UTC |
| 3 | `MON=*`, `DOM=*`, `DOW=1-5`, `H`/`M` plain integers | Weekdays only | time `H:M` UTC |
| 4 | `MON=*`, `DOM=*`, `DOW` a single digit 0-6, `H`/`M` plain integers | Weekly | day = DOW (0=Sun..6=Sat), time `H:M` UTC |
| 5 | `MON=*`, `DOW=*`, `DOM` a plain integer 1-31, `H`/`M` plain integers | Monthly | day-of-month = DOM, time `H:M` UTC |
| 6 | Anything else | (no match) | none — no cadence pre-selected |

Row 1 requires `M=0` because every cron this workflow itself generates for "Every N hours" is `0 */N * * *` (see 5c below) — a custom-typed cron with an `H` shaped like `*/N` but a non-zero minute (e.g. `15 */6 * * *`, entered via 5b's `Other` field on an earlier run) is *not* safely re-classifiable as "Every N hours," since accepting the N-only picker on a later re-parse would silently reset that minute offset to 0. Such a cron falls through to row 6 instead (no cadence pre-selected) — it still parses fine as a raw string everywhere else, it just isn't offered as a pre-filled recommendation.

**5b. Present the cadence picker.** (On the CREATE flow, reached only via Step 7's Customize branch — never on CREATE's default forward path, regardless of `--defaults`; see Step 5's own opening rule. UPDATE Step 3 invokes 5a-5d directly, with no Customize branch of its own.) The picker is two sequential `AskUserQuestion` calls rather than one, because `AskUserQuestion` caps each question at 4 options (`docs/skill-authoring.md`'s Multi-item decisions convention) and there are now 5 co-equal top-level choices — Every N hours / Daily / Weekly / Monthly / One-off. Splitting on the recurring-vs-one-off axis first keeps One-off exactly as discoverable as the four recurring options — the very first choice offered, never buried in `Other` — while staying inside the tool's per-question cap.

**5b-i. Cadence class.** Call `AskUserQuestion` with `question`: `"Recurring, or a one-off run?"`, `header`: `"Cadence class"`, `multiSelect`: `false`:

- Option 1 — `label`: `"Recurring"`, `description`: `"Runs on a repeating schedule (every N hours, daily, weekly, or monthly)"`
- Option 2 — `label`: `"One-off"`, `description`: `"Fires once at a time you choose, then auto-disables — does not count against the daily routine-run cap"`

Mark `(Recommended)` on **One-off** when 5a recommended it (the input record's own `cadence` was `once`); otherwise mark `(Recommended)` on **Recurring** — matching 5a's existing default-to-Daily fallback when nothing else pre-selects a choice, since Recurring is the class every prior cadence (rows 1-6) maps into.

**Choosing Recurring** proceeds to 5b-ii below. **Choosing One-off** skips 5b-ii and every cron-based branch of 5c entirely — go straight to 5c-once's one-off follow-up.

**5b-ii. Recurring cadence** (reached only when 5b-i chose Recurring). Call `AskUserQuestion` with `question`: `"How often should this routine run?"`, `header`: `"Cadence"`, `multiSelect`: `false`, and exactly these 4 options — a typed cron expression is still available via the tool's built-in `Other` field, so there is no separate "Custom cron expression" option consuming one of the 4 slots:

- Option 1 — `label`: `"Every N hours"`, `description`: `"Fires every N hours starting from UTC midnight (e.g. N=3 fires at 00:00, 03:00, 06:00 UTC, ...)"`
- Option 2 — `label`: `"Daily"`, `description`: `"Fires once a day (or on weekdays only) at a UTC time you choose"`
- Option 3 — `label`: `"Weekly"`, `description`: `"Fires once a week on a day you choose, at a UTC time you choose"`
- Option 4 — `label`: `"Monthly"`, `description`: `"Fires once a month on a day-of-month you choose, at a UTC time you choose"`

Mark `(Recommended)` according to the 5a match: rows 1, 4, and 5 map directly to the same-named option above. Rows 2 and 3 (Daily and Weekdays only) both map to the **Daily** option — weekdays-only is now a follow-up modifier under Daily, not a separate top-level choice (see 5c). Row 6 (no match, including "input was a one-off record") also recommends **Daily**, as the sensible fallback rather than leaving nothing marked.

**5c. Per-cadence follow-up**, based on which option was chosen in 5b-ii (reached only on the Recurring branch — see 5c-once below for One-off). Each follow-up bundles every sub-answer it needs into a single `AskUserQuestion` call (multiple `questions` entries in one call) rather than one call per sub-answer:

- **Every N hours:** call `AskUserQuestion` with one question, `question`: `"Every how many hours?"`, `header`: `"Interval"`, `multiSelect`: `false`; if 5a pre-selected this cadence, pre-fill the recommended value from the parsed N — if that parsed N isn't among the common values offered as options, add it as its own explicit option so it can still carry `(Recommended)` (a value tucked inside `Other` can't be pre-marked recommended). Accept a free-text number via the tool's `Other` field (there is no fixed small set of sensible N values to enumerate as options — offer 2 or 3 common values as options, e.g. `"3"`, `"6"`, `"12"`, each undescribed beyond the number, plus rely on `Other` for anything else). Reject N < 1 with the same rejection wording the existing minimum-interval check uses today ("reject anything tighter and ask for a looser schedule"). Resulting cron: `0 */N * * *`. No time-of-day follow-up for this cadence — a sub-daily `*/N` cycle anchored at UTC hour 0 has no single time-of-day to anchor, unlike the three calendar-based cadences below.
- **Daily:** call `AskUserQuestion` with **two** `questions` entries in the same call: (1) `question`: `"Every day, or weekdays only?"`, `header`: `"Days"`, `multiSelect`: `false`, options `"Every day"` and `"Weekdays only"` — mark `(Recommended)` on `"Weekdays only"` if 5a's match was row 3, otherwise mark `(Recommended)` on `"Every day"` (covers both row 2 and the row-6 fallback); (2) `question`: `"What UTC time?"`, `header`: `"Time"`, `multiSelect`: `false`, free-text `HH:MM` (24-hour) via `Other`, pre-filled as the recommendation from the parsed `H:M` when 5a matched row 2 or row 3. State the conversion example explicitly in question (2)'s prompt text, exactly as before: "e.g. 9am Europe/Copenhagen = 7am UTC, so you'd enter `07:00` here." Resulting cron: `M H * * *` if "Every day" was chosen, `M H * * 1-5` if "Weekdays only" was chosen.
- **Weekly:** call `AskUserQuestion` with **two** `questions` entries in the same call: (1) day of week (Sunday through Saturday; if 5a pre-selected this cadence, pre-fill the recommendation from the parsed day), (2) the same UTC time-of-day question as Daily's question (2) above. Resulting cron: `M H * * D` (D = 0-6, Sunday=0).
- **Monthly:** call `AskUserQuestion` with **two** `questions` entries in the same call: (1) day-of-month (1-31; if 5a pre-selected this cadence, pre-fill the recommendation from the parsed day), (2) the same UTC time-of-day question as Daily's question (2) above. Resulting cron: `M H D * *`.

A typed cron expression via `Other` on the 5b-ii question bypasses the rest of 5c entirely — no parsing, no pre-selection, no time-of-day sub-prompt, identical to today's Custom cron path.

**5c-once. One-off follow-up** (reached only when 5b-i chose One-off). Call `AskUserQuestion` with one question, `question`: `"When should this fire (UTC)?"`, `header`: `"Fire time"`, `multiSelect`: `false`, free-text absolute date/time via the tool's `Other` field (ISO 8601, e.g. `2026-09-15T14:00` — no fixed set of sensible options to enumerate, since any future instant is valid). State the conversion example explicitly in the prompt text, mirroring 5c's Daily/Weekly/Monthly time-of-day question: "e.g. 9am Europe/Copenhagen on Sept 15 = 7am UTC, so you'd enter `2026-09-15T07:00` here." When 5a carried a pre-fill forward (an existing record's `run_once_at`, on UPDATE re-resolution), pre-fill and recommend that value. No day-of-week/day-of-month sub-question — a one-off fires at a single absolute instant, not a recurring point in a calendar cycle. Resulting value: `run_once_at`, the collected timestamp, normalized to UTC ISO 8601.

**5d. Validate and lock in.** For every recurring cadence produced by 5b-ii/5c, the resulting cron is assembled mechanically from the 5c inputs per the "Resulting cron" formulas above — no further confirmation prompt beyond what 5b-ii/5c already gathered. For a typed cron via `Other`, validate it against the same 1-hour minimum interval floor as today — reject anything tighter and ask for a looser schedule, identical wording to before this change. For a one-off cadence, validate 5c-once's collected timestamp parses as a well-formed ISO 8601 UTC date/time and names an instant in the future — reject an unparseable or past timestamp and ask again ("that time has already passed (or isn't a valid date/time) — enter a future UTC date/time"); the 1-hour minimum-interval floor does not apply here, since there is only one firing to space, not a recurring cycle to protect from over-tight spacing.
