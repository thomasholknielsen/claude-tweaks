# GitHub Issues Workflow — Consistency Pass

**Date:** 2026-07-12
**Status:** Approved for planning

## Context

`docs/github-issues-integration-review.md` (2026-07-11) found 25 confirmed/plausible findings across every GitHub-issue touchpoint in the plugin (`bin/lib/issues/*`, `bin/lib/code-health/*`, `bin/lib/harness-health/*`, and the skills `capture`, `tidy`, `triage`, `flow`, `wrap-up`, `code-health`, `harness-health`, `help`, `init`, plus the shared contracts `_shared/issue-claims.md` and `_shared/github-pr-scan.md`). A separate session fixed most of them (18 of ~25, plus several low-severity/doc-hygiene items) between that review and this design. Re-verifying every finding against current `HEAD` (commit `38995e1`) found **13 still open, 2 partial**.

Beyond re-verifying the review's own findings, this design also looked for duplication and drift risk the review didn't explicitly flag — three concrete patterns turned up:

1. `multispec-review-console.md` repeats the exact same release-procedure paragraph verbatim twice in one file (lines 124-126 and 136-138).
2. The label check-then-create bootstrap loop is copy-pasted verbatim 4+ times across `triage/SKILL.md`, `code-health/SKILL.md`, and `harness-health/SKILL.md` — `_shared/issue-claims.md:67-69` even names this as "the same check-then-create pattern every label in this codebase uses" without ever centralizing it.
3. `_shared/issue-claims.md`'s header says "Consumers reference this file; do not restate the protocol inline," but the step-by-step release mechanics actually live in `wrap-up/cleanup-procedures.md` Section E, and `triage/SKILL.md` Step 4 hand-copies its own version rather than referencing Section E — which is exactly why Step 4 drifted into four separate gaps (findings #8, #19, #20, #21, #23 in the original review) while every other release site stayed in lockstep only through manual vigilance.

This design closes out the 13 open + 2 partial findings and addresses all three duplication patterns in the same pass, since several open findings and the duplication fixes touch the same files.

## Scope

### Group A — Tiering & dedup (structural)

- `bin/lib/issues/tier.js` gains a `KIND_ADAPTERS` table: `code-health` maps to the existing risk/effort label extractor; a new `harness-health` adapter maps `harness-health:additive` → `{riskTier: 'low', effortTier: 'low'}` (satisfies `recommendTier`'s existing both-low fast-track condition) and `harness-health:restructural` → `{riskTier: 'high', effortTier: 'high'}` (falls through to `approved`). `extractRiskEffort` tries each adapter's label patterns in turn and returns the first match — an issue's labels only ever match one kind's adapter, so no explicit kind input is needed. `recommendTier` itself stays kind-agnostic — it only ever consumes the common `{riskTier, effortTier}` shape, never label strings directly.
- A harness-health issue carrying `harness-health:new-skill` (proposals, not additive/restructural patches) intentionally matches neither adapter branch and keeps today's blank/`approved` fallback — new-skill proposals should never be fast-track-eligible, so this is the correct behavior, not a gap to close.
- `triage/SKILL.md`'s batch-table rendering (lines 62-66) picks up the new recommendation automatically once `extractRiskEffort` is kind-aware — no separate table-rendering change needed beyond passing the issue's labels through.
- `bin/lib/watchman-core/dedup.js` gains a `closed non-wontfix match → reopen` branch, mirroring `code-health/dedup.js`'s own (independent) reopen branch — without risk-threshold gating, since watchman-core's consumers (harness-health, journey-health) have no risk field to threshold against.
- `bin/harness-health.js:179` and `bin/journey-health.js:148` handle `decision.action === 'reopen'` (treat like `file`: push the payload, write `status: 'regressed'` to cache) — matching the pattern `bin/code-health.js:246-249` already uses for its own reopen branch.

**Explicitly not done:** collapsing `code-health/dedup.js` into `watchman-core/dedup.js`. Code-health's risk-threshold gating is real, load-bearing logic that doesn't generalize to findings without a risk field — forcing one shared engine would add irrelevant complexity to harness-health/journey-health, not remove duplication. Their divergence is legitimate.

### Group B — `triage/SKILL.md` hygiene

- Step 2 (the initial claim attempt) gets a literal `bash` code block, matching the style already used in Steps 1 and 4.
- The gh-availability/authentication Detection Ladder (currently defined once in `_shared/github-pr-scan.md`, wired only into `/tidy` and `/help`) gets wired into `/triage`, `/wrap-up`, and `multispec-review-console.md` as well — all three currently have no hard gate for a missing/unauthenticated `gh` CLI.
- Step 4's failure-release text — already correct after the earlier fix round — gets reworded to explicitly cross-reference `cleanup-procedures.md` Section E's shared micro-steps (the `status:in-progress` removal, the ownership check) by name instead of restating their mechanics inline. This doesn't change behavior; it closes the structural drift path that caused the original four-gap cluster, so a future edit to Section E can't silently desync Step 4 again.

### Group C — `/wrap-up` release-path fixes

- `cleanup-procedures.md`'s carrier-commit step gets an explicit exemption for issues that will be released via `worktree-merge.md`'s own `Fixes #N`-stamping `--no-ff` merge, stopping the double-stamped closing reference on the multi-terminal-parallel path.
- `review-console.md`'s release-reason mapping gets an explicit line stating that fast-track's direct `git merge` counts as the `merged:` outcome for that mapping — currently inferable but never stated.
- `multispec-review-console.md`'s two verbatim-identical release-procedure paragraphs (lines 124-126, 136-138) collapse into one subsection, referenced by both the "On approval" and "On override" branches instead of restated in each.

### Group D — Dashboard/doc/label fixes

- `github-pr-scan.md`'s `repo-wide` scope (consumed by `/tidy`) gets a `status:blocked` exclusion, matching the fix already present on the `triage-queue` scope (consumed by `/help`) — closes the remaining half of the double-count gap.
- `help/SKILL.md`'s "Relationship to Other Skills" table gets a `/claude-tweaks:triage` row — `triage/SKILL.md`'s own table already claims this relationship, and this repo's convention requires bidirectional entries.
- `worktree-merge.md:32`'s hardcoded `git diff --stat main..{branch}` becomes `git diff --stat {base-branch}..{branch}`, matching every other reference to the base branch in that file.
- New `skills/_shared/label-bootstrap.md` holds the canonical check-then-create bash snippet (the `gh label list --search ... || gh label create ...` loop), parameterized by a labels-JSON input. `triage/SKILL.md` (its three bootstrap sites: tier labels, `status:in-progress`, `status:blocked`), `code-health/SKILL.md`, and `harness-health/SKILL.md` all reference it instead of embedding their own copy of the loop. Tidy's four `parked`/`backlog` bootstrap sites are wired to the same snippet and gain real description strings in the process (subsuming what would otherwise be a standalone fix for the missing `parked` description).

### Group E — Robustness & test coverage

- `bin/harness-health.js`'s `cmdValidateFindings` gets a try/catch around cache/cursor persistence, mirroring the already-hardened pattern in `bin/code-health.js:262-271` (non-fatal — payloads still emit on a persistence failure).
- `bin/lib/issues/backlog.js`'s `classifyBacklogIssue` explicitly checks issue state and the presence of the `backlog` label, instead of relying on its sole caller to pre-filter (currently safe only because that caller happens to pre-filter today).
- New test: `bin/lib/issues/claims.js`'s `isStale` with a malformed (non-number, non-missing) `ttlHours` value.
- New test: `bin/lib/code-health/dedup.js`'s `finding.fingerprint` fallback branch (currently only `finding.id` is exercised).

### Group F — Claims backstop

- `tidy/scan-procedures.md`'s Step 4.7 backstop table gains a row for a corrupted-but-JSON-valid `claimedAt` (currently folds silently into "claim live, issue open → keep," matching `claims.js:70`'s documented-but-unimplemented promise that `/tidy` surfaces this case).

## Testing

Run the full suite (`npm test`) after each group lands. Group A additionally needs new unit tests for the `KIND_ADAPTERS` tiering path (including the `harness-health:new-skill` non-match case) and the `reopen` branch (both the `watchman-core/dedup.js` decision and the two consumer wire-ups). Within Group E, the `isStale`/`ttlHours` and `dedup.js`/`fingerprint` bullets are test-only additions; the `harness-health.js` try/catch and `backlog.js` classification bullets are behavior changes verified by the full suite like every other group.

## Out of scope

- Collapsing `code-health/dedup.js` into `watchman-core/dedup.js` (see Group A rationale).
- Removing the one-line `harness-health/dedup.js` / `journey-health/dedup.js` re-export shims — these are a deliberate seam for future per-kind divergence, not redundant duplication; both already pick up the Group A `reopen` fix for free through the re-export.
