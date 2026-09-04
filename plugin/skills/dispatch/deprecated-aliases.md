# Dispatch — Deprecated Alias Removal Conditions

Referenced by `skills/dispatch/SKILL.md`'s Input table's deprecated-alias rows (`--concurrent <n>`, `--batch-size <n>`, `next`) and Configuration table (`dispatch-pick-max-concurrent`) row. Both `--concurrent`/`dispatch-pick-max-concurrent` were renamed to `--batch-size <n>` / `dispatch-batch-size` (refs #295); `--batch-size` and `next` were in turn renamed to `--budget <n|all>` (refs #1492) — this file holds the removal condition each row's stub points to, kept out of `SKILL.md` to stay under its size ceiling.

## `--concurrent <n>` (deprecated alias for `--batch-size <n>`)

Same effect as `--batch-size <n>`, logs one warn-tier notice per invocation. Removal condition: once this repo's own `.claude-tweaks/policy.yml` and `skills/help/reference-card.md`'s `/claude-tweaks:dispatch` argument grammar cite only `--batch-size`, checked at the next minor release.

## `dispatch-pick-max-concurrent` (deprecated alias for `dispatch-batch-size`)

Reading it from `.claude-tweaks/policy.yml` emits one warn-tier notice per invocation and applies its value to `dispatch-batch-size`. Removal condition: once this repo's own `.claude-tweaks/policy.yml`, the canonical key tables in `skills/_shared/work-record-config.md` and `skills/_shared/policy-schema.md`, and `bin/lib/policy-schema.js`'s `POLICY_KEYS` cite only `dispatch-batch-size`, checked at the next minor release.

## `--batch-size <n>` (deprecated alias for `--budget <n>`)

Same effect as `--budget <n>`, logs one warn-tier notice per invocation naming `--batch-size` as the deprecated spelling. Removal condition: once this repo's own `.claude-tweaks/policy.yml` and `skills/help/reference-card.md`'s `/claude-tweaks:dispatch` argument grammar cite only `--budget`, checked at the next minor release. Note: `--concurrent` (above) is now a two-hop alias (`--concurrent` → `--batch-size` → `--budget`); both hops' removal conditions must resolve before either alias is removed.

## `next` (deprecated alias for `--budget 1`)

Identical effect — exactly one group selected and dispatched by the existing priority-then-age ranking, unchanged zero-eligible-groups posture — with one warn-tier notice per invocation. Removal condition: once this repo's own routine fleet (`/claude-tweaks:routine status`), `skills/backlog/SKILL.md`'s Next Actions, and `skills/help/reference-card.md` cite only `--budget`, checked at the next minor release.
