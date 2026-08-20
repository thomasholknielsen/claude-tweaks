---
record: 925
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: infra
---
# 925: Per-spec PIPELINE_RUN_DIR silently breaks resolve-policy.js --run (config.yml lives only at the multi-spec parent)

Origin: reflect full (batch scope) from the #888/#889 multi-spec run
Defer-reason: tangential

## Current State

`flow/multi-spec.md` sets each spec's `PIPELINE_RUN_DIR` to the per-spec subdirectory (`{parent}/spec-{N}/`), but the Manifesto writes `config.yml` once, at the parent level only — it is never duplicated into `spec-{N}/`. Any per-spec skill call that passes its own `$PIPELINE_RUN_DIR` to `node bin/resolve-policy.js --run "$PIPELINE_RUN_DIR" {key}` therefore finds no `{runDir}/config.yml` and silently resolves every Manifesto-set lever to `source: default` — the run's own answers (e.g. `review-auto-apply-ceiling: medium`) are dropped without any error. Observed live during the #888/#889 run: `/review`'s severity routing initially resolved `source: default` until the call was re-pointed at the parent directory by hand.

## Deliverables

- [ ] `resolve-policy.js --run` (or its callers via `_shared/pipeline-run-dir.md` / `flow/multi-spec.md` prose) falls back to the parent run directory's `config.yml` when the passed run dir has none and a `manifest.yml`-declared parent exists — or multi-spec.md's env-var table is changed to state that policy resolution must use the parent dir, with the per-spec dir reserved for decisions/staged writes.
- [ ] A test pins the chosen behavior (per-spec run dir + parent config.yml resolves the parent's value, not the schema default).

## Acceptance Criteria

- [ ] In a multi-spec run, `resolve-policy.js --run "{parent}/spec-{N}" {lever}` returns the Manifesto's value with a non-default `source`, or the documented convention unambiguously directs callers to the parent path and a conformance test enforces the prose.

_Filed by `reflect` via specShapedBody._
