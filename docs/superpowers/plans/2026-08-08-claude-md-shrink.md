# CLAUDE.md Shrink + Context-Cost Ceiling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink CLAUDE.md (currently 69,200 B) by evicting skill-authoring conventions and release documentation to on-demand docs and recompressing `## Don'ts` to rule+clause shape, then pin the result with a byte-budget test so regrowth fails the suite.

**Architecture:** Three commits, per the record's own Technical Approach: (1) evictions with pointer stubs + cross-reference sweep, (2) Don'ts recompression against `docs/incident-log.md` as authority, (3) the ceiling test. Editorial work; the only new code is the test.

**Record:** #233 (spec: `.claude-tweaks/pipelines/2026-08-08T231620-spec-234-233/spec-233/work/233-spec.md`). Commits reference `refs #233` — never closing keywords.

## Global Constraints

**Content pinned by the live suite — must survive in CLAUDE.md verbatim enough to match** (`tests/subagent-contract-clauses.test.js` reads the real file):
- The phrase `dispatch correctness` (case-insensitive) somewhere in the file.
- A paragraph starting `**Third-party agents are exempt**` (one paragraph — the test's `exemptionRegion` for CLAUDE.md runs from that marker to the next blank line) containing the literal `` `agents/` `` and, after stripping `*`, the phrase `never exempt`, plus text matching `/third-party agents[^.]{0,80}exempt/i`.
- Keep both inside the `### Subagent Contract (v4.2+)` subsection — compress around them, never through them.

**Machine-read key lines — keep exactly:** `work-backend: github-issues`, `work-types: labels` (under `## Work records`), `diagram-suggestions: enabled` (under `## Design integration`).

**Don'ts invariants:** every `[IL-nn]` tag present before the edit is present after (same rule, never renumbered); `docs/incident-log.md` is not touched; the section's preamble (the "Rules only", "Adding one:", "Removing one:" paragraphs) survives, compressed is fine.

**Fixture-based tests** (`tests/policy-schema.test.js`, `bin/lib/init/claude-md-conformance.js`) write their own CLAUDE.md fixtures — they do not constrain this file. Verified at plan time; no action needed.

**No section deleted outright** — every eviction leaves a pointer stub naming the new home (AC: every evicted convention remains reachable).

---

### Task 1: Evictions — docs/skill-authoring.md + docs/releasing.md + cross-reference sweep

**Files:**
- Create: `docs/skill-authoring.md`
- Create: `docs/releasing.md`
- Modify: `CLAUDE.md` (Conventions section: evict five subsections; Releasing: shrink to pointer)
- Modify: `docs/REGISTRY.md` (two new rows)
- Modify: every repo file whose reference to the moved content breaks (sweep below)

**Steps:**

- [ ] **Step 1: Create `docs/skill-authoring.md`.** Move — verbatim, not rewritten — these blocks from CLAUDE.md's `## Conventions`: `### SKILL.md structure`, `### Interaction patterns` (all bullets incl. the canonical CSC template), `### Frontmatter conventions`, `### Interaction style directive`, `### Parallel execution directives`. Open the new file with an h1 and one framing paragraph: this is loaded when authoring or editing skill files; dispatched implementer/reviewer/QA agents do not need it.
- [ ] **Step 2: Create `docs/releasing.md`.** Move the full current `### Releasing (two repos)` body (the two-repos intro, the whole-branch-review paragraph verbatim, the Invocation paragraph, the judgment-calls list) there, plus reproduce the retired mechanical detail's pointers: note that the mechanics live in `bin/release.js` (`--help`) and `bin/lib/release/`.
- [ ] **Step 3: Stub both in CLAUDE.md.** Under `## Conventions`, replace the five moved subsections with one short block: `### Skill authoring — moved` pointing at `docs/skill-authoring.md` (2-3 lines, note it must be read before creating or editing any `skills/**/*.md`). Replace `### Releasing (two repos)`'s body with 3 lines: the invocation (`node bin/release.js <minor|patch> "<summary>"` from clean `main`), "the whole-branch review gates the bump", and the pointer to `docs/releasing.md`. Keep `### Versioning` and `### Cross-references` and `### Hooks` in place untouched.
- [ ] **Step 4: Cross-reference sweep ([IL-93], [IL-10]).** `grep -rn "CLAUDE.md" skills/ docs/ bin/ tests/ --include="*.md" --include="*.js"` and update every reference that names a MOVED subsection (e.g. "CLAUDE.md's Multi-item decisions convention", "CLAUDE.md's Interaction patterns", "per CLAUDE.md's Releasing section", "CLAUDE.md § frontmatter conventions") to name the new home (`docs/skill-authoring.md` / `docs/releasing.md`). References to sections that STAY (Don'ts, Hooks, git rules, Subagent Contract, Versioning) are untouched. Report the number of references updated. Do not update `docs/incident-log.md` or files under `docs/superpowers/` (historical artifacts).
- [ ] **Step 5: REGISTRY rows.** Add to `docs/REGISTRY.md`'s table: `docs/skill-authoring.md` — skill-file authoring conventions (structure, frontmatter, interaction patterns, CSC) — auto-detect `skills/**/*.md`; `docs/releasing.md` — release procedure + judgment calls — auto-detect `bin/release.js`, `bin/lib/release/**`.
- [ ] **Step 6: Verify + commit.** `npm test` must be green (2607/2607). `wc -c CLAUDE.md` — expect roughly 15-16 KB removed. Commit exactly the created/modified files: `Evict skill-authoring and releasing documentation from CLAUDE.md to on-demand docs (refs #233)`.

### Task 2: Recompress `## Don'ts` to rule+clause

**Files:**
- Modify: `CLAUDE.md` (`## Don'ts` section only)

**Steps:**

- [ ] **Step 1: Inventory.** `grep -o "IL-[0-9]*" CLAUDE.md | sort -u > /tmp/il-before.txt` and count the `## Don'ts` bullets (`grep -c "^- Don't" CLAUDE.md` — plus the one `- For a design-mode build` bullet).
- [ ] **Step 2: Recompress per rule.** For each bullet: one sentence of rule + one clause of why + the `[IL-nn]` tag where one existed. The incident narrative (which build, what it cost, the discovery story) is what gets cut — it lives in `docs/incident-log.md`. Judgment per the record's Gotcha: entries whose nuance IS the rule (e.g. the shipped-vs-never-shipped renumber split, the two-sided IL-44 conflict rule) keep the nuance, compressed. Never merge two rules into one bullet; never drop a rule; never renumber a tag. Work through the section in order, editing in place.
- [ ] **Step 3: Verify invariants.** `grep -o "IL-[0-9]*" CLAUDE.md | sort -u > /tmp/il-after.txt; diff /tmp/il-before.txt /tmp/il-after.txt` → empty. Bullet count unchanged. `npm test` green. Section size: `awk` the `## Don'ts` section — expect ≤ ~15 KB (from 36.3 KB).
- [ ] **Step 4: Commit.** `Recompress CLAUDE.md Don'ts to rule+clause shape, narratives stay in the incident log (refs #233)`.

### Task 3: Budget test

**Files:**
- Create: `tests/claude-md-budget.test.js`

**Steps:**

- [ ] **Step 1: Measure the landed size** (`wc -c CLAUDE.md`) and set `BUDGET_BYTES` to that value rounded up to the next KB + 2 KB headroom. Add a comment recording the record's ~22 KB aspiration, the measured landing, and that lowering the budget is encouraged, raising it needs an explicit decision.
- [ ] **Step 2: Write the test** (pattern follows `bin/lib/skill-audit/context-cost.js`'s ceiling rationale):

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// CLAUDE.md is inherited by every dispatched subagent (72-144 per /dispatch run),
// so bytes here are the most expensive bytes in the repo. #233 landed the file at
// {measured} B against a ~22 KB aspiration; this budget is measured-landing + headroom.
// Lowering it as the file shrinks is encouraged; raising it is an explicit decision
// with the incident-log discipline behind it (ADR-0010 regrew 77% with nothing watching).
const BUDGET_BYTES = /* decided in Step 1 */;

test('CLAUDE.md stays within its context-cost budget', () => {
  const size = fs.statSync(path.join(__dirname, '..', 'CLAUDE.md')).size;
  assert.ok(
    size <= BUDGET_BYTES,
    `CLAUDE.md is ${size} B, over its ${BUDGET_BYTES} B budget. Every dispatched agent inherits ` +
      'this file; evict or compress per docs/skill-authoring.md and ADR-0010 rather than raising the budget.',
  );
});
```

- [ ] **Step 3: Invert-check the test ([IL-105]):** temporarily set `BUDGET_BYTES` to 1000, run `node --test tests/claude-md-budget.test.js`, confirm it FAILS; restore the real value, confirm it passes. State both results.
- [ ] **Step 4: Full suite + commit.** `npm test` green. Commit: `Add CLAUDE.md context-cost budget test (refs #233)`.

---

## Self-Review (performed at authoring)

- **Spec coverage:** Releasing eviction → Task 1 (Steps 2-3; #234 already shrank it, this finishes the eviction). Skill-authoring eviction → Task 1 (Steps 1, 3). Don'ts recompression → Task 2. Ceiling test → Task 3. AC "every evicted convention reachable" → pointer stubs + REGISTRY rows. AC "consumers' anchors survive" → Global Constraints pins + Task 1 Step 6 / Task 2 Step 3 `npm test` gates. AC "dispatched-agent spot check" → performed at the review step of this spec's pipeline.
- **Verified at plan time:** the only test reading the real CLAUDE.md is `tests/subagent-contract-clauses.test.js` (pins listed in Global Constraints); `policy-schema` and `claude-md-conformance` use fixtures; `bin/lib/harness-health/scope.js` greps `design-integration:` (absent today — behavior unchanged by this edit).
- **Placeholder scan:** the one deliberate placeholder (`BUDGET_BYTES` value) is an instruction to measure, not a TBD.
