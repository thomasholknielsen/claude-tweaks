# Routine Drift & Relevance Audit — Design

## Problem

`/claude-tweaks:init`'s Step 15 (Routine Installation) only ever asks one question: "is there a
routine-template candidate with no instantiated record yet?" It never looks at records that
already exist. Two distinct kinds of staleness go undetected as a result:

1. **Mechanical drift** — an instantiated routine's `template_version`, schedule, model, or
   tools no longer match the live template it was created from. Detectable today, one skill at
   a time, via `/claude-tweaks:routine status <skill>` — but nothing surfaces it proactively or
   in bulk, so a user has to remember to check every instantiated routine individually.
2. **Relevance drift** — the *set* of routines a project has may no longer be the right set,
   given how much the underlying skills have changed (renames, scope shifts, new templates)
   since they were instantiated. `template_version` comparisons can't catch this: a skill's
   behavior can shift substantially without its `routine-template.yml` ever being edited.

Both risks are real, not hypothetical: `harness-health` was renamed from `skill-health` in the
recent past. Any project that instantiated a routine under the old name now has a record whose
`template:` field points at a skill directory that no longer exists — silently, with zero
signal pointing the user toward fixing it.

## Scope

**In scope:**
- A bulk mechanical-drift check across every record in `.claude-tweaks/routines/*.yml`, reusing
  `/claude-tweaks:routine` STATUS's existing field-diff logic (its Steps 3 and 3.5) rather than
  re-deriving it.
- A new `/claude-tweaks:routine status --all` entry point (no `<skill>` argument) — useful
  standalone, not just as an `/init` internal — plus a new `--defaults` flag on
  `/claude-tweaks:routine update` so a batch-confirmed re-sync doesn't trigger a full
  interactive cadence-picker per item.
- Wiring `/init`'s Update Mode to call `status --all` and stage Drifted records as a batch
  offer — the same `Contract Drift`-style treatment `update-mode.md` already uses for CLAUDE.md
  markers and the work-record backend.
- A new relevance-judgment analysis, written as a harness-health-owned sub-file (matching
  `library-shape-analysis.md`'s placement and judgment-quality bar), invoked directly by
  `/init`'s Update Mode only — not part of harness-health's own SELECT/due-ness rotation, not
  filed as GitHub issues. It grounds its judgment in each record's own `created_at` timestamp
  plus real git history for the corresponding skill, not surface signals or guesswork.
- A small enumeration/parsing addition to `bin/lib/routine-template-parser.js` (with unit
  tests) so records are read through the existing, already-hardened parser rather than ad hoc
  re-parsed elsewhere.

**Out of scope:**
- No change to harness-health's own periodic cadence, cursor, or FILE (GitHub-issue) pipeline.
- No auto-mode support for applying a routine update — `RemoteTrigger update` is an external,
  hard-to-reverse API call, the same risk category as Step 9's repo creation, which is
  interactive-only for the identical reason.
- No automatic resolution of the renamed/retired-skill (Orphaned) case — nothing here guesses
  that `skill-health` became `harness-health`; it flags for a human to decide.
- Not auditing routines in *other* projects — scope is the current project's own
  `.claude-tweaks/routines/`.
- No backfill for records that predate this feature and are missing `created_at` in some other
  consuming project — degrade to "always worth a look" rather than erroring.

## Placement

**Mechanical drift** lives in `/claude-tweaks:routine` (the skill that already owns
CREATE/UPDATE/STATUS and the field-diff logic), exposed as a new bulk-check capability, then
consumed by `/init`'s Update Mode as a new drift-detection entry alongside the four that already
exist there (Contract Drift, Work-Record Backend Drift, Maturity Drift, Auto-Mode-Policy
Migration).

**Relevance judgment** lives in a new `skills/harness-health/routine-relevance-analysis.md`
sub-file — harness-health already owns the plugin's cross-skill judgment methodology (it's the
"canonical harness-drift judge shared by `/init`, `/wrap-up`, and `/harness-health`" per this
repo's own CLAUDE.md), so this reuses that placement and quality bar rather than inventing a
parallel judge inside `/init` itself. Unlike `library-shape-analysis.md`, this new file has no
due-ness cursor of its own and never runs as part of harness-health's own scheduled Routine
firing — it is invoked directly, and only, by `/init`'s Update Mode.

**Files touched:**

- `skills/routine/SKILL.md` — STATUS gains a `--all` mode (Step 1 rewritten: when `--all` is
  passed, enumerate every file under `.claude-tweaks/routines/*.yml` directly instead of
  globbing `skills/{skill}/routine-template*.yml` by name — see "Mechanism 1" below for why the
  direction has to invert). UPDATE gains a `--defaults` flag (skip Step 3's cadence-picker,
  keep the record's existing `schedule` untouched, re-sync everything else from the current
  template, pull environment from cache). Frontmatter `argument-hint` updated. New
  Anti-Patterns row (using `update --defaults` outside an already-confirmed batch). Relationship
  table gets a new line documenting `/init`'s consumption of `status --all`.
- `skills/init/update-mode.md` — two new Phase 1u.5 entries: "Routine Drift" (invokes
  `/claude-tweaks:routine status --all --source init`, stages Drifted rows into the standard
  apply-all/override batch table, surfaces Orphaned/Stale rows as flagged advisories with no
  bulk auto-fix) and "Routine Relevance" (invokes the new harness-health sub-file, presents
  findings inline in the same Drift Report). Both skip silently if
  `.claude-tweaks/routines/` doesn't exist. Routine Drift counts toward Phase 1u.6's Total
  drift count (Routine Relevance does not — like Maturity Drift, it's not a presence/absence
  signal Phase 1u.6 can cheaply precompute before Phase 3).
- `skills/init/SKILL.md` — Step 15's summary paragraph gains a one-line pointer to Update
  Mode's new audit; Relationship-to-Other-Skills rows for `/routine` and `/harness-health`
  updated to mention the new consumption (bidirectional, per this repo's own convention).
- New file: `skills/harness-health/routine-relevance-analysis.md`.
- `skills/harness-health/SKILL.md` — Relationship-to-Other-Skills row for `/init` updated to
  reference the new sub-file (bidirectional cross-reference requirement).
- `bin/lib/routine-template-parser.js` — new `parseRoutineRecord`/enumeration helper (the
  instantiated record schema is flat — no folded blocks like the template's `prompt` field —
  but still benefits from one hardened, tested parser rather than ad hoc re-parsing).
- `tests/routine-template-parser.test.js` — new cases for the added helper.
- Root `CLAUDE.md` — harness-health's sub-file table row gains the new file; init's row
  description gets a short mention of the new Update-Mode audit capability.

**Explicitly not touched:** harness-health's own `routine-template.yml` (no cadence/cursor
change), `bin/lib/health-core/**` (no new durable-state cursor needed — this dimension isn't
tracked across firings), `docs/superpowers/plans/*` and `docs/superpowers/specs/*` (frozen
historical record).

## Mechanism 1: Mechanical Routine Drift Sync

**`/claude-tweaks:routine status --all`:** inverts STATUS's normal direction. Today's
`status <skill>` starts from a skill name and globs `skills/{skill}/routine-template*.yml` to
find matching records — which structurally cannot discover a record whose skill no longer
exists at all (the renamed/retired case). `--all` instead iterates every file already present
under `.claude-tweaks/routines/*.yml`, and for each one resolves its own `template:` field back
to a skill directory. Per record, the verdict is one of:

| Verdict | Detection | Fix path |
|---|---|---|
| In sync | `template_version` matches, no field drift (existing Step 3/3.5 checks) | none |
| Drifted | version mismatch and/or schedule/model/tools/repo-url diff | `/claude-tweaks:routine update <skill> [--variant] --defaults --source init` |
| Orphaned | `skills/{name}/routine-template*.yml` no longer exists for the record's `template:` value | flag only — no live template to sync against; suggest manual investigation ("was this skill renamed? delete the record and `create` under the new name") |
| Stale | `RemoteTrigger get` fails (routine deleted externally) | same recourse STATUS Step 2 already offers (delete record + recreate) |

Note `--all` needs no `git remote get-url origin` call at all, unlike per-skill STATUS — it
reads existing record *files* directly rather than re-deriving `REPO_SLUG` from scratch, so a
missing or changed remote doesn't block it.

**`/claude-tweaks:routine update --defaults`:** today, `update <skill>` always runs the full
interactive cadence-picker (its Step 3), even when nothing about the schedule needs to change.
Batch-confirming N drifted routines from `/init` would otherwise mean N separate interactive
round-trips. `--defaults` keeps the record's *existing* schedule untouched, re-syncs
`template_version`/model/tools/repo-url to the live template, and pulls environment from cache
— no picker, no separate confirm (the batch-table confirm in `/init` already served that role,
matching the reasoning CREATE's own `--defaults` anti-pattern note documents today).

**`/init`'s Update Mode ("Routine Drift" entry in `update-mode.md`):**
1. Skip silently if `.claude-tweaks/routines/` doesn't exist.
2. Otherwise call `/claude-tweaks:routine status --all --source init`.
3. Stage Drifted rows into the standard apply-all/override batch table (per this repo's
   Multi-item Decisions convention); on confirm, invoke
   `/claude-tweaks:routine update <skill> [--variant] --defaults --source init` per confirmed
   row.
4. Present Orphaned/Stale rows as flagged advisories — no bulk auto-fix offered for either,
   since neither has a safe default action.
5. Counts toward Phase 1u.6's Total drift count, same as the other four Phase 1u.5 entries — a
   project with drifted routines never early-exits the Update Mode audit.

## Mechanism 2: Routine Relevance Audit

**Grounding signal:** the instantiated record schema already has a `created_at` field (ISO
8601, set at creation or last update — see `skills/_shared/routine-template-schema.md`). For
each record whose `template` skill still resolves (Mechanism 1 already separates out Orphaned
records — this dimension only runs on records that still point at a real skill):

1. `git log --since="<created_at>" --oneline -- skills/{template}/` — churn volume as the
   "is this worth a look" gate. Zero or trivial commits → skip silently, no finding.
2. Where churn is non-trivial, read the actual commit messages/diffs (not just the count) and
   judge: has the skill's scope shifted enough that the routine's cadence, model, or tools
   picked at creation time might now be miscalibrated? Has a newer sibling routine-template
   (shipped since `created_at`) started covering overlapping ground?
3. **Deliberately not this dimension's job:** anything a `template_version` bump would already
   catch (prompt/preamble changes, any field change within the template itself) — that's
   Mechanism 1's job. This dimension only fires on skill-behavior drift that doesn't require a
   template edit at all.

**Output:** inline in `/init`'s own Drift Report (per the earlier interactive decision, not
filed as GitHub issues) — a short table (routine, churn summary since `created_at`, relevance
note) with a single acknowledge/defer resolution per item, since these are open-ended judgment
calls with no single mechanical "apply" action, unlike Mechanism 1's clean version-diff.

## Auto mode

Mechanism 1's actual fix (`routine update --defaults`) is interactive-only, never silently
applied in auto mode — the same reasoning as Step 9's repo creation: an external, hard-to-
reverse `RemoteTrigger` call. Detection itself (`status --all`) is read-only and safe to run
under any mode. Mechanism 2 is read-only/advisory throughout, so it needs no auto-mode gating
beyond "never silently skip presenting a finding" — matching every other Update Mode drift
category's existing rule.

## Error handling summary

- `.claude-tweaks/routines/` absent → both mechanisms skip silently.
- `RemoteTrigger get` failure inside `status --all` → same stale-record recourse STATUS Step 2
  already documents (delete + recreate).
- Orphaned template (skill renamed/retired) → flag only; no auto-resolution path exists, since
  nothing here can safely guess a renamed target.
- A `git log --since=` call against a skill directory that has zero matching commits (record
  newer than any change to that skill) → treat as "no churn," skip silently, not an error.

## Testing

This is primarily a prose/skill-file change (`routine/SKILL.md`, `update-mode.md`, the new
harness-health sub-file, `init/SKILL.md`, `CLAUDE.md`) — no `node --test` coverage applies to
those. The one real code touch, the new enumeration/parsing helper in
`bin/lib/routine-template-parser.js`, gets unit tests in `tests/routine-template-parser.test.js`
covering: a directory with zero records (empty result, not an error), a well-formed record, and
a malformed/partial record (missing a required field) — mirroring the existing test file's
coverage style for `parseRoutineTemplate`. Verification of the prose changes is a manual
dry-run: a scratch project with a hand-authored stale record (old `template_version`, and a
separate record naming a nonexistent skill) walked through `status --all`'s three non-trivial
verdicts (Drifted, Orphaned, Stale) by hand against the written procedure.

## Integration touches

- `skills/init/SKILL.md`'s Actions Performed table gains a row when Mechanism 1 actually
  re-syncs a routine (`| Routine re-synced | {skill} template v{N}→v{M} | Update Mode |`).
- No new CLAUDE.md config flag or durable-state cursor — Mechanism 1's effect (a re-synced
  record) is already fully observable via the record file itself; Mechanism 2 is intentionally
  cursor-less per the earlier "/init-triggered only" decision.

## Non-goals

- Does not attempt automatic renamed-skill resolution or fuzzy-matching a retired skill name to
  its likely successor.
- Does not change harness-health's own periodic cadence, cursor, or FILE (GitHub-issue) pipeline
  in any way.
- Does not add auto-mode support for autonomously applying a routine update.
- Does not backfill `created_at` on records that predate this feature in some other consuming
  project.
- Does not audit routines belonging to any project other than the one `/init` is currently
  running in.
