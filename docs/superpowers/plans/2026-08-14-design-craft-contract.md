# Design craft contract (#383) — execution plan

For agentic workers: executed inline under `/claude-tweaks:flow` (run dir `2026-08-14T104804-spec-383-384-385-387/spec-383`).

Spec: `.claude-tweaks/pipelines/2026-08-14T104804-spec-383-384-385-387/spec-383/work/383-spec.md` (record #383).

Facts verified at plan time (against this worktree, post-merge with origin/main):

- `skills/design-wrapper/modes/pre-build.md` Step 3 owns reference-file selection; its Output-to-caller block owns `missed` and `context_size` (bytes/4 summarize-vs-inline). Confirmed.
- `skills/_shared/visual-html-output.md` Step 1 owns the `DESIGN.md` three-path lookup (root → `docs/design/DESIGN.md` → `docs/DESIGN.md`). Confirmed.
- `skills/design-wrapper/SKILL.md` Layer 1 kill-switch: `design-integration` field in CLAUDE.md `## Design integration`; `surface_track` resolution with `web|ios|android|adaptive`. Confirmed.
- `docs/plugin-structure.md` sub-file table has a `_shared` row enumerating `observation-plan.md` individually → AC 8's "iff" resolves to **yes, add a row**.
- `docs/skill-graph.md`: non-skill targets sit as a row under each consuming skill's section — one `_shared/design-craft.md` row each under `## build`, `## design-wrapper`, `## flow`, `## visual-review`.
- Install layout **verified by real install** (skills CLI 1.5.18, 2026-08-14, throwaway install cleaned up): real dirs at `{project}/.agents/skills/{name}/SKILL.md`; Claude Code discovery via per-skill symlinks `{project}/.claude/skills/{name}` → `../../.agents/skills/{name}`. Latest CLI (1.5.22) requires Node ≥ 22.20.
- Baseline: a repo-wide grep for the authority-rule phrase (the two words "decisions"+"win" adjacent — spelled split here so this plan doesn't self-match) currently matches nothing under `skills/` or `docs/`.

## Task 1 — `skills/_shared/design-craft.md` (new)

Files: `skills/_shared/design-craft.md`

Plain prose contract (no frontmatter — `_shared` genre, like `subagent-output-contract.md`). Sections: purpose + consumer-gate boundary; gating (Layer-1 kill-switch reuse, web-track-only for Emil content); the two source classes; the authority rule (canonical sentence verbatim) with per-sub-topic scope worked example + sidecar-extends-never-overrides tie-break + overlap-accepted/no-dedup statement; the unconditional-assembly rule; Emil resolution procedure with the observed-layout verification note; relevance map (wired rows with triggers stated as LLM judgment, named-not-wired rows with one-clause reasons); degradation posture; Subagent Contract compliance note.

Constraints: canonical sentence appears only in this file; cardinality rule (no literal counts of the skill set); fully-qualified `/claude-tweaks:{skill}` in any actionable instruction text; drift-pin reference worded to tolerate #387 landing before or after.

## Task 2 — `docs/skill-graph.md` consumer edges

Files: `docs/skill-graph.md`

One `_shared/design-craft.md` row under each consumer section: `## build` (via `design-prebuild.md` forwarding, wired by #384), `## design-wrapper` (pre-build assembly implementation #384 + explore renderers, #386 pending), `## flow` (polish composition, #385), `## visual-review` (standalone code-modifying paths, #385). Each edge once, nowhere else.

## Task 3 — `docs/plugin-structure.md` inventory row

Files: `docs/plugin-structure.md`

Extend the sub-file table's `_shared` enumeration with `design-craft.md` and its consumer summary (mirror the `observation-plan.md` row's shape).

## Verification

- AC1: repo-wide grep for the authority-rule phrase over `skills/` + `docs/` → exactly `skills/_shared/design-craft.md` (this plan and the run ledger deliberately avoid spelling the phrase contiguously).
- AC2: relevance map covers all skills in the upstream set (wired or named-not-wired).
- AC3: unconditional-assembly statement + per-sub-topic example + tie-break present.
- AC4: `git diff --stat` (this task's commits) touches only the three files above.
- AC5: `grep -l "design-craft" skills/*/SKILL.md` → empty.
- AC6: fully-qualified skill refs in instruction text.
- AC7: verification note with observed paths present in the resolution section.
- AC8: `grep -n "design-craft" docs/plugin-structure.md` matches (inventory does enumerate `_shared` files).
