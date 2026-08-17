---
record: 686
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 686: capture: Ship release-claim and log-decision CLI wrappers to replace manual gh/node sequences

Surface: backend

## Current State

- Claim release is a hand-sequenced procedure at `skills/wrap-up/cleanup-procedures.md` Section E step 4: `node -e` calling `releasePayload` (`bin/lib/issues/claims.js`) to write a tombstone file + comment body, then `gh api --method PUT repos/{owner}/{repo}/contents/claims/issue-{N}.json`, then `gh issue comment`, then grant/label removal (`gh issue edit --remove-label`). One run repeated that 4-step sequence per issue — 28 Bash calls across 5 issues.
- `bin/lib/reconcile/release-merged.js` already composes the same release in Node for the reconciler's merged-record path (`releasePayload` + contents-API write) — the logic exists; only the wrap-up / multispec-teardown / dispatch call sites shell it by hand.
- Auto-decision-log appends (`_shared/auto-decision-log.md`'s entry schema, written to `{run-dir}/decisions.md`) are composed ad hoc at every AUTO/STAGED site; runs write throwaway scratch `.js` helpers to do it. #637 records the same gap from the decisions.md/staged side.
- **Related:** #637 (no CLI writes decisions.md/staged — overlaps this record's log-decision half; build `log-decision.js` as the decisions.md half of that ask), #671 (auto-decision-log schema drift the CLI must not perpetuate), #649.

## Deliverables

1. `bin/release-claim.js <issue> --run <run-dir> --reason <reason> [--link <url>] [--remove-grants]` — one command performing Section E's steps 3–5: read the current blob sha, ownership check (never delete a successor's claim — skip with the `AUTO — skipped release…` line), `releasePayload` → tombstone PUT with sha, release comment; `--remove-grants` strips `auto:build`/`auto:merge`. Exit codes distinguish released / already-released-or-swept (the 404/422 path still posts the comment) / skipped-not-owner / failed. Reuse `bin/lib/issues/claims.js` and share the write path with `bin/lib/reconcile/release-merged.js` rather than adding a third implementation.
2. `bin/log-decision.js --run <run-dir> --spec <n> --status AUTO|STAGED --text "..." [--reversibility <v>]` — appends one entry in `_shared/auto-decision-log.md`'s canonical schema to `{run-dir}/decisions.md` (creating the file when absent); refuses a run dir that does not resolve under the anchored `$RUN_ROOT` (`_shared/pipeline-run-dir.md`).
3. Both follow the `gh-api-module-pattern` (injectable runner, `bin/lib/{name}/` module + thin CLI), with `tests/bin-lib/` suites covering the happy path, the 404/422 already-released path, the ownership skip, and log-line formatting.
4. Cite the CLIs from every site that currently prose-describes the sequence: `wrap-up/cleanup-procedures.md` Section E, `flow/multispec-review-console.md` Shared teardown step 3, `dispatch/SKILL.md` / `dispatch/settle-and-merge.md` release paths, and the AUTO/STAGED sites in `_shared/auto-decision-log.md`'s consumer list — replacing the inline `node -e` + `gh api` blocks, not adding beside them.
5. `docs/plugin-structure.md` CLI table entries for both.

## Acceptance Criteria

- `node bin/release-claim.js 999 --run <dir> --reason "merged: spec 999"` against a fake runner performs exactly: blob read → tombstone PUT (carrying the read sha) → comment; with `--remove-grants` also two label removals; the test asserts call order and payloads.
- A 404/422 on the PUT still posts the comment and exits with the documented already-released code; a blob owned by another run id exits with the skip code and writes nothing.
- `node bin/log-decision.js --run <dir> --spec 12 --status AUTO --text "x"` appends a line the schema in `_shared/auto-decision-log.md` accepts (test parses it back); a `--run` inside a linked-worktree path is rejected non-zero.
- `grep -rn "releasePayload" skills/` returns only `_shared/issue-claims.md` (marker-shape doc) and `tidy/scan-procedures.md` — every wrap-up/flow/dispatch procedure invokes `bin/release-claim.js` instead.
- `npm test` green; new suites under `tests/bin-lib/release-claim/` and `tests/bin-lib/log-decision/`.

## Technical Approach

Extract Section E's node+gh sequence into a module (`bin/lib/claims/release.js`, or extend `bin/lib/issues/claims.js`) with an injectable `runGh`; have `release-merged.js` and the new CLI both call it. `log-decision.js` is a formatter + append; keep it dependency-free. Follow the injectable-runner conventions in the `gh-api-module-pattern` skill.

## Gotchas

- gh-absent (MCP transport) sites: the CLI wraps `gh`; `_shared/github-write-transport.md`'s MCP path stays the documented fallback — say so in the citing prose rather than growing an MCP mode into the CLI.
- Don't restate the release procedure in each caller; cite the CLI once and let Section E stay canonical.
- #637 asks for a decisions.md/staged writer — build `log-decision.js` as the decisions.md half of that ask and cross-reference #637 rather than duplicating.
- `${CLAUDE_PLUGIN_ROOT}` isn't reliably set in Bash tool calls (#170) — cite the invocation the same way `close-run` is cited today.

## Original request

capture: Ship release-claim and log-decision CLI wrappers to replace manual gh/node sequences

**Related:** none

Context: Claim-release took 28 manual Bash calls across 5 issues in one run (repeating a 4-step gh+node sequence per issue); auto-decision-log appends and other run-dir procedures are similarly hand-sequenced with throwaway scratchpad .js helpers.

Scope: Add `bin/release-claim.js <issue> --run <dir> --reason <r>` wrapping `releasePayload` + the contents-API PUT + comment + label removal, and `bin/log-decision.js --run <dir> --spec <n> --status AUTO|STAGED --text "..."`; cite both from the skills that currently prose-describe the procedure.
