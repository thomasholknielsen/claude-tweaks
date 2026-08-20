# Spec-Template Key Files Rename Clause Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a clause to `plugin/skills/specify/spec-template.md`'s `### Key Files` guidance requiring a spec author to grep the repo for a renamed contract surface's old literal text and list every consumer file found — closing the IL-132 gap where a rename's Key Files list only named files the work itself would author.

**Architecture:** Pure documentation edit. Insert new instructional prose directly below the existing two-item placeholder list inside the `### Key Files` subsection of the record-body template (the fenced block starting at `spec-template.md` line 13), in the same bracketed-instruction voice the rest of the template already uses. No code, no new structural/mechanical check.

**Tech Stack:** Markdown only.

**Spec:** `.claude-tweaks/pipelines/2026-08-20T192435-record-550/work/550-spec.md` (record #550)

## Global Constraints

- Authoring guidance only — do not add a grep-based structural/mechanical check anywhere (spec's Gotchas).
- Clause must stay scoped to *renames* of contract surfaces (report sections, headings, check names, exported symbols) — never a blanket "grep everything" instruction.
- The new clause must not introduce any token forbidden by `spec-template.md`'s own `## No Placeholders` section (`TBD`, `TODO`, `(to be filled in)`, "handles edge cases", "with appropriate validation", "Similar to spec N", "Standard error handling", etc.).
- `grep -n "Key Files" plugin/skills/specify/spec-template.md` must still resolve to the same `### Key Files` heading after the edit.
- Worked example must concretely name the IL-132 pattern: spec #518 renamed `/claude-tweaks:tidy`'s report sections; its Key Files list omitted `skills/tidy/scan-procedures.md`, whose Collection routing table bound scan tags to those section names by literal text.

---

### Task 1: Add the consumer-grep clause to Key Files guidance

**Files:**
- Modify: `plugin/skills/specify/spec-template.md:69-72` (the `### Key Files` subsection inside the fenced record-body template block)

**Interfaces:**
- Consumes: nothing (pure prose edit)
- Produces: nothing consumed by later tasks — this is the only task

- [ ] **Step 1: Read the current section**

Run: `sed -n '65,76p' plugin/skills/specify/spec-template.md`

Expected output (current state):
```
### Data / API Surface

{If this spec involves data model or API changes, define the contract surface. Table/model names, field types, endpoint signatures, validation schemas. Not full implementation — just enough for `/superpowers:writing-plans` to generate exact code.}

### Key Files

- `{path}` — {what changes or new file purpose}
- `{path}` — {what changes}

### Package Dependencies

- `{package}` — {what's needed from it}
```

- [ ] **Step 2: Insert the new clause**

Edit `plugin/skills/specify/spec-template.md`, replacing:

```
### Key Files

- `{path}` — {what changes or new file purpose}
- `{path}` — {what changes}

### Package Dependencies
```

with:

```
### Key Files

- `{path}` — {what changes or new file purpose}
- `{path}` — {what changes}

When this work **renames** a contract surface — a report section heading, a check name, an exported symbol, or any other name other files reference by literal text — grep the repo for the surface's exact old literal text and list every consumer file the grep finds here, not only the files this work itself will author. A file that only *reads* the old name never appears in the diff you're imagining, so it's easy to omit without this step. Example: spec #518 renamed `/claude-tweaks:tidy`'s report sections and listed only the files it would write (`SKILL.md`, `step-6-auto.md`, `step-6-interactive.md`) — it omitted `skills/tidy/scan-procedures.md`, whose Collection routing table bound each scan tag to a report section by that section's literal old name, and the rename shipped with the routing table still pointing at the retired names, caught only in whole-branch review (`docs/incident-log.md`'s IL-132).

### Package Dependencies
```

- [ ] **Step 3: Verify the heading still resolves**

Run: `grep -n "Key Files" plugin/skills/specify/spec-template.md`
Expected: at least one match on `### Key Files` (AC4) — the heading line itself, unchanged.

- [ ] **Step 4: Verify no forbidden placeholder tokens were introduced**

Run: `grep -nE "TBD|TODO|\(to be filled in\)|handles edge cases|with appropriate validation|Standard error handling" plugin/skills/specify/spec-template.md`
Expected: no new matches inside the new clause (the command may still match pre-existing occurrences elsewhere in the file's own `## No Placeholders` section, which quotes these tokens as examples of what NOT to write — confirm any match found is inside that section, not inside the new `### Key Files` clause).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — this is a documentation-only change; no existing suite pins the exact `### Key Files` prose (confirmed: `tests/terminal-track.test.js` and `tests/bin-lib/issues/grouping.test.js` reference unrelated lines in this file), so no test should need updating.

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/specify/spec-template.md
git commit -m "Add consumer-grep clause to spec-template's Key Files guidance for surface renames

refs #550"
```
