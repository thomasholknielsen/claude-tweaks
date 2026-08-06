# Integration Branch — Canonical Resolution

The branch where finished work lands and new work starts. Canonical for every consumer that needs to know which branch represents this project's current state — read it, start from it, add to it, or compare against it.

## Why this exists

GitHub's default-branch pointer is a *display* fact: which branch the repo opens on, and where issue auto-closing works. On a `dev` → `staging` → `main` model it is not where development happens. Four sites in this plugin used to resolve that pointer independently, and each failed differently — one aborted, one silently measured a change against a tree that diverged 102 commits ago (#132, #61). Stating the branch once, here, is what keeps them from drifting apart again.

## Resolution ladder

Take the **first** source that yields a branch name; once one does, the rest are not consulted.

1. **An explicit argument** — `/claude-tweaks:routine`'s `--branch <name>`. Non-empty is the only check.

   `/claude-tweaks:assess-agent-autonomy`'s `--base <ref>` is **not** a rank of this ladder: it names an already-known merge-base *commit*, not a branch, and a caller that passes it short-circuits before this ladder is consulted at all. It is listed here only so the two are not confused — every rank below yields a branch name.
2. **`skills/{skill}/routine-template.yml`'s `branch:` field** — routine instantiation only; no other consumer has a template. Normally unset (see `_shared/routine-template-schema.md`).
3. **A flat `integration-branch:` line in `.claude-tweaks/policy.yml`:**

   ```bash
   INTEGRATION_BRANCH=$(grep -E "^integration-branch:" .claude-tweaks/policy.yml 2>/dev/null | head -1 | sed 's/.*integration-branch:[[:space:]]*//; s/[[:space:]]*#.*$//')
   ```

   The trailing `s/[[:space:]]*#.*$//` strips an inline comment — this value is pasted into checkout and merge-base commands, where a trailing `# note` would become part of the branch name.
4. **A branching model stated unambiguously in CLAUDE.md prose** — "development happens on `dev`", "branch from `dev`, PR into `dev`". A section that merely *names* several branches, or describes a release train without saying where work lands, resolves nothing: fall through to 5 rather than guessing which name is the one. (This reads project *documentation*, not configuration — it is not a config-key lookup and is unaffected by policy.yml being the sole config home.)
5. **Git — the current branch, checked against the GitHub default:**

   ```bash
   git rev-parse --git-dir --git-common-dir
   git branch --show-current
   gh repo view --json defaultBranchRef -q .defaultBranchRef.name 2>/dev/null || git remote show origin | sed -n '/HEAD branch/s/.*: //p'
   ```

   - **Discard the current branch when it isn't a real one.** If the two `git rev-parse` paths differ, this session is inside a linked worktree, so `git branch --show-current` is a throwaway isolation branch that will not exist later — never propose it. Fall through to the GitHub default alone and say so wherever the choice is surfaced. Same worktree detection `[IL-61]` requires, for the same reason: under `worktree.always` the obvious git question answers about the worktree, not the project.
   - Both resolve and **match** → use it.
   - Both resolve and **differ** → do not assume silently. Propose the **current** branch where a human will see it, keeping both values in hand; where no human will (`--defaults`, a headless firing), fall back to the **GitHub default** and print the mismatch without stopping. Never silently pin a branch nobody confirmed.
   - Only one resolves → use that one.
6. **Nothing resolved** → the consumer's own fallback below.

Record which source won — consumers that surface a preview name it.

## Per-consumer fallback

Rank 6 is deliberately per-consumer, because they degrade differently. In every case the unresolved path reproduces the behavior that consumer had before this fragment existed, so a project that sets nothing sees no change.

| Consumer | Uses it for | Fallback when nothing resolved |
|---|---|---|
| `/claude-tweaks:routine` | Substituting `{{TARGET_BRANCH}}` into a routine's prompt | Prose telling the cloud agent to resolve the branch itself at firing time |
| `/claude-tweaks:dispatch`, `/claude-tweaks:wrap-up` | Merge target and push target | `git remote show origin` / `gh api default_branch`, as today |
| `/claude-tweaks:assess-agent-autonomy` | `merge-base` for blast radius | `gh api default_branch`, as today; an unresolvable value is already the documented `needs-human` inconclusive-read case |
| `/claude-tweaks:build`, `/claude-tweaks:flow` | Expected fork point | Upstream of the current branch, else `origin/HEAD`, as today |

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Resolving the GitHub default branch inline instead of citing this file | That is exactly how four sites came to answer one question four different ways, with nothing objecting. `tests/integration-branch-conformance.test.js` fails on a new un-cited resolver |
| Using the branch the main checkout currently has checked out | A concurrent session switches it underfoot — the reason `/claude-tweaks:dispatch`'s merge guard exists at all |
| Pinning the current branch inside a linked worktree | It is a throwaway isolation branch; it will not exist when a routine fires or a later run merges |
| Treating rank 4's CLAUDE.md read as a config-key lookup | It reads prose describing a branching model, not a `key: value` line. Design B's policy.yml consolidation does not remove it |
