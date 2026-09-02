---
record: 251
origin: human
risk: low
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 251: Extend wrap-up-registry-pin to cover Gate and Scope cell semantics

Surface: backend

## Current State

`tests/wrap-up-registry-pin.test.js` pins target/judge/disposition between `SKILL.md`'s registry table and `bin/lib/wrap-up/registry.js`, but the Gate and Scope columns are prose-only — the 6.71.0 final review caught two gate-cell drifts by hand (claude-md 'changed' vs renamed-or-removed; references row pre-headingRenamed) that the pin structurally cannot catch, because nothing asserts the Gate/Scope cell text against the registry's own gate/scope shapes.

## Deliverables

Extend `tests/wrap-up-registry-pin.test.js` to assert Gate/Scope cell claims against `registry.js` gate/scope shapes — e.g. every `anyOf` fact and signal key named in a Gate cell exists in that row's gate spec, and cap numbers named in a Scope cell match the registry's own cap values.

## Acceptance Criteria

- The extended pin fails when a Gate cell names a fact/signal key not present in the corresponding row's `registry.js` gate spec, or when a Scope cell's cap number diverges from the registry's own value.
- The extended pin passes against the current, correct state of `SKILL.md`'s registry table and `registry.js`.
- `npm test` green.

## Technical Approach

Parse each registry row's Gate/Scope cell text for fact/signal-key tokens and cap numbers (the same class of token the 6.71.0 review caught by hand), then cross-check each token against the corresponding `registry.js` row's gate spec (`anyOf` facts/signals) and scope cap. Reuse `wrap-up-registry-pin.test.js`'s existing table-to-registry row-matching logic rather than re-deriving it.

### Key Files

- `tests/wrap-up-registry-pin.test.js`
- `plugin/bin/lib/wrap-up/registry.js`
- `plugin/skills/wrap-up/SKILL.md` — the registry table

## Gotchas

- The two drifts the 6.71.0 review caught by hand were a "changed" vs "renamed-or-removed" claim mismatch and a "references row pre-headingRenamed" claim — the new assertion needs to be general enough to catch that class, not narrowly re-encode those two specific past cases.

## Original request

Extend wrap-up-registry-pin to cover Gate and Scope cell semantics

tests/wrap-up-registry-pin.test.js pins target/judge/disposition between SKILL.md's registry table and bin/lib/wrap-up/registry.js, but the Gate and Scope columns are prose-only — the 6.71.0 final review caught two gate-cell drifts by hand (claude-md 'changed' vs renamed-or-removed; references row pre-headingRenamed) that the pin structurally cannot. Extend the pin to assert Gate/Scope cell claims against registry.js gate/scope shapes (e.g. every anyOf fact and signal key named in the cell exists in the row's gate spec, cap numbers match).

Origin: 6.71.0 wrap-up run (reflection insight #3).

