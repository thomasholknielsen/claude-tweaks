# Worktree Base Ref — Why `worktree.baseRef: head` Matters

Canonical explanation of the harness `worktree.baseRef` setting, referenced by
`init/bootstrap/step-06-worktree-configuration.md` (provisioning-time offer) and
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

- `fresh` (the harness **default**) → documented as branching from
  `origin/<default-branch>`. **Observed once to actually branch from the
  local default branch's ref instead** (`1d4a34b6`, 69 commits behind an
  already-fetched `origin/main` at `cea8caa3` — this session's own shared
  worktree for specs #192/#307/#308). One observation is not proof the
  documented behavior is wrong in general — `EnterWorktree`'s exact resolution
  logic is a harness-internal, unversioned detail this plugin doesn't own
  (`[IL-80]`) — but it's also not proof the claim above is *right*, so treat
  "branches from `origin/<default-branch>`" as unconfirmed rather than settled
  until corroborated by more than one observation. Either way, a project whose
  integration branch is local and ahead of (or behind) the remote default can
  end up on a **stale** base regardless of which direction `fresh` actually
  resolves against.
- `head` → branches from your current local HEAD. **This is the value
  claude-tweaks expects.**

Because the plugin cannot pass the base ref through `EnterWorktree`, and
because which direction (if any) `fresh` lands stale isn't reliably knowable in
advance, this has two consumers:

- **Provisioning time** (`init/bootstrap/step-06-worktree-configuration.md` item 4) — offer to
  write `worktree.baseRef: "head"` into `settings.json` up front, so the
  mismatch is less likely to occur.
- **Runtime correction** (`build/worktree-setup.md` Common Step 4, via
  `_shared/worktree-setup.md`'s Post-creation catch-up) — unconditionally
  catch the new worktree up in both directions (behind the integration
  branch's `origin/{branch}`, and behind the branch it was meant to start from
  locally) immediately after creation, every time, regardless of whether
  `worktree.baseRef` is configured correctly. This replaced an earlier
  verify-the-base-and-STOP-on-mismatch step — that mechanism only compared the
  worktree's actual base against local HEAD *at creation time*, so it could
  not have caught this exact case (local HEAD was itself the stale value) —
  the unconditional catch-up doesn't need to know in advance which direction,
  if any, went wrong.

To set it directly: `{ "worktree": { "baseRef": "head" } }` merged into
`settings.json` (backup first — don't clobber existing keys).
