# Worktree Setup — Shared Procedures

Canonical home for the two staleness-protection procedures every worktree-creation call site
needs: catching a freshly created worktree up with the integration branch (unconditional), and
warning the owner of the *current* branch before creating one, when that branch may itself be
behind the integration branch. Consolidates what were two byte-identical copies
(`skills/flow/validation.md` Step 2.5, `skills/build/worktree-setup.md` Step 1) — see CLAUDE.md's
`[IL-32]`. `skills/_shared/scratch-worktree.md` Section 3 cites the Post-creation catch-up section
below instead of carrying its own copy.

## Resolving `{integration-branch}`

The two sections below resolve `{integration-branch}` differently, on purpose — they answer
different questions and must not be folded into one shared resolution:

- **Post-creation catch-up** runs inside a brand-new worktree whose branch has no `@{upstream}`
  of its own yet, so it resolves via `skills/_shared/integration-branch.md`'s full canonical
  ladder, git-inference rank included — there is nothing else to fall back to.
- **Pre-flight divergence check** compares the *current, already-tracked* branch before
  creating anything, so it deliberately **excludes** that ladder's git-inference rank — see its
  own subsection below for why.

Using either section's resolution for the other's purpose reintroduces a bug: the git-inference
rank shadows a tracked branch's real `@{upstream}` (false-positive divergence warnings on
ordinary feature branches), while the narrower policy-then-upstream resolution has no fallback
for a branch that was never pushed and carries no upstream at all.

## Post-creation catch-up

Unconditionally, before anything else runs in the new worktree:

```bash
git fetch origin {integration-branch}
git merge origin/{integration-branch}
```

Resolve `{integration-branch}` via `skills/_shared/integration-branch.md`'s canonical ladder —
never hardcode `main`. Run this regardless of which creation path was used (`EnterWorktree`,
`git worktree add`, or any other), and regardless of whether the project has `worktree.baseRef`
configured correctly: the harness default is `fresh` (branches from `origin/<default-branch>`),
while claude-tweaks expects `head` (branches from current local HEAD) — see
`_shared/worktree-base-ref.md`. A worktree landing on the wrong default is an observed failure,
not a theoretical one (`[IL-106]`), and this fetch-then-merge is what makes the rest of any
calling procedure correct either way — never skipped, never conditioned on the creation path,
never assumed already-satisfied just because the worktree is brand new.

On a merge conflict, resolve it per `_shared/git-discipline.md`'s Merge conflict resolution —
never reset or discard. A freshly created worktree has no local commits yet to protect, so a
conflict here means the new branch's starting point (the harness's chosen base) actually
disagrees with the integration branch's tip; read both sides and produce a merged result, or
surface it to the user if genuinely ambiguous. This is the one case where "unconditional" still
needs a human/agent decision.

## Pre-flight divergence check

Read the `merge-check` setting from `.claude-tweaks/policy.yml` (default: `true`). When enabled,
compare against the **upstream of the current branch** (or the detected remote default), never a
hardcoded `main`:

A project that pins an integration branch names the expected fork point directly, replacing the
upstream-then-`origin/HEAD` guess. Only the *stated* ranks of `skills/_shared/integration-branch.md`
apply here — the policy line below, and any explicit argument or CLAUDE.md statement above it.
**That fragment's git-inference rank must not be used for this check:** it resolves a branch in
nearly every repo, which would shadow the `@{upstream}` fallback and make a worktree-creation
call site on a tracked feature branch compare against the wrong ref and warn about a divergence
that isn't there.

```bash
# Integration branch when the project pins one, else the upstream of the current
# branch, else the remote default branch (origin/HEAD). Assigned and used in the
# same call — a fresh shell per Bash invocation means a value resolved elsewhere
# would arrive empty here, and an empty UPSTREAM silently skips the check.
INTEGRATION_BRANCH=$(grep -E "^integration-branch:" .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*integration-branch:[[:space:]]*//; s/[[:space:]]*#.*$//')
UPSTREAM="${INTEGRATION_BRANCH:+origin/$INTEGRATION_BRANCH}"
[ -n "$UPSTREAM" ] || UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null) \
  || UPSTREAM="origin/$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')"
git fetch "${UPSTREAM%%/*}" "${UPSTREAM#*/}" 2>/dev/null
ahead=$(git rev-list --count "HEAD..$UPSTREAM" 2>/dev/null)
```

If `ahead > 0`, surface the divergence (`git log --oneline HEAD..$UPSTREAM | head -5`) and call
`AskUserQuestion`:
- `question`: `"{UPSTREAM} is {N} commits ahead — how do you want to proceed?"`, `header`:
  `"Merge check"`, `multiSelect`: `false`
- Option 1 — `label`: `"Rebase first (Recommended)"`, `description`: `"Rebase onto {UPSTREAM}
  before continuing"`
- Option 2 — `label`: `"Continue anyway"`, `description`: `"Proceed as-is; add an ops ledger
  entry noting the divergence"`

In `auto` mode, automatically choose option 2 and add an `ops` ledger entry; also log:

```
AUTO {time} — pre-flight merge-check — {UPSTREAM} is {N} ahead. Continued and added ops ledger
entry. Reversibility: low (divergence persists).
```

Each caller states its own log/memo-stamp conventions around this block (e.g. `/flow`'s Step 2.5
stamps `MERGE_CHECK_PASSED`/`UPSTREAM_SHA` for `/build` to skip a redundant re-run — see
`flow/validation.md`) — this section owns only the check itself, not what a caller does with its
result.

## Anti-patterns

| Pattern | Why it fails |
|---|---|
| Using the Pre-flight divergence check's narrower resolution for Post-creation catch-up | A brand-new worktree's branch has no `@{upstream}` yet — the narrower resolution has nothing to fall back to and silently no-ops |
| Using Post-creation catch-up's full ladder for the Pre-flight divergence check | Git-inference shadows a tracked branch's real `@{upstream}`, producing false-positive divergence warnings on ordinary feature branches |
| Skipping Post-creation catch-up because `worktree.baseRef` is set correctly | The catch-up is unconditional precisely because the plugin cannot verify `baseRef` took effect through `EnterWorktree` — see `[IL-106]` |
| Restating either section's block in a caller skill instead of citing this file | Recreates the exact duplication this file exists to eliminate |
