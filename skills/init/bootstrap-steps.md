# Init Phase 0 Bootstrap — Detailed Procedures

Loaded by `/init` Phase 0 when the corresponding tool/feature is being set up. Each step is independent — read only the section(s) needed for the step currently executing. In Update Mode most of these are no-ops (already configured); the SKILL.md decides whether to load this file at all.

## Core Bootstrap Steps

Order-dependent — later steps may assume earlier ones completed. Steps 1-8 run unconditionally and idempotently (only act on missing state).

### Step 1 — Check Plugin Dependencies (detailed procedure)

### Required: Superpowers

Provides `/superpowers:brainstorming`, `/superpowers:writing-plans`, `/superpowers:subagent-driven-development`, `/superpowers:executing-plans`, `/superpowers:using-git-worktrees`, `/superpowers:finishing-a-development-branch`, and `/superpowers:dispatching-parallel-agents`.

Detect: use the Glob tool to search for `*superpowers*` under the user's `~/.claude/plugins/` directory.

If missing, install:
```bash
/plugin install superpowers@claude-plugins-official
```

### Required: Code Simplifier

Provides the `code-simplifier` subagent used by `/claude-tweaks:build` and `/claude-tweaks:review`.

Note: `code-simplifier` is a built-in subagent type (`subagent_type="code-simplifier:code-simplifier"` in the Task tool). No plugin installation needed — verify it's available by checking the Task tool's agent type list.

---

### Step 2 — Create Directory Structure (detailed procedure)

Check and create the required directories (only create what's missing):

```
specs/                      → Spec files and INBOX
docs/                       → Documentation root (REGISTRY.md created in Phase 8.5)
docs/superpowers/specs/     → Design docs (from /superpowers:brainstorming)
docs/superpowers/plans/     → Execution plans (from /superpowers:writing-plans)
docs/plans/                 → Claude-tweaks pipeline state (briefs, ledger, audit/recommendations caches)
docs/journeys/              → User and developer journey files (created by /journeys, tested by /visual-review)
.claude/skills/             → Skill files (should already exist if this skill is running)
```

---

### Step 3 — Starter files (detailed content)

Create these files **only if missing** — never overwrite existing content. Each file is idempotent and safe to skip on Update Mode runs.

**`specs/INBOX.md`:**

```markdown
# INBOX

Ideas and features captured for future specification. Use `/claude-tweaks:capture` to add items, `/claude-tweaks:tidy` to review.

<!-- Add new entries at the bottom using /claude-tweaks:capture -->
```

**`specs/DEFERRED.md`:**

```markdown
# Deferred Work

Work deferred from builds and reviews with context for when to pick it up. Items here came from active implementation — they have origin specs, file references, and timing triggers.

Unlike INBOX (raw ideas), deferred items have rich context and specific triggers for when they should be revisited.

<!-- Items are added by /claude-tweaks:build, /claude-tweaks:review, and /claude-tweaks:wrap-up -->
```

**`specs/INDEX.md`:**

```markdown
# Spec Index

Tiered roadmap of work units. Use `/claude-tweaks:specify` to add specs, `/claude-tweaks:help` to see what's ready to build.

## Tier 1 — Critical Path

| Spec | Title | Status | Blocked By |
|------|-------|--------|------------|
| — | — | — | — |

## Tier 2 — High Value

| Spec | Title | Status | Blocked By |
|------|-------|--------|------------|
| — | — | — | — |

## Tier 3 — Differentiators

| Spec | Title | Status | Blocked By |
|------|-------|--------|------------|
| — | — | — | — |
```

---

### Step 4 — .gitignore suggestions (detailed content)

Check whether `.gitignore` exists and already covers workflow artifacts. Suggest entries for transient files that shouldn't be committed:

```gitignore
# claude-tweaks: transient artifacts
screenshots/
.worktrees/
stories/auth.yml
.claude-tweaks/pipelines/
.claude-tweaks/research/
.claude-tweaks/code-health/
.claude-tweaks/routine-environment-cache.yml
.impeccable/config.local.json
.impeccable/hook.cache.json
.impeccable/hook.pending.json
```

These entries ignore claude-tweaks' transient, project-local state — pipeline run directories (`pipelines/{ISO-timestamp}-{spec-slug}/config.yml`, `decisions.md`, `staged/`), research report output, code-health's own cache/cursor state (`code-health/cache.json`, `code-health/cursors.json`, `code-health/runs/`, see `skills/code-health/SKILL.md` and `bin/lib/code-health/cache.js`), and the routine-environment-resolution cache (see `skills/routine/SKILL.md`). Deliberately **not** blanket-ignored: `.claude-tweaks/routines/{name}.yml` (instantiated cloud-Routine records, written by `/claude-tweaks:routine`) — those are explicitly documented as safe, and meant, to commit. A blanket `.claude-tweaks/` line would make that directory permanently uncommittable regardless of user intent, since git cannot reliably re-include a subdirectory of an already-ignored parent via `!` negation. The statusline cache lives under the user's home directory (`~/.claude-tweaks/`), a separate global path — it never needs a project `.gitignore` entry. The same rule applies to Impeccable's own config directory: `.impeccable/config.json` is Impeccable's committed, shared team config (colors, typography, brand voice); only the three per-developer files above — `config.local.json`, `hook.cache.json`, and `hook.pending.json`, all written by its optional automatic-detection hook — are local state. A blanket `.impeccable/` line would make `config.json` permanently uncommittable for the identical structural reason.

**Re-run behavior (migration check):** don't just check whether `.gitignore` "already covers" `.claude-tweaks/` — a project that adopted claude-tweaks before this split existed may have the old blanket line, which silently reintroduces the routines-uncommittable bug even though something matching `.claude-tweaks` is technically present.

| Current state | Action |
|---|---|
| No `.gitignore`, or one with no `.claude-tweaks` reference at all | Suggest adding the split entries above. |
| Standalone blanket `.claude-tweaks/` line (the old, pre-split form) | **Migrate.** Propose replacing the blanket line with the split entries (`.claude-tweaks/pipelines/`, `.claude-tweaks/research/`, `.claude-tweaks/code-health/`, `.claude-tweaks/routine-environment-cache.yml`) rather than silently treating it as already covered — the blanket form makes `.claude-tweaks/routines/{name}.yml` permanently uncommittable. Backup `.gitignore` before write. |
| Already has the split entries (no blanket line) | No-op (already migrated). |

If `stories/` exists or will be created, ask the user:

```
Should story YAML files be committed to version control?
1. Yes — stories are part of the project's test suite **(Recommended)**
2. No — add stories/ to .gitignore
```

Do not modify `.gitignore` without asking — the user may have opinions about what to track.

---

### Step 5 — Verify Git (detailed procedure)

The workflow system relies on git for change tracking (`/claude-tweaks:review` uses `git diff`, `/claude-tweaks:wrap-up` checks recent commits).

- Check that the current directory is a git repo (`git rev-parse --is-inside-work-tree`).
- If not, warn the user — the workflow will partially work but `/claude-tweaks:review` and `/claude-tweaks:wrap-up` will be degraded. Do not auto-run `git init` — the user may have an intentional non-git checkout.

---

### Step 6 — Worktree Configuration (detailed procedure)

`/claude-tweaks:build worktree` and `/claude-tweaks:flow worktree` use `/superpowers:using-git-worktrees` to create isolated workspaces. Two worktree conventions coexist by design, not by drift: the native-tool path (e.g. `EnterWorktree` → `.claude/worktrees/`, harness-owned — cleanup is the harness's job, not superpowers') and the git-fallback path (`git worktree add` per `using-git-worktrees` Step 1b, used only when no native tool exists → `.worktrees/` in the project root, superpowers-owned — this is the only directory `/superpowers:finishing-a-development-branch` cleans up). Neither supersedes the other. Anything that needs to detect a worktree should run `git worktree list` or check `GIT_DIR != GIT_COMMON` (see `bin/lib/hooks/worktree-detect.js`) rather than assume a fixed directory name.

1. Check if `.worktrees/` exists in the project root.
2. If it doesn't exist, create it and verify it's in `.gitignore` (suggest adding if not) — this keeps the git-fallback path ready even on projects that primarily use a native tool.
3. If a `.claude/worktrees/` directory exists, leave it alone — it belongs to the native tool's own harness-managed lifecycle, not superpowers'. Do not suggest migrating it into `.worktrees/`: doing so would relocate a live, harness-tracked worktree into the one path superpowers' own cleanup step will later remove, deleting it out from under the harness's bookkeeping.
4. **Base ref** — claude-tweaks branches worktrees from the current local HEAD, but the harness setting `worktree.baseRef` defaults to `fresh` (branches from `origin/<default-branch>`). On a project whose integration branch is local and ahead of the remote default (a long-lived `dev`), `fresh` silently uses a stale base. Read `settings.json`; if `worktree.baseRef` is unset or `fresh`, surface:
   ```
   Worktree base ref is `{current value or 'unset (default: fresh)'}`. claude-tweaks branches from your current local HEAD — `fresh` can branch from a stale `origin/<default-branch>`. Set `worktree.baseRef: "head"`? (Y/n)
   ```
   On yes, write `{ "worktree": { "baseRef": "head" } }` into `settings.json` (backup first, merge — don't clobber existing keys). In `auto` mode, set it without prompting and log the change.
5. **`worktree.always` policy** — check `.claude-tweaks/policy.yml` (repo root) for a `worktree.always:` line:

   | State found | Behavior |
   |---|---|
   | No `worktree.always:` line at all (no file, or file present without the key) | Ask the question below |
   | `worktree.always: true` | No-op — already enabled, skip silently |
   | `worktree.always: false` | Ask the question below (re-offer — matches Step 10/11/12's re-offer-on-decline convention) |

   When asking, call `AskUserQuestion`:
   - `question`: `"Require an isolated git worktree for every file edit in this project?"`, `header`: `"Worktree policy"`, `multiSelect`: `false`
   - Option 1 — `label`: `"Yes — enforce worktree.always (Recommended)"`, `description`: `"Mechanically denies Edit/Write/NotebookEdit/git commit outside a linked worktree from the first prompt of every future session. Prevents concurrent sessions from colliding on the main checkout."`
   - Option 2 — `label`: `"No — allow direct edits in the main checkout"`, `description`: `"Leaves the main checkout open for direct edits. You can enable this later by re-running /init."`

   **Do not write `.claude-tweaks/policy.yml` here.** Record the answer (`true` for Option 1, `false` for Option 2 — write `false` explicitly rather than leaving the key absent, so the idempotency check above can detect "already asked, declined" on a future run) and carry it forward to the end of this `/init` invocation. Writing it immediately would deny this same run's own remaining `Edit`/`Write` calls (Steps 7-14 below, and Phases 1-9 for any fuller scope) via the very policy this step turns on. See `SKILL.md`'s "Finalizing the worktree.always Decision" for the general rule governing where the write actually happens — normally at Phase 9 ("Worktree Policy Finalization"), but at whatever point this invocation actually ends if that happens first (examples: the `bootstrap`-only scope, or the Scope Selection Gate's "Done" choices).

---

### Step 7 — Browser / agent-browser (detailed procedure)

Browser integration lets Claude Code interact with web pages — useful for testing UIs, running QA stories, scraping docs, and verifying deployments. The single supported backend is `agent-browser`.

See `_shared/browser-detection.md` for the detect / install / verify procedure (the detection command, the exact install-note text to print, and the auto-mode no-install rule).

Init-specific contract:

- Run detection on every `/init` invocation.
- If `agent-browser` is missing, surface the install hint and **continue** — never block init on a missing browser. Browser features are optional; all other skills work without them and degrade gracefully.
- Do not prompt for backend choice — there is only one backend.

---

### Step 8 — Statusline & Dependencies (detailed procedure)

claude-tweaks ships a multi-segment statusline. This requires Node and (optionally) git for the branch segment.

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

## Optional Enhancement Steps

Order-agnostic and append-only — each step below is an independent "detect condition → offer → write artifact → idempotent" companion integration. New enhancements are added at the end of this group; no renumbering is needed for future additions.

### Step 9 — GitHub issue form template (agent-task)

Offer only when the project has a GitHub remote (`git remote get-url origin` matches
`github.com`). Check whether `.github/ISSUE_TEMPLATE/agent-task.yml` exists; if absent,
offer to install it. The form makes human-filed issues pipeline-ready at filing time: its
three sections match what `/claude-tweaks:flow`'s issue-sourced batches consume with zero
translation (`bin/lib/issues/ingest.js` `isFormShaped` — GitHub renders the labels as `###`
headings, which the detector accepts).

```yaml
name: Agent task
description: File a task an agent pipeline can build directly (claude-tweaks issue-sourced batch)
title: "[task] "
body:
  - type: textarea
    id: current-state
    attributes:
      label: Current State
      description: What exists today, and what is wrong or missing
    validations:
      required: true
  - type: textarea
    id: deliverables
    attributes:
      label: Deliverables
      description: What should exist when this is done
    validations:
      required: true
  - type: textarea
    id: acceptance-criteria
    attributes:
      label: Acceptance Criteria
      description: How to verify it is done
    validations:
      required: true
```

Write the YAML exactly as above to `.github/ISSUE_TEMPLATE/agent-task.yml`. Declining is
fine — freeform issues still work via the translation step (`from-code-health.md` Step 2.6); the
form just removes the translation judgment.

---

### Step 10 — Impeccable Design Integration (detailed procedure)

claude-tweaks v4.5+ integrates [Impeccable](https://impeccable.style/) — a frontend-design plugin that ships LLM commands (`critique`, `audit`, `polish`, `bolder`, `delight`, etc.) and a deterministic Node CLI (`impeccable detect`) for catching design anti-patterns. The integration is opt-in and only runs on frontend projects.

**Detect frontend signals from Phase 2 reconnaissance** (or run a quick sniff of the project root if Phase 0 is being run before Phase 2): look for any of `.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css` files, or directories `components/`, `pages/`, `app/`, `routes/`, `views/`, `ui/`. If none are detected, skip this step entirely — the project is not frontend-facing.

**If frontend is detected, present:**

```
Detected frontend project. Set up Impeccable design integration?

Impeccable provides design-quality commands invoked by /test (deterministic CLI
gate) and /review (LLM critique + audit). All findings are advisory in v4.5 —
code is never auto-modified.

1. Full integration **(Recommended)** — install plugin, run init + document
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

**For option 1 only — generate design context files.** Run the init interview (interactive, ~5 minutes) and then generate the spec-compliant design document:

```
/impeccable:impeccable init
/impeccable:impeccable document
```

(`/impeccable:impeccable teach` still works as a deprecated alias for `init`, in case older instructions elsewhere reference it.)

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

**Re-run behavior:** When `/init` is re-run on a project where `design-integration: enabled`, offer to re-run `/impeccable:impeccable init` + `document` to refresh `PRODUCT.md` / `DESIGN.md` (the codebase may have evolved since the last run). When the flag is `plugin-only` or `disabled`, offer the upgrade path back to full integration.

**Failure handling:** If the plugin install fails, do not abort `/init` — surface the failure and continue with `design-integration: disabled` until the user resolves it. The wrapper's availability checks gracefully skip when dependencies are absent.

**Automatic design hook (optional, separate offer).** After the install sequence completes for option 1 or 2 (Impeccable is installed either way), offer the automatic detection hook as its own follow-up. This is a materially different kind of decision from the context-file setup above — automatic runtime behavior during editing, not one-time context generation — so it gets its own prompt rather than a fourth item bolted onto the three-option choice above:

```
Enable Impeccable's automatic design hook? It runs the anti-pattern detector
after every UI edit and surfaces findings inline — no slash command needed.

Note: consent lives in the working tree, not .git/ — a fresh git worktree
(via /build worktree or /flow worktree) won't have this enabled until you
run /impeccable hooks on inside it again.

1. Yes — run /impeccable hooks on **(Recommended)**
2. Skip — enable later, or per-worktree, as needed
```

On option 1, run `/impeccable:impeccable hooks on` via the Skill tool. This writes hook consent into `.impeccable/config.local.json` in the current working tree only — it does not carry over to worktrees created later by `/build worktree` or `/flow worktree` (see `skills/build/worktree-setup.md` for the per-worktree note). No CLAUDE.md flag is needed for this choice — Impeccable's own `.impeccable/config.local.json` is the on/off state, checked directly by Impeccable, not by this wrapper.

Skip this offer entirely when Impeccable was not installed (option 3 was chosen above, or the install failed) — there is nothing to enable.

---

### Step 11 — Diagram Design (Recommended Companion)

claude-tweaks recommends [`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design) — a single-skill Claude Code plugin (MIT, no CLI, no setup) that generates 14 types of editorial HTML+SVG diagrams (architecture, flowchart, sequence, state, ER, timeline, swimlane, quadrant, nested, tree, org chart, layer stack, venn, pyramid). Soft-hook nudges in `/specify`, `/build`, and `/review` surface "consider a diagram here" recommendations when a spec describes flows or structures that benefit from a visual.

Unlike Impeccable's frontend gate, this recommendation is **offered for every project** — architecture, ER, sequence, and state diagrams help backend and infra specs equally.

**Present:**

```
Set up diagram-design plugin (recommended companion)?

A separately-installed sibling plugin that generates 14 types of editorial
HTML+SVG diagrams. claude-tweaks doesn't bundle it — when installed, our
/specify, /build, and /review surface "consider a diagram here" nudges at
moments where a visual usually helps (architecture descriptions, multi-actor
flows, state machines, hierarchies).

1. Install **(Recommended)** — writes diagram-integration: enabled
2. Skip — writes diagram-integration: disabled (silences future nudges)
```

**For option 1 — install the plugin.** Surface this exact three-command sequence (claude-tweaks does not programmatically install plugins):

```
/plugin marketplace add cathrynlavery/diagram-design
/plugin install diagram-design@diagram-design
/reload-plugins
```

The plugin is self-contained — no CLI, no Node/Python, no `init` interview to run. It auto-triggers from its skill description when the conversation calls for a diagram.

Verify by checking that `diagram-design` resolves to a skill in the next session. The plugin has no slash commands — verification is descriptive only ("present in the skill list").

**Write the flag to CLAUDE.md.** Extend (or create) the existing `## Design integration` section with a second line:

```markdown
## Design integration

design-integration: enabled
diagram-integration: enabled
```

Use the appropriate value:

| Choice | Flag value |
|--------|-----------|
| Option 1 (Install) | `enabled` |
| Option 2 (Skip) | `disabled` |

The soft-hook nudges in `/specify`, `/build`, and `/review` read this flag and short-circuit when set to `disabled` (or absent). Missing flag is treated identically to `disabled` — diagram-design nudges only activate when explicitly enabled by `/init`.

**Re-run behavior:** When `/init` is re-run on a project where `diagram-integration: enabled`, this step is a no-op (there's no `init` to refresh). When the flag is `disabled`, offer the upgrade path back to `enabled`. When the flag is **missing** (pre-v4.7 projects), present the first-run prompt — same as a fresh init.

**Failure handling:** If the plugin install fails, do not abort `/init` — surface the failure and continue with `diagram-integration: disabled` until the user resolves it. The soft-hook nudges check the flag, not the plugin's presence, so a failed install just means the user sees no nudges (graceful degradation).

---

### Step 12 — shadcn Bootstrap (detailed procedure)

claude-tweaks integrates [shadcn/ui](https://ui.shadcn.com/) — a CLI-driven component
system distributed as copy-paste source files rather than an npm package. As of CLI v4
(~March 2026), shadcn ships three AI-agent-facing layers: the CLI itself (`init`/`add`),
a first-party MCP server (search/browse/view/install/audit registry items), and an
installable Skill (`skills add shadcn/ui`) that injects live project context into Claude Code
so it stops guessing at component APIs. This step wires all three, mirroring Step 10's
(Impeccable) install-and-flag pattern.

**Detect frontend signals from Phase 2 reconnaissance** (or run a quick sniff of the
project root if Phase 0 is being run before Phase 2): look for any of `.tsx`, `.jsx`,
`.vue`, `.svelte`, `.html`, `.css` files, or directories `components/`, `pages/`, `app/`,
`routes/`, `views/`, `ui/`. If none are detected, skip this step entirely.

Then check whether `components.json` already exists at the project root.

**Case A — no `components.json`, frontend detected:**

Present:

```
Detected frontend project. Set up shadcn/ui integration?

shadcn/ui provides a CLI-driven component system plus first-party AI-agent
tooling: an MCP server (search/browse/install/audit registry items) and an
installable Skill that gives Claude Code live project context, so it
discovers and installs components correctly instead of guessing.

1. Full integration (Recommended) — CLI init, wire MCP server, install shadcn/skills
2. CLI only — CLI init, skip MCP/skills wiring
3. Skip — disable shadcn integration
```

**Options 1 and 2 both run:**

1. Detect the package manager from the lockfile present at the project root:

   | Lockfile | Prefix |
   |---|---|
   | `pnpm-lock.yaml` | `pnpm dlx` |
   | `yarn.lock` | `yarn dlx` |
   | `bun.lockb` | `bunx` |
   | `package-lock.json` or none | `npx` |

2. Detect the framework from `package.json` dependencies for the `-t` flag:

   | Dependency present | `-t` value |
   |---|---|
   | `next` | `next` |
   | `vite` | `vite` |
   | `astro` | `astro` |
   | `@remix-run/react` or `react-router` | `react-router` |
   | `@tanstack/react-start` | `start` |
   | `laravel/framework` in `composer.json`, or an `artisan` file at root | `laravel` |
   | None matched | Omit `-t`; let the CLI prompt interactively |

3. Run `<prefix> shadcn@latest init -t <framework>` (omit `-t <framework>` if
   undetected). Let the CLI's own interactive prompts resolve style, base color, and
   CSS-variable choices — do not pre-answer them; claude-tweaks has no fixed preset to
   apply.

**Option 1 only, additionally:**

4. Wire the MCP server for Claude Code. Back up `.mcp.json` first if it exists
   (`cp .mcp.json .mcp.json.bak`), then run shadcn's own documented setup command, which
   handles the merge:

   ```bash
   <prefix> shadcn@latest mcp init --client claude
   ```

   This writes (or merges into an existing) `.mcp.json`:

   ```json
   {
     "mcpServers": {
       "shadcn": {
         "command": "npx",
         "args": ["shadcn@latest", "mcp"]
       }
     }
   }
   ```

   If the `mcp init --client claude` command fails or is unavailable, fall back to
   merging the JSON block above into `.mcp.json` directly (never overwrite existing
   `mcpServers` entries from other tools).

5. Install the shadcn Skill, using the same package-manager prefix resolved in step 1:

   ```bash
   <prefix> skills add shadcn/ui
   ```

**Case B — `components.json` exists, MCP/skills not fully wired:**

Check `.mcp.json` for an existing `mcpServers.shadcn` entry, and check whether the
shadcn Skill is installed (its directory/marker file, per the `skills` CLI's own
convention). If either is missing, present:

```
shadcn/ui is already initialized in this project. Wire up the MCP server and
shadcn/skills for Claude Code?

1. Yes — wire remaining layers (Recommended)
2. Skip
```

Option 1 runs steps 4-5 above (skipping CLI init, already done). Option 2 skips both.

**Case C — fully configured already:**

`components.json` exists, `.mcp.json` has the `mcpServers.shadcn` entry, and the shadcn
Skill is installed. Silent no-op — no prompt, matching every other Optional Enhancement
step's idempotency contract.

**Write the CLAUDE.md flag.** Add (or update) the `## Design integration` section — the
same section Steps 10 and 11 write to:

```markdown
## Design integration

design-integration: enabled
diagram-integration: enabled
shadcn-integration: enabled
```

| Case / choice | Flag value |
|---|---|
| Case A, option 1 | `enabled` |
| Case A, option 2 | `cli-only` |
| Case A, option 3 (skip) | `disabled` |
| Case B, option 1 | `enabled` |
| Case B, option 2 (skip) | `cli-only` — the CLI portion is already done regardless of this offer's outcome, so `cli-only` reflects reality; `disabled` would be inaccurate |
| Case C | No write — the flag should already read `enabled` from a prior run; leave untouched |

**Scope note:** this flag is currently write-only — no other claude-tweaks skill reads
it yet. Re-run idempotency for this step comes entirely from the filesystem checks above
(Case A/B/C), not from this flag. The flag is reserved for a future consumer (e.g. `/design`
preferring shadcn components when it reads `enabled`), the same role `design-integration`
plays for Step 10.

**Failure handling:** If any install command fails (network error, package-manager
error), surface the failure and continue Phase 0 with `shadcn-integration: disabled` (or
the honestly-reached partial state) rather than aborting the rest of bootstrap.

---

### Step 13 — Routine Installation (detailed procedure)

claude-tweaks skills can ship a `routine-template.yml` (schema: `skills/_shared/routine-template-schema.md`) enabling `/claude-tweaks:routine create <skill>` to instantiate a scheduled cloud Routine for this project — e.g. code-health's nightly LLM-as-judge sweep, or tidy's periodic backlog hygiene pass. This step surfaces that option right after bootstrap instead of leaving it to be discovered later.

**Detect candidates:**

```bash
ls "${CLAUDE_PLUGIN_ROOT}"/skills/*/routine-template.yml 2>/dev/null
```

For each match, note the candidate skill name (the directory under `skills/`). Then glob `.claude-tweaks/routines/*.yml` in the current project and read each match's `template:` field (per `skills/_shared/routine-template-schema.md`'s instantiated-record schema — `template` names the skill the record came from). Build the set of skill names that already have a record this way, and only offer candidates NOT in that set. This is prefix-agnostic — it never needs to re-derive the project-prefixed record filename (`PREFIXED_NAME`, computed by `/routine` itself) inside init — and makes the step idempotent and safe on every `/init` re-run. If no candidates remain (none shipped, or every candidate already has a record), skip this step silently.

**Present:**

```
{N} claude-tweaks skill(s) support scheduled cloud Routines: {list, e.g. "code-health (nightly repo sweep), tidy (periodic backlog hygiene)"}.

Set any of these up now?
1. Yes — walk me through each **(Recommended)**
2. Not now — I'll use `/claude-tweaks:routine create <skill>` later
```

**For option 1:** For each skill the user selects, invoke `/claude-tweaks:routine create <skill> --source init` directly. `/routine`'s own CREATE workflow (template load, repo/name resolution, idempotency check, environment/schedule resolution, review gate) handles everything end-to-end, including the mandatory explicit confirmation before any live `RemoteTrigger` call — the invocation may also include `--dry-run` if the user wants to inspect the assembled configuration first without creating anything live. `/init` does not reimplement, shortcut, or pre-answer any part of that workflow — it only discovers candidates and hands off.

**For option 2:** Note the skipped candidates and continue. The same offer reappears on the next `/init` run for any candidate still missing a record.

**Failure handling:** If a `create` invocation fails or the user backs out mid-flow, continue with the remaining selected candidates (or none) rather than aborting the rest of `/init`.

---

### Step 14 — Non-default-branch issue tracking (companion workflow)

Offer only when the project has a GitHub remote (`git remote get-url origin` matches
`github.com`) — same gate Step 9 uses. Check whether
`.github/workflows/track-issue-fixes.yml` already exists; if present, skip this step
silently (idempotent — no re-prompt on `/init` re-run).

GitHub's native `Fixes #N`/`Closes #N` keyword parsing only fires when the referencing
commit lands on the repository's default branch. Projects whose workflow lands fixes on
an integration branch first (`dev`, `staging`, a feature branch) get no signal at all —
the issue just sits open with no record that it's already fixed somewhere.

**Present:**

```
claude-tweaks can wire up automatic issue tracking for non-default branches.
GitHub only auto-closes Fixes #N/Closes #N on the default branch — fixes
landed elsewhere lose that signal entirely and the issue looks untouched.

Set up the tracking workflow?
1. Yes — write .github/workflows/track-issue-fixes.yml (Recommended)
2. Skip — I'll handle issue tracking manually
```

**For option 1 — write the workflow file.** The full YAML is generated by
`bin/lib/issue-branch-tracking.js`'s `generateWorkflowYaml()` — do not hand-author the
file; the generator is the single source of truth (its embedded regex pattern is also
unit-tested). Run:

```bash
mkdir -p .github/workflows
node -e "console.log(require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issue-branch-tracking.js').generateWorkflowYaml())" > .github/workflows/track-issue-fixes.yml
```

The generated workflow ships two jobs, both triggered on `push`:

- **`label-fix-branch`** (runs on any branch that is NOT the repo's default branch) —
  scans the pushed commits for GitHub's own closing keywords
  (`close(s|d)`/`fix(es|ed)`/`resolve(s|d)` + `#N`), and for each matched issue applies
  a `fix-on-<branch>` label (auto-created on first use) plus a comment linking the
  commit SHA.
- **`cleanup-fix-labels`** (runs only on pushes to the default branch) — same scan;
  strips every `fix-on-*` label from matched issues, since GitHub's native parser is
  closing them on this same push.

No `gh issue close` call anywhere in the workflow — the default-branch merge remains
the sole closing action, consistent with claude-tweaks' own close-via-merge rule (see
`_shared/issue-claims.md` and `flow/from-code-health.md` Step 5).

**Failure handling:** if writing the file fails (e.g. permissions), surface the
failure and continue `/init` — never abort the rest of bootstrap on this step.

**Re-run behavior:** the idempotency check above means this step is silent on repeat
`/init` runs once the workflow file exists. Declining is fine — it's offered again on
the next `/init` run.
