---
record: 575
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 575: born-ready capture guarantees a refine flag-back round-trip — stub bodies can never be spec-shaped

Surface: backend

## Current State

Under `autonomy: trusted`+ with a `clean` `producer:capture` trust verdict, `/claude-tweaks:capture` files records born-`ready` (capture/SKILL.md's "One exception, off by default"; `_shared/autonomy-ceiling.md` trusted row, capability (a): "skips `/claude-tweaks:specify`, never the human grant gate"). But capture's own ~5-line body cap means every capture body is a `**Related:**`/`Context:`/`Scope:` stub, and `/claude-tweaks:backlog refine` Step 3.5's spec-shape gate (`## Current State`/`## Deliverables`/`## Acceptance Criteria` present and non-empty) can never pass one. Observed live 2026-08-16: #569/#570/#572 filed born-ready, and the very next refine run's Step 3.5 flagged all three back with comments. Born-ready for `producer:capture` is therefore a guaranteed ready → flag-back → un-ready loop: comment noise on every capture, and a ceiling capability that is a dead letter.

## Deliverables

Decided reconciliation (user-approved 2026-08-16): when the born-ready conditions fire, capture chains into `/claude-tweaks:specify` shaping instead of stamping bare `ready` on the stub — the record lands spec-shaped, scored, and `ready` via specify's own shaping-mode procedure, not a re-implementation inside capture.

- capture/SKILL.md: replace the stamp-`ready` branch of the ceiling-gated exception with a chain-to-shaping branch — file the record plain, then invoke `/claude-tweaks:specify #{n}` (shaping mode) in the same turn. The ~5-line cap continues to govern the raw capture entry; it becomes the shaped record's `## Original request` block. The `needs:definition` early-exit (skip before the trust round-trip) is preserved unchanged.
- The chained shaping call must run headless: `/claude-tweaks:specify` is declared always-user-facing and ends with a `## Next Actions` `AskUserQuestion` — define a component-style invocation for this one call site (an explicit argument or documented calling convention) so a `trusted`/`unattended` capture (including scheduled Routines) never blocks on an interactive question. Update specify's Component-Skill Contract section to name this caller.
- `_shared/autonomy-ceiling.md` trusted row capability (a): reword — born-ready no longer "skips `/claude-tweaks:specify`"; it skips the *human* round-trip by auto-running shaping at capture time. Note the cost profile: the capture turn gets heavier only at trusted+ with a clean verdict. Update the AUTO log-line example to reflect filed-then-shaped.
- `_shared/work-record.md` `/capture` permission-matrix row: reflect that `ready` and scoring arrive via the chained specify shaping (under specify's own authority), never from capture directly — capture's own stamp set is unchanged.
- Sweep for retired phrasing: no remaining prose in capture/SKILL.md, autonomy-ceiling.md, work-record.md, or refine-mode.md may describe capture as stamping bare `ready` at trusted+ (refine-mode.md's "Those records are not exempt" backstop paragraph stays true and stays in place).

## Acceptance Criteria

- At `supervised` (the default): capture behavior is unchanged — no shaping, no `ready`, 5-line stub filed as today.
- At trusted+ with a clean verdict and no `needs:definition`: the filed record's final body contains `## Current State`/`## Deliverables`/`## Acceptance Criteria` plus `## Original request`, carries `ready` and scoring labels, and passes refine Step 3.5's gate as written — zero flag-back round-trips.
- No code path remains that stamps `ready` on an unshaped capture stub.
- The chained shaping path renders no interactive prompt — a headless routine invocation completes without an `AskUserQuestion` turn.
- Grep sweep for the retired "files with ready" phrasing comes back clean across the four named files, and `npm test` passes (conformance suites pin these prose contracts).

## Technical Approach

The born-ready condition check in capture stays exactly where it is (single policy resolve, trust-verdict read, `needs:definition` skip). On the success branch, drop `ready` from the filing call and instead chain `Skill(claude-tweaks:specify, "#{n}")` after the record exists — shaping mode composes the body, stamps `risk:*`/`size:*`/`ceremony:*`/Type-if-absent and `ready` in its single compose-then-write-once call, and runs its own ceremony-check and framing-check. The permission matrix stays honest because specify stamps scoring under its own authority — capture never gains stamp rights. For the headless requirement, follow the existing component-mode precedent other skills use (an explicit mode argument is the established detection signal; specify's contract section documents that `$PIPELINE_RUN_DIR` is deliberately not consulted, so the argument must be explicit).

## Gotchas

- The shaping chain invokes ceremony-check and framing-check sub-skills, so a born-ready capture turn gets meaningfully slower; the cost is confined to trusted+/clean and is the price of a coherent capability — record it in autonomy-ceiling.md's capability description rather than hiding it.
- Auto-decision log: the existing born-ready AUTO entry format must change to record filed-then-shaped (one entry covering both, or two entries per the log contract — follow `_shared/auto-decision-log.md`'s schema).
- `work-backend: local-files` has no born-ready path (the trust table reads `demo:*` labels that only exist on the GitHub driver) — confirm the chain is likewise scoped to `github-issues` and the local driver's text stays untouched.
- #574 redesigns refine-mode.md's process and report; only the Step 3.5 backstop paragraph overlaps with this record — coordinate if the runs are concurrent.

## Original request

born-ready capture guarantees a refine flag-back round-trip — stub bodies can never be spec-shaped

**Related:** #506

Context: 2026-08-16 — capture filed #569/#570/#572 born-ready (producer:capture clean at unattended), and the very next refine run's Step 3.5 flagged all three back (no Current State/Deliverables/AC). Capture's own 5-line body cap makes every capture stub structurally unable to pass the spec-shape gate, so born-ready for producer:capture is a guaranteed ready -> flag-back -> un-ready loop with comment noise.

Scope: reconcile the two contracts — e.g. born-ready only for records whose body is already spec-shaped, or route born-ready captures to /specify instead of stamping ready.
