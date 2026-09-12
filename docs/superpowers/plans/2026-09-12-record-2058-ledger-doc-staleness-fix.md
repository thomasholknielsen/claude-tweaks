# Record 2058 Ledger Doc Staleness Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update one stale row in `docs/plans/2026-09-05-record-1687-ledger.md`'s Open Items table so it reflects that PR #1872 merged and closed #1687, instead of describing the PR as still open.

**Architecture:** Single-file text edit — replace the Item/Resolution cell text in row 1 of the Open Items table with the already-drafted "Proposed" text from the spec.

**Tech Stack:** Plain Markdown table edit, no code.

**Spec:** `.claude-tweaks/pipelines/2026-09-11T224837-record-2058/work/2058-spec.md`

## Global Constraints

- Touch only `docs/plans/2026-09-05-record-1687-ledger.md` — no other files.
- Use the exact "Proposed" text given in the spec, verbatim.

---

### Task 1: Update the stale Open Items row

**Files:**
- Modify: `docs/plans/2026-09-05-record-1687-ledger.md:5`

**Interfaces:**
- Consumes: nothing (leaf task, pure doc edit)
- Produces: nothing (leaf task, no downstream consumers)

- [ ] **Step 1: Confirm current row text**

Run: `grep -n "PR #1872" docs/plans/2026-09-05-record-1687-ledger.md`
Expected: matches the row 1 line containing `is still open`

- [ ] **Step 2: Replace the row's Item/Resolution text**

Replace the row currently reading:

```
| 1 | wrap-up | Residue sweep: PR #1872 (this run's own head branch worktree-record-1687) is still open | accepted | This run's own not-yet-merged draft PR — resolved by Phase 4's Auto-merge/Review Console step, not by this ledger; not residue in the "leftover" sense. |
```

with:

```
| 1 | wrap-up | Residue sweep: PR #1872 (this run's own head branch worktree-record-1687) was open at run time | accepted | This run's own draft PR, resolved by Phase 4's Auto-merge/Review Console step as designed — merged 2026-09-05T05:26:46Z, closing #1687; not residue in the "leftover" sense. |
```

- [ ] **Step 3: Verify the row no longer claims the PR is still open**

Run: `grep -n "is still open" docs/plans/2026-09-05-record-1687-ledger.md`
Expected: FAIL (no match) — confirms the stale claim is gone

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-09-05-record-1687-ledger.md
git commit -m "Fix stale Open Items row: PR #1872 merged, closing #1687"
```
