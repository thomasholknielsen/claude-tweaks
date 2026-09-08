# Routine — WEBHOOK-TRIGGER

Loaded by `/claude-tweaks:routine`'s Workflow dispatch when the resolved mode is `webhook-trigger`.
Kept out of `create-and-update.md` because this mode needs none of CREATE's environment/schedule
ceremony — it only resolves an already-existing record, closer in shape to `PAUSE`/`RESUME`
(`create-and-update.md`), which also get no special folding-in treatment.

---

## WEBHOOK-TRIGGER `<skill>` `--events <e1,e2,...>` [`--filter <field>=<op>:<value>[,<field>=<op>:<value>...]`] [`--dry-run`]

Attaches a GitHub-event trigger to an already-existing routine via `RemoteTrigger {action: "create_webhook_trigger"}` — this does not create a new routine; it makes the routine named `<skill>` in this project also fire whenever a matching GitHub event occurs on this repo, in addition to its existing schedule. Requires the routine to already exist for this project (run `create <skill>` first if it doesn't) — there is no guided-creation fallback here, unlike CREATE, because there is no environment to resolve.

GitHub-event triggers are created programmatically via `RemoteTrigger`'s `create_webhook_trigger` action — this repo's own shipped docs make no "web UI only" claim about GitHub triggers (a repo-wide sweep for that phrase turned up nothing on this subject; the closest hits are about the unrelated cloud-environment Setup-script field). If an external Anthropic-hosted doc states otherwise, that claim is stale relative to this tool surface, but correcting an externally-hosted doc is outside this plugin's scope — this section is the authoritative in-repo statement that the capability exists and how to use it.

**Step 0 — Worktree check.** Same as `create-and-update.md`'s CREATE Step 0 — this mode writes the instantiated record (Step 5 below).

**Step 1 — Resolve the record.** Load the template and resolve `PREFIXED_NAME` exactly as CREATE Steps 1-2 (`create-and-update.md`) do. Then run `record-freshness.md` in this skill's directory (Steps F1-F2) and apply its Step F3 UPDATE disposition, exactly as PAUSE Step 1 does — same stale-checkout stop condition, same "read from the `upstream` authority copy when applicable" rule. Require an existing record for the current project. If none exists on either side, tell the user to run `create <skill>` first and stop.

**Step 2 — Resolve the event list.** If `--events` was passed, use it directly (comma-separated GitHub event names, e.g. `pull_request,issues`). Otherwise ask the user directly which GitHub events should fire this routine — do not guess a default event list, since a wrong default silently over-fires a routine against unrelated activity.

**Step 3 — Resolve the filter.** The filter grammar covers eight fields — `author`, `title`, `body`, `base_branch`, `head_branch`, `labels`, `is_draft`, `is_merged` — each combinable with an operator: `equals`, `contains`, `starts_with`, `is_one_of`, `is_not_one_of`, `matches_regex` (whole-value matching for `matches_regex`, e.g. `.*hotfix.*` not `hotfix`). Expose this generically — never hardcode one filter shape, since future filter fields or operators should not require another change to this step.

If `--filter` was passed, parse it as comma-separated `field=op:value` tokens (e.g. `--filter labels=is_one_of:bug,base_branch=equals:main`) — one condition per token, all conditions combined with AND. If `--filter` was not passed, ask the user directly which (if any) filter conditions to apply, looping one field/operator/value triple at a time until they indicate they're done — an empty filter (no conditions) is valid and means "every event of the listed types fires the routine," which the user must explicitly confirm rather than land on by omission.

**Step 4 — Preview and confirm.** Render the resolved event list, the filter conditions (or "no filter — every matching event fires this routine" if empty), and two precondition notes before any call is made:

- **GitHub App precondition:** "This requires the Claude GitHub App to be installed on this repository — installing it via `/web-setup` grants clone access but does not by itself enable event delivery for webhook triggers. If it isn't installed, this call will fail; install it first at the repository's GitHub App settings."
- **Hourly event cap precondition:** "GitHub-event triggers are subject to an hourly event cap (current as of the research-preview surface) — events beyond the cap for this hour are dropped, not queued. A burst of matching PR/issue activity beyond the cap will not all fire this routine; there is no backfill."

If `--dry-run` was passed: stop here — do not call `RemoteTrigger`, do not rewrite the instantiated record. Print the assembled body (below) instead.

Otherwise, call `AskUserQuestion` with `question`: `"Attach this GitHub-event trigger?"`, `header`: `"Confirm webhook trigger"`, `multiSelect`: `false`, and:
- Option 1 — `label`: `"Yes, attach (Recommended)"`, `description`: `"Proceed with the events and filter shown above"`
- Option 2 — `label`: `"Cancel"`, `description`: `"Do not attach anything"`

**Step 5 — Assemble the body and call.** Build the `create_webhook_trigger` body from Steps 2-3's resolved values and this routine's own identity:

```json
{
  "source": {"repository": "<resolved repo URL, same normalization as CREATE Step 2>"},
  "events": ["<event>", "..."],
  "filter": {"<field>": {"operator": "<op>", "value": "<value>"}, "...": "..."},
  "routine_trigger_id": "<record.routine_id — the routine this trigger attaches to, resolved in Step 1>"
}
```

Call `RemoteTrigger {action: "create_webhook_trigger", body: <assembled body>}`. If the call fails with an error shaped like an app-not-installed rejection (the response names the GitHub App or repository access rather than a validation error in the body), surface a clear, distinct message: `"{skill}: the Claude GitHub App isn't installed on this repository — install it first, then retry."` — do not let this surface as a generic/opaque failure. Any other failure: report the error to the user and stop; do not proceed to Step 6.

**Step 6 — Write the instantiated record.** Append one entry to the record's `webhook_triggers` array (`skills/_shared/routine-template-schema.md`'s Instantiated record schema — create the array if the record doesn't have one yet, never overwrite existing entries):

```yaml
webhook_triggers:
  - webhook_trigger_id: "<the trigger ID from Step 5's create_webhook_trigger response>"
    events: [<Step 2's resolved event list>]
    filter: <Step 3's resolved filter, as sent on the wire>
    created_at: "<current UTC timestamp, ISO 8601>"
```

Report the result to the user, including a note that this attachment was assembled from `create_webhook_trigger`'s documented request shape — if this is the first time this project's build session actually reached a live `RemoteTrigger` call for this action, note that in the handoff so a later reviewer knows this path has now been live-verified (rather than only documented).
