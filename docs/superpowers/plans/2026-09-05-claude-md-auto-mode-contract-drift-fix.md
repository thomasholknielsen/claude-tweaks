# CLAUDE.md Auto-Mode Contract Drift Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update CLAUDE.md's Auto-Mode Contract paragraph so it states explicitly that the "at most two stops" promise is a ceiling, not a floor — matching the canonical `plugin/skills/_shared/auto-mode-contract.md`, which already makes this distinction.

**Architecture:** Pure documentation fix — replace one paragraph in `CLAUDE.md`'s "Auto-Mode Contract + Bookend Architecture (v4.6+)" section with the record's proposed text. No code, schema, or behavioral changes.

**Tech Stack:** Markdown only.

**Spec:** `.claude-tweaks/pipelines/2026-09-05T132902-record-1537/work/1537-spec.md` (record #1537, filed by `/claude-tweaks:harness-health`)

## Global Constraints

- Replace the paragraph verbatim with the record's "Proposed" text — no paraphrasing, no additional rewording beyond what the record specifies.
- Do not touch any other paragraph or section of CLAUDE.md.

---

### Task 1: Replace the Auto-Mode Contract paragraph in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md:107`

**Interfaces:**
- Consumes: nothing (prose-only edit, no code interfaces)
- Produces: nothing (prose-only edit, no code interfaces)

- [ ] **Step 1: Confirm the current paragraph still matches the record's "Current" quote**

Run: `grep -n "claude-tweaks pipelines have at most two stops" CLAUDE.md`
Expected: one match, at line 107, reading exactly:
`claude-tweaks pipelines have at most two stops in \`auto\` mode: a **Pipeline Config Manifesto** at the start (one structured numbered-options block collecting all policy levers in a single message) and a **Wrap-Up Review Console** at the end (one batch table consolidating everything auto-decided or staged). Everything in between is policy-driven automation logged to the auto-decision log.`

If the text has drifted from this exact string, stop and re-derive the edit against the actual current text rather than applying the diff blind.

- [ ] **Step 2: Replace the paragraph**

Replace the line found in Step 1 with:

```markdown
claude-tweaks pipelines have at most two stops in `auto` mode: a **Pipeline Config Manifesto** at the start (one structured numbered-options block collecting all policy levers in a single message) and a **Wrap-Up Review Console** at the end (one batch table consolidating everything auto-decided or staged). The two-stop ceiling isn't a floor: in default `auto`, the Manifesto renders as a **read-only FYI** (displays levers, doesn't gate), so the everyday run has effectively **one** user-facing stop — the end Review Console. Pass `confirm` (or `hybrid`) to turn the Manifesto into a real approval gate. Everything in between is policy-driven automation logged to the auto-decision log.
```

- [ ] **Step 3: Verify the replacement landed and nothing else changed**

Run: `git diff CLAUDE.md`
Expected: exactly one paragraph changed (the line replaced in Step 2), no other lines touched.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Fix CLAUDE.md drift: clarify Manifesto is a read-only FYI in default auto, not a real stop

refs #1537"
```
