# Routine Relevance Analysis

A judgment pass over a project's already-instantiated cloud Routines
(`.claude-tweaks/routines/*.yml`), invoked directly by `/claude-tweaks:init`'s Update Mode
only — never by this skill's own SELECT/due-ness rotation, and never filed as a GitHub issue.
Unlike every other check `_shared/harness-health-analysis.md` and `library-shape-analysis.md`
perform, this pass has no cursor of its own; it re-runs in full every time `/init`'s Update
Mode invokes it.

## What this checks

`/claude-tweaks:routine status --all`'s Drifted verdict (see `skills/routine/SKILL.md`)
already catches every staleness a `template_version` bump would signal — a changed prompt,
model, tools, or schedule default. This pass exists for staleness that does NOT bump
`template_version` at all: the underlying skill's own behavior or scope shifting since the
routine was instantiated.

## Procedure

If `${CLAUDE_PLUGIN_ROOT}` isn't itself a git repository (`git -C "${CLAUDE_PLUGIN_ROOT}"
rev-parse --is-inside-work-tree` fails), this entire pass has no git history to read — report
that plainly and skip the whole Routine Relevance check for this firing, rather than silently
treating every record as having zero churn. (A plugin marketplace install IS a git clone in
practice, but this shouldn't be assumed silently.)

For each instantiated record whose `template` skill still resolves to a real
`${CLAUDE_PLUGIN_ROOT}/skills/{template}/routine-template.yml` (records
`/claude-tweaks:routine status --all` flagged Orphaned are skipped here entirely — Routine
Drift already surfaces those, and there is no live skill left to judge relevance against):

1. Read the record's `created_at` field (ISO 8601 — set at creation or the routine's last
   `update`). If `created_at` is missing or unparseable, skip the `git log --since=` gate
   entirely and treat this record as always worth a look — proceed directly to step 3's
   diff-reading judgment, grounded in the skill's full history rather than a since-boundary.
2. Run `git -C "${CLAUDE_PLUGIN_ROOT}" log --since="<created_at>" --oneline -- skills/{template}/`.
   Zero or trivial commits (a handful of typo/formatting fixes) → skip this record silently, no
   finding.
3. For non-trivial churn, read the actual commit messages and diffs in that range — not just
   the count. Judge, grounded in what actually changed: has the skill's scope shifted enough
   that this routine's cadence, model, or tool access (as recorded, not as currently
   templated — this pass is about behavior drift, not template drift) might now be
   miscalibrated? Has a newer sibling routine-template (one that didn't exist as of
   `created_at`) started covering ground this routine also covers?
4. If the judgment surfaces something worth a look, emit one row: `{routine identity, e.g.
   "code-health"} | {N} commits touching ${CLAUDE_PLUGIN_ROOT}/skills/{template}/
   since {created_at date} | {one or two sentence relevance note grounded in what the diffs
   actually showed}`. If nothing from steps 2-3 surfaces a concern, this record produces no
   row — most records in most audits should produce nothing.

## Output

Hand the resulting rows (zero or more) back to `/init`'s Update Mode, which presents them
directly within Phase 1u.5 and resolves them immediately — no Phase 3 Drift Report hand-off
is involved (see `update-mode.md`'s "Routine Relevance" entry for the exact presentation and
resolution). This pass never calls `gh issue create` and never writes to this skill's own
cursor/cache state — it is pure analysis, with `/init` owning both the presentation and the
resolution.

## Anti-patterns

| Pattern | Why it fails |
|---|---|
| Flagging a record based on commit *count* alone | A high commit count on cosmetic/doc-only changes is not scope drift — read the actual diffs before judging. |
| Re-checking anything `template_version` would already catch | That's Routine Drift's (STATUS `--all`'s Drifted verdict) job — this pass only fires on behavior drift a template edit wouldn't capture. |
| Running this pass on a schedule, or filing its findings as GitHub issues | This pass has no cursor and is never invoked by this skill's own SELECT step or a scheduled Routine — `/init`'s Update Mode is its only caller, by design. |
| Judging an Orphaned record's relevance | Orphaned records (no resolvable template at all) are Routine Drift's territory — there is no live skill here to judge scope drift against. |
