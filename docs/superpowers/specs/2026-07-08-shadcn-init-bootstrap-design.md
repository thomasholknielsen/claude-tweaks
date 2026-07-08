# shadcn/ui Init Bootstrap + Phase 0 Step Renumbering

**Date:** 2026-07-08
**Status:** Approved design, pending implementation plan
**Research grounding:** `.claude-tweaks/research/2026-07-08-shadcn-ui-plugin-workflows/report.md`

## Motivation

Thomas uses shadcn/ui across many projects. The friction he identified is setup
friction, not single-project correctness or cross-project preset consistency: bootstrapping
shadcn into a new project (CLI init, wiring it up for Claude Code) is manual and
repetitive, and it recurs at the start of every new frontend project — not mid-build. He
has no fixed personal preset (style/theme/component set varies per project), so the fix
is infrastructure, not a captured configuration.

Research findings that shape this design (see linked report for full citations):

- shadcn is not `npm install`-able — the CLI copies real source files into the project.
  There is no single package an AI agent can introspect, which is why shadcn ships a
  CLI + registry protocol + MCP server + Skills stack at all.
- As of CLI v4 (~March 2026), shadcn ships **three** AI-agent-facing layers: the CLI
  itself (`init`/`add`), a first-party **MCP server** (search/browse/view/install/audit
  tools), and an installable **`shadcn/skills`** package that injects live project
  context into Claude Code (framework, installed components, aliases) — explicitly to
  stop the agent hallucinating APIs.
- The registry protocol (`registry.json`/`registry-item.json`) is a real, schema-validated
  distribution format expressive enough to bundle an entire design system as one payload
  — noted here as a documented future option, not part of this design (no fixed preset
  exists yet to publish).
- **Research gap, explicitly not resolved:** how other AI tools (Cursor, v0.dev) or any
  pre-existing Claude Code plugin integrate with shadcn today. This design proceeds
  without that answer; if a conflicting integration surfaces later, revisit scope.

## Approach

**Chosen: extend `/init` Phase 0 with a new step**, modeled directly on the existing
Step 0.9 (Impeccable) / Step 0.95 (diagram-design) pattern: detect frontend → present a
numbered-option prompt → run an explicit install command sequence → write a CLAUDE.md
flag for idempotent re-runs. This is the established shape for every optional companion
integration in this plugin, and `/init` is documented as "re-run to find drift, gaps, and
stale configuration" — so it already serves as the "run this again later" entry point,
removing the case for a standalone always-on-demand skill.

**Rejected — standalone `/claude-tweaks:shadcn` utility skill.** More flexible timing,
but Thomas confirmed friction is concentrated at project start, and re-running `/init`
already covers "do this later" for free. A standalone skill would duplicate frontend
detection logic that `/init` already owns.

**Rejected — bundle into the existing Impeccable step.** Impeccable (design critique) and
shadcn (component registry/CLI) are orthogonal tools. The codebase's own precedent (one
companion tool = one step, one flag, across Impeccable/diagram-design/routines/issue-
tracking) would break, and a user couldn't enable one without the other.

## Part 1 — Phase 0 step renumbering

### Audit findings

The current `Step 0.X` numbering in `skills/init/bootstrap-steps.md` mixes two insertion
strategies: `0.1`–`0.9` step by tenths, then `0.45` breaks that pattern as a later
mid-sequence insertion, and `0.95`/`0.96`/`0.97` abandon tenths entirely once room ran
out after `0.9`. Three "optional companion" steps (Impeccable, diagram-design, routines)
were added in three days (2026-07-05 to 2026-07-07, per dated plan docs) — at that
velocity, the two remaining tenths slots (`0.98`, `0.99`) will not last. `0.100` is
genuinely ambiguous as a next step: as a decimal *value* it equals `0.1`, which sorts
*before* `0.9`, the opposite of what a reader would assume by analogy to software
versioning.

The numbering also doesn't reflect the structure that emerged organically: `0.1`–`0.8`
are order-dependent core bootstrap steps; `0.45`, `0.9`, `0.95`, `0.96`, `0.97` are all
independent, order-agnostic "detect condition → offer → write artifact → idempotent"
steps — but `0.45` is numbered inside the core range, misclassifying it.

### New scheme

Two sequential groups under the existing `Phase 0: Bootstrap Structure`, both using
plain integers (no more decimal insertion — new Optional Enhancements just append at the
end, since their relative order is already order-agnostic by construction):

**Core Bootstrap (Steps 1–8, order matters):**

| Step | Title |
|---|---|
| 1 | Check Plugin Dependencies |
| 2 | Create Directory Structure |
| 3 | Starter Files |
| 4 | .gitignore Suggestions |
| 5 | Verify Git |
| 6 | Worktree Configuration |
| 7 | Browser / agent-browser |
| 8 | Statusline & Dependencies |

**Optional Enhancements (Steps 9–14, order-agnostic, append-only):**

| Step | Title |
|---|---|
| 9 | GitHub Issue Form Template |
| 10 | Impeccable Design Integration |
| 11 | Diagram Design |
| 12 | **shadcn Bootstrap (new — Part 2 below)** |
| 13 | Routine Installation |
| 14 | Non-Default-Branch Issue Tracking |

Full old→new mapping (for the implementation plan's find/replace):

| Old | New |
|---|---|
| Step/Phase 0.1 | Step/Phase 1 |
| Step/Phase 0.2 | Step/Phase 2 |
| Step/Phase 0.3 | Step/Phase 3 |
| Step/Phase 0.4 | Step/Phase 4 |
| Step/Phase 0.45 | Step/Phase 9 |
| Step/Phase 0.5 | Step/Phase 5 |
| Step/Phase 0.6 | Step/Phase 6 |
| Step/Phase 0.7 | Step/Phase 7 |
| Step/Phase 0.8 | Step/Phase 8 |
| Step/Phase 0.9 | Step/Phase 10 |
| Step/Phase 0.95 | Step/Phase 11 |
| — | Step/Phase 12 (new) |
| Step/Phase 0.96 | Step/Phase 13 |
| Step/Phase 0.97 | Step/Phase 14 |

`skills/init/bootstrap-steps.md` should also gain two `##`-level group headers ("Core
Bootstrap Steps" / "Optional Enhancement Steps") with the individual step headers
demoted to `###`, so the two-tier structure is visible, not just implied by numbering.

### Files to update

Live documentation only — every reference found via repo-wide grep for `Step 0\.` /
`Phase 0\.[0-9]`:

- `skills/init/bootstrap-steps.md` (13 headers + 1 internal self-reference: "same gate
  Step 0.45 uses")
- `skills/init/SKILL.md` (13 step-summary headers, 4 Actions Performed table rows, 3
  Relationship-to-Other-Skills rows)
- `CLAUDE.md` (root — line ~44, "Step 0.45 GitHub issue form offer")
- `README.md` (3 references: diagram-integration flag origin, Impeccable step origin,
  Node/statusline step origin)
- `skills/help/reference-card.md` (2 references: Impeccable and diagram-design origin
  steps)
- `skills/design/SKILL.md` (2 references to Impeccable's origin step)
- `skills/build/worktree-setup.md` (1 reference, Impeccable hook consent)
- `skills/flow/from-code-health.md` (1 reference, issue-tracking origin step)
- `skills/_shared/diagram-integration-check.md` (1 reference, diagram-integration flag
  origin)
- `skills/journeys/SKILL.md`, `skills/review/SKILL.md`, `skills/specify/SKILL.md` (1
  reference each, diagram-integration flag origin)
- `skills/routine/SKILL.md` (2 references, routine installation origin step — including
  inside prose explaining the Component-Skill Contract's `--source init` signal, not just
  a citation; reword carefully, don't just swap the number)

**Explicitly excluded — do not touch:** `CHANGELOG.md` and `docs/superpowers/plans/*.md`
/ `docs/superpowers/specs/*.md`. These are historical records of what shipped or was
planned at the time; renumbering current steps does not retroactively rewrite history.

## Part 2 — Step 12: shadcn Bootstrap

### Detection

Reuse Phase 2's frontend signal when available (same `.tsx`/`.jsx`/`.vue`/`.svelte`/
`.html`/`.css`/`components/`/`pages/`/`app/`/`routes/`/`views/`/`ui/` sniff Step 10
already uses); if Phase 0 runs before Phase 2, run the same quick root sniff directly.
Skip entirely, no prompt, on non-frontend projects.

Then check for an existing `components.json` at the project root to pick a branch.

### Case A — no `components.json`, frontend detected

Present:

```
Detected frontend project. Set up shadcn/ui integration?

shadcn/ui provides a CLI-driven component system plus first-party AI-agent
tooling: an MCP server (search/browse/install/audit registry items) and an
installable Skill that gives Claude Code live project context, so it
discovers and installs components correctly instead of guessing.

1. Full integration (Recommended) — CLI init, wire MCP server, install shadcn/skills
2. CLI only — CLI init, skip MCP/skills wiring
3. Skip — disable shadcn integration
```

**Both options 1 and 2 run:**

1. Detect package manager from lockfile (`pnpm-lock.yaml` → `pnpm dlx`, `yarn.lock` →
   `yarn dlx`, `bun.lockb` → `bunx`, `package-lock.json` or none → `npx`).
2. Detect framework from `package.json` dependencies (`next` → `next`, `vite` → `vite`,
   `astro` → `astro`, `@remix-run/react`/`react-router` → `react-router`, etc. — full
   mapping table to confirm against `ui.shadcn.com/docs/installation` at implementation
   time) for the `-t` flag.
3. Run `<pm> dlx shadcn@latest init -t <framework>`. Style/theme/CSS-variable choices are
   left to shadcn's own interactive prompts — claude-tweaks does not pre-answer them
   (matches "no fixed preset" — this is per-project decision-making shadcn's CLI already
   handles).

**Option 1 only, additionally:**

4. Wire shadcn's MCP server into `.mcp.json` — backup existing file first, merge (never
   clobber existing entries), same discipline Step 8 uses for `settings.json`.
   **Implementation-time open item:** the exact `.mcp.json` entry shadcn's docs specify
   must be pulled live from `ui.shadcn.com/docs/mcp` when the plan is written — this
   design does not guess the literal command/args.
5. Run `skills add shadcn/ui` via the same package-manager prefix resolved in step 1
   above (`pnpm dlx skills add shadcn/ui` / `npx skills add shadcn/ui` / `yarn dlx skills
   add shadcn/ui` / `bunx skills add shadcn/ui`) — the `pnpm dlx` form is the one
   confirmed exact command from research (`ui.shadcn.com/docs/skills`); the other three
   follow the identical `dlx`/`npx`-equivalent substitution already used for the `shadcn`
   CLI itself in step 3.

### Case B — `components.json` exists, MCP/skills not fully wired

Narrower offer, skipping CLI init (already done):

```
shadcn/ui is already initialized in this project. Wire up the MCP server and
shadcn/skills for Claude Code?

1. Yes — wire remaining layers (Recommended)
2. Skip
```

Flag mapping for this case: option 1 writes `shadcn-integration: enabled`; option 2
writes `shadcn-integration: cli-only` (the CLI portion is already done regardless of
this offer's outcome — `cli-only` accurately reflects that state, not `disabled`).

### Case C — fully configured already

Silent no-op — same idempotency contract every other Optional Enhancement step follows.

### CLAUDE.md flag

Extends the existing `## Design integration` section (already holds `design-integration`
and `diagram-integration`):

```markdown
## Design integration

design-integration: enabled
diagram-integration: enabled
shadcn-integration: enabled
```

Values: `enabled` (all layers) | `cli-only` (CLI init only) | `disabled` (skipped or
declined).

**Scope boundary — write-only for now.** No other skill reads this flag yet. It exists
solely so re-running `/init` is idempotent, mirroring the role `design-integration` plays
for Layer 1 of `/design`'s detection logic. A future extension (e.g. `/design`'s
frontend-detection preferring shadcn components when this flag is `enabled`) is a
plausible follow-up but explicitly out of scope here — this design only covers bootstrap.

### Failure handling

A failed install command (network failure, npm/pnpm error) surfaces the failure and
continues Phase 0 with `shadcn-integration: disabled` (or the honestly-reached partial
state) rather than aborting the rest of bootstrap — matches every other companion step's
failure contract.

### Documentation updates

- `skills/init/SKILL.md` — new "Step 12: shadcn Bootstrap (Optional)" summary block
  (same shape as Steps 10/11); new Actions Performed row (`shadcn integration | Set
  shadcn-integration: {enabled/cli-only/disabled} in CLAUDE.md | Step 12`); new
  Relationship-to-Other-Skills row noting the flag is currently write-only.
- `README.md` — short companion blurb, same shape as the existing diagram-design
  paragraph (what it does, what flag it writes, what reads the flag — "nothing yet").
- `skills/help/reference-card.md` — new row in the companion-tools table:
  `[shadcn/ui](https://ui.shadcn.com/) | CLI-driven component system + official MCP
  server and Skill for AI-agent context. Frontend projects only. | /init Step 12 (writes
  shadcn-integration: flag)`.

## Out of scope (explicitly deferred)

- Any change to `/build`, `/specify`, or `/design`'s ongoing behavior based on
  `shadcn-integration` — Thomas confirmed the friction is at project start, not mid-build
  component resolution.
- A claude-tweaks-authored private registry (`registry:base`) for a personal
  component/theme preset — no fixed preset exists to publish; revisit if one emerges.
  Documented as a real, schema-backed option in the research report if this changes.
  future.
- Resolving the research gap on how other AI tools/plugins integrate with shadcn today.

## Implementation plan requirements

- Per project convention, feature additions bump `version` in `.claude-plugin/plugin.json`
  (minor bump) — the implementation plan must include this as an explicit step, not an
  assumed side effect.
- Both parts (renumbering + new step) touch the same files in the same locations —
  the implementation plan should sequence the renumbering pass first (pure rename, no
  new content) and the new Step 12 content second, so the new step is authored directly
  against final numbers rather than needing a follow-up renumber.
