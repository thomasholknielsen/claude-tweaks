# Cloud Routine Environment Freshness & Per-Project Dedication

## Problem

`/init`'s Step 14 ("Cloud/Routine Parity Setup") generates `scripts/claude-cloud-setup.sh` — a
committed script whose content is derived in full from a project's own `.claude/settings.json`
(`enabledPlugins` + `extraKnownMarketplaces`) on every `/init` run. The user pastes
`bash scripts/claude-cloud-setup.sh` into a claude.ai/code cloud environment's Setup script field
**once**, manually (no API/CLI can set that field remotely — confirmed by inspecting
`RemoteTrigger`'s own schema, which is scoped to `/v1/code/triggers` only). Every subsequent cloud
session then re-runs that same one-line pointer against whatever the script's *current* content
is — so regenerating the script and merging it to the project's default branch is supposed to be
enough for a future firing to pick up the change, with no further manual UI edits.

In practice, this propagation is broken by a bug in the generated script itself. Its plugin-install
step is:

```bash
claude plugin install claude-tweaks@claude-tweaks-marketplace --scope project
```

run unconditionally, under `set -euo pipefail`. `claude plugin install` is **not idempotent** — it
errors if the plugin is already present (a documented upstream Claude Code CLI behavior). So this
line succeeds on a cloud environment's first-ever session, then **hard-fails every session after
that** once the plugin is already installed — the marketplace registry gets refreshed
(`claude plugin marketplace add ... 2>/dev/null || true` is separately idempotent-safe), but the
actually-installed plugin code is frozen at whatever version was present the first time that
environment was ever used, regardless of how many times the source repo's `main` branch — and the
generated script itself — move forward.

This was diagnosed by comparing against a real downstream project (`memenu-io/memenu-app`), which
had independently hit the same failure mode and worked around it with a hand-rolled
`scripts/install-claude-plugins.sh` (idempotency-checked, with cache-clear-retry defensiveness) —
but that script has the identical missing-update gap: it branches on "already installed" and does
nothing, rather than calling `claude plugin update`. Both scripts were verified against the real
`claude plugin --help` / `claude plugin update --help` output, which confirms `update` is a real,
distinct subcommand ("Update a plugin to the latest version (restart required to apply)") that
neither script calls.

A second, related problem surfaced during live verification: `memenu-app`'s four `claude-tweaks`
routines (code-health, harness-health, journey-health, docs-health) all reference a cloud
environment literally named "Default" — the same environment used for unrelated ad-hoc/manual
sessions on that account. Because one environment's Setup script field is a single value, and
`/routine`'s environment-resolution logic (Step 4) falls back to inferring `environment_id` from
whatever routine was most recently created *account-wide*, a brand-new project's first routine can
silently inherit a completely unrelated project's environment — with its unrelated Setup script,
network-access allowlist, and env vars. This is a second source of the same symptom (stale/wrong
plugin code, or nothing installed at all if the inherited Setup script references a file path that
doesn't exist in the new repo).

## Background: what actually can and can't be automated

Confirmed live (browser recon against `claude.ai/code/routines/<id>`, plus tool-schema inspection):

- No tool available to this plugin (`RemoteTrigger` or otherwise) can create, list, or configure a
  cloud *environment* object (Name / Network access / Environment variables / Setup script). It is
  always a human, web-UI-only action — this was already true and documented for the Setup-script
  paste itself (`skills/init/SKILL.md`'s Anti-Patterns table); this design doesn't change that
  constraint, it works within it.
- `RemoteTrigger` has no "list environments" call — an environment's `environment_id` is only
  discoverable by reading it off an *existing* trigger's `job_config.ccr.environment_id`.
- The per-routine "Edit routine" dialog (reached via the routine's own edit/pencil affordance) has
  an "Environment" combobox with a live "+ Add environment" option, which opens the same
  Name/Network-access/Setup-script fields the user configures manually today. This is reachable
  and drivable via `mcp__claude-in-chrome__*` tooling. `agent-browser` (this plugin's default
  `/browse` backend) has no authenticated claude.ai session and cannot do this — so this is a
  legitimate use of `/browse backend=chrome`, this repo's existing documented exception for
  human-invoked, non-Routine browser automation.
- A `claude-tweaks`-named environment already exists in the account (found live in the dropdown,
  origin/current configuration unverified) — not assumed or relied upon by this design, just
  evidence the account has organically drifted toward wanting exactly this kind of separation
  already.

## Architecture

Three changes, all confined to `skills/init/` and `skills/routine/` — this surface is pure
skill-file prose plus one embedded bash template; there is no backing `.js` module for `/routine`'s
resolution logic (confirmed: `bin/lib/routine-template-parser.js` is a YAML-subset parser only, no
environment/resolution logic lives in code).

### Fix A — idempotent `claude-cloud-setup.sh` template

`skills/init/bootstrap-steps.md` Step 14's generated-script template changes its per-plugin
install logic from an unconditional `install` call to:

```bash
claude plugin marketplace update "$mkt" >/dev/null 2>&1 || true
if claude plugin list --json 2>/dev/null | node -e '...' | grep -Fqx "$spec"; then
  claude plugin update "$spec" --scope project
else
  claude plugin install "$spec" --scope project
fi
```

(exact shape templated per-plugin from `enabledPlugins`, same substitution mechanism the generator
already uses). This closes the freshness gap for every project generated by `/init`, present and
future — including `memenu-app`'s underlying problem, though `memenu-app`'s own hand-rolled script
is a separate file this design does not touch (see Out of scope).

### Fix B — per-project environment naming convention + collision-free resolution

New naming convention: an environment dedicated to a project's claude-tweaks routines is named
`claude-tweaks: <project-slug>` (project-slug = repo name, e.g. `claude-tweaks: memenu-app`).

`/routine`'s Step 4 resolution changes from "no cache/flag → infer `environment_id` from the
most-recently-created routine, account-wide" to: call `RemoteTrigger {action: "list"}`, filter to
triggers whose `session_context.sources[].git_repository.url` matches *this* project's own git
remote, and read `environment_id` off the most recent match. Only when **no** routine anywhere
targets this exact repo does resolution fall through to Fix C. This never silently inherits an
unrelated project's environment again.

### Fix C — guided environment creation via browser automation

New step, invoked only by Fix B's fallthrough (no existing environment found for this project).
Dispatches `/claude-tweaks:browse backend=chrome` to drive: open "New routine" → "+ Add
environment" → fill Name (`claude-tweaks: <project-slug>`), Network access (`Trusted`, matching
existing convention), Setup script (`bash scripts/claude-cloud-setup.sh 2>/dev/null || true`) →
save → continue creating the actual first routine in the same flow, so the web UI wires
environment↔routine together itself. No DOM-scraping of the resulting `environment_id` is needed —
the next `RemoteTrigger list` call surfaces it via Fix B's own resolution logic, so every
subsequent routine created in the same `/init` run (code-health, docs-health, journey-health,
harness-health, tidy, dispatch) reuses it without repeating the browser flow.

**Critical constraint:** Fix C only ever *writes* Setup-script content when creating a brand-new
environment. It never edits an existing environment's Setup script field. An existing project that
already has a working (even if imperfect) Setup script keeps it untouched by this flow.

## Data flow

**New project, first-ever `/init routines` run:** Step 4 resolution (Fix B) finds nothing for this
repo → Fix C fires once → environment + first routine created together → remaining routines in the
same run resolve the freshly-created `environment_id` via a second `RemoteTrigger list` call.

**Existing project with routines already on a non-dedicated environment** (this is `memenu-app`'s
actual state — 4 routines on "Default"): `/init routines` in Update Mode gains a detection step —
for each of this project's existing routines (found via the same repo-matching `RemoteTrigger
list` filter), check whether its environment's name already matches the `claude-tweaks:
<project-slug>` convention. If not, surface this repo's standard batch-decision table (pre-filled
recommendation + one apply-all/override `AskUserQuestion` gate, per `skills/_shared/` interaction
conventions) offering to: (1) create the dedicated environment once via Fix C if it doesn't exist
yet, then (2) re-point each listed routine at it via the same Edit-routine → Environment combobox →
select → Save sequence verified live during design. Any routine can be skipped per-item; nothing is
forced.

Re-pointing a routine's environment only changes *which* environment it references — it never
touches that environment's Setup-script content (see Fix C's constraint above). So migrating
`memenu-app`'s routines onto a dedicated environment is independent of whether that environment
ends up running the standard generated script or a customized one; that choice stays with the
project.

## Error handling

- claude-in-chrome unavailable (no extension connected, non-interactive/headless context, or the
  user declines the browser flow when offered): Fix C degrades to today's behavior — print the
  exact values to enter, matching the existing manual-paste fallback already documented for the
  Setup-script gap.
- Browser automation sequence fails partway (UI structure changed, click misses, environment
  created but routine save fails, etc.): treat as an automation failure, not a design failure — do
  not leave a broken half-created environment silently referenced; report what succeeded/failed and
  fall back to manual instructions for whatever step didn't complete.
- Migration's batch table always includes a per-item skip; declining to migrate leaves a routine
  exactly as it is today (still functional, still on whatever environment it already uses).

## Testing

No unit-test harness exists for skill-embedded shell templates or `/routine`'s prose-only
resolution logic in this repo today (consistent with Step 14's existing, already-untested
template). Verification plan:

1. Hand-run the updated `claude-cloud-setup.sh` template twice in sequence locally — confirm the
   second run takes the `update` branch cleanly and exits 0 under `set -euo pipefail`.
2. Live-test Fix C's browser sequence once end-to-end against a real throwaway routine, to confirm
   the "+ Add environment" automation still matches the UI (the main fragility point — flagged as a
   risk, not a solved problem).
3. Dry-run the migration detection (read-only `RemoteTrigger list` + name-matching) against
   `memenu-app`'s real 4 routines before ever executing a re-point, to confirm the detection logic
   correctly flags all 4 as non-dedicated.

## Out of scope

- Porting `memenu-app`'s cache-clear-retry defensiveness into the generated template (a different
  problem — corrupted local marketplace cache — not raised here).
- Any change to `memenu-app`'s own `scripts/install-claude-plugins.sh` file.
- claude-tweaks dogfooding itself via its own cloud routines (a separate, later brainstorm — this
  design only fixes the mechanism other projects rely on).
- Network access / environment variables customization during guided creation — Fix C defaults to
  `Trusted` / empty, matching today's manual convention; further customization stays a manual
  post-creation step via the existing "Update cloud environment" dialog.
