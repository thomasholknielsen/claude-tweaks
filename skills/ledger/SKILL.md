---
name: claude-tweaks:ledger
description: Use when you need to create, update, query, or resolve open items in a pipeline ledger file. Called by /claude-tweaks:build, /claude-tweaks:test, /claude-tweaks:review, /claude-tweaks:wrap-up, and /claude-tweaks:flow — or standalone for ledger inspection.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.


# Ledger — Open Items Tracking

Manage the open items ledger that tracks findings, operational tasks, and observations across pipeline phases. The ledger is a markdown file that carries state between skills and survives context window compression. Utility skill — no fixed lifecycle position; called from build / test / review / wrap-up / flow, or standalone for inspection.

```
/claude-tweaks:capture → ... → /claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                       │                     │                       │                       │
                                       └─ creates/appends ───┴─ appends ─────────────┴─ appends ─────────────┴─ resolves all
                                                                       ▼
                                                          [ /claude-tweaks:ledger ] ← manages the file
                                                          ^^^^ YOU ARE HERE (called from above; standalone for inspection) ^^^^
```

## When to Use

- Called by other skills to create, append, update, query, or resolve ledger items
- Standalone: inspect the current ledger (`/claude-tweaks:ledger`)
- Standalone: trigger the nothing-left-behind gate (`/claude-tweaks:ledger resolve`)
- When you want to check for unresolved items outside the automatic resolve gates (`/claude-tweaks:wrap-up` Step 8.5, `/claude-tweaks:flow` Step 5) — `/claude-tweaks:help` does not scan ledger files itself

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
| 1 | build/ops | Set `API_KEY` in environment — referenced in `src/api.ts` (reason-not-auto: auth-not-configured — `gh secret set` requires `gh auth login` first) | open | — |
| 2 | review | Missing validation on `updateUser` input | fixed | Added zod schema — `abc1234` |
| 3 | test | Login story fails — selector `.login-btn` not found | open | — |
```

### Item Numbering

Items are numbered sequentially starting at 1. New items always get the next available number. Numbers are never reused — if item 3 is resolved, the next item is still 4.

## Status Lifecycle

```
open → fixed         (item was addressed in code)
open → deferred      (staged as a work record proposal — parked, with origin, files, and trigger — resolved via the Review Console)
open → accepted      (intentional decision, with stated reason)
open → acknowledged  (for ops items — user is aware, requires action outside codebase; staged as a work record proposal — backlog — resolved via the Review Console, same as deferred)
observation          (informational, non-blocking — e.g., QA caveats)
```

**Terminal statuses:** `fixed`, `deferred`, `accepted`, `acknowledged`, `observation` — these items are resolved and will not block the pipeline.

**Non-terminal status:** `open` — these items block pipeline completion.

User-facing "Drop" choice in the resolve gate maps to status `accepted` with reason `dropped per user` (see `resolve-gate.md` Phase 3 for the full disposition table).

## Phase Taxonomy

Each item is tagged with a phase indicating where it was discovered.

**Schema:**

```
Phase     ::= Skill | Skill "/" Qualifier
Skill     ::= "build" | "test" | "review" | "reflect" | "wrap-up" | "ops" | "flow" | "design"
Qualifier ::= "ops" | "skill" | "hindsight" | "qa"
```

The qualifier adds specificity when a skill produces multiple finding types, but is optional. Downstream filters (Wrap-Up Review Console, `/tidy` cross-spec scans) parse the phase string by splitting on `/` — keep the format strict.

| Phase | Source | Typical Items |
|-------|--------|---------------|
| `ops` | `/claude-tweaks:build` | Manual steps from spec that survived auto-classification triage (only items with a `reason-not-auto` qualifier — see below) |
| `build` | `/claude-tweaks:build` | Architecture deviations, blocked work, shared constants |
| `build/ops` | `/claude-tweaks:build` | Operational requirements that survived the platform probe — auto-executable items do not appear here |
| `build/skill` | `/claude-tweaks:build` | Skill update candidates from build observations |
| `test` | `/claude-tweaks:test` | Standard verification failures (types / lint / tests) |
| `test/qa` | `/claude-tweaks:test` (QA mode) | QA story failures and observations from `qa-reporting.md` Phase 5.5 |
| `review` | `/claude-tweaks:review` | Code review findings (all categories) |
| `review/skill` | `/claude-tweaks:review` | Skill update candidates from review |
| `review/hindsight` | `/claude-tweaks:reflect` (hindsight mode, via /review) | Implementation hindsight findings |
| `wrap-up` | `/claude-tweaks:reflect` (full mode, via /wrap-up) | Reflection insights |
| `reflect` | `/claude-tweaks:reflect` (standalone) | Standalone reflection findings |
| `design` | `/claude-tweaks:flow` (polish phase, via `/claude-tweaks:design-wrapper`) | One entry per design-wrapper command invoked during polish — `fixed` for auto-fit successes, `observation` for reported issues |

> **Phase taxonomy:** Use the item description and category column to distinguish finding types within a phase. Sub-phases (`build/ops`, `build/skill`, `review/skill`, `review/hindsight`, `test/qa`) carry semantic meaning that downstream skills filter on — keep them distinct. Lens-specific review sub-phases (e.g., `review/convention`, `review/ux`, `review/coverage`) collapse into `review`; the lens is recorded in the entry body, not the phase.

### Required for `ops`-phase items (`ops`, `build/ops`)

All `ops`-phase items must embed a `(reason-not-auto: {value})` qualifier in the Item description. This forces the writer to justify why the pipeline cannot resolve the item rather than reflexively routing "outside the codebase" tasks to manual.

| Value | When to use |
|-------|------------|
| `no-cli` | Dashboard-only, physical, or vendor-side — no programmatic interface exists |
| `requires-judgment` | A name, value, or copy decision someone must make at execution time |
| `requires-signoff` | Security, legal, change-management, or product approval gates the action |
| `auth-not-configured` | A CLI exists but credentials aren't set up on this machine. After the user runs the login command, the item should be re-triaged — it often becomes auto-executable. |

Items without a `reason-not-auto` qualifier are classification errors (the spec writer or the build skill missed the triage). If you encounter one, propose the correct classification rather than appending as-is — most "outside the codebase" tasks have a CLI and should not land here.

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

**De-duplication:** Before adding, check existing items for semantic duplicates. If an item with the same phase and substantially similar description exists, skip the add and note: "Duplicate — matches item #{N}." Surface this in the skill's output to the user (do not silently skip).

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

The critical gate that prevents dropped work — three phases (Phase 1 fix-exhaust → Phase 2 per-item user input → Phase 3 apply). Full procedure lives in `resolve-gate.md` in this skill's directory. Phase 2 is on the "What `auto` does NOT silence" list in `_shared/auto-mode-contract.md`. Called by `/claude-tweaks:wrap-up` Step 8.5 and `/claude-tweaks:flow` Step 5.

### Delete

Delete the ledger file after all items are resolved. Called by `/claude-tweaks:wrap-up` Step 10 (planned in Step 5).

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

## Next Actions

Call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Wrap up (Recommended)"`, `description`: `"/claude-tweaks:wrap-up {spec} — wrap up the current work once all items are resolved"`
- Option 2 — `label`: `"Re-run resolve gate"`, `description`: `"/claude-tweaks:ledger resolve — re-run the nothing-left-behind gate if items remain open"`
- Option 3 — `label`: `"Pipeline status"`, `description`: `"/claude-tweaks:help — check overall pipeline status"`

## Component-Skill Contract

`/ledger` is consumed as a **knowledge dependency** by `/build`, `/test`, `/review`, `/wrap-up`, `/flow`, and `/tidy` — they read this skill to learn the ledger file format and resolve-gate procedure, then write to `docs/plans/YYYY-MM-DD-{feature}-ledger.md` directly using file operations. There is no programmatic invocation API.

When `$PIPELINE_RUN_DIR` is set, `/ledger` is running inside a pipeline (typically standalone via /ledger resolve at wrap-up time). In that case omit the `## Next Actions` block — the parent owns the handoff.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Silently dropping open items | The resolve gate catches this — every item must be explicitly resolved |
| Bulk-resolving open items without per-item user input | Phase 2 of the resolve gate requires explicit per-item response. Even when items "obviously" belong parked in the backlog, the user gets the call — never assume |
| Skipping Phase 1 (fix-exhaustion) and jumping straight to the user table | Phase 1 runs first. Showing the user a table with items the agent could have fixed wastes their attention and biases toward defer |
| Staging a work record proposal (either `backlog` or `parked`) without per-item user confirmation | Both stages are valid destinations, but each proposal must come from an explicit user choice on that specific item — not from the agent's classification, not from a bulk default, not from `auto` mode |
| Using "out of scope of this plan" as a defer reason | If the file is in the build's diff, it's in scope. Pre-existing baseline failures use `accepted` with proof of pre-existence, not `deferred` |
| Deferring plan-prescribed routing as a ledger item | If the plan said "X moves to P6," that is plan documentation, not a ledger event. Remove the item, do not defer it — double-tracking creates noise |
| Bundling small items into one umbrella ledger entry | Each item gets individual classification. Bundles let items hide; one decision covers seven actions |
| Resolving as "accepted" without a reason | Acceptance requires a stated rationale — "it's fine" is not sufficient |
| Deferring items introduced by the current build | Items you introduced should be fixed now — defer is for pre-existing issues or genuinely larger scope |
| Creating duplicate ledger entries | Check for semantic duplicates before adding — same phase + similar description = skip |
| Reopening resolved items | Terminal statuses are final — if the fix was wrong, create a new item |
| Modifying the ledger file format | The table format is consumed by multiple skills — structural changes break parsing |
| Using the ledger for feature tracking | The ledger tracks findings and tasks within a single pipeline run. `work-backend: local-files` (legacy spec-file-alias records with no materialized header) — use specs/INDEX.md. `work-backend: github-issues` (the current Record path) — cross-spec/cross-run tracking belongs on the decomposition's parent record's `## Cross-Spec Promises` section instead (`_shared/work-record.md`) — specs/INDEX.md is never touched by Record-mode closure (`wrap-up/cleanup-procedures.md`). |
| Skipping the resolve gate | The nothing-left-behind gate is non-negotiable — no pipeline completes with open items |
| Treating `auto` mode as authorization to bypass the resolve gate | The resolve gate always requires per-item user input on Phase 2; `auto` never silences it. For the full list of what `auto` does and does not silence, see `_shared/auto-mode-contract.md` |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | Creates the ledger (if needed) and appends items during Steps 2.5, 4, 4.5, and 5.5. Uses phases: `ops`, `build`, `build/skill`, `build/ops`. |
| `/claude-tweaks:test` | Appends QA findings and observations during test execution. Uses phases: `test`, `test/qa`. |
| `/claude-tweaks:review` | Appends code review findings (Step 3 Routing) and reads/routes existing entries. Uses phases: `review`, `review/skill`. Hindsight findings (Step 4) are written by /reflect. |
| `/claude-tweaks:reflect` | Appends hindsight findings (via /review, phase `review/hindsight`), reflection insights (via /wrap-up, phase `wrap-up`), or standalone findings (phase `reflect`). |
| `/claude-tweaks:deepen` | Does not write ledger items. Pipeline staging goes through the Auto-Mode Contract instead (`decisions.md` + `{run-dir}/staged/deepen-{n}.md`), and `/flow` renders returned candidates directly as a Depth Opportunities block, never via the ledger — see `deepen/SKILL.md`'s own Relationship-table row for the full mechanism. |
| `/claude-tweaks:design-wrapper` | The wrapper's own caches (audit, recommendations, declined) are separate files from the ledger — reciprocally, /ledger does not read or clean those caches (that's /wrap-up Step 5's job). But each design-wrapper command invoked during /flow's polish phase appends one entry under phase `design` (`fixed` for auto-fit successes, `observation` for reported issues) — see the Phase Taxonomy table above. |
| `/claude-tweaks:wrap-up` | Runs the resolve gate (Step 8.5) and deletes the ledger (Step 10, planned in Step 5). Reflection insights are written by /reflect (Step 3). |
| `/claude-tweaks:flow` | Creates the ledger at pipeline start (Step 1), carries it forward across all phases, and runs the resolve gate before the final summary (Step 5). |
| `/claude-tweaks:help` | Does not scan ledger files or surface open items on the dashboard — `/claude-tweaks:ledger resolve`, run by `/claude-tweaks:wrap-up` Step 8.5 or `/claude-tweaks:flow` Step 5, is what actually catches unresolved items. |
| `/claude-tweaks:tidy` | Does not currently scan ledger files — no step in `tidy/scan-procedures.md` reads `docs/plans/*-ledger.md`, so an abandoned pipeline's stale ledger is not detected by a `/tidy` sweep today (a known gap; see `tidy/SKILL.md`'s own Relationship-table row for the same note). |
| `_shared/auto-mode-contract.md` | The resolve gate (Phase 8.5 in /wrap-up, Phase 5 in /flow) is on the contract's "not silenced" list — even under `auto`, per-item user input is required. Bulk-route shortcuts are forbidden. |
