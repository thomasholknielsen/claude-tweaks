---
record: 274
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
fingerprint: 2026-08-09-self-maintaining-fleet-design:experiment-cleanup-vertical-feature-flag-candidate-generator
blocked-by: [271, 219]
surface: backend
---
# 274: experiment-cleanup vertical: feature-flag candidate generator, criterion, and flag-idiom policy key

Surface: backend
Parent: #265

Blocked by #271: assumes the focus grammar and candidate-input plumbing landed as specified
Blocked by #219

## Overview

The experiment-cleanup vertical — the reel's "ship finished experiments" job, translated honestly: a generator that finds **feature-flag / experiment scaffolding whose decision has been made** (flag always-on, always-off, or expired) so the sweep can file "remove this scaffolding, keep the winning branch" records. Flag idioms are repo-specific, so detection is driven by a new policy key `experiment-flag-patterns` (the repo names its own idiom). **When the key is unset, this vertical is inactive: the focus run reports "no flag idiom configured — set `experiment-flag-patterns` to enable" and exits clean. There is no LLM-detection fallback** (an earlier draft's fallback contradicted the no-whole-repo-scan rule and is deleted, not deferred).

Decision rationale on parent #265.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- Removing any flag or shipping any experiment — findings file as records.
- Integrating with flag-service APIs (LaunchDarkly etc.) to read rollout state — v1 judges from the code alone (a flag checked but never varied, a flag constant-folded at every call site, a flag past a dated comment); service integration is a later widening, and the fragment says so.
- Other verticals or the framework.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #271 | code-health focus mode + dead-code generator | this decomposition — framework |
| #219 | Model-profile policy keys | file-overlap ordering on `policy-schema.js`/`policy-schema.md` only |

## Current State

- Framework (post-E): focus grammar + candidate plumbing; generator + fixture-suite model established.
- Policy keys: `bin/lib/policy-schema.js` `POLICY_KEYS` + `skills/_shared/policy-schema.md` Config Lever Index (the same two files the trust leaf touches for its window key — merge, don't overwrite, whichever lands second).
- Criteria catalog + fragments: `bin/lib/code-health/criteria.js`, `skills/_shared/criteria-*.md`.

## Deliverables

- [ ] Policy key `experiment-flag-patterns`: list of glob/regex patterns naming the repo's flag idiom (call-site patterns like `isEnabled\(['\"]`, registry file paths, naming conventions) — registered in `policy-schema.js`, documented in `policy-schema.md` with an example entry, empty/absent = generator inactive.
- [ ] `bin/lib/code-health/candidates-experiment-cleanup.js`: given the patterns, finds flag call sites and classifies decision signals — flag identifier appearing in a registry with a terminal state marker, call sites where one branch is empty/dead, flags whose guard wraps code token-identical (whitespace/comment-normalized, never byte-exact) to the else branch, dated TODO/cleanup comments beside a flag — emitting `{flag, sites: [...], signals: [...], evidence}` (**`signals` is an array — the detectors are independent and more than one can fire; `evidence` names each**). Pattern-driven; coverage = whatever the configured patterns reach (stated, IL-110). The run summary reports **sites matched and candidates emitted separately**, so "patterns configured but missing the repo's real idiom" is visible as zero sites, distinct from "sites found, none decided".
- [ ] `skills/_shared/criteria-experiment-cleanup.md`: new fragment — calibration for judging "decided" (shipped-to-100% scaffolding whose removal is safe and mechanical vs. a kill-switch that must stay). The identical-branches signal carries a mandatory blame-check instruction: the judge verifies the identity isn't an IL-87-style merge artifact before filing, and the fragment names the residual risk that a kill-switch not matching any naming pattern reads as decided — findings from this vertical always propose records for the supervised/granted pipeline, never direct removal.
- [ ] `bin/lib/code-health/criteria.js`: catalog entry `experiment-cleanup`, area-gated per the catalog's live conventions.
- [ ] Focus wiring: `focus=experiment-cleanup` — generator when patterns configured; **unset key → the focus run judges nothing, reports the no-idiom message, and never scans the whole repo** (one rule, no fallback path — consistent with the Overview).
- [ ] `bin/lib/code-health/tests/candidates-experiment-cleanup.test.js`: frozen fixtures.

## Acceptance Criteria

1. Fixture with a configured pattern set, one decided flag (guard wrapping code with an empty else and a `// cleanup after 2026-01` comment), one live flag (both branches substantive, no terminal signal) yields exactly the decided flag — exact-set.
2. Key absent → generator returns `[]` and the focus run reports the no-idiom message; asserted at the module level and stated in the SKILL.md wiring (the unambiguous-signal rule, IL-115: absence of configuration is not a resolution failure and must not degrade to a whole-repo scan).
3. Malformed patterns (invalid regex) fail loud at generator entry with the offending pattern named — never silently skipped (fail-open here would suspend the vertical invisibly, IL-92).
4. The `missing-tests`/trust-leaf policy-schema edits and this leaf's key coexist — whichever merges second preserves the other's rows (asserted by the policy-schema suite covering all registered keys).
5. Fragment's kill-switch caveat is present: a finding on a flag matching a kill-switch naming pattern (`emergency`, `circuit`, configured-excludable) must be suppressed by the generator's exclusion list — fixture included.

## Technical Approach

The generator compiles the configured patterns once, scans matching call sites via `find`+`xargs grep` (explicit file list + control grep — recursive grep's gitignore behavior varies), then applies the decision-signal classifiers per flag identifier. Signals are independent detectors; a flag needs ≥ 1 to become a candidate, and the evidence string names which fired.

### Data / API Surface

- `candidatesExperimentCleanup(rootDir, patterns, excludes, opts) → [{flag, sites, signals, evidence}]`.
- **Two keys, decided now** (the fixture in AC5 tests against this exact shape): `experiment-flag-patterns` — array of regex-source strings; `experiment-flag-exclude` — array of kill-switch name patterns, **shipping with defaults `["emergency", "circuit", "kill"]`** that user values extend rather than replace. Both register in `POLICY_KEYS` (a keyed object, so the trust-leaf/#219 coexistence is structurally collision-safe on merge — only an identical key name could conflict, and none of the three efforts share one).
- Scan bounding, concrete mechanism: line-by-line matching with a per-line length cap (default 1000 chars) — linear input bounding rather than regex-engine timeouts (Node has none); over-cap lines are skipped and counted in the run summary's skipped stats, never silently dropped. Malformed patterns still fail loud at entry (AC3).

### Key Files

- `bin/lib/code-health/candidates-experiment-cleanup.js` — new
- `bin/lib/code-health/tests/candidates-experiment-cleanup.test.js` — new
- `skills/_shared/criteria-experiment-cleanup.md` — new fragment
- `bin/lib/code-health/criteria.js` — catalog entry
- `bin/lib/policy-schema.js` + `skills/_shared/policy-schema.md` — key registration
- `skills/code-health/SKILL.md` / focus sub-file — `experiment-cleanup` wiring

### Package Dependencies

- None new.

## Gotchas

- This plugin's own repo has no feature-flag idiom — the fixture trees are the only in-repo test bed, so they must model at least two distinct idiom styles (function-call guard + registry object) to keep the pattern engine honest.
- A flag guard whose two branches are byte-identical is a *decided* signal but also exactly what IL-87-style merge artifacts produce — the fragment should tell the judge to check git blame context before calling it experiment debris.
- IL-73 (no real-args CLI runs), IL-109 (re-verify E's landed grammar and the policy-schema file state before building — #219 and the trust leaf both touch it).
- Regex compiled from user config is an injection-adjacent surface: compile with a timeout-guarded scan loop (pathological patterns on big files), and never `eval`.


<!-- work-fingerprint: 2026-08-09-self-maintaining-fleet-design:experiment-cleanup-vertical-feature-flag-candidate-generator -->
