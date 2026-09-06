# Record #1804 — Stale Ledger Citation Investigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confirm whether record #1804's proposed citation fix has a live target, and record the outcome — no fix is possible if the target is gone.

**Architecture:** Single verification task: re-derive the git history behind the record's premise, confirm the target file's current state, and append an Investigation outcome note to the materialized spec file documenting the finding for the review/wrap-up phase.

**Tech Stack:** git CLI only — no application code, no tests beyond the existing suite.

**Spec:** `.claude-tweaks/pipelines/2026-09-05T212941-record-1804/work/1804-spec.md`

## Global Constraints

- No edits to `plugin/` runtime code — this record's own Deliverables never named any.
- Do not fabricate a fix against a file that does not exist in this checkout.

---

### Task 1: Verify target state and record the investigation outcome

**Files:**
- Modify: `.claude-tweaks/pipelines/2026-09-05T212941-record-1804/work/1804-spec.md` (append an "## Investigation outcome" section after the existing body)

**Interfaces:**
- Consumes: nothing (first and only task)
- Produces: an "## Investigation outcome" section other pipeline phases (review/wrap-up) read to decide the close-vs-merge call

- [ ] **Step 1: Re-confirm the cited ledger file is absent**

Run:
```bash
find . -iname "*1368-subagent-contract-violation*"
git log --all --oneline --diff-filter=D -- "*1368-subagent-contract-violation*"
```
Expected: `find` returns nothing (file absent from the working tree); `git log` shows commit `eda4fd7aa1b` ("Tidy: delete 2 completed execution plans + 8 orphaned pipeline ledgers (#1819)") as the deleting commit.

- [ ] **Step 2: Re-confirm the deleted content was already fully resolved**

Run:
```bash
git show eda4fd7aa1bef0b1aba301d01c8c834f7b6683ea^:docs/plans/2026-08-27-1368-subagent-contract-violation-investigation-ledger.md
```
Expected: the file's Row 1 shows `Status: accepted` with a Resolution already posted as a GitHub issue comment — i.e., the exact line-citation drift #1804 flags was already moot by the time the doc was deleted (the whole ledger had no remaining open row, which is why tidy's #1819 removed it).

- [ ] **Step 3: Append the Investigation outcome section to the spec file**

Append to `.claude-tweaks/pipelines/2026-09-05T212941-record-1804/work/1804-spec.md`:

```markdown

## Investigation outcome

The record's cited doc — `docs/plans/2026-08-27-1368-subagent-contract-violation-investigation-ledger.md` —
no longer exists in this checkout. It was deleted 2026-09-04 by commit `eda4fd7aa1b`
("Tidy: delete 2 completed execution plans + 8 orphaned pipeline ledgers (#1819)"), because its
one investigation row already carried `Status: accepted` with its resolution already posted as an
issue comment (see the pre-deletion content at `eda4fd7aa1b^:docs/plans/2026-08-27-1368-...md`).

The record's Deliverables (updating a stale `subagent-stop.js:50` → `:77` citation inside that
ledger) therefore has no remaining target — the file to edit is gone, and no substitute location
carries the same citation. No code or doc change is possible or needed.

**Recommendation for review/wrap-up:** close record #1804 as moot (the record's own body already
authorizes this: "Close to resolve; label `wontfix` to suppress future reports of this finding.").
Do not merge this PR as a code change — there is no diff to merge beyond the materialized spec
file itself.
```

- [ ] **Step 4: Verify the append landed correctly**

Run:
```bash
grep -n "Investigation outcome" ".claude-tweaks/pipelines/2026-09-05T212941-record-1804/work/1804-spec.md"
```
Expected: PASS — one match, at the new section heading.

- [ ] **Step 5: Commit**

```bash
git add ".claude-tweaks/pipelines/2026-09-05T212941-record-1804/work/1804-spec.md"
git commit -m "Record #1804 investigation outcome: cited ledger already deleted, no fix target remains"
```
