---
tier: 1
status: not-started
progress: 0
blocked-by: [13]
surface: backend
---

# 22: /init — work-backend flag, label bootstrap, Types probe

## Overview

`/init` provisions the unified record system per project: the `work-backend: github-issues | local-files` flag (replacing `backlog-backend`, now governing all work records), the 17-label bootstrap offer, and the Issue-Types capability probe (native Types where the org has them; `type:bug|feature|task` label fallback otherwise — recorded so every filing skill branches consistently). Update-Mode detects the legacy flag and existing installs, offering the rename and re-probing on drift (the same pattern `design-integration` re-asks already use).

**Complexity:** Medium
**Estimated tasks:** 5

## Non-Goals

- No migration of live issues/labels or this repo's own CLAUDE.md values — Update-Mode *offers* the flag rename write; relabeling live records stays in the later migration plan.
- No changes to init's non-record phases (doc registry, profiles, statusline, policy.yml, worktree setup).
- The GitHub issue-form template offer (`agent-task.yml`, bootstrap Step 9) survives — its field set already matches the spec shape; only wording updates.

## Current State

- `skills/init/SKILL.md` + `bootstrap-steps.md` — Step 15 writes `backlog-backend` under `## Backlog integration` (silent when a GitHub remote is reachable); Step 9 offers the issue-form template with two inline `gh` capability checks (Detection-Ladder-fixed previously); label creation happens lazily in consumer skills, not at init.
- `skills/init/update-mode.md` — Phase 1u inventory + contract-drift detection; re-asks integration flags on availability drift.
- `bin/lib/issues/types-probe.js` — created by spec 14.

## Deliverables

- [ ] Rename Step 15 to write `work-backend` under a `## Work records` section (recommendation logic unchanged: `github-issues` when remote + authenticated `gh`, else `local-files`); document that skills read `backlog-backend` as a legacy alias until migration.
- [ ] New sub-step: run `probeCapabilities()` (`bin/lib/issues/capabilities-probe.js`); write the results as `work-types: native | labels` and `work-links: native | body-text` beside `work-backend`, so filing/shaping skills branch on config instead of re-probing per filing. Update-Mode re-probes on each update pass (org settings drift).
- [ ] New sub-step: offer (AskUserQuestion, default yes under github-issues) bootstrapping all 17 core labels now via `_shared/label-bootstrap.md`'s canonical LABELS_JSON — one-time provisioning so the first health-skill firing doesn't pay the lazy-create path; declining leaves lazy creation as the fallback (both valid).
- [ ] Update-Mode: detect `backlog-backend` in an existing CLAUDE.md → offer the rename write (flag + section header) as a staged Update-Mode change; detect missing `work-types` → probe and offer.
- [ ] Update Step 9's issue-form wording (spec-shaped fields; mention Type selection when native), init's summary templates, Anti-Patterns, and Relationship rows (`work-record.md` cited by path).

## Acceptance Criteria

1. `grep -n "backlog-backend" skills/init/` matches only legacy-alias/Update-Mode-rename prose — the write path emits `work-backend`.
2. The capabilities-probe sub-step exists, writes both `work-types: native | labels` and `work-links: native | body-text`, and Update-Mode documents re-probing; the skills' branch points are named by their literal config-key spellings (no alias/env renames).
3. The 17-label bootstrap offer is present with both outcomes documented (provision-now vs lazy).
4. Update-Mode's drift table includes the `backlog-backend`→`work-backend` rename row and the missing-`work-types`/`work-links` row.
5. `npm test` passes.

## Technical Approach

Follow init's existing Step 15 shape (silent when unambiguous, ask when genuinely open). `work-types` lives beside `work-backend` so `parseRecordFacets`-consuming skills never shell a probe mid-flow. The bootstrap-now offer reuses the label-bootstrap loop verbatim (it's already check-then-create idempotent).

## Gotchas

- `.gitignore` guidance: never suggest blanket-ignoring a directory containing committable plugin state (documented incident) — untouched here, but Step 15's neighborhood includes that prose; don't disturb it.
- Init must stay project-agnostic: no assumption that the repo already has any legacy labels.
- Update-Mode changes are staged offers, never silent CLAUDE.md edits (auto-mode contract: CLAUDE.md never edited autonomously).

## Key Files

- `skills/init/SKILL.md`, `skills/init/bootstrap-steps.md`, `skills/init/update-mode.md`, `skills/init/summary-templates.md`
- `bin/lib/issues/capabilities-probe.js` (consumer)
