---
name: claude-tweaks:ledger
description: Use when you need to create, update, query, or resolve open items in a pipeline ledger file. Called by /claude-tweaks:build, /claude-tweaks:test, /claude-tweaks:review, /claude-tweaks:wrap-up, and /claude-tweaks:flow — or standalone for ledger inspection.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Ledger — Open Items Tracking

Manage the open items ledger that tracks findings, operational tasks, and observations across pipeline phases. The ledger is a markdown file that carries state between skills and survives context window compression.

```
/claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
       ↓                      ↓                       ↓                       ↓
   [ creates / appends ]  [ appends ]           [ appends ]           [ resolves all ]
                                                                             ↓
                                                                  [ /claude-tweaks:ledger ] ← manages the file
```

## When to Use

- Called by other skills to create, append, update, query, or resolve ledger items
- Standalone: inspect the current ledger (`/claude-tweaks:ledger`)
- Standalone: trigger the nothing-left-behind gate (`/claude-tweaks:ledger resolve`)
- When `/claude-tweaks:help` flags unresolved ledger items

## Input

`$ARGUMENTS` controls the operation:

| Argument | Behavior |
|----------|----------|
| *(none)* | Show current ledger status — counts by phase and status |
| `resolve` | Run the nothing-left-behind gate on the active ledger |
| `{feature-name}` | Show ledger for a specific feature |

## Ledger File

### Location

```
docs/plans/YYYY-MM-DD-{feature}-ledger.md
```

The `{feature}` name matches the execution plan or spec topic. One ledger per pipeline run.

### Format

```markdown
# Open Items — {spec title or design topic}

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build/ops | Set `API_KEY` in environment — referenced in `src/api.ts` | open | — |
| 2 | review | Missing validation on `updateUser` input | fixed | Added zod schema — `abc1234` |
| 3 | test | Login story fails — selector `.login-btn` not found | open | — |
```

### Item Numbering

Items are numbered sequentially starting at 1. New items always get the next available number. Numbers are never reused — if item 3 is resolved, the next item is still 4.

## Status Lifecycle

```
open → fixed         (item was addressed in code)
open → deferred      (routed to DEFERRED.md with origin, files, and trigger)
open → accepted      (intentional decision, with stated reason)
open → acknowledged  (for ops items — user is aware, requires action outside codebase)
observation          (informational, non-blocking — e.g., QA caveats)
```

**Terminal statuses:** `fixed`, `deferred`, `accepted`, `acknowledged`, `observation` — these items are resolved and will not block the pipeline.

**Non-terminal status:** `open` — these items block pipeline completion.

## Phase Taxonomy

Each item is tagged with a phase indicating where it was discovered. Phases use a flat `{skill}` or `{skill}/{qualifier}` format — the qualifier adds specificity when a skill produces multiple finding types, but is optional.

| Phase | Source | Typical Items |
|-------|--------|---------------|
| `ops` | `/claude-tweaks:build` Step 2.5 | Manual steps from spec (seeded before build) |
| `build` | `/claude-tweaks:build` Steps 4-5.5 | Architecture deviations, blocked work, shared constants |
| `build/ops` | `/claude-tweaks:build` Step 5.5 | Operational requirements (migrations, env vars, infra) |
| `build/skill` | `/claude-tweaks:build` Step 4.5 | Skill update candidates from build observations |
| `test` | `/claude-tweaks:test` QA mode | QA story failures and observations |
| `review` | `/claude-tweaks:review` Step 3 | Code review findings (all categories) |
| `review/skill` | `/claude-tweaks:review` Steps 3a, 4 | Skill update candidates from review |
| `review/hindsight` | `/claude-tweaks:reflect` (hindsight mode, via /review Step 4) | Implementation hindsight findings |
| `wrap-up` | `/claude-tweaks:reflect` (full mode, via /wrap-up Step 3) | Reflection insights |
| `reflect` | `/claude-tweaks:reflect` (standalone) | Standalone reflection findings |

> **Simplified from v3.16:** Previous phases like `review/convention`, `review/ux`, `review/coverage` are collapsed into `review`. Use the item description and category column to distinguish finding types — the phase just needs to identify the source skill. `build/*` is now just `build`. `test/qa` is now just `test`. `wrap-up/*` is now just `wrap-up`.

## Operations

### Create

Create a new ledger file. Called by `/claude-tweaks:flow` Step 1 or `/claude-tweaks:build` on first item.

```
File: docs/plans/YYYY-MM-DD-{feature}-ledger.md

# Open Items — {spec title or design topic}

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
```

If the file already exists (resuming a pipeline), read it and continue from the last item number.

### Add Item

Append a row to the ledger table.

**Required fields:**
- **Phase** — from the phase taxonomy above
- **Item** — description of the finding or task
- **Status** — typically `open` for new items, `observation` for informational QA caveats

**Optional:**
- **Resolution** — pre-filled for `observation` items, `—` for `open` items

**De-duplication:** Before adding, check existing items for semantic duplicates. If an item with the same phase and substantially similar description exists, skip the add and note: "Duplicate — matches item #{N}."

### Update Item

Change an item's status and/or resolution.

**Rules:**
- `open` → any terminal status (with resolution text)
- Terminal statuses are final — cannot be reopened
- Resolution text is required for all terminal statuses except `observation`
- For `fixed`: include the commit hash or file reference
- For `deferred`: include origin, affected files, and trigger for when to revisit
- For `accepted`: include the stated reason why this is acceptable

### Query

Read the ledger and filter by criteria:

| Query | Returns |
|-------|---------|
| By phase | All items matching a phase prefix (e.g., `review` matches `review`, `review/skill`, `review/hindsight`) |
| By status | All items with a specific status (e.g., all `open` items) |
| Open count | Number of items with status `open` |
| Summary | Counts by status: `Open: N | Fixed: N | Deferred: N | Accepted: N | Acknowledged: N | Observation: N` |

### Resolve Gate (Nothing-Left-Behind)

The critical gate that prevents dropped work. Called by `/claude-tweaks:wrap-up` Step 9.5 and `/claude-tweaks:flow` Step 3.

The gate runs in three phases. The agent does Phase 1 silently; Phases 2 and 3 always require explicit per-item user input.

**Phase 1 — Exhaust fixes (agent, silent)**

For each item with status `open`, attempt to fix it now. **The default is fix; defer is the exception.** An item qualifies for fix-now if **all** of these hold:

- Change is localized — typically ≤5 files, no spans across unrelated systems
- Fix does not require functionality not yet built in this pipeline
- Fix does not require user product/design decisions
- Fix does not require external state (third-party data, prod traffic, approvals)
- Fix does not materially expand pipeline scope (does not trigger long rebuilds, does not break >10 unrelated tests)

If the item qualifies, fix it, commit it, update status to `fixed` with the commit hash. Do this BEFORE presenting anything to the user.

**Bad reasons to skip a fix** (do NOT use these to keep an item open):

- *"Out of scope of this plan / spec"* — if the file is in this build's diff, it is in scope
- *"Following plan verbatim"* — when plan code conflicts with `.claude/rules/` or CLAUDE.md don'ts, fix the violation; the plan was written before review-time context
- *"A future plan (P2/P3/...) might want X"* — speculative; only defer for *known* downstream needs
- *"Bundle of small items"* — items get classified individually, never as a group
- *"Premature without consumer signal"* — clear bugs and convention violations get fixed now
- *"Plan-prescribed routing"* — if the plan said "X moves to P6," that's plan documentation, not a ledger event; remove the item entirely instead of deferring

**Phase 2 — Present remainder (per-item user input required)**

After Phase 1, only items the agent could not fix remain `open`. Present them:

```
### Unresolved Open Items

| # | Phase | Item | Why not fixed now |
|---|-------|------|-------------------|
| {N} | {phase} | {description} | {specific blocker — must be one of the legitimate-defer reasons} |

For each item, reply with `{#}: {choice}` (or `all: {choice}` if uniform):
1. Fix anyway — address it now even though it expands scope
2. Defer to `specs/DEFERRED.md` — has a trigger condition for when to revisit
3. Send to `specs/INBOX.md` — captured for later evaluation, no specific trigger yet
4. Accept — intentional, with stated reason
5. Acknowledge — ops items requiring action outside the codebase
6. Drop — no longer relevant
```

Both `specs/DEFERRED.md` and `specs/INBOX.md` are valid destinations — the user picks per item. Rough guidance to surface alongside each row if helpful (not a rule):
- **DEFERRED.md** when the item has a clear trigger ("revisit after P5 ships," "when consumer X exists")
- **INBOX.md** when the item is a captured idea without a specific trigger yet — to be triaged later

**Wait for the user's reply.** Do NOT pre-classify items, do NOT pick "obviously correct" resolutions, do NOT auto-route to "apply all" — every remaining item gets an explicit per-item user response. The user may reply `all: 2` (or `all: 3`) to bulk-route, but the request must come from them, not be the default offered.

**Phase 3 — Apply user decisions**

For each item, apply the user-chosen disposition. **Each write to `DEFERRED.md` or `INBOX.md` requires the user's explicit choice for that specific item — never bulk-write without their per-item input.**

- `Fix anyway` → return to Phase 1 for that item, fix, commit, mark `fixed`
- `Defer to DEFERRED.md` → append entry with origin (this pipeline), affected files, and the user-stated trigger. Update ledger status to `deferred`
- `Send to INBOX.md` → append entry with origin (this pipeline) and short context. Update ledger status to `deferred` (with note `→ INBOX.md` in Resolution column)
- `Accept` → record the user's stated reason in Resolution column. Update status to `accepted`
- `Acknowledge` → record as `acknowledged` (ops items only)
- `Drop` → mark as `accepted` with reason "dropped per user — no longer relevant"

**`auto` mode does NOT silence this gate.** Pipeline `auto` flags only suppress the merge-check (flow Step 2.5) and scope-check (flow Step 2.6) prompts. Per-item user input on the resolve gate is mandatory regardless of mode.

**The pipeline cannot complete with unresolved items.** This is a hard gate.

### Delete

Delete the ledger file after all items are resolved. Called by `/claude-tweaks:wrap-up` Step 5.

Only delete when the resolve gate has passed — all items must have terminal statuses.

## Standalone Usage

### `/claude-tweaks:ledger` (no arguments)

1. Find active ledger files: glob `docs/plans/*-ledger.md`
2. For each ledger, show:
   ```
   ## {ledger name}
   Open: {N} | Fixed: {N} | Deferred: {N} | Accepted: {N} | Acknowledged: {N} | Observation: {N}
   ```
3. If open items exist, highlight them

### `/claude-tweaks:ledger resolve`

1. Find the active ledger (most recent `docs/plans/*-ledger.md`)
2. Run the resolve gate procedure
3. Present results

### Next Actions

1. `/claude-tweaks:wrap-up {spec}` — wrap up the current work **(Recommended)**
2. `/claude-tweaks:help` — check overall pipeline status

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Silently dropping open items | The resolve gate catches this — every item must be explicitly resolved |
| Bulk-resolving open items without per-item user input | Phase 2 of the resolve gate requires explicit per-item response. Even when items "obviously" belong in DEFERRED.md, the user gets the call — never assume |
| Skipping Phase 1 (fix-exhaustion) and jumping straight to the user table | Phase 1 runs first. Showing the user a table with items the agent could have fixed wastes their attention and biases toward defer |
| Writing to `specs/INBOX.md` or `specs/DEFERRED.md` without per-item user confirmation | Both are valid destinations, but each entry must come from an explicit user choice on that specific item — not from the agent's classification, not from a bulk default, not from `auto` mode |
| Using "out of scope of this plan" as a defer reason | If the file is in the build's diff, it's in scope. Pre-existing baseline failures use `accepted` with proof of pre-existence, not `deferred` |
| Deferring plan-prescribed routing as a ledger item | If the plan said "X moves to P6," that is plan documentation, not a ledger event. Remove the item, do not defer it — double-tracking creates noise |
| Bundling small items into one umbrella ledger entry | Each item gets individual classification. Bundles let items hide; one decision covers seven actions |
| Resolving as "accepted" without a reason | Acceptance requires a stated rationale — "it's fine" is not sufficient |
| Deferring items introduced by the current build | Items you introduced should be fixed now — defer is for pre-existing issues or genuinely larger scope |
| Creating duplicate ledger entries | Check for semantic duplicates before adding — same phase + similar description = skip |
| Reopening resolved items | Terminal statuses are final — if the fix was wrong, create a new item |
| Modifying the ledger file format | The table format is consumed by multiple skills — structural changes break parsing |
| Using the ledger for feature tracking | The ledger tracks findings and tasks within a single pipeline run — use specs/INDEX.md for feature-level tracking |
| Skipping the resolve gate | The nothing-left-behind gate is non-negotiable — no pipeline completes with open items |
| Treating `auto` mode as authorization to bypass the resolve gate | `auto` only silences flow's merge-check and scope-check prompts. The resolve gate always requires per-item user input |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | Creates the ledger (if needed) and appends items during Steps 2.5, 4, 4.5, and 5.5. Uses phases: `ops`, `build`, `build/skill`, `build/ops`. |
| `/claude-tweaks:test` | Appends QA findings and observations during test execution. Uses phase: `test`. |
| `/claude-tweaks:review` | Appends code review findings (Step 3g) and reads/routes existing entries. Uses phases: `review`, `review/skill`. Hindsight findings (Step 4) are written by /reflect. |
| `/claude-tweaks:reflect` | Appends hindsight findings (via /review, phase `review/hindsight`), reflection insights (via /wrap-up, phase `wrap-up`), or standalone findings (phase `reflect`). |
| `/claude-tweaks:wrap-up` | Runs the resolve gate (Step 9.5) and deletes the ledger (Step 5). Reflection insights are written by /reflect (Step 3). |
| `/claude-tweaks:flow` | Creates the ledger at pipeline start (Step 1), carries it forward across all phases, and runs the resolve gate before the final summary (Step 3). |
| `/claude-tweaks:help` | Scans for active ledgers with open items and surfaces them in the status dashboard. |
| `/claude-tweaks:tidy` | May scan ledger files during backlog hygiene to detect abandoned pipelines. |
