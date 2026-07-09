# Command Map — Impeccable Commands by Category

Reference table for every Impeccable command, categorized by how the wrapper dispatches it. Five dispatch categories (auto-fit / issue-driven / intent-driven / manual-only / never), all active.

## Categories

| Category | Meaning |
|----------|---------|
| **Auto-fit (pre-spec)** | Run automatically before a spec is decomposed, when frontend is detected (`/specify` shape pre-step) |
| **Auto-fit (polish phase)** | Run automatically in the polish phase whenever frontend is detected (`/flow` polish) |
| **Auto-fit (review phase)** | Run automatically during review whenever frontend is detected (`/review`) |
| **Issue-driven** | Run only when the audit pass flagged a matching issue (`/flow` polish) |
| **Intent-driven** | Run only when the spec's `design-intent:` frontmatter declares a matching intent (`/flow` polish) |
| **Manual-only** | Surfaced as `survey` recommendations; never auto-dispatched. Aggressive creative drift makes them user-discretion. |
| **Never (in flow)** | Available only as standalone manual commands; never auto-invoked by the wrapper |

## Full command map

| Impeccable command | Category | When wrapper invokes |
|--------------------|----------|----------------------|
| `shape` | Auto-fit (pre-spec) | `/specify` shape pre-step (`shape` mode) |
| `polish` | Auto-fit (polish phase) | `/flow` polish, always when frontend |
| `clarify` | Auto-fit (polish phase) | `/flow` polish, always when frontend |
| `harden` | Auto-fit (polish phase) | `/flow` polish, always when frontend |
| `critique` | Auto-fit (review phase) | `/review` (`review` mode) |
| `audit` | Auto-fit (review phase) | `/review` (`review` mode) |
| `typeset` | Issue-driven | Only when `audit` flagged a matching typography issue |
| `layout` | Issue-driven | Only when `audit` flagged a matching layout issue |
| `adapt` | Issue-driven | Only when `audit` flagged a matching responsive issue |
| `optimize` | Issue-driven | Only when `audit` flagged a matching performance issue |
| `bolder` | Intent-driven | When `design-intent: bold` is declared |
| `quieter` | Intent-driven | When `design-intent: quiet` is declared |
| `distill` | Intent-driven | When `design-intent: minimal` is declared (intent-only to avoid conflict with `/simplify`) |
| `delight` | Intent-driven | When `design-intent: delightful` is declared (paired with `animate`) |
| `animate` | Intent-driven | When `design-intent: delightful` is declared (paired with `delight`) |
| `onboard` | Intent-driven | When `design-intent: onboarding` is declared |
| `colorize` | Manual-only | Not auto-dispatched — surfaced as a `survey` recommendation only |
| `overdrive` | Manual-only | Not auto-dispatched — surfaced as a `survey` recommendation only |
| `extract` | Manual-only | Not auto-dispatched by this wrapper — surfaced as a `survey` recommendation, and also by `/claude-tweaks:tidy` Step 5.5's cross-spec pattern scan (same Design Quality category recurring across 3+ specs) |
| `craft` | Never (in flow) | Manual standalone only |
| `init` | Never (in flow) | Runs once via `/init` Impeccable setup phase (formerly `teach`, now a deprecated alias); never auto from `/flow` |
| `document` | Never (in flow) | Manual standalone only |
| `live` | Never (in flow) | Manual standalone only |
| `hooks` | Never (in flow) | Manual — one-time per-worktree consent toggle (`hooks on\|off\|status`); never auto-invoked. See `skills/build/worktree-setup.md` for the per-worktree consent note. |

## Review dispatch — what the wrapper invokes in `review` mode

The wrapper's `review` mode invokes exactly two commands:

1. `/impeccable:impeccable critique <files>` — qualitative critique pass
2. `/impeccable:impeccable audit <files>` — heuristic audit pass

Both run on the changed UI files resolved by the preconditions (Layer 3 sniff). Outputs are merged into a normalized findings list and returned to `/review` as `result: advisory`. The audit findings are also written to `docs/plans/...-audit.json` for later consumption by `polish` mode.

The wrapper's `test` mode (Phase 1) invokes the deterministic CLI:

```bash
npx impeccable detect --fast --json <files>
```

The CLI is not part of the LLM command map — it's a separate Node binary. See `impeccable-cli.md` for invocation details.

## Polish-mode dispatch — auto-fit + issue-driven + intent-driven

The `polish` mode is the only wrapper mode that modifies code. Its dispatch logic:

### Step 1 — Auto-fit (always invoked when frontend)

Run unconditionally on the changed UI files:

| Command | Purpose |
|---------|---------|
| `/impeccable:impeccable polish <files>` | Final design system alignment |
| `/impeccable:impeccable clarify <files>` | UX copy improvement |
| `/impeccable:impeccable harden <files>` | Error handling, i18n, edge cases |

These three are deterministic enough that running them on every frontend polish phase is net-positive. They never depend on audit signal.

### Step 2 — Issue-driven (only when audit flagged matching category)

Read the audit findings cache written by `review` mode (`docs/plans/...-audit.json`). For each finding, derive the category and dispatch the matching command. Categories use case-insensitive substring matching against the audit finding's `category` or `rule` field — when no audit cache exists, this step is a no-op (degrade gracefully to auto-fit-only).

| Audit category keyword (substring match) | Command dispatched |
|------------------------------------------|---------------------|
| `typography`, `font`, `text-hierarchy`, `headings` | `/impeccable:impeccable typeset <files>` |
| `spacing`, `layout`, `grid`, `padding`, `margin`, `whitespace` | `/impeccable:impeccable layout <files>` |
| `responsive`, `breakpoint`, `mobile`, `tablet`, `viewport`, `adaptive` | `/impeccable:impeccable adapt <files>` |
| `performance`, `bundle`, `render`, `slow`, `lazy-load`, `lcp`, `cls` | `/impeccable:impeccable optimize <files>` |

When multiple findings match the same category, the wrapper dispatches the command **once** with the union of affected files (de-duplicated). When findings span multiple categories, dispatch each command separately.

### Step 3 — Intent-driven

Read `design-intent:` from spec frontmatter (written by `/specify`). For each declared intent value, dispatch the matching command(s) on the changed UI files. Multiple intents (comma-separated, e.g., `design-intent: bold, delightful`) trigger multiple dispatches. The value `none` or missing skips intent dispatch entirely.

| `design-intent:` value | Commands invoked |
|------------------------|------------------|
| `bold` | `/impeccable:impeccable bolder <files>` |
| `quiet` | `/impeccable:impeccable quieter <files>` |
| `minimal` | `/impeccable:impeccable distill <files>` (intent-only — avoids conflict with `/simplify`) |
| `delightful` | `/impeccable:impeccable delight <files>` + `/impeccable:impeccable animate <files>` |
| `onboarding` | `/impeccable:impeccable onboard <files>` |
| `none` (or missing) | No intent commands run |

**Multi-intent ordering.** When multiple intents dispatch, run them in the order declared by the user. The pairing for `delightful` (`delight` first, then `animate`) is fixed — `delight` adds personality content (empty states, microcopy), `animate` adds motion to the interactions; reversing them risks animating placeholder content. The intent dispatches share the polish phase's single re-verify cap (one re-verify cycle per `/flow` run regardless of how many intent commands ran).

**Frequency Gate guardrail (`animate` only).** Every `animate` dispatch — currently the `design-intent: delightful` path, and any future auto-fit or issue-driven dispatch of `animate` should this wrapper ever add one — appends a fixed guidance suffix to the target argument, after the file list:

> "Apply a frequency gate before animating: keyboard-initiated actions and actions triggered 100+ times per day get no animation (instant state change only); daily/occasional actions get subtle, fast motion; rare (monthly-or-less) actions may receive expressive motion. Decide whether to animate first, using this gate — then apply your own duration/easing rules."

This is a fixed guardrail, not creative drift — same category as Impeccable's own mandatory `prefers-reduced-motion` rule baked into every `animate` call. It does not depend on audit signal or `design-intent` value to apply; append it every time this wrapper dispatches `animate`. `delight` does not carry this suffix: `delight` covers content and personality (copy, illustration, celebratory moments) with its own restraint framework, and a trigger-frequency gate keyed to "keyboard-initiated → never" would conflict with moments `delight` deliberately wants to celebrate (e.g. a first-time keyboard-shortcut reveal).

**Manual-only commands.** `colorize`, `extract`, and `overdrive` are not intent-driven. They remain manual-only and are surfaced as `survey`-mode recommendations when their "would help" criteria match (`extract` also surfaces via `/claude-tweaks:tidy` Step 5.5's cross-spec pattern scan, same Design Quality category recurring across 3+ specs). This keeps the auto-dispatch surface conservative — the three excluded commands produce the most aggressive creative drift (overdrive especially), so they require explicit user invocation rather than frontmatter consent.

## Survey mode

`survey` mode inspects rendered screenshots (when invoked from `/visual-review`) or the full diff (when invoked from `/flow`'s pipeline summary) to **recommend** which creative commands the user might want to run manually. It never invokes commands directly — pure read-only output.

The recommendation set spans both intent-driven commands (`bolder`, `quieter`, `distill`, `delight`, `animate`, `onboard`) and the manual-only commands (`colorize`, `extract`, `overdrive`). Survey is the surfacing channel for the manual-only set — without it, `colorize` and `overdrive` would have no automatic discoverability (`extract` also surfaces via `/claude-tweaks:tidy` Step 5.5's cross-spec pattern scan, same Design Quality category recurring across 3+ specs).

Output feeds the "Creative Opportunities" blocks in `/visual-review` and `/flow` pipeline summary. Recommendations the user previously declined for the same spec are suppressed via the declined-recommendations cache (see `modes/survey.md`).

### Survey "would help" criteria → command mapping

Each observation maps to one creative command:

| Observation | Suggested command | Rationale snippet |
|-------------|-------------------|-------------------|
| Page reads as generic — pure black on white, no visual personality | `bolder` | Typography/color hierarchy lacks confidence |
| Visual weight imbalanced — multiple competing high-contrast elements | `quieter` | Reduce noise so the primary action wins |
| Component clutter — many small UI elements doing redundant work | `distill` | Strip to essence; intent-only avoids `/simplify` overlap |
| Empty state shows only "No items" or similar bare text | `delight` | Empty states are personality opportunities |
| Page has interactive controls (toggles, hovers) but no transitions | `animate` | Static interactions feel unpolished — but skip if the control is keyboard-initiated or fires 100+ times/day |
| Heavy monochrome — no strategic accent color | `colorize` | Strategic color anchors attention |
| First-run flow with no guidance or progressive disclosure | `onboard` | First-run UX is a teaching surface |
| Long-form content with weak hierarchy — wall of text, no pull-quotes | `extract` | Surface key content from prose |
| Existing strong design that could push further (intentional polish) | `overdrive` | Aggressive creative push — user-discretion |

## Why this categorization exists

- **Auto-fit** commands are deterministic enough that always running them on frontend code is net-positive.
- **Issue-driven** commands are too noisy to run unconditionally — only run when there's a matching audit signal.
- **Intent-driven** commands are creative direction — running them without explicit intent produces non-deterministic creative drift across runs.
- **Never (in flow)** commands either set up shared context once (`init`) or are fundamentally manual (`craft`, `document`, `live`).
