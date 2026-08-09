# Dispatch — Deprecated Alias Removal Conditions

Referenced by `skills/dispatch/SKILL.md`'s Input table (`--concurrent <n>`) and Configuration table (`dispatch-pick-max-concurrent`) rows. Both aliases were renamed to `--batch-size <n>` / `dispatch-batch-size` (refs #295) — this file holds the removal condition each row's stub points to, kept out of `SKILL.md` to stay under its size ceiling.

## `--concurrent <n>` (deprecated alias for `--batch-size <n>`)

Same effect as `--batch-size <n>`, logs one warn-tier notice per invocation. Removal condition: once this repo's own `.claude-tweaks/policy.yml` and `skills/help/reference-card.md`'s `/claude-tweaks:dispatch` argument grammar cite only `--batch-size`, checked at the next minor release.

## `dispatch-pick-max-concurrent` (deprecated alias for `dispatch-batch-size`)

Reading it from `.claude-tweaks/policy.yml` emits one warn-tier notice per invocation and applies its value to `dispatch-batch-size`. Removal condition: once this repo's own `.claude-tweaks/policy.yml`, the canonical key tables in `skills/_shared/work-record-config.md` and `skills/_shared/policy-schema.md`, and `bin/lib/policy-schema.js`'s `POLICY_KEYS` cite only `dispatch-batch-size`, checked at the next minor release.
