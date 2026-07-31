# Remove the tidy github-triage Routine — Design

## Problem

`/claude-tweaks:tidy` ships a second, named routine-template variant —
`skills/tidy/routine-template-github-triage.yml` (`--variant=github-triage`) — offered
alongside the base `tidy-weekly` routine at `/init` Step 15. It runs only Step 4.8
(`--scope=github`) on a 3-hour cadence, as a "frequent, cheap companion to the base
tidy-weekly routine."

GitHub triage is not a separate concern, though — it's Step 4.8 of the one `/claude-tweaks:tidy`
skill, which already runs it on every full sweep. Offering it as a second, independently
scheduled Routine turned one skill's one scan step into three pieces of standing
infrastructure that exist only to serve it:

1. A general `--variant` mechanism in `/claude-tweaks:routine` (named-template loading,
   variant-aware idempotency/`PREFIXED_NAME` derivation, multi-template globbing in STATUS) —
   with no consumer anywhere in the plugin except this one variant.
2. Tidy's Evidence tier (auto-apply 2 of 4 cite-able-evidence finding shapes instead of
   staging them), Rolling digest (one continuously-rewritten GitHub issue), and Notification
   (a push notification on new findings) — all three gated on *"a `--scope=github` routine
   firing"* specifically, meaning they have never once activated for a full/unscoped sweep,
   even today.
3. A `tidy-routine-autonomy` policy key (`bin/lib/policy-schema.js`) that exists solely to
   toggle mechanism 2.

None of this is needed for GitHub triage to keep happening — it already happens, as Step 4.8
of the regular sweep. This design removes the separate routine and everything that existed
only to serve it, per direct user decision (see Decisions below).

## Scope

**In scope:**
- Delete the github-triage routine template and its `/init` Step 15 offering.
- Delete the `--variant` mechanism from `/claude-tweaks:routine` entirely (CREATE/UPDATE/STATUS
  workflow steps, the Input table row, the schema doc's variant-naming rules, every
  `[--variant=<name>]`/`(plus any named routine-template-<variant>.yml siblings)` mention across
  `/init` and its sub-files).
- Delete tidy's Evidence tier, Rolling digest, and Notification subsections, and the
  `tidy-routine-autonomy` policy key (schema + doc + the one hardcoded test count that changes
  as a result).
- Preserve Archival compaction (unrelated to github-triage — runs on every Standalone-auto tidy
  firing regardless of scope) by inlining it directly into `skills/tidy/SKILL.md`, then delete
  `skills/tidy/github-routine-procedures.md` (its only remaining content after that move).
- Fix the resulting stale cross-references in `skills/tidy/scan-procedures.md` (3 spots that
  cite "the Evidence tier" for consistency, none of which describe Evidence-tier behavior
  themselves — they just need the dangling citation removed).
- Patch version bump (`.claude-plugin/plugin.json`) — this is a removal/simplification, not a
  feature addition.

**Out of scope:**
- `--scope=github` itself. It's a general, independently useful manual flag
  (`/claude-tweaks:tidy --scope=github` for an ad hoc GitHub-only check) that predates and does
  not depend on the routine question. Nothing about it changes.
- Any other routine template (code-health, dispatch, docs-health, harness-health,
  journey-health, or tidy's own default `tidy-weekly` template) — none of them ship or consume a
  variant, so removing the mechanism doesn't touch their behavior.
- Cleanup of a cloud Routine or `.claude-tweaks/routines/*.yml` record any *other* project may
  already have instantiated from the old template — see Migration note below. This repo itself
  has no instantiated routine records today, so there is nothing to clean up here.
- No replacement mechanism for "fast, cheap, github-only unattended checks." If that capability
  is wanted again later, it's new work, not something this design preserves in dormant form.

## Decisions

Two forks were resolved directly with the user before this doc was written, both toward the
same "no dead weight, no speculative generality" direction:

1. **Evidence tier / Rolling digest / Notification** — removed entirely, rather than repurposed
   to activate on the base `tidy-weekly` routine's own unattended Step 4.8, or left defined but
   permanently unreachable. Their whole design rationale (safe to auto-apply because the firing
   is narrow and frequent) doesn't transfer cleanly to a weekly full-sweep cadence, and keeping
   unreachable logic around violates this project's own conventions against speculative
   generality.
2. **The `--variant` mechanism** — stripped entirely rather than kept as reusable infra for a
   hypothetical future named variant. No other skill uses it today; building it back out is
   normal-sized work if a real second consumer ever shows up.

A third, smaller decision made while drafting file changes: **Archival compaction** (the one
piece of `github-routine-procedures.md` that isn't github-triage-specific) gets inlined
directly into `skills/tidy/SKILL.md` rather than kept in its own renamed sub-file — confirmed
with the user. It's short enough (~20 lines) that a dedicated sub-file just for it is pure
indirection once the other three subsections are gone.

## Files touched

### Delete

| File | Why |
|---|---|
| `skills/tidy/routine-template-github-triage.yml` | The routine template being removed |
| `skills/tidy/github-routine-procedures.md` | Houses Evidence tier/Rolling digest/Notification (deleted) plus Archival compaction (relocated into `SKILL.md` first — see Mechanism below) |

### Code

| File | Change |
|---|---|
| `bin/lib/policy-schema.js` | Remove the `tidy-routine-autonomy` entry from `POLICY_SCHEMA` |
| `tests/policy-schema.test.js` | Update `assert.strictEqual(POLICY_KEYS.length, 34)` → `33` |

### Skill docs

| File | Change |
|---|---|
| `skills/tidy/SKILL.md` | Remove the Evidence tier/Rolling digest/Notification subsections and their shared intro line; inline Archival compaction's full procedure (replacing the "read `github-routine-procedures.md`" pointer) directly under its existing summary heading; drop the `--dry-run` paragraph's "Evidence tier subsection" mention; remove the second-variant example + `--variant=github-triage` invocation from "Routine Configuration"; reword the Input section's "the same subset a scheduled `tidy-github-triage` routine firing would touch" example to drop the routine reference |
| `skills/tidy/scan-procedures.md` | Shape 2: drop "and the Evidence tier (`SKILL.md` Step 6)" from the "same evidence ... already read" sentence. Shape 6: drop "together with the Evidence tier's fourth row (`SKILL.md` Step 6) —" (keep "both unchanged by this merge" reading naturally against the remaining reference). Step 4.8 findings-table note: drop "/ Evidence tier row 4, when evidence-qualified" from the parenthetical, leaving "(Shape 6 above)" |
| `skills/_shared/policy-schema.md` | Remove the `tidy-routine-autonomy` row from the config-key table |
| `skills/routine/SKILL.md` | Frontmatter `argument-hint`: drop `[--variant <name>]`. Input table: delete the `--variant <name>` row; reword the `create`/`status` rows' "project+skill+variant combination"/"lists every instantiated variant" phrasing to drop variant. CREATE Step 1: drop the `--variant=<name>` branch, always read the default template. CREATE Step 3: drop the variant parenthetical. UPDATE Step 1: drop "(respecting `--variant` if passed...)" and the `[--variant=<name>]` bracket in its stop message. STATUS Step 1: drop the `--variant`-branch and the multi-template-glob/disambiguation logic in the per-skill path (every skill now ships exactly one template, so this collapses to "does `.claude-tweaks/routines/{PREFIXED_NAME}.yml` exist"). STATUS `--all` branch: drop item 3 (">1 file" disambiguation — no skill ships more than one template file anymore) and reword item 2 ("the common case (every shipped skill today except `tidy`)" → just "the only file — if the glob is empty, Orphaned"). Example table: replace the `tidy (github-triage)` row with a plain `tidy` row. Anti-Patterns: drop the "variant" bolding + the "second variant is legitimate" sentence from the duplicate-creation row; drop "or `--variant`" from the `--all`-combination row. Relationship table: drop the `/init` row's "(plus any named `routine-template-<variant>.yml` siblings)" and `[--variant=<name>]`; drop the `/tidy` row's "Tidy also ships this skill's first named variant..." sentence |
| `skills/_shared/routine-template-schema.md` | Remove the "or `skills/{skill}/routine-template-<variant>.yml` (named variant)" framing from the Template heading and its explanatory sentence; remove the variant-naming-collision Anti-Patterns row |
| `skills/init/SKILL.md` | Step 14/15 description and Relationship table: remove both "(plus any named `routine-template-<variant>.yml` siblings)" occurrences and `[--variant=<name>]` |
| `skills/init/bootstrap-steps.md` | Remove the `tidy --variant=github-triage` row from the Step 15 picklist-preview table; update "today's 7 candidates need exactly 2 groups" → 6 candidates (still 2 groups at ≤4/question); remove the variant-siblings phrasing from the picklist-construction paragraph and its `"tidy --variant=github-triage"` label example |
| `skills/init/update-mode.md` | Drop the `[--variant=<name>]` bracket from the Routine Drift re-sync invocation |
| `skills/harness-health/routine-relevance-analysis.md` | Replace the `"tidy --variant=github-triage"` example routine-identity with a plain example, e.g. `"code-health"` |
| `skills/help/reference-card.md` | Drop `[--variant <name>]` from `/claude-tweaks:routine`'s argument cell |
| `docs/getting-started.md` | Drop the `--variant=<name>` mention and its "(e.g. tidy's `github-triage`)" example from the `/claude-tweaks:routine` description |

### Version

| File | Change |
|---|---|
| `.claude-plugin/plugin.json` | Patch bump |

The marketplace-repo mirror (`.claude-plugin/marketplace.json` in `thomasholknielsen/claude-tweaks-marketplace`) happens at merge/release time per this repo's own Releasing convention — not a task inside this branch's plan, but must not be forgotten when this branch ships.

## Mechanism: relocating Archival compaction

`skills/tidy/github-routine-procedures.md` currently opens with: *"Full detail for the four
`--scope=github`-routine-firing subsections `SKILL.md`'s Step 6 summarizes... Evidence tier,
Rolling digest, Notification, and Archival compaction."* Archival compaction is the odd one out
— its own subsection heading already says *"Unlike the evidence tier, digest, and notification
subsections above ... this compaction sweep runs on every Standalone-auto `/tidy` firing
regardless of scope."* Its full procedure (matching rules for aged-out standalone/abandoned
run directories, the 4-step compact-and-log sequence) moves verbatim into `SKILL.md` under the
existing `#### Archival compaction (every Standalone-auto firing, any scope)` heading, replacing
its current one-paragraph summary + "read `github-routine-procedures.md`" pointer. Nothing about
Archival compaction's own behavior changes — only its location.

## Migration note (informational — no action in this repo)

Any project that already ran `/claude-tweaks:routine create tidy --variant=github-triage` (via
an earlier `/init` Step 15, or directly) has a live, billed cloud Routine with no delete API and
a local `.claude-tweaks/routines/{project}-tidy-github-triage.yml` record. After this change
ships, that Routine keeps firing `/claude-tweaks:tidy --scope=github` — harmlessly, since the
skill invocation itself still works — but its documentation, its Evidence-tier/digest/
notification behavior, and its `/routine status`/`update` support are all gone. Cleanup for an
existing adopter: delete the Routine manually at claude.ai/code/routines, then remove the local
`.claude-tweaks/routines/{name}.yml` record. This repo has no instantiated routine records, so
there is nothing to migrate here.

## Testing

- `npm test` must stay green after every edit, including the updated `POLICY_KEYS.length`
  assertion in `tests/policy-schema.test.js`.
- No new tests are needed — this is a deletion of markdown-driven skill behavior plus one
  schema-array entry; the only executable assertion affected is the hardcoded length check
  above.
- Manual/documentation-level check: grep the full repo for `github-triage` and `--variant` after
  all edits land, confirming zero remaining hits outside historical `docs/superpowers/specs/`
  and `docs/superpowers/plans/` files (which stay untouched as permanent historical record, per
  this repo's own CLAUDE.md convention).

## Non-goals

- No new "fast unattended GitHub check" mechanism to replace the one being removed.
- No change to how `/claude-tweaks:tidy` behaves on a full sweep or a manual `--scope=github`
  invocation — both are unchanged.
- No change to any other skill's routine template or to the routine record schema
  (`skills/_shared/routine-template-schema.md`'s field list itself, as opposed to its
  variant-naming prose).
