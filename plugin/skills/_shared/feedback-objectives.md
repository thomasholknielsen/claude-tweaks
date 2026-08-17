# Feedback Objectives — the maintainer-objective rubric

This file is **the canonical enumeration of the objective set** that `/feedback`'s
session-evaluation judge scores a session against — downstream references check against this
file, not any issue or design doc. Consumed by `/feedback`'s session-evaluation judge (see
`docs/skill-graph.md`); written so `/reflect` lenses can map onto the objectives in this file
later.

## Norms

1. **"No finding" is the expected common answer.** A per-objective `NO FINDING` is a valid,
   complete result; a session with zero findings is a successful evaluation. Never manufacture a
   finding to satisfy a lens. A lens the judge could not evidence renders `NOT EVALUATED —
   {reason}`, never a silent `NO FINDING`.
2. **Quantify where the lens is countable.** Countable lenses report numbers from the transcript,
   not impressions.

## Finding requirement

Every finding carries: **symptom** (what went wrong or could improve), **transcript evidence**
(excerpt or precise pointer), and **proposed fix** (a concrete solution idea). A finding missing
any of the three does not file.

## Objectives

| Objective | Class | Definition | Session evidence |
|---|---|---|---|
| Automation efficiency | judgment | The plugin automates everything that is efficient to automate | Manual steps a skill or policy lever could have absorbed; repeated hand-work inside a skill-guided flow |
| Context overhead | countable | Skills consume no more context than their job needs | Oversized tool results; repeated reads of the same file; skill text loaded but unused |
| Avoidable interactions | countable | The user is stopped only when the decision is genuinely theirs | Total `AskUserQuestion` count; per-stop avoidability verdict; whether the user simply picked the pre-marked Recommended option |
| Friction | countable | Flows proceed without workarounds, retries, or fighting the harness | Hook denials, command refusals, retry loops, error-and-recover sequences, model-side workarounds |
| Developer joy | judgment | Operating the plugin feels good, not burdensome | Moments of delight vs. drudgery; dense or illegible surfaces; satisfying vs. tedious closures |
| Trust calibration | judgment | Gates and autonomy levers match demonstrated outcomes | Confirms that always resolve the same way; auto-decisions later reverted; policy levers the session's outcomes contradict |
| Instruction efficacy | judgment | Skill text produces the behavior it prescribes | A loaded skill step visibly violated or reinterpreted; instructions the model routed around |
| Recovery quality | countable | Interruptions and residue resolve gracefully | Orphaned runs/worktrees/residue counts; resume behavior; state the user must clean up by hand |

The `Class` column drives the draft template's `**Measurement:**` field — countable lenses carry
it, judgment lenses omit it (see `skills/feedback/SKILL.md` Step 5).
