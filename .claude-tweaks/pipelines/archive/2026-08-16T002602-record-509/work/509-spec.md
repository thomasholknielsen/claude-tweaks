---
record: 509
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: feedback-session-evaluation:feedback-session-evaluation-against-the-maintainer-objective
surface: backend
---
# 509: feedback: session evaluation against the maintainer-objective rubric

Surface: backend

## Overview

Bare `/claude-tweaks:feedback` today asks "what's your learning?" and harvests one hand-typed observation. This work unit turns bare invocation into a session evaluation: a dispatched judge reads the session transcript from local disk and evaluates it against a new shared maintainer-objective rubric; findings flow through the skill's existing filing steps (classify → dedup → draft → scrub → confirm → file) via the existing batch contract. Capture widens from one observation to everything the session evidences, findings arrive transcript-grounded and quantified, and what gets filed is by construction aligned with the plugin's maintainer objectives.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- No standing mid-session capture directive, no new hook events, no changes to `bin/lib/hooks/`.
- No mechanical transcript extractor (named future hardening: build only if the judge demonstrably misses stops a transcript grep can find).
- No `/reflect` lens remapping onto the rubric (follow-up work; the rubric is written so reflect can adopt it later).
- No change to the `upstream-candidate` headless path, the sweeps' subject check, or free-text invocation semantics.
- No new `gh` write of any kind on the evaluation path itself (filing still happens only in Step 8, human-confirmed).
- Subagent transcripts are out of scope: the judge evaluates the main session's own JSONL only. Dispatched Task-agent transcripts are a known, named coverage gap — `session-evaluation.md` states it so a reader doesn't infer full-session coverage.

## Prerequisites

None — no blocking records.

## Current State

- `skills/feedback/SKILL.md` — the whole skill (Steps 0–9). Step 0 checks the local `upstream-candidate` queue on bare invocation; Step 5 is the draft template; Step 6's scrub is dispatched as the skill's Frontier singleton (record #221) via `node bin/resolve-profile.js frontier --unattended`; Step 7 confirms via `_shared/upstream-feedback-batch.md`'s chunked `multiSelect` contract; Step 8 files.
- `skills/_shared/learning-routing.md` — the D5 classifier every finding must still pass per-finding.
- `skills/_shared/subagent-output-contract.md` — Model Selection section enumerates the Frontier singleton slots (currently: `/feedback`'s scrub, among others).
- `docs/skill-graph.md` `## feedback` section; `docs/plugin-structure.md` per-skill sub-file table (feedback currently has no sub-files).
- Session transcripts: local JSONL at `~/.claude/projects/<project-slug>/<session-id>.jsonl` — one JSON-encoded line per turn/event; `tool_use` blocks name the tool and input, matching `tool_result` blocks carry what came back. This is the **main session's** transcript; subagent runs live in separate files and are out of scope (see Non-Goals).

## Deliverables

- [ ] `skills/_shared/feedback-objectives.md` (new): the maintainer-objective rubric — an objective table covering automation efficiency, context overhead, avoidable interactions, friction, developer joy, trust calibration, instruction efficacy, and recovery quality, each with a definition, a description of what session evidence for it looks like, and what a finding must contain. **Once created, this file is the canonical enumeration of the objective set** — downstream references (including AC1) check against the file, not this issue's prose. Two norms stated at the top: "no finding" is the expected common answer (a per-objective `NO FINDING` is a valid, complete result), and quantify where the lens is countable. The rubric pre-classifies the lenses: **countable** — avoidable interactions (total `AskUserQuestion` count, per-stop avoidability verdict, whether the user simply picked the pre-marked Recommended option), context overhead (oversized tool results, repeat reads of the same file), friction (denial/refusal/retry/error counts), recovery quality (orphaned runs/worktrees/residue counts); **judgment** — automation efficiency, developer joy, trust calibration, instruction efficacy. Plus the finding requirement: symptom + transcript evidence + proposed fix, or it does not file.
- [ ] `skills/feedback/session-evaluation.md` (new lazy-loaded sub-file per `docs/skill-authoring.md`): the judge dispatch procedure —
  - **Transcript path resolution:** project-slug is the absolute cwd with each `/`, space, and `.` replaced by `-` (e.g. `/Users/jane/Code Workspaces/app` → `-Users-jane-Code-Workspaces-app`); session id from `$CLAUDE_CODE_SESSION_ID`. When the variable is unset, fall back to the newest `.jsonl` in the project-slug directory — and when 2+ files there were modified within the last 24h, the rendered report must name the chosen file with its mtime and list the ignored siblings, never silent newest-wins (concurrent sibling sessions are a real hazard in this repo's own history).
  - **Dispatch prompt:** rubric verbatim + literal output template — status line per the Subagent Contract, then one block per rubric objective, each `NO FINDING`, one or more findings (evidence excerpt, measurement for countable lenses, proposed fix), or `NOT EVALUATED — {reason}` when the judge could not evidence that objective (transcript too large, no anchor) — a coverage gap must never render as a silent `NO FINDING`. The sub-file includes a per-objective evidence-hint table: keyword anchors for the countable lenses (`AskUserQuestion`, error/denial strings, tool names), a sampling strategy (user turns + each turn's final text) for the judgment lenses.
  - **Degradation path:** when no transcript file resolves, evaluate in the main thread over its own context, reusing the identical per-objective template with a "(self-assessment)" tag in its header line. The label is the full mitigation, deliberately — every finding still passes the human-gated Step 7 confirm, which is the trust backstop; no separate confidence machinery.
- [ ] `skills/feedback/SKILL.md`: bare invocation (and `--queue`) runs the session evaluation alongside Step 0's queue check — both feed one merged batch by **concatenation, no reconciliation**: each item keeps its own draft shape, and Step 4's dedup runs per item on the component+symptom fingerprint basis exactly as today (`Objective:`/`Measurement:` fields do not join the fingerprint basis). Evaluation findings route through Steps 2–8 per finding; a finding that classifies non-D5 drops from the batch with a note, mirroring Step 0's per-candidate stop scoping. Interaction budget stated in the skill text: one batch confirmation plus `## Next Actions`, zero new mid-flow `AskUserQuestion` calls on the evaluation path.
- [ ] Step 5 draft template gains `**Objective:** <name from the rubric>` and `**Measurement:** <counts>` fields; `**Measurement:**` is omitted for judgment lenses rather than emitted empty. Both fields are omitted entirely on drafts no evaluation produced — free-text learnings and Step-0 queue candidates alike.
- [ ] Frontier singleton move: the judge dispatch resolves `frontier` (same `resolve-profile.js` invocation shape and standalone-cap framing as today's scrub); the Step 6 scrub drops to Capable with its dispatch structure, unconditionality, and hard-stop semantics unchanged; `skills/_shared/subagent-output-contract.md`'s singleton enumeration is edited so `/feedback`'s slot names the session-evaluation judge (knowingly superseding record #221's `/feedback` entry).
- [ ] Docs: `docs/skill-graph.md` gains `/feedback` ↔ `_shared/feedback-objectives.md` edges; `docs/plugin-structure.md` gains rows for the new `_shared` file and the new feedback sub-file.

## Acceptance Criteria

1. `skills/_shared/feedback-objectives.md` exists, declares itself the canonical enumeration of the objective set, contains an entry for each objective listed in the first deliverable (and no others), pre-classifies each lens as countable or judgment, and states both norms and the per-finding requirement (symptom + transcript evidence + proposed fix).
2. The skill text directs bare `/feedback` to dispatch exactly one judge Task agent whose prompt inlines the rubric text and the literal output template and passes the resolved transcript path — never conversation history or sibling-file references.
3. `/feedback --dry-run` semantics hold on the evaluation path: findings render objective-tagged with measurements, then the run stops — no `AskUserQuestion` call, nothing filed (existing Step 7 `--dry-run` behavior extended to cover evaluation findings).
4. The Step 5 draft template contains `**Objective:**` and `**Measurement:**` lines with the stated omission rules (judgment lenses omit Measurement; free-text and queue-candidate drafts omit both).
5. `skills/_shared/subagent-output-contract.md`'s singleton enumeration names the session-evaluation judge as `/feedback`'s Frontier slot, and `skills/feedback/SKILL.md`'s Step 6 scrub resolves Capable — no path resolves two Frontier dispatches in one invocation.
6. Free-text invocation runs no evaluation and no Frontier dispatch (the enumeration caps Frontier use, it does not mandate it) — its flow is unchanged apart from the scrub's profile.
7. When no transcript file resolves, the skill text requires the main-thread fallback to render the same per-objective template with an explicit "(self-assessment)" header tag — never silently equivalent to a judged run.
8. The judge's output template distinguishes `NO FINDING` (evaluated, clean) from `NOT EVALUATED — {reason}` (coverage gap), and the transcript-resolution text requires build-time verification of the project-slug derivation rule against the live `~/.claude/projects/` directory listing before shipping (empirical premise-check on the stated slugification).
9. On the `--dry-run` validation session, the judge-reported total `AskUserQuestion` count matches a hand-run grep count over the same transcript file — a mismatch fails acceptance (spot-check that judge counting is grounded, per the "quantify where countable" norm).
10. `npm test` passes, including the SKILL.md/sub-file size-budget checks.

## Technical Approach

The judge is evidence-reading, the main thread is orchestration. The main thread resolves the transcript path, dispatches the judge with the rubric and output template inlined verbatim (clean-room: dispatched agents only see what's in their prompt), and receives objective-tagged findings. Each finding then walks the existing pipeline unchanged: D5 classification per `_shared/learning-routing.md`, dedup (Step 4), draft (Step 5, with the two new fields), scrub (Step 6 — always reruns on what will actually be filed, regardless of which model judged), batch confirm (Step 7), file (Step 8). Queue candidates from Step 0 merge into the same batch so a bare invocation still costs one confirmation stop.

### Data / API Surface

No code changes — markdown only. The new contract surface is the judge's output template (defined in `session-evaluation.md`): first line a status marker per `_shared/subagent-output-contract.md`, then one block per rubric objective, each either `NO FINDING`, finding(s) carrying evidence excerpt, measurement (countable lenses only), and proposed fix, or `NOT EVALUATED — {reason}`.

### Key Files

- `skills/_shared/feedback-objectives.md` — new; the rubric contract
- `skills/feedback/session-evaluation.md` — new; judge dispatch procedure (kept out of SKILL.md for the size budget)
- `skills/feedback/SKILL.md` — bare-invocation wiring, Step 5 template fields, Step 6 scrub profile
- `skills/_shared/subagent-output-contract.md` — Frontier singleton enumeration edit
- `docs/skill-graph.md` — new edges
- `docs/plugin-structure.md` — file-table rows

### Package Dependencies

None.

## Gotchas

- Transcript location is stated in the skill text itself (`~/.claude/projects/<project-slug>/<session-id>.jsonl`), never cited from a repo-local helper — `/feedback` runs in adopter projects where no claude-tweaks-repo file exists to cite. The slug derivation rule stated in the skill must be verified against a live `~/.claude/projects/` listing at build time (AC8) — it is currently reverse-engineered from observed directory names, not documented upstream.
- Clean-room discipline: references to sibling files don't reach dispatched agents — the rubric and template must be inlined in the dispatch prompt verbatim, not referenced by path (the transcript path is the one deliberate exception: it's input data the agent reads with its own tools).
- "No finding" must be stated as the expected common answer, or the rubric manufactures obligatory findings to satisfy its own lenses — and a coverage gap renders `NOT EVALUATED`, never a silent `NO FINDING`.
- `--dry-run` takes precedence over everything (existing Step 7 rule) — the evaluation path must render and stop with zero `AskUserQuestion` calls under it.
- SKILL.md has a size-budget ceiling with an early-warning tier — keep the dispatch procedure in the `session-evaluation.md` sub-file, not inline in SKILL.md.
- Cardinality rule (CLAUDE.md Don'ts): describe the objective list by reference ("the objectives in `_shared/feedback-objectives.md`"), never as a literal count, in every prose mention across all six files.
- File-overlap flags (soft, not blocking): open #472 names `skills/feedback/SKILL.md` Steps 1/5/7 as candidate edit sites for a future definition judgment; open #276 also touches `docs/skill-graph.md`. Both are trivially mergeable doc/table overlaps — coordinate at merge time; neither blocks this work.
- A judge on a very long session may face a transcript too large to read whole — the dispatch prompt directs slicing per the per-objective evidence-hint table (keyword anchors for countable lenses, sampling for judgment lenses) rather than a full sequential read, with `NOT EVALUATED` as the honest outcome when slicing can't reach an objective.

<!-- work-fingerprint: feedback-session-evaluation:feedback-session-evaluation-against-the-maintainer-objective -->

