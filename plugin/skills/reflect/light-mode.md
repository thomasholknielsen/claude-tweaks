# Light Mode

Cheap knowledge-capture procedure for `light` mode (invoked by `/claude-tweaks:wrap-up` Phase 1 when `config.yml`'s `ceremony-profile` is `fast-lane`, or standalone with the `light` keyword).

Light mode is a narrowed subset of full mode — see `full-mode.md` for the Near-misses/Fresh-start/Friction lens definitions this mode reuses verbatim; Surprises, Approach, and Tradeoff Review are dropped. **Why those three survive:** they are the lenses that can still catch a defect. Near-misses surfaces what almost went wrong, and Fresh-start asks what a second attempt would do differently — both read the finished work and can produce a Safety regression finding, which is what trips the ceremony escape hatch (`wrap-up/SKILL.md`'s Phase 1). Friction is orthogonal to code narrative depth — it judges the pipeline's own behavior toward the operator, not the size of the change — so a `fast-lane` record's session can still surface an avoidable gate denial or stop worth flagging. Surprises, Approach, and the Tradeoff Review are narrative: valuable on a substantial change, pure fixed cost on the small ones `fast-lane` is for.

## Step 2: Run Lenses — Light Mode (3 lenses, no tradeoff review)

| Lens | Question | Surfaces |
|------|----------|----------|
| **1. Near-misses** | "What broke or almost broke?" — Unexpected test failures, type errors, cross-platform ripples | Don'ts, testing patterns, gotchas |
| **2. Fresh start** | "If we started fresh?" — Would we choose the same approach? What would v2 look like? | Architectural alternatives; route via _shared/learning-routing.md |
| **3. Friction** | "Did the pipeline itself get in the way?" — Was every hook denial and AskUserQuestion stop this run actually necessary? | Upstream feedback (D5) via `_shared/learning-routing.md` |

Surprises and Approach are skipped — light mode exists specifically to trim ceremony for a `fast-lane`-profiled record. If this run's escape hatch fires mid-pass (see below), the *next* wrap-up steps run at standard depth — this pass itself is not retroactively widened.

### Seed from Review Learnings (pipeline context)

Same as full mode: check the `/claude-tweaks:review` summary's **Key Learnings** section and use it as a starting point for the three lenses rather than re-deriving from scratch. If the review summary has no Key Learnings section (it may not always be rendered), say so explicitly and fall back to deriving the three lenses from scratch — don't silently skip the seed step with no signal that it was unavailable.

### No Tradeoff Review

Light mode does not run the Tradeoff Review sub-step — a `fast-lane` record's Review summary is not expected to carry a `Tradeoffs Accepted` section large enough to warrant it. If one exists anyway, note it under the Fresh start lens rather than running a separate pass.

## Step 3: Route Findings — Light Mode

### Auto mode (policy-driven routing)

Identical to full mode — auto-mode routing (including the mandatory Safety regression KEPT-PROMPT routing) is shared across every mode, mode-independent: see the auto-routing table in SKILL.md Step 3. **If a Safety regression finding fires here, this triggers the ceremony escape hatch** (`wrap-up/SKILL.md`'s Phase 1 ceremony escape hatch) — `/claude-tweaks:wrap-up` checks for this immediately after this step completes and downgrades `ceremony-profile` to `standard` for the remainder of the run when it fires.

### Interactive mode (batch user routing)

Same table/`AskUserQuestion` mechanics as full mode (see `full-mode.md`'s Interactive mode section) — light mode only narrows which lenses feed the table, not how the table itself is presented or routed.
