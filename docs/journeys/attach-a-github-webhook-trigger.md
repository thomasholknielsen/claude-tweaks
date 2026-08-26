---
files:
  - plugin/skills/routine/webhook-trigger.md
  - plugin/skills/_shared/routine-template-schema.md
---

# Attach a GitHub Webhook Trigger

**Persona:** Repo maintainer who already has a scheduled routine running (e.g. `code-health-daily`) and wants it to *also* fire on a specific kind of GitHub activity -- "run this the moment a PR touching `migrations/` opens against `main`" -- rather than waiting for the next scheduled tick.
**Goal:** Run `/claude-tweaks:routine webhook-trigger <skill>`, name the events and (optionally) a filter, and end with the existing routine also firing on matching GitHub events, in addition to its schedule -- with both preconditions (Claude GitHub App install state, hourly event cap) surfaced before anything is created.

## Steps

1. **Invoke webhook-trigger against an existing routine** -- Type `/claude-tweaks:routine webhook-trigger <skill> --events pull_request`.
   - **Action:** `webhook-trigger.md` Step 1 resolves `PREFIXED_NAME` the same way CREATE does, then requires an existing instantiated record for this project+skill.
   - **Check:** If no routine exists yet for `<skill>` in this project, the mode stops immediately with "run `create <skill>` first" -- there is no guided-creation fallback here, since there's no environment to resolve for an already-existing routine.

2. **Resolve events and filter** -- Either pass `--events`/`--filter` directly, or answer the prompts.
   - **Action:** Step 2 takes the comma-separated event list from `--events` (or asks directly if omitted); Step 3 exposes the filter grammar generically -- eight fields (`author`, `title`, `body`, `base_branch`, `head_branch`, `labels`, `is_draft`, `is_merged`) each combinable with six operators (`equals`, `contains`, `starts_with`, `is_one_of`, `is_not_one_of`, `matches_regex`).
   - **Check:** An empty filter is valid but must be explicitly confirmed -- "every event of the listed types fires the routine" is never landed on silently by omission.

3. **Review the preview, including both preconditions** -- Read Step 4's rendered summary before confirming.
   - **Action:** The preview always shows two precondition notes: the Claude GitHub App must be installed on the target repo (installing it via `/web-setup` alone does not enable webhook delivery), and GitHub-event triggers are subject to an hourly event cap where events beyond the cap are dropped, not queued -- no backfill.
   - **Check:** `--dry-run` stops here -- the assembled `create_webhook_trigger` body is printed, nothing is called, and the instantiated record is not rewritten.

4. **Confirm and attach** -- Answer "Attach this GitHub-event trigger?"
   - **Action:** Step 5 calls `RemoteTrigger {action: "create_webhook_trigger", body: {source, events, filter, routine_trigger_id: record.routine_id}}` -- `routine_trigger_id` is the existing routine's own ID, so this attaches to it rather than minting a second routine.
   - **Check:** A failure shaped like an app-not-installed rejection surfaces a clear, distinct message naming the GitHub App rather than a generic/opaque error.

5. **Record the attachment** -- The instantiated record gains a `webhook_triggers` entry.
   - **Action:** Step 6 appends `{webhook_trigger_id, events, filter, created_at}` to the record's `webhook_triggers` array (`_shared/routine-template-schema.md`) -- existing entries are never overwritten, so a routine can accumulate more than one attached trigger over time.
   - **Check:** `status <skill>` and `fleet status` both now surface the attachment -- status appends "+ {N} GitHub-event trigger(s) attached" to the record's verdict, and the fleet table suffixes the routine's name with `(+{N} webhook)`.

## Outcome

The maintainer's existing routine keeps its schedule and additionally fires on matching GitHub events, with the filter grammar's fields and operators exposed generically rather than hardcoded to one shape. Both risk-relevant preconditions (GitHub App install state; the hourly cap's drop-not-queue behavior) are visible before the trigger is created, not discovered later as a silent gap. Live-call verification of `create_webhook_trigger`'s exact response shape and app-not-installed error text remains open (`docs/plans/2026-08-26-webhook-trigger-integration-ledger.md` item #1) -- this mode was built from the tool's documented request/response shape rather than a live call in this build's session, since `RemoteTrigger` was unavailable here.

## Origin
- Created during build of record #1302 ("Implement create_webhook_trigger integration for /claude-tweaks:routine", refs #211)
- Steps 1-5 built in this session
- Related specs: `.claude-tweaks/pipelines/2026-08-26T084000-record-1302/work/1302-spec.md`
