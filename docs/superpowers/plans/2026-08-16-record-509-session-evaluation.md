# Feedback Session Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bare `/claude-tweaks:feedback` evaluates the whole session against a shared maintainer-objective rubric via a dispatched Frontier transcript judge, feeding findings into the skill's existing filing steps.

**Architecture:** One new `_shared` rubric contract (canonical objective enumeration) + one new lazy-loaded feedback sub-file (judge dispatch procedure) + wiring edits in `skills/feedback/SKILL.md`. The Frontier singleton slot moves from the Step 6 scrub to the judge; the scrub drops to Capable. Docs edges follow.

**Tech Stack:** Markdown skill files only — no `bin/` code. Verified by `npm test` (skill-audit context-cost ceilings, skill-conventions) plus content greps and one live manual walkthrough of the new procedure.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T002602-record-509/work/509-spec.md`

## Global Constraints

- **Cardinality rule (CLAUDE.md Don'ts):** never state the objective list's size as a literal count in any prose; refer to "the objectives in `_shared/feedback-objectives.md`" or "the table below."
- **Clean-room dispatch:** the judge's prompt must inline the rubric and output template verbatim; the only path it receives is the transcript file (input data). No sibling-file references in dispatch prompts.
- **`skills/feedback/SKILL.md` must keep** its `> **Interaction style:**` directive line, its `Lifecycle:` marker line, and no fenced block within 15 lines of the `# ` heading (`tests/skill-conventions.test.js`).
- **Size ceilings:** every skill file ≤ 40 KB with a warn band at 90% (`tests/bin-lib/skill-audit/context-cost.test.js`). `skills/feedback/SKILL.md` is currently ~18.6 KB — keep the judge procedure in the sub-file, and keep SKILL.md additions tight.
- **Commits:** message style `{Verb} {what} — {detail}`, body line `refs #509` (never `closes`/`fixes` — the PR body carries the closing keyword), plus the Claude-Session trailer used by this session's earlier commits.
- **Cross-references:** every new skill↔file relationship is stated once, in `docs/skill-graph.md` — never restated inside a SKILL.md.
- **`work-backend` note:** examples in skill text use the `gh` form; this plugin's skills are project-agnostic — do not hardcode this repo's name into skill text.

---

### Task 1: Rubric contract — `skills/_shared/feedback-objectives.md`

**Files:**
- Create: `skills/_shared/feedback-objectives.md`

**Interfaces:**
- Produces: the canonical objective enumeration + two norms + the finding requirement. Task 2's dispatch procedure and Task 3's SKILL.md wiring cite this file by path; the judge prompt inlines its body verbatim at dispatch time.

- [ ] **Step 1: Write the file.** Structure, all required elements below must appear (wording may be polished, substance fixed):
  - H1 `# Feedback Objectives — the maintainer-objective rubric`, then a short preamble stating: this file is **the canonical enumeration of the objective set** — downstream references check against this file, not any issue or design doc; consumed by `/feedback`'s session-evaluation judge (see `docs/skill-graph.md`), written so `/reflect` lenses can map onto it later.
  - `## Norms` with exactly these two, stated before any objective:
    1. **"No finding" is the expected common answer.** A per-objective `NO FINDING` is a valid, complete result; a session with zero findings is a successful evaluation. Never manufacture a finding to satisfy a lens. A lens the judge could not evidence renders `NOT EVALUATED — {reason}`, never a silent `NO FINDING`.
    2. **Quantify where the lens is countable.** Countable lenses report numbers from the transcript, not impressions.
  - `## Finding requirement` — every finding carries: **symptom** (what went wrong or could improve), **transcript evidence** (excerpt or precise pointer), and **proposed fix** (a concrete solution idea). A finding missing any of the three does not file.
  - `## Objectives` — a table with columns `Objective | Class | Definition | Session evidence`, exactly these rows:

    | Objective | Class | Definition (substance) | Session evidence (substance) |
    |---|---|---|---|
    | Automation efficiency | judgment | The plugin automates everything that is efficient to automate | Manual steps a skill or policy lever could have absorbed; repeated hand-work inside a skill-guided flow |
    | Context overhead | countable | Skills consume no more context than their job needs | Oversized tool results; repeated reads of the same file; skill text loaded but unused |
    | Avoidable interactions | countable | The user is stopped only when the decision is genuinely theirs | Total `AskUserQuestion` count; per-stop avoidability verdict; whether the user simply picked the pre-marked Recommended option |
    | Friction | countable | Flows proceed without workarounds, retries, or fighting the harness | Hook denials, command refusals, retry loops, error-and-recover sequences, model-side workarounds |
    | Developer joy | judgment | Operating the plugin feels good, not burdensome | Moments of delight vs. drudgery; dense or illegible surfaces; satisfying vs. tedious closures |
    | Trust calibration | judgment | Gates and autonomy levers match demonstrated outcomes | Confirms that always resolve the same way; auto-decisions later reverted; policy levers the session's outcomes contradict |
    | Instruction efficacy | judgment | Skill text produces the behavior it prescribes | A loaded skill step visibly violated or reinterpreted; instructions the model routed around |
    | Recovery quality | countable | Interruptions and residue resolve gracefully | Orphaned runs/worktrees/residue counts; resume behavior; state the user must clean up by hand |
  - A closing note: the `Class` column drives the draft template's `**Measurement:**` field — countable lenses carry it, judgment lenses omit it (see `skills/feedback/SKILL.md` Step 5).
- [ ] **Step 2: Verify content anchors.** Run each; all must return ≥ 1 line:
  - `grep -ci "canonical enumeration" skills/_shared/feedback-objectives.md`
  - `grep -c "NOT EVALUATED" skills/_shared/feedback-objectives.md`
  - `grep -ci "no finding" skills/_shared/feedback-objectives.md`
  - `grep -c "proposed fix" skills/_shared/feedback-objectives.md`
  - `grep -c "| countable |" skills/_shared/feedback-objectives.md` → expect 4; `grep -c "| judgment |" skills/_shared/feedback-objectives.md` → expect 4
- [ ] **Step 3: Verify no literal count.** `grep -cin "eight objectives\|8 objectives" skills/_shared/feedback-objectives.md` → expect 0.
- [ ] **Step 4: Commit.** `git add skills/_shared/feedback-objectives.md` then commit: `Add feedback-objectives rubric contract — canonical maintainer-objective enumeration for /feedback session evaluation` (+ `refs #509` body line and session trailer).

### Task 2: Judge dispatch procedure — `skills/feedback/session-evaluation.md`

**Files:**
- Create: `skills/feedback/session-evaluation.md`

**Interfaces:**
- Consumes: `skills/_shared/feedback-objectives.md` (Task 1) — cited by path for the reader; inlined verbatim into the dispatch prompt at runtime.
- Produces: the procedure Task 3's SKILL.md step cites (`Read session-evaluation.md in this skill's directory`), including the transcript-resolution rule, the dispatch prompt with the literal output template, and the self-assessment degradation.

- [ ] **Step 1: Empirically verify the project-slug derivation rule (AC8).** Run `ls ~/.claude/projects/ | head -20` and compare at least one entry against its known absolute cwd (this repo's entry derives from `/Users/thomasholknielsen/Code Workspaces/claude-tweaks`). Confirm the rule "each `/`, space, and `.` in the absolute cwd path is replaced by `-`" reproduces the observed directory name exactly. If the observed mapping differs (e.g. other characters also sanitized), write the rule that matches observation and note the correction in the task's completion report. Do not skip this step — the rule is currently reverse-engineered, and this live check is the acceptance criterion's whole point.
- [ ] **Step 2: Write the file.** Required sections:
  - H1 + one-line role statement: loaded by `skills/feedback/SKILL.md`'s session-evaluation step on bare (or `--queue`) invocation; never loaded on free-text invocation.
  - `## Transcript resolution` — main-thread, before dispatch:
    - Path: `~/.claude/projects/<project-slug>/<session-id>.jsonl`; project-slug per the Step-1-verified rule (state the rule and one worked example); session id from `$CLAUDE_CODE_SESSION_ID`.
    - Fallback when the variable is unset: pick the newest `.jsonl` in the project-slug directory; when two or more files there were modified within the last 24 hours, the rendered report must name the chosen file with its mtime and list the ignored siblings — never silent newest-wins.
    - Scope statement: this is the **main session's** transcript; dispatched Task-agent transcripts are separate files and out of scope — a named coverage gap, stated so a reader doesn't infer full-session coverage.
  - `## The judge dispatch` — exactly one Task agent per invocation:
    - Model: resolve via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" frontier --unattended` (no `--run-dir` — same standalone-invocation cap framing as the scrub previously used; degradation to Capable is the resolver's job, logged in its `source`).
    - Prompt contents, in order: (1) the full body of `skills/_shared/feedback-objectives.md` inlined verbatim; (2) the literal output template below, inlined verbatim; (3) the resolved transcript path; (4) slicing guidance — use Grep/Read to slice, per-objective evidence hints: keyword anchors for countable lenses (`AskUserQuestion`, error/denial strings, tool names, repeated file paths), sampling for judgment lenses (user turns plus each turn's final assistant text); a full sequential read is neither required nor expected on long transcripts; an objective slicing cannot reach renders `NOT EVALUATED — {reason}`.
    - The literal output template (fenced in the file, inlined into the prompt at runtime):

      ```
      DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED

      ## {objective name — one block per rubric objective, in rubric order}
      NO FINDING
      — or —
      NOT EVALUATED — {reason}
      — or —
      **Finding:** {symptom, one sentence}
      **Evidence:** {transcript excerpt or precise pointer}
      **Measurement:** {counts — countable lenses only; omit the line for judgment lenses}
      **Proposed fix:** {concrete solution idea}
      ```
    - Status line per `_shared/subagent-output-contract.md`; the avoidable-interactions block must state the total `AskUserQuestion` count even when it renders `NO FINDING`.
  - `## Degradation: self-assessment` — when no transcript file resolves (some cloud sandboxes): evaluate in the main thread over its own context, reusing the identical per-objective template with a `(self-assessment)` tag appended to each block's header line. The label is the full mitigation, deliberately — every finding still passes the human-gated Step 7 confirm; no separate confidence machinery.
  - `## After the judge returns` — hand each finding to SKILL.md's per-finding routing (classify → dedup → draft → scrub → confirm); a `NOT EVALUATED` block is reported in the run summary, never filed.
- [ ] **Step 3: Verify content anchors.** All ≥ 1:
  - `grep -c "resolve-profile.js" skills/feedback/session-evaluation.md`
  - `grep -c "CLAUDE_CODE_SESSION_ID" skills/feedback/session-evaluation.md`
  - `grep -ci "self-assessment" skills/feedback/session-evaluation.md`
  - `grep -c "NOT EVALUATED" skills/feedback/session-evaluation.md`
  - `grep -ci "mtime" skills/feedback/session-evaluation.md`
- [ ] **Step 4: Commit.** `Add feedback session-evaluation sub-file — transcript judge dispatch, output template, self-assessment degradation` (+ `refs #509`, trailer).

### Task 3: Wire `skills/feedback/SKILL.md`

**Files:**
- Modify: `skills/feedback/SKILL.md`

**Interfaces:**
- Consumes: Task 1's rubric path, Task 2's sub-file (cited, not restated).
- Produces: the invocation semantics Tasks 4-5 describe (judge = Frontier singleton; scrub = Capable).

- [ ] **Step 1: Rework Step 0 into the bare-invocation umbrella.** In the `### Step 0` section: bare invocation (no free text) or `--queue` now runs **two** gathers — the existing `upstream-candidate` queue check (unchanged) **and** a session evaluation per `session-evaluation.md` (cite: "Read `session-evaluation.md` in this skill's directory"). Both feed one merged batch by **concatenation, no reconciliation** — each item keeps its own draft shape; Step 4's dedup runs per item on the component+symptom fingerprint basis exactly as today (`Objective:`/`Measurement:` never join the fingerprint basis). A judge finding that classifies non-D5 at Step 2 drops from the batch with a note (mirroring the existing per-candidate stop scoping). Free-text invocation runs no evaluation — unchanged single-learning path. State the interaction budget: the whole bare run costs one Step 7 batch confirmation plus `## Next Actions`; the evaluation path adds zero mid-flow `AskUserQuestion` calls, and under `--dry-run` renders findings then stops (existing Step 7 precedence extended to evaluation findings).
- [ ] **Step 2: Extend the Step 5 draft template.** After the `**Affected component:**` line add:
  ```
  **Objective:** <objective name from _shared/feedback-objectives.md> (evaluation-sourced drafts only)

  **Measurement:** <counts> (countable lenses only — omitted for judgment lenses)
  ```
  plus one omission-rule sentence: both fields are omitted entirely on drafts no evaluation produced — free-text learnings and Step-0 queue candidates alike.
- [ ] **Step 3: Flip the Step 6 scrub to Capable.** In Step 6's dispatch paragraph: replace the `[Use: Frontier]` singleton designation with `[Use: Capable]` (resolve via `node bin/resolve-profile.js capable --unattended`), and reword the record-#221 sentence to say the skill's Frontier singleton slot is now the session-evaluation judge (`session-evaluation.md`), knowingly superseding #221's scrub entry — scrub structure, unconditionality, and hard-stop semantics unchanged. Also update `## When to Use` and the `description` frontmatter only if their wording contradicts the new bare-invocation meaning (bare invocation already routes to Step 0 — extend, don't rewrite).
- [ ] **Step 4: Verify.**
  - `grep -c "session-evaluation.md" skills/feedback/SKILL.md` ≥ 2 (Step 0 wiring + Step 6 supersession note)
  - `grep -c "Objective:" skills/feedback/SKILL.md` ≥ 1 and `grep -c "Measurement:" skills/feedback/SKILL.md` ≥ 1
  - `grep -ci "use: frontier" skills/feedback/SKILL.md` → expect 0; `grep -ci "use: capable" skills/feedback/SKILL.md` ≥ 1
  - `grep -c "> \*\*Interaction style:\*\*" skills/feedback/SKILL.md` = 1 and `grep -c "^Lifecycle: " skills/feedback/SKILL.md` = 1 (conventions preserved)
  - `wc -c skills/feedback/SKILL.md` < 36000 (stay out of the warn band)
- [ ] **Step 5: Commit.** `Wire session evaluation into /feedback — bare invocation evaluates the session; scrub drops to Capable` (+ `refs #509`, trailer).

### Task 4: Contract enumeration — `skills/_shared/subagent-output-contract.md`

**Files:**
- Modify: `skills/_shared/subagent-output-contract.md:119`

**Interfaces:**
- Consumes: the judge slot Task 3 established.
- Produces: the enumeration row Tasks 5's skill-graph edge cites.

- [ ] **Step 1: Replace the `/feedback` row.** Line 119's row currently reads scrub; replace with:
  `| Self-improvement (#221) | ` + backtick + `/feedback` + backtick + `'s session-evaluation judge (` + backtick + `feedback/session-evaluation.md` + backtick + `) | Single agent per invocation — the standalone-invocation cap (no ` + backtick + `--run-dir` + backtick + ` in the common case). The Step 6 scrub this slot previously named now resolves Capable (record #221's entry knowingly superseded). |`
- [ ] **Step 2: Verify.** `grep -c "session-evaluation" skills/_shared/subagent-output-contract.md` = 1; `grep -ci "scrub judgment" skills/_shared/subagent-output-contract.md` = 0.
- [ ] **Step 3: Commit.** `Move /feedback's Frontier singleton slot from scrub to session-evaluation judge — supersedes record #221's entry` (+ `refs #509`, trailer).

### Task 5: Docs — skill-graph edges + plugin-structure row

**Files:**
- Modify: `docs/skill-graph.md` (the `## feedback` section, lines ~185-198)
- Modify: `docs/plugin-structure.md` (the per-skill sub-file table)

- [ ] **Step 1: skill-graph edges.** In `## feedback`'s table: add row `| `_shared/feedback-objectives.md` | The maintainer-objective rubric the bare-invocation session evaluation judges against — the judge dispatch (session-evaluation.md) inlines its body verbatim; the rubric file is the canonical enumeration of the objective set. |`; update the existing `bin/resolve-profile.js` row so the Frontier singleton it describes is the session-evaluation judge (scrub → Capable), keeping the record-#221 citation.
- [ ] **Step 2: plugin-structure row.** In the per-skill sub-file table add: `| feedback | session-evaluation.md | Bare-invocation session evaluation: transcript resolution (slug rule + sibling-session tie-break), the Frontier judge dispatch with the literal per-objective output template, and the labeled self-assessment degradation — loaded only on bare/--queue invocation, kept out of SKILL.md for the size budget |`. The new `_shared` file needs no row — `_shared/*.md` is covered by the directory-listing pointer at the top of the file.
- [ ] **Step 3: Verify.** `grep -c "feedback-objectives" docs/skill-graph.md` ≥ 1; `grep -c "session-evaluation.md" docs/plugin-structure.md` ≥ 1.
- [ ] **Step 4: Commit.** `Add /feedback session-evaluation edges — skill-graph rubric edge + plugin-structure sub-file row` (+ `refs #509`, trailer).

### Task 6: Verification — suite + live walkthrough (AC9)

**Files:**
- Test: full `npm test`; live procedure walkthrough (no new files; a scratch report only)

- [ ] **Step 1: Full suite.** `npm test > /tmp/509-verify.log 2>&1; echo "exit=$?"` then check the tail's `# pass`/`# fail` counts — expect 0 failures (redirect first; never pipe/tail directly).
- [ ] **Step 2: Live walkthrough of the new procedure (AC9 + AC2/AC3 evidence).** The installed plugin cache still carries 6.84.0, so do NOT invoke `/claude-tweaks:feedback` via the Skill tool — follow the **worktree's** new `skills/feedback/session-evaluation.md` text manually, in `--dry-run` semantics:
  1. Resolve the transcript path per the file's own rule (state which branch was taken — env var or newest-file fallback).
  2. Dispatch one judge Task agent exactly as the file directs (rubric + template inlined, transcript path passed; model per the file's resolver line — degradation to a cheaper model is acceptable and logged, this validates procedure shape, not model identity).
  3. On return: verify every rubric objective has exactly one block; verify the avoidable-interactions block states a total `AskUserQuestion` count.
  4. Spot-check that count: `grep -c '"name":"AskUserQuestion"' {transcript-path}` (adjust the pattern to the transcript's observed JSON shape — verify against one real `tool_use` line first). Judge count must match the grep count; on mismatch, fix the procedure text (slicing hints or template) and re-run this step once. A second mismatch fails acceptance — stop and surface it.
  5. Render the findings dry-run style (nothing filed, no `AskUserQuestion`), then discard.
- [ ] **Step 3: Record the walkthrough.** Append one ledger row (phase `build/verify`) with the walkthrough outcome: transcript path branch taken, judge model actually resolved, count match result. Status `resolved` on success.
- [ ] **Step 4: No commit** unless Step 2.4 forced a procedure-text fix — then commit that fix as `Fix session-evaluation {slicing hints|template} — live walkthrough count mismatch` (+ `refs #509`, trailer).
