# Subagent boundary (#1995) — implementation plan

**Record:** #1995 — dispatch task prompts and review lens prompts cite composed bundles; the Subagent Contract forbids `_shared/` paths in dispatch input.
**Run:** multi-spec `/flow` run `2026-09-06T110420-spec-1988-…-1997`, shared worktree, PR #1998. Spec start HEAD: `23e1736b9` (materialize). Parent promise F6 governs: `review-code`/`test-verify` do not exist.

## Survey result (before planning — ledger rows 13, 20, 22)

Compose steps that exist: `merge` (`_shared/pr-first-merge.md` + `_shared/pr-early-run-lifecycle.md`), `manifesto`, `claims` (`_shared/issue-claims.md`), `pr-scan`, `worktree-setup`.

| File | Agent-facing `_shared/` citations | Switchable | Gap |
|---|---|---|---|
| `dispatch/task-prompt.md` | context-pack table row (line 31, substituted into both templates): `_shared/issue-claims.md`; second-call template: 135 (`issue-claims.md`, close-via-merge pointer), 167 (`issue-claims.md`, claim-blob read), 191 (`pr-first-merge.md`, outcome vocabulary), 215 (`pr-early-run-lifecycle.md`) | 5 → `claims` ×3, `merge` ×2 | 118 `_shared/pipeline-run-dir.md`, 190 `_shared/integration-model.md` (no compose step) |
| `review/step3-lens-dispatch.md` | none — its seven `_shared/` hits are orchestrator-side prose outside the fenced CALIBRATION/OUTPUT block, which is byte-pinned to `_shared/criteria-review-quality.md` | 0 | — |

`_shared/subagent-output-contract.md` is 40,708 B, 252 B under the raw gate; the record's sentence needs an extraction first. "Waiting for Dispatched Agents" (lines 72–76, 1,088 B) has zero citers outside the file and no test pin. Model Selection, Failed-agent retrieval, the third-party Exemption, and "How to integrate at a dispatch site" are pinned and untouchable. Orchestrator-side lines `task-prompt.md:5` and `step3-lens-dispatch.md:52` are pinned to the phrase `single-assistant-message rule`.

## Rulings

1. **Orchestrator composes before dispatch, in `task-prompt.md`'s Context pack** (item 5): `claims` and `merge` into `{minted-run-dir}/context/`, with the verbatim fallback sentence on the orchestrator's side (it is the one running the command). `dispatch/SKILL.md` is untouched (12 B of raw headroom). Cost if wrong: one paragraph.
2. **Templates cite bundle paths; the agent-side fallback names the file, not the command.** A dispatched agent never runs the compose command, so its fallback reads "if `{minted-run-dir}/context/{step}.md` is absent, read `_shared/{source}.md` directly" — the record's verbatim sentence is kept where the command runs (ruling 1). Staged as a wording deviation. The conformance test exempts both shapes by exact text.
3. **Two structural gaps stay as raw citations** (`pipeline-run-dir.md`, `integration-model.md` — no compose step exists) and are named in the test's documented gap list with a stale-exemption check, and in the PR description. Staged deviation.
4. **`step3-lens-dispatch.md` is not edited**: it has no agent-facing `_shared/` citation to switch, and its fenced block is byte-pinned. Staged deviation (premise false for this file).
5. **AC3's "fixture dispatch" becomes a conformance assertion**: the second-call template still invokes `/claude-tweaks:flow … review,polish,wrap-up` (a skill invocation, not a `_shared/` read), and `findComposeCallSites('plugin')` shows the skills it runs compose `merge` at their own sites. A real dispatch proves nothing a static assertion does not. Staged deviation.
6. **Extraction for headroom**: "Waiting for Dispatched Agents" moves verbatim to `_shared/dispatch-waiting.md`; the contract keeps a one-line pointer; `docs/skill-graph.md` and `docs/plugin-structure.md` gain the file.
7. **AC2 is a measurement commitment** with a measured pre-release baseline (Task 4).

## Tasks

### Task 1 — implementer (one agent, one commit): `task-prompt.md`, the contract extraction + sentence, the conformance test
Detailed in the dispatch prompt. Pins to preserve: `single-assistant-message rule` at `task-prompt.md:5`; `PIPELINE_RUN_DIR="{minted-run-dir}"` inside both templates; no `CLAIM_RUN_ID`; the OUTCOME vocabulary sentences (`tests/pr-first-merge.test.js`); `single assistant message` exactly once in the contract; the Model Selection section byte-pinned to `PROFILES`.

### Task 2 — controller: docs (skill-graph rows for `_shared/dispatch-waiting.md` and the `task-prompt.md` bundle citations; plugin-structure), journey step 10, ledger row, three staged deviations, PR body section.

### Task 3 — whole-branch review (opus), fix wave if needed.

### Task 4 — proofs + baseline: composed-bytes report unchanged (the dispatch-side compose lines use `{plugin-root}` literals, which `parseComposeCallLine` treats as placeholders — the same bundles are measured at their skill call sites), `wc -c` on the contract (< 40,960), the new test green plus every citer suite, and the AC2 baseline: subagent reads of `issue-claims.md`, `pr-first-merge.md`, `pr-early-run-lifecycle.md` across the ten newest sessions' `subagents/*.jsonl` under `~/.claude/projects/`, counted by the audit's method.
