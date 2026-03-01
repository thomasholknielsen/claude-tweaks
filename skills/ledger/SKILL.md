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
| 2 | review/convention | Missing validation on `updateUser` input | fixed | Added zod schema — `abc1234` |
| 3 | test/qa | Login story fails — selector `.login-btn` not found | open | — |
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

Each item is tagged with a phase indicating where it was discovered:

| Phase | Source | Typical Items |
|-------|--------|---------------|
| `build/*` | `/claude-tweaks:build` Steps 4-5.5 | Architecture deviations, blocked work, shared constants |
| `build/skill` | `/claude-tweaks:build` Step 4.5 | Skill update candidates from build observations |
| `build/ops` | `/claude-tweaks:build` Step 5.5 | Operational requirements (migrations, env vars, infra) |
| `ops` | `/claude-tweaks:build` Step 2.5 | Manual steps from spec (seeded before build) |
| `test/qa` | `/claude-tweaks:test` QA mode | QA story failures and observations |
| `review/*` | `/claude-tweaks:review` Step 3 | Code review findings (convention, security, error, perf, arch, test) |
| `review/ux` | `/claude-tweaks:review` Step 3h | UX analysis findings |
| `review/coverage` | `/claude-tweaks:review` Step 3g-cov | Journey-story coverage gaps |
| `review/hindsight` | `/claude-tweaks:review` Step 4 | Implementation hindsight findings |
| `review/skill` | `/claude-tweaks:review` Steps 3a, 4 | Skill update candidates from review |
| `wrap-up/*` | `/claude-tweaks:wrap-up` Step 3 | Reflection insights |

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
| By phase | All items matching a phase prefix (e.g., `review/*` matches `review/convention`, `review/skill`) |
| By status | All items with a specific status (e.g., all `open` items) |
| Open count | Number of items with status `open` |
| Summary | Counts by status: `Open: N | Fixed: N | Deferred: N | Accepted: N | Acknowledged: N | Observation: N` |

### Resolve Gate (Nothing-Left-Behind)

The critical gate that prevents dropped work. Called by `/claude-tweaks:wrap-up` Step 9.5 and `/claude-tweaks:flow` Step 3.

**Procedure:**

1. Read the ledger file
2. Filter for items with status `open`
3. If no open items → gate passes
4. If open items exist → present them:

```
### Unresolved Open Items

| # | Phase | Item |
|---|-------|------|
| {N} | {phase} | {description} |

For each item, choose a resolution:
1. Fix now — address the item immediately
2. Defer — route to DEFERRED.md (include origin, files, trigger)
3. Accept — intentional, with stated reason
4. Acknowledge — for ops items requiring action outside the codebase
```

5. Resolve each item — update status and resolution in the ledger
6. Re-check: if any items remain `open` after resolution, repeat
7. Gate passes only when zero `open` items remain

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
| Resolving as "accepted" without a reason | Acceptance requires a stated rationale — "it's fine" is not sufficient |
| Deferring items introduced by the current build | Items you introduced should be fixed now — defer is for pre-existing issues or larger scope |
| Creating duplicate ledger entries | Check for semantic duplicates before adding — same phase + similar description = skip |
| Reopening resolved items | Terminal statuses are final — if the fix was wrong, create a new item |
| Modifying the ledger file format | The table format is consumed by multiple skills — structural changes break parsing |
| Using the ledger for feature tracking | The ledger tracks findings and tasks within a single pipeline run — use specs/INDEX.md for feature-level tracking |
| Skipping the resolve gate | The nothing-left-behind gate is non-negotiable — no pipeline completes with open items |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | Creates the ledger (if needed) and appends items during Steps 2.5, 4, 4.5, and 5.5. Uses phases: `ops`, `build/*`, `build/skill`, `build/ops`. |
| `/claude-tweaks:test` | Appends QA findings and observations during test execution. Uses phase: `test/qa`. |
| `/claude-tweaks:review` | Appends code review findings (Step 3g), hindsight findings (Step 4), and reads/routes existing entries. Uses phases: `review/*`, `review/ux`, `review/coverage`, `review/hindsight`, `review/skill`. |
| `/claude-tweaks:wrap-up` | Appends reflection insights (Step 3), runs the resolve gate (Step 9.5), and deletes the ledger (Step 5). Uses phases: `wrap-up/*`. |
| `/claude-tweaks:flow` | Creates the ledger at pipeline start (Step 1), carries it forward across all phases, and runs the resolve gate before the final summary (Step 3). |
| `/claude-tweaks:help` | Scans for active ledgers with open items and surfaces them in the status dashboard. |
| `/claude-tweaks:tidy` | May scan ledger files during backlog hygiene to detect abandoned pipelines. |
