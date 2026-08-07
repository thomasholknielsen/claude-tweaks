# Tidy — Action Execution (`work-backend: local-files`)

The three actions whose execution diverges by backend, for the `local-files` driver;
`actions-github-issues.md` is its twin (and additionally owns `Sync to GitHub` and
`Open family gate`, neither of which has a counterpart here — `family-gate` findings are
`work-backend: github-issues`-only by construction, `_shared/github-pr-scan.md`'s own scope).
Everything else stays inline in `SKILL.md`'s Action Vocabulary table. Each action is atomic —
complete all its steps or none.

## Delete

Remove the record file (`specs/{id}-{slug}.md`).

## Defer

`writeRecord` (`bin/lib/issues/local-store.js`) with `facets.stage: 'parked'` (supersedes any other stage value — the two are mutually exclusive) and the trigger appended to the body as a `**Trigger:** {condition}` line (plus `**Watched paths:** {paths}` when the trigger names files) — same file, updated in place, compose-then-write-once.

## Absorb

Continuing from the shared step (1) in `SKILL.md`'s table: (2) update the target record's file in place, (3) delete the absorbed record's file.
