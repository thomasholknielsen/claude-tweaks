# Feedback session evaluation — design

**Date:** 2026-08-16
**Status:** approved in brainstorming; awaiting decomposition via `/claude-tweaks:specify`

## Problem

`/claude-tweaks:feedback` is a mature *filing* pipeline (classify → dedup → draft → scrub →
confirm → file), but its *capture* is thin. All capture today is end-loaded and narrow:

- `/reflect` lenses at pipeline end (D5 → staged `U#` → Review Console),
- health sweeps' subject check (`upstream-candidate` local issues → bare `/feedback --queue`),
- direct manual invocation, which harvests exactly one hand-typed observation.

A session that never runs a pipeline has no capture point, and even when the user notices
friction and invokes `/feedback`, the skill asks "what's your learning?" instead of looking at
the session itself. Feedback also arrives unanchored: nothing ties a filed issue to the
maintainer objectives the plugin is actually trying to serve, and nothing quantifies the
strongest available signal (e.g. how many `AskUserQuestion` stops the session actually cost and
whether each was avoidable).

## Chosen objectives

- **Coverage per invocation** — bare `/feedback` evaluates the *whole session* from above, so
  one invocation harvests everything the session evidences, not one hand-typed learning.
- **Fidelity** — findings carry transcript-grounded evidence and measurements, so triage needs
  no re-repro.
- **Right feedback** — evaluation is anchored to a named maintainer-objective rubric, so what
  gets filed is by construction aligned with what the plugin is optimizing for.

Explicitly accepted trade: sessions where the user never invokes `/feedback` remain uncaptured.
No standing mid-session capture directive (narrate-vs-execute unreliability), no new hooks.

## Design

### 1. New rubric contract: `skills/_shared/feedback-objectives.md`

The maintainer-objective set, stated once (cross-reference convention). Each entry in the table
below defines the objective, what session evidence for it looks like, and what a finding must
contain.

| Objective | Definition (short) | Evidence in a session |
|---|---|---|
| Automation efficiency | The plugin automates everything that is efficient to automate | Manual steps a skill/policy lever could have absorbed; repeated hand-work inside a skill-guided flow |
| Context overhead | Skills consume no more context than their job needs | Oversized tool results, redundant re-reads, skill text loaded but unused, avoidable full-file reads |
| Avoidable interactions | The user is stopped only when the decision is genuinely theirs | Every `AskUserQuestion` call: total count, per-stop avoidability verdict, and whether the user simply picked the pre-marked Recommended option |
| Friction | Flows proceed without workarounds, retries, or fighting the harness | Hook denials, command refusals, retry loops, model-side workarounds, error-and-recover sequences |
| Developer joy | Operating the plugin feels good, not burdensome | Qualitative: moments of delight vs. drudgery, dense/illegible surfaces, satisfying vs. tedious closures |
| Trust calibration | Gates and autonomy levers match demonstrated outcomes | Confirms that always resolve the same way; auto-decisions later reverted; policy levers whose setting the session's outcomes contradict |
| Instruction efficacy | Skill text actually produces the behavior it prescribes | A skill step visibly violated or reinterpreted despite being loaded; instructions the model routed around |
| Recovery quality | Interruptions and residue resolve gracefully | Orphaned worktrees/runs, resume behavior, session-start residue banners, state the user must clean up by hand |

Two norms stated at the top of the file:

- **"No finding" is the expected common answer.** The judge reports per-objective
  `NO FINDING` without manufacturing content; a session with zero findings is a valid, complete
  result. This is the counterweight to rubric-driven obligatory-finding pressure.
- **Quantify where the transcript allows.** Lenses with countable evidence (avoidable
  interactions above all) report numbers, not impressions.

**Solution-idea requirement:** every finding must contain a proposed fix (symptom + evidence +
proposed solution idea), or it does not file. Idea generation is a requirement on findings, not
a ninth lens.

### 2. `/feedback` flow change (`skills/feedback/SKILL.md`)

- **Bare invocation = session evaluation.** The existing Step 0 `upstream-candidate` queue
  check is kept; a new session-evaluation step runs alongside it, and both feed one merged
  batch. Free-text invocation stays exactly as today (single learning, no evaluation).
- Evaluation findings flow through the existing Steps 2–8 per finding: classify (each finding
  must still resolve D5 per `_shared/learning-routing.md` — a finding about the *project's own
  code* is dropped from the batch with a note, mirroring Step 0's per-candidate stop scoping),
  dedup, draft, scrub, confirm, file. N findings confirm through
  `_shared/upstream-feedback-batch.md`'s existing chunked `multiSelect` contract.
- **Interaction budget:** the whole bare-invocation run costs one batch confirmation plus
  `## Next Actions` — zero new mid-flow `AskUserQuestion` calls. The skill dogfoods the
  avoidable-interactions objective.
- Draft template (Step 5) gains two fields: `**Objective:** <name from the rubric>` and
  `**Measurement:** <counts, when the lens is quantitative — omitted otherwise>`.

### 3. The judge dispatch

One Task agent per bare invocation ("the judge"):

- **Input (clean-room, per `_shared/subagent-output-contract.md`):** the rubric verbatim, a
  literal output template (new template defined in the dispatch prompt: status line + one block
  per objective, each `NO FINDING` or finding(s) with evidence excerpt, measurement, proposed
  fix), and the resolved transcript path. No conversation history.
- **Evidence:** the judge slices the transcript itself with Grep/Read — `AskUserQuestion`
  `tool_use` blocks for the avoidable-interactions lens, oversized `tool_result` payloads for
  context overhead, denial/refusal/error strings for friction, and so on. It judges evidence,
  not the main thread's self-narrative.
- **Transcript resolution (main thread, before dispatch):** session transcripts live at
  `~/.claude/projects/<project-slug>/<session-id>.jsonl`, where the project-slug derives from
  the working directory path and the session-id is `$CLAUDE_CODE_SESSION_ID`; when that
  variable is unset, fall back to the newest `.jsonl` in the project-slug directory and say so
  in the report. This mechanism is stated in the skill (not cited from elsewhere) because
  `/feedback` runs in adopter projects where no claude-tweaks-repo-local helper exists.
- **Degradation:** when no transcript file can be resolved (some cloud sandboxes), the
  evaluation runs in the main thread over its own context and the output is explicitly labeled
  self-assessment — degraded, never silently equivalent.
- **Model profile:** `Frontier` singleton — see the contract change below. Resolved via
  `node bin/resolve-profile.js frontier --unattended` (no `--run-dir`), same invocation shape
  as the current scrub dispatch.

### 4. Contract change: Frontier singleton slot moves from scrub to judge

`/feedback` already holds one enumerated Frontier singleton — the Step 6 scrub (record #221).
A bare invocation now dispatches twice (judge + scrub), and the contract forbids Frontier
outside enumerated singleton slots. Deliberate resolution, not a silent extension:

- The **judge becomes `/feedback`'s enumerated Frontier singleton** — it performs the hard
  judgment (avoidability, instruction efficacy, trust calibration verdicts).
- The **scrub drops to `Capable`** — pattern-matched removal of credentials/paths/project
  names is not frontier work. Step 6's dispatch structure, unconditionality, and hard-stop
  semantics are unchanged; only the resolved profile changes.
- `_shared/subagent-output-contract.md`'s singleton enumeration is edited accordingly (stated
  once, there); record #221's enumeration is superseded knowingly. Free-text invocations (no
  judge) then run one Capable scrub dispatch and no Frontier dispatch at all — acceptable:
  the enumeration caps Frontier use, it does not mandate it.

### 5. Cross-reference and docs updates

- `docs/skill-graph.md`: new edges — `/feedback` ↔ `_shared/feedback-objectives.md`.
- `docs/plugin-structure.md`: file-table row for the new `_shared` file.
- `_shared/learning-routing.md` is **not** modified: the judge's findings still classify
  through it per-finding, exactly like any other learning source.

## Decision rationale

- **Singleton transcript judge over a mechanical extractor (Approach B):** an extractor
  (`bin/` script emitting an evidence skeleton) gives stronger fidelity guarantees but costs a
  tested Node module and caps the judge's vision at the extractor's coverage. Building it
  first is speculative; it is the named hardening step **if** the judge demonstrably misses
  stops. Not in scope.
- **Singleton over per-objective fan-out (Approach C):** fan-out multiplies transcript-reading
  cost by the size of the objective set, maximizes obligatory-finding pressure (every agent justifying its lens), forbids
  Frontier by contract (never in a fan-out), and needs an aggregation/dedup stage the
  singleton doesn't. Rejected.
- **Dispatched judge over main-thread self-evaluation:** the main thread is the party that
  made the stops and burned the context; it grades itself gently. The judge is structurally
  independent and reads ground truth. Main-thread evaluation survives only as the labeled
  degradation path.
- **Rubric as a `_shared` contract, not prose inside the skill:** stated once; `/reflect` can
  map its lenses onto the same contract later (follow-up, out of scope) without a second copy.
- **Evaluation in `/feedback`, not `/reflect`:** the operator's stated trigger is "when the
  user invokes feedback, the session is evaluated from above" — reflect is pipeline-anchored
  and would cost a two-command ceremony for ad-hoc sessions.

## Scope cuts (named, not silent)

- No standing mid-session capture directive; no new hook events; no changes to
  `bin/lib/hooks/`.
- No mechanical transcript extractor (Approach B — future hardening, condition stated above).
- No `/reflect` lens remapping onto the rubric (follow-up work).
- No change to the `upstream-candidate` headless path or the sweeps' subject check.
- Sessions with no `/feedback` invocation stay uncaptured (accepted trade).

## Verification

- `--dry-run` is the harness: bare `/feedback --dry-run` on a real session must show the judge
  dispatched (not self-assessed), findings objective-tagged with measurements and proposed
  fixes, per-objective `NO FINDING` where warranted, and nothing filed — no `gh` write of any
  kind on the evaluation path.
- The avoidable-interactions lens's output on a known session must state the total
  `AskUserQuestion` count — a number checkable against the transcript by hand.
- Existing behavior guarded: free-text invocation and `--queue` produce byte-identical flows
  to today apart from the scrub's profile change.
- `npm test` (docs/size-budget checks cover new `_shared` file and SKILL.md growth).

## Files touched

| File | Change |
|---|---|
| `skills/_shared/feedback-objectives.md` | New — rubric contract (objective table, norms, finding requirements) |
| `skills/feedback/SKILL.md` | Bare-invocation session-evaluation step, judge dispatch, template fields, scrub profile change |
| `skills/_shared/subagent-output-contract.md` | Frontier singleton enumeration: `/feedback` slot moves scrub → judge |
| `docs/skill-graph.md` | Edges for the new `_shared` contract |
| `docs/plugin-structure.md` | File-table row for the new `_shared` file |

## Phase 1: Rubric + session evaluation in `/feedback`

Single work unit — the rubric file, the skill changes, the contract enumeration edit, and the
docs edges land together (the rubric has no consumer without the skill change, and the judge
dispatch is a contract violation without the enumeration edit). Everything in "Files touched"
above; verification per the section above.
