# Health Routine Notes — Canonical Confidence-Floor Asymmetry and Billing Note

Two short passages recur verbatim across the four health skills' Routine Configuration sections.
This file is their one canonical home; each consumer keeps a short pointer sentence inline rather
than the full paragraph, so a future fix (e.g. closing the asymmetry, updating the billing
language) only needs to land here once.

## Confidence-floor asymmetry (harness-health, docs-health, journey-health)

Unlike `/code-health`'s `--min-risk` flag (which holds below-threshold findings in a `remembered`
cache instead of filing them), `harness-health`'s, `docs-health`'s, and `journey-health`'s
`validate-findings` calls carry no equivalent threshold — a headless Routine firing files every
surviving finding regardless of `confidence`, including a `confidence: low` one that the
interactive gate's own Recommended-column rule would otherwise route to Capture. Known asymmetry
with `/code-health`, not yet closed: a scheduled firing on any of these three skills is noisier
than an interactive one on low-confidence findings until each gains an equivalent holdback
mechanism (or the mechanism is generalized once into the shared `bin/lib/health-core/` layer all
four already build on, rather than reimplemented three more times).

## Billing note (all four health skills)

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics
> against the live account.
