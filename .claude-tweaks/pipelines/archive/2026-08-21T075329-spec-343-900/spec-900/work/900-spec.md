---
record: 900
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
fingerprint: wrapup-objective-audit-fixes:wrap-up-verify-verb-mechanizes-the-verify-execution-closure
surface: terminal
---
# 900: wrap-up: verify verb mechanizes the Verify-execution closure checklist

Surface: terminal

## Overview

Wrap-up's closure gate — `execution-and-verification.md`'s "Verify execution" section — is ~9 hand-run prose checks (`ls` globs, `git log --grep`, `gh issue view`, memory-file existence probes). Whether they actually run depends on model discipline, and the narrate-vs-execute gap is an observed failure mode in this project. The wrap-up architecture's own stated lesson ("seven hand-maintained formats drifting — render owns the format") applies to verification too: this record adds a `verify` verb to `bin/wrap-up-engine.js` that runs every deterministically-checkable closure check and prints a pass/fail/skip table, making the closure line evidence-backed by construction. The prose checklist is replaced by "run the verb, insert its table verbatim, stop on non-zero exit."

**Complexity:** Medium
**Estimated tasks:** 6-8

## Non-Goals

- No change to *what* is verified — the check set is the existing checklist's, mechanized, not expanded.
- No console or approval-flow changes; the verb runs after execution, before the closure line.
- No automatic remediation — the verb reports; the model/human fixes.
- No verification of outside-repo state beyond what an expectations file explicitly records (see Technical Approach).

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #343 | Fix execution-and-verification.md's circular gate on reading verification-brief.md | bot-in-progress (fast-lane, auto:merge) — same file; re-check its state and re-merge origin/main before building |

## Current State

- `plugin/skills/wrap-up/execution-and-verification.md` — "### Verify execution" holds the prose checklist: plans+ledger removed, design caches deleted, run dir archived, worktree removed, carrier commit landed, memory updates landed, upstream feedback filed, reference repairs landed (`Initiative-Fix:` trailer scoping), acceptance labeling landed (the long per-backend/parent branch). Ends with "If any approved action did not land, do NOT emit the closure line … `BLOCKED — cleanup step {N} did not complete: {reason}`".
- `plugin/bin/wrap-up-engine.js` — verb dispatch at the bottom (`plan` / `record` / `render`, exit-code contract: 0 success, 1 bad payload, 2 malformed invocation or `render --strict` with missing rows). New verbs slot in beside these.
- `plugin/bin/lib/wrap-up/` — flat sibling module directory (`engine-plan.js`, `engine-record.js`, `engine-render.js`, `facts.js`, `state.js`, …). A new `engine-verify.js` follows the same shape.
- `bin/lib/wrap-up/state.js` / `engine-state.json` — run-dir state the verb can read for what was staged/applied.
- Tests: `tests/bin-lib/{module}/` suites are picked up automatically by `npm test`'s recursive glob.

## Architecture alignment (post-build note)

Three deviations from this spec's literal wording, both classified during Common Step 4.5 and
applied as spec updates (auto mode, reversibility high — editing this already-archival-bound
materialized copy):

1. **"Update the spec" — `plans-ledger`/`design-caches` are not glob checks.** This spec's
   Deliverables item 1 called them `(glob)`. Task 2's readdirSync + slug-match implementation
   (matching the run's spec-slug against plan/cache filenames) shipped as specified, but the
   whole-branch review found it vacuous by construction — plan files are named from unrelated
   *topic* slugs (`/superpowers:writing-plans`), never the run's *spec* slug, so the match
   essentially never fires. The fix round replaced slug-matching with `git status --porcelain`
   untracked-file detection plus a direct `.superpowers/sdd/` scan. The spec's assumption (a glob
   match against the run's own slug reliably identifies leftovers) was wrong; reality is correct.
2. **"Update the spec" — `carrier-commit` needs a pr-first PR-body fallback the spec never
   named.** Deliverables item 1 specified only a branch-log `git log --grep` check. Under this
   project's own default `worktree`/`pr-first` mode, `execution-and-verification.md` already
   states there is deliberately no `Fixes #{n}` commit on the branch — the draft PR body carries
   it instead. The spec's Gotchas section flagged re-reading that same file fresh before Task 1,
   but its own Deliverables text for this specific check didn't carry the nuance forward. Fixed:
   `carrier-commit` now falls back to `gh pr view --json body` when the branch log has nothing and
   a PR number resolves.
3. **Beneficial — multi-spec `spec-{N}/` subdirectory resolution, not scoped by the spec.** The
   spec's Technical Approach didn't address `/flow` multi-spec runs exporting a per-spec
   subdirectory as `$PIPELINE_RUN_DIR`, distinct from the parent run's own id (which the
   worktree/branch and archived-copy naming both key off). Added `specSlugFromRunDir`/
   `archiveRelativeId` to resolve correctly in both shapes — an extension beyond the spec's
   literal scope, kept as-built.

Two smaller, real gaps against the spec's stated Data/API Surface were found too late in the
review cycle to fix without expanding this already-large fix round past CLAUDE.md's
`genuinely-larger` deferral criterion — filed as backlog records rather than silently dropped:
[#1222](https://github.com/thomasholknielsen/claude-tweaks/issues/1222) (`plans-ledger`/
`design-caches` read the main-checkout `repoRoot`, so are structurally blind to worktree-local
leftovers under the project's own default `pr-first` mode) and
[#1223](https://github.com/thomasholknielsen/claude-tweaks/issues/1223) (the expectations file's
`issues` key, named in this spec's Data/API Surface, is never actually populated).

## Deliverables

- [x] `wrap-up-engine.js verify --run-dir <dir> --base <ref>` prints one row per check — `pass` / `fail` / `skip (reason)` / `unknown (reason)` — table first, then exits **3** on any `fail` and 0 otherwise (`pass`/`skip`/`unknown` rows never change the exit code — `unknown` renders visibly but does not block, matching the current checklist where a check that cannot run is surfaced, not treated as a failed action). Exit 3 is a **new** code: 1 (bad payload) and 2 (malformed invocation / `render --strict` holes) keep their existing meanings, so a caller can distinguish "you called it wrong" from "a closure check failed." Checks: plans+ledger removal (glob), design caches (glob), run-dir archived (old path gone, archive path present, `work/` tracked at new path via `git ls-files`), worktree removed (`git worktree list` parse), carrier commit (`git log --grep "Fixes #{n}"` over `{base}..HEAD` per resolved issue), reference-repair commit scoping (`Initiative-Fix:` trailer commit in `{base}..HEAD`, diff touches only the files named by `engine-state.json`'s applied reference findings). `--base` is consumed by exactly those last two checks; the caller passes the same `{base}` `summary-template.md`'s ladder already resolved for this run. `--run-dir` accepts the run's original path and, when it no longer exists (the normal case — archival precedes verification), resolves `archive/{basename}` under the same pipelines root; the expectations file travels with the archive. Resolved-issue numbers come from the archived `work/*-spec.md` headers' `record:` fields, falling back to the expectations file's `issues` key for current-branch runs with no materialized header.
- [x] Checks needing `gh` (acceptance labeling: `demo:pending` present, brief/pointer comment present per the existing per-backend branch) run when `gh` resolves — probe via the injectable runner's PATH lookup, the same seam the `plugin/bin/lib/` gh modules use — and render `unknown (gh absent)` otherwise, never a silent pass. The verb is deliberately gh-CLI-only: in a gh-absent environment the rows stay `unknown` and any MCP-path manual verification remains the skill prose's affair, outside this verb's scope (stated in the module header).
- [x] Checks whose expected values live outside git/fs (memory-file path + index line, upstream issue URLs) read a small expectations JSON (`{run-dir}/verify-expectations.json`, versioned shape) that the console **always** writes at resolution time — including an empty one (`{"version":1,"memory":[],"upstream":[]}`) when nothing resolved to apply/file. Semantics are therefore asymmetric by design: a key present but empty → `skip (nothing recorded)`; the **file absent entirely** → `unknown (expectations file missing)` on every expectations-dependent row, because the console's write step itself failed — folding that into `skip` would hide exactly the class of silent non-execution this record exists to catch. An unrecognized `version` value renders `unknown (expectations version {v} unsupported)` on those rows; unknown keys within a recognized version are ignored.
- [x] `execution-and-verification.md`'s "Verify execution" section rewritten to: write the expectations file at console resolution (one sentence in the M#/U# resolution bullets, plus the `deferred` list below), run the verb, insert its table verbatim, and on exit 3 emit `BLOCKED — {failing check row}` and stop; `unknown` rows are quoted in the closure line but do not block. The prose checklist is deleted — no duplicated copy survives.
- [x] The parent-brief nuance ("any comment on the parent, never only the most recent — a correctly gated parent routinely has some other comment last") is preserved as a code comment in `engine-verify.js` beside the parent-branch check — the prose that carried this previously-regressed rationale is being deleted, so the comment is its new home.
- [x] Tests: green run over a fixture run-dir; one failing fixture per check class; gh-absent degradation; expectations-file absent / present / empty / unsupported-version; deferred-set rows.

## Acceptance Criteria

1. Against a fixture run-dir with one approved action unexecuted (e.g. run dir not archived), the verb exits 3 and its table's failing row names that check; after fixing the fixture it exits 0.
2. With `gh` absent from PATH (test stubs the injectable runner's lookup), acceptance-labeling rows render `unknown (gh absent)` and the exit code reflects only the checks that ran.
3. The rewritten Verify execution section contains no imperative check commands at all — its content is exactly: the expectations-write instruction, the verb invocation, the verbatim-table rule, and the exit-3 `BLOCKED` rule. Verified two ways: `grep -n "git log --grep\|gh issue view\|ls docs/" plugin/skills/wrap-up/execution-and-verification.md` returns no hits inside the section, and the section's pin test asserts that four-part shape (substring absence alone is not the proof — a paraphrased hand-run instruction must also fail the shape pin).
4. `npm test` green.

## Technical Approach

New `bin/lib/wrap-up/engine-verify.js` module + a `verify` branch in `wrap-up-engine.js`'s dispatch. Each check is a small pure function taking `{runDir, base, expectations, exec}` with an injectable runner for `git`/`gh` calls (the same injectable-runner seam `plugin/bin/lib/` gh modules use — makes gh-absent and failure cases testable without a network). The table renderer reuses the plain four-column style of the engine's other renders. Exit-code contract: reuse 2 for "verification failed" (consistent with `render --strict`'s missing-rows exception, which the prose already treats as visible-and-fatal).

### Data / API Surface

`verify-expectations.json` shape (v1): `{ "version": 1, "memory": [{ "file": "<abs path>", "indexFile": "<abs path>" }], "upstream": [{ "url": "<issue url>" }], "issues": [<n>, ...], "deferred": ["design-caches" | "worktree" | "ephemeral-server" | "claim-release" | "run-dir-archival", ...] }`. `memory`/`upstream` written by the console's M#/U# resolution steps; `issues` only when no materialized header exists (current-branch runs); `deferred` written by the skill when `MULTISPEC_REVIEW_DEFER=1` — the verb reads **only this persisted file**, never the env var, so fixtures fully determine behavior; rows for deferred items render `skip (deferred to parent console)`. Always written, even when empty (see Deliverables). Read only by the verify verb. Unknown keys ignored (store-named-fields discipline, never spread).

### Key Files

- `plugin/bin/wrap-up-engine.js` — dispatch entry for the new verb
- `plugin/bin/lib/wrap-up/engine-verify.js` — new module: check functions + table render
- `plugin/skills/wrap-up/execution-and-verification.md` — Verify execution section rewrite + expectations-file write instructions
- `tests/bin-lib/wrap-up/engine-verify.test.js` — new suite (auto-discovered by the recursive glob)

## Gotchas

- **Re-merge origin/main and re-read `execution-and-verification.md` before editing** — #343 (bot-in-progress) edits the same file's gating prose; a stale base makes the section layout wrong before task 1.
- The acceptance-labeling check must reproduce the existing checklist's parent-vs-non-parent branch faithfully — in particular the "any comment on the parent, never only the most recent" rule; that nuance exists because a last-comment-only test hard-stops correctly-gated parents.
- Skip semantics matter: `skip (…)`, `unknown (…)`, and `pass` are three distinct row states — folding any into another is the exact failure this record exists to prevent (see the Deliverables' absent-file vs. empty-key asymmetry).
- The verb must not re-run the suite or any state-changing command — read-only probes only (`git log`, `git ls-files`, `git worktree list`, `ls`, `gh issue view`).
- The deferred-item set comes from the expectations file's `deferred` key only (see Data / API Surface) — not from `engine-state.json`, which carries no defer information, and not from the env var directly.
- The verb verifies the run it is invoked on, immediately after that run's execution step — it is not a retrospective auditor of historical run-dirs, whose commit conventions may predate the trailers it greps for; the module header states this scope.
- Under `--dry-run`, wrap-up stops before execution — the skill prose must not invoke the verb on that path (nothing executed, nothing to verify).


<!-- work-fingerprint: wrapup-objective-audit-fixes:wrap-up-verify-verb-mechanizes-the-verify-execution-closure -->
