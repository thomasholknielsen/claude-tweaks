# Init Cloud/Routine Parity Setup — Design

## Problem

A real, empirically-verified investigation in a different project (memenu-app, using
claude-tweaks) discovered that cloud sessions (claude.ai/code) and scheduled Routines
silently lack `claude-tweaks` and its dependencies, because:

1. Cloud sandboxes only see plugins declared in the **project-level**
   `.claude/settings.json#enabledPlugins` (paired with any custom marketplace under
   `extraKnownMarketplaces`) — they never inherit the user's local `~/.claude/settings.json`
   or `~/.claude.json`, since cloud sandboxes are fresh and have no access to the local
   machine's config.
2. Even with `enabledPlugins` correctly declared, a plugin isn't necessarily installed in a
   fresh cloud sandbox's first session — Claude Code's own automatic "install declared
   plugins on session start" mechanism only reliably takes effect for a session *after* the
   one currently launching. The workaround: the cloud environment's **Setup script** field
   (configured in the claude.ai/code environment settings UI, external to any repo) must run
   an explicit install step before Claude launches.
3. A separate, deeper gap: a plugin's skills/MCP tools can be uninvocable in a cloud
   session's very first exposure to that plugin, even after `claude plugin list --json`
   reports it installed — observed to self-heal one session later, with no config fix.

`claude-tweaks`'s own `/init` bootstrap skill never sets any of this up today — a project
that runs `/init` gets full local capability but has to rediscover this entire investigation
by hand before its cloud sessions or Routines work at all. This design adds a new `/init`
step that closes that gap for every project using claude-tweaks, going forward.

## Platform facts (verified, not assumed)

Confirmed via the Claude Code platform specialist against current official docs, not
inferred from the memenu-app conversation alone:

- Non-interactive plugin install: `claude plugin install <name>@<marketplace> --scope project`.
- A marketplace not yet known to Claude Code needs an explicit
  `claude plugin marketplace add <org>/<repo>` call — declaring it in
  `extraKnownMarketplaces` alone is not confirmed sufficient to skip this.
- The environment Setup script is a real, official, documented mechanism — configured only
  through the claude.ai/code environment settings UI (hover the cloud icon → settings), runs
  once per environment before Claude Code launches, ~5-minute budget, output cached (re-runs
  only on environment reconfiguration or ~7-day cache expiry). **No API or CLI sets this
  field remotely** — this repo's own `RemoteTrigger` tool is scoped to `/v1/code/triggers`
  (Routine CRUD) only, confirmed by inspecting its own schema; it has no environment-config
  action.
- The "materialized but not registered on first exposure, self-heals next session" behavior
  is **not** documented by Anthropic — it is an empirical observation from the memenu-app
  investigation's live testing, not a platform guarantee. This design documents it as an
  observed caveat, never as asserted platform behavior.

## Scope

Bootstraps cloud/Routine parity for exactly what claude-tweaks itself needs and can
verify, plus a bounded extension the user explicitly asked for:

1. **claude-tweaks's own hard dependencies** — itself + `superpowers` (required by many
   skills) — always declared.
2. **Mirroring other locally-enabled plugins** — batch-offered, not automatic, since
   claude-tweaks can't know which of a user's other plugins matter to a given project.
3. **`agent-browser` availability in the cloud sandbox** — required for `/browse`-dependent
   skills (`/stories`, `/visual-review`, `/review`, qa-agent, `/flow`) to function in cloud
   Routines; included in the generated script unconditionally (installing into an ephemeral,
   disposable cloud sandbox has none of the "global side-effect on the user's own machine"
   risk that gates `agent-browser`'s *local* auto-install policy in
   `_shared/browser-detection.md`).
4. **MCP-parity awareness** — report-only. MCP server configs can carry embedded credentials
   (API keys, tokens); auto-copying a locally-configured server into the project's committed
   `.mcp.json` would leak secrets into git history. This step only flags local-only servers
   by name — the user reviews and adds any that matter, manually.

Explicitly out of scope: anything requiring the Setup-script field to be set
programmatically (no such API exists); auto-detecting or installing arbitrary third-party
plugins/MCP servers a project might need beyond claude-tweaks's own dependency graph.

## Placement: renumbering, not fractional insertion

New step: **`Step 13 — Cloud/Routine Parity Setup (Optional)`**, inserted immediately before
the existing Routine Installation step. This repo already uses fractional numbering
elsewhere (Phase 8.5, Phase 1u.5/1u.6) and that was the initial proposal here too — but
`bootstrap-steps.md` carries an explicit, deliberate policy for this specific step group
("Order-agnostic and append-only... no renumbering is needed for future additions"),
and the user chose to renumber rather than extend that policy with a fractional exception.

**Renumbering:** existing Step 13 (Routine Installation) → 14, Step 14 (Non-Default-Branch
Issue Tracking) → 15, Step 15 (Work-Record Backend) → 16.

**Ordering rationale:** unlike the other steps in this group (which are genuinely
independent of each other, hence the append-only policy), this one has a real dependency —
a Routine created before cloud parity is set up will silently fail its first cloud firing.
That's the one-time, deliberate exception; the append-only default still governs future,
genuinely independent additions to this group.

**Files touched by the renumbering** (live files only — historical `docs/superpowers/plans/*`
and the completed `specs/22-init-work-backend.md` are frozen record and are not touched, per
this repo's own convention):

- `skills/init/SKILL.md` — step headers, Actions Performed table row, Relationship table row,
  the `--core-only`-covered "Optional Enhancements (Steps 9-15)" range text.
- `skills/init/bootstrap-steps.md` — step headers, the append-only policy paragraph (revised
  to explain the one-time exception, not deleted), the three "Step 15" forward-references
  inside Step 9's own procedure (native-Type deferral note).
- `skills/init/update-mode.md` — one "Step 15b" cross-reference.
- `skills/routine/SKILL.md` — Component-Skill Contract's `--source init` note, and the
  Relationship-to-`/init` table row.
- `CLAUDE.md` (this repo's own root doc) — the `init` row's sub-file description in the
  Skills-with-sub-files table (names Step 9 and Step 15 specifically).

## Generated artifacts

### `scripts/claude-cloud-setup.sh`

New file, written into the **consuming project** (not this plugin repo), committed,
regenerated in full on every `/init` run — never hand-edited (customization happens by
changing `enabledPlugins`/`extraKnownMarketplaces` in `.claude/settings.json`, then
re-running `/init`).

```bash
#!/usr/bin/env bash
# Generated by claude-tweaks /init (Step 13 — Cloud/Routine Parity Setup).
# Regenerated in full on every /init run from .claude/settings.json — do not hand-edit;
# customize by changing enabledPlugins/extraKnownMarketplaces instead, then re-run /init.
#
# Paste `bash scripts/claude-cloud-setup.sh` into this project's claude.ai/code environment
# Setup script field (environment settings, web UI only — no API sets this remotely) so
# cloud sessions and scheduled Routines get the same plugins available locally.
# See CLAUDE.md's "Cloud parity" section for why this exists and what it doesn't cover.
set -euo pipefail

# Marketplaces referenced below that Claude Code doesn't already know by name.
claude plugin marketplace add thomasholknielsen/claude-tweaks-marketplace 2>/dev/null || true
# ...one additional line per mirrored plugin's non-built-in marketplace

# Plugins declared in .claude/settings.json#enabledPlugins.
claude plugin install claude-tweaks@claude-tweaks-marketplace --scope project
claude plugin install superpowers@claude-plugins-official --scope project
# ...one additional line per mirrored plugin

# agent-browser — required in the cloud sandbox for /browse-dependent skills
# (/stories, /visual-review, /review, qa-agent, /flow) to work in cloud sessions.
npm install -g agent-browser
```

`claude-plugins-official` (Anthropic's own official marketplace, bundling `superpowers`,
`code-review`, `code-simplifier`) needs no `marketplace add` call — only
`claude-tweaks-marketplace` and any other non-built-in marketplace pulled in by a mirrored
plugin get an explicit add line.

### `## Cloud parity` section in CLAUDE.md

Added/updated the same way Step 10 (`design-integration`) and the renumbered Step 16
(`work-backend`) already write flags/sections into a project's CLAUDE.md — fixed prose, not
computed per-project (these are inherent platform behaviors):

```markdown
## Cloud parity

Cloud sessions (claude.ai/code) and scheduled Routines run in fresh sandboxes with no
access to this machine's local ~/.claude config — they only see plugins declared in this
project's own .claude/settings.json#enabledPlugins (paired with any custom marketplace
under extraKnownMarketplaces).

- **Setup script:** paste `bash scripts/claude-cloud-setup.sh` into this project's cloud
  environment's Setup script field (claude.ai/code environment settings, web UI only — no
  API/CLI can set this remotely). Installs every declared plugin/marketplace plus
  `agent-browser`. Regenerated by `/claude-tweaks:init`; don't hand-edit it.
- **Branch:** cloud sessions check out the environment's configured branch (typically this
  repo's actual GitHub default branch) — confirm it's the branch these plugin declarations
  actually landed on, especially if your team develops primarily on a non-default branch.
- **First exposure:** a plugin newly declared for cloud can show as installed
  (`claude plugin list --json`) while its skills/MCP tools are still uninvocable in that
  very first cloud session — observed to self-heal one session later, no config fix needed.
- **MCP servers:** this project's committed .mcp.json is what cloud sessions see. Any MCP
  server configured only in your local ~/.claude.json won't reach cloud — review those
  individually if cloud parity matters for them (server configs can carry credentials, so
  this is never auto-copied).
```

## Interaction flow

Gated identically to the (renumbered) Steps 9/15/16: GHE-safe two-tier remote check
(`gh repo view --json owner,name` when `gh` is available and authenticated, else
`git remote get-url origin` exits 0). No remote → skip silently. Falls inside the existing
"Optional Enhancements (Steps 9-16)" range, so `--core-only` skips it automatically.

One `AskUserQuestion` call, per this repo's Multi-item Decisions convention: a batch table
— `claude-tweaks` and `superpowers` always shown as recommended rows, plus one row per other
plugin the user has enabled locally (read directly from
`~/.claude/settings.json#enabledPlugins`'s keys — already fully-qualified `name@marketplace`
strings, no CLI-output parsing needed) that isn't yet declared project-side — followed by
apply-all/override/skip-entirely options. With no extra mirror candidates, the table
collapses to the two hard deps with a simple Yes/Skip framing; never silently auto-applied,
matching Step 8's "always prompt before wiring a settings file" precedent.

On confirmation: merge project `.claude/settings.json` (preserve existing keys, non-
destructive, same pattern Step 8 uses for `~/.claude/settings.json`), regenerate
`scripts/claude-cloud-setup.sh` in full, add/update CLAUDE.md's `## Cloud parity` section.

**Update Mode / re-runs:** idempotent. If project settings already declare both hard deps
and no new local plugins exist to mirror, report it under Phase 9's "Verified & Consistent"
section silently; only re-prompt when there's an actual delta.

**Error handling:** malformed `.claude/settings.json` → report and skip rather than corrupt
it. Write failure → surface and continue, matching Step 10's "don't abort /init on install
failure" precedent. No GitHub remote → skip step silently.

**Mechanism boundary:** `/init` never runs `claude plugin install` itself — consistent with
Step 10's existing, explicit constraint ("claude-tweaks does not programmatically install
plugins"). It only *writes text* (the generated script's content) — an ordinary file write,
not a plugin-install action. The actual install only happens later, when the cloud
environment runs the pasted script.

## Testing

This is prose/LLM-executed instructions only, same as `/routine` itself — no JS module, so
no `node --test` coverage applies. Verification is grep-based self-checks in the
implementation plan's Task steps (confirming renumbered cross-references resolve, confirming
the script/CLAUDE.md templates appear verbatim where expected), plus a manual real-world
check the user performs later (open a claude.ai/code session, or fire an instantiated
Routine) — cloud behavior cannot be verified from inside this local session.

## Integration touches

- Actions Performed table (`SKILL.md`) — new "Cloud parity" row referencing Step 13.
- `skills/routine/SKILL.md`'s Relationship-to-`/init` row gets a one-line addendum noting
  Step 13 exists so Step 14's routine creation doesn't silently fail its first cloud firing.
- New Anti-Patterns rows in `skills/init/SKILL.md`:
  - Auto-copying local MCP server configs into `.mcp.json` — credential leak risk,
    report-only by design.
  - Hand-editing `scripts/claude-cloud-setup.sh` — silently overwritten on the next
    `/init` run.
  - Assuming `/init` can set the cloud environment's Setup-script field itself — no
    API/CLI exists; it's always a manual one-time paste per environment.

## Non-goals

- Does not attempt to detect or install arbitrary MCP servers a project might want in
  cloud — report-only, by design, for credential-safety reasons.
- Does not attempt to resolve the branch-checkout question programmatically — this is
  project-specific (which branch a team develops on, how the cloud environment is
  configured) and is documented as a caveat to verify manually, not detected/enforced.
- Does not add any new dependency, code module, or test infrastructure — pure prose change
  to `/init`'s skill files, matching `/routine`'s own precedent (`routine-setup-friction`
  plan: "No code change — this plugin has no JS module governing routine creation").
