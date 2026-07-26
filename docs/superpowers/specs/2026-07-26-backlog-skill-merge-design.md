# Design: Merge `/triage` + `/review-backlog` into `/claude-tweaks:backlog`

## Problem

`/claude-tweaks:triage` and `/claude-tweaks:review-backlog` are two separate utility skills that both operate over the open work-record backlog:

- `/triage` grants `auto:build`/`auto:merge` over the `ready` queue (a security-boundary action, human-only, GitHub-RBAC-enforced).
- `/review-backlog` surveys the whole open backlog, suggests `priority:*` and `**Related:**` (advisory, human-confirmed), and renders three mechanical lenses (`critical`/`risk-value`/`cleanup`).

In practice this causes three compounding problems: redundant `gh issue list` round-trips when a human runs both in the same session, catalog confusion (two similarly-scoped skill names to remember), and workflow friction (switching skills mid-session to go from "understand the backlog" to "act on it").

## Scope

**In scope:** merging `/triage` and `/review-backlog` into a single new skill, `/claude-tweaks:backlog`, including the fetch/budget/presentation layering needed to make it correct at scale, and the resulting rename-only changes to `/help` and `/tidy`.

**Out of scope:** any behavioral change to `/tidy`'s own scan/repair logic, any change to the Authorization/Scoring/Stage label semantics in `_shared/work-record.md`, and any form of automated skill-to-skill invocation (`/tidy` or `/help` calling `/backlog` via the `Skill` tool and pushing a write through unattended). These are explicitly not addressed here.

## The new skill: `/claude-tweaks:backlog`

Replaces `/claude-tweaks:triage` and `/claude-tweaks:review-backlog` outright — both skill directories are deleted, no deprecated alias. This is a clean rename/merge, consistent with how this repo has handled prior skill renames (e.g. skill-health → harness-health).

```
/claude-tweaks:backlog [refine|overview] [critical|risk-value|cleanup] [--budget <n>] [--origin <origin>]
```

- No mode (bare) → `overview` — the safer, non-mutating default.
- `refine` → the write/labeling-sweep mode (today's `/review-backlog` priority/Related suggestions + today's `/triage` grant workflow, merged).
- `overview` → the read-only distribution + recommendation mode (today's `critical`/`risk-value`/`cleanup` lenses, collapsed, plus a new "what to build next" recommendation).
- `critical`/`risk-value`/`cleanup` → lens sub-arguments, valid only under `overview` (unchanged meaning from today's `/review-backlog`).
- `--budget <n>` → caps LLM-bound processing in `refine` (see Data Flow below); caps table row rendering in `overview` (mirrors `/help`'s existing dashboard row cap).
- `--origin <origin>` → filters `refine`'s grant-sweep worklist by `facets.origin` (unchanged meaning from today's `/triage`).

### Mode: `refine` (write)

The comprehensive "ensure every issue has the right labels" sweep, covering exactly the Authorization axis (`auto:build`/`auto:merge`) and the `priority:*`/`**Related:**` fields — never the labels `/tidy` owns (`parked`, `bot:in-progress`, legacy taxonomy).

1. Fetch (see Data Flow below).
2. Suggest `priority:*`/`**Related:**` for unscored/under-labeled records (today's `/review-backlog` bare-mode synthesis — narrative clusters, per-record rationale).
3. Grant-check every `ready`+ungranted record via `/claude-tweaks:assess-agent-autonomy` (`grant-check` mode) — today's `/triage` Step 2, unchanged.
4. Immediately before writing any grant, re-verify the record's body is still spec-shaped (today's `/triage` Step 3.5) — this stays embedded in the grant sub-step itself, not hoisted out to a separate hygiene pass, because "labels are projection, not truth" requires the actor about to *write* a grant to re-verify at write-time against whatever the body says right now, not trust an earlier pass that could be stale.
5. Present **one unified label-correction table** — priority/Related suggestions and grant recommendations together, distinguished by a `Type` column (`priority` / `related` / `grant`) so a human scanning it can still see at a glance which rows are security-relevant — confirmed via **one** `AskUserQuestion` (apply-all / override / skip). This is a deliberate simplification of today's two-separate-confirms pattern, chosen explicitly over keeping the grant confirm structurally separate.
6. Apply. Writes follow the exact same mechanics as today's two skills (label add/remove, body rewrite for `**Related:**`, `bot:blocked` strip on re-grant) — nothing about *how* a write happens changes, only that both write types are now suggested and confirmed together.

**Preflight is mode-conditional, not skill-wide.** The priority/Related half works under both `work-backend` drivers (unchanged from today's `/review-backlog`). The grant half hard-stops under `work-backend: local-files` — but this only skips *that* sub-stage and reports "grants not applicable under local-files" (matching today's `/triage` local-files message), it does not abort the whole `refine` run. This is a deliberate divergence from today's `/triage`, which stops its entire turn on `local-files` — that made sense when grants were the skill's only job; it doesn't once `refine` has a second, still-valid half.

### Mode: `overview` (read)

Entirely mechanical — no per-record LLM reads, so it scales to the full fetched set cheaply (see Data Flow). Collapses today's `critical`/`risk-value`/`cleanup` lenses into one picture, and adds a genuinely new "recommend what to build next" section (extracted shared ranking logic — see `/help` Changes below). Scoped specifically to *which backlog/ready record deserves attention next* — it does not attempt to replace `/help`'s whole-pipeline status/recommendation role (PRs, reviews, wrap-ups, etc. stay `/help`'s job).

## Data flow: fetch, LLM budget, and presentation, as three independent layers

A naive single `--limit` conflates three different scaling concerns. This design keeps them separate:

**Layer 1 — Fetch completeness.** `gh issue list --limit N` auto-paginates internally regardless of how large `N` is — it isn't capped at a fixed page size. Both of `refine`'s `work-backend: github-issues` fetches (an unfiltered `--state open` pull for the priority/Related half, a `--label ready --state open` pull for the grant half) route through `_shared/record-queue-fetch.md`, extended with a new project config key, `backlog-fetch-limit` (default `1000`), replacing today's hardcoded 200/500 limits. Under `work-backend: local-files`, only the priority/Related fetch runs (`queryRecords`, no pagination concern) — the grant fetch never fires at all, per the Preflight rule above. `overview` routes through the same fragment as the priority/Related fetch. **Truncation is actively detected, not just documented as a caveat:** if a fetch's returned count equals the limit, surface an explicit warning ("fetched exactly `{limit}` issues — there may be more; raise `backlog-fetch-limit` or run `/tidy` to reduce backlog volume") rather than silently treating the result as complete.

**Layer 2 — LLM-judgment budget.** Two sub-passes in `refine` require a per-record LLM call: the priority/Related synthesis (reads unscored bodies, today's `--budget`, default 40, unchanged) and the grant-check loop (calls `assess-agent-autonomy` once per `ready`+ungranted record — today implicitly bounded only by the fetch's own limit, with no resumability). Both are now explicitly bounded by `--budget` (the same flag, applied independently to each pass) with the same "`{remaining}` more exist — re-run to continue" residue reporting `/review-backlog` already uses for its synthesis pass today. This decouples LLM cost from fetch completeness — a fetch can pull 1000 records while each LLM pass still only processes a bounded slice per run.

**Layer 3 — Presentation cap.** `overview`'s distribution views run over the full fetched set (cheap — pure filter/sort, no LLM cost) but table rendering still needs a row cap so the output stays readable. `--budget` in `overview` mode governs this row cap (default matching `/help`'s existing dashboard convention), with the same overflow-note pattern. This reuses the `--budget` flag name across modes with mode-specific meaning (LLM-processing cap in `refine`, row-render cap in `overview`) — consistent with how `--budget` already means "how many things do I process/show, calibrated per consumer" elsewhere in this codebase (`/review-backlog`, `/help`).

## Permission boundaries: unchanged

Nothing about *who may write what* changes. `_shared/work-record.md`'s permission matrix rows for `/triage` and `/review-backlog` collapse into one row for `/claude-tweaks:backlog`, but the actual grants stay identical: `refine` may add `auto:build`/`auto:merge` (human-confirmed) and `priority:*`/updates to `**Related:**` (human-confirmed); it still never touches `auto:*` on a headless path, never adds `bot:*`, never touches `ready`/`risk:*`/`effort:*` except the existing inline-scoring-override path, and never shapes a record body beyond the `**Related:**` line. The Component-Skill Contract stays **human-only** — matching both predecessor skills' current stance — no parent skill invokes `/backlog` and pushes a grant through without a human seeing the batch table.

## `/help` changes

No new responsibilities — `/help` stays the whole-pipeline, read-only dashboard. Two changes:

1. **Shared ranking helper (new extraction).** `/help`'s Priority Order / Tie-Breaking (`SKILL.md` Section 3) is currently prose-only rules baked into the skill file. `/backlog overview`'s new "recommend what to build next" needs the identical tie-break logic (priority → unblocks-others → no file overlap → smaller effort → has plan). Extract this once into a new module, `bin/lib/issues/ranking.js`, and have both `/help` and `/backlog overview` call it — mirroring how `groupByFileOverlap` is already shared between `/specify` and `/help`.
2. **Cross-reference rename.** Stage 4.6 ("Triage Queue") scan wording and both Relationship-table rows (`/claude-tweaks:triage`, `/claude-tweaks:review-backlog`) point at `/claude-tweaks:backlog refine` / `/claude-tweaks:backlog overview` respectively. No structural change to the scan itself.

## `/tidy` changes

`/tidy`'s Action Vocabulary (Delete / Defer / Absorb / Promote / Keep / Sync / Close / Resolve-thread / Capture) never overlaps with `priority:*`, `**Related:**`, or the Authorization axis — even its closest-sounding finding, Shape 7 (legacy taxonomy labels), is explicitly documented as read-only ("`/tidy` never relabels it"). The distinction that falls out of this: **`/backlog refine` decides** (assigns new judgment to well-formed records); **`/tidy` repairs** (fixes/flags records whose existing state has gone stale or broken). Given that, folding `/tidy` in is a **pure rename, zero behavior change**:

- `scan-procedures.md` Shape 5 ("`bot:blocked`... re-authorize at `/claude-tweaks:triage`") → `/claude-tweaks:backlog refine`
- `SKILL.md` Step 6 report row 8, Next Actions Option 4, and the four Step 4.8 code-health/harness-health/journey-health/docs-health mentions → same rename
- The Relationship-table row for `/claude-tweaks:triage` → becomes a row for `/claude-tweaks:backlog`, describing the `refine`-mode reciprocal relationship (bot:blocked surfacing, pending-authorization count)
- The Relationship-table row for `/claude-tweaks:review-backlog` → becomes `/claude-tweaks:backlog`, describing that the `unsynced: true` fold-in now lives specifically in `overview` mode

This dual-surfacing of the same facts (a `bot:blocked` record showing up in both a `/tidy` sweep and `/backlog refine`'s own grant-sweep) is not a new redundancy introduced by this merge — it's today's existing intentional design ("surfaces it proactively during hygiene instead of waiting for a triage run"), carried forward under the new name.

## Migration scope

Beyond `/help` and `/tidy` above, the rename touches every file that references `/claude-tweaks:triage` or `/claude-tweaks:review-backlog` by name. At minimum: `/dispatch`, `/capture`, `/specify`, `/demo`, `/assess-agent-autonomy` (grant-check mode is invoked by `refine`, same as today), `_shared/work-record.md` (permission matrix row, Consumers table), CLAUDE.md (skill inventory under "Utility," the "33 total" skill count becomes 32), and README.md. Also: `bin/lib/issues/review-backlog.js` is renamed to `bin/lib/issues/backlog.js` (its existing exports — `filterCritical`, `rankRiskValue`, `filterCleanup`, `selectBudgetSlice`, `mergeUnsyncedRecords`, `deriveCreatedAtFromGit` — carry over unchanged, plus new functions for the grant-sweep budget/residue logic), and its test file moves with it. A new `bin/lib/issues/ranking.js` module backs the shared recommendation logic (`/help` Changes above). This is a genuine whole-branch-review risk given how many files carry bidirectional Relationship-table rows for the two retiring skill names — the implementation plan must include an explicit repo-wide grep-and-verify pass, not just the files enumerated here.

The plugin version bump (`.claude-plugin/plugin.json`, feature addition → minor bump) and its marketplace-repo mirror must be an explicit step in the implementation plan, not left implicit.

## Non-Goals

- No change to `/tidy`'s own scan/repair logic or finding shapes.
- No change to the Authorization/Scoring/Stage label semantics in `_shared/work-record.md` — only which skill file writes them.
- No automated skill-to-skill invocation from `/tidy` or `/help` into `/backlog` — both remain "recommend the command," same as today.
- No deprecated alias for the old skill names — this is a clean cut.
