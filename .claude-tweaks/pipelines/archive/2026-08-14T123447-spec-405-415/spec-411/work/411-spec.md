---
record: 411
origin: human
risk: high
size: high
ceremony: standard
grants: []
blocked-by: [409, 407]
surface: backend
---
# 411: Merge-path conversion: every merge site converges on GitHub PR merge

Surface: backend

## Overview

Converge every merge site on GitHub: mark the PR ready → `gh pr merge --auto --merge` → reconcile (ff local main). Degrade chain: repo without auto-merge enabled → immediate `gh pr merge --merge`; that fails (checks red, conflict) → leave the PR ready with a comment, sweep and human take over. Merge method is merge commit, preserving the `--no-ff` + `[auto-merge]` tag + `Fixes #N` message conventions — created by GitHub instead of local git. This deletes dispatch's two-thread split entirely: `gh pr merge` needs no checkout, so the cwd-pinned second Task call completes authorization, `merge-check`, acceptance labeling, and the merge itself. The `close-run`-before-merge E1 relief, branch-switch guard, push-from-worktree rule, and the scratch-worktree conflict procedure all go with it on pr-first paths.

Supersedes and closes #335 (the two independently-authored auto-merge implementations are unified by deletion — the shared procedure both cited is replaced by one `_shared` pr-first merge procedure) and #299 (the fast-lane `git -C "$RUN_DIR"` anchoring defect lives in code this removes). The closing commit/PR for this sub-issue must carry `Fixes #335` and `Fixes #299` lines.

**Complexity:** High
**Estimated tasks:** 8

## Non-Goals

- No changes to `merge-check` content judgment or `auto:merge` authorization — layers 1-2 of the gate are untouched; only merge *execution* changes.
- No sweep changes — the sweep-backstop sub-issue.
- `local-merge` projects keep today's procedures — each converted file keeps a compact local-merge fallback section.
- `bin/release.js`'s direct push stays out of scope (human-run ritual).

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| pr-early-lifecycle | PR-early run lifecycle | ready |
| reconciler-module | Reconciler module (post-merge convergence, `armed` completion) | ready |

## Current State

- `skills/dispatch/settle-and-merge.md` — Auto-merge gate (two-layer check in the second Task call) + "Dispatching-session merge execution" (main-checkout merge, close-run E1 relief, branch guard, push-from-worktree, conflict fallback into pending-review-durability).
- `skills/wrap-up/review-console.md` — fast-lane Auto-merge short-circuit (single-record twin; carries the #299 `git -C "$RUN_DIR"` defect).
- `skills/flow/worktree-merge.md` — multi-terminal merge reconciliation + scratch-worktree conflict procedure.
- `skills/_shared/integration-branch.md` — branch resolution ladder all sites cite.
- `dispatch/task-prompt.md` — second-call template with `OUTCOME: ready-to-merge` reporting.
- The PR (with `Fixes` lines in body) exists from run start; `run-state.json` carries its number.

## Deliverables

- [x] `skills/_shared/pr-first-merge.md` — the one canonical merge procedure: ready → `--auto` arm → degrade to immediate merge → degrade to ready+comment; merge-commit method with `[auto-merge]`/`[fast-lane]` tag and `Fixes` lines in the merge commit message (covers non-default integration branches where body keywords don't fire); post-merge reconcile call. The file enumerates the exact `gh pr merge` error signatures per degrade branch — auto-merge-not-enabled vs checks-pending vs conflict vs permission-denied (permission-denied takes the same ready+comment fallback) — with the rule that an unrecognized error always takes the conservative ready+comment branch, never a guessed one. It states the tag mapping (`[auto-merge]` = dispatch/headless path; `[fast-lane]` = interactive console short-circuit — preserving `/help`'s metric semantics), the acceptance-labeling-before-merge ordering, and the outcome vocabulary: `merged` (confirmed synchronously via `gh pr view`), `armed` (`--auto` armed with checks pending — the call does NOT block or poll; the reconciler/sweep completes cleanup on later merged-PR evidence, which is exactly what convergent cleanup exists for), `pending-review`, `failed`.
- [x] `dispatch/settle-and-merge.md` rewritten: the second Task call executes the shared procedure itself; DELETE the "Dispatching-session merge execution" section, the `OUTCOME: ready-to-merge` relay, the close-run relief, the branch guard, and the push-from-worktree rule on this path. The local-merge fallback section keeps, in substance: the branch guard, the close-run E1 relief, the push-from-worktree rule, and the scratch-worktree conflict pointer — pr-first deletes them; local-merge still needs all four.
- [x] `wrap-up/review-console.md` fast-lane converted to cite the shared procedure (deleting the #299-defective resolution block).
- [x] `flow/worktree-merge.md` converted: per-branch ready+merge sequentially; conflicts resolved by updating the branch from base inside that run's own worktree, resolve, push — the scratch-worktree conflict procedure retired on the pr-first path (kept for local-merge).
- [x] `dispatch/task-prompt.md` + `dispatch/two-call-gate.md` updated for the second call performing its own merge (report `OUTCOME: merged` / `armed` / `pending-review` / `failed` — an `armed` group tears down nothing merge-dependent; the reconciler finishes it on merged-PR evidence).
- [x] Conflict path: `gh pr merge` failing on conflicts → update branch from base in the worktree, resolve there, push, re-merge. "Unresolvable headlessly" is defined: exactly one update-from-base attempt; any conflict markers remaining after it ⇒ PR left ready with a comment, outcome `pending-review`. Sequential multi-branch merges (flow's reconciliation) are serialized by the invoking session; each later branch's single attempt updates from the just-advanced base.

## Acceptance Criteria

1. A granted singleton run auto-merges end-to-end with no main-checkout merge/commit/push anywhere in the transcript — the reconciler's ff-only catch-up of the mirror (the local integration branch; "mirror" and "local main" are the same object, and the shared file uses one term) is expected and exempt. decisions.md contains no `close-run`-before-merge entry.
2. The merge commit on the integration branch carries the `[auto-merge]` (or `[fast-lane]`) tag and one `Fixes #{n}` line per record, and the records auto-close on merge.
3. In a repo with auto-merge disabled, the same flow lands via immediate `gh pr merge --merge` (degrade step logged).
4. `grep -rn "ready-to-merge" skills/` returns only local-merge fallback sections or nothing.
5. A seeded conflict produces: branch updated from base inside the worktree, resolved, re-merged — with zero edits in the main checkout.
6. `npm test` passes, including the conformance test citing `_shared/integration-model.md` from every converted file.
7. The shared procedure's text places acceptance labeling before the merge step — asserted by a conformance grep in the test suite, not only by prose.

## Technical Approach

One shared procedure file, cited by all three sites (this is #335's ask, answered by deletion rather than extraction of the old shape). `gh pr merge --auto` requires the repo setting "Allow auto-merge"; detect the failure mode from the command's error and take the degrade chain rather than pre-probing settings. After any merge, run the reconciler (ff the mirror, release, archive) — cleanup is convergent, not owed.

### Key Files

- `skills/_shared/pr-first-merge.md` — new canonical procedure.
- `skills/dispatch/settle-and-merge.md`, `skills/wrap-up/review-console.md`, `skills/flow/worktree-merge.md` — conversions.
- `skills/dispatch/task-prompt.md`, `skills/dispatch/two-call-gate.md` — outcome vocabulary.
- `skills/_shared/integration-model.md` — the pr-first/local-merge discriminator every converted file routes on (cited, not restated).
- `docs/skill-graph.md` — edge updates.

## Gotchas

- The closing commit for THIS sub-issue must carry `Fixes #335` and `Fixes #299` — write them as literal closing keywords in the merge that ships it (subagents implementing tasks should write `refs #N` in intermediate commits; only the shipping merge carries `Fixes`).
- `[fast-lane]` vs `[auto-merge]` tag semantics feed `/help`'s auto-merged-this-week metric (`_shared/github-pr-scan.md` triage-queue item 3) — preserve both tags' meanings or update that scan in the same change.
- Acceptance labeling still runs before merge (records must be open when `verification-brief` routing runs) — order is load-bearing; the shared procedure must state it.
- Comment ordering, decided: anything that must land on the PR posts before the merge call; after-merge information goes to the record issue or decisions.md.
- Do not leave `_shared/pending-review-durability.md` references dangling in the conflict path — its retirement is the retirement-sweep sub-issue; this one routes the conflict fallback to "PR left ready + comment" instead of invoking it.
- Two auto-merge governance records (#309, #310, #311) layer on this path — do not close or contradict them; the merge gate's authorization layers stay exactly where they are.
