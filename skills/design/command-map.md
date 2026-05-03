# Command Map — Impeccable Commands by Category

Reference table for every Impeccable command, categorized by how the wrapper dispatches it. Phase 3 activates **intent-driven dispatch** in `polish` mode and the **survey** mode (creative surfacing for `/visual-review` and `/flow` summary). Earlier phases shipped auto-fit (review/polish/pre-spec) and issue-driven dispatch.

## Categories

| Category | Meaning | Phase that activates it |
|----------|---------|------------------------|
| **Auto-fit (pre-spec)** | Run automatically before a spec is decomposed, when frontend is detected | Phase 2 — active (`/specify` shape pre-step) |
| **Auto-fit (polish phase)** | Run automatically in the polish phase whenever frontend is detected | Phase 2 — active (`/flow` polish) |
| **Auto-fit (review phase)** | Run automatically during review whenever frontend is detected | Phase 1 — active (`/review`) |
| **Issue-driven** | Run only when the audit pass flagged a matching issue | Phase 2 — active (`/flow` polish) |
| **Intent-driven** | Run only when the spec's `design-intent:` frontmatter declares a matching intent | **Phase 3 — active now** (`/flow` polish) |
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
| `bolder` | Intent-driven | **Phase 3 — active** when `design-intent: bold` is declared |
| `quieter` | Intent-driven | **Phase 3 — active** when `design-intent: quiet` is declared |
| `distill` | Intent-driven | **Phase 3 — active** when `design-intent: minimal` is declared (intent-only to avoid conflict with `/simplify`) |
| `delight` | Intent-driven | **Phase 3 — active** when `design-intent: delightful` is declared (paired with `animate`) |
| `animate` | Intent-driven | **Phase 3 — active** when `design-intent: delightful` is declared (paired with `delight`) |
| `onboard` | Intent-driven | **Phase 3 — active** when `design-intent: onboarding` is declared |
| `colorize` | Manual-only (Phase 3 scope) | Not auto-dispatched — surfaced as a `survey` recommendation only |
| `overdrive` | Manual-only (Phase 3 scope) | Not auto-dispatched — surfaced as a `survey` recommendation only |
| `extract` | Manual-only (Phase 3 scope) | Not auto-dispatched — surfaced as a `survey` recommendation only |
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

### Step 3 — Intent-driven (Phase 3 — active)

Read `design-intent:` from spec frontmatter (written by Phase 2's `/specify`). For each declared intent value, dispatch the matching command(s) on the changed UI files. Multiple intents (comma-separated, e.g., `design-intent: bold, delightful`) trigger multiple dispatches. The value `none` or missing skips intent dispatch entirely.

| `design-intent:` value | Commands invoked (Phase 3) |
|------------------------|----------------------------|
| `bold` | `/impeccable bolder <files>` |
| `quiet` | `/impeccable quieter <files>` |
| `minimal` | `/impeccable distill <files>` (intent-only — avoids conflict with `/simplify`) |
| `delightful` | `/impeccable delight <files>` + `/impeccable animate <files>` |
| `onboarding` | `/impeccable onboard <files>` |
| `none` (or missing) | No intent commands run |

**Multi-intent ordering.** When multiple intents dispatch, run them in the order declared by the user. The pairing for `delightful` (`delight` first, then `animate`) is fixed — `delight` adds personality content (empty states, microcopy), `animate` adds motion to the interactions; reversing them risks animating placeholder content. The intent dispatches share the polish phase's single re-verify cap (one re-verify cycle per `/flow` run regardless of how many intent commands ran).

**Manual-only commands (Phase 3 scope decision).** `colorize`, `extract`, and `overdrive` are not intent-driven in this phase. They remain manual-only and are surfaced as `survey`-mode recommendations when their "would help" criteria match. This keeps the auto-dispatch surface conservative — the three excluded commands produce the most aggressive creative drift (overdrive especially), so they require explicit user invocation rather than frontmatter consent. Add to the intent-driven set later if user demand surfaces.

## Survey mode (Phase 3 — active)

`survey` mode inspects rendered screenshots (when invoked from `/visual-review`) or the full diff (when invoked from `/flow`'s pipeline summary) to **recommend** which creative commands the user might want to run manually. It never invokes commands directly — pure read-only output.

The recommendation set spans both intent-driven commands (`bolder`, `quieter`, `distill`, `delight`, `animate`, `onboard`) and the manual-only commands (`colorize`, `extract`, `overdrive`). Survey is the surfacing channel for the manual-only set — without it, those commands would have no automatic discoverability.

Output feeds the "Creative Opportunities" blocks in `/visual-review` and `/flow` pipeline summary. Recommendations the user previously declined for the same spec are suppressed via the declined-recommendations cache (see SKILL.md `survey` mode).

## Why this categorization exists

- **Auto-fit** commands are deterministic enough that always running them on frontend code is net-positive.
- **Issue-driven** commands are too noisy to run unconditionally — only run when there's a matching audit signal.
- **Intent-driven** commands are creative direction — running them without explicit intent produces non-deterministic creative drift across runs.
- **Never (in flow)** commands either set up shared context once (`teach`) or are fundamentally manual (`craft`, `document`, `live`).
