---
record: 839
origin: capture
risk: low
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 839: auditPolicy silently accepts a policy.yml value for a source-excluded lever (merge-authorization)

Surface: backend

**Related:** #715

## Current State

Discovered during #715's final whole-branch review — the new `merge-authorization` lever deliberately excludes `.claude-tweaks/policy.yml` as a source (a resolver special case in `bin/lib/policy-schema.js` discards a policy.yml value for this key, falling back to `ask`). `auditPolicy()` validates that policy.yml line as recognized and valid, so a project owner who sets it there gets zero feedback that it will never take effect.

## Deliverables

- Add a distinct `auditPolicy` category for a key that is recognized/valid but structurally excluded from the policy.yml source — general to any future lever with the same resolver-special-case shape, not hardcoded to `merge-authorization` specifically.
- Surface this new category via `/claude-tweaks:init --update`'s Config Home Drift check, so a project owner who sets an excluded key in policy.yml gets an explicit warning rather than silence.
- A unit test covering the new category.

## Acceptance Criteria

- Setting `merge-authorization` (or any other resolver-special-case-excluded key) in `.claude-tweaks/policy.yml` produces a distinct, named `auditPolicy` finding — not silently validated as recognized-and-effective.
- `/claude-tweaks:init --update`'s Config Home Drift check surfaces the new category to the user.
- The mechanism generalizes: adding a second source-excluded lever in the future does not require new `auditPolicy` code, only registering the exclusion.
- A unit test exercises the new category against `merge-authorization` as the worked example.

## Technical Approach

`bin/lib/policy-schema.js` already knows which keys carry a resolver special case that discards a policy.yml value (the mechanism that makes `merge-authorization` fall back to `ask`) — read that same registry from `auditPolicy()` rather than duplicating the exclusion list, so the two can't drift apart.

## Gotchas

- Keep the new category general to "recognized-but-source-excluded," not hardcoded to `merge-authorization` — a second lever with the same shape should get the warning for free once it's registered in `policy-schema.js`'s exclusion registry.

## Original request

auditPolicy silently accepts a policy.yml value for a source-excluded lever (merge-authorization)

**Related:** #715

Context: Discovered during #715's final whole-branch review — the new `merge-authorization` lever deliberately excludes `.claude-tweaks/policy.yml` as a source (a resolver special case in `bin/lib/policy-schema.js` discards a policy.yml value for this key, falling back to `ask`). `auditPolicy()` validates that policy.yml line as recognized and valid, so a project owner who sets it there gets zero feedback that it will never take effect.

Scope: Add a distinct `auditPolicy` category for a key that's recognized/valid but structurally excluded from the policy.yml source (general to any future lever with the same resolver-special-case shape, not hardcoded to this one key name), surfaced via `/claude-tweaks:init --update`'s Config Home Drift check, with a unit test.

