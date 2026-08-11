# Fix dangling design-doc citation in ADR 0004's Context line — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dangling `design docs/superpowers/specs/2026-07-08-worktree-directory-convention-design.md` citation from `docs/decisions/0004-worktree-two-domain-convention.md`'s Context line — that file was never committed to this repo under that or any similar name.

**Architecture:** Single-line text edit to one markdown file. No code, no behavior change.

**Tech Stack:** Markdown.

## Global Constraints

None — this is a documentation-only correction (record #321, ceremony:fast-lane).

---

### Task 1: Drop the dangling design-doc citation

**Files:**
- Modify: `docs/decisions/0004-worktree-two-domain-convention.md:5`

**Interfaces:**
- Consumes: nothing (standalone edit).
- Produces: nothing (no downstream task).

- [ ] **Step 1: Confirm the dangling citation still resolves to nothing**

Run:
```bash
git log --all --diff-filter=A --name-only | grep -i "worktree-directory-convention.*design"
find . -iname "*worktree-directory-convention-design*" -not -path "*/node_modules/*"
```
Expected: both commands return no output — no file ever existed under that name.

- [ ] **Step 2: Edit the Context line**

Current text (`docs/decisions/0004-worktree-two-domain-convention.md:5`):
```
- **Context:** `/claude-tweaks:challenge` debiasing brief `docs/plans/2026-07-08-worktree-directory-convention-brief.md`; design `docs/superpowers/specs/2026-07-08-worktree-directory-convention-design.md`
```

Replace with:
```
- **Context:** `/claude-tweaks:challenge` debiasing brief `docs/plans/2026-07-08-worktree-directory-convention-brief.md`
```

- [ ] **Step 3: Verify the edit**

Run:
```bash
grep -n "Context:" docs/decisions/0004-worktree-two-domain-convention.md
```
Expected: the Context line no longer mentions `worktree-directory-convention-design.md`, and still cites the brief at `docs/plans/2026-07-08-worktree-directory-convention-brief.md`.

- [ ] **Step 4: Commit**

```bash
git add docs/decisions/0004-worktree-two-domain-convention.md
git commit -m "Fix ADR 0004 Context line: drop dangling design-doc citation

refs #321"
```
