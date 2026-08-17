# Worktree Setup — Shared Procedures

Canonical home for the three staleness-protection procedures every worktree-creation call site
needs: fast-forwarding the main checkout's own integration-branch ref before creating anything
(cheap, best-effort), catching a freshly created worktree up with the integration branch
(unconditional), and warning the owner of the *current* branch before creating one, when that
branch may itself be behind the integration branch. Consolidates what were two byte-identical copies
(`skills/flow/validation.md` Step 2.5, `skills/build/worktree-setup.md` Step 1) — see CLAUDE.md's
`[IL-32]`. `skills/_shared/scratch-worktree.md` Section 3 cites the Post-creation catch-up section
below instead of carrying its own copy. For the harness's separate worktree-session Bash guard (what commands fail in a worktree session, and why), see `skills/_shared/scratch-worktree.md`'s "## 7. Shell constraint".

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

## Pre-creation reconcile

Before any worktree-creation call (`EnterWorktree` or `git worktree add`), fast-forward the
*main checkout's* local `{integration-branch}` to origin's tip:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" reconcile
```

This is the cheap common-case optimization: it makes the Post-creation catch-up below a no-op
in the ordinary case, since a freshly cut worktree branch then starts at a tip that's already
current. It does not replace that catch-up, and is never a substitute for it — reconcile only
advances the *main checkout's* own `{integration-branch}` ref, and never touches a worktree's
branch. A worktree cut before reconcile ran, or cut concurrently by a sibling session that
advances `origin` afterward, can still start stale — the Post-creation catch-up stays the
unconditional backstop regardless of whether this step ran, or ran successfully. Never `git
checkout` or `git pull` in the shared checkout to accomplish this fast-forward — `reconcile`'s
mirror-ff is the sanctioned, worktree-safe mechanism (it never merges, runs strict
`--ff-only`, and needs no worktree guard).

## Post-creation catch-up

Unconditionally, before anything else runs in the new worktree:

```bash
git fetch origin {integration-branch}
git merge origin/{integration-branch}
```

The `git fetch` above cites, rather than duplicates, what `bin/lib/reconcile`'s mirror-ff
check already does for the main checkout (#407/#408) — most call paths into worktree
creation (`session-start.js`, `dispatch/SKILL.md`'s queue pull, `tidy/scan-procedures.md`)
already ran `reconcile()` earlier in the same session, so `origin` is often already fresh
here. Run the fetch anyway — reconcile is best-effort and may have been skipped or
degraded (no remote, network failure) — but do not substitute reconcile for this step's
`git merge`: reconcile's mirror-ff only advances the *main checkout's* own
`{integration-branch}` ref, and never touches a worktree's own branch, which is exactly
what this merge does.

Resolve `{integration-branch}` via `skills/_shared/integration-branch.md`'s canonical ladder —
never hardcode `main`. Run this regardless of which creation path was used (`EnterWorktree`,
`git worktree add`, or any other), and regardless of whether the project has `worktree.baseRef`
configured correctly: the harness default is `fresh` (branches from `origin/<default-branch>`),
while claude-tweaks expects `head` (branches from current local HEAD) — see
`_shared/worktree-base-ref.md`. A worktree landing on the wrong default is an observed failure,
not a theoretical one (`[IL-106]`), and this fetch-then-merge is what makes the rest of any
calling procedure correct either way — never skipped, never conditioned on the creation path,
never assumed already-satisfied just because the worktree is brand new.

**Also catch up the other direction, when the caller captured one.** The fetch+merge above only
protects the "worktree fell behind the integration branch" direction. If the branch the worktree
was meant to start from itself carries local-only commits not yet on `origin` (observed in
practice: `worktree.baseRef: fresh` has been seen to actually resolve against a stale *local*
default-branch ref rather than the freshly fetched `origin/<default-branch>` its own name
implies), those commits are silently absent from the new worktree with no signal — the same gap
the base-ref verification this section replaced used to catch, in that one direction. When the
calling procedure captured a pre-creation `EXPECTED_BASE` (`git rev-parse HEAD` on the branch the
worktree starts from, taken *before* creation), also run:

```bash
git merge {EXPECTED_BASE}
```

This is safe unconditionally: on a freshly created branch with no commits of its own,
`{EXPECTED_BASE}` and `origin/{integration-branch}` are either already ancestor-related (the
merge is a no-op) or have genuinely diverged, in which case this merge surfaces exactly the same
way any other conflict does (see below) — there is no case where running it loses information a
caller that captured `EXPECTED_BASE` would want kept. A caller with no `EXPECTED_BASE` to
capture (there was no "branch the worktree starts from" — e.g. a from-scratch scratch worktree)
skips this merge; the fetch+merge above still runs on its own.

On a merge conflict from either merge, resolve it per `_shared/git-discipline.md`'s Merge conflict
resolution — never reset or discard. A freshly created worktree has no local commits yet to
protect, so a conflict here means the new branch's starting point (the harness's chosen base)
actually disagrees with the integration branch's tip, or with the branch it was meant to start
from; read both sides and produce a merged result, or surface it to the user if genuinely
ambiguous. This is the one case where "unconditional" still needs a human/agent decision.

**Fail open on fetch/merge command failure**, distinctly from a conflict: no `origin` remote, no
network, or an integration branch that was never pushed all make `git fetch` exit non-zero before
any merge is attempted. Treat this the same way the Pre-flight divergence check treats an empty
`UPSTREAM` (below) — log it and proceed rather than blocking worktree setup on a check whose
purpose is staleness protection, not connectivity verification. A caller with `events.jsonl`
access logs the failure distinctly from a same-shaped successful no-op merge — a reader should be
able to tell "checked, clean" apart from "check didn't run," the same distinction `[IL-105]`'s
own repair-loop guidance asks for elsewhere in this plugin.

**Log the correction when it changes anything.** When either merge actually advances the
worktree's branch (`git rev-parse HEAD` differs before and after — not a no-op), the calling
procedure appends an entry to the run's `decisions.md` under its own heading:
`AUTO {time} — Post-creation catch-up: worktree branch advanced from {before short} to {after
short} ({N} commit(s) from {origin/{integration-branch} or EXPECTED_BASE}). Reversibility: high
(worktree has no other commits yet).` A no-op merge (branch tip unchanged) writes nothing — this
mirrors `multi-spec.md`'s own pre-flight verify sweep, which skips the ledger write on a clean
sweep rather than logging "nothing found."

## Pre-flight divergence check

Resolve the `branch-divergence-check` setting via
`node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" branch-divergence-check`. When enabled,
compare against the **upstream of the current branch** (or the detected remote default), never a
hardcoded `main`:

A project that pins an integration branch names the expected fork point directly, replacing the
upstream-then-`origin/HEAD` guess. Only the *stated* ranks of `skills/_shared/integration-branch.md`
apply here — the policy read below, and any explicit argument or CLAUDE.md statement above it.
**That fragment's git-inference rank must not be used for this check:** it resolves a branch in
nearly every repo, which would shadow the `@{upstream}` fallback and make a worktree-creation
call site on a tracked feature branch compare against the wrong ref and warn about a divergence
that isn't there.

```bash
# Integration branch when the project pins one, else the upstream of the current
# branch, else the remote default branch (origin/HEAD). Assigned and used in the
# same call — a fresh shell per Bash invocation means a value resolved elsewhere
# would arrive empty here, and an empty UPSTREAM silently skips the check.
INTEGRATION_BRANCH=$(node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values integration-branch)
UPSTREAM="${INTEGRATION_BRANCH:+origin/$INTEGRATION_BRANCH}"
[ -n "$UPSTREAM" ] || UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null) \
  || UPSTREAM="origin/$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')"
git fetch "${UPSTREAM%%/*}" "${UPSTREAM#*/}" 2>/dev/null
ahead=$(git rev-list --count "HEAD..$UPSTREAM" 2>/dev/null)
```

If `ahead > 0`, surface the divergence (`git log --oneline HEAD..$UPSTREAM | head -5`) and call
`AskUserQuestion`:
- `question`: `"{UPSTREAM} is {N} commits ahead — how do you want to proceed?"`, `header`:
  `"Divergence"`, `multiSelect`: `false`
- Option 1 — `label`: `"Rebase first (Recommended)"`, `description`: `"Rebase onto {UPSTREAM}
  before continuing"`
- Option 2 — `label`: `"Continue anyway"`, `description`: `"Proceed as-is; add an ops ledger
  entry noting the divergence"`

In `auto` mode, automatically choose option 2 and add an `ops` ledger entry; also log:

```
AUTO {time} — pre-flight branch-divergence-check — {UPSTREAM} is {N} ahead. Continued and added ops ledger
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
| Skipping the `{EXPECTED_BASE}` merge because the fetch+merge against origin "already caught the worktree up" | Origin-relative catch-up only protects the behind direction — a caller that never captures `EXPECTED_BASE` has no protection against locally-committed-but-unpushed work silently missing from the new worktree |
| Treating a fetch/merge command failure the same as a clean no-op in the log | Both look like "nothing happened" to a reader unless logged distinctly — see the fail-open note above |
