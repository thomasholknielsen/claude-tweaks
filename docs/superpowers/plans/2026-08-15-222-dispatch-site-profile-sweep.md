# Dispatch-Site Profile Sweep + Session-Inherit Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sweep every dispatch site off the old family-annotated tier vocabulary (`Standard (Sonnet)`, `[Use: Standard model]`) onto the bare profile grammar (`[Use: {Profile}]` + a resolver citation), and rename `bin/lib/coordination.js`'s `tier` parameter/field to `profile` — a vocabulary and mechanism conformance sweep, never a profile-choice change.

**Architecture:** Pure prose/string-literal edits across ~19 markdown files plus one small JS module + its tests. No new abstractions, no new files except two Task-agent implementer commits worth of edits. The AC1 grep is the single centralized closing verification (per IL-52 — parallel implementers can't see each other's edits, so no task may declare itself "done" against AC1; only the final task runs it).

**Tech Stack:** Markdown (skill files), Node.js (`bin/lib/coordination.js`, `node --test`).

**Spec:** `.claude-tweaks/pipelines/2026-08-15T100542-spec-222-459-428/spec-222/work/222-spec.md` (materialized from GitHub issue #222) — read both; the spec's Deliverables/Acceptance Criteria are the source of truth this plan implements. The landed contract text this plan sweeps *toward* lives in `skills/_shared/subagent-output-contract.md`'s `## Model Selection` section (from #216, already merged — read-only reference, never edit it in this build).

## Global Constraints

- **Vocabulary only, never profile choice.** Every site keeps its exact pre-sweep profile (Fast stays Fast, Standard stays Standard, Capable stays Capable) — Task 6 verifies this by diffing against the build's merge-base commit.
- **New grammar:** `[Use: {Profile}]` (capitalized profile name, no "model" suffix, no family name in parentheses) plus a resolver citation of the form `` Resolve via `node bin/resolve-profile.js {profile-lowercase}` (contract § Model Selection). ``
- **"Profile" replaces "tier"** as the vocabulary for this axis, repo-wide, in every site this plan touches — including meta-callout labels (`**Model tier:**` → `**Model profile:**`). Two axes keep the word "tier" unchanged and must NOT be touched by this sweep: `review-effort` tiers (`low`/`medium`/`high`/`xhigh`/`max`, e.g. in `skills/review/SKILL.md`) and QA execution-scheduling tiers (`Tier 0`, `Tier 1`, … in `skills/test/qa-prompts.md` — dependency-wave batching, unrelated to model selection).
- **Non-Goals (do not edit):** `skills/_shared/subagent-output-contract.md`, `CLAUDE.md`, `skills/_shared/multi-agent-coordination.md`, `skills/build/SKILL.md`, `skills/build/build-options.md`.
- **Already done — verify, don't redo:** `agents/qa-agent.md` already carries `model: sonnet` / `effort: medium` frontmatter (commit `0f71873e`, refs #216).
- Work happens in the shared worktree already checked out at the repo root (multi-spec run — do not create a nested worktree, do not run `/superpowers:using-git-worktrees`).
- Commit after each task with `git add <files>` naming exact paths — never `git add -A`.

---

### Task 1: `skills/review/*` dispatch + declaration sites (5 files)

**Files:**
- Modify: `skills/review/step3-lens-dispatch.md:61`
- Modify: `skills/review/step3-routing.md:142`
- Modify: `skills/review/ux-analysis.md:62`
- Modify: `skills/review/step3-debate-and-refutation.md:60`
- Modify: `skills/review/SKILL.md:249`

**Interfaces:** None (prose-only edits) — no other task depends on these files' content.

- [ ] **Step 1:** Edit `skills/review/step3-lens-dispatch.md` line 61 (dispatch instruction — per-lens table):

  Old:
  ```
  > **Model tier (per lens):** 3a (Convention) and 3f (Test Quality) → Fast (Haiku) — mechanical convention checks on isolated files. 3b-3e (Security, Errors, Performance, Architecture) → Standard (Sonnet) — multi-file analysis and cross-cutting findings. 3h (UX Analysis) → Capable (Opus) — judgment-heavy synthesis.
  ```
  New:
  ```
  > **Model profile (per lens):** 3a (Convention) and 3f (Test Quality) → [Use: Fast] — mechanical convention checks on isolated files. 3b-3e (Security, Errors, Performance, Architecture) → [Use: Standard] — multi-file analysis and cross-cutting findings. 3h (UX Analysis) → [Use: Capable] — judgment-heavy synthesis. Resolve each via `node bin/resolve-profile.js {profile}` (contract § Model Selection).
  ```

- [ ] **Step 2:** Edit `skills/review/step3-routing.md` line 142 (dispatch instruction):

  Old:
  ```
  > **Model tier:** Standard (Sonnet) — fix agents make targeted code edits constrained to their assigned files. Upgrade to Capable (Opus) only when the fix requires architectural redesign rather than localized correction.
  ```
  New:
  ```
  > **Model profile:** [Use: Standard] — fix agents make targeted code edits constrained to their assigned files. Upgrade to Capable only when the fix requires architectural redesign rather than localized correction. Resolve via `node bin/resolve-profile.js standard` (contract § Model Selection).
  ```

- [ ] **Step 3:** Edit `skills/review/ux-analysis.md` line 62 (dispatch instruction):

  Old:
  ```
  > **Model tier:** Capable (Opus) — judgment-heavy visual/UX synthesis across screenshots, matching lens 3h's tier in `skills/review/SKILL.md`.
  ```
  New:
  ```
  > **Model profile:** [Use: Capable] — judgment-heavy visual/UX synthesis across screenshots, matching lens 3h's profile in `skills/review/SKILL.md`. Resolve via `node bin/resolve-profile.js capable` (contract § Model Selection).
  ```

- [ ] **Step 4:** Edit `skills/review/step3-debate-and-refutation.md` line 60 (declaration-only prose — vocabulary swap only, no dispatch instruction here, so no `[Use:]`/citation added):

  Old:
  ```
  This pass is the only place in the skill where an unbounded fan-out would meet the Capable (Opus) tier, so it carries an explicit severity floor and fan-out cap — fixed values stated here, not left to model judgment.
  ```
  New:
  ```
  This pass is the only place in the skill where an unbounded fan-out would meet the Capable profile, so it carries an explicit severity floor and fan-out cap — fixed values stated here, not left to model judgment.
  ```

- [ ] **Step 5:** Edit `skills/review/SKILL.md` line 249 (declaration-only table row):

  Old:
  ```
  | 3h UX (when QA data) | high | Capable model — judgment-heavy synthesis. |
  ```
  New:
  ```
  | 3h UX (when QA data) | high | Capable profile — judgment-heavy synthesis. |
  ```

  **Do not touch** any other row in this table or the surrounding `review-effort` tier prose (lines ~224-291) — that is a different axis (`low`/`medium`/`high`/`xhigh`/`max`) explicitly excluded from this sweep.

- [ ] **Step 6:** Verify no other old-vocabulary instance remains in these 5 files:
  ```
  grep -niE '\((haiku|sonnet|opus|fable)\)|\[Use: (Fast|Standard|Capable|Frontier) model\]' skills/review/step3-lens-dispatch.md skills/review/step3-routing.md skills/review/ux-analysis.md skills/review/step3-debate-and-refutation.md skills/review/SKILL.md
  ```
  Expected: no output.

- [ ] **Step 7:** Commit:
  ```bash
  git add skills/review/step3-lens-dispatch.md skills/review/step3-routing.md skills/review/ux-analysis.md skills/review/step3-debate-and-refutation.md skills/review/SKILL.md
  git commit -m "Sweep skills/review/* dispatch sites to bare [Use: {Profile}] grammar — #222"
  ```

---

### Task 2: Second dispatch-instruction batch (7 files)

**Files:**
- Modify: `skills/tidy/SKILL.md:67`
- Modify: `skills/help/status-scan.md:13`
- Modify: `skills/browse/SKILL.md:111`
- Modify: `skills/simplify/SKILL.md:67`
- Modify: `skills/specify/red-team.md:18`
- Modify: `skills/visual-review/discover-mode.md:89`
- Modify: `skills/visual-review/page-mode.md:35`

**Interfaces:** None — no other task depends on these files' content. Independent of Task 1 (disjoint file set); may run as a separate parallel implementer per IL-52.

- [ ] **Step 1:** Edit `skills/tidy/SKILL.md` line 67:

  Old:
  ```
  > **Model tier:** Fast (Haiku) — each scan is a mechanical read of a single data source (the open work-record queue, design-doc directory, `bin/residue.js` + local branches, issue-claim blobs + comments, gh PR/issue queries, recent git history). No cross-cutting analysis at the per-scan level; Step 5 does the synthesis sequentially in the main thread after the parallel batch (including Step 5.5) completes.
  ```
  New:
  ```
  > **Model profile:** [Use: Fast] — each scan is a mechanical read of a single data source (the open work-record queue, design-doc directory, `bin/residue.js` + local branches, issue-claim blobs + comments, gh PR/issue queries, recent git history). No cross-cutting analysis at the per-scan level; Step 5 does the synthesis sequentially in the main thread after the parallel batch (including Step 5.5) completes. Resolve via `node bin/resolve-profile.js fast` (contract § Model Selection).
  ```

- [ ] **Step 2:** Edit `skills/help/status-scan.md` line 13:

  Old:
  ```
  > **Model tier:** Fast (Haiku) — each stage scan is a mechanical `gh`/facet-parse over a single data source (the open work-record queue, current PR via gh, the trust-table fetch). No synthesis at the per-stage level; the orchestrator assembles the dashboard.
  ```
  New:
  ```
  > **Model profile:** [Use: Fast] — each stage scan is a mechanical `gh`/facet-parse over a single data source (the open work-record queue, current PR via gh, the trust-table fetch). No synthesis at the per-stage level; the orchestrator assembles the dashboard. Resolve via `node bin/resolve-profile.js fast` (contract § Model Selection).
  ```

  This file overlaps open record #81 (`skills/help/status-scan.md`) — #81's own scope is disjoint (a different section entirely; re-verified against #81's live state before this plan was written). This one-line vocabulary swap does not touch anything #81 is working on.

- [ ] **Step 3:** Edit `skills/browse/SKILL.md` line 111 (Model tier is folded into the same paragraph as the Contract callout — edit the whole paragraph, not just a sub-clause):

  Old:
  ```
  > **Contract:** Each agent follows `_shared/subagent-output-contract.md` — minimal input, status line first, output template inlined verbatim. Model tier: Standard (Sonnet) — browser-walk agents do multi-step navigation and structured observation, which exceeds Fast-tier mechanical extraction. Upgrade to Capable (Opus) only if the walk requires synthesis of subjective UX judgment.
  ```
  New:
  ```
  > **Contract:** Each agent follows `_shared/subagent-output-contract.md` — minimal input, status line first, output template inlined verbatim. [Use: Standard] — browser-walk agents do multi-step navigation and structured observation, which exceeds Fast-profile mechanical extraction. Upgrade to Capable only if the walk requires synthesis of subjective UX judgment. Resolve via `node bin/resolve-profile.js standard` (contract § Model Selection).
  ```

- [ ] **Step 4:** Edit `skills/simplify/SKILL.md` line 67:

  Old:
  ```
  Invoke the `code-simplifier:code-simplifier` subagent on the scoped files. Follow the **Subagent Contract** (`_shared/subagent-output-contract.md`) — minimal input (file paths + the output template, no conversation history), tier **Standard (Sonnet)**, and the literal output template below inlined verbatim in the dispatch prompt (the subagent cannot read sibling files):
  ```
  New:
  ```
  Invoke the `code-simplifier:code-simplifier` subagent on the scoped files. Follow the **Subagent Contract** (`_shared/subagent-output-contract.md`) — minimal input (file paths + the output template, no conversation history), `[Use: Standard]` (resolve via `node bin/resolve-profile.js standard`, contract § Model Selection), and the literal output template below inlined verbatim in the dispatch prompt (the subagent cannot read sibling files):
  ```

- [ ] **Step 5:** Edit `skills/specify/red-team.md` line 18 (Model tier folded into the Contract paragraph — do not touch anything else in this file; `skills/_shared/multi-agent-coordination.md`, referenced two lines below, is a Non-Goal owned by #220):

  Old:
  ```
  > **Contract:** Each agent follows the Subagent Contract — minimal input (a record reference + persona lens question + Template A), one of `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED` as its first reply line. Tier: **Standard** (Sonnet). Read-only — personas never modify the record themselves.
  ```
  New:
  ```
  > **Contract:** Each agent follows the Subagent Contract — minimal input (a record reference + persona lens question + Template A), one of `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED` as its first reply line. `[Use: Standard]` (resolve via `node bin/resolve-profile.js standard`, contract § Model Selection). Read-only — personas never modify the record themselves.
  ```

- [ ] **Step 6:** Edit `skills/visual-review/discover-mode.md` line 89:

  Old:
  ```
  > **Model tier:** Standard (Sonnet) — discover-mode journey walkers do multi-step navigation, snapshot interpretation, and "should feel" inference from live experience. Upgrade to Capable (Opus) only when the candidate journey hinges on subjective UX synthesis that Standard would flatten.
  ```
  New:
  ```
  > **Model profile:** [Use: Standard] — discover-mode journey walkers do multi-step navigation, snapshot interpretation, and "should feel" inference from live experience. Upgrade to Capable only when the candidate journey hinges on subjective UX synthesis that Standard would flatten. Resolve via `node bin/resolve-profile.js standard` (contract § Model Selection).
  ```

- [ ] **Step 7:** Edit `skills/visual-review/page-mode.md` line 35:

  Old:
  ```
  > **Model tier:** Standard (Sonnet) — per-page review agents run Steps 1-5 (health, first impressions, persona walk, structured analysis, reimagine) which require integration across snapshot, screenshot, vitals, and source context. Upgrade to Capable (Opus) only when the page's "reimagine" pass is the primary deliverable and creative synthesis dominates the work.
  ```
  New:
  ```
  > **Model profile:** [Use: Standard] — per-page review agents run Steps 1-5 (health, first impressions, persona walk, structured analysis, reimagine) which require integration across snapshot, screenshot, vitals, and source context. Upgrade to Capable only when the page's "reimagine" pass is the primary deliverable and creative synthesis dominates the work. Resolve via `node bin/resolve-profile.js standard` (contract § Model Selection).
  ```

- [ ] **Step 8:** Verify:
  ```
  grep -niE '\((haiku|sonnet|opus|fable)\)|\[Use: (Fast|Standard|Capable|Frontier) model\]' skills/tidy/SKILL.md skills/help/status-scan.md skills/browse/SKILL.md skills/simplify/SKILL.md skills/specify/red-team.md skills/visual-review/discover-mode.md skills/visual-review/page-mode.md
  ```
  Expected: no output.

- [ ] **Step 9:** Commit:
  ```bash
  git add skills/tidy/SKILL.md skills/help/status-scan.md skills/browse/SKILL.md skills/simplify/SKILL.md skills/specify/red-team.md skills/visual-review/discover-mode.md skills/visual-review/page-mode.md
  git commit -m "Sweep tidy/status-scan/browse/simplify/red-team/visual-review dispatch sites — #222"
  ```

---

### Task 3: Third batch — sites using the "[Use: X model — reason]" variant (6 files)

These sites use `[Use: {Profile} model — {reason}]` (closing bracket after the reason clause) or bare "Model tier:"/"model tier" prose — neither form matches the spec's own literal AC1 regex, but they are listed in the spec's Current State index as dispatch-instruction sites and must convert; AC1 passes cleanly afterward regardless, since the old patterns are simply gone.

**Files:**
- Modify: `skills/harness-health/judge-procedure.md:218`
- Modify: `skills/harness-health/SKILL.md:56`
- Modify: `skills/docs-health/SKILL.md:71`
- Modify: `skills/init/SKILL.md:277`
- Modify: `skills/init/SKILL.md:303`
- Modify: `skills/test/qa-prompts.md:7`
- Modify: `skills/research/source-registry.md:143-145`

(7 edit sites across 6 files — `skills/init/SKILL.md` has two independent sites.)

**Interfaces:** None — independent of Tasks 1-2 (disjoint file set).

- [ ] **Step 1:** Edit `skills/harness-health/judge-procedure.md` line 218 (literal text embedded in the dispatch prompt template — this line ships to the agent verbatim):

  Old:
  ```
  [Use: Standard model — judgment-heavy analysis against the dimension check, not mechanical extraction]
  ```
  New:
  ```
  [Use: Standard] (contract § Model Selection — judgment-heavy analysis against the dimension check, not mechanical extraction)
  ```

- [ ] **Step 2:** Edit `skills/harness-health/SKILL.md` line 56 — this is the SAME literal string, inlined a second time inside a dispatch-prompt-construction paragraph (find-and-replace the quoted substring within the paragraph, leave the rest of the (very long) paragraph untouched):

  Old substring:
  ```
  `[Use: Standard model — this is judgment-heavy analysis against the dimension check, not mechanical extraction]`.
  ```
  New substring:
  ```
  `[Use: Standard]` (contract § Model Selection — judgment-heavy analysis against the dimension check, not mechanical extraction).
  ```

- [ ] **Step 3:** Edit `skills/docs-health/SKILL.md` line 71 (embedded in a prompt template, same shape as Step 1):

  Old:
  ```
  [Use: Standard model — multi-file judgment, format-sensitive output]
  ```
  New:
  ```
  [Use: Standard] (contract § Model Selection — multi-file judgment, format-sensitive output)
  ```

- [ ] **Step 4:** Edit `skills/init/SKILL.md` line 277:

  Old:
  ```
  > **Model tier:** Standard — applying the Frequency + Complexity + Danger rubric against Phase 2 evidence requires judgment across three dimensions per candidate, not mechanical enough for Fast and not synthesis-heavy enough to need Capable.
  ```
  New:
  ```
  > **Model profile:** [Use: Standard] — applying the Frequency + Complexity + Danger rubric against Phase 2 evidence requires judgment across three dimensions per candidate, not mechanical enough for Fast and not synthesis-heavy enough to need Capable. Resolve via `node bin/resolve-profile.js standard` (contract § Model Selection).
  ```

- [ ] **Step 5:** Edit `skills/init/SKILL.md` line 303 (a second, independent site later in the same file — do not confuse with Step 4's):

  Old:
  ```
  > **Model tier:** Standard — comparing each skill's content against the canonical template across multiple conformance dimensions (structure, sync with reference files, quality gates) is format-sensitive checking, not synthesis-heavy enough to need Capable; defaulting to Capable across 8+ agents is roughly a 5x cost multiplier for no judgment gain.
  ```
  New:
  ```
  > **Model profile:** [Use: Standard] — comparing each skill's content against the canonical template across multiple conformance dimensions (structure, sync with reference files, quality gates) is format-sensitive checking, not synthesis-heavy enough to need Capable; defaulting to Capable across 8+ agents is roughly a 5x cost multiplier for no judgment gain. Resolve via `node bin/resolve-profile.js standard` (contract § Model Selection).
  ```

- [ ] **Step 6:** Edit `skills/test/qa-prompts.md` line 7. **Careful:** this line also contains "tier" in the unrelated sense of QA execution-scheduling waves ("each tier's stories", "in the tier complete") — those phrases are a different axis (`Tier 0`, `Tier 1`, … dependency batching in this same file's Step 17) and must NOT change. Only the "model tier `Standard`" clause is this sweep's target:

  Old:
  ```
  > **Parallel execution:** Dispatch each tier's stories as parallel Task agents — each runs independently against its own `agent-browser` session and returns a `RESULT:` summary line (plus optional `TRACE:` line and `REPORT_JSON` comment). Assemble results after all agents in the tier complete. Follow the subagent contract in `skills/_shared/subagent-output-contract.md`: inline the prompt template below verbatim per agent (no references to sibling files), pick model tier `Standard` (qa-agent work is browser-driven step execution, not deep analysis), and treat the agent's first reply line as its status (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`).
  ```
  New:
  ```
  > **Parallel execution:** Dispatch each tier's stories as parallel Task agents — each runs independently against its own `agent-browser` session and returns a `RESULT:` summary line (plus optional `TRACE:` line and `REPORT_JSON` comment). Assemble results after all agents in the tier complete. Follow the subagent contract in `skills/_shared/subagent-output-contract.md`: inline the prompt template below verbatim per agent (no references to sibling files), pick `[Use: Standard]` (qa-agent work is browser-driven step execution, not deep analysis — resolve via `node bin/resolve-profile.js standard`, contract § Model Selection), and treat the agent's first reply line as its status (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`).
  ```

  Note "each tier's stories" and "in the tier complete" are unchanged — verify your diff shows only the "pick model tier..." clause changed.

- [ ] **Step 7:** Edit `skills/research/source-registry.md` lines 143-145:

  Old:
  ```
  Model tier: `Fast` for `codebase`, `repo-prose`, `tests`, and `history` — these are grep-and-read
  lookups against a named target. `Standard` for `runtime`, `telemetry`, `deps`, and `web`, where the
  agent has to judge whether what it found actually settles the claim.
  ```
  New:
  ```
  Model profile: [Use: Fast] for `codebase`, `repo-prose`, `tests`, and `history` — these are grep-and-read
  lookups against a named target. [Use: Standard] for `runtime`, `telemetry`, `deps`, and `web`, where the
  agent has to judge whether what it found actually settles the claim. Resolve via `node bin/resolve-profile.js {fast|standard}` (contract § Model Selection).
  ```

- [ ] **Step 8:** Verify:
  ```
  grep -niE 'model tier|\[Use: (Fast|Standard|Capable|Frontier) model' skills/harness-health/judge-procedure.md skills/harness-health/SKILL.md skills/docs-health/SKILL.md skills/init/SKILL.md skills/test/qa-prompts.md skills/research/source-registry.md
  ```
  Expected: no output. (Case-insensitive on purpose — catches any stray "Model Tier"/"model Tier" variant a plain-case grep would miss.)

- [ ] **Step 9:** Commit:
  ```bash
  git add skills/harness-health/judge-procedure.md skills/harness-health/SKILL.md skills/docs-health/SKILL.md skills/init/SKILL.md skills/test/qa-prompts.md skills/research/source-registry.md
  git commit -m "Sweep harness-health/docs-health/init/qa-prompts/source-registry dispatch sites — #222"
  ```

---

### Task 4: journeys/stories declarations + qa-agent.md verification (no code dispatch changes — investigation + ledger entry)

**Files:** none modified. Read-only investigation.

**Interfaces:** None.

The spec's Deliverable "`/journeys` and `/stories` dispatch blocks declare `[Use: Fast]`" does not hold against the current codebase: neither `skills/journeys/SKILL.md` nor `skills/stories/SKILL.md` issues a `Task()`/Agent fan-out dispatch anywhere in the file.

- [ ] **Step 1:** Confirm this with a fresh read — grep both files for any Task-agent dispatch marker:
  ```
  grep -n "Task(\|Task agent" skills/journeys/SKILL.md skills/stories/SKILL.md
  ```
  Expected: no genuine dispatch-construction hits. `skills/journeys/SKILL.md` does everything inline (its own line 88: "Fix issues inline — no subagent"). `skills/stories/SKILL.md`'s only parallel-execution note (line 111) explicitly runs `agent-browser` sessions as separate OS processes, stating "(not a Task agent)".

- [ ] **Step 2:** Confirm the contract's "Used by" line (`skills/_shared/subagent-output-contract.md:161` — Template B, Search-style) is the source of the spec's stale assumption:
  ```
  grep -n "journeys\|stories" skills/_shared/subagent-output-contract.md
  ```
  This line (`**Used by:** \`/journeys\` (per-journey extraction), \`/stories\` (per-flow probe), \`/build\` (search subagents).`) is itself a Non-Goal for this build (the contract file is owned by #216) — do not edit it here. It documents an assumption about journeys/stories dispatch shape that the current implementation of those two skills does not match. This is a genuine finding, not this build's bug to fix.

- [ ] **Step 3:** Add a ledger entry recording this as an accepted deviation from the spec (not a code change):
  ```
  Phase: build
  Item: Spec #222's "/journeys and /stories dispatch blocks declare [Use: Fast]" deliverable does not apply — neither skill currently issues a Task-agent fan-out dispatch (journeys runs inline; stories runs agent-browser as separate OS processes, explicitly "not a Task agent"). The contract's Template B "Used by" line naming these two skills as per-journey/per-flow dispatchers is stale against current implementation. No dispatch site exists to annotate.
  Status: accepted
  Resolution: Verified via grep — no Task()/"Task agent" construction site in either file. Filing a follow-up backlog item for the contract's stale "Used by" line is out of scope for #222 (contract file is #216's, a Non-Goal here); flag at Common Step 4.5 (Architecture Alignment) instead.
  ```

- [ ] **Step 4:** Verify `agents/qa-agent.md` already carries the frontmatter this spec's deliverable #4 asks for (already-landed, per commit `0f71873e`):
  ```
  head -8 agents/qa-agent.md
  ```
  Expected: `model: sonnet` and `effort: medium` present in the frontmatter block. No edit needed — record this as a verified-already-done item, not a new ledger entry (it's not a deviation, it's confirmation the spec's deliverable is satisfied).

- [ ] **Step 5:** No commit for this task (no files changed) — carry the ledger entry from Step 3 forward to the build's ledger file directly (append the row to `docs/plans/2026-08-15-spec-222-459-428-ledger.md`, item phase `build`, status `accepted`).

---

### Task 5: `bin/lib/coordination.js` — rename `tier` → `profile`, new prompt grammar, new test coverage

**Files:**
- Modify: `bin/lib/coordination.js` (functions `buildReproductionDispatch`, `buildDebateDispatch`, `buildRedTeamDispatch`, lines ~202-240)
- Modify: `tests/multi-agent-coordination.test.js` (add new assertions; existing tests must keep passing since they don't reference `.tier` by name — only exact string/field additions below)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by other tasks — this module is not called from any skill file, it exists as an independently-tested reference implementation of the dispatch-prompt shape (verified: `grep -rln "buildReproductionDispatch\|buildDebateDispatch\|buildRedTeamDispatch" bin skills` returns only `bin/lib/coordination.js` itself).

Current shape (read `bin/lib/coordination.js` in full before starting — it's under 250 lines):

```js
function buildReproductionDispatch(taskScope, tier = 'Standard') {
  const prompt = `${taskScope}\n\n[Use: ${tier} model — reproduction agent. Independent run.]`;
  return {
    tier,
    agentCount: REPRODUCTION_AGENT_COUNT,
    agents: [
      { role: 'reproducer-A', prompt },
      { role: 'reproducer-B', prompt },
    ],
  };
}

function buildDebateDispatch(contestedFinding, tier = 'Capable') {
  const prompt =
    `Review this finding and reply with verdict ('agree' / 'disagree' / 'partial') ` +
    `then one paragraph of reasoning:\n\n${JSON.stringify(contestedFinding)}\n\n` +
    `[Use: ${tier} model — debate agent.]`;
  return {
    tier,
    agentCount: DEBATE_AGENT_COUNT,
    rounds: 1,
    agents: [
      { role: 'debater-A', prompt },
      { role: 'debater-B', prompt },
    ],
  };
}

function buildRedTeamDispatch(specContent, tier = 'Standard') {
  return {
    tier,
    agentCount: RED_TEAM_PERSONAS.length,
    agents: RED_TEAM_PERSONAS.map((p) => ({
      role: p.name,
      prompt: `${p.lens}\n\nSpec under review:\n\n${specContent}\n\n[Use: ${tier} model — ${p.name} persona.]`,
    })),
  };
}
```

- [ ] **Step 1: Write the failing tests first.** Add these three tests to `tests/multi-agent-coordination.test.js`, placed immediately after the existing `'reproduction: dispatches exactly 2 agents in one batch with identical prompts'` test (~line 124), immediately after the existing `'debate: runs exactly 1 round with 2 agents'` test (~line 360), and immediately after the existing `'red-team: dispatches exactly 3 personas in one batch'` test (~line 467), respectively:

  ```js
  test('reproduction: returns a `profile` field (not `tier`) and the bare [Use: {Profile}] grammar', () => {
    const dispatch = c.buildReproductionDispatch('Audit src/auth.ts for OWASP top 10.', 'Capable');
    assert.strictEqual(dispatch.profile, 'Capable');
    assert.strictEqual(dispatch.tier, undefined);
    assert.ok(dispatch.agents[0].prompt.includes('[Use: Capable]'));
    assert.ok(!dispatch.agents[0].prompt.includes('model'));
  });
  ```

  ```js
  test('debate: returns a `profile` field (not `tier`) and the bare [Use: {Profile}] grammar', () => {
    const dispatch = c.buildDebateDispatch({ path: 'src/x.ts', line: 10, severity: 'high' }, 'Standard');
    assert.strictEqual(dispatch.profile, 'Standard');
    assert.strictEqual(dispatch.tier, undefined);
    assert.ok(dispatch.agents[0].prompt.includes('[Use: Standard]'));
    assert.ok(!dispatch.agents[0].prompt.includes('model'));
  });
  ```

  ```js
  test('red-team: returns a `profile` field (not `tier`) and the bare [Use: {Profile}] grammar', () => {
    const dispatch = c.buildRedTeamDispatch('Spec content here.', 'Fast');
    assert.strictEqual(dispatch.profile, 'Fast');
    assert.strictEqual(dispatch.tier, undefined);
    for (const agent of dispatch.agents) {
      assert.ok(agent.prompt.includes('[Use: Fast]'));
      assert.ok(!agent.prompt.includes('model'));
    }
  });
  ```

- [ ] **Step 2: Run the new tests to verify they fail** (the current code returns `tier`, not `profile`, and includes "model" in the prompt):
  ```
  node --test tests/multi-agent-coordination.test.js
  ```
  Expected: the 3 new tests FAIL (`dispatch.profile` is `undefined`, `dispatch.tier` is NOT `undefined`); the pre-existing tests still PASS.

- [ ] **Step 3: Implement the rename.** Edit `bin/lib/coordination.js`:

  Old:
  ```js
  function buildReproductionDispatch(taskScope, tier = 'Standard') {
    const prompt = `${taskScope}\n\n[Use: ${tier} model — reproduction agent. Independent run.]`;
    return {
      tier,
      agentCount: REPRODUCTION_AGENT_COUNT,
      agents: [
        { role: 'reproducer-A', prompt },
        { role: 'reproducer-B', prompt },
      ],
    };
  }

  function buildDebateDispatch(contestedFinding, tier = 'Capable') {
    const prompt =
      `Review this finding and reply with verdict ('agree' / 'disagree' / 'partial') ` +
      `then one paragraph of reasoning:\n\n${JSON.stringify(contestedFinding)}\n\n` +
      `[Use: ${tier} model — debate agent.]`;
    return {
      tier,
      agentCount: DEBATE_AGENT_COUNT,
      rounds: 1,
      agents: [
        { role: 'debater-A', prompt },
        { role: 'debater-B', prompt },
      ],
    };
  }

  function buildRedTeamDispatch(specContent, tier = 'Standard') {
    return {
      tier,
      agentCount: RED_TEAM_PERSONAS.length,
      agents: RED_TEAM_PERSONAS.map((p) => ({
        role: p.name,
        prompt: `${p.lens}\n\nSpec under review:\n\n${specContent}\n\n[Use: ${tier} model — ${p.name} persona.]`,
      })),
    };
  }
  ```
  New:
  ```js
  function buildReproductionDispatch(taskScope, profile = 'Standard') {
    const prompt = `${taskScope}\n\n[Use: ${profile}] (contract § Model Selection — reproduction agent, independent run)`;
    return {
      profile,
      agentCount: REPRODUCTION_AGENT_COUNT,
      agents: [
        { role: 'reproducer-A', prompt },
        { role: 'reproducer-B', prompt },
      ],
    };
  }

  function buildDebateDispatch(contestedFinding, profile = 'Capable') {
    const prompt =
      `Review this finding and reply with verdict ('agree' / 'disagree' / 'partial') ` +
      `then one paragraph of reasoning:\n\n${JSON.stringify(contestedFinding)}\n\n` +
      `[Use: ${profile}] (contract § Model Selection — debate agent)`;
    return {
      profile,
      agentCount: DEBATE_AGENT_COUNT,
      rounds: 1,
      agents: [
        { role: 'debater-A', prompt },
        { role: 'debater-B', prompt },
      ],
    };
  }

  function buildRedTeamDispatch(specContent, profile = 'Standard') {
    return {
      profile,
      agentCount: RED_TEAM_PERSONAS.length,
      agents: RED_TEAM_PERSONAS.map((p) => ({
        role: p.name,
        prompt: `${p.lens}\n\nSpec under review:\n\n${specContent}\n\n[Use: ${profile}] (contract § Model Selection — ${p.name} persona)`,
      })),
    };
  }
  ```

  Do not change the default profile values (`'Standard'`/`'Capable'`/`'Standard'`) — those are the pre-sweep profile choices and must survive unchanged (Global Constraints).

- [ ] **Step 4: Run all tests to verify they pass:**
  ```
  node --test tests/multi-agent-coordination.test.js
  ```
  Expected: all tests PASS, including the 3 new ones and every pre-existing one (the pre-existing tests never asserted on `.tier`, `.profile`, or exact prompt content beyond agent-to-agent equality, so the rename does not break them).

- [ ] **Step 5:** Confirm no other file in the repo references the old `tier` naming for this module (already checked during planning — re-confirm at implementation time in case something changed):
  ```
  grep -rn "buildReproductionDispatch\|buildDebateDispatch\|buildRedTeamDispatch" bin skills tests
  ```
  Expected: only `bin/lib/coordination.js` (definitions) and `tests/multi-agent-coordination.test.js` (call sites) — nothing else references these functions, so no caller-side rename is needed.

- [ ] **Step 6:** Commit:
  ```bash
  git add bin/lib/coordination.js tests/multi-agent-coordination.test.js
  git commit -m "coordination.js: rename tier param/field to profile, adopt bare [Use: {Profile}] grammar — #222"
  ```

---

### Task 6: Centralized closing verification (AC1, AC4, AC5)

Run only after Tasks 1-5 have all landed (this task's whole purpose is the IL-52 centralized check parallel implementers cannot run for themselves, since none of them can see the others' edits).

**Files:** none modified (verification only), unless AC1/AC4 surface a miss — in that case, fix and re-run before proceeding.

- [ ] **Step 1 — AC1, run literally as specified in the spec:**
  ```
  find skills agents bin -type f \( -name '*.md' -o -name '*.js' \) -not -path 'skills/_shared/subagent-output-contract.md' -print0 | xargs -0 grep -niE '\((haiku|sonnet|opus|fable)\)|\[Use: (Fast|Standard|Capable|Frontier) model\]'
  ```
  Expected: zero matches. If any remain, they are a site this plan's Tasks 1-3 missed — fix directly (same conversion rules as above) and re-run this exact command until clean.

- [ ] **Step 2 — AC4, zero behavioral profile changes.** Diff every touched file against the build's merge-base commit and confirm each site's profile word is unchanged from pre-sweep:
  ```
  git diff $(git merge-base origin/main HEAD)..HEAD -- skills agents bin/lib/coordination.js
  ```
  Read the diff. For every hunk, confirm the only change is vocabulary (`tier`→`profile`, `(Sonnet)`/`(Opus)`/`(Haiku)`/`(Fable)` dropped, `[Use: X model]`→`[Use: X]` + citation) — never a changed profile word (a hunk that turns `Standard` into `Capable`, or vice versa, is a bug — revert that specific line and restore the original profile choice with only the vocabulary swap applied).

- [ ] **Step 3 — AC2/AC3 spot-check** (already covered by Task 4 Step 4 and Task 5 Steps 1-4 respectively, but re-confirm both in one place before the final test run):
  ```
  head -8 agents/qa-agent.md
  node --test tests/multi-agent-coordination.test.js
  ```

- [ ] **Step 4 — AC5, full suite:**
  ```
  npm test
  ```
  Expected: all tests pass, 0 failures (the pre-flight baseline sweep for this multi-spec run already confirmed 3569 pass / 0 fail / 5 skipped before this build touched anything — this run should match that pass/fail shape plus the 3 new tests from Task 5, i.e. 3572 pass / 0 fail / 5 skipped).

- [ ] **Step 5:** If Steps 1-4 all pass clean, no further commit is needed (this task makes no file changes on the happy path). If Step 1 or Step 2 required a fix, commit that fix separately:
  ```bash
  git add <fixed-file>
  git commit -m "Fix missed dispatch site(s) surfaced by AC1/AC4 closing sweep — #222"
  ```
