---
record: 641
origin: human
risk: low
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 641: build plan-authoring / pr-early-run-lifecycle: size-headroom pre-check for near-ceiling `_shared`/SKILL.md files — merge-induced overflow surfaces inside the merge sequence

Surface: backend

## Current State

- `skills/build/SKILL.md` Spec Step 3 already carries five "plan-authoring check" bullets (the
  Plan-authoring check, Blocking-verification-downgrade check, Deictic-reference re-resolution
  check, Verbatim-command run-once check, and Degrade-clause convention check, lines 118-126),
  each ending `(Same check applies in Design Step 3 below.)`. Design Step 3 (line 158) picks up
  all five via a single cross-reference: "Same plan-header artifact rule and plan-authoring check
  as Spec Step 3 apply."
- `skills/_shared/pr-early-run-lifecycle.md`'s "Pre-merge title/description refresh" section
  (line 210) already runs an unconditional `AUTO` step immediately before
  `_shared/pr-first-merge.md` Step 2 undrafts the PR — today it only re-runs the phase-checklist
  update and refreshes the PR title, with no size/ceiling probe of any kind.
- `tests/bin-lib/skill-audit/context-cost.test.js` enforces the 40 KB per-invocation ceiling on
  every `SKILL.md` and lazy-loaded sub-file (the hard-fail tests at lines 81 and 92), plus a
  warn-only 90-100%-of-ceiling band test (line 126). All three run against the working tree at
  test time, with no visibility into what a concurrent sibling branch is about to merge into the
  same shared file.
- Gap: none of these three points check headroom against the *merge base*. A branch can be green
  in isolation and still push a shared `skills/_shared/*.md` file over the ceiling once merged
  with a concurrent sibling's own additions — and the only place that failure surfaces today is
  inside the merge sequence itself, well after plan-authoring and worktree setup are done.

## Deliverables

- [ ] A sixth plan-authoring check bullet in `skills/build/SKILL.md` Spec Step 3, in the same
      format as the five existing bullets: when a plan task appends to a `skills/_shared/*.md` or
      `SKILL.md` file already within ~10% of the 40 KB ceiling, require the plan to measure
      `wc -c` against the ceiling on the merge base and name the split up front, rather than
      discovering the overflow at test time.
- [ ] A `git merge-tree`-based size probe added as its own step inside
      `skills/_shared/pr-early-run-lifecycle.md`'s "Pre-merge title/description refresh" section —
      it already runs unconditionally, immediately before the merge sequence starts, which is
      exactly the "before the merge sequence starts" point the record calls for. The probe
      computes the *merged* size of every branch-touched `skills/_shared/*.md`/`SKILL.md` file
      against `main` and surfaces an overflow as a stop rather than letting it fail inside
      `git merge`/CI.
- [ ] Test coverage proving both checks actually fire: a fixture plan/task pair for the
      plan-authoring bullet, and a constructed two-branch fixture (each branch green alone, the
      merge of both over ceiling) for the merge-tree probe, plus a control fixture that stays
      under ceiling both alone and merged.

## Acceptance Criteria

1. A plan task that appends to a `skills/_shared/*.md` or `SKILL.md` file within 10% of the
   40 KB ceiling, without naming a split, is flagged by the new Spec Step 3 plan-authoring check —
   verified by a fixture plan/task pair.
2. The `git merge-tree`-based probe correctly predicts a ceiling breach that only occurs after
   merging two concurrent branches' changes to the same `skills/_shared/*.md` file, and reports it
   before the merge sequence proceeds — verified against a constructed two-branch fixture.
3. A branch that stays under ceiling both alone and merged with current `main` passes the probe
   with no false-positive stop.
4. `npm test` remains green, including the existing
   `tests/bin-lib/skill-audit/context-cost.test.js` suite — unchanged behavior for the in-tree
   ceiling checks it already covers.

## Technical Approach

- Mirror the existing plan-authoring check bullets' exact format
  (`**Name check:** description ... (Same check applies in Design Step 3 below.)`) so the new
  check is picked up by Design Step 3's existing "Same plan-header artifact rule and
  plan-authoring check as Spec Step 3 apply" cross-reference without a second edit there.
- Land the merge-tree probe inside "Pre-merge title/description refresh"
  (`skills/_shared/pr-early-run-lifecycle.md`) rather than inventing a new pipeline stop — reuse
  its existing best-effort/`AUTO` logging convention (`skills/_shared/auto-decision-log.md`)
  rather than a new failure mode.
- Compute headroom via `git merge-tree` (or `git show {merge-base}:path` + `wc -c` per
  branch-touched file, if `merge-tree`'s three-way output proves awkward to parse) against `main`,
  scoped to files the branch already touches — no need to scan the whole repo.
- Reuse the 40 KB `CEILING_BYTES` constant `tests/bin-lib/skill-audit/context-cost.test.js`
  already defines rather than hard-coding a second copy of it.

## Gotchas

- `git merge-tree` output format differs between the legacy and `--write-tree` (2.38+) modes —
  verify which is available in the CI/dev environment before writing the parser, per the
  plan-authoring "Verbatim-command run-once check" this same record is extending: run the real
  command once, read-only, against a real merge before dispatching the plan that depends on its
  output shape.
- The probe is a prediction against `main` as of probe time — a sibling branch that merges *after*
  the probe runs but *before* this branch merges can still produce a fresh overflow the probe
  never saw. This narrows the race described in the record's use case; it does not close it
  entirely. State that scope boundary explicitly rather than implying full closure.
- The new plan-authoring bullet's blast radius is prose only — it changes what a plan-authoring
  pass checks for, not runtime behavior — so it carries the same low reversibility risk as the
  five existing bullets it sits alongside. The merge-tree probe is the higher-risk half of this
  record, since it's new git-plumbing logic rather than a prose addition.

## Original request

build plan-authoring / pr-early-run-lifecycle: size-headroom pre-check for near-ceiling `_shared`/SKILL.md files — merge-induced overflow surfaces inside the merge sequence

**Summary:** A `_shared` sub-file that was under the 40 KB ceiling on the branch and under it on `main` crossed it only after the pre-finish merge, so the run's own green suites never saw it and the split had to happen inside the merge path.

**Kind:** Gap

**Affected component:** `skills/build/SKILL.md` Spec Step 3 plan-authoring checks; `_shared/pr-early-run-lifecycle.md`; `tests/bin-lib/skill-audit/context-cost.test.js`

**Objective:** Developer joy

**Use case:** Two concurrent records each append ~2 KB to the same near-ceiling `_shared/policy-schema.md`; each branch is green; the merged tree fails `no lazy-loaded sub-file exceeds the ceiling`. Recovery cost: a new file, a stub, a test extension, three more suite runs at the end of a 4h run.

**Proposed fix:** Add a size-headroom check to `/build`'s plan-authoring checks: when a plan task appends to a `skills/_shared/*.md` or `SKILL.md` within ~10% of its ceiling, measure `wc -c` against the ceiling on the merge base and require the plan to name the split up front. Pair it with a `git merge-tree`-based size probe at the pre-finish catch-up so main-induced overflow surfaces before the merge sequence starts.

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).
<!-- fingerprint: feedback-38e6e3d2 -->

