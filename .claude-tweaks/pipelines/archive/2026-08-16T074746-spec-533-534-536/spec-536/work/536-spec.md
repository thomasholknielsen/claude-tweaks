---
record: 536
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: policy-comprehension:init-policy-review-delegates-its-detail-render-to-the-help-p
blocked-by: [534]
surface: backend
---
# 536: init policy review delegates its detail render to the /help policy contract

Surface: backend

## Overview

Make init's policy review a second entrance to the family's single renderer instead of a parallel implementation. `skills/init/policy-review.md`'s "Show details" pass currently owns its own presentation ("render every set lever with its value and what it does"); after this change it cites `skills/help/policy.md`'s render contract (from #534) for that detail render, keeping exactly one place that decides how policy is presented to a human. Init's final summary gains one pointer line naming `/claude-tweaks:help policy` as the standing review surface. Part of the policy-comprehension family (parent #532).

**Complexity:** Low
**Estimated tasks:** 3

## Non-Goals

- No change to bootstrap's policy questions (steps 06/18/20) — init still owns onboarding.
- No change to policy-review.md's audit mechanics: the `auditPolicy()` call, the never-skipped one-line count, and the one-click skip stay exactly as #388 shipped them. (The count is computed directly from `auditPolicy()` output *before* the details question — verified against the shipped file — so swapping the detail render cannot affect Phase 1u.6's Total drift count; preserving that ordering is part of this change's definition of done.)
- No interactive-edit capability inside init's review — the apply path lives in `/help policy`'s Next Actions only; init's detail render stays read-only and points there.
- No lint rule against future re-accumulation of render prose in policy-review.md — accepted as review-enforced for a fast-lane change; this decision is recorded here deliberately rather than left implicit.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #534 | /help policy mode: grouped config render with actionable, validated edits | Hard gate: do not start until #534 is merged (its `policy.md` must exist with its "Render contract" heading — the frozen surface this delegates to); re-check at pickup time |

## Current State

- `skills/init/policy-review.md` — #388's Policy Configuration Review: `auditPolicy()` counts, one `AskUserQuestion` skip/details choice, and a self-owned detail render spec in the "Show details" option description.
- `skills/init/update-mode.md` Phase 1u.5 — the entry that loads policy-review.md; `skills/init/summary-templates.md` — init's final summary blocks (the pointer line lands in its update-mode summary block; confirm the exact block at build and name it in the PR).
- `skills/help/policy.md` — the render contract (four numbered sections under a "Render contract" heading; from #534).
- `docs/skill-graph.md` — every cross-skill relationship stated once; the init→help delegation is a new edge.

## Deliverables

- [ ] `skills/init/policy-review.md`: the "Show details" path reads `skills/help/policy.md`'s render contract and produces its sections 1–4, read-only (no Next Actions apply; instead one closing line pointing at `/claude-tweaks:help policy` for edits). The AskUserQuestion option description updated to match.
- [ ] `skills/init/summary-templates.md`: one line in the update-mode summary block naming `/claude-tweaks:help policy` as the standing config review surface.
- [ ] `docs/skill-graph.md`: the init→help render-delegation edge, stated once.

## Acceptance Criteria

1. `policy-review.md` no longer contains its own lever-rendering spec — grep shows the detail path citing `skills/help/policy.md` and no per-lever presentation prose of its own.
2. **Content parity**: the delegated render covers everything the old detail spec rendered — every set lever with value and meaning (contract sections 1 + the summaries), and the issue table (#388's "{N} issue(s) found") via contract section 2. The PR description carries this as an explicit old-vs-new coverage checklist; a gap means extending the citation, not re-adding local prose.
3. The one-line count sentence ("Always surface a one-line count… never silently skipped") survives verbatim, computed before the details question exactly as today; the skip option remains first.
4. Skill references in actionable text use the fully-qualified `/claude-tweaks:help` form.
5. `docs/skill-graph.md` gains exactly one new edge for this relationship; no edge is restated inside either SKILL.md.
6. `npm test` passes.

## Technical Approach

Citation-swap, not rewrite: policy-review.md keeps its own gather/count/skip skeleton and swaps the detail-render body for a reference to the canonical contract, following the repo's stated-once cross-reference convention. Read `docs/skill-authoring.md` first (mandatory for `skills/**` edits).

### Data / API Surface

None — prose-only.

### Key Files

- `skills/init/policy-review.md` — detail render delegates to help's contract
- `skills/init/summary-templates.md` — pointer line in the update-mode summary block
- `docs/skill-graph.md` — new edge

### Package Dependencies

None.

## Gotchas

- `docs/skill-graph.md` is append-contended by open records #509/#530/#276 — rebase, don't block.
- The render contract lives in a *different skill's* sub-file. Skills lazy-load their own directory; init's prose must instruct reading `skills/help/policy.md` by explicit path (cross-skill sub-file reads are by path, not by Skill invocation — invoking `/claude-tweaks:help` from inside init would run the whole mode, gather included, which is not what the detail render wants).
- Don't let the delegation silently drop init-specific context: the review runs during `--update`'s drift-check sequence, so its issue counts feed Phase 1u.6's Total drift count — that wiring stays in policy-review.md, not in help's contract (see Non-Goals for why this is safe).

## Decision Rationale

See parent #532 — "one renderer, two entrances." Duplicating the render in init was rejected because the two copies would drift exactly the way the pre-#388 policy prose did.

<!-- work-fingerprint: policy-comprehension:init-policy-review-delegates-its-detail-render-to-the-help-p -->
