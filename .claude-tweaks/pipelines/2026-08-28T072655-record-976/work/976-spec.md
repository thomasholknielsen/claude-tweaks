---
record: 976
origin: capture
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 976: IL-141's git-plumbing PreToolUse-gate bypass has no backlog record beyond the narrow #959 symptom fix

Surface: backend

Defer-reason: pre-existing-outside-diff

## Current State

`docs/donts.md`'s new IL-141 rule (added alongside #315) correctly diagnoses a structural gap: `gitTargets()` classifies only `commit`/`push`, and `WRITE_SHAPES` has no `git` entry, so every git-plumbing verb (e.g. `git mv`, `git update-ref`) bypasses E1, `worktree-always`, and the pipeline-shadow guard entirely. Only the narrow symptom this caused (`checkPipelineShadowGuard`'s missing `work/{n}-spec.md` carve-out) got a backlog record (`#959`) — the general bypass mechanism itself (`gitTargets()`/`WRITE_SHAPES` having no git-plumbing coverage at all) has no tracking issue anywhere.

## Deliverables

- Extend `gitTargets()`/`WRITE_SHAPES` (or their equivalent gate-classification logic) to cover git-plumbing verbs generally, not just `commit`/`push`, so E1/`worktree-always`/pipeline-shadow enforcement can't be routed around via plumbing.

## Acceptance Criteria

- A git-plumbing write (e.g. `git mv`, `git update-ref`) inside a worktree-always project triggers the same PreToolUse gates a `commit`/`push` would.

## Technical Approach

Enumerate the git-plumbing verbs that can mutate tracked state or refs outside the `commit`/`push` pair `gitTargets()` already classifies (`mv`, `update-ref`, `rm --cached`, `apply`, `stash` variants that touch tracked files, etc.), and extend `gitTargets()`/`WRITE_SHAPES` (or wherever the gate-classification logic actually lives) with a general git-plumbing category rather than enumerating each verb ad hoc as a one-off carve-out the way `#959` did for the pipeline-shadow guard specifically. Once the general category exists, re-verify `#959`'s narrow fix is still correct or can be simplified/subsumed by the general classification — the two records target the same underlying gap at different granularities and should not diverge on how a git-plumbing write is detected.

### Key Files

- `plugin/bin/lib/hooks/pre-tool-use.js` — `gitTargets()`, `WRITE_SHAPES`, the classification logic to extend
- `docs/donts.md` — IL-141 rule; update if the fix changes what the rule describes as still-open
- `tests/hooks-gate-coverage.test.js` (or equivalent) — new coverage for git-plumbing verbs

## Gotchas

- Coordinate with #959 — that record fixed the narrow symptom (`checkPipelineShadowGuard`'s missing carve-out) that this general gap caused; this record's fix may make #959's carve-out redundant or may need to compose with it, depending on landing order.
- Overly broad plumbing-verb matching risks false-positive gate triggers on legitimate git usage inside a worktree-always project — the enumeration should be evidence-driven (verbs that actually mutate tracked state/refs) rather than pattern-matching every `git` subcommand indiscriminately.
- Deferred as `pre-existing-outside-diff` — this gap predates whatever diff surfaced IL-141 and #959; no urgency tied to a specific in-flight change.

## Original request

IL-141's git-plumbing PreToolUse-gate bypass has no backlog record beyond the narrow #959 symptom fix

**Related:** #959

## Current State

`docs/donts.md`'s new IL-141 rule (added alongside #315) correctly diagnoses a structural gap: `gitTargets()` classifies only `commit`/`push`, and `WRITE_SHAPES` has no `git` entry, so every git-plumbing verb (e.g. `git mv`, `git update-ref`) bypasses E1, `worktree-always`, and the pipeline-shadow guard entirely. Only the narrow symptom this caused (`checkPipelineShadowGuard`'s missing `work/{n}-spec.md` carve-out) got a backlog record (`#959`) — the general bypass mechanism itself (`gitTargets()`/`WRITE_SHAPES` having no git-plumbing coverage at all) has no tracking issue anywhere.

## Deliverables

- Extend `gitTargets()`/`WRITE_SHAPES` (or their equivalent gate-classification logic) to cover git-plumbing verbs generally, not just `commit`/`push`, so E1/`worktree-always`/pipeline-shadow enforcement can't be routed around via plumbing.

## Acceptance Criteria

- A git-plumbing write (e.g. `git mv`, `git update-ref`) inside a worktree-always project triggers the same PreToolUse gates a `commit`/`push` would.

Defer-reason: pre-existing-outside-diff

