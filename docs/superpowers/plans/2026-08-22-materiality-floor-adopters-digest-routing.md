# Materiality Floor Adopters — Digest Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the ten adopter files to cite `_shared/materiality-floor.md` at their record-filing points, so a legitimately-deferred finding that scores `size:low` AND `priority:low` AND `risk:low` (with `Defer-reason: tangential` always clearing) lands as one digest entry instead of a first-class issue.

**Architecture:** One mechanical citation pattern, applied at each file's existing filing/staging point: after the deferral gate (or, for the four health sweeps, after existing dedup) produces a would-be-new filing, insert a floor consultation before the record/issue is actually composed. Below floor → route to the digest container per `_shared/materiality-floor.md`'s Entry format/Container sections. At/above floor → file exactly as today. No adopter restates the floor's definition — every insertion cites the contract by path.

**Tech Stack:** Markdown skill files (`plugin/skills/**/*.md`), `node --test` conformance tests, `bin/lib/issues/record.js` (`recordPayload`/`specShapedBody`, unchanged by this plan), `bin/lib/health-core/digest.js` (the four health sweeps' pre-existing per-origin `{PREFIX}:digest` cap mechanism — unchanged by this plan, but explicitly ordered against the new floor check; see Global Constraint 6 below on why the two "digest" concepts must never be conflated in prose).

**Spec:** `.claude-tweaks/pipelines/2026-08-22T084440-spec-1261-1262-1263-1264/spec-1262/work/1262-spec.md` (record #1262). Depends on `_shared/materiality-floor.md` and `_shared/deferral-gate.md` as shipped by spec #1261 (already merged into this branch — read both fresh from disk before starting any task; do not rely on this plan's paraphrase of them).

## Global Constraints

1. Cite `_shared/materiality-floor.md` by path in every insertion. Never restate the floor's three-axis definition (`size:low` AND `priority:low` AND `risk:low`), the entry format, or the container shapes — those live only in that one file.
2. Preserve existing dedup-before-floor ordering in the four health sweeps: an existing-issue match still updates that issue directly; the floor is consulted only for a would-be-**new** filing.
3. Every touched file must stay ≤ 40,960 bytes (`tests/bin-lib/skill-audit/context-cost.test.js`). Measure `wc -c` before and after every edit in this plan; record both numbers in the task's own commit message.
4. `Defer-reason: tangential` always clears the floor and files as an issue regardless of score. No adopter's citation may imply an unconditional "low scores → digest" shortcut — always state the override explicitly or point at the file section that does.
5. Locate each file's actual filing branch(es) by reading the file fresh and grepping for its existing `_shared/deferral-gate.md` citation, its `recordPayload`/`specShapedBody` call, or (for the four health sweeps) its "Drain-rate cap and digest mode" paragraph — this plan's line numbers are a snapshot from plan-authoring time and may have shifted by execution time; re-locate by content, not by line number, before editing.
6. **Two distinct "digest" concepts exist in this codebase after this plan lands — never let an insertion's prose blur them.** The four health sweeps already have a **per-origin cap-based digest** (`_shared/health-filing-digest.md`; a `{PREFIX}:digest` issue, e.g. `code-health:digest`, that a finding overflows into only once that origin's `health-open-cap` throttle is exceeded). This plan adds a **separate, single, shared materiality digest** (`_shared/materiality-floor.md`; one `digest`-labeled container per work-backend, populated by *scoring*, not by volume). In every health-sweep task below, refer to the pre-existing mechanism as "the cap digest" or by its literal `{PREFIX}:digest` label, and the new one as "the materiality digest" or "the floor's digest container" — never bare "the digest" in prose that could refer to either.
7. **Ordering between the two digest mechanisms (health sweeps only):** the materiality floor is consulted immediately after dedup and before the cap-digest check. A would-be-new finding first asks "is this even worth a record at all" (the floor); only a finding that clears the floor (at/above it, or `tangential`) proceeds to ask "do we have too many open singleton issues of this origin already" (the cap). A below-floor finding never reaches the cap check — it already left the singleton-issue path entirely.
8. This plan does not change `bin/lib/issues/record.js`, `bin/lib/health-core/digest.js`, or any other code — every task is a prose-only edit to a `plugin/skills/**/*.md` file plus the `docs/skill-graph.md` and `tests/materiality-floor-conformance.test.js` additions in Task 6.

---

### Task 1: `plugin/skills/review/step3-routing.md` — Defer and Capture branches

**Files:**
- Modify: `plugin/skills/review/step3-routing.md` (Defer bullet and Capture bullet, both under "**When 'Fix now' isn't possible**, route to the right destination:")

**Interfaces:**
- Consumes: `_shared/materiality-floor.md`'s Entry format (`- [{area}] {one-line finding} — {file refs} — Defer-reason: {value} — {provenance}`) and Container section, as shipped by #1261.
- Produces: nothing consumed by a later task in this plan — this task is independent of Tasks 2-5.

- [ ] **Step 1: Measure current size**

```bash
wc -c plugin/skills/review/step3-routing.md
```

Record the byte count.

- [ ] **Step 2: Locate the Defer bullet**

```bash
grep -n "^- \*\*Defer\*\*" plugin/skills/review/step3-routing.md
```

This is the bullet beginning `- **Defer** (new work record — born-ready, or \`parked\` on a concrete wake condition)...` and ending `...a finding naming an open product choice routes to Capture instead (\`tangential\` captures).`

- [ ] **Step 3: Insert the floor consultation into the Defer bullet**

Append this sentence to the end of that bullet (after the existing final sentence, still inside the same bullet — do not start a new bullet):

```
Before composing, apply `_shared/materiality-floor.md`'s floor test to this item (judged the same way this bullet already scores `risk`/`size` for `recordPayload`): when it fails to clear the floor, and `Defer-reason` is not `tangential` (which always clears the floor per that contract's Overrides section), route it to the digest container instead of creating a record — skip the rest of this bullet's `specShapedBody`/`recordPayload`/`gh issue create` steps for that item.
```

- [ ] **Step 4: Locate the Capture bullet**

```bash
grep -n "^- \*\*Capture\*\*" plugin/skills/review/step3-routing.md
```

This is the bullet: `- **Capture** — the finding is complex or uncertain and needs brainstorming/exploration before it can be acted on. Invoke \`/claude-tweaks:capture\` with the shaped body and \`--defer-reason={value} --source review\` (capture's Shaped-body branch — \`capture/SKILL.md\`), plus \`--needs-definition\` when the finding names an open choice.`

- [ ] **Step 5: Insert the floor consultation into the Capture bullet**

Append this sentence to the end of that bullet:

```
This branch's items always carry `Defer-reason: tangential` (per the Defer bullet above), which `_shared/materiality-floor.md`'s override always clears — a Capture-routed finding never routes to the digest container; it always files via `/claude-tweaks:capture` as above. Cited here so the contract's floor-mapping covers every filing branch in this file, not because this branch's behavior changes.
```

- [ ] **Step 6: Verify the ceiling**

```bash
wc -c plugin/skills/review/step3-routing.md
```

Confirm the result is ≤ 40,960. Record before/after byte counts.

- [ ] **Step 7: Run the conformance and ceiling suites**

```bash
node --test tests/deferral-gate-conformance.test.js
node --test tests/bin-lib/skill-audit/context-cost.test.js
```

Expected: both PASS (this task doesn't yet touch `tests/materiality-floor-conformance.test.js` — that's Task 6).

- [ ] **Step 8: Commit**

```bash
git add plugin/skills/review/step3-routing.md
git commit -m "Cite materiality-floor.md in review's Defer and Capture branches (step3-routing.md: {before}B -> {after}B)"
```

Substitute the actual byte counts from Steps 1 and 6 for `{before}`/`{after}`.

---

### Task 2: `plugin/skills/wrap-up/residue-sweep.md` + `plugin/skills/wrap-up/leftover-routing.md`

**Files:**
- Modify: `plugin/skills/wrap-up/residue-sweep.md` (`## remedy: record findings` section)
- Modify: `plugin/skills/wrap-up/leftover-routing.md` (`## Staging (every mode — policy lookup)` section)

**Interfaces:**
- Consumes: `_shared/materiality-floor.md` (as Task 1).
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Measure current sizes**

```bash
wc -c plugin/skills/wrap-up/residue-sweep.md plugin/skills/wrap-up/leftover-routing.md
```

- [ ] **Step 2: Locate residue-sweep.md's filing point**

```bash
grep -n "composes exactly as ledger Phase 3" plugin/skills/wrap-up/residue-sweep.md
```

This is inside the `## remedy: record findings` section, in the paragraph that reads: `_shared/deferral-gate.md` governs the routing: a proposal routed from here carries a `Defer-reason:` per this mapping — ... A `remedy: record` item Phase 2 routes to a record composes exactly as ledger Phase 3's branches do (`_shared/ledger-format.md`) — `specShapedBody`, the #621 mapping above supplying its `Defer-reason:`, landing born-ready, parked, or `needs:definition` by the same rules.

- [ ] **Step 3: Insert the floor consultation in residue-sweep.md**

Replace the final sentence of that paragraph (the one located in Step 2, starting "A `remedy: record` item Phase 2 routes to a record composes exactly as...") with this expanded version — same content, plus the floor consult inserted before the "composes exactly as" clause:

```
A `remedy: record` item Phase 2 routes to a record first applies `_shared/materiality-floor.md`'s floor test: an item that fails to clear the floor, with a `Defer-reason:` other than `tangential`, becomes a digest entry instead of a record — skip the composition below for that item. Otherwise it composes exactly as ledger Phase 3's branches do (`_shared/ledger-format.md`) — `specShapedBody`, the #621 mapping above supplying its `Defer-reason:`, landing born-ready, parked, or `needs:definition` by the same rules.
```

- [ ] **Step 4: Verify residue-sweep.md's ceiling**

```bash
wc -c plugin/skills/wrap-up/residue-sweep.md
```

- [ ] **Step 5: Locate leftover-routing.md's filing point**

```bash
grep -n "^## Staging" plugin/skills/wrap-up/leftover-routing.md
```

The section begins: `Phase 1 guarantees a run directory... Each residue section becomes a staged **work-record proposal** — never created directly.`

- [ ] **Step 6: Insert the floor consultation in leftover-routing.md**

Insert a new paragraph immediately after the existing `## Staging (every mode — policy lookup)` section's opening paragraph (the one ending `...so the record queue stays the user's, not the model's.`) and before the numbered `1. **Compose the body**...` step:

```
**Materiality floor, before composing.** Apply `_shared/materiality-floor.md`'s floor test to each section that reached this staging step: a section that fails to clear the floor, with a `Defer-reason:` (from the fix-exhaust gate above) other than `tangential`, routes to the digest container instead — log the contract's `AUTO` line when a run directory resolves, and skip the compose/build/stage steps below for that section. A section whose `Defer-reason:` is `tangential`, or that clears the floor, proceeds to the ordinary staging steps below unchanged.
```

- [ ] **Step 7: Verify leftover-routing.md's ceiling**

```bash
wc -c plugin/skills/wrap-up/leftover-routing.md
```

- [ ] **Step 8: Run the conformance and ceiling suites**

```bash
node --test tests/bin-lib/skill-audit/context-cost.test.js
```

- [ ] **Step 9: Commit**

```bash
git add plugin/skills/wrap-up/residue-sweep.md plugin/skills/wrap-up/leftover-routing.md
git commit -m "Cite materiality-floor.md in wrap-up's residue-sweep and leftover-routing filing points"
```

---

### Task 3: `plugin/skills/reflect/full-mode.md` + `plugin/skills/reflect/hindsight-mode.md` + `plugin/skills/visual-review/browser-review.md`

**Files:**
- Modify: `plugin/skills/reflect/full-mode.md` (Defer and Capture recommendation-rule bullets, Step 3)
- Modify: `plugin/skills/reflect/hindsight-mode.md` (Defer/Capture delegation sentence, Step 3)
- Modify: `plugin/skills/visual-review/browser-review.md` (both Issues-Defer and Ideas-Defer bullets, Step 6)

**Interfaces:**
- Consumes: `_shared/materiality-floor.md` (as Task 1). All three files are recommend-only paths: the floor verdict is computed where the recommendation is rendered, and the digest write happens only if/when a human accepts the recommendation (or an auto path applies it) — never before the human sees it.
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Measure current sizes**

```bash
wc -c plugin/skills/reflect/full-mode.md plugin/skills/reflect/hindsight-mode.md plugin/skills/visual-review/browser-review.md
```

- [ ] **Step 2: Locate reflect/full-mode.md's Defer and Capture bullets**

```bash
grep -n "^- \*\*Defer\*\*\|^- \*\*Capture\*\*" plugin/skills/reflect/full-mode.md
```

Both are in Step 3's "**Recommendation rules:**" list.

- [ ] **Step 3: Insert the floor consultation into full-mode.md's Defer bullet**

The Defer bullet ends: `...An insight naming an open choice takes the \`openQuestion\` variant (\`needs:definition\` — a label with no \`recordPayload\` parameter, appended at the create call — no scoring). An insight with no valid reason cannot be recommended Defer.` Append, still inside the same bullet:

```
Before this recommendation is rendered, apply `_shared/materiality-floor.md`'s floor test to the insight: when it fails to clear the floor (and its `Defer-reason:` is not `tangential`), the batch table's Recommended column shows "Digest — below floor" instead of "Defer — {reason}", and the digest entry is written only when the human approves that row (or an auto path applies it) — never before this recommendation reaches a human, per the contract's recommend-only-path rule.
```

- [ ] **Step 4: Insert the floor consultation into full-mode.md's Capture bullet**

The Capture bullet ends: `...An insight with no valid reason cannot be recommended Capture.` Append:

```
A Capture recommendation's `Defer-reason:` is always `tangential`, which `_shared/materiality-floor.md`'s override always clears — a Capture-routed insight never renders a "Digest" recommendation; it always renders "Capture — tangential" as above.
```

- [ ] **Step 5: Verify full-mode.md's ceiling**

```bash
wc -c plugin/skills/reflect/full-mode.md
```

- [ ] **Step 6: Locate hindsight-mode.md's delegation sentence**

```bash
grep -n "same as \`full-mode.md\`" plugin/skills/reflect/hindsight-mode.md
```

The sentence: `**Recommendation rules:** **Defer** and **Capture** are the same as \`full-mode.md\`'s Recommendation rules (substitute "finding" for "insight" and "files" for "context") — see that section rather than repeating it here; both run \`_shared/deferral-gate.md\`'s gate and name a \`Defer-reason:\` exactly as stated there.`

- [ ] **Step 7: Insert hindsight-mode.md's own floor citation**

Append to the end of that same sentence:

```
Both also apply `_shared/materiality-floor.md`'s below-floor digest routing exactly as `full-mode.md`'s own Defer and Capture bullets describe — see that file rather than a second copy of the same rule here.
```

- [ ] **Step 8: Verify hindsight-mode.md's ceiling**

```bash
wc -c plugin/skills/reflect/hindsight-mode.md
```

- [ ] **Step 9: Locate browser-review.md's two Defer bullets**

```bash
grep -n "^- \*\*Defer\*\* (new work record" plugin/skills/visual-review/browser-review.md
```

Two matches: the Issues "Recommendation rules for Issues" Defer bullet, and the Ideas "Recommendation rules for Ideas" Defer bullet.

- [ ] **Step 10: Insert the floor consultation into the Issues Defer bullet**

That bullet ends: `...then create it via the unified record contract (\`_shared/work-record.md\`).` Append, inside the same bullet:

```
Before creating the record, apply `_shared/materiality-floor.md`'s floor test: an item that fails to clear the floor, with a non-`tangential` `Defer-reason:`, shows "Digest — below floor" in the Recommended column instead, and only writes the digest entry once the human approves that row (or an auto path applies it).
```

- [ ] **Step 11: Insert the floor consultation into the Ideas Defer bullet**

That bullet ends: `...an idea is by nature \`tangential\` unless it blocks on something concrete — a concrete wake condition makes it \`parked\` with a \`Trigger:\` header.` Append:

```
Since an Ideas-Defer item is `tangential` by default, `_shared/materiality-floor.md`'s override clears the floor for the common case; only the less-common `parked`-with-Trigger path (a non-`tangential` reason) is ever eligible for "Digest — below floor" in the Recommended column, following the same before-render check as the Issues Defer bullet above.
```

- [ ] **Step 12: Verify browser-review.md's ceiling**

```bash
wc -c plugin/skills/visual-review/browser-review.md
```

- [ ] **Step 13: Run the conformance and ceiling suites**

```bash
node --test tests/bin-lib/skill-audit/context-cost.test.js
```

- [ ] **Step 14: Commit**

```bash
git add plugin/skills/reflect/full-mode.md plugin/skills/reflect/hindsight-mode.md plugin/skills/visual-review/browser-review.md
git commit -m "Cite materiality-floor.md in reflect's and visual-review's recommend-only Defer/Capture paths"
```

---

### Task 4: `plugin/skills/code-health/SKILL.md` + `plugin/skills/code-health/filing.md` + `plugin/skills/docs-health/SKILL.md`

**Files:**
- Modify: `plugin/skills/code-health/filing.md` (the "Drain-rate cap and digest mode" paragraph, Step 9)
- Modify: `plugin/skills/code-health/SKILL.md` (line ~274's `filing.md` delegation sentence — ceiling-critical, ~360B headroom)
- Modify: `plugin/skills/docs-health/SKILL.md` (its own inline "Drain-rate cap and digest mode" paragraph)

**Interfaces:**
- Consumes: `_shared/materiality-floor.md`, plus Global Constraints 6-7 above (the two-digest-concepts disambiguation and ordering rule) — every insertion in this task must follow that rule.
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Measure current sizes**

```bash
wc -c plugin/skills/code-health/filing.md plugin/skills/code-health/SKILL.md plugin/skills/docs-health/SKILL.md
```

`code-health/SKILL.md` is ceiling-critical (~40,597B measured at spec-authoring time, ~360B headroom) — confirm the current number here before touching it.

- [ ] **Step 2: Locate code-health/filing.md's cap-digest paragraph**

```bash
grep -n "Drain-rate cap and digest mode" plugin/skills/code-health/filing.md
```

The paragraph: `**Drain-rate cap and digest mode.** Before filing any survivor whose Step 8 decision is 'file', apply the \`health-open-cap\` throttle per \`_shared/health-filing-digest.md\`'s FILE-step shape (\`{PREFIX}\` = \`code-health\`) — at or above the cap, the finding is appended to \`code-health\`'s digest issue instead of filed as a new singleton. A 'reopen' decision (regression) always bypasses the cap.`

- [ ] **Step 3: Insert the materiality-floor paragraph in code-health/filing.md, before the cap-digest paragraph**

Insert this new paragraph immediately before the "**Drain-rate cap and digest mode.**" paragraph located in Step 2:

```
**Materiality floor, before the cap digest.** Before the drain-rate cap check below, apply `_shared/materiality-floor.md`'s floor test to any survivor whose Step 8 decision is `'file'` (with `risk`/`size` judged the same way this file already scores them for `recordPayload`, and no `priority` axis stamped by this skill — judge it as the routing skill per that contract's own rule): a finding that fails to clear the floor routes to the floor's own shared digest container instead — never to `code-health`'s per-origin `{PREFIX}:digest` cap issue described below, a separate mechanism. Only a survivor that clears the floor proceeds to the cap check.
```

- [ ] **Step 4: Verify code-health/filing.md's ceiling**

```bash
wc -c plugin/skills/code-health/filing.md
```

- [ ] **Step 5: Locate code-health/SKILL.md's delegation sentence (ceiling-critical)**

```bash
grep -n "Read \`filing.md\` in this skill's directory and apply it" plugin/skills/code-health/SKILL.md
```

The sentence: `Read \`filing.md\` in this skill's directory and apply it. It owns the whole filing procedure: the born-\`ready\` rule, the drain-rate cap and digest mode (\`_shared/health-filing-digest.md\`), the retry-queue drain and regressed-reopen mechanics (\`_shared/health-filing-mechanics.md\`'s canonical shape, as \`{BINARY}\` = \`code-health.js\`, \`{PREFIX}\` = \`code-health\`), label bootstrapping, the interactive file-all/route-individually gate (\`_shared/health-filing-gate.md\`), and the \`work-types\` Type-expression branch. \`/code-health\` never edits anything directly — it only judges and files.`

- [ ] **Step 6: Extend the existing parenthetical list — minimal-byte insertion**

Replace `the drain-rate cap and digest mode (\`_shared/health-filing-digest.md\`)` with `the materiality floor before the drain-rate cap and digest mode (\`_shared/materiality-floor.md\`, \`_shared/health-filing-digest.md\`)` — this is the whole edit to this file: one clause folded into an existing enumeration, not a new sentence, to stay within the ceiling.

- [ ] **Step 7: Verify code-health/SKILL.md's ceiling — hard gate**

```bash
wc -c plugin/skills/code-health/SKILL.md
```

If the result exceeds 40,960: per this record's Gotchas, slim adjacent prose in this same commit and re-measure — grep `tests/` for any sentence before cutting it, since whole-file conformance tests pin prose repo-wide. Do not drop the citation to dodge the ceiling.

- [ ] **Step 8: Locate docs-health/SKILL.md's cap-digest paragraph**

```bash
grep -n "Drain-rate cap and digest mode" plugin/skills/docs-health/SKILL.md
```

- [ ] **Step 9: Insert the materiality-floor paragraph in docs-health/SKILL.md, before its cap-digest paragraph**

Same pattern as Step 3, substituting `docs-health` for `code-health` and this file's own Step-N decision reference (confirm the actual step number by reading the paragraph located in Step 8 — it references "Step 5" per this plan's earlier grep):

```
**Materiality floor, before the cap digest.** Before the drain-rate cap check below, apply `_shared/materiality-floor.md`'s floor test to any survivor whose Step 5 decision is `'file'`: a finding that fails to clear the floor routes to the floor's own shared digest container instead — never to `docs-health`'s per-origin `{PREFIX}:digest` cap issue described below, a separate mechanism. Only a survivor that clears the floor proceeds to the cap check.
```

- [ ] **Step 10: Verify docs-health/SKILL.md's ceiling**

```bash
wc -c plugin/skills/docs-health/SKILL.md
```

- [ ] **Step 11: Run the ceiling suite**

```bash
node --test tests/bin-lib/skill-audit/context-cost.test.js
```

Expected: PASS. If `code-health/SKILL.md` fails this suite, resolve per Step 7's instruction before proceeding.

- [ ] **Step 12: Commit**

```bash
git add plugin/skills/code-health/filing.md plugin/skills/code-health/SKILL.md plugin/skills/docs-health/SKILL.md
git commit -m "Cite materiality-floor.md in code-health and docs-health, ordered before each sweep's own cap digest"
```

---

### Task 5: `plugin/skills/harness-health/filing.md` + `plugin/skills/journey-health/SKILL.md`

**Files:**
- Modify: `plugin/skills/harness-health/filing.md` (its own "Drain-rate cap and digest mode" paragraph)
- Modify: `plugin/skills/journey-health/SKILL.md` (its own "Drain-rate cap and digest mode" paragraph)

**Interfaces:**
- Consumes: `_shared/materiality-floor.md`, Global Constraints 6-7 (same disambiguation/ordering rule as Task 4).
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Measure current sizes**

```bash
wc -c plugin/skills/harness-health/filing.md plugin/skills/journey-health/SKILL.md
```

- [ ] **Step 2: Locate harness-health/filing.md's cap-digest paragraph**

```bash
grep -n "Drain-rate cap and digest mode" plugin/skills/harness-health/filing.md
```

The paragraph references "Step 6 decision" — confirm by reading it.

- [ ] **Step 3: Insert the materiality-floor paragraph in harness-health/filing.md, before its cap-digest paragraph**

```
**Materiality floor, before the cap digest.** Before the drain-rate cap check below, apply `_shared/materiality-floor.md`'s floor test to any survivor whose Step 6 decision is `'file'` (folding in this file's own classification-to-scoring mapping — `additive` -> `risk:low`/`size:low`, `restructural` -> `risk:medium`/`size:high`, `new-skill` unscored by design and therefore never eligible to clear the floor, since an unscored finding cannot be judged against it): a finding that fails to clear the floor routes to the floor's own shared digest container instead — never to `harness-health`'s per-origin `{PREFIX}:digest` cap issue described below, a separate mechanism. Only a survivor that clears the floor proceeds to the cap check.
```

- [ ] **Step 4: Verify harness-health/filing.md's ceiling**

```bash
wc -c plugin/skills/harness-health/filing.md
```

- [ ] **Step 5: Locate journey-health/SKILL.md's cap-digest paragraph**

```bash
grep -n "Drain-rate cap and digest mode" plugin/skills/journey-health/SKILL.md
```

References "Step 5 decision" — confirm by reading it. This file is measured at 38,732B — headroom is tighter than docs-health/harness-health but not ceiling-critical like code-health.

- [ ] **Step 6: Insert the materiality-floor paragraph in journey-health/SKILL.md, before its cap-digest paragraph**

```
**Materiality floor, before the cap digest.** Before the drain-rate cap check below, apply `_shared/materiality-floor.md`'s floor test to any survivor whose Step 5 decision is `'file'`: a finding that fails to clear the floor routes to the floor's own shared digest container instead — never to `journey-health`'s per-origin `{PREFIX}:digest` cap issue described below, a separate mechanism. Only a survivor that clears the floor proceeds to the cap check.
```

- [ ] **Step 7: Verify journey-health/SKILL.md's ceiling — hard gate**

```bash
wc -c plugin/skills/journey-health/SKILL.md
```

If it exceeds 40,960: slim adjacent prose in this same commit per the same rule as Task 4 Step 7, grepping `tests/` before cutting any sentence.

- [ ] **Step 8: Run the ceiling suite**

```bash
node --test tests/bin-lib/skill-audit/context-cost.test.js
```

- [ ] **Step 9: Commit**

```bash
git add plugin/skills/harness-health/filing.md plugin/skills/journey-health/SKILL.md
git commit -m "Cite materiality-floor.md in harness-health and journey-health, ordered before each sweep's own cap digest"
```

---

### Task 6: `docs/skill-graph.md` edges + `tests/materiality-floor-conformance.test.js` extension + `materiality-floor.md`'s Consumers section + full suite

This task runs **last** — it verifies the citations Tasks 1-5 added actually exist, so it must not start until all five are committed.

**Files:**
- Modify: `docs/skill-graph.md` (8 new edge rows — `## code-health`, `## docs-health`, `## harness-health`, `## journey-health`, `## review`, `## reflect`, `## visual-review`, `## wrap-up` sections)
- Modify: `plugin/skills/_shared/materiality-floor.md` (its own `## Consumers` section — now stale after this plan lands)
- Modify: `tests/materiality-floor-conformance.test.js` (extend with adopter-citation pins)

**Interfaces:**
- Consumes: every citation inserted by Tasks 1-5.
- Produces: nothing — this is the plan's final task.

- [ ] **Step 1: Read the current `## Consumers` section of materiality-floor.md**

```bash
grep -n "^## Consumers" -A 6 plugin/skills/_shared/materiality-floor.md
```

Current text: `Nothing routes to the digest yet — the exhaust channels named in the follow-up sub-issue adopt this contract there. \`/tidy\`'s digest sweep (\`tidy/digest-sweep.md\`) is the first and, until that follow-up lands, only consumer — it manages the container's lifecycle (cluster promotion + expiry) regardless of whether anything has routed to it yet.`

- [ ] **Step 2: Update the Consumers section to reflect the now-landed adopters**

Replace that paragraph with:

```
Ten adopter files route below-floor findings here: `review/step3-routing.md`, `wrap-up/residue-sweep.md`, `wrap-up/leftover-routing.md`, `reflect/full-mode.md`, `reflect/hindsight-mode.md`, `visual-review/browser-review.md`, and the four health sweeps (`code-health`, `docs-health`, `harness-health`, `journey-health`) — see `docs/skill-graph.md` for the full per-skill relationship. `/tidy`'s digest sweep (`tidy/digest-sweep.md`) manages the container's lifecycle (cluster promotion + expiry) independent of which adopters are actively routing to it.
```

- [ ] **Step 3: Verify materiality-floor.md's ceiling**

```bash
wc -c plugin/skills/_shared/materiality-floor.md
```

- [ ] **Step 4: Add the skill-graph.md edges — locate each section**

```bash
grep -n "^## code-health\|^## docs-health\|^## harness-health\|^## journey-health\|^## review\|^## reflect\|^## visual-review\|^## wrap-up" docs/skill-graph.md
```

- [ ] **Step 5: Insert one `_shared/materiality-floor.md` row into each of the 8 sections' tables**

For each section located in Step 4, insert a new row into that section's `| Target | Relationship |` table, alphabetically ordered among that section's existing `_shared/*` rows (after any `_shared/` row that sorts before `materiality-floor`, before any that sorts after — e.g. in `## code-health`, after `_shared/learning-routing.md` since `materiality-floor` sorts before `learning-routing`... check actual alphabetical order at edit time and place accordingly). Row text (same for all 8, substituting `{skill}` in the health-sweep four's description):

For `code-health`, `docs-health`, `harness-health`, `journey-health` (adjust `{origin}` to the section's own skill name):

```
| `_shared/materiality-floor.md` | Before `{origin}`'s own per-origin cap digest (`_shared/health-filing-digest.md`), a would-be-new finding first clears this floor — below-floor findings route to the shared materiality digest container instead of either a singleton issue or `{origin}`'s cap digest. |
```

For `review`:

```
| `_shared/materiality-floor.md` | Step 3 Routing's Defer and Capture branches consult this floor before composing a record — a below-floor, non-`tangential` finding routes to the digest container instead. |
```

For `reflect`:

```
| `_shared/materiality-floor.md` | Full mode's and hindsight mode's Defer/Capture recommendation rules consult this floor before rendering — a below-floor recommendation shows "Digest — below floor," and the entry is written only once a human approves it. |
```

For `visual-review`:

```
| `_shared/materiality-floor.md` | The Findings & Ideas Defer rules in `browser-review.md` consult this floor before recommending a record — a below-floor, non-`tangential` item shows "Digest — below floor" instead. |
```

For `wrap-up`:

```
| `_shared/materiality-floor.md` | `residue-sweep.md`'s `remedy: record` findings and `leftover-routing.md`'s staged leftover sections both consult this floor before composing a record proposal — below-floor items become digest entries instead. |
```

- [ ] **Step 6: Verify docs/skill-graph.md renders and no table is malformed**

```bash
grep -c "^|" docs/skill-graph.md
```

(Sanity count only — confirm it increased by roughly 8 rows over the pre-edit count from Step 4's grep context; there's no automated table-shape test for this file.)

- [ ] **Step 7: Extend `tests/materiality-floor-conformance.test.js` — add a citation pin per adopter file**

Read the existing file's `read()` helper and test style first:

```bash
sed -n '1,20p' tests/materiality-floor-conformance.test.js
```

Add ten new test cases, one per adopter file, following the existing file's exact style (using the same `read(rel)` helper already defined near the top of the file). Insert them after the last existing test (`tidy/SKILL.md stays within its context-cost ceiling`):

```javascript
const ADOPTERS = [
  'plugin/skills/review/step3-routing.md',
  'plugin/skills/wrap-up/residue-sweep.md',
  'plugin/skills/wrap-up/leftover-routing.md',
  'plugin/skills/reflect/full-mode.md',
  'plugin/skills/reflect/hindsight-mode.md',
  'plugin/skills/visual-review/browser-review.md',
  'plugin/skills/code-health/filing.md',
  'plugin/skills/docs-health/SKILL.md',
  'plugin/skills/harness-health/filing.md',
  'plugin/skills/journey-health/SKILL.md',
];

for (const rel of ADOPTERS) {
  test(`${rel} cites materiality-floor.md at its filing point`, () => {
    assert.match(read(rel), /_shared\/materiality-floor\.md/);
  });
}

test('no adopter file restates the floor\'s three-axis definition', () => {
  for (const rel of ADOPTERS) {
    assert.doesNotMatch(
      read(rel),
      /size:low.*priority:low.*risk:low/,
      `${rel} appears to restate the floor's definition instead of citing it`,
    );
  }
});

test('the four health sweeps state materiality-floor-before-cap-digest ordering', () => {
  const HEALTH_FILES = [
    'plugin/skills/code-health/filing.md',
    'plugin/skills/docs-health/SKILL.md',
    'plugin/skills/harness-health/filing.md',
    'plugin/skills/journey-health/SKILL.md',
  ];
  for (const rel of HEALTH_FILES) {
    assert.match(
      read(rel),
      /[Bb]efore the (drain-rate cap check|cap check)/,
      `${rel} should state the floor is consulted before its own cap digest check`,
    );
  }
});

test('review\'s and visual-review\'s recommend-only Defer bullets state accept-time (not recommendation-time) digest write', () => {
  const RECOMMEND_ONLY = [
    'plugin/skills/reflect/full-mode.md',
    'plugin/skills/visual-review/browser-review.md',
  ];
  for (const rel of RECOMMEND_ONLY) {
    assert.match(
      read(rel),
      /approves|approved/,
      `${rel} should state the digest entry is written only once a human approves the recommendation`,
    );
  }
});
```

Adjust the exact regex text if step-authoring finds the actual inserted prose phrases slightly differently — the intent (citation present, no restatement, ordering stated, accept-time-write stated) is what each test must pin, not this plan's exact wording.

- [ ] **Step 8: Run the new test file in isolation, verify it goes red without the citations**

```bash
node --test tests/materiality-floor-conformance.test.js
```

Expected: PASS (all citations from Tasks 1-5 are already committed). Then verify discrimination per Acceptance Criterion 4 — temporarily revert one adopter's citation (e.g. `git stash` is unsafe in this shared-worktree repo per this repo's own convention; instead, comment out one inserted sentence by hand in a scratch edit, run the test, confirm it fails, then restore the sentence via `git checkout -- {file}` since the file has no other uncommitted changes at that point):

```bash
git diff --stat plugin/skills/review/step3-routing.md
```

(Confirm clean — i.e., you're about to test against the committed state, not something already modified.) Then hand-edit `step3-routing.md` to delete the sentence added in Task 1 Step 3, save, re-run:

```bash
node --test tests/materiality-floor-conformance.test.js
```

Expected: the `plugin/skills/review/step3-routing.md cites materiality-floor.md at its filing point` test FAILS. Then restore:

```bash
git checkout -- plugin/skills/review/step3-routing.md
```

- [ ] **Step 9: Verify materiality-floor-conformance.test.js grows to 21 tests, all passing**

```bash
node --test tests/materiality-floor-conformance.test.js
```

(14 existing + 10 per-adopter citation tests + 1 no-restatement test + 1 ordering test + 1 accept-time-write test = 27; adjust this expected count if Step 7's actual insertion produces a different tally — state the real number in the commit message rather than trusting this plan's arithmetic.)

- [ ] **Step 10: Run the full suite**

```bash
npm test
```

Expected: all pass. A single unrelated flake (per this repo's own CLAUDE.md tolerance rule) should be re-run in isolation before treating it as real.

- [ ] **Step 11: Commit**

```bash
git add docs/skill-graph.md plugin/skills/_shared/materiality-floor.md tests/materiality-floor-conformance.test.js
git commit -m "Add skill-graph edges for the ten materiality-floor adopters, update Consumers section, extend conformance suite"
```

---

## Self-Review Notes (for the plan author, not the implementer)

1. **Spec coverage:** Deliverable 1 (citations on every filing branch) → Tasks 1-5. Deliverable 2 (recommend-only accept-time semantics) → Task 3, pinned by Task 6 Step 7's third new test. Deliverable 3 (health-sweep dedup-before-floor ordering) → Tasks 4-5, pinned by Task 6 Step 7's second new test. Deliverable 4 (audit posture) → already stated in `materiality-floor.md` itself per #1261; no adopter needs to restate it, only cite the file, which every task does. Deliverable 5 (skill-graph edges) → Task 6 Steps 4-6. Deliverable 6 (conformance test extension) → Task 6 Step 7. Deliverable 7 (`wc -c` before/after) → every task's Step 1 and its ceiling-verification step.
2. **Placeholder scan:** every inserted sentence above is the literal text to write, not a description of what to write. `{origin}`/`{skill}` substitution instructions are explicit and are the only template-like tokens, matching this plan's own instruction to substitute per file.
3. **Type/name consistency:** `_shared/materiality-floor.md` is spelled identically in every task. The disambiguation vocabulary from Global Constraint 6 ("the cap digest" / "the materiality digest") is used consistently in Tasks 4-5's inserted prose.
