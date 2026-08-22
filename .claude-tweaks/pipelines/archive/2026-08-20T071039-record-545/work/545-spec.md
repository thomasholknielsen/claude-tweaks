---
record: 545
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 545: dispatch: local-merge resume confirmation lacks a literal question-string template

Surface: backend

## Current State

`skills/dispatch/SKILL.md`'s "Confirm before resuming" gate (around line 224-229) spells out the literal `AskUserQuestion` question-string template for the `pr-first` case:

- `question`: `"Resume {target} toward merge? PR #{number} ({url}), CI: {status}, files changed: {count-or-list}. Declining leaves the run parked."`, `header`: `"Resume run"`, `multiSelect`: `false`
- Option 1 — `label`: `"Resume (Recommended)"`, `description`: `"Re-invoke the resume command below — re-enters the Review Console for final approval"`
- Option 2 — `label`: `"Cancel"`, `description`: `"Leave the run parked; do nothing"`

Immediately after, the same paragraph describes the `integration-model: local-merge` substitution only in prose: "substitute the branch name and worktree path for the PR reference, `git -C {worktree} diff --stat {integration-branch}...HEAD` for files changed, and CI status reads `not applicable — local-merge`." There is no literal alternate question string for an agent to fill in for the local-merge case — it has to compose one from that prose description each time, which is exactly the gap #531's review flagged when it delivered the pr-first template. No existing `node --test` prose-conformance fixture pins this paragraph's exact text (checked: no match in `tests/` for "Confirm before resuming", "Resume run", or "Resume {target}").

## Deliverables

- In `skills/dispatch/SKILL.md`'s "Confirm before resuming" section, add a second literal `AskUserQuestion` question-string template for `integration-model: local-merge`, immediately alongside the existing pr-first template (replacing the prose-only substitution instruction, or keeping it as a short cross-reference — see Acceptance Criteria).
- The local-merge template's question string substitutes `Branch {branch} ({worktree})` for `PR #{number} ({url})`, keeps `files changed: {count-or-list}` sourced from `git -C {worktree} diff --stat {integration-branch}...HEAD` per the existing prose, and reads `CI: not applicable — local-merge` in place of `CI: {status}`.
- `header`, `multiSelect`, and both Option labels/descriptions (`Resume (Recommended)` / `Cancel`) stay byte-identical to the pr-first template — only the question string's PR-specific fields change.

## Acceptance Criteria

- `skills/dispatch/SKILL.md`'s "Confirm before resuming" gate contains a literal, copy-pasteable `AskUserQuestion` question-string template for `integration-model: local-merge`, in the same `question`/`header`/`multiSelect`/Option-1/Option-2 shape as the existing pr-first template.
- The local-merge template's question string reads `"Resume {target} toward merge? Branch {branch} ({worktree}), CI: not applicable — local-merge, files changed: {count-or-list}. Declining leaves the run parked."` — the same sentence shape as the pr-first version with only the PR-specific clause substituted.
- The prose-only substitution instruction for local-merge is either replaced by the literal template or reduced to a short cross-reference to it — not left duplicated as a separate, divergent set of instructions alongside the new literal template.
- No behavioral change to the pr-first template, the freshness probe (`_shared/run-resume-freshness.md`), or the re-adoption mechanism in the same section of `skills/dispatch/SKILL.md`.

## Technical Approach

Edit `skills/dispatch/SKILL.md`'s "Confirm before resuming" paragraph (currently around line 224-229). Insert the literal local-merge template as its own bullet or sub-paragraph immediately after the pr-first template, mirroring its `question`/`header`/`multiSelect`/Option 1/Option 2 structure exactly, substituting only the PR-specific fields per the paragraph's existing prose ("substitute the branch name and worktree path for the PR reference... CI status reads `not applicable — local-merge`"). This is a prose-only skill-file edit — no code changes, no new call sites.

## Gotchas

- Keep the two templates' shared fields (`header: "Resume run"`, `multiSelect: false`, both Option labels/descriptions) byte-identical between the pr-first and local-merge versions — the point of this fix is a literal template to fill in, not a second, subtly different confirmation flow.
- `_shared/pr-first-merge.md`'s Step 2.5 CI-status resume rule (green/red/pending handling) is pr-first-only; the local-merge template's `CI: not applicable — local-merge` is fixed text, not a variable that rule resolves — don't wire it through that rule.
- If a future prose-conformance test is added for this paragraph, its fixture must cover both templates, not just the pr-first one that exists today.

## Original request

dispatch: local-merge resume confirmation lacks a literal question-string template

**Related:** #531

Context: #531's final review found that skills/dispatch/SKILL.md's "Confirm before resuming" gate spells out the literal AskUserQuestion question string for the pr-first case, but only describes the local-merge substitution in prose ("substitute the branch name and worktree path for the PR reference") rather than giving the literal alternate template.

Scope: Add the literal alternate question-string template for integration-model: local-merge, mirroring the pr-first version, so an agent fills a template rather than composing one from prose.

