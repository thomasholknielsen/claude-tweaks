# Research Delegate-to-Built-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vendored ~7k-line Python research engine with a lean skill that delegates to Claude Code's built-in `/deep-research` Dynamic Workflow, falling back to an inline model-driven method when that feature is unavailable.

**Architecture:** `skills/research/` collapses from 32 files to 2 — `SKILL.md` (orchestration: pre-check → delegate → fallback → write) and `reference/methodology.md` (the inline fallback method + salvaged citation discipline). All Python, schemas, templates, and the vendoring contract are deleted. Reports remain dated markdown (+ `sources.json`) under `.claude-tweaks/research/`.

**Tech Stack:** Markdown SKILL files (YAML frontmatter); Node `node --test` suite under `tests/research/`; `git`; `WebSearch`/`WebFetch` + parallel Task subagents at runtime.

**Baseline:** branch `research-delegate-to-builtin` on top of `main` @ v4.14.0. Design doc: `docs/superpowers/specs/2026-06-13-research-delegate-to-builtin-design.md`.

---

## File Structure

| File | Disposition | Responsibility |
|------|-------------|----------------|
| `skills/research/SKILL.md` | **Rewrite** | Orchestration: mode picker, availability pre-check, delegate-or-fallback, write, Next Actions, CSC |
| `skills/research/reference/methodology.md` | **Rewrite** | Inline fallback method + citation discipline |
| `skills/research/scripts/` (10 `.py`) | **Delete** | — |
| `skills/research/schemas/` (4 `.json`) | **Delete** | — |
| `skills/research/templates/` (2) | **Delete** | — |
| `skills/research/tests/` (4 `.py` + fixtures) | **Delete** | — |
| `skills/research/requirements.txt` | **Delete** | — |
| `skills/research/UPSTREAM.md` | **Delete** | — |
| `skills/research/LICENSE-UPSTREAM` | **Delete** | — |
| `skills/research/reference/{continuation,html-generation,report-assembly,weasyprint-guidelines,quality-gates}.md` | **Delete** (salvage citation rules into methodology.md first) | — |
| `tests/research/skill-md.test.js` | **Modify** | Add assertions for delegation + fallback + setup note |
| `tests/research/cross-refs.test.js` | **Unchanged** (verify still passes) | — |
| `CLAUDE.md` | **Modify** | Structure-table research row |
| `README.md` | **Modify** | Remove "vendored" claims; update catalog entry |
| `skills/help/reference-card.md` | **Modify** | Command row (modes + output) |
| `skills/help/context-flow.md` | **Modify** | Artifact row (markdown + sources.json only) |
| `skills/help/SKILL.md` | **Modify** | Relationship row |
| `.claude-plugin/plugin.json` | **Modify** | Version → 4.15.0 |
| `CHANGELOG.md` | **Modify** | Add `## v4.15.0` entry |

---

## Task 1: Rewrite the inline fallback methodology

**Files:**
- Rewrite: `skills/research/reference/methodology.md`

- [ ] **Step 1: Replace `methodology.md` with the lean inline method**

Overwrite `skills/research/reference/methodology.md` with exactly:

````markdown
# Inline Research Method (fallback)

The fallback used by `/claude-tweaks:research` when Claude Code's built-in `/deep-research`
Dynamic Workflow is unavailable (Free plan, workflows disabled, or Claude Code < 2.1.154). It
replicates the built-in's agentic approach: fan out searches, extract evidence, adversarially
verify, synthesize.

## Step 0: Anchor the date

Run `date +%Y-%m-%d` via Bash. Use the returned year for recency-filtered queries — never
assume a year from training data.

## Step 1: Decompose

Break the topic into independent search angles, scaled to the depth tier:

| Tier | Angles | Verification |
|------|--------|--------------|
| quick | 5 | inline self-check |
| standard | 7 | 1 verifier per core claim |
| deep | 10 | 1 verifier per claim |
| ultradeep | 10 | multi-persona (≤3) red-team per core claim |

Angles should span: core concept, technical specifics, recent developments (date-filtered),
opposing/critical views, quantitative/benchmark data, and known limitations.

## Step 2: Search (parallel)

Dispatch all angle searches concurrently using `WebSearch` in a single message with multiple
tool calls. For each promising result, use `WebFetch` to pull the supporting passage.

> **Parallel execution:** Use parallel tool calls aggressively — all `WebSearch`/`WebFetch`
> operations in this step are independent and should run concurrently.

## Step 3: Extract evidence

For each source capture: title, URL, the exact supporting quote, and a one-line relevance
note. Maintain source diversity (academic / industry / news / primary docs) and temporal
diversity (recent + foundational).

## Step 4: Adversarially verify (parallel subagents)

For each major claim destined for the report, dispatch a verification subagent that tries to
REFUTE it. Scale the fan-out to the tier (table above).

> **Parallel execution:** Dispatch claim verification as parallel Task agents — each runs
> independently and returns a verdict. Assemble results after all agents complete.
> **Contract:** Each agent follows the Subagent Contract
> (`skills/_shared/subagent-output-contract.md`) — minimal input (the claim + its source quote
> + URL), one of `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED` as its first line, then
> Template C (yes/no + ≤3 evidence bullets). Use the Fast or Standard tier.

A claim survives only if it is NOT refuted by a majority of its verifiers. Drop or hedge
refuted claims.

## Step 5: Synthesize + write

Write `report.md` as flowing prose (not bullet dumps) in the output directory. Follow the
citation discipline below. Also write `sources.json` — an array of
`{ "n": 1, "title": "...", "url": "...", "retrieved": "YYYY-MM-DD" }` provenance entries.

## Step 6: Citation self-check (replaces the old `verify_citations.py`)

Before finishing, verify:

- Every `[N]` in the body resolves to a bibliography entry, and every bibliography entry is
  cited at least once.
- No fabricated URLs — every cited URL was actually fetched.
- Flag any claim resting on a single source.

## Citation discipline

- **Immediate citation:** every factual claim is followed by `[N]` in the same sentence.
- **No vague attributions:** never "studies show" / "research suggests" / "experts believe."
  Name the source: "Smith et al. (2024) found … [1]."
- **Label speculation:** "This suggests …" — never present inference as fact.
- **Admit uncertainty:** write "No sources found addressing X directly" rather than
  fabricating a citation.
- **Distinguish fact from synthesis:** facts carry a citation; analysis is marked as inference.
- **Precision over hedging:**

  | Vague | Precise |
  |-------|---------|
  | "significantly improved outcomes" | "reduced mortality 23% (p<0.01) [1]" |
  | "several studies suggest" | "5 RCTs (n=1,847) show [2]" |

## Bibliography format

`[N] Author/Org (Year). "Title". Publication. URL (Retrieved: YYYY-MM-DD)` — one entry per
line, every cited source listed, no ranges or "…etc."
````

- [ ] **Step 2: Commit**

```bash
git add skills/research/reference/methodology.md
git commit -m "Rewrite research methodology as lean inline fallback method"
```

---

## Task 2: Rewrite SKILL.md (add failing tests first)

**Files:**
- Modify: `tests/research/skill-md.test.js`
- Rewrite: `skills/research/SKILL.md`

- [ ] **Step 1: Add failing assertions for the new behavior**

Append these tests to `tests/research/skill-md.test.js` (before the final newline, after the existing `test(...)` blocks):

```javascript
test('SKILL.md describes delegation to the built-in /deep-research', () => {
  const body = readSkill();
  assert.match(body, /deep-research/, 'must reference the built-in /deep-research');
  assert.match(body, /Dynamic Workflow/i, 'must name the Dynamic Workflows feature');
});

test('SKILL.md describes an inline fallback path', () => {
  const body = readSkill();
  assert.match(body, /fallback/i, 'must describe a fallback');
  assert.match(body, /methodology\.md/, 'fallback must point at reference/methodology.md');
});

test('SKILL.md includes the built-in setup/enablement note', () => {
  const body = readSkill();
  assert.match(body, /2\.1\.154/, 'must state the minimum Claude Code version');
  assert.match(body, /disableWorkflows|CLAUDE_CODE_DISABLE_WORKFLOWS/, 'must mention how the feature is gated');
});

test('SKILL.md has a Component-Skill Contract keyed on PIPELINE_RUN_DIR', () => {
  const body = readSkill();
  assert.match(body, /## Component-Skill Contract/);
  assert.match(body, /\$PIPELINE_RUN_DIR/);
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test tests/research/skill-md.test.js`
Expected: the 4 new tests FAIL (current SKILL.md has no delegation/fallback/setup/CSC content); existing tests still pass.

- [ ] **Step 3: Rewrite `skills/research/SKILL.md`**

Overwrite `skills/research/SKILL.md` with exactly:

````markdown
---
name: claude-tweaks:research
description: Use when conducting in-depth web research — multi-source synthesis, citation-audited reports with 4 runtime modes from quick (~2-5 min) to ultradeep (~20-45 min, multi-persona red-team). Delegates to Claude Code's built-in /deep-research when available; falls back to an inline method otherwise. Keywords - research, deep research, web research, sources, citations, literature review.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Research — Deep Web Research with Citation-Audited Reports

Multi-source web research that produces a citation-audited markdown report. When Claude Code's
built-in `/deep-research` **Dynamic Workflow** is available, this skill delegates to it;
otherwise it runs a lean inline method (`reference/methodology.md`). Either path writes the
report under `.claude-tweaks/research/`.

```
                             [ /claude-tweaks:research ] ← utility (no fixed lifecycle position)
                                        ↑
   Used by: /claude-tweaks:capture (research INBOX items),
            /claude-tweaks:challenge (back debiasing lenses),
            /claude-tweaks:specify (prior-art lookup),
            ad-hoc research tasks
```

## When to Use

- Research a topic in depth before committing to a design direction.
- Audit prior art / state-of-the-art before authoring a spec.
- Debias an INBOX item with evidence from multiple sources.
- Gather citations for a user journey, RFC, or technical decision.
- Generate a citation-audited markdown report.

## Input

- `$ARGUMENTS` is the research topic. If empty, ask the user for it before proceeding.
- Mode is selected via a single numbered-options prompt (see Mode Picker). **`standard` is the recommended default** — it balances depth and runtime.
- Flags parsed from `$ARGUMENTS`:
  - `--mode=<quick|standard|deep|ultradeep>` — skip the mode prompt.
  - `--output=<path>` — override the default output root (defaults to `.claude-tweaks/research/`).

## Mode Picker

If no `--mode=` flag is present, ask exactly this question:

```
? Mode for "<topic>":
  1. quick      (~2-5 min,    5+ sources)
  2. standard   (~5-10 min,  10+ sources)   ← recommended
  3. deep       (~10-20 min, 15+ sources)
  4. ultradeep  (~20-45 min, red-team pass + multi-persona critique)
```

Reply with the user's selection. Then proceed.

## Workflow

1. **Resolve** topic + depth tier from `$ARGUMENTS` (or the Mode Picker).
2. **Construct the output directory:** `{cwd}/.claude-tweaks/research/[YYYY-MM-DD]-[topic-slug]/` unless `--output=` overrides. Create it before researching.
3. **Availability pre-check (built-in path).** Decide whether the built-in `/deep-research` Dynamic Workflow is usable:

   ```bash
   # Built-in /deep-research needs Claude Code >= 2.1.154 and Dynamic Workflows enabled.
   test "${CLAUDE_CODE_DISABLE_WORKFLOWS:-0}" = "1" && echo "workflows: OFF (env)" || echo "workflows: env-ok"
   grep -sq '"disableWorkflows"[[:space:]]*:[[:space:]]*true' \
     ~/.claude/settings.json .claude/settings.json .claude/settings.local.json \
     && echo "workflows: OFF (settings)" || echo "workflows: settings-ok"
   ```

   Treat the built-in as **available** only when neither check reports OFF. (The pre-check catches explicit disables; plan-gating and "never enabled on Pro" are caught by the fallback in Step 5.)
4. **Delegate to the built-in (when available).** Invoke `/deep-research` with the topic, passing depth guidance derived from the tier (for `deep`/`ultradeep`, ask it to dig broadly and cross-check more sources). Capture the cited report it returns. If the command is absent or returns nothing, fall through to Step 5.
5. **Inline fallback (when unavailable or empty).** Read `reference/methodology.md` in this skill's directory and run the lean inline method (decompose → parallel `WebSearch` → `WebFetch` extract → adversarial-verify subagents → synthesize), scaled to the depth tier.
6. **Write the report** to `report.md` (plus a `sources.json` provenance list) in the output directory — identical location for both paths.
7. **Surface progress** with a single status line per phase, then present **Next Actions** with the produced report path.

## Enabling the built-in path

The built-in `/deep-research` produces the highest-quality result. It ships as a **Dynamic
Workflows** feature (research preview) — nothing to install, but it is gated:

| Requirement | Detail |
|-------------|--------|
| Claude Code | ≥ 2.1.154 |
| Plan | Pro / Max / Team / Enterprise (not Free) |
| Default | On for Max & Team · **Pro: enable in `/config` → Dynamic workflows** · Enterprise: admin-enabled |
| Disabled by | `/config` toggle · `"disableWorkflows": true` in settings · `CLAUDE_CODE_DISABLE_WORKFLOWS=1` |

When unavailable, the inline fallback runs automatically — no setup required, lower ceiling.

## Dependency posture

- **Zero-config baseline.** The inline fallback uses built-in `WebSearch`/`WebFetch` and runs
  end-to-end without any external install or the built-in workflow.
- **Enhanced.** When Dynamic Workflows are enabled, the skill delegates to `/deep-research`
  for cross-checked, vote-validated synthesis.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Invoking `deep`/`ultradeep` on a fuzzy one-word topic | Burns time on under-scoped queries. Add a clarifying sentence, or use `quick`/`standard` first to refine scope. |
| Skipping the mode prompt by guessing | The 4 modes differ in runtime by ~10×. Always ask unless `--mode=` is passed. |
| Treating the inline fallback as failure | The fallback is a first-class path, not an error state. Most users without Dynamic Workflows rely on it. |
| Editing reports in place after generation | Reports are dated immutable artifacts. Re-run the skill; the new report gets a fresh dated directory. |
| Hard-depending on the built-in | `/deep-research` is a gated preview feature absent for many users. Never remove the fallback or assume the command exists. |

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:research` is running inside a pipeline (invoked by `/claude-tweaks:capture`, `/claude-tweaks:challenge`, `/claude-tweaks:specify`, or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal).

## Relationship to Other Skills

| Skill | Relationship |
|-------|--------------|
| `/claude-tweaks:capture` | Research findings can be promoted into INBOX items via the Next Actions block; `/capture` references `/research` as a way to enrich a captured idea before specifying. |
| `/claude-tweaks:challenge` | `/challenge` invokes `/research` to back debiasing lenses with evidence; this skill's reports can be cited as challenge sources. |
| `/claude-tweaks:specify` | `/specify` uses `/research` outputs for prior-art sections; this skill's Next Actions block offers a direct "cite findings in a new spec" path. |
| `/claude-tweaks:browse` | Both are utility skills (no fixed lifecycle position). `/browse` covers interactive browser automation; `/research` covers autonomous multi-source research. |

## Next Actions

After the report completes, present these options:

1. **Promote findings into INBOX** — `/claude-tweaks:capture <findings-summary>` **(Recommended when topic was exploratory)**.
2. **Use findings to debias a problem** — `/claude-tweaks:challenge <inbox-item>`.
3. **Cite findings in a new spec** — `/claude-tweaks:specify <spec-name>`.
4. **Re-run in deeper mode** — `/claude-tweaks:research --mode=deep <topic>` (only if current mode left obvious gaps).
````

- [ ] **Step 4: Run the full research test suite to verify it passes**

Run: `node --test tests/research/`
Expected: PASS (all original + 4 new assertions).

- [ ] **Step 5: Commit**

```bash
git add skills/research/SKILL.md tests/research/skill-md.test.js
git commit -m "Rewrite research SKILL.md to delegate to built-in /deep-research with inline fallback"
```

---

## Task 3: Delete the Python engine and obsolete sub-files

**Files:**
- Delete: `skills/research/scripts/`, `skills/research/schemas/`, `skills/research/templates/`, `skills/research/tests/`, `skills/research/requirements.txt`, `skills/research/UPSTREAM.md`, `skills/research/LICENSE-UPSTREAM`, and `skills/research/reference/{continuation,html-generation,report-assembly,weasyprint-guidelines,quality-gates}.md`

- [ ] **Step 1: Remove the directories and files**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks"
git rm -r skills/research/scripts skills/research/schemas skills/research/templates skills/research/tests
git rm skills/research/requirements.txt skills/research/UPSTREAM.md skills/research/LICENSE-UPSTREAM
git rm skills/research/reference/continuation.md skills/research/reference/html-generation.md \
       skills/research/reference/report-assembly.md skills/research/reference/weasyprint_guidelines.md \
       skills/research/reference/quality-gates.md
```

- [ ] **Step 2: Verify only the two intended files remain**

Run: `find skills/research -type f | sort`
Expected output (exactly):
```
skills/research/SKILL.md
skills/research/reference/methodology.md
```

- [ ] **Step 3: Verify no stale references to deleted assets remain in the skill**

Run: `grep -rEn "research_engine|verify_citations|search-cli|UPSTREAM|requirements.txt|weasyprint|\.py" skills/research/`
Expected: no matches (empty output).

- [ ] **Step 4: Run the suite**

Run: `node --test tests/research/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A skills/research
git commit -m "Delete vendored Python research engine, schemas, templates, and vendoring contract"
```

---

## Task 4: Update cross-references (CLAUDE.md, README, /help)

**Files:**
- Modify: `CLAUDE.md` (structure-table research row)
- Modify: `README.md` (remove "vendored" claims; catalog entry)
- Modify: `skills/help/reference-card.md`, `skills/help/context-flow.md`, `skills/help/SKILL.md`

- [ ] **Step 1: Update the `CLAUDE.md` "Skills with sub-files" research row**

Replace this line:
```
| research | reference/ (6 sub-files), scripts/ (Python pipeline), schemas/, templates/, UPSTREAM.md, LICENSE-UPSTREAM | 8-phase research pipeline vendored from 199-biotechnologies/claude-deep-research-skill (MIT); methodology, quality gates, citation validation, HTML/PDF assembly. See `skills/research/UPSTREAM.md` for vendoring contract and update runbook. |
```
with:
```
| research | methodology.md | Delegates to Claude Code's built-in `/deep-research` Dynamic Workflow when available; otherwise runs the lean inline model-driven method in `methodology.md` (decompose → parallel search → adversarial verify → synthesize). Citation-audited markdown reports under `.claude-tweaks/research/`. |
```

- [ ] **Step 2: Update the `README.md` catalog entry (the `/claude-tweaks:research` line)**

Replace:
```
**`/claude-tweaks:research`** — Deep web research with citation-audited reports. Four runtime modes from quick (~2-5 min) to ultradeep (~20-45 min, multi-persona red-team). Built on [199-biotechnologies/claude-deep-research-skill](https://github.com/199-biotechnologies/claude-deep-research-skill) (MIT) — see `skills/research/UPSTREAM.md`.
```
with:
```
**`/claude-tweaks:research`** — Deep web research with citation-audited reports. Four runtime modes from quick (~2-5 min) to ultradeep (~20-45 min, multi-persona red-team). Delegates to Claude Code's built-in `/deep-research` Dynamic Workflow when available; falls back to a lean inline method otherwise. Reports land under `.claude-tweaks/research/`.
```

- [ ] **Step 3: Remove the stale "vendored" sentence in the README "What's new in v4.7" block**

Replace:
```
Vendored from [199-biotechnologies/claude-deep-research-skill](https://github.com/199-biotechnologies/claude-deep-research-skill) (MIT). See `skills/research/UPSTREAM.md` for the vendoring contract, pinned commit, modifications, and update runbook. Reports land under `.claude-tweaks/research/`.
```
with:
```
As of v4.15.0 this delegates to Claude Code's built-in `/deep-research` Dynamic Workflow when available, with a lean inline fallback otherwise. Reports land under `.claude-tweaks/research/`.
```

- [ ] **Step 4: Fix the diagram-design comparison line that calls research "vendored"**

In the README "Diagram Design companion plugin" paragraph, replace:
```
Unlike Impeccable (wrapped via `/claude-tweaks:design`) or research (vendored), diagram-design has no callable surface
```
with:
```
Unlike Impeccable (wrapped via `/claude-tweaks:design`) or research (which delegates to the built-in `/deep-research`), diagram-design has no callable surface
```

- [ ] **Step 5: Update `skills/help/context-flow.md` research row (outputs)**

Replace:
```
| `/research` | Web sources (via WebSearch/WebFetch) | `.claude-tweaks/research/[YYYY-MM-DD]-[slug]/` (markdown + HTML + PDF + sources.json) | — |
```
with:
```
| `/research` | Web sources (built-in `/deep-research` or `WebSearch`/`WebFetch`) | `.claude-tweaks/research/[YYYY-MM-DD]-[slug]/` (`report.md` + `sources.json`) | — |
```

- [ ] **Step 6: Confirm `reference-card.md` and `help/SKILL.md` rows are still accurate**

Run: `grep -n "research" skills/help/reference-card.md skills/help/SKILL.md`
The `reference-card.md:39` row (modes + `--output=`) and `help/SKILL.md` relationship row remain accurate — **no change required** unless the grep shows a reference to Python/UPSTREAM (it should not). Leave them as-is.

- [ ] **Step 7: Run the cross-reference tests**

Run: `node --test tests/research/cross-refs.test.js`
Expected: PASS (bidirectional refs + `/help` lists `/research` unchanged).

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md README.md skills/help/context-flow.md
git commit -m "Update research cross-references for the delegate-to-built-in model"
```

---

## Task 5: Version bump + changelog

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump the version**

In `.claude-plugin/plugin.json`, replace `"version": "4.14.0",` with `"version": "4.15.0",`.

- [ ] **Step 2: Add the changelog entry**

Insert at the top of `CHANGELOG.md` (immediately after the `# Changelog` heading, before `## v4.14.0`):

```markdown
## v4.15.0 — Research delegates to the built-in /deep-research

`/claude-tweaks:research` no longer ships a vendored Python engine. It now delegates to Claude Code's built-in `/deep-research` Dynamic Workflow when available, and falls back to a lean inline model-driven method otherwise.

- **Removed** the vendored `skills/research/scripts/` (10 Python modules), `schemas/`, `templates/`, the Python `tests/`, `requirements.txt`, `UPSTREAM.md`, and `LICENSE-UPSTREAM` — ~6,800 lines.
- **`skills/research/SKILL.md`** rewritten: availability pre-check → delegate to `/deep-research` → inline fallback → write `report.md` + `sources.json` under `.claude-tweaks/research/`. Adds an "Enabling the built-in path" setup note and a Component-Skill Contract.
- **`skills/research/reference/methodology.md`** rewritten as the lean inline fallback (decompose → parallel `WebSearch`/`WebFetch` → adversarial-verify subagents → synthesize) with the salvaged citation-discipline rules.
- **Regressions accepted:** HTML/PDF report generation, deterministic Python citation/DOI validation, continuation/resume state, and source-credibility scoring are dropped. Citation validation is now a model self-check; output is markdown + `sources.json`.
- The built-in path requires Claude Code ≥ 2.1.154 with Dynamic Workflows enabled (Pro: enable via `/config`). When unavailable, the inline fallback runs automatically.
```

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json CHANGELOG.md
git commit -m "Bump 4.15.0 — research delegates to built-in /deep-research"
```

---

## Task 6: Full verification

- [ ] **Step 1: Run the entire test suite**

Run: `node --test tests/`
Expected: all tests pass, 0 fail.

- [ ] **Step 2: Confirm no stragglers reference the removed engine**

Run:
```bash
grep -rEn "199-biotechnologies|research_engine|verify_citations|UPSTREAM|HTML/PDF|search-cli" \
  CLAUDE.md README.md skills/ tests/research/ | grep -v "docs/"
```
Expected: no matches (empty output).

- [ ] **Step 3: Confirm the skill directory is exactly two files**

Run: `find skills/research -type f | sort`
Expected:
```
skills/research/SKILL.md
skills/research/reference/methodology.md
```

- [ ] **Step 4: Final state check**

Run: `git log --oneline de1f1d3..HEAD`
Expected: the six task commits above, in order, on `research-delegate-to-builtin`.

---

## Self-Review (completed during plan authoring)

- **Spec coverage:** every design-doc section maps to a task — new skill shape (Tasks 1–2), deletions (Task 3), cross-refs + tests (Tasks 2, 4), output contract (Task 1 Step 1 / Task 2 Step 3), depth tiers (Task 1, Task 2), citation discipline salvage (Task 1), setup note + CSC (Task 2), version + changelog (Task 5), acceptance criteria (Task 6).
- **Placeholder scan:** no TBD/TODO; all file contents authored verbatim.
- **Type/name consistency:** `report.md` + `sources.json` and `.claude-tweaks/research/` used identically across methodology, SKILL.md, CLAUDE.md, README, context-flow, and changelog.
- **Open risk (carried from design):** the subagent-runs-`/deep-research` invocation is undocumented; per approval we assume it works. If it does not at implementation time, degrade Step 4 to user-mediated ("run `/deep-research <topic>` and paste the result") — no other task changes.
