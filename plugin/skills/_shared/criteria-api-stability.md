# Criteria: API / Contract Stability

Shared, criteria-only fragment — what to flag for API and contract stability in libraries and public-facing services. No workflow, no Next Actions. Consumed by `/claude-tweaks:code-health`'s api-stability judgment lens (library + backend areas).

## What to flag

- **Breaking-change risk without versioning:** a public function, class, or REST endpoint signature that is being changed (parameter added without a default, parameter removed, return shape changed) with no version bump or deprecation path.
- **Undocumented public API:** exported functions or types with no JSDoc/TSDoc, no README entry, and no type signature — callers cannot know the contract without reading the implementation.
- **Implicit contract in test doubles:** tests that mock internal implementation details rather than the public interface, making the tests brittle to non-breaking refactors.
- **Response shape drift:** a REST or RPC endpoint whose response shape is not validated against a schema, making silent drift to consumers likely.
- **Missing deprecation markers:** a function or endpoint that has been superseded but still exists with no `@deprecated` tag and no migration path documented.

## What NOT to flag

- Internal APIs (unexported functions, private methods) — stability concerns apply only to surfaces that cross a module boundary consumed by outside callers.
- Breaking changes in a pre-1.0 library or an explicitly unstable API (tagged `@experimental`/`@alpha`/`@beta`).
- API documentation gaps in private methods or implementation helpers.

## Severity calibration

- **high** — a breaking change to a public API with no version bump and no migration guide, especially when it is already widely consumed (a breaking change not yet widely distributed can still be caught pre-release, but is still `high`).
- **medium** — an undocumented public export or a missing deprecation marker.
- **low** — a minor contract ambiguity (optional parameter semantics not documented).
