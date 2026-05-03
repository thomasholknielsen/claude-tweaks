# Command Map — Impeccable Commands by Category

Reference table for every Impeccable command, categorized by how the wrapper dispatches it. Phase 2 activates **auto-fit (polish phase)** + **issue-driven** dispatch in `polish` mode (in addition to the **auto-fit (review phase)** commands and `detect` CLI from Phase 1, plus the new **auto-fit (pre-spec)** dispatch in `shape` mode). Intent-driven dispatch is documented for forward-compatibility with Phase 3.

## Categories

| Category | Meaning | Phase that activates it |
|----------|---------|------------------------|
| **Auto-fit (pre-spec)** | Run automatically before a spec is decomposed, when frontend is detected | **Phase 2 — active now** (`/specify` shape pre-step) |
| **Auto-fit (polish phase)** | Run automatically in the polish phase whenever frontend is detected | **Phase 2 — active now** (`/flow` polish) |
| **Auto-fit (review phase)** | Run automatically during review whenever frontend is detected | Phase 1 — active (`/review`) |
| **Issue-driven** | Run only when the audit pass flagged a matching issue | **Phase 2 — active now** (`/flow` polish) |
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

The wrapper's `review` mode (Phase 1) invokes exactly two commands:

1. `/impeccable critique <files>` — qualitative critique pass
2. `/impeccable audit <files>` — heuristic audit pass

Both run on the changed UI files resolved by the preconditions (Layer 3 sniff). Outputs are merged into a normalized findings list and returned to `/review` as `result: advisory`. Phase 2 adds a side effect — the audit findings are also written to `docs/plans/...-audit.json` for later consumption by `polish` mode.

The wrapper's `test` mode (Phase 1) invokes the deterministic CLI:

```bash
npx impeccable detect --fast --json <files>
```

The CLI is not part of the LLM command map — it's a separate Node binary. See `impeccable-cli.md` for invocation details.

## Phase 2 dispatch — auto-fit + issue-driven (polish mode)

The `polish` mode (active in Phase 2) is the first wrapper mode that modifies code. Its dispatch logic:

### Step 1 — Auto-fit (always invoked when frontend)

Run unconditionally on the changed UI files:

| Command | Purpose |
|---------|---------|
| `/impeccable polish <files>` | Final design system alignment |
| `/impeccable clarify <files>` | UX copy improvement |
| `/impeccable harden <files>` | Error handling, i18n, edge cases |

These three are deterministic enough that running them on every frontend polish phase is net-positive. They never depend on audit signal.

### Step 2 — Issue-driven (only when audit flagged matching category)

Read the audit findings cache written by `review` mode (`docs/plans/...-audit.json`). For each finding, derive the category and dispatch the matching command. Categories use case-insensitive substring matching against the audit finding's `category` or `rule` field — when no audit cache exists, this step is a no-op (degrade gracefully to auto-fit-only).

| Audit category keyword (substring match) | Command dispatched |
|------------------------------------------|---------------------|
| `typography`, `font`, `text-hierarchy`, `headings` | `/impeccable typeset <files>` |
| `spacing`, `layout`, `grid`, `padding`, `margin`, `whitespace` | `/impeccable layout <files>` |
| `responsive`, `breakpoint`, `mobile`, `tablet`, `viewport`, `adaptive` | `/impeccable adapt <files>` |
| `performance`, `bundle`, `render`, `slow`, `lazy-load`, `lcp`, `cls` | `/impeccable optimize <files>` |

When multiple findings match the same category, the wrapper dispatches the command **once** with the union of affected files (de-duplicated). When findings span multiple categories, dispatch each command separately.

### Step 3 — Intent-driven (Phase 3 — DEFERRED)

Phase 3 will read `design-intent:` from spec frontmatter and dispatch creative commands per the intent values. Phase 2 leaves an explicit slot in the wrapper's polish-mode procedure indicating this is intentional, not missing.

| `design-intent:` value | Phase 3 command (forward-compat) |
|------------------------|----------------------------------|
| `bold` | `/impeccable bolder <files>` |
| `quiet` | `/impeccable quieter <files>` |
| `minimal` | `/impeccable distill <files>` (intent-only — avoids conflict with `/simplify`) |
| `delightful` | `/impeccable delight <files>` |
| `onboarding` | `/impeccable onboard <files>` |
| `none` (or missing) | No intent commands run |

Phase 2's polish never invokes any of these. Phase 3 activates this dispatch.

## Survey mode (Phase 3)

`survey` mode inspects rendered screenshots and the diff to **recommend** which intent-driven commands the user might want to run manually — it never invokes them directly. Output feeds the "Creative Opportunities" blocks in `/visual-review` and `/flow` pipeline summary.

## Why this categorization exists

- **Auto-fit** commands are deterministic enough that always running them on frontend code is net-positive.
- **Issue-driven** commands are too noisy to run unconditionally — only run when there's a matching audit signal.
- **Intent-driven** commands are creative direction — running them without explicit intent produces non-deterministic creative drift across runs.
- **Never (in flow)** commands either set up shared context once (`teach`) or are fundamentally manual (`craft`, `document`, `live`).
