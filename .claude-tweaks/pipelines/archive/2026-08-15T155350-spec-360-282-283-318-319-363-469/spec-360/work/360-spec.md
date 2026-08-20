---
record: 360
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: sdd-per-task-review-no-parent-ac-check
surface: backend
---
# 360: subagent-driven-development: per-task review doesn't check parent spec's Acceptance Criteria

Surface: backend

## Current State

`/build`'s `subagent` (default) execution strategy invokes `/superpowers:subagent-driven-development` (`skills/build/SKILL.md`'s `**subagent** (default):` paragraph, currently around line 201). That invocation already composes an explicit instruction string forwarded to `subagent-driven-development` — today it's used to override per-task model tier (`low`/`medium`/`high` → Fast/Standard/Capable) — but forwards nothing about the parent spec's own Acceptance Criteria.

`subagent-driven-development`'s per-task review step composes its dispatch prompt from the task's own brief text and the diff. It has no visibility into the parent spec's `## Acceptance Criteria` section unless `/build` explicitly forwards it — the task brief is the only spec-derived context a per-task reviewer sees.

Reported via issue #360 (Gap, filed by `/claude-tweaks:feedback`): a task can pass its own per-task review while violating the parent spec's Acceptance Criteria, because a diff-vs-brief comparison can't catch a task brief that itself (incorrectly) restates a spec criterion. The violation only surfaced at the final whole-branch review, several tasks later, requiring a dedicated fix wave — the whole-branch review is the only backstop today.

## Deliverables

- Extend the explicit-instruction text `/build`'s `subagent` (default) strategy already forwards to `/superpowers:subagent-driven-development` (`skills/build/SKILL.md`, the `**subagent** (default):` paragraph) to also direct: for every per-task review dispatch, include the relevant excerpt of this spec's own `## Acceptance Criteria` section — read from the materialized spec at `{run-dir}/work/{n}-spec.md` — alongside the diff and the task's own brief, not just the diff-vs-brief comparison used today.
- Document the addition inline, in the same paragraph as the existing tier-override instruction, so a future editor sees both forwarded instructions together rather than one documented and one silently added.

## Acceptance Criteria

- The `**subagent** (default):` paragraph in `skills/build/SKILL.md` instructs `/superpowers:subagent-driven-development` to include the parent spec's Acceptance Criteria excerpt alongside the diff in every per-task review dispatch — added in the same sentence/paragraph as the existing tier-override instruction, not as a separate disconnected step.
- The instruction names the exact source of the excerpt: the materialized spec's own `## Acceptance Criteria` section at `{run-dir}/work/{n}-spec.md`, not the raw GitHub issue body and not re-derived from the task brief.
- No change is made to the superpowers plugin's own `subagent-driven-development` skill files — the fix is scoped entirely to what `/build` forwards to it at invocation time, matching the existing tier-override precedent in the same paragraph.
- A build run with this instruction in place demonstrably surfaces the parent spec's Acceptance Criteria text inside each per-task reviewer's dispatch prompt — verifiable by inspecting the composed dispatch prompt/payload during a build (e.g. a dry-run trace or a captured dispatch transcript), not just by the instruction text being present in `skills/build/SKILL.md`.

## Technical Approach

- Locate the `**subagent** (default):` paragraph in `skills/build/SKILL.md` (currently ~line 201) that already composes an explicit instruction string passed to `/superpowers:subagent-driven-development` for model-tier overrides.
- Extend that same explicit-instruction text (or add an adjacent sentence within the same invocation instruction) to also direct: "for every per-task review dispatch, include the relevant excerpt of this spec's own `## Acceptance Criteria` section (read from `{run-dir}/work/{n}-spec.md`) alongside the diff and the task's own brief."
- This is a text addition to an existing invocation-instruction paragraph — no new file, no new pipeline step, no new hook.
- `batched` strategy (`/superpowers:executing-plans`) is out of scope: issue #360 names `subagent-driven-development` specifically, and `executing-plans` already pauses for human review after each batch, giving a human the chance to catch this class of drift that `subagent-driven-development`'s fully-automated path doesn't have.

## Gotchas

- The excerpt must come from the materialized spec (`{run-dir}/work/{n}-spec.md`'s own `## Acceptance Criteria` section) — the point-in-time source `/build` already works from — not re-fetched from the live GitHub issue.
- Keep the excerpt scoped to the relevant Acceptance Criteria bullets, not a full-spec dump — forwarding the entire spec body verbatim defeats the point of per-task focus and bloats every per-task reviewer's context.
- This changes what `/build` tells `/superpowers:subagent-driven-development` to do at invocation time, not the superpowers plugin's own installed skill files — superpowers is a third-party dependency (CLAUDE.md's Stack table) and this repo doesn't vendor or edit its source.
- Verify actual behavior, not just the instruction's presence in `skills/build/SKILL.md` — `subagent-driven-development`'s internal prompt-composition logic isn't owned by this repo and could silently ignore, truncate, or drop a forwarded instruction; the acceptance criterion above requires observing it in a real composed dispatch prompt.

## Original request

subagent-driven-development: per-task review doesn't check parent spec's Acceptance Criteria

**Summary:** Per-task review in subagent-driven-development checks a task's diff against the task's own brief, not against the parent spec's Acceptance Criteria — so a task can pass review while violating the spec it was derived from.

**Kind:** Gap

**Affected component:** superpowers:subagent-driven-development

**Use case:** Building a 6-task implementation plan (evidence-weighted ranking for a data-comparison dashboard), one task's plan text specified a ranking formula that, followed exactly as written, violated the parent spec's own stated Acceptance Criterion — the formula sorted a priority queue by raw count only, letting a low-priority category rank ahead of high-priority ones the spec explicitly required to sort first. The task's implementer followed the plan faithfully. The per-task reviewer checked the diff against the task's own brief and passed it — correctly, since the diff matched the brief exactly. The violation only surfaced at the final whole-branch review, several tasks later, requiring a dedicated fix wave to correct.

Root cause: subagent-driven-development's per-task review step checks a task's diff against that task's own brief text. It has no mechanism to check the diff against the *parent spec's* actual Acceptance Criteria, even when the task brief is itself a (flawed) restatement of one of those criteria. A task can pass its own review while violating the spec it was derived from, and nothing catches this until the final whole-branch review — which exists, and did catch it, but only after N task-review cycles had already reported clean.

Suggested improvement: when a per-task review's dispatch prompt is composed, consider including the relevant excerpt of the parent spec's Acceptance Criteria (not just the task brief) alongside the diff, so a task-level review has a chance to catch a spec-vs-plan discrepancy earlier — rather than relying entirely on the final whole-branch review as the sole backstop for this class of gap.

This is a process observation about the skill's own review-dispatch design, not a bug in a specific version's code — reported as a general improvement suggestion from a private project, not a regression report.

**Plugin version:** 6.78.0

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: sdd-per-task-review-no-parent-ac-check -->
