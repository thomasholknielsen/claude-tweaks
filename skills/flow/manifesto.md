# Pipeline Config Manifesto — Step 1.6

The Manifesto is the **first bookend** of the pipeline (see `_shared/auto-mode-contract.md`). One structured table collects every policy lever the pipeline needs. After it's resolved, downstream skills look up policy here — they do not re-ask the user.

## When to run

- **`auto` mode** — mandatory. Present the Manifesto, get approval, then proceed.
- **`hybrid` mode** — mandatory. Same Manifesto; policies set here are honored, but skills still prompt for non-floor decisions.
- **`interactive` mode** — skipped. Old behavior (skills present each decision in-flow).

## Compute recommendations

Walk the precedence chain (see `_shared/auto-mode-contract.md`):

1. Explicit CLI args from `$ARGUMENTS` (e.g., `no-polish` sets `polish: skip`)
2. Pipeline-config file from a previous run that's still active in this session (rare; usually skipped)
3. Project policy from `.claude-tweaks/policy.yml` (if exists) or CLAUDE.md `auto-mode:` keys
4. Hardcoded sensible defaults (last resort)

For each lever, record both the recommended value AND its source so the user can see why each value was suggested.

## Present the Manifesto

```markdown
### Pipeline Config Manifesto

I've pre-filled recommended defaults based on {project policy + sensible defaults}.
Approve to lock these in for this pipeline run. You won't be asked about them again mid-flow.

| # | Lever | Recommendation | Source | What it controls |
|---|---|---|---|---|
| 1 | Mode | {auto / hybrid} | {arg / policy / default} | Whether mid-flow stops are silenced |
| 2 | Scope-creep policy | {add-to-plan} | {default} | /build Step 1.5 when files outside plan are referenced |
| 3 | Overlap policy | {companion} | {default} | /specify Step 1 when specs overlap |
| 4 | Design intent | {none} | {default} | /specify Step 2.5c creative direction (none/bold/quiet/minimal/delightful/onboarding) |
| 5 | Leftover routing default | {defer} | {default} | /wrap-up Step 4 when sections cannot finish (defer/inbox/drop) |
| 6 | Auto-fix threshold | {lint+type} | {default} | /test Step 1 fix-mode scope (lint-only/lint+type/lint+type+test) |
| 7 | Review severity floor | {low} | {default} | /review Step 3g auto-apply cutoff (none/low/medium) |
| 8 | Tidy aggressiveness | {conservative} | {default} | /tidy auto-apply scope (conservative/moderate/aggressive) |

1. Approve all recommendations **(Recommended)**
2. Override specific items — reply with the # and the new value (e.g., "3=skip, 4=bold")
3. Cancel pipeline
```

## Source values

| Source | Meaning |
|---|---|
| `arg` | Set by an explicit CLI argument in `$ARGUMENTS` |
| `policy` | From `.claude-tweaks/policy.yml` or CLAUDE.md `auto-mode:` keys |
| `default` | Hardcoded sensible default |

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

## Approval flow

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
spec: 42
created: 2026-05-15T14:32:07
```

Initialize `decisions.md` in the same directory with the config snapshot header (see `_shared/auto-decision-log.md`). Create the `staged/` subdirectory.

**On override (option 2):** parse the user's overrides, apply them to the recommendation set, write the final config to `config.yml`. Do not loop — the user gives all overrides in one reply.

**On cancel (option 3):** abort the pipeline. Do not create the run directory.

## Path conventions

- Run directory: `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/`
- `ISO-timestamp` is `YYYY-MM-DDTHHMMSS` (no colons; portable across filesystems)
- `spec-slug` is the spec number, comma-joined spec numbers, or topic slug
- Collisions never happen — multiple parallel agents in the same checkout each get their own run directory
- The run directory and its path are exposed to downstream skills via the `PIPELINE_RUN_DIR` env var (set in the skill chain)
- After successful pipeline closure, `/wrap-up` moves the directory to `.claude-tweaks/pipelines/archive/`

**Manifesto is the only mid-pipeline policy stop.** After this, no skill asks the user about scope-creep, overlap, design-intent, etc. They read `config.yml` and apply.
