# Harness-Health Skill-Library Shape Analysis (record #55) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new periodic pass to standalone `/claude-tweaks:harness-health` that compares skills against each other (too-shallow / overlapping / bloated) rather than against the codebase — the first cross-skill-comparison check in the harness-health pipeline.

**Architecture:** A new lazy-loaded sub-file (`skills/harness-health/library-shape-analysis.md`) holds the full procedure (SELECT due-ness check, description-similarity pre-filter, the 3 dimension judgments, fingerprint canonicalization), following this project's established "keep SKILL.md lean, push detailed reference content into sub-files" convention (CLAUDE.md's Skills-with-sub-files table). `skills/harness-health/SKILL.md` gets a short pointer + Step 1 integration note — no rewrite of the existing per-target rotation. `skills/_shared/harness-health-analysis.md` Dimension 8 gets a one-line cross-reference. **No `bin/lib/*` code is touched** — the new pass reuses the existing generic `${kind}:${target}` cursor mechanism in `bin/lib/harness-health/cache.js`'s `recordAudit` (confirmed by reading the source: the cursor key is a free-form string, `cursors[\`${kind}:${target}\`]`, with no enum validation at the cache or CLI-arg layer — only the *finding-level* `assetType`/`kind` fields are enum-validated in `validate-finding.js`, and this pass's findings all use the existing valid values `assetType: "skill"`, `kind: "patch"`), so a pseudo-target `kind: library-shape, target: library-shape` can track its own due-ness cursor through the existing `validate-findings --target library-shape --kind library-shape` call with zero code changes.

**Tech Stack:** Markdown skill files only. Verification is `npm test` (confirms the untouched `bin/lib/*` suite still passes) plus manual grep-based consistency checks.

## Global Constraints

- No `bin/lib/*` code may be touched (record #55's own acceptance criterion — confirmed feasible, see Architecture above).
- Findings from the new pass must validate against the EXISTING enums in `bin/lib/harness-health/validate-finding.js`: `assetType` must be one of `skill|rule|claude-md|design-artifact|memory` (use `"skill"` — every dimension here judges skill files), `kind` must be `patch|new-skill` (use `"patch"` — all three dimensions propose an edit to an existing skill file, never a wholly new file). Do not invent new enum values.
- Dimension 1 ("too shallow")'s anchor must explicitly cite leverage/coverage-equivalence and cross-reference `skills/_shared/criteria-architecture-depth.md`'s `## Depth = leverage, not line ratio` section (the actual anchor file — `skills/deepen/depth-analysis.md` itself just points to this shared fragment, it doesn't contain the model). Line count is supporting color only, never the deciding signal.
- Dimension 2 ("overlapping") must check both skills' own Relationship-to-Other-Skills tables before flagging — a documented complementary/distinct relationship is evidence AGAINST overlap.
- Dimension 3 ("bloated") is single-skill, not pairwise — document this explicitly so it's not mistaken for needing a comparison partner like dimensions 1-2.
- Two-skill findings (dimensions 1's collapse-into-X outcome, and dimension 2) use a sorted-pair `target` value (e.g. `docs-health+journey-health`) for fingerprint dedup; dimension 3 (bloated) keeps the single-skill `target` convention.
- Report-only — this pass never auto-applies a merge/split/simplify, even for a high-confidence finding. Structural changes to skill files are `restructural` classification, gated on human review like every other harness-health finding.
- `assetType: "skill"` for dimension-1/2/3's "full skill file" reads means SKILL.md only, NOT its lazy-loaded sub-files (a real, previously-undecided question this leaf's own red-team pass raised) — document this choice explicitly, and note the limitation (a skill with real depth in a sub-file could be misjudged as shallow from SKILL.md alone) so a future reader isn't misled into thinking it's already handled.

---

### Task 1: Create the library-shape-analysis.md sub-file (SELECT + JUDGE procedure)

**Files:**
- Create: `skills/harness-health/library-shape-analysis.md`

**Interfaces:**
- Consumes: nothing from other tasks — self-contained procedure file.
- Produces: the sub-file Task 2 points to from `SKILL.md`'s Workflow section, and the Finding Shape output (`assetType: "skill"`, `kind: "patch"`, `category: "best-practice"`) that flows into the existing Step 6 (`validate-findings`) / Step 7 (FILE) pipeline in `SKILL.md`, unmodified by this plan.

- [ ] **Step 1: Read the current file structure for grounding**

  Confirm the exact current section headers in `skills/harness-health/SKILL.md` (`## Workflow`, the `**Step 1 — SELECT`/`**Step 3 — JUDGE`/`**Step 6 — VALIDATE`/`**Step 7 — FILE` sub-headers) and `skills/_shared/harness-health-analysis.md`'s Finding Shape section, by reading both files fresh — do not rely on this plan's paraphrase for exact wording when composing cross-references in Step 2 below.

- [ ] **Step 2: Write `skills/harness-health/library-shape-analysis.md`**

  Create the file with this exact content:

  ```markdown
  # Skill-Library Shape Analysis

  A periodic pass in `/claude-tweaks:harness-health`'s existing SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline — comparing skills *against each other*, not against the codebase. Every other check in `_shared/harness-health-analysis.md` is one-skill-at-a-time; this is the first cross-skill-comparison check. Loaded by `SKILL.md`'s Step 1 (SELECT) when this pass's own due-ness cursor is due — see "Due-ness and SELECT" below.

  ## Due-ness and SELECT

  This pass is its own rotation slot with a fixed pseudo-target — `kind: library-shape`, `target: library-shape` — on a 90-day interval (the same "stale" window the standard per-target rotation already uses), not tied to any single skill's own staleness/churn cursor, since this dimension has no single natural target.

  Before Step 1's `next-target` call (which only knows about real skill/rule/claude-md/design-artifact/memory files and never returns this pseudo-target on its own), check whether this pass is due:

  ```bash
  node -e "
    const {readCache} = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/harness-health/cache.js');
    const c = readCache('.claude-tweaks/harness-health/cache.json');
    const cur = c.cursors && c.cursors['library-shape:library-shape'];
    const days = cur ? (Date.now() - cur.lastAuditedMs) / 86400000 : Infinity;
    console.log(JSON.stringify({due: days >= 90, daysSinceLastAudit: cur ? Math.floor(days) : null}));
  "
  ```

  (If `readCache` isn't exported under that exact name, read `bin/lib/harness-health/cache.js` to confirm the actual export and adjust the one-liner — the cache file's own shape, `{cursors: {"${kind}:${target}": {lastAuditedMs, ...}}}`, is what matters, not the exact helper name.)

  If due (or never audited — `cur` is absent), run this pass this firing, in addition to (not instead of) whatever `next-target` returned for the standard rotation. If not due, skip this pass entirely this firing.

  ## Candidate narrowing (required — never scan all pairs)

  With 30+ skills in this project, exhaustive pairwise comparison is infeasible per firing. Pre-filter before committing to a full read:

  1. **Cheap pass:** read every skill's frontmatter `description` (the "When to Use" trigger text) — descriptions only, not full bodies. This is the same data `SKILL.md` files already expose in their frontmatter; no new extraction code needed, a `grep -A2 "^description:" .claude/skills/*/SKILL.md`-style scan suffices.
  2. **Similarity scoring:** compute keyword overlap between each pair of descriptions (shared significant words, ignoring stopwords — a simple Jaccard-style overlap on the description text is sufficient; this is a judgment aid, not a precision metric).
  3. **Threshold:** only fully read (both SKILL.md files, dimension-1/2 candidates) the pair(s) whose similarity clears a visibly-high bar — in practice, pairs sharing 3+ significant domain-specific keywords (not generic words like "use", "when", "project"). Judge this threshold qualitatively each run rather than hardcoding an exact numeric cutoff — the goal is narrowing 30+ skills down to a small handful of plausible candidates, not a precise ranking.
  4. For dimension 3 (bloated, single-skill), no pairwise pre-filter applies — instead read the same skills the standard per-target rotation already selected as due this firing (its `next-target` result), applying dimension 3 alongside the standard 8-dimension check on whichever target(s) that call returned. Dimension 3 does not need its own separate target selection.

  ## Dimension 1: Too shallow (leverage judgment, not line count)

  **Anchor:** does the skill's actual guidance amount to *less* than what a well-scoped section in an existing sibling skill would need to say to cover the same trigger conditions? This mirrors `_shared/criteria-architecture-depth.md`'s `## Depth = leverage, not line ratio` model exactly — depth is measured by leverage (how much complexity the module/skill absorbs on behalf of its callers/readers), never by a line-count ratio. Line count may be cited as supporting color in a finding's evidence, never as the deciding signal.

  For each candidate pair that cleared the pre-filter above: read both skills' full SKILL.md files (not their lazy-loaded sub-files — see the "Sub-file scope" note below). If skill A's actual guidance is thin enough that folding it into skill B (as a new section) would lose nothing a reader needs, propose `kind: "patch"` against skill B adding A's content as a section, with a companion note that skill A's own file becomes a redirect/removal candidate for human review (never auto-delete — filing proposes, humans decide).

  **Sub-file scope (explicit, resolved):** "full skill file" for this dimension means **SKILL.md only**, not its lazy-loaded sub-files. This project's own convention (CLAUDE.md's "Skills with sub-files" table) deliberately keeps some SKILL.md files lean by pushing real depth into sub-files — a dimension-1 verdict based on SKILL.md alone could therefore misjudge a skill whose actual depth lives in a sub-file as shallower than it really is. This is a known, documented limitation of this pass, not a solved problem — a future tightening could read relevant sub-files too, but that's out of scope here. Do not silently treat "SKILL.md alone" as equivalent to "the skill's full documented depth."

  ## Dimension 2: Overlapping (merge candidate)

  Two skills whose domains (frontmatter `description` / "When to Use") have drifted into covering genuinely the same territory. Before flagging: read both skills' own Relationship-to-Other-Skills tables. If either table already documents the other skill as a complementary/distinct relationship (a row explaining how they differ or hand off), that is evidence AGAINST overlap — do not flag, even if the description-similarity pre-filter scored them high. Only flag when the overlap is genuine (both skills would plausibly fire on the same trigger, and neither's own documentation explains why that's intentional).

  ## Dimension 3: Bloated (single-skill, not pairwise)

  Unlike dimensions 1-2, this is a **single-skill** judgment — it never needs a comparison partner. Apply to whichever skill(s) the standard per-target rotation selected this firing (see "Candidate narrowing" step 4 above). Two input signals:

  1. **Narrative-density heuristic** — reuse `_shared/harness-health-analysis.md` Step 1 check 7 (words-per-bullet-line) as-is; a high ratio is evidence, not a verdict.
  2. **Same-file redundancy check** — does the skill state the same guidance more than once in different words? Does it have sections that could merge without losing distinct content? Look for this directly by reading the file, not via a mechanical grep signature (redundancy-in-prose has no single reliable pattern).

  Propose `kind: "patch"` trimming the redundant content, citing both signals in the finding's evidence.

  ## Fingerprint canonicalization (two-skill findings)

  For a dimension-1 (collapse-into-X) or dimension-2 (overlapping) finding naming two skills: canonicalize the `target` field by sorting both skill names alphabetically and joining with `+` — e.g. `docs-health+journey-health`, not `journey-health+docs-health` and not whichever skill the check happened to start from. This ensures the same pair is never independently fingerprinted twice regardless of which skill triggered the comparison. Dimension 3 (bloated) keeps the existing single-skill `target` convention (its own skill name) — it never names two skills.

  ## Emitting findings

  Every finding from this pass uses the EXISTING Finding Shape (`_shared/harness-health-analysis.md`) unchanged:
  - `assetType: "skill"` (always — every dimension here judges skill files)
  - `kind: "patch"` (always — every dimension proposes an edit to an existing file, never a new one)
  - `category: "best-practice"` (matches `_shared/harness-health-analysis.md` Dimension 8's existing "no cross-skill overlap, right-sized scope" framing — this pass is that dimension's concrete mechanical backing)
  - `target`: sorted-pair (dimensions 1-2) or single skill name (dimension 3), per the canonicalization rule above
  - `section`/`oldString`/`newString`: as usual for a `patch` finding — exact, unique, verbatim quotes from the target file(s)

  These validate against the existing `bin/lib/harness-health/validate-finding.js` enums with no code changes (`assetType: "skill"` and `kind: "patch"` are both already-valid values). Feed findings into `SKILL.md`'s existing Step 6 (`validate-findings --target library-shape --kind library-shape`, using the pseudo-target from "Due-ness and SELECT" above so this pass's own cursor gets recorded) and Step 7 (FILE) exactly as any other target's findings would — no new filing logic needed.

  ## Anti-patterns

  | Pattern | Why it fails |
  |---|---|
  | Scanning all pairs across 30+ skills every firing | Infeasible cost — always pre-filter by description similarity first |
  | Flagging two skills as overlapping without checking their Relationship tables | A documented complementary relationship (e.g. `/deepen` vs `/simplify`) is evidence against overlap, not for it |
  | Using line count as the deciding signal for "too shallow" | Contradicts this project's own `/claude-tweaks:deepen` model — leverage, not line ratio |
  | Auto-applying a merge/split/simplify | This pass is report-only, like every other harness-health finding — structural changes are `restructural`, human-gated |
  | Treating dimension 3 as needing a comparison partner | It's explicitly single-skill — don't pair it with an unrelated skill just to "match" dimensions 1-2's shape |
  ```

- [ ] **Step 3: Verify and commit**

  ```bash
  wc -l skills/harness-health/library-shape-analysis.md
  npm test
  git add skills/harness-health/library-shape-analysis.md
  git commit -m "Add skill-library shape analysis sub-file (too-shallow/overlapping/bloated)

refs #55"
  ```

  Expected: `npm test` passes (new markdown file only, no `bin/lib/*` touched).

---

### Task 2: Wire the new pass into SKILL.md's Workflow + add the Dimension 8 pointer

**Files:**
- Modify: `skills/harness-health/SKILL.md` (`## Workflow` section, Step 1 — SELECT)
- Modify: `skills/_shared/harness-health-analysis.md` (Dimension 8 row in the 8-Dimension Check table)

**Interfaces:**
- Consumes: Task 1's `library-shape-analysis.md` file (referenced by path, not content — the pointer just names the file).
- Produces: nothing further downstream.

- [ ] **Step 1: Read the current text of both target locations**

  Re-read `skills/harness-health/SKILL.md`'s `**Step 1 — SELECT` paragraph (the `next-target` bash block and the "Read the `why` field" list) and `skills/_shared/harness-health-analysis.md`'s Dimension 8 row (`| **8. Best-practice/harness-performance fit** (new) | ... |`) fresh — do not trust this plan's paraphrase for the exact `old_string` quote; re-locate both by content.

- [ ] **Step 2: Add a pointer paragraph to `SKILL.md`'s Step 1 — SELECT**

  Immediately after the existing paragraph that begins "If there is no target to deep-audit this firing (`target` is `null`, or `targets` is empty) but `gapScanDue` is `true`, skip straight to Step 4..." (the last paragraph of Step 1 before "**Step 2 — READ the target.**"), insert a new paragraph:

  ```markdown
  **Skill-library shape pass (separate from the target/gap-scan due-ness above).** Read `library-shape-analysis.md` in this skill's directory for a periodic pass comparing skills *against each other* (too-shallow / overlapping / bloated) on its own 90-day cursor — check its own due-ness (per that file's "Due-ness and SELECT" section) independently of whatever `next-target` returned above, and run it in addition to the standard target/gap-scan work this firing when due.
  ```

  Use `Edit` with an exact, unique `old_string` ending at "...skip straight to Step 4 (gap detection) — the gap scan is still due even with nothing else to audit." and `new_string` appending the new paragraph after it, before the blank line and `**Step 2 — READ the target.**` heading.

- [ ] **Step 3: Add the Dimension 8 cross-reference in `harness-health-analysis.md`**

  Find Dimension 8's row in the 8-Dimension Check table:

  ```
  | **8. Best-practice/harness-performance fit** (new) | Does it follow known practices for getting an LLM harness to perform well (clear triggers, no cross-skill overlap, right-sized scope, concision)? | ✓ (`superpowers:writing-skills`) | ✓ (`skills/init/rules-template.md`'s own "path-specific only; project-wide belongs in CLAUDE.md" guidance — a suspiciously broad glob should be a CLAUDE.md convention instead) | ✓ (`skills/init/claude-md-template.md`'s Principles, same source as dimension 7 for this kind) |
  ```

  Replace the Skill column's cell (`✓ (\`superpowers:writing-skills\`)`) with `✓ (\`superpowers:writing-skills\`; the mechanical cross-skill-overlap/right-sized-scope check now lives in \`skills/harness-health/library-shape-analysis.md\`'s periodic pass, not this dimension directly)` — keep the Rule and CLAUDE.md columns unchanged (this pass is skill-only).

- [ ] **Step 4: Verify and commit**

  ```bash
  grep -n "library-shape-analysis" skills/harness-health/SKILL.md skills/_shared/harness-health-analysis.md
  npm test
  git add skills/harness-health/SKILL.md skills/_shared/harness-health-analysis.md
  git commit -m "Wire skill-library shape analysis into harness-health's SELECT + Dimension 8

refs #55"
  ```

  Expected: `grep` finds a match in both files; `npm test` passes.

---

### Task 3: Acceptance-criteria sweep + final verification

**Files:**
- Read-only check: `skills/harness-health/library-shape-analysis.md`, `skills/harness-health/SKILL.md`, `skills/_shared/harness-health-analysis.md`

**Interfaces:**
- Consumes: Tasks 1-2's combined output.
- Produces: nothing further — final verification task.

- [ ] **Step 1: Full acceptance-criteria pass**

  Re-read record #55's Acceptance Criteria section (materialized at `.claude-tweaks/pipelines/2026-07-25T065327-spec-54-55-56-57-58/spec-55/work/55-spec.md`) and confirm each checkbox against the actual edited/created files:
  - [ ] `skills/harness-health/SKILL.md` documents the new pass with its own SELECT logic (not a bare "reads 2+ full skill files") — via the pointer to `library-shape-analysis.md`'s due-ness/pre-filter procedure.
  - [ ] Dimension 1's anchor cites leverage/coverage-equivalence, cross-references `_shared/criteria-architecture-depth.md`'s `## Depth = leverage, not line ratio`.
  - [ ] Dimension 2's check includes the Relationship-table cross-check before flagging.
  - [ ] Dimension 3 is documented as single-skill, not pairwise.
  - [ ] Two-skill fingerprint canonicalization (sorted-pair `target`) documented for dimensions 1-2.
  - [ ] Findings file with `by:harness-health` label family / standard scoring shape — confirm by checking Task 1's "Emitting findings" section routes through `SKILL.md`'s existing Step 6/7 unmodified (no new filing logic was written).
  - [ ] `_shared/harness-health-analysis.md` Dimension 8 gets its one-line pointer.
  - [ ] `npm test` passes unmodified.

- [ ] **Step 2: Final verification**

  ```bash
  npm test
  ```

  Expected: PASS. If any checkbox above is unmet, return to the relevant task and fix before considering record #55 built.
