# Health Routine Notes — Canonical Confidence-Floor Asymmetry and Billing Note

Two short passages recur verbatim across the four health skills' Routine Configuration sections.
This file is their one canonical home; each consumer keeps a short pointer sentence inline rather
than the full paragraph, so a future fix (e.g. closing the asymmetry, updating the billing
language) only needs to land here once.

## Confidence floor (harness-health, docs-health, journey-health)

All three now carry a `--min-confidence <low|med|high>` flag, closing the asymmetry with
`/code-health`'s `--min-risk`. Same flag name and enum across all three, but the holdback
mechanism itself isn't fully uniform: `harness-health` and `docs-health` mirror `--min-risk`
exactly — a below-floor finding is held in the durable `remembered` cache (not dropped, not
filed) until a later, deliberately deeper run lowers the bar. `journey-health` has no
`remembered` cache tier by design — a below-floor finding is simply not filed for that run and
re-surfaces fresh (not resumed from where it was held) on a future firing. `journey-health`'s
Routine template passes `--min-confidence high` by default; harness-health/docs-health leave it
unset by default (every surviving finding still files unconditionally unless a human or the
routine template passes the flag explicitly) — check each skill's own Routine Configuration
section for its current default before assuming parity.

## Billing note (all four health skills)

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics
> against the live account.
