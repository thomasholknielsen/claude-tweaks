# init policy-review delegation (record #536) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `skills/init/policy-review.md`'s "Show details" pass delegates its detail render to `skills/help/policy.md`'s Render contract; init's update-mode summary gains a pointer line; the skill graph records the delegation.

**Architecture:** Citation-swap, not rewrite — the gather/count/skip skeleton (#388) is untouched; only the "On Show details" body and the option-2 description change.

**Tech Stack:** Markdown prose only.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T074746-spec-533-534-536/spec-536/work/536-spec.md`

## Global Constraints

- Non-Goals are hard: the `auditPolicy()` call (line 15), the one-line count sentence ("Always surface a one-line count…", lines 25-29), the count-before-question ordering, the skip-first option, and the never-writes rule all survive byte-identical.
- Cross-skill sub-file reads are by explicit PATH (`skills/help/policy.md`), never a Skill-tool invocation of `/claude-tweaks:help` (which would run the whole mode).
- Content parity (AC 2) resolves one known gap via the contract's own affordance, never local prose: the old spec rendered a full defaults table for a from-scratch project (onboarding); the delegated render covers it by instructing that when zero recognized keys are set, init's entrance additionally triggers the contract's own "show advanced" expansion (defaults grouped by category with summaries).
- The init entrance is read-only: it renders contract sections 1-4 and ends with one closing line pointing at `/claude-tweaks:help policy` for edits — it never runs the contract's Next Actions apply path or its probes-driven section-3 recommendations as apply options.
- `docs/skill-graph.md`: the `/init`→`/help` pair already has one row (line ~244) — the delegation extends THAT row with one sentence (one row per pair, stated once); do not add a second row for the pair. AC 5's "exactly one new edge" is the new relationship sentence.
- M9 carry-over from #534's review (context, no action needed here): the count line's data comes from `auditPolicy()` before the question, independent of the contract's sections — this plan's Non-Goals already preserve exactly that.

---

### Task 1: The citation-swap in `skills/init/policy-review.md` + the two satellite edits

**Files:**
- Modify: `skills/init/policy-review.md` (lines ~38-47: option-2 description + the "On Show details" paragraph)
- Modify: `skills/init/summary-templates.md` (one line in the `## Update Mode Summary` block, ~line 86 onward)
- Modify: `docs/skill-graph.md` (extend the existing `/init`→`/help` row, ~line 244)

- [ ] **Step 1: policy-review.md — replace the option-2 description**

Old description: `"Render every set lever with its value and what it does, plus a table of the {N} issue(s) found"`
New description: `"Render the policy configuration per skills/help/policy.md's Render contract (read-only), plus the {N} issue(s) found"`

- [ ] **Step 2: policy-review.md — replace the "On Show details" paragraph (lines 41-47) with:**

```markdown
On **Show details**: read `skills/help/policy.md` (an explicit cross-skill path read — never a
`Skill`-tool invocation of `/claude-tweaks:help`, which would run the whole mode, gather
included) and produce its Render contract's four sections in order — Set levers, Issues, Notable
defaults, Advanced tier — from that file's own Gather commands. This entrance is **read-only**:
render the sections, then close with one line — "To change any of these, run
`/claude-tweaks:help policy` — its Next Actions apply edits with validation." — and never run the
contract's apply path from here. When zero recognized keys are set (a from-scratch
`policy.yml`), additionally trigger the contract's own "show advanced" expansion so the
walkthrough still functions as onboarding — the defaults render grouped by category with each
lever's summary, via the contract's affordance rather than a local table.
```

Keep everything above the question (gather, count sentence, skip-first option) and the closing "This check never writes…" paragraph byte-identical — the Actions Performed row line stays too.

- [ ] **Step 3: summary-templates.md** — in the `## Update Mode Summary` section, add one line (placed with the section's closing guidance, matching its prose register):

```markdown
Include one standing-surface pointer line: `Policy review any time: /claude-tweaks:help policy` — the standing config review surface outside init.
```

Read the section first and place/format the line consistently with how the template presents other one-line guidance.

- [ ] **Step 4: skill-graph.md** — extend the existing `/init`→`/help` row's text cell (the row currently describing "/init configures the workflow system /help reports on…") with one sentence:

```
Update Mode's Policy Configuration Review (policy-review.md) delegates its "Show details" render to skills/help/policy.md's Render contract — one renderer, two entrances; init's entrance is read-only and points at /claude-tweaks:help policy for edits.
```

- [ ] **Step 5: Verify**

- `grep -c "Render every set lever" skills/init/policy-review.md` → 0 (old spec gone)
- `grep -c "skills/help/policy.md" skills/init/policy-review.md` → ≥ 2 (option description + detail paragraph)
- `grep -c "Always surface a one-line count" skills/init/policy-review.md` → 1 (survives verbatim)
- `grep -c "help policy" skills/init/summary-templates.md` → 1
- `grep -c "policy-review.md" docs/skill-graph.md` → 1
- `grep -c "Meaning column" skills/init/policy-review.md` → 0 (the old lookup instruction gone)

- [ ] **Step 6: Commit**

```bash
git add skills/init/policy-review.md skills/init/summary-templates.md docs/skill-graph.md
git commit -m "Delegate init policy-review detail render to the /help policy contract — refs #536"
```

---

### Task 2: Controller verification (no dispatch)

- [ ] **Step 1:** AC 2 parity checklist composed for the PR: old (a) issues batch tables → contract §2; old (b) set levers Key|Value|Meaning → contract §1 rows + summary field; old (c) from-scratch defaults onboarding table → contract's "show advanced" expansion triggered at zero set keys.
- [ ] **Step 2:** `npm test` (central) — AC 6.
