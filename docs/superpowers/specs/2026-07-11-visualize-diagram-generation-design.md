# `/claude-tweaks:visualize` — Native Diagram Generation, Replacing `diagram-design` — Design

**Status:** Approved
**Author:** Claude (session-driven design), approved by Thomas Holk Nielsen

## Problem

claude-tweaks currently soft-integrates with an external companion plugin, [`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design), via `skills/_shared/diagram-integration-check.md` and an install offer in `/init` Step 11 (`skills/init/bootstrap-steps.md`). The user is dissatisfied with it and wants it removed.

The replacement needs three properties diagram-design doesn't have:

1. **Project-local, offline-capable output** — not dependent on a hosted/gated platform. (Anthropic's own Artifacts feature was evaluated as a *primary* mechanism and rejected for this reason: it requires a Pro/Max/Team/Enterprise plan, `/login` auth, and is disabled under CMEK/HIPAA/Zero Data Retention org policies, per `.claude-tweaks/research/2026-07-11-diagram-visual-generation-theming/report.md`.)
2. **Doc-embeddable** — usable inside a project's own documentation, including a real MDX-based docs server (confirmed via `memenu-app`'s Nextra docs portal at `apps/docs/`), not just as a standalone file.
3. **Themed from the host project's own design tokens** — colors, typography, light/dark — rather than a fixed generic skin, integrating with Impeccable (the frontend-design-quality plugin claude-tweaks already wraps via `/claude-tweaks:design`).

Research (`.claude-tweaks/research/2026-07-11-diagram-visual-generation-theming/report.md`) found that no diagrams-as-code tool (Mermaid, D2) binds live CSS custom properties — the only confirmed production-scale prior art for genuine token-driven theming is Excalidraw's CSS-variable API. Separately, `memenu-app`'s own `scripts/generate-quota-dashboard.ts` + `apps/docs/components/quota-dashboard-frame.tsx` already implement a working, in-production pattern for embedding a self-contained static HTML report into a Nextra docs site with live theme sync — independently converging on the same `:root` / `:root[data-theme="dark"]` / `@media (prefers-color-scheme: dark)` CSS shape that Anthropic's own `artifact-design` skill guidance prescribes.

## Goal

Ship `/claude-tweaks:visualize`, a native claude-tweaks skill that generates themed, self-contained HTML+SVG visual output (initially: diagrams), extract a reusable shared core other skills can consume later, and fully retire the `diagram-design` integration.

## Non-Goals

- **No report-mode implementation in this spec.** The shared core (`skills/_shared/visual-html-output.md`) is architected generically enough that `/code-health`, `/harness-health`, `/journey-health`, and `/review` could later render themed HTML reports through it, but none of those callers are modified here. This spec ships diagram generation only.
- **No memenu-app-side wiring.** Generalizing `QuotaDashboardFrame` into a reusable embed component, adding a `docs/diagrams/`-style passthrough to `sync-content.ts`, and registering the component in `mdx-components.tsx` are real follow-up tasks, but they belong in the `memenu-app` repo, not this one — claude-tweaks stays project-agnostic and only *surfaces a reference snippet*, never writes into a consumer project's docs app directly.
- **No exact D2 shape-vocabulary verification in this design pass.** Section "Diagram type → generation path" below reflects a good-faith read of D2's documented shape vocabulary — see "Open items" for the follow-up this implies.
- **No auto-regeneration or staleness tracking for existing diagrams.** Regenerating a diagram is always a fresh, explicit invocation. There is no cache or drift-detection mechanism proposed here (unlike harness-health's design-artifact staleness rotation, which is a different, unrelated system).

## Architecture

### Shared core vs. concrete skill

`skills/_shared/visual-html-output.md` is the reusable procedure — token extraction with fallback, the core-fragment/wrapper-adapter pattern, the MDX/Nextra handshake script, the Artifact publish adapter, and the persist-vs-ephemeral decision. It plays the same architectural role as `_shared/subagent-output-contract.md` or `_shared/design-wrapper-handling.md`: cross-cutting, referenced by multiple skills, never invoked directly by a slash command.

`/claude-tweaks:visualize <type> <topic>` is the concrete skill built in this spec. It is directly invocable by a user, and is the soft-hook target for `/journeys` (Step 3.6), `/specify` (Step 2.5d), and `/review` (Lens 3i extension) — replacing their current reference to `diagram-integration-check.md`.

### Diagram type → generation path

Two generation paths, chosen per diagram type:

- **Baseline (always available):** the LLM directly authors a self-contained HTML file with inline SVG bound to `var(--token-name)` — no external dependency, works for every type.
- **Enhanced (when the `d2` binary is installed):** the skill writes a `.d2` source file as the versioned source of truth, renders it via the `d2` CLI, then re-themes the output by replacing D2's own palette with `var(--token)` bindings.

| Diagram type | Path | Why |
|---|---|---|
| Sequence | Enhanced | D2's dedicated `sequence_diagram` shape |
| ER | Enhanced | D2's `sql_table` shape is a native fit for table+relation schemas |
| Architecture, Flowchart, Hierarchy/Tree, Layers, State, Org chart, Nested | Enhanced | Fundamentally node-and-edge graphs with containers for nesting — D2's core strength |
| Quadrant | Enhanced (tentative — verify during implementation) | D2's grid layout is a plausible fit |
| Timeline, Swimlane, Venn, Pyramid | Baseline only | No graph-shaped representation fits — axis-based, set-overlap, and stacked-layer visuals don't map onto a directed-graph DSL without fighting it |

D2 was chosen over Mermaid for the enhanced path because its binary has no Puppeteer/browser dependency (single static executable) and its `theme-overrides`/`dark-theme-overrides` mechanism is a better hook for re-theming than Mermaid's hex-only, single-customizable-theme restriction.

### Token extraction & theming

**Source:** `DESIGN.md`'s YAML frontmatter (`colors`, `typography`, `rounded`, `spacing`) plus the `DESIGN.json` sidecar (tonal ramps, dark-mode data when present) — Impeccable's own structured, normative output (`/impeccable:impeccable document`). No new CSS-scanning logic is needed; this is already a real, structured token source.

**Fallback when `DESIGN.md` is absent:** the skill does not silently degrade. It surfaces an `AskUserQuestion` nudge — "Run `/impeccable document` first (or install Impeccable if absent) / Continue with a neutral default skin" — before generating. Declining still produces a usable diagram; it just isn't token-themed. The neutral default skin is a first-class, permanent path, not a degraded one — most projects won't have Impeccable installed at all.

**Don't re-ask every invocation.** Once the user has declined the nudge in the current session, track that with an in-memory per-session marker and skip straight to the neutral skin for the rest of the session — the same dedupe `/design`'s own availability check already uses ("if the same mode skips twice for the same reason in a session, surface only the first skip"). No persistent cache file; the marker resets next session, since a project's Impeccable setup can change between sessions.

**Theming CSS shape** (validated independently by Impeccable's `DESIGN.md` convention, `memenu-app`'s own `generate-quota-dashboard.ts` template, and Anthropic's `artifact-design` skill guidance — three independent sources converging on the same pattern):

```css
:root { --token-name: <light-value>; }
:root[data-theme="dark"] { --token-name: <dark-value>; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --token-name: <dark-value>; }
}
```

### Output & embedding — core fragment + wrapper adapters

One generation step produces a reusable core: the `<svg>` plus a scoped `<style>` block (unique class/ID prefix per diagram, avoiding collisions when multiple diagrams land in the same doc — the same technique Impeccable's own component snippets use with `ds-` prefixing). Each consumer gets a thin wrapper over that same core, not a regenerated variant:

| Consumer | Wrapper |
|---|---|
| Standalone local file | Full `<!doctype html><html><head>…</head><body>{core}</body></html>` |
| Markdown embed | Bare `{core}` — no title, pasted directly into the doc |
| Artifact publish | `<title>{Diagram Title}</title>{core}` — no `<!DOCTYPE>`/`<html>`/`<head>`/`<body>`, per the `Artifact` tool's own contract |
| MDX/Nextra docs-server embed | Standalone file, embedded via `<iframe>` (see below) |

**MDX/Nextra compatibility:** every generated standalone HTML file always bakes in a small, harmless-by-default `postMessage` handshake — inert when there's no parent frame (`window.parent === window` → skip entirely), and otherwise: listens for `{type: 'theme', theme: 'dark'|'light'}` and sets its own `[data-theme]` accordingly, and reports height via `ResizeObserver` + `postMessage({type: 'height', height})`. This exactly matches the protocol `memenu-app`'s own `scripts/generate-quota-dashboard.ts` TEMPLATE and `apps/docs/components/quota-dashboard-frame.tsx` already implement in production. It's baked in unconditionally (not gated behind detection) — the script is cheap and inert, and this avoids a conditional generation path.

Separately, when the project shows signs of an MDX-based docs app (any `package.json` depends on `nextra`, `nextra-theme-docs`, `fumadocs`, `@next/mdx`, `contentlayer`, `docusaurus`, or `vitepress`), the skill surfaces a reference snippet — the generalized, de-specialized version of `quota-dashboard-frame.tsx`'s mechanism (an `EmbedFrame`/`StaticHtmlFrame` component) plus a short note on wiring a static-passthrough step into that project's own content-sync build. This is guidance only, never auto-applied — claude-tweaks doesn't know the target project's file layout, build tooling, or whether a bespoke component already exists there to extend instead of duplicate.

### Artifact publish adapter

Offered, never auto-invoked — same STAGED/opt-in soft-hook posture as the diagram-suggestion nudge itself: surfaced in conversation, logged as `STAGED` (not `AUTO`) to `$PIPELINE_RUN_DIR/decisions.md` when inside a pipeline run, silently skipped if the `Artifact` tool isn't present in the session (plan/org gating, Agent SDK, etc.) — never a hard dependency.

**Stable path for updatable publishing:** the `Artifact` tool re-publishes to the same URL only when called again with the *same file path*. The Artifact-wrapped fragment is therefore written to a small, committed sidecar next to the main diagram file — `{same-dir}/{slug}.artifact.html` — regenerated whenever the diagram regenerates, so republishing later is just calling `Artifact` on that same path again.

**Favicon table** (the `Artifact` tool requires 1-2 emoji, explicitly stable across redeploys — this must be a fixed lookup, not picked fresh each call):

| Type | Favicon | Type | Favicon |
|---|---|---|---|
| Architecture | 🏛️ | State | 🔁 |
| Flowchart | 🔀 | Data model / ER | 🗄️ |
| Sequence | ↔️ | Timeline | ⏱️ |
| Swimlane | 🏊 | Quadrant | 📐 |
| Hierarchy / Tree | 🌳 | Layers | 🧱 |
| Org chart | 🏢 | Nested | 🎯 |
| Venn | ⭕ | Pyramid | 🔺 |

The adapter procedure (derive the Artifact fragment, pick the favicon, write the sidecar, call `Artifact`, log `STAGED`) lives in its own lazy-loaded reference file, `skills/visualize/artifact-publish.md`, mirroring how `/design` keeps per-mode mechanics in separate sub-files rather than bloating the main `SKILL.md`.

### Persist-vs-ephemeral decision

Not every invocation wants a committed project doc.

| Context | Default | Still asks? |
|---|---|---|
| Invoked via `/journeys`, `/specify`, `/review` soft-hooks | Save as project doc | No — these are inherently documentation contexts |
| Invoked directly by the user, ad-hoc | — | Yes — `AskUserQuestion`: "Save as a project doc / Just show me now (not saved) / Both" |

"Just show me now" still writes to a scratch path first (the `Artifact` tool needs a real file regardless of persistence intent), it just never lands under `docs/`, isn't registered in `REGISTRY.md`, and isn't offered the MDX-embed reference snippet — those apply only to persisted docs.

### Placement — co-located with what a diagram illustrates, not a single bucket

Matches the existing precedent already used elsewhere in this plugin: journeys are flat files at `docs/journeys/{name}.md`, and `/design`'s own audit/recommendations/declined caches are explicitly documented as living "alongside the ledger at `docs/plans/YYYY-MM-DD-{feature}-{...}.json`" — never a single central bucket.

| Caller | Placement |
|---|---|
| `/journeys` | `docs/journeys/{journey-name}-{diagram-type}.html` |
| `/specify` | `docs/plans/{spec-slug}-{diagram-type}.html` |
| `/review` | Ephemeral by default; persisted near `docs/architecture.md` only if the user asks to keep it |
| Direct/ad-hoc invocation, no calling context | `docs/diagrams/{slug}.html` — the fallback home |

**Docs registry impact:** only the `docs/diagrams/` fallback folder needs its own `REGISTRY.md` row (one collective row, no Auto-detect pattern — same treatment as `architecture.md`/`decisions/*.md`, since diagram regeneration is manual, not glob-triggered). Diagrams co-located with an existing journey or spec ride along with that doc's *existing* registry entry — they're a satellite asset of an already-registered doc, not a new doc concern. `docs/diagrams/` also needs adding to the Standard Folder Taxonomy (Tier 2+) in `skills/init/docs-structure.md`, alongside the existing `journeys/` and `plans/` entries.

## Migration from `diagram-design`

1. Remove `skills/_shared/diagram-integration-check.md` — superseded by `skills/_shared/visual-html-output.md` and `skills/visualize/SKILL.md`.
2. Remove `/init` Step 11's diagram-design install offer (`skills/init/bootstrap-steps.md` Step 11, and the summary line in `skills/init/SKILL.md`). Replace with a step introducing `/claude-tweaks:visualize` as a built-in capability (no install step needed — it's native) and rename the CLAUDE.md flag from `diagram-integration` to `diagram-suggestions` (describes what it gates — the "consider a diagram here" nudges — independent of the underlying skill's name, so a future skill rename doesn't require a second flag migration). No dedicated migration flow for existing projects — an old `diagram-integration:` line simply goes unread by the new soft-hook, which follows the same "missing flag = disabled" rule already used everywhere else in this plugin; the new flag is written the next time `/init` runs fresh.
3. Repoint `/journeys` Step 3.6, `/specify` Step 2.5d, and `/review`'s Lens 3i extension at `/claude-tweaks:visualize` instead of the old soft-hook file.
4. Add `docs/diagrams/` to the Standard Folder Taxonomy and a collective `REGISTRY.md` row template in `skills/init/docs-structure.md`.
5. Update `README.md`, `skills/help/reference-card.md`, and CLAUDE.md's skill directory list — add `visualize` under the Component skill category (it's invoked by `/journeys`/`/specify`/`/review`, matching that category's existing membership), remove all `diagram-design` companion-plugin mentions.
6. Update every skill's Relationship-to-Other-Skills table that currently references the diagram-design soft-hook (`/journeys`, `/specify`, `/review`) to reference `/claude-tweaks:visualize` instead — check both directions per file, since this plugin has had cross-reference-table bugs before where only one of two mentions in the same file got updated.

## Testing / verification implications

- The shared core's fallback behavior (no `DESIGN.md` present) needs a test path independent of Impeccable being installed at all — three states to cover: Impeccable absent, Impeccable present but `document` never run, and `DESIGN.md` present and parseable.
- The core-fragment/wrapper-adapter split should be tested by asserting the *same* core fragment (byte-for-byte SVG+style content) appears in all applicable wrapper outputs for a single generation — this is the mechanism that prevents the standalone file and the Artifact-published version from drifting apart.
- D2 enhanced-path tests need to skip gracefully (not fail) when the `d2` binary isn't installed in the test environment — mirroring the existing availability-check pattern used throughout `/design`.

## Open items (tracked here, not blocking approval)

- Confirm D2's exact shape vocabulary against current docs before finalizing the type→path table (Non-Goals).
- `memenu-app`-side follow-up: generalize `QuotaDashboardFrame`, add a diagrams passthrough convention to `sync-content.ts`, register the new component in `mdx-components.tsx`. Separate task, separate repo.
