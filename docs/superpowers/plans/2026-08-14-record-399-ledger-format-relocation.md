# Ledger Format Relocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the ledger format contract (entry schema, status lifecycle, phase taxonomy, resolve-gate procedure) out of the invoked-as-knowledge-dependency `skills/ledger/` skill into a proper `_shared` contract file, thin `skills/ledger/SKILL.md` down to the two standalone human commands, and repoint every citing file at the new location.

**Architecture:** Pure documentation restructuring — no runtime code changes. Content moves verbatim where possible (expand-contract: create `_shared/ledger-format.md` first, migrate every consumer, then shrink `skills/ledger/SKILL.md` and delete `skills/ledger/resolve-gate.md`).

**Tech Stack:** Markdown only.

**Spec:** `.claude-tweaks/pipelines/2026-08-14T111032-record-399/work/399-spec.md`

## Global Constraints

- Content moves verbatim where possible — this is relocation, not rewrite.
- Every citation of `ledger/resolve-gate.md` or `ledger/SKILL.md`'s format sections (Ledger File, Status Lifecycle, Phase Taxonomy, Required-for-ops) must be repointed to `skills/_shared/ledger-format.md` — no consumer may cite the old in-skill location for format rules (Acceptance Criteria).
- `skills/ledger/SKILL.md`'s frontmatter `description:` must not say "Called by X, Y, Z" — the mechanism is a knowledge-dependency read, not a Skill-tool invocation (per the skill's own accurate "Invocation Model" section).
- `docs/skill-graph.md` is the single source of truth for cross-skill relationships (CLAUDE.md convention) — its `/ledger` rows must be updated to match the new structure.
- `npm test` must pass after every task — ledger phrasing may be pinned by pipeline tests.

---

### Task 1: Create `skills/_shared/ledger-format.md`

**Files:**
- Create: `skills/_shared/ledger-format.md`
- Read: `skills/ledger/SKILL.md` (lines 40-124: Ledger File, Status Lifecycle, Phase Taxonomy)
- Read: `skills/ledger/resolve-gate.md` (full file: Resolve Gate Phase 1/2/3 procedure)

**Interfaces:**
- Consumes: nothing (new file)
- Produces: `skills/_shared/ledger-format.md` with these named sections, each citable by heading from other files: `## Ledger File Format` (Location/Format/Item Numbering), `## Status Lifecycle`, `## Phase Taxonomy` (including the `### Required for \`ops\`-phase items` subsection), `## Resolve Gate (Nothing-Left-Behind)` (the full Phase 1/2/3 procedure verbatim from `resolve-gate.md`).

- [ ] **Step 1: Write `skills/_shared/ledger-format.md`**

Header:

```markdown
# Ledger Format — Shared Contract

Canonical definition of the pipeline ledger's file format, status lifecycle, phase taxonomy, and resolve-gate procedure. Read by `/claude-tweaks:build`, `/claude-tweaks:test`, `/claude-tweaks:review`, `/claude-tweaks:wrap-up`, and `/claude-tweaks:flow` as a knowledge dependency — none of them invoke `/claude-tweaks:ledger` through the Skill tool; they read this file to learn the format, then read/write `docs/plans/YYYY-MM-DD-{feature}-ledger.md` directly using file operations. `skills/ledger/SKILL.md` is the thin skill for the two standalone human commands (`/claude-tweaks:ledger`, `/claude-tweaks:ledger resolve`) and cites this file rather than restating the contract.
```

Then verbatim-move (adjusting heading levels to `##`/`###` under this file, and updating any self-references from "this skill's directory" to "this file"):
- `skills/ledger/SKILL.md` lines 40-64 (`## Ledger File` → `## Ledger File Format`, keeping `### Location`, `### Format`, `### Item Numbering` as `###` subheadings)
- `skills/ledger/SKILL.md` lines 66-80 (`## Status Lifecycle`, verbatim)
- `skills/ledger/SKILL.md` lines 82-124 (`## Phase Taxonomy`, verbatim, including the `### Required for \`ops\`-phase items (\`ops\`, \`build/ops\`)` subsection)
- `skills/ledger/resolve-gate.md` lines 1-157 in full, re-headed as `## Resolve Gate (Nothing-Left-Behind)` (was `# Ledger Resolve Gate`), with its `## Phase 1` / `## Phase 2` / `## Phase 3` becoming `### Phase 1` / `### Phase 2` / `### Phase 3`. Update its own opening paragraph's self-reference: it currently says "Full procedure lives in `resolve-gate.md` in this skill's directory" nowhere — check for and update any line that says "this file" appropriately once nested under the new heading. The line "Called by `/claude-tweaks:wrap-up`'s Phase 3 ledger gate and `/claude-tweaks:flow` Step 5" stays (accurate — describes who reads this contract, not a Skill-tool call).

- [ ] **Step 2: Verify the file was created correctly**

Run: `grep -c "^## " "skills/_shared/ledger-format.md"`
Expected: `4` (Ledger File Format, Status Lifecycle, Phase Taxonomy, Resolve Gate)

- [ ] **Step 3: Commit**

```bash
git add skills/_shared/ledger-format.md
git commit -m "$(cat <<'EOF'
Create skills/_shared/ledger-format.md as the ledger format contract

Moves the entry schema, status lifecycle, phase taxonomy, and
resolve-gate procedure out of skills/ledger/ (a knowledge-dependency
skill, never invoked via the Skill tool) into a proper _shared
contract file. Task 2 thins the skill; Task 3 repoints consumers.

refs #399
EOF
)"
```

---

### Task 2: Thin `skills/ledger/SKILL.md`, delete `skills/ledger/resolve-gate.md`

**Files:**
- Modify: `skills/ledger/SKILL.md`
- Delete: `skills/ledger/resolve-gate.md`

**Interfaces:**
- Consumes: `skills/_shared/ledger-format.md`'s section headings from Task 1 (`## Ledger File Format`, `## Status Lifecycle`, `## Phase Taxonomy`, `## Resolve Gate (Nothing-Left-Behind)`)
- Produces: a thinned `skills/ledger/SKILL.md` whose remaining sections are: frontmatter, intro/diagram, `## When to Use`, `## Input`, `## Operations` (Create/Add Item/Update Item/Query/Resolve Gate pointer/Delete), `## Standalone Usage`, `## Next Actions`, `## Invocation Model`, `## Anti-Patterns` — every section that duplicated format-contract content now cites `_shared/ledger-format.md` instead.

- [ ] **Step 1: Fix the frontmatter description**

In `skills/ledger/SKILL.md`, replace line 3:

```
description: Use when you need to create, update, query, or resolve open items in a pipeline ledger file. Called by /claude-tweaks:build, /claude-tweaks:test, /claude-tweaks:review, /claude-tweaks:wrap-up, and /claude-tweaks:flow — or standalone for ledger inspection.
```

with:

```
description: Use when you need to create, update, query, or resolve open items in a pipeline ledger file, or standalone for ledger inspection. Read as a knowledge dependency (not invoked via the Skill tool) by /claude-tweaks:build, /claude-tweaks:test, /claude-tweaks:review, /claude-tweaks:wrap-up, and /claude-tweaks:flow.
```

- [ ] **Step 2: Replace the `## Ledger File` section (lines 40-64) with a pointer**

Replace the entire `## Ledger File` section (Location/Format/Item Numbering, lines 40-64) with:

```markdown
## Ledger File Format

Location, entry table format, and item-numbering rules: `_shared/ledger-format.md`'s Ledger File Format section.
```

- [ ] **Step 3: Replace the `## Status Lifecycle` section (lines 66-80) with a pointer**

```markdown
## Status Lifecycle

Full state machine and terminal-status rules: `_shared/ledger-format.md`'s Status Lifecycle section.
```

- [ ] **Step 4: Replace the `## Phase Taxonomy` section (lines 82-124) with a pointer**

```markdown
## Phase Taxonomy

Phase schema, the full phase table, and the `reason-not-auto` qualifier rules for `ops`-phase items: `_shared/ledger-format.md`'s Phase Taxonomy section.
```

- [ ] **Step 5: Replace the `### Resolve Gate (Nothing-Left-Behind)` operation (lines 180-182) with a pointer**

```markdown
### Resolve Gate (Nothing-Left-Behind)

The critical gate that prevents dropped work — three phases (Phase 1 fix-exhaust → Phase 2 per-item user input → Phase 3 apply). Full procedure: `_shared/ledger-format.md`'s Resolve Gate section. Phase 2 is on the "What `auto` does NOT silence" list in `_shared/auto-mode-contract.md`. Called by `/claude-tweaks:wrap-up`'s Phase 3 ledger gate and `/claude-tweaks:flow` Step 5.
```

- [ ] **Step 6: Update the `## Invocation Model` section's directory reference**

The section already correctly states no parent skill invokes `/claude-tweaks:ledger` via the Skill tool. Add one sentence noting the new split: after the existing paragraph, append: "The format contract itself (entry schema, statuses, phase taxonomy, resolve-gate procedure) lives in `_shared/ledger-format.md` — this file covers only the two standalone human commands and the mutation operations (Create/Add/Update/Query/Delete)."

- [ ] **Step 7: Delete `skills/ledger/resolve-gate.md`**

Its content was moved verbatim into `skills/_shared/ledger-format.md` in Task 1.

- [ ] **Step 8: Verify no remaining "called by" wording and no dangling reference to the deleted file within this skill's own directory**

Run: `grep -n "Called by" skills/ledger/SKILL.md`
Expected: no output (empty)

Run: `grep -rn "resolve-gate.md" skills/ledger/`
Expected: no output (empty — the file is gone and nothing inside `skills/ledger/` cites it by path anymore)

- [ ] **Step 9: Commit**

```bash
git add skills/ledger/SKILL.md
git rm skills/ledger/resolve-gate.md
git commit -m "$(cat <<'EOF'
Thin skills/ledger/SKILL.md to the two standalone commands

Format contract (entry schema, statuses, phase taxonomy,
resolve-gate procedure) moved to skills/_shared/ledger-format.md in
the prior commit. skills/ledger/ now covers only Create/Add/Update/
Query/Delete and the standalone /ledger and /ledger resolve commands.
Also fixes the frontmatter description's misleading "Called by ..."
wording — /ledger is a knowledge dependency, never invoked via the
Skill tool.

refs #399
EOF
)"
```

---

### Task 3: Sweep every citing file to reference `_shared/ledger-format.md`

**Files:**
- Modify: `skills/wrap-up/nothing-left-behind.md` (4 citations: lines 3, 16, 37, 49)
- Modify: `skills/wrap-up/console-template.md` (line 135)
- Modify: `skills/wrap-up/memory-curation.md` (line 49)
- Modify: `skills/wrap-up/summary-template.md` (line 128)
- Modify: `skills/wrap-up/SKILL.md` (line 202)
- Modify: `skills/wrap-up/leftover-routing.md` (line 62)
- Modify: `skills/wrap-up/residue-sweep.md` (line 6, line 52 — NOT line 44/46, which cite the still-live `ledger/SKILL.md`'s Add Item section and stay unchanged)
- Modify: `skills/reflect/full-mode.md` (line 91)
- Modify: `skills/_shared/batched-item-drill.md` (line 4)
- Modify: `skills/_shared/autonomy-ceiling.md` (lines 10, 96, 108)
- Modify: `skills/flow/steps-and-gates.md` (line 83)
- Modify: `skills/build/SKILL.md` (line 100)
- Modify: `skills/specify/spec-template.md` (line 110)
- Modify: `docs/skill-graph.md` (line 141)

**Interfaces:**
- Consumes: `skills/_shared/ledger-format.md`'s section headings from Task 1 (already committed).
- Produces: no remaining live-skill citation of `ledger/resolve-gate.md` by path, or of `ledger/SKILL.md` for the Required-for-ops qualifier, anywhere in `skills/` or `docs/` outside `skills/ledger/` itself and historical `docs/superpowers/plans/*.md` / `docs/superpowers/specs/*.md` / `docs/plans/*.md` archives (which are not swept — they are point-in-time records, not live documentation).

For every occurrence below, the substitution is mechanical: replace the backtick-quoted path `` `ledger/resolve-gate.md` `` with `` `_shared/ledger-format.md` `` (Resolve Gate section), and replace `` `/claude-tweaks:ledger` Required-for-ops section `` / `` `ledger/SKILL.md`'s ... `` (format-contract citations only) with `` `_shared/ledger-format.md`'s ... ``. Do not alter surrounding prose beyond the path/name swap — these are citation repoints, not rewrites.

- [ ] **Step 1: Sweep `skills/wrap-up/nothing-left-behind.md`**

- Line 3: `... the same condition that gates \`ledger/resolve-gate.md\`` → `... the same condition that gates \`_shared/ledger-format.md\`'s Resolve Gate section`
- Line 16: `... per \`ledger/resolve-gate.md\` Phase 3's \`Acknowledge\` disposition` → `... per \`_shared/ledger-format.md\`'s Resolve Gate Phase 3 \`Acknowledge\` disposition`
- Line 37: `\`ledger/resolve-gate.md\` Phase 3's \`Acknowledge\` disposition, log` → `\`_shared/ledger-format.md\`'s Resolve Gate Phase 3 \`Acknowledge\` disposition, log`
- Line 49: `apply \`ledger/resolve-gate.md\` Phase 3's \`Acknowledge\` disposition` → `apply \`_shared/ledger-format.md\`'s Resolve Gate Phase 3 \`Acknowledge\` disposition`

- [ ] **Step 2: Sweep the remaining single-citation files**

- `skills/wrap-up/console-template.md:135`: `` (`ledger/resolve-gate.md` Phase 3's `Defer` / `Keep` / `Acknowledge` dispositions, including the `` → `` (`_shared/ledger-format.md`'s Resolve Gate Phase 3 `Defer` / `Keep` / `Acknowledge` dispositions, including the ``
- `skills/wrap-up/memory-curation.md:49`: `staged the way \`ledger/resolve-gate.md\` Phase 3 stages` → `staged the way \`_shared/ledger-format.md\`'s Resolve Gate Phase 3 stages`
- `skills/wrap-up/summary-template.md:128`: `> merging. Each is a real, trackable record (\`ledger/resolve-gate.md\`'s` → `> merging. Each is a real, trackable record (\`_shared/ledger-format.md\`'s Resolve Gate section's`
- `skills/wrap-up/SKILL.md:202`: `Read \`ledger/resolve-gate.md\` when the ledger exists` → `Read \`_shared/ledger-format.md\`'s Resolve Gate section when the ledger exists`
- `skills/wrap-up/leftover-routing.md:62`: `same shape as \`ledger/resolve-gate.md\`'s per-item drill` → `same shape as \`_shared/ledger-format.md\`'s Resolve Gate per-item drill`
- `skills/reflect/full-mode.md:91`: `the same resolution \`skills/ledger/resolve-gate.md\` applies to a standalone ledger item` → `the same resolution \`_shared/ledger-format.md\`'s Resolve Gate section applies to a standalone ledger item`
- `skills/_shared/batched-item-drill.md:4`: `used by \`ledger/resolve-gate.md\`,` → `used by \`_shared/ledger-format.md\`'s Resolve Gate section,`
- `skills/flow/steps-and-gates.md:83`: `which is what \`ledger/resolve-gate.md\` already assumes` → `which is what \`_shared/ledger-format.md\`'s Resolve Gate section already assumes`

- [ ] **Step 3: Sweep `skills/wrap-up/residue-sweep.md`**

- Line 6: `the ledger's own three-phase resolve gate (\`ledger/resolve-gate.md\`) has something to enforce on` → `the ledger's own three-phase resolve gate (\`_shared/ledger-format.md\`'s Resolve Gate section) has something to enforce on`
- Line 52: `(\`ledger/resolve-gate.md\`) is what assigns each item's eventual disposition` → `(\`_shared/ledger-format.md\`'s Resolve Gate section) is what assigns each item's eventual disposition`
- Lines 44 and 46 (citing `ledger/SKILL.md`'s Add Item section) are **not** part of this sweep — Add Item stays a live operation in the thinned `skills/ledger/SKILL.md`. Leave unchanged.

- [ ] **Step 4: Sweep `skills/_shared/autonomy-ceiling.md`**

- Line 10: `\`ledger/resolve-gate.md\` (Phase 2 narrowing,` → `\`_shared/ledger-format.md\`'s Resolve Gate section (Phase 2 narrowing,`
- Line 96: `\`ledger/resolve-gate.md\` Phase 2 skips the per-item drill` → `\`_shared/ledger-format.md\`'s Resolve Gate Phase 2 skips the per-item drill`
- Line 108: `categories \`ledger/resolve-gate.md\`'s Phase 1 already requires` → `categories \`_shared/ledger-format.md\`'s Resolve Gate Phase 1 already requires`

- [ ] **Step 5: Sweep `skills/build/SKILL.md` and `skills/specify/spec-template.md`**

- `skills/build/SKILL.md:100`: `the matching \`(reason-not-auto: …)\` qualifier from \`/claude-tweaks:ledger\` Required-for-ops section.` → `the matching \`(reason-not-auto: …)\` qualifier from \`_shared/ledger-format.md\`'s Required-for-ops section.`
- `skills/specify/spec-template.md:110`: `State the reason in each entry using the \`reason-not-auto\` qualifier (see \`/claude-tweaks:ledger\` Required-for-ops section).` → `State the reason in each entry using the \`reason-not-auto\` qualifier (see \`_shared/ledger-format.md\`'s Required-for-ops section).`

- [ ] **Step 6: Update `docs/skill-graph.md:141`**

Replace the `/ledger` row's `ledger/SKILL.md:109` citation (the `design` phase's Phase Taxonomy row, now moved) with `_shared/ledger-format.md` (Phase Taxonomy section). Full replacement text for that row:

```
| `/ledger` | The wrapper writes nothing itself; `/flow` does all the writing. Its caches (audit, recommendations, declined) are separate files `/ledger` neither reads nor cleans (`/wrap-up`'s Phase 4 cleanup planning does). During the polish phase `/flow` writes to two distinct stores: one entry per design-wrapper *command* to the open-items ledger under phase `design` (`fixed` per `commands_invoked` entry, `observation` per `staged_suggestions` entry — `_shared/ledger-format.md`'s Phase Taxonomy section), and one entry per polish *dispatch* to the auto-decision log at `{run-dir}/decisions.md` (`flow/SKILL.md:183`, explicitly not one per command). Polish actions also surface in `/flow`'s pipeline summary. |
```

Also check `docs/skill-graph.md` lines 224 and 275 (the `## ledger` section itself) for any "called by"/invocation-model wording that should reflect the knowledge-dependency framing — read the current text at those lines first; if it already accurately says "consumed by" (not "called by"), leave it unchanged.

- [ ] **Step 7: Verify the full sweep**

Run: `grep -rn "ledger/resolve-gate.md" skills/ docs/skill-graph.md docs/getting-started.md 2>/dev/null`
Expected: no output (empty) — every live citation now points to `_shared/ledger-format.md`.

Run: `grep -rn "Called by /claude-tweaks:ledger\|Called by /ledger" skills/ docs/ 2>/dev/null | grep -v "docs/superpowers/plans/\|docs/superpowers/specs/\|docs/plans/\|.claude-tweaks/pipelines/"`
Expected: no output (empty).

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all suites pass (this is a documentation-only change; no test should fail as a result, but confirm — ledger phrasing may be pinned by pipeline tests per the spec's Gotchas).

- [ ] **Step 9: Commit**

```bash
git add skills/wrap-up/nothing-left-behind.md skills/wrap-up/console-template.md skills/wrap-up/memory-curation.md skills/wrap-up/summary-template.md skills/wrap-up/SKILL.md skills/wrap-up/leftover-routing.md skills/wrap-up/residue-sweep.md skills/reflect/full-mode.md skills/_shared/batched-item-drill.md skills/_shared/autonomy-ceiling.md skills/flow/steps-and-gates.md skills/build/SKILL.md skills/specify/spec-template.md docs/skill-graph.md
git commit -m "$(cat <<'EOF'
Repoint every ledger-format citation at _shared/ledger-format.md

Sweeps the citing files' references from ledger/resolve-gate.md and
ledger/SKILL.md's format sections (now removed/thinned) to the new
_shared/ledger-format.md contract file created in an earlier commit.

refs #399
EOF
)"
```
