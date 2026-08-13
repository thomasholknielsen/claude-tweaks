# 0005. Durable cross-firing state on a dedicated git branch

- **Status:** accepted
- **Date:** 2026-07-13
- **Context:** GitHub issues #7, #8 (the design doc originally cited here no longer exists in the repository)

## Context

`code-health`, `harness-health`, and `journey-health` each need rotation cursors, a filing
retry queue, and (code-health only) a sub-threshold "remembered" cache to survive between
scheduled cloud-routine (CCR) firings. Local gitignored disk (`.claude-tweaks/{skill}/*.json`)
does not survive a CCR firing's container recycling, so this state needed a home outside the
per-firing container — and any candidate had to support concurrent writers (three skills'
routines can fire close together) without an existing database or external service.

## Decision

Store this state on a dedicated `health-state` git branch, created once and never merged into
`main` or any other branch. Reads use plain `git fetch` + `git show`; writes build a new commit
via the GitHub Data API (blob → tree → commit) and update the ref with `force: false` —
GitHub's fast-forward-only ref update rejects the write if another firing moved the branch
first, giving compare-and-swap for free with no extra parameter.

## Alternatives considered

- **A GitHub-issue-body JSON blob** — one API call per read/write, simplest to implement, but
  no atomic compare-and-swap (last-write-wins under concurrent firings) and no free audit
  trail of state changes over time.
- **A bare ref, matching `refs/claims/issue-<N>`'s pattern** (`refs/health-state/...` instead of
  `refs/heads/health-state`) — stays out of `git branch -a`/the GitHub branch-list UI, matching
  `issue-claims.md`'s explicit rationale for avoiding `refs/heads/`. Rejected in favor of a real
  branch specifically to keep `git log`/`git show` as a free, human-inspectable history of every
  state change — a bare ref only exposes the latest snapshot, not how it evolved.

## Consequences

Makes durable, atomic, low-friction cross-firing state cheap to add per skill (`createDurableState(skillName, opts)`), and the branch's own commit history is a free audit trail with no separate logging mechanism. Makes it harder to inspect state without git tooling (no web UI shows it directly, unlike an issue body), and the branch will accumulate one commit per firing per skill indefinitely unless something eventually compacts it — run-history inside the branch is already capped at 90 records per skill, but the branch's own commit count is not. Revisit if commit volume on `health-state` ever becomes operationally relevant (e.g., slow fetches), or if a project needs to inspect this state without git access.
