---
tier: 3
status: complete
progress: 100
blocked-by: [5]
surface: backend
---

# 09: AskUserQuestion adoption — Component skills A (reflect, simplify, deepen)

## Overview

Propagates the `AskUserQuestion` convention established in Spec 05 into three of the plugin's six "Component" skills (per CLAUDE.md's Skill directories taxonomy): `reflect`, `simplify`, `deepen`. Each skill's own copy of the Interaction style directive is rewritten to Spec 05's canonical wording, and each skill's `## Next Actions` block is converted from a plain-text numbered list to an `AskUserQuestion` call. `reflect` additionally has two batch-table sites (in its `hindsight-mode.md` and `full-mode.md` sub-files) whose terminal apply-all/override decision converts per Pattern B. `deepen` has one site — its Step 3 ranked-candidate selection — that does **not** fit any of the three established patterns and is explicitly called out rather than forced into a bad fit (see Non-Goals and Technical Approach).

**Complexity:** Low
**Estimated tasks:** 6

## Non-Goals

- Any other skill family — `journeys`, `visual-review`, `design` (sibling spec 10), the Lifecycle skills (specs 06-08), or the Utility skills (specs 11-12).
- Redesigning the canonical directive wording or the Pattern A/B/C definitions — that's Spec 05's job; this spec only applies them.
- Converting `deepen/SKILL.md`'s Step 3 "Rank and Present Candidates" selection (`Which would you like to explore? (number, several numbers, or "none")`) to `AskUserQuestion`. This site presents a **variable-length** ranked list (`Found {N} depth opportunities`, N unbounded) and lets the user pick zero, one, or several rows in free text. `AskUserQuestion` requires exactly 2-4 fixed options per question — when N > 4 candidates exist, there is no way to represent "pick any subset of N rows" as a single `AskUserQuestion` call without either truncating candidates or chunking into multiple calls (the same problem Spec 05's Decision Rationale identified for `ledger/resolve-gate.md`, deferred to Spec 12). This spec leaves that prompt as free text, unchanged. A future spec should decide whether to bound N to 4 and use `multiSelect`, chunk across multiple calls, or leave it as free text permanently.
- `deepen/SKILL.md`'s Step 4 "Confirm before implementing" — the current file has no rendered numbered-options list at this point (prose only: "4. Confirm before implementing."), so there is nothing concrete to convert.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| 5 | AskUserQuestion adoption — Foundation | not-started |

## Current State

- `skills/reflect/SKILL.md` line 5 — Interaction style directive blockquote (current text: `Present decisions as numbered options so the user can reply with just a number...`).
- `skills/reflect/SKILL.md` lines 145-153 — `## Next Actions` block: 3 fixed options (`/claude-tweaks:review {spec}`, `/claude-tweaks:test {spec}`, `/claude-tweaks:wrap-up {spec}`), first marked `**(Recommended)**`. Line 157's Component-Skill Contract: omit this block when `$PIPELINE_RUN_DIR` is set (invoked by `/review` Step 4 or `/wrap-up` Step 3).
- `skills/reflect/hindsight-mode.md` lines 31-45 — "Interactive mode (batch user routing)" section: a markdown table (`### Implementation Hindsight`, columns `# | Finding | Recommended`) followed by a 2-option terminal decision (`1. Apply all recommendations **(Recommended)**` / `2. Override specific items (tell me which #s to change)`).
- `skills/reflect/full-mode.md` lines 36-52 — "Interactive mode (batch user routing)" section: a markdown table (`### Reflection Insights`, columns `# | Insight | Recommended Destination`) followed by the identical 2-option terminal decision as hindsight-mode.md. Line 74 states this batch table must always be presented in interactive mode, even when every insight routes the same way — that requirement is unaffected by the AskUserQuestion conversion (it changes only how the terminal decision is captured, not whether it's presented).
- `skills/simplify/SKILL.md` line 5 — Interaction style directive blockquote (same current text as reflect's).
- `skills/simplify/SKILL.md` lines 141-150 — `## Next Actions` block: 2 fixed options (`/claude-tweaks:review {spec}` marked `**(Recommended)**`, `/claude-tweaks:test`). Line 154's Component-Skill Contract: omit when `$PIPELINE_RUN_DIR` is set (invoked by `/build` Common Step 3 or `/review` Step 5).
- `skills/deepen/SKILL.md` line 5 — Interaction style directive blockquote (same current text).
- `skills/deepen/SKILL.md` lines 138-146 — `## Next Actions` block: 3 fixed options (`/claude-tweaks:test` marked `**(Recommended)**`, `/claude-tweaks:review {spec}`, `/claude-tweaks:simplify`). Lines 150-158's Component-Skill Contract: when `$PIPELINE_RUN_DIR` is set, omit Next Actions AND run analysis-only (skip Step 4 interface design and Step 5 apply) — this behavior is unrelated to the AskUserQuestion conversion and must be preserved verbatim.
- `skills/deepen/SKILL.md` lines 70-83 — Step 3 "Rank and Present Candidates": a variable-length ranked table (`| # | Module | Kind | Why it's shallow | Leverage | Blast radius |`) followed by free-text prompt `Which would you like to explore? (number, several numbers, or "none")`. See Non-Goals — not converted by this spec.
- Spec 05 (once merged) defines the exact canonical directive text and the "Skill handoffs (Next Actions)" bullet this spec's Next-Actions conversions must match.

## Deliverables

- [x] Replace `skills/reflect/SKILL.md` line 5's directive blockquote with Spec 05's canonical text.
- [x] Convert `skills/reflect/SKILL.md`'s `## Next Actions` block (lines 145-153) to instruct one `AskUserQuestion` call with the same 3 options (labels: short one-line summaries, e.g. "Full review" — not the bare skill name; descriptions: the full pre-filled commands), first option's label suffixed `(Recommended)`. This label convention matches the worked example below and Spec 05's canonical wording exactly — the two must not diverge. Preserve the Component-Skill Contract's `$PIPELINE_RUN_DIR` omission conditional unchanged.
- [x] Convert `skills/reflect/hindsight-mode.md`'s terminal 2-option decision (lines 43-45) to instruct one `AskUserQuestion` call with options "Apply all recommendations" (label suffixed `(Recommended)`) and "Override specific items" (description: "tell me which #s to change"). The `### Implementation Hindsight` table above it (lines 34-41) stays as markdown, unchanged. Both currently sit inside one continuous code fence (lines 33-45) — close that fence immediately after the table's last row (after line 41) and present the `AskUserQuestion` instruction as unfenced prose below it; the fence was wrapping literal template output, and the decision is now a meta-instruction to call a tool, not literal output.
- [x] Convert `skills/reflect/full-mode.md`'s terminal 2-option decision (lines 50-52) identically — same two options, same wording, same fence-splitting treatment (close the fence after the table's last row, instruction as unfenced prose). The `### Reflection Insights` table above it (lines 41-48) stays as markdown, unchanged. Line 74's "always present the batch table" requirement is preserved unchanged.
- [x] Replace `skills/simplify/SKILL.md` line 5's directive blockquote with Spec 05's canonical text.
- [x] Convert `skills/simplify/SKILL.md`'s `## Next Actions` block (lines 141-150) to one `AskUserQuestion` call with the same 2 options, first marked `(Recommended)`. Preserve the Component-Skill Contract's omission conditional unchanged.
- [x] Replace `skills/deepen/SKILL.md` line 5's directive blockquote with Spec 05's canonical text.
- [x] Convert `skills/deepen/SKILL.md`'s `## Next Actions` block (lines 138-146) to one `AskUserQuestion` call with the same 3 options, first marked `(Recommended)`. Preserve the Component-Skill Contract's omission + analysis-only conditional (lines 150-158) unchanged.
- [x] Leave `skills/deepen/SKILL.md`'s Step 3 candidate-selection prompt (lines 70-83) untouched per Non-Goals — do not attempt a partial or lossy `AskUserQuestion` conversion of this site.

## Acceptance Criteria

1. `skills/reflect/SKILL.md`, `skills/simplify/SKILL.md`, and `skills/deepen/SKILL.md` each have their line-5 directive blockquote textually identical to the Interaction style directive as landed in `CLAUDE.md` by Spec 05 (the single source of truth — read `CLAUDE.md` directly when this spec is built, not the Spec 05 document, in case Spec 05's own review changed the wording after this spec was written), and none of the three contain the phrase "reply with just a number" anywhere in the file afterward.
2. `skills/reflect/SKILL.md`'s Next Actions section instructs an `AskUserQuestion` call with exactly 3 options whose descriptions are `/claude-tweaks:review {spec}`, `/claude-tweaks:test {spec}`, and `/claude-tweaks:wrap-up {spec}` respectively, with the first option's label ending in `(Recommended)`; the sentence "When invoked by a parent, omit the `## Next Actions` block" (or equivalent, referencing `$PIPELINE_RUN_DIR`) is still present, unchanged in meaning.
3. `skills/reflect/hindsight-mode.md` and `skills/reflect/full-mode.md` each retain their markdown table (`### Implementation Hindsight` / `### Reflection Insights`) verbatim, and each file's old literal text `1. Apply all recommendations **(Recommended)**` no longer appears — replaced by prose instructing an `AskUserQuestion` call with the equivalent two options.
4. `skills/reflect/full-mode.md` still contains the sentence beginning "Always present the batch table in interactive mode" (line 74's requirement), unchanged.
5. `skills/simplify/SKILL.md`'s Next Actions section instructs an `AskUserQuestion` call with exactly 2 options (`/claude-tweaks:review {spec}` first, marked Recommended; `/claude-tweaks:test` second); its Component-Skill Contract section still states Next Actions is omitted when `$PIPELINE_RUN_DIR` is set.
6. `skills/deepen/SKILL.md`'s Next Actions section instructs an `AskUserQuestion` call with exactly 3 options (`/claude-tweaks:test` first, marked Recommended; `/claude-tweaks:review {spec}`; `/claude-tweaks:simplify`); its Component-Skill Contract section still states both the Next-Actions omission AND the analysis-only restriction (skip Steps 4-5) when `$PIPELINE_RUN_DIR` is set.
7. `skills/deepen/SKILL.md`'s Step 3 still contains the literal prompt `Which would you like to explore? (number, several numbers, or "none")`, byte-for-byte unchanged.
8. `npm test` still passes (this change touches no test files, but confirms no unrelated regression).

## Technical Approach

Pure documentation/skill-content change — no data model or API surface.

### Pattern application per site

| File | Site | Pattern | Conversion |
|---|---|---|---|
| reflect/SKILL.md | line 5 directive | — | Verbatim replace with Spec 05 canonical text |
| reflect/SKILL.md | Next Actions (145-153) | C | 3-option `AskUserQuestion` call |
| reflect/hindsight-mode.md | Interactive mode (31-45) | B | Table stays; 2-option terminal `AskUserQuestion` call |
| reflect/full-mode.md | Interactive mode (36-52) | B | Table stays; 2-option terminal `AskUserQuestion` call |
| simplify/SKILL.md | line 5 directive | — | Verbatim replace |
| simplify/SKILL.md | Next Actions (141-150) | C | 2-option `AskUserQuestion` call |
| deepen/SKILL.md | line 5 directive | — | Verbatim replace |
| deepen/SKILL.md | Next Actions (138-146) | C | 3-option `AskUserQuestion` call |
| deepen/SKILL.md | Step 3 candidate selection (70-83) | **none — not converted** | Left as free text; see Non-Goals |

### Worked conversion — reflect/hindsight-mode.md (Pattern B)

Before:
```
1. Apply all recommendations **(Recommended)**
2. Override specific items (tell me which #s to change)
```

After — instruct: call `AskUserQuestion` with `header: "Findings"`, option 1 `label: "Apply all (Recommended)"` / `description: "Apply all recommendations"`, option 2 `label: "Override specific items"` / `description: "tell me which #s to change"`. Identical structure applies to full-mode.md, substituting "Reflection Insights" context.

### Worked conversion — reflect/SKILL.md Next Actions (Pattern C)

Before:
```
1. `/claude-tweaks:review {spec}` — full code review **(Recommended)**
2. `/claude-tweaks:test {spec}` — verify changes from reflection
3. `/claude-tweaks:wrap-up {spec}` — capture learnings and clean up
```

After — instruct: call `AskUserQuestion` with 3 options, each `description` carrying the exact command shown above, each `label` a short summary ("Full review", "Verify changes", "Capture + clean up"), option 1's label suffixed `(Recommended)`. Same structural conversion applies to simplify/SKILL.md (2 options) and deepen/SKILL.md (3 options), substituting their own existing command lists verbatim.

### Key Files

- `skills/reflect/SKILL.md`
- `skills/reflect/hindsight-mode.md`
- `skills/reflect/full-mode.md`
- `skills/simplify/SKILL.md`
- `skills/deepen/SKILL.md`

### Package Dependencies

None.

## Gotchas

- `deepen/SKILL.md`'s Step 3 selection prompt looks superficially like a Pattern B batch table (it has a ranked `#`-indexed table), but its terminal decision is NOT a fixed 2-4 option choice — it's "pick any subset of N rows," which breaks down for N > 4. Do not attempt to force this into an `AskUserQuestion` call; leave it as free text (see Non-Goals).
- `reflect/full-mode.md` line 74 exists specifically to prevent a *different* kind of drift (silently skipping the batch table when routing looks uniform) — do not let the AskUserQuestion conversion accidentally read as license to skip presenting the table when all findings route the same way. The table is always shown; only the *mechanism for the terminal decision* changes.
- `deepen/SKILL.md`'s Component-Skill Contract has two independent behaviors gated on `$PIPELINE_RUN_DIR` (omit Next Actions; run analysis-only / skip Steps 4-5) — the AskUserQuestion conversion touches only the first. Do not merge or simplify these two into one conditional; they remain textually separate concerns in the file.
- All three skills' directive blockquotes must match Spec 05's canonical text **exactly** (byte-for-byte) — small paraphrases here would defeat the purpose of having a single canonical wording that specs 06-12 also copy.

## Manual Steps

None — pure documentation/skill-content edit; verification is `npm test` plus manual dogfood of `/claude-tweaks:reflect`, `/claude-tweaks:simplify`, and `/claude-tweaks:deepen`'s Next Actions rendering.
