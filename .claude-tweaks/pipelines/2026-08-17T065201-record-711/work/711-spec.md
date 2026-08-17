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

- [ ] `bin/materialize.js <n> [--run-dir]` — resolve + shape-gate + compose the pinned header per `flow/materialize.md`, writing `{run-dir}/work/{n}-spec.md`
- [ ] `bin/claims.js claim|release <n...> --run-id <id>` — the read-classify-write loop over `bin/lib/issues/claims.js`, exit-code-keyed 404 handling, all-or-abort group semantics
- [ ] `bin/log-decision.js --run-dir <dir> [--spec N] <status> <message>` — one appender for the canonical entry schema
- [ ] The three prose files cite the commands instead of describing the algorithms (expand-contract: prose stays as the contract of record for one release)

## Acceptance Criteria

1. A fresh `/flow #N` run performs materialize + claim + release without writing any scratch script (verify by transcript: zero `Write` calls producing `*.sh`/`*.js` scratch for these steps).
2. `node --test tests/bin-lib/issues/` covers the claim CLI's 404-vs-error branch (the exact bug class shipped by the hand-rolled loop).
3. `grep -rn "read-classify-write" skills/flow/claim-targets.md` cites the CLI.

_Filed by `capture` via specShapedBody._
