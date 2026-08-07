# Challenge Framing Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape `/claude-tweaks:challenge` from a standalone seven-proposer MoA brief producer into a `framing-check` component mode called inline from `/specify`, keeping `--lens` as a human escape hatch, and adding zero user-facing prompts.

**Architecture:** `/challenge` becomes two-mode, modeled on `/claude-tweaks:assess-agent-autonomy`. The `framing-check` mode renders two strict lines (`FRAMING:` / `RATIONALE:`) and is invoked inline from `/specify`'s two record-creation paths, alongside the `ceremony-check` calls already there. A `solution-baked` verdict writes assumptions into the record's own `## Gotchas` and stamps a `framing:baked` label. The verdict surfaces to a human only as an informational column in `/backlog refine`'s existing single-gate batch table. The Brainstorming Brief artifact, its `docs/plans/*-brief.md` lifecycle, the MoA dispatch, and the Layered MoA coordination primitive are all removed.

**Tech Stack:** Markdown skill files with YAML frontmatter; Node 18+ CommonJS modules under `bin/lib/`; `node --test` suites under `tests/` and `bin/lib/*/tests/`.

**Design doc:** `docs/superpowers/specs/2026-08-07-challenge-framing-gate-design.md`

## Global Constraints

- **Work from the worktree.** Every task runs in `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/challenge-framing-gate` on branch `worktree-challenge-framing-gate`. Never `cd` to the main checkout. Begin every task by confirming `pwd` and `git rev-parse --show-toplevel` agree.
- **Every task ends green — but run the *targeted* suite, not `npm test`.** The full suite takes **over 15 minutes** here, which exceeds a subagent's practical patience and will stall the task rather than verify it. Each task below names the specific suite(s) covering its change. Run those. The full `npm test` runs exactly once, at the final whole-branch review.
- **Never pipe a long test run into `tail`/`grep`.** Redirect to a file first, then read the file: `node --test <suite> > /tmp/t.log 2>&1; echo "exit=$?"` then read `/tmp/t.log`. Piping directly can hide the real failure or trigger a silent re-run.
- **Task ordering is load-bearing.** Task 1 deletes tests that assert on the design Task 2 removes. Reversing them leaves the suite red at the end of Task 2.
- **No emojis in skill files.** Use `**(Recommended)**` bold text for emphasis (CLAUDE.md).
- **Skill cross-references in actionable instruction text** use the fully-qualified `/claude-tweaks:{skill}` form. Bare `/{skill}` is for descriptive prose only.
- **Commit message style:** `{Verb} {what} — {detail}`, imperative, no conventional-commit prefixes. End every commit message with `Claude-Session: https://claude.ai/code/session_01W2Jm1rdXgHGoYgAFeAsq7r`.
- **Use `refs #N`, never `closes #N`** in task commits — this plan closes nothing on its own.
- **Verify staged contents before every commit** with `git diff --cached --name-only`. `git commit` with no pathspec takes the entire staged index (`[IL-42]`).
- **Do not bump the version.** The version bump and changelog entry happen once, after the whole-branch review, in Task 10.

### The brief sweep — corrected pattern and the four concepts

There are **four** unrelated "brief" concepts in this repo. Only the first is being removed. Deleting any of the other three is a defect.

| Concept | Home | Disposition |
|---|---|---|
| Brainstorming brief | `/challenge` → `docs/plans/*-brief.md` | **REMOVE** |
| Verification brief | `skills/wrap-up/verification-brief.md`, used by `/demo` | Leave alone |
| Visual-review briefs | `skills/visual-review/*` | Leave alone |
| Impeccable design brief | `skills/specify/design-pre-steps.md:51`, design-wrapper `shape` mode | Leave alone |

The authoritative sweep — an earlier pattern anchored only on `brainstorming brief` and the file glob, and **missed three sites that say only "from the brief"**:

```bash
grep -rnEi "brainstorming brief|docs/plans/[^ ]*brief|\*-brief\.md|from the brief" \
  skills/ docs/getting-started.md docs/plugin-structure.md docs/skill-graph.md bin/ tests/ \
  | grep -v "2026-08-07-challenge-framing-gate"
```

A bare-word `brief` sweep matches 74 files and is useless — it is common English.

**Sites this pattern added, beyond the per-task lists below:**

- `skills/specify/spec-template.md:93` — the `## Assumptions (optional)` section body, "Absorbed from the brief" (Task 5).
- `skills/_shared/decision-records.md:44` — "plus any `[ADR-candidate]` from the brief or from `/deepen`" in the `/wrap-up` row; the plan already lists `:42` (Task 6).
- `docs/getting-started.md:13` — "Generates solution approaches from the Brief" in the `/superpowers:brainstorming` entry (Task 9).

**Pre-existing contradiction to resolve while in there (Task 5):** `record-creation.md:224` asserts "there's no separate `## Assumptions` section anymore", but `spec-template.md:93` still defines one. Both are being edited by this plan; make them agree — the template's optional section should go, since the sentence claiming it is gone is the newer intent.

---

### Task 1: Remove the Layered MoA primitive from code and tests

Delete first, because `tests/multi-agent-coordination.test.js` asserts on the exact `/challenge` design Task 2 rewrites. Doing Task 2 first would leave the suite red.

**Files:**
- Modify: `bin/lib/coordination.js` (delete `MOA_AGGREGATOR_INSTRUCTION` at `:38`, `buildMoADispatch` at `:247`, and their `module.exports` entries at `:267`+)
- Modify: `tests/multi-agent-coordination.test.js` (delete the Layered MoA block at `:496-525` and the `/challenge` integration block at `:744-858`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a `bin/lib/coordination.js` exporting only `buildReproductionDispatch`, `buildDebateDispatch`, and `buildRedTeamDispatch` among its dispatch builders. Later tasks assume `buildMoADispatch` no longer exists.

- [ ] **Step 1: Confirm the working directory**

```bash
pwd
git rev-parse --show-toplevel
git branch --show-current
```

Expected: both paths end in `.claude/worktrees/challenge-framing-gate`; branch is `worktree-challenge-framing-gate`.

- [ ] **Step 2: Establish the baseline — the suite is green before you touch it**

```bash
npm test 2>&1 | tail -20
```

Expected: PASS. If it is already red, stop and report — do not proceed on a red baseline.

- [ ] **Step 3: Find every reference to the symbols being deleted**

```bash
grep -rn "buildMoADispatch\|MOA_AGGREGATOR_INSTRUCTION" bin/ tests/
```

Expected: `bin/lib/coordination.js` (definition + export) and five call sites in `tests/multi-agent-coordination.test.js` (`:500`, `:509`, `:525`, `:763`, `:835`). If any other consumer appears, stop — the design's "only consumer" premise is wrong and needs revisiting.

- [ ] **Step 4: Delete the two test blocks**

Delete from `tests/multi-agent-coordination.test.js`:
- The Layered MoA section — the `// Layered MoA` comment at `:496` through the end of the test closing at `:525`.
- The `/challenge` integration section — the `// /challenge integration tests (Spec 04)` comment at `:744` through the end of the last `/challenge` test (the auto-mode-contract test ending near `:858`).

Then check whether the `CHALLENGE_SKILL` constant at `:23` still has a reader:

```bash
grep -n "CHALLENGE_SKILL" tests/multi-agent-coordination.test.js
```

If the only remaining hit is the definition at `:23` (and the explanatory comments at `:46`, `:58`, `:75`), delete the constant and those comments too — a constant that reads a live production file with no assertion behind it is exactly the `[IL-80]` coupling this task exists to remove.

- [ ] **Step 5: Delete the implementation**

In `bin/lib/coordination.js`, delete:
- The `MOA_AGGREGATOR_INSTRUCTION` constant beginning at `:38`.
- The entire `buildMoADispatch` function beginning at `:247`.
- The `buildMoADispatch` entry (and `MOA_AGGREGATOR_INSTRUCTION`, if exported) from the `module.exports` object at `:267`.

- [ ] **Step 6: Verify the symbols are gone**

```bash
grep -rn "buildMoADispatch\|MOA_AGGREGATOR_INSTRUCTION" bin/ tests/
```

Expected: no output.

- [ ] **Step 7: Run the suite**

```bash
npm test 2>&1 | tail -20
```

Expected: PASS. Note the test count — it will be lower than the Step 2 baseline by the number of deleted tests, which is correct.

- [ ] **Step 8: Commit**

```bash
git add bin/lib/coordination.js tests/multi-agent-coordination.test.js
git diff --cached --name-only
git commit -F - <<'EOF'
Remove the Layered MoA coordination primitive — /challenge was its only consumer

Deletes buildMoADispatch and MOA_AGGREGATOR_INSTRUCTION from
bin/lib/coordination.js, plus the MoA and /challenge integration blocks from
tests/multi-agent-coordination.test.js.

That suite read the live skills/challenge/SKILL.md and asserted on the exact
design being replaced — a scheduled failure timed to this migration per
[IL-80]. Removing the assertions and the live-file coupling together.

Claude-Session: https://claude.ai/code/session_01W2Jm1rdXgHGoYgAFeAsq7r
EOF
```

---

### Task 2: Rewrite `challenge/SKILL.md` as `framing-check` + `--lens`

**Files:**
- Modify: `skills/challenge/SKILL.md` (full rewrite, currently 19,321 bytes)

**Interfaces:**
- Consumes: nothing from Task 1 (Task 1 only removes code this file described).
- Produces: the `framing-check` output contract that Task 4 wires into `/specify`:
  ```
  FRAMING: open | solution-baked
  RATIONALE: {one paragraph naming the specific content signal the verdict is based on}
  ```
  and the invocation form `Skill(skill: "claude-tweaks:challenge", args: "framing-check")`.

- [ ] **Step 1: Read the four hard constraints `tests/skill-conventions.test.js` places on this file**

```bash
sed -n '25,90p' tests/skill-conventions.test.js
```

The rewrite must keep all of these true:
1. The skill directory still exists with a `SKILL.md` (skill count stays 33).
2. The canonical interaction directive line is present verbatim.
3. A one-line `Lifecycle: ...` marker matching `/^Lifecycle: .+$/m` is present.
4. No fenced code block appears between the H1 and 15 lines after it.

- [ ] **Step 2: Write the new `skills/challenge/SKILL.md`**

Replace the entire file with the following. Preserve the existing frontmatter `name: challenge` (bare, never namespace-prefixed — CLAUDE.md frontmatter conventions).

````markdown
---
name: challenge
description: Use when /claude-tweaks:specify needs a content-aware verdict on whether a record bakes in its own solution, or when you want to stress-test a problem framing yourself through a named debiasing lens. Keywords - framing, debias, assumptions, solution-baked, reframe, lens.
argument-hint: "framing-check | --lens=<n[,n...]> <#n|topic|problem statement>"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. End with `## Next Actions` via `AskUserQuestion`, not a navigation menu.

# Challenge — Framing Verdicts and Debiasing Lenses

Two-mode skill. `framing-check` is an inline component mode that judges whether a work record bakes in its own solution. `--lens` is a human-invoked escape hatch that applies a named debiasing lens to a problem you want stress-tested.

Lifecycle: `/claude-tweaks:capture` → `/claude-tweaks:specify` [ **framing-check** ] → `/claude-tweaks:build`

## When to Use

- **`framing-check`** — `/claude-tweaks:specify` is shaping a record and needs a framing verdict alongside its `ceremony-check` call. Never invoked directly by a human.
- **`--lens=<n[,n...]>`** — you want a specific debiasing perspective on a problem, before or during brainstorming. Invoked directly by a human, never by a pipeline.

Not for: producing a standalone document, dispatching subagents, or gating anything. This skill renders a verdict or a perspective; callers act on it.

## Input

`$ARGUMENTS` is either the literal `framing-check`, or `--lens=<n[,n...]>` followed by a work record reference (`#42`), a topic, or a problem statement.

The two forms are mutually exclusive. `framing-check` takes no further arguments — its input is the record body the caller already holds in memory.

For `--lens`, resolve the target the same way `/claude-tweaks:capture` does (see its Backend Selection): a `#{n}` reference fetches via `gh issue view {n} --json title,body` under `work-backend: github-issues`, or via `local-store.js`'s `readRecord` under `work-backend: local-files`. A topic or problem statement is used as given.

## Mode: framing-check

**Called from:** `/claude-tweaks:specify`'s two record-creation paths — `shaping-mode.md`'s single-record path and `record-creation.md`'s per-leaf loop — immediately alongside the existing `ceremony-check` invocation. Every record, every run, no pre-filtering.

Invoked inline via the `Skill` tool, not as a Task-agent dispatch. The caller already holds the body; a subagent would only pay to re-derive it.

### Step 1: Gather

No fetch. Read what the caller already has in memory:

- The composed record body — `## Current State`, `## Deliverables`, `## Acceptance Criteria`.
- In shaping mode, the preserved `## Original request` block. This is the un-reframed source text and is the stronger framing signal, because shaping may already have laundered solution-baked phrasing into neutral spec prose. Judge both; weight the original request higher where they disagree.

### Step 2: Judge

Render `solution-baked` when the record's content shows any of:

- The Deliverables name a specific technology, library, vendor, or mechanism as the thing to build, while the Current State cites no measurement, profile, benchmark, or observed symptom that selects it over alternatives.
- The stated problem is a restatement of its own solution — "we need X" where X is the deliverable.
- The Acceptance Criteria can be satisfied by exactly one implementation, and the record never says why the alternatives lost.

Naming a solution is not itself the defect. A record that names a technology **and** justifies it from observed evidence is `open`. What makes a framing baked is a solution that was never traded off.

**Ambiguity resolves to `open`.** This is deliberately the opposite direction from `/claude-tweaks:assess-agent-autonomy`'s four modes, which resolve toward more caution. Here, more caution would mean manufacturing doubt about a framing that holds — see this skill's Anti-Patterns table. A missed flag costs nothing; a false flag trains the reader to ignore the column. Do not "align" this with its sibling modes.

### Step 3: Render

Output ONLY these two lines, no preamble:

```
FRAMING: open | solution-baked
RATIONALE: {one paragraph naming the specific content signal the verdict is based on}
```

On `solution-baked`, the RATIONALE must name the assumptions the caller is to write into `## Gotchas` — state each as a claim plus its validation status, e.g. "assumes read volume is the bottleneck (unvalidated — no profile cited)".

## Mode: --lens

Applies the named lens(es) from The Debiasing Lenses below to the resolved target, **in the main thread with no subagent dispatch**, and returns the perspective in conversation. Writes no file.

Multiple lenses (`--lens=3,5`) run in sequence and are returned as separate labelled sections — there is no synthesis or aggregation step.

## The Debiasing Lenses

Seven lenses, addressed by number in `--lens`. `framing-check` does not use these directly; its Step 2 signals are derived from lenses 1 and 7.

### Lens 1: Surface Hidden Assumptions

**Bias targeted:** Premise control, anchoring

Ask: *"What must be true for your current framing to make sense?"* Identify 2-3 assumptions embedded in the question, present them back explicitly, and ask which have been verified versus taken for granted.

**Example:** "Should we use Redis or Memcached?" embeds the assumption that a caching layer is needed at all.

### Lens 2: Invert the Question

**Bias targeted:** Confirmation bias (Popper's falsification)

Ask: *"How would someone who disagrees frame this?"* Restate the problem from the opposite perspective. What would a critic say the real problem is? What evidence would disprove the current hypothesis?

### Lens 3: Zoom Out One Level

**Bias targeted:** Symptom-fixing, functional fixedness (Senge's systems thinking)

Ask: *"Is this the problem, or a symptom of a bigger one?"* Place it in its larger system context. Is this the right level of abstraction? What pattern does it fit?

### Lens 4: Outsider Lens

**Bias targeted:** Cognitive entrenchment, expertise blindness (Scott Page's diversity bonus)

Ask: *"How would someone from a completely different background see this?"* Apply 2-3 outside perspectives — an economist, a psychologist, a first-time user — whichever creates the most productive contrast. What would they find obvious?

### Lens 5: Pre-Mortem

**Bias targeted:** Overoptimism, planning fallacy (Klein's pre-mortem)

Ask: *"It is 6 months on and this failed completely. What went wrong?"* Generate 3-5 specific failure scenarios. Which are most likely to be dismissed as improbable? Those are usually the real risks.

### Lens 6: Temporal Distance

**Bias targeted:** Reactive thinking, emotional proximity (Construal Level Theory)

Ask: *"How would you advise someone else on this in 2 years?"* Create psychological distance from immediate pressure. What is important versus noise? What decision would they wish they had made?

### Lens 7: The Meta-Question

**Bias targeted:** Question substitution, framing effects

Ask: *"Is this even the right question?"* Has the problem itself changed? Propose an alternative framing if one has emerged. Often the most valuable output.

## Next Actions

Rendered only for `--lens` invocations (see Component-Skill Contract). Call `AskUserQuestion`:

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Brainstorm (Recommended)"`, `description`: `"/superpowers:brainstorming — explore solutions for the reframed problem, then /claude-tweaks:specify to decompose the resulting design doc"`
- Option 2 — `label`: `"Another lens"`, `description`: `"/claude-tweaks:challenge --lens=<n[,n...]> {topic|#N} — apply a different lens to the same problem"`
- Option 3 — `label`: `"Specify now"`, `description`: `"/claude-tweaks:specify {ref} — shape this record into spec shape; framing-check runs automatically as part of it"`

## Component-Skill Contract

`framing-check` is **always** a component mode — invoked only by `/claude-tweaks:specify`, never by a human, and never renders `## Next Actions`.

`--lens` is **always** human-invoked and always renders `## Next Actions`. No pipeline orchestrator calls it.

The mode word in `$ARGUMENTS` is therefore the detection signal, and it is unambiguous — `$PIPELINE_RUN_DIR` is not consulted.

## Anti-Patterns

| Pattern | Why It Fails |
|---|---|
| Inventing a flaw to look rigorous when the framing holds | Manufactured doubt is as useless as false agreement — and here it trains the reader to ignore the verdict entirely. |
| Rendering `solution-baked` because the record names a technology | Naming a solution is not the defect; naming one that was never traded off is. Check for cited evidence first. |
| Resolving `framing-check` ambiguity toward `solution-baked` "to be conservative" | Inverted from this skill's siblings on purpose — see Step 2. Caution here means *not* flagging. |
| Dispatching `framing-check` as a Task agent | The caller already holds the body inline; a subagent only pays to re-derive it. |
| Writing a file, a brief, or a `decisions.md` entry from either mode | This skill renders a verdict or a perspective. Persistence is the caller's job. |
| Running `--lens` inside a pipeline | `--lens` is human-only. A pipeline that wants a framing judgment calls `framing-check`. |
| Offering solutions while applying a lens | Premature closure shuts down reframing — solutions belong in brainstorming. |
| Bracketing a challenge with flattery | Praise signals agreement and blunts the challenge before it lands. |
````

- [ ] **Step 3: Verify the four skill-convention constraints hold**

```bash
npm test 2>&1 | grep -A3 "skill-conventions" | head -20
```

Expected: PASS. If the Lifecycle-marker or fenced-block assertion fails, check that `Lifecycle:` sits on its own line and that no fenced block appears within 15 lines of the H1.

- [ ] **Step 4: Confirm the file shrank substantially**

```bash
wc -c skills/challenge/SKILL.md
```

Expected: well under the previous 19,321 bytes. Report the actual figure.

- [ ] **Step 5: Run the full suite**

```bash
npm test 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add skills/challenge/SKILL.md
git diff --cached --name-only
git commit -F - <<'EOF'
Rewrite /challenge as framing-check plus a --lens escape hatch

Replaces the seven-proposer MoA dispatch, the aggregator, and the
Brainstorming Brief schema with a two-line verdict contract rendered inline.
The seven lens definitions survive as --lens content.

framing-check resolves ambiguity toward `open`, deliberately inverted from
assess-agent-autonomy's modes: caution here means not manufacturing doubt.

Claude-Session: https://claude.ai/code/session_01W2Jm1rdXgHGoYgAFeAsq7r
EOF
```

---

### Task 3: Register the `framing:baked` label

**Files:**
- Modify: `bin/lib/issues/record.js` (the `LABELS` constant at `:16`, after `WONTFIX` at `:23`)
- Modify: `skills/_shared/label-bootstrap.md` (canonical `LABELS_JSON`, after the `upstream-candidate` pair at `:65`)
- Modify: `skills/_shared/work-record.md` (Label taxonomy table — new row after `Upstream (1)` at `:78`; per-skill write-authority table, the `/specify` shaper row)
- Modify: `bin/lib/issues/tests/labels.test.js` (coverage for the new label)
- **Not** `bin/lib/issues/labels.js` — see the correction in Step 1.

**Interfaces:**
- Consumes: nothing.
- Produces: the constant `LABELS.FRAMING_BAKED === 'framing:baked'`, and a bootstrap payload whose description is at most 100 characters. Task 4 writes this label; Task 7 reads it.

- [ ] **Step 1: Read how an existing one-member label family is defined**

```bash
grep -n "WONTFIX" bin/lib/issues/record.js
grep -n "wontfix\|upstream-candidate" skills/_shared/label-bootstrap.md
grep -n "Closure (1)\|Upstream (1)" skills/_shared/work-record.md
```

Follow the shape `wontfix` and `upstream-candidate` use — they are the two existing one-member families. Do **not** follow `parked` or `bot:blocked`; each belongs to a two-member family and is not a precedent for a presence-only label.

**Correction to an earlier draft of this plan:** `bin/lib/issues/labels.js` is **not** a label registry. It is an 18-line module exporting only `ensureLabelPayload(name, description)`, a validator that throws when a description exceeds 100 characters. There is no per-label entry to add there. The canonical descriptions live in `skills/_shared/label-bootstrap.md`'s `LABELS_JSON` array-of-pairs. Do not try to "register" the label in `labels.js`.

- [ ] **Step 2: Write the failing test**

Add to `bin/lib/issues/tests/labels.test.js`, matching the file's existing test style:

```javascript
test('framing:baked is bootstrappable with a description within the cap', () => {
  const payload = ensureLabelPayload(
    'framing:baked',
    'Framing: this record names a solution that was never traded off'
  );
  assert.strictEqual(payload.name, 'framing:baked');
  assert.ok(payload.description.length <= 100);
});

test('framing:baked is exported as a LABELS constant', () => {
  assert.strictEqual(LABELS.FRAMING_BAKED, 'framing:baked');
});
```

Adjust the `require` lines at the top of the test file if `LABELS` or `ensureLabelPayload` is not already imported there.

- [ ] **Step 3: Run the test to verify it fails**

```bash
node --test bin/lib/issues/tests/labels.test.js 2>&1 | tail -15
```

Expected: FAIL on `LABELS.FRAMING_BAKED` being `undefined`.

- [ ] **Step 4: Add the constant**

In `bin/lib/issues/record.js`, add to the `LABELS` object (after `WONTFIX`, keeping the existing ordering style):

```javascript
  FRAMING_BAKED: 'framing:baked',
```

- [ ] **Step 5: Add the bootstrap payload to `label-bootstrap.md`**

In `skills/_shared/label-bootstrap.md`'s canonical `LABELS_JSON` array, add this pair immediately after the `upstream-candidate` line, matching the file's existing column alignment:

```
  ["framing:baked",     "Framing: this record names a solution that was never traded off"],
```

The description is 62 characters, within the 100-character cap `ensureLabelPayload` enforces at `bin/lib/issues/labels.js:12`. Note the preceding line currently ends the array's non-priority block — keep the trailing comma correct so the array stays valid JS (the last element, `priority:low`, must remain comma-free).

No edit to `bin/lib/issues/labels.js` is needed or wanted.

- [ ] **Step 6: Run the test to verify it passes**

```bash
node --test bin/lib/issues/tests/labels.test.js 2>&1 | tail -15
```

Expected: PASS.

- [ ] **Step 7: Update the two `work-record.md` tables**

In `skills/_shared/work-record.md`:

Add a row to the Label taxonomy table (after the `Upstream (1)` row at `:78`):

```markdown
| Framing (1) | `framing:baked` | Marks a record whose stated problem names a solution that was never traded off; stamped by `/specify` via `/claude-tweaks:challenge`'s `framing-check`, absent means the framing read clean |
```

In the per-skill write-authority table at `:95`, add `framing:baked` to the `/specify` (shaper) row's writes column, alongside the existing `ceremony:*` entry.

- [ ] **Step 8: Update `label-bootstrap.md`**

Add `framing:baked` to `LABELS_JSON` in `skills/_shared/label-bootstrap.md`, with the same description string used in Step 5. The two must match exactly — a bootstrap description that disagrees with the code's is a silent drift.

- [ ] **Step 9: Sweep for a restated family count**

```bash
grep -rniE "label famil|core label|[0-9]+ (core )?labels" skills/ docs/ | grep -v "2026-08-07-challenge-framing-gate"
```

Read each hit. Any literal total that changed because of the new family must be updated, or converted to a by-reference phrasing per `[IL-40]`. Report what you found and what you changed.

- [ ] **Step 10: Run the full suite and commit**

```bash
npm test 2>&1 | tail -20
git add bin/lib/issues/record.js bin/lib/issues/labels.js bin/lib/issues/tests/labels.test.js skills/_shared/work-record.md skills/_shared/label-bootstrap.md
git diff --cached --name-only
git commit -F - <<'EOF'
Register the framing:baked label — one-member family, presence-only

Adds LABELS.FRAMING_BAKED, its bootstrap payload, the Label taxonomy row, and
/specify's write authority for it.

Modeled on wontfix and upstream-candidate, the two existing one-member
families. A two-value family would put framing:open on the large majority of
records as pure noise.

Claude-Session: https://claude.ai/code/session_01W2Jm1rdXgHGoYgAFeAsq7r
EOF
```

---

### Task 4: Wire `framing-check` into `/specify`'s two call sites

**Files:**
- Modify: `skills/specify/shaping-mode.md` (the `### Stamp scoring and stage labels` section around `:57`, and the compose-then-write-once section at `:62`)
- Modify: `skills/specify/record-creation.md` (the Ceremony bullet at `:104`)

**Interfaces:**
- Consumes: `framing-check`'s two-line output contract from Task 2, and `framing:baked` from Task 3.
- Produces: records that carry `framing:baked` and a Gotchas annotation when the verdict trips. Task 7 reads the label.

- [ ] **Step 1: Read both call sites and the compose-then-write-once discipline**

```bash
sed -n '51,70p' skills/specify/shaping-mode.md
sed -n '100,110p' skills/specify/record-creation.md
```

Note that shaping mode composes the body and writes it **once** (`### Compose-then-write-once`). The Gotchas annotation must be folded into that single compose pass, not applied as a second edit afterward.

- [ ] **Step 2: Add the framing bullet to `shaping-mode.md`**

Immediately after the existing `ceremony:*` bullet at `:57`, add:

```markdown
- **Framing** — invoke `/claude-tweaks:challenge` in `framing-check` mode (`Skill(skill: "claude-tweaks:challenge", args: "framing-check")`) against the now-shaped body **and** the `## Original request` block preserved above. On `FRAMING: solution-baked`, stamp the `framing:baked` label and fold the RATIONALE's named assumptions into the body's `## Gotchas` section as bullets, each carrying its validation status. On `FRAMING: open`, stamp nothing and add nothing — absence is the clean state. Bootstrap `framing:baked` per `_shared/label-bootstrap.md` before the first write. Both the Gotchas bullets and the label ride the single compose-then-write-once pass below — never a second edit.
```

- [ ] **Step 3: Add the framing bullet to `record-creation.md`**

Immediately after the existing Ceremony bullet at `:104`, add:

```markdown
**Framing** — invoke `/claude-tweaks:challenge` in `framing-check` mode (`Skill(skill: "claude-tweaks:challenge", args: "framing-check")`) against this leaf's own composed body — never the parent, which carries no scoring labels either. On `FRAMING: solution-baked`, stamp `framing:baked` on the leaf and fold the RATIONALE's named assumptions into that leaf's `## Gotchas` bullets. On `FRAMING: open`, stamp nothing. Leaves have no `## Original request` block, so the composed body is the whole input here.
```

- [ ] **Step 4: Verify both call sites reference the label and the mode correctly**

```bash
grep -n "framing-check\|framing:baked" skills/specify/shaping-mode.md skills/specify/record-creation.md
```

Expected: two hits per file minimum (mode invocation plus label). Confirm the `Skill(...)` invocation string matches Task 2's produced form exactly — `claude-tweaks:challenge` with args `framing-check`.

- [ ] **Step 5: Run the suite and commit**

```bash
npm test 2>&1 | tail -20
git add skills/specify/shaping-mode.md skills/specify/record-creation.md
git diff --cached --name-only
git commit -F - <<'EOF'
Call framing-check from /specify's two record-creation paths

Sits beside the existing ceremony-check call in both shaping mode and the
decomposition per-leaf loop. Shaping mode additionally judges the preserved
## Original request, which is the un-reframed source text.

Both the Gotchas bullets and the label ride shaping mode's single
compose-then-write-once pass.

Claude-Session: https://claude.ai/code/session_01W2Jm1rdXgHGoYgAFeAsq7r
EOF
```

---

### Task 5: Remove brief absorption from `/specify` and `/tidy`

**Files:**
- Modify: `skills/specify/record-creation.md:181,221,224`
- Modify: `skills/specify/decomposition-mode.md:23,228,254,262,274,304`
- Modify: `skills/tidy/SKILL.md:99`
- Modify: `skills/tidy/scan-procedures.md:96,107`

**Interfaces:**
- Consumes: nothing.
- Produces: a `/specify` that no longer looks for `docs/plans/*-brief.md`, and a `/tidy` that no longer classifies brief files as orphans.

- [ ] **Step 1: Enumerate the exact sites**

```bash
grep -rnEi "brainstorming brief|docs/plans/[^ ]*brief|\*-brief\.md" skills/specify/ skills/tidy/
```

Work from this list. It is the authoritative worklist for this task.

- [ ] **Step 2: Edit `skills/specify/record-creation.md`**

- `:181` — delete the `**Absorb the brainstorming brief**` bullet entirely.
- `:221` — change "Before Step 7 deletes the design doc and brief, absorb the last of their context" to name only the design doc.
- `:224` — the Assumptions bullet currently sources from the brief. Rewrite it to source from the design doc's own stated assumptions, and drop the `/claude-tweaks:challenge` attribution.

- [ ] **Step 3: Edit `skills/specify/decomposition-mode.md`**

- `:23` — delete the numbered item naming the brainstorming brief as an input.
- `:228` — drop "and brief's" from the absorption sentence.
- `:254` — the Design-doc coverage self-review item mentions only the doc; confirm no brief reference remains in that block.
- `:262` — reword so only the design doc "has served its purpose".
- `:274` — delete the `git rm docs/plans/YYYY-MM-DD-{topic}-brief.md` line.
- `:304` — delete the "Brainstorming brief:" reporting line.

Renumber any list whose items you deleted, and per `[IL-86]` grep the same file afterward for references to the old numbering:

```bash
grep -n "step 2\|item 2\|the second" skills/specify/decomposition-mode.md
```

- [ ] **Step 4: Edit `skills/tidy/`**

- `skills/tidy/SKILL.md:99` — remove `docs/plans/*-brief.md` from the scan-target cell, leaving `docs/superpowers/specs/*-design.md`.
- `skills/tidy/scan-procedures.md:96` — remove `and docs/plans/*-brief.md` from the scan sentence.
- `skills/tidy/scan-procedures.md:107` — delete the `**Brief classification**` block entirely.

- [ ] **Step 5: Verify the concept is gone from both skills**

```bash
grep -rnEi "brainstorming brief|docs/plans/[^ ]*brief|\*-brief\.md" skills/specify/ skills/tidy/
```

Expected: no output.

- [ ] **Step 6: Run the suite and commit**

```bash
npm test 2>&1 | tail -20
git add skills/specify/record-creation.md skills/specify/decomposition-mode.md skills/tidy/SKILL.md skills/tidy/scan-procedures.md
git diff --cached --name-only
git commit -F - <<'EOF'
Drop brainstorming-brief absorption from /specify and /tidy

The brief is no longer produced, so absorbing it, deleting it in Step 7, and
classifying it during /tidy's orphan scan are all dead paths.

Assumptions now reach leaf Gotchas from framing-check at record-creation time
instead of from a separate file.

Claude-Session: https://claude.ai/code/session_01W2Jm1rdXgHGoYgAFeAsq7r
EOF
```

---

### Task 6: Remove brief references from `/build`, `/wrap-up`, and the ADR contract

**Files:**
- Modify: `skills/build/SKILL.md:123,139`
- Modify: `skills/wrap-up/config-updates.md:31`
- Modify: `skills/_shared/decision-records.md:42`

**Interfaces:**
- Consumes: nothing.
- Produces: an ADR gate with three candidate sources instead of four.

- [ ] **Step 1: Delete the two `/build` references**

- `skills/build/SKILL.md:123` — delete the bullet beginning "If a brainstorming brief exists".
- `skills/build/SKILL.md:139` — delete the "The brainstorming brief (if it exists)" list item.

- [ ] **Step 2: Remove the brief from the ADR candidate sources**

`skills/wrap-up/config-updates.md:31` — delete the `[ADR-candidate]`-tagged-constraints-in-the-brief bullet. The remaining three sources (`/build` Common Step 4.5 deviations, `/deepen` interface trade-offs, `/review` and reflection tradeoffs) stay untouched.

- [ ] **Step 3: Update the ADR contract**

`skills/_shared/decision-records.md:42` — delete the `/claude-tweaks:challenge` row from the producer table. Confirm nothing else in that file claims challenge flags ADR candidates:

```bash
grep -n "challenge" skills/_shared/decision-records.md
```

Expected: no output after the edit.

- [ ] **Step 4: Confirm the ADR gate still has three sources**

```bash
sed -n '25,40p' skills/wrap-up/config-updates.md
```

Expected: the "Gather decision candidates" list has exactly three bullets.

- [ ] **Step 5: Run the suite and commit**

```bash
npm test 2>&1 | tail -20
git add skills/build/SKILL.md skills/wrap-up/config-updates.md skills/_shared/decision-records.md
git diff --cached --name-only
git commit -F - <<'EOF'
Drop the brief as an ADR candidate source and a /build input

The ADR gate keeps its other three sources. The brief-sourced input produced
exactly one ADR in this repo's history, and that ADR already exists.

Claude-Session: https://claude.ai/code/session_01W2Jm1rdXgHGoYgAFeAsq7r
EOF
```

---

### Task 7: Surface the verdict in `/backlog refine` and `/help`

**Files:**
- Modify: `skills/backlog/refine-mode.md` (Step 4 unified table at `:160-183`)
- Modify: `skills/help/status-scan.md:80`

**Interfaces:**
- Consumes: `framing:baked` from Task 3, written by Task 4.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Read the informational-column precedent**

```bash
sed -n '160,178p' skills/backlog/refine-mode.md
```

Note `:175` — `Suggested Tier` "rides along with the unified table, never gated behind its own `AskUserQuestion`, and is never itself written anywhere." The Framing column follows this exactly.

- [ ] **Step 2: Add the Framing column to the table**

Update the table header and the example rows at `:165-171` to carry a `Framing` column between `Suggested Tier` and `Rationale`. Render `baked` when the record carries `framing:baked`, and `—` otherwise.

Then add a paragraph after the `Suggested Tier` explanation at `:175`:

```markdown
The `Framing` column reads the `framing:baked` label stamped by `/claude-tweaks:specify` (via `/claude-tweaks:challenge`'s `framing-check`). Like `Suggested Tier` it is informational only — it rides along with the unified table, is never gated behind its own `AskUserQuestion`, and is never written by this skill. A `baked` row is not a reason to withhold a grant; it is a prompt to read the record's `## Gotchas` before approving one.
```

- [ ] **Step 3: Replace `/help`'s title heuristic with a label read**

`skills/help/status-scan.md:80` currently scans record titles for solution-oriented phrasing. Replace the derivation with a label read: flag records carrying `framing:baked`. Keep the same Needs Attention table output shape, and update the surrounding sentence so it no longer describes a title-only signal.

- [ ] **Step 4: Verify no stale title-heuristic prose survives**

```bash
grep -rn "solution-baked\|solution-oriented\|baked-in" skills/help/
```

Read each hit. Any sentence still describing a title-derived signal must be updated — per `[IL-93]`, prose describing a mechanism's old reach stays true-sounding while going incomplete.

- [ ] **Step 5: Run the suite and commit**

```bash
npm test 2>&1 | tail -20
git add skills/backlog/refine-mode.md skills/help/status-scan.md
git diff --cached --name-only
git commit -F - <<'EOF'
Surface the framing verdict in /backlog refine and /help

Adds an informational Framing column to refine's existing single-gate batch
table, following the Suggested Tier precedent — zero new prompts.

/help now reads the framing:baked label instead of guessing solution-baking
from record titles.

Claude-Session: https://claude.ai/code/session_01W2Jm1rdXgHGoYgAFeAsq7r
EOF
```

---

### Task 8: Remove Mode 4 from the shared contract documents

**Files:**
- Modify: `skills/_shared/multi-agent-coordination.md:3,21,30,221ff`
- Modify: `skills/_shared/subagent-output-contract.md:90,148,208`
- Modify: `skills/_shared/auto-mode-contract.md:181`

Note `:21` — "(or layered, for MoA)" in the coordination-caller sentence. It was not in the design doc's site list; the Step 1 grep below is what surfaces it. Trust the grep over any hand-authored list, here and in Task 9.

**Interfaces:**
- Consumes: Task 1's deletion of the implementation.
- Produces: a three-mode coordination primitive.

- [ ] **Step 1: Enumerate every site**

```bash
grep -rnEi "moa|proposer|aggregator" skills/ docs/ bin/ tests/ | grep -v "2026-08-07-challenge-framing-gate"
```

Baseline before this task: 9 files. Work from this list.

- [ ] **Step 2: Edit `multi-agent-coordination.md`**

- `:3` — drop "and `/challenge` (Layered MoA)" from the consumer sentence, leaving `/review` and `/specify`.
- `:21` — drop "(or layered, for MoA)" from the coordination-caller sentence; the remaining three modes all run in parallel, not layered.
- `:30` — delete the `Layered MoA` row from the mode comparison table.
- `:221` onward — delete the entire `## Mode 4 — Layered MoA` section.
- Check the file's own framing: it describes "four intra-family coordination modes" at `:3`. Change to three, or to a by-reference phrasing per `[IL-40]`.

- [ ] **Step 3: Edit `subagent-output-contract.md`**

- `:90` — remove the `/challenge` Mode 4 aggregator example from the Capable-tier row, keeping the `/review` and `/specify` examples.
- `:148` — delete the paragraph describing `/challenge`'s per-lens proposers as a non-Template-A/B/C case. If the surrounding section exists only to host that example, keep the general principle sentence ("When a dispatch's output genuinely doesn't fit A/B/C, define the format explicitly in the dispatch prompt") and drop only the challenge-specific framing.
- `:208` — remove `Layered MoA` from the parenthetical mode list.

- [ ] **Step 4: Edit `auto-mode-contract.md`**

`:181` — delete the `/challenge`'s Listen + Reflect-back row from the not-silenced table. Those steps no longer exist. Confirm no other row references challenge:

```bash
grep -n "challenge" skills/_shared/auto-mode-contract.md
```

- [ ] **Step 5: Verify the vocabulary is gone from the shared contracts**

```bash
grep -rnEi "moa|proposer|aggregator" skills/_shared/
```

Expected: no output.

- [ ] **Step 6: Run the suite and commit**

```bash
npm test 2>&1 | tail -20
git add skills/_shared/multi-agent-coordination.md skills/_shared/subagent-output-contract.md skills/_shared/auto-mode-contract.md
git diff --cached --name-only
git commit -F - <<'EOF'
Remove Mode 4 (Layered MoA) from the shared coordination contracts

/challenge was its only consumer and no longer dispatches subagents. The
primitive now documents three modes.

Claude-Session: https://claude.ai/code/session_01W2Jm1rdXgHGoYgAFeAsq7r
EOF
```

---

### Task 9: Sweep lifecycle-chain and command-reference prose

The widest task, and the one `[IL-10]` and `[IL-21]` warn about: these files are untouched by every prior task, so no per-task review can catch them.

**Files:**
- Modify: `skills/capture/SKILL.md:4,31,165,187,201,232,238`
- Modify: `skills/help/SKILL.md:14,78,85,92`
- Modify: `skills/help/reference-card.md:11,68,132,169`
- Modify: `skills/help/context-flow.md:10,26,27,54,55,56`
- Modify: `skills/flow/SKILL.md:14,304`
- Modify: `skills/flow/steps-and-gates.md:18`
- Modify: `skills/tidy/SKILL.md:14`
- Modify: `skills/research/SKILL.md:22,99,100,106`
- Modify: `skills/build/SKILL.md:14`
- Modify: `docs/skill-graph.md:74,84`
- Modify: `docs/getting-started.md:9,11`
- Modify: `docs/plugin-structure.md:33`
- Modify: `README.md` (only if the sweep in Step 1 returns hits there)

**Interfaces:**
- Consumes: the final shape of `/challenge` from Task 2.
- Produces: nothing.

- [ ] **Step 1: Build the authoritative worklist**

```bash
grep -rn "challenge" skills/ docs/ README.md | grep -v "2026-08-07-challenge-framing-gate" | grep -vi "challenging\|challenges"
```

Every hit is either a lifecycle-chain mention, a command-reference entry, or a routing option. Work the list top to bottom.

- [ ] **Step 2: Fix the lifecycle chains**

`/challenge` is no longer a stage between capture and brainstorming — it is a component of `/specify`. Every linear chain of the form `capture → challenge → brainstorming → specify` becomes `capture → specify` (or `capture → brainstorming → specify` where brainstorming is genuinely the next step). Affected: `skills/help/SKILL.md:14`, `skills/tidy/SKILL.md:14`, `skills/flow/SKILL.md:14`, `skills/build/SKILL.md:14`, `docs/plugin-structure.md:33`.

- [ ] **Step 3: Fix `/capture`'s routing**

- `:4` — remove `challenge` from the `argument-hint` `--route` alternation.
- `:31`, `:165`, `:201` — remove the `challenge` route row and its execution branch.
- `:187` — delete routing Option 1 ("Challenge first"), renumber the remaining options, and re-check the "4 options only when Option 4 is visible" sentence at `:190`, which now describes a different arithmetic.
- `:232` — delete Next Actions Option 4 ("Challenge").
- `:238` — delete the paragraph making capture a parent of `/challenge`.

Per `[IL-86]`, after renumbering grep the same file for stale option references:

```bash
grep -n "Option [0-9]" skills/capture/SKILL.md
```

- [ ] **Step 4: Fix `/help`**

- `:78` — the Challenge + Brainstorming stage no longer suggests running challenge first; it suggests brainstorming directly.
- `:85`, `:92` — delete the `### Detecting Items That Need /claude-tweaks:challenge` section and its mode-recommendation paragraph. Task 7 already replaced the underlying signal with a label read at `status-scan.md:80`.
- `reference-card.md:11` — update the command row to the new `argument-hint`: `framing-check | --lens=<n[,n...]> <#n|topic|problem statement>`.
- `reference-card.md:68` — update the example invocation to a `--lens` form.
- `reference-card.md:132` — the artifact table lists challenge producing a Brief; change to `—`.
- `reference-card.md:169` — remove `/challenge` lenses from the never-silenced list.
- `context-flow.md:10,27` — remove challenge from the context-survival example and the pipeline diagram.
- `context-flow.md:26,54,55,56` — remove the `docs/plans/*-brief.md` column entries and the `/challenge` row.

- [ ] **Step 5: Fix `/flow` and `/research`**

- `flow/SKILL.md:304` and `flow/steps-and-gates.md:18` — `challenge` is no longer a not-allowed-in-flow interactive skill in its own right. Remove it from both lists.
- `research/SKILL.md:22,99,100,106` — remove the `/challenge` consumer mention, the "Debias a problem" Next Action option, and the challenge entry in the Component-Skill Contract parent list.

- [ ] **Step 6: Update `docs/skill-graph.md`**

- `:74` — rewrite the edge description: challenge is now a component of `/specify`, not a stage before brainstorming.
- `:84` — the `## challenge` section needs its edge table rewritten to name `/specify` as its only caller, plus `_shared/work-record.md` for the label contract.

Add the reciprocal edge under `## specify` naming `/challenge` as a component it invokes.

- [ ] **Step 7: Update `docs/getting-started.md`**

`:9` — remove "or pulled into the pipeline by `/claude-tweaks:challenge`". `:11` — rewrite the `/challenge` paragraph to describe the two-mode skill, and confirm it no longer promises a Brief.

- [ ] **Step 8: Verify both concepts are fully swept**

```bash
grep -rnEi "brainstorming brief|docs/plans/[^ ]*brief|\*-brief\.md" skills/ docs/getting-started.md docs/plugin-structure.md docs/skill-graph.md bin/ tests/ | grep -v "2026-08-07-challenge-framing-gate"
```

Expected: no output.

```bash
grep -rn "challenge" skills/ docs/skill-graph.md docs/getting-started.md docs/plugin-structure.md README.md | grep -v "2026-08-07-challenge-framing-gate" | grep -vi "challenging\|challenges"
```

Expected: every remaining hit describes the *new* two-mode skill. Read each one; do not accept a count.

Confirm the untouched sibling concepts survived — this is the `[IL-37]` check:

```bash
ls skills/wrap-up/verification-brief.md
grep -rln "verification brief" skills/demo/ skills/wrap-up/
```

Expected: the file exists and `/demo` still references it.

- [ ] **Step 9: Run the suite and commit**

```bash
npm test 2>&1 | tail -20
git add -A skills/ docs/ README.md
git diff --cached --name-only
git commit -F - <<'EOF'
Sweep lifecycle and command-reference prose for the reshaped /challenge

/challenge is no longer a pipeline stage between capture and brainstorming;
it is a component invoked by /specify. Updates every linear chain, capture's
routing options, /help's reference card and context-flow tables, flow's
not-allowed list, research's cross-references, the skill graph, and the
getting-started description.

Claude-Session: https://claude.ai/code/session_01W2Jm1rdXgHGoYgAFeAsq7r
EOF
```

---

### Task 10: Whole-branch review, then version bump and changelog

Per CLAUDE.md's Releasing section, the broad cross-task review runs **before** the bump, not after. A producer and its consumers sit in different files throughout this plan, so per-task review cannot see the pairs by construction.

**Files:**
- Modify: `.claude-plugin/plugin.json` (version)
- Modify: `CHANGELOG.md` (new entry, same commit as the bump)
- Modify: `docs/shipped-versions.tsv` (new line, same commit as the bump)

**Interfaces:**
- Consumes: every prior task.
- Produces: a release-ready branch.

- [ ] **Step 1: Run the whole-branch review**

```bash
git log --oneline main..HEAD
git diff --stat $(git merge-base HEAD main)..HEAD
```

Review the complete diff against the design doc. Check specifically for the cross-boundary failures this plan is exposed to:
- Does Task 4's `Skill(...)` invocation string exactly match the mode name Task 2 shipped? (`[IL-04]` — producer/consumer output shape.)
- Does the label string in Task 3's code exactly match the one Task 4's prose writes and Task 7's prose reads?
- Did Task 3's `label-bootstrap.md` description stay byte-identical to `labels.js`'s?
- Did any renumbering in Tasks 5 or 9 leave a stale cross-reference in the same file? (`[IL-86]`.)

- [ ] **Step 2: Re-run the two sweeps one final time**

```bash
grep -rnEi "brainstorming brief|docs/plans/[^ ]*brief|\*-brief\.md" skills/ docs/getting-started.md docs/plugin-structure.md docs/skill-graph.md bin/ tests/ | grep -v "2026-08-07-challenge-framing-gate"
grep -rnEi "moa|proposer|aggregator" skills/ bin/ tests/ | grep -v "2026-08-07-challenge-framing-gate"
```

Expected: no output from either.

- [ ] **Step 3: Confirm the retained artifact survived**

```bash
ls docs/plans/2026-07-08-worktree-directory-convention-brief.md
grep -n "brief" docs/decisions/0004-worktree-two-domain-convention.md
```

Expected: the file exists and ADR 0004 still cites it. This file is deliberately retained; deleting it orphans a shipped decision record.

- [ ] **Step 4: Claim a version number**

```bash
git fetch origin main
git log --oneline -5 origin/main -- .claude-plugin/plugin.json
grep -rn "6\.5[0-9]\." docs/superpowers/plans/ | grep -v "2026-08-07-challenge-framing-gate"
git worktree list
```

Then, for each sibling worktree branch listed, check for an unmerged bump:

```bash
git log --oneline main..<branch> -- .claude-plugin/plugin.json
```

Take the next free version. This is a feature addition, so bump the **minor** version. If any check shows a collision, renumber yours — a version is claimed by whatever ships first.

- [ ] **Step 5: Bump, changelog, and shipped-versions in one commit**

Edit `.claude-plugin/plugin.json`'s `version`. Add to `CHANGELOG.md` directly under the `# Changelog` header, using the exact heading shape `bin/lib/changelog.js` parses:

```markdown
## v{version} — /challenge becomes an inline framing gate

- `/claude-tweaks:challenge` is now a two-mode skill: `framing-check`, a component mode invoked by `/claude-tweaks:specify` that renders a `FRAMING: open | solution-baked` verdict, and `--lens`, a human-invoked debiasing escape hatch. The seven-proposer MoA dispatch, the aggregator, and the Brainstorming Brief artifact are removed.
- Records whose framing bakes in an untraded-off solution now carry a `framing:baked` label and surfaced assumptions in their own `## Gotchas`, instead of a separate `docs/plans/*-brief.md` file that nothing reliably read.
- The verdict surfaces as an informational column in `/claude-tweaks:backlog refine`'s existing batch table. No new user-facing prompts anywhere.
- Mode 4 (Layered MoA) is removed from `_shared/multi-agent-coordination.md` and `bin/lib/coordination.js` — `/challenge` was its only consumer.
```

Append to `docs/shipped-versions.tsv`: `{version}\t2026-08-07\trelease`.

- [ ] **Step 6: Verify the changelog coverage gate passes**

```bash
npm test 2>&1 | grep -A5 "changelog-coverage" | head -20
```

Expected: PASS. A failure here means the heading is unparseable, duplicated, or the version has no entry.

- [ ] **Step 7: Full suite, then commit**

```bash
npm test 2>&1 | tail -20
git add .claude-plugin/plugin.json CHANGELOG.md docs/shipped-versions.tsv
git diff --cached --name-only
git commit -F - <<'EOF'
Release v{version} — /challenge becomes an inline framing gate

Claude-Session: https://claude.ai/code/session_01W2Jm1rdXgHGoYgAFeAsq7r
EOF
```

- [ ] **Step 8: Report what remains**

The marketplace mirror (`thomasholknielsen/claude-tweaks-marketplace`) still needs `plugins[].version` bumped to match and `metadata.version` bumped on its own scheme. Per CLAUDE.md that is authorized as part of the same release action — do not stop to ask. Report it as done or as blocked, explicitly.

---

## Self-Review

**Spec coverage** — every design section maps to a task:

| Design section | Task |
|---|---|
| §1 two-mode `/challenge` | 2 |
| §2 two call sites | 4 |
| §3 output contract, `open` on ambiguity | 2 |
| §4 Gotchas annotation | 4 |
| §5 `/backlog refine` column | 7 |
| §6 `framing:baked` label, three registration edits | 3 |
| §7 brief lifecycle removal | 5, 6 |
| §7 Mode 4 removal | 1 (code), 8 (docs) |
| §7 executable-code table | 1, 3 |
| §7 retained artifact | 10 Step 3 |
| §Risks sweep mitigations | 9 Step 8, 10 Step 2 |

**Type consistency** — three strings must match across task boundaries, and Task 10 Step 1 checks each: the mode name `framing-check` (Tasks 2, 4), the label `framing:baked` (Tasks 3, 4, 7), and the bootstrap description (Task 3 Steps 5 and 8, which must be byte-identical).

**Known gap accepted deliberately:** `framing-check` ships without a calibration table, because none can be drawn from real cases before it runs. The design notes this under Risks. Expect recalibration after the first several `/specify` runs, and prefer `open` while calibrating.
