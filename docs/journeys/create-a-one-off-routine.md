---
files:
  - plugin/skills/routine/schedule-resolution.md
  - plugin/skills/routine/create-and-update.md
  - plugin/skills/_shared/routine-template-schema.md
---

# Create a One-Off Routine

**Persona:** Repo maintainer who wants a single deliberate scheduled run -- "open a cleanup PR in two weeks", "audit this migration once, next Monday" -- rather than a recurring sweep.
**Goal:** Run `/claude-tweaks:routine create <skill>`, choose One-off at the cadence picker, supply an absolute UTC fire time, and end with a live routine that fires exactly once, auto-disables afterward, and never draws against the account's daily routine-run cap.

## Steps

1. **Invoke create, then Customize** -- Type `/claude-tweaks:routine create <skill>`, then choose "Customize..." at Step 7's confirm (the default forward path always resolves a recurring cron from the template, since a template's `default_schedule` has no one-off form -- reaching the cadence picker at all requires Customize).
   - **Action:** `create-and-update.md` Step 5 routes to `schedule-resolution.md`'s 5a-5d.
   - **Check:** 5a's classification is skipped for a fresh CREATE (no prior `cadence` field to read) -- the picker opens with nothing pre-selected toward One-off.

2. **Choose cadence class** -- Answer "Recurring, or a one-off run?"
   - **Action:** `schedule-resolution.md` 5b-i presents a first, standalone `AskUserQuestion` -- Recurring vs. One-off -- ahead of the four recurring options, so One-off is exactly as discoverable as Every N hours / Daily / Weekly / Monthly, never buried in the typed-cron `Other` field.
   - **Check:** Choosing "One-off" skips 5b-ii and every cron-based branch of 5c entirely -- there is no recurring follow-up to answer.

3. **Supply the fire time** -- Answer "When should this fire (UTC)?" with an absolute date/time.
   - **Action:** 5c-once collects a free-text ISO 8601 UTC timestamp (e.g. `2026-09-15T07:00`), with the same ergonomic conversion example the recurring time-of-day question already uses ("9am Europe/Copenhagen on Sept 15 = 7am UTC").
   - **Check:** 5d validates the timestamp parses and names a future instant -- a past or unparseable time is rejected with "that time has already passed (or isn't a valid date/time) -- enter a future UTC date/time." The 1-hour minimum-interval floor recurring cadences enforce does not apply here; there is only one firing to space.

4. **Confirm the preview** -- Review Step 7's rendered summary before anything is created.
   - **Action:** The schedule line reads "Fires once at {time} UTC, then auto-disables -- does not count against the daily routine-run cap" instead of a recurring cadence description.
   - **Check:** Environment and branch lines render exactly as any other create; this creates live, billed infrastructure with no delete API even though it self-disables after firing -- "auto-disables" is not "gets cleaned up."

5. **Create** -- Confirm, and the routine is provisioned.
   - **Action:** Step 6 sends `run_once_at` on the `RemoteTrigger create` body in place of `cron_expression` (the two are mutually exclusive on the wire); the instantiated record is written with `cadence: once` and a `run_once_at` field, never a `schedule` field.
   - **Check:** `status <skill>` reports the routine In sync, showing `run_once_at` rather than a cron schedule.

## Outcome

The maintainer ends with a routine live in the console that fires exactly once at the chosen UTC instant, then auto-disables (the web UI marks it "Ran"). The instantiated record is distinguishable from a recurring one by its schema shape (`cadence: once` plus `run_once_at`, never `schedule`) rather than by parsing a cron string, and the firing never drew against the account's daily routine-run cap.

## Origin
- Created during wrap-up of record #212 ("Routine templates cannot express a one-off run, and one-off runs do not count against the daily cap")
- Steps 1-5 built in this session
- Related specs: none
