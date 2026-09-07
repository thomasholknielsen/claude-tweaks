# Pipeline-step call sites (#1994) — implementation plan

**Record:** #1994 — `review/code-mode-steps.md` composes `review-code` from three `_shared` contracts; `test/verification.md` composes `test-verify` from two; `when:` markers on `code-mode-steps.md`'s inline branches.
**Run:** multi-spec `/flow` run `2026-09-06T110420-spec-1988-…-1997`, shared worktree, PR #1998. Spec start HEAD: `ed806c443` (materialize).

## Survey result (before planning — ledger rows 13 and 20)

| Claim in the record | Measured |
|---|---|
| `code-mode-steps.md` cites `subagent-output-contract.md`, `pipeline-run-dir.md`, `auto-decision-log.md` unconditionally | `grep -c` of all four names: **1** hit, and it is `pr-early-run-lifecycle.md`'s Phase-checklist section (line 334, a pointer to one 3,395 B section). The other three: **0**. |
| `verification.md` cites `pipeline-run-dir.md` and `pr-early-run-lifecycle.md` | **0** hits for all four names. |
| `code-mode-steps.md` carries inline pr-first/local-merge and auto/interactive branches to fence | Three candidate spans (lines 306, 315–320, 334), each naming both branches in one sentence — **0 B** fenceable as marker lines. `verification.md`: none, as the record says. |
| `review-code` under 40 KB for every combination | 94,317 B raw; three of its sources carry no markers at all, so no combination is smaller. `test-verify`: 60,273 B raw. Both fail `overComposedCeiling` under every combination. |
| Step names cross-checked with #1995 | #1995's body already assumes `review-code` (all three sources) and `test-verify` exist and states a cardinality rule on top of them. |

The files that actually cite the four sources in these two skills: `review/step3-lens-dispatch.md`, `review/step3-routing.md`, `review/step3-debate-and-refutation.md`, `test/fix-mode.md`, `test/SKILL.md`, `test/qa-prompts.md` — the first three and `qa-prompts.md` are #1995's territory (the dispatch-prompt boundary), and this record's Non-Goals exclude them. The sections those citers depend on sum to roughly 20.9 KB of `subagent-output-contract.md`, 9.6 KB of `pipeline-run-dir.md`, and 3.4 KB of `pr-early-run-lifecycle.md` — a section-scoped bundle would fit the gate, but the composer composes whole files with fences, so section scoping means restructuring the sources (the shape #2002 already carries for the `merge` bundle), and `subagent-output-contract.md` sits 252 B under its raw gate.

## Rulings

1. **Nothing in this record's scope is buildable.** Deliverables 1–3 attach to citations that do not exist; Deliverable 4 has 0 B to fence; Deliverables 5–6 follow from those; Deliverable 7's cross-check finds #1995 built on the same false premise. Classified **Update the spec** (`build-deviation-1`). No source file changes. Cost if wrong: a later record adds the call sites once the citations exist.
2. **The reshaped work is proposed, not silently dropped:** a staged record proposal (`record-proposal-1`, `Defer-reason: genuinely-larger`) for section-scoped bundles at the real citers, blocked on the source restructuring #2002 models — for the consolidated console to file or fold into #1995.
3. **Parent #1987 gets promise F6:** #1995 must not cite `review-code`/`test-verify` — they do not exist — and must survey its own dispatch-prompt citations before choosing between raw `_shared/` paths and section-scoped bundles.
4. **Ledger row 22** records the premise failure (the fifth fencing record whose audit-derived premise measured false) with a trigger at #1997's plan-authoring and at the parent gate.

## Tasks

- Task 1 (controller): the four artifacts above, the spec's Build deviations section, the PR body section, the flow ledger row. No implementer dispatch — there is no diff to implement.
- Task 2: no whole-branch review (no source diff); the review phase records "no diff" and the lens dispatch is not applicable.
