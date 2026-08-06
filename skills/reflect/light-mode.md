# Light Mode

Cheap knowledge-capture procedure for `light` mode (invoked by `/claude-tweaks:wrap-up` Step 3 when `config.yml`'s `ceremony-profile` is `fast-lane`, or standalone with the `light` keyword).

Light mode is a narrowed subset of full mode — see `full-mode.md` for the Near-misses/Fresh-start lens definitions this mode reuses verbatim; Surprises, Approach, and Tradeoff Review are dropped. See `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md` for the rationale.

## Step 2: Run Lenses — Light Mode (2 lenses, no tradeoff review)

| Lens | Question | Surfaces |
|------|----------|----------|
| **1. Near-misses** | "What broke or almost broke?" — Unexpected test failures, type errors, cross-platform ripples | Don'ts, testing patterns, gotchas |
| **2. Fresh start** | "If we started fresh?" — Would we choose the same approach? What would v2 look like? | Architectural alternatives; route via _shared/learning-routing.md |

Surprises and Approach are skipped — light mode exists specifically to trim ceremony for a `fast-lane`-profiled record. If this run's escape hatch fires mid-pass (see below), the *next* wrap-up steps run at standard depth — this pass itself is not retroactively widened.

### Seed from Review Learnings (pipeline context)

Same as full mode: check the `/claude-tweaks:review` summary's **Key Learnings** section and use it as a starting point for the two lenses rather than re-deriving from scratch. If the review summary has no Key Learnings section (it may not always be rendered), say so explicitly and fall back to deriving the two lenses from scratch — don't silently skip the seed step with no signal that it was unavailable.

### No Tradeoff Review

Light mode does not run the Tradeoff Review sub-step — a `fast-lane` record's Review summary is not expected to carry a `Tradeoffs Accepted` section large enough to warrant it. If one exists anyway, note it under the Fresh start lens rather than running a separate pass.

## Step 3: Route Findings — Light Mode

### Auto mode (policy-driven routing)

Identical to full mode — auto-mode routing (including the mandatory Safety regression KEPT-PROMPT routing) is shared across every mode, mode-independent: see the auto-routing table in SKILL.md Step 3. **If a Safety regression finding fires here, this triggers the ceremony escape hatch** (see `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md`'s Escape Hatch section) — `/claude-tweaks:wrap-up` checks for this immediately after this step completes and downgrades `ceremony-profile` to `standard` for the remainder of the run when it fires.

### Interactive mode (batch user routing)

Same table/`AskUserQuestion` mechanics as full mode (see `full-mode.md`'s Interactive mode section) — light mode only narrows which lenses feed the table, not how the table itself is presented or routed.
