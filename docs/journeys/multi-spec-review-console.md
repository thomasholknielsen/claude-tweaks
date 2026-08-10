---
files:
  - skills/flow/multispec-review-console.md
  - skills/wrap-up/cleanup-procedures.md
  - bin/wrap-up-engine.js
---

# Review and Approve a Multi-Spec /flow Run

**Persona:** claude-tweaks user who ran `/claude-tweaks:flow "#157,#159,#160"` (or similar, `auto`/`hybrid` mode) across several linked GitHub issues and now needs to review everything the pipeline auto-resolved or staged before it merges/finishes the shared branch.
**Goal:** Work through one consolidated batch table covering every spec in the run, make the terminal approve/override/stop decision, and resolve every per-item queue-write/memory/upstream-feedback proposal — with confidence that nothing any spec's pipeline decided was silently dropped from view.
**Entry point:** The last spec in the run reaches `/wrap-up`'s Phase 4 execution step (each spec's own per-spec Review Console was deferred via `MULTISPEC_REVIEW_DEFER=1`), triggering `/flow`'s consolidated Multi-Spec Review Console.
**Success state:** The batch decision is made (approved, or specific items overridden), every `Q#`/`M#`/`U#` per-item prompt has an explicit answer, the shared branch reaches an outcome (merged / PR / discarded), and the parent run directory is archived.

## Steps

### 1. Read the consolidated batch tables — terminal
- **URL:** rendered automatically by `/flow` after the final spec's wrap-up; no command to run.
- **Action:** Read through the named batch sections in order — Auto-applied, Pending review, Low-confidence findings (if any spec's `/review` surfaced an unreproduced finding), Contested findings (if any spec had a cross-lens debate that didn't converge), then the five engine-fed sections (Skill/Documentation/Journey/Configuration updates, Reference repairs — inserted verbatim from `wrap-up-engine.js render --spec-state`), then Cleanup actions, Issue closures, and Translated briefs.
- **Should feel:** Like reading one coherent report, not five specs' worth of disconnected logs stitched together — every row is `Spec`-tagged so it's traceable back to its origin without losing the batch view.
- **Should understand:** A row's number is part of one global sequence spanning every batch section (no restart between sections) — the numbers in the next step's override instructions refer to this sequence, not a per-section one.
- **Red flags:** A row missing its `Spec` column; a section present in some spec's `decisions.md`/`staged/` but absent from the rendered table (the console's own Hard requirement forbids silently dropping any item); the five engine-fed sections showing a different table shape than a plain `| # | Spec | Target | Change | Disposition |` (that would mean the engine's output was hand-expanded instead of inserted verbatim).

### 2. Check the Cleanup actions rows before approving — terminal
- **URL:** the "Cleanup actions" section of the same rendered console.
- **Action:** Look at the numbered rows — one dev-server-teardown row and one branch-finish row with no `Spec` value, plus three rows per spec (claim release, grant removal, label cleanup) with a populated `Spec` value.
- **Should feel:** In control of teardown, not just informed about it after the fact — these rows used to execute unconditionally as soon as the batch was approved; now they're visible and can be individually skipped in the next step.
- **Should understand:** The three per-spec rows depend on the branch-finish row completing first (claim release needs branch-finish's outcome — the merge commit sha or PR URL — to release each issue correctly); the dev-server-teardown row has no such dependency and can be skipped on its own.
- **Red flags:** A per-spec claim-release row with no visible branch-finish row above it in the same batch (the dependency would be invisible); the section missing entirely when a worktree strategy was used (it should always render for a multi-spec worktree run).

### 3. Answer the terminal batch decision — `AskUserQuestion`
- **URL:** the "How do you want to handle the Multi-Spec Review Console items?" prompt.
- **Action:** Choose Approve all, Override specific items (reply with `#`s to skip/modify/revert in the next message — free-text, not the tool's `Other` field), or Stop and re-engage.
- **Should feel:** Like one decision, not five — the whole point of consolidating is that a multi-spec run doesn't interrupt once per spec.
- **Should understand:** If the branch-finish row is skipped or reverted under Override, every per-spec claim-release/grant-removal/label-cleanup row auto-skips too (rendered "skipped — depends on branch-finish") rather than running against an outcome that never happened.
- **Red flags:** Being asked to approve or override Queue writes, Memory updates, or Upstream feedback as part of this same decision — those are always separate, per-item prompts (see Step 4), never folded into "Approve all".

### 4. Resolve per-item Queue writes / Memory updates / Upstream feedback — `AskUserQuestion`, one call per item
- **URL:** one `AskUserQuestion` per `Q#`, `M#`, or `U#` row, issued individually.
- **Action:** For each, choose Apply, Skip, or Edit — read the full staged content shown below its row before deciding, since these create a new backlog work record, write a cross-project memory file, or file an issue against an upstream repo respectively.
- **Should feel:** Deliberate, never rushed into a bulk "yes to all" — each of these writes something that outlives this pipeline run.
- **Should understand:** A memory write here degrades or improves every future session in every project; an upstream filing publishes privately-derived content to a public repo (already scrubbed, but still worth a real read before Apply).
- **Red flags:** Two `Q#`/`M#`/`U#` items ever being batched into one `AskUserQuestion` call — the pipeline's own contract forbids this regardless of how many are pending.

## Origin
- Created during build of #287 ("Multi-spec console: engine-fed sections + prose parity") — the console existed before this build but had no journey coverage; #287 gave it its first Low-confidence findings/Contested findings sections and made Cleanup actions visible/overridable, both of which this journey documents as current behavior.
- Related specs: #286 (Engine: multi-spec console section merging — the CLI call Step 1 references), #287
