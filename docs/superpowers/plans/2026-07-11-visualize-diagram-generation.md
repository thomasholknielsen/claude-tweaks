# Visualize (Diagram Generation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/claude-tweaks:visualize`, a native diagram-generation skill themed from Impeccable's `DESIGN.md` tokens, with a D2-enhanced rendering path, an `Artifact`-publish adapter, and MDX/Nextra docs-server compatibility baked in by default — then fully retire the external `diagram-design` companion-plugin integration it replaces.

**Architecture:** A shared, reusable procedure (`skills/_shared/visual-html-output.md`) owns token extraction, the core-fragment/wrapper-adapter pattern, the MDX/Nextra `postMessage` handshake, and the persist-vs-ephemeral decision. `/claude-tweaks:visualize` is the concrete skill consuming that shared core for SVG-diagram output, with two lazy-loaded sub-files (`d2-enhanced-path.md`, `artifact-publish.md`). Spec: `docs/superpowers/specs/2026-07-11-visualize-diagram-generation-design.md`.

**Tech Stack:** Pure markdown skill content — no Node code, no npm dependency, no new `bin/` script. This whole feature is prose-driven skill content interpreted directly by the agent (Read/Write/Bash), the same as the existing `routine-template` and `harness-health` skill-content additions in this repo. There is nothing to `node --test` here — verification per task is a self-check (re-read the written content against this plan's exact spec) plus, where noted, a `grep` sweep confirming no stale references remain.

## Global Constraints

- Skill file conventions (from CLAUDE.md): frontmatter `name`/`description`; the standard interaction-style directive verbatim; ASCII lifecycle diagram; `## When to Use`; `## Input`; numbered `## Workflow`; `## Next Actions` (top-level, before Component-Skill Contract/Anti-Patterns/Relationship); `## Anti-Patterns` table (`| Pattern | Why It Fails |`); `## Relationship to Other Skills` table (bidirectional — every reference must be reciprocated). No emojis anywhere.
- `## Component-Skill Contract` goes immediately before `## Anti-Patterns`, using the canonical CSC template from CLAUDE.md, keyed on `$PIPELINE_RUN_DIR`.
- Never write to `~/.claude-tweaks/` from skill content — that path is harness-owned.
- Don't spread parsed external JSON after derived/trusted fields.
- Commit style: imperative, no conventional-commit prefixes, e.g. `Add visual-html-output shared core — token theming, wrapper adapters, MDX handshake`.
- This is a git worktree (`worktree.always` policy) — verify `git branch --show-current` and `git rev-parse --show-toplevel` before every commit in every task.
- Every cross-reference edit in this plan must be checked in **both directions** — if file A's Relationship table gains a row pointing at visualize, visualize's own Relationship table (Task 2) must already have (or gain) the reciprocal row. This repo has a documented history of exactly this kind of one-sided fix slipping through task-scoped review.

---

### Task 1: Shared core — `skills/_shared/visual-html-output.md`

**Files:**
- Create: `skills/_shared/visual-html-output.md`

**Interfaces:**
- Produces: the token-extraction procedure, the neutral-fallback CSS block, the core-fragment/wrapper-adapter table, the MDX/Nextra handshake script, and the persist-vs-ephemeral `AskUserQuestion` shape — all referenced by Task 2's `SKILL.md` and Task 4's `artifact-publish.md`.

- [ ] **Step 1: Write the file**

Create `skills/_shared/visual-html-output.md`:

```markdown
# Visual HTML Output — Shared Core Procedure

Reusable procedure for producing themed, self-contained HTML+SVG visual output: token extraction from Impeccable's `DESIGN.md`, the core-fragment/wrapper-adapter pattern, MDX/Nextra docs-server compatibility, the `Artifact` publish adapter, and the persist-vs-ephemeral decision. Referenced by `/claude-tweaks:visualize` (diagrams). Any future skill producing themed HTML report output (e.g. a `/code-health`, `/harness-health`, `/journey-health`, or `/review` report mode) can invoke this file directly — it has no callable surface of its own, every step below is executed by the calling skill.

## Step 1: Token extraction

Read the project's `DESIGN.md` (canonical path: project root; fallback: `docs/design/DESIGN.md`, `docs/DESIGN.md` — same resolution order `/claude-tweaks:design`'s `pre-build` mode already uses). Parse the YAML frontmatter for `colors`, `typography`, `rounded`, `spacing`. Also read the sibling `DESIGN.json` sidecar (same directory, same basename) when present, for `extensions.colorMeta` tonal ramps and any dark-mode-specific values.

Map each `colors.<slug>` entry to a CSS custom property named `--<slug>` (kebab-case slugs pass through unchanged, e.g. `colors.basil-green` → `--basil-green`). Map `typography.<role>.fontFamily`/`fontSize`/`fontWeight`/`lineHeight`/`letterSpacing` to `--font-<role>-family`, `--font-<role>-size`, `--font-<role>-weight`, `--font-<role>-line-height`, `--font-<role>-letter-spacing`.

## Step 2: Fallback when DESIGN.md is absent

If no `DESIGN.md` is found at any of the three paths, before generating, call `AskUserQuestion`:

- `question`: `"No DESIGN.md found, so this diagram would use a generic default skin. Set up token theming first?"`
- `header`: `"Theming"`
- Option 1 — `label`: `"Run /impeccable document first (Recommended)"`, `description`: `"Generates DESIGN.md from your actual codebase, then this diagram (and every one after it) picks up your real palette"`
- Option 2 — `label`: `"Continue with neutral default skin"`, `description`: `"Generates the diagram now with a tasteful, generic palette — not tied to your project's tokens"`

If Impeccable itself isn't installed (no `/impeccable:impeccable*` skill resolves in the available skills list), Option 1's description becomes `"Install Impeccable, then run /impeccable document — then this diagram (and every one after it) picks up your real palette"` instead.

**Per-session dedupe:** the first time the user picks Option 2, set an in-memory session marker (never written to disk). Every subsequent call within the same session skips this `AskUserQuestion` entirely and goes straight to the neutral default skin — the same dedupe `/claude-tweaks:design`'s own availability check uses ("if the same mode skips twice for the same reason in a session, surface only the first skip"). The marker does not persist across sessions; a project's Impeccable setup can change between them.

**Neutral default skin** (used when `DESIGN.md` is absent and the user either declined or the session marker is set): a small fixed palette, not derived from any project:

```css
:root {
  --neutral-ink: #1a1d23;
  --neutral-ink-muted: #565d6b;
  --neutral-surface: #ffffff;
  --neutral-surface-muted: #f3f4f6;
  --neutral-border: #d7dbe0;
  --neutral-accent: #3d5a80;
}
:root[data-theme="dark"] {
  --neutral-ink: #e7e9ed;
  --neutral-ink-muted: #9aa1ac;
  --neutral-surface: #14161a;
  --neutral-surface-muted: #1d2026;
  --neutral-border: #2c313a;
  --neutral-accent: #7a9cc6;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --neutral-ink: #e7e9ed;
    --neutral-ink-muted: #9aa1ac;
    --neutral-surface: #14161a;
    --neutral-surface-muted: #1d2026;
    --neutral-border: #2c313a;
    --neutral-accent: #7a9cc6;
  }
}
```

## Step 3: Core fragment

Generate the visual content (an `<svg>...</svg>` for diagrams) plus a single scoped `<style>` block defining the tokens from Step 1 or Step 2's neutral fallback, using the `:root` / `:root[data-theme="dark"]` / `@media (prefers-color-scheme: dark)` shape shown above. Prefix every custom class name in the fragment with a unique per-diagram slug (e.g. `.vz-{slug}-node`, not bare `.node`) so multiple diagrams embedded in the same host document never collide.

This SVG+style pair is the **core** — every wrapper below reuses it byte-for-byte. Never regenerate it per-wrapper; regenerating independently per consumer is exactly how the standalone file and the Artifact-published version would drift apart.

## Step 4: Wrapper adapters

| Consumer | Wrapper |
|---|---|
| Standalone local file | `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>{Diagram Title}</title></head><body>{core}{handshake script from Step 5}</body></html>` |
| Markdown embed | Bare `{core}` — no title, no handshake script, pasted directly into the doc |
| Artifact publish | `<title>{Diagram Title}</title>{core}` — no `<!DOCTYPE>`/`<html>`/`<head>`/`<body>`, per the `Artifact` tool's own contract (see `skills/visualize/artifact-publish.md`) |

## Step 5: MDX/Nextra docs-server compatibility

Every standalone local file (the first row of the table above) always includes this script before `</body>` — unconditionally, not gated behind detection:

```html
<script>
(function () {
  if (window.parent === window) return;
  function reportHeightNow() {
    window.parent.postMessage(
      { type: 'height', height: document.documentElement.scrollHeight },
      window.location.origin
    );
  }
  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin) return;
    var data = event.data;
    if (data && data.type === 'theme' && (data.theme === 'dark' || data.theme === 'light')) {
      document.documentElement.dataset.theme = data.theme;
      reportHeightNow();
    }
  });
  var heightReportPending = false;
  new ResizeObserver(function () {
    if (heightReportPending) return;
    heightReportPending = true;
    requestAnimationFrame(function () {
      heightReportPending = false;
      reportHeightNow();
    });
  }).observe(document.body);
})();
</script>
```

This is inert with no parent frame (the `window.parent === window` check returns immediately), so it costs nothing for a plain standalone diagram. It matches, field-for-field, the handshake protocol a project's own docs-dashboard embed pattern would already run in production (e.g. an `iframe` + `postMessage` theme-sync component) — a project using that exact pattern can embed a generated diagram with zero changes to the diagram itself.

**Detection (soft signal, not a requirement):** check every `package.json` in the project for a dependency on `nextra`, `nextra-theme-docs`, `fumadocs`, `@next/mdx`, `contentlayer`, `docusaurus`, or `vitepress`. When found, surface this reference snippet in the skill's output (never write it into the target project directly — claude-tweaks doesn't know that project's file layout or whether a bespoke embed component already exists there):

```
Detected an MDX-based docs app in this project. To embed this diagram, a
generic React embed component (adapt to your framework) is:

  function EmbedFrame({ src, title }) {
    // iframe + postMessage theme-sync + ResizeObserver height-report —
    // matches the handshake script this diagram already includes.
    // See skills/_shared/visual-html-output.md Step 5 for the exact protocol.
  }

Copy the generated file into your docs app's static-asset directory
(however your project's own content-sync step does that), then embed it:

  <EmbedFrame src="/path/to/the-diagram.html" title="..." />
```

## Step 6: Artifact publish (delegate)

Offering to publish via the `Artifact` tool is a distinct procedure — read `skills/visualize/artifact-publish.md` only when the user accepts the offer.

## Step 7: Persist-vs-ephemeral

| Context | Default | Still asks? |
|---|---|---|
| Invoked via a soft-hook caller already producing a doc (e.g. `/journeys`, `/specify`, `/review`) | Save as project doc | No |
| Invoked directly, ad-hoc, no calling context | — | Yes — `AskUserQuestion`: `"Save as a project doc"` / `"Just show me now (not saved)"` / `"Both"` |

"Just show me now" still writes the core fragment + standalone wrapper to a scratch path first — the `Artifact` tool needs a real file on disk regardless of whether the output is meant to be a durable project doc. It just never lands under a project's `docs/` tree, is never registered in `REGISTRY.md`, and the MDX-embed reference snippet from Step 5 is not offered (there's nothing to embed if it isn't staying in the project).
```

- [ ] **Step 2: Self-check against the design spec**

Re-read `docs/superpowers/specs/2026-07-11-visualize-diagram-generation-design.md`'s "Token extraction & theming", "Output & embedding", and "Persist-vs-ephemeral decision" sections. Confirm every element named there (the `:root`/`:root[data-theme="dark"]`/`@media` CSS shape, the three wrapper rows, the handshake script's `postMessage` field names, the persist-vs-ephemeral table) matches this file exactly. Fix any mismatch before committing.

- [ ] **Step 3: Trace the three DESIGN.md fallback states**

The design spec's "Testing / verification implications" section calls out three states this file's Steps 1-2 must handle correctly. Trace each by hand against the written file and confirm the outcome:

1. **Impeccable not installed at all** (no `/impeccable:impeccable*` skill resolves): Step 2's `AskUserQuestion` fires with Option 1's description reading "Install Impeccable, then run /impeccable document..." — confirm the file's conditional wording for this case is present.
2. **Impeccable installed, `/impeccable document` never run** (no `DESIGN.md` at any of the three paths): Step 2's `AskUserQuestion` fires with Option 1's plain description ("Generates DESIGN.md from your actual codebase...").
3. **`DESIGN.md` present and parseable**: Step 1 runs directly, no `AskUserQuestion` at all.

If any of the three isn't clearly distinguishable from the written file's text, revise Step 1 or Step 2 before committing.

- [ ] **Step 4: Commit**

```bash
git -C "$(pwd)" rev-parse --show-toplevel  # confirm still inside the worktree
git branch --show-current
git add skills/_shared/visual-html-output.md
git commit -m "Add visual-html-output shared core — token theming, wrapper adapters, MDX handshake"
```

---

### Task 2: `/claude-tweaks:visualize` skill — main `SKILL.md`

**Files:**
- Create: `skills/visualize/SKILL.md`

**Interfaces:**
- Consumes: `skills/_shared/visual-html-output.md` (Task 1) Steps 1, 2, 3, 4, 5, 7.
- Produces: the `<type> <topic> [--source <caller>]` input contract Task 5's rewritten soft-hooks depend on; the placement table Task 6/7 cross-reference.

- [ ] **Step 1: Write the file**

Create `skills/visualize/SKILL.md`:

```markdown
---
name: claude-tweaks:visualize
description: Use when you want a themed, project-local visual diagram — architecture, flowchart, sequence, state, ER, timeline, swimlane, quadrant, nested, tree, org chart, layer stack, venn, or pyramid — generated as self-contained HTML+SVG and styled from the project's own DESIGN.md tokens. Works standalone or as a soft-hook suggestion from /journeys, /specify, and /review.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.


# Visualize — Themed Diagram Generation

Generates a self-contained HTML+SVG diagram, themed from the project's own design tokens, embeddable in project docs and optionally publishable via the `Artifact` tool.

```
                       [ /claude-tweaks:visualize ] ← utility (no fixed lifecycle position)
                                    ↑
   Used by: /claude-tweaks:journeys (Step 3.6), /claude-tweaks:specify (Step 2.5d),
            /claude-tweaks:review (Lens 3i-diagram), ad-hoc direct invocation
```

## When to Use

- A journey, spec, or review finding describes something a diagram would clarify — a state machine, a data model, a multi-actor flow, a decision tree, or a layered architecture.
- You want a quick diagram of an idea mid-conversation, whether or not it ends up as a committed project doc.
- You want to replace a hand-drawn or stale diagram with one that matches the project's actual current palette.

## Input

`$ARGUMENTS` is parsed as `<type> <topic>`:

| Type | Diagram |
|------|---------|
| `architecture` | 3+ components/services in a system layout |
| `flowchart` | Branching logic with named conditions |
| `sequence` | 2+ actors exchanging messages over time |
| `state` | An entity has named states + transitions |
| `er` | Schema/entities with relations |
| `timeline` | Ordered events along a fixed axis |
| `swimlane` | A process crosses 2+ roles/departments |
| `quadrant` | Two-axis ranking |
| `nested` | Contained/grouped relationships |
| `tree` | Parent-child hierarchy, taxonomy |
| `org-chart` | Reporting structure |
| `layers` | Abstraction levels (transport → app → ui) |
| `venn` | Set overlap |
| `pyramid` | Stacked priority/maturity levels |

`<topic>` is free text describing what to diagram. If `$ARGUMENTS` is empty, ask the user for both.

Flags:
- `--source <caller>` — set by soft-hook callers (`journeys`, `specify`, `review`) to select default placement (Step 4) without prompting.

## Workflow

### Step 1: Resolve type, topic, and generation path

Resolve `<type>` from Input. Look up the generation path — **enhanced** when the `d2` binary is installed (`d2 --version` exits 0) and the type has a D2-native mapping; **baseline** otherwise (always available):

| Type | Path | D2 construct |
|---|---|---|
| `sequence` | Enhanced | `shape: sequence_diagram` |
| `er` | Enhanced | `shape: sql_table` |
| `architecture`, `flowchart`, `tree`, `layers`, `state`, `org-chart`, `nested` | Enhanced | Container-based directed graph |
| `quadrant` | Enhanced (tentative — confirm against current D2 docs; fall back to baseline if unsupported) | Grid layout |
| `timeline`, `swimlane`, `venn`, `pyramid` | Baseline only | No native fit |

For the enhanced path, read `d2-enhanced-path.md` in this skill's directory, then continue at this file's Step 4. For the baseline path, continue directly below.

### Step 2: Token extraction and theming (baseline path)

Read `skills/_shared/visual-html-output.md` Steps 1-2. Extract tokens from `DESIGN.md`/`DESIGN.json` when present; otherwise run the fallback `AskUserQuestion` (once per session — see the dedupe rule in that file).

### Step 3: Generate the core fragment (baseline path)

Author the `<svg>` content directly for the diagram type and topic, binding every color to `var(--token-name)` from Step 2's extracted (or neutral fallback) palette. Follow `visual-html-output.md` Step 3's scoping rule — every custom class prefixed with a unique per-diagram slug.

### Step 4: Resolve placement

| Caller (`--source`) | Placement |
|---|---|
| `journeys` | `docs/journeys/{journey-name}-{type}.html` |
| `specify` | `docs/plans/{spec-slug}-{type}.html` |
| `review` | Ephemeral by default; ask before persisting near `docs/architecture.md` |
| *(none — direct invocation)* | Run `visual-html-output.md` Step 7's `AskUserQuestion`; "Save as a project doc" resolves to `docs/diagrams/{slug}.html` |

### Step 5: Write wrapper outputs

Apply `visual-html-output.md` Step 4's adapters. Always write the standalone-file wrapper to the path from Step 4. Write the markdown-embed wrapper's content inline in this skill's own response (for the user to copy into a doc) rather than as a separate file — it's a snippet, not a standalone artifact.

### Step 6: Offer to publish via Artifact

Call `AskUserQuestion`: `question`: `"Also publish this as a shareable Artifact link?"`, `header`: `"Artifact"`, options `"Yes"` / `"No"` — no default marked Recommended; this is a genuine toss-up, not a best-practice call. On `"Yes"`, read `artifact-publish.md` in this skill's directory.

### Step 7: Registry update (persisted diagrams only)

If Step 4 resolved to `docs/diagrams/{slug}.html` (the context-free fallback path) and no `REGISTRY.md` row for `docs/diagrams/` exists yet, add one: `| docs/diagrams/ | Generated visual diagrams | — |` (no Auto-detect — matches `architecture.md`/`decisions/*.md` treatment). Diagrams placed under `docs/journeys/` or `docs/plans/` need no new row — they ride along with that doc's existing registry entry.

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:visualize` is running inside a pipeline (invoked by `/claude-tweaks:journeys`, `/claude-tweaks:specify`, `/claude-tweaks:review`, or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal).

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Regenerating the core fragment separately per wrapper | The standalone file, markdown embed, and Artifact-published version drift apart. Generate once (Step 3), wrap three ways (Step 5). |
| Re-asking the DESIGN.md fallback question every invocation | Annoys a user who's already decided not to use Impeccable. Dedupe per session (`visual-html-output.md` Step 2). |
| Forcing a baseline-only type through the D2 enhanced path | Timeline/swimlane/venn/pyramid have no graph-shaped representation — this fights the tool the same way theming fights Mermaid/D2's own engines. |
| Auto-invoking the `Artifact` tool without asking | Publishing is always an explicit `AskUserQuestion` — never automatic, and silently skipped (not failed) if the tool isn't present in the session. |
| Writing every diagram to a single central `docs/diagrams/` folder regardless of caller | Co-locate with what the diagram illustrates (Step 4) — `docs/diagrams/` is the fallback for context-free invocations only. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:journeys` | Step 3.6 invokes this skill with `--source journeys` when a journey shows a multi-persona, decision-tree, or multi-actor signal. |
| `/claude-tweaks:specify` | Step 2.5d invokes this skill with `--source specify` for every surface (not just frontend) when the design doc describes a state machine, schema, multi-actor flow, decision tree, layered architecture, or hierarchy. |
| `/claude-tweaks:review` | Lens 3i-diagram invokes this skill with `--source review` as an informational finding when the diff added structural complexity with no matching diagram on disk. |
| `/claude-tweaks:design` | Not invoked directly — this skill reads `DESIGN.md`/`DESIGN.json` (written by `/impeccable:impeccable document`, the same files `/design pre-build` mode lazy-loads) but does not go through the `/design` wrapper, since it needs the raw token data, not a critique/audit/polish action. |
| `/claude-tweaks:init` | Step 11 offers to enable diagram suggestions (writes `diagram-suggestions: enabled/disabled` to CLAUDE.md — no install step, this skill is native). |
| `skills/_shared/visual-html-output.md` | Shared core this skill consumes for token extraction, wrapper adapters, MDX/Nextra compatibility, and the persist-vs-ephemeral decision. |

## Next Actions

After generating (and, if accepted, publishing), call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Generate another diagram (Recommended if more signals matched)"`, `description`: `"/claude-tweaks:visualize <type> <topic> — generate another diagram"`
- Option 2 — `label`: `"Continue the calling flow"`, `description`: `"Return to wherever this was invoked from (journey commit, spec summary, review findings)"`
- Option 3 (only when persisted) — `label`: `"View the file"`, `description`: `"Open {path} to see the generated diagram"`
```

- [ ] **Step 2: Self-check against the design spec**

Re-read `docs/superpowers/specs/2026-07-11-visualize-diagram-generation-design.md`'s "Diagram type → generation path" table, "Placement" table, and "Persist-vs-ephemeral decision" table. Confirm this file's Step 1 and Step 4 tables match exactly (same 14 types, same path assignments, same placement rules). Fix any mismatch before committing.

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add skills/visualize/SKILL.md
git commit -m "Add /claude-tweaks:visualize — themed diagram generation skill"
```

---

### Task 3: D2 enhanced-path sub-file

**Files:**
- Create: `skills/visualize/d2-enhanced-path.md`

**Interfaces:**
- Consumes: `visual-html-output.md` (Task 1) Step 1's extracted palette; `SKILL.md` (Task 2) Step 1's type→path table.
- Produces: the re-themed core fragment `SKILL.md` Step 4 continues from.

- [ ] **Step 1: Write the file**

Create `skills/visualize/d2-enhanced-path.md`:

```markdown
# D2 Enhanced Path — Diagrams-as-Code Source + Re-themed Render

Used by `/claude-tweaks:visualize` Step 1 when the `d2` binary is installed and the diagram type has a D2-native mapping (see the table in `SKILL.md` Step 1).

## Step 1: Author the D2 source

Write a `.d2` file at the same base path as the eventual HTML output (e.g. `docs/journeys/{journey-name}-{type}.d2` alongside `docs/journeys/{journey-name}-{type}.html`) — this is the versioned source of truth, not scratch. Use the type-appropriate D2 construct: `shape: sequence_diagram` for sequence, `shape: sql_table` per entity for ER, plain nodes/edges with containers for architecture/flowchart/tree/layers/state/org-chart/nested.

## Step 2: Render to SVG

```bash
d2 --layout=elk "path/to/diagram.d2" "path/to/diagram.svg"
```

If this command fails or `d2` is not on PATH, fall back to `SKILL.md`'s baseline path instead of failing the whole generation — the D2 binary being unavailable is a skip condition, not an error, matching the availability-check pattern `/claude-tweaks:design` already uses for Impeccable.

## Step 3: Re-theme the rendered SVG

D2's own theme system doesn't bind live CSS variables. Post-process the rendered SVG:

1. Parse the rendered `<svg>` for `fill="#..."` and `stroke="#..."` attributes.
2. Build a mapping from each distinct hex value found to the nearest token from `visual-html-output.md` Step 1's extracted palette, by role — D2's default theme roles (fill vs. stroke, node vs. edge) map to accent/neutral/border tokens respectively; use judgment for the specific project's token names, there's no universal 1:1 D2-color-to-token-name mapping.
3. Replace each matched `fill="#..."` / `stroke="#..."` with `fill="var(--token-name)"` / `stroke="var(--token-name)"`.
4. Wrap the re-themed SVG as the core fragment per `visual-html-output.md` Step 3 (same scoped-class-prefix rule applies).

## Step 4: Continue at SKILL.md Step 4

Placement, wrapper generation, and the Artifact offer proceed identically to the baseline path from here.
```

- [ ] **Step 2: Self-check against the design spec**

Re-read the design spec's "Diagram type → generation path" section and its rationale for choosing D2 (single-binary, no Puppeteer dependency; `theme-overrides`/`dark-theme-overrides` as the closest hook). Confirm this file's Step 2/3 don't contradict that rationale (e.g. don't introduce a Puppeteer-based render path).

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add skills/visualize/d2-enhanced-path.md
git commit -m "Add visualize D2 enhanced path — diagrams-as-code source + re-theming"
```

---

### Task 4: Artifact-publish sub-file

**Files:**
- Create: `skills/visualize/artifact-publish.md`

**Interfaces:**
- Consumes: the core fragment produced by `SKILL.md` Step 3 or `d2-enhanced-path.md` Step 3/4.
- Produces: the `Artifact` tool call `SKILL.md` Step 6 delegates to.

- [ ] **Step 1: Write the file**

Create `skills/visualize/artifact-publish.md`:

```markdown
# Artifact Publish Adapter

Used by `/claude-tweaks:visualize` Step 6 when the user accepts the "publish as a shareable Artifact link" offer.

## Step 1: Derive the Artifact fragment

Reuse the exact core fragment from `SKILL.md` Step 3 (or `d2-enhanced-path.md` Step 3/4 for the enhanced path) — do not regenerate. Wrap it per `visual-html-output.md` Step 4's Artifact row: `<title>{Diagram Title}</title>{core}` — no `<!DOCTYPE>`, `<html>`, `<head>`, or `<body>` tags.

## Step 2: Write to the stable sidecar path

Write the fragment to `{same-directory-as-main-file}/{slug}.artifact.html` — e.g. if the main diagram is `docs/journeys/checkout-flow-swimlane.html`, the sidecar is `docs/journeys/checkout-flow-swimlane.artifact.html`. This path must stay stable across regenerations of the same diagram, since the `Artifact` tool only republishes to the same URL when called again with the same `file_path`.

## Step 3: Pick the favicon

| Type | Favicon | Type | Favicon |
|---|---|---|---|
| `architecture` | 🏛️ | `state` | 🔁 |
| `flowchart` | 🔀 | `er` | 🗄️ |
| `sequence` | ↔️ | `timeline` | ⏱️ |
| `swimlane` | 🏊 | `quadrant` | 📐 |
| `tree` | 🌳 | `layers` | 🧱 |
| `org-chart` | 🏢 | `nested` | 🎯 |
| `venn` | ⭕ | `pyramid` | 🔺 |

This lookup is fixed — the `Artifact` tool requires the favicon to stay stable across redeploys of the same artifact, so never pick a new one on a re-publish of the same diagram.

## Step 4: Call the Artifact tool

```
Artifact({
  file_path: "{sidecar path from Step 2}",
  description: "{Diagram type} diagram: {topic}",
  favicon: "{favicon from Step 3}"
})
```

## Step 5: Log if inside a pipeline

When `$PIPELINE_RUN_DIR` is set, append to `$PIPELINE_RUN_DIR/decisions.md`:

```
STAGED {HH:MM:SS} — artifact-publish: published {slug} as a shareable Artifact. Reversibility: high.
```

This is `STAGED`, not `AUTO` — the user explicitly accepted the offer in `SKILL.md` Step 6; this line documents that an already-user-approved action happened, it isn't logging a silent auto-decision.
```

- [ ] **Step 2: Self-check against the design spec**

Re-read the design spec's "Artifact publish adapter" section. Confirm the favicon table here has all 14 entries matching the spec's table exactly (same emoji per type), and that Step 2's sidecar path convention (`{slug}.artifact.html`, same directory) matches.

- [ ] **Step 3: Verify the no-regeneration invariant**

The design spec's "Testing / verification implications" section requires the same core fragment to appear byte-for-byte in every wrapper — this is what prevents the standalone file and the Artifact-published version from drifting apart. Confirm this file's Step 1 explicitly says "do not regenerate" (reuse the fragment from `SKILL.md` Step 3 / `d2-enhanced-path.md` Step 3-4 verbatim). If Step 1 describes re-authoring the SVG instead of reusing it, fix it before committing.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add skills/visualize/artifact-publish.md
git commit -m "Add visualize Artifact-publish adapter — favicon table, stable sidecar path"
```

---

### Task 5: Repoint `/journeys`, `/specify`, `/review` soft-hooks

**Files:**
- Modify: `skills/journeys/SKILL.md:105-131` (Step 3.6 section), `skills/journeys/SKILL.md:205` and `:208` (Relationship table rows)
- Modify: `skills/specify/SKILL.md:209-239` (Step 2.5d section), `skills/specify/SKILL.md:444-445` (Relationship table rows)
- Modify: `skills/review/SKILL.md:262-286` (Lens 3i-diagram section), `skills/review/SKILL.md:477-478` (Relationship table rows)

**Interfaces:**
- Consumes: `/claude-tweaks:visualize <type> <topic> --source <caller>` (Task 2).

- [ ] **Step 1: Rewrite journeys' Step 3.6**

In `skills/journeys/SKILL.md`, replace the entire block from `## Step 3.6: Diagram Suggestion (companion plugin)` (line 105) through the line ending `...auto-triggers from its skill description if asked.` (line 131), with:

```markdown
## Step 3.6: Diagram Suggestion

Read the `diagram-suggestions` flag from CLAUDE.md (written by `/init` Step 11). When the flag is `disabled` or missing, skip this step silently.

When the flag is `enabled`, scan the journey file(s) just written/updated and detect the strongest signal:

| Journey contains | Signal | Suggested type |
|------------------|--------|-----------------|
| 2+ named personas or roles handing off between steps | `multi-persona` | `swimlane` |
| 3+ branches with named conditions (`If …`, "When the user is …", success-vs-error paths) | `decision-tree` | `flowchart` |
| 2+ external services / APIs the user passes through in sequence | `multi-actor` | `sequence` |
| None of the above | — | Skip — emit no recommendation |

Emit at most one recommendation per journey. Place the block above the "Step 4: Commit" output, prefixed `### Diagram suggestion`:

```
### Diagram suggestion

**Diagram suggestion:** This journey (`checkout-flow`) crosses 2 personas
(shopper → support agent). Consider a swimlane diagram:
`/claude-tweaks:visualize swimlane checkout-flow --source journeys`
```

The user decides whether to act — this is advisory, not automatic.
```

- [ ] **Step 2: Repoint journeys' Relationship table rows**

In `skills/journeys/SKILL.md`, find the row at line 205:

```
| `_shared/diagram-integration-check.md` | Step 3.6 reads this for the flag check and signal→type mapping. Soft-hook only — emits a recommendation, never invokes the companion plugin. |
```

and the row at line 208:

```
| `cathrynlavery/diagram-design` (companion) | Step 3.6 emits "consider a diagram here" recommendations when journey signals match (multi-persona → swimlane, decision branches → flowchart, multi-actor → sequence). Gated by `diagram-integration: enabled` in CLAUDE.md (written by `/init` Step 11). |
```

Replace both with a single row:

```
| `/claude-tweaks:visualize` | Step 3.6 suggests invoking this skill when journey signals match (multi-persona → swimlane, decision branches → flowchart, multi-actor → sequence). Gated by `diagram-suggestions: enabled` in CLAUDE.md (written by `/init` Step 11). |
```

- [ ] **Step 3: Rewrite specify's Step 2.5d**

In `skills/specify/SKILL.md`, replace the entire block from `## Step 2.5d: Diagram Suggestion (all specs, companion plugin)` (line 209) through the `**Auto mode:** ...` line (line 239), with:

```markdown
## Step 2.5d: Diagram Suggestion (all specs)

**Unlike Step 2.5, this runs for every surface** — architecture, ER, sequence, and state diagrams help backend and infra specs equally.

Read the `diagram-suggestions` flag from CLAUDE.md (written by `/init` Step 11). When the flag is `disabled` or missing, skip this step silently.

When `enabled`, scan the design doc text + decomposed spec titles for structural signals. Use this detection table:

| Signal in design doc | Diagram type (suggest) |
|----------------------|------------------------|
| Phrases like "state machine", "states:", "transitions from … to …", named status enums (3+ values) | `state` |
| Schema definitions, `entity`, `references`, `foreign key`, ORM relations between 2+ tables | `er` |
| 3+ services / actors / queues exchanging messages or HTTP calls | `sequence` |
| 3+ named branches in a decision (`If A then B; if C then D; otherwise E`) | `flowchart` |
| 3+ system components / boxes in a layout (microservices, layers, gateways) | `architecture` |
| Parent-child taxonomy with 2+ levels (categories → subcategories → items) | `tree` |

Emit at most **two** recommendations per design doc — the two strongest matches. Skip emission entirely if no signal matches (trivial specs and refactors should not trigger the hook).

For each emitted recommendation:

```
**Diagram suggestion:** This design doc describes a state machine for orders
(pending → paid → shipped → delivered → refunded). Consider a state diagram:
`/claude-tweaks:visualize state {spec-slug} --source specify`
```

Place these recommendations in the Step 9 summary under a `### Diagram suggestions` block. They are advisory — they do not block decomposition, do not write spec frontmatter, and do not invoke any tool. The user decides whether to act in the next conversation turn.

**Auto mode:** the diagram suggestion is always advisory — `auto` mode emits the recommendation without prompting, logs `STAGED {time} — Step 2.5d: diagram-suggestion ({type}) for {spec/slug}. Reversibility: high.` to the decision log, and continues. No mid-flow stop.
```

- [ ] **Step 4: Repoint specify's Relationship table rows**

In `skills/specify/SKILL.md`, find the row at line 444:

```
| `_shared/diagram-integration-check.md` | Step 2.5d reads this for the flag check and signal→type mapping. Soft-hook only — emits a recommendation, never invokes the companion plugin. |
```

and the row at line 445:

```
| `cathrynlavery/diagram-design` (companion) | Step 2.5d emits "consider a diagram here" recommendations for ALL specs (not gated to frontend) when the design doc describes state machines, schemas, multi-actor flows, decision branches, hierarchies, or architectures. Gated by `diagram-integration: enabled` in CLAUDE.md (written by `/init` Step 11). |
```

Replace both with a single row:

```
| `/claude-tweaks:visualize` | Step 2.5d suggests invoking this skill for ALL specs (not gated to frontend) when the design doc describes state machines, schemas, multi-actor flows, decision branches, hierarchies, or architectures. Gated by `diagram-suggestions: enabled` in CLAUDE.md (written by `/init` Step 11). |
```

- [ ] **Step 5: Rewrite review's Lens 3i-diagram section**

In `skills/review/SKILL.md`, replace the entire block from `#### 3i-diagram: Visual documentation gap (informational, companion plugin)` (line 262) through the `- docs/diagrams/ already contains a file matching the changed area → emit nothing (the diagram exists; we're not gating on freshness for diagrams since they're hand-drawn)` line (line 286), with:

```markdown
#### 3i-diagram: Visual documentation gap (informational)

Read the `diagram-suggestions` flag from CLAUDE.md (written by `/init` Step 11). **Skip silently when** `diagram-suggestions` is `disabled` or missing.

When `enabled`, scan the diff for **structural complexity** signals:

| Diff added | Signal |
|------------|--------|
| New / changed enum or `status:` field with 3+ states + a transition function (e.g., `switch (status)`, `transitionTo`, state-pattern files) | `state-machine` |
| New migration or ORM model with `references` / `foreignKey` / `belongsTo` between 2+ entities | `data-model` |
| New API routes / message handlers in 3+ service directories, OR a workflow file orchestrating 3+ services | `multi-actor` |
| 3+ new top-level directories under `src/` or new module boundaries | `architecture` |

If a signal matches **and** the co-located diagram location for this change (`docs/journeys/`, `docs/plans/`, or `docs/diagrams/` — see `/claude-tweaks:visualize`'s placement table) is missing OR contains no file whose name matches the changed area, emit ONE informational finding per matched signal (max 2 total to avoid noise):

```
| {N} | Visual documentation gap: change added a {signal-description}; no matching diagram found. Consider `/claude-tweaks:visualize {type} {topic}`. | Low | Docs | {representative-file} | Suggest to user in wrap-up |
```

Like other Lens 3i findings, these are informational and don't block review — they're a documentation gap, not a code defect. The user (or Claude) can act on the recommendation in wrap-up by invoking `/claude-tweaks:visualize`.

**Skip conditions:**
- `diagram-suggestions` is `disabled` or missing → emit nothing
- Signal detection produced no matches → emit nothing (most reviews trigger zero diagram findings; this is correct)
- A matching diagram already exists → emit nothing (we're not gating on freshness for diagrams since they're hand-drawn)
```

- [ ] **Step 6: Repoint review's Relationship table rows**

In `skills/review/SKILL.md`, find the row at line 477:

```
| `_shared/diagram-integration-check.md` | Lens 3i-diagram reads this for the flag check and signal→type mapping. Soft-hook only — emits one informational finding per matched signal, never invokes the companion plugin. |
```

and the row at line 478:

```
| `cathrynlavery/diagram-design` (companion) | Lens 3i-diagram emits "Visual documentation gap" informational findings when the diff added structural complexity (state machine, data model, multi-actor flow, architecture) but `docs/diagrams/` has no matching file. Gated by `diagram-integration: enabled` in CLAUDE.md (written by `/init` Step 11). |
```

Replace both with a single row:

```
| `/claude-tweaks:visualize` | Lens 3i-diagram emits "Visual documentation gap" informational findings when the diff added structural complexity (state machine, data model, multi-actor flow, architecture) but no matching diagram file exists. Gated by `diagram-suggestions: enabled` in CLAUDE.md (written by `/init` Step 11). |
```

- [ ] **Step 7: Verify each of the three skills' Relationship table now reciprocates visualize's Task 2 entry**

`skills/visualize/SKILL.md` (Task 2) already lists `/claude-tweaks:journeys`, `/claude-tweaks:specify`, and `/claude-tweaks:review` in its own Relationship table — confirm this by re-reading that table (no edit needed if Task 2 was completed as written).

- [ ] **Step 8: Grep sweep for stale references left in these three files**

```bash
grep -n -i "diagram-design\|diagram-integration\|companion plugin" skills/journeys/SKILL.md skills/specify/SKILL.md skills/review/SKILL.md
```

Expected: no output. If anything matches, fix it before committing.

- [ ] **Step 9: Commit**

```bash
git branch --show-current
git add skills/journeys/SKILL.md skills/specify/SKILL.md skills/review/SKILL.md
git commit -m "Repoint journeys/specify/review diagram soft-hooks at /claude-tweaks:visualize"
```

---

### Task 6: Remove `diagram-design` integration

**Files:**
- Delete: `skills/_shared/diagram-integration-check.md`
- Modify: `skills/init/bootstrap-steps.md:373-427` (Step 11 section)
- Modify: `skills/init/SKILL.md:116-118` (Step 11 summary), `skills/init/SKILL.md:469` (compatibility table row)
- Modify: `skills/init/docs-structure.md` (Standard Folder Taxonomy — Tier 2 and Tier 3 folder lists, Auto-detect guideline bullet)

**Interfaces:**
- Consumes: nothing new — this task only removes/rewrites existing content.

- [ ] **Step 1: Delete the old shared soft-hook file**

```bash
git rm skills/_shared/diagram-integration-check.md
```

- [ ] **Step 2: Rewrite init's bootstrap Step 11**

In `skills/init/bootstrap-steps.md`, replace the entire block from `### Step 11 — Diagram Design (Recommended Companion)` (line 373) through the `**Failure handling:** ...` line (line 426), with:

```markdown
### Step 11 — Diagram Suggestions

claude-tweaks ships a native diagram-generation skill, `/claude-tweaks:visualize` — no install step, nothing external to set up. Soft-hook nudges in `/journeys`, `/specify`, and `/review` surface "consider a diagram here" recommendations when a journey, spec, or review finding describes flows or structures that benefit from a visual.

This recommendation is **offered for every project** — architecture, ER, sequence, and state diagrams help backend and infra specs equally, the same as frontend ones.

**Present:**

```
Enable diagram suggestions?

/journeys, /specify, and /review can suggest generating a themed diagram
(via /claude-tweaks:visualize, a native skill — nothing to install) when
they detect a state machine, data model, multi-actor flow, decision tree,
or layered architecture.

1. Enable (Recommended) — writes diagram-suggestions: enabled
2. Skip — writes diagram-suggestions: disabled (silences future nudges)
```

**Write the flag to CLAUDE.md.** Extend (or create) the existing `## Design integration` section with a second line:

```markdown
## Design integration

design-integration: enabled
diagram-suggestions: enabled
```

Use the appropriate value:

| Choice | Flag value |
|--------|-----------|
| Option 1 (Enable) | `enabled` |
| Option 2 (Skip) | `disabled` |

The soft-hook nudges in `/journeys`, `/specify`, and `/review` read this flag and short-circuit when set to `disabled` (or absent). Missing flag is treated identically to `disabled`.

**Re-run behavior:** When `/init` is re-run on a project where `diagram-suggestions: enabled`, this step is a no-op. When the flag is `disabled`, offer the upgrade path back to `enabled`. When the flag is **missing** — including on a project whose CLAUDE.md still has a pre-visualize `diagram-integration:` line, which nothing reads anymore — present the first-run prompt, same as a fresh init.
```

- [ ] **Step 3: Rewrite init's Step 11 summary and compatibility row**

In `skills/init/SKILL.md`, replace lines 116-118:

```
### Step 11: Diagram Design (Recommended Companion)

Always offered (not frontend-gated). Present the two-option diagram-design setup prompt (Install / Skip) and write the `diagram-integration` flag to CLAUDE.md under the existing `## Design integration` section. Soft-hook nudges in `/specify`, `/build`, and `/review` read this flag to decide whether to surface "consider a diagram here" recommendations. Read `bootstrap-steps.md` (Step 11) for the full procedure.
```

with:

```
### Step 11: Diagram Suggestions

Always offered (not frontend-gated). Present the two-option diagram-suggestions prompt (Enable / Skip) and write the `diagram-suggestions` flag to CLAUDE.md under the existing `## Design integration` section. Soft-hook nudges in `/journeys`, `/specify`, and `/review` read this flag to decide whether to suggest invoking `/claude-tweaks:visualize`. No install step — `/claude-tweaks:visualize` is a native skill. Read `bootstrap-steps.md` (Step 11) for the full procedure.
```

Note: the original text said "Soft-hook nudges in `/specify`, `/build`, and `/review`" — `/build` was never actually one of the three callers (the real callers are `/journeys`, `/specify`, `/review`, confirmed against `README.md`'s own description and each caller's own SKILL.md). The rewritten line above corrects this pre-existing inconsistency rather than carrying it forward.

Then replace line 469:

```
| `cathrynlavery/diagram-design` (companion) | Step 11 offers to install the external `diagram-design` plugin and writes the `diagram-integration` flag to CLAUDE.md. Soft-hook nudges in `/specify`, `/build`, and `/review` read the flag to decide whether to surface "consider a diagram here" recommendations. |
```

with:

```
| `/claude-tweaks:visualize` | Step 11 offers to enable diagram suggestions and writes the `diagram-suggestions` flag to CLAUDE.md — no install step, this skill is native. Soft-hook nudges in `/journeys`, `/specify`, and `/review` read the flag to decide whether to suggest invoking it. |
```

- [ ] **Step 4: Add `docs/diagrams/` to the Standard Folder Taxonomy**

In `skills/init/docs-structure.md`, in the Tier 2 folder tree (inside the fenced block under `### Tier 2 (README + flat docs)`), after the `plans/                 ← already exists` line, add:

```
  diagrams/                ← already exists (generated by /claude-tweaks:visualize)
```

Do the same in the Tier 3 folder tree (`### Tier 3 (full structure)`), after its `plans/                   ← already exists` line.

Then, in the "Auto-detect pattern guidelines" bullet list, extend the existing bullet:

```
- Architecture docs (`architecture.md`, `decisions/*.md`) typically have no Auto-detect — they're updated on structural changes caught by `/wrap-up`
```

to:

```
- Architecture docs (`architecture.md`, `decisions/*.md`) and `docs/diagrams/` typically have no Auto-detect — the former are updated on structural changes caught by `/wrap-up`, the latter is generated on demand by `/claude-tweaks:visualize`, not tied to any single source glob
```

- [ ] **Step 5: Grep sweep for stale references in the init skill area**

```bash
grep -rn -i "diagram-design\|diagram-integration" skills/init/
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add -A skills/_shared/diagram-integration-check.md skills/init/bootstrap-steps.md skills/init/SKILL.md skills/init/docs-structure.md
git commit -m "Remove diagram-design integration — replace with native visualize wiring in /init"
```

---

### Task 7: Sweep remaining cross-references

**Files:**
- Modify: `README.md:32-49`, and the lifecycle ASCII diagram (search for `calls: design shape` and neighboring lines)
- Modify: `skills/help/reference-card.md:20-28` (Component table), `:54-56` (Companion Tools table)
- Modify: `skills/help/context-flow.md` (Artifact Flow table — add a row modeled on the existing `/research` row)
- Modify: `CLAUDE.md:37` (Component skill list), `CLAUDE.md:52-59` (Skills with sub-files table)

**Interfaces:**
- Consumes: nothing new — pure documentation sync.

- [ ] **Step 1: Update README.md**

Replace the paragraph at lines 43-49 (starting `**Diagram Design companion plugin**...` through `...output convention.`) with:

```markdown
**`/claude-tweaks:visualize`** — native diagram generation, replacing the former `diagram-design` companion-plugin integration. Generates self-contained HTML+SVG diagrams (architecture, flowchart, sequence, state, ER, timeline, swimlane, quadrant, nested, tree, org chart, layers, venn, pyramid), themed from the project's own `DESIGN.md` tokens (or a neutral default skin when Impeccable isn't set up), with an optional D2-backed enhanced rendering path and an optional `Artifact`-publish channel. Soft-hook nudges in `/journeys` Step 3.6, `/specify` Step 2.5d, and `/review` Lens 3i-diagram suggest invoking it — gated by `diagram-suggestions: enabled` in CLAUDE.md, written by `/init` Step 11. Diagrams co-locate with what they illustrate (`docs/journeys/`, `docs/plans/`) rather than a single central folder; `docs/diagrams/` is the fallback for context-free, direct invocations.
```

Before committing this file, check `.claude-plugin/plugin.json`'s current `version` field and this README's most recent `### What's new in vX.Y` heading — per this repo's own release convention, add a new `### What's new in v{next-minor}` heading above the existing v4.7 entry introducing this feature, rather than editing the v4.7 heading itself (that entry is a historical record of what v4.7 actually shipped).

Also, in the lifecycle ASCII diagram (the `SKILL / ARTIFACT / SUPERPOWERS USED` block), find the `specify` node's `calls: design shape (...)` annotation line and add a sibling line immediately after it: `     │  calls: visualize (diagram suggestion, all surfaces)`. Do the same near wherever `journeys` and `review` appear in that diagram.

- [ ] **Step 2: Update help/reference-card.md**

Add a row to the Component table (after line 28, the `visual-review` row):

```
| `/claude-tweaks:visualize` | Themed diagram generation — architecture, flowchart, sequence, state, ER, timeline, swimlane, quadrant, nested, tree, org chart, layers, venn, pyramid | `<type> <topic>` |
```

Remove the diagram-design row from the "Recommended Companion Tools" table (line 55):

```
| [`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design) | 14 types of editorial HTML+SVG diagrams (architecture, flowchart, sequence, ER, state, …). Soft-hook nudges in `/specify`, `/build`, `/review` surface "consider a diagram here" recommendations. All projects. | `/init` Step 11 (writes `diagram-integration:` flag, read downstream) |
```

(This row is deleted entirely, not replaced — `/claude-tweaks:visualize` is native, so it doesn't belong in a table of external companion tools.)

- [ ] **Step 3: Update help/context-flow.md**

Find the Artifact Flow table's `/research` row (`| /research | Web sources (...) | .claude-tweaks/research/[YYYY-MM-DD]-[slug]/ (report.md + sources.json) | — |`). Add a sibling row immediately after it:

```
| `/visualize` | `DESIGN.md`/`DESIGN.json` tokens (when present) | `docs/journeys/{name}-{type}.html`, `docs/plans/{spec}-{type}.html`, or `docs/diagrams/{slug}.html` (context-free fallback) | — |
```

- [ ] **Step 4: Update CLAUDE.md**

At line 37, change:

```
**Component:** reflect, simplify, deepen, journeys, visual-review, design
```

to:

```
**Component:** reflect, simplify, deepen, journeys, visual-review, design, visualize
```

In the "Skills with sub-files" table, after the `design` row (line 59), add:

```
| visualize | d2-enhanced-path.md, artifact-publish.md | D2 CLI invocation + re-theming procedure (loaded only when the `d2` binary is installed and the diagram type maps to it); Artifact-publish adapter with favicon table (loaded only when the user accepts the publish offer) |
```

- [ ] **Step 5: Repo-wide grep sweep for anything missed**

```bash
grep -rn -i "diagram-design\|diagram-integration\|diagram.integration.check" --include="*.md" . | grep -v "^./docs/superpowers/\|^./.git/"
```

Expected: no output (the design/plan docs under `docs/superpowers/` are historical record and are expected to still mention the old name — everything else should be clean).

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add README.md skills/help/reference-card.md skills/help/context-flow.md CLAUDE.md
git commit -m "Sync README/help/CLAUDE.md cross-references — visualize replaces diagram-design"
```
