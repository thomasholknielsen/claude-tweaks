---
record: 737
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
---
# 737: Hoist the anchored-staged-path invariant into _shared/pipeline-run-dir.md — one owner for staged-patch.md and curation-engine.md

Origin: reflect hindsight from #675

Defer-reason: tangential

## Current State

The invariant "a staged proposal lives at the ABSOLUTE anchored path under `$RUN_ROOT/.claude-tweaks/pipelines/{run-id}/…/staged/`, never at a worktree-relative shadow" is now asserted independently in two places — `skills/_shared/staged-patch.md`'s Staging-time gate (#674: `$STAGE_PATH` is the anchored absolute path) and `skills/wrap-up/curation-engine.md` §3/§4 (#675: `stagePath` must be absolute and anchored, verified with `test -f`; the post-fan-out shadow sweep) — while `skills/_shared/pipeline-run-dir.md`'s Anchoring section, the actual owner of run-dir anchoring, states neither the staged-file consequence nor the shadow-sweep remedy. Two copies of one rule, both citing the owner for the path resolution but each restating the rule itself, is where they will drift (CLAUDE.md's state-once convention; the same drift #674 was filed to end for the patch-apply procedure).

## Deliverables

- [ ] `skills/_shared/pipeline-run-dir.md` Anchoring section gains one paragraph stating the staged-file invariant (absolute anchored `staged/` path; a worktree-relative shadow is the failure mode; the post-fan-out sweep in `wrap-up/curation-engine.md` §4 is the routine remedy) as the single owner.

- [ ] `skills/_shared/staged-patch.md`'s Staging-time gate and `skills/wrap-up/curation-engine.md` §3/§4 cite that paragraph for the invariant instead of restating it (their own procedures — the `git apply --check` gate, the judge `test -f` self-verification, the sweep snippet — stay where they are).

- [ ] A conformance test (or an extension of `tests/curation-judge-stagepath.test.js` / `tests/staged-patch-contract.test.js`) pins that the invariant sentence appears once, in the owner, and that both consumers cite `_shared/pipeline-run-dir.md` for it.

## Acceptance Criteria

1. `grep -rn "absolute" skills/_shared/staged-patch.md skills/wrap-up/curation-engine.md` shows each file citing `_shared/pipeline-run-dir.md` for the anchored-staged-path rule rather than stating it independently; the rule's canonical sentence lives only in `_shared/pipeline-run-dir.md`.

2. `npm test` passes with the new/extended conformance pin.

_Filed by `reflect` via specShapedBody._

