# Plan: Forward parent spec's Acceptance Criteria to per-task SDD review dispatches (#360)

## For agentic workers

Executed via `/claude-tweaks:build` (subagent strategy). Single task, single file.

## Context

`skills/build/SKILL.md`'s `**subagent** (default):` paragraph (currently line 201) already composes an explicit instruction string forwarded to `/superpowers:subagent-driven-development`, today used only to override per-task model tier. It forwards nothing about the parent spec's own `## Acceptance Criteria` section, so a per-task reviewer inside `subagent-driven-development` can only compare a task's diff against that task's own brief — not against the spec it was derived from. A task brief that itself misstates a spec's Acceptance Criterion passes its own review; the mismatch only surfaces at the final whole-branch review.

## Task 1: Extend the subagent-dispatch instruction with an Acceptance-Criteria-forwarding directive

**Files:**
- `skills/build/SKILL.md` (modify) — the `**subagent** (default):` paragraph, ~line 201

**Change:** Within that same paragraph (same sentence/paragraph as the existing tier-override instruction — not a new disconnected step), add a directive that `/build` instructs `/superpowers:subagent-driven-development` to include the relevant excerpt of the parent spec's own `## Acceptance Criteria` section — read from the materialized spec at `{run-dir}/work/{n}-spec.md` — alongside the diff and the task's own brief, in every per-task review dispatch.

**Acceptance criteria (from the spec):**
- The instruction lives in the same paragraph as the tier-override instruction, not a separate step.
- It names the exact source: the materialized spec's `## Acceptance Criteria` section at `{run-dir}/work/{n}-spec.md` — not the raw GitHub issue body, not re-derived from the task brief.
- No superpowers plugin files are touched — scoped entirely to what `/build` forwards at invocation time.
- The instruction is phrased so a per-task review dispatch composed under it visibly carries the AC excerpt (verifiable by inspecting a real composed dispatch prompt during a build — this build's own dispatches, once Task 2+ of this multi-spec run reach subagent-driven-development, are the live verification).

**Verification:** `npm test` (no test suite targets prose instructions in SKILL.md directly; this is a documentation/instruction change to an already-tested dispatch mechanism). Manual check: grep the edited paragraph for the new directive text and confirm it reads as one coherent paragraph with the tier-override sentence.
