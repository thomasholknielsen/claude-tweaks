# Step 8.5 — Dependency Read-Only Permissions (detailed procedure)

*Core Bootstrap step — order-dependent, so later steps may assume earlier ones completed; runs unconditionally and idempotently, acting only on missing state. Gated by `version-check.md` in this directory.*

Reading an installed dependency's own source or type definitions (`node_modules/**`) is routine, safe research — but with no permission entry for it, every such `Read`/`Grep` is denied by default, and the denial recurs identically on every re-inspection, within a session and across sessions (#811, #836). On a pnpm workspace, reads resolve through the nested `node_modules/.pnpm/**` layout — a `**` glob rooted at plain `node_modules/**` does not reliably match a dot-prefixed path segment like `.pnpm`, so an allowlist scoped only to the top-level pattern still leaves those reads denied. This step seeds both.

**Detect a pnpm workspace:** a `pnpm-lock.yaml` file at the project root, or a `.pnpm` directory under `node_modules/`.

**Compute the entries to seed** (read-only — `Read`/`Grep` only; never `Edit`/`Write`/`Bash`, so nothing here grants write or execute access under `node_modules`):

| Condition | Entries |
|---|---|
| Always | `Read(node_modules/**)`, `Grep(node_modules/**)` |
| pnpm workspace detected | `Read(node_modules/.pnpm/**)`, `Grep(node_modules/.pnpm/**)` |

**Merge into `.claude/settings.json`:**

1. Read `.claude/settings.json` if it exists; treat it as `{}` if it doesn't (an earlier Core Bootstrap step may not have created it yet — Step 8.5 is the first step in this skill's own numbering that's guaranteed to write it if nothing else has).
2. Back up first when the file exists: `cp .claude/settings.json .claude/settings.json.bak` (nothing to back up when it doesn't).
3. Ensure `permissions.allow` is an array (create both keys if absent). Append only the computed entries above that are not already present (exact string match against existing array entries) — never remove, reorder, or deduplicate anything already there, and never touch `permissions.deny`.
4. Write the file.

No prompt — this step is unconditional and strictly additive, the same posture as every other Core Bootstrap step (1-8.5): a read-only allowlist entry carries no risk profile that warrants an `AskUserQuestion` gate, unlike the Optional Enhancement steps (9 onward), which do prompt.

**Idempotent / drift-repair, with no extra logic needed.** Re-running `/claude-tweaks:init` re-checks and adds only what's missing on its own, because this step's merge (above) is already idempotent and Core Bootstrap's version-check gate (`version-check.md`) re-runs Steps 1-8.5 in full whenever the plugin version has advanced past what the project's `.claude-tweaks/init-state.yml` marker recorded — which is exactly the case for a project initialized by a pre-#836 plugin version. A user already on a post-#836 plugin version whose marker already matches (so Steps 1-8.5 would otherwise be skipped) can still force a re-check with `/claude-tweaks:init bootstrap`, which `version-check.md`'s own Exception always runs regardless of the marker.
