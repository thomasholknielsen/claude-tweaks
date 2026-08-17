---
record: 724
origin: capture
risk: low
size: medium
ceremony: fast-lane
grants: []
surface: backend
---
# 724: flow pre-flight reads: spec-slug rule lives in manifesto.md so Step 2.8 loads a 21 KB file it may never use; manifesto.md/multi-spec.md exceed the tool-output cap in pairs

Surface: backend

Origin: session evaluation of a `/flow #688,#689,#693,#686,#687,#690,#691,#692` run that stopped at Step 2.8 (via /claude-tweaks:feedback; self-reference routed the findings to local records)
Defer-reason: genuinely-larger

## Current State

- `flow/claim-targets.md`'s mint step says "`{spec-slug}` follows `manifesto.md`'s Path conventions", so a run reads `manifesto.md` (21.7 KB) before Step 2.8 has succeeded. The evaluated run stopped at 2.8: of 106 KB of skill sub-file text read, ~32 KB (`manifesto.md`, `build/worktree-setup.md`) was never consumed. `manifesto.md` itself names `_shared/pipeline-run-dir.md` as "the canonical SPEC_SLUG conventions" home.
- `manifesto.md` and `multi-spec.md` are each >21 KB; a two-file read overflows the ~30 KB tool-result cap (observed: "Output too large (33.3KB)" → two re-reads). #712 owns the *batching* rule; this is the file-size half.

## Deliverables

- [ ] Move the `{spec-slug}` / ISO-timestamp rule to `_shared/pipeline-run-dir.md` (single home); `manifesto.md` Path conventions and `claim-targets.md` cite it.
- [ ] Add "read after Step 2.8 passes" to `flow/SKILL.md` Step 3's `manifesto.md` pointer.
- [ ] Bring `manifesto.md` and `multi-spec.md` under ~20 KB each — e.g. move the Override-semantics table to a sub-file loaded only under `confirm`/`hybrid`.

## Acceptance Criteria

1. `grep -n 'spec-slug' skills/flow/claim-targets.md` cites `_shared/pipeline-run-dir.md`, not `manifesto.md`.
2. `wc -c skills/flow/manifesto.md skills/flow/multi-spec.md` each < 20480.
3. `npm test` green.

## Technical Approach

### Key Files
- `skills/_shared/pipeline-run-dir.md`
- `skills/flow/manifesto.md`, `skills/flow/multi-spec.md`, `skills/flow/claim-targets.md`, `skills/flow/SKILL.md`

## Gotchas

- Measure `wc -c` headroom before moving text — several conformance tests pin `manifesto.md` / `multi-spec.md` prose byte-for-byte; run the full suite, not filename-matched tests only.
- Moving the `{spec-slug}` rule must preserve the `spec-` prefix convention that `find -name "*spec-${N}*"` disambiguation depends on.
- The 30 KB figure is the harness tool-result cap observed in practice, not a documented constant — target ~20 KB per file to leave margin.

**Related:** #712, #692

## Original request

flow pre-flight reads: spec-slug rule lives in manifesto.md so Step 2.8 loads a 21 KB file it may never use; manifesto.md/multi-spec.md exceed the tool-output cap in pairs

Defer-reason: genuinely-larger

Origin: session evaluation of a `/flow #688,#689,#693,#686,#687,#690,#691,#692` run that stopped at Step 2.8 (via /claude-tweaks:feedback; self-reference routed the findings to local records)

## Current State

- `flow/claim-targets.md`'s mint step says "`{spec-slug}` follows `manifesto.md`'s Path conventions", so a run reads `manifesto.md` (21.7 KB) before Step 2.8 has succeeded. The evaluated run stopped at 2.8: of 106 KB of skill sub-file text read, ~32 KB (`manifesto.md`, `build/worktree-setup.md`) was never consumed. `manifesto.md` itself names `_shared/pipeline-run-dir.md` as "the canonical SPEC_SLUG conventions" home.
- `manifesto.md` and `multi-spec.md` are each >21 KB; a two-file read overflows the ~30 KB tool-result cap (observed: "Output too large (33.3KB)" → two re-reads). #712 owns the *batching* rule; this is the file-size half.

## Deliverables

- [ ] Move the `{spec-slug}` / ISO-timestamp rule to `_shared/pipeline-run-dir.md` (single home); `manifesto.md` Path conventions and `claim-targets.md` cite it.
- [ ] Add "read after Step 2.8 passes" to `flow/SKILL.md` Step 3's `manifesto.md` pointer.
- [ ] Bring `manifesto.md` and `multi-spec.md` under ~20 KB each — e.g. move the Override-semantics table to a sub-file loaded only under `confirm`/`hybrid`.

## Acceptance Criteria

1. `grep -n 'spec-slug' skills/flow/claim-targets.md` cites `_shared/pipeline-run-dir.md`, not `manifesto.md`.
2. `wc -c skills/flow/manifesto.md skills/flow/multi-spec.md` each < 20480.
3. `npm test` green.

## Technical Approach

### Key Files
- `skills/_shared/pipeline-run-dir.md`
- `skills/flow/manifesto.md`, `skills/flow/multi-spec.md`, `skills/flow/claim-targets.md`, `skills/flow/SKILL.md`

**Related:** #712, #692
