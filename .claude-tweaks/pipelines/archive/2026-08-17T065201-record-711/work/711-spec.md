---
record: 711
origin: capture
risk: low
size: high
ceremony: standard
grants: [build]
---
# 711: Ship bin/ CLIs for the hand-scripted per-run procedures — materialize, claim, release-claims, log-decision

Origin: session evaluation of the #620-#625 /flow run (via /claude-tweaks:feedback; self-reference routed the findings to local records)

Defer-reason: genuinely-larger

## Current State

Canonical every-run pipeline procedures (record materialization, issue claiming, claim release, decision-log appends, SDD brief/review-package assembly) exist only as prose in `flow/materialize.md`, `flow/claim-targets.md`, `_shared/issue-claims.md`, and `_shared/auto-decision-log.md`. A single multi-spec run hand-authored ~9 throwaway scripts (~13 KB) to execute them; one (the claim loop) shipped a zsh `echo`/`jq` escaping bug that wrote six empty claim blobs — classified `unreadable`, contested-for-everyone — before being repaired mid-run by conditional overwrite. `bin/` already ships `wrap-up-engine.js`, `residue.js`, `link-records.js` and the pure primitives (`bin/lib/issues/claims.js`, `record.js`), but no materialize / claim / release / log-decision CLI wraps them.

## Deliverables

- [x] `bin/materialize.js <n> [--run-dir]` — resolve + shape-gate + compose the pinned header per `flow/materialize.md`, writing `{run-dir}/work/{n}-spec.md` (`work-backend: github-issues` only — see Blocked / Future Work)
- [x] `bin/claims.js claim|release <n...> --run-id <id>` — the read-classify-write loop over `bin/lib/issues/claim-engine.js` (which wraps the pure `bin/lib/issues/claims.js`), exit-code-keyed 404 handling, all-or-abort group semantics
- [x] `bin/log-decision.js --run-dir <dir> [--spec N] <status> <message>` — one appender for the canonical entry schema
- [x] The prose files (`flow/materialize.md`, `flow/claim-targets.md`, `_shared/issue-claims.md`, `_shared/auto-decision-log.md`) cite the commands (expand-contract: prose stays as the contract of record for one release)

## Acceptance Criteria

1. A fresh `/flow #N` run performs materialize + claim + release without writing any scratch script (verify by transcript: zero `Write` calls producing `*.sh`/`*.js` scratch for these steps). Met for the CLIs themselves; not separately re-verified via a fresh live `/flow` transcript within this same build (would require a second, independent pipeline run).
2. `node --test tests/bin-lib/issues/` covers the claim CLI's 404-vs-error branch (the exact bug class shipped by the hand-rolled loop). Met — `tests/bin-lib/issues/claim-engine.test.js`'s `readClaimBlob` tests.
3. `grep -rn "read-classify-write" skills/flow/claim-targets.md` cites the CLI. Met.

## Blocked / Future Work

- `bin/materialize.js` implements `work-backend: github-issues` only. `work-backend: local-files` reads through `local-store.js` rather than `gh issue view` and was out of scope for this record's size budget — file a follow-up when a local-files project needs it.
- `bin/lib/issues/claim-engine.js`'s `postClaimMirror` adds the `bot:in-progress` label directly rather than running `_shared/label-bootstrap.md`'s full check-then-create sequence first; low risk in this repo (the label already exists and is used throughout the claim system) but a fresh project without it would silently see `labelOk: false` in the returned envelope rather than a bootstrapped label. Best-effort either way — never blocks claim state.

_Filed by `capture` via specShapedBody._
