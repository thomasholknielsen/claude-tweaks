---
record: 566
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 566: flow manifesto: review-severity-floor default table contradicts the ceiling-conditional skill default

Surface: backend

## Current State

`skills/flow/manifesto.md`'s "Recommendation defaults" table (line 158) states a flat default for `review-severity-floor`: `low`, with rationale "Auto LOW (nits), stage MED, prompt HIGH." In `auto` mode, the Manifesto writes this computed default straight to the run's `config.yml` with no gate (`## Approval flow`, "In default `auto` mode (FYI, no gate)").

`skills/review/step3-routing.md` (line 75) separately defines this lever's *skill* default as ceiling-conditional: `medium` when the resolved `autonomy` ceiling is `unattended`, `low` otherwise — but its own parenthetical for when that ceiling logic applies reads "no CLI arg, no Manifesto override, no project policy". Read literally, any value the Manifesto writes to `config.yml` — including its own flat computed default, not just a human-chosen override — counts as a "Manifesto override" and defeats the ceiling-conditional logic.

This was observed live in the funnel-redesign run (`/flow #513,#514,#515,#516`, autonomy: `unattended`, 2026-08-16): the Manifesto wrote `review-severity-floor: low` per its table; at #513's review step this had to be reconciled manually, applying the intended ceiling-conditional `medium` instead of the literal `low` the config carried.

## Deliverables

Clarify `skills/review/step3-routing.md`'s line 75 parenthetical so "Manifesto override" unambiguously means a human-chosen value — the `9=value` override mechanism in `confirm`/`hybrid` mode (or an accepted CLI arg) — and explicitly excludes the Manifesto's own computed default from its "Recommendation defaults" table, auto-written to `config.yml` under `auto` mode's FYI-no-gate flow. `skills/flow/manifesto.md`'s table itself is untouched — it stays a flat, scannable reference table like every other row in it; the ceiling-conditional logic continues to live solely in `step3-routing.md`, which already owns it.

## Acceptance Criteria

- `skills/review/step3-routing.md` line 75's parenthetical explicitly distinguishes a human-chosen Manifesto override from the Manifesto's own auto-written computed default, so a literal reading of the sentence no longer defeats the ceiling-conditional default on `unattended` runs.
- `skills/flow/manifesto.md`'s "Recommendation defaults" table (line 158) is unchanged — this fix stays a one-file edit to `step3-routing.md`.
- The three referenced files (`skills/flow/manifesto.md`, `skills/review/step3-routing.md`, `skills/_shared/autonomy-ceiling.md`) read as mutually consistent: an `unattended`-ceiling run with no explicit `review-severity-floor` value from any source resolves to `medium` at review-routing time, matching what actually happened (after manual reconciliation) in the run cited in Observed.

## Technical Approach

Edit `skills/review/step3-routing.md` line 75 only. Replace:

> When no explicit value was set (no CLI arg, no Manifesto override, no project policy), the default is ceiling-conditional...

with a version whose "no Manifesto override" clause is unpacked to name what does and doesn't count — a human `9=value` change (`confirm`/`hybrid` mode) counts; the Manifesto's own computed default from its Recommendation-defaults table, written straight to `config.yml` under `auto` mode's no-gate flow, does not.

No change to `skills/flow/manifesto.md` or `skills/_shared/autonomy-ceiling.md` — both already state the intended behavior correctly; only `step3-routing.md`'s wording contradicts it.

## Gotchas

None — single-sentence clarification in one file, no behavior change to code (the ceiling-conditional logic already exists and is already correct in intent; only its documented precondition was ambiguous).

## Original request

flow manifesto: review-severity-floor default table contradicts the ceiling-conditional skill default

## Defect (skill-doc inconsistency)

`skills/flow/manifesto.md`'s "Recommendation defaults" table states `review-severity-floor` default **`low`**, while `skills/review/step3-routing.md` (and `_shared/autonomy-ceiling.md`) define the skill default as **ceiling-conditional** — `medium` when the resolved `autonomy` ceiling is `unattended`, with "an explicit value at any level still wins."

A Manifesto following its own table writes `low` into the run's `config.yml`. Downstream, that computed value is indistinguishable from an explicitly chosen one, so a literal reading defeats the ceiling-conditional default on exactly the runs (`unattended`) it was designed for.

## Observed

Live in the funnel-redesign run (2026-08-16, `/flow #513,#514,#515,#516`, autonomy: unattended): the Manifesto wrote `review-severity-floor: low` per its defaults table; at #513's review step the mismatch had to be reconciled manually (the run treated the Manifesto-computed `low` as non-explicit and applied the ceiling-conditional `medium`).

## Suggested fix (either direction, one file)

- Make `manifesto.md`'s defaults table ceiling-aware for this lever (compute `medium` under `unattended`), or
- Have `step3-routing.md` state that a Manifesto-computed default does not count as an explicit value for the ceiling-conditional rule.

**Origin:** consolidated Review Console (run 2026-08-16T010024-spec-513-514-515-516), upstream-feedback row U1, auto-resolved to filed under `consoleAutoResolve`.
