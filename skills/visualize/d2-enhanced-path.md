# D2 Enhanced Path — Diagrams-as-Code Source + Re-themed Render

Used by `/claude-tweaks:visualize` — the enhanced/baseline decision is made in Step 1, and this file is read from Step 3 once placement is resolved.

## Step 1: Author the D2 source

Write a `.d2` file at the same base path as the eventual HTML output (e.g. `docs/journeys/{journey-name}-{type}.d2` alongside `docs/journeys/{journey-name}-{type}.html`) — this is the versioned source of truth, not scratch. Use the type-appropriate D2 construct: `shape: sequence_diagram` for sequence, `shape: sql_table` per entity for ER, plain nodes/edges with containers for architecture/flowchart/tree/layers/state/org-chart/nested.

**Quadrant (tentative construct):** D2 has no dedicated quadrant-chart shape. Approximate a 2x2 quadrant with a container carrying `grid-columns: 2` and `grid-rows: 2` attributes, one child node/container per cell (top-left, top-right, bottom-left, bottom-right), and two free-standing text labels positioned outside the grid container for the axis names (D2 has no native axis-label primitive). Before committing to this construct, verify current support with `d2 --version` and a throwaway smoke render of a minimal `grid-columns`/`grid-rows` snippet (`d2 --layout=elk /tmp/smoke.d2 /tmp/smoke.svg`); if that smoke render errors or the installed `d2` version predates grid-layout support, treat it as the same skip condition Step 2 below describes and fall back to `SKILL.md`'s baseline path instead.

## Step 2: Render to SVG

```bash
d2 --layout=elk "path/to/diagram.d2" "path/to/diagram.svg"
```

If this command fails or `d2` is not on PATH, fall back to `SKILL.md`'s baseline path instead of failing the whole generation — the D2 binary being unavailable is a skip condition, not an error, matching the availability-check pattern `/claude-tweaks:design-wrapper` already uses for Impeccable.

## Step 3: Re-theme the rendered SVG

D2's own theme system doesn't bind live CSS variables. Post-process the rendered SVG:

1. Parse the rendered `<svg>` for `fill="#..."` and `stroke="#..."` attributes.
2. Build a mapping from each distinct hex value found to the nearest token from `visual-html-output.md` Step 1's extracted palette, by role — D2's default theme roles (fill vs. stroke, node vs. edge) map to accent/neutral/border tokens respectively; use judgment for the specific project's token names, there's no universal 1:1 D2-color-to-token-name mapping.
3. Replace each matched `fill="#..."` / `stroke="#..."` with `fill="var(--token-name)"` / `stroke="var(--token-name)"`.
4. Wrap the re-themed SVG as the core fragment per `visual-html-output.md` Step 3 (same scoped-class-prefix rule applies).

## Step 4: Continue at SKILL.md Step 5

Placement and wrapper generation proceed identically to the baseline path from here.
