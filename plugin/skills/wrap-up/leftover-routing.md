# Phase 3 — Analyze Leftover Work

Spec-based only. Same fix-exhaust-first discipline as Phase 3's ledger gate: attempt to complete unfinished spec sections in this pipeline before proposing routing. Only sections that genuinely cannot be completed in the current work context get presented for routing.

## Fix-exhaust first

Run `_shared/deferral-gate.md`'s fix-now criteria on every unfinished section, first — a section
that fails fix-now with no valid `Defer-reason:` from that file's vocabulary is not a leftover; it
becomes an `open` ledger item for Phase 2's drill instead of a routed proposal. A genuine
leftover's reason derives from *why* it cannot finish now, using the same mapping as review Step
3's (`review/step3-routing.md`) — most leftovers are `genuinely-larger` or `blocked-dependency`.

Finish qualifying sections silently, commit, then present only the residue.

## Staging (every mode — policy lookup)

Phase 1 guarantees a run directory (see `_shared/pipeline-run-dir.md` for the resolution order and bash snippet); read `leftover-default` from its `config.yml` when one is present, and fall back to the Manifesto default (`defer`) on a standalone run, which has none. Each residue section becomes a staged **work-record proposal** — never created directly. `_shared/auto-mode-card.md` lists work-record creation among what `auto` does NOT silence: every record filed on the user's tracker needs explicit approval — at `supervised`/`trusted`, folded into the Review Console's batch "Approve all"; at `unattended`, auto-resolved with zero `AskUserQuestion` calls under `consoleAutoResolve` — so the record queue stays the user's, not the model's.

1. **Compose the body** via `specShapedBody` (`bin/lib/issues/record.js`): `header` = `'Trigger: {condition}'` when a concrete trigger exists (a date, a watched path, another spec landing — the `parked` case), else `''`; `currentState` = what exists now (the section's finished part, files touched); `deliverables` = what is left, as checkbox items; `acceptanceCriteria` = how a builder verifies it is done (a test name, a grep, an observable behavior); `provenance: { origin: 'wrap-up leftover from #{n}' — `{n}` = `${CLOSED_NUM}`, Phase 1's own record determination (the `#`-prefixed argument, a branch/commit reference, or a materialized header's `record:` field when one exists — see "Identify the work context" in `SKILL.md`), so a standalone `/wrap-up #N` run still emits this line even with no materialized header, deferReason }` — the reason from the fix-exhaust gate above, passed HERE, never via `recordPayload`'s own `deferReason` (which would insert the line above the `Trigger:` header); `filedBy: 'wrap-up leftover routing'`; `footer: '_Filed by \`wrap-up leftover routing\` via specShapedBody._'`. When Acceptance Criteria cannot be honestly written — the section's own text names an open choice or missing evidence ("needs a design decision", "Decide:", insufficient evidence to state done) — use `openQuestion: '<the open choice, or "insufficient evidence: {what is missing}">'` instead of `acceptanceCriteria`; the text must say which of the two cases it is, because the human resolving it needs to know. `Defer-reason:` is present in every landing state, including `needs:definition` — it names why the item was not fixed, independent of whether it is decidable.

2. **Build the payload** via `recordPayload` (`bin/lib/issues/record.js`) — no `origin` param (a wrap-up leftover carries no `by:*` label; `_shared/work-record.md`'s origin axis records this case as the body's `Origin:` line). Landing states, per `_shared/work-record.md`'s born-shaped `/wrap-up` row: **born-ready** — `risk`/`size` judged per that file's Scoring axis from the section's own content, `ready: true`; **parked** (a real `Trigger:` in the header) — scored, `parked: true`, `ready: false` (`recordPayload` rejects both together); **needs-you** (the `openQuestion` body) — `needs:definition` in `Labels:`, no `ready`, no scoring. Also pass the same value as `recordPayload`'s `deferReason` — the composed body already carries the line, so this inserts nothing; it buys the mismatch throw (`record.js`'s match-or-throw), catching a staged header that diverges from the body:

   ```bash
   node -e "const {recordPayload,specShapedBody}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/record.js');
     const args=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));
     const body=specShapedBody(args.compose);
     const p=recordPayload({ ...args.payload, body, deferReason: args.compose.provenance.deferReason });
     require('fs').writeFileSync('/tmp/wrap-up-leftover-payload.json', JSON.stringify(p))" /tmp/wrap-up-leftover-args.json
   ```

   `/tmp/wrap-up-leftover-args.json` carries `{ compose: {header, currentState, deliverables, acceptanceCriteria|openQuestion, filedBy, provenance, footer}, payload: {title, type, risk?, size?, ready?, parked?} }` — `type`: `task` by default, `bug` for a defect, `feature` for a distinct new capability. The `needs:definition` label is appended at the staging step below (it is a label with no `recordPayload` parameter).

3. **Stage it** — render the payload to `{run-dir}/staged/leftover-{slug}.md` (`{slug}` — kebab-case derived from the section title), now through a CLI rather than a direct `writeFileSync` against the run dir — the same anchoring guarantee `bin/log-decision.js` already gives `decisions.md` writes, now extended to this staged file:

   ```bash
   node -e "const p=require('/tmp/wrap-up-leftover-payload.json');
     require('fs').writeFileSync(process.argv[1],
       'Title: ' + p.title + '\nType: ' + p.type + '\nLabels: ' + ((p.labels.concat(process.argv[3]==='true'?['needs:definition']:[]).join(', ')) || 'none') + '\nDefer-reason: ' + process.argv[2] + '\n\n' + p.body)" \
     "/tmp/wrap-up-leftover-${CLAUDE_CODE_SESSION_ID}-${SLUG}.md" "$DEFER_REASON" "$NEEDS_DEFINITION"
   ```

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/stage-item.js" --run "$RUN_DIR" --id "leftover-${SLUG}" --file "/tmp/wrap-up-leftover-${CLAUDE_CODE_SESSION_ID}-${SLUG}.md"
   ```

   `$DEFER_REASON` is the section's vocabulary value from the fix-exhaust gate above (`_shared/deferral-gate.md`'s "Where the reason lives" — a keyed header line, located by key, never by position). `$NEEDS_DEFINITION` is `'true'` on the `openQuestion` landing state, else `'false'`. Bootstrap any `risk:*`/`size:*`/`ready`/`needs:definition` labels per `_shared/label-bootstrap.md` at creation time (the console does this today for `parked`).

4. **Log entry** to `decisions.md`:
   ```
   STAGED 15:02:18 — Leftover routing: section "{name}" cannot finish now ({blocker}). Recommended: {leftover-default} → {parked|backlog} — landing: {born-ready|needs:definition|parked} (defer-reason: {value}). Stage path: staged/leftover-{slug}.md.
   ```
5. Do NOT create the record autonomously. The Wrap-Up Review Console presents each staged leftover in its Queue writes section for approval — folded into the batch "Approve all" at `supervised`/`trusted`, auto-resolved with zero `AskUserQuestion` calls under `consoleAutoResolve` at `unattended`, per `_shared/auto-mode-card.md`'s tiered work-record-creation row — unless `bookkeepingPermissions(ceiling).queueWriteAutoFile === true` (`trusted`+), in which case the console's auto-file step (see `review-console.md`) creates it directly before rendering, per `_shared/autonomy-ceiling.md`. Either way, the disposition (`backlog` vs. `parked`) chosen by `leftover-default` above is unchanged; this only affects whether creating the record needs a click. On approval (or auto-file), the record is created via: `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading the `Title:`/`Type:`/`Labels:` header and the body back out of the staged file. See `review-console.md`'s Queue writes section in this skill's directory.

## Interactive disposition drill (per-item user input, before staging)

**This is not a second copy of the console's approval.** It decides each leftover section's *disposition* — finish it now, route it, or drop it — which happens in Phase 3, before anything is staged. Whether an approved routing actually becomes a record is the Review Console's own `Q#` per-item decision in Phase 4, and this drill never substitutes for it.

Run this drill when a human is present (interactive or standalone wrap-up). In `auto` and `hybrid` runs the `leftover-default` policy lookup above supplies the disposition instead, and nothing is asked here.

For each unfinished section that genuinely cannot be finished, first present a summary table (dense multi-row data, per docs/skill-authoring.md's Multi-item decisions convention):

```
| # | Section | Status | Why not finish now |
|---|---------|--------|--------------------|
| 1 | {section} | partial | {specific blocker} |
```

Then, for each section, run a two-step `AskUserQuestion` drill (the five routing choices exceed the tool's 4-option-per-question cap — same shape as `_shared/ledger-format.md`'s Resolve Gate per-item drill).

**Step 1 (always) — call `AskUserQuestion` with `question`: `"How do you want to handle section #{N}: {section name}?"`, `header`: `"Section #{N}"`, `multiSelect`: `false`, and:**

- Option 1 — `label`: `"Finish now"`, `description`: `"Agent attempts completion in this pipeline (returns to fix-exhaust)"`
- Option 2 — `label`: `"Route to a record"`, `description`: `"Merge into an existing record, or create a new one (parked or backlog)"`
- Option 3 — `label`: `"Drop"`, `description`: `"No longer relevant"`

None of these three options carries `(Recommended)` — fix-exhaust already attempted completion before this section reached the drill, so there is no safe default among the remaining choices.

**Step 2 (only if "Route to a record" was chosen) — call `AskUserQuestion` with `question`: `"Where should section #{N} go?"`, `header`: `"Route section #{N}"`, `multiSelect`: `false`, and:**

- Option 1 — `label`: `"Merge"`, `description`: `"Work fits naturally into another record's scope — edit its body to absorb this section rather than filing a new one"`
- Option 2 — `label`: `"New record, parked"`, `description`: `"Work needs its own context and has a clear trigger (a date, a watched path, another spec landing)"`
- Option 3 — `label`: `"New record, backlog"`, `description`: `"Genuinely new idea discovered during implementation, no specific trigger yet"`

For "New record, parked" or "New record, backlog": compose the body and build the payload exactly as the staging steps above (`Origin:` line, plus `Trigger:` line and `parked: true` for the parked case), then **stage it** to `{run-dir}/staged/leftover-{slug}.md` the same way — do not create the record here. The Review Console's Queue writes section owns the creation decision in every mode, and `_shared/label-bootstrap.md`'s `parked` bootstrap runs there, at creation time, not here. "New record, backlog" omits the `Trigger:` line and `parked` — the record files with no stage label (open, unparked, unready): the unified taxonomy's equivalent of the pre-migration "inbox" destination.

**Wait for the user's reply at every step.** Do not bulk-route. This drill records the disposition; `_shared/auto-mode-card.md`'s work-record-creation row is satisfied later, by the console's own per-item `Q#` approval.
