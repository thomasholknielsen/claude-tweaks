# Review Effort Tiering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/claude-tweaks:review` a `review-effort` tier (`low`/`medium`/`high`/`xhigh`/`max` — the same vocabulary native Claude Code's `/code-review` command uses for its own effort argument) that auto-derives from a work record's `risk:*`/`effort:*` labels (or a diff-size/sensitive-path heuristic when no record exists), and gates Step 3's lens set, Step 3.5's cross-lens debate, and finding-surfacing behavior accordingly.

**Architecture:** New Step 2.5 (Derive Review Effort) resolves the tier — explicit argument, else record labels via the existing `parseRecordFacets`/`local-store.js` readers, else a deterministic diff heuristic reusing the `merge-sensitive-paths` config key. Step 3's lens dispatch and Step 3.5's debate step read that resolved tier. `step3-routing.md` gains tier-conditional surfacing of `unconfirmed`/`contested` findings. `review-summary-template.md` surfaces the resolved tier and its reasoning, and makes the existing "Independent second opinion" Next Actions option recommend a matching `/code-review {tier}` (or `/code-review ultra` at `max`).

**Tech Stack:** Markdown skill-file changes only (prose procedure) — no code changes. `parseRecordFacets` (`bin/lib/issues/record.js`), `local-store.js`'s facet reader, and the `merge-sensitive-paths` config key all already exist and are reused read-only.

## Global Constraints

- Full design doc, approved and committed: `docs/superpowers/specs/2026-07-22-review-effort-tiering-design.md` — read it before starting; every task below implements a specific section of it.
- `review-effort` is **never persisted** as a record label — it's derived fresh on every review run, unlike `risk:*`/`effort:*`/`ceremony:*`.
- Precedence, always in this order: explicit argument > record `risk:*`/`effort:*` labels > diff heuristic. An explicit argument always wins, even over a high-risk record's own labels.
- Ambiguity always resolves toward **more** scrutiny, never less: a record-label read failure falls through to the diff heuristic (not straight to `low`); a diff heuristic that can't render a clear signal defaults to `high` (this skill's pre-existing default behavior), never `low`.
- Effort is a no-op in `visual`/`journey:`/`discover` modes — those delegate entirely to `/claude-tweaks:visual-review` and skip Steps 1-7, where the lens system lives.
- `ceremony-profile: fast-lane` skips Step 1 (spec compliance). Step 2.5 must never assume Step 1 ran — its own record-label fetch (when applicable) is independent and minimal, not a reuse of a Step 1 fetch.
- No config-level default or ceiling for `review-effort` — this was considered and explicitly rejected in the design doc in favor of pure derivation. Do not add one.
- No new `assess-agent-autonomy` mode or consumer relationship — Step 2.5 reads `risk:*`/`effort:*` labels via the same low-level helpers (`parseRecordFacets`, `local-store.js`'s facet reader) `assess-agent-autonomy` itself uses, not via a skill-to-skill call.
- Reproduction pairs (Step 3's 2-agent verification dispatch) always run for every in-scope lens, at every tier — never skipped by effort. Only the lens *set* that gets a chance to flag something changes.
- Lenses 3g-cov, 3i, and 3i-diagram (main-thread/deterministic, not agent-dispatched) are never gated by effort — only their own existing data-availability conditions apply.
- Commit message style: `{Verb} {what} — {detail}` (imperative, no conventional-commit prefixes). This work has no associated GitHub record yet — do not invent a `refs #N` placeholder in commit messages.
- Working Directory Discipline applies to every commit below: confirm `pwd` and `git rev-parse --show-toplevel` resolve to your worktree before committing.
- Task order matters: Task 1 must land before Tasks 2, 4, and 5 (all reference Step 2.5's resolved tier, which Task 1 introduces). Task 3 (cross-reference bookkeeping) has no dependency on the others and could run anytime, but is sequenced last since it documents the mechanism the earlier tasks introduce.
- These are prose/skill-file changes, not code — there is no automated test cycle. Each task ends with a **self-review step**: hand-trace the design doc's worked scenarios (or the tier table) against the literal edited text, not a paraphrase of it, then fix any drift inline before committing.

---

### Task 1: Argument grammar + Step 2.5 (Derive Review Effort) in `skills/review/SKILL.md`

**Files:**
- Modify: `skills/review/SKILL.md`

**Interfaces:**
- Consumes: nothing new — `bin/lib/issues/record.js`'s `parseRecordFacets` and `bin/lib/issues/local-store.js`'s `readRecord(...).facets` both already exist. The `merge-sensitive-paths` config key already exists (read today by `assess-agent-autonomy`'s `merge-check`).
- Produces: a resolved `review-effort` tier (`low`/`medium`/`high`/`xhigh`/`max`) and its resolution source, available to every step after Step 2.5 — consumed by Task 2 (Step 3/3.5 gating), Task 4 (`step3-routing.md` surfacing), and Task 5 (summary + Next Actions).

- [ ] **Step 1: Add the orthogonality note to the Review Modes section**

Find:

```markdown
When invoked by `/claude-tweaks:flow`, review runs in **full** mode by default (code + visual). Flow handles browser detection and falls back to code mode when no browser backend is available.
```

Replace with:

```markdown
When invoked by `/claude-tweaks:flow`, review runs in **full** mode by default (code + visual). Flow handles browser detection and falls back to code mode when no browser backend is available.

**Effort** is a separate, orthogonal argument — see Input resolution below and Step 2.5. It applies only within `code`/`full` modes (where Steps 1-7's lens system runs); it's a no-op when combined with `visual`, `journey:`, or `discover`, which delegate entirely to `/claude-tweaks:visual-review` and skip Steps 1-7 outright.
```

- [ ] **Step 2: Extend the Input resolution grammar with the effort token**

Find:

```markdown
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
```

Replace with:

```markdown
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
8. **Effort token** — the literal `low`, `medium`, `high`, `xhigh`, or `max`, appearing anywhere among the other tokens above (e.g. `/claude-tweaks:review 42 high` or `/claude-tweaks:review 42 full xhigh`). Sets the `review-effort` tier explicitly (see Step 2.5), overriding derivation. Order-independent relative to the other tokens. Unambiguous against the rest of this grammar — spec numbers are numeric, `full`/`visual`/`journey:`/`discover` are fixed keywords that never collide with the five effort words.

In visual, journey, and discover modes, delegate entirely to `/claude-tweaks:visual-review` — skip Steps 1-7 (an effort token passed alongside one of these mode keywords is silently ignored, since Steps 1-7 are exactly where the lens system it gates lives).
```

- [ ] **Step 3: Insert Step 2.5 (Derive Review Effort) between Step 2 and Step 3**

Find:

```markdown
When it's unclear which case applies, default to overlapping superset (the conservative assumption) and run the supplementary check. Confirm byte-identical scope explicitly (diff the two commit ranges) before skipping re-dispatch — an unverified assumption of "same scope" is exactly how partial coverage escapes review.

## Step 3: Code Review
```

Replace with:

```markdown
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
```

- [ ] **Step 4: Self-review against the design doc**

Prose deliverable, no test cycle. Re-read `docs/superpowers/specs/2026-07-22-review-effort-tiering-design.md`'s "Deriving the tier — Step 2.5" section and hand-trace these four scenarios against the literal text just written (not a paraphrase of it):

1. A record labeled `risk:high` × `effort:high` → table lookup → `max`.
2. A spec-less single-file docs fix (Input rule 7, no record) → step 3 (diff heuristic): 1 file, ~10 lines, no sensitive paths → risk proxy low, record-effort proxy low → table lookup → `low`.
3. `/claude-tweaks:review 42 medium` on a record labeled `risk:high` × `effort:high` → explicit argument (step 1) wins → `medium`, regardless of the record's own labels.
4. A record with malformed `risk:*`/`effort:*` labels → label read fails → falls through to step 3 (diff heuristic), not straight to `low`.

Confirm each traces correctly through the written resolution order. Also confirm:
- No `TBD`/`TODO`/placeholder text anywhere in the edited sections.
- The Input resolution table's new item 8 doesn't collide with any existing numbered case.

Fix any drift found inline.

- [ ] **Step 5: Commit**

```bash
git add skills/review/SKILL.md
git commit -m "Add review-effort argument grammar and Step 2.5 derivation to /review

Resolves low/medium/high/xhigh/max — explicit argument, else a work
record's risk:*/effort:* labels via a canonical lookup table, else a
diff-size/sensitive-path heuristic reusing merge-sensitive-paths.
Never persisted as a label; derived fresh every review run.
Consumed by Step 3/3.5 gating (Task 2), step3-routing.md surfacing
(Task 4), and the summary/Next Actions (Task 5)."
```

---

### Task 2: Gate Step 3's lens dispatch and Step 3.5's debate by `review-effort` in `skills/review/SKILL.md`

**Files:**
- Modify: `skills/review/SKILL.md`

**Interfaces:**
- Consumes: Step 2.5's resolved `review-effort` tier (Task 1).
- Produces: a lens-scope table gating which of 3a-3h dispatch per tier; a debate skip below `high`; an additive reasoning-depth hint at `xhigh`/`max`.

- [ ] **Step 1: Insert the lens-scope-by-tier table after the severity floor table**

Find:

```markdown
| 3i Doc freshness | low / informational | Never blocks the review. |

> **Working Directory Discipline:** Applies to every `Task()` dispatch in Step 3 and Step 3.5 (reproductions and debate agents). Apply the Working Directory Discipline rule from `_shared/subagent-output-contract.md` before any git or path-sensitive command in the agent prompt. See also `_shared/git-discipline.md`.
```

Replace with:

```markdown
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

Reproduction pairs (the 2-agent verification dispatch below) always run for every lens that's in scope, at every tier — verification is never skipped, only the initial lens set that gets a chance to flag something.

At `xhigh` and `max`, append this sentence to each dispatched lens's prompt, after the Output Format block (do not modify the CALIBRATION block itself — it stays byte-identical across all tiers, per `step3-routing.md`'s dispatch contract): "Apply careful, thorough reasoning to this pass — consider subtle edge cases and second-order effects a faster read might miss." This is a best-effort prompt-level nudge, not a verified change to the dispatched agent's actual reasoning depth — the lens-scope table above is the load-bearing mechanism.

> **Working Directory Discipline:** Applies to every `Task()` dispatch in Step 3 and Step 3.5 (reproductions and debate agents). Apply the Working Directory Discipline rule from `_shared/subagent-output-contract.md` before any git or path-sensitive command in the agent prompt. See also `_shared/git-discipline.md`.
```

- [ ] **Step 2: Gate Step 3.5 (Cross-Lens Debate) by tier**

Find:

```markdown
### Step 3.5: Cross-Lens Debate

After per-lens reproduction completes, scan for contradictions across lenses before routing. Two lenses that both flagged the same region with mismatched severity get exactly one debate round to converge or escalate to `contested`. A silent lens — one that reviewed the region but produced no finding there at all — cannot enter this mechanism: `detectCrossLensOverlap` below only pairs findings that exist in *both* lenses' arrays, so the asymmetric "one flagged, the other did not" case has no data to pair against and is never dispatched (see step 5's skip condition).
```

Replace with:

```markdown
### Step 3.5: Cross-Lens Debate

**Skip this entire step when the resolved `review-effort` tier (Step 2.5) is `low` or `medium`** — contested findings remain `unconfirmed`/staged without a debate round, trading resolution depth for speed at the lower tiers, matching Step 3's own narrower lens scope there. At `high` and above, run as follows:

After per-lens reproduction completes, scan for contradictions across lenses before routing. Two lenses that both flagged the same region with mismatched severity get exactly one debate round to converge or escalate to `contested`. A silent lens — one that reviewed the region but produced no finding there at all — cannot enter this mechanism: `detectCrossLensOverlap` below only pairs findings that exist in *both* lenses' arrays, so the asymmetric "one flagged, the other did not" case has no data to pair against and is never dispatched (see step 5's skip condition).
```

- [ ] **Step 3: Self-review against the design doc**

Prose deliverable, no test cycle. Re-read the design doc's "Effort tier → Step 3 behavior mapping" table and hand-trace all five tiers against the literal edited text:

- `low` → only 3b/3c dispatch; debate skipped.
- `medium` → 3b/3c/3a/3f dispatch; debate skipped.
- `high` → all applicable lenses dispatch (3a-3h, per applicability and QA-data gates); debate runs.
- `xhigh` → same lens set as `high`; debate runs; reasoning-depth sentence appended.
- `max` → same lens set as `high`; debate runs; reasoning-depth sentence appended.

Confirm the CALIBRATION block referenced in Step 3's existing "Output template" blockquote is not modified by this task's reasoning-depth addition (it's additive, appended after the Output Format block, not a change to the byte-identical CALIBRATION text `step3-routing.md` owns). Confirm no `TBD`/`TODO`/placeholder text anywhere in the edited sections. Fix any drift found inline.

- [ ] **Step 4: Commit**

```bash
git add skills/review/SKILL.md
git commit -m "Gate Step 3 lens dispatch and Step 3.5 debate by review-effort tier

low: 3b/3c only. medium: +3a/3f. high (unchanged default): every
applicable lens. xhigh/max: same lens set as high, plus a soft
reasoning-depth prompt addition. Debate (3.5) skipped below high.
Reproduction pairs always run regardless of tier — only the initial
lens set narrows."
```

---

### Task 3: Cross-reference bookkeeping — `skills/review/SKILL.md`, `skills/specify/SKILL.md`, `skills/help/reference-card.md`

**Files:**
- Modify: `skills/review/SKILL.md`
- Modify: `skills/specify/SKILL.md`
- Modify: `skills/help/reference-card.md`

**Interfaces:**
- Consumes: nothing (documentation-only; no code or runtime dependency).
- Produces: bidirectional Relationship-table entries between `/claude-tweaks:review` and `/claude-tweaks:specify`, and an updated command-catalog syntax row in `help/reference-card.md`.

- [ ] **Step 1: Add a `/claude-tweaks:specify` row to `/review`'s Relationship table**

Find (in `skills/review/SKILL.md`):

```markdown
| `/claude-tweaks:build` | Produces the code and journey files that /claude-tweaks:review evaluates |
| `/claude-tweaks:test` | /test is the mechanical "does it work?" gate.
```

Replace with:

```markdown
| `/claude-tweaks:build` | Produces the code and journey files that /claude-tweaks:review evaluates |
| `/claude-tweaks:specify` | Stamps the `risk:*`/`effort:*` labels Step 2.5 reads (via `parseRecordFacets` on `work-backend: github-issues`, `local-store.js`'s facet reader on `local-files`) to auto-derive `review-effort` when no explicit argument is passed. |
| `/claude-tweaks:test` | /test is the mechanical "does it work?" gate.
```

Note: this Find block intentionally captures only the start of the existing `/claude-tweaks:test` row (its full text continues beyond this excerpt) — match on this prefix only, do not truncate the row's remaining content in the file.

- [ ] **Step 2: Add a `/claude-tweaks:review` row to `/specify`'s Relationship table**

Find (in `skills/specify/SKILL.md`):

```markdown
| `/claude-tweaks:build` | Runs AFTER /claude-tweaks:specify — takes a leaf record reference and materializes it into a build-time file (spec 20's contract) before implementing it; reads the `Surface:`/`Design-intent:` body-metadata lines `/specify` wrote, lifted into the materialized header |
| `/claude-tweaks:capture` | Files raw backlog records (`by:capture`, Type only, no scoring or stage) that `/specify`'s Resolve-the-input shapes into `ready` — case 1 for a direct record reference, case 5 for a title/keyword backlog reference |
```

Replace with:

```markdown
| `/claude-tweaks:build` | Runs AFTER /claude-tweaks:specify — takes a leaf record reference and materializes it into a build-time file (spec 20's contract) before implementing it; reads the `Surface:`/`Design-intent:` body-metadata lines `/specify` wrote, lifted into the materialized header |
| `/claude-tweaks:review` | Reads the `risk:*`/`effort:*` labels this skill stamps (Step 3, both Shaping and decomposition mode) to auto-derive its own `review-effort` tier (Step 2.5) — a read of the same labels via the same low-level helpers `assess-agent-autonomy`'s other modes already consume, not a skill-to-skill call. |
| `/claude-tweaks:capture` | Files raw backlog records (`by:capture`, Type only, no scoring or stage) that `/specify`'s Resolve-the-input shapes into `ready` — case 1 for a direct record reference, case 5 for a title/keyword backlog reference |
```

- [ ] **Step 3: Update the command-catalog syntax row in `help/reference-card.md`**

Find:

```markdown
| `/claude-tweaks:review` | Analytical quality gate: code review, UX analysis (when QA data available), visual + creative ideas (default in `/claude-tweaks:flow`). Gates on `/claude-tweaks:test`. | spec #, files + `full`/`visual`/`journey:{name}`/`discover` |
```

Replace with:

```markdown
| `/claude-tweaks:review` | Analytical quality gate: code review, UX analysis (when QA data available), visual + creative ideas (default in `/claude-tweaks:flow`). Gates on `/claude-tweaks:test`. | spec #, files + `full`/`visual`/`journey:{name}`/`discover` + `low`/`medium`/`high`/`xhigh`/`max` (effort, auto-derived if omitted) |
```

- [ ] **Step 4: Self-review — confirm bidirectionality**

Prose deliverable, no test cycle. Confirm:

- `/claude-tweaks:review`'s Relationship table now names `/claude-tweaks:specify`, and `/claude-tweaks:specify`'s Relationship table now names `/claude-tweaks:review` — per this project's cross-reference convention ("if A references B, B must reference A").
- The new rows in both files describe the *same* relationship from each side (one reads labels the other stamps), not two different claims.
- The `help/reference-card.md` syntax string matches Task 1's actual Input resolution grammar exactly (five effort words, no others).
- No `TBD`/`TODO`/placeholder text anywhere in the edited sections.

Fix any drift found inline.

- [ ] **Step 5: Commit**

```bash
git add skills/review/SKILL.md skills/specify/SKILL.md skills/help/reference-card.md
git commit -m "Add bidirectional review-effort cross-references between /review and /specify

/review's Relationship table now names /specify as the risk:*/
effort:* label producer it reads in Step 2.5; /specify's now names
/review as a consumer. help/reference-card.md's /review syntax
column documents the new effort argument."
```

---

### Task 4: Effort-gated findings surfacing in `skills/review/step3-routing.md`

**Files:**
- Modify: `skills/review/step3-routing.md`

**Interfaces:**
- Consumes: Step 2.5's resolved `review-effort` tier (Task 1); the `confirmed`/`unconfirmed`/`contested` finding buckets Step 3.5 already produces (Task 2, unchanged shape).
- Produces: `unconfirmed` findings additionally appear inline (labeled) in the Step 3 Routing table at `xhigh`; `contested` findings additionally appear inline (labeled) at `max`.

- [ ] **Step 1: Insert the effort-tier surfacing rule into the Inputs section**

Find:

```markdown
## Inputs

- Findings table merged from lenses 3a-3i, plus open QA ledger entries with phase `test/qa`.
- Pipeline run directory (when in auto/hybrid mode).
- `review-severity-floor` value from `config.yml` (default `low`).

**Every finding from lenses 3a-3i must be explicitly resolved.**
```

Replace with:

```markdown
## Inputs

- Findings table merged from lenses 3a-3i, plus open QA ledger entries with phase `test/qa`.
- Pipeline run directory (when in auto/hybrid mode).
- `review-severity-floor` value from `config.yml` (default `low`).
- The resolved `review-effort` tier from `/claude-tweaks:review`'s Step 2.5.

**Effort-tier surfacing.** By default (`review-effort` at `low`/`medium`/`high`), this table includes only `confirmed` findings — `unconfirmed` (single-source, or debate converged negative) and `contested` (debate inconclusive) findings bypass this table entirely and route straight to the Wrap-Up Review Console's Low-confidence and Contested subsections, unchanged from this skill's pre-existing behavior.

At **`xhigh`**, `unconfirmed` findings additionally appear inline in this table too — add them as ordinary rows with `(low-confidence)` appended to the Finding column, alongside the `confirmed` rows. They still also get staged to the Wrap-Up Console as before (surfacing inline doesn't remove the staging).

At **`max`**, `contested` findings additionally appear inline as well — add them as ordinary rows with `(contested — {debate verdicts})` appended to the Finding column, summarizing the side-by-side verdicts from Step 3.5's debate. They still also get staged to `staged/review-contested-{N}.md` as before.

**Every finding from lenses 3a-3i must be explicitly resolved.**
```

- [ ] **Step 2: Self-review against the design doc**

Prose deliverable, no test cycle. Re-read the design doc's "Effort tier → Step 3 behavior mapping" table's "Findings surfaced" column and hand-trace:

- `low`/`medium`/`high` → table shows `confirmed` rows only.
- `xhigh` → table shows `confirmed` rows plus `unconfirmed` rows labeled `(low-confidence)`.
- `max` → table shows `confirmed` rows plus `unconfirmed` rows plus `contested` rows labeled `(contested — {verdicts})`.

Confirm the staging behavior (Wrap-Up Console) is described as *additive*, not replaced — a finding surfacing inline still also gets staged, per the design doc's "no silent dropping" principle (`_shared/auto-mode-contract.md`). Confirm no `TBD`/`TODO`/placeholder text anywhere in the edited sections. Fix any drift found inline.

- [ ] **Step 3: Commit**

```bash
git add skills/review/step3-routing.md
git commit -m "Surface unconfirmed/contested findings inline at xhigh/max review-effort

xhigh additionally shows unconfirmed (low-confidence) findings in the
Step 3 Routing table; max additionally shows contested findings too.
Both still also stage to the Wrap-Up Console as before — surfacing
inline is additive, not a replacement for staging."
```

---

### Task 5: Summary transparency + dynamic Next Actions in `skills/review/review-summary-template.md`

**Files:**
- Modify: `skills/review/review-summary-template.md`

**Interfaces:**
- Consumes: Step 2.5's resolved `review-effort` tier and its resolution source (Task 1).
- Produces: a "Review effort" summary line; a tier-aware "Independent second opinion" Next Actions recommendation.

- [ ] **Step 1: Add the Review effort line near the top of the template**

The target file wraps its whole template body in a literal ` ```markdown ` fence (that fence is
file content, not a wrapper added for display) — the Find/Replace blocks below use a 4-backtick
outer fence so the inner literal ` ```markdown ` line doesn't prematurely close it.

Find:

````markdown
```markdown
## Review: {spec number or description}

### Spec Compliance (spec-based only)
```
````

Replace with:

````markdown
```markdown
## Review: {spec number or description}

**Review effort:** {tier} (derived from {explicit argument | record labels: risk:{x} × effort:{y} | diff heuristic: {reasoning}})

### Spec Compliance (spec-based only)
```
````

- [ ] **Step 2: Note effort-tier surfacing on the Code Review Findings table**

Find:

```markdown
> This table lists only `confirmed` findings — findings reproduced by both agents in the per-lens reproduction pair, or upgraded to `confirmed` after a cross-lens debate round (Step 3.5). Findings flagged `unconfirmed` (single-source or debate converged negative) and `contested` (debate inconclusive) are staged to the Wrap-Up Review Console — they are not silently dropped. Override or apply each in batch from the Console.
```

Replace with:

```markdown
> This table lists `confirmed` findings — findings reproduced by both agents in the per-lens reproduction pair, or upgraded to `confirmed` after a cross-lens debate round (Step 3.5). At `review-effort: xhigh`, `unconfirmed` findings (single-source, or debate converged negative) also appear here, labeled `(low-confidence)`. At `max`, `contested` findings (debate inconclusive) also appear here too, labeled `(contested — {verdicts})`. Below `xhigh`, `unconfirmed`/`contested` findings are staged to the Wrap-Up Review Console instead — they are not silently dropped either way. Override or apply each in batch from the Console.
```

- [ ] **Step 3: Make the "Independent second opinion" Next Actions option tier-aware**

Find:

```markdown
| Always | `/code-review` — Claude Code's own native review, as an independent cross-check before wrapping up |
```

Replace with:

```markdown
| Always | `/code-review {tier}` (or `/code-review ultra` when the resolved `review-effort` is `max`) — Claude Code's own native review, as an independent cross-check before wrapping up, at the same effort tier this review resolved |
```

Find:

```markdown
- Option 3 (always) — `label`: `"Independent second opinion"`, `description`: `"/code-review — Claude Code's native review as a cross-check (add 'ultra' for a heavier multi-agent cloud pass, billed separately)"`
```

Replace with:

```markdown
- Option 3 (always) — `label`: `"Independent second opinion"`, `description`: `"/code-review {tier} — Claude Code's native review as a cross-check, matching this review's resolved effort tier"` (or, when the resolved `review-effort` is `max`: `"/code-review ultra — the highest-risk changes get the deeper multi-agent cloud pass, billed separately"`)
```

- [ ] **Step 4: Self-review against the design doc**

Prose deliverable, no test cycle. Re-read the design doc's "Next Actions tie-in" and "Transparency in the summary" sections and hand-trace all five tiers:

- `low`/`medium`/`high`/`xhigh` → Next Actions recommends `/code-review {same tier}`.
- `max` → Next Actions recommends `/code-review ultra`, not `/code-review max`.

Confirm the "Review effort" summary line's three reasoning-source variants (explicit argument / record labels / diff heuristic) match Step 2.5's own recorded-reasoning format from Task 1 exactly — same bracketed vocabulary, so the summary can render it verbatim without translation. Confirm no `TBD`/`TODO`/placeholder text anywhere in the edited sections. Fix any drift found inline.

- [ ] **Step 5: Commit**

```bash
git add skills/review/review-summary-template.md
git commit -m "Surface resolved review-effort in the summary and Next Actions

Adds a 'Review effort: {tier} (derived from ...)' line near the top
of the summary. The Code Review Findings note documents xhigh/max's
additional inline surfacing. The Independent second opinion Next
Action now recommends /code-review at the matching tier, or
/code-review ultra specifically when review-effort resolved to max."
```

---

## Final Verification

- [ ] **Step 1: Grep for the five effort words across all five touched files to confirm consistent vocabulary**

```bash
grep -n "low.*medium.*high.*xhigh.*max\|xhigh\|review-effort" skills/review/SKILL.md skills/review/step3-routing.md skills/review/review-summary-template.md skills/specify/SKILL.md skills/help/reference-card.md
```

Expected: every match uses the exact five-word set (`low`/`medium`/`high`/`xhigh`/`max`) — no stray three- or four-tier variant left over from an earlier draft.

- [ ] **Step 2: Confirm no code files were touched**

```bash
git diff --stat main...HEAD
```

Expected: only the five markdown files this plan names — `skills/review/SKILL.md`, `skills/review/step3-routing.md`, `skills/review/review-summary-template.md`, `skills/specify/SKILL.md`, `skills/help/reference-card.md`. No `.js` files, per the design doc's "no code changes" constraint.

- [ ] **Step 3: Run the full repo test suite as a sanity check (no code changed, but confirms nothing else broke)**

```bash
npm test 2>&1 | tail -20
```

Expected: same pass count as before this branch started (modulo the pre-existing documented-flaky `statusline.test.js` timing test) — no new failures, since no `.js` files changed.
