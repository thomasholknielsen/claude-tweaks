---
record: 708
origin: human
risk: low
size: low
ceremony: standard
grants: [build, merge]
fingerprint: feedback-ce0bd508
surface: backend
---
# 708: specify shaping-mode: per-record `ceremony-check #{n}` / `framing-check` invocations collapsed to one each across a six-record batch, yet six divergent verdicts were stamped — the per-record rule is prose-only and unenforced

Surface: backend

## Current State

`skills/specify/shaping-mode.md`'s "Stamp scoring and stage labels" section instructs invoking `Skill(skill: "claude-tweaks:assess-agent-autonomy", args: "ceremony-check #{n}")` and `Skill(skill: "claude-tweaks:challenge", args: "framing-check")` — and `skills/specify/record-creation.md`'s per-sub-issue loop (decomposition mode) carries the identical bare pattern (`args: "ceremony-check"` / `args: "framing-check"`, no per-sub-issue attribution). `skills/challenge/SKILL.md`'s `framing-check` mode states the contract runs "Every record, every run, no pre-filtering."

In an observed six-record run, the transcript contains exactly two `Skill` tool invocations total — one `ceremony-check #678` and one bare `framing-check` — yet six divergent verdicts were stamped as labels on six different records, including a `ceremony:fast-lane` verdict on #680 that diverges from the rest. The model loaded each contract's instructions into context once (from the first invocation), then rendered the remaining five records' verdicts inline from memory rather than re-invoking the `Skill` tool. Nothing in `shaping-mode.md`, `record-creation.md`, `challenge/SKILL.md`, or `ceremony-check.md` makes this omission visible at write time — the per-record requirement is stated only in prose, with no self-check or structural signal tying a stamped verdict back to its own `Skill` invocation.

## Deliverables

- [ ] In `skills/specify/shaping-mode.md` (and, since it carries the identical unenforced pattern, `skills/specify/record-creation.md`'s per-sub-issue loop), state explicitly that the `ceremony-check` and `framing-check` invocations occur once per record/sub-issue, each call carrying that record's number in `args`.
- [ ] Extend `framing-check` mode (`skills/challenge/SKILL.md` and its `challenge` skill directory) to accept and use an optional `#{n}` argument for attribution — mirroring `ceremony-check`'s existing `#{n}` shape — so a `framing-check #{n}` call and its rendered verdict can be tied back to a specific record. `ceremony-check`'s own call in `record-creation.md`'s per-sub-issue loop stays bare (no `#{n}`) by design — the sub-issue has no number yet at that point in the procedure (per `ceremony-check.md`'s Input note) — so this extension only affects `framing-check`'s argument handling, not `ceremony-check`'s.
- [ ] Add a self-check line to `shaping-mode.md` (and `record-creation.md`'s equivalent point), immediately before the compose-then-write-once / per-sub-issue write step: one `ceremony-check #{n}` and one `framing-check #{n}` invocation must exist per record in this run — a divergent ceremony or framing verdict across records is only valid when each record had its own invocation.
- [ ] Add a `node --test` conformance test that pins the per-record invocation wording across `shaping-mode.md`, `record-creation.md`, `challenge/SKILL.md`, and `ceremony-check.md`, so the four files cannot silently drift out of agreement with each other in a future edit.

## Acceptance Criteria

1. `shaping-mode.md`'s "Stamp scoring and stage labels" section and `record-creation.md`'s per-sub-issue loop both explicitly state that `ceremony-check` and `framing-check` are invoked once per record, with `#{n}` in `args` (bare for `ceremony-check`'s decomposition-mode call only, per its own documented pre-numbering constraint).
2. `framing-check` mode's contract (`challenge/SKILL.md`) documents and its Input handling accepts an optional `#{n}` argument, used to attribute the rendered verdict to a specific record.
3. A self-check statement requiring one `ceremony-check #{n}` and one `framing-check #{n}` invocation per record appears in both `shaping-mode.md` (before its write call) and `record-creation.md` (before its per-sub-issue write call).
4. A new `node --test` test asserts the per-record invocation wording is present and mutually consistent across `shaping-mode.md`, `record-creation.md`, `challenge/SKILL.md`, and `ceremony-check.md`; the test fails if any one of the four drifts from the others.
5. `npm test` is green.
6. Existing single-record shaping runs and single-sub-issue decomposition runs are behaviorally unaffected — the fix changes only what's checkable/attributable when a run processes more than one record, not the underlying judgment `ceremony-check`/`framing-check` render.

## Technical Approach

Edit `skills/specify/shaping-mode.md`'s "Stamp scoring and stage labels" section and `skills/specify/record-creation.md`'s "Ceremony"/"Framing" subsections to make the per-record invocation requirement structurally explicit (not just implied by "per sub-issue"/"per record" prose that a model can silently stop re-deriving mid-run). Cross-check `skills/challenge/SKILL.md`'s `framing-check` mode definition to add `#{n}` argument support consistent with `skills/assess-agent-autonomy/ceremony-check.md`'s existing convention, including its documented bare-call exception for decomposition mode's pre-numbering case. Add the pinning conformance test under `tests/` — likely alongside the existing skill-prose conformance suites — asserting the four files' per-record wording is present and matches.

## Gotchas

- This is an instruction-following gap, not a code defect: none of the four affected files execute code that could hard-block a missing `Skill` invocation, so the fix is limited to making the requirement checkable (an explicit self-check line plus a conformance test that pins the prose), not runtime enforcement. Assumes a prose self-check plus a pinning test is sufficient friction to prevent recurrence (unvalidated — the only available signal is prose-conformance test coverage, not a live re-run of the exact repro).
- The repro is a single observed transcript (a six-record run with two `Skill` invocations and one divergent verdict); there is no automated harness that reconstructs "N invocations occurred" from a transcript, so this record's acceptance criteria verify the prose/test changes land, not that the original failure mode can no longer occur in a live agent run.
- `record-creation.md`'s per-sub-issue loop carries the same unenforced pattern as `shaping-mode.md` even though the issue names only `shaping-mode.md` as the affected component — both are in scope here since they share the identical defect, but avoid scope-creeping into unrelated batch-loop or sub-issue-creation mechanics in either file.
- `shaping-mode.md`'s SKILL.md (as of the plugin version this record was shaped against) does not yet document any multi-record or range input for shaping mode itself — the six-record scenario in the repro most plausibly reflects `/specify` (in either mode) being invoked repeatedly within one session, with the model treating a previously-loaded contract as already-understood on later invocations, rather than a documented batch feature. The proposed fix (self-check + conformance test) addresses the underlying enforcement gap regardless of which exact repro path produced it.

## Original request

specify shaping-mode: per-record `ceremony-check #{n}` / `framing-check` invocations collapsed to one each across a six-record batch, yet six divergent verdicts were stamped — the per-record rule is prose-only and unenforced

**Summary:** `shaping-mode.md` prescribes `Skill(… "ceremony-check #{n}")` and `Skill(… "framing-check")` per record against the now-shaped body, and `challenge/SKILL.md` states "Every record, every run, no pre-filtering"; in a six-record run the transcript contains exactly two Skill calls (`ceremony-check #678`, `framing-check`) — the model loaded each contract once, then rendered six verdicts inline (with a divergent `ceremony:fast-lane` on #680) and stamped all six as labels.

**Kind:** Defect

**Affected component:** `skills/specify/shaping-mode.md` (Stamp scoring and stage labels); `skills/challenge/SKILL.md` framing-check; `skills/assess-agent-autonomy/ceremony-check.md`

**Objective:** Instruction efficacy

**Repro steps:**
1. Invoke `/claude-tweaks:specify` with more than one record reference (e.g. a range).
2. Observe the Skill tool calls: one `ceremony-check #{first}` and one bare `framing-check`, then per-record verdicts narrated without further invocations.

**Expected vs. actual:**
Expected: one `ceremony-check #{n}` and one `framing-check` invocation per record, each producing that record's two-line verdict.
Actual: one invocation each for the batch; verdicts for the remaining five records rendered from memory. The per-record requirement was loaded into context (the framing-check contract was read at the start of the run) and then not followed — nothing in either contract makes the omission visible.

**Proposed fix:** Make the per-record requirement checkable rather than prose-only. In `shaping-mode.md`'s (to-be-added) batch loop, state that the ceremony and framing invocations occur inside the loop with the record number in `args` (`framing-check` should also accept `#{n}` for attribution), and add a self-check line before the write pass: "one `ceremony-check #{n}` and one `framing-check #{n}` invocation must exist per record in this run — a divergent ceremony verdict across records is only valid if each record had its own invocation." Pair with a conformance test pinning the per-record wording in `shaping-mode.md`, `challenge/SKILL.md`, and `ceremony-check.md` so the three contracts cannot drift apart.

**Definition:** Clear

**Plugin version:** 6.88.0

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).
<!-- fingerprint: feedback-ce0bd508 -->
