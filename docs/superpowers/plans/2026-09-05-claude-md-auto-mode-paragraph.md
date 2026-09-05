# CLAUDE.md Auto-Mode Paragraph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the missing "Auto mode" paragraph to CLAUDE.md's `## claude-tweaks Pipeline` section so it matches the installed claude-tweaks plugin's own CLAUDE.md-generation template verbatim.

**Architecture:** Single-file prose insertion — no code, no behavioral surface. Insert one paragraph between the existing `**\`/claude-tweaks:flow\`:**` line and the `**Integration model**` line in CLAUDE.md, copied verbatim from `plugin/skills/init/claude-md-template.md` lines 87-90.

**Tech Stack:** Markdown only.

**Spec:** `.claude-tweaks/pipelines/2026-09-05T165647-record-1634/work/1634-spec.md`

## Global Constraints

- The inserted paragraph text must be byte-for-byte identical to `plugin/skills/init/claude-md-template.md`'s "Auto mode" paragraph (lines 87-90 as of this run's verification) — no paraphrasing.
- No other content in CLAUDE.md's `## claude-tweaks Pipeline` section changes.

---

### Task 1: Insert the "Auto mode" paragraph into CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (repo root, `## claude-tweaks Pipeline` section, between the `/claude-tweaks:flow` line and the `Integration model` line)
- Test: none (doc-only change; verified by a grep assertion, no test suite covers CLAUDE.md prose)

**Interfaces:**
- Consumes: nothing
- Produces: nothing (terminal task)

- [ ] **Step 1: Verify current state**

Run: `grep -n "Auto mode" CLAUDE.md`
Expected: FAIL (no match — the paragraph is currently absent)

- [ ] **Step 2: Insert the paragraph**

Edit `CLAUDE.md`, replacing:

```
**`/claude-tweaks:flow`:** specs only — it rejects design docs. Defaults to `auto` (hands-off); pass `confirm`, `interactive`, or `hybrid` to change that.

**Integration model** (`plugin/skills/_shared/integration-model.md`): GitHub-backed projects default to `pr-first`
```

with:

```
**`/claude-tweaks:flow`:** specs only — it rejects design docs. Defaults to `auto` (hands-off); pass `confirm`, `interactive`, or `hybrid` to change that.

**Auto mode:** in default `auto`, the Pipeline Config Manifesto renders as a read-only FYI — it computes and displays the policy levers, then proceeds without stopping — so the only user-facing stop is the Wrap-Up Review Console at the end. Pass `confirm` (or `hybrid`) to turn the Manifesto into a real approval gate; the rest of the pipeline still runs as `auto` once approved.

**Integration model** (`plugin/skills/_shared/integration-model.md`): GitHub-backed projects default to `pr-first`
```

- [ ] **Step 3: Verify the paragraph landed and nothing else changed**

Run: `grep -n "Auto mode" CLAUDE.md && git diff --stat CLAUDE.md`
Expected: PASS — one match for "Auto mode:", and `git diff --stat` shows exactly one file changed with a small insertion (no deletions beyond the two now-adjacent lines being separated by the new paragraph).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Restore missing Auto mode paragraph to CLAUDE.md Pipeline section

refs #1634"
```
