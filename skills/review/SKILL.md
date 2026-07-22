---
name: claude-tweaks:review
description: Use when a build is complete and you need analytical judgment on code quality, correctness, and simplicity before wrapping up. Gates on /claude-tweaks:test passing. The quality gate between implementation and lifecycle cleanup.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.


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

## Ceremony-Aware Step Selection

When a pipeline run directory exists, read `config.yml`'s `ceremony-profile`. Under `fast-lane`,
Steps 1 (Spec Compliance Check), 1.6 (Cross-Spec Promise Check), and 4 (Implementation Hindsight)
are skipped — each is exact per-record overhead independent of diff size, the same shape of
fixed-cost wrapper `ceremony-profile: fast-lane` already trims in `/claude-tweaks:build` and
`/claude-tweaks:wrap-up`. Steps 2, 3 (the actual code-quality read of the diff), and 5 run
unchanged regardless of tier — Step 3 is the safety-relevant judgment this whole scheme protects,
and Step 5 already scopes to `git diff --name-only` only, with no "look beyond the diff" behavior
to cap. Standalone review (no pipeline run directory) always runs every step, matching
`/claude-tweaks:reflect`/`/claude-tweaks:wrap-up`'s own standalone-defaults-to-full rule. A Review
finding at any severity still triggers the existing ceremony escape hatch
(`/claude-tweaks:wrap-up`'s Step 3.5 downgrades `ceremony-profile` to `standard` for the rest of
the run) — unchanged. See
`docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md` for the full rationale.

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

**Effort** is a separate, orthogonal argument — see Input resolution below and Step 2.5. It applies only within `code`/`full` modes (where Steps 1-7's lens system runs); it's a no-op when combined with `visual`, `journey:`, or `discover`, which delegate entirely to `/claude-tweaks:visual-review` and skip Steps 1-7 outright.

## Input

`$ARGUMENTS` = spec number, file paths, mode, effort tier, or visual review target.

### Resolve the input:

1. **Spec number** (e.g., "42") — find all files changed for that spec via git history. Mode: code.
2. **Spec number + `full`** (e.g., "42 full") — code review + visual browser review
3. **File paths** — review those specific files. Mode: code.
4. **`visual` + URL or description** (e.g., "visual http://localhost:3000") — browser review only (page mode)
5. **`journey:{name}`** (e.g., "journey:checkout") — browser review only (journey mode)
6. **`discover`** — browser review only (discover mode)
7. **No arguments** — use `git diff` against the base branch or recent commits to identify changed files. Mode: code.
8. **Effort token** — the literal `low`, `medium`, `high`, `xhigh`, or `max`, appearing anywhere among the other tokens above (e.g. `/claude-tweaks:review 42 high` or `/claude-tweaks:review 42 full xhigh`). Sets the `review-effort` tier explicitly (see Step 2.5), overriding derivation. Order-independent relative to the other tokens. Unambiguous against the rest of this grammar — spec numbers are numeric, `full`/`visual`/`journey:`/`discover` are fixed keywords that never collide with the five effort words. A standalone effort token with no other tokens (e.g. `/claude-tweaks:review high`) sets the tier and otherwise falls back to rule 7 — no spec number, so mode resolves via `git diff` against the base branch, same as no arguments at all.

In visual, journey, and discover modes, delegate entirely to `/claude-tweaks:visual-review` — skip Steps 1-7 (an effort token passed alongside one of these mode keywords is silently ignored, since Steps 1-7 are exactly where the lens system it gates lives).

## Step 1: Spec Compliance Check (spec-based only)

Skip this step entirely under `ceremony-profile: fast-lane` (see "Ceremony-Aware Step Selection"
above) — proceed directly to Step 1.5.

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

## Step 1.6: Cross-Spec Promise Check (parent-linked records only)

Skip entirely under `ceremony-profile: fast-lane` (see "Ceremony-Aware Step Selection" above).
Otherwise, skip silently when this record has no resolvable parent, or its parent has no
`## Cross-Spec Promises` section (`_shared/work-record.md`) — most records. This step never blocks
the review; it only updates the parent record and, when relevant, notes something in the Step 7
summary.

**Resolve the parent**, per `work-backend`: `local-files` — `facets.parent` (kept for
completeness; per `specify/SKILL.md`'s seeding step, only `work-backend: github-issues`
decompositions ever get a `## Cross-Spec Promises` section, so a `local-files` parent's promises
section is always absent);
`github-issues` — per `work-links`: `native` — query the sub-issue relationship from this record's
own side; `body-text` — read the `Parent: #N` line from this record's own body, written at
decomposition time (`spec-template.md`). No parent resolvable (a record human-filed or
`/capture`d directly, not produced by a `/specify` decomposition) → skip this step entirely.

**If the parent has a `## Cross-Spec Promises` section:**

1. **Check whether an `open` row names this record as Owner.** If so, this review's own diff
   (Step 2, once available — or the same change scope Step 1 already used for the deliverables
   check) is exactly the evidence needed: judge whether it satisfies the stated promise.
   - Satisfied → update the row's Status to `SATISFIED (commit {short-sha})` via `gh issue edit
     $PARENT_NUM --body-file`, and post a comment: `gh issue comment $PARENT_NUM --body "F{n}
     satisfied by #{this-record}: {one-line why}."`
   - Not yet satisfied → leave the row `open`, post a comment explaining what's still missing.
     Never edit another leaf's body from here — only the parent's promises section and comments.
2. **Check whether this record's own work reveals a new forward assumption on another sibling**
   not yet tracked (the same kind of gap the spec 13-23 build's whole-branch review caught
   mid-flight, not anticipated at decomposition time). If so: add a row to the parent's table, post
   a seeding comment, and — when the assumption concerns a still-open sibling — add the
   corresponding `Blocked by #N: {assumption}` line to this record's own body (a normal body edit,
   same as any other review-driven change to the record under review).

Both writes are additive to the parent's body/comments only — never touch a sibling leaf's body
from this step, and never block the review's own PASS/BLOCKED verdict on anything found here (see
`docs/superpowers/specs/2026-07-15-cross-spec-promise-tracking-design.md`'s Non-Goals: not a hard
gate anywhere).

## Step 2: Identify What Changed

Analyze `git diff` (or `git diff` against the base branch) to understand the scope:

- Which files changed and in which packages/apps
- Lines added/removed
- Whether schema, API surface, or infrastructure changed
- Whether new dependencies were introduced

If infrastructure or deployment changes are detected (Terraform, CDK, Docker, CI/CD, database migrations, new environment variables) that aren't already in the ledger as `ops` items, append them with phase `ops` and status `open`. This catches ops requirements introduced during review fixes that weren't present in the original build.

This classification guides which review lenses to apply — a pure UI change doesn't need a database review.

### Reusing a Prior Whole-Branch Review

In a multi-spec batch (`/claude-tweaks:flow 42,45,48`, or any run where several specs share one worktree/branch), a later spec's review may be tempted to cite an earlier spec's already-completed whole-branch review instead of re-dispatching. Only reuse it when the scope is **byte-identical**: the exact same commit range this review would otherwise cover, with zero delta — nothing has landed on the branch since the cited review's `HEAD`.

If the current diff is instead an **overlapping superset** — the branch has moved forward since the cited review ran (new commits from this spec or another), even a small amount — the cited review does not cover that delta. Do not treat "we reviewed the branch already" as covering commits that landed after its `HEAD`. Instead: cite the prior review for the range it actually covered, and run a supplementary review scoped to just the delta (`git diff <cited-review-HEAD>..<current-HEAD>`) — not a fresh full whole-branch review.

When it's unclear which case applies, default to overlapping superset (the conservative assumption) and run the supplementary check. Confirm byte-identical scope explicitly (diff the two commit ranges) before skipping re-dispatch — an unverified assumption of "same scope" is exactly how partial coverage escapes review.

## Step 2.5: Derive Review Effort

Resolve a `review-effort` tier — one of `low` / `medium` / `high` / `xhigh` / `max`, the same vocabulary Claude Code's native `/code-review` command uses for its own effort argument — before dispatching Step 3's lenses. This tier gates which lenses run (Step 3), whether cross-lens debate runs (Step 3.5), and how findings surface (`step3-routing.md`). It is never persisted back to the work record — it's derived fresh on every review run, unlike `risk:*`/`effort:*`/`ceremony:*`.

Resolution order — stop at the first that applies:

1. **Explicit argument.** If `$ARGUMENTS` contained an effort token (Input resolution rule 8), use it. Always wins — including over a high-risk record's own labels. A user who explicitly asks for `low` on a scary change, or `max` on a trivial one, gets what they asked for.

2. **Record risk/effort labels.** Applies only when Input resolution resolved a spec/record number (rules 1-2) — file-path and no-argument reviews (rules 3, 7) have no record to read and go straight to step 3 below. Fetch the record's `risk:*`/`effort:*` labels with a fresh, minimal read — independent of whether Step 1 ran (Step 1 is skipped under `ceremony-profile: fast-lane`, so this cannot assume a Step 1 fetch happened), per `work-backend`:

   **`github-issues`:**
   ```bash
   gh issue view {n} --json labels > /tmp/review-record-{n}.json
   node -e "const {parseRecordFacets}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/record.js');
     const d=JSON.parse(require('fs').readFileSync('/tmp/review-record-{n}.json'));
     const {risk, effort}=parseRecordFacets(d.labels);
     console.log(JSON.stringify({risk, effort}))"
   ```

   **`local-files`:**
   ```bash
   node -e "const {readRecord}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/local-store.js');
     const {risk, effort}=readRecord(process.argv[1]).facets;
     console.log(JSON.stringify({risk, effort}))" "{record-file-path}"
   ```

   Both resolve to the same `{risk, effort}` shape. If either is `null`/`undefined` (record never scored) or the read fails (malformed labels, backend error), fall through to step 3 below — never default straight to `low`. Otherwise combine via this table:

   | risk ↓ / record effort → | low | medium | high |
   |---|---|---|---|
   | **low** | low | low | medium |
   | **medium** | medium | medium | high |
   | **high** | high | xhigh | max |

   Risk (blast radius/safety) is the primary driver — `risk:high` always yields at least `high`. `risk:low` floors at `low` unless the record's own size (`effort:*`) compounds it to `medium`.

3. **Diff heuristic (fallback).** No record, the record carries no `risk:*`/`effort:*` labels, or the label read failed. Derive proxies from Step 2's change analysis and feed the same table above:
   - Risk proxy = **high** if the diff touches a path matching the `merge-sensitive-paths` config key (the same key `assess-agent-autonomy`'s `merge-check` mode already reads for the identical "elevated risk from touched paths" purpose), a schema/migration file, infra/CI-CD config, or introduces a new dependency (Step 2 already flags all of these for its ops-ledger check); **medium** if it touches public API surface or a cross-package interface; **low** otherwise.
   - Record-effort proxy (size — not the `review-effort` tier being derived here) = **high** at 10+ files or 300+ lines changed; **medium** at 3-9 files or 50-299 lines; **low** otherwise. These thresholds are fixed defaults — no config layer exists for this derivation.
   - If `git diff` produces no output to classify, default to `high` directly (skip the table) — see the ambiguity rule below.

**Ambiguity never resolves toward less scrutiny.** If reading record labels fails, fall through to the diff heuristic rather than defaulting to `low`. If the diff heuristic itself can't render a clear signal, default to `high` — the tier that reproduces this skill's pre-existing default behavior — never `low`.

Record the resolved tier and which resolution step produced it, for Step 7's summary: `{explicit argument | record labels: risk:{x} × effort:{y} | diff heuristic: {reasoning}}`.

## Step 3: Code Review

Review changed files through these lenses. Skip lenses that don't apply to the type of change (e.g., skip "Performance" for a docs-only change).

The severity scale, category enum, per-lens floors, and the CALIBRATION filter are the shared review-quality criteria — read `_shared/criteria-review-quality.md` (also used by `/claude-tweaks:code-health`'s review lens). The table below is the operative copy:

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

**Lens scope by `review-effort` tier** (resolved in Step 2.5): lower tiers dispatch fewer agent-based lenses, trading breadth for speed and higher-confidence-only output — mirroring native `/code-review`'s own effort semantics (fewer, higher-confidence findings at the low end; broader coverage at the high end).

| Tier | Agent-dispatched lenses in scope |
|------|------|
| `low` | 3b, 3c |
| `medium` | 3b, 3c, 3a, 3f |
| `high` | 3b, 3c, 3a, 3f, 3d, 3e, 3h — every applicable lens. **Reproduces this skill's pre-existing default behavior.** |
| `xhigh` | Same lens set as `high` |
| `max` | Same lens set as `high` |

A lens outside the resolved tier's scope is never dispatched — it does not run and produces no findings. The pre-existing "skip a lens if it doesn't apply to this change type" rule (above) still applies on top of whichever set the tier allows — e.g. at `high`, Performance is still skipped for a docs-only diff. Lens 3h additionally requires QA data to be available at all (its own existing, effort-independent gate) — when QA data isn't available, 3h doesn't run even at `high`+. Lenses 3g-cov, 3i, and 3i-diagram are **not** gated by effort at all — they're main-thread/deterministic, not agent-dispatched, and stay gated only by their own existing data-availability conditions.

Reproduction pairs (the 2-agent verification dispatch below) always run for every lens that already uses the reproduction-pair mechanism (3a-3f) and is in scope at the resolved tier — verification is never skipped, only the initial lens set that gets a chance to flag something. (3h is never reproduction-paired, at any tier — see the "not dispatched as reproduction pairs" note below.)

At `xhigh` and `max`, append this sentence to each dispatched lens's prompt, after the Output Format block (do not modify the CALIBRATION block itself — it stays byte-identical across all tiers, per `step3-routing.md`'s dispatch contract): "Apply careful, thorough reasoning to this pass — consider subtle edge cases and second-order effects a faster read might miss." This is a best-effort prompt-level nudge, not a verified change to the dispatched agent's actual reasoning depth — the lens-scope table above is the load-bearing mechanism.

> **Working Directory Discipline:** Applies to every `Task()` dispatch in Step 3 and Step 3.5 (reproductions and debate agents). Apply the Working Directory Discipline rule from `_shared/subagent-output-contract.md` before any git or path-sensitive command in the agent prompt. See also `_shared/git-discipline.md`.

> **Parallel execution:** Before running any lens, gather all context upfront — read all changed files and their surrounding context (imports, tests, schemas) as parallel Read/Grep calls. Each lens needs the same files, so front-loading reads avoids redundant I/O.

> **Parallel execution (conditional):** When the diff spans 10+ files, dispatch each applicable lens (3a-3f) as a **reproduction pair** — 2 identical agents per lens (up to 12 Task agents total: 6 reproduction lenses × 2). When the diff is smaller, run each lens as a 2-agent reproduction pair sequentially in the main thread. Lenses 3g-cov, 3h, and 3i are not dispatched as reproduction pairs — they run as single agents (3h) or main-thread procedures (3g-cov, 3i).
>
> **Reproduction dispatch (Mode 1 — per lens):** For each lens, dispatch 2 agents in one batch with **byte-identical prompts** (same scope, same Template-A contract, same model tier). Independent runs — no agent sees the other's output. After both return, write each agent's `findings` array to a temp file and call `categoriseReproduction`:
> ```bash
> node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/coordination.js');
>   console.log(JSON.stringify(c.categoriseReproduction(require(process.argv[1]), require(process.argv[2]))))" \
>   /tmp/lens-${LENS}-agentA.json /tmp/lens-${LENS}-agentB.json
> ```
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
- Does the code follow patterns documented in `.claude/skills/*.md`? Append a `review/skill` ledger entry when the code **diverges** from a skill (flag it in the findings table too — the code may be correct and the skill stale), **extends** a documented pattern with a new wrinkle worth capturing (enrichment), or establishes a reusable pattern in a domain **no skill covers** (tag the entry `[skill: NEW - {name}]` — hyphen, not em-dash, for tooling friendliness). Keep it to a one-line entry — `/claude-tweaks:wrap-up` Step 7 does the deep analysis.

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
- **Shallow modules?** Does any new module have an interface nearly as complex as its implementation (a pass-through wrapper, a module whose interface mirrors its single dependency)? Flag at most the 1-2 most leverage-worthy at medium severity — and when shallow abstractions or wrong boundaries are the theme, recommend `/claude-tweaks:deepen` for a dedicated depth pass rather than trying to resolve module-level restructuring inline here. (module-level depth criteria: `_shared/criteria-architecture-depth.md`)

### 3f: Test Quality

- Tests verify behavior through the public interface, not implementation details? (No asserting on private methods, spying on internal collaborators, or checking intermediate data shapes that exist only because of the current implementation.)
- **Refactor-coupling diagnostic:** would this test break if you renamed an internal function or restructured the implementation *without changing behavior*? If yes, it's testing implementation, not behavior — flag it. The point of a test is to survive refactors and fail only when behavior breaks.
- **Test names read as specifications?** A good name states a capability ("user can checkout with a valid cart"), not an implementation path ("returns 200 when cart items quantity > 0 and user authed"). Flag names that describe internals.
- Edge cases and error paths tested?
- Test data is realistic and follows schemas?
- No test pollution (shared mutable state)?
- Mocks are minimal and at the right level? (Mocking internal collaborators is a smell — prefer real objects or interface-level stand-ins.)

### 3g-cov: Journey-Story Coverage (when journeys and stories exist)

Check coverage between journey files and story YAML files. This lens is informational — coverage gaps do not block the review.

Run the computation in `_shared/journey-coverage-check.md` (shared with `/claude-tweaks:journey-health`'s coverage scan; that file also documents the skip condition and parallel-execution note).

Add findings to the code review findings table:

   **Uncovered journey steps:**
   ```
   | {N} | Journey '{name}' has {M} uncovered steps ({step numbers}) | Medium | Coverage | docs/journeys/{name}.md | Run `/claude-tweaks:stories journey={name}` |
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

#### 3i-diagram: Visual documentation gap (informational)

Read the `diagram-suggestions` flag from CLAUDE.md (written by `/init` Step 11). **Skip silently when** `diagram-suggestions` is `disabled` or missing.

When `enabled`, scan the diff for **structural complexity** signals:

| Diff added | Signal |
|------------|--------|
| New / changed enum or `status:` field with 3+ states + a transition function (e.g., `switch (status)`, `transitionTo`, state-pattern files) | `state-machine` |
| New migration or ORM model with `references` / `foreignKey` / `belongsTo` between 2+ entities | `data-model` |
| New API routes / message handlers in 3+ service directories, OR a workflow file orchestrating 3+ services | `multi-actor` |
| 3+ new top-level directories under `src/` or new module boundaries | `architecture` |

If a signal matches **and** the co-located diagram location for this change (`docs/journeys/`, `docs/plans/`, or `docs/diagrams/` — see `/claude-tweaks:visualize`'s placement table) is missing OR contains no file whose name matches the changed area, emit ONE informational finding per matched signal (max 2 total to avoid noise). **Tie-break when more than 2 signals match:** take the first 2 in the table's own row order above (`state-machine` > `data-model` > `multi-actor` > `architecture`) — deterministic and reproducible across runs.

```
| {N} | Visual documentation gap: change added a {signal-description}; no matching diagram found. Consider `/claude-tweaks:visualize {type} {topic}`. | Low | Docs | {representative-file} | Suggest to user in wrap-up |
```

Like other Lens 3i findings, these are informational and don't block review — they're a documentation gap, not a code defect. The user (or Claude) can act on the recommendation in wrap-up by invoking `/claude-tweaks:visualize`.

**Skip conditions:**
- `diagram-suggestions` is `disabled` or missing → emit nothing
- Signal detection produced no matches → emit nothing (most reviews trigger zero diagram findings; this is correct)
- A matching diagram already exists → emit nothing (we're not gating on freshness for diagrams since they're hand-drawn)

### Step 3.5: Cross-Lens Debate

**Skip this entire step when the resolved `review-effort` tier (Step 2.5) is `low` or `medium`** — contested findings remain `unconfirmed`/staged without a debate round, trading resolution depth for speed at the lower tiers, matching Step 3's own narrower lens scope there. At `high` and above, run as follows:

After per-lens reproduction completes, scan for contradictions across lenses before routing. Two lenses that both flagged the same region with mismatched severity get exactly one debate round to converge or escalate to `contested`. A silent lens — one that reviewed the region but produced no finding there at all — cannot enter this mechanism: `detectCrossLensOverlap` below only pairs findings that exist in *both* lenses' arrays, so the asymmetric "one flagged, the other did not" case has no data to pair against and is never dispatched (see step 5's skip condition).

1. **Detect overlap.** Collect each lens's `confirmed` and `unconfirmed` findings into one `{lensName: [findings...]}` object, write it to a temp file, and call `detectCrossLensOverlap`:
   ```bash
   node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/coordination.js');
     console.log(JSON.stringify(c.detectCrossLensOverlap(require(process.argv[1]))))" \
     /tmp/findings-by-lens.json
   ```
   It returns pairs `{lensA, lensB, findingA, findingB}` for findings on the same `path` within ±5 lines from *different* lenses.

2. **Filter to contradictions.** Each overlap pair already has a finding from both lenses (by construction of step 1) — keep only those where the two findings' severities don't match. Pairs where the severities match (both lenses agree) produce no debate.

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

4. **Resolve.** Apply `resolveDebate`:
   ```bash
   node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/coordination.js');
     console.log(c.resolveDebate(process.argv[1], process.argv[2]))" "$VERDICT_A" "$VERDICT_B"
   ```
   - Both `agree` → finding upgraded to `confirmed`. Write `AUTO {HH:MM:SS} — Debate: cross-lens disagreement on {path}:{line} converged positive after 1 round. Reversibility: high.`
   - Both `disagree` → finding downgraded to `unconfirmed` (lands in Low-confidence subsection). Write `AUTO {HH:MM:SS} — Debate: cross-lens disagreement on {path}:{line} converged negative after 1 round. Reversibility: high.`
   - Mixed / partial → finding becomes `contested`. Write `STAGED {HH:MM:SS} — Debate: cross-lens disagreement on {path}:{line} inconclusive ({verdicts}). Both verdicts staged. Reversibility: high.` Stage the side-by-side verdicts to `staged/review-contested-{N}.md`.

5. **Skip debate** when no overlap is detected, or when only one lens covered a region. Avoid running debate on every `Path:Line` where any two lenses touched — that explodes the token budget for no value.

After Step 3.5, every finding has a final bucket — `confirmed`, `unconfirmed`, or `contested`. Only `confirmed` findings flow into Step 3 Routing. `unconfirmed` and `contested` are already staged to the Wrap-Up Console.

### Step 3 Routing — Code Review Findings

Routing logic lives entirely in `step3-routing.md` in this skill's directory: severity-based auto routing (with the contract floors), the interactive batch table, recommendation rules, the deferral gate, the parallel-fix dispatch contract (3+ independent fixes via `/superpowers:dispatching-parallel-agents`), and the auto-advance-on-zero-findings rule. `unconfirmed` and `contested` findings bypass Step 3 Routing — they route directly to the Wrap-Up Console (Low-confidence and Contested subsections, respectively).

---

## Step 4: Implementation Hindsight (Decision Point)

Skip this step entirely under `ceremony-profile: fast-lane` (see "Ceremony-Aware Step Selection"
above) — proceed directly to Step 5.

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
- **Full mode:** Invoke `/claude-tweaks:visual-review` with the target URL/journey and QA data (if available). The visual review owns UI/journey detection and the procedure. Findings feed into the summary (Step 7) as the "UI / Visual" lens with their own severity classifications.
- **Visual/journey/discover mode:** Delegate entirely to `/claude-tweaks:visual-review` — skip Steps 1-5 and 7.

**Routing (optional):** When the user wants to action a full-mode visual finding inline, route it through Step 3-ter below — Step 3 Routing has already completed by this point, so visual findings get their own branch reachable only from Step 6. When the user opts not to action a finding inline, it remains in the Step 7 summary's "Visual Review" section as informational. (`/visual-review`'s own Step 5 Boost fix/defer/accept flow does not apply here — it runs only when `/visual-review` is standalone and interactive, never when invoked BY `/review`.)

Invocation:

```
/claude-tweaks:visual-review {affected-journey-or-url}
```

`/visual-review` owns the mechanics — UI file detection, affected-journey lookup, browser prerequisite checks, dev URL resolution, the page/journey/discover procedures, and the missing-browser skip path. This skill consumes its report; it does not re-implement detection here.

## Step 6.5: Design Quality Pass (Impeccable)

Invoke `/claude-tweaks:design-wrapper review <spec>` to run Impeccable's `critique` + `audit` commands on the changed UI files. Findings are advisory in Phase 1 — they inform the verdict and surface in the review summary, but are not auto-applied.

**Skip this step entirely when:**
- Mode is `visual`, `journey`, or `discover` (these delegate entirely to `/visual-review` and skip the analytical review steps)

**Invocation:**

Pass the spec number (or paths) used for this review run. The wrapper resolves changed UI files via its own detection and runs `/impeccable:impeccable critique` + `/impeccable:impeccable audit`.

**Result handling:**

| Wrapper return | Review behavior |
|----------------|-----------------|
| `{result: "advisory", findings: [...], score_trend?: {...}}` | Include findings in the summary as a "Design Quality" section (see Step 7's template). When `score_trend` is present, the section also renders a Design/Audit Health trend line above the findings table (current score vs. the last captured score, per `review-summary-template.md`). Findings are advisory — they inform the verdict, but no auto-fixes. |
| `{skipped: ...}` | Omit the "Design Quality" section from the summary. Note the skip reason in the summary footer. |
| `{deferred: ...}` (should not happen for `review` mode) | Treat as skip and omit the section. |

See `_shared/design-wrapper-handling.md` for the canonical return-shape contract and the "why skips don't fail" rationale.

**Why findings are advisory (review-specific):** Impeccable critiques are LLM-generated and opinionated. The user judges which findings to action. The wrapper's `review` mode is read-only — code-modifying behavior lives in `polish` (invoked separately). Surfacing findings is the value-add; the user routes them to fixes, deferrals, or accepted decisions through Step 3 Routing if they choose.

**Routing (optional):** When the user wants to action design findings inline, route them through Step 6.6 below — Step 3 has already completed by this point, so design findings get their own branch reachable only from Step 6.5. When the user opts not to action them inline, they remain in the Design Quality summary section as informational.

## Category Findings Routing (shared by Step 6.6 and Step 3-ter)

Reused by Step 6.6 (Design Findings Routing) and Step 3-ter (Visual Findings Routing) below — both reachable only after Step 3 Routing has already completed, each gated on its own upstream step having produced actionable findings AND the user opting to action them inline. This shared mechanics reuses the routing rules from `step3-routing.md` (severity-based auto routing, interactive batch table, deferral gate, parallel-fix dispatch) applied to a separate findings set scoped to the caller's own category.

1. Treat each finding as a row in a batch table scoped to the category below, with severity mapped per the source and its recommended fix (if any).
2. Run the same severity-routing table from `step3-routing.md` — low → AUTO, medium → STAGED, high → STAGED, critical → KEPT-PROMPT.
3. After resolution, fold the resolved findings back into the Step 7 summary's matching section, noting each finding's final status (fixed / deferred / accepted).

Neither caller replays Step 3.5 (cross-lens debate) — each source's findings have no peers to debate against — and neither re-dispatches reproduction pairs, since each upstream source's output is already filtered/classified before it reaches this routing.

| Caller | Category | Severity source | Step 7 summary section |
|---|---|---|---|
| Step 6.6 (from Step 6.5) | `Design Quality` | Wrapper output (`info` → low, `warning` → medium, `error` → high) | "Design Quality" |
| Step 3-ter (from Step 6) | `UI / Visual` | `/visual-review`'s own report classification | "Visual Review" (alongside the narrative summary) |

## Step 6.6: Design Findings Routing

Reachable only when Step 6.5 produced `{result: "advisory", findings: [...]}` AND the user opted to action findings inline. Uses the shared Category Findings Routing above, scoped to `Design Quality`.

## Step 3-ter: Visual Findings Routing (from Step 6)

Reachable only when Step 6 ran in full mode and `/claude-tweaks:visual-review` produced actionable "UI / Visual" findings AND the user opted to action findings inline. Uses the shared Category Findings Routing above, scoped to `UI / Visual`.

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
- When a confirmed bug finding needs a fix that isn't a one-line mechanical correction, follow the reproduce-first discipline in `_shared/reproduce-first-discipline.md` before applying the change — don't guess at fixes during routing

## Next Actions

Next Actions are rendered as part of Step 7's review summary — they live in `review-summary-template.md` (the "Next Actions" block at the bottom of the template), conditioned on the verdict (PASS or BLOCKED). The template's signal-driven table determines which options surface (e.g., visual-review options appear only when journeys are affected and a browser is available).

See `review-summary-template.md` in this skill's directory for the full Next Actions tables.

## Component-Skill Contract

`/claude-tweaks:review` is invoked by `/claude-tweaks:flow` as the analytical-quality gate between test and wrap-up. Parent invocation is signaled by `$PIPELINE_RUN_DIR` being set (set by `/flow`, `/build`, or other pipeline orchestrators). Direct invocations may pass `--source <parent>` as an explicit fallback. When `$PIPELINE_RUN_DIR` is set, omit the Next Actions block at the end of Step 7's summary — the parent `/flow` owns the handoff and renders its own Pipeline Summary + Next Actions. When invoked directly by a user, render Next Actions per `review-summary-template.md`. /review itself invokes `/claude-tweaks:reflect` (Step 4), `/claude-tweaks:simplify` (Step 5), `/claude-tweaks:visual-review` (Step 6), and `/claude-tweaks:design-wrapper` (Step 6.5) — each is a component skill governed by its own contract (Next-Actions omitted when invoked from here).

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
| `/claude-tweaks:specify` | Stamps the `risk:*`/`effort:*` labels Step 2.5 reads (via `parseRecordFacets` on `work-backend: github-issues`, `local-store.js`'s facet reader on `local-files`) to auto-derive `review-effort` when no explicit argument is passed. |
| `/claude-tweaks:test` | /test is the mechanical "does it work?" gate. /review gates on `TEST_PASSED=true` — it never runs verification or QA itself. Standalone /review auto-triggers /test if no recent pass. |
| `/claude-tweaks:wrap-up` | Runs after /claude-tweaks:review passes — focuses on reflection, cleanup, and knowledge capture. Skill-routed entries from lens 3a (phase `review/skill`) and from /reflect hindsight findings tagged `[skill: …]` (phase `review/hindsight`) feed into wrap-up's skill update analysis (Step 7). `/wrap-up`'s own Step 10 safety-net gate (`verification-brief.md`) reads this skill's `### Visual Review` summary status and, when it shows only `Recommended` (no browser walk ran), triggers `/claude-tweaks:visual-review` itself using the same Step 6 mode resolution — never a separate implementation. |
| `/claude-tweaks:capture` | /claude-tweaks:review may route new ideas discovered during review through /capture, which files a fresh backlog work record |
| `/claude-tweaks:visual-review` | Invoked BY /review (Step 6) for browser-based visual inspection. In full mode, runs after code review. In visual/journey/discover modes, /review delegates entirely. |
| `/claude-tweaks:init` | Phase 8 delegates to `/visual-review discover` for brownfield journey bootstrapping. Phase 0 configures the browser backends that visual review depends on. /init creates the doc registry that lens 3i uses for documentation freshness checks. |
| `/claude-tweaks:stories` | Generates the YAML stories that /test validates. /review consumes /test results (including QA) via `TEST_PASSED`. /review also checks journey-to-story coverage in code review lens 3g-cov — uncovered journey steps and orphaned stories are surfaced as informational findings. |
| `/claude-tweaks:journey-health` | Shares `_shared/journey-coverage-check.md`'s coverage computation for its decoupled coverage-scan tier — /review's 3g-cov lens stays inline/informational; journey-health adds cursor-tracking and issue-filing on top. |
| `_shared/journey-coverage-check.md` | Canonical coverage computation lens 3g-cov applies — shared with `/claude-tweaks:journey-health`'s coverage scan. |
| `/claude-tweaks:browse` | Used by visual, journey, and discover modes for browser interaction |
| `_shared/work-record.md` (`parked`) | /claude-tweaks:review routes implementation-related deferrals to a new work record here (with origin, files, trigger). Step 1.6 also reads/writes a decomposition parent's `## Cross-Spec Promises` section for any parent-linked record under review. |
| `/claude-tweaks:flow` | Invokes /review in **full** mode by default (code + visual). Flow handles browser detection and falls back to code mode when no browser backend is available. Within either mode, Steps 1/1.6/4 additionally skip when the run's `ceremony-profile` is `fast-lane` — see "Ceremony-Aware Step Selection". |
| `/superpowers:dispatching-parallel-agents` | Used BY /claude-tweaks:review (conditional) to dispatch 3+ independent fix-now findings as parallel agents |
| `/claude-tweaks:reflect` | Invoked BY /review (Step 4) in hindsight mode. Handles the implementation hindsight evaluation, finding routing, and ledger writes with phase `review/hindsight`. |
| `/claude-tweaks:simplify` | Invoked BY /review (Step 5) on files modified during review. Handles code simplification and re-verification. |
| `/claude-tweaks:deepen` | Lens 3e (Architecture) flags shallow modules and leaky abstractions; when module-level restructuring is the theme, /review surfaces `/claude-tweaks:deepen` as a Next Action rather than resolving it inline. /deepen is the dedicated depth pass. |
| `/claude-tweaks:code-health` | `/review` judges diffs reactively; `/code-health` judges latent code proactively on a schedule. Both reuse the same criteria fragments from `skills/_shared/` — see the `_shared/criteria-review-quality.md` row below. |
| `/superpowers:systematic-debugging` | Invoked BY /review when a confirmed bug finding needs a non-trivial fix — see the reproduce-first discipline in `_shared/reproduce-first-discipline.md` (also referenced from Important Notes). |
| `/claude-tweaks:ledger` | Manages the open items ledger. /review appends findings (Step 3 Routing). Hindsight findings (Step 4) are written by /reflect using `review/*` phases. |
| `/claude-tweaks:help` | /help flags specs awaiting review and recommends `/review` in its pipeline status scan |
| `/claude-tweaks:design-wrapper` | /review invokes `/claude-tweaks:design-wrapper review <spec>` as Step 6.5 to run Impeccable's `critique` + `audit` commands. Findings are advisory, surfaced in the "Design Quality" section of the review summary. The wrapper handles its own detection and availability checks; skips are silent (section omitted). |
| `/claude-tweaks:journeys` | /journeys produces the journey files /review consults in Step 6 to recommend visual review for affected journeys and in lens 3g-cov for journey-to-story coverage. /review surfaces uncovered journey steps and orphaned stories as informational findings. |
| `/claude-tweaks:tidy` | /tidy reads /review summaries to detect cross-spec patterns (Step 5.5) — recurring finding categories, frequently flagged files, repeated gotchas — and recommends adding rules to CLAUDE.md when patterns appear in 3+ specs. /tidy also flags specs that appear complete but lack a /review run. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling. The severity-routing table in "Step 3 Routing — Code Review Findings" implements the contract's reversibility/confidence/severity floors. |
| `_shared/criteria-review-quality.md` | The shared review-quality criteria (severity scale, category enum, per-lens floors, CALIBRATION filter) — single source of truth read by both /review's Step 3 lenses and /code-health's review-quality lens. The CALIBRATION block in step3-routing.md is the byte-identical inlined-for-dispatch copy. |
| `_shared/multi-agent-coordination.md` | Canonical primitive for Reproduction (Mode 1, Step 3 per-lens dispatch) and Debate (Mode 2, Step 3.5 cross-lens contradiction resolution). The deterministic comparison + resolve helpers live in `bin/lib/coordination.js`. |
| `_shared/subagent-output-contract.md` | Per-lens reviewer agents emit Template A; debate agents inline a custom verdict template. The status line and model-tier conventions follow this contract. |
| `/claude-tweaks:visualize` | Lens 3i-diagram emits "Visual documentation gap" informational findings when the diff added structural complexity (state machine, data model, multi-actor flow, architecture) but no matching diagram file exists. Gated by `diagram-suggestions: enabled` in CLAUDE.md (written by `/init` Step 11). |
| `docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md` | Design rationale for which steps are fixed-cost wrapper (Steps 1, 1.6, 4 — skipped under `fast-lane`) vs. safety-relevant judgment (Step 3, never skipped). |
