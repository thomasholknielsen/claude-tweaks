---
record: 192
origin: human
risk: low
size: medium
ceremony: standard
grants: []
fingerprint: worktree-concurrency-hardening:worktree-setup-consolidation
surface: backend
---
# 192: Consolidate worktree base-staleness protection into one canonical `_shared/worktree-setup.md` procedure

Surface: backend

## Overview

`skills/flow/validation.md` (Step 2.5) and `skills/build/worktree-setup.md` (Step 1) carry a
byte-identical 6-line integration-branch fetch+compare block plus a byte-identical narrowing
paragraph — the original finding behind this record (`[IL-32]`: don't accept "duplicate
across N≥2 near-identical consumers, no shared module yet" as final). Decomposing the
worktree-concurrency-hardening design doc found this record's own stated trigger already
met — "the next time a third consumer needs the integration-branch fetch+merge-check, or when
one of the two existing copies is edited" — and broadened its scope to match: create
`skills/_shared/worktree-setup.md`, a single new canonical file holding **two** named
procedures (see Technical Approach), and rewire every current worktree-setup call site — not
just `/flow` and `/build`, but the two hardcoded hook messages and `git-discipline.md`'s inform
text — to cite it instead of independently restating "invoke
`/superpowers:using-git-worktrees`" with no staleness protection.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- The mechanical `PostToolUse` backstop hook and the `plugin.json` hand-edit guardrail — both
  are their own leaf (#307), blocked by this record, since that hook's warn message names this
  record's shared file and should only ship once it exists.
- Folding in `skills/routine/record-freshness.md` — it narrows the integration-branch ladder
  differently on purpose (excludes ranks 1-2 rather than rank 5, compares file content rather
  than commit counts). Three sites narrow the same ladder; only two ever shared an
  implementation. Collapsing all three is the wrong fix.
- Adding a fetch timeout to the shared block. The original finding named this as a concrete
  bug (`git fetch` against a captive portal or hung SSH handshake blocks indefinitely, no
  diagnostic) and pointed at `compareRoutineRecords` (`bin/lib/routine-template-parser.js`)'s
  20s `execFileSync` timeout as prior art — worth doing, but it's an orthogonal hardening of
  the fetch call itself, not required for the consolidation this leaf delivers. Left as a
  follow-up rather than expanding this leaf's blast radius.

## Current State

- `skills/flow/validation.md` Step 2.5 and `skills/build/worktree-setup.md` Step 1 — the two
  existing byte-identical copies of the fetch+compare-with-divergence-prompt block (verified:
  extracting and trimming both gives byte-identical text, confirmed at this record's original
  filing). **Re-verify this at implementation time** — if the two copies have since drifted,
  treat `build/worktree-setup.md`'s copy as canonical (it's the one with the fuller documented
  behavior — the rebase-vs-continue prompt and auto-mode staging) and merge any fix present only
  in `flow/validation.md`'s copy forward before extracting.
- `skills/build/worktree-setup.md` Steps 0 and 4 — the pre-creation `EXPECTED_BASE`
  capture/`ACTUAL_BASE` verification pair, the more complex of the two staleness mechanisms
  this plugin currently runs (deleted in favor of the simpler unconditional form below).
- `skills/_shared/scratch-worktree.md` Section 3 — the unconditional post-creation catch-up
  this leaf promotes to canonical. Its text already states "this fetch-then-merge is what
  makes the rest of this procedure correct either way." That justification is scratch-worktree
  specific (a throwaway remedy checkout, where silently self-healing is always correct because
  there's no in-progress work to protect); this leaf keeps the *same mechanism* for the general
  worktree-creation path because a freshly created worktree also has no local commits yet to
  protect — the STOP-on-mismatch behavior it replaces existed only to catch a wrong *base*, not
  to protect any work, and an unconditional merge onto the correct base makes that check moot
  rather than removing a safety net.
- `bin/lib/hooks/session-start.js:110` and `bin/lib/hooks/pre-tool-use.js:231` — the two
  hardcoded "invoke `/superpowers:using-git-worktrees` to set one up" strings with zero
  staleness protection today.
- `skills/_shared/git-discipline.md` line 9 — "Set up the worktree first via
  `/superpowers:using-git-worktrees`", same gap.
- No existing test asserts the literal hook message strings (checked at this record's filing:
  `grep -rln "invoke /superpowers:using-git-worktrees" tests/` returned nothing). **Re-check at
  implementation time** — if a test now pins one of these strings, update it in the same commit
  rather than treating the mismatch as a separate blocker.

## Deliverables

- [ ] New file `skills/_shared/worktree-setup.md` with **two named sections**, both consumers
      of one `{integration-branch}` resolution written once at the top of the file (not
      duplicated per section):
      - `## Post-creation catch-up` — unconditional, no capture/verify step:
        `git fetch origin {integration-branch}` then `git merge origin/{integration-branch}`,
        run as the first action inside any newly created worktree regardless of creation
        method or `worktree.baseRef` correctness. On a merge conflict, surface it through
        `git-discipline.md`'s existing conflict-resolution rules (resolve, never reset) — this
        is the one case where the "unconditional" step needs a human/agent decision.
      - `## Pre-flight divergence check` — the block this record originally targeted: fetch +
        `ahead` count against the resolved upstream, the rebase-vs-continue prompt, and
        auto-mode staging. Behavior unchanged from today's `flow/validation.md`/
        `build/worktree-setup.md` copies — this section only relocates it.
- [ ] `skills/build/worktree-setup.md`: delete Steps 0 and 4 (the `EXPECTED_BASE` capture,
      `ACTUAL_BASE` verification, and "Worktree base mismatch" STOP block); Step 1 becomes a
      citation to the new file's `## Pre-flight divergence check` section instead of restating
      it; add a citation to `## Post-creation catch-up`, invoked immediately after worktree
      creation. Both the pre-flight check (before creation) and the post-creation catch-up
      (after) run on every `/build` worktree setup — intentionally: the pre-flight check
      informs the human/auto-mode choice (rebase now vs. continue), the post-creation catch-up
      is the unconditional correctness net regardless of which was chosen. The second fetch
      this implies is accepted overhead for that defense-in-depth, not a bug to eliminate.
- [ ] `skills/flow/validation.md` Step 2.5: same extraction — cite the shared
      `## Pre-flight divergence check` section instead of restating it.
- [ ] `skills/_shared/scratch-worktree.md` Section 3: replace the procedure body with a
      citation to `skills/_shared/worktree-setup.md`'s `## Post-creation catch-up` section,
      matching the pattern this file already uses for the `worktree.always` coverage block
      (cite the canonical source, don't restate it).
- [ ] `skills/_shared/git-discipline.md` line 9: append the literal text `" then follow
      \`_shared/worktree-setup.md\`'s post-creation catch-up before any other action."` after
      the existing "invoke `/superpowers:using-git-worktrees`" instruction.
- [ ] `bin/lib/hooks/session-start.js:110` and `bin/lib/hooks/pre-tool-use.js:231`: both
      hardcoded strings gain the identical appended text from the bullet above (same literal
      wording as `git-discipline.md`'s, so all three read consistently).
- [ ] Update any test found to pin the pre-edit hook message strings (see Current State
      re-check note) in the same commit.

## Acceptance Criteria

1. `skills/_shared/worktree-setup.md`'s `## Post-creation catch-up` procedure, run manually
   against a worktree deliberately created behind `origin/{integration-branch}` (e.g. checked
   out from an older local ref before this leaf's own worktree caught up — the exact scenario
   this leaf's own authoring worktree hit), leaves that worktree content-identical to
   `origin/{integration-branch}` plus any local commits after running. This is a manual
   verification step at implementation review time, not an automated test — the procedure is
   markdown prose consumed by an agent, not executable code a suite can invoke directly.
2. `skills/build/worktree-setup.md` no longer contains `EXPECTED_BASE` or `ACTUAL_BASE` — grep
   confirms zero matches.
3. `skills/flow/validation.md` and `skills/build/worktree-setup.md` no longer carry independent
   copies of the fetch+compare block — grep for the block's distinctive first line
   (`INTEGRATION_BRANCH=$(grep -E "^integration-branch:"`) across those two files returns
   **zero** hits (the only surviving copy lives in `skills/_shared/worktree-setup.md`, a third
   file neither of these two).
4. `session-start.js`, `pre-tool-use.js`, and `git-discipline.md` each reference
   `_shared/worktree-setup.md` by path — grep confirms all three.
5. `npm test` passes, including `tests/hooks-dispatcher.test.js`'s garbage-stdin invariant for
   the two edited hook files.

## Technical Approach

### Key Files

- `skills/_shared/worktree-setup.md` — new; two sections as specified in Deliverables
- `skills/build/worktree-setup.md` — edit (net deletion)
- `skills/flow/validation.md` — edit (extract shared fetch+compare block)
- `skills/_shared/scratch-worktree.md` — edit
- `skills/_shared/git-discipline.md` — edit
- `bin/lib/hooks/session-start.js` — edit
- `bin/lib/hooks/pre-tool-use.js` — edit

## Gotchas

- Verify claims about the current duplicated block against the live files before editing —
  don't trust this record's own description of "byte-identical after trim" without
  re-confirming, since both files may have drifted since this record's original filing
  (`[IL-24]`). See Current State's drift-resolution rule if they have.
- `record-freshness.md` deliberately narrows the ladder differently — do not fold it in (see
  Non-Goals). A blanket "make every integration-branch reference cite one file" sweep would
  reintroduce this record's own original problem in a new place.
- The sibling leaf's `PostToolUse` backstop hook (#307) is `Blocked by` this record specifically
  because its warn message names `skills/_shared/worktree-setup.md` by path — don't let that
  leaf start before this file exists.
- Both the `## Post-creation catch-up` and `## Pre-flight divergence check` sections resolve
  `{integration-branch}` — write that resolution once, at the top of the file, and have both
  sections reference it. Two independent copies of the resolution *inside the file meant to
  eliminate duplication* would be the exact failure this leaf exists to fix, recreated one
  level down.


<!-- work-fingerprint: worktree-concurrency-hardening:worktree-setup-consolidation -->
