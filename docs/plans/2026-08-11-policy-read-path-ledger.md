# Open Items — Policy read-path unification (#329, #330, #331)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | policy.js wrappers loosen `worktree.always` on pathological shapes (indented line, true-then-false duplicate) — fail-open shift with no audit signal | accepted | Deliberate adoption of the schema parser's documented column-0 semantics; consistent with hooks' ambiguity-resolves-to-allow posture; gate/audit/resolver now agree (reviewer finding 2, spec 329) |
| 2 | review | List-typed keys have asymmetric envelope shapes (unset → `[]` array default; configured → raw comma string per `resolveValue`'s pinned contract) — prose consumers must split | fixed | Documenting line added to `_shared/policy-schema.md`'s Canonical read path — `bb1e256e` |
| 4 | build | `health-open-cap` documented in `_shared/policy-schema.md` (default 10) since #235 but never registered in `POLICY_KEYS` — resolver returned unknown-key for a documented lever; Task A's agent caught it by executing the resolver before migrating | fixed | Registered with default 10 + pin test, digest site migrated — `f72c3d43` |
| 3 | review | Requesting an alias's old name resolves the replacement key — with `dispatch-pick-max-concurrent` still a live POLICY_KEYS row, a request for it answers with `dispatch-batch-size`'s value (both defaults 3, no divergence today) | observation | Carried to spec 331 (collapse leaf) for awareness (reviewer note, spec 329) |
