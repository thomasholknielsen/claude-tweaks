---
tier: 1
status: complete
progress: 100
blocked-by: [15, 16, 19, 20, 21, 22]
surface: backend
---

# 23: Docs consolidation, cross-reference sweep, major version

## Overview

The program's closing spec: sweep every remaining cross-reference onto the unified-record vocabulary, update the user-facing docs (README, `/help` reference card + context flow, CLAUDE.md's plugin-description sections, the GitHub-issues lifecycle diagram), verify the retired vocabulary is gone repo-wide, confirm the ingest/backlog compat modules have zero remaining callers (delete them if so), and bump the **major version** (6.0.0) with the marketplace mirror.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- No behavior changes — this spec is documentation, sweeps, deletions of confirmed-dead code, and versioning only. Any live gap it finds in specs 13–22's work gets filed as a new record, not fixed inline here.
- No migration of this repo's own live issues/labels/legacy files (later plan; README gains a "migrating from 5.x" pointer stub naming what the plan will cover).

## Current State

- `README.md` — artifact-lifecycle diagram + skill catalog aligned to the spec-file era.
- `skills/help/reference-card.md` (single source of truth for the command catalog) and `context-flow.md` (artifact flow) — spec/INDEX/backlog vocabulary; `/dispatch` absent.
- `docs/diagrams/github-issues-lifecycle.html` — the committed visual (tier:*/status:*/backlog era, includes `/capture` track + label reference table) — now describes the retired model.
- `CLAUDE.md` — Structure table (28 skill dirs), sub-files table, Subagent-Contract user list, Don'ts — several rows name retiring mechanisms (INBOX, specs/backlog, tier labels).
- `.claude-plugin/plugin.json` — 5.x; marketplace repo mirrors `plugins[].version`.
- `bin/lib/issues/ingest.js`, `backlog.js` — kept as compat wrappers by spec 14.

## Deliverables

- [ ] README: rewrite the lifecycle/artifact sections to the record spine (backlog → ready → authorized → building → closed), the two drivers, `/dispatch`; add the "migrating from 5.x" stub; changelog entry.
- [ ] `reference-card.md` + `context-flow.md`: add `/dispatch`, retarget `/specify`/`/flow`/`/triage`/`/tidy` descriptions, record vocabulary throughout; keep the catalog↔README sync rule satisfied both ways.
- [ ] Regenerate `docs/diagrams/github-issues-lifecycle.html` for the new model (spine, six axes, grants, `/dispatch`, label reference table from `_shared/work-record.md`'s taxonomy) — same self-contained-HTML conventions as the current file.
- [ ] CLAUDE.md: update Structure/sub-files rows for changed skills + new `skills/dispatch/`; update the Backlog-integration section's *description* to name `work-backend` (value flip deferred to migration); sweep Don'ts rows that name retired mechanisms, preserving each rule's lesson.
- [ ] **Repo-wide retirement sweep** (the load-bearing task): case-insensitive grep for `tier:approved|tier:fast-track|tier:needs-review|status:in-progress|status:blocked|backlog:category|inboxIssuePayload|recon-issue|recon-fingerprint|specs/backlog|INDEX.md`, hyphen-form scoring tokens (`risk-low|risk-medium|risk-high|effort-low|effort-medium|effort-high`), retired alias names (`WORK_TYPES_NATIVE`, `triage-retry-ceiling`, `triage-fast-track-`), plus bare-word passes for `inbox` and `deferred` as concept names — across `skills/`, `bin/`, `README.md`, `CLAUDE.md`, `docs/` — every hit is either an approved legacy-compat line (annotated), a literal migration-plan mention, or a defect to fix here. Exclude this spec file and the archived run-dir contents from the sweep. Add config-key consistency checks: every occurrence of `work-types`/`work-links`/`work-backend` across the repo uses those exact spellings and value enums, and the `by:*` origin family has exactly 4 members everywhere it's enumerated.
- [ ] **Structural-pattern sweep** (beyond literal tokens): (a) any skill prose instructing a write of a new file into `specs/` outside the `local-files` driver's documented paths; (b) any `gh issue list`/`gh issue view`/`gh issue edit` invocation naming a label outside `_shared/work-record.md`'s taxonomy; (c) any frontmatter field list containing retired spec-era keys (`tier:`, `status:`, `progress:`, `blocked-by:` outside `local-store.js`'s documented set). Each pattern is a grep-able shape, not a keyword — record the exact commands in the implementation plan.
- [ ] Compat-module check: if no caller outside tests references `ingest.js`/`backlog.js` exports, delete the wrappers + their tests; otherwise document the remaining caller as a filed record.
- [ ] Bump `.claude-plugin/plugin.json` to 6.0.0 (fetch-first upstream bump check per the release procedure), update the description if the record model changes it; mirror `plugins[].version` in the marketplace repo per the two-repo release procedure.

## Acceptance Criteria

1. The retirement sweep command set is written into the implementation plan and its final run returns only annotated compat/migration hits (list them in the PR/commit body); the bare-word `inbox|deferred` pass is included, not just the literal-token pass.
2. README, `reference-card.md`, and `context-flow.md` all list `/dispatch`; the artifact-lifecycle diagrams in README and `/help` agree with each other.
3. The regenerated lifecycle HTML contains the grants (`auto:build`/`auto:merge`), `bot:*`, `ready`/`parked` vocabulary and no `tier:`/`status:`/`backlog`-label vocabulary.
4. `plugin.json` reads `6.0.0`; the marketplace mirror commit exists (or is staged with the exact edit if the sibling checkout is unavailable, per the wrong-checkout workaround note).
5. `npm test` passes; if the compat modules were deleted, no test references them.
6. CLAUDE.md's updated rows still satisfy the bidirectional cross-reference rule (spot-check `/dispatch`'s Relationship rows both ways).

## Technical Approach

Run the sweep FIRST (it generates this spec's real worklist), fix, then docs, then version. The sweep must search for structural patterns too, not just literal tokens (keyword-grep blindness rule) — e.g., "a skill that writes a file into `specs/`" as a pattern, not just the path string. The diagram regeneration follows the existing file's own conventions (foreignObject text wrapping, theme variables, ≤100-char label descriptions in the reference table).

## Gotchas

- The sweep excludes: this spec file, `docs/superpowers/specs/` design docs that legitimately describe history, and `.claude-tweaks/pipelines/` archives. Plans/specs documenting a removal necessarily quote the removed text (documented incident — self-exclude).
- Version-bump collision: fetch `origin/main` and check `git log origin/main -- .claude-plugin/plugin.json` before choosing 6.0.0 (concurrent-session rule).
- The marketplace sibling-repo commit hits the `worktree.always` cwd-resolution quirk — use the documented EnterWorktree-first workaround.
- `/help`'s reference card is the single source of truth — README defers to it on conflicts.

## Key Files

- `README.md`, `CLAUDE.md`, `docs/diagrams/github-issues-lifecycle.html`
- `skills/help/reference-card.md`, `skills/help/context-flow.md`
- `.claude-plugin/plugin.json` (+ marketplace repo mirror)
- `bin/lib/issues/ingest.js`, `bin/lib/issues/backlog.js` (delete if caller-free)
