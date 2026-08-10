# Scratch Worktree — Post-Teardown Write Procedure

Canonical procedure for provisioning a throwaway, write-legal checkout once a feature
worktree is already gone. Consumed by `/wrap-up`'s `residue-sweep.md` (the `remedy: auto`
branch — an auto-fixable residue finding whose fix needs an `Edit`/`Write`/`commit`/`push`)
and by `/tidy` (record-creation writes under `work-backend: local-files`, and the Step 7
mutations described under `worktree.always: true`).

**Why this exists.** Once a feature worktree is torn down, `/wrap-up` and `/tidy` are back in
the main checkout. On a project with `worktree.always: true` set
(`.claude-tweaks/policy.yml`), the PreToolUse gate denies some of the writes those two steps
may still need to make from there — any write whose target isn't already inside a linked git
worktree. Exactly what counts as a covered write is stated once, canonically, in
`skills/_shared/policy-schema.md`'s `worktree.always` coverage block. This file cites that
block rather than restating it, per CLAUDE.md's own rule against duplicating it (`[IL-93]`:
five files once restated an earlier, narrower version of that list, and all five went stale
the next time the gate widened without a matching prose sweep). Check that block, not this
paragraph, for the current, exact list of tools/git actions/Bash write shapes it covers.

## 1. When to provision

Provision **only on demand**. The trigger is at least one finding whose remedy is `remedy:
auto` **and** whose fix needs a write the coverage block above covers. Two remedy shapes never
qualify, because both are already legal straight from the main checkout: removing a worktree
(`git worktree remove` / `ExitWorktree`) and deleting a local branch (`git branch -d`). A run
that finds no such finding must never create a worktree — nothing below is unconditional, and
a project with no `worktree.always` policy at all never needs this procedure in the first
place, since every write is already legal there.

## 2. Creating it

Use the **native tool** (`EnterWorktree`) when one is available. Fall back to `git worktree
add` only when none is — `superpowers:using-git-worktrees` Step 1a before Step 1b — and when
falling back, create it under **`.worktrees/`**, verifying it's gitignored first (that skill's
own Safety Verification substep), adding it if not.

**Never `git worktree add` under `.claude/worktrees/`.** `.worktrees/` (git-fallback-owned)
and `.claude/worktrees/` (native-tool-owned) are two permanently separate ownership domains,
not two names for the same thing —
`docs/decisions/0004-worktree-two-domain-convention.md`. Placing a git-created worktree
inside the harness-owned directory is the exact hazard that ADR rejects: the harness's own
bookkeeping never learns about it, so a later `git worktree remove` — raw, or via the
harness's own reaper — can remove it out from under whoever is standing in it.

Detect or enumerate existing worktrees via `git worktree list`, or by comparing
`git rev-parse --git-dir` against `--git-common-dir`, never by asserting a directory name
(same ADR).

## 3. First action inside: catch up with the integration branch

Run `skills/_shared/worktree-setup.md`'s `## Post-creation catch-up` unconditionally, before
anything else runs in the new worktree. That section's fetch+merge procedure, its
`{integration-branch}` resolution, and its conflict-resolution note apply here as written —
this file no longer carries its own copy (`[IL-32]`).

## 4. Applying remedies

Apply each remedy as **its own commit**, in this same worktree, one at a time. Never batch two
or more remedies into a single commit — a mid-sequence failure this way leaves every
already-applied remedy committed and intact, instead of losing completed work along with
whichever remedy failed.

## 5. Returning to the integration branch

Once every remedy for this run is committed, return the whole batch in one step:

```bash
git push . <sha>:{integration-branch}
```

`<sha>` is the worktree branch's HEAD after step 4 — resolve it with `git rev-parse HEAD` and
paste the literal value into this command. Shell state does not survive between separate Bash
calls in this worktree (see Shell constraint, below), so it cannot be carried in a variable
across calls. This updates the local `{integration-branch}` ref directly, from inside the
worktree, with no checkout of that branch required — and the write is legal here regardless of
`worktree.always`, since the gate never denies a write whose target is already inside a linked
worktree.

It is refused when `{integration-branch}` is checked out elsewhere (typically the main
checkout) — git won't move a ref a working tree already has open. When refused, run the merge
from wherever it **is** checked out instead, verifying the branch in the same compound command
so a concurrent session that switched it underfoot can't cause a merge onto the wrong branch
(`[IL-05]`):

```bash
[ "$(git branch --show-current)" = "{integration-branch}" ] && git merge --ff-only <sha>
```

`git merge` itself is never a covered action (only `commit`/`push` targets are, per the
coverage block cited above), so this is legal from the main checkout with no further
provisioning. Whether the resulting local update also needs pushing on to `origin` is the
calling procedure's own concern, not this one's — `skills/wrap-up/residue-sweep.md`, for
instance, records the landed `sha` as that finding's `fixed` resolution and leaves publishing
to whatever push step the surrounding workflow already runs.

**That push is itself a covered write.** `git push origin {integration-branch}` targets a
`commit`/`push` action, so it is denied the same way from the main checkout — regardless of
which of the two forms above landed the merge. Run it from inside a worktree instead (this
one, if it is still live, or a fresh throwaway one otherwise); which branch that worktree has
checked out doesn't matter, since `{integration-branch}` is a shared ref in the common `.git`
and `git push origin {integration-branch}` pushes it from any worktree regardless of what that
worktree's own `HEAD` points at.

If neither form succeeds — `{integration-branch}` is checked out somewhere unreachable, or the
merge itself conflicts — stop and surface it rather than forcing a resolution. This procedure
solves the write-legality problem; a genuine merge conflict here is the same judgment call any
other merge conflict is (`_shared/git-discipline.md`).

## 6. Tearing down

Tear down via **`ExitWorktree`**, never a raw `git worktree remove` — the worktree carries a
live lock, and the raw command fails on it (`[IL-58]`).

The two domains are asymmetric here too. If teardown fails or is skipped, `SessionStart`'s
reaper (`bin/lib/hooks/worktree-reap.js`) can later collect an abandoned worktree — but
**only** in the native domain: it enumerates and considers worktrees under
`{REPO_ROOT}/.claude/worktrees/` alone. A `.worktrees/`-domain worktree (the git-fallback
path) has no reaper at all and must be torn down explicitly every time, or it accumulates
silently — and would itself become a `kind: worktree` finding on the next residue sweep.

## 7. Shell constraint

After entering a worktree, `&&` chains and heredocs are refused by shape — issue one plain
command per Bash call. Use `Edit` to append to a file rather than a heredoc append, and (as
noted in step 5) resolve any value a later call needs explicitly and paste it in literally —
it will not survive in a shell variable between calls.
