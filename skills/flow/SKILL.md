---
name: claude-tweaks:flow
description: Use when you want to run an automated build → test → review → polish → wrap-up pipeline on a spec without stopping between steps. Accepts specs only — design docs must be decomposed via /claude-tweaks:specify first.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Flow — Automated Pipeline

Run multiple lifecycle steps in sequence without stopping between them. Each step has a gate — if a gate fails, the pipeline stops and presents the failure.

```
/claude-tweaks:capture → /claude-tweaks:challenge → /superpowers:brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:design polish → /claude-tweaks:wrap-up
                                                                                                                ╰────────────────────────────────────── [ /claude-tweaks:flow ] automates this stretch ──────────────────────────────╯
                                                                                                                ^^^^ YOU ARE HERE ^^^^   (polish + re-verify run only when frontend)
```

## When to Use

- A spec is ready to build and you want to go from code to clean-slate in one command
- A brainstorming session produced a design doc, `/specify` decomposed it into specs, and you want to run those specs through the pipeline
- You trust the pipeline to catch issues at gates rather than stopping for manual checkpoints
- You want to batch a build + test + review + wrap-up session

### When NOT to Use

- The input is a design doc, not a spec — run `/claude-tweaks:specify {doc}` first
- The plan has tangled cross-task dependencies — flow's shape gate (Step 2.6) will hard-fail anyway; tighten via `/specify` first
- When you expect significant review findings that need discussion

## Syntax

```
/claude-tweaks:flow <spec>[,spec2,spec3] [worktree | current-branch] [no-stories] [no-polish] [no-deepen] [auto | interactive | hybrid | confirm] [keep-going] [step1,step2,step3]
```

All bracketed tokens are optional and order-independent. `worktree` is the default git strategy when neither `worktree` nor `current-branch` is set. `keep-going` applies to multi-spec runs only. Design doc paths are rejected at Step 2.7 — run `/claude-tweaks:specify` first.

**Flow defaults to `auto` mode** (its purpose is hands-off automation). In `auto` the Pipeline Config Manifesto runs as a **read-only FYI** — it computes and displays the policy levers, then proceeds without an approval stop. Pass `confirm` to re-enable the Manifesto approval gate, `interactive` for per-skill in-flow prompts, or `hybrid` for floor-gated prompts. See the mode arguments below.

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<spec>` | Yes* | Spec number (e.g., `42`) or comma-separated spec numbers (e.g., `42,45,48`). **Design docs are not accepted** — run `/claude-tweaks:specify {design-doc}` first to decompose into specs. See Step 2.7. *Not required when `--from-recon` is set. |
| `--from-recon` | No | **Alternative spec source.** Alias for `--from-label recon` — pull open `recon`-labelled GitHub issues, turn each into a `/claude-tweaks:specify` brief, and run the derived specs through the multi-spec batch. Pair with `--min-severity <sev>` to filter. Needs the `gh` CLI (hard gate if absent). See `from-recon.md`. |
| `--from-label <label>` | No | **Alternative spec source.** Pull ALL open issues carrying `<label>` and run them as an issue-sourced batch (claim → brief → `/specify` → multi-spec). Form-shaped bodies (Current State / Deliverables / Acceptance Criteria) convert with zero translation; freeform bodies get an LLM translation surfaced at the Review Console. Needs `gh`. See `from-recon.md`. |
| `--from-issues <n,...>` | No | **Alternative spec source.** Pull specific open issues by number (comma-separated) regardless of labels, and run them as an issue-sourced batch. Same claim/translation behavior as `--from-label`. Needs `gh`. See `from-recon.md`. |
| `--min-severity <sev>` | No | **Issue-sourced batches only.** Filter pulled issues by the `recon:<sev>` label (`critical`/`high`/`medium`/`low`). Issues without a `recon:<sev>` label rank as `info` and are excluded by any higher floor. Default: no floor. |
| `worktree` | No | Use worktree git strategy — isolated workspace on a feature branch (this is the default for flow). See "Parallel Development with Worktrees" below. |
| `current-branch` | No | Override the default and commit directly on the current branch instead of creating a worktree. |
| `no-stories` | No | Skip automatic story generation even if UI files changed. By default, flow auto-generates stories when the build produces UI file changes. |
| `no-polish` | No | Skip the polish phase (and its re-verify gate) entirely. Overrides any explicit `polish` in the step list. Use when iterating fast on backend specs, when polish is not desired (one-off scripts, infrastructure-only changes), or when the user has already manually invoked Impeccable polish. The wrapper would skip polish anyway on non-frontend specs (detection layer 2); `no-polish` is the explicit user-facing escape hatch. |
| `no-deepen` | No | Skip the end-of-run **Depth Opportunities** survey. By default flow runs `/claude-tweaks:deepen`'s read-only analysis at the Pipeline Summary and surfaces shallow-module candidates as recommendations (it never refactors automatically — see Step 5). `no-deepen` skips the analysis entirely. Can also be defaulted off project-wide with `depth-survey: off` in CLAUDE.md under `## Auto-mode policy`. |
| `auto` | No | **Flow's default mode** — pipeline runs hands-off. The Config Manifesto (Step 3) renders as a read-only FYI and proceeds without an approval stop. Silences merge-check (Step 2.5), shape-check (Step 2.6), all path-selection prompts mid-pipeline, and explicitly forbids the model from inserting its own reality-checks or context-window concerns. Failures surface via the ledger and the failure card, never via mid-pipeline questions. **Full contract:** see `_shared/auto-mode-contract.md` — that file is the single source of truth for what `auto` silences AND what it does NOT silence (resolve gate, INBOX/DEFERRED writes, hard validation failures all remain mandatory). Passing `auto` explicitly is redundant (it is already the default) but harmless. Passed through to `/build`. |
| `confirm` | No | Stay in `auto` but **re-enable the Manifesto approval gate** at Step 3 (the `Approve all / Override / Cancel` block). Use when you want to inspect and tweak the policy levers before the pipeline runs hands-off. Everything after the Manifesto still runs as `auto`. |
| `interactive` | No | Opt out of auto entirely — skills present each decision in-flow as the standalone skills do. The Manifesto is skipped. Highest friction; use when you want a checkpoint at every decision. |
| `hybrid` | No | Manifesto approval gate runs, and downstream skills still prompt when a decision fails the reversibility/confidence/severity floors (see `_shared/auto-mode-contract.md`). Between full `auto` and `interactive`. |
| `keep-going` | No | **Multi-spec only.** Continue the run after a HARD-GATE failure in one spec — remaining specs still run, committing into the same shared worktree. Failed specs surface in the consolidated Review Console's "Not run / Failed" footer. Use when specs are genuinely independent (no `depends-on:` edges). The default is to stop on first failure because spec N+1 may build on spec N's correctness — `keep-going` inverts that safety, so it's opt-in. See `multi-spec.md`. |
| `[steps]` | No | Step argument(s). Single step = resume from that step onward. Comma-separated steps = run exactly those steps. Default (no steps): `build,test,review,polish,wrap-up` (re-verify is bundled with polish). |

Flow always uses **subagent** execution strategy — its purpose is hands-off automation. The `batched` option (which pauses for human review) is not available in flow; use `/claude-tweaks:build batched` directly instead.

### Input resolution

1. **Single spec number** (e.g., `42`) → **Spec mode** — build uses spec tracking, review checks spec compliance
2. **Multiple spec numbers** (e.g., `42,45,48`) → **Multi-spec mode** — runs each spec sequentially in one terminal (see Multi-Spec Sequential Flow below). For true parallel execution, use separate terminals with `worktree` mode.
3. **Topic name** (e.g., `meal planning`) → search `specs/` for a matching spec. If found, use spec mode. If only a design doc exists at `docs/superpowers/specs/*-design.md`, **stop and route to `/claude-tweaks:specify`** (see Step 2.7) — design docs are no longer executable directly by `/flow`.
4. **Design doc path** → **rejected** at Step 2.7 with a routing message to `/claude-tweaks:specify`. Design-mode flow was removed because it bypassed the granularity contract — design docs describe multi-phase programs, not agent-sized work units.
5. **`--from-recon` / `--from-label <label>` / `--from-issues <n,...>`** → **Issue-batch mode** — ignore any spec numbers; assemble the spec list by pulling the selected GitHub issues → claim each → `/specify` briefs → derived specs, then run the standard multi-spec batch. `--from-recon` is an alias for `--from-label recon`. See `from-recon.md` for the full procedure.

### Automatic story generation

After build completes, flow checks the build output for UI file changes (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`, or files in component/page directories). If UI files changed and `no-stories` was not specified:

1. Auto-detect the dev server URL using `dev-url-detection.md` in `skills/_shared/`
2. Run `/claude-tweaks:stories` with the detected URL. When journey files exist in `docs/journeys/` (created by `/build` Common Step 6), the stories step ingests them before browsing — the `journey:` field is set on derived stories, source files are inherited from the journey's `files:` frontmatter, and browsing is enrichment rather than fresh discovery for journey-documented pages.
3. Generated stories feed into `/claude-tweaks:test` (which validates them as part of the test step)

If no UI files changed, or `no-stories` is set, the stories step is skipped.

### Examples

```
/claude-tweaks:flow 42                                              → full pipeline in worktree (default = auto): build, test, review, polish, wrap-up; Manifesto shown as FYI, no approval stop
/claude-tweaks:flow 42 confirm                                      → same, but stop at the Manifesto approval gate first (inspect/override levers), then run auto
/claude-tweaks:flow 42 interactive                                  → opt out of auto — per-skill in-flow prompts, no Manifesto
/claude-tweaks:flow 42 current-branch                               → full pipeline on current branch (no isolation)
/claude-tweaks:flow 42 no-stories                                   → full pipeline in worktree (skip stories even if UI changed)
/claude-tweaks:flow 42 no-polish                                    → full pipeline without polish phase
/claude-tweaks:flow 42 no-deepen                                    → full pipeline, skip the end-of-run depth-opportunities survey
/claude-tweaks:flow 42,45,48                                        → multi-spec sequential, all specs in one shared worktree
/claude-tweaks:flow 42,45,48 keep-going                             → multi-spec, continue past HARD-GATE failures (independent specs only)
/claude-tweaks:flow meal planning                                   → resolve to spec by name (rejected if only design doc exists)
/claude-tweaks:flow docs/superpowers/specs/migration-design.md      → REJECTED — run /specify first; flow only accepts specs (auto does not silence this)
```

For resume-from-step and explicit-subset variants (`/flow 42 review`, `/flow 42 review,wrap-up`, etc.), see `steps-and-gates.md` ("Step Arguments" section) for the full enumeration.

## Allowed Steps, Step Arguments, and Gate Behavior

For the full Allowed Steps reference (which skills are pipeline-eligible), Step Arguments rules (resume vs explicit subset, auto-inserts, `no-polish` semantics), Gate Behavior table, and the canonical polish-phase decision tree, read `steps-and-gates.md` in this skill's directory.

### On Gate Failure

When a gate fails, the pipeline stops immediately and renders a failure card. Two card shapes exist (generic vs. "polish broke verification"); both templates and the picker live in `failure-cards.md` in this skill's directory. Load `failure-cards.md` only when a gate has actually failed — the success path uses Step 5's Pipeline Summary instead.

## Execution

### Step 1: Validate Input

1. Parse `$ARGUMENTS` — extract spec number(s) or topic name, detect `worktree`, `current-branch`, `no-stories`, `no-polish`, `no-deepen`, the mode keywords (`auto` / `interactive` / `hybrid` / `confirm`), plus optional step list. **Resolve the mode** in this order (first match wins):
   1. Explicit mode keyword in `$ARGUMENTS` — `interactive` / `hybrid` / `confirm` / `auto`. (`confirm` means "auto mode, but gate the Manifesto"; see Step 3.)
   2. CLAUDE.md `auto-mode:` setting — `default-off` → `interactive`; `default-on` → `auto`.
   3. **Intrinsic default → `auto`.** Flow's purpose is hands-off automation, so it runs auto unless a param or `auto-mode: default-off` lowers it.
2. Determine spec mode (number) or topic-resolution mode (name). A path argument is held until Step 2.7 (pre-flight) where it's checked against the design-doc rejection rule.
3. **Git strategy defaults to `worktree`** — same default as `/build`; flow never prompts. Resolution order:
   1. Explicit argument: `worktree` or `current-branch` in `$ARGUMENTS` — always wins
   2. CLAUDE.md `git-strategy` setting — project-level default (see `/claude-tweaks:build` default resolution)
   3. Fallback: `worktree`

   Do NOT prompt the user for git strategy — resolve it silently from the above. This is passed through to `/claude-tweaks:build` and controls isolation. Flow always uses `subagent` execution — no prompt needed for execution strategy.
4. Validate step list is in lifecycle order and apply the auto-inserts and override rules from `steps-and-gates.md` ("Step Arguments" section): auto-insert `test` before `review`, treat literal `re-verify` as a no-op, and drop `polish` when `no-polish` is set.
5. If spec mode: check prerequisites are met (same as `/claude-tweaks:build` Spec Step 1)
6. If a path was given in the argument: confirm it's a spec, not a design doc (Step 2.7 enforces). If a topic name was given: resolve to a spec; if only a design doc exists for that topic, stop and present the routing message.
7. If validation fails → **stop before starting**
8. **Create the open items ledger** using `/claude-tweaks:ledger`'s create operation. The `{feature}` name matches the execution plan that build will create. This file tracks findings and operational tasks across all pipeline phases. See `/claude-tweaks:ledger` for status lifecycle and phase taxonomy.

### Step 2: Pre-flight Checks

Four checks before pipeline starts. Each can return OK / WARNING / BLOCKED.
- 2.4 — Spec-committed check (target spec tracked + clean; hard-fail — a worktree from base won't contain an uncommitted spec). Worktree strategy only.
- 2.5 — Merge check (uncommitted changes, branch ahead/behind)
- 2.6 — Shape check (structural coupling, hard-fail on cross-task deps)
- 2.7 — Design-doc rejection (granularity contract — specs only, not design docs)

Any hard fail or rejection stops the pipeline before the Config Manifesto runs. Read `validation.md` in this skill's directory for the detailed procedure for each substep.

### Step 3: Pipeline Config Manifesto (front-loaded policy)

This is the bookend "begin stop" that locks in policy for the rest of the pipeline. Runs after pre-flight passes so policy levers are not collected if the pipeline would not have started. In every mode except `interactive`, it computes the levers (scope-creep, overlap, design-intent, leftover-default, auto-fix-threshold, review-severity-floor, tidy-aggressiveness) from the precedence chain and writes `config.yml` + initializes `decisions.md` in `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/`. What differs by mode is whether it **stops**:

| Mode | Manifesto behavior |
|------|-------------------|
| `auto` (default) | **Read-only FYI.** Render the computed levers as a `### Pipeline Config (auto)` table (value + source per lever), print `→ proceeding (no approval needed)`, and continue. No stop. |
| `confirm` | **Approval gate.** Present the `Approve all / Override / Cancel` block and wait. After approval, the rest of the pipeline runs as `auto`. |
| `hybrid` | Approval gate (same as `confirm`); downstream skills still prompt on floor failures. |
| `interactive` | Skipped — no Manifesto and no run directory; skills prompt each decision in-flow rather than reading `config.yml`. |

**This is the first bookend** of the pipeline (see `_shared/auto-mode-contract.md`). In default `auto` the begin-stop is informational only; the single user-facing stop is the Wrap-Up Review Console at the end. Regardless of mode, after this step no downstream skill re-asks the user about these levers — they read `config.yml` and apply.

For the complete Manifesto content (presentation template, recommendation defaults, source values, FYI vs approval-gate flow, path conventions), read `manifesto.md` in this skill's directory.

### Step 4: Run Pipeline

For each step in order:

1. **Announce** the step: `## Flow: Running {step} ({N}/{total})`
2. **Execute** the full skill as documented in its own SKILL.md
3. **Check the gate** — if the step fails its gate, stop the pipeline
4. **Pass context forward** — each step's output feeds into the next:
   - `build` → check output for UI file changes (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`, component/page directories). If UI changed and `no-stories` not set → auto-detect dev URL via `dev-url-detection.md` in `skills/_shared/` and run `stories` step.
   - `stories` → `test` receives the stories directory
   - `build` → `test` receives `VERIFICATION_PASSED=true` (so test skips redundant types/lint/tests — see `verification.md` in the `/claude-tweaks:test` skill). Test still runs QA if stories exist.
   - `test` → `review` receives `TEST_PASSED=true` and QA results. Flow invokes `/claude-tweaks:review` in **full** mode (code + visual review) by default. The review skill delegates visual review to `/claude-tweaks:visual-review`, which handles its own browser **and** dev-server resolution:
     - **Browser + reachable app:** `/visual-review` runs the full visual review. Dev URL resolution (`dev-url-detection.md`) applies worktree awareness (a port serving the *main* checkout is rejected) and, in auto + worktree (flow's default), **auto-starts an ephemeral dev server on a free port** so the browser reviews *this* worktree's code. QA data is consumed when available.
     - **No browser backend (`agent-browser` not installed):** `/visual-review` reports the detection failure with install instructions. Review falls back to code mode. Flow notes: "Visual review skipped — no browser backend available."
     - **No reachable app and no dev command to start one:** `/visual-review` logs the gap and falls back to code mode. Flow notes: "Visual review skipped — no dev server and no start command."
     - The ephemeral server (if started) stays up for the rest of the run and is torn down by `/wrap-up` cleanup (Section D) — or, in multi-spec runs, once at the end by `/flow`.
   - `review` → `polish` (when `no-polish` not set) — invoke `/claude-tweaks:design polish <spec>` via the Skill tool. See "Polish phase execution" below for the dispatch logic.
   - `polish` → `re-verify` (only when polish modified code) — invoke `/claude-tweaks:test skip-qa`. See "Re-verify execution" below.
   - `polish` (or `re-verify`) → `wrap-up` receives the review summary, polish results, and verdict. Skill observations (`build/skill` and `review/skill` ledger entries) carry forward via the ledger file for wrap-up's skill update analysis (Step 7).
5. **Ledger carries forward** — each step reads and appends to the open items ledger (see `/claude-tweaks:ledger` for all operations). Unlike conversation context (which may be compressed), the ledger is a file — it survives context window limits.

#### Polish + re-verify execution

Follow the polish-phase decision tree in `steps-and-gates.md`. Mechanics specific to /flow:

- Invoke `/claude-tweaks:design polish <spec>` via the Skill tool. Wrapper errors stop the pipeline with a "Polish wrapper error" failure card — do not assume partial-and-recoverable.
- Append a ledger entry per command invoked (phase: `design`, status: `fixed` for auto-fit successes, `observation` for reported issues). Ledger entries flow through to wrap-up's skill update analysis.
- When polish modified code, set the in-memory `re_verify_ran: true` marker and invoke `/claude-tweaks:test skip-qa`. The wrapper runs types + lint + tests, skips QA story validation (irrelevant after stylistic-only polish), but still runs the Design CLI gate (CLI is not QA).
- One-cycle cap: if the marker is already set, surface "re-verify cycle cap exceeded" and stop — defensive against the decision tree re-entering re-verify.

### Step 5: Present Pipeline Summary

**Nothing-left-behind gate:** Run the resolve gate from `/claude-tweaks:ledger`. If any item has status `open`, present it for resolution -- no item may remain `open`. The pipeline cannot complete with unresolved items.

**Creative Opportunities survey (v4.5.0).** Before rendering the summary, run decline detection (compares prior recommendations cache against the new diff to suppress repeatedly-declined items), then invoke `/claude-tweaks:design survey <changed-files>`. Returned recommendations render as a Creative Opportunities block (template below) before Next Actions; empty or `{skipped}` returns omit the block.

**Depth Opportunities survey.** Also before rendering the summary, run the depth survey — the responsible way a hands-off `/flow` captures `/claude-tweaks:deepen`'s value. After the pre-check passes (source modules changed, `no-deepen` not set), invoke `/claude-tweaks:deepen <changed-source-files>` with `$PIPELINE_RUN_DIR` set, which runs `/deepen`'s **analysis-only** path (module mapping + deletion test + leverage ranking — read-only). It returns ranked candidates **without applying or staging-to-apply any refactor**. Render the top candidates as a Depth Opportunities block (template below) before Next Actions; no candidates or a skipped pre-check omit the block. **`/flow` never runs the interactive interface-design step or modifies code for a depth candidate** — the block is a recommendation to run `/claude-tweaks:deepen` manually.

For both surveys' full procedures (wrapper/skill return handling, the depth pre-check and responsibility boundary) and the Creative Opportunities decline-detection algorithm, read `survey.md` in this skill's directory.

On successful completion of all steps:

```markdown
## Flow: Pipeline Complete

### Spec {number}: {title}

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

### Depth Opportunities

The depth survey analyzed the changed modules. These are shallow abstractions worth restructuring — `/flow` did **not** refactor them (architecture is low-reversibility; the depth refactor is a deliberate, interactive pass):

| Module | Kind | Why it's shallow | Leverage |
|--------|------|------------------|----------|
| `src/services/user.ts` | collapse | Pass-through wrapper — every method forwards one call to the DB | 4 callers simpler |
| `src/jobs/runner.ts` | deepen | Callers must call `init()`→`configure()`→`run()` in order; the module could own the sequence | smaller surface, 3 callers |

Run `/claude-tweaks:deepen <changed-paths>` to act on these — it presents candidates, then walks the interface design for the ones you pick. Flow never runs this automatically.

> Render this block only when the depth survey returned candidates. Cap at the top 3 by leverage; if more exist append `> N more lower-leverage candidates — run /claude-tweaks:deepen for the full list.` Omit the entire section when the survey found no shallow modules, the pre-check skipped it (no source modules changed), or `no-deepen` was set.

### Next Actions

1. `/claude-tweaks:flow {next spec}` — full pipeline on spec {N}: "{title}" **(Recommended)**
2. `/claude-tweaks:help` — full pipeline status
{If unblocked specs:}
3. `/claude-tweaks:build {N}` — spec {N} "{title}" now unblocked
{If the depth survey surfaced candidates:}
4. `/claude-tweaks:deepen {changed-paths}` — act on the {N} depth opportunit{y/ies} surfaced above
```

---

## Multi-Spec Sequential Flow

When multiple spec numbers are provided (e.g., `42,45,48`), flow runs each spec's pipeline **sequentially** in one terminal. Each spec completes its full pipeline (build → test → review → polish → wrap-up) before the next begins.

**Pre-flight enrichments (v4.6.4+):**
- **Dependency-aware ordering** — reads each spec's `depends-on:` frontmatter, builds a DAG, hard-fails on cycles, and offers (or auto-applies in `auto` mode) topological re-ordering when the user's order violates the graph.
- **Cross-spec conflict detection** — pre-flight scans each spec's `Files:` declarations; surfaces overlapping pairs as a footer line in the Pipeline Preview. Warning, not hard-fail.

**Failure handling:**
- **Default:** a HARD-GATE failure in one spec stops the remaining specs (compounding-risk safety).
- **`keep-going`:** opt-in flag that continues the run past HARD-GATE failures. Failed specs surface in the consolidated Review Console's "Not run / Failed" footer.
- **Shared worktree:** in `worktree` mode a sequential multi-spec run uses **one shared worktree for the whole run**, not one per spec. `/flow` creates it once up front (from the current local HEAD), runs every spec inside it (per-spec builds skip creation via `MULTISPEC_SHARED_WORKTREE=1`), and finishes the single branch once at the end. Per-spec worktrees apply only to separate-terminal parallel runs.

**Bookend architecture for multi-spec (v4.6.3+):** in `auto` or `hybrid` mode, per-spec Wrap-Up Review Consoles are **deferred** — `/flow` sets `MULTISPEC_REVIEW_DEFER=1` when invoking each spec's `/wrap-up`. After all specs complete (or `keep-going` finishes the run), `/flow` runs **one consolidated Review Console** that reads every per-spec `decisions.md` + `staged/` and surfaces all approvals in one batch. This preserves the bookend promise (Manifesto at start, one Review Console at end) regardless of N. See `multispec-review-console.md`.

For the full validation rules, dependency-ordering procedure, conflict-detection logic, `keep-going` semantics, run directory layout (per-spec sub-namespacing under one parent dir), environment variables passed to each per-spec invocation, and consolidated Multi-Spec Summary template, read `multi-spec.md` in this skill's directory.

---

## Parallel Development with Worktrees

For true parallel execution, run separate terminals with `worktree` mode — each terminal gets an isolated copy of the repository:

```
# Terminal 1                          # Terminal 2                          # Terminal 3
/claude-tweaks:flow 42 worktree      /claude-tweaks:flow 45 worktree      /claude-tweaks:flow 48 worktree
```

Each terminal creates its own worktree and feature branch. There is no file overlap risk because each worktree is a full, isolated copy.

For mode-selection guidance (worktree vs current-branch), the merge reconciliation procedure (merge order, conflict handling, conflict resolution prompt), and the post-merge summary template, read `worktree-merge.md` in this skill's directory.

---

## Next Actions

Next Actions in `/flow` are outcome-conditional and rendered as part of the Pipeline Summary (Step 5 success template) or Failure Card (see `failure-cards.md`). See `## Pipeline Summary template` above for the canonical numbered options on success; see `failure-cards.md` for the per-failure-shape Next Actions blocks. There is no standalone Next Actions block here — the rendered block fires inside the success or failure template that matches the pipeline outcome.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Stopping the pipeline because the spec is "big" | Size is not a coupling signal. A clean 50-task spec runs through fine. The shape gate (Step 2.6) blocks on **structural** signals (cross-task deps, scope leak), not size. Under `auto`, the model is forbidden from inserting size-driven reality-checks beyond Step 2.6 — see `_shared/auto-mode-contract.md`. |
| Inserting model-side reality-checks under `auto` | The user said `auto`. Concerns belong in the ledger or the failure card, not as blocking prompts. See `_shared/auto-mode-contract.md` for the full anti-list. |
| Ignoring gate failures and restarting | Gates exist to catch real problems — investigate before retrying |
| Running flow on specs with unmet prerequisites | The pipeline will fail at build — check dependencies first |
| Using flow for interactive skills | Capture, challenge, and specify need human decisions — they can't be automated |
| Using `batched` execution in flow | Flow's purpose is hands-off automation — batched pauses for human review, contradicting flow's no-stopping design. Use `/claude-tweaks:build batched` directly. |
| Ignoring open ledger items at pipeline end | The nothing-left-behind gate prevents dropped work — every item must be explicitly resolved |
| Treating `auto` as authorization to bulk-resolve the ledger | `auto` silences per the contract in `_shared/auto-mode-contract.md`. The resolve gate's Phase 2 is on the "What `auto` does NOT silence" list — every item requires explicit per-item user input |
| Writing to `specs/INBOX.md` or `specs/DEFERRED.md` from inside flow without explicit per-item user approval | Both files are valid destinations, but each entry requires the user's explicit choice on that specific item. Pipeline phases never write to either file autonomously, even when an item looks like an obvious candidate |
| Skipping test in the pipeline | Test is the mechanical gate — review depends on `TEST_PASSED`. Omitting test means review runs on potentially broken code. |
| Retrying polish after re-verify failure within the same flow run | The one-cycle cap exists to prevent oscillation (polish → fail → fix → polish → fail → ...). Surface the failure, let the user inspect, and require a fresh `/flow {spec} polish` to retry. |
| Treating polish skip as a flow failure | Polish skips are normal — non-frontend specs, no Impeccable, `no-polish` flag, no audit findings + no auto-fit changes needed all skip cleanly. The pipeline continues to wrap-up. |
| Running re-verify without `skip-qa` | Browser QA is irrelevant after stylistic-only polish — re-verify uses `/test skip-qa` to keep the cycle fast. The Design CLI gate still runs (it is not QA). |
| Using `no-polish` on a frontend spec by reflex | Polish is the value-add for frontend specs — only set `no-polish` when iterating fast or when the user has manually run Impeccable polish before flow. |
| Auto-running creative commands surfaced in the Creative Opportunities block | The block is recommendations only. Flow never executes Impeccable creative commands from survey output — the user invokes them manually if a suggestion resonates. |
| Applying (or staging-to-apply) a depth refactor inside flow | The depth survey is analysis-only. Architecture is low-reversibility and the depth refactor is interactive by design — flow surfaces candidates as recommendations and the user runs `/claude-tweaks:deepen` deliberately. Auto-refactoring module interfaces in a hands-off run is exactly the irresponsible move the survey boundary prevents. |
| Running the depth survey on a config-only or docs-only diff | The pre-check exists to keep cost proportionate — skip the survey when no source modules changed. Burning tokens reading call sites on a trivial diff is waste. |
| Rendering the Depth Opportunities block when the survey found nothing | An empty result means the abstractions are earning their keep, not that analysis was skipped — omit the block rather than implying there was nothing to analyze. |
| Rendering the Creative Opportunities block when survey returned empty or skipped | Survey is heuristic. An empty result means "nothing matched the criteria," not "design is complete." Rendering an empty block falsely implies completeness. Omit the block entirely. |
| Skipping decline detection on re-runs of the same spec | The declined-recommendations cache is what keeps the Creative Opportunities block from becoming noise across iterations. Read the prior recommendations cache, compare against the new diff, increment declines for un-invoked recommendations before invoking survey. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | First step in the default pipeline — runs in spec mode (flow only passes specs since v4.5.2; design-mode bypass was removed). Sets `VERIFICATION_PASSED=true`. |
| `/claude-tweaks:stories` | Auto-triggered between build and test when UI files change (unless `no-stories`). Ingests journey files from `/build` for journey-aware story generation. Both skills consume `dev-url-detection.md` from `skills/_shared/` for URL resolution. |
| `/claude-tweaks:test` | Mechanical gate between build/stories and review — types, lint, tests, QA. Receives `VERIFICATION_PASSED` from build (skips redundant checks). Sets `TEST_PASSED=true`. |
| `/claude-tweaks:review` | Analytical gate — receives `TEST_PASSED=true` from test, produces verdict. Runs in **full** mode (code + visual) by default; delegates visual review to `/visual-review` which handles its own browser detection. Code mode fallback when no browser available. Never runs verification or QA itself. |
| `/claude-tweaks:visual-review` | Invoked transitively by /review in full mode. Handles browser detection, dev URL resolution, and the full visual review procedure. |
| `/claude-tweaks:wrap-up` | Final step — receives review output, produces clean slate |
| `/claude-tweaks:deepen` | Invoked BY /flow at the Pipeline Summary (Step 5) in analysis-only mode — runs the read-only depth analysis and surfaces shallow-module candidates as a Depth Opportunities recommendation block. /flow never applies a depth refactor (low-reversibility + interactive); the user runs /deepen manually. Skipped by `no-deepen` or when no source modules changed. |
| `/claude-tweaks:help` | Shows pipeline status and recommends flow-ready specs |
| `/claude-tweaks:specify` | Creates the specs that flow consumes |
| `/claude-tweaks:browse` | Used transitively — /stories and /review visual modes use /browse for browser interaction |
| `/superpowers:brainstorming` | Produces design docs that `/claude-tweaks:specify` decomposes into the specs flow consumes. Flow no longer accepts design docs directly — the granularity contract requires `/specify` between brainstorming and execution. |
| `/superpowers:using-git-worktrees` | Invoked BY flow (when `worktree` specified) to create the isolated workspace — once per single-spec run, or once per sequential multi-spec run (one shared worktree for all specs) |
| `/superpowers:finishing-a-development-branch` | Invoked BY flow (when `worktree` specified) at handoff to merge, PR, or discard the feature branch — once at the end of the run (a sequential multi-spec run finishes its single shared branch once, not per spec) |
| `/claude-tweaks:ledger` | Manages the open items ledger. /flow creates the ledger (Step 1), carries it across phases, and runs the resolve gate (Step 5). |
| `/claude-tweaks:design` | /flow invokes `/claude-tweaks:design polish <spec>` after review verdict PASS (auto-fit + issue-driven + intent-driven dispatch — v4.5.0). The wrapper handles its own detection (non-frontend skips); when polish modifies code, /flow follows up with `/test skip-qa` (re-verify gate, one-cycle cap). The `no-polish` argument removes the polish phase entirely. /flow's pipeline summary also invokes `/claude-tweaks:design survey <full-diff>` to render the Creative Opportunities block (anchor 3 of v4.5.0's creative surfacing system); /flow handles decline detection by comparing the prior recommendations cache against the new diff before each survey call. |
| `/claude-tweaks:journeys` | /journeys produces journey files that /flow's auto-stories step (post-build) ingests so derived stories carry `journey:` field and inherited source files. |
| `/claude-tweaks:recon` | `/flow --from-recon` pulls the `recon`-labelled GitHub issues `/recon` files, derives specs via `/specify`, and runs them as a multi-spec batch. `/flow` consumes recon's output; it never files or closes recon issues (filing is recon's job; closing is a user action at the Review Console). See `from-recon.md`. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling in /flow. Governs the bookend architecture (Step 3 Manifesto = begin stop, /wrap-up Review Console = end stop), what `auto` silences, and what it never silences. |
| `_shared/pipeline-run-dir.md` | /flow creates the pipeline run directory at Step 3 (Manifesto) and exports `PIPELINE_RUN_DIR` to every downstream skill per this shared procedure. Multi-spec runs use the per-spec subdirectory layout documented in `multi-spec.md`, also rooted in this contract. |
| `_shared/issue-claims.md` | `--from-recon` Step 2.5 claims each pulled issue (`refs/claims/issue-{issue}`) before spec derivation; the console releases declined briefs; failure cards offer release on abandon. |
