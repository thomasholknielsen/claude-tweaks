---
record: 212
origin: capture
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 212: Routine templates cannot express a one-off run, and one-off runs do not count against the daily cap

Surface: backend

## Current State

`skills/routine/schedule-resolution.md` (CREATE Step 5's 5a-5d, reused by UPDATE Step 3) classifies and produces recurring 5-field cron expressions only — the cadence picker (5b-5d) offers "Every N hours" / "Daily" / "Weekly" / "Monthly" plus a typed cron via `Other`, and the routine record's `schedule` field always stores a cron string (`skills/routine/create-and-update.md` Step 6/9's body assembly).

The underlying Claude Code Routines/`RemoteTrigger` API also accepts `run_once_at` — a single absolute-timestamp firing, after which the routine auto-disables and the web UI marks it "Ran." The global `/schedule` skill already supports one-off phrasing conversationally ("in 2 weeks, open a cleanup PR"), but `/claude-tweaks:routine` — the plugin's own scheduling entry point — has no way to express that; every routine it creates today is recurring.

One-off runs do not count against the account's daily routine-run cap, while recurring runs do. This doesn't reopen the recon-routine-budget-decision question closed earlier — that decision was about the lack of a query API for cap usage, which still doesn't exist — but a run class that doesn't draw against the cap at all is a distinct, narrower capability worth adding regardless.

## Deliverables

1. Add a cadence-mode entry point (recurring vs one-off) to the routine template shape and to `schedule-resolution.md`'s 5b picker — a new top-level choice alongside "Every N hours" / "Daily" / "Weekly" / "Monthly," discoverable the same way those four are, not buried in the typed-cron `Other` field.
2. Extend the cadence-picker follow-up (5c) with a one-off branch that collects an absolute date/time (UTC) rather than a cron shape, producing a `run_once_at` timestamp instead of a `cron_expression`.
3. Extend the routine record schema (`create-and-update.md` Step 6/9's body assembly, and UPDATE Step 3's re-resolution) so a record can represent "fires once, then done" as a distinct, structurally-tagged state — not string-sniffed from whatever's in the `schedule` field.
4. Wire the resolved `run_once_at` value through to the `RemoteTrigger` create call (CREATE Step 8/9) the same way `cron_expression` is threaded today, keeping the two mutually exclusive on the wire.
5. Update `skills/routine/SKILL.md` (or the appropriate doc) to state explicitly that a one-off routine is exempt from the daily routine-run cap, rather than leaving that true only in practice.

## Acceptance Criteria

- Running `/claude-tweaks:routine` end-to-end can produce a one-off routine that fires once at a given absolute time and auto-disables afterward, without going through the recurring cron path.
- The cadence picker in `schedule-resolution.md` offers a one-off option that is discoverable the same way the four recurring options are.
- A routine record created as one-off is distinguishable from a recurring record by its stored schema shape, not by parsing the `schedule` string.
- Existing recurring-routine CREATE/UPDATE behavior is unchanged — verified by re-reading `schedule-resolution.md` 5a-5d and `create-and-update.md` Steps 5/6/7/9 for regressions after the change.
- Any reader of the record's `schedule` field (`status.md`, `record-freshness.md`, or equivalent) handles a one-off record without erroring or misclassifying it as recurring.

## Technical Approach

- `skills/routine/schedule-resolution.md`: add a one-off branch at 5b/5c that produces an absolute timestamp instead of routing through 5a's cron classification table.
- `skills/routine/create-and-update.md`: Step 5 needs a cadence-mode switch (recurring vs one-off) upstream of today's "use the template's `default_schedule.cron_expression` verbatim" default-path logic; Step 6/9's body assembly needs a `run_once_at` field alongside (or instead of) `schedule: "<cron_expression>"`.
- Confirm against the `RemoteTrigger` API's actual accepted shape how `run_once_at` and `cron_expression` are mutually exclusive on the wire, and mirror that exclusivity in the record schema rather than letting both fields coexist ambiguously.

## Gotchas

- Doesn't reopen the closed recon-routine-budget-decision question — no query API for cap usage exists, and this deliverable doesn't add one; it only adds a run class that doesn't draw against the cap at all.
- `create-and-update.md` Step 7 already flags routines as "live, billed infrastructure with no delete API" — a one-off firing still creates that infrastructure (a trigger on the Anthropic side), it just self-disables after firing; don't conflate "auto-disables" with "gets cleaned up."
- `status.md`/`record-freshness.md` and any other reader of the `schedule` field need auditing for an implicit assumption that it's always a cron string.

## Original request

Routine templates cannot express a one-off run, and one-off runs do not count against the daily cap

**Related:** none

Context: `routine/schedule-resolution.md` classifies and emits recurring 5-field cron only. The API also accepts `run_once_at` — a single firing at an absolute timestamp, after which the routine auto-disables and the web UI marks it **Ran**. `/schedule` supports this conversationally ("in 2 weeks, open a cleanup PR"); `/claude-tweaks:routine` has no way to express it.

Scope: The reason this is worth more than parity: **one-off runs do not count against the account's daily routine-run cap**, while recurring runs do. That partially reopens the budget question closed earlier (see the recon-routine budget decision) — not by exposing a query API, which still doesn't exist, but by providing a class of run that doesn't draw down the constrained pool at all. Would need a template field, a cadence-picker branch that produces a timestamp rather than a cron, and a record schema that can represent "fires once, then done".
