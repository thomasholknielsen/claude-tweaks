# Pipeline Config Manifesto — Step 3

The Manifesto is the **first bookend** of the pipeline (see `_shared/auto-mode-contract.md`). One structured table collects every policy lever the pipeline needs. After it's resolved, downstream skills look up policy here — they do not re-ask the user.

## When to run

In every mode except `interactive`, the Manifesto **computes the levers and writes `config.yml`** (downstream skills need a value to read). What changes by mode is whether it stops for approval:

- **`auto` mode (flow's default)** — **read-only FYI.** Compute the levers, render them as a `### Pipeline Config (auto)` table (value + source), print `→ proceeding (no approval needed)`, and continue. No approval stop. This is the everyday path.
- **`confirm` mode** — **approval gate.** Present the full Manifesto with the `Approve all / Override / Cancel` block and wait. After approval the rest of the pipeline runs as `auto`. Use when the user wants to inspect/tweak levers first.
- **`hybrid` mode** — approval gate (same as `confirm`); policies set here are honored, but skills still prompt for non-floor decisions.
- **`interactive` mode** — no Manifesto and no run directory; skills present each decision in-flow (they prompt rather than read `config.yml`).

## Compute recommendations

Walk the precedence chain (see `_shared/auto-mode-contract.md`):

1. Explicit CLI args from `$ARGUMENTS` (e.g., `no-polish` sets `polish: skip`)
2. Pipeline-config file from a previous run that's still active in this session (rare; usually skipped)
3. Project policy from `.claude-tweaks/policy.yml` (if exists) or CLAUDE.md `auto-mode:` keys
4. Hardcoded sensible defaults (last resort)

For each lever, record both the recommended value AND its source so the user can see why each value was suggested.

**Git lever override.** When `.claude-tweaks/policy.yml` sets `worktree.always: true`, the Git lever is forced to `worktree` regardless of CLI args or defaults above — `current-branch` is never offered or accepted. This is enforced mechanically by a `PreToolUse` gate (see `_shared/git-discipline.md`), so a stale/overridden config value would simply get every edit denied; the Manifesto short-circuits to `worktree` here to avoid presenting a choice that can't actually be honored.

## Compute per-spec preview

Before rendering the Manifesto, derive a per-spec preview by reading each record's materialized header when one exists — pre-materialization, or under the legacy spec-file alias, fall back to the record body's `Surface:`/`Design-intent:` metadata lines or the spec file's own header fields — and inferring what will run:

| Field | Source | How to derive |
|---|---|---|
| Surface | Materialized header `surface:` (`materialize.md`) — or the record body's `Surface:` line / the legacy spec file's `surface:` header field when no run-dir header exists yet (or detect from Key Files extensions) | `frontend` if `.tsx/.jsx/.vue/.svelte/.css` files present; else `backend` / `infra` per header or content |
| Polish | `surface` × materialized header `design-intent:` (or the body's `Design-intent:` line / legacy spec `design-intent:`) × `no-polish` arg | `run` if frontend + design-intent != none + no-polish not set; `skip ({reason})` otherwise |
| Stories | UI files in plan + `no-stories` arg | `auto-detect` if UI files in plan + no-stories not set; `skip` otherwise |
| QA | `stories/*.yaml` exists for this record's surface | `run` if matching stories; `skip` if none |
| Friction note | Lever recommendations × record content | One-line warning when an approved lever still introduces prompts for this record (e.g., review-severity-floor `low` + a frontend record with prior HIGH findings) |

Suppress the preview table entirely when only one spec is run and all four columns are `skip` or `none` — present a single-line summary instead.

## Determine lever suppressions

A lever is **suppressed** (hidden from the Manifesto) when no skill in the resolved step list consumes it. Suppression rules:

| Lever | Suppressed when |
|---|---|
| **Overlap** (3) | `/specify` not in the pipeline (always suppressed for `/flow` — specs already exist) |
| **Design intent** (4) | All records have `design-intent:` locked in their materialized header (or body metadata / legacy spec header), OR all records are non-frontend (polish auto-skips regardless) |
| **Tidy aggressiveness** (8) | Effectively always suppressed by `/flow` — `/tidy` is not in the default step list. This lever is consulted only when a `/flow` caller explicitly adds `/tidy` to the step list (rare). Kept in the canonical 8-lever count for stable numbering across all skills that reference these levers. |
| **Auto-fix threshold** (6) | `/test` not in the step list |
| **Review severity floor** (7) | `/review` not in the step list |
| **Leftover routing** (5) | `/wrap-up` not in the step list |
| **Unattended tier** (9) | `/wrap-up` not in the step list — none of its three behaviors (ledger routing, queue-write filing, ops-ack) run outside wrap-up |

Always visible: **Mode** (1), **Scope-creep** (2) — they affect every pipeline.

When a lever is suppressed, mention it once in the Suppressed footer below the table so the user knows it was considered and dropped.

## Present the Manifesto

The template below is the **`confirm` / `hybrid` (approval-gate)** rendering — it ends with the numbered `Approve all / Override / Cancel` block and waits.

**In default `auto` mode, render the FYI variant instead:** show the same preview + policy-levers tables, but change the heading to `### Pipeline Config (auto)`, drop the numbered approval block entirely, and close with a single line — `→ proceeding (no approval needed) · run with \`confirm\` to review/override`. Then continue to Step 4. Do not wait for input.

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
| 160 | infra | skip | skip | skip | — |

**Expected friction under these defaults:** {one of:
  - "none — auto runs end-to-end."
  - "occasional prompts: {synthesize from per-spec friction notes — e.g., 'review may surface HIGH findings on spec 42'}"}

#### Policy levers

I've pre-filled recommendations from project policy + sensible defaults. The Recommendation is **bold** inside the Options column so override is "spot the not-bold one."

**Canonical lever numbering** (stable across all `/flow` runs): 1=Mode, 2=Scope-creep, 3=Overlap, 4=Design intent, 5=Leftover routing, 6=Auto-fix threshold, 7=Review severity floor, 8=Tidy aggressiveness, 9=Unattended tier. The table below shows only the levers active for this run; the **Suppressed** line below names which numbers are unselectable.

| # | Lever | Recommended | Options | Effect if approved |
|---|---|---|---|---|
| 1 | Mode | **auto** | **auto** / hybrid / interactive | Pipeline runs hands-off; failures surface via ledger / failure card |
| 2 | Scope-creep | **add-to-plan** | **add-to-plan** / stop-and-ask / drop | Files outside plan auto-added; nothing dropped silently |
| 5 | Leftover routing | **defer** | **defer** / backlog / drop | Unfinished sections → a new work record (parked), reversible at Review Console |
| 6 | Auto-fix threshold | **lint+type** | lint-only / **lint+type** / lint+type+test | Lint + type errors auto-fixed; test failures still surface |
| 7 | Review severity floor | **low** | none / **low** / medium | LOW findings auto-applied; MED staged; HIGH still prompts |
| 9 | Unattended tier | **off** | **off** / on | Floor-clearing ledger residue, queue writes, and ops-ack resolve without a click; off leaves today's behavior unchanged |

**Suppressed (not applicable to this run):** 3 (overlap — `/specify` not in pipeline), 4 (design intent — locked by the materialized header on all 3 records), 8 (tidy — not in default `/flow`). **Valid overrides for this run:** 1, 2, 5, 6, 7, 9.

---

1. **Approve all** **(Recommended)**
2. **Override** — reply with one or more `#=value` pairs from the valid-overrides list (e.g., `2=stop-and-ask, 7=medium`). At least one pair is required; a bare "2" with no pairs is invalid and will re-prompt for the pair(s). See "Override semantics" below for what each option means.
3. **Cancel pipeline**

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
| Review severity floor | `none` | All findings auto-applied (lowest friction, highest revert load) |
| Review severity floor | `medium` | LOW + MED auto-applied; only HIGH prompts |
| Unattended tier | `on` | Floor-clearing ledger residue, queue writes, and ops-ack resolve without a click; still fully logged and reversible — see `_shared/unattended-tier.md` |
```

### Rendering rules for the preview

- **All-skip single-spec run:** replace the preview table with one line — e.g., `Preview: spec 42 (infra) — pipeline runs without polish / stories / QA. No friction expected.`
- **Mixed-surface multi-spec run:** keep the table; per-spec rows make the contrast visible (one frontend, two backend, etc.).
- **Friction note column:** only populate when a recommended lever value will introduce a mid-flow prompt for *this* spec under the *recommended* values. If "Approve all" runs silently for that spec, leave the column as `—`.

## Source values

| Source | Meaning |
|---|---|
| `arg` | Set by an explicit CLI argument in `$ARGUMENTS` |
| `policy` | From `.claude-tweaks/policy.yml` or CLAUDE.md `auto-mode:` keys |
| `default` | Hardcoded sensible default |
| `header` | Locked by the materialized header (`materialize.md`) or the record body's `Surface:`/`Design-intent:` metadata lines — or, under the legacy spec-file alias, the spec file's own header fields (e.g., `design-intent:` set on every record in the run) |

## Recommendation defaults (when no arg and no policy)

| Lever | Default | Why |
|---|---|---|
| Mode | `auto` | User invoked `/flow auto`; only here if they did |
| Scope-creep | `add-to-plan` | Safest: never silently drop work the user mentioned |
| Overlap | `companion` | Safest: never overwrite or silently extend; create a new spec |
| Design intent | `none` | No creative direction unless user opts in |
| Leftover routing | `defer` | Reversible; user reviews at Wrap-Up Review Console |
| Auto-fix threshold | `lint+type` | Mechanical fixes only; semantic test failures need judgment |
| Review severity floor | `low` | Auto LOW (nits), stage MED, prompt HIGH |
| Tidy aggressiveness | `conservative` | Keep + unambiguous Delete only |
| Unattended tier | `off` | Conservative default; each project/run opts in explicitly |

## Approval flow

**In default `auto` mode (FYI, no gate):** write the computed values straight to `config.yml` (same schema as below), initialize `decisions.md` with the config snapshot header, create `staged/`, then proceed to Step 4 without waiting. The FYI table has already shown the user what was chosen; there is no approval step to process. This is the everyday path. The `Approve all / Override / Cancel` handling below applies only to `confirm` and `hybrid` modes.

**On approval (option 1):** write the chosen values to `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/config.yml`:

```yaml
mode: auto
scope-creep: add-to-plan
overlap: companion
design-intent: none
leftover-default: defer
auto-fix-threshold: lint+type
review-severity-floor: low
tidy-aggressiveness: conservative
unattended-tier: off
spec: 42
created: 2026-05-15T143207
```

Suppressed levers are still written to `config.yml` with their default values — suppression is a UI affordance, not a semantic skip. Downstream skills always have a value to read.

Initialize `decisions.md` in the same directory with the config snapshot header (see `_shared/auto-decision-log.md`). Create the `staged/` subdirectory.

**On override (option 2):** parse the user's `#=value` pairs, apply them to the recommendation set, validate each value against the lever's option vocabulary (reject typos with an inline retry), write the final config to `config.yml`. Do not loop on the Manifesto itself — the user gives all overrides in one reply. If validation fails on any pair, present a single retry line listing the invalid pairs only (`Invalid: 2=foo (must be add-to-plan / stop-and-ask / drop)`).

**On cancel (option 3):** abort the pipeline. Do not create the run directory.

## Path conventions

- Run directory: `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/`
- `ISO-timestamp` is `YYYY-MM-DDTHHMMSS` (no colons; portable across filesystems)
- `spec-slug` uses a single `spec-` prefix on numeric IDs to disambiguate from timestamp digits: `spec-42` (single spec), `spec-42-45-48` (multi-spec, dash-joined), or a non-numeric topic slug like `meal-planning` (no prefix needed). See `_shared/pipeline-run-dir.md` for the canonical SPEC_SLUG conventions.
- Collisions never happen — multiple parallel agents in the same checkout each get their own run directory
- The run directory and its path are exposed to downstream skills via the `PIPELINE_RUN_DIR` env var (set in the skill chain)
- After successful pipeline closure, `/wrap-up` moves the directory to `.claude-tweaks/pipelines/archive/`

**Manifesto is the only mid-pipeline policy stop.** After this, no skill asks the user about scope-creep, overlap, design-intent, etc. They read `config.yml` and apply.
