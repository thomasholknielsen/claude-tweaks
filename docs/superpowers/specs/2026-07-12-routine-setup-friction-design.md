# Routine Setup Friction Reduction

## Context

Running `/claude-tweaks:init` on a fresh project surfaces up to 9 optional interactive
prompts in Phase 0 alone, plus core-flow gates in Phases 1-9. The dominant contributor,
identified by tracing an actual run, is Step 13 (Routine Installation): it looks like a
single yes/no prompt but "Yes — walk me through each" hands off to
`/claude-tweaks:routine create <skill>` once per candidate. Today there are 6 routine
templates (`code-health`, `harness-health`, `journey-health`, `tidy` default, `tidy`
github-triage variant, `triage`), and each `create` invocation runs its own
multi-round-trip flow: resolve environment (Step 4), pick a cadence (Step 5b), answer a
per-cadence follow-up (Step 5c), then a separate review-gate confirm (Step 7). Worst
case: 6 candidates × up to 4 round-trips = 12-24 nested prompts hiding behind one line
of `/init`.

While tracing this flow, a second, independent defect surfaced: `/routine`'s CREATE
Step 5b asks for "exactly these 6 options" on the cadence-picker `AskUserQuestion` call,
but the tool's actual schema caps `options` at 4 items per question. As written, that
call would fail schema validation. This is a real bug, not just a friction complaint.

## Goals

- Collapse the per-routine CREATE flow (Steps 4, 5, 7 today) into as few round-trips as
  possible, defaulting to each template's own shipped `default_schedule` instead of
  asking the user to reconstruct it by hand.
- Collapse `/init` Step 13's across-candidate walkthrough into a single multiSelect
  picklist instead of one full CREATE flow per candidate.
- Fix the 6-option overflow bug as part of the same change (it lives in the exact code
  path being touched).
- Preserve the ability to customize a routine's schedule/environment — just make it an
  opt-in path, not the default one.

## Non-goals

- Redesigning the UPDATE `<skill>` or STATUS `<skill>` workflows beyond fixing their
  cross-references to CREATE's renumbered/merged steps. Their own behavior (diff
  display, drift detection) is unaffected and out of scope here.
- Changing any routine template's actual `default_schedule.cron_expression`. All 6
  shipped defaults stay as they are — 3 are already staggered daily times (03:00,
  04:00, 05:00 UTC), and the 2 outliers (`tidy` weekly, `tidy` github-triage every-3h)
  were deliberately tuned for their skill's needs.
- Reducing friction anywhere else in `/init` (Steps 9-12, 14-15, Scope Selection Gate,
  Phase 3/4/8/9 gates). Step 13 was the specific pain point traced and confirmed; the
  rest is out of scope for this design.

## Design — Layer 1: per-routine CREATE flow

Steps 1-3 (load template, resolve repo/`PREFIXED_NAME`, idempotency check) are
unchanged. Steps 4, 5, 6, 7 are replaced by:

**Step 4 (environment) — silent resolution.** Check
`.claude-tweaks/routine-environment-cache.yml` first, then fall back to
`RemoteTrigger {action: "list"}` and read `job_config.ccr.environment_id` off the most
recent routine, exactly as today. If either source yields a value, use it without
asking. Only ask the user directly when neither source has anything — this is the one
case where environment resolution still needs a round-trip.

**Step 5 (schedule) — cadence picker collapses to 4 options.** Parse the template's
`default_schedule.cron_expression` via the existing 5a classification table, unchanged.
The picker itself drops from 6 options to 4:

1. Every N hours
2. Daily
3. Weekly
4. Monthly

"Weekdays only" is no longer a top-level option — it becomes a follow-up modifier
offered only inside the Customize path below (asked as "every day, or weekdays only?"
right after choosing Daily there). "Custom cron expression" is dropped as an explicit
option entirely; `AskUserQuestion`'s built-in `Other` field already accepts free text,
so a typed cron expression is handled the same way it always was, just without a
redundant explicit option consuming one of the 4 slots.

When 5a finds a clean match, that cadence is marked `(Recommended)`. When 5a finds no
match (today's row 6, "no cadence pre-selected"), **Daily is marked `(Recommended)` as
the fallback** rather than leaving nothing marked — this only affects templates whose
cron doesn't cleanly classify into the existing 5 patterns; none of the 6 shipped
templates hit this case today.

**Step 6 (assemble body).** Unchanged — still assembles the full `RemoteTrigger create`
body from the resolved environment + cadence.

**Step 7 (merged preview + confirm).** Render the assembled schedule and environment as
plain text (e.g. "Nightly at 03:00 UTC, environment `env-abc123` (cached)"), then call
**one** `AskUserQuestion`:

- `question`: `"Create this routine with these settings?"`, `header`: `"Confirm routine"`, `multiSelect`: `false`
- Option 1 — `label`: `"Yes, create with defaults (Recommended)"`, `description`: `"Proceed with the settings shown above"`
- Option 2 — `label`: `"Customize schedule or environment"`, `description`: `"Ask me to change the cadence, time, or environment before creating"`
- Option 3 — `label`: `"Cancel"`, `description`: `"Do not create anything"`

This reverses the original Step 7's deliberate no-`(Recommended)` restraint on
billed/irreversible infrastructure — confirmed acceptable because the assembled preview
is now always shown as part of the same round-trip, so the safety property (user sees
exactly what will be created before confirming) is preserved; only the bias-avoidance
convention is relaxed.

Selecting **Customize** drops into the old Step 5b/5c flow (now with the 4-option
picker described above, plus the Daily/weekdays-only modifier), followed by the same
merged preview+confirm shown again with the customized values. Selecting **Cancel**
or **Yes** proceeds exactly as today's Step 7/8/9 (create + write instantiated record,
or stop).

**Net effect for a single routine:** the common "accept defaults" path drops from 3-4
round-trips to 1. The rare "customize" path still gets full control, just reached via
an explicit opt-in rather than being the only path.

## Interface: `--defaults` flag on `/routine create`

Layer 2 needs a way to create several routines with zero further prompting per item,
without `/init` reimplementing body assembly, `RemoteTrigger` calls, or record writing
— `bootstrap-steps.md` today explicitly forbids `/init` from reimplementing,
shortcutting, or pre-answering any part of `/routine`'s workflow, and that boundary is
worth keeping (it's the reason routine-creation logic has exactly one owner). The fix
is an explicit flag, not a silent bypass:

`/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id>`

runs Steps 1-3 (load, resolve, idempotency check) unchanged, skips Step 4 (uses the
supplied `--environment`), skips Step 5's interactive picker entirely (uses the
template's own `default_schedule.cron_expression` verbatim, no classification/no
follow-up), assembles the body (Step 6), **skips Step 7's interactive confirm**, and
proceeds straight to Step 8 (create) and Step 9 (write record). It prints a one-line
result (routine name, ID, console URL) instead of anything interactive. If `--defaults`
is passed without `--environment` and neither the cache nor `RemoteTrigger list` has a
value, it stops and asks for one — `--defaults` skips *known* prompts, it doesn't
suppress a genuinely unresolvable one.

This flag is not `/init`-specific — any caller (including a user typing the command
directly) can use `--defaults --environment=<id>` to create a routine non-interactively.
`/init`'s Layer 2 is simply the first caller: it resolves environment once, then invokes
this flag once per candidate the user selected in the multiSelect picklist.

## Design — Layer 2: `/init` Step 13 batch flow

Replace the current "walk me through each" hand-off loop with:

1. **Render the candidate table as plain text** before asking anything — one row per
   candidate: skill (+ variant if any), human-readable default schedule (derived via
   the same 5a classification the per-routine flow uses), and the template's `notes`
   field if present. This is the preview; nothing here is a tool call.
2. **Resolve environment once**, using the same silent cache/list resolution as Layer 1
   Step 4 — shared across every candidate the user goes on to select, never re-asked
   per item. Only surfaces a round-trip in the rare case neither cache nor `list` has
   anything.
3. **One multiSelect picklist** (or several, grouped) presenting the candidates
   themselves as the checkboxes — no intermediate "what's your strategy" question.
   Since `AskUserQuestion` caps `options` at 4 per question (regardless of
   `multiSelect`), split candidates into `ceil(N/4)` questions of ≤4 options each,
   all issued in the same call (the tool allows up to 4 questions per call — e.g. 6
   candidates become two grouped questions, "Which routines to set up (1/2)" and
   "(2/2)", answered together as one form). Selecting an item in this call **is** the
   confirmation to create it — there is no separate follow-up confirm, mirroring the
   Layer 1 collapse.
4. **Create each selected candidate** by invoking
   `/claude-tweaks:routine create <skill> [--variant=<name>] --defaults --environment=<id> --source init`
   (the flag introduced above) — no per-item prompting, since `--defaults` already
   skips Steps 4/5/7's interactive parts. Report results (routine ID + console URL per
   created routine, from Step 8/9) as a single summary after all selected candidates
   are created.

Customizing an individual routine's schedule/environment is intentionally **not**
supported inline in the batch flow — a user who wants that declines it here and runs
`/claude-tweaks:routine create <skill> [--variant=<name>]` afterward, where the full
Customize path (Layer 1) is available. Keeps the batch flow to a fixed, small number of
round-trips regardless of how many candidates exist.

**Edge case:** if candidate count grows large enough that `ceil(N/4)` picklist
questions plus an unresolved-environment question would exceed the tool's 4-questions-
per-call cap (13+ candidates with no cached environment — not reachable with today's 6
templates), resolve environment in its own preceding call first, then issue the
picklist question(s) in a second call.

**Net effect:** worst case (6 candidates, first-ever run, nothing cached) drops from
12-24 nested prompts to 2 round-trips (one to resolve environment, one grouped
multiSelect picklist that doubles as the create confirmation). A re-run with a cached
environment and ≤4 remaining candidates drops to a single round-trip.

## Implementation notes

- `/routine`'s UPDATE `<skill>` workflow references "CREATE Step 4's procedure" (for
  environment) and "CREATE Step 5's full cadence-picker procedure" (for schedule) by
  name. Both references need to point at the renumbered/merged steps above — UPDATE's
  own behavior (diff display before applying, its own review-gate confirm) is
  unchanged, only the step numbers/labels it points to shift.
- `/init`'s `bootstrap-steps.md` Step 13 and `SKILL.md`'s Step 13 summary both need
  updating to describe the batch flow instead of the per-candidate hand-off loop.
- The 6→4 option fix and the Daily-fallback-recommendation change apply to Layer 1
  regardless of Layer 2 — even a user who runs `/claude-tweaks:routine create` directly
  (never through `/init`) benefits from and needs the schema fix.
- `/routine`'s `## Input` section needs the new `--defaults` and `--environment=<id>`
  flags documented alongside existing flags (`--variant`, `--dry-run`, `--source`), and
  its Anti-Patterns/Relationship tables need a row/update reflecting that `/init` now
  calls CREATE with `--defaults --environment=<id> --source init` per selected
  candidate rather than the unflagged interactive form.

## Testing / verification

No test suite covers `/routine` or `/init` prompt flows directly (they're
LLM-interpreted markdown, not executable code) — verification is a manual trace: read
the edited `bootstrap-steps.md` and `routine/SKILL.md` Steps end-to-end and confirm (a)
no `AskUserQuestion` call in either file specifies more than 4 options or more than 4
questions, (b) every cross-reference from UPDATE/STATUS to CREATE step numbers still
resolves to the right step after renumbering, (c) the Anti-Patterns and Relationship
tables in both `SKILL.md` files still accurately describe the new flow.
