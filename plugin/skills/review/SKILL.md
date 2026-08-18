---
name: review
description: Use when a build is complete and you need analytical judgment on code quality, correctness, and simplicity before wrapping up. Gates on /claude-tweaks:test passing. The quality gate between implementation and lifecycle cleanup.
argument-hint: "[<spec-number>|<file-path>...|visual <url-or-description>|journey:<name>|discover] [full] [low|medium|high|xhigh|max]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. Terminal `## Next Actions` → plain markdown: paste-ready fully-qualified commands, recommended first and bold, one per line — `AskUserQuestion` there only for a documented machine-consumed decision, named inline.


# Review — Analytical Judgment Gate

Post-build quality gate. `/claude-tweaks:test` answers "does it work?" — `/claude-tweaks:review` answers "is it good?" Reviews, refines, and approves the code before handing off to wrap-up. Part of the workflow lifecycle:

Lifecycle: `/claude-tweaks:test` → **`/claude-tweaks:review`** → `/claude-tweaks:wrap-up`

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
(`/claude-tweaks:wrap-up`'s Phase 1 ceremony escape hatch downgrades `ceremony-profile` to `standard` for the rest of
the run) — unchanged. Full rationale was in
`docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md`, deleted `70849915`.

## Review Modes

| Mode | Syntax | What runs |
|------|--------|-----------|
| **code** (default) | `/claude-tweaks:review 42` | Steps 1-7, including Step 6 (visual-review recommendation only, non-blocking) and Step 6.5 (Design Quality Pass via Impeccable): spec compliance, test gate, change analysis, code review, hindsight, simplification, visual-review recommendation, design quality pass, summary |
| **full** | `/claude-tweaks:review 42 full` | Code review (Steps 1-5) + visual browser review via `/claude-tweaks:visual-review` (Step 6) + Design Quality Pass via Impeccable (Step 6.5) + summary (Step 7) |
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
3. **File paths** — review those specific files. Mode: code. Append `full` (e.g. `/claude-tweaks:review src/foo.ts full`) to run full mode instead — code review scoped to those files, followed by a visual browser review pass (Step 6). With no spec to resolve an explicit journey/URL target, Step 6 falls back to `/claude-tweaks:visual-review discover`'s own UI-file/affected-journey detection, same as code mode's Step 6 behavior.
4. **`visual` + URL or description** (e.g., "visual http://localhost:3000") — browser review only (page mode)
5. **`journey:{name}`** (e.g., "journey:checkout") — browser review only (journey mode)
6. **`discover`** — browser review only (discover mode)
7. **No arguments** — resolve changed files per `_shared/scope-resolution.md`'s deterministic fallback ladder. Mode: code. Append `full` (e.g. `/claude-tweaks:review full`) to run full mode on this same git-diff-derived scope — code review followed by a visual browser review pass (Step 6), resolved via `/claude-tweaks:visual-review discover`'s UI-file/affected-journey detection since no spec exists to look up an explicit target.
8. **Effort token** — the literal `low`, `medium`, `high`, `xhigh`, or `max`, appearing anywhere among the other tokens above (e.g. `/claude-tweaks:review 42 high` or `/claude-tweaks:review 42 full xhigh`). Sets the `review-effort` tier explicitly (see Step 2.5), overriding derivation. Order-independent relative to the other tokens. Unambiguous against the rest of this grammar — spec numbers are numeric, `full`/`visual`/`journey:`/`discover` are fixed keywords that never collide with the five effort words. A standalone effort token with no other tokens (e.g. `/claude-tweaks:review high`) sets the tier and otherwise falls back to rule 7 — no spec number, so mode resolves via `git diff` against the base branch, same as no arguments at all.

In visual, journey, and discover modes, delegate entirely to `/claude-tweaks:visual-review` — skip Steps 1-7 (an effort token passed alongside one of these mode keywords is silently ignored, since Steps 1-7 are exactly where the lens system it gates lives).

## Step 1: Spec Compliance Check (spec-based only)

Skip this step entirely under `ceremony-profile: fast-lane` (see "Ceremony-Aware Step Selection"
above) — proceed directly to Step 1.5.

If a spec number was provided, read the spec file and verify the implementation meets it:

> **Parallel execution:** Use parallel tool calls aggressively — all Grep/Glob/Read operations searching the codebase for each deliverable's implementation and each criterion's verifiability are independent and should run concurrently.

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

### Standalone (outside `/claude-tweaks:flow`):

Check for a recent `/claude-tweaks:test` pass. A pass is "recent" if no code changes have been committed since the test run.

- **Recent pass found** → proceed to Step 2.
- **No recent pass** → auto-trigger `/claude-tweaks:test`. If QA stories exist (`stories/*.yaml`), trigger `/claude-tweaks:test all` (full suite + QA). Otherwise trigger `/claude-tweaks:test` (standard suite only).

### QA Ledger Check

After confirming `TEST_PASSED`, read the open items ledger (`docs/plans/*-ledger.md`) and filter for entries with phase `test/qa`:

- If any QA ledger entries have status `open` (failures that were not resolved), include them in the test gate report alongside the `TEST_PASSED` status. These represent QA failures that `/claude-tweaks:test` surfaced and that still need resolution.
- If all QA entries have status `observation` or `fixed`, note: "QA observations present — see findings table in Step 3 Routing."

### Gate:

| Result | Action |
|--------|--------|
| `TEST_PASSED=true` (pipeline) | Proceed to Step 2 |
| Recent `/claude-tweaks:test` pass (standalone) | Proceed to Step 2 |
| `/claude-tweaks:test` triggered and passes | Proceed to Step 2 |
| `/claude-tweaks:test` triggered and fails | **STOP** — present test failures. Fix before continuing. Run `/claude-tweaks:test` to re-verify. |

> **Why this gates review:** Mechanical correctness is a prerequisite for analytical quality judgment. Code review on broken code wastes effort.

## Step 1.6: Cross-Spec Promise Check (parent-linked records only)

**Skip entirely** under `ceremony-profile: fast-lane`, or silently when this record has no
resolvable parent or its parent has no `## Cross-Spec Promises` section — most records. This step
never blocks the review.

For the parent resolution, promise-table update flow, and forward-assumption tracking procedure,
read `cross-spec-promise-check.md` in this skill's directory.

## Step 2: Identify What Changed

### Merge-Provenance Check

Before analyzing the diff, detect whether the base branch was merged into this branch mid-history — content that arrived that way is not work this branch introduced and must not be reviewed as such. `{base}`/`{branch}` reuse whatever base-branch resolution the rest of this step already uses.

```bash
git log --merges {base}..{branch} --oneline                                      # detect
```

- **No merge commits detected** (the common case) — this check is a no-op: no further computation, no new output section. The rest of Step 2 proceeds exactly as before, against the full diff.
- **Merge commits detected** — read `merge-provenance-check.md` in this skill's directory: the own-work file-set computation, how to report the excluded files, and the own-work scope that replaces the raw `git diff` scope for Steps 3, 3.5, and 5.

Not to be confused with "Reusing a Prior Whole-Branch Review" below — that handles a *later spec's* review citing an *earlier spec's already-completed* whole-branch review in a multi-spec batch; this check handles what's *in the diff at all* for a single review, independent of whether any prior review exists.

Analyze the diff's **shape** — scoped to the own-work file set above when merge commits were detected — to understand the scope. Read `--stat` and `--name-only`, **not** the full diff:

```bash
git diff {base}...{branch} --stat        # files changed, per-file line counts, and totals
git diff {base}...{branch} --name-only   # bare path list, for path-pattern matching
```

- Which files changed and in which packages/apps
- Lines added/removed
- Whether schema, API surface, or infrastructure changed
- Whether new dependencies were introduced

**Do not read the full diff in the main thread.** Measured on a 20-commit branch: `git diff` is ~89.5 KB against ~0.9 KB for `--stat` — a ~100x difference, and 30-commit branches are routine in this repo. Everything this step classifies, and everything Step 2.5's diff heuristic consumes, comes from the two commands above.

The one exception is the dependency question, which needs manifest *content* rather than just a filename: when `--name-only` shows a dependency manifest (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, or equivalent), read a **targeted** diff of just that file (`git diff {base}...{branch} -- package.json`). That is bounded by construction — it is not a licence to widen back to the full diff.

Full diff *content* belongs to Step 3's dispatched lens agents, which have their own context windows. See Step 3's dispatch note. It lives in `step3-lens-dispatch.md`.

If infrastructure or deployment changes are detected (Terraform, CDK, Docker, CI/CD, database migrations, new environment variables) that aren't already in the ledger as `ops` items, append them with phase `ops` and status `open`. This catches ops requirements introduced during review fixes that weren't present in the original build.

This classification guides which review lenses to apply — a pure UI change doesn't need a database review.

### Reusing a Prior Whole-Branch Review

In a multi-spec batch (`/claude-tweaks:flow 42,45,48`, or any run where several specs share one worktree/branch), a later spec's review may be tempted to cite an earlier spec's already-completed whole-branch review instead of re-dispatching. Only reuse it when the scope is **byte-identical**: the exact same commit range this review would otherwise cover, with zero delta — nothing has landed on the branch since the cited review's `HEAD`.

If the current diff is instead an **overlapping superset** — the branch has moved forward since the cited review ran (new commits from this spec or another), even a small amount — the cited review does not cover that delta. Do not treat "we reviewed the branch already" as covering commits that landed after its `HEAD`. Instead: cite the prior review for the range it actually covered, and run a supplementary review scoped to just the delta (`git diff <cited-review-HEAD>..<current-HEAD>`) — not a fresh full whole-branch review.

When it's unclear which case applies, default to overlapping superset (the conservative assumption) and run the supplementary check. Confirm byte-identical scope explicitly (diff the two commit ranges) before skipping re-dispatch — an unverified assumption of "same scope" is exactly how partial coverage escapes review.

## Step 2.5: Derive Review Effort

Resolve a `review-effort` tier — one of `low` / `medium` / `high` / `xhigh` / `max` — before dispatching Step 3's lenses. This tier gates which lenses run (Step 3), whether cross-lens debate and the per-candidate refutation pass run (Step 3.5), whether the gap-sweep pass runs (Step 3.6), and how findings surface (`step3-routing.md`). It is never persisted back to the work record — it's derived fresh on every review run, unlike `risk:*`/`size:*`/`ceremony:*`.

Resolution order — read `review-effort-derivation.md` in this skill's directory for the procedure: the explicit-argument rule, the record `risk:*`/`size:*` label read (per-backend commands plus the risk × record-size combination table), the diff heuristic fallback, and the `review-effort-floor` project floor. Skip that read when `$ARGUMENTS` carried an effort token — an explicit token always wins, so the tier is already resolved.

**Ambiguity never resolves toward less scrutiny.** If reading record labels fails, fall through to the diff heuristic rather than defaulting to `low`. If the diff heuristic itself can't render a clear signal, default to `high` — the tier that reproduces this skill's pre-existing default behavior — never `low`.

Record the resolved tier and which resolution step produced it, for Step 7's summary: `{explicit argument | record labels: risk:{x} × size:{y} | diff heuristic: {reasoning}}`, plus `floor applied: {value}` when step 4's `review-effort-floor` raised the tier.

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
| 3h UX (when QA data) | high | Capable profile — judgment-heavy synthesis. |
| 3i Doc freshness | low / informational | Never blocks the review. |

**3a skill-routed entries.** Lens 3a records a `review/skill` ledger entry rather than choosing a destination; `/claude-tweaks:wrap-up`'s Skills curation row classifies it via `skills/_shared/learning-routing.md`, where a finding about a claude-tweaks skill resolves to D5 (upstream) rather than a project skill update. Do not inline this note into the 3a agent prompt — that agent's job is to record, not to route.

**Lens scope, the dispatch contract, and the 3a-3f lens definitions live in `step3-lens-dispatch.md`** in this skill's directory — read it before dispatching. It holds: which lenses each `review-effort` tier puts in scope (fewer at `low` and `medium`, every applicable lens at `high` and above) and the `xhigh`/`max` reasoning nudge; the Working Directory Discipline rule for every `Task()` dispatch in Steps 3, 3.5, and 3.6; the on-disk shared context bundle that keeps full diff content out of this thread; the reproduction-pair dispatch and its `categoriseReproduction` call; per-lens model profiles; and the question list each of lenses 3a-3f reviews against. The canonical agent prompt it tells you to inline (Calibration block + OUTPUT FORMAT) lives in `step3-routing.md`.

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

Read `step3-doc-freshness-lens.md` in this skill's directory for the procedure: the `docs/REGISTRY.md` Auto-detect match and its informational finding row, plus sub-lens **3i-diagram** (structural-complexity signal table, co-located-diagram check, deterministic tie-break, and its own finding row). Skip `3i-diagram` additionally when CLAUDE.md's `diagram-suggestions` flag is `disabled` or missing.

### Step 3.5 & 3.6: Cross-Lens Debate, Per-Candidate Refutation, and Gap-Sweep

Three effort-gated findings-quality mechanisms run after Step 3's per-lens reproduction completes: Cross-Lens Debate (resolves contradictions between different lenses reviewing the same region), the Per-Candidate Refutation Pass (re-examines `confirmed` findings at or above a `medium` severity floor, capped at 10 per review, for correlated error reproduction-pair agreement alone can't catch), and Gap-Sweep / Completeness Critic (a single fresh-eyes agent asking what every angle-scoped lens, collectively, missed).

**Skip all three entirely when the resolved `review-effort` tier (Step 2.5) is `low` or `medium`** — proceed directly to Step 3 Routing below, matching Step 3's own narrower lens scope at those tiers.

**At `high` and above**, Cross-Lens Debate runs. **At `xhigh` and `max` only**, the Per-Candidate Refutation Pass and Gap-Sweep additionally run (one tier stricter, so `high`-tier reviews aren't paying for all three mechanisms at once). Read `step3-debate-and-refutation.md` in this skill's directory for the full procedure — dispatch templates, `detectCrossLensOverlap`/`resolveDebate`/`resolveRefutation` invocations, and decision-log formats — lazy-loaded only when the resolved tier is `high` or above, following the same lazy-load pattern as `step3-routing.md`.

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

Run `/claude-tweaks:simplify` on the same own-work file scope Steps 2-4 use — the Merge-Provenance Check's own-work file list (Step 2) when merge commits were detected, otherwise the full `git diff --name-only` file set. Do not hand `/claude-tweaks:simplify` the raw diff unfiltered when merge commits were found: `/claude-tweaks:simplify` has no merge-provenance handling of its own, so it fully trusts whatever scope this step passes it — passing the raw diff would let it edit code this branch never actually introduced, the exact outcome the Merge-Provenance Check exists to prevent.

The simplify skill handles scope resolution, running the code-simplifier subagent, and re-verification after changes. See `/claude-tweaks:simplify` for details.

---

## Step 6: Visual Review

**When this step runs:**
- **Code mode:** Delegate to `/claude-tweaks:visual-review --mode=recommendation` — it detects UI changes via `git diff` and identifies affected journeys, returning a structured recommendation without opening a browser (no `agent-browser` dependency). Do not stop to ask; note any recommendation in the summary (Step 7). This is `recommendation` mode, not `discover` mode — `discover` actually opens a browser and walks the app, which would contradict this step's "recommendation only, non-blocking" design.
- **Full mode:** Invoke `/claude-tweaks:visual-review` with the target URL/journey and QA data (if available). The visual review owns UI/journey detection and the procedure. Findings feed into the summary (Step 7) as the "UI / Visual" lens with their own severity classifications.
- **Visual/journey/discover mode:** Delegate entirely to `/claude-tweaks:visual-review` — skip Steps 1-5 and 7.

**Routing (optional):** When the user wants to action a full-mode visual finding inline, route it through Step 3-ter below — Step 3 Routing has already completed by this point, so visual findings get their own branch reachable only from Step 6. When the user opts not to action a finding inline, it remains in the Step 7 summary's "Visual Review" section as informational. (`/claude-tweaks:visual-review`'s own Step 5 Boost fix/defer/accept flow does not apply here — it runs only when `/claude-tweaks:visual-review` is standalone and interactive, never when invoked BY `/claude-tweaks:review`.)

Invocation:

```
/claude-tweaks:visual-review {affected-journey-or-url}
```

`/claude-tweaks:visual-review` owns the mechanics — UI file detection, affected-journey lookup, browser prerequisite checks, dev URL resolution, the page/journey/discover procedures, and the missing-browser skip path. This skill consumes its report; it does not re-implement detection here.

## Step 6.5: Design Quality Pass (Impeccable)

Invoke `/claude-tweaks:design-wrapper review <spec>` to run Impeccable's `critique` + `audit` commands on the changed UI files — and, when the built artifact carries a direction contract, to dispatch Impeccable's own `impeccable-finish-reviewer` agent against it (the wrapper's Step 3.7; its findings arrive in the same `findings` list under `source: "finish-review"`). Findings are advisory in Phase 1 — they inform the verdict and surface in the review summary, but are not auto-applied.

**Skip this step entirely when:**
- Mode is `visual`, `journey`, or `discover` (these delegate entirely to `/claude-tweaks:visual-review` and skip the analytical review steps)

**Invocation:**

Pass the spec number (or paths) used for this review run. The wrapper resolves changed UI files via its own detection and runs `/impeccable:impeccable critique` + `/impeccable:impeccable audit`.

**Result handling:**

| Wrapper return | Review behavior |
|----------------|-----------------|
| `{result: "advisory", findings: [...], score_trend?: {...}}` | Include findings in the summary as a "Design Quality" section (see Step 7's template). When `score_trend` is present, the section also renders a Design/Audit Health trend line above the findings table (current score vs. the last captured score, per `review-summary-template.md`). Findings are advisory — they inform the verdict, but no auto-fixes. A `decisions_staged` field (present when the wrapper staged `target: "decisions"` findings to `{run-dir}/staged/design-decision-*.md`) means those findings await the Review Console — render them under the section's **Decisions** sub-heading only when the field is absent (nothing was staged — standalone review, or no `decisions` findings this run). |
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

Present a structured summary covering spec compliance, test results (from `/claude-tweaks:test`), code review findings, browser review (if run), implementation hindsight, tradeoffs, simplification, and a verdict (PASS or BLOCKED). The summary must include an Actions Performed table (when autonomous fixes were applied) and a Next Actions block (always). For the complete template and context-signal rules, read `review-summary-template.md` in this skill's directory.

**Verdict comment (`run-state.json` carries a `pr` object — `_shared/pr-run-comments.md`):** once
the verdict is final (PASS or BLOCKED), compose a comment — `<!-- run-comment: verdict -->` as
its first line, then the verdict, then the top findings by severity (max 5), reusing
`review-summary-template.md`'s own `Category | Finding | Severity | Action` findings-table shape
— and post-or-update it on the PR per that file's canonical procedure. A no-op when the `pr`
object is absent (`local-merge`, or a degraded `pr-first` run).

### Key Learnings for Wrap-Up

At the end of the summary, include a `### Key Learnings` section with 1-3 insights that emerged during this review — patterns discovered, conventions confirmed or challenged, techniques worth remembering. These feed directly into `/claude-tweaks:wrap-up`'s Phase 1 reflect pass so wrap-up doesn't have to re-derive them from scratch.

```
### Key Learnings
1. {insight} — {why it matters for future work}
2. {insight} — {why it matters}
```

If no notable learnings emerged, state: "No key learnings — straightforward review."

**Phase exit (`worktree` mode, `integration-model: pr-first` — `_shared/integration-model.md`):** push the branch and flip this phase's PR checklist row — `_shared/git-discipline.md`'s Phase-exit push section and `_shared/pr-early-run-lifecycle.md`'s Phase-checklist update section. A no-op under `local-merge` or `current-branch` mode.

## Important Notes

- Spec compliance is the first gate — incomplete specs go back to `/claude-tweaks:build`, not through code review
- Test passing is a hard gate — broken code blocks the entire review. Run `/claude-tweaks:test` to verify.
- Implementation Hindsight is an action gate — "change now" items must be fixed before passing
- Code simplification runs on changed files only — never expand scope to unrelated code
- Skip review lenses that don't apply to the type of change
- This skill reviews the *current work* — it is not a codebase-wide audit
- When a confirmed bug finding needs a fix that isn't a one-line mechanical correction, follow the reproduce-first discipline in `_shared/reproduce-first-discipline.md` before applying the change — don't guess at fixes during routing; once the fix is confirmed, walk the causal-depth chain per the discipline's step 3.

## Next Actions

Next Actions are rendered as part of Step 7's review summary — they live in `review-summary-template.md` (the "Next Actions" block at the bottom of the template), conditioned on the verdict (PASS or BLOCKED). The template's signal-driven table determines which options surface (e.g., visual-review options appear only when journeys are affected and a browser is available).

See `review-summary-template.md` in this skill's directory for the full Next Actions tables.

## Component-Skill Contract

`/claude-tweaks:review` is invoked by `/claude-tweaks:flow` as the analytical-quality gate between test and wrap-up. Parent invocation is signaled by `$PIPELINE_RUN_DIR` being set (set by `/flow`, `/build`, or other pipeline orchestrators). Direct invocations may pass `--source <parent>` as an explicit fallback. When `$PIPELINE_RUN_DIR` is set, omit the Next Actions block at the end of Step 7's summary — the parent `/flow` owns the handoff and renders its own Pipeline Summary + Next Actions. When invoked directly by a user, render Next Actions per `review-summary-template.md`. /review itself invokes `/claude-tweaks:reflect` (Step 4), `/claude-tweaks:simplify` (Step 5), `/claude-tweaks:visual-review` (Step 6), and `/claude-tweaks:design-wrapper` (Step 6.5) — each is a component skill governed by its own contract (Next-Actions omitted when invoked from here).

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Reviewing incomplete specs | Wastes effort — Step 1's spec compliance check catches it, but don't skip it |
| Skipping the test gate to "save time" | Broken code invalidates the review — `/test` must pass first |
| Reviewing unrelated code | Scope creep — only review files changed in the current work |
| Accepting all Implementation Hindsight findings as-is | The action gate exists — "change now" items must be fixed |
| Running review without a prior build | Review assumes recently written code — not a codebase-wide audit |
| Listing code review findings without routing them | Every finding resolves explicitly: fix now, defer with context, or don't fix with stated reason. No implicit drops. |
| Putting findings only in the summary table | The summary records resolutions, not observations. Route first (Step 3 Routing), then summarize (Step 7). |
| Running verification or QA directly in review | Mechanical checks belong in `/claude-tweaks:test` — review gates on it passing, never duplicates it |
| Treating Design Quality findings as authoritative | LLM critiques are opinionated — advisory only; the user judges which to action. Phase 1's design wrapper is read-only. |
| Auto-fixing Design Quality findings in Step 6.5 | Phase 1's design wrapper is read-only; code-modifying behavior ships in Phase 2's polish phase. Route findings through Step 3 Routing to action them. |
