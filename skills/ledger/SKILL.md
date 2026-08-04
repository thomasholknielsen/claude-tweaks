---
name: claude-tweaks:ledger
description: Use when you need to create, update, query, or resolve open items in a pipeline ledger file. Called by /claude-tweaks:build, /claude-tweaks:test, /claude-tweaks:review, /claude-tweaks:wrap-up, and /claude-tweaks:flow — or standalone for ledger inspection.
argument-hint: "[resolve [<feature-name>]|<feature-name>]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. End with `## Next Actions` via `AskUserQuestion`, not a navigation menu.


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
| `resolve` | Run the nothing-left-behind gate on the most recent ledger |
| `resolve {feature-name}` | Run the nothing-left-behind gate on the ledger matching `{feature-name}`, instead of defaulting to the most recent one |
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

> **Parallel execution:** Use parallel tool calls aggressively — all `Glob`/`Read` operations across the matched ledger files are independent and should run concurrently.

1. Find active ledger files: glob `docs/plans/*-ledger.md`
2. For each ledger, show:
   ```
   ## {ledger name}
   Open: {N} | Fixed: {N} | Deferred: {N} | Accepted: {N} | Acknowledged: {N} | Observation: {N}
   ```
3. If open items exist, highlight them

### `/claude-tweaks:ledger {feature-name}`

1. Glob `docs/plans/*-ledger.md` and match `{feature-name}` against each file's `{feature}` slug (case-insensitive substring match — e.g. `auth` matches `2026-01-15-auth-refactor-ledger.md`)
2. If exactly one file matches, show its full item table
3. If multiple files match, list all matches (with their dates) and ask the user which one they mean
4. If no file matches, report `No ledger found for "{feature-name}"` and list the currently active ledgers (same glob as the no-arguments form) so the user can retry with a correct name

### `/claude-tweaks:ledger resolve`

1. Find the active ledger: if a `{feature-name}` is given (`resolve {feature-name}`), match it against `docs/plans/*-ledger.md` the same way the `{feature-name}` form does above — if no match, report `No ledger found for "{feature-name}"` and list the currently active ledgers instead of guessing. Otherwise, default to the most recent `docs/plans/*-ledger.md`.
2. Run the resolve gate procedure
3. Present results

## Next Actions

Call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Wrap up (Recommended)"`, `description`: `"/claude-tweaks:wrap-up {spec} — wrap up the current work once all items are resolved"`
- Option 2 — `label`: `"Re-run resolve gate"`, `description`: `"/claude-tweaks:ledger resolve — re-run the nothing-left-behind gate if items remain open"`
- Option 3 — `label`: `"Pipeline status"`, `description`: `"/claude-tweaks:help — check overall pipeline status"`

## Invocation Model

`/ledger` is consumed as a **knowledge dependency** by `/build`, `/test`, `/review`, `/wrap-up`, `/flow`, and `/tidy` — they read this skill to learn the ledger file format and resolve-gate procedure, then write to `docs/plans/YYYY-MM-DD-{feature}-ledger.md` directly using file operations. There is no programmatic invocation API, so the standard Component-Skill Contract (which suppresses `## Next Actions` when a parent skill is driving the interaction via `$PIPELINE_RUN_DIR`) does not apply here: no parent skill ever invokes `/claude-tweaks:ledger` through the Skill tool, so every actual run of this skill's own procedure is a direct, standalone invocation — `## Next Actions` always renders.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Silently dropping open items | The resolve gate catches it — every item resolves explicitly |
| Bulk-resolving open items without per-item user input | Phase 2 requires an explicit per-item response — even for items that "obviously" belong parked, the user decides |
| Skipping Phase 1 (fix-exhaustion) and jumping straight to the user table | Items the agent could have fixed waste user attention and bias toward defer |
| Staging a work record proposal (`backlog` or `parked`) without per-item user confirmation | Each needs an explicit user choice on that item — not the agent's classification, not a bulk default, not `auto` mode |
| Using "out of scope of this plan" as a defer reason | If the file is in the build's diff, it's in scope. Pre-existing baseline failures use `accepted` with proof, not `deferred` |
| Deferring plan-prescribed routing as a ledger item | "X moves to P6" is plan documentation, not a ledger event — remove it, don't defer it; double-tracking is noise |
| Bundling small items into one umbrella ledger entry | Each item needs its own classification — bundles let items hide behind one decision |
| Resolving as "accepted" without a reason | Acceptance requires a stated rationale — "it's fine" is not one |
| Deferring items introduced by the current build | Fix what you introduced — defer is for pre-existing or genuinely larger scope |
| Creating duplicate ledger entries | Check semantic duplicates before adding — same phase + similar description = skip |
| Reopening resolved items | Terminal statuses are final — if the fix was wrong, create a new item |
| Modifying the ledger file format | Multiple skills parse the table — structural changes break them |
| Using the ledger for feature tracking | The ledger covers one pipeline run. Cross-spec/cross-run tracking belongs on the decomposition's parent record's `## Cross-Spec Promises` section (`_shared/work-record.md`). |
| Skipping the resolve gate | Non-negotiable — no pipeline completes with open items |
| Treating `auto` mode as authorization to bypass the resolve gate | Phase 2 always requires per-item user input; `auto` never silences it — see `_shared/auto-mode-contract.md` |
