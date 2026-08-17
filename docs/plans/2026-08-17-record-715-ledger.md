# Open Items — Merge authorization at unattended: Manifesto-time lever, or one-click Recommended at the terminal summary?

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build/skill | `.claude/skills/skill-prose-conformance-tests` documents live-prose-vs-frozen-fixture and byte-pinned-snippet patterns; this build's `tests/resolve-policy-lib.test.js` additions extend it with a new wrinkle — negative-exclusion testing for a resolver special case (asserting a value is deliberately *not* sourced from policy.yml, not just asserting what it resolves to) — worth folding into that skill's Key Patterns if a second lever needs the same shape. | observation | Not blocking; no skill file edited this build. |
| 2 | review/hindsight | `docs/skill-authoring.md` doesn't document the byte-ceiling sub-file-extraction technique, used 4+ times codebase-wide (most recently by this build, twice). Staged for the Wrap-Up Review Console to route. | deferred | Staged: staged/reflect-1.md. |
