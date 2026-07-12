<!-- Concretized seed — this repo has no frontend/CSS to scan (it's a markdown-skills CLI plugin), so there is no later scan-mode pass to graduate to. Tokens below theme generated diagrams and docs (e.g. /claude-tweaks:visualize), not an implemented UI. -->
---
name: claude-tweaks
description: A structured development lifecycle system for Claude Code
colors:
  graphite-ink: "#1c1f24"
  graphite-ink-muted: "#5b6472"
  graphite-surface: "#f7f7f5"
  graphite-surface-muted: "#ececea"
  graphite-border: "#dcdcda"
  signal-amber: "#b8720f"
  signal-amber-deep: "#8f5a0c"
typography:
  display:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "clamp(1.5rem, 3vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  body:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.04em"
rounded:
  sm: "4px"
  md: "8px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
---

# Design System: claude-tweaks

## 1. Overview

**Creative North Star: "The Terminal Ledger"**

claude-tweaks is disciplined infrastructure, not a decorated surface — it reads more like a well-kept ledger than a marketing dashboard. Every visual choice traces back to a real mechanism the plugin actually runs (a label, a claim, a gate, a queue), not a decorative abstraction of one. The system is restrained by default: graphite neutrals carry nearly all of the surface, and a single signal-amber accent is reserved for the thing that actually gates progress (a decision point, a blocked state, an authorization boundary) — the same way a terminal reserves color for warnings, not chrome.

This explicitly rejects the generic AI-tool gradient dashboard: no purple-to-blue gradients, no glassy cards, no hero-metric tiles, no bouncy motion. References worth naming: Vercel, Linear, Raycast — crisp technical precision, confident whitespace, color used as signal rather than decoration.

**Key Characteristics:**
- Mono-forward typography throughout, terminal-native
- Restrained color: graphite neutrals + one amber accent, used sparingly
- Flat surfaces, sharp small radii — nothing soft or bubbly
- Motion limited to state feedback, never choreography

## 2. Colors

Nearly monochrome, tinted graphite, with amber reserved for gates and decision points.

### Primary
- **Signal Amber** (#b8720f): Used only for the thing that gates progress — a decision node, a blocked/needs-review state, an authorization boundary. Never used for routine flow or passive labels.

### Neutral
- **Graphite Ink** (#1c1f24): Primary text, dark mode surface.
- **Graphite Ink Muted** (#5b6472): Secondary text, captions, de-emphasized labels.
- **Graphite Surface** (#f7f7f5): Light mode background, warm-tinted off-white (never pure #fff).
- **Graphite Surface Muted** (#ececea): Light mode card/panel background, one step down from base surface.
- **Graphite Border** (#dcdcda): Dividers, panel edges, connector lines.

### Named Rules
**The One Signal Rule.** Amber appears on at most 10% of any given diagram or screen, and only at genuine decision or gate points. If more than one thing is amber, the accent has stopped meaning anything.

## 3. Typography

**Display Font:** JetBrains Mono (with ui-monospace, SFMono-Regular, Menlo fallback)
**Body Font:** JetBrains Mono (same stack)
**Label/Mono Font:** Same family — this system doesn't pair a mono accent against a humanist body, it commits to mono throughout.

**Character:** Terminal-native and unapologetically technical. The same typeface for headline and caption signals "no separate voice for marketing copy versus real content" — there isn't one.

### Hierarchy
- **Display** (600 weight, clamp(1.5rem, 3vw, 2.25rem), 1.15 line-height): Diagram titles, section headers.
- **Body** (400 weight, 0.9375rem, 1.5 line-height): Node descriptions, prose, doc body copy.
- **Label** (500 weight, 0.75rem, 0.04em letter-spacing, uppercase in use): Node kind tags, status badges, connector labels.

### Named Rules
**The One Voice Rule.** No serif, no humanist sans, anywhere in this system. If a design calls for a "friendlier" typeface, that's a signal the content should be simplified instead.

## 4. Elevation

Flat by default — no shadows. Depth is conveyed through the Graphite Surface / Graphite Surface Muted tonal step and 1px Graphite Border strokes, not blur or lift. This matches a ledger, not a card stack: things are adjacent and bordered, not floating.

### Named Rules
**The Flat-By-Default Rule.** Surfaces never cast shadows. Grouping is shown by a bordered container or a shared tonal background, never by elevation.

## 5. Components

### Diagram nodes
- **Shape:** Rectangular, sharp-ish corners (4px radius)
- **Default:** Graphite Border stroke, Graphite Surface Muted fill, Graphite Ink text
- **Gate/decision node:** Signal Amber stroke, amber label — reserved for actual authorization or branching points, never decorative
- **Connector labels:** Label typography, Graphite Ink Muted, positioned inline on the connector rather than boxed

### Status badges
- **Style:** Small filled pill, 4px radius, Label typography, uppercase
- **States:** Neutral (Graphite Surface Muted fill) for passive/informational; Amber fill only for blocked/needs-authorization states

## 6. Do's and Don'ts

### Do:
- **Do** reserve Signal Amber (#b8720f) for genuine gates and decision points only.
- **Do** use flat, bordered containers instead of shadowed cards.
- **Do** keep every label in JetBrains Mono — no secondary typeface.
- **Do** tint every neutral toward graphite; never pure #000 or #fff.

### Don't:
- **Don't** use gradients, especially purple-to-blue "AI SaaS" gradients — this system rejects the generic AI-tool gradient dashboard by name.
- **Don't** use glassmorphism, glassy cards, or backdrop blur.
- **Don't** build hero-metric tiles (big number, small label, gradient accent).
- **Don't** animate layout properties or use bounce/elastic easing — motion is feedback-only, never choreography.
- **Don't** use amber decoratively. If it's not a gate or a blocked state, it's graphite.
