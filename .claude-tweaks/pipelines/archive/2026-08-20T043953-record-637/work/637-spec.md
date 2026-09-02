---
record: 637
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 637: hooks.js / auto-decision-log: no CLI writes decisions.md or staged/ items — bookkeeping is hand-rolled `node -e` at every site

Surface: backend

## Current State

Pipeline bookkeeping the plugin defines as a contract — `decisions.md` entries, `staged/*.md` proposals, SDD ledger appends — has no writer CLI. A driving session open-codes `fs.appendFileSync`/`writeFileSync` (typically via `node -e`) against schemas `_shared/auto-decision-log.md` already specifies, at every call site that needs to write one.

In one three-record `/flow` run driven inline, 88 of 455 Bash calls were `node -e` scripts whose only job was appending an `AUTO`/`STAGED` line or writing a staged proposal file in the contract's shape; two of them failed on quoting/loop shape under the worktree-session Bash gate and had to be re-authored mid-run.

`bin/` ships `resolve-policy.js`, `wrap-up-engine.js`, `wrap-up-state.js`, `hooks.js`, `residue.js` — none of them write a decision-log line or a staged-file entry. `bin/hooks.js` already has a comparable precedent to mirror: `record-worktree`, a verb that writes structured per-run state and is allowlisted under the worktree-session Bash gate.

## Deliverables

- Add a `bin/hooks.js record-decision --run <dir> --skill <s> --status AUTO|STAGED|KEPT-PROMPT --reversibility <r> --text "…"` verb, mirroring `record-worktree`'s existing arg-parsing/run-dir-resolution/ownership-check structure, that appends one correctly-formatted line to `<dir>/decisions.md` per the entry schema `_shared/auto-decision-log.md` already specifies.
- Add a `bin/hooks.js stage-item --run <dir> --id <kind>-<n> --file <path>` verb that writes a staged proposal file under `<dir>/staged/`, implementing the Wrap-Up Review Console's item-ID scheme in one place instead of at every call site.
- Update `_shared/auto-decision-log.md` from "write a line matching this schema" to "call this CLI" for both the decision-log entry and the staged-item file.
- Update `flow/multispec-review-console.md`, and any other call site a grep audit turns up (see Technical Approach), from hand-rolled `node -e` fs writes to the two new verbs.

## Acceptance Criteria

- `bin/hooks.js record-decision --run <dir> --skill <s> --status AUTO --reversibility high --text "…"` appends one line to `<dir>/decisions.md` that matches the entry schema in `_shared/auto-decision-log.md`, and the file is appended to, never overwritten, across repeated calls.
- `record-decision` accepts all three statuses (`AUTO`, `STAGED`, `KEPT-PROMPT`) and rejects an unrecognized status rather than silently writing it.
- `bin/hooks.js stage-item --run <dir> --id <kind>-<n> --file <path>` writes the staged proposal file under `<dir>/staged/` using the console's existing item-ID naming convention.
- Both verbs are exempt under the worktree-session Bash gate the same way `record-worktree` already is — calling either from inside a worktree session does not trip the compound-Bash restriction (per the memory note on worktree-session Bash gate shape and `docs/hooks.md`'s allowlist).
- `_shared/auto-decision-log.md` and `flow/multispec-review-console.md` reference the CLI verbs rather than documenting the hand-rolled write shape.
- A `tests/bin-lib/hooks` (or equivalent) suite covers both new verbs: success path, malformed/unrecognized-status rejection, and append-not-overwrite behavior for `decisions.md`.
- `npm test` passes.

## Technical Approach

- Mirror `record-worktree`'s existing verb structure in `bin/hooks.js` / `bin/lib/hooks/` for both new verbs — same CLI-arg parsing, run-dir resolution, and ownership checks documented in `docs/hooks.md`.
- Before writing a new entry-formatter, grep the current hand-rolled call sites (`flow/multispec-review-console.md` and any sibling skill file using the same `node -e` append pattern) for the exact line-formatting logic already in use, and reuse it rather than inventing a second version of the schema.
- Grep-audit `skills/**` and `bin/**` for the hand-rolled pattern (`fs.appendFileSync`/`fs.writeFileSync` against `decisions.md` or a `staged/` path) to find every call site needing migration — the issue names `flow/multispec-review-console.md` as one instance, not necessarily the only one.

## Gotchas

- The worktree-session Bash gate refuses compound Bash (heredocs, `node -e` loops) by text shape. The whole point of these verbs is to be the one allowlisted write path, so their own invocation must be a single flat command — not something that itself needs heredoc/loop composition to call.
- Schema drift is exactly what this record aims to prevent — implement the `decisions.md` entry format and the staged-item ID scheme once, sourced from `_shared/auto-decision-log.md`'s existing description, not duplicated a third time across `bin/lib` code and two doc files.

## Original request

hooks.js / auto-decision-log: no CLI writes decisions.md or staged/ items — bookkeeping is hand-rolled `node -e` at every site

**Summary:** Pipeline bookkeeping the plugin defines as a contract (`decisions.md` entries, `staged/*.md` proposals, SDD ledger appends) has no writer CLI, so a driving session open-codes `fs.appendFileSync`/`writeFileSync` against schemas `_shared/auto-decision-log.md` already specifies.

**Kind:** Gap

**Affected component:** `bin/hooks.js` (no `record-decision`/`stage-item` verbs); `_shared/auto-decision-log.md`; `flow/multispec-review-console.md`

**Objective:** Automation efficiency

**Use case:** In one three-record `/flow` run driven inline, 88 of 455 Bash calls were `node -e` scripts whose only job was appending an `AUTO`/`STAGED` line or writing a staged proposal file in the contract's shape; two of them failed on quoting/loop shape under the worktree-session Bash gate and had to be re-authored. `bin/` ships `resolve-policy.js`, `wrap-up-engine.js`, `wrap-up-state.js`, `hooks.js`, `residue.js` — no decision-log or staged-file writer.

**Proposed fix:** Add `bin/hooks.js record-decision --run <dir> --skill <s> --status AUTO|STAGED|KEPT-PROMPT --reversibility <r> --text "…"` (mirroring `record-worktree`) and `stage-item --run <dir> --id <kind>-<n> --file <path>`, implementing the entry schema and the console's item-ID scheme once; then change `auto-decision-log.md` and the console files from "write a line matching this schema" to "call this CLI", so schema drift is impossible and the worktree gate has one allowlisted write path.

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).
<!-- fingerprint: feedback-9d43aa8b -->
