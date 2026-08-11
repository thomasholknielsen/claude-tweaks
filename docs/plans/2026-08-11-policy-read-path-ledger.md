# Open Items — Policy read-path unification (#329, #330, #331)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | policy.js wrappers loosen `worktree.always` on pathological shapes (indented line, true-then-false duplicate) — fail-open shift with no audit signal | accepted | Deliberate adoption of the schema parser's documented column-0 semantics; consistent with hooks' ambiguity-resolves-to-allow posture; gate/audit/resolver now agree (reviewer finding 2, spec 329) |
| 2 | review | List-typed keys have asymmetric envelope shapes (unset → `[]` array default; configured → raw comma string per `resolveValue`'s pinned contract) — prose consumers must split | open | — (fix: one documenting line in `_shared/policy-schema.md` during spec 330's migration) |
| 3 | review | Requesting an alias's old name resolves the replacement key — with `dispatch-pick-max-concurrent` still a live POLICY_KEYS row, a request for it answers with `dispatch-batch-size`'s value (both defaults 3, no divergence today) | observation | Carried to spec 331 (collapse leaf) for awareness (reviewer note, spec 329) |
