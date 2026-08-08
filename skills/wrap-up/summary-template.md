# Step 9 — Consolidated Summary Template and Batch Decision

Loaded by `/claude-tweaks:wrap-up` Step 9, which always runs. Holds the render template for the wrap-up summary, its conversation-mode variant, the conditional batch-decision block (presented only when Step 8.6's Review Console did not run), and the closure lines for record mode and the legacy spec-file alias.

References inside the blocks below to "this file" and to a `## Next Actions` section "below" resolve to `SKILL.md`, not to this file.

**Standalone multi-record batch.** When this wrap-up covers N already-completed, already-merged records from one batch (e.g. following up on a `/flow` multi-record run whose pipeline run directory was already archived — no live materialized header to key a single-record template on), render **one consolidated summary** covering all N records — a table with one row per record, mirroring `flow/multi-spec.md`'s Multi-Spec Summary shape — rather than forcing the single-record template below N separate times.

```
## Wrap-Up: {Record #{n} — {title}   |   {topic}}
{Origin: {origin} — record mode only; the materialized header's origin field:
by:code-health / by:harness-health / by:journey-health / by:docs-health /
by:capture / by:dispatch, or "human" when absent. Omit entirely in
conversation mode and for legacy spec-file-mode runs.}

### Verdict

{One line: what shipped, where it is now, and what blocks it. State the
push status from the State block's own measurement — never assert "it
landed" from memory.}

### State

Render VERBATIM from the helper — do not compose these facts from memory:

    node "${CLAUDE_PLUGIN_ROOT}/bin/wrap-up-state.js" --since {base}

If the helper exits non-zero, `{base}` was not a resolvable commit-ish —
re-derive it by the rule below and retry once. If it still fails, render the
State block's fields as `unknown` and say so; never omit the block.

Resolve `{base}` — a commit-ish, never a date — by the first rule that applies.
`{integration-branch}` is the branch this project integrates work into, resolved
via `skills/_shared/integration-branch.md`'s canonical ladder — not always the
GitHub default branch that fragment's git-inference rank would otherwise settle
on:

1. `git merge-base HEAD {integration-branch}` when HEAD is not on the
   integration branch. The branch's whole life is the work, so this is immune
   to how often the session pushed.
2. `git merge-base HEAD @{u}` when HEAD IS on the integration branch and it has
   an upstream — the base is the last commit the remote has, so the window is
   exactly what has not been pushed.
3. `HEAD` otherwise. The window is empty and renders as `0 commits`, which is a
   visible, checkable answer rather than a silent guess.

The helper echoes the base back on the `Scope` line, so a wrong one shows up in
the output instead of silently narrowing the window.

Then append, in record mode only:

Record    #{n} — {closes via merge | closed | open}
Ledger    {n} items, {n} open   |   none

### Actions Performed

| Action | Detail | Ref |
|--------|--------|-----|
| History | {op} {target} — {one line} | `{hash}` |
| Implemented | {what was built} | `{hash}` |
| Operational | Closed record #{n} via merge (`Fixes #{n}`) | `{hash}` |
| Operational | Deleted plans `docs/plans/{files}` | — |
| Operational | Removed worktree `{path}`, deleted branch `{branch}` | — |
| Ledger fix | {item} ({phase}) — {resolution} | `{hash}` |

Generate from: the helper's History ops (every row it reports gets a `History`
row — that is the whole point of reading them), cleanup actions in Step 10,
config/skill updates applied, ledger items resolved in Step 8.5, and the run
dir's `events.jsonl` when present (hook-recorded commit breadcrumbs — the hash
reflects HEAD at hook time and is NOT verified against commit success — and
contract violations).

Omit the table entirely when no autonomous action was performed. Never fold a
history operation into `Operational` — that type means cleanup, and burying a
rebase there is the failure this row type exists to prevent.

### Decisions

**Needs your call ({n})** — items whose answer changes what happens:

| # | Destination | What |
|---|-------------|------|
| 1 | {destination} | {one line} |

Destinations are NAMED, never coded. `_shared/learning-routing.md`'s D1-D5 are
internal classifier vocabulary and must not reach the reader:

| Internal | Rendered |
|---|---|
| D1 | `CLAUDE.md Don'ts`, or the specific `.claude/rules/` file |
| D2 | the actual path — `docs/x.md`, `skills/y/SKILL.md` |
| D3 | `Backlog record` |
| D4 | `Memory` |
| D5 | `Upstream issue` |

Generate from: Step 4's routed leftover sections, Step 6 and Step 7.9
configuration proposals not yet approved, Steps 7 / 7.7 / 7.8's staged updates,
and any staged `Q#` / `M#` / `U#` proposal. In record mode a Partial
implementation status from Step 2 lands here too — as the specific sections that
remain, never as a percentage.

**Will do ({n})** — {one line each}. When Step 8.6's Review Console ran, these
were approved there; state them as settled. When it did NOT run (interactive
mode, standalone wrap-up, the empty-console fast path), the Conditional batch
decision below is where they are actually decided — render them here as a
preview of that table, never as already-settled.

Render cleanup rows from `cleanup-procedures.md`'s canonical list, filtered by
Condition. Under `MULTISPEC_REVIEW_DEFER=1`, items marked deferred there are
skipped here too.

### Outstanding ({n})
| # | What | Kind | Disposition |
|---|------|------|-------------|
| 1 | {subject — evidence} | {kind} | {Fixed — `{hash}` \| Filed as #{n} \| Accepted — {reason}} |
(or omit the section entirely — every probe ran and found nothing.)

> Complete these after merging. Each row is a real, trackable record
> (`ledger/resolve-gate.md`'s `Acknowledge` disposition) — not just a note in
> this transcript.

Generate from: the residue sweep's ledger items (`residue-sweep.md`, run ahead
of Step 8.5), Step 4's routed leftover sections, and any ledger item resolved
to `Acknowledge`.

No row may render without a disposition. A blank Disposition cell is the
untracked transcript note this section exists to eliminate. A probe that could
not run renders as `unknown` with its reason — never folded into an omitted
section, which would read as "nothing outstanding".

### Routed ({n})
| Learning | Destination |
|---|---|
| {one line} | {CLAUDE.md [IL-nn] \| docs/x.md \| record #{n} \| Memory \| Upstream issue} |

Generate from: every learning routed by Steps 6-7.11, named by destination.

Name the destination; never restate what landed there. This is the existing
rule under Evidence ("Do NOT restate an insight that already became a Decisions
row") given a section of its own. A learning with no destination is visibly
missing from this table, which is the point.

### Evidence

Reflection — {insights, near-misses, tradeoffs accepted}. Do NOT restate an
insight that already became a Decisions row; name the row instead.

Scans — Step 7 {result} · 7.7 {result} · 7.8 {result} · 7.9 {result} ·
7.10 {result}. Full `SCANNED` lines in `decisions.md`.

Skill updates — {N} applied, {M} staged, {K} new-skill candidates
({proposed}/{declined}); {R} skills read, gap detection: {found/not found}.

(Next Actions are rendered as a top-level section after Step 10 — see
`## Next Actions` in SKILL.md. Do NOT render them here.)
```

**Conversation mode.** When no record is identified for this run (`SKILL.md`
Step 1's Conversation-based row — no `#`-prefixed argument, git commit/branch
reference, or, as fallback, materialized header resolved one), render the SAME
section shape with the record-keyed pieces dropped: the `## Wrap-Up:` heading
takes the work's topic instead of `Record #{n} — {title}`; the `Origin:` line,
the `Record` and `Ledger` State lines, and any `Operational` row about closing
a record or deleting plans are all omitted. Verdict, State, Actions Performed,
Decisions, Outstanding, Routed, and Evidence render identically to record
mode — the closure line does not.

This variant is not optional. Its absence is what caused a conversation-based
run to compose its report from the steps it had just executed, surfacing
internal step numbers and route codes and reporting a rebase inside a table
cell's rationale column.

Close conversation mode with this line instead of the record-mode archival
line below. State what this run's Step 5 cleanup-gate check actually found —
never assume the negative default: a conversation-based run CAN carry a
ledger, a worktree, and a run directory (`SKILL.md`'s cleanup-gate note), and
a design-mode build's plan and design doc are deliberately kept in place
rather than deleted (`[IL-36]`), so "deleted" is not the only disposition a
found plan or ledger can have:

```
Work wrapped up. This run closed no record. {Measured plans/ledger clause —
"It had no plans or ledger to delete" when Step 5 found neither; otherwise
name what this run had and its actual disposition, e.g. "Its plan under
docs/superpowers/plans/{file} and SDD ledger were resolved during cleanup"
when deleted, or "Its plan under docs/superpowers/plans/{file} remains in
place — kept, not deleted, for a design-mode build" when kept}. What it
leaves behind is the code and the learnings above.
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

**Hard gate.** Check the response you are about to send: does it already contain the numbered
cleanup+configuration table as literal rendered markdown, with a row for every item? If not, render
it now, in this response, before the tool call.

If the user chooses to override, let them pick which items to skip or change.

**Queue writes, Memory updates, and Upstream feedback — per-item, not part of the batch decision above.** "Not part of the batch decision" means not folded into the cleanup+configuration Apply-all/Override choice — it does **not** disclaim the section's own gating: this block sits inside the same **Conditional batch decision** section as that batch, so it renders under the identical condition — only when Step 8.6's Review Console did not run. When the Review Console did run, it already resolved every Queue-write / Memory / Upstream row per-item at approval time (`review-console.md`'s `On approval` steps), and this whole block is skipped here — never re-presented, never re-applied. After the cleanup+configuration batch decision resolves, render whichever of the three tables below has at least one row; omit a table entirely when it has no rows, mirroring `review-console.md`'s shape:

```
#### Queue writes — REQUIRES PER-ITEM APPROVAL

| Q# | Destination | What | Source |
|---|---|---|---|
| Q1 | record ({backlog} or {parked — trigger: {condition}}) | {title} — {one line} | {staged file path} |

#### Memory updates — REQUIRES PER-ITEM APPROVAL

| M# | Name | Type | Fact | Index line |
|---|---|---|---|---|
| M1 | {name} | {type} | {the fact} | {the MEMORY.md line} |

#### Upstream feedback — REQUIRES PER-ITEM APPROVAL

| U# | Kind | Component | Summary |
|---|---|---|---|
| U1 | {defect\|gap} | {component} | {one line} |
```

**Where the `Q#` rows come from.** Every file in `{run-dir}/staged/` carrying a `Title:`/`Type:`/`Labels:` header is a queue write — `ledger-record-*.md` (`ledger/resolve-gate.md` Phase 3's `Defer` / `Keep` / `Acknowledge` dispositions, including the ones `nothing-left-behind.md`'s Ops acknowledgment stages), `leftover-*.md`, and any other producer's staged proposal. Identify them by that header, not by filename, so a new producer is picked up without editing this file. This section exists for **interactive mode with a pipeline run directory** — the one case where a proposal is staged but no Review Console will ever read it. In standalone wrap-up no `staged/` directory exists and every producer already creates its record directly instead of staging (`ledger/resolve-gate.md` Phase 3's no-run-directory branch, `leftover-routing.md`'s Interactive mode), so this table has no rows and the omit-when-empty rule above drops it.

Each row gets its own `AskUserQuestion` call — never batched together, never folded into the cleanup+configuration batch choice above, and never treated as satisfied by a *different* table's approval (the Reflection Insights batch, the Skill Updates batch, or any other) even when that answer was "Apply all." A batch table's "Apply all" approves what its own rows list — routing an insight to Memory (D4) is one such row; the write is a separate decision this section's own `M#` prompt makes. Prompt per item exactly as `review-console.md`'s per-item drill does: `question` is the item's own line, `header` is `"Queue write {Q#}"`, `"Memory update {M#}"`, or `"Upstream feedback {U#}"`, and the three options are `"Apply"`, `"Skip"`, `"Edit"` — none carries `(Recommended)`.

On Apply (or Edit, after modification), the action is performed **here** — Step 10 only verifies it landed, it never performs it (`execution-and-verification.md`). Read the item's content from its staged file when a pipeline run directory exists (`staged/ledger-record-{slug}.md` and the other `Title:`-headed files above for `Q#`; `staged/wrap-up-memory-{N}.md` / `staged/wrap-up-upstream-{N}.md` for `M#` / `U#`), or from the inline proposal held from Step 7.10/7.11 when this is standalone wrap-up (no `staged/` file — see those steps' standalone branch). Then execute exactly as `review-console.md`'s `On approval` steps 7-9 describe: for a `Q#` item, create the record via `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`), reading `Title:`/`Type:`/`Labels:` and the body back out of the staged file; for an `M#` item, write the memory file and append its `MEMORY.md` index line per `_shared/learning-routing.md`'s "Memory write procedure (D4)"; for a `U#` item, invoke `/claude-tweaks:feedback` with the already-scrubbed body. Skip drops the proposal — log the decline to `decisions.md` with the user's stated reason (or "declined, no reason given") when a pipeline run directory exists; state the decline inline in this summary otherwise.

After presenting the summary, output an explicit closure line. State what this
run's Step 5 cleanup-gate check actually found — never assume the default
"deleted": a design-mode build's plan and design doc are deliberately kept in
place rather than deleted (`[IL-36]`), so "deleted" is not the only
disposition a found plan or ledger can have:

```
Work archived. Record #{n} closes via this merge (or the wrap-up commit, in current-branch mode); {Measured plans/ledger clause — "it had no plans or ledger to delete" when Step 5 found neither; otherwise name what this run had and its actual disposition, e.g. "its plan under docs/superpowers/plans/{file} and SDD ledger were resolved during cleanup" when deleted, or "its plan under docs/superpowers/plans/{file} remains in place — kept, not deleted, for a design-mode build" when kept}. The code and learnings remain.
```

This signals clearly that the lifecycle is complete — there's nothing left to do for this spec.
