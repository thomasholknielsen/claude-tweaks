# Criteria: Missing Tests

Shared, criteria-only fragment — the "which coverage gaps are worth filing" knowledge for the `missing-tests` criterion. No workflow, no auto-mode handling, no Next Actions. Consumed by `/claude-tweaks:code-health`'s `focus=test-hygiene` judgment (`bin/lib/code-health/candidates-test-hygiene.js`'s `coverage-gap` candidates) via `criteriaForArea`'s generalist-rotation pickup and the focus-mode Criterion pinning table alike.

## Structural, not line-coverage

`coverage-gap` candidates come from file/export correspondence — no instrumentation, no nyc/c8, no percentage. Judge structurally: does this file or symbol have ANY test that exercises it, not "how many of its lines execute." A file with one thin smoke test and a file with an exhaustive suite both read as "has coverage" to the generator and to this criterion — depth of testing is a separate, `test-quality`-flavored question this fragment does not answer.

## Worth filing vs. not

A coverage gap is worth filing when the module is load-bearing: other code depends on its correctness, and a defect in it would surface somewhere a human notices. Concretely:

**File when:**
- The gap is in a public API surface — an exported function other modules call, a CLI command, a route handler.
- The gap is in logic with a real decision tree — branches, edge cases, error paths — where "it probably works" is a guess, not a fact.
- The candidate's `evidence` shows the symbol genuinely unreferenced by any test, not merely unreferenced by *name* through a barrel re-export the generator doesn't follow (v1 stated limitation — read the file before concluding the gap is real).

**Do NOT file when:**
- Generated code (a build artifact, a codegen output) — testing generated output tests the generator, not this file.
- Config echoes — a module that only re-exports or lightly reshapes configuration values, with no branching logic of its own.
- Thin re-exports — a barrel file whose entire body is `module.exports = { ...require('./x') }`-shaped forwarding. The thing worth testing is what it forwards to, not the forwarding itself.
- A file already covered by an existing test the generator's pairing heuristics simply didn't find (verify by reading — the generator's false-negative direction is "prefer missing a gap," not "prefer flagging a covered module," so a candidate that turns out to be covered is the generator being appropriately conservative, not the file being genuinely gapped; the judge's job here is to catch the generator's own false positives, which are rare but not impossible when a pairing heuristic's naming convention happens not to match this repo's).

## Symbol-scoped gaps

When a file IS paired with a test but one exported symbol is never referenced by test code (the generator's symbol-scoped `coverage-gap` candidate), apply the same worth-filing calibration to that symbol specifically — a paired file with one untested public helper is a narrower, more precise finding than "this file needs tests," and the resulting work record should say exactly which symbol.

**Barrel caveat:** the generator does not follow re-export chains (v1, stated in its own header) — a symbol referenced only through a barrel file may read as a gap when it is not one. Read the symbol's actual call sites (not just direct-import references) before filing a symbol-scoped finding; a false positive here is more likely than for a file-level gap.

## What to propose

A `coverage-gap` finding is *creation* work: propose a `type:task` record naming the file (and symbol, if symbol-scoped) and stating what the test should exercise — the load-bearing behavior identified above, not "add a test for X" with no content. The finding does not write the test itself.
