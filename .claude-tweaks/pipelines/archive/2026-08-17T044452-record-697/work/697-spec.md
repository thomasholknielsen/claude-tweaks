---
record: 697
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 697: Eval scenario for capture's Shaped-body branch — runtime pins for AC 1-3

Origin: spec #625 review (whole-branch closure)

Defer-reason: tangential

## Current State

#625 shipped capture's Shaped-body branch (skills/capture/SKILL.md): content-keyed detection, needs:definition-first precedence, a required `--defer-reason=` on deferrals (stop-and-report when missing), and born-ready filing. Its AC 1-3 are live-invocation checks; the build verified AC 1's payload shape by composition probe (tests/deferral-gate-conformance.test.js, the born-ready label probe) and AC 2-3 by prose trace only — no executable evidence exercises capture's own branch behavior. The evals harness already hosts scenarios of exactly this shape (evals/scenarios/wrap-up-fix-now-not-file.yaml, wrap-up-refuses-reasonless-proposal.yaml) with the assertion types needed (file-exists, file-contains, dir-file-count, local-record-facet).

## Deliverables

- [ ] `evals/scenarios/capture-shaped-body-branch.yaml`: three sub-invocations against the `init-baseline` fixture (local-files backend) — (a) a shaped body + `--defer-reason=tangential` files one record with `by:capture`/`risk:*`/`size:*`/`ready` facets and exactly one `Defer-reason:` line (AC 1); (b) a shaped body with `## Open Question` + `--source reflect` and no reason files `needs:definition`, no `ready`/scoring (AC 2); (c) a shaped body + `Origin:` line and no reason files NOTHING and the run reports the missing reason (AC 3 — pin via `dir-file-count specs max` from the prior sub-runs and the report text).
- [ ] If the harness cannot run three prompts in one scenario, split into three sibling scenarios sharing the fixture.
- [ ] Validate via `cd evals && npm test` (harness plumbing only; live runs stay manual/paid).

## Acceptance Criteria

1. `node --test "evals/tests/*.test.js"` (from evals/) passes with the scenario(s) present.
2. Each scenario file states its expected outcomes mechanically (labels via `local-record-facet`, counts via `dir-file-count`, body content via `file-contains`) — never "the agent behaves well".
3. A deliberate wrong-behavior trace is documented per scenario (which assertion catches a reason-less filing / a stub fallback / a bogus value).

_Filed by `review` via specShapedBody._
