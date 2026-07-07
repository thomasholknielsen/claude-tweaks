---
tier: 3
status: complete
progress: 100
blocked-by: [5]
surface: backend
---

# 11: AskUserQuestion adoption — Utility A (help, tidy, flow, browse)

## Overview

Converts the plain-text numbered-option decision points in `skills/help/SKILL.md`, `skills/tidy/SKILL.md`, `skills/flow/SKILL.md` (+ its sub-files `worktree-merge.md` and `failure-cards.md`), and `skills/browse/SKILL.md` to Claude Code's native `AskUserQuestion` tool, per the canonical patterns and wording established in Spec 5. This is part of an 8-spec decomposition (specs 05-12) rolling `AskUserQuestion` out across the plugin.

Four of these six files (`help`, `tidy`, `flow`, `browse`) each carry their own copy of the plugin's "Interaction style" directive boilerplate, which gets the canonical rewrite from Spec 5. Beyond the boilerplate, `tidy/SKILL.md` has a genuine batch-table terminal decision (Pattern B), `flow`'s Pipeline Summary template and `failure-cards.md` have genuine Next Actions blocks (Pattern C), and `worktree-merge.md` has a genuine inline 3-option merge-conflict decision (Pattern A) plus an informally-formatted 2-item follow-up block that this spec normalizes into Pattern C.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- Converting any file outside this list of 6 (help/SKILL.md, tidy/SKILL.md, flow/SKILL.md, flow/worktree-merge.md, flow/failure-cards.md, browse/SKILL.md) — sibling skill families are specs 06-10 and 12.
- Rewriting the canonical `AskUserQuestion` directive wording — that's Spec 5's job; this spec only copies it verbatim into each file's own duplicated directive blockquote.
- Converting `flow/manifesto.md`, `flow/steps-and-gates.md`, `flow/multi-spec.md`, `flow/multispec-review-console.md`, `flow/survey.md`, or `flow/validation.md` — verified via case-insensitive grep for "numbered options", "apply all", and anchored `^## Next Actions` that none of these six sub-files contain any of the three patterns; they are pure procedural/reference content with no live user-facing decision text of their own.
- Redesigning the Pipeline Config Manifesto's "Approve all / Override / Cancel" block — that content lives in `manifesto.md`, which is confirmed out of scope above.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| 5 | AskUserQuestion adoption — Foundation | not-started |

## Current State

- `skills/help/SKILL.md` line 5 — directive boilerplate. Lines 97-101 — a `## Next Actions` template rendered from Section 3's "Present Recommendation" step: `1. {recommended command with parameters} — {rationale} **(Recommended)**` / `2. {alternative command} — {description}` / optional `{3. {option} — {description}}`.
- `skills/tidy/SKILL.md` line 5 — directive boilerplate. Lines 144-183 — the Step 6 "Interactive mode (batch approval)" Tidy Report: a markdown table of up to 15 rows (`# | Type | Item | Recommendation`) followed by a terminal 2-option decision: `1. Apply all recommendations **(Recommended)**` / `2. Override specific items (tell me which #s to change)`. Lines 233-238 — a `## Next Actions` block with 4 static/conditional options.
- `skills/flow/SKILL.md` line 5 — directive boilerplate. Lines 260-268 — inside the Step 5 "Pipeline Summary" success template, a literal `### Next Actions` block (note: H3, nested inside the rendered markdown template, distinct from the file's own meta `## Next Actions` section at line 314) with a base "Recommended" option plus 2 conditional options. Lines 314-316 — a meta `## Next Actions` section that explicitly documents there is no standalone block here (the real ones live in the Pipeline Summary template and in `failure-cards.md`) — this meta section's wording is accurate and does not itself need a Pattern C conversion, only verification it still describes the post-conversion state correctly.
- `skills/flow/worktree-merge.md` — no directive boilerplate (this is a lazy-loaded sub-file, not a skill entry point). Lines 60-64 — an inline 3-option merge-conflict decision: `1. Resolve conflicts now **(Recommended)**` / `2. Skip this branch` / `3. Abort all remaining merges`. Lines 77-81 — a "Post-Merge Summary" section's `### Next Actions` heading followed by two unnumbered guidance bullets (`- Failed specs: fix issues and re-run...` / `- All merged: run /claude-tweaks:help...`) — informally formatted but functionally the same "pick your next step" shape as every other Next Actions site in the plugin.
- `skills/flow/failure-cards.md` — no directive boilerplate (lazy-loaded sub-file). Lines 28-35 — a conditional Next-Actions addendum item offered only when issue claims are held (`{next}. Release held claims if you will not resume...`). Lines 67-76 — the "Generic gate failure" template's `### Next Actions` block: a base "Recommended" resume option, a "run failed step manually" option, and mutually-exclusive conditional options depending on which gate failed (test failure vs. re-verify/polish failure). Lines 101-107 — the "Polish broke verification" template's `### Next Actions` block: 3 options.
- `skills/browse/SKILL.md` line 5 — directive boilerplate. Lines 148-153 — a `## Next Actions` block with 4 static options.

## Deliverables

- [x] Replace the directive boilerplate blockquote in `help/SKILL.md` (line 5), `tidy/SKILL.md` (line 5), `flow/SKILL.md` (line 5), and `browse/SKILL.md` (line 5) with Spec 5's canonical wording, verbatim.
- [x] Convert `help/SKILL.md`'s Next Actions template (lines 97-101) to instruct rendering via one `AskUserQuestion` call: the recommended command as option 1 (label suffixed `(Recommended)`, description carrying the full command + rationale), the alternative(s) as options 2-3 in the same shape.
- [x] Convert `tidy/SKILL.md`'s Step 6 Tidy Report terminal decision (lines 181-182) to one `AskUserQuestion` call with options "Apply all recommendations" (label suffixed `(Recommended)`) and "Override specific items" — the table above it (lines 144-179) stays as markdown, unchanged.
- [x] Convert `tidy/SKILL.md`'s Next Actions block (lines 233-238) to one `AskUserQuestion` call — 4 options, first suffixed `(Recommended)`.
- [x] Convert `flow/SKILL.md`'s Pipeline Summary Next Actions template (lines 260-268) to instruct rendering via one `AskUserQuestion` call — base option `(Recommended)`, plus the two conditional options rendered only when their condition holds. Reword the meta `## Next Actions` section (lines 314-316) so its "canonical numbered options on success" phrase no longer describes a numbered list that no longer exists.
- [x] Convert `flow/worktree-merge.md`'s merge-conflict decision (lines 61-64) to one `AskUserQuestion` call with 3 options, first suffixed `(Recommended)`.
- [x] Convert `flow/worktree-merge.md`'s Post-Merge Summary follow-up bullets (lines 78-81) to one `AskUserQuestion` call with 2 options (normalizing the informal bullet format into the same Pattern C shape used everywhere else), heading renamed from `### Next Actions` to `## Next Actions` for consistency with Spec 5's H2 fix.
- [x] Convert `flow/failure-cards.md`'s "Generic gate failure" Next Actions template (lines 67-76) to one `AskUserQuestion` call assembled from the base 2 options plus the "if test failed" conditional option, plus the claims-release addendum item (lines 30-35) when issue claims are held (max 4, at the cap). Drop the template's own "if re-verify failed (polish broke verification)" branch (current lines 73-75) from this conversion — per the file's routing table (lines 7-10), that failure shape always routes to the separate "Polish broke verification" template below, never to this one, so the branch is dead here.
- [x] Convert `flow/failure-cards.md`'s "Polish broke verification" Next Actions template (lines 101-107) to one `AskUserQuestion` call with 3 options, first suffixed `(Recommended)`.
- [x] Convert `browse/SKILL.md`'s Next Actions block (lines 148-153) to one `AskUserQuestion` call with 4 options, first suffixed `(Recommended)`.

## Acceptance Criteria

1. `help/SKILL.md`, `tidy/SKILL.md`, `flow/SKILL.md`, `browse/SKILL.md` each contain the string `AskUserQuestion` in their directive blockquote and no longer contain "reply with just a number."
2. `tidy/SKILL.md`'s Step 6 section instructs an `AskUserQuestion` call with exactly the two options "Apply all recommendations" and "Override specific items," and the preceding markdown table (the `| # | Type | Item | Recommendation |` structure) is otherwise unchanged.
3. `help/SKILL.md`'s Section 3 "Present Recommendation" text instructs rendering the `## Next Actions` block as one `AskUserQuestion` call rather than a numbered list the user replies to by digit.
4. `flow/SKILL.md`'s Pipeline Summary template (the block currently at lines 260-268) instructs an `AskUserQuestion` call rather than a static numbered markdown list; the base option is labeled with `(Recommended)`.
5. `flow/worktree-merge.md`'s merge-conflict section instructs an `AskUserQuestion` call with 3 options; grepping the file for the literal string `1. Resolve conflicts now` returns no match after the change.
6. `flow/worktree-merge.md`'s Post-Merge Summary section heading reads `## Next Actions` (not `### Next Actions`) and instructs an `AskUserQuestion` call with 2 options.
7. `flow/failure-cards.md`'s both templates (Generic gate failure, Polish broke verification) instruct `AskUserQuestion` calls; the claims-release addendum (lines 27-35 today) is described as an additional option appended to whichever call applies, not a separate freestanding numbered item; the Generic gate failure call has at most 4 options in any reachable scenario (base 2 + "if test failed" + claims-release), and its dead "if re-verify failed" branch is not included in the conversion.
8. `browse/SKILL.md`'s Next Actions section instructs an `AskUserQuestion` call with 4 options, first suffixed `(Recommended)`.
9. None of the 6 files' `**Interactive mode:**` / auto-mode content is touched beyond what's listed above — `tidy/SKILL.md`'s Step 6 "Auto mode (aggressiveness-based routing)" section (lines 110-138) is unchanged, since `auto` mode never calls `AskUserQuestion`.

## Technical Approach

No data model or API surface — documentation/skill-content change only.

### `help/SKILL.md` (Pattern C)

Before (lines 97-101):
```
## Next Actions

1. `{recommended command with parameters}` — {rationale} **(Recommended)**
2. `{alternative command}` — {description}
{3. `{option}` — {description}}
```

After — Section 3's "Present Recommendation" instructs: render the `## Next Actions` block as one `AskUserQuestion` call. `header`: `"Next step"`. Option 1 — `label`: short name of the recommended command suffixed `(Recommended)`, `description`: the full command with parameters + rationale. Option 2 (and optional option 3) — same shape for the alternative(s).

### `tidy/SKILL.md` (Pattern B — batch table stays, terminal decision converts; Pattern C for its own Next Actions)

Before (lines 181-182, appended after the Tidy Report table):
```
1. Apply all recommendations **(Recommended)**
2. Override specific items (tell me which #s to change)
```

The table and decision today sit inside one continuous code fence — close that fence immediately after the table's last row and present the `AskUserQuestion` instruction as unfenced prose below it (the fence wraps literal template output; the decision is a meta-instruction to call a tool). After — the table (lines 144-179) renders exactly as today; immediately following it, call `AskUserQuestion` with `header`: `"Tidy actions"`, option 1 `label`: `"Apply all (Recommended)"`, `description`: `"Apply all recommendations shown above"`, option 2 `label`: `"Override specific items"`, `description`: `"Tell me which #s to change"`. If "Override specific items" is chosen, the follow-up (#s and target values) is ordinary free-text conversation in the next message, per Spec 05's Pattern B convention — not the tool's built-in `Other` field.

Before (lines 233-238):
```
## Next Actions

1. `/claude-tweaks:help` — full pipeline status with refreshed counts after the cleanup **(Recommended)**
2. `/claude-tweaks:build {N}` — build the highest-priority ready spec surfaced by the tidy report
3. `/claude-tweaks:specify {topic}` — specify an unspecified design doc surfaced by the audit
4. `/claude-tweaks:review {N}` — review a spec the audit flagged as "appears complete, not reviewed"
```

After — one `AskUserQuestion` call, `header`: `"Next step"`, 4 options matching the 4 lines above (labels: "Help dashboard (Recommended)", "Build {N}", "Specify {topic}", "Review {N}"; descriptions carry the full command + one-liner).

### `flow/SKILL.md` (Pattern C)

Before (lines 260-268, inside the Pipeline Summary success template):
```
### Next Actions

1. `/claude-tweaks:flow {next spec}` — full pipeline on spec {N}: "{title}" **(Recommended)**
2. `/claude-tweaks:help` — full pipeline status
{If unblocked specs:}
3. `/claude-tweaks:build {N}` — spec {N} "{title}" now unblocked
{If the depth survey surfaced candidates:}
4. `/claude-tweaks:deepen {changed-paths}` — act on the {N} depth opportunit{y/ies} surfaced above
```

After — the Pipeline Summary template's rendering instructions state: close the template's code fence immediately before this block (the rest of the Pipeline Summary — `### Completed`, etc. — stays fenced as literal template output); assemble the applicable options (base 2 + any conditional ones whose trigger condition holds) and present them via one `AskUserQuestion` call as unfenced prose, `header`: `"Next step"`, base option 1 labeled `(Recommended)`. Also update the meta `## Next Actions` section at line 314-316: its current wording ("canonical numbered options on success") describes prose output that no longer exists post-conversion — reword to describe an `AskUserQuestion` call instead of a numbered list.

### `flow/worktree-merge.md` (Pattern A + Pattern C)

Before (lines 61-64):
```
1. Resolve conflicts now **(Recommended)** — I'll resolve based on both specs' intent
2. Skip this branch — merge remaining branches first, come back to this one
3. Abort all remaining merges — I'll handle merges manually
```

After — call `AskUserQuestion`, `header`: `"Merge conflict"`, option 1 `label`: `"Resolve now (Recommended)"`, `description`: `"I'll resolve based on both specs' intent"`; option 2 `label`: `"Skip this branch"`, `description`: `"merge remaining branches first, come back to this one"`; option 3 `label`: `"Abort remaining merges"`, `description`: `"I'll handle merges manually"`.

Before (lines 77-81):
```
### Next Actions
- Failed specs: fix issues and re-run `/claude-tweaks:flow {spec} worktree {remaining steps}`
- All merged: run `/claude-tweaks:help` for full pipeline status
```

After — heading changed to `## Next Actions`; instructs one `AskUserQuestion` call, `header`: `"Next step"`, option 1 `label`: `"Fix + resume"`, `description`: `"re-run /claude-tweaks:flow {spec} worktree {remaining steps} for any failed specs"`; option 2 `label`: `"Pipeline status"`, `description`: `"/claude-tweaks:help for full pipeline status"`.

### `flow/failure-cards.md` (Pattern C, both templates)

Before (lines 67-76, Generic gate failure):
```
### Next Actions

1. `/claude-tweaks:flow {spec} {failed-step}` — resume from {failed step} **(Recommended)**
2. `/claude-tweaks:{step} {spec}` — run {failed step} manually for more control
{If test failed:}
3. `/claude-tweaks:test` — re-verify after fixes
{If re-verify failed (polish broke verification):}
3. `git diff` — inspect the polish modifications that broke verification
4. `git revert HEAD` — revert the polish commit if it's not salvageable, then retry with `/claude-tweaks:flow {spec} no-polish` to skip polish entirely on the next run
```

Close the template's code fence immediately before this block (the rest of the failure card stays fenced as literal template output); present the `AskUserQuestion` instruction as unfenced prose. Assembling every listed option would exceed the tool's 4-option cap (base 2 + 2 conditional-on-failure-type + 1 claims-release = up to 5) — resolve this, don't just note it: the "if re-verify failed (polish broke verification)" branch (the `git diff` / `git revert` pair) is dead in this template. Per the file's own routing, a re-verify failure after polish routes to the separate "Polish broke verification" template below, never to this "Generic gate failure" one — so this branch cannot co-occur with the base 2 in practice. Drop it from the Generic gate failure conversion (leave it fully documented in the Polish broke verification template's own conversion instead, where it already lives independently). With that branch removed, the realistic maximum is base 2 + "if test failed" (1) + claims-release (1) = 4, exactly at the cap.

Before (lines 101-107, Polish broke verification):
```
### Next Actions

1. Inspect the polish modifications: `git diff {polish-commit-range}` **(Recommended)**
2. Revert the polish commit and resume without polish: `git revert {polish-commit}` then `/claude-tweaks:flow {spec} no-polish wrap-up`
3. Fix the verification failure manually, then resume: `/claude-tweaks:flow {spec} polish`
```

Close the template's code fence immediately before this block. After — one `AskUserQuestion` call as unfenced prose, `header`: `"Next step"`, 3 options in the same order, option 1 labeled `(Recommended)`. This is where the "inspect the polish diff / revert / fix manually" options live — the Generic gate failure template's own copy of this branch (dropped above) was always redundant with this dedicated template.

### `browse/SKILL.md` (Pattern C)

Before (lines 148-153):
```
## Next Actions

1. `/claude-tweaks:visual-review {url}` — run a structured visual review against the page or journey just driven **(Recommended)**
2. `/claude-tweaks:stories` — generate or refresh QA story YAML files from the live DOM
3. `/claude-tweaks:review {spec} full` — full review pipeline including code, visual, and QA passes
4. `/claude-tweaks:capture "{idea}"` — save an idea surfaced while exploring the browser
```

After — one `AskUserQuestion` call, `header`: `"Next step"`, 4 options matching the 4 lines above, option 1 labeled `(Recommended)`.

### Key Files

- `skills/help/SKILL.md`
- `skills/tidy/SKILL.md`
- `skills/flow/SKILL.md`
- `skills/flow/worktree-merge.md`
- `skills/flow/failure-cards.md`
- `skills/browse/SKILL.md`

### Package Dependencies

None.

## Gotchas

- `flow/SKILL.md`'s Pipeline Summary Next Actions block and `failure-cards.md`'s two Next Actions blocks are rendered *inside* larger markdown report templates (Pipeline Summary / failure card), not as a skill's own standalone `## Next Actions` section — convert the instructions for assembling and presenting them via `AskUserQuestion`, but leave the surrounding report template (the `### Completed`, `### Manual Steps Required`, `### Actions Performed` sections, etc.) untouched.
- `flow/SKILL.md` line 314's meta `## Next Actions` section is *documentation about where the real Next Actions blocks live*, not a live decision site itself — do not convert its prose to an `AskUserQuestion` instruction. **Correction from an earlier draft:** it does need a small wording update — its current text says "canonical numbered options on success," which stops being accurate once the Pipeline Summary block renders via `AskUserQuestion` instead of a numbered list. Reword that phrase (see Technical Approach); the rest of the section's pointer to the Pipeline Summary template and `failure-cards.md` stays correct.
- `tidy/SKILL.md`'s Tidy Report table can have 15+ rows (per the worked example) — `AskUserQuestion` cannot render this; only the terminal 2-option decision converts. Do not attempt to convert individual table rows into `AskUserQuestion` options.
- `flow/worktree-merge.md`'s Post-Merge Summary bullets are the least literally "Pattern C-shaped" site in this spec (no existing numbering, no `(Recommended)` marker, H3 not H2) — this spec normalizes them into the same shape as every other Next Actions site rather than treating the mismatch as a reason to skip conversion. This was a drafting judgment call, not a mechanical port; verify the reworded version still reads naturally as "pick one of these two things to do next."
- Confirmed via case-insensitive grep (`numbered options`, `apply all`, anchored `^## Next Actions`) that `flow/manifesto.md`, `flow/steps-and-gates.md`, `flow/multi-spec.md`, `flow/multispec-review-console.md`, `flow/survey.md`, and `flow/validation.md` contain none of the three patterns — do not expand this spec's file list to include them without re-verifying first.

## Manual Steps

None — pure documentation/skill-content edit; verification is `npm test` plus manual dogfood of `/claude-tweaks:tidy` and `/claude-tweaks:help` to confirm the `AskUserQuestion` prompts render as intended.
