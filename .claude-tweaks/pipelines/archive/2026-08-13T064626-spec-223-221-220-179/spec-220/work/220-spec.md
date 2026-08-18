---
record: 220
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
fingerprint: 2026-08-08-model-profile-strategy:frontier-verdict-gate-slots-in-review-specify-and-challenge
blocked-by: [216]
surface: skills
---
# 220: Frontier verdict-gate slots in review, specify, and challenge

Surface: skills
Parent: #215

Blocked by #216: assumes the contract defines the Frontier row, its preconditions, and the [Use: {Profile}] grammar these sites cite

## Overview

Enumerate the **verdict-gate** Frontier slots — the single-agent judgment sites where Fable's premium buys decision quality rather than volume — and wire them to the resolver: `/review`'s gap-sweep (already single-source by design), `/review`'s cross-lens debate agent, and `/specify`'s red-team synthesis. Each site resolves through the resolver instead of hardcoding `Capable (Opus)`; when Frontier preconditions fail, resolution degrades to **Capable — the profile these exact sites run at today, so degradation is a return to the status quo, never a downgrade below it**. This leaf also owns every model-tier line in `skills/_shared/multi-agent-coordination.md` and fixes the contract-vs-sites red-team contradiction.

**One deliberate deviation from the parent design:** `/challenge` is dropped from the verdict-gate enumeration. Its `framing-check` mode is inline-only by that skill's own Component-Skill Contract — dispatching it is a named anti-pattern there. Profiles govern **dispatches only** (#216's contract states this scope); inline steps ride the session model by design, so an inline verdict has no profile to carry. The contract's slot list documents this exclusion.

**Complexity:** Medium
**Estimated tasks:** 8

## Non-Goals

- The self-improvement Frontier singletons (#221).
- Per-finding refutation agents stay Capable — they fan out, which Frontier structurally forbids (the no-fan-out rule is defined in #216's contract section; this leaf cites it, it does not define it).
- The generic dispatch-site grammar sweep (#222) — the files below are excluded from that sweep; this leaf owns them.

## Current State

Everything below describing resolver behavior is **expected per #216's design, to be re-verified against its landed text** — the first task, not an assumption to build on.

- Gap-sweep: `skills/review/step3-debate-and-refutation.md` (~120-131) — exactly one Capable (Opus) agent; severity floor + fan-out cap (~59-77, worst case 10 Capable agents per review).
- Debate agent: same file ~37; template also in `skills/_shared/multi-agent-coordination.md` ~133.
- Reproduction placeholder: `multi-agent-coordination.md` ~66 ships literal `{Standard | Capable}` — resolve to Standard (matching `bin/lib/coordination.js`'s default).
- Red-team contradiction: the contract's old table lists "/specify red-team synthesis" under Capable while `skills/specify/red-team.md` (~18, 43) and `multi-agent-coordination.md` (~202) dispatch personas at Standard. Personas (fan-out) and the write-back/synthesis step are different work; today the synthesis step runs in the main thread.
- Effort nudge: `skills/review/step3-lens-dispatch.md` (~27) — the xhigh/max "think harder" sentence, self-labeled as not load-bearing.
- After #216: `bin/resolve-profile.js` returns `{model, effort, source, effortLine}`; Frontier preconditions (interactive, stance, cap via `--run-dir`, default cap 3 from the `frontier-run-cap` policy key) enforced there.

## Deliverables

- [ ] **First task: re-read #216's landed contract section and resolver CLI** — pull the exact grammar, precondition list, and invocation form from the landed text (IL-03).
- [ ] Contract slot enumeration appended to the profile section: verdict gates = review gap-sweep, review debate agent, specify red-team synthesis; with the `/challenge` exclusion note above.
- [ ] `step3-debate-and-refutation.md`: gap-sweep and debate dispatch lines become `[Use: Frontier]` with the resolver invocation; degrade behavior **cited, not restated** — sites say "degrades per the resolver's preconditions (contract § Model Selection)" and never enumerate the precondition list locally (the drift-proof form; an AC checks this).
- [ ] Refutation stays `[Use: Capable]`; the file's worst-case cost bound recomputed under the new vocabulary (IL-99) — inputs: the fan-out cap (10) at Capable, plus at most `frontier-run-cap` (default 3) Frontier singletons per run.
- [ ] `step3-lens-dispatch.md`: the nudge sentence replaced by the resolver's `effortLine` output (still honest about the per-dispatch effort limitation).
- [ ] `skills/specify/red-team.md`: personas declared Standard (contradiction resolved, no behavior change); the synthesis/write-back step gains its Frontier path with an explicit trigger — **dispatched as a Frontier singleton when the run is interactive and the resolver returns frontier; otherwise it stays main-thread exactly as today** (no dispatch at Capable — the degraded state is the current main-thread behavior, not a Capable dispatch).
- [ ] `multi-agent-coordination.md`: debate row Frontier-eligible, red-team persona row Standard, `{Standard | Capable}` placeholder resolved to Standard.
- [ ] Post-edit completeness check: grep `skills/` for any remaining single-source `[Use: Capable]` dispatch site and classify each as deliberately-Capable or missed-slot; none may end unclassified.

## Acceptance Criteria

1. Grep for `{Standard | Capable}` in `skills/` returns zero matches.
2. Every Frontier dispatch line in `step3-debate-and-refutation.md` names the resolver call and cites (never enumerates) the degrade preconditions; no file in this leaf hardcodes a model family name at a dispatch site.
3. `red-team.md` and the contract agree — personas Standard, synthesis Frontier-per-the-trigger-above; a case-insensitive sweep across `skills/` and `docs/` finds no restatement of the old Capable-personas claim (IL-17).
4. The `/challenge` exclusion appears in the contract's slot list with the inline-only rationale.
5. The recomputed cost bound in `step3-debate-and-refutation.md` states its inputs (fan-out cap, frontier-run-cap default, both cited to their sources) so it is verifiable from the file.
6. Grep confirms the old "Apply careful, thorough reasoning…" nudge sentence is gone and the `effortLine` reference is present in `step3-lens-dispatch.md` (demonstrated red first per IL-105).
7. The completeness-check deliverable's classification list appears in the build's review notes (every single-source Capable site accounted for).

## Technical Approach

### Key Files

- `skills/review/step3-debate-and-refutation.md`, `skills/review/step3-lens-dispatch.md`
- `skills/specify/red-team.md`
- `skills/_shared/multi-agent-coordination.md`
- `skills/_shared/subagent-output-contract.md` — slot enumeration (build after #216; coordinate on section shape)
- `docs/skill-graph.md` — only if a site invokes a component it didn't call before; the resolver CLI is not a skill, so the expected edge delta is zero — state that in the build notes rather than editing the graph speculatively

## Gotchas

- #216 rewrites the same contract section this leaf appends to — build strictly after it lands.
- Frontier resolutions here run inside `/review`: when `$PIPELINE_RUN_DIR` is set, pass it as `--run-dir` (that env var is the detection signal, same as the Component-Skill Contract convention); standalone `/review` has no run dir and uses the contract's 1-per-invocation rule.
- The review-effort dial (`low..max`) is review *thoroughness* and keeps its name — do not conflate it with the resolver's effort axis while editing these files.


<!-- work-fingerprint: 2026-08-08-model-profile-strategy:frontier-verdict-gate-slots-in-review-specify-and-challenge -->
