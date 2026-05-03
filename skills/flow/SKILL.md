---
name: claude-tweaks:flow
description: Use when you want to run an automated build → test → review → polish → wrap-up pipeline on a spec or design doc without stopping between steps.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Flow — Automated Pipeline

Run multiple lifecycle steps in sequence without stopping between them. Each step has a gate — if a gate fails, the pipeline stops and presents the failure.

```
/claude-tweaks:capture → /claude-tweaks:challenge → /brainstorm → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:design polish → /claude-tweaks:wrap-up
                                                                          ↑                                    ╰─────────────────────────────────────────────────────────────────────────────────────────────────╯
                                                                          └── or skip /specify ────────────────╯ [ /claude-tweaks:flow ] automates this (polish + re-verify run when frontend)
                                                                                                  ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- A spec is ready to build and you want to go from code to clean-slate in one command
- A brainstorming session just produced a design doc and you want to skip `/specify` and go straight through the pipeline
- You trust the pipeline to catch issues at gates rather than stopping for manual checkpoints
- You want to batch a build + test + review + wrap-up session

### When NOT to Use

- First time building a complex spec (run steps individually for more control)
- When you expect significant review findings that need discussion

## Syntax

```
/claude-tweaks:flow <spec-or-design-doc>[,spec2,spec3] [current-branch] [no-stories] [no-polish] [step1,step2,step3]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<spec-or-design-doc>` | Yes | Spec number (e.g., `42`), comma-separated spec numbers (e.g., `42,45,48`), design doc path, or topic name |
| `worktree` | No | Use worktree git strategy — isolated workspace on a feature branch (this is the default for flow). See "Parallel Development with Worktrees" below. |
| `current-branch` | No | Override the default and commit directly on the current branch instead of creating a worktree. |
| `no-stories` | No | Skip automatic story generation even if UI files changed. By default, flow auto-generates stories when the build produces UI file changes. |
| `no-polish` | No | Skip the polish phase (and its re-verify gate) entirely. Use when iterating fast on backend specs, when polish is not desired (one-off scripts, infrastructure-only changes), or when the user has already manually invoked Impeccable polish. The wrapper would skip polish anyway on non-frontend specs (detection layer 2); `no-polish` is the explicit user-facing escape hatch. |
| `auto` | No | Silence two specific borderline prompts: the merge-check (Step 2.5) and scope-check (Step 2.6) auto-choose "continue and acknowledge in ledger" instead of asking. **`auto` does NOT silence:** hard scope gates (uncommitted changes), the resolve gate (Step 3 / wrap-up Step 9.5 — per-item user input on open ledger items is mandatory), or any write to `specs/INBOX.md` / `specs/DEFERRED.md` (each entry requires explicit user approval). Passed through to `/build`, which already supports `auto`. |
| `[steps]` | No | Step argument(s). Single step = resume from that step onward. Comma-separated steps = run exactly those steps. Default (no steps): `build,test,review,polish,wrap-up` (re-verify is bundled with polish). |

Flow always uses **subagent** execution strategy — its purpose is hands-off automation. The `batched` option (which pauses for human review) is not available in flow; use `/claude-tweaks:build batched` directly instead.

### Input resolution

1. **Single spec number** (e.g., `42`) → **Spec mode** — build uses spec tracking, review checks spec compliance
2. **Multiple spec numbers** (e.g., `42,45,48`) → **Multi-spec mode** — runs each spec sequentially in one terminal (see Multi-Spec Sequential Flow below). For true parallel execution, use separate terminals with `worktree` mode.
3. **Design doc path** (e.g., `docs/plans/*-design.md`) → **Design mode** — build reads the design doc directly, review uses git diff instead of spec compliance
4. **Topic name** (e.g., `meal planning`) → search for a matching spec AND design doc. If both exist, prefer spec mode. If only a design doc exists, use design mode.

### Automatic story generation

After build completes, flow checks the build output for UI file changes (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`, or files in component/page directories). If UI files changed and `no-stories` was not specified:

1. Auto-detect the dev server URL using `dev-url-detection.md` from the `/claude-tweaks:stories` skill's directory
2. Run `/claude-tweaks:stories` with the detected URL. When journey files exist in `docs/journeys/` (created by `/build` Common Step 6), the stories step ingests them before browsing — the `journey:` field is set on derived stories, source files are inherited from the journey's `files:` frontmatter, and browsing is enrichment rather than fresh discovery for journey-documented pages.
3. Generated stories feed into `/claude-tweaks:test` (which validates them as part of the test step)

If no UI files changed, or `no-stories` is set, the stories step is skipped.

### Examples

```
/claude-tweaks:flow 42                                              → full pipeline in worktree (default): build, test, review, polish, wrap-up
/claude-tweaks:flow 42 current-branch                               → full pipeline on current branch (no isolation)
/claude-tweaks:flow 42 no-stories                                   → full pipeline in worktree (skip stories even if UI changed)
/claude-tweaks:flow 42 no-polish                                    → full pipeline without polish phase: build, test, review, wrap-up
/claude-tweaks:flow 42,45,48                                        → multi-spec sequential, each in its own worktree
/claude-tweaks:flow 42,45,48 current-branch                         → multi-spec sequential on current branch
/claude-tweaks:flow docs/plans/2026-02-21-meal-planning-design.md   → design mode: full pipeline
/claude-tweaks:flow meal planning                                   → auto-detect: spec or design mode
/claude-tweaks:flow 42 review                                       → resume from review: runs review + polish + wrap-up
/claude-tweaks:flow 42 polish                                       → resume from polish: runs polish + re-verify + wrap-up
/claude-tweaks:flow 42 test                                         → resume from test: runs test + review + polish + wrap-up
/claude-tweaks:flow 42 wrap-up                                      → resume from wrap-up only
/claude-tweaks:flow 42 review,wrap-up                               → explicit subset: runs ONLY review and wrap-up (no polish)
/claude-tweaks:flow 42 build,test                                   → explicit subset: runs ONLY build and test
/claude-tweaks:flow 42 auto                                         → silence merge-check and scope-check prompts
/claude-tweaks:flow docs/plans/migration-design.md auto             → design mode + silence borderline prompts
```

## Allowed Steps

Only automatable skills can be included in the pipeline:

| Step | Skill invoked | Why it's automatable |
|------|--------------|---------------------|
| `build` | `/claude-tweaks:build` | Fully autonomous — plans, implements, simplifies, verifies. Always uses `subagent` execution. Passes `worktree` through if specified. |
| `stories` | `/claude-tweaks:stories` | Autonomous — browses app, generates YAML stories. Auto-triggered when build produces UI file changes (unless `no-stories`). |
| `test` | `/claude-tweaks:test` | Mechanical pass/fail gate — types, lint, tests, QA story validation. Sets `TEST_PASSED=true` on pass. |
| `review` | `/claude-tweaks:review` | Code review, simplification, visual browser review with idea generation (when browser available) — produces a verdict. Gates on `TEST_PASSED`. |
| `polish` | `/claude-tweaks:design polish <spec>` | **(Phase 2)** Invokes Impeccable polish + clarify + harden (auto-fit) plus issue-driven commands when audit findings exist. Modifies code. Always followed by re-verify (`/test skip-qa`). Gates on review verdict PASS. Skipped on non-frontend specs (wrapper detection). |
| `wrap-up` | `/claude-tweaks:wrap-up` | Reflection, cleanup, knowledge routing — produces actionable summary |

**Not allowed in flow:** `capture`, `challenge`, `specify`, `init`, `tidy`, `help`, `browse` — these require interactive decision-making or are utility skills.

`re-verify` is **bundled** with `polish` — it is not a separately addressable step. When `polish` runs and modifies code, the re-verify gate runs automatically afterward (`/test skip-qa`, one-cycle cap). Including `re-verify` in a step list is a no-op; treat it as already implied by `polish`.

### Step Arguments

Steps must follow lifecycle order. Invalid orderings are rejected.

| Form | Meaning | Example |
|------|---------|---------|
| No steps | Full pipeline | `/flow 42` → build, test, review, polish, wrap-up |
| Single step | Resume from that step onward | `/flow 42 review` → review, polish, wrap-up |
| Multiple steps (comma-separated) | Run exactly those steps | `/flow 42 review,wrap-up` → review, wrap-up only (skips polish) |

**Resume mode** (single step argument, no comma) assumes all prior steps completed successfully. The pipeline reads existing context (ledger, `TEST_PASSED`, etc.) from files rather than generating it. If prior context is missing (e.g., no ledger file when resuming from review), the pipeline creates fresh context as needed and notes: "No existing ledger found — creating fresh."

**Explicit subset** (comma-separated steps) runs only the listed steps. Context from skipped prior steps is read from files if available.

**Valid examples:**
- `build,test,review,polish,wrap-up` — valid (default; stories auto-inserted if UI changed)
- `build,stories,test,review,polish,wrap-up` — valid (stories always runs regardless of UI changes)
- `build,test,review,wrap-up` — valid (skips polish — equivalent to `no-polish`)
- `build,test,review` — valid
- `build,test` — valid
- `test,review,polish,wrap-up` — valid (assumes build is already done)
- `review,polish,wrap-up` — valid (assumes build and test are done)
- `polish,wrap-up` — valid (assumes build, test, and review are done — useful when iterating on polish manually)
- `wrap-up` — valid (assumes build, test, review, and polish are done)
- `review,build` — **invalid** (out of order)
- `wrap-up,review` — **invalid** (out of order)

**Auto-insert `test`:** If `review` is in the step list but `test` is not, auto-insert `test` before `review` and note: "Auto-inserted `test` before `review` — review gates on test passing." This ensures backward compatibility.

**Polish bundled with re-verify:** If `polish` is in the step list, the re-verify gate runs automatically when polish modifies code. Users do not need to add a separate `re-verify` step. If a user includes the literal `re-verify` in the step list, treat it as a no-op (already bundled with polish) and note: "`re-verify` is bundled with `polish` — no separate step needed."

**`no-polish` argument behavior:** When `no-polish` is set, the polish phase (and its re-verify gate) is removed from the pipeline. The default pipeline becomes `build,test,review,wrap-up` (the pre-Phase-2 default). `no-polish` overrides any explicit `polish` in the step list — the user's explicit step request wins on the rest of the pipeline, but polish is unconditionally dropped.

## Gate Behavior

Each step has a gate that determines whether to proceed to the next step.

| Step | Gate condition | On pass | On failure |
|------|---------------|---------|-----------|
| `build` | Final verification passes (type check + lint + tests) | Check for UI changes → auto-trigger stories if applicable → proceed | **STOP** — present verification failures |
| `stories` (auto) | YAML files created + no parse errors | Proceed to test | **STOP** — present generation failures |
| `test` | All checks pass — types, lint, tests, QA (when stories exist). `PASS_WITH_CAVEATS` counts as passed (caveats are informational). Sets `TEST_PASSED=true`. | Proceed to review | **STOP** — present test/QA failures |
| `review` | Verdict is **PASS**. Gates on `TEST_PASSED=true`. Runs in full mode (code + visual) when browser available; falls back to code mode otherwise. | Proceed to polish (or wrap-up if `no-polish`) | **STOP** — present **BLOCKED** verdict with findings |
| `polish` (Phase 2) | Wrapper returns `{result: "ok"}`. Acceptable returns include `commands_invoked: []` (no auto-fit applicable, no audit findings — no work to do) and `{skipped: ...}` (non-frontend, no Impeccable, integration disabled). | If `commands_invoked` non-empty → run re-verify gate. If `commands_invoked` empty or skip → proceed directly to wrap-up. | **STOP** — wrapper returned an error (rare; usually means Impeccable plugin crashed mid-dispatch). Present the error. |
| `re-verify` (bundled with polish) | `/test skip-qa` passes (types + lint + tests). | Proceed to wrap-up | **STOP** — present "Polish broke verification" failure card. One-cycle cap — no automatic retry. |
| `wrap-up` | Always passes | Pipeline complete | — |

**Zero-test edge case:** If no test commands are configured in CLAUDE.md and no QA stories exist, the test gate passes vacuously — there is nothing to fail. Note in the pipeline output: "Test gate: no checks configured. Consider adding test commands to CLAUDE.md." This is a pass, not a skip.

**Polish phase decision tree:**

```
Polish phase entry (after review PASS, no-polish not set)
    │
    ▼
Invoke /claude-tweaks:design polish <spec>
    │
    ├─ {skipped: ...}                  → Note skip in summary, proceed to wrap-up (no re-verify)
    │
    ├─ {result: "ok", commands_invoked: []}
    │                                   → Note "polish: no work to do", proceed to wrap-up (no re-verify)
    │
    └─ {result: "ok", commands_invoked: [...], files_modified: [...]}
                                        → Run re-verify gate (`/test skip-qa`)
                                              │
                                              ├─ Pass  → Proceed to wrap-up
                                              └─ Fail  → STOP — "Polish broke verification" card
```

**Re-verify one-cycle cap:** The re-verify gate runs at most once per flow run. The pipeline tracks this with an in-memory marker (`re_verify_ran: true` in pipeline state — same in-memory marker pattern as `/claude-tweaks:design`'s availability skip de-dupe). If polish modifies code and re-verify fails, the pipeline stops; it does not retry polish. The user resolves the failure (typically by reverting the polish commit or fixing the underlying issue) and resumes with `/claude-tweaks:flow {spec} polish` to re-attempt polish + re-verify in a fresh flow run (which resets the marker).

**Why the cap exists:** Without it, polish could oscillate (polish modifies code → re-verify fails → user fixes → re-runs polish → polish modifies again → re-verify fails again). The single-cycle cap makes the failure mode predictable: one polish attempt, one re-verify attempt, success or stop.

### On Gate Failure

When a gate fails, the pipeline stops immediately. Present:

```markdown
## Flow: Pipeline Stopped

### Completed
- {step}: {outcome}

### Failed at: {step}
{failure details from the step's output}

### Open Items (at time of failure)
{current ledger contents — so the user sees what's been tracked}

### Manual Steps Required (collected so far)
| # | What | Where |
|---|------|-------|
| 1 | {description} | {source} |
(or: No manual steps collected yet.)

> These were detected before the pipeline stopped. Address them alongside the fix.

### Actions Performed

{Include rows from completed phases before the failure. Omit when pipeline failed at the first step.}

| Action | Detail | Ref |
|--------|--------|-----|
| {rows from completed phases} | ... | ... |

### Next Actions

1. `/claude-tweaks:flow {spec} {failed-step}` — resume from {failed step} **(Recommended)**
2. `/claude-tweaks:{step} {spec}` — run {failed step} manually for more control
{If test failed:}
3. `/claude-tweaks:test` — re-verify after fixes
{If re-verify failed (polish broke verification):}
3. `git diff` — inspect the polish modifications that broke verification
4. `git revert HEAD` — revert the polish commit if it's not salvageable, then retry with `/claude-tweaks:flow {spec} no-polish` to skip polish entirely on the next run
```

### Polish-broke-verification failure card (specific shape)

When the re-verify gate fails after polish modified code, the failure card uses this specific shape:

```markdown
## Flow: Pipeline Stopped — Polish broke verification

### Completed
- build: passed
- stories: {outcome}
- test: passed
- review: PASS
- polish: invoked {N} commands ({list}), modified {M} files

### Failed at: re-verify (post-polish)
{verification failures from /test skip-qa output — types/lint/test errors}

### Polish modifications
{git diff --stat output for the polish commit(s)}

### Open Items (at time of failure)
{current ledger contents}

### Next Actions

1. Inspect the polish modifications: `git diff {polish-commit-range}` **(Recommended)**
2. Revert the polish commit and resume without polish: `git revert {polish-commit}` then `/claude-tweaks:flow {spec} no-polish wrap-up`
3. Fix the verification failure manually, then resume: `/claude-tweaks:flow {spec} polish`

> The re-verify cycle cap is 1 per flow run. Resuming with `/flow {spec} polish` starts a fresh cycle.
```

## Execution

### Step 1: Validate Input

1. Parse `$ARGUMENTS` — extract spec number or design doc path, detect `worktree`, `current-branch`, `no-stories`, `no-polish`, and `auto` keywords, plus optional step list
2. Determine mode: spec mode (number) or design mode (path/topic)
2.5. **Pre-flight merge check** — read the `Pre-flight / merge-check` CLAUDE.md setting (default: `true`). When enabled and worktree strategy resolves to `worktree`:
   ```bash
   git fetch origin main 2>/dev/null
   ahead=$(git rev-list --count HEAD..origin/main 2>/dev/null)
   ```
   If `ahead > 0`, surface the divergence (`git log --oneline HEAD..origin/main | head -5`) and offer: (1) Rebase first **(Recommended)**, (2) Continue and acknowledge in ledger. In `auto` mode, automatically choose option 2 and add an `ops` ledger entry.

2.6. **Scope check** — `/flow`'s "When NOT to Use" lists "first time complex spec" as a reason to run steps individually. Apply this as a heuristic before starting:
   - **Plan size:** count file references in the plan's "Files:" sections. Threshold: 10+ files.
   - **Major version bump:** scan the design doc / plan for "v{N}.0.0" or "vMAJOR" patterns. Threshold: any major version bump.
   - **Design doc length:** count lines in the design doc. Threshold: 300+ lines.

   If any threshold is hit, surface a warning before pipeline start:
   ```
   This work hits /flow's complexity heuristics:
   - Plan touches {N} files (threshold: 10+)
   - Design includes major version bump to v{N}.0.0
   - Design doc is {L} lines (threshold: 300+)

   /flow is designed for hands-off automation; complex changes benefit from /specify decomposition into reviewable sub-specs first.

   1. Decompose with /specify first **(Recommended)** — produces sub-specs each ≤10 files, run /flow on each
   2. Proceed with /flow anyway — accept that a single review failure halfway means a large diff to untangle
   3. Cancel
   ```
   In `auto` mode, automatically choose option 2 and add an `ops` ledger entry noting the scope warning was bypassed.
3. **Git strategy defaults to `worktree`** — same default as `/build`; flow never prompts. Resolution order:
   1. Explicit argument: `worktree` or `current-branch` in `$ARGUMENTS` — always wins
   2. CLAUDE.md `git-strategy` setting — project-level default (see `/claude-tweaks:build` default resolution)
   3. Fallback: `worktree`

   Do NOT prompt the user for git strategy — resolve it silently from the above. This is passed through to `/claude-tweaks:build` and controls isolation. Flow always uses `subagent` execution — no prompt needed for execution strategy.
4. Validate step list is in lifecycle order. Apply auto-inserts:
   - **`test` before `review`:** If `review` is in the step list but `test` is not, auto-insert `test` before `review` and note: "Auto-inserted `test` before `review` — review gates on test passing."
   - **`re-verify` is bundled with `polish`:** If a user includes the literal `re-verify` in the step list, treat it as a no-op and note: "`re-verify` is bundled with `polish` — no separate step needed." `re-verify` runs automatically when `polish` modifies code.
   - **`no-polish` overrides explicit polish:** If `no-polish` is set and `polish` is in the step list (explicitly or via the default), drop `polish` from the resolved step list and note: "`no-polish` set — skipping polish phase."
5. If spec mode: check prerequisites are met (same as `/claude-tweaks:build` Spec Step 1)
6. If design mode: verify the design doc file exists
7. If validation fails → **stop before starting**
8. **Create the open items ledger** using `/claude-tweaks:ledger`'s create operation. The `{feature}` name matches the execution plan that build will create. This file tracks findings and operational tasks across all pipeline phases. See `/claude-tweaks:ledger` for status lifecycle and phase taxonomy.

### Step 2: Run Pipeline

For each step in order:

1. **Announce** the step: `## Flow: Running {step} ({N}/{total})`
2. **Execute** the full skill as documented in its own SKILL.md
3. **Check the gate** — if the step fails its gate, stop the pipeline
4. **Pass context forward** — each step's output feeds into the next:
   - `build` → check output for UI file changes (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`, component/page directories). If UI changed and `no-stories` not set → auto-detect dev URL via `dev-url-detection.md` and run `stories` step.
   - `stories` → `test` receives the stories directory
   - `build` → `test` receives `VERIFICATION_PASSED=true` (so test skips redundant types/lint/tests — see `verification.md` in the `/claude-tweaks:test` skill). Test still runs QA if stories exist.
   - `test` → `review` receives `TEST_PASSED=true` and QA results. Flow invokes `/claude-tweaks:review` in **full** mode (code + visual review) by default. The review skill delegates visual review to `/claude-tweaks:visual-review`, which handles its own browser detection:
     - **Browser available:** `/visual-review` runs the full visual review. It auto-detects the dev server URL and consumes QA data when available.
     - **No browser available:** `/visual-review` reports the detection failure with install instructions. Review falls back to code mode. Flow notes in pipeline output: "Visual review skipped — no browser backend available."
   - `review` → `polish` (Phase 2 — when `no-polish` not set) — invoke `/claude-tweaks:design polish <spec>` via the Skill tool. See "Polish phase execution" below for the dispatch logic.
   - `polish` → `re-verify` (Phase 2 — only when polish modified code) — invoke `/claude-tweaks:test skip-qa`. See "Re-verify execution" below.
   - `polish` (or `re-verify`) → `wrap-up` receives the review summary, polish results, and verdict. Skill observations (`build/skill` and `review/skill` ledger entries) carry forward via the ledger file for wrap-up's skill update analysis (Step 7).
5. **Ledger carries forward** — each step reads and appends to the open items ledger (see `/claude-tweaks:ledger` for all operations). Unlike conversation context (which may be compressed), the ledger is a file — it survives context window limits.

#### Polish phase execution (Phase 2)

When the polish step runs (review verdict is PASS, `no-polish` not set, polish in step list):

1. Invoke `/claude-tweaks:design polish <spec>` via the Skill tool.
2. Inspect the wrapper's return value:
   - **`{skipped: ...}`** — the wrapper detected non-frontend, missing Impeccable, or kill-switch disabled. Note the skip reason in the pipeline summary's polish row. Proceed to wrap-up. **Do not** run re-verify — there are no polish modifications to verify.
   - **`{result: "ok", commands_invoked: [], files_modified: []}`** — the wrapper ran preconditions but had no work to do (no audit findings, no auto-fit changes were needed, or zero files in scope). Note "polish: no changes" in the summary. Proceed to wrap-up. **Do not** run re-verify.
   - **`{result: "ok", commands_invoked: [...], files_modified: [...]}`** — the wrapper invoked auto-fit + issue-driven commands and modified code. Record the commands invoked and files modified in the polish-row of the pipeline summary. **Run re-verify next.**
   - **Wrapper error / unhandled exception** — stop the pipeline with a "Polish wrapper error" failure card. Do not assume the modifications are partial-and-recoverable; surface the error and let the user inspect.
3. After polish, append a ledger entry per command invoked (phase: `design`, status: `fixed` for auto-fit successes, `observation` for any reported issues from a sub-command). The ledger entries flow through to wrap-up's skill update analysis.

#### Re-verify execution (Phase 2)

When polish modified code (`files_modified` non-empty) and the re-verify cycle has not yet run in this flow:

1. Set the in-memory marker `re_verify_ran: true` (per-process pipeline state, not on-disk).
2. Invoke `/claude-tweaks:test skip-qa` via the Skill tool. The wrapper runs types + lint + tests, skips QA story validation (browser QA is unnecessary after stylistic-only polish), but still runs the Design CLI gate (Step 1.5) since CLI is not QA.
3. Inspect the result:
   - **Pass** → proceed to wrap-up. Note "re-verify: passed" in the polish row.
   - **Fail** → stop the pipeline with the "Polish broke verification" failure card (see "On Gate Failure" below for format). The user resolves the failure (typically by inspecting the polish commit, reverting if needed, and addressing the regression) and resumes with `/claude-tweaks:flow {spec} polish` in a new flow run.

If the marker is already set (re-verify already ran in this flow), this is a programming error — the gate should never run twice. Surface a "re-verify cycle cap exceeded" error and stop the pipeline. This is defensive — the polish-phase decision tree should never re-enter re-verify, but the marker exists to enforce that invariant.

### Step 3: Present Pipeline Summary

**Nothing-left-behind gate:** Run the resolve gate from `/claude-tweaks:ledger`. If any item has status `open`, present it for resolution -- no item may remain `open`. The pipeline cannot complete with unresolved items.

**Creative Opportunities survey (v4.5.0).** Before rendering the summary, invoke `/claude-tweaks:design survey <changed-files>` against the full diff produced by the pipeline. The wrapper analyzes the diff heuristically (no screenshots are passed — `/flow` does not maintain its own browser session) and returns ranked recommendations for creative commands the user might want to run manually. Render the recommendations as a Creative Opportunities block (template below) before the Next Actions block.

Handle the wrapper return:

| Return shape | Action |
|--------------|--------|
| `{result: "ok", recommendations: [...]}` non-empty | Render the Creative Opportunities block from the template. Write the wrapper's `recommendations` cache (the wrapper does this itself — `docs/plans/...-recommendations.json`). |
| `{result: "ok", recommendations: []}` | Omit the block. Survey ran but matched nothing — not a failure. |
| `{skipped: ...}` | Omit the block. Skip reasons are non-frontend, no Impeccable, integration disabled — none of these warrant surfacing in the summary. |

**Decline detection (Phase 3).** Before invoking survey, read the prior `docs/plans/...-recommendations.json` cache (if it exists) for this spec. After the new pipeline diff is final (post-polish, post-re-verify), compare the prior recommendations against the diff:

- For each prior recommendation, check whether its expected file changes appear in the new diff. The expected change is "the suggested command was invoked and modified the recommended page" — heuristic: file paths that the recommendation's `page` substring matches AND have a polish-style diff signature (touched between the previous and current pipeline run).
- For prior recommendations whose expected changes did NOT appear, increment `decline_count` for that `(command, page)` in `docs/plans/...-declined.json`. Initialize the entry if absent.
- The wrapper's survey call (next step) reads this declined cache and suppresses observations whose `decline_count >= 2`.

Decline detection runs only when a prior recommendations cache exists for the same spec. First-run flows have no prior recommendations to compare against — skip detection silently. Reset path for the user: `/claude-tweaks:design reset-recommendations <spec>` deletes the declined cache.

On successful completion of all steps:

```markdown
## Flow: Pipeline Complete

### {Spec {number}: {title} | Design: {design doc topic}}

| Step | Outcome |
|------|---------|
| build | Verification passed |
| stories | {Generated N stories | Skipped — no UI changes | Skipped — no-stories} |
| test | {Passed (types + lint + tests) | Passed (QA: N stories) | Passed (verification skipped — passed in build, QA: N stories)} |
| review | Verdict: PASS {(code + visual) | (code only — no browser)} |
| polish | {Invoked N commands ({list}); re-verify passed | Skipped — non-frontend | Skipped — no-polish | Skipped — Impeccable not installed | No changes to apply | re-verify failed (see failure card)} |
| wrap-up | Learnings captured, artifacts cleaned, ledger resolved |

### Key Outputs
- {summary of what was built}
- {summary of review findings, if any}
- {summary of wrap-up actions taken}

### Manual Steps Required
| # | What | Where |
|---|------|-------|
| 1 | {description} | {source} |
(or: No manual steps — nothing to do outside the codebase.)

> Complete these after merging. The pipeline detected them but cannot execute them.

### Actions Performed

{Rolled-up table from all phases. When >15 rows, collapse to per-phase summaries.}

| Action | Detail | Ref |
|--------|--------|-----|
| {rows from build, stories, review, polish, wrap-up phases} | ... | ... |

### Creative Opportunities

The polish phase ran the auto-fit + issue-driven + intent-driven commands. These could enhance the result further:

| Command | Why it might help |
|---------|------------------|
| `/impeccable:impeccable colorize dashboard` | Heavy monochrome — strategic accent color recommended |
| `/impeccable:impeccable animate settings` | Toggle interactions are static |

Each is a one-shot manual command; flow does not run these automatically.

> Render this block only when `survey` returned `recommendations` non-empty. When the wrapper reports `suppressed > 0`, append: `> N suggestion(s) hidden — previously declined for this spec. Reset with /claude-tweaks:design reset-recommendations <spec>.` Omit the entire section when the wrapper returned `recommendations: []` or `{skipped}`.

### Next Actions

1. `/claude-tweaks:flow {next spec}` — full pipeline on spec {N}: "{title}" **(Recommended)**
2. `/claude-tweaks:help` — full pipeline status
{If unblocked specs:}
3. `/claude-tweaks:build {N}` — spec {N} "{title}" now unblocked
```

---

## Multi-Spec Sequential Flow

When multiple spec numbers are provided (e.g., `42,45,48`), flow runs each spec's pipeline **sequentially** in one terminal.

### Validation

Before starting, validate the spec list:

1. **Parse** — split on commas, resolve each to a spec file
2. **Prerequisites** — check that each spec's `blocked-by` is satisfied. Reject any spec with unmet prerequisites.

### Execution

Run each spec's full pipeline in order (spec 42 → spec 45 → spec 48). Each spec completes its pipeline (build → test → review → wrap-up) before the next begins. A gate failure in one spec stops the remaining specs — present what completed and what remains.

If `worktree` is specified, each spec gets its own worktree via `/using-git-worktrees`. The worktree is finished via `/finishing-a-development-branch` before the next spec begins.

### Multi-Spec Summary

After all specs complete (or one fails), present a consolidated summary:

```markdown
## Flow: Multi-Spec Pipeline Complete

| Spec | Build | Test | Review | Polish | Wrap-Up | Outcome |
|------|-------|------|--------|--------|---------|---------|
| {N} | passed | passed | PASS | applied + re-verified | done | Complete |
| {N} | passed | passed | PASS | skipped (no-polish) | done | Complete (no polish) |
| {N} | passed | passed | BLOCKED | — | — | Stopped at review |
| {N} | passed | passed | PASS | re-verify failed | — | Stopped at re-verify |
| {N} | — | — | — | — | — | Not started (previous spec failed) |

### Manual Steps Required (all specs)
| # | Spec | What | Where |
|---|------|------|-------|
| 1 | {N} | {description} | {source} |
(or: No manual steps required.)

### Per-Spec Details
(expand each spec's key outputs, failures, and review findings)
```

---

## Parallel Development with Worktrees

For true parallel execution, run separate terminals with `worktree` mode — each terminal gets an isolated copy of the repository:

```
# Terminal 1                          # Terminal 2                          # Terminal 3
/claude-tweaks:flow 42 worktree      /claude-tweaks:flow 45 worktree      /claude-tweaks:flow 48 worktree
```

Each terminal creates its own worktree and feature branch. There is no file overlap risk because each worktree is a full, isolated copy.

### When to use worktree mode

- **Parallel work** — multiple specs building simultaneously in separate terminals
- **Team projects** — isolated branches ready for PR review
- **Risky changes** — experiment without affecting the main working tree

### When to use current-branch mode

- **Solo work** — simple, sequential, fast
- **Quick specs** — low risk, no isolation needed
- **Single terminal** — no need for parallel execution

### Merge Reconciliation (after parallel worktree runs)

After all terminals complete, merge the feature branches back. Run this once from the main working tree:

#### Merge Order

1. Sort completed branches by diff size (smallest first — run `git diff --stat main..{branch}` and read the summary line at the end of its output)
2. Merge branches sequentially into the base branch

#### Merge Procedure

For each completed branch (in order):

1. `git merge {branch}` into the base branch
2. **If merge succeeds** — continue to the next branch
3. **If merge conflicts** — present the conflicts:
   ```
   Merge conflict merging {branch}:

   Conflicting files:
   - {file1}
   - {file2}

   1. Resolve conflicts now **(Recommended)** — I'll resolve based on both specs' intent
   2. Skip this branch — merge remaining branches first, come back to this one
   3. Abort all remaining merges — I'll handle merges manually
   ```
4. After all merges, update `specs/INDEX.md` to reflect completed specs

#### Post-Merge Summary

```markdown
### Merge Results

| Branch | Spec | Merge Status |
|--------|------|-------------|
| {branch} | {N} | Merged cleanly |
| {branch} | {N} | Merged with conflict resolution |
| {branch} | {N} | Skipped (pipeline failed) |

### Next Actions
- Failed specs: fix issues and re-run `/claude-tweaks:flow {spec} worktree {remaining steps}`
- All merged: run `/claude-tweaks:help` for full pipeline status
```

---

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Using flow for first-time complex specs | You lose the ability to course-correct between steps — run manually first |
| Ignoring gate failures and restarting | Gates exist to catch real problems — investigate before retrying |
| Running flow on specs with unmet prerequisites | The pipeline will fail at build — check dependencies first |
| Using flow for interactive skills | Capture, challenge, and specify need human decisions — they can't be automated |
| Using `batched` execution in flow | Flow's purpose is hands-off automation — batched pauses for human review, contradicting flow's no-stopping design. Use `/claude-tweaks:build batched` directly. |
| Ignoring open ledger items at pipeline end | The nothing-left-behind gate prevents dropped work — every item must be explicitly resolved |
| Treating `auto` as authorization to bulk-resolve the ledger | `auto` only silences merge-check and scope-check. The resolve gate's Phase 2 always requires per-item user input — items must be approved by the user one at a time |
| Writing to `specs/INBOX.md` or `specs/DEFERRED.md` from inside flow without explicit per-item user approval | Both files are valid destinations, but each entry requires the user's explicit choice on that specific item. Pipeline phases never write to either file autonomously, even when an item looks like an obvious candidate |
| Skipping test in the pipeline | Test is the mechanical gate — review depends on `TEST_PASSED`. Omitting test means review runs on potentially broken code. |
| Retrying polish after re-verify failure within the same flow run | The one-cycle cap exists to prevent oscillation (polish → fail → fix → polish → fail → ...). Surface the failure, let the user inspect, and require a fresh `/flow {spec} polish` to retry. |
| Treating polish skip as a flow failure | Polish skips are normal — non-frontend specs, no Impeccable, `no-polish` flag, no audit findings + no auto-fit changes needed all skip cleanly. The pipeline continues to wrap-up. |
| Running re-verify without `skip-qa` | Browser QA is irrelevant after stylistic-only polish — re-verify uses `/test skip-qa` to keep the cycle fast. The Design CLI gate still runs (it is not QA). |
| Using `no-polish` on a frontend spec by reflex | Polish is the value-add for frontend specs — only set `no-polish` when iterating fast or when the user has manually run Impeccable polish before flow. |
| Auto-running creative commands surfaced in the Creative Opportunities block | The block is recommendations only. Flow never executes Impeccable creative commands from survey output — the user invokes them manually if a suggestion resonates. |
| Rendering the Creative Opportunities block when survey returned empty or skipped | Survey is heuristic. An empty result means "nothing matched the criteria," not "design is complete." Rendering an empty block falsely implies completeness. Omit the block entirely. |
| Skipping decline detection on re-runs of the same spec | The declined-recommendations cache is what keeps the Creative Opportunities block from becoming noise across iterations. Read the prior recommendations cache, compare against the new diff, increment declines for un-invoked recommendations before invoking survey. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | First step in the default pipeline — runs in spec mode or design mode depending on flow input. Sets `VERIFICATION_PASSED=true`. |
| `/claude-tweaks:stories` | Auto-triggered between build and test when UI files change (unless `no-stories`). Ingests journey files from `/build` for journey-aware story generation. Uses `dev-url-detection.md` for URL resolution. |
| `/claude-tweaks:test` | Mechanical gate between build/stories and review — types, lint, tests, QA. Receives `VERIFICATION_PASSED` from build (skips redundant checks). Sets `TEST_PASSED=true`. |
| `/claude-tweaks:review` | Analytical gate — receives `TEST_PASSED=true` from test, produces verdict. Runs in **full** mode (code + visual) by default; delegates visual review to `/visual-review` which handles its own browser detection. Code mode fallback when no browser available. Never runs verification or QA itself. |
| `/claude-tweaks:visual-review` | Invoked transitively by /review in full mode. Handles browser detection, dev URL resolution, and the full visual review procedure. |
| `/claude-tweaks:wrap-up` | Final step — receives review output, produces clean slate |
| `/claude-tweaks:help` | Shows pipeline status and recommends flow-ready specs |
| `/claude-tweaks:specify` | Creates the specs that flow consumes |
| `/claude-tweaks:browse` | Used transitively — /stories and /review visual modes use /browse for browser interaction |
| `/brainstorm` | Produces the design docs that flow consumes in design mode — skipping /specify |
| `/using-git-worktrees` | Invoked BY flow (when `worktree` specified) to create isolated workspace for each spec |
| `/finishing-a-development-branch` | Invoked BY flow (when `worktree` specified) at handoff to merge, PR, or discard each feature branch |
| `/claude-tweaks:ledger` | Manages the open items ledger. /flow creates the ledger (Step 1), carries it across phases, and runs the resolve gate (Step 3). |
| `/claude-tweaks:design` | /flow invokes `/claude-tweaks:design polish <spec>` after review verdict PASS (auto-fit + issue-driven + intent-driven dispatch — v4.5.0). The wrapper handles its own detection (non-frontend skips); when polish modifies code, /flow follows up with `/test skip-qa` (re-verify gate, one-cycle cap). The `no-polish` argument removes the polish phase entirely. /flow's pipeline summary also invokes `/claude-tweaks:design survey <full-diff>` to render the Creative Opportunities block (anchor 3 of v4.5.0's creative surfacing system); /flow handles decline detection by comparing the prior recommendations cache against the new diff before each survey call. |
