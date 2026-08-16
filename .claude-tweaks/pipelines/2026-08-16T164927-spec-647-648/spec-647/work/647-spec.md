---
record: 647
origin: capture
ceremony: standard
grants: []
---
# 647: permittedGrants returns a granted bornReady next to a denial-shaped reason — per-grant reasons

**Related:** #575

Origin: /claude-tweaks:feedback session evaluation (Developer joy lens), 2026-08-16 session

## Current State

`bin/lib/issues/autonomy.js`'s `permittedGrants({ ceiling, row })` returns one flat object `{ bornReady, autoBuild?, autoMerge?, reason }`. In the evaluated session, `/claude-tweaks:capture`'s born-ready check printed `{"bornReady":true,"reason":"ceiling is unattended, but machine-originated grants need their own explicit opt-in","verdict":"clean"}` — a `true` verdict paired with a denial-shaped reason string. The reason belongs to the `auto:build` grant decision computed in the same call, not to `bornReady`; the caller (capture's Backend Selection block) logs `reason` next to `bornReady` and so writes a self-contradictory line into `decisions.md`.

## Deliverables

- [ ] `permittedGrants` returns per-grant reasons: `{ bornReady: { granted, reason }, autoBuild: { granted, reason }, autoMerge: { granted, reason } }` — expand-contract: keep the flat top-level booleans for one release with a recorded removal condition, migrate every consumer, then remove them.
- [ ] Consumers migrated to the per-grant shape: `skills/capture/SKILL.md` (born-ready block, logs `bornReady.reason`), `skills/backlog/grant-mode.md` and `bin/lib/issues/grant-gate.js` (autoBuild/autoMerge), `skills/backlog/refine-mode.md` Step 3.6, and any `_shared/autonomy-ceiling.md` example log line.
- [ ] `tests/bin-lib/issues/autonomy.test.js`: a granted `bornReady` never carries a reason that names a withheld grant; each grant's reason is non-empty exactly when that grant is withheld.

## Acceptance Criteria

1. `node -e "…permittedGrants({ceiling:'unattended', row:<clean capture row>})"` prints `bornReady.granted === true` with `bornReady.reason` either empty or a positive rationale, and `autoBuild.reason` carrying the opt-in text.
2. `grep -rn "permittedGrants" skills/ bin/` shows every consumer reading the per-grant shape; `npm test` passes; the removal condition for the flat booleans is recorded in the module header.

