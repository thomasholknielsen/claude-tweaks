# Step 8.5 — Dependency Read-Only Permissions (detailed procedure)

*Core Bootstrap step — order-dependent, so later steps may assume earlier ones completed; runs unconditionally and idempotently, acting only on missing state. Gated by `version-check.md` in this directory.*

Reading an installed dependency's own source or type definitions (`node_modules/**`) is routine, safe research — but with no permission entry for it, every such `Read` is denied by default, and the denial recurs identically on every re-inspection, within a session and across sessions (#811, #836). Claude Code checks path rules against `Edit(path)`/`Read(path)` only; it makes a best-effort attempt to apply matching `Read` rules to other file-reading tools like `Grep` and `Glob` automatically, so a separate `Grep(...)` entry is never consulted and can produce a startup warning — the `Read` entries below already cover `Grep`/`Glob` for the same paths, and no separate `Grep(...)` entry is seeded. On a pnpm workspace, reads resolve through the nested `node_modules/.pnpm/**` layout, so this step also seeds an explicit `.pnpm/**` entry as a belt-and-braces measure — whether `node_modules/**` alone reliably matches the dot-prefixed `.pnpm` segment is unverified.

**Detect a pnpm workspace:** a `pnpm-lock.yaml` file at the project root, or a `.pnpm` directory under `node_modules/`.

**Compute the entries to seed** (read-only per above — never `Edit`/`Write`/`Bash`, so nothing here grants write or execute access under `node_modules`):

| Condition | Entries |
|---|---|
| Always | `Read(node_modules/**)` |
| pnpm workspace detected | `Read(node_modules/.pnpm/**)` |

**Merge into `.claude/settings.json`:**

1. Read `.claude/settings.json` if it exists; treat it as `{}` if it doesn't, or if it exists but fails to parse as valid JSON — same posture as `version-check.md`'s "treat as absent if missing or malformed" handling of `init-state.yml` (an earlier Core Bootstrap step may not have created it yet — Step 8.5 is the first step in this skill's own numbering that's guaranteed to write it if nothing else has).
2. Back up first when the file exists: `cp .claude/settings.json .claude/settings.json.bak` (nothing to back up when it doesn't).
3. Ensure `permissions.allow` is an array — create both keys if absent, and if `permissions.allow` exists but isn't an array, treat it as absent and replace it with a fresh array. Append only the computed entries above that are not already present (exact string match against existing array entries) — never remove, reorder, or deduplicate anything already there, and never touch `permissions.deny`.
4. Write the file.

**Check for a conflicting deny rule.** Before or after writing the allow entries, read the effective `permissions.deny` lists this project's settings inherit from — at minimum `~/.claude/settings.json` (user-level) and this project's own `.claude/settings.json`/`.claude/settings.local.json` if present — for any pattern that would also match `node_modules/**` (e.g. `Read(**/node_modules/**)`, `Read(node_modules/**)`). Deny always wins over allow, unconditionally, regardless of rule specificity or which settings file each lives in — an allow entry seeded here cannot override a broader deny already in place elsewhere. If a conflicting deny pattern is found, this step still seeds the allow entries (they're correct and will take effect for any project that doesn't have the broader deny), but also surfaces a note rather than silently reporting success:

> Note: a broader deny rule (`{pattern}` in `{file}`) already blocks `node_modules` reads and takes precedence over the allow entry just seeded — it will not take effect until that deny rule is narrowed or removed. This is a deliberate existing choice in `{file}`, not something `/init` will change automatically.

No conflicting deny found: nothing further to say — the seeded allow entries take effect as normal.

No prompt — this step is unconditional and strictly additive, the same posture as every other Core Bootstrap step (1-8.5): a read-only allowlist entry carries no risk profile that warrants an `AskUserQuestion` gate, unlike the Optional Enhancement steps (9 onward), which do prompt.

**Idempotent / drift-repair, with no extra logic needed.** Re-running `/claude-tweaks:init` re-checks and adds only what's missing on its own, because this step's merge (above) is already idempotent and Core Bootstrap's version-check gate (`version-check.md`) re-runs Steps 1-8.5 in full whenever the plugin version has advanced past what the project's `.claude-tweaks/init-state.yml` marker recorded — which is exactly the case for a project initialized by a pre-#836 plugin version. A user already on a post-#836 plugin version whose marker already matches (so Steps 1-8.5 would otherwise be skipped) can still force a re-check with `/claude-tweaks:init bootstrap`, which `version-check.md`'s own Exception always runs regardless of the marker.
