# Sibling-session check (Step 4)

Branches, claims, and labels are all remote-facing signals — none of them can see a live
session already standing in an unpushed worktree. `[IL-107]`'s actual incident was a
nine-task implementation, eleven commits deep in an unpushed worktree, nearly redone from
scratch for exactly this reason: `origin/main`, the record's labels, and the claim refs all
showed the work as untouched.

Before writing any claim, for each member of the selected group run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" check-sibling-sessions --record "$ISSUE"
```

Branch on the printed line:

- `claude-tweaks: sibling session may already hold record...` — names a live worktree (path,
  branch, pid) whose lock names that record. Surface it and stop the automated claim for this
  group. This is **not** an unconditional hard block: matching this plugin's "ambiguity
  resolves to allow, but never silently" posture elsewhere (e.g. E1's foreign-session
  warning), a human/agent that confirms the other session is actually stale can still proceed
  with the claim manually.
- `claude-tweaks: no sibling-session conflict found for record...` — proceed to the claim
  procedure below exactly as before this check existed. The check also fails open (an
  unresolvable `git worktree list`, a dead pid, or an unparseable lock all print this same
  no-conflict line) — never treat silence as a reason to escalate.

This check is additive to the existing branches/claims/labels check that follows in Step 4,
not a replacement for it, and it does not alter that check's own logic.
