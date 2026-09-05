# subagent-stop.js Second False-Positive Class — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close #1480 — extend `plugin/bin/lib/hooks/subagent-stop.js`'s "Known false-positive source" header comment to also name a background-job-orchestrated session's own interim narration turns, so a future reader of `events.jsonl`'s `contract-violation` entries for such a run understands why a high count there does not necessarily indicate genuine subagent contract violations.

**Spec:** GitHub issue #1480 (materialized at `.claude-tweaks/pipelines/2026-09-05T110945-record-1480/work/1480-spec.md`).

## Assessment

Documentation-only change, no behavioral surface — the record's own Deliverables note "no behavioral change required." `ceremony: fast-lane` (assess-agent-autonomy verdict — pure comment/documentation correction).

---

### Task 1: Extend the header comment and verify

**Files:** `plugin/bin/lib/hooks/subagent-stop.js` (modify header comment only)

- [x] **Step 1: Extend the "Known false-positive source" comment block**

  Renumber the existing #750 dispatch-template source as item 1, and add a second
  item naming a background-job-orchestrated session's own interim narration turns
  (checked independently of its dispatched subagents' final replies, even though the
  subagent-output-contract's status-line requirement never applies to those interim
  turns).

- [x] **Step 2: Run the pinned regression test for this file**

  Run: `node --test tests/hooks-log-modules.test.js`
  Expected: pass — no behavior changed, only a comment.

- [x] **Step 3: Commit**

  Commit the code comment change, this plan, and the already-materialized
  `work/1480-spec.md` together.
