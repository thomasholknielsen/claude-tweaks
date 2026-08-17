# Pipeline Config Manifesto — Step 3

The Manifesto is the **first bookend** of the pipeline (see `_shared/auto-mode-contract.md`). One structured table collects every policy lever the pipeline needs. After it's resolved, downstream skills look up policy here — they do not re-ask the user.

## When to run

In every mode except `interactive`, the Manifesto **computes the levers and writes `config.yml`** (downstream skills need a value to read). What changes by mode is whether it stops for approval:

- **`auto` mode (flow's default)** — **read-only FYI.** Compute the levers, render them as a `### Pipeline Config (auto)` table (value + source), print `→ proceeding (no approval needed)`, and continue. No approval stop. This is the everyday path.
- **`confirm` mode** — **approval gate.** Present the full Manifesto with the `Approve all / Override / Cancel` block and wait. After approval the rest of the pipeline runs as `auto`. Use when the user wants to inspect/tweak levers first.
- **`hybrid` mode** — approval gate (same as `confirm`); policies set here are honored, but skills still prompt for non-floor decisions.
- **`interactive` mode** — no Manifesto, and this step creates no run directory; skills present each decision in-flow (they prompt rather than read `config.yml`). The run does still acquire a run directory before it ends: `/claude-tweaks:wrap-up`'s Phase 1 creates one unconditionally, in every mode, because its Review Console runs in every mode. That one carries no `config.yml` — nothing ran a Manifesto to write one — so the in-flow prompting above is unaffected.

## Compute recommendations

Walk the precedence chain (see `_shared/auto-mode-contract.md`):

1. Explicit CLI args from `$ARGUMENTS` (e.g., `no-polish` sets `polish: skip`)
2. Pipeline-config file from a previous run that's still active in this session (rare; usually skipped)
3. Project policy — the resolved `auto-mode` value: `AUTO_MODE=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values auto-mode)` (empty when `.claude-tweaks/policy.yml` leaves it unset — the key has no schema default)
4. Hardcoded sensible defaults (last resort)

For each lever, record both the recommended value AND its source so the user can see why each value was suggested.

**Git lever override.** When `.claude-tweaks/policy.yml` sets `worktree-always: true`, the Git lever is forced to `worktree` regardless of CLI args or defaults above — `current-branch` is never offered or accepted. This is enforced mechanically by a `PreToolUse` gate (see `_shared/git-discipline.md`), so a stale/overridden config value would simply get every edit denied; the Manifesto short-circuits to `worktree` here to avoid presenting a choice that can't actually be honored.

**Ceremony profile computation.** Unlike the other levers (policy preferences resolved via the precedence chain above), `ceremony-profile`'s value is computed by folding every record's materialized `ceremony:` header field (`materialize.md`) with a logical AND: `fast-lane` only when every record in this run has `ceremony: fast-lane`; any record missing the field (defaults to `standard`) or carrying an explicit `standard` sends the whole run's `ceremony-profile` to `standard` — mirrors the auto-merge gate's existing "every member of the group must carry `auto:merge`" rule (`dispatch/SKILL.md`'s Auto-merge gate). Source is always `header`. The computed value still becomes this lever's Recommended value, which the human can override via the normal `9=value` mechanism below — unlike Design intent (a prior human decision from `/specify`, not re-litigated here), `ceremony-check`'s verdict is itself a fresh automated judgment call, and this Manifesto is the first point a human sees it.

## Compute per-spec preview

Before rendering the Manifesto, derive a per-spec preview by reading each record's materialized header when one exists — pre-materialization, fall back to the record body's `Surface:`/`Design-intent:` metadata lines — and inferring what will run:

| Field | Source | How to derive |
|---|---|---|
| Surface | Materialized header `surface:` (`materialize.md`) — or the record body's `Surface:` line when no run-dir header exists yet (or detect from Key Files extensions, using the same trigger-extension/trigger-path rules as `/claude-tweaks:design-wrapper`'s Layer 3 sniff — for the canonical list, read `frontend-detection.md` in that skill's directory) | `frontend` if trigger files present; else `backend` / `infra` per header or content |
| Ceremony | Materialized header `ceremony:` (`materialize.md`) — always present | Read directly (`fast-lane` or `standard`) |
| Polish | `surface` × materialized header `design-intent:` (or the body's `Design-intent:` line) × `no-polish` arg | `run` if frontend + design-intent != none + no-polish not set; `skip ({reason})` otherwise |
| Stories | UI files in plan + `no-stories` arg | `auto-detect` if UI files in plan + no-stories not set; `skip` otherwise |
| QA | `stories/*.yaml` exists for this record's surface | `run` if matching stories; `skip` if none |
| Friction note | Lever recommendations × record content | One-line warning when an approved lever still introduces prompts for this record (e.g., review-auto-apply-ceiling `low` + a frontend record with prior HIGH findings) |

Suppress the preview table entirely when only one spec is run and Polish, Stories, and QA all read `skip` or `none` — present a single-line summary instead.

## Determine lever suppressions

A lever is **suppressed** (hidden from the Manifesto) when no skill in the resolved step list consumes it. Suppression rules:

| Lever | Suppressed when |
|---|---|
| **Overlap** (3) | `/specify` not in the pipeline (always suppressed for `/flow` — specs already exist) |
| **Design intent** (4) | All records have `design-intent:` locked in their materialized header (or body metadata), OR all records are non-frontend (polish auto-skips regardless) |
| **Tidy aggressiveness** (8) | Always suppressed by `/flow` — `/tidy` is not an allowed flow step at all (`steps-and-gates.md`'s Allowed Steps table lists it unconditionally under "Not allowed in flow") and can never be added to a step list. Still written to `config.yml` (per the "suppression is a UI affordance" rule below) since a standalone `/tidy` run can independently resolve the same run directory and read this lever's value. Kept in the canonical lever count for stable numbering across all skills that reference these levers. |
| **Auto-fix threshold** (6) | `/test` not in the step list |
| **Review auto-apply ceiling** (7) | `/review` not in the step list |
| **Leftover routing** (5) | `/wrap-up` not in the step list |
| **Merge verification** (11) | `/wrap-up` not in the step list (the merge step never runs, so nothing reads it this run) |
| **Design critique** (12) | Every record in the run is non-frontend (materialized `surface:` header is `backend`/`infra` on all of them — the same input Design intent (4) reads; critics never dispatch on a non-frontend diff). Still written to `config.yml` per the "suppression is a UI affordance" rule below |

Always visible: **Mode** (1), **Scope-creep** (2), **Ceremony profile** (9), **Model stance** (10) — they affect every pipeline.

When a lever is suppressed, mention it once in the Suppressed footer below the table so the user knows it was considered and dropped.

## Present the Manifesto

The template below is the **`confirm` / `hybrid` (approval-gate)** rendering — it ends with the `Approve all / Override / Cancel` `AskUserQuestion` call and waits.

**In default `auto` mode, render the FYI variant instead:** show the same preview + policy-levers tables, but change the heading to `### Pipeline Config (auto)`, drop the approval call entirely, and close with a single line — `→ proceeding (no approval needed) · run with \`confirm\` to review/override`. Then continue to Step 4. Do not wait for input.

```markdown
### Pipeline Config Manifesto

{Pipeline-shape preamble — one of:
  - Multi-spec: "Sequential run: 157 → 159 → 160 ({worktree | current-branch})"
  - Single-spec: "Single spec: 42 ({worktree | current-branch})"}

#### Pipeline preview

| Spec | Surface | Polish | Stories | QA | Friction note |
|---|---|---|---|---|---|
| 157 | infra | skip (design-intent:none) | skip (no UI) | skip (no stories) | — |
| 159 | infra | skip | skip | skip | — |
| 160 | web | run (design-intent:quiet) | auto-detect | skip (no stories) | — |

**Expected friction under these defaults:** {one of:
  - "none — auto runs end-to-end."
  - "occasional prompts: {synthesize from per-spec friction notes — e.g., 'review may surface HIGH findings on spec 42'}"}

#### Policy levers

I've pre-filled recommendations from project policy + sensible defaults. The Recommendation is **bold** inside the Options column so override is "spot the not-bold one."

**Canonical lever numbering** (stable across all `/flow` runs): 1=Mode, 2=Scope-creep, 3=Overlap, 4=Design intent, 5=Leftover routing, 6=Auto-fix threshold, 7=Review auto-apply ceiling, 8=Tidy aggressiveness, 9=Ceremony profile, 10=Model stance, 11=Merge verification, 12=Design critique. The table below shows only the levers active for this run; the **Suppressed** line below names which numbers are unselectable.

| # | Lever | Recommended | Options | Effect if approved |
|---|---|---|---|---|
| 1 | Mode | **auto** | **auto** / hybrid / interactive | Pipeline runs hands-off; failures surface via ledger / failure card |
| 2 | Scope-creep | **add-to-plan** | **add-to-plan** / stop-and-ask / drop | Files outside plan auto-added; nothing dropped silently |
| 5 | Leftover routing | **defer** | **defer** / backlog / drop | Unfinished sections → a new work record (parked), reversible at Review Console |
| 6 | Auto-fix threshold | **lint+type** | lint-only / **lint+type** / lint+type+test | Lint + type errors auto-fixed; test failures still surface |
| 7 | Review auto-apply ceiling | **{computed}** | none / low / medium | Computed ceiling-conditionally per the Recommendation-defaults row: `medium` under an `unattended` autonomy ceiling, `low` otherwise. At `low`: LOW findings auto-applied, MED staged, HIGH still prompts; at `medium`: MED auto-applies too |
| 9 | Ceremony profile | **{computed}** | **fast-lane** / standard | Fast-lane trims wrap-up ceremony depth (reflect light mode, narrower skill-curation scan, doc-scan pre-check); standard runs full depth |
| 10 | Model stance | **default** | economy / **default** / max-rigor | Shifts every dispatch's resolved effort one notch (`economy` also degrades Frontier to Capable); never changes which profile a dispatch requests |
| 11 | Merge verification | **{derived}** | **merge-when-green** / wait / off | How much CI verification the run's merge into the integration branch waits for — derived per `_shared/policy-schema.md`'s `merge-verification` coverage block (`node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values merge-verification`); explicit `policy.yml` value wins. Merge sites act on it from #560 onward |
| 12 | Design critique | **{resolved}** | off / **auto** / full | `off (never) / auto (critics when DESIGN.md exists or the record asks) / full (always)` — governs whether project-local craft critics run at review time (`skills/design-wrapper/critics.md`, dispatched by `review` mode Step 3.8). Read via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" design-critique` (the JSON envelope, so `source` is available for the log line); Recommended = the resolved `value`; log its resolution to `decisions.md` as `AUTO {time} — Manifesto: design-critique resolved to {value} (source: {source}). Reversibility: n/a (a policy read, not a code mutation).` |

**Suppressed (not applicable to this run):** 3 (overlap — `/specify` not in pipeline), 4 (design intent — locked by the materialized header on all 3 records: none/none/quiet), 8 (tidy — not in default `/flow`). **Valid overrides for this run:** 1, 2, 5, 6, 7, 9, 10, 11, 12.

#### Override semantics (read before overriding)

| Lever | Option | What changes |
|---|---|---|
| Mode | `hybrid` | Same as auto but skills still prompt when reversibility/confidence/severity floors fail |
| Mode | `interactive` | Skips the Manifesto pipeline-wide; every skill presents decisions in-flow as today |
| Scope-creep | `stop-and-ask` | Pipeline pauses inline when files outside plan are referenced |
| Scope-creep | `drop` | Files outside plan are noted in `decisions.md` but not added |
| Leftover routing | `backlog` | Unfinished sections route to a new work record with no stage label, instead of `parked` |
| Leftover routing | `drop` | Unfinished sections are noted in `decisions.md` but no work record staged |
| Auto-fix threshold | `lint-only` | Type errors surface as prompts; tests always surface |
| Auto-fix threshold | `lint+type+test` | Mechanical test failures also auto-fixed (rare; risky — semantic changes hidden) |
| Review auto-apply ceiling | `none` | All findings auto-applied (lowest friction, highest revert load) |
| Review auto-apply ceiling | `medium` | LOW + MED auto-applied; only HIGH prompts |
| Ceremony profile | `standard` | Forces full-depth wrap-up ceremony (reflect full mode, unrestricted skill-curation scan, doc/CLAUDE.md/ADR sub-scans) even though `ceremony-check` verdicted `fast-lane` for every record |
| Ceremony profile | `fast-lane` | Forces the fast-lane shape even if a record's `ceremony:` header was `standard` (or one member of a bundle was) — an active, informed human override, not the automated default |
| Model stance | `economy` | Every profile's resolved effort drops one notch on `EFFORT_SCALE`; a Frontier resolution additionally degrades to Capable — lower cost, lower rigor |
| Model stance | `max-rigor` | Every profile's resolved effort rises one notch, capped at `max`; never promotes a profile's model upward |
| Merge verification | `merge-when-green` | Merge sites arm `--auto` and let the forge merge once checks are green (the derived recommendation on a default-branch pr-first repo with PR CI) |
| Merge verification | `wait` | Merge sites block on the checks before merging — explicit-config-only, never derived |
| Merge verification | `off` | Merge sites merge without consulting CI (the derived value for local-merge, no-PR-CI, or non-default-integration-branch repos) |
| Design critique | `full` | Every web-track UI diff gets the full critic roster at review time regardless of `DESIGN.md` presence |
| Design critique | `off` | No project-local critics run at review time; Impeccable's own `critique`/`audit` and the finish reviewer are unaffected |
```

Immediately after presenting the Manifesto table above, call `AskUserQuestion` with:

- `question`: `"Approve these pipeline levers, override specific ones, or cancel the pipeline?"`, `header`: `"Pipeline Config Manifesto"`, `multiSelect`: `false`
- Option 1 — `label`: `"Approve all (Recommended)"`, `description`: `"Run the pipeline with the recommended lever values shown above."`
- Option 2 — `label`: `"Override"`, `description`: `"Reply with one or more #=value pairs from the valid-overrides list (e.g., 2=stop-and-ask, 7=medium) — see Override semantics below."`
- Option 3 — `label`: `"Cancel pipeline"`, `description`: `"Abort; do not create the run directory."`

If "Override" is chosen, the `#=value` pairs are ordinary free-text chat in the next message, per docs/skill-authoring.md's Multi-item decisions convention — not the tool's `Other` field. At least one pair is required; a bare selection with no pairs is invalid and will re-prompt for the pair(s).

### Rendering rules for the preview

- **All-skip single-spec run:** replace the preview table with one line — e.g., `Preview: spec 42 (infra) — pipeline runs without polish / stories / QA. No friction expected.`
- **Mixed-surface multi-spec run:** keep the table; per-spec rows make the contrast visible (one frontend, two backend, etc.).
- **Friction note column:** only populate when a recommended lever value will introduce a mid-flow prompt for *this* spec under the *recommended* values. If "Approve all" runs silently for that spec, leave the column as `—`.

## Source values

| Source | Meaning |
|---|---|
| `arg` | Set by an explicit CLI argument in `$ARGUMENTS` |
| `policy` | From `.claude-tweaks/policy.yml`'s `auto-mode:` key (resolver envelope `source: "policy"`) |
| `default` | Hardcoded sensible default |
| `header` | Locked by the materialized header (`materialize.md`) — e.g. `surface:`/`design-intent:`/`ceremony:` — or the record body's `Surface:`/`Design-intent:` metadata lines (e.g., `design-intent:` set on every record in the run) |

## Recommendation defaults (when no arg and no policy)

| Lever | Default | Why |
|---|---|---|
| Mode | `auto` | User invoked `/flow auto`; only here if they did |
| Scope-creep | `add-to-plan` | Safest: never silently drop work the user mentioned |
| Overlap | `companion` | Safest: never overwrite or silently extend; create a new spec |
| Design intent | `none` | No creative direction unless user opts in |
| Leftover routing | `defer` | Reversible; user reviews at Wrap-Up Review Console |
| Auto-fix threshold | `lint+type` | Mechanical fixes only; semantic test failures need judgment |
| Review auto-apply ceiling | ceiling-conditional: `medium` when the resolved `autonomy` ceiling is `unattended`, `low` otherwise (`_shared/autonomy-ceiling.md`) | Auto LOW (nits), stage MED, prompt HIGH — but an unattended run has nobody present to answer staged MED items, so the ceiling raises the default there. Computing it here, not only in `step3-routing.md`, is load-bearing: the Manifesto writes this lever into `config.yml`, which resolves as `source: run-config` downstream — a flat `low` written here would make step3's own ceiling-conditional branch (which fires only on `source: default`) unreachable on exactly the runs it was designed for |
| Tidy aggressiveness | `moderate` | Reversible git-tracked cleanups auto-apply; outward-facing GitHub writes still stage (`conservative` is the opt-down) |
| Model stance | `default` | No effort shift, no Frontier degrade; the resolver's own table rows apply unmodified |
| Merge verification | derived (`resolve-policy.js --run "$PIPELINE_RUN_DIR" --values merge-verification`) | The ladder in `_shared/policy-schema.md`'s coverage block already encodes the safe answer per repo shape; no hardcoded literal |
| Design critique | `auto` | Critics run when the project shows design investment (`DESIGN.md`) or the record asks (`Design-intent:`); `full`/`off` are explicit opt-in/opt-out |

`ceremony-profile` (lever 9) has no row here — its source is always `header` (the bundle-folded
`ceremony:` value from each record's materialized header), never `arg`/`policy`/`default`. That is
what "always-present label" buys: `/claude-tweaks:specify` stamps `ceremony:*` on every record it
shapes, so the header always carries a value and there is nothing for a default to fill in. Was
`docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md`'s "Promoting `ceremony:`
to an explicit, always-present label" — deleted `70849915`.

## Approval flow

**In default `auto` mode (FYI, no gate):** write the computed values straight to `config.yml` (same schema as below), initialize `decisions.md` with the config snapshot header, create `staged/`, then proceed to Step 4 without waiting. The FYI table has already shown the user what was chosen; there is no approval step to process. This is the everyday path. The `Approve all / Override / Cancel` handling below applies only to `confirm` and `hybrid` modes.

**On approval (option 1):** write the chosen values to `$RUN_ROOT/.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/config.yml` (see Path conventions below for `$RUN_ROOT`):

```yaml
mode: auto
scope-creep: add-to-plan
overlap: companion
design-intent: none
leftover-default: defer
auto-fix-threshold: lint+type
review-auto-apply-ceiling: low   # ceiling-conditional — medium when the run's resolved autonomy ceiling is unattended (Recommendation defaults)
tidy-aggressiveness: moderate
ceremony-profile: fast-lane
model-stance: default
merge-verification: merge-when-green
design-critique: auto
spec: 42
created: 2026-05-15T143207
```

Suppressed levers are still written to `config.yml` with their default values — suppression is a UI affordance, not a semantic skip. Downstream skills always have a value to read.

Initialize `decisions.md` in the same directory with the config snapshot header (see `_shared/auto-decision-log.md`). Create the `staged/` subdirectory.

**On override (option 2):** parse the user's `#=value` pairs, apply them to the recommendation set, validate each value against the lever's option vocabulary (reject typos with an inline retry), write the final config to `config.yml`. Do not loop on the Manifesto itself — the user gives all overrides in one reply. If validation fails on any pair, present a single retry line listing the invalid pairs only (`Invalid: 2=foo (must be add-to-plan / stop-and-ask / drop)`).

**On cancel (option 3):** abort the pipeline. Do not create the run directory.

## Path conventions

- Run directory: `$RUN_ROOT/.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/` — created via
  `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" resolve-run-dir --spec-slug "{spec-slug}" --create`
  (`_shared/pipeline-run-dir.md`'s Anchoring section), **never** by composing `$RUN_ROOT` from the
  current directory. This is not optional bookkeeping: `/claude-tweaks:dispatch` Step 5 enters a group's worktree *before*
  dispatching this Manifesto step, so a bare relative path here would
  create the run directory inside that worktree — exactly the state the Anchoring section
  exists to prevent, since a worktree removal later would then permanently destroy
  `config.yml`/`decisions.md`/`staged/` with no git history to recover from (`[IL-46]`'s shape).
  Call the command once, before creating anything else, and build every later path in this
  section from its printed output — `cd`-ing into the run directory afterward for convenience is
  fine, resolving the *path* relative to cwd is not.
- `ISO-timestamp` is `YYYY-MM-DDTHHMMSS` (no colons; portable across filesystems)
- `spec-slug` uses a single `spec-` prefix on numeric IDs to disambiguate from timestamp digits: `spec-42` (single spec), `spec-42-45-48` (multi-spec, dash-joined), or a non-numeric topic slug like `meal-planning` (no prefix needed). See `_shared/pipeline-run-dir.md` for the canonical SPEC_SLUG conventions.
- Collisions never happen — multiple parallel agents in the same checkout each get their own run directory
- The run directory and its path are exposed to downstream skills via the `PIPELINE_RUN_DIR` env var (set in the skill chain)
- After successful pipeline closure, `/wrap-up` moves the directory to `.claude-tweaks/pipelines/archive/`

**Manifesto is the only mid-pipeline policy stop.** After this, no skill asks the user about scope-creep, overlap, design-intent, etc. They read `config.yml` and apply.
