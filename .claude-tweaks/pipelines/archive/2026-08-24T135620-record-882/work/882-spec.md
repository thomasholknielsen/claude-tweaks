---
record: 882
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 882: test: flake adjudication — re-run failed files in isolation before reporting failure

Surface: backend

## Current State

Run-to-run failure-count variance on byte-identical code tracks machine load (documented in this repo's CLAUDE.md — sibling agents/sessions running concurrently, not a regression). The re-run-in-isolation rule for distinguishing flake from a real regression is currently manual discipline the model may or may not apply consistently.

## Deliverables

- Encode the re-run-in-isolation rule in `verification.md` (the `superpowers:verification-before-completion` skill's canonical procedure): on a test failure, re-run each failed file in isolation once, and report flake vs. regression distinctly rather than reporting a bare pass/fail count.

## Acceptance Criteria

- [ ] `verification.md` states: on a `npm test` failure, re-run each failed file in isolation (`node --test path/to/file.test.js`) once before concluding anything is broken.
- [ ] The re-run's outcome is reported distinctly — flake (isolated re-run passes) vs. regression (isolated re-run still fails) — rather than collapsed into one pass/fail statement.
- [ ] Related: #892.

## Technical Approach

Add the re-run-in-isolation step to `verification.md`'s failure-handling procedure, mirroring the pattern already documented informally in this repo's CLAUDE.md (Commands section: "re-run only the affected file(s) in isolation ... before concluding anything is actually broken"). State explicitly that the isolated re-run's result determines the report language: a pass on isolated re-run is reported as flake (machine load), a failure on isolated re-run is reported as a regression.

### Key Files

- `verification.md` (the `superpowers:verification-before-completion` skill's canonical procedure) — add the re-run-in-isolation step and flake/regression reporting distinction

## Gotchas

- This encodes an existing informal convention (already stated in this repo's own CLAUDE.md) into the skill's canonical procedure — it should not introduce new behavior beyond what's already documented practice, just make it consistently applied rather than optional.
- Related to #892 — check its scope before starting to avoid overlapping fixes.

## Original request

test: flake adjudication — re-run failed files in isolation before reporting failure

**Related:** #892

Context: run-to-run failure-count variance on byte-identical code tracks machine load (documented in this repo's CLAUDE.md); the re-run-in-isolation rule is currently manual discipline the model may or may not apply.

Scope: encode in verification.md — on failure, re-run each failed file in isolation once and report flake vs regression distinctly.

