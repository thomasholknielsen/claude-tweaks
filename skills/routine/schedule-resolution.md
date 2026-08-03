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

**5a. Parse a cron expression back into a cadence** (here, the template's `default_schedule.cron_expression`; UPDATE Step 3 reuses this same sub-step against the instantiated record's `schedule` field instead — the classification logic below is source-agnostic, it only looks at the cron string itself). Given the 5-field cron string `M H DOM MON DOW` (always UTC), classify it against these patterns in order — the first match wins:

| # | Pattern (MON/DOM/DOW fixed values, H/M shape) | Cadence | Parsed value |
|---|---|---|---|
| 1 | `MON=*`, `DOM=*`, `DOW=*`, `M=0`, `H` matches `*/N` | Every N hours | N |
| 2 | `MON=*`, `DOM=*`, `DOW=*`, `H`/`M` plain integers | Daily | time `H:M` UTC |
| 3 | `MON=*`, `DOM=*`, `DOW=1-5`, `H`/`M` plain integers | Weekdays only | time `H:M` UTC |
| 4 | `MON=*`, `DOM=*`, `DOW` a single digit 0-6, `H`/`M` plain integers | Weekly | day = DOW (0=Sun..6=Sat), time `H:M` UTC |
| 5 | `MON=*`, `DOW=*`, `DOM` a plain integer 1-31, `H`/`M` plain integers | Monthly | day-of-month = DOM, time `H:M` UTC |
| 6 | Anything else | (no match) | none — no cadence pre-selected |

Row 1 requires `M=0` because every cron this workflow itself generates for "Every N hours" is `0 */N * * *` (see 5c below) — a custom-typed cron with an `H` shaped like `*/N` but a non-zero minute (e.g. `15 */6 * * *`, entered via 5b's `Other` field on an earlier run) is *not* safely re-classifiable as "Every N hours," since accepting the N-only picker on a later re-parse would silently reset that minute offset to 0. Such a cron falls through to row 6 instead (no cadence pre-selected) — it still parses fine as a raw string everywhere else, it just isn't offered as a pre-filled recommendation.

**5b. Present the cadence picker.** (On the CREATE flow, reached only via Step 7's Customize branch — never on CREATE's default forward path, regardless of `--defaults`; see Step 5's own opening rule. UPDATE Step 3 invokes 5a-5d directly, with no Customize branch of its own.) Call `AskUserQuestion` with `question`: `"How often should this routine run?"`, `header`: `"Cadence"`, `multiSelect`: `false`, and exactly these 4 options — a typed cron expression is still available via the tool's built-in `Other` field, so there is no separate "Custom cron expression" option consuming one of the 4 slots:

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
