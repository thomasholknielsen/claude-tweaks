---
record: 138
origin: human
risk: high
effort: high
ceremony: standard
grants: []
surface: backend
---
# 138: worktree.always gate: four skill files describe its coverage wrongly, making documented procedures unexecutable

Surface: backend

## Current State

`checkWorktreeRequired` (`bin/lib/hooks/pre-tool-use.js`) denies any `Edit`/`Write`/`NotebookEdit`, `git commit`/`git push`, or Bash `cp`/`mv`/`tee` whose resolved target sits in a repo with `worktree.always: true` and is not inside a linked worktree. It has no path-based exemption. The behaviour is correct and well pinned by tests: `tests/hooks-pre-tool-use.test.js:338` covers the push denial, `:410` and `:462` cover `cp`/`mv`/`tee`.

Nothing binds the *prose* describing that gate to the gate itself. One fact — what the gate intercepts — is restated at six sites in `skills/`. Two are correct; four are not:

| Site | Claim | Status |
|---|---|---|
| `_shared/policy-schema.md:11` | gates Edit/Write/NotebookEdit, commit, push, cp/mv/tee | correct |
| `dispatch/settle-and-merge.md:80` | push from the main checkout is denied; merge is not; do not chain them | correct, and precise |
| `wrap-up/cleanup-procedures.md:149` | "a bare `cp` matches neither" | **wrong** — this record's original report |
| `flow/materialize.md:131` | commit the record on the pre-worktree branch, then branch | **wrong** — #139 |
| `flow/worktree-merge.md:30` | "`git merge`, `git checkout`, `git pull`, and `git push` are never gated, only `Edit`/`Write`/`NotebookEdit` and a literal `git commit` are" | **wrong on two counts** — push *is* gated (`pre-tool-use.js:89` filters `action === 'commit' \|\| action === 'push'`), and cp/mv/tee are gated too |
| `wrap-up/review-console.md:54` | fast-lane auto-merge snippet runs `git merge --no-ff` then `git push` from the main checkout | **wrong** — the push is denied, on the headless path where no human is present to see it |

`review-console.md` is the highest-severity of the four: it is the `auto:merge` fast-lane path that runs unattended, and `settle-and-merge.md` already documents the correct two-call shape for exactly this situation. That correction never propagated.

Consequences observed in practice: every `worktree.always` project silently loses `decisions.md` and `config.yml` at each wrap-up (the original report), and `/flow`'s documented materialization ordering cannot execute at all (#139).

**Root cause, dated:**

```
2026-07-16  86a234bb  worktree-merge.md written — the claim was TRUE when authored
2026-07-20  c8f929e1  gate widened: 'push' added alongside 'commit'
2026-07-20  cab6142b  gate widened: cp/mv/tee added via fileWriteTargets
```

The gate grew twice in one day and neither commit swept the prose describing it. `cleanup-procedures.md`'s claim is the worse case — authored *after* the widening, still describing the pre-widening gate, i.e. written from a stale mental model rather than from the code. This is `[IL-75]`'s shape (widening what a value ranges over without sweeping the invariant its old range encoded) applied to documentation instead of code.

## Deliverables

- [ ] A narrow exemption in `checkWorktreeRequired` for write targets under a repo's `.claude-tweaks/pipelines/` directory, so pipeline bookkeeping is not gated as work. Covers the `cp`/`mv`/`tee` and `Edit`/`Write` paths; must **not** exempt `git commit`/`git push`.
- [ ] Unit coverage for the exemption in `tests/hooks-pre-tool-use.test.js`: a `cp` into `.claude-tweaks/pipelines/archive/` from a worktree is allowed; a `cp` into any other main-checkout path is still denied; `git commit`/`git push` in the main checkout are still denied regardless of cwd.
- [ ] `skills/wrap-up/cleanup-procedures.md` Section C step 4 — replace the false parenthetical with a correct statement of why the copy is permitted (the exemption), citing `_shared/policy-schema.md`.
- [ ] `skills/flow/worktree-merge.md` — correct the "never gated" sentence: `git push` from the main checkout is denied, and Bash `cp`/`mv`/`tee` are gated. Cite `_shared/policy-schema.md` rather than restating the covered-action list.
- [ ] `skills/wrap-up/review-console.md` — split the auto-merge snippet's `git merge` and `git push` into two Bash calls, with the push issued from inside the linked worktree, mirroring `dispatch/settle-and-merge.md`'s already-correct shape. State explicitly that chaining them into one command gets the whole invocation denied.
- [ ] `skills/flow/materialize.md` "When this runs" — replace the commit-then-branch ordering with worktree-first, keeping the real constraint it was reasoning about (a worktree branches from the base commit and will not carry uncommitted work). Closes #139.
- [ ] Establish `_shared/policy-schema.md`'s `worktree.always` row as the single statement of gate coverage; every other site cites it instead of restating it, per CLAUDE.md's "every relationship stated once" convention.
- [ ] Export the gate's covered-action set as a named constant from the hooks layer, and add a test asserting `_shared/policy-schema.md`'s row lists exactly those actions — so widening the gate again fails a test until the canonical row is updated.
- [ ] An incident-log entry plus a compressed `[IL-nn]` rule in CLAUDE.md's `## Don'ts` for the underlying failure: widening an enforcement mechanism without sweeping the prose that documents its old coverage.

## Acceptance Criteria

- [ ] A `cp` of `$RUN_DIR`'s gitignored files into `{main-checkout}/.claude-tweaks/pipelines/archive/` from inside a linked worktree, on a project with `worktree.always: true`, is allowed by the gate — verified by a unit test, not by narrative.
- [ ] A `cp` from that same worktree into any main-checkout path outside `.claude-tweaks/pipelines/` is still denied — verified by a unit test.
- [ ] `git commit` and `git push` issued from the main checkout remain denied under `worktree.always` with the exemption in place, including when their cwd is inside `.claude-tweaks/pipelines/` — verified by unit tests.
- [ ] The two **structural** sweeps below are re-run and every hit adjudicated. Not a keyword sweep: grepping `worktree.always`/`checkWorktreeRequired` finds only files that already name the gate and misses `materialize.md` and `review-console.md` entirely, whose defect is silence (`[IL-15]`).
  - `grep -rn "git push" skills/` — every hit is issued from inside a linked worktree, or explicitly documented as needing a separate call from one.
  - `grep -rnE '\b(cp|mv|tee) ' skills/` — every hit targets a path inside a linked worktree or under `.claude-tweaks/pipelines/`.
- [ ] No skill file states the gate's covered-action list other than `_shared/policy-schema.md`; the rest cite it. Verified by reading the sites the two sweeps surface, not by a string grep — "never gated" and "not gated" both appear in unrelated senses elsewhere in `skills/` (e.g. `backlog/refine-mode.md:175`), so a literal-string check reports false failures.
- [ ] `review-console.md`'s auto-merge procedure issues `git merge` and `git push` as two separate Bash calls, with the push run from the worktree.
- [ ] `materialize.md`'s "When this runs" prescribes worktree-first ordering and no longer instructs a commit on the pre-worktree branch.
- [ ] `npm test` passes in full.
- [ ] #139 is closed by this record's merge.

## Technical Approach

**Archival mechanism — decided.** Of the four options weighed, the chosen one is a **narrow exemption in the gate** for writes under `.claude-tweaks/pipelines/`:

- The gate's purpose is "work happens in an isolated worktree." Pipeline audit state is bookkeeping, not work, and the directory is plugin-owned and gitignored.
- It makes Section C step 4's documented `cp` genuinely true rather than worked around. The failure mode that produced all four defects is reasoning about the gate's *implementation* instead of its *intent* — the rejected options (b) and (c) below repeat exactly that.
- It is testable in the same suite that already pins the gate's coverage.
- It resolves the multi-spec shared-worktree teardown case the original report defers as an open question, rather than leaving a second uncovered path.

Rejected: **committing the state** (contradicts the "gitignored … never committed" contract in CLAUDE.md and `materialize.md`, which would have to be amended deliberately); **output redirection** (depends on a deliberate hole in `fileWriteTargets` whose stated rationale is per-call latency, not intent — it breaks silently when the gate is next tightened); **dropping archival entirely** (loses `decisions.md`, which is the consequence this record was filed about).

**Placement of the exemption** — two hazards to get right:

1. `gitTargets` yields a *directory* (`t.dir`, the command's cwd), while `fileWriteTargets` yields a *file*. A path-prefix exemption applied to the merged `targetPaths` list would exempt a `git commit` merely *issued from* a cwd inside `.claude-tweaks/pipelines/`. The exemption must apply only to the `fileWriteTargets`/tool-input half, never to the git half.
2. It needs `repoRoot`, so it lands after `repoInfo` resolves — but before the `isLinkedWorktree` deny, and after the `indeterminate` branch. Per `[IL-83]`, an exemption placed after an early return that can claim the same value only runs on the branch it was not placed after.

**Consolidation.** `_shared/policy-schema.md`'s row becomes canonical; the other sites cite it. The exported covered-action constant plus its test is what makes that binding load-bearing rather than aspirational — one edit to the canonical row satisfies the test, and because nothing else restates the list, one edit is also sufficient for correctness.

## Gotchas

- **Do not decompose this record.** It is nine deliverables across six files, which reads like a decomposition candidate, but the four defects are one fact restated four times and they drift together. `[IL-52]` is the precedent: a batch of agents each fixing one instance of a cross-cutting concern leaves cross-references claiming the others didn't fix it, because none can see the others' edits. Sweep and fix centrally.
- **The test that binds prose to code reads live production prose,** which `[IL-80]` warns against. It is acceptable here only because `_shared/policy-schema.md`'s row is a declared contract whose update *is* the intended action when the gate changes — unlike incidental prose that merely happens to mention the gate. Do not generalize the pattern to other files.
- **`grep -rn "never gated\|matches neither" skills/` is not a valid verification.** `backlog/refine-mode.md:175` matches it in an unrelated sense ("never gated behind its own `AskUserQuestion`"), so it returns non-empty after a correct fix and reads as failure — the `[IL-34]` shape. Use the structural sweeps in Acceptance Criteria instead.
- **`fileWriteTargets` is deliberately non-exhaustive.** Output redirection, `sed -i`, `python -c`, and nested `sh -c` are not covered, for documented latency reasons. Do not widen it as part of this record — and do not write a fix that depends on those holes.
- **Verify the exemption fails closed.** Per `[IL-50]`, a new gating helper beside an existing sibling must fail in the *same direction* on malformed input. An unresolvable or relative path must not accidentally satisfy the `.claude-tweaks/pipelines/` prefix test.

## Non-Goals

- Making `fileWriteTargets` exhaustive over every Bash write shape. Its non-exhaustiveness is deliberate and documented; this record does not change it.
- Retiring `[IL-33]`. Whether a rule guarding a hazard the docs no longer create has expired is `/claude-tweaks:harness-health`'s rule-expiry check, on positive evidence — not an automatic removal here.
- #133 (code-health slicer emitting config dot-directories). Unrelated subsystem, tracked separately.

## Original request

cleanup-procedures.md Section C step 4's pre-removal cp is denied by worktree.always, losing run-dir audit state

**Summary:** `skills/wrap-up/cleanup-procedures.md` Section C step 4 tells wrap-up to `cp` the run directory's gitignored state (`config.yml`, `decisions.md`, `events.jsonl`, `staged/`) out to the main checkout before removing the worktree, and asserts the `worktree.always` gate will not deny it. The gate denies it. On any project with `worktree.always: true`, that state is therefore destroyed by worktree removal with no copy anywhere.

**Type:** Bug

**Affected component:** `skills/wrap-up/cleanup-procedures.md` Section C step 4

**The incorrect claim**, verbatim from that file:

> A plain `cp` via Bash — not the `Write`/`Edit` tool, not `git commit` — so the `worktree.always` PreToolUse gate does not deny it (`bin/lib/hooks/pre-tool-use.js`'s `checkWorktreeRequired` only gates `Edit`/`Write`/`NotebookEdit` and a Bash command whose `gitTargets` resolves a `commit` action; a bare `cp` matches neither).

**Why it is wrong:** `checkWorktreeRequired`'s Bash branch unions `gitTargets` with **`fileWriteTargets(command, ctx.cwd)`**, which resolves `cp`/`mv`/`tee` write targets. The deny message says so itself: *"requires an isolated worktree for Edit/Write/NotebookEdit, git commit/push, and Bash cp/mv/tee writes"*. CLAUDE.md's Hooks section also lists "the Bash-invoked `cp`/`mv`/`tee` shapes" as gated.

**Observed:** hit during #134's wrap-up. The exact command from Section C step 4, run from inside the worktree with the main checkout as destination, returned the standard deny.

**Why the gate is right and the doc is wrong:** the destination is the main checkout, so the gate resolves that path's repo, finds `worktree.always: true`, finds it is not a linked worktree, and denies. That is correct behaviour — the doc's expectation is what is mistaken.

**Consequence:** every `worktree.always` project silently loses `decisions.md` (the auto-decision audit log CLAUDE.md calls "project history … for the user's calibration of project policy") and `config.yml` at every wrap-up. Silent because the `cp` failure is a denied tool call mid-cleanup, not a hard stop.

**Suggested direction (measure against the live files first — see `[IL-71]`):**

1. Decide where this state should actually live. Options are not equivalent: (a) commit it into the archive under a tracked path, which contradicts CLAUDE.md's "gitignored … never committed" contract and needs that contract updated deliberately; (b) have the copy performed by a mechanism the gate does not intercept, which means picking one deliberately rather than relying on an incorrect claim about `cp`; (c) perform the archival from inside the worktree into a tracked location that merges to main, the way `work/` already survives.
2. Whichever is chosen, correct Section C step 4's false parenthetical — it will otherwise keep reassuring readers that a denied command is safe.
3. Consider whether the same claim appears elsewhere; the `cp`-is-not-gated belief may have been copied.
4. A test would help: nothing currently exercises this path, which is why a documented-but-impossible procedure survived.

**Origin:** Found during #134's wrap-up (git-exec timeout / worktree gate fail-open).

