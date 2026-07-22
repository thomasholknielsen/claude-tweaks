---
record: 42
origin: capture
risk: low
effort: low
ceremony: fast-lane
grants: [build, merge]
surface: infra
---
# 42: Add .claude-tweaks/code-health/ to .gitignore

Surface: infra

## Current State

- `.gitignore` has entries for the `.claude-tweaks/research/` and `.claude-tweaks/recon/` sibling directories but is missing an entry for `.claude-tweaks/code-health/`.
- `.claude-tweaks/code-health/cache.json` — the durable local-only cache file `bin/lib/code-health/cache.js` writes (canonical path documented in that file's header comment) — is currently untracked (`git status --porcelain` shows `?? .claude-tweaks/code-health/`).
- `skills/init/bootstrap-steps.md` already documents `.claude-tweaks/code-health/` as one of the canonical split gitignore entries `/init` should add — the repo's actual `.gitignore` hasn't caught up to that documented convention yet.
- `skills/_shared/auto-mode-contract.md` confirms the design intent: each health skill's own local `cache.json` is meant to stay gitignored, with durable cursor/run-history state living on the separate `health-state` git branch instead (`_shared/health-state.md`) — nothing under `.claude-tweaks/code-health/` is meant to be committed.

## Deliverables

- [ ] Add a `.claude-tweaks/code-health/` entry to `.gitignore`, following the same directory pattern already used for the `.claude-tweaks/research/` and `.claude-tweaks/recon/` sibling entries (a bare `path/` line, not a wildcard glob).
- [ ] Confirm `.claude-tweaks/code-health/cache.json` (and any other file created inside that directory) no longer shows as untracked.

## Acceptance Criteria

1. `.gitignore` contains a line matching `.claude-tweaks/code-health/`.
2. `git status --porcelain -- .claude-tweaks/` no longer lists `.claude-tweaks/code-health/` (or any file inside it) as untracked (`??`).
3. `git check-ignore -v .claude-tweaks/code-health/cache.json` reports a match against the new `.gitignore` line.

## Technical Approach

Single-line addition to `.gitignore`, placed alongside the existing `.claude-tweaks/research/` / `.claude-tweaks/recon/` entries (same directory, same pattern shape) rather than as a new standalone blanket `.claude-tweaks/` rule.

### Key Files

- `.gitignore` — add `.claude-tweaks/code-health/`

## Gotchas

- Per this repo's own CLAUDE.md Don'ts section: never fold this into a blanket `.claude-tweaks/` ignore rule — git's `!` negation can't reliably re-include a subdirectory of an already-ignored parent, and this project deliberately keeps `.claude-tweaks/routines/{name}.yml` committable. Add the split entry; don't collapse the split.
- Scope is intentionally narrow to `.claude-tweaks/code-health/` only, matching the record's own title/scope. `.claude-tweaks/harness-health/`, `.claude-tweaks/journey-health/`, and `.claude-tweaks/docs-health/` have the identical local-only-cache shape (per `skills/_shared/auto-mode-contract.md`) and are also currently missing from `.gitignore`, but adding those is out of scope here — file separately if desired.
- `.claude-tweaks/code-health/cache.json` was never committed, so adding the `.gitignore` entry alone is sufficient — no `git rm --cached` step is needed.

## Original request

Add .claude-tweaks/code-health/ to .gitignore

**Related:** none

Context: the durable code-health cache dir (cache.json) is untracked, unlike its .claude-tweaks/research/ and .claude-tweaks/recon/ siblings which already have entries.

Scope: one-line .gitignore addition.
