# Step 9 — Consolidated Summary Template and Batch Decision

Loaded by `/claude-tweaks:wrap-up` Step 9, which always runs. Holds the render template for the wrap-up summary, the conditional batch-decision block (presented only when Step 8.6's Review Console did not run), and the closure lines for record mode and the legacy spec-file alias.

References inside the blocks below to "this file" and to a `## Next Actions` section "below" resolve to `SKILL.md`, not to this file.

**Standalone multi-record batch.** When this wrap-up covers N already-completed, already-merged records from one batch (e.g. following up on a `/flow` multi-record run whose pipeline run directory was already archived — no live materialized header to key a single-record template on), render **one consolidated summary** covering all N records — a table with one row per record, mirroring `flow/multi-spec.md`'s Multi-Spec Summary shape — rather than forcing the single-record template below N separate times.

```
## Wrap-Up: Record #{n} — {title}
{Origin: {origin} — the materialized header's origin field: by:code-health / by:harness-health / by:journey-health / by:docs-health / by:capture / by:dispatch, or "human" when absent. Omit this line entirely for legacy spec-file-mode runs.}

### Reflection Insights
1. {insight} → {destination}
(or: No significant insights.)

### Implementation Status
- {section}: {status}
Overall: {X}% complete

### Cleanup Actions (planned in Step 5; executed in Step 10)
See `cleanup-procedures.md` for the canonical cleanup list. Render only rows whose Condition holds (e.g., no worktree, no design caches). Under `MULTISPEC_REVIEW_DEFER=1`, items marked deferred in `cleanup-procedures.md` are skipped here too.
- [ ] Leftover work: {recommendation}

### Configuration Updates (from Step 6)
| # | Type | Target | Change |
|---|------|--------|--------|
| 1 | {doc/claude.md/rule/adr/docs-health-issue} | {target} | {what to add/change} |
| 2 | ... | ... | ... |
(or: No configuration updates needed.)

### Manual Steps Required
| # | What | Where | Status |
|---|------|-------|--------|
| 1 | {description} | {source} | Filed as #{n} |
(or: No manual steps — nothing to do outside the codebase.)

> Complete these after merging. Each row is a real, trackable record (`ledger/resolve-gate.md`'s `Acknowledge` disposition) — not just a note in this transcript.

### Skill Updates
Resolved in Step 7 — {N} updates applied, {M} staged, {K} new-skill candidates ({proposed}/{declined}); {R} skills read, gap detection: {found/not found}. See `decisions.md` for the full `SCANNED` summary line.

### Actions Performed

| Action | Detail | Ref |
|--------|--------|-----|
| Operational | Closed record #{n} via merge (`Fixes #{n}`) — no local file to delete | `{hash}` |
| Operational | Deleted plans `docs/plans/{files}` | — |
| Operational | Deleted ledger | — |
| Operational | Deleted design wrapper caches (`*-audit.json`, `*-recommendations.json`, `*-declined.json`) | — |
| Operational | Removed worktree `{path}`, deleted branch `{branch}` | — |
| Ledger fix | {item} ({phase}) — {resolution} | `{hash}` |

Generate from: cleanup actions in Step 10, config/skill updates applied, ledger items resolved in Step 8.5, and, when present, the run dir's `events.jsonl` (hook-recorded commit breadcrumbs — hash reflects HEAD at hook time, not verified against commit success — and contract violations).

(Next Actions are rendered as a top-level section after Step 10 — see `## Next Actions` below. Do NOT render them here in the per-spec summary template.)
```

**Conditional batch decision** — only present when the Wrap-Up Review Console (Step 8.6) did NOT run:

- **Step 8.6 ran** (`auto` or `hybrid` mode with a pipeline run directory) → cleanup + config items were already approved at the Review Console. Skip this batch table and proceed to Step 10 execution. Rendering a second batch table here duplicates the Review Console and violates the "one decision per message" + bookend ("at most two stops in auto") promises.
- **Step 8.6 was skipped** — interactive mode, standalone wrap-up, or empty-console fast path → present the batch decision below. **Except** `MULTISPEC_REVIEW_DEFER=1` (Step 8.6's multi-spec defer branch): that case also skips the per-spec console, but do NOT present the batch decision here — `staged/` and `decisions.md` were deliberately left untouched for the parent `/flow`'s single consolidated end-of-run console to approve later across every spec in the run. Proceed straight to Step 10 the same as the "Step 8.6 ran" branch above; presenting this batch table here would reintroduce the duplicate, premature approval prompt the defer protocol exists to prevent.

Render the cleanup rows from `cleanup-procedures.md`'s canonical list (filtered by Condition), followed by configuration update rows from Step 6 and Step 7.9's staged CLAUDE.md findings:

```
| # | Type | Action | Details |
|---|------|--------|---------|
| 1 | cleanup | {row from cleanup-procedures.md canonical list} | {details} |
| ... | cleanup | ... | ... |
| N | config | {doc/claude.md/rule/adr/docs-health-issue} | {what to add/change} |
```

The table renders as markdown, as above. Immediately below it, call `AskUserQuestion` with:

- `question`: `"How do you want to apply these changes?"`, `header`: `"Apply changes"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all (Recommended)"`, `description`: `"Apply all cleanup and configuration items"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Tell me which #s to change"`

If the user chooses to override, let them pick which items to skip or change.

After presenting the summary, output an explicit closure line:

```
Work archived. Record #{n} closes via this merge (or the wrap-up commit, in current-branch mode); its plans and ledger have been deleted. The code and learnings remain.
```

This signals clearly that the lifecycle is complete — there's nothing left to do for this spec.
