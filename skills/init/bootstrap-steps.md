# Init Phase 0 Bootstrap — Detailed Procedures

Loaded by `/init` Phase 0 when the corresponding tool/feature is being set up. Each step is independent — read only the section(s) needed for the step currently executing. In Update Mode most of these are no-ops (already configured); the SKILL.md decides whether to load this file at all.

## Step 0.7 — Browser / agent-browser (detailed procedure)

Browser integration lets Claude Code interact with web pages — useful for testing UIs, running QA stories, scraping docs, and verifying deployments. The single supported backend is `agent-browser`.

See `_shared/browser-detection.md` for the detect / install / verify procedure (the detection command, the exact install-note text to print, and the auto-mode no-install rule).

Init-specific contract:

- Run detection on every `/init` invocation.
- If `agent-browser` is missing, surface the install hint and **continue** — never block init on a missing browser. Browser features are optional; all other skills work without them and degrade gracefully.
- Do not prompt for backend choice — there is only one backend.

---

## Step 0.8 — Token-Saver Dependencies & Statusline (detailed procedure)

claude-tweaks v4.2+ ships a bash-output filter, a 9-segment statusline, and a JSONL telemetry ledger. These require Node and (optionally) git for the branch segment.

**Detect dependencies:**

Run `node --version` and `git --version` via the Bash tool. For each missing dep, detect the platform's package manager and offer to install:

| Platform | Detect | Prompt |
|---|---|---|
| macOS | `brew --version` | "Install {dep} via Homebrew? (y/N) — runs `brew install {dep}`" |
| Windows | `winget --version` or `scoop --version` | "Install {dep} via winget/scoop? (y/N)" |
| Linux | `apt --version` / `dnf --version` / `pacman --version` | Print the install command (we don't run sudo from init) |

If a Node version manager (nvm/fnm/volta/n) is on PATH, **do not offer to install Node** — print: "Node managed by {manager} — install via your manager."

**Wire up the statusline (wrapper approach):**

We can't write a literal env-var placeholder into settings.json from a slash command — Claude Code expands placeholders at skill-load time, so the agent never sees the literal string. The fix: install a tiny wrapper script at a **stable user-space path** that resolves the latest cached plugin version at runtime. settings.json points to the wrapper; plugin upgrades require no settings.json edits.

**Step A — Install the wrapper:**

Run the installer via Bash:

```
node "<plugin>/bin/install-statusline-wrapper.js"
```

The installer creates `~/.claude-tweaks/bin/statusline.js` (a small Node script that scans `~/.claude/plugins/cache/claude-tweaks-marketplace/claude-tweaks/` for the highest-version subdir and execs its `bin/claude-tweaks-statusline.js`). It prints the absolute wrapper path on stdout — capture that path; you'll need it in Step B.

**Step B — Wire settings.json:**

Read `~/.claude/settings.json` and look for `statusLine.command`:

| Current state | Action |
|---|---|
| No `statusLine.command` set | Prompt: "Configure claude-tweaks statusline? (Y/n)". On yes, write the wrapper path from Step A into the JSON below. Backup `settings.json` before write. |
| Old hardcoded-version path (matches `claude-tweaks-marketplace/claude-tweaks/\d+\.\d+\.\d+/bin/claude-tweaks-statusline\.js`) | **Migrate.** Replace with the wrapper path from Step A. Future plugin upgrades won't need /init to touch settings.json again. Backup before write. |
| Already pointing to `.claude-tweaks/bin/statusline.js` | No-op (already migrated). |
| Different command (not claude-tweaks) | Print the wrapper path and tell the user to compose manually if they want both. Never overwrite. |

**Settings JSON to write** (replace `<wrapper_path>` with the absolute path the installer printed in Step A — typically `/Users/{user}/.claude-tweaks/bin/statusline.js` on macOS, `C:\Users\{user}\.claude-tweaks\bin\statusline.js` on Windows):

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"<wrapper_path>\"",
    "padding": 0
  }
}
```

When migrating from a versioned path, announce: "Migrating to wrapper at `<wrapper_path>` — future plugin upgrades won't need /init to bump this again. The wrapper resolves the latest cached version on every render."

**Set `NO_COLOR=1` to disable color** if requested — universal env var, no claude-tweaks-specific override.

---

## Step 0.9 — Impeccable Design Integration (detailed procedure)

claude-tweaks v4.5+ integrates [Impeccable](https://impeccable.style/) — a frontend-design plugin that ships LLM commands (`critique`, `audit`, `polish`, `bolder`, `delight`, etc.) and a deterministic Node CLI (`impeccable detect`) for catching design anti-patterns. The integration is opt-in and only runs on frontend projects.

**Detect frontend signals from Phase 2 reconnaissance** (or run a quick sniff of the project root if Phase 0 is being run before Phase 2): look for any of `.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css` files, or directories `components/`, `pages/`, `app/`, `routes/`, `views/`, `ui/`. If none are detected, skip this step entirely — the project is not frontend-facing.

**If frontend is detected, present:**

```
Detected frontend project. Set up Impeccable design integration?

Impeccable provides design-quality commands invoked by /test (deterministic CLI
gate) and /review (LLM critique + audit). All findings are advisory in v4.5 —
code is never auto-modified.

1. Full integration **(Recommended)** — install plugin, run teach + document
2. Plugin only — install plugin, skip the design-context interview (run later)
3. Skip — disable design integration
```

**For options 1 or 2 — install the plugin.** Surface this exact three-command sequence (claude-tweaks does not programmatically install plugins):

```
/plugin marketplace add pbakaus/impeccable
/plugin install impeccable@impeccable
/reload-plugins
```

The Impeccable CLI (`impeccable detect`) ships with the plugin and is invoked via `npx` — no separate install needed.

Verify by checking that `/impeccable:impeccable` resolves to a skill in the next session. If it does not, the plugin install must complete before downstream features work.

**For option 1 only — generate design context files.** Run the teach interview (interactive, ~5 minutes) and then generate the spec-compliant design document:

```
/impeccable:impeccable teach
/impeccable:impeccable document
```

This writes `PRODUCT.md` (strategic context: audience, brand voice, anti-references) and `DESIGN.md` (visual system: colors, typography, components) at the project root. These are the files the design wrapper reads.

**Write the kill-switch flag to CLAUDE.md.** Add (or update) a `## Design integration` section near the existing project-level config sections:

```markdown
## Design integration

design-integration: enabled
```

Use the appropriate value:

| Choice | Flag value |
|--------|-----------|
| Option 1 (Full) | `enabled` |
| Option 2 (Plugin only) | `plugin-only` |
| Option 3 (Skip) | `disabled` |

The `/claude-tweaks:design` wrapper reads this flag as Layer 1 of its detection logic. Missing flag is treated identically to `disabled` — design integration only activates when explicitly enabled by `/init`.

**For option 3:** Write `design-integration: disabled` to CLAUDE.md and continue. The wrapper short-circuits universally — no CLI calls, no LLM invocations, no token cost.

**Optional companion (not part of the integration).** Impeccable also publishes a Chrome extension at https://chromewebstore.google.com/detail/impeccable/bdkgmiklpdmaojlpflclinlofgjfpabf that overlays the same 25-rule detector on any webpage during normal browsing. It does not connect to the slash commands and is not tracked by the `design-integration` flag — install it separately if you want ad-hoc audits while browsing your dev server, staging, or any third-party site. Skip otherwise.

**Re-run behavior:** When `/init` is re-run on a project where `design-integration: enabled`, offer to re-run `/impeccable:impeccable teach` + `document` to refresh `PRODUCT.md` / `DESIGN.md` (the codebase may have evolved since the last run). When the flag is `plugin-only` or `disabled`, offer the upgrade path back to full integration.

**Failure handling:** If the plugin install fails, do not abort `/init` — surface the failure and continue with `design-integration: disabled` until the user resolves it. The wrapper's availability checks gracefully skip when dependencies are absent.
