# PR-First Merge — the one canonical merge procedure

Canonical for every merge site under `integration-model: pr-first` (`_shared/integration-model.md`):
`dispatch/settle-and-merge.md`'s Auto-merge gate, `wrap-up/review-console.md`'s Auto-merge
short-circuit, and `flow/worktree-merge.md`'s multi-branch reconciliation. Supersedes and closes
#335 (the two independently-authored auto-merge implementations these three files carried) and
#299 (the fast-lane `git -C "$RUN_DIR"` worktree/branch anchoring defect — obsolete once merge
needs no checkout at all).

**The shape:** ready → `gh pr merge --auto` (arm) → degrade to immediate merge → degrade to
ready+comment. `gh pr merge` needs no local checkout, which is what deletes the two-thread split
every pr-first caller used to need: the same cwd-pinned Task call that already holds
authorization, `merge-check`, and acceptance labeling can run the merge itself. No
`close-run`-before-merge relief, no branch-switch guard, no push-from-worktree rule, no
scratch-worktree conflict procedure — all four existed only because a *local* `git merge` +
`git push` needed the main checkout. `local-merge` projects keep all four; see each converted
file's own local-merge fallback section.

## Precondition

`run-state.json` carries a `pr` object (`_shared/pr-run-comments.md`'s gate) AND
`integration-model` resolves `pr-first` for this run. Absent either — fall to the citing file's
local-merge section instead of this procedure.

## Step 1: Acceptance labeling — before the merge, unconditionally

Run `wrap-up/verification-brief.md` starting from its **Routing** section, exactly as the
citing file's own two-layer gate already directs (unchanged from today — this procedure does not
touch layers 1-2, only execution). **Order is load-bearing**: the merge closes the record(s) via
its `Fixes` lines, so labeling must land while every record is still open. A caller that merges
before labeling silently drops acceptance sign-off the same way the pre-#410 fast-lane path once
did for a different reason (`wrap-up/review-console.md`'s own "console content is not all of
Phase 4" note) — this procedure states the ordering explicitly so it is never re-dropped.

## Step 2: Mark the PR ready

The PR was opened as a draft at run start (`_shared/pr-early-run-lifecycle.md`). Undraft it —
GitHub blocks merging (auto or immediate) on a draft PR by default, and this is the one
procedure in the plugin that is allowed to clear that protection, since it only runs after both
authorization and content-judgment layers already passed:

```bash
gh pr ready {pr-number} --repo {owner}/{repo}
```

## Step 3: Attempt auto-merge, degrading on specific failure signatures

```bash
gh pr merge {pr-number} --repo {owner}/{repo} --auto --merge \
  -t "[{tag}] {one-line summary}" \
  -b "$(printf 'Fixes #%s\n' {issue-list})"
```

`{tag}` is `auto-merge` for the dispatch/headless path (`dispatch/settle-and-merge.md`'s Auto-merge
gate) or `fast-lane` for the interactive single-record short-circuit
(`wrap-up/review-console.md`) — preserving both tags' pre-#411 meanings, since `/help`'s
auto-merged-this-week metric (`_shared/github-pr-scan.md` `triage-queue` item 3) still keys on
them. `{issue-list}` is one `Fixes #{n}` per record — the exact same set the PR body's own
`Fixes` lines already carry (`_shared/pr-early-run-lifecycle.md`), restated here because the
merge commit's own message is what GitHub scans for closing keywords on a non-default
integration branch, where the PR body's keywords don't fire (GitHub only auto-closes from a
merge commit's message, or a PR body merged into the *default* branch — an explicit merge
commit message is what makes closing work on any integration branch).

**This call always either arms or performs the merge — `--auto` never blocks or polls.** Classify
the result:

1. **Command failed with an auto-merge-not-enabled signature** (stderr contains
   `auto-merge` and (`not allowed` or `not enabled`) — GitHub's own wording for the repository
   setting "Allow auto-merge" being off): degrade to an **immediate** merge, no `--auto`:

   ```bash
   gh pr merge {pr-number} --repo {owner}/{repo} --merge \
     -t "[{tag}] {one-line summary}" \
     -b "$(printf 'Fixes #%s\n' {issue-list})"
   ```

   This either succeeds (→ outcome `merged`, go to Step 4) or fails on one of the signatures
   below (→ that signature's own degrade branch).

2. **Command failed with a checks-pending or checks-failing signature** (stderr contains
   `not mergeable` alongside `required status check`, `review`, or `checks`): checks are red or
   still running and this repo has no auto-merge to arm around it (already ruled out by reaching
   here from branch 1, or `--auto` itself isn't what failed — a plain `--merge` attempt hit this
   directly). → **degrade to ready+comment** (Step 5), outcome `pending-review`.

3. **Command failed with a conflict signature** (stderr contains `not mergeable` alongside
   `conflict`, or a GraphQL `mergeable: CONFLICTING` reason): → **Conflict path** below.

4. **Command failed with a permission-denied signature** (stderr contains `403`, `not accessible`,
   or `must have write access`): → **degrade to ready+comment** (Step 5), outcome `pending-review`
   — same branch as checks-pending. A permission gap needs a human with the right access, not a
   retry.

5. **Command failed with anything else, or an error this procedure doesn't recognize**: →
   **degrade to ready+comment** (Step 5), outcome `pending-review`. Never guess at an unfamiliar
   error's meaning — the conservative branch is always safe (the PR stays ready, a human decides),
   while guessing wrong on a real failure (e.g. treating a genuine conflict as a transient blip and
   retrying) is not.

6. **Command succeeded**: confirm which of the two happened —

   ```bash
   gh pr view {pr-number} --repo {owner}/{repo} --json state,mergedAt,autoMergeRequest
   ```

   - `state: MERGED` (checks were already green, or this was the no-`--auto` immediate-merge
     degrade branch): outcome `merged`. Go to Step 4.
   - `state: OPEN` with `autoMergeRequest` present (checks still pending, auto-merge armed):
     outcome `armed`. **Do not poll or wait** — this call is done. The reconciler
     (`bin/lib/reconcile`) completes cleanup later, on merged-PR evidence, the same convergent
     way it handles every other post-merge state. Nothing merge-dependent tears down here (no
     worktree removal, no claim release, no run-dir archival) — those wait for `merged` evidence,
     whether this same session later observes it (unlikely — sessions don't poll) or the
     reconciler does at its next trigger point (`_shared/pr-run-comments.md`'s consumer table;
     session-start, dispatch queue-pull, routine kickoffs, tidy, all converge on this
     eventually).

## Step 4: Post-merge reconcile (outcome `merged` only)

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" reconcile
```

Fast-forwards the mirror (the local integration branch — "mirror" and "local main" name the same
object; this file uses "mirror" throughout since that is `bin/lib/reconcile`'s own term),
releases the claim, and archives the run dir. This is convergent cleanup, not owed — a failure
here (network, `gh` blip) is logged and left for the next trigger point, never retried inline and
never a reason to report anything other than `merged`. **No `git merge`, `git commit`, or
`git push` runs in the main checkout anywhere in this procedure** — the reconciler's own
`mirrorFastForward` is a strict `--ff-only`, never a merge that could conflict, so it needs no
worktree, no branch guard, and no close-run relief.

## Conflict path

Exactly **one** update-from-base attempt, from inside the run's own worktree — never inside the
main checkout, and never more than once:

```bash
git -C "{worktree-path}" fetch origin {integration-branch}
git -C "{worktree-path}" merge origin/{integration-branch}
```

- **Clean** (no conflict markers): push and retry the merge once, from the top of Step 3:

  ```bash
  git -C "{worktree-path}" push origin {branch}
  ```

- **Conflict markers remain**: this is what "unresolvable headlessly" means — stop, do not
  attempt resolution. Leave the PR ready (already undrafted, never re-drafted) with a comment
  explaining the conflict, and report outcome `pending-review`. A human resolves it the ordinary
  way — check out the branch, resolve, push — no scratch-worktree ceremony needed, since the
  conflict already surfaced inside the run's own real worktree, not a throwaway one.

**Sequential multi-branch merges** (`flow/worktree-merge.md`'s reconciliation): the invoking
session serializes them one at a time. Each later branch's own single update-from-base attempt
merges from whichever tip the just-advanced integration branch now has — a genuinely later
branch's conflict is checked against real current state, not a stale snapshot from before the
earlier branches merged.

## Outcome vocabulary

Replaces `ready-to-merge` (folded into `merged`/`armed` — see Step 3.6) and `pr-opened` (retired
— under pr-first the PR already exists from run start, so there is no longer a distinct
"finish reached, PR opened just now" transition to report).

| Outcome | Meaning | Cleanup owed by this call |
|---|---|---|
| `merged` | Confirmed synchronously via `gh pr view` | Step 4's reconcile call |
| `armed` | `--auto` armed, checks still pending | None — reconciler completes it later |
| `pending-review` | Checks red, conflict unresolvable headlessly, permission denied, or an unrecognized error | None — PR stays ready, human decides |
| `failed` | This run never reached the merge attempt at all (upstream HARD-GATE) | Handled entirely by Settle, before this procedure is ever invoked |

## Comment ordering

Anything that must land on the PR posts **before** the merge call (Step 3) — the verdict/brief
comments from `_shared/pr-run-comments.md` already do, per their own citing sites' phase-exit
ordering. Anything this procedure itself posts (the conflict/degrade comment) is
**after**-the-fact information about why the merge didn't complete, so it posts once the outcome
is known, never speculatively before.

## Local-merge fallback

Not this file's concern — `local-merge` projects keep each citing file's own pre-#411 procedure
in substance: the branch-switch guard, the `close-run` E1 relief, the push-from-worktree rule,
and (for `flow/worktree-merge.md`) the scratch-worktree conflict procedure. Each citing file
keeps a compact section stating this rather than duplicating the old prose here.
