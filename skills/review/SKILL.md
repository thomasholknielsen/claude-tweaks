---
name: claude-tweaks:review
description: Use when a build is complete and you need analytical judgment on code quality, correctness, and simplicity before wrapping up. Gates on /claude-tweaks:test passing. The quality gate between implementation and lifecycle cleanup.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Review — Analytical Judgment Gate

Post-build quality gate. `/claude-tweaks:test` answers "does it work?" — `/claude-tweaks:review` answers "is it good?" Reviews, refines, and approves the code before handing off to wrap-up. Part of the workflow lifecycle:

```
/claude-tweaks:init → /claude-tweaks:capture → /claude-tweaks:challenge → /superpowers:brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:stories → /claude-tweaks:test → [ /claude-tweaks:review ] → /claude-tweaks:wrap-up
                                                                                                                                                                                ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- A `/claude-tweaks:build` session just finished and needs quality verification
- You want to verify code before creating a PR
- Code was written outside the workflow and needs a structured review
- `/claude-tweaks:help` recommends reviewing a spec that appears complete
- You need a visual browser review of the running application
- You want to discover and document user journeys in a brownfield project

## Overview

`/claude-tweaks:test` verifies that code works mechanically — types pass, lint is clean, tests are green, QA stories execute successfully. `/claude-tweaks:review` assumes all that has passed and asks a different question: is this code *good enough to ship?*

This skill is the analytical quality gate — spec compliance, human-judgment code review, and quality summary. Visual browser inspection is handled by `/claude-tweaks:visual-review`. Mechanical verification lives in `/claude-tweaks:test`.

## Review Modes

| Mode | Syntax | What runs |
|------|--------|-----------|
| **code** (default) | `/claude-tweaks:review 42` | Steps 1-7: spec compliance, test gate, change analysis, code review, hindsight, simplification, summary |
| **full** | `/claude-tweaks:review 42 full` | Code review (Steps 1-5) + visual browser review via `/claude-tweaks:visual-review` (Step 6) + summary (Step 7) |
| **visual** | `/claude-tweaks:review visual {url}` | Delegates entirely to `/claude-tweaks:visual-review` — page mode |
| **journey** | `/claude-tweaks:review journey:{name}` | Delegates entirely to `/claude-tweaks:visual-review` — journey mode |
| **discover** | `/claude-tweaks:review discover` | Delegates entirely to `/claude-tweaks:visual-review` — discover mode |

Code mode is the default. Append `full` to include a visual pass after code review. Use `visual`, `journey:`, or `discover` for browser-only reviews — these delegate entirely to `/claude-tweaks:visual-review`.

When invoked by `/claude-tweaks:flow`, review runs in **full** mode by default (code + visual). Flow handles browser detection and falls back to code mode when no browser backend is available.

## Input

`$ARGUMENTS` = spec number, file paths, mode, or visual review target.

### Resolve the input:

1. **Spec number** (e.g., "42") — find all files changed for that spec via git history. Mode: code.
2. **Spec number + `full`** (e.g., "42 full") — code review + visual browser review
3. **File paths** — review those specific files. Mode: code.
4. **`visual` + URL or description** (e.g., "visual http://localhost:3000") — browser review only (page mode)
5. **`journey:{name}`** (e.g., "journey:checkout") — browser review only (journey mode)
6. **`discover`** — browser review only (discover mode)
7. **No arguments** — use `git diff` against the base branch or recent commits to identify changed files. Mode: code.

In visual, journey, and discover modes, delegate entirely to `/claude-tweaks:visual-review` — skip Steps 1-7.

## Step 1: Spec Compliance Check (spec-based only)

If a spec number was provided, read the spec file and verify the implementation meets it:

1. **Deliverables** — for each deliverable checkbox in the spec, search the codebase for the implementation. Mark each as `done`, `partial`, or `missing`.
2. **Acceptance Criteria** — for each criterion, determine whether it's verifiable from the code and tests. Mark as `met`, `partially met`, or `not met`.
3. **Non-Goals** — verify the implementation didn't accidentally include work scoped out by the spec's Non-Goals section.

### Gate:

| Result | Action |
|--------|--------|
| All deliverables done + all criteria met | Proceed to Step 1.5 |
| Minor gaps (1-2 partial items) | Flag gaps, proceed — they may be addressed in Implementation Hindsight |
| Significant gaps (missing deliverables or criteria) | **BLOCKED** — the spec isn't fully built yet. List what's missing so the user can resume `/claude-tweaks:build` |

If blocked, skip the rest of the review. Present the gap analysis so the user knows exactly what to finish.

> **Why this is Step 1:** A thorough code review on incomplete work wastes effort. Catch spec gaps before investing in quality analysis.

## Step 1.5: Test Gate

Verify that `/claude-tweaks:test` has passed before proceeding to analytical review. Reviewing code quality on code that doesn't work is wasted effort.

`PASS_WITH_CAVEATS` counts as passed — caveats are informational observations (e.g., minor UX roughness, non-blocking warnings) and do not block review. QA caveats are included in the findings table (Step 3 Routing) for visibility but have status `observation`, not `open`.

### In `/claude-tweaks:flow` pipeline:

Check for `TEST_PASSED=true` in pipeline context. If present, proceed to Step 2.

### Standalone (outside `/flow`):

Check for a recent `/claude-tweaks:test` pass. A pass is "recent" if no code changes have been committed since the test run.

- **Recent pass found** → proceed to Step 2.
- **No recent pass** → auto-trigger `/claude-tweaks:test`. If QA stories exist (`stories/*.yaml`), trigger `/claude-tweaks:test all` (full suite + QA). Otherwise trigger `/claude-tweaks:test` (standard suite only).

### QA Ledger Check

After confirming `TEST_PASSED`, read the open items ledger (`docs/plans/*-ledger.md`) and filter for entries with phase `test/qa`:

- If any QA ledger entries have status `open` (failures that were not resolved), include them in the test gate report alongside the `TEST_PASSED` status. These represent QA failures that `/test` surfaced and that still need resolution.
- If all QA entries have status `observation` or `fixed`, note: "QA observations present — see findings table in Step 3 Routing."

### Gate:

| Result | Action |
|--------|--------|
| `TEST_PASSED=true` (pipeline) | Proceed to Step 2 |
| Recent `/test` pass (standalone) | Proceed to Step 2 |
| `/test` triggered and passes | Proceed to Step 2 |
| `/test` triggered and fails | **STOP** — present test failures. Fix before continuing. Run `/claude-tweaks:test` to re-verify. |

> **Why this gates review:** Mechanical correctness is a prerequisite for analytical quality judgment. Code review on broken code wastes effort.

## Step 2: Identify What Changed

Analyze `git diff` (or `git diff` against the base branch) to understand the scope:

- Which files changed and in which packages/apps
- Lines added/removed
- Whether schema, API surface, or infrastructure changed
- Whether new dependencies were introduced

If infrastructure or deployment changes are detected (Terraform, CDK, Docker, CI/CD, database migrations, new environment variables) that aren't already in the ledger as `ops` items, append them with phase `ops` and status `open`. This catches ops requirements introduced during review fixes that weren't present in the original build.

This classification guides which review lenses to apply — a pure UI change doesn't need a database review.

## Step 3: Code Review

Review changed files through these lenses. Skip lenses that don't apply to the type of change (e.g., skip "Performance" for a docs-only change).

**Severity floor per lens** (calibrate flag thresholds — over-flagging is the most common review failure):

| Lens | Expected ceiling | Notes |
|------|------------------|-------|
| 3a Convention | medium | Only flag when divergence compounds (e.g., new code introduces a third logging pattern); single-instance style differences are not findings. |
| 3b Security | critical / high | Always actionable. No "info" findings — if it's a security observation that isn't actionable, drop it. |
| 3c Error handling | high | Critical only when an uncaught error leaves the system in a broken state. |
| 3d Performance | high | Critical only when a measured regression exists (real query, real benchmark); never speculative. |
| 3e Architecture | high | Critical only when a layering violation will break a near-term feature; otherwise medium. |
| 3f Test quality | medium | Tests are not production code; flag only when a missing test would have caught a real bug. |
| 3g-cov Coverage | low / informational | Never blocks the review. |
| 3h UX (when QA data) | high | Capable model — judgment-heavy synthesis. |
| 3i Doc freshness | low / informational | Never blocks the review. |

> **Working Directory Discipline (applies to every Task() dispatch in Step 3 and Step 3.5):** Resolve `WORKTREE = $(git rev-parse --show-toplevel)` once in the dispatcher. Anchor every git command in the agent prompt as `git -C "$WORKTREE" …`, and prefix any path-sensitive shell command with `cd "$WORKTREE" && …`. CWD does not propagate reliably to parallel agents; without the anchor, reproductions and debate agents can read the wrong checkout. See `_shared/git-discipline.md` and the Working Directory Discipline section in `_shared/subagent-output-contract.md`.

> **Parallel execution:** Before running any lens, gather all context upfront — read all changed files and their surrounding context (imports, tests, schemas) as parallel Read/Grep calls. Each lens needs the same files, so front-loading reads avoids redundant I/O.

> **Parallel execution (conditional):** When the diff spans 10+ files, dispatch each applicable lens (3a-3f) as a **reproduction pair** — 2 identical agents per lens (up to 12 Task agents total: 6 reproduction lenses × 2). When the diff is smaller, run each lens as a 2-agent reproduction pair sequentially in the main thread. Lenses 3g-cov, 3h, and 3i are not dispatched as reproduction pairs — they run as single agents (3h) or main-thread procedures (3g-cov, 3i).
>
> **Reproduction dispatch (Mode 1 — per lens):** For each lens, dispatch 2 agents in one batch with **byte-identical prompts** (same scope, same Template-A contract, same model tier). Independent runs — no agent sees the other's output. After both return, apply `categoriseReproduction(agentA.findings, agentB.findings)` from `bin/lib/coordination.js`:
> - Findings present in both agents' outputs (path exact, line ±2, matching severity bucket) → emit as `confirmed`. Write to `decisions.md`: `AUTO {HH:MM:SS} — Reproduction: lens "{lens}" finding {path}:{line} reproduced. Confirmed. Reversibility: high.`
> - Findings present in only one agent's output → emit as `unconfirmed`. Write: `STAGED {HH:MM:SS} — Reproduction: lens "{lens}" finding {path}:{line} not reproduced. Staged to Review Console as low-confidence. Reversibility: high.` Unconfirmed findings do **not** enter Step 3 Routing — they route directly to the Wrap-Up Console's Low-confidence subsection.
>
> **Model tier (per lens):** 3a (Convention) and 3f (Test Quality) → Fast (Haiku) — mechanical convention checks on isolated files. 3b-3e (Security, Errors, Performance, Architecture) → Standard (Sonnet) — multi-file analysis and cross-cutting findings. 3h (UX Analysis) → Capable (Opus) — judgment-heavy synthesis.
>
> **Output template (each agent must follow exactly):** The Calibration block + OUTPUT FORMAT must be reproduced byte-identical in each dispatched agent's prompt — do NOT paraphrase. Read `step3-routing.md` in this skill's directory for the canonical dispatch template; inline it verbatim into every `Task()` call.

### 3a: Convention Compliance

- Does the code follow naming conventions documented in CLAUDE.md?
- Are project patterns followed (error handling, validation, logging)?
- Are shared utilities used instead of reinventing (check existing packages)?
- Are imports from the right packages (not duplicating types inline)?
- Does the code follow patterns documented in `.claude/skills/*.md`? If code diverges from a skill, flag it in the findings table AND append a `review/skill` ledger entry — the code may be correct and the skill stale.

### 3b: Security

- Input validation at system boundaries?
- No raw SQL or command injection risks?
- Authentication/authorization checks present where needed?
- No secrets or sensitive data in code?
- OWASP top 10 considerations?

### 3c: Error Handling

- Appropriate error types used (project's error class, not raw Error)?
- Edge cases handled (null, empty, malformed input)?
- Errors logged with sufficient context for debugging?
- User-facing errors safe (no internal details leaked)?

### 3d: Performance

- No N+1 query patterns?
- Appropriate use of caching where applicable?
- No unnecessary re-renders (React)?
- Database queries have proper indexes?
- Pagination used for unbounded lists?

### 3e: Architecture

- Right level of abstraction (not over/under-engineered)?
- Proper separation of concerns?
- Dependencies flow in the right direction?
- No circular dependencies introduced?
- Changes consistent with existing architecture?

### 3f: Test Quality

- Tests verify behavior, not implementation details?
- Edge cases and error paths tested?
- Test data is realistic and follows schemas?
- No test pollution (shared mutable state)?
- Mocks are minimal and at the right level?

### 3g-cov: Journey-Story Coverage (when journeys and stories exist)

Check coverage between journey files and story YAML files. This lens is informational — coverage gaps do not block the review.

> **Parallel execution:** Use parallel tool calls aggressively — all Read operations on journey files and story YAML files are independent and should run concurrently.

**Skip this lens when** no journey files exist in `docs/journeys/` or no story YAML files exist in the stories directory.

1. Read all journey files from `docs/journeys/*.md`. Parse each for: journey name, step URLs, `files:` frontmatter.
2. Read all story YAML files from `stories/*.yaml` (or the configured stories directory). Collect the `journey:` field from each story.
3. Cross-reference:
   - For each journey, find stories with `journey: {journey-name}`. Count stories and check which journey step URLs are covered.
   - Identify **orphaned stories** — stories with no `journey:` field, or whose `journey:` value references a non-existent journey file.
   - For orphaned stories, check their URL against journey step URLs to suggest potential links.

4. Add findings to the code review findings table:

   **Uncovered journey steps:**
   ```
   | {N} | Journey '{name}' has {M} uncovered steps ({step numbers}) | Medium | Coverage | docs/journeys/{name}.md | Run `/stories journey={name}` |
   ```

   **Orphaned stories with journey URL match:**
   ```
   | {N} | Story '{id}' matches journey '{name}' but has no `journey:` field | Low | Coverage | stories/{file}.yaml | Add `journey: {name}` |
   ```

   **Orphaned stories with no match** (informational, not added to findings table):
   Log: "{N} orphaned stories with no journey match (negative stories or standalone flows)."

### 3h: UX Analysis (when QA data available)

Run the UX analysis procedure from `ux-analysis.md` in this skill's directory. Only runs when QA screenshots and/or caveats exist from a recent `/claude-tweaks:test qa` or `/claude-tweaks:test all` run. When no QA data is available, skip this lens silently.

### 3i: Documentation Freshness (informational)

**Skip when** `docs/REGISTRY.md` doesn't exist, or the diff is docs-only.

1. Read `docs/REGISTRY.md`
2. Match changed files against Auto-detect patterns
3. For each matched registry entry, check if the doc was updated in this work's commits (look for doc update commits in `git log`)
4. Flag unupdated docs as informational findings:

   ```
   | {N} | Doc `{file}` covers changed areas (`{pattern}`) but wasn't updated | Low | Docs | {file} | Review in wrap-up |
   ```

These findings are informational — they don't block the review. They ensure wrap-up doesn't miss doc updates that build skipped.

### Step 3.5: Cross-Lens Debate

After per-lens reproduction completes, scan for contradictions across lenses before routing. Two lenses that reviewed the same region with contradicting verdicts (one flagged, the other did not, or both flagged with mismatched severity) get exactly one debate round to converge or escalate to `contested`.

1. **Detect overlap.** Collect each lens's `confirmed` and `unconfirmed` findings. Call `detectCrossLensOverlap(findingsByLens)` from `bin/lib/coordination.js`. It returns pairs `{lensA, lensB, findingA, findingB}` for findings on the same `path` within ±5 lines from *different* lenses.

2. **Filter to contradictions.** From each overlap pair, keep only those where the verdicts contradict — one lens flagged, the other had agents that reviewed the same region without flagging at matching severity. Lenses that agreed (both flagged with matching severity bucket, or both clear) produce no debate.

3. **Dispatch debate (Mode 2 — 2 agents, 1 round, parallel).** For each contradiction, dispatch 2 agents using the original lens-agents' identity (re-dispatch the affected lens's reviewer with the *stripped opposing finding* as input — no model identity, no reasoning chain, just finding text + evidence). Both judges return `agree | disagree | partial` plus one paragraph of reasoning. Inline this template literally in each `Task()` prompt:
>
>    ```
>    Two lenses disagreed on this region. Review the conflicting findings below and return:
>    First line: one of DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED. Then:
>    1. Verdict: agree / disagree / partial
>    2. One paragraph of reasoning.
>
>    Contested region: {path}:{line}
>    Finding A (lens: {lensA}): {finding text}
>    Finding B (lens: {lensB}): {finding text}
>
>    [Use: Capable model — debate agent. Independent run; do not see the other judge's reasoning.]
>    ```

4. **Resolve.** Apply `resolveDebate(verdictA, verdictB)` from `bin/lib/coordination.js`:
   - Both `agree` → finding upgraded to `confirmed`. Write `AUTO {HH:MM:SS} — Debate: cross-lens disagreement on {path}:{line} converged positive after 1 round. Reversibility: high.`
   - Both `disagree` → finding downgraded to `unconfirmed` (lands in Low-confidence subsection). Write `AUTO {HH:MM:SS} — Debate: cross-lens disagreement on {path}:{line} converged negative after 1 round. Reversibility: high.`
   - Mixed / partial → finding becomes `contested`. Write `STAGED {HH:MM:SS} — Debate: cross-lens disagreement on {path}:{line} inconclusive ({verdicts}). Both verdicts staged. Reversibility: high.` Stage the side-by-side verdicts to `staged/review-contested-{N}.md`.

5. **Skip debate** when no overlap is detected, or when only one lens covered a region. Avoid running debate on every `Path:Line` where any two lenses touched — that explodes the token budget for no value.

After Step 3.5, every finding has a final bucket — `confirmed`, `unconfirmed`, or `contested`. Only `confirmed` findings flow into Step 3 Routing. `unconfirmed` and `contested` are already staged to the Wrap-Up Console.

### Step 3 Routing — Code Review Findings

Routing logic lives entirely in `step3-routing.md` in this skill's directory: severity-based auto routing (with the contract floors), the interactive batch table, recommendation rules, the deferral gate, the parallel-fix dispatch contract (3+ independent fixes via `/superpowers:dispatching-parallel-agents`), and the auto-advance-on-zero-findings rule. `unconfirmed` and `contested` findings bypass Step 3 Routing — they route directly to the Wrap-Up Console (Low-confidence and Contested subsections, respectively).

---

## Step 4: Implementation Hindsight (Decision Point)

Run `/claude-tweaks:reflect` in **hindsight** mode. Pass:
- **Scope** — the changes analyzed in Steps 2-3
- **Ledger phase** — `review/hindsight`

The reflect skill handles the full hindsight evaluation, finding presentation, routing, ledger writes, and re-verification after fixes. See `/claude-tweaks:reflect` for details.

If the reflect skill produces "Change now" fixes, re-run `/claude-tweaks:test` before proceeding.

---

## Step 5: Simplify Changed Code

Run `/claude-tweaks:simplify` on files modified during this work (use `git diff --name-only`).

The simplify skill handles scope resolution, running the code-simplifier subagent, and re-verification after changes. See `/claude-tweaks:simplify` for details.

---

## Step 6: Visual Review

**When this step runs:**
- **Code mode:** Delegate to `/claude-tweaks:visual-review discover` — it detects UI changes + affected journeys and surfaces a recommendation. Do not stop to ask; note any recommendation in the summary (Step 7).
- **Full mode:** Invoke `/claude-tweaks:visual-review` with the target URL/journey and QA data (if available). The visual review owns UI/journey detection and the procedure. Findings feed into the summary (Step 7) as the "UI / Visual" lens with their own severity classifications, routed through the same Step 3 Routing resolution mechanics (fix now / defer / accept) when actionable.
- **Visual/journey/discover mode:** Delegate entirely to `/claude-tweaks:visual-review` — skip Steps 1-5 and 7.

Invocation:

```
/claude-tweaks:visual-review {affected-journey-or-url}
```

`/visual-review` owns the mechanics — UI file detection, affected-journey lookup, browser prerequisite checks, dev URL resolution, the page/journey/discover procedures, and the missing-browser skip path. This skill consumes its report; it does not re-implement detection here.

## Step 6.5: Design Quality Pass (Impeccable)

Invoke `/claude-tweaks:design review <spec>` to run Impeccable's `critique` + `audit` commands on the changed UI files. Findings are advisory in Phase 1 — they inform the verdict and surface in the review summary, but are not auto-applied.

**Skip this step entirely when:**
- Mode is `visual`, `journey`, or `discover` (these delegate entirely to `/visual-review` and skip the analytical review steps)

**Invocation:**

Pass the spec number (or paths) used for this review run. The wrapper resolves changed UI files via its own detection and runs `/impeccable:impeccable critique` + `/impeccable:impeccable audit`.

**Result handling:**

| Wrapper return | Review behavior |
|----------------|-----------------|
| `{result: "advisory", findings: [...]}` | Include findings in the summary as a "Design Quality" section (see Step 7's template). Findings are advisory — they inform the verdict, but no auto-fixes. |
| `{skipped: ...}` | Omit the "Design Quality" section from the summary. Note the skip reason in the summary footer. |
| `{deferred: ...}` (should not happen for `review` mode) | Treat as skip and omit the section. |

See `_shared/design-wrapper-handling.md` for the canonical return-shape contract and the "why skips don't fail" rationale.

**Why findings are advisory (review-specific):** Impeccable critiques are LLM-generated and opinionated. The user judges which findings to action. The wrapper's `review` mode is read-only — code-modifying behavior lives in `polish` (invoked separately). Surfacing findings is the value-add; the user routes them to fixes, deferrals, or accepted decisions through Step 3 Routing if they choose.

**Routing (optional):** When the user wants to action design findings inline, route them through Step 3-bis below — Step 3 has already completed by this point, so design findings get their own branch reachable only from Step 6.5. When the user opts not to action them inline, they remain in the Design Quality summary section as informational.

## Step 3-bis: Design Findings Routing (from Step 6.5)

Reachable only when Step 6.5 produced `{result: "advisory", findings: [...]}` AND the user opted to action findings inline. This branch reuses the routing mechanics from `step3-routing.md` (severity-based auto routing, interactive batch table, deferral gate, parallel-fix dispatch) but operates on a separate findings set scoped to category `Design Quality`.

1. Treat each design finding as a row in a Step 3-bis batch table with category `Design Quality`, severity from the wrapper output (`info` → low, `warning` → medium, `error` → high), and the wrapper's suggestion as the recommended fix.
2. Run the same severity-routing table from `step3-routing.md` — low → AUTO, medium → STAGED, high → STAGED, critical → KEPT-PROMPT.
3. After resolution, fold the resolved findings back into the Step 7 summary's "Design Quality" section with their final status (fixed / deferred / accepted).

Step 3-bis does NOT replay Step 3.5 (cross-lens debate) — design findings come from a single source and have no peers to debate against. Step 3-bis also does NOT re-dispatch reproduction pairs — Impeccable's output is already filtered upstream.

## Step 7: Present Review Summary

Present a structured summary covering spec compliance, test results (from `/test`), code review findings, browser review (if run), implementation hindsight, tradeoffs, simplification, and a verdict (PASS or BLOCKED). The summary must include an Actions Performed table (when autonomous fixes were applied) and a Next Actions block (always). For the complete template and context-signal rules, read `review-summary-template.md` in this skill's directory.

### Key Learnings for Wrap-Up

At the end of the summary, include a `### Key Learnings` section with 1-3 insights that emerged during this review — patterns discovered, conventions confirmed or challenged, techniques worth remembering. These feed directly into `/claude-tweaks:wrap-up` Step 3 (Reflection) so wrap-up doesn't have to re-derive them from scratch.

```
### Key Learnings
1. {insight} — {why it matters for future work}
2. {insight} — {why it matters}
```

If no notable learnings emerged, state: "No key learnings — straightforward review."

## Important Notes

- Spec compliance is the first gate — incomplete specs go back to `/claude-tweaks:build`, not through code review
- Test passing is a hard gate — broken code blocks the entire review. Run `/claude-tweaks:test` to verify.
- Implementation Hindsight is an action gate — "change now" items must be fixed before passing
- Code simplification runs on changed files only — never expand scope to unrelated code
- Skip review lenses that don't apply to the type of change
- This skill reviews the *current work* — it is not a codebase-wide audit

## Next Actions

Next Actions are rendered as part of Step 7's review summary — they live in `review-summary-template.md` (the "Next Actions" block at the bottom of the template), conditioned on the verdict (PASS or BLOCKED). The template's signal-driven table determines which options surface (e.g., visual-review options appear only when journeys are affected and a browser is available).

See `review-summary-template.md` in this skill's directory for the full Next Actions tables.

## Component-Skill Contract

`/claude-tweaks:review` is invoked by `/claude-tweaks:flow` as the analytical-quality gate between test and wrap-up. Parent invocation is signaled by `$PIPELINE_RUN_DIR` being set (set by `/flow`, `/build`, or other pipeline orchestrators). Direct invocations may pass `--source <parent>` as an explicit fallback. When `$PIPELINE_RUN_DIR` is set, omit the Next Actions block at the end of Step 7's summary — the parent `/flow` owns the handoff and renders its own Pipeline Summary + Next Actions. When invoked directly by a user, render Next Actions per `review-summary-template.md`. /review itself invokes `/claude-tweaks:reflect` (Step 4), `/claude-tweaks:simplify` (Step 5), `/claude-tweaks:visual-review` (Step 6), and `/claude-tweaks:design` (Step 6.5) — each is a component skill governed by its own contract (Next-Actions omitted when invoked from here).

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Reviewing incomplete specs | Wastes effort — spec compliance check (Step 1) catches this, but don't skip it |
| Skipping the test gate to "save time" | Broken code invalidates the entire review — `/test` must pass first |
| Reviewing unrelated code | Scope creep — only review files changed in the current work |
| Accepting all Implementation Hindsight findings as-is | The action gate exists for a reason — "change now" items must be fixed |
| Running review without a prior build | Review assumes code exists and was recently written — it is not a codebase-wide audit |
| Listing code review findings without routing them | Every finding must be explicitly resolved: fix now, defer with context, or don't fix with stated reason. No implicit drops. |
| Putting findings only in the summary table | The summary records resolutions, not unresolved observations. Route first (Step 3 Routing), then summarize (Step 7). |
| Running verification or QA directly in review | Mechanical checks belong in `/claude-tweaks:test` — review gates on test passing, it doesn't duplicate the work |
| Treating Design Quality findings as authoritative | LLM critiques are opinionated — findings are advisory. The user judges which to action. Phase 1 deliberately keeps the design wrapper read-only. |
| Auto-fixing Design Quality findings in Step 6.5 | Phase 1's design wrapper is read-only — code-modifying behavior ships in Phase 2's polish phase. Findings route through Step 3 Routing if the user wants to action them. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | Produces the code and journey files that /claude-tweaks:review evaluates |
| `/claude-tweaks:test` | /test is the mechanical "does it work?" gate. /review gates on `TEST_PASSED=true` — it never runs verification or QA itself. Standalone /review auto-triggers /test if no recent pass. |
| `/claude-tweaks:wrap-up` | Runs after /claude-tweaks:review passes — focuses on reflection, cleanup, and knowledge capture. Skill-routed entries from lens 3a (phase `review/skill`) and from /reflect hindsight findings tagged `[skill: …]` (phase `review/hindsight`) feed into wrap-up's skill update analysis (Step 7). |
| `/claude-tweaks:capture` | /claude-tweaks:review may create INBOX items for new ideas discovered during review |
| `/claude-tweaks:visual-review` | Invoked BY /review (Step 6) for browser-based visual inspection. In full mode, runs after code review. In visual/journey/discover modes, /review delegates entirely. |
| `/claude-tweaks:init` | Phase 8 delegates to `/visual-review discover` for brownfield journey bootstrapping. Phase 0 configures the browser backends that visual review depends on. /init creates the doc registry that lens 3i uses for documentation freshness checks. |
| `/claude-tweaks:stories` | Generates the YAML stories that /test validates. /review consumes /test results (including QA) via `TEST_PASSED`. /review also checks journey-to-story coverage in code review lens 3g-cov — uncovered journey steps and orphaned stories are surfaced as informational findings. |
| `/claude-tweaks:browse` | Used by visual, journey, and discover modes for browser interaction |
| `specs/DEFERRED.md` | /claude-tweaks:review routes implementation-related deferrals here (with origin, files, trigger) |
| `/claude-tweaks:flow` | Invokes /review in **full** mode by default (code + visual). Flow handles browser detection and falls back to code mode when no browser backend is available. |
| `/superpowers:dispatching-parallel-agents` | Used BY /claude-tweaks:review (conditional) to dispatch 3+ independent fix-now findings as parallel agents |
| `/claude-tweaks:reflect` | Invoked BY /review (Step 4) in hindsight mode. Handles the implementation hindsight evaluation, finding routing, and ledger writes with phase `review/hindsight`. |
| `/claude-tweaks:simplify` | Invoked BY /review (Step 5) on files modified during review. Handles code simplification and re-verification. |
| `/claude-tweaks:ledger` | Manages the open items ledger. /review appends findings (Step 3 Routing). Hindsight findings (Step 4) are written by /reflect using `review/*` phases. |
| `/claude-tweaks:help` | /help flags specs awaiting review and recommends `/review` in its pipeline status scan |
| `/claude-tweaks:design` | /review invokes `/claude-tweaks:design review <spec>` as Step 6.5 to run Impeccable's `critique` + `audit` commands. Findings are advisory, surfaced in the "Design Quality" section of the review summary. The wrapper handles its own detection and availability checks; skips are silent (section omitted). |
| `/claude-tweaks:journeys` | /journeys produces the journey files /review consults in Step 6 to recommend visual review for affected journeys and in lens 3g-cov for journey-to-story coverage. /review surfaces uncovered journey steps and orphaned stories as informational findings. |
| `/claude-tweaks:tidy` | /tidy reads /review summaries to detect cross-spec patterns (Step 5.5) — recurring finding categories, frequently flagged files, repeated gotchas — and recommends adding rules to CLAUDE.md when patterns appear in 3+ specs. /tidy also flags specs that appear complete but lack a /review run. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling. The severity-routing table in "Step 3 Routing — Code Review Findings" implements the contract's reversibility/confidence/severity floors. |
| `_shared/multi-agent-coordination.md` | Canonical primitive for Reproduction (Mode 1, Step 3 per-lens dispatch) and Debate (Mode 2, Step 3.5 cross-lens contradiction resolution). The deterministic comparison + resolve helpers live in `bin/lib/coordination.js`. |
| `_shared/subagent-output-contract.md` | Per-lens reviewer agents emit Template A; debate agents inline a custom verdict template. The status line and model-tier conventions follow this contract. |
