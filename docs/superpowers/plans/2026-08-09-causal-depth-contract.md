# Causal-Depth Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a canonical why-chain contract (`skills/_shared/causal-depth.md`) that asks "why was this possible?" up to 3 times at a confirmed proximate cause, and bind it into the two moments the chain is freshest: a behavioral bug's fix (`reproduce-first-discipline.md`) and reflect's Near-misses lens (`full-mode.md`).

**Architecture:** Pure prose-contract authoring — no runtime code, no hooks, no schema. The contract is executed inline by its two consumers at moments they already run. Verification is grep/file-inspection (no test suite reads skill prose in this repo).

**Tech Stack:** Markdown skill files; Node one-liners for verification greps.

## Global Constraints

- File `skills/_shared/causal-depth.md` must stay under 40960 bytes (40 KB soft ceiling per this project's CLAUDE.md Don'ts).
- Do not touch `skills/reflect/light-mode.md` — it inherits the Near-misses lens definition from `full-mode.md` verbatim by reference.
- Do not bind causal-depth in `skills/reflect/hindsight-mode.md` — deliberately excluded (its five evaluations are pre-ship action-gate questions, not incident-shaped inputs).
- Version bump to `.claude-plugin/plugin.json` happens LAST, after a fresh collision check against `origin/main` and `docs/shipped-versions.tsv` (current known-shipped tip: `6.74.0`, confirmed by this run's own pre-flight merge).
- Every verification grep must be whitespace-flexible where the target spans a hard-wrapped markdown paragraph — use `grep -Pzo` with `(?s)` or check word-presence rather than an exact multi-line string match.

---

### Task 1: Author `skills/_shared/causal-depth.md`

**Files:**
- Create: `skills/_shared/causal-depth.md`

**Interfaces:**
- Produces: the file itself, containing the literal heading `# Causal-Depth Contract`, a `## Verdict` section containing the literal lines `CAUSAL: terminal | systemic` and `RATIONALE:`, an `## Input` section naming both consumer files, and a `## Removal condition` section containing the substring `20` adjacent to "systemic" and a reference to `/claude-tweaks:harness-health`. Tasks 2 and 3 cite this file by the literal string `causal-depth.md`; Task 4 adds it as a skill-graph target.

- [ ] **Step 1: Write the failing check**

Run: `test -f skills/_shared/causal-depth.md && echo EXISTS || echo MISSING`
Expected: `MISSING`

- [ ] **Step 2: Author the file**

Write `skills/_shared/causal-depth.md` with exactly this content:

```markdown
# Causal-Depth Contract

Referenced from `_shared/reproduce-first-discipline.md` (step 3, the hot path — a behavioral bug's confirmed cause) and `skills/reflect/full-mode.md`'s Near-misses lens (the cold path — a recorded near-miss surfaced at wrap-up). Canonical statement of the domain-jumping why-chain: the step that asks not just "what caused this" but "why was this possible" — turning a fixed bug into a dead bug class, the same move behind every `[IL-nn]` rule in this project's CLAUDE.md.

## Input

Two entry points, two evidentiary bars:

- **Debugging path** — a proximate cause confirmed by a green repro (`_shared/reproduce-first-discipline.md` step 2 just passed). This is the strong bar: the cause is verified, not inferred.
- **Near-miss path** — a recorded near-miss's own trigger (`reflect/full-mode.md`'s Near-misses lens, "what broke or almost broke"). This is a weaker bar by design — a near-miss is retrospective, not a green-repro-verified cause. When no proximate cause is identifiable from the near-miss description, render `terminal` directly with rationale "chain exhausted at input" — do not force a chain onto a symptom with no traceable origin.

## The chain

Starting from the input's proximate cause, ask **"why was this possible?"** up to **3 times**. Each answer may jump domains — code → convention → process → tooling — that domain jump is the point: a code-level fix stops at the code, but the *reason the code was wrong* is often a convention with no enforcement, a missing gate, or a process step nobody codified.

Stop before the third why, or before starting a why at all, when either is true:

- **The next answer would leave what this project can change** — a language runtime quirk, an upstream dependency's documented behavior, a one-off human error with no recurring mechanism. There's nothing to bind a rule to past that point.
- **The next answer would be speculation, not evidence** — you're guessing at organizational intent or a process nobody can confirm, rather than reading it off the code, the commit history, or the convention that's actually in the repo.

**Worked example:**

- Bug: a grep-based verification check returned zero matches for text that was visibly present.
- Why 1: the file had a stray NUL byte partway through it. *(keep going — this is a fact about the file, not yet about why the harness let it in)*
- Why 2: nothing in the write path validates encoding before a tool writes to a tracked file. *(keep going — this names a missing gate, which is exactly the domain jump the chain exists to find)*
- Why 3: no convention in this project states "verify text tools can read what git tools wrote" as an invariant. *(stop here — a rule now exists to state; a why 4 would ask why no such convention existed project-wide, which is either "no one hit this before" — unfalsifiable — or scope creep into general documentation culture)*
- Verdict: `systemic` — the fix (strip the NUL byte) closes this instance; the chain surfaced a class (encoding validation) worth a rule.

Contrast: a bug traced to a typo in a comparison operator, fixed, re-verified green. Why 1: the developer wrote `<` where `<=` was needed. Why 2 would ask why the developer made that specific keystroke error — that's psychological speculation, not a repo-level cause. **Stop at why 1.** Verdict: `terminal`.

## Verdict

Render, no preamble beyond what's above:

```
CAUSAL: terminal | systemic
RATIONALE: {one paragraph stating the chain actually walked, including where it stopped and why}
```

`terminal` — the chain stopped at (or before) a why that left the project's own control, or the input itself carried no traceable cause. Fixing the proximate cause is where fixing ends.

`systemic` — the chain surfaced something above the proximate cause: a convention with no enforcement, a fixture or API shape that invites misuse, a missing gate, a process step nobody codified.

**Ambiguity resolves to `terminal`.** This is deliberately the opposite direction from most verdict-rendering conventions in this project (which resolve toward caution/flagging) — here, more caution would mean manufacturing a `systemic` finding for a chain that didn't actually surface one. A missed `systemic` costs a rule that doesn't get written; a false `systemic` trains the reader to stop trusting the column, which is worse, because it erodes every future verdict along with this one.

## Executor

The agent that performed the fix (debugging path) or ran the reflect pass (near-miss path) is the one that walks the chain, in the same context that holds the trace — the causal chain lives in that agent's own working memory of what it just traced or read, and a handoff to a fresh agent with no access to that trace can't reconstruct it. This is what keeps the chain hot: no re-derivation, no re-reading of logs a different agent already has open.

## Logging and routing

No new file, store, or destination. Write behavior:

- **When a pipeline run dir exists** (`$PIPELINE_RUN_DIR` resolved, per `_shared/pipeline-run-dir.md`): every invocation writes exactly one line to that run's `decisions.md`, per `_shared/auto-decision-log.md`'s schema — `SCANNED {time} — causal-depth: terminal — {one-line rationale}` for a `terminal` verdict, `STAGED {time} — causal-depth: systemic — {one-line rationale}` for a `systemic` one (the `STAGED` tag reflects that routing, below, defers the finding rather than acting on it directly).
- **When no run dir resolves** (a standalone debugging session, an ad hoc reflect pass with no active pipeline): the finding surfaces inline in the conversation instead. It is not logged, and does not count toward the removal condition below.
- **On `systemic`**, route the finding through `_shared/learning-routing.md`'s classifier by name — that file decides the destination (D1–D5); this contract introduces no new one.

## Removal condition

If the archived pipeline runs of a full release cycle (`.claude-tweaks/pipelines/archive/`) contain **20 or more** `decisions.md` lines tagged `causal-depth` with zero `systemic` verdicts surviving routing, propose removing the debugging-path binding (the `reproduce-first-discipline.md` step 3 citation) via `/claude-tweaks:harness-health`'s rule-expiry check. Standalone, no-run-dir invocations are uncounted by construction (they write nothing) — the count reflects logged pipeline runs only, and the contract states that explicitly so the figure is never inflated by assuming coverage it doesn't have.
```

- [ ] **Step 3: Run the check again to verify it passes**

Run: `test -f skills/_shared/causal-depth.md && wc -c skills/_shared/causal-depth.md`
Expected: file exists, byte count < 40960

Run: `grep -c "CAUSAL: terminal | systemic" skills/_shared/causal-depth.md`
Expected: `1`

Run: `grep -c "RATIONALE:" skills/_shared/causal-depth.md`
Expected: `>= 1`

Run: `grep -c "harness-health" skills/_shared/causal-depth.md`
Expected: `>= 1`

- [ ] **Step 4: Commit**

```bash
git add skills/_shared/causal-depth.md
git commit -m "Add the causal-depth contract — a bounded why-chain from a confirmed cause to a systemic finding"
```

---

### Task 2: Bind causal-depth into `reproduce-first-discipline.md`

**Files:**
- Modify: `skills/_shared/reproduce-first-discipline.md`

**Interfaces:**
- Consumes: `skills/_shared/causal-depth.md` (Task 1's output) — cited by filename.
- Produces: the discipline's step 3 becomes the causal-depth citation; the former step 3 (escalation) becomes step 4. Any file elsewhere in the repo that names "step 3" of this discipline by number must be swept and corrected in this same task.

- [ ] **Step 1: Write the failing check**

Run: `grep -c "causal-depth" skills/_shared/reproduce-first-discipline.md`
Expected: `0`

- [ ] **Step 2: Edit the file**

Replace the numbered list (currently 3 items) so item 2 stays as-is, a new item 3 is inserted, and the old item 3 becomes item 4:

```markdown
1. **Reproduce first.** Invoke `/superpowers:systematic-debugging`. Build a deterministic, runnable pass/fail signal for the bug (a failing test, a one-line repro) *before* touching production code. A failing test or a reproduced QA story is already a reproduction — use it rather than building a new one. Spend disproportionate effort here — with a reliable repro the cause follows; without one, staring at code rarely does.
2. **Fix the confirmed cause**, then re-run the repro to confirm it's gone, and the suite (or the failed checks) to confirm no regression.
3. **Walk the causal chain.** Once the repro is green, apply `_shared/causal-depth.md`'s why-chain to the confirmed cause — ask "why was this possible?" up to 3 times, render the `CAUSAL: terminal | systemic` verdict, and route a `systemic` finding through `_shared/learning-routing.md`.
4. **If you cannot reproduce it, stop and escalate.** State what you tried and ask for what would unblock you (environment access, a captured artifact, permission for temporary instrumentation). Escalation is the correct move, not a failure — do not proceed to guess at a fix without a reproduction loop.
```

- [ ] **Step 3: Sweep the repo for stale step-number references**

Run: `grep -rn "reproduce-first-discipline" --include="*.md" . | grep -iv "causal-depth-contract\|2026-08-09-causal-depth"`

Inspect every hit for a claim like "step 3" or "third step" of this discipline referring to the old escalation step. Based on the file's own "Referenced from" line, the citing skills (`/build`'s `failure-recovery.md`, `/test` Step 3 Fix Mode, `/review`) reference the discipline by name/behavior, not by its internal step number — confirm this holds for the actual current text of each citing file before concluding no correction is needed. If any citation does name a step number, correct it to match the new numbering.

- [ ] **Step 4: Run the check again to verify it passes**

Run: `grep -c "causal-depth" skills/_shared/reproduce-first-discipline.md`
Expected: `>= 1`

Run: `grep -n "^[0-9]\." skills/_shared/reproduce-first-discipline.md`
Expected: four numbered lines, `3.` beginning "Walk the causal chain", `4.` beginning "If you cannot reproduce it"

- [ ] **Step 5: Commit**

```bash
git add skills/_shared/reproduce-first-discipline.md
git commit -m "Bind causal-depth as reproduce-first-discipline's new step 3, renumber escalation to step 4"
```

---

### Task 3: Bind causal-depth into `reflect/full-mode.md`'s Near-misses lens

**Files:**
- Modify: `skills/reflect/full-mode.md`

**Interfaces:**
- Consumes: `skills/_shared/causal-depth.md` (Task 1's output) — cited by filename.
- Produces: a new subsection after the lens table (## Step 2's table) stating the Near-misses chain-walk, positioned before the existing `### Seed from Review Learnings` subsection.

- [ ] **Step 1: Write the failing check**

Run: `grep -c "causal-depth" skills/reflect/full-mode.md`
Expected: `0`

- [ ] **Step 2: Edit the file**

Insert a new subsection immediately after the lens table (after the `| **4. Fresh start** | ... |` row) and before `### Seed from Review Learnings`:

```markdown

### Near-misses Chain Walk

Before routing (Step 3), walk each Near-misses finding through `_shared/causal-depth.md`'s why-chain: the near-miss is the input, the chain asks "why was this possible?" up to 3 times, and the resulting `CAUSAL: terminal | systemic` verdict travels with the finding into Step 3's routing — a `systemic` verdict is itself insight-worthy alongside the near-miss it came from, not a separate item.
```

- [ ] **Step 3: Confirm `light-mode.md` is untouched**

Run: `git status --porcelain skills/reflect/light-mode.md`
Expected: empty output (no changes)

- [ ] **Step 4: Run the check again to verify it passes**

Run: `grep -c "causal-depth" skills/reflect/full-mode.md`
Expected: `>= 1`

Run: `grep -n "### Near-misses Chain Walk" skills/reflect/full-mode.md`
Expected: one match, appearing before `### Seed from Review Learnings` (compare line numbers)

- [ ] **Step 5: Commit**

```bash
git add skills/reflect/full-mode.md
git commit -m "Walk the causal-depth chain on every reflect Near-misses finding before Step 3 routing"
```

---

### Task 4: Add causal-depth edges to `docs/skill-graph.md`

**Files:**
- Modify: `docs/skill-graph.md`

**Interfaces:**
- Consumes: the file's existing per-section `| Target | Relationship |` table format; the `/build` and `/reflect` section headings.
- Produces: one new row in `/build`'s table (alphabetically ordered by target, matching the file's existing convention) and one new row in `/reflect`'s table, each citing `skills/_shared/causal-depth.md`.

- [ ] **Step 1: Write the failing check**

Run: `grep -c "causal-depth" docs/skill-graph.md`
Expected: `0`

- [ ] **Step 2: Re-read the live file and locate insertion points**

Run: `grep -n "^## build$\|^## reflect$" docs/skill-graph.md`

Read the `/build` section's table in full and find the alphabetically correct insertion point for a `skills/_shared/causal-depth.md` row (targets appear to sort skill-refs before `_shared`/`skills/_shared` refs — confirm against the live file's actual current ordering, since concurrent edits from other issues touching this file may have landed between plan-writing and execution). Do the same for `/reflect`.

- [ ] **Step 3: Edit the file**

Add to `/build`'s table (in the position determined by Step 2):

```markdown
| `skills/_shared/causal-depth.md` | `_shared/reproduce-first-discipline.md`'s step 3 walks this why-chain on every confirmed behavioral-bug cause reached via `/build` Common Step 5, `/test` Step 3 Fix Mode, or `/review`. Inherited transitively — this contract isn't `/build`-specific, it's owned here because `/build` is the alphabetically-first of the three skills that reach it through `reproduce-first-discipline.md`. |
```

Add to `/reflect`'s table (in the position determined by Step 2):

```markdown
| `skills/_shared/causal-depth.md` | `full-mode.md`'s Near-misses lens walks this why-chain on every near-miss finding before Step 3 routing — `light-mode.md` inherits the binding by reusing the same lens definition verbatim, with no separate edge. |
```

- [ ] **Step 4: Run the check again to verify it passes**

Run: `grep -c "causal-depth" docs/skill-graph.md`
Expected: `2`

- [ ] **Step 5: Commit**

```bash
git add docs/skill-graph.md
git commit -m "Add causal-depth.md's two edges to the skill graph"
```

---

### Task 5: Whole-repo consistency verification

**Files:**
- None modified — read-only verification across Tasks 1-4's output.

**Interfaces:**
- Consumes: `skills/_shared/causal-depth.md`, `skills/_shared/reproduce-first-discipline.md`, `skills/reflect/full-mode.md`, `docs/skill-graph.md` (all four from prior tasks).
- Produces: a pass/fail confirmation gating Task 6 (the version bump only happens after this passes).

- [ ] **Step 1: Three-way consistency check**

Run each and confirm non-empty / expected output:

```bash
grep -c "reproduce-first-discipline\|full-mode" skills/_shared/causal-depth.md
grep -c "causal-depth" skills/_shared/reproduce-first-discipline.md
grep -c "causal-depth" skills/reflect/full-mode.md
grep -c "causal-depth" docs/skill-graph.md
```

Expected: all four return `>= 1` (the last returns exactly `2`).

- [ ] **Step 2: Whitespace-flexible content checks**

Run (Node, not bash grep, to handle multi-line/wrapped text safely):

```bash
node -e "
const fs = require('fs');
const c = fs.readFileSync('skills/_shared/causal-depth.md', 'utf8');
const checks = [
  ['CAUSAL: terminal | systemic', c.includes('CAUSAL: terminal | systemic')],
  ['RATIONALE:', c.includes('RATIONALE:')],
  ['ambiguity resolves to terminal', /ambiguity resolves to .terminal./i.test(c)],
  ['3 whys bound', /up to \*\*3\*\* times|up to 3 times/i.test(c)],
  ['worked example present', /Worked example/i.test(c)],
  ['removal condition 20+', /20 or more|20\+/.test(c)],
  ['harness-health referenced', /harness-health/i.test(c)],
  ['SCANNED status', c.includes('SCANNED')],
  ['STAGED status', c.includes('STAGED')],
];
let allPass = true;
for (const [name, pass] of checks) { console.log((pass ? 'PASS' : 'FAIL') + ' — ' + name); if (!pass) allPass = false; }
process.exit(allPass ? 0 : 1);
"
```

Expected: exit code `0`, all lines `PASS`.

- [ ] **Step 3: Run the full test suite baseline check**

Run: `npm test 2>&1 | tail -5`
Expected: `# fail 0`, same or greater pass count than the pre-change baseline (2907 pass, 0 fail) — no test count regression. New test additions are not expected for this change (no suite reads skill prose), so the pass count should be unchanged unless an unrelated concurrent change altered it.

- [ ] **Step 4: No commit** — this task is read-only verification. If any check fails, fix the relevant file from Tasks 1-4 and re-run this task before proceeding to Task 6.

---

### Task 6: Version bump (last, after fresh collision check)

**Files:**
- Modify: `.claude-plugin/plugin.json`

**Interfaces:**
- Consumes: nothing from prior tasks structurally — this is deliberately the last, independent step so a late-landing upstream release doesn't collide with a version number reserved too early.

- [ ] **Step 1: Fresh collision check**

Run: `git fetch origin main`
Run: `git log --oneline origin/main -5`
Run: `grep -c "6.76.0" docs/shipped-versions.tsv`

Expected: `origin/main`'s tip still matches (or is a fast-forward-mergeable descendant of) this branch's already-merged base; `6.76.0` does not appear in `docs/shipped-versions.tsv`. If `origin/main` has moved further and shipped a version, merge it first and recompute the next free minor version before proceeding — do not assume `6.76.0` is still free.

- [ ] **Step 2: Write the failing check**

Run: `grep '"version"' .claude-plugin/plugin.json`
Expected: `"version": "6.74.0",`

- [ ] **Step 3: Bump the version**

Edit `.claude-plugin/plugin.json`, changing `"version": "6.74.0",` to `"version": "6.76.0",` (or the freshly-computed free version from Step 1 if `6.76.0` is no longer free).

- [ ] **Step 4: Run the check again to verify it passes**

Run: `grep '"version"' .claude-plugin/plugin.json`
Expected: `"version": "6.76.0",` (or the corrected value)

- [ ] **Step 5: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "Bump to 6.76.0 for the causal-depth contract"
```

---

## Self-Review Notes

**Spec coverage:** All 6 deliverables from record #264 map 1:1 to Tasks 1-6. All 13 acceptance criteria are covered by Task 5's verification pass (ACs 1-11) plus Task 6 (AC 12) plus Task 5 Step 3 (AC 13).

**Placeholder scan:** No `TBD`/`TODO` in any task. Task 1's file content is the complete, final prose — not a description of what to write.

**Type consistency:** N/A (no code types) — but the verdict vocabulary (`terminal`/`systemic`, `SCANNED`/`STAGED`) is used identically across Task 1's authored content and every later task's grep checks.

**Deviation from the source record noted here rather than silently reconciled:** the record's Gotchas said to mirror "the file's existing per-lens elaboration pattern" in `full-mode.md`. Reading the live file (Task 3, Step 2's premise) shows no such per-lens elaboration pattern currently exists there — the lens table's own "Surfaces" column is the only per-lens text, and `Seed from Review Learnings`/`Tradeoff Review` are cross-cutting, not per-lens. Task 3 instead inserts a new standalone subsection, which is the closest faithful application of "elaborate near the table" without inventing a pattern that isn't there.
