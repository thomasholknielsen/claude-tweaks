# Record #260 — Routine preamble: setup-log read + self-heal completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the canonical routine prompt preamble with a setup-log read clause and a self-heal completion clause (dispatch excluded), fan it out byte-identically to all six routine templates, and bump each `template_version`.

**Architecture:** One canonical edit inside `skills/_shared/routine-template-schema.md`'s `## Standard prompt preamble` fenced block, then mechanical propagation into each template's `prompt: >` folded scalar. `tests/routine-template-schema.test.js` derives the canonical preamble at runtime and byte-compares each template (after folding paragraphs to single lines), so the suite is the parity verifier — no test edits expected.

**Tech Stack:** Markdown + YAML folded scalars; `node --test` for verification.

## Global Constraints

- **Insert A (log-read clause)** — added inside the final `unresolved` paragraph, immediately BEFORE the sentence beginning `Go straight to \`bash scripts/claude-cloud-setup.sh\``, as these exact sentences:

  > First, read `$HOME/claude-cloud-setup.log` and print exactly one line: `claude-cloud-setup.log: absent — the environment Setup script left no trace in this container (not executed, or its write failed)` or `claude-cloud-setup.log: present — tail: {last 5 lines}`. Absence is evidence, not proof — a failed log write is indistinguishable from non-execution from inside the container. The full log stays on disk for a deeper look within this session.

- **Insert B (self-heal completion clause)** — a NEW paragraph between the self-heal paragraph (which ends `…re-run the resolved-build line once before proceeding to the kickoff.`) and the `Then: /claude-tweaks:{skill}` kickoff line, as this exact paragraph:

  > If, after a successful self-heal, invoking the kickoff skill below via the Skill tool still fails with an unknown- or unrecognized-skill error — the deterministic signal that this session's skill catalog was frozen before the install — do not stop there: read `<path>/skills/<skill>/SKILL.md`, where `<path>` is the path component the just-printed resolved-build line reported (it exists by construction — this clause fires only after that line succeeded) and `<skill>` is the kickoff skill named on the `Then:` line below, and execute that file's instructions directly, following them as written (frontmatter, the interaction-style directive, each step) rather than summarizing them. One exclusion, stated with its principle: if the kickoff below is `/claude-tweaks:dispatch`, do not execute it manually — report the degraded sandbox and stop. Dispatch claims queue records and triggers builds and merges — standing effects beyond a report — and any future routine whose skill claims work or writes beyond report-only surfaces gets the same exclusion.

- Version bumps from tree values at edit time (verified matching the record 2026-08-09): `code-health` 6→7, `dispatch` 6→7, `docs-health` 6→7, `harness-health` 6→7, `journey-health` 7→8, `tidy` 7→8. If the merged tree shows different pre-edit values, recompute (+1 from actual), never keep both sides or pick a literal (IL-99).
- All six template prompts stay byte-identical modulo the final `Then:` kickoff line (the schema test enforces this after paragraph-folding normalization).
- No test-file edits expected; if `tests/routine-template-schema.test.js` needs changes, STOP and surface it as a finding — do not edit it as a routine step.
- Commit messages: `{Verb} {what} — refs #260` (never `closes`/`fixes`).

---

### Task 1: Canonical preamble edit in routine-template-schema.md

**Files:**
- Modify: `skills/_shared/routine-template-schema.md` (the `## Standard prompt preamble` fenced block, ~lines 82-91)

**Interfaces:**
- Produces: the canonical preamble text Task 2 propagates verbatim (modulo folding) into six templates.

- [ ] **Step 1: Apply Insert A**

In the paragraph beginning `If all four rungs above came up empty`, insert the Insert A sentences (Global Constraints, quoted above) immediately after `…what the \`unresolved\` line already established.` and immediately before `Go straight to \`bash scripts/claude-cloud-setup.sh\` to self-heal…`. Rewrap the paragraph's hard line breaks as needed; sentence text must be exactly Insert A's.

- [ ] **Step 2: Apply Insert B**

Insert the Insert B paragraph (Global Constraints, quoted above) as its own paragraph between the (now-extended) self-heal paragraph and the `Then: /claude-tweaks:{skill}` line, separated by blank lines on both sides.

- [ ] **Step 3: Verify the block parses as the test expects**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('skills/_shared/routine-template-schema.md','utf8').split('## Standard prompt preamble')[1].split('\x60\x60\x60')[1];const paras=s.trim().split(/\n\s*\n/);console.log(paras.length);console.log(paras[paras.length-1].slice(0,20));"`
Expected: the paragraph count went up by exactly 1 relative to before the edit (Insert B; Insert A extends an existing paragraph), and the last paragraph still starts `Then: /claude-tweaks:`.

- [ ] **Step 4: Commit**

```bash
git add skills/_shared/routine-template-schema.md
git commit -m "Extend the canonical routine preamble with the setup-log read and self-heal completion clauses — refs #260"
```

### Task 2: Propagate to all six templates + version bumps

**Files:**
- Modify: `skills/code-health/routine-template.yml`, `skills/dispatch/routine-template.yml`, `skills/docs-health/routine-template.yml`, `skills/harness-health/routine-template.yml`, `skills/journey-health/routine-template.yml`, `skills/tidy/routine-template.yml`

**Interfaces:**
- Consumes: Task 1's canonical block text.
- Produces: six templates whose preambles byte-match the canonical text after the test's paragraph-folding normalization, each `template_version` bumped by exactly one.

- [ ] **Step 1: Edit each template's `prompt: >` scalar**

For each of the six files, apply the same two inserts at the same positions inside the folded scalar (keeping the 2-space YAML indent and re-wrapping long lines at the file's existing width). The `Then: /claude-tweaks:{skill}` line stays each template's own. Sentence text must be exactly the canonical block's — the test folds each paragraph to one line and byte-compares.

- [ ] **Step 2: Bump each `template_version`**

`code-health` 6→7, `dispatch` 6→7, `docs-health` 6→7, `harness-health` 6→7, `journey-health` 7→8, `tidy` 7→8 (recompute from actual pre-edit values if they differ — IL-99).

- [ ] **Step 3: Run the schema suite**

Run: `node --test tests/routine-template-schema.test.js 2>&1 | tail -5`
Expected: all tests pass (the preamble-parity tests are the verifier; a mismatch names the drifted skill).

- [ ] **Step 4: Commit**

```bash
git add skills/code-health/routine-template.yml skills/dispatch/routine-template.yml skills/docs-health/routine-template.yml skills/harness-health/routine-template.yml skills/journey-health/routine-template.yml skills/tidy/routine-template.yml
git commit -m "Propagate the extended preamble to all six routine templates, bump template_versions — refs #260"
```

### Task 3: Acceptance verification

**Files:**
- Test: full suite + merge-base version-bump diff (no edits expected)

**Interfaces:**
- Consumes: Tasks 1-2.

- [ ] **Step 1: AC 3 — version bumps against the merge base**

Run: `git diff $(git merge-base HEAD main)..HEAD -- 'skills/*/routine-template.yml' | grep -E '^[-+]template_version'`
Expected exactly (order per file):
```
-template_version: 6
+template_version: 7
```
×4 (code-health, dispatch, docs-health, harness-health) and
```
-template_version: 7
+template_version: 8
```
×2 (journey-health, tidy) — 12 lines total, each new value = old + 1.

- [ ] **Step 2: AC 1/2 spot checks**

Run: `grep -c -F 'claude-cloud-setup.log: absent' skills/_shared/routine-template-schema.md skills/code-health/routine-template.yml skills/dispatch/routine-template.yml skills/docs-health/routine-template.yml skills/harness-health/routine-template.yml skills/journey-health/routine-template.yml skills/tidy/routine-template.yml`
Expected: `1` for every file (7 lines).

Run: `grep -c -F 'do not execute it manually' skills/_shared/routine-template-schema.md skills/code-health/routine-template.yml skills/dispatch/routine-template.yml skills/docs-health/routine-template.yml skills/harness-health/routine-template.yml skills/journey-health/routine-template.yml skills/tidy/routine-template.yml`
Expected: `1` per file — the dispatch exclusion lives in the shared preamble text, no per-template variance.

- [ ] **Step 3: Full suite**

Run: `npm test` (redirect to a file and tail)
Expected: green, 0 fail. Any `tests/routine-template-schema.test.js` failure is a parity defect in Task 1/2 — fix those files, never the test.
