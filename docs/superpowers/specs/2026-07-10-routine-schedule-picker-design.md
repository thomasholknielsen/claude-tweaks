# Routine schedule picker — Design

## Problem

`/claude-tweaks:routine`'s CREATE Step 5 and UPDATE Step 3 offer exactly one
way to set a schedule: confirm the template's default cron expression, or type
a replacement cron expression by hand. There's no structured way to say
"daily at 9am" or "every 3 hours" — you either accept the shipped default or
already know cron syntax.

This matters more than it looks because the four shipped templates already
span a real range of cadences that a raw-cron-only UI doesn't make
discoverable: `code-health`/`harness-health` run daily, `tidy-weekly` runs
weekly, `tidy-github-triage` runs every 3 hours, and `flow` runs weekdays-only.
Nobody instantiating a routine can tell any of this without reading the
template file's cron expression directly.

`/claude-tweaks:init` Step 13 purely delegates to `/routine`'s workflow (by
design — it "does not reimplement, shortcut, or pre-answer any part of that
workflow"), so this same gap surfaces there too, for anyone setting up a
routine during bootstrap.

## Solution

Replace the "confirm cron or type your own" step with a structured cadence
picker, covering every cadence a shipped template actually uses plus a raw
escape hatch:

1. **Every N hours** (matches `tidy-github-triage`'s default)
2. **Daily** (matches `code-health`/`harness-health`)
3. **Weekdays only** (matches `flow`)
4. **Weekly**, picking a day (matches `tidy-weekly`)
5. **Monthly**, picking a day-of-month
6. **Custom cron expression** — the existing raw-input path, unchanged, for
   anything the structured options don't cover

Whichever cadence is chosen (all except Custom) is followed by a time-of-day
prompt in the user's local timezone — reusing the same UTC-conversion-and-
confirm discipline `/schedule` and `/routine` already use ("9am
Europe/Copenhagen = 7am UTC, so `0 7 * * *`") — before assembling the final
`cron_expression`. Same 1-hour minimum interval floor as today; a chosen
"every N hours" value below that floor is rejected the same way an
out-of-range custom cron is today.

**Pre-selection, so the fast path stays fast.** The picker parses the
template's own `default_schedule.cron_expression` back into a cadence + time
and pre-selects that option, so accepting the recommended schedule as-is
remains a single confirm — exactly as fast as today's "confirm the default"
path, just discoverable instead of opaque.

**No schema change needed.** `default_schedule.cron_expression` stays a plain
cron string (`skills/_shared/routine-template-schema.md` is unchanged) — the
picker is purely a friendlier way to *produce* that string at instantiation
time, on both the CREATE and UPDATE paths. `/init` Step 13 needs no changes at
all, since it never touches schedule resolution directly.

## Out of scope (YAGNI)

- **A structured `default_schedule.cadence` field in the template schema.**
  The picker only needs to parse and produce a cron string; templates
  themselves don't need to declare their cadence in a new structured way.
- **Cadence options beyond what shipped templates actually use.** No
  quarterly/yearly options, no arbitrary custom recurrence rules beyond what
  raw cron already covers via the Custom escape hatch.

## Key decisions (from conversation)

| Decision | Choice |
|---|---|
| Cadence options | Every-N-hours / Daily / Weekdays-only / Weekly / Monthly / Custom cron — covers every shipped template's actual default, not just daily/weekly/monthly |
| Schema impact | None — `default_schedule.cron_expression` stays a plain string |
| Default pre-selection | Parsed back from the template's own cron expression, so accept-as-is stays one confirm |
| `/init` Step 13 | Unchanged — it delegates entirely to `/routine`'s workflow |

## Testing / verification approach

1. Run `/routine create tidy` (default template, weekly) — confirm the picker
   pre-selects "Weekly" with the right day/time parsed from the shipped
   default, and that accepting it produces the identical `cron_expression`
   as today's flow.
2. Run `/routine create tidy --variant=github-triage` — confirm the picker
   pre-selects "Every N hours" with `N=3`.
3. Choose "Daily" with a specific local time and confirm the UTC conversion
   matches the stated example format, then confirm the assembled
   `cron_expression` is correct.
4. Choose "Custom cron expression" and confirm the raw-input path behaves
   exactly as it does today, unchanged.
5. Attempt an "every N hours" value below the 1-hour minimum and confirm it's
   rejected the same way an out-of-range custom cron is today.
