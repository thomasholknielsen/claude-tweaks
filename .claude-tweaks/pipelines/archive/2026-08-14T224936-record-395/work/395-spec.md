---
record: 395
origin: capture
risk: low
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---

# 395: Split assess-agent-autonomy into a router + four mode sub-files

Surface: backend

## Current State

`skills/assess-agent-autonomy/SKILL.md` is the largest single-file skill: 491 lines / 33.5KB, no sub-files. Its four modes (grant-check, merge-check, failure-check, ceremony-check) have four disjoint caller sets (backlog refine/grant; dispatch auto-merge + wrap-up console; dispatch settle; specify/flow fallback) — every caller loads all four modes to use one. The sub-file lazy-load pattern is already the corpus convention (dispatch 12 sub-files, wrap-up 20, init 35).

## Deliverables

- A router `SKILL.md` (~60 lines): frontmatter, the mode/caller table, shared Input mode-dispatch rules, Error Handling defaults, Component-Skill Contract, genuinely cross-mode Anti-Patterns, and one pointer per mode.
- Four sub-files — `grant-check.md`, `merge-check.md`, `failure-check.md`, `ceremony-check.md` — each carrying its mode's Gather/Judge/Render content verbatim.
- Zero behavior change: every caller invocation (`Skill args: "{mode} [#N] [--base <ref>]"`) resolves exactly as today.

## Acceptance Criteria

- Each mode's procedure text survives byte-comparable (modulo headers and router pointers) in its sub-file.
- No caller call site needs editing — grep for assess-agent-autonomy invocations across `skills/` shows zero changes required.
- Router SKILL.md ≤ ~8KB; per-invocation load (router + one sub-file) ≤ ~40% of today's 33.5KB.
- `docs/skill-graph.md` edges and `docs/plugin-structure.md`'s sub-file table updated per CLAUDE.md's cross-reference rule.

## Technical Approach

Pure content relocation — read `docs/skill-authoring.md` first. The Error Handling table (per-mode conservative defaults) stays in the router since every mode needs it visible. Mode-specific Anti-Patterns rows move with their mode; shared rows stay.

## Gotchas

- Several Anti-Patterns rows concern exactly one mode (e.g. merge-check's refutation-attempt row) — split them to the sub-file rather than duplicating; [IL-93] class if copied.
- Callers quote exact invocation strings (`shaping-mode.md`, `settle-and-merge.md`, `refine-mode.md`, `grant-mode.md`, `materialize.md`, `review-console.md`) — never rename the skill or its mode words.
- The description (706 chars) is #394's to trim — don't pre-trim it here and collide.

## Original request

Split assess-agent-autonomy into a router + four mode sub-files

**Related:** #333

Context: Bloat audit: largest single-file skill (491 lines / 33.5KB), four modes with four disjoint caller sets (backlog, dispatch, specify/flow, wrap-up) — every caller loads all four modes to use one.

Scope: ~60-line router SKILL.md + grant-check/merge-check/failure-check/ceremony-check sub-files; zero behavior change; ~75% per-invocation payload cut.
