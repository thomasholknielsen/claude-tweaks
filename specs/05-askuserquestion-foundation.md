---
tier: 3
status: complete
progress: 100
blocked-by: []
surface: backend
---

# 05: AskUserQuestion adoption — Foundation

## Overview

Establishes the canonical convention for using Claude Code's native `AskUserQuestion` tool at the plugin's user-facing decision points, replacing the current plain-text "reply with a number" convention. This spec rewrites the two documents every other spec in this decomposition copies wording from — `CLAUDE.md`'s Interaction style directive and Interaction patterns section, and `_shared/auto-mode-contract.md`'s Skill integration pattern template — and converts one concrete worked example (`_shared/browser-detection.md`'s inline install/skip decision) end to end, so specs 06-12 have a real reference implementation, not just prose rules.

Motivation: the plugin currently makes zero use of `AskUserQuestion` anywhere (verified via case-insensitive grep across `skills/`, `agents/`, and shared fragments — no match for `AskUserQuestion`/`ask_user`/`AskUser`). Native rendered choices are less error-prone and more discoverable than asking a user to type a bare digit back.

**Complexity:** Low
**Estimated tasks:** 4

## Non-Goals

- Converting any specific skill's own inline decisions, batch tables, or Next Actions blocks beyond `_shared/browser-detection.md` — that is specs 06-12's job, once this spec's canonical wording exists for them to copy.
- Changing `auto` mode's decision logic, the auto-decision log format, or anything about `_shared/auto-decision-log.md` — `AskUserQuestion` is interactive-only by construction and never runs in `auto` mode.
- Any change to the Subagent Output Contract (`_shared/subagent-output-contract.md`) — dispatched Task agents don't interactively prompt the end user and are out of scope for this whole initiative.
- Redesigning `ledger/resolve-gate.md`'s 6-option per-item vocabulary — that site does not fit a direct `AskUserQuestion` port (6 options exceeds the 4-option-per-question cap) and needs bespoke design work scoped to spec 12, not this one.

## Prerequisites

None — this is the first spec in the decomposition; specs 06-12 are `blocked-by: [5]`.

## Current State

- `CLAUDE.md` lines 69-83 — the "Interaction style directive" (identical blockquote duplicated across every skill's frontmatter area) and the "Interaction patterns" prose section (`Decisions`, `Multi-item decisions`, `One decision per message`, `Skill handoffs (Next Actions)` bullets).
- `skills/_shared/auto-mode-contract.md` lines 208-226 — the "Skill integration pattern" template block, which every pipeline-participating skill's `### Step N` decision points are written to match. Line 215 currently reads `**Interactive mode:** present numbered options and wait.`
- `skills/_shared/browser-detection.md` lines 15-29 — "Install (interactive mode)" section: a 2-option inline decision (`1. Install agent-browser globally ... **(Recommended)**` / `2. Skip ...`) with branching logic below it (`Choice 1: run npm install...`, `Choice 2: return SKIPPED...`).
- Verified separately (not touched by this spec, but load-bearing for the decomposition's boundary): `CLAUDE.md` line 83 currently says the Next Actions heading is `### Next Actions` (H3). Real skill files are mixed, not uniformly H2 as an earlier draft of this spec claimed: a skill's own **standalone, top-level** Next Actions section is `## Next Actions` (H2) — confirmed via `grep -rlE "^## Next Actions" skills/` across ~25 files. But a Next Actions block **nested inside a larger rendered report template** (e.g. `flow/SKILL.md`'s Pipeline Summary, `flow/failure-cards.md`'s two failure-card templates, `review/review-summary-template.md`'s Step 7 summary) legitimately stays `### Next Actions` (H3) as a subsection heading of that report — this is correct structure, not drift, and specs 08/11 (which own those files) do not need to rename these headings. Only the standalone top-level case is the H2/H3 fix in Deliverable 3 below.

## Deliverables

- [x] Rewrite `CLAUDE.md`'s Interaction style directive blockquote (line ~70-72, the text quoted under "### Interaction style directive") to the canonical wording in Technical Approach below.
- [x] Rewrite `CLAUDE.md`'s "Interaction patterns" section bullets (`Decisions`, `Multi-item decisions`, `One decision per message`, `Skill handoffs (Next Actions)`) to the canonical wording in Technical Approach below.
- [x] While rewriting the `Skill handoffs (Next Actions)` bullet (same line), fix the stale heading level from `` `### Next Actions` `` to `` `## Next Actions` `` for a skill's own **standalone, top-level** Next Actions section, and add one clarifying sentence that a Next Actions block nested inside a larger rendered report template (Pipeline Summary, failure cards, review summary) may legitimately stay `### Next Actions` as that report's own subsection heading — this is the same bullet already being rewritten for the `AskUserQuestion` change, not a separate unrelated edit.
- [x] Rewrite `skills/_shared/auto-mode-contract.md` line 215 from `**Interactive mode:** present numbered options and wait.` to `**Interactive mode:** call \`AskUserQuestion\` with the options below and wait.`
- [x] Convert `skills/_shared/browser-detection.md`'s "Install (interactive mode)" section (lines 15-29) from a plain-text numbered list to an `AskUserQuestion` call, per the worked example in Technical Approach below. Preserve the existing "Choice 1 / Choice 2" branching text unchanged — only the presentation mechanism changes.

## Acceptance Criteria

1. `CLAUDE.md`'s Interaction style directive blockquote text contains the string `AskUserQuestion` and no longer contains the phrase "reply with just a number."
2. `CLAUDE.md`'s "Interaction patterns" → "Decisions" bullet names `AskUserQuestion` as the mechanism for single decisions.
3. `CLAUDE.md`'s "Interaction patterns" → "Multi-item decisions" bullet states the batch table is rendered as markdown and the terminal apply-all/override decision is captured via one `AskUserQuestion` call.
4. `CLAUDE.md`'s "Interaction patterns" → "One decision per message" bullet reads in terms of "one `AskUserQuestion` call" rather than "one batch table."
5. `CLAUDE.md`'s "Interaction patterns" → "Skill handoffs (Next Actions)" bullet reads `` `## Next Actions` `` (H2, not H3) for a skill's own standalone top-level section, states the block is rendered via one `AskUserQuestion` call, and explicitly notes that Next Actions nested inside a larger report template may stay `### Next Actions` as that report's subsection heading.
6. `skills/_shared/auto-mode-contract.md` line 215 reads `**Interactive mode:** call \`AskUserQuestion\` with the options below and wait.` (exact string match).
7. `skills/_shared/browser-detection.md`'s "Install (interactive mode)" section instructs calling `AskUserQuestion` with exactly two options — label "Install agent-browser" (or equivalent short label) suffixed `(Recommended)`, and label "Skip" — each carrying the same description text as the current numbered list's two lines, and the existing "Choice 1" / "Choice 2" branching prose below it is otherwise unchanged (still says "run `npm install -g agent-browser`, then verify... Return OK" and "return SKIPPED...").
8. Grepping `skills/_shared/browser-detection.md` for the literal string `1. Install agent-browser globally` (the old plain-text list) returns no match after the change.

## Technical Approach

No data model or API surface — this is a documentation/skill-content change only. Canonical text is specified verbatim below so specs 06-12 copy identical wording rather than each inventing their own phrasing.

### Canonical Interaction style directive (replaces the current blockquote in `CLAUDE.md`)

```
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.
```

### Canonical "Interaction patterns" section bullets (replaces the four bullets in `CLAUDE.md`)

```
- **Decisions** — call the `AskUserQuestion` tool with human-readable options (2-4 typical) so the user gets a native rendered choice instead of typing a digit back. Mark the recommended option's label with `(Recommended)`.
- **Multi-item decisions** — batch table with pre-filled recommendations, rendered as markdown (AskUserQuestion cannot display dense multi-row data). Then capture the terminal apply-all/override decision with one `AskUserQuestion` call (2-4 options: at minimum "Apply all recommended" and "Override specific items"). For 10+ items, lead with a severity/count summary before the full table so the user sees the scope before the details.
- **One decision per message** — never make more than one `AskUserQuestion` call in a single response. If a skill produces multiple decision tables, present them sequentially (one call per message, wait for resolution before showing the next).
- **Skill handoffs (Next Actions)** — End each skill with a `## Next Actions` block (standalone, top-level; a Next Actions block nested inside a larger rendered report template — Pipeline Summary, failure cards, review summary — may stay `### Next Actions` as that report's own subsection heading), rendered as one `AskUserQuestion` call: 2-4 options, each option's description carrying the full command with all parameters pre-filled, each label a short one-line summary, one option's label suffixed `(Recommended)` based on context. `Other` (always available on `AskUserQuestion`) covers "none of these, I'll type something else." Options are dynamically generated from available context (journeys, UI changes, worktree mode, QA stories, browser availability). Never a navigation menu, never generic commands without parameters. If situational filtering would leave fewer than 2 options, do not call `AskUserQuestion` — state or execute the single remaining action directly (a lone option isn't a decision).
```

### `AskUserQuestion` field conventions (apply to every worked example in this spec and in specs 06-12)

Every call needs a `question` string in addition to `header` and `options` — this is a required field on the tool, distinct from `header` (`header` is a short chip label shown above the options; `question` is the actual prompt text). Convention: reuse the original prose line that introduced the numbered list as the `question` text, verbatim or near-verbatim. Every question object also sets `multiSelect: false` unless a specific site calls for multi-select (none in this initiative do — every site is single-choice). Specs 06-12 apply this convention to their own worked examples; it is not repeated in each one.

### Worked example: `_shared/browser-detection.md` (Pattern A — inline workflow decision)

Before:
```
agent-browser is not installed.

1. Install agent-browser globally — `npm install -g agent-browser` **(Recommended)**
2. Skip — visual review, story generation, and QA validation will be unavailable
```

After — the section's prose instructs calling `AskUserQuestion` with:
- `question`: `"agent-browser is not installed."`, `header`: `"Browser tool"`, `multiSelect`: `false`
- Option 1 — `label`: `"Install (Recommended)"`, `description`: `"Install agent-browser globally — npm install -g agent-browser"`
- Option 2 — `label`: `"Skip"`, `description`: `"visual review, story generation, and QA validation will be unavailable"`

The existing branching text stays unchanged: "Choice 1: run `npm install -g agent-browser`, then verify... Return OK." / "Choice 2: return SKIPPED — the caller surfaces a 'browser unavailable' line..."

### Worked example: Pattern B (batch table stays; terminal decision converts)

Generalized from `review/step3-routing.md` (owned by spec 08, which contains the concrete file-specific version). Before:
```
| # | Finding | Severity | Category | Affected | Recommended |
|---|---------|----------|----------|----------|-------------|
| 1 | {description} | Critical | Security | {files} | Fix now |
...
1. Apply all recommendations **(Recommended)**
2. Override specific items (tell me which #s to change)
```

After — the table renders exactly as today, unchanged, as markdown. Immediately below it, instruct calling `AskUserQuestion` with:
- `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all (Recommended)"`, `description`: `"Apply all recommended fixes"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Tell me which #s to change"`

**If the user picks "Override specific items,"** the follow-up (which #s, what to change them to) is ordinary free-text conversation in the next message — not a second structured widget, and not the tool's built-in `Other` field (that's for replacing an *entire* answer with free text, not for supplying detail after a selection). This is the standard shape for every Pattern B site across specs 06-12; individual specs only restate it where a site's specifics (option count, wording) differ from this generalization.

**Fallback rule:** if situational filtering would leave fewer than 2 terminal-decision options, don't call `AskUserQuestion` — state or execute the remaining action directly.

### Worked example: Pattern C (Next Actions)

Generalized from `build/SKILL.md`'s Next Actions (owned by spec 07, which contains the concrete file-specific version). Before:
```
1. /claude-tweaks:review 42 full — code + visual review **(Recommended)**
2. /claude-tweaks:test qa — validate 7 QA stories before review
3. /superpowers:finishing-a-development-branch — merge, PR, or discard the feature branch
```

After — any signal-to-option lookup table that determines *which* options apply this run stays as the assistant's own resolution logic (never shown to the user, never itself converted). Once resolved to a concrete 2-4 option set, instruct calling `AskUserQuestion` with:
- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- One option per resolved row — `label`: a short one-line summary of the command, `description`: the full command with parameters pre-filled, the contextually-recommended option's label suffixed `(Recommended)`

**Fallback rule:** if resolving the lookup table leaves fewer than 2 options (e.g. every conditional row's trigger is false), don't call `AskUserQuestion` — state or execute the single remaining action directly.

### Key Files

- `CLAUDE.md` — Interaction style directive (~line 70-72) and Interaction patterns section (~lines 78-83)
- `skills/_shared/auto-mode-contract.md` — Skill integration pattern template, line 215
- `skills/_shared/browser-detection.md` — "Install (interactive mode)" section, lines 15-29

### Package Dependencies

None.

## Gotchas

- The `AskUserQuestion` tool schema requires `multiSelect` to be an explicit boolean on every question object, requires 2-4 options per question, and always offers the user a free-text "Other" — do not describe the browser-detection conversion as needing a 3rd "Other" option; it's implicit. **Confirmed against the tool's actual schema (not inferred):** the `options` array itself must have 2-4 entries; `Other` is a UI affordance the harness adds automatically and is never one of the array's entries — so it does not count toward the 2-4 cap in either direction. A 4-explicit-option deliverable elsewhere in this decomposition (e.g. spec 06's Scope Selection Gate, spec 07's build-strategy prompt) is exactly at the cap, not over it.
- `AskUserQuestion` is unavailable/meaningless in `auto` mode — do not touch `_shared/auto-mode-contract.md`'s `**Auto mode:**` branch anywhere in the file; only the `**Interactive mode:**` line changes.
- CLAUDE.md's directive text is duplicated verbatim in every skill's own frontmatter area (per the "Interaction style directive" convention documented in CLAUDE.md itself) — this spec only rewrites the canonical copy in CLAUDE.md. Propagating the new wording into each skill's own duplicated copy is specs 06-12's job (each spec's own Deliverables list its files).
- **Source-of-truth note governing every reference to "Spec 05's canonical text" in specs 06-12:** the source of truth is `CLAUDE.md`'s actual landed content once this spec is built and reviewed, not the text drafted in this spec document. If Spec 05's own review changes the wording, that changed wording — not this file — is what specs 06-12 must copy. When building any of specs 06-12, read `CLAUDE.md` directly rather than copying from this spec's Technical Approach section.

## Decision Rationale

This spec is the first of an 8-spec decomposition (05-12) of the design doc `docs/superpowers/specs/2026-07-07-askuserquestion-adoption-design.md`. That design doc is consumed by this decomposition — its content is absorbed here and in specs 06-12, and it is deleted as the terminal step of the `/specify` run that produced this batch of specs (not a deliverable of any individual spec 05-12).

**Why `AskUserQuestion` at all:** motivation is UX — typing a bare digit back is more error-prone and less discoverable than a native rendered choice. Verified the plugin currently has zero usage anywhere.

**Why a hybrid approach for batch tables, not full replacement:** `AskUserQuestion` caps at 4 options per question / 4 questions per call and cannot render dense multi-row tabular data (finding descriptions, severities, file:line references). The existing convention already collapses most batch-table sites to a small (2-3 option) terminal decision — the table stays as markdown for display; only that terminal decision becomes an `AskUserQuestion` call. This was verified against three real sites, not assumed: `review/step3-routing.md` (2 options — fits directly), `wrap-up/review-console.md` (3 options plus a separate per-item queue-write loop — fits directly), and `ledger/resolve-gate.md` Phase 2 (6-option per-item vocabulary, no default bulk-apply — does NOT fit, exceeds the 4-option cap, and is called out as bespoke design work deferred to spec 12).

**Why decompose into 8 specs (05-12) rather than one:** the full migration surface, verified by grep (corrected twice during recon — first for a lowercase-only "apply all" pattern miss, then for a wrong `### Next Actions` heading level instead of the actual `## Next Actions` used everywhere), is ~40 files across every skill in the plugin. That exceeds any single work unit's sizing target (3-8 tasks). The decomposition groups by the plugin's own documented skill taxonomy (Lifecycle / Component / Utility, per CLAUDE.md's "Skill directories" section) rather than inventing new groupings, splitting further only where a taxonomy group's file count would otherwise push a spec past ~7-8 files.

**Rejected alternative — full-coverage batch-table conversion (chunking N findings into sequential 4-option AskUserQuestion calls):** rejected because it loses the "see all N findings sorted by severity at once" overview a markdown table gives, and "apply all" doesn't express cleanly across chunked calls.

**Rejected alternative — minimal scope (inline decisions only):** rejected because the user explicitly selected all three categories (inline decisions, batch tables, Next Actions) as in scope.

## Manual Steps

None — this is a pure documentation/skill-content edit with a CLI-driven test/verification path (`npm test`, manual dogfood of `/claude-tweaks:browse`'s browser-detection prompt).
