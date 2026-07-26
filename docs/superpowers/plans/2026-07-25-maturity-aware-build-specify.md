# Maturity-Aware Build & Specify Discipline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make project maturity (greenfield / pre-launch / early-production / established) a durable, machine-readable fact in `.claude-tweaks/policy.yml` instead of CLAUDE.md prose only, and have `/claude-tweaks:build` and `/claude-tweaks:specify` read it to scale two behaviors the research shows should differ by project stage: test discipline on pre-existing-behavior changes, and decomposition shape when a design doc proposes replacing something that already ships.

**Architecture:** `/claude-tweaks:init` Phase 3 writes `project.maturity` to `.claude-tweaks/policy.yml` the moment classification is confirmed. Update Mode's existing contract-drift mechanism gains a value-comparison check (not a presence/absence marker, so it follows the Work-Record Backend Drift pattern rather than the marker table). `/build`'s Common Step 2 folds a maturity-scaled test-discipline sentence into the dispatch instruction it already builds from the `effort:` field. `/specify`'s Step 2 gains one conditional heuristic, checked ahead of its existing five, that decomposes along a strangler-fig boundary instead of the standard layer split when maturity and a rewrite-signal both match.

**Tech Stack:** Markdown skill-file changes only (prose procedure) — no code changes. `.claude-tweaks/policy.yml` gains one new hand-editable, dotted-namespace key (`project.maturity`), read directly by skill prose the same way `execution.always` already is — no code reads or validates it.

## Global Constraints

- Full design doc, approved and committed: `docs/superpowers/specs/2026-07-25-maturity-aware-build-specify-design.md` — read it before starting; every task below implements a specific section of it.
- **Key naming refinement:** the design doc's illustrative YAML snippet shows a bare `maturity:` key. `.claude-tweaks/policy.yml`'s established convention is dotted namespaced keys (`worktree.always`, `execution.always`, `harness-health.scoped-rule-budget`, `issues.autonomous-eligibility` — see `bin/lib/policy.js`'s header comment: "the only supported shape is a top-level `key.path: value` line"). This plan uses **`project.maturity`** throughout instead, for consistency with that convention. Same architecture as the design doc — just the precise key name.
- Missing `project.maturity` key (a project that ran `/init` before this change) → **fail-open**, treated identically to `greenfield`/`pre-launch`. Neither new `/build` nor `/specify` behavior fires. Never an error, never a block.
- Ambiguity resolves toward **more** scrutiny in `/build` (uncertain "does this touch pre-existing behavior" → still write the test) and toward the **standard** heuristics in `/specify` (an ambiguous rewrite-signal match → falls through to the standard five-heuristic decomposition, not a forced strangler-fig shape onto something that may not need it). Asymmetric on purpose — see the design doc's Error Handling section.
- **Confirmed out of scope** (design doc's Non-Goals — do not add any of these): a new `_shared/` module for the gating logic; new file-existence/lexical-verb detection heuristics beyond the text-level rewrite-signal scan; path-scoped maturity; a `decisions.md` audit-log entry when either new behavior fires; a verification tie-in (e.g. Architecture Alignment Check confirming a characterization test was actually written); any change to `init/claude-md-template.md`'s Universal principles; any maturity-awareness added to `/challenge`, `/review`, or `/deepen`.
- These are prose/skill-file changes, not code — there is no automated test cycle. Each task ends with a **self-review step**: hand-trace the design doc's worked scenarios against the literal edited text, not a paraphrase of it, then fix any drift inline before committing.
- Commit message style: `{Verb} {what} — {detail}` (imperative, no conventional-commit prefixes). This work has no associated GitHub record yet — do not invent a `refs #N` placeholder in commit messages.
- Working Directory Discipline applies to every commit below: confirm `pwd` and `git rev-parse --show-toplevel` resolve to your worktree before committing.
- **Task order matters:** Task 1 must land before Tasks 2, 3, and 4 — all three reference the `project.maturity` key and its `.claude-tweaks/policy.yml` location that Task 1 introduces, and Task 2 additionally reads the Phase 1u inventory line Task 1's write makes possible to compare against. Tasks 3 and 4 have no dependency on each other or on Task 2 — they could run in either order, or in parallel, once Task 1 lands.

---

### Task 1: Write `project.maturity` at `/init` Phase 3 confirmation

**Files:**
- Modify: `skills/init/phase-3-classification.md`
- Modify: `skills/init/SKILL.md`

**Interfaces:**
- Consumes: nothing new — Phase 3's existing classification confirmation gate already computes and confirms the maturity value (`greenfield` / `pre-launch` / `early-production` / `established`).
- Produces: `project.maturity: {value}` written to `.claude-tweaks/policy.yml` the moment classification is confirmed (both the auto-confirm path and the interactive confirmation-gate path) — consumed by Task 2 (drift detection), Task 3 (`/build`), and Task 4 (`/specify`).

- [ ] **Step 1: Add the policy.yml write to the Auto-mode (confidence-gated) path**

Find in `skills/init/phase-3-classification.md`:

```markdown
When `auto` mode is set AND both dimensions classify with confidence `high` AND signals are internally consistent:

1. Auto-confirm the detected classification
2. Log to the active pipeline's `decisions.md` using the resolution order in `_shared/pipeline-run-dir.md`. `/init` is on the standalone-auto allowlist — if `PIPELINE_RUN_DIR` is unset and no recent run matches, create a standalone run dir at `.claude-tweaks/pipelines/{ISO-timestamp}-init-standalone/` and append the entry there. Never suppress the audit-log write.
   ```
   AUTO {time} — Phase 3: classification auto-confirmed. Maturity: {value} (confidence: high). Doc tier: {value} (confidence: high). Proceed to Phase 4.
   ```
3. Print a one-line summary (not a prompt): "Classified as {maturity}, doc tier {N}. Proceeding."
4. Skip to Phase 4
```

Replace with:

```markdown
When `auto` mode is set AND both dimensions classify with confidence `high` AND signals are internally consistent:

1. Auto-confirm the detected classification
2. Log to the active pipeline's `decisions.md` using the resolution order in `_shared/pipeline-run-dir.md`. `/init` is on the standalone-auto allowlist — if `PIPELINE_RUN_DIR` is unset and no recent run matches, create a standalone run dir at `.claude-tweaks/pipelines/{ISO-timestamp}-init-standalone/` and append the entry there. Never suppress the audit-log write.
   ```
   AUTO {time} — Phase 3: classification auto-confirmed. Maturity: {value} (confidence: high). Doc tier: {value} (confidence: high). Proceed to Phase 4.
   ```
3. Print a one-line summary (not a prompt): "Classified as {maturity}, doc tier {N}. Proceeding."
4. Write the confirmed maturity to `.claude-tweaks/policy.yml` — see "Writing project.maturity to policy.yml" below.
5. Skip to Phase 4
```

- [ ] **Step 2: Add the policy.yml write to the interactive confirmation-gate path, and add the new section describing the write mechanics**

Find in `skills/init/phase-3-classification.md`:

```markdown
Wait for confirmation. The user may know things the code doesn't reveal (e.g., "this is 6 months old but we haven't launched yet — treat it as pre-launch"). Carry the confirmed maturity and doc tier forward to Phase 5 (CLAUDE.md Philosophy) and Phase 8.5 (Doc Registry).
```

Replace with:

```markdown
Wait for confirmation. The user may know things the code doesn't reveal (e.g., "this is 6 months old but we haven't launched yet — treat it as pre-launch"). Carry the confirmed maturity and doc tier forward to Phase 5 (CLAUDE.md Philosophy) and Phase 8.5 (Doc Registry). Also write the confirmed maturity to `.claude-tweaks/policy.yml` — see "Writing project.maturity to policy.yml" below.

## Writing project.maturity to policy.yml

Once classification is confirmed (either the auto-confirm path above or the interactive gate), write it as a durable config value — `project.maturity` is a project fact other skills (`/claude-tweaks:build`, `/claude-tweaks:specify`) read directly, not just Phase 5 Philosophy-prose input. Unlike `worktree.always` (see `SKILL.md`'s "Finalizing the worktree.always Decision"), this write has no self-lock risk — turning it on mid-run can't deny this same run's own remaining writes the way enabling worktree enforcement can — so it happens immediately here rather than being deferred to Phase 9.

Create `.claude-tweaks/` if it doesn't exist. Read `.claude-tweaks/policy.yml` if present; if it has an existing `project.maturity:` line, replace that line, otherwise append a new `project.maturity: {value}` line (create the file with just that line if it didn't exist). Preserve every other line in the file untouched.

```yaml
project.maturity: established   # greenfield | pre-launch | early-production | established
```
```

- [ ] **Step 3: Extend the Classification row in `/init`'s Phase 9 Actions Performed table**

Find in `skills/init/SKILL.md`:

```markdown
| Classification | Confirmed maturity `{value}`, doc tier `{N}` | Phase 3 |
```

Replace with:

```markdown
| Classification | Confirmed maturity `{value}` (written to `.claude-tweaks/policy.yml` as `project.maturity`), doc tier `{N}` | Phase 3 |
```

- [ ] **Step 4: Extend the `/claude-tweaks:build` row and add a new `/claude-tweaks:specify` row in `/init`'s Relationship to Other Skills table**

Find in `skills/init/SKILL.md`:

```markdown
| `/claude-tweaks:build` | /init creates `docs/REGISTRY.md` (Phase 8.5) that /build consumes in Step 6.5 for documentation sync |
```

Replace with:

```markdown
| `/claude-tweaks:build` | /init creates `docs/REGISTRY.md` (Phase 8.5) that /build consumes in Step 6.5 for documentation sync. Phase 3 also writes `project.maturity` to `.claude-tweaks/policy.yml`, which Common Step 2 reads to scale its test-discipline instruction on early-production/established projects. |
| `/claude-tweaks:specify` | Phase 3 writes `project.maturity` to `.claude-tweaks/policy.yml`; Step 2 reads it to bias decomposition toward strangler-fig-shaped leaves on early-production/established projects when a design doc proposes replacing an existing subsystem. |
```

- [ ] **Step 5: Self-review against the design doc**

Prose deliverable, no test cycle. Re-read the design doc's "The `maturity` config key" section and hand-trace these scenarios against the literal text just written (not a paraphrase of it):

1. A high-confidence, internally-consistent Initial Mode run classifies a project `established` under `auto` mode → Auto-mode path step 4 writes `project.maturity: established` to `.claude-tweaks/policy.yml` before Phase 4 runs.
2. A low-confidence or contradictory-signal run → falls to the interactive confirmation gate → user confirms `early-production` → the gate's write happens right after "Carry the confirmed maturity..." — confirm the new sentence and the "Writing project.maturity to policy.yml" section are both present and in the right place.
3. A project with no existing `.claude-tweaks/policy.yml` at all → the write section's "create the file with just that line if it didn't exist" case applies — confirm the literal text says this, not just "append a line" (which would fail on a missing file).
4. A project with an existing `policy.yml` containing `worktree.always: true` and no `project.maturity` line yet → the write must preserve `worktree.always: true` untouched while adding `project.maturity` — confirm the literal text says "Preserve every other line in the file untouched."

Also confirm:
- No `TBD`/`TODO`/placeholder text anywhere in the edited sections.
- The Actions Performed table row and the Relationship table rows read grammatically in context (check the surrounding rows weren't accidentally duplicated or misaligned).

Fix any drift found inline.

- [ ] **Step 6: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add skills/init/phase-3-classification.md skills/init/SKILL.md
git commit -m "Write project.maturity to policy.yml at /init Phase 3 confirmation

Maturity (greenfield/pre-launch/early-production/established) becomes
a durable, machine-readable policy.yml value instead of only feeding
CLAUDE.md Philosophy prose. Written immediately on confirmation (no
self-lock risk, unlike worktree.always's deferred write). Consumed by
Update Mode drift detection (Task 2), /build (Task 3), and /specify
(Task 4)."
```

---

### Task 2: Maturity Drift detection in Update Mode

**Files:**
- Modify: `skills/init/update-mode.md`

**Interfaces:**
- Consumes: `project.maturity` as written by Task 1.
- Produces: a Phase 1u inventory line recording the stored value, and a "Maturity Drift" check (following the existing Work-Record Backend Drift pattern) that surfaces a patch offer in Phase 3's Drift Report whenever a full reconnaissance pass re-detects a different value.

- [ ] **Step 1: Add the stored-maturity read to the Phase 1u inventory template**

Find in `skills/init/update-mode.md`:

```markdown
```markdown
## Existing Configuration Inventory

### CLAUDE.md
- Lines: {count}
- Stack table: {lists these technologies}
- Commands: {lists these scripts}
- Conventions: {count} bullets
- Don'ts: {count} items
- Contract markers: {pipeline-section | auto-mode-flag | bookend | auto-mode-policy | run-dir} — {present/missing for each}
- Last meaningful edit: {git log for CLAUDE.md — when, what changed}
```
```

Replace with:

```markdown
```markdown
## Existing Configuration Inventory

### CLAUDE.md
- Lines: {count}
- Stack table: {lists these technologies}
- Commands: {lists these scripts}
- Conventions: {count} bullets
- Don'ts: {count} items
- Contract markers: {pipeline-section | auto-mode-flag | bookend | auto-mode-policy | run-dir} — {present/missing for each}
- Last meaningful edit: {git log for CLAUDE.md — when, what changed}

### policy.yml
- `project.maturity`: {value, or "not set" if the key is absent}
```
```

- [ ] **Step 2: Add the Maturity Drift subsection after Work-Record Backend Drift**

Find in `skills/init/update-mode.md`:

```markdown
`work-backend: local-files` needs no probe on any of these rows — its
`work-types: labels` / `work-links: body-text` fallback is unconditional, the same
as bootstrap Step 15b.

## Phase 1u.6: Update Mode Early-Exit Gate
```

Replace with:

```markdown
`work-backend: local-files` needs no probe on any of these rows — its
`work-types: labels` / `work-links: body-text` fallback is unconditional, the same
as bootstrap Step 15b.

### Maturity Drift

Like the Work-Record Backend Drift check above, maturity drift isn't a row in the
Phase 1u.5 marker table — that table checks for presence/absence of contract
markers, while this checks whether a *value* has changed. Unlike every other
drift check in this file, it can only be detected as part of a full
reconnaissance pass, never the early-exit fast path (Phase 1u.6): re-detecting
maturity requires re-running Phase 2h, and Phase 1u.6's own early-exit decision
is made *before* Phase 2 ever runs. This entry therefore never contributes to
Phase 1u.6's preliminary drift count — it surfaces only in Phase 3's Drift
Report, once a full pass is already underway.

| Signal | Detection | Offer (staged) |
|---|---|---|
| A full pass's freshly re-confirmed maturity classification (Phase 3) differs from the `project.maturity` value already stored in `.claude-tweaks/policy.yml` | Compare Phase 3's newly confirmed classification against the stored `policy.yml` value read into the inventory at Phase 1u | Offer to update `policy.yml`'s `project.maturity` line to the newly confirmed value — routed through the same Drift Report batch-approval as every other Contract Drift entry, never a silent write |

## Phase 1u.6: Update Mode Early-Exit Gate
```

- [ ] **Step 3: Self-review against the design doc**

Prose deliverable, no test cycle. Re-read the design doc's "The `maturity` config key" section (specifically the Update Mode paragraph) and hand-trace this scenario against the literal edited text:

1. A project stored `project.maturity: early-production` at its last `/init` run. It has since gone through 8 more months of development, gaining published API versioning and multiple environments. A later `/init update --full` run reaches Phase 2h, re-detects `established`, and Phase 3 confirms it. Confirm the literal text you just wrote causes this to surface as an offered patch in the Drift Report, not a silent overwrite, and confirm it correctly does NOT claim to affect Phase 1u.6's early-exit gate (since that gate runs before Phase 2h ever executes in this scenario).

Also confirm:
- The new `### policy.yml` inventory subsection sits correctly nested under `## Existing Configuration Inventory`, at the same heading level as `### CLAUDE.md`.
- No `TBD`/`TODO`/placeholder text.

Fix any drift found inline.

- [ ] **Step 4: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add skills/init/update-mode.md
git commit -m "Add Maturity Drift detection to /init Update Mode

Follows the existing Work-Record Backend Drift pattern (a value
comparison, not a marker-presence row) since it needs a full
reconnaissance pass to re-run Phase 2h — never contributes to Phase
1u.6's early-exit gate, only Phase 3's Drift Report once a full pass
is already underway."
```

---

### Task 3: `/build` Common Step 2 — maturity-scaled test-discipline instruction

**Files:**
- Modify: `skills/build/SKILL.md`

**Interfaces:**
- Consumes: `project.maturity` from `.claude-tweaks/policy.yml` (Task 1).
- Produces: one additional sentence folded into the same dispatch instruction Common Step 2 already builds from the `effort:` field, for both `subagent` and `batched` execution strategies.

- [ ] **Step 1: Insert the maturity-scaled instruction after the batched-strategy paragraph**

Find in `skills/build/SKILL.md`:

```markdown
**batched**: Invoke `/superpowers:executing-plans`. After the last batch completes, **stop the skill and return here** — do not let it invoke `/superpowers:finishing-a-development-branch`. `/build` handles post-execution steps before any branch finishing.

#### Superpowers Failure Handling
```

Replace with:

```markdown
**batched**: Invoke `/superpowers:executing-plans`. After the last batch completes, **stop the skill and return here** — do not let it invoke `/superpowers:finishing-a-development-branch`. `/build` handles post-execution steps before any branch finishing.

**Maturity-scaled test discipline (both strategies, all modes):** read `project.maturity` from `.claude-tweaks/policy.yml` once per build (missing key → treat as `greenfield`, add nothing). Fold one additional instruction into whichever execution skill was invoked above:

| Maturity | Added instruction |
|---|---|
| `greenfield` / `pre-launch` (or missing) | None |
| `early-production` | "For any task modifying pre-existing behavior, write a quick smoke test capturing current behavior before changing it." |
| `established` | "For any task modifying pre-existing behavior, write a full characterization test covering edge cases before changing it — published or external consumers may depend on them." |

"Pre-existing behavior" is judged by the implementer subagent itself, per task, using the same judgment it already applies deciding what to test under normal TDD — this does not introduce new mechanical file-existence or lexical-verb detection to make that call for it.

#### Superpowers Failure Handling
```

- [ ] **Step 2: Extend the `/claude-tweaks:init` row in `/build`'s Relationship to Other Skills table**

Find in `skills/build/SKILL.md`:

```markdown
| `/claude-tweaks:init` | /init creates `docs/REGISTRY.md` (Phase 8.5) that /build consumes in Step 6.5 for documentation sync |
```

Replace with:

```markdown
| `/claude-tweaks:init` | /init creates `docs/REGISTRY.md` (Phase 8.5) that /build consumes in Step 6.5 for documentation sync. Phase 3 also writes `project.maturity` to `.claude-tweaks/policy.yml`, which Common Step 2 reads to scale its test-discipline instruction on early-production/established projects. |
```

- [ ] **Step 3: Self-review against the design doc**

Prose deliverable, no test cycle. Re-read the design doc's "`/build` Common Step 2" section and hand-trace these scenarios against the literal edited text:

1. Established project, a leaf record fixing a bug in an existing, two-year-old `getOrders()` function, `subagent` execution strategy → the dispatch instruction to `/superpowers:subagent-driven-development` includes the full-characterization-test sentence.
2. Same leaf record, but the project is greenfield → no addition to the dispatch instruction.
3. Early-production project, `batched` execution strategy → the smoke-test sentence is folded into the instruction passed to `/superpowers:executing-plans`, not just the `subagent` branch — confirm the literal text places this paragraph after both strategy bullets, not nested inside only the `**subagent**` one.
4. Project with no `project.maturity` key in `policy.yml` → fails open, identical to greenfield — no addition.

Also confirm:
- No `TBD`/`TODO`/placeholder text.
- The new paragraph doesn't duplicate or contradict the existing `effort:`/`tier=` model-tier override paragraph above it — they're two independent additions to the same dispatch instruction, not competing mechanisms.

Fix any drift found inline.

- [ ] **Step 4: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add skills/build/SKILL.md
git commit -m "Scale /build's task-dispatch instruction by project maturity

Reads project.maturity from policy.yml once per build; established
and early-production projects get a characterization/smoke-test
instruction folded into whichever execution skill runs, for any task
touching pre-existing behavior. Greenfield/pre-launch unchanged.
Applies to both subagent and batched execution strategies."
```

---

### Task 4: `/specify` Step 2 — maturity-scaled decomposition heuristic

**Files:**
- Modify: `skills/specify/SKILL.md`

**Interfaces:**
- Consumes: `project.maturity` from `.claude-tweaks/policy.yml` (Task 1); Step 1's existing Landscape scan (file references, existing codebase state).
- Produces: a conditional strangler-fig decomposition path, checked before the existing five layer-based heuristics.

- [ ] **Step 1: Insert the rewrite-signal check ahead of the existing five heuristics**

Find in `skills/specify/SKILL.md`:

```markdown
### Decomposition Heuristics

Split along these natural boundaries (in priority order):

1. **Data layer** — database schema, migrations, data access methods
2. **API / business logic** — endpoints, services, validation
3. **UI / presentation** — components, pages, forms
4. **Infrastructure** — deployment, CI/CD, configuration
5. **Cross-cutting** — feature flags, permissions, monitoring
```

Replace with:

```markdown
### Decomposition Heuristics

**Check first — rewrite-signal against an existing subsystem.** Read `project.maturity` from `.claude-tweaks/policy.yml` (missing key → treat as `greenfield`, skip this check entirely). When `early-production` or `established`, scan the design doc's Deliverables/Overview for rewrite-shaped language ("replace," "rewrite," "rebuild," "migrate off," "delete and rebuild") naming a target that Step 1's Landscape scan confirms already exists in the codebase with at least one reference from outside the file itself — not something this same design doc introduces fresh. When matched, decompose along a strangler-fig boundary instead of the standard five below:

| Maturity | Decomposition shape |
|---|---|
| `early-production` | Two leaves — implement the new path behind a flag, then a second leaf removing the old path once the flag is validated |
| `established` | Three leaves — parallel implementation, cutover, decommission, sequenced so the old path keeps working until cutover is verified |

An ambiguous match (rewrite language present, but Landscape scan can't confirm outside usage of the named target) falls through to the standard five heuristics below rather than forcing a strangler-fig shape onto something that may not need it.

Otherwise, split along these natural boundaries (in priority order):

1. **Data layer** — database schema, migrations, data access methods
2. **API / business logic** — endpoints, services, validation
3. **UI / presentation** — components, pages, forms
4. **Infrastructure** — deployment, CI/CD, configuration
5. **Cross-cutting** — feature flags, permissions, monitoring
```

- [ ] **Step 2: Add a new `/claude-tweaks:init` row to `/specify`'s Relationship to Other Skills table**

Find in `skills/specify/SKILL.md`:

```markdown
| `/superpowers:brainstorming` | Bidirectional: when a design doc already exists, it runs BEFORE /specify and produces the input that /specify consumes and deletes. When the user passes a bare topic (polymorphic input), /specify invokes brainstorming internally to produce the design doc, then decomposes it. |
| `/superpowers:writing-plans` | Consumes leaf records AFTER /claude-tweaks:specify — the leaf's body must provide enough context for `/superpowers:writing-plans` to produce a TDD execution plan |
```

Replace with:

```markdown
| `/superpowers:brainstorming` | Bidirectional: when a design doc already exists, it runs BEFORE /specify and produces the input that /specify consumes and deletes. When the user passes a bare topic (polymorphic input), /specify invokes brainstorming internally to produce the design doc, then decomposes it. |
| `/claude-tweaks:init` | Phase 3 writes `project.maturity` to `.claude-tweaks/policy.yml`; Step 2 reads it to bias decomposition toward strangler-fig-shaped leaves on early-production/established projects when a design doc proposes replacing an existing subsystem. |
| `/superpowers:writing-plans` | Consumes leaf records AFTER /claude-tweaks:specify — the leaf's body must provide enough context for `/superpowers:writing-plans` to produce a TDD execution plan |
```

- [ ] **Step 3: Self-review against the design doc**

Prose deliverable, no test cycle. Re-read the design doc's "`/specify` Step 2" section and hand-trace these scenarios against the literal edited text:

1. Early-production project, design doc "Replace the legacy invoicing module with an event-driven design," Step 1's Landscape scan confirms the target module exists with outside callers → decomposition produces the two-leaf shape (flag-behind, remove-old-path), not the standard five.
2. Established project, same design doc → three-leaf shape (parallel implementation, cutover, decommission).
3. Established project, design doc proposing a wholly new feature with no existing counterpart → rewrite-signal check finds no matching existing target → standard five heuristics apply, unchanged.
4. Greenfield project, design doc literally titled "Rewrite the onboarding flow" (rewrite language present) → check is skipped entirely before the language scan even runs, since maturity gates it first — standard five heuristics apply.
5. Project with no `project.maturity` key → fails open, identical to greenfield — standard five heuristics apply.

Also confirm:
- No `TBD`/`TODO`/placeholder text.
- The new `/claude-tweaks:init` row doesn't duplicate information already present elsewhere in the table (check there wasn't already an implicit init reference under a different row).

Fix any drift found inline.

- [ ] **Step 4: Commit**

```bash
pwd && git rev-parse --show-toplevel
git add skills/specify/SKILL.md
git commit -m "Add maturity-scaled strangler-fig decomposition to /specify Step 2

Reads project.maturity from policy.yml; on early-production/established
projects, a design doc proposing to replace an existing, in-use
subsystem decomposes along a strangler-fig boundary (flag-behind +
remove-old-path, or parallel-implementation + cutover + decommission)
instead of the standard five layer-based heuristics. Ambiguous matches
fall through to the standard heuristics unchanged."
```

---

## Final Verification

- [ ] **Step 1: Grep for the new key across all four touched files to confirm consistent naming**

```bash
grep -rn "project\.maturity\|maturity:" skills/init/phase-3-classification.md skills/init/SKILL.md skills/init/update-mode.md skills/build/SKILL.md skills/specify/SKILL.md
```

Expected: every reference to the config key itself uses `project.maturity` (the dotted form), not a bare `maturity:` key — the design doc's illustrative snippet used the bare form, but this plan's Global Constraints established the dotted form as the actual naming. Prose references to "maturity" as a concept (not the config key) are fine either way.

- [ ] **Step 2: Confirm no code files were touched**

```bash
git diff --stat main...HEAD
```

Expected: only the five markdown files this plan names — `skills/init/phase-3-classification.md`, `skills/init/SKILL.md`, `skills/init/update-mode.md`, `skills/build/SKILL.md`, `skills/specify/SKILL.md`. No `.js` files, per the design doc's "no code changes" Tech Stack claim.

- [ ] **Step 3: Run the full repo test suite as a sanity check (no code changed, but confirms nothing else broke)**

```bash
npm test 2>&1 | tail -20
```

Expected: same pass count as before this branch started (modulo any pre-existing documented-flaky test) — no new failures, since no `.js` files changed.
