---
record: 674
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 674: Review Console staged patches: validate at staging time and stage a normalization description, not a literal diff

Surface: backend

## Current State

`skills/review/step3-routing.md`'s auto-mode routing stages medium/high findings as literal patch files (`staged/review-{n}.patch`), and both consoles (`wrap-up/review-console.md` "On approval" step 1, `flow/multispec-review-console.md`) apply them with `git apply` at console time. Nothing validates the staged diff when it is written, and nothing accounts for the pipeline's own later steps mutating the target: in run 2026-08-16T164927, `/simplify` legitimately restructured the target lines after review staged its patch, and the staged diff was additionally malformed — `git apply` failed with "No valid patches in input" and the one-line fix had to be re-derived by hand at the console.

## Deliverables

- [ ] `skills/review/step3-routing.md` (and any other patch-staging site found by grep): staged patches are validated with `git apply --check` at staging time; a failing check blocks the stage write and surfaces the composition error immediately.
- [ ] The staged artifact carries a normalization description alongside (or instead of) the literal diff — target file plus the invariant to establish (e.g. "the `rel` assignment normalizes separators to posix") — and the consoles' apply step falls back to re-deriving the edit from that description when `git apply` fails on a stale diff, instead of erroring out.
- [ ] Both consoles' apply steps document the staleness case: a diff staged before later pipeline phases (simplify, polish, fix waves) is expected to go stale; the description, not the diff bytes, is the durable intent.

## Acceptance Criteria

1. A deliberately malformed patch is rejected at staging time by `git apply --check` (verified by a discrimination test or documented probe), never first discovered at the console.
2. A staged item whose target moved after staging still applies at the console via the description fallback, with the outcome logged; `npm test` passes with any conformance pins updated.

## Technical Approach

Contract-text change across the staging site and the two console apply steps; the description line joins the existing stage-file format. No new tooling — `git apply --check` and the existing Edit-based fallback are already available at both sites.

## Gotchas

- The staging site writes patches mid-pipeline in a worktree whose HEAD advances several more times before the console runs — staleness is structural, not an edge case.
- Multi-spec consoles apply patches "against the cumulative pipeline state" — the description fallback must name its target file so cumulative drift stays resolvable.

## Original request

Review Console staged patches: validate at staging time and stage a normalization description, not a literal diff

**Related:** none

Context: In run 2026-08-16T164927 (this repo), the Review Console's staged review patch failed `git apply` at console time — the staged diff was malformed AND stale, because /simplify legitimately moved the target line after review staged it; the fix had to be re-derived by hand.

Scope: step3-routing.md's staging contract plus both consoles' apply steps — run `git apply --check` at staging time, and prefer staging a normalization description (target file + invariant) over a literal diff that later pipeline commits can invalidate.
