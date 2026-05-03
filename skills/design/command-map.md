# Command Map — Impeccable Commands by Category

Reference table for every Impeccable command, categorized by how the wrapper dispatches it. Phase 1 only uses the **auto-fit (review phase)** commands plus the deterministic `detect` CLI; the rest are documented for forward-compatibility with Phase 2 (polish mode) and Phase 3 (intent dispatch + creative surfacing).

## Categories

| Category | Meaning | Phase that activates it |
|----------|---------|------------------------|
| **Auto-fit (pre-spec)** | Run automatically before a spec is decomposed, when frontend is detected | Phase 2 (`/specify` shape pre-step) |
| **Auto-fit (polish phase)** | Run automatically in the polish phase whenever frontend is detected | Phase 2 (`/flow` polish) |
| **Auto-fit (review phase)** | Run automatically during review whenever frontend is detected | **Phase 1 — active now** |
| **Issue-driven** | Run only when the audit pass flagged a matching issue | Phase 2 (`/flow` polish) |
| **Intent-driven** | Run only when the spec's `design-intent:` frontmatter declares a matching intent | Phase 3 (`/flow` polish + creative surfacing) |
| **Never (in flow)** | Available only as standalone manual commands; never auto-invoked by the wrapper | All phases |

## Full command map

| Impeccable command | Category | When wrapper invokes |
|--------------------|----------|----------------------|
| `shape` | Auto-fit (pre-spec) | Phase 2 — `/specify` shape pre-step (`shape` mode) |
| `polish` | Auto-fit (polish phase) | Phase 2 — `/flow` polish, always when frontend |
| `clarify` | Auto-fit (polish phase) | Phase 2 — `/flow` polish, always when frontend |
| `harden` | Auto-fit (polish phase) | Phase 2 — `/flow` polish, always when frontend |
| `critique` | Auto-fit (review phase) | **Phase 1** — `/review` (`review` mode) |
| `audit` | Auto-fit (review phase) | **Phase 1** — `/review` (`review` mode) |
| `typeset` | Issue-driven | Phase 2 — only when `audit` flagged a matching typography issue |
| `layout` | Issue-driven | Phase 2 — only when `audit` flagged a matching layout issue |
| `adapt` | Issue-driven | Phase 2 — only when `audit` flagged a matching responsive issue |
| `optimize` | Issue-driven | Phase 2 — only when `audit` flagged a matching performance issue |
| `bolder` | Intent-driven | Phase 3 — only when `design-intent: bold` is declared |
| `quieter` | Intent-driven | Phase 3 — only when `design-intent: quiet` is declared |
| `distill` | Intent-driven | Phase 3 — only when `design-intent: minimal` is declared (intent-only to avoid conflict with `/simplify`) |
| `delight` | Intent-driven | Phase 3 — only when `design-intent: delightful` is declared |
| `animate` | Intent-driven | Phase 3 — only when motion/interaction intent is declared |
| `colorize` | Intent-driven | Phase 3 — only when color-emphasis intent is declared |
| `overdrive` | Intent-driven | Phase 3 — only when an aggressive creative intent is declared |
| `extract` | Intent-driven | Phase 3 — only when content-extraction intent is declared |
| `onboard` | Intent-driven | Phase 3 — only when `design-intent: onboarding` is declared |
| `craft` | Never (in flow) | Manual standalone only |
| `teach` | Never (in flow) | Runs once via `/init` Impeccable setup phase; never auto from `/flow` |
| `document` | Never (in flow) | Manual standalone only |
| `live` | Never (in flow) | Manual standalone only |

## Phase 1 dispatch — what the wrapper actually invokes

The wrapper's `review` mode (active in Phase 1) invokes exactly two commands:

1. `/impeccable critique <files>` — qualitative critique pass
2. `/impeccable audit <files>` — heuristic audit pass

Both run on the changed UI files resolved by the preconditions (Layer 3 sniff). Outputs are merged into a normalized findings list and returned to `/review` as `result: advisory`.

The wrapper's `test` mode invokes the deterministic CLI:

```bash
npx impeccable detect --fast --json <files>
```

The CLI is not part of the LLM command map — it's a separate Node binary. See `impeccable-cli.md` for invocation details.

## Phase 2 / Phase 3 forward-compat

The mode signatures `polish` and `survey` already exist in the wrapper. When their phases ship, dispatch logic will read this map to choose which commands to invoke:

- **`polish` mode (Phase 2):** Runs all "Auto-fit (polish phase)" commands unconditionally; runs "Issue-driven" commands only when the prior audit phase flagged a matching issue; runs "Intent-driven" commands only when frontmatter declares matching intent.
- **`survey` mode (Phase 3):** Runs no commands directly — it inspects rendered screenshots and the diff to recommend which "Intent-driven" commands the user might want to invoke manually.

Until those phases ship, this map is reference-only.

## Why this categorization exists

- **Auto-fit** commands are deterministic enough that always running them on frontend code is net-positive.
- **Issue-driven** commands are too noisy to run unconditionally — only run when there's a matching audit signal.
- **Intent-driven** commands are creative direction — running them without explicit intent produces non-deterministic creative drift across runs.
- **Never (in flow)** commands either set up shared context once (`teach`) or are fundamentally manual (`craft`, `document`, `live`).
