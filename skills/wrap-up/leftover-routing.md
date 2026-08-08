# Step 4 — Analyze Leftover Work

Spec-based only. Same fix-exhaust-first discipline as the resolve gate (Step 8.5): attempt to complete unfinished spec sections in this pipeline before proposing routing. Only sections that genuinely cannot be completed in the current work context get presented for routing.

## Fix-exhaust first

A section qualifies for "finish now" if **all** of these hold:
- Localized changes (typically ≤5 files)
- No dependency on functionality not yet built in this pipeline
- No required user product/design decisions
- No required external state
- Does not materially expand pipeline scope (does not trigger long rebuilds, does not break >10 unrelated tests)

Finish qualifying sections silently, commit, then present only the residue.

## Auto mode (policy lookup)

When the pipeline run directory exists (see `_shared/pipeline-run-dir.md` for the resolution order and bash snippet), read `leftover-default` from `config.yml`. Per the Manifesto default (`defer`), each residue section becomes a staged **work-record proposal** — never created directly. `_shared/auto-mode-contract.md` lists work-record creation among what `auto` does NOT silence: every record filed on the user's tracker needs explicit per-item approval, so the record queue stays the user's, not the model's.

1. **Compose the body.** Start with a provenance line — `Origin: wrap-up leftover from #{n}` when this run's materialized header exists (`{n}` = its `record:` field) — then a blank line, then the section's own unfinished-work description (what's left, why it can't finish now). When the recommended destination is `parked` (a concrete trigger exists — a date, a watched path, another spec landing), append a `Trigger: {condition}` line. When no specific trigger exists (a captured idea worth keeping but nothing concrete to wake it), the body ends after the description and the record stays plain backlog — the unified taxonomy's equivalent of the pre-migration "inbox" destination, minus a separate stage label (`_shared/work-record.md`'s Stage axis has exactly three values: backlog/parked/ready; there is no fourth "inbox" state).

2. **Build the payload** via `recordPayload` (`bin/lib/issues/record.js`) — no `origin` param (a wrap-up leftover carries no `by:*` label: origin here is the filing skill, not one of the four health-skill producers, and `_shared/work-record.md`'s origin axis records that case as the body's `Origin:` line instead, e.g. `Origin: wrap-up leftover from #42`); no `risk`/`effort`/`ready` (scoring and promotion to `ready` are `/specify`'s job, not wrap-up's — a leftover record starts exactly where a captured idea starts):

   ```bash
   node -e "const {recordPayload}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/record.js');
     const p=recordPayload({title:process.argv[1], body:process.argv[2], type:process.argv[3], parked:process.argv[4]==='true'});
     require('fs').writeFileSync('/tmp/wrap-up-leftover-payload.json', JSON.stringify(p))" \
     "$SECTION_TITLE" "$SECTION_BODY" "$SECTION_TYPE" "$HAS_TRIGGER"
   ```

   `$SECTION_BODY` is step 1's composed text. `$SECTION_TYPE` — `task` by default (most leftover work is unfinished implementation or maintenance); `bug` when the section describes a defect; `feature` when it's a distinct new capability. `$HAS_TRIGGER` — `'true'` when step 1 appended a `Trigger:` line, else `'false'`.

3. **Stage it** — render the payload to `{run-dir}/staged/leftover-{slug}.md` (`{slug}` — kebab-case derived from the section title), never created directly:

   ```bash
   node -e "const p=require('/tmp/wrap-up-leftover-payload.json');
     require('fs').writeFileSync(process.argv[1],
       'Title: ' + p.title + '\nType: ' + p.type + '\nLabels: ' + (p.labels.join(', ') || 'none') + '\n\n' + p.body)" \
     "${RUN_DIR}/staged/leftover-${SLUG}.md"
   ```

4. **Log entry** to `decisions.md`:
   ```
   STAGED 15:02:18 — Step 4: section "{name}" cannot finish now ({blocker}). Recommended: {leftover-default} → {parked|backlog}. Stage path: staged/leftover-{slug}.md.
   ```
5. Do NOT create the record autonomously. The Wrap-Up Review Console (Step 8.6) presents each staged leftover in its Queue writes section for mandatory per-item approval — never bulk, per `_shared/auto-mode-contract.md`'s work-record-creation row — unless `unattended-tier: on`, in which case the console's auto-file step (see `review-console.md`) creates it directly before rendering, per `_shared/unattended-tier.md`. Either way, the disposition (`backlog` vs. `parked`) chosen by `leftover-default` above is unchanged; this only affects whether creating the record needs a click. On approval (or auto-file), the record is created via: `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading the `Title:`/`Type:`/`Labels:` header and the body back out of the staged file. See `review-console.md`'s Queue writes section in this skill's directory.

## Interactive mode (per-item user input)

For each unfinished section that genuinely cannot be finished, first present a summary table (dense multi-row data, per docs/skill-authoring.md's Multi-item decisions convention):

```
| # | Section | Status | Why not finish now |
|---|---------|--------|--------------------|
| 1 | {section} | partial | {specific blocker} |
```

Then, for each section, run a two-step `AskUserQuestion` drill (the five routing choices exceed the tool's 4-option-per-question cap — same shape as `ledger/resolve-gate.md`'s per-item drill).

**Step 1 (always) — call `AskUserQuestion` with `question`: `"How do you want to handle section #{N}: {section name}?"`, `header`: `"Section #{N}"`, `multiSelect`: `false`, and:**

- Option 1 — `label`: `"Finish now"`, `description`: `"Agent attempts completion in this pipeline (returns to fix-exhaust)"`
- Option 2 — `label`: `"Route to a record"`, `description`: `"Merge into an existing record, or create a new one (parked or backlog)"`
- Option 3 — `label`: `"Drop"`, `description`: `"No longer relevant"`

None of these three options carries `(Recommended)` — fix-exhaust already attempted completion before this section reached the drill, so there is no safe default among the remaining choices.

**Step 2 (only if "Route to a record" was chosen) — call `AskUserQuestion` with `question`: `"Where should section #{N} go?"`, `header`: `"Route section #{N}"`, `multiSelect`: `false`, and:**

- Option 1 — `label`: `"Merge"`, `description`: `"Work fits naturally into another record's scope — edit its body to absorb this section rather than filing a new one"`
- Option 2 — `label`: `"New record, parked"`, `description`: `"Work needs its own context and has a clear trigger (a date, a watched path, another spec landing)"`
- Option 3 — `label`: `"New record, backlog"`, `description`: `"Genuinely new idea discovered during implementation, no specific trigger yet"`

For "New record, parked" or "New record, backlog": compose the body and build the payload exactly as the Auto mode steps above (`Origin:` line, plus `Trigger:` line and `parked: true` for the parked case), then create it directly — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`). Bootstrap the `parked` label first if missing (per `_shared/label-bootstrap.md`, `LABELS_JSON = [['parked', 'Deferred backlog entry, waiting on a trigger condition']]`). "New record, backlog" omits the `Trigger:` line and `parked` — the record files with no stage label (open, unparked, unready): the unified taxonomy's equivalent of the pre-migration "inbox" destination.

**Wait for the user's reply at every step.** Do not bulk-route. Creating a record here — unlike auto mode, where it only stages a proposal — is the user's explicit per-item confirmation itself, which **is** the required approval (`_shared/auto-mode-contract.md`'s work-record-creation row).
