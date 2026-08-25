# Risk-Marker Verification (Review Step 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the guidance gap where a spec's self-flagged risk marker (an unvalidated Gotchas bullet, an inline `<!-- ambiguity: -->` marker, or an `## Open Questions` row) can ride through `/claude-tweaks:review`'s Step 1 Spec Compliance Check unverified, because Step 1's method is brief-compliance-only.

**Architecture:** Pure prose change to two skill files. Add a named sub-check to `skills/review/code-mode-steps.md` Step 1 that scans the materialized spec for the three already-shipped risk-marker conventions and requires independently verifying each against the artifact's real external validator/schema/tool (not just a structural check), with a new Gate table row routing an unresolved marker to `BLOCKED`. Cross-reference the new sub-check from `skills/specify/spec-template.md`'s Empirical Premise-Check Deliverables section.

**Tech Stack:** Markdown skill-prose only. No code, no new labels/facets, no new marker syntax — reuses the three conventions already shipped in `shaping-mode.md`/`red-team.md`/`spec-template.md`.

**Spec:** `.claude-tweaks/pipelines/2026-08-25T175306-record-362/work/362-spec.md`

## Global Constraints

- Reuse exactly the three existing marker conventions (Gotchas non-"validated" bullets, red-team's inline `<!-- ambiguity: -->` markers, `## Open Questions` rows) — no new marker syntax.
- `skills/review/SKILL.md`'s former Step 1 now lives in `skills/review/code-mode-steps.md` (post-#887 extraction) — edit that file, not `SKILL.md`.
- `skills/review/code-mode-steps.md` is 31,657 bytes before this change; the 40 KB (40,960-byte) ceiling (`tests/bin-lib/skill-audit/context-cost.test.js`) leaves ~9.3 KB of headroom — plenty for this addition, but re-check `wc -c` after editing.
- `git diff --stat` must show only `plugin/skills/review/code-mode-steps.md` and `plugin/skills/specify/spec-template.md` changed (no label/facet files).
- `npm test` must pass.

---

### Task 1: Add the Risk-Marker Verification sub-check to Review Step 1

**Files:**
- Modify: `plugin/skills/review/code-mode-steps.md:21-44` (Step 1: Spec Compliance Check)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the sub-check's name ("Risk-Marker Verification") and its `verified`/`unresolved` per-marker classification — Task 2 references this same name when cross-referencing from `spec-template.md`.

- [ ] **Step 1: Insert the sub-check as list item 4, after the existing Non-Goals check (item 3)**

Edit the numbered list inside `## Step 1: Spec Compliance Check (spec-based only)` (currently items 1-3: Deliverables, Acceptance Criteria, Non-Goals) to add a fourth item:

```markdown
4. **Risk-Marker Verification** — runs alongside check 2 above (Acceptance Criteria). Scan the
   spec (the same materialized file this step already reads — no separate fetch) for unresolved
   risk markers left over from `/claude-tweaks:specify`: Gotchas bullets whose validation status
   is not "validated" (contains "unvalidated," "assumed," or "unconfirmed" —
   `shaping-mode.md`'s framing-check fold), inline `<!-- ambiguity: ... -->` markers
   (`red-team.md`'s per-sentence write-back), and `## Open Questions` rows (`red-team.md`'s
   general-finding table). For each marker found, independently verify it against the artifact's
   real external validator/schema/tool — **a structural or syntax check alone (e.g. "the config
   parses," "the file exists") is necessary but not sufficient; the value itself must be confirmed
   against ground truth**, not merely well-formed. Mark each as `verified` or `unresolved`.
```

- [ ] **Step 2: Extend the Gate table with a new row for an unresolved marker**

In the same section's `### Gate:` table, add a row above the existing "Significant gaps" row (same
tier, so it's checked first — an unresolved risk marker is itself a form of significant gap):

```markdown
| Any risk marker `unresolved` after independent verification | **BLOCKED** — same tier as Significant gaps. Name the unverified marker(s) (file:line or table row) so the user knows exactly what still needs ground-truth confirmation |
```

- [ ] **Step 3: Verify the edit landed correctly**

Run: `grep -n "Risk-Marker Verification" plugin/skills/review/code-mode-steps.md`
Expected: two matches — the list-item definition and the Gate-table row.

Run: `wc -c plugin/skills/review/code-mode-steps.md`
Expected: under 40960 (40 KB ceiling).

- [ ] **Step 4: Commit**

```bash
git add plugin/skills/review/code-mode-steps.md
git commit -m "review: add Risk-Marker Verification sub-check to Step 1 Spec Compliance Check (refs #362)"
```

---

### Task 2: Cross-reference the sub-check from spec-template.md's Empirical Premise-Check Deliverables

**Files:**
- Modify: `plugin/skills/specify/spec-template.md:156-163` (Empirical Premise-Check Deliverables)

**Interfaces:**
- Consumes: Task 1's sub-check name ("Risk-Marker Verification", `skills/review/code-mode-steps.md` Step 1).
- Produces: nothing further consumed downstream.

- [ ] **Step 1: Write the failing check**

Run: `grep -n "Risk-Marker Verification" plugin/skills/specify/spec-template.md`
Expected: FAIL (no match) — confirms the cross-reference doesn't exist yet.

- [ ] **Step 2: Add the cross-reference**

Append a new paragraph immediately after the existing "Empirical Premise-Check Deliverables"
section's last paragraph (ends "...a gap no fixture built from the captured shapes can catch,
because the missing case never got captured. Name each initiator path explicitly in the Task 0
deliverable's own text; do not let "covers all invocation shapes" stand in for it."), before the
`## Gate-Authoring Deliverables` heading:

```markdown
A Task 0 deliverable's captured behavior — or any other flagged-but-unvalidated assumption in this
spec's `## Gotchas` section, an inline `<!-- ambiguity: -->` marker, or an `## Open Questions` row —
is not fully resolved just because implementation happened. `skills/review/code-mode-steps.md`
Step 1's **Risk-Marker Verification** sub-check independently re-checks every such marker against
the artifact's real external validator/schema/tool at whole-branch review time, and routes an
unresolved one to `BLOCKED` — the review-side half of the same rule this section states from the
spec-authoring side.
```

- [ ] **Step 3: Run the check again to verify it passes**

Run: `grep -n "Risk-Marker Verification" plugin/skills/specify/spec-template.md`
Expected: PASS (one match).

- [ ] **Step 4: Verify file size headroom**

Run: `wc -c plugin/skills/specify/spec-template.md`
Expected: under 40960 (40 KB ceiling). (File was 21,168 bytes before this change — ample headroom.)

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/specify/spec-template.md
git commit -m "specify: cross-reference review's new Risk-Marker Verification sub-check from Empirical Premise-Check Deliverables (refs #362)"
```

---

### Task 3: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Confirm scope**

Run: `git diff --stat main...HEAD`
Expected: only `plugin/skills/review/code-mode-steps.md`, `plugin/skills/specify/spec-template.md`,
plus the earlier materialize commit's `.claude-tweaks/pipelines/2026-08-25T175306-record-362/work/362-spec.md`
and this plan file under `docs/superpowers/plans/` — no label/facet files, no new marker-syntax files.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS (all suites green; `tests/changelog-coverage.test.js` / `tests/bin-lib/reconcile/pr-state.test.js` flakes are pre-existing/accepted per dispatch notes if they appear and this diff doesn't touch anything related).
