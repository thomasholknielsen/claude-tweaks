# Tidy — Action Execution (`work-backend: local-files`)

The three actions whose execution diverges by backend, for the `local-files` driver;
`actions-github-issues.md` is its twin (and additionally owns `Sync to GitHub` and
`Open family gate`, neither of which has a counterpart here — `family-gate` findings are
`work-backend: github-issues`-only by construction, `_shared/github-pr-scan.md`'s own scope).

**That absence is an uncovered population, not just a missing action.** Under
`work-backend: local-files` there is no `family-gate` sweep at all, so the only thing that ever
gates a decomposition family is `/claude-tweaks:wrap-up` closing its last leaf
(`wrap-up/verification-brief.md`'s Family-Gate Procedure, which does support this driver). A
local-files family whose last leaf closes any other way — by hand, or by a run that ended before
wrap-up — is never gated by anything, and nothing will surface it later. Neither acceptance
backstop reaches it: `family-gate` and `acceptance-gap` are both `_shared/github-pr-scan.md`
scopes reading GitHub issues, and Step 1's local-record shapes include no acceptance shape at
all. The parent simply sits open with no `acceptance:` facet, indefinitely. Say so if a user asks
why a completed local-files family shows no acceptance state; do not imply a sweep will pick it
up.

Everything else stays inline in `SKILL.md`'s Action Vocabulary table. Each action is atomic —
complete all its steps or none.

## Delete

Remove the record file (`specs/{id}-{slug}.md`).

## Defer

`writeRecord` (`bin/lib/issues/local-store.js`) with `facets.stage: 'parked'` (supersedes any other stage value — the two are mutually exclusive) and the trigger appended to the body as a `**Trigger:** {condition}` line (plus `**Watched paths:** {paths}` when the trigger names files) — same file, updated in place, compose-then-write-once.

## Absorb

Continuing from the shared step (1) in `SKILL.md`'s table: (2) update the target record's file in place, (3) delete the absorbed record's file.
