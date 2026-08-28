---
record: 832
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 832: specify: decomposition-mode.md is loaded twice (main thread + delegated subagent), bridged by a large hand-authored prompt

Surface: backend

## Current State

Executing `/claude-tweaks:specify`'s decomposition mode loads its ~31KB procedure file into the main thread for Steps 1-2.5, then delegates Steps 3-9 to a subagent that is told to read the same file again — the handoff between them is a large hand-authored prompt restating the already-completed steps' outputs in prose, with no template backing it.

Measured: ~58,000 characters (~15K tokens) of specify skill text plus the hand-authored bridge prompt consumed in the main thread for a run whose substantive execution (record creation, linking, red-team, self-review, deletion, commit) happened entirely in a delegated subagent; `decomposition-mode.md` itself loaded twice — once by the main thread, once by the subagent it dispatches.

Repro:
1. Invoke `/claude-tweaks:specify <design-doc-path>` on a design doc with no existing overlap or ambiguity to resolve (so Steps 1-2.5 need only a couple of quick `AskUserQuestion` calls).
2. Complete Steps 1-2.5 in the main thread (this reads `decomposition-mode.md` and `design-pre-steps.md` in full).
3. Delegate Steps 3-9 to a subagent, instructing it to read `decomposition-mode.md` again for those steps, and hand-author a prompt block restating the resolved decomposition shape, dependency graph, and Step 2.5 answers so the subagent doesn't have to re-derive them.

Expected: the skill's own file structure lets a caller load only what each side of the split actually needs, with a canonical handoff-prompt shape provided by the skill rather than invented per invocation.
Actual: `decomposition-mode.md` mixes interactive Steps (1-2.5, must run where the user can answer) with purely mechanical Steps (3-9, safe to delegate) in one file, forcing either a full duplicate load or an ad hoc prompt to bridge them.

## Deliverables

- Split `decomposition-mode.md`'s interactive Steps (1-2.5) from its mechanical Steps (3-9) so each side of a main-thread/subagent split can load only what it needs.
- Provide a canonical handoff-prompt template (in this skill's directory) capturing exactly what Steps 3-9 need from Steps 1-2.5's output, so callers stop hand-authoring the bridge prompt per invocation.

## Acceptance Criteria

1. A decomposition-mode run's main thread no longer loads the full Steps 3-9 procedure text when delegating to a subagent.
2. The subagent dispatch for Steps 3-9 uses a canonical template (not a hand-authored prose bridge) whose required inputs are named explicitly.
3. Context consumed in the main thread for a straightforward decomposition (no overlap/ambiguity) is measurably reduced from the ~58K-character baseline cited above.
4. `npm test` passes.

## Technical Approach

Split `specify/decomposition-mode.md` into an interactive file (Steps 1-2.5, including `design-pre-steps.md`'s own scope) and a mechanical file (Steps 3-9), following this repo's existing sub-file lazy-loading convention (`plugin/skills/{name}/*.md`). Author a canonical handoff-prompt template in the skill's directory that names exactly which Steps 1-2.5 outputs (resolved decomposition shape, dependency graph, Step 2.5 answers) the mechanical file's subagent dispatch needs, replacing the current hand-authored bridge prompt. Update the main `SKILL.md`/`decomposition-mode.md` entry points to load only the file each side needs.

### Key Files

- `plugin/skills/specify/decomposition-mode.md` — split point between interactive (1-2.5) and mechanical (3-9) steps
- `plugin/skills/specify/design-pre-steps.md` — part of the interactive side
- `plugin/skills/specify/SKILL.md` — entry-point routing, if the split changes what it loads
- a new canonical handoff-prompt template file in `plugin/skills/specify/`

## Gotchas

- This is a context-overhead finding from a `/feedback` session evaluation, not a correctness bug — verify the split doesn't change decomposition mode's actual behavior, only what gets loaded where.
- The canonical handoff-prompt template must be genuinely reusable across invocations (design doc with overlap, design doc with ambiguity, phase-scoped decomposition) — a template that only fits the "no overlap or ambiguity" repro case reintroduces hand-authoring for every other case.

## Original request

specify: decomposition-mode.md is loaded twice (main thread + delegated subagent), bridged by a large hand-authored prompt

**Summary:** Executing `/claude-tweaks:specify`'s decomposition mode loads its ~31KB procedure file into the main thread for Steps 1-2.5, then delegates Steps 3-9 to a subagent that is told to read the same file again — the handoff between them is a large hand-authored prompt restating the already-completed steps' outputs in prose, with no template backing it.

**Kind:** Defect

**Affected component:** `/claude-tweaks:specify` (`decomposition-mode.md`, `design-pre-steps.md`)

**Objective:** Context overhead

**Measurement:** ~58,000 characters (~15K tokens) of specify skill text plus the hand-authored bridge prompt consumed in the main thread for a run whose substantive execution (record creation, linking, red-team, self-review, deletion, commit) happened entirely in a delegated subagent; `decomposition-mode.md` itself loaded twice — once by the main thread, once by the subagent it dispatches.

**Repro steps:**
1. Invoke `/claude-tweaks:specify <design-doc-path>` on a design doc with no existing overlap or ambiguity to resolve (so Steps 1-2.5 need only a couple of quick `AskUserQuestion` calls).
2. Complete Steps 1-2.5 in the main thread (this reads `decomposition-mode.md` and `design-pre-steps.md` in full).
3. Delegate Steps 3-9 to a subagent, instructing it to read `decomposition-mode.md` again for those steps, and hand-author a prompt block restating the resolved decomposition shape, dependency graph, and Step 2.5 answers so the subagent doesn't have to re-derive them.

**Expected vs. actual:**
Expected: the skill's own file structure lets a caller load only what each side of the split actually needs, with a canonical handoff-prompt shape provided by the skill rather than invented per invocation.
Actual: `decomposition-mode.md` mixes interactive Steps (1-2.5, must run where the user can answer) with purely mechanical Steps (3-9, safe to delegate) in one file, forcing either a full duplicate load or an ad hoc prompt to bridge them.

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback.

