# Worktree Base Ref — Why `worktree.baseRef: head` Matters

Canonical explanation of the harness `worktree.baseRef` setting, referenced by
`init/bootstrap-steps.md` Step 6 (provisioning-time offer) and
`build/worktree-setup.md` (runtime post-creation verification). Both call sites
cite this same generic infrastructure fact from their own different moments in a
project's lifecycle — this file is the single place it's stated, so a future
correction (the harness changes its default, or `EnterWorktree` gains a base-ref
parameter) lands once instead of drifting between two independently-worded copies.

claude-tweaks branches a worktree from your **current local state** (the branch
you ran `/claude-tweaks:build` on, which may carry merged specs and in-progress
integration commits) — NOT from the remote default branch.

The native `EnterWorktree` tool exposes **no base-ref parameter** (it accepts
only `name`/`path`). The base is governed entirely by the harness setting
**`worktree.baseRef`**:

- `fresh` (the harness **default**) → branches from `origin/<default-branch>`.
  On a project whose integration branch is local and ahead of the remote
  default (e.g. a long-lived `dev`), this silently branches from a **stale**
  commit.
- `head` → branches from your current local HEAD. **This is the value
  claude-tweaks expects.**

Because the plugin cannot pass the base ref through `EnterWorktree`, this has
two consumers:

- **Provisioning time** (`init/bootstrap-steps.md` Step 6 item 4) — offer to
  write `worktree.baseRef: "head"` into `settings.json` up front, so the
  mismatch never occurs.
- **Runtime verification** (`build/worktree-setup.md` Common Step 1) — even
  with the setting correctly configured, verify the resulting base after every
  worktree creation and surface a mismatch loudly rather than letting it pass
  silently — belt-and-suspenders, since `settings.json` can drift (a fresh
  clone, a reset config, a project that never ran `/init`).

To set it directly: `{ "worktree": { "baseRef": "head" } }` merged into
`settings.json` (backup first — don't clobber existing keys).
