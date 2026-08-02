# Init Phase 0 Bootstrap — Detailed Procedures

Loaded by `/init` Phase 0 when the corresponding tool/feature is being set up. Each step is independent — read only the section(s) needed for the step currently executing. In Update Mode most of these are no-ops (already configured); the SKILL.md decides whether to load this file at all.

## Core Bootstrap Version Check (detailed procedure)

Runs before Step 1, on every `/init` invocation regardless of scope — **except** when
`$ARGUMENTS` explicitly names the `bootstrap` Phase scope, which always runs Steps 1-8 fully
regardless of the marker (see the Exception in `SKILL.md`'s "Core Bootstrap Version Check").

**Read the marker and extract its version:**

```bash
MARKER_RAW=$(cat .claude-tweaks/init-state.yml 2>/dev/null)
if [ -z "$MARKER_RAW" ]; then
  MARKER_VERSION=""
else
  MARKER_VERSION=$(echo "$MARKER_RAW" | grep -E '^[[:space:]]*plugin-version:' | sed -E 's/.*plugin-version:[[:space:]]*//; s/"//g')
fi
```

`init-state.yml` only ever has one top-level key (`core-bootstrap`) with two flat children
(`plugin-version`, `verified`), each written double-quoted (see "Write the marker" below) — the
`sed` above strips those quotes, since `compareVersions` rejects a quoted string as invalid
semver. Treat an empty `$MARKER_VERSION` (file missing, or present but malformed enough that
the grep finds no `plugin-version:` line) identically: as if the marker were absent.

**Read the installed version:**

```bash
INSTALLED_VERSION=$(node -e "console.log(require(process.env.CLAUDE_PLUGIN_ROOT + '/.claude-plugin/plugin.json').version)")
```

**Compare (only when `$MARKER_VERSION` is non-empty):**

```bash
node -e "
  const { compareVersions } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/changelog.js');
  console.log(compareVersions(process.argv[1], process.argv[2]));
" "$MARKER_VERSION" "$INSTALLED_VERSION"
```

Prints `-1` (marker older than installed), `0` (match), or `1` (marker newer — shouldn't happen
in practice, treat identically to a match). If `compareVersions` throws (e.g. `$MARKER_VERSION`
extracted to something that still isn't valid semver), treat it the same as marker-missing —
run Steps 1-8 fully, skip the changelog notice.

- `$MARKER_VERSION` empty (missing or malformed) → run Steps 1-8 fully, skip the changelog notice.
- Result `0` or `1` → skip Steps 1-8 (except under the `bootstrap`-scope Exception above, which always runs them); print `"Core bootstrap already verified at v$MARKER_VERSION on {verified date from the marker} — skipping Steps 1-8. Delete .claude-tweaks/init-state.yml to force a full re-check."`
- Result `-1` → run Steps 1-8 fully, then run the changelog notice below.

**Changelog notice:**

```bash
node -e "
  const fs = require('fs');
  const { extractChangelogRange } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/changelog.js');
  const changelog = fs.readFileSync(process.env.CLAUDE_PLUGIN_ROOT + '/CHANGELOG.md', 'utf8');
  console.log(JSON.stringify(extractChangelogRange(changelog, process.argv[1], process.argv[2])));
" "$MARKER_VERSION" "$INSTALLED_VERSION"
```

Read the returned `{version, title, body}` entries — in the same newest-first order they
appear in `CHANGELOG.md` — and synthesize the filtered summary described in `SKILL.md`'s "Core
Bootstrap Version Check" section.

**Write the marker:**

```bash
mkdir -p .claude-tweaks
cat > .claude-tweaks/init-state.yml <<EOF
core-bootstrap:
  plugin-version: "$INSTALLED_VERSION"
  verified: "$(date -u +%Y-%m-%d)"
EOF
```

Write this only after Steps 1-8 have actually run (or been skipped) above — not before.
`init-state.yml` only ever has this one key today — a full overwrite is safe. If a future
change adds other top-level keys to this file, switch to a merge instead of an overwrite.

---

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
specs/                      → Spec files; also backlog work records when work-backend: local-files (flat specs/{n}-{slug}.md, local-store.js)
docs/                       → Documentation root (REGISTRY.md created in Phase 8.5)
docs/superpowers/specs/     → Design docs (from /superpowers:brainstorming)
docs/superpowers/plans/     → Execution plans (from /superpowers:writing-plans)
docs/plans/                 → Claude-tweaks pipeline state (briefs, ledger, audit/recommendations caches)
docs/journeys/              → User and developer journey files (created by /journeys, tested by /visual-review)
.claude/skills/             → Skill files (should already exist if this skill is running)
```

---

### Step 3 — Starter files (detailed content)

Create these **only if missing** — never overwrite existing content. Idempotent and safe to skip on Update Mode runs.

No starter directory is needed for backlog work records — under `work-backend: github-issues` they live on the tracker; under `work-backend: local-files` `local-store.js` writes them directly as flat `specs/{n}-{slug}.md` files (no subdirectory to pre-create) as `/claude-tweaks:capture` and `/claude-tweaks:tidy`'s Defer action file them. `specs/` itself is already created by Step 2.

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
.claude-tweaks/pipelines/*
!.claude-tweaks/pipelines/*/
.claude-tweaks/pipelines/*/*
!.claude-tweaks/pipelines/*/work/
!.claude-tweaks/pipelines/*/work/**
!.claude-tweaks/pipelines/*/spec-*/
.claude-tweaks/pipelines/*/spec-*/*
!.claude-tweaks/pipelines/*/spec-*/work/
!.claude-tweaks/pipelines/*/spec-*/work/**
!.claude-tweaks/pipelines/archive/*/
.claude-tweaks/pipelines/archive/*/*
!.claude-tweaks/pipelines/archive/*/work/
!.claude-tweaks/pipelines/archive/*/work/**
!.claude-tweaks/pipelines/archive/*/spec-*/
.claude-tweaks/pipelines/archive/*/spec-*/*
!.claude-tweaks/pipelines/archive/*/spec-*/work/
!.claude-tweaks/pipelines/archive/*/spec-*/work/**
.claude-tweaks/research/
.claude-tweaks/code-health/
.claude-tweaks/harness-health/
.claude-tweaks/journey-health/
.claude-tweaks/docs-health/
.claude-tweaks/routine-environment-cache.yml
.claude-tweaks/init-state.yml
.impeccable/config.local.json
.impeccable/hook.cache.json
.impeccable/hook.pending.json
```

These entries ignore claude-tweaks' transient, project-local state — pipeline run directories (`pipelines/{ISO-timestamp}-{spec-slug}/config.yml`, `decisions.md`, `staged/`), research report output, each health skill's own local cache (`code-health/cache.json`, `harness-health/cache.json`, `journey-health/cache.json`, `docs-health/cache.json` — the only files still written under these paths; cursor and run-history state now live on the durable `health-state` git branch, see `skills/_shared/health-state.md` and `bin/lib/{skill}/cache.js` for each), and the routine-environment-resolution cache (see `skills/routine/SKILL.md`). Deliberately **not** blanket-ignored: `.claude-tweaks/routines/{name}.yml` (instantiated cloud-Routine records, written by `/claude-tweaks:routine`) — those are explicitly documented as safe, and meant, to commit. A blanket `.claude-tweaks/` line would make that directory permanently uncommittable regardless of user intent, since git cannot reliably re-include a subdirectory of an already-ignored parent via `!` negation. The statusline cache lives under the user's home directory (`~/.claude-tweaks/`), a separate global path — it never needs a project `.gitignore` entry. The same rule applies to Impeccable's own config directory: `.impeccable/config.json` is Impeccable's committed, shared team config (colors, typography, brand voice); only the three per-developer files above — `config.local.json`, `hook.cache.json`, and `hook.pending.json`, all written by its optional automatic-detection hook — are local state. A blanket `.impeccable/` line would make `config.json` permanently uncommittable for the identical structural reason.

The same structural rule applies one level deeper, inside `.claude-tweaks/pipelines/` itself: `flow/materialize.md` documents that a materialized spec file under `pipelines/{run-id}/work/` (and its multi-record `spec-{n}/work/` variant, plus both variants again under `pipelines/archive/{run-id}/` — the path `/claude-tweaks:wrap-up`'s cleanup step produces) is committed audit trail, never gitignored. A bare `.claude-tweaks/pipelines/` blanket line would stop git from ever traversing into the directory at all, so a nested `!work/` re-inclusion could never take effect (this project's own `.gitignore` Don't in CLAUDE.md names this exact class of bug). The template above instead un-ignores each directory level on the way down to `work/`, at both the single-record and multi-record depths, and repeats that same per-level shape under `pipelines/archive/`. This repo's own root `.gitignore` uses the identical 17-line pattern — mirror it verbatim rather than re-deriving it by hand.

**Re-run behavior (migration check):** don't just check whether `.gitignore` "already covers" `.claude-tweaks/` — a project that adopted claude-tweaks before this split existed may have the old blanket line, which silently reintroduces the routines-uncommittable bug even though something matching `.claude-tweaks` is technically present. Likewise, a project that adopted the split before the per-level `pipelines/` pattern existed may have a naive `.claude-tweaks/pipelines/` blanket sub-line — that silently reintroduces the identical class of bug one level down, permanently pruning the `work/` audit trail `flow/materialize.md` promises is tracked history.

| Current state | Action |
|---|---|
| No `.gitignore`, or one with no `.claude-tweaks` reference at all | Suggest adding the split entries above. |
| Standalone blanket `.claude-tweaks/` line (the old, pre-split form) | **Migrate.** Propose replacing the blanket line with the split entries above (the per-level `pipelines/` un-ignore block plus `.claude-tweaks/research/`, `.claude-tweaks/code-health/`, `.claude-tweaks/harness-health/`, `.claude-tweaks/journey-health/`, `.claude-tweaks/docs-health/`, `.claude-tweaks/routine-environment-cache.yml`) rather than silently treating it as already covered — the blanket form makes `.claude-tweaks/routines/{name}.yml` permanently uncommittable. Backup `.gitignore` before write. |
| Split entries present, but `.claude-tweaks/pipelines/` is a bare blanket sub-line (the old, pre-per-level form) | **Migrate.** Propose replacing that single line with the per-level un-ignore block above — the naive form makes `pipelines/{run-id}/work/` (and its `spec-*/work/` and `archive/*/work/` variants) permanently uncommittable, silently pruning the audit trail `flow/materialize.md` promises. Backup `.gitignore` before write. |
| Already has the split entries with the per-level `pipelines/` pattern | No-op (already migrated). |

If `stories/` exists or will be created, call `AskUserQuestion`:

- `question`: `"Should story YAML files be committed to version control?"`, `header`: `"Stories in git"`, `multiSelect`: `false`
- Option 1 — `label`: `"Yes — commit stories/ (Recommended)"`, `description`: `"Stories are part of the project's test suite; track them in version control."`
- Option 2 — `label`: `"No — add to .gitignore"`, `description`: `"Add stories/ to .gitignore instead of committing it."`

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
4. **Base ref** — see `_shared/worktree-base-ref.md` for why this matters (shared with `build/worktree-setup.md`'s runtime verification of the same setting). Read `settings.json`; if `worktree.baseRef` is unset or `fresh`, surface:
   ```
   Worktree base ref is `{current value or 'unset (default: fresh)'}`. claude-tweaks branches from your current local HEAD — `fresh` can branch from a stale `origin/<default-branch>`. Set `worktree.baseRef: "head"`? (Y/n)
   ```
   On yes, write `{ "worktree": { "baseRef": "head" } }` into `settings.json` (backup first, merge — don't clobber existing keys). In `auto` mode, set it without prompting and log the change.
5. **`worktree.always` policy** — check `.claude-tweaks/policy.yml` (repo root) for a `worktree.always:` line:

   | State found | Behavior |
   |---|---|
   | No `worktree.always:` line at all (no file, or file present without the key) | Ask the question below |
   | `worktree.always: true` | No-op — already enabled, skip silently |
   | `worktree.always: false` | Ask the question below (re-offer — matches Step 11/12/13's re-offer-on-decline convention) |

   When asking, call `AskUserQuestion`:
   - `question`: `"Require an isolated git worktree for every file edit in this project?"`, `header`: `"Worktree policy"`, `multiSelect`: `false`
   - Option 1 — `label`: `"Yes — enforce worktree.always (Recommended)"`, `description`: `"Mechanically denies Edit/Write/NotebookEdit/git commit outside a linked worktree from the first prompt of every future session. Prevents concurrent sessions from colliding on the main checkout."`
   - Option 2 — `label`: `"No — allow direct edits in the main checkout"`, `description`: `"Leaves the main checkout open for direct edits. You can enable this later by re-running /init."`

   **Do not write `.claude-tweaks/policy.yml` here.** Record the answer (`true` for Option 1, `false` for Option 2 — write `false` explicitly rather than leaving the key absent, so the idempotency check above can detect "already asked, declined" on a future run) and carry it forward to the end of this `/init` invocation. Writing it immediately would deny this same run's own remaining `Edit`/`Write` calls (Steps 7-17 below, and Phases 1-9 for any fuller scope) via the very policy this step turns on. See `SKILL.md`'s "Finalizing the worktree.always Decision" for the general rule governing where the write actually happens — normally at Phase 9 ("Worktree Policy Finalization"), but at whatever point this invocation actually ends if that happens first (examples: the `bootstrap`-only scope, or the Scope Selection Gate's "Done" choices).

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

Order-agnostic and append-only by default — most steps in this group are independent "detect condition → offer → write artifact → idempotent" companion integrations with no dependency on each other's order, so a new one is normally added at the end with no renumbering. Two steps are deliberate exceptions to that default, both inserted via a full renumbering rather than appended: Step 9 (Establish GitHub Remote) must run before Steps 10/14/16/17 — it establishes the remote those steps each independently check for, so appending it at the end would run too late to help them within the same bootstrap pass — and was inserted with a full renumbering of the then-Steps 9-16 → 10-17. Step 14 (Cloud/Routine Parity Setup, itself renumbered from 13 by this same pass) must run before Step 15 (Routine Installation) — a Routine created before cloud/plugin parity is set up would silently fail its first cloud firing — originally inserted with a renumbering of Steps 13-15 → 14-16. Future additions default back to append-only unless they have the same kind of genuine ordering dependency on an earlier step. One further narrow exception: Step 10's native-Type mention reads a config key (`work-types`) that only Step 17 writes — see Step 10's own note for how it handles running before Step 17 on a fresh bootstrap.

### Step 9 — Establish GitHub Remote (detailed procedure)

Interactive-only. This step never runs under `auto`/non-interactive mode — creating a GitHub repository is a consequential, externally-visible, hard-to-reverse action, the same class of action `_shared/browser-detection.md` already bars from unattended auto-install. In `auto` mode, skip this step entirely; every downstream step below falls through to its own existing gate-fails behavior unchanged.

**Gate:** `git rev-parse --is-inside-work-tree` fails → this step doesn't run at all (nothing to attach a remote to; Step 5 above already handles warning about a non-git directory). Otherwise, `git remote get-url origin` fails (no remote configured at all) → proceed with this step. Any existing remote — GitHub or not — skips this step silently; the user has already chosen a host.

Steps 10/14/16/17 below independently check for a *reachable GitHub-flavored remote* specifically (not just any remote) via a related, richer two-tier check: `gh repo view --json owner,name` succeeding when `gh` is available and authenticated (works for GitHub Enterprise, not just github.com), else `git remote get-url origin` exits 0 as a fallback heuristic — a non-GitHub git host would simply see those steps' offers and decline them, which costs nothing. This step's own gate above is intentionally simpler and broader: it doesn't try to distinguish GitHub from other hosts, since creating a repo is only relevant when there is truly no remote configured yet.

**1. Ensure `gh` is ready.**

Check `gh --version`. If missing, detect the platform's package manager the same way Step 8 above does:

| Platform | Detect | Install command |
|---|---|---|
| macOS | `brew --version` | `brew install gh` |
| Windows | `winget --version` or `scoop --version` | `winget install --id GitHub.cli` or `scoop install gh` |
| Linux | `apt --version` / `dnf --version` / `pacman --version` | Print GitHub's own official Linux install instructions (https://github.com/cli/cli/blob/trunk/docs/install_linux.md) rather than a single `apt install gh` line — most distros don't ship `gh` in default repos and require adding GitHub's own package repository first; `pacman -S github-cli` is the one exception that installs directly |

Call `AskUserQuestion`:

- `question`: `"gh CLI not found — needed to create a GitHub repository. Install it now?"`, `header`: `"Install gh CLI"`, `multiSelect`: `false`
- Option 1 — `label`: `"Install gh CLI (Recommended)"`, `description`: `"Runs {the detected install command} via Bash."`
- Option 2 — `label`: `"Skip"`, `description`: `"Don't set up a GitHub remote this run."`

On macOS/Windows (no `sudo` needed), run the install command directly via Bash on accept, then re-verify with `gh --version`. On Linux, print the official install instructions instead of running anything — matching Step 8's existing "we don't run sudo from init" rule — and wait for the user to confirm they've run it, then re-verify. If installation fails, or no package manager is detected on a platform other than Linux, abort this step gracefully: proceed to whatever this invocation runs next (Steps 10/14/16/17 below take their existing gate-fails paths).

Check `gh auth status`. If not authenticated, explain that this requires a one-time browser step, then run `gh auth login --web` and wait for the user to complete the device-flow authorization in their browser. Re-verify with `gh auth status` afterward. A user who declines, or an auth flow that doesn't complete, aborts this step gracefully the same way.

**2. Offer to create the repo.** Call `AskUserQuestion`:

- `question`: `"No GitHub remote found for this project. Create one now?"`, `header`: `"Create GitHub repo"`, `multiSelect`: `false`
- Option 1 — `label`: `"Create a GitHub repo (Recommended)"`, `description`: `"Set up a new GitHub repository and link it as origin."`
- Option 2 — `label`: `"Skip"`, `description`: `"Don't set up a GitHub remote this run."`

Declining falls through to existing behavior unchanged — Steps 10/14/16/17 below each take their own gate-fails path.

**3. Choose owner.** Resolve the personal account (`gh api user --jq .login`) and the user's orgs (`gh api user/orgs --jq '.[].login'`). Call `AskUserQuestion`:

- `question`: `"Create the repo under your personal account or an organization?"`, `header`: `"Repo owner"`, `multiSelect`: `false`
- Option 1 — `label`: `"{personal account} (Recommended)"`, `description`: `"Create under your personal account."`
- Option 2..4 — one per org, up to 3, `label`: `"{org login}"`, `description`: `"Create under this organization."`

With zero orgs, Option 1 (the personal account) is the only explicit option — that's fine. `Other` is a built-in free-text field on every `AskUserQuestion` call regardless of how many explicit options are listed, so it satisfies the tool's requirements without a synthetic second option, and it doubles as the escape hatch for any org beyond the first 3 or any org not listed.

**4. Confirm name.** Default = the git top-level directory's basename (`git rev-parse --show-toplevel`), lowercased, with any run of characters outside `[a-z0-9-]` replaced by a single `-`, trimmed of leading/trailing `-` (GitHub repo naming rules). Present the default and let the user override it in the same exchange rather than a separate round-trip.

**5. Choose visibility.** Call `AskUserQuestion`:

- `question`: `"Repository visibility?"`, `header`: `"Visibility"`, `multiSelect`: `false`
- Option 1 — `label`: `"Private (Recommended)"`, `description`: `"Only you (and anyone you invite) can see it."`
- Option 2 — `label`: `"Public"`, `description`: `"Anyone can see it."`

**6. Final confirmation.** One explicit summary confirm before executing — covers the whole create+link+push action, not a re-ask of sub-steps 3-5:

- `question`: `"Create github.com/{owner}/{name} ({visibility}) and set it as origin{push_clause}?"`, `header`: `"Confirm"`, `multiSelect`: `false` (`{push_clause}` = `", pushing the current branch"` when `git rev-parse HEAD` succeeds, else empty string — matching the same commit-existence check the Execute step below uses for `$PUSH_FLAG`)
- Option 1 — `label`: `"Yes — create it (Recommended)"`, `description`: `"Runs gh repo create with --source=. --remote=origin."`
- Option 2 — `label`: `"Cancel"`, `description`: `"Don't create anything."`

**7. Execute.**

```bash
git rev-parse HEAD >/dev/null 2>&1 && PUSH_FLAG="--push" || PUSH_FLAG=""
gh repo create "{owner}/{name}" --{private|public} --source=. --remote=origin $PUSH_FLAG
```

`--push` is included only when the current branch already has at least one commit — an empty repo has nothing to push yet. On a name collision, report it and return to sub-step 4 (pick a different name); on a permission error (the chosen owner rejects the create), report it and return to sub-step 3 (pick a different owner) — neither aborts the whole step.

**8. Downstream effect.** Once the remote exists, Steps 10/14/16/17 below see it via their own existing two-tier check (documented above) and take their already-documented enriched paths — no further action needed here.

**Failure handling summary:**

| Condition | Behavior |
|---|---|
| Not a git repo at all | This step doesn't run (nothing to attach a remote to) |
| A remote already exists (any host) | This step doesn't run |
| User declines install / auth / create | Clean fallback to existing behavior, nothing partially applied |
| `gh` install fails / no package manager detected (non-Linux) | Abort gracefully, same fallback |
| `gh auth login` doesn't complete | Abort gracefully, same fallback |
| Repo name collision | Re-prompt for a different name (sub-step 4), not a hard failure |
| Permission error on creation | Re-prompt for a different owner (sub-step 3), not a hard failure |

---

### Step 10 — GitHub issue form template (agent-task)

Offer only when the project has a GitHub-flavored remote — same two-tier check Step 9
documents. Check whether `.github/ISSUE_TEMPLATE/agent-task.yml` exists; if absent,
offer to install it. The form makes human-filed issues work-record-ready at filing time:
its three sections (Current State / Deliverables / Acceptance Criteria) are exactly the
spec-shaped body `_shared/work-record.md` documents — the same three sections
`/claude-tweaks:backlog refine`'s gate re-verifies before granting authorization and
`/claude-tweaks:flow`'s materialization hard gate (`flow/materialize.md`) re-verifies before
build — so a form-filed issue satisfies both checks with zero translation (GitHub renders
the form's labels as `###` headings; the structural check treats any heading level as
satisfying "the section is present").

When this project's `work-types` config key reads `native`, mention to the user that the
filed issue can also carry a native Type — GitHub's own Type picker in the create-issue UI
sits alongside this form (it is not a templated YAML field below), so a filer sets Type
there directly instead of a filing skill inferring it from prose afterward. `work-types`
is only ever written by Step 17's capability probe, so on a fresh bootstrap run (where
this step executes before Step 17 in the file's presented order) it is still unset when
Step 10 runs — the template-install offer itself proceeds regardless (it doesn't depend on
Type), but defer this specific mention: re-check `work-types` once Step 17 completes and
surface the native-Type note then as a short addendum, not a repeat of the whole offer. On
an `/init update` re-run, `work-types` is already set from a prior run, so this step can
check and mention it inline as written, with no deferral needed.

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

**Label check.** The YAML above applies no top-level `labels:` key (GitHub's
auto-apply-on-create array, distinct from each field's own `label:` attribute above) —
leave it unchanged today. If a future edit adds a `labels:` key naming retired
vocabulary (`backlog`, `code-health`), replace it with the appropriate `by:*` origin
label or drop the key entirely — never ship a template that stamps retired labels onto
newly filed issues by default.

Write the YAML exactly as above to `.github/ISSUE_TEMPLATE/agent-task.yml`. Declining is
fine — freeform issues still work via `/specify`'s own issue-ingestion path (`SKILL.md`
"Resolve the input" case 1 already handles a freeform body with "more editorializing," per
that section); the form just removes the translation judgment.

---

### Step 11 — Impeccable Design Integration (detailed procedure)

claude-tweaks v4.5+ integrates [Impeccable](https://impeccable.style/) — a frontend-design plugin that ships LLM commands (`critique`, `audit`, `polish`, `bolder`, `delight`, etc.) and a deterministic Node CLI (`impeccable detect`) for catching design anti-patterns. The integration is opt-in and only runs on frontend projects.

**Detect frontend signals from Phase 2 reconnaissance** (or run a quick sniff of the
project root if Phase 0 is being run before Phase 2), using the same trigger-extension
and trigger-path rules as `/claude-tweaks:design-wrapper`'s Layer 3 sniff — for the
canonical list, read `frontend-detection.md` in the `/claude-tweaks:design-wrapper`
skill's directory. If none are detected, skip this step entirely — the project is not
frontend-facing.

**If frontend is detected, call `AskUserQuestion`:**

- `question`: `"Detected frontend project. Set up Impeccable design integration? Impeccable provides design-quality commands invoked by /test (deterministic CLI gate) and /review (LLM critique + audit). All findings are advisory in v4.5 — code is never auto-modified."`, `header`: `"Impeccable integration"`, `multiSelect`: `false`
- Option 1 — `label`: `"Full integration (Recommended)"`, `description`: `"Install plugin, run init + document."`
- Option 2 — `label`: `"Plugin only"`, `description`: `"Install plugin, skip the design-context interview (run later)."`
- Option 3 — `label`: `"Skip"`, `description`: `"Disable design integration."`

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

The `/claude-tweaks:design-wrapper` wrapper reads this flag as Layer 1 of its detection logic. Missing flag is treated identically to `disabled` — design integration only activates when explicitly enabled by `/init`.

**For option 3:** Write `design-integration: disabled` to CLAUDE.md and continue. The wrapper short-circuits universally — no CLI calls, no LLM invocations, no token cost.

**Optional companion (not part of the integration).** Impeccable also publishes a Chrome extension at https://chromewebstore.google.com/detail/impeccable/bdkgmiklpdmaojlpflclinlofgjfpabf that overlays the same 25-rule detector on any webpage during normal browsing. It does not connect to the slash commands and is not tracked by the `design-integration` flag — install it separately if you want ad-hoc audits while browsing your dev server, staging, or any third-party site. Skip otherwise.

**Re-run behavior:** When `/init` is re-run on a project where `design-integration: enabled`, offer to re-run `/impeccable:impeccable init` + `document` to refresh `PRODUCT.md` / `DESIGN.md` (the codebase may have evolved since the last run). When the flag is `plugin-only` or `disabled`, offer the upgrade path back to full integration.

**Failure handling:** If the plugin install fails, do not abort `/init` — surface the failure and continue with `design-integration: disabled` until the user resolves it. The wrapper's availability checks gracefully skip when dependencies are absent.

**Automatic design hook (optional, separate offer).** After the install sequence completes for option 1 or 2 (Impeccable is installed either way), offer the automatic detection hook as its own follow-up. This is a materially different kind of decision from the context-file setup above — automatic runtime behavior during editing, not one-time context generation — so it gets its own prompt rather than a fourth item bolted onto the three-option choice above:

**Call `AskUserQuestion`:**

- `question`: `"Enable Impeccable's automatic design hook? It runs the anti-pattern detector after every UI edit and surfaces findings inline — no slash command needed. Note: consent lives in the working tree, not .git/ — a fresh git worktree (via /build worktree or /flow worktree) won't have this enabled until you run /impeccable hooks on inside it again."`, `header`: `"Automatic design hook"`, `multiSelect`: `false`
- Option 1 — `label`: `"Yes — run /impeccable hooks on (Recommended)"`, `description`: `"Enables the automatic anti-pattern detector for this working tree."`
- Option 2 — `label`: `"Skip"`, `description`: `"Enable later, or per-worktree, as needed."`

On option 1, run `/impeccable:impeccable hooks on` via the Skill tool. This writes hook consent into `.impeccable/config.local.json` in the current working tree only — it does not carry over to worktrees created later by `/build worktree` or `/flow worktree` (see `skills/build/worktree-setup.md` for the per-worktree note). No CLAUDE.md flag is needed for this choice — Impeccable's own `.impeccable/config.local.json` is the on/off state, checked directly by Impeccable, not by this wrapper.

Skip this offer entirely when Impeccable was not installed (option 3 was chosen above, or the install failed) — there is nothing to enable.

---

### Step 12 — Diagram Suggestions

claude-tweaks ships a native diagram-generation skill, `/claude-tweaks:visualize` — no install step, nothing external to set up. Soft-hook nudges in `/journeys`, `/specify`, and `/review` surface "consider a diagram here" recommendations when a journey, spec, or review finding describes flows or structures that benefit from a visual.

This recommendation is **offered for every project** — architecture, ER, sequence, and state diagrams help backend and infra specs equally, the same as frontend ones.

**Call `AskUserQuestion`:**

- `question`: `"Enable diagram suggestions? /journeys, /specify, and /review can suggest generating a themed diagram (via /claude-tweaks:visualize, a native skill — nothing to install) when they detect a state machine, data model, multi-actor flow, decision tree, or layered architecture."`, `header`: `"Diagram suggestions"`, `multiSelect`: `false`
- Option 1 — `label`: `"Enable (Recommended)"`, `description`: `"Writes diagram-suggestions: enabled."`
- Option 2 — `label`: `"Skip"`, `description`: `"Writes diagram-suggestions: disabled (silences future nudges)."`

**Write the flag to CLAUDE.md.** Extend (or create) the existing `## Design integration` section with a second line:

```markdown
## Design integration

design-integration: enabled
diagram-suggestions: enabled
```

Use the appropriate value:

| Choice | Flag value |
|--------|-----------|
| Option 1 (Enable) | `enabled` |
| Option 2 (Skip) | `disabled` |

The soft-hook nudges in `/journeys`, `/specify`, and `/review` read this flag and short-circuit when set to `disabled` (or absent). Missing flag is treated identically to `disabled`.

**Re-run behavior:** When `/init` is re-run on a project where `diagram-suggestions: enabled`, this step is a no-op. When the flag is `disabled`, offer the upgrade path back to `enabled`. When the flag is **missing** — including on a project whose CLAUDE.md still has a pre-visualize `diagram-integration:` line, which nothing reads anymore — present the first-run prompt, same as a fresh init.

---

### Step 13 — shadcn Bootstrap (detailed procedure)

claude-tweaks integrates [shadcn/ui](https://ui.shadcn.com/) — a CLI-driven component
system distributed as copy-paste source files rather than an npm package. As of CLI v4
(~March 2026), shadcn ships three AI-agent-facing layers: the CLI itself (`init`/`add`),
a first-party MCP server (search/browse/view/install/audit registry items), and an
installable Skill (`skills add shadcn/ui`) that injects live project context into Claude Code
so it stops guessing at component APIs. This step wires all three, mirroring Step 11's
(Impeccable) install-and-flag pattern.

**Detect frontend signals from Phase 2 reconnaissance** (or run a quick sniff of the
project root if Phase 0 is being run before Phase 2) — the same canonical sniff rules
Step 11 above uses (`/claude-tweaks:design-wrapper`'s Layer 3 file-extension/path sniff;
read `frontend-detection.md` in that skill's directory for the current list). If none
are detected, skip this step entirely.

Then check whether `components.json` already exists at the project root.

**Case A — no `components.json`, frontend detected:**

Call `AskUserQuestion`:

- `question`: `"Detected frontend project. Set up shadcn/ui integration? Provides a CLI-driven component system plus first-party AI-agent tooling: an MCP server (search/browse/install/audit registry items) and an installable Skill that gives Claude Code live project context, so it discovers and installs components correctly instead of guessing."`, `header`: `"shadcn/ui integration"`, `multiSelect`: `false`
- Option 1 — `label`: `"Full integration (Recommended)"`, `description`: `"CLI init, wire MCP server, install shadcn/skills."`
- Option 2 — `label`: `"CLI only"`, `description`: `"CLI init, skip MCP/skills wiring."`
- Option 3 — `label`: `"Skip"`, `description`: `"Disable shadcn integration."`

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
shadcn Skill is installed by looking for a `shadcn*`-named entry in the available
skills list the harness provides — the same skill-list-resolution technique
`design-wrapper/SKILL.md` uses to detect whether Impeccable is installed (look for
`/impeccable:impeccable*` in that same list); treat no match as not installed. If
either is missing, call `AskUserQuestion`:

- `question`: `"shadcn/ui is already initialized in this project. Wire up the MCP server and shadcn/skills for Claude Code?"`, `header`: `"shadcn/ui wiring"`, `multiSelect`: `false`
- Option 1 — `label`: `"Yes — wire remaining layers (Recommended)"`, `description`: `"Runs steps 4-5 above (skipping CLI init, already done)."`
- Option 2 — `label`: `"Skip"`, `description`: `"Leave both layers unwired."`

Option 1 runs steps 4-5 above (skipping CLI init, already done). Option 2 skips both.

**Case C — fully configured already:**

`components.json` exists, `.mcp.json` has the `mcpServers.shadcn` entry, and the shadcn
Skill is installed. Silent no-op — no prompt, matching every other Optional Enhancement
step's idempotency contract.

**Write the CLAUDE.md flag.** Add (or update) the `## Design integration` section — the
same section Steps 11 and 12 write to:

```markdown
## Design integration

design-integration: enabled
diagram-suggestions: enabled
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
(Case A/B/C), not from this flag. The flag is reserved for a future consumer (e.g. `/design-wrapper`
preferring shadcn components when it reads `enabled`), the same role `design-integration`
plays for Step 11.

**Failure handling:** If any install command fails (network error, package-manager
error), surface the failure and continue Phase 0 with `shadcn-integration: disabled` (or
the honestly-reached partial state) rather than aborting the rest of bootstrap.

---

### Step 14 — Cloud/Routine Parity Setup (detailed procedure)

Cloud sessions (claude.ai/code) and scheduled Routines run in fresh sandboxes with no access to this machine's local `~/.claude` config — they only see plugins declared in the **project-level** `.claude/settings.json#enabledPlugins` (paired with any custom marketplace under `extraKnownMarketplaces`). A project that never declares this has full local capability but silently loses claude-tweaks (and everything it depends on) the moment someone opens a cloud session or fires a scheduled Routine against it.

**Gate:** same two-tier check Step 9 documents. No remote → skip this step silently.

**Branch check.** Resolve the repo's actual GitHub default branch: when `gh` is available and authenticated, `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`; otherwise fall back to `git remote show origin` and read its `HEAD branch:` line (the same technique `_shared/routine-template-schema.md`'s standard prompt preamble already uses to resolve a target branch). Compare it against the current branch (`git branch --show-current`). If neither source resolves a default branch, skip this check silently rather than guessing — everything below still runs. If they differ, this doesn't block the step, but print an explicit warning before continuing to Detect: `"This project's default branch is '{default}', but you're currently on '{current}'. Cloud sessions and scheduled Routines check out '{default}' — the plugin declarations and script this step is about to write won't take effect for cloud/Routines until this branch merges into '{default}'."` This check runs on every invocation of this step, including a re-run where the Idempotency behavior below skips the settings.json portion — the branch can change between runs even when the declared plugins haven't.

**Detect.** Read the current project's `.claude/settings.json` (treat as `{}` if the file doesn't exist yet) — get `enabledPlugins` and `extraKnownMarketplaces`, each defaulting to `{}` if absent. Read `~/.claude/settings.json` (user-level) the same way. `claude-tweaks@claude-tweaks-marketplace` and `superpowers@claude-plugins-official` are this step's two hard requirements — always candidates for declaration, regardless of whether they appear in the user-level file (this session is running *as* claude-tweaks, so its own identity and its hard dependency are always known). Any other key present in the user-level `enabledPlugins` that is **not** already a key in the project-level `enabledPlugins` is a mirror candidate — read straight from the JSON keys (already fully-qualified `name@marketplace` strings), no CLI-output parsing needed.

**Present.** Call `AskUserQuestion` with a batch table, per this repo's Multi-item Decisions convention:

- `question`: `"Declare these plugins for cloud sessions and Routines? Cloud sandboxes only see what's declared in this project's own .claude/settings.json — not your local machine's config."`, `header`: `"Cloud parity"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"Declare claude-tweaks + superpowers, plus mirror {N} other locally-enabled plugin(s): {list}."` (omit the "plus mirror..." clause entirely when there are no mirror candidates — just "Declare claude-tweaks + superpowers.")
- Option 2 — `label`: `"Override specific items"`, `description`: `"Choose which of the {N} candidates above to declare — claude-tweaks and superpowers are always included."`
- Option 3 — `label`: `"Skip entirely"`, `description`: `"Don't touch .claude/settings.json — I'll configure cloud parity myself later."`

When there are zero mirror candidates, this still renders (never silently auto-applied — matches Step 8's "always prompt before wiring a settings file" precedent), with Option 1's description reduced to the two hard deps only. On "Override specific items," follow up with the two candidates that are always-included stated plainly, then a `multiSelect: true` `AskUserQuestion` listing only the mirror candidates for the user to pick from.

**Apply.** On any outcome except "Skip entirely": merge the project's `.claude/settings.json` — preserve every existing key untouched (same non-destructive merge Step 8 uses for `~/.claude/settings.json`'s `statusLine` key), add `claude-tweaks@claude-tweaks-marketplace: true` and `superpowers@claude-plugins-official: true` under `enabledPlugins`, plus one `true` entry per selected mirror candidate. For `extraKnownMarketplaces`: always ensure a `claude-tweaks-marketplace` entry —

```json
"claude-tweaks-marketplace": {
  "source": {
    "source": "github",
    "repo": "thomasholknielsen/claude-tweaks-marketplace"
  }
}
```

— and for each mirrored plugin whose marketplace isn't `claude-plugins-official` (Anthropic's own official marketplace needs no explicit registration), copy that marketplace's source definition from the user-level `~/.claude/settings.json#extraKnownMarketplaces` into the project-level file, keyed the same way.

**Generate `scripts/claude-cloud-setup.sh`** — always regenerated in full (never appended to or hand-merged):

```bash
#!/usr/bin/env bash
# Generated by claude-tweaks /init (Step 14 — Cloud/Routine Parity Setup).
# Regenerated in full on every /init run from .claude/settings.json — do not hand-edit;
# customize by changing enabledPlugins/extraKnownMarketplaces instead, then re-run /init.
# Idempotent: safe to run on every cloud session, not just the first.
#
# Paste `bash scripts/claude-cloud-setup.sh` into this project's claude.ai/code environment
# Setup script field (environment settings, web UI only — no API sets this remotely) so
# cloud sessions and scheduled Routines get the same plugins available locally.
# See CLAUDE.md's "Cloud parity" section for why this exists and what it doesn't cover.
set -euo pipefail

# The Setup script field's cwd is a workspace root containing the cloned repo as a single
# subdirectory, not the repo root itself ($HOME is not a reliable substitute either) —
# locate the repo by its .git marker (directory or file, to also cover gitdir-file clone
# forms) and cd into it before anything below runs.
SEARCH_ROOT="$(pwd)"
REPO_DIR=$(find "$SEARCH_ROOT" -maxdepth 2 \( -type d -o -type f \) -name .git 2>/dev/null | head -1 | xargs -I{} dirname {})
[ -n "$REPO_DIR" ] && cd "$REPO_DIR"

# Marketplaces referenced below that Claude Code doesn't already know by name — refreshed
# every run so a later `update` pulls from a current catalog pointer, not a stale local clone.
claude plugin marketplace add thomasholknielsen/claude-tweaks-marketplace 2>/dev/null || true
claude plugin marketplace update claude-tweaks-marketplace >/dev/null 2>&1 || true
# `claude-plugins-official` (Anthropic's own marketplace) still needs an explicit `add` here:
# on a fresh cloud sandbox it is not pre-registered at the CLI/runtime level (only this
# project's own .claude/settings.json schema recognizes it by name with no settings entry),
# so `update` alone is a silent no-op until `add` has run at least once in this sandbox.
claude plugin marketplace add anthropics/claude-plugins-official 2>/dev/null || true
claude plugin marketplace update claude-plugins-official >/dev/null 2>&1 || true
# (one additional `claude plugin marketplace add <org>/<repo> 2>/dev/null || true` line plus
# a matching `claude plugin marketplace update <name> >/dev/null 2>&1 || true` line per
# mirrored plugin's marketplace, sourced from that marketplace's `source.repo` field in
# extraKnownMarketplaces — omit both only for a marketplace already added above)

# Plugins declared in .claude/settings.json#enabledPlugins. `claude plugin install` is NOT
# idempotent (errors if the plugin is already present), so try update first and fall back to
# install if update fails. This avoids fragile JSON parsing and works reliably across all runs.
# Deliberately not silencing update's stderr here: if update fails for a real reason (network,
# corrupt marketplace cache) rather than "not installed yet," the install fallback's own
# "already installed" error would otherwise be the only, misleading diagnostic surfaced.
for spec in claude-tweaks@claude-tweaks-marketplace superpowers@claude-plugins-official; do
  claude plugin update "$spec" --scope project || claude plugin install "$spec" --scope project
done
# (one additional spec added to the `for spec in ...` list per mirrored plugin, in the same
# order enabledPlugins lists them — same update-then-install pattern handles it automatically)

# agent-browser — required in the cloud sandbox for /browse-dependent skills
# (/stories, /visual-review, /review, qa-agent, /flow) to work in cloud sessions.
npm install -g agent-browser

# Chrome, so agent-browser can actually launch a browser (the CLI alone can't render a
# page). Unmodified `agent-browser install --with-deps` doesn't work in a cloud sandbox:
#  - it shells out to `sudo apt-get ...` for Chrome's runtime libraries; cloud sandboxes
#    commonly run this whole script as root with no `sudo` binary at all, so that call
#    fails silently and Chrome downloads but can't launch (missing shared libs) — install
#    the libraries directly instead, with no `sudo` prefix.
#  - its own Chrome download can fail `invalid peer certificate: UnknownIssuer` behind a
#    TLS-inspecting sandbox proxy (its bundled HTTP client doesn't trust the sandbox's CA
#    store) — fetch Chrome for Testing directly via `curl` instead, which honors the
#    system CA store, and place it where agent-browser's own cache expects it.
CHROME_LIBS="libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
  libpango-1.0-0 libcairo2 libatspi2.0-0 libxshmfence1"
# Populate the local apt cache BEFORE resolving package names against it — a fresh
# sandbox's cache is empty until `update` runs, which would otherwise make every
# `apt-cache policy` lookup below (including the t64 fallback) report no candidate.
apt-get update -qq
RESOLVED_LIBS=""
for pkg in $CHROME_LIBS; do
  # Capture apt-cache policy's own output into a variable first, rather than piping it
  # straight into `grep -q` — under this script's `set -o pipefail`, `grep -q` closing its
  # stdin the instant it finds a match can SIGPIPE the still-writing producer, and
  # pipefail then reports that SIGPIPE (141) as the pipeline's exit status instead of
  # grep's real success: a false negative on a genuine match.
  POLICY_OUT="$(apt-cache policy "$pkg" 2>/dev/null || true)"
  if echo "$POLICY_OUT" | grep -qE "Candidate: [^(]"; then
    RESOLVED_LIBS="$RESOLVED_LIBS $pkg"
  else
    # The sandbox's Debian base may have undergone the 64-bit time_t transition, which
    # renamed some packages with a `t64` suffix (e.g. libasound2 -> libasound2t64).
    POLICY_OUT_T64="$(apt-cache policy "${pkg}t64" 2>/dev/null || true)"
    if echo "$POLICY_OUT_T64" | grep -qE "Candidate: [^(]"; then
      RESOLVED_LIBS="$RESOLVED_LIBS ${pkg}t64"
    fi
  fi
done
# $RESOLVED_LIBS is an intentionally unquoted, space-separated word list. `unzip` isn't
# subject to the t64 rename dance (its package name doesn't vary) but a minimal sandbox
# image may not ship it, and the Chrome-for-Testing zip below needs it.
apt-get install -y -qq unzip $RESOLVED_LIBS

AB_BROWSERS_DIR="${HOME}/.agent-browser/browsers"
mkdir -p "$AB_BROWSERS_DIR"
CFT_JSON="$(curl -fsSL https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json)"
read -r CHROME_VERSION CHROME_URL <<<"$(echo "$CFT_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);const s=j.channels.Stable;console.log(s.version, s.downloads.chrome.find(x=>x.platform==='linux64').url)})")"
CHROME_DIR="${AB_BROWSERS_DIR}/chrome-${CHROME_VERSION}"
if [ ! -d "$CHROME_DIR" ]; then
  mkdir -p "$CHROME_DIR"
  curl -fsSL "$CHROME_URL" -o /tmp/chrome-for-testing.zip
  unzip -q -o /tmp/chrome-for-testing.zip -d "$CHROME_DIR"
  rm -f /tmp/chrome-for-testing.zip
fi
chmod +x "${CHROME_DIR}/chrome-linux64/chrome"
```

Write this to `scripts/claude-cloud-setup.sh` in the project root, creating the `scripts/` directory if it doesn't exist. `2>/dev/null || true` on every marketplace-add and marketplace-update line — a duplicate-add or a transient catalog-refresh failure are both expected no-op cases on a re-run. The plugin install-or-update branch and the `npm install -g agent-browser`/Chrome-install lines are left unguarded so a real failure surfaces loudly within the Setup script's own ~5-minute budget, rather than being silently swallowed.

**Residual verification note (#75):** the Chrome-for-Testing download path (`~/.agent-browser/browsers/chrome-{version}/chrome-linux64/chrome`) was derived from `agent-browser doctor`'s confirmed macOS cache layout (`~/.agent-browser/browsers/chrome-{version}/Google Chrome for Testing.app/...`) plus Chrome for Testing's own zip-internal folder naming convention — it has not been exercised against a real Linux cloud sandbox. Verify this path on an actual claude.ai/code sandbox (same repro steps as issue #75) before treating this as fully confirmed; adjust the path if agent-browser's Linux cache layout differs.

**Write/update the `## Cloud parity` CLAUDE.md section** — add near the other project-level config sections (same "add or update a section" idiom Step 11 uses for `## Design integration`):

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

**MCP-parity note (report-only, no write).** Read the current project's `.mcp.json` if it exists (top-level `mcpServers` object — the same key Claude Code's own project-MCP convention uses; verify this against the actual file content before relying on it, since it may vary). Read `~/.claude.json`'s own `mcpServers` object the same way, verifying its actual shape directly rather than assuming — this file's structure hasn't been previously confirmed by this plugin. For every server name present in the local file but absent from the project's `.mcp.json`, print one line: `"{N} MCP server(s) configured locally aren't available to cloud sessions: {names}. If any should be, add them to .mcp.json yourself — server configs can contain credentials, so this is never done automatically."` Print nothing when there's no local-only server, or when `~/.claude.json` has no `mcpServers` key at all.

**Idempotency / re-run behavior.** On a re-run where the project's `.claude/settings.json` already declares both hard deps and there are no new local-only mirror candidates: skip the `AskUserQuestion` prompt, report "Cloud parity: already configured" under Phase 9's Verified & Consistent section, and still regenerate `scripts/claude-cloud-setup.sh` silently (its content is fully derived, so silent regeneration can't lose anything) — but only re-render the CLAUDE.md section if it's missing or doesn't already contain the four bullet labels above (Setup script / Branch / First exposure / MCP servers), to avoid a spurious rewrite on every run.

**Failure handling.** Malformed `.claude/settings.json` (fails to parse as JSON) → report it and skip this step entirely rather than risk corrupting it with a merge. A write failure on either generated file → surface the failure and continue the rest of `/init` (same "don't abort on this step's failure" precedent as Step 11's plugin-install failure handling).

---

### Step 15 — Routine Installation (detailed procedure)

claude-tweaks skills can ship a routine template (schema: `skills/_shared/routine-template-schema.md`) at `skills/{skill}/routine-template.yml`, enabling `/claude-tweaks:routine create <skill>` to instantiate a scheduled cloud Routine for this project. Examples: code-health's nightly LLM-as-judge sweep, or tidy's periodic backlog hygiene pass. This step surfaces that option right after bootstrap instead of leaving it to be discovered later.

**Detect candidates:**

```bash
ls "${CLAUDE_PLUGIN_ROOT}"/skills/*/routine-template.yml 2>/dev/null
```

For each match, note the candidate skill name (the directory under `skills/`). Read each candidate's `routine_name` field and its `default_schedule.cron_expression`, and derive its human-readable form via the same 5a classification table `/claude-tweaks:routine`'s CREATE Step 5 uses (e.g. `"0 3 * * *"` → "Daily, 03:00 UTC").

Derive `REPO_SLUG` once, the same way `/claude-tweaks:routine`'s own CREATE Step 2 does: resolve `git remote get-url origin`, take the resolved URL's `{repo}` segment, lowercase it, replace any run of characters outside `[a-z0-9]` with a single `-`, trim leading/trailing `-`. For each candidate, a record already exists iff `.claude-tweaks/routines/{REPO_SLUG}-{routine_name}.yml` exists in the current project. If `git remote get-url origin` fails (no remote configured), treat every candidate as un-instantiated and offer them all — `/claude-tweaks:routine`'s own CREATE workflow (Step 2) handles the actual missing-remote stop later, at the point a candidate is actually created. Only offer candidates without a matching record. If no candidates remain, skip this step silently.

**Present the candidate table** (plain text, not a tool call) — one row per candidate:

```
{N} claude-tweaks routine(s) available to set up:

| Routine | Default schedule | Notes |
|---|---|---|
| code-health | Daily, 03:00 UTC | {template's notes field, if present} |
| tidy | Weekly, Sunday 04:00 UTC | ... |
| ... | ... | ... |
```

**Resolve environment where possible, shared across every candidate the user may select:** follow `/claude-tweaks:routine`'s own CREATE Step 4 procedure up to (but not including) its guided-creation fallthrough — cache, then its source (a) (project-local `.claude-tweaks/routines/*.yml` records), then its source (b) (repo-matched `RemoteTrigger list`) — see that step for the authoritative source order and their own individual caveats; this step never restates them, so the two can't drift out of sync with each other again. Do **not** attempt guided creation here — it needs one specific routine's own name/schedule/instructions to submit, none of which exist yet at this shared, pre-selection stage; guided creation only ever runs from inside an individual `/claude-tweaks:routine create` call, never from this shared step. If any of those sources yields a value, use it silently for every selected candidate below. If none do, leave the environment unresolved here — see the next step for how the first selected candidate's own `create` call resolves it instead.

**Present the picklist.** Call `AskUserQuestion` with one multiSelect question per group of up to 4 candidates (all groups issued together, in the same call — the tool caps `options` at 4 per question but allows up to 4 questions per call, so up to 16 candidates fit in a single call; today's 6 candidates need exactly 2 groups). For a single group of 4 or fewer candidates, one question is enough — omit the group-numbering suffix. Not reachable with today's 6 shipped templates, but if candidates ever exceed 16, split into multiple sequential `AskUserQuestion` calls (present the first 16, act on that selection, then offer the remainder in a follow-up call) rather than silently truncating the list.

- `question` (group 1): `"Which routines do you want to set up?"` (or, when there is more than one group, `"Which routines do you want to set up? (1/{G})"`), `header`: `"Routines"`, `multiSelect`: `true`, one option per candidate in this group: `label` = the candidate's skill name (e.g. `"code-health"`, `"tidy"`), `description` = its human-readable default schedule (e.g. `"Daily, 03:00 UTC"`)
- Repeat for each subsequent group, `question`: `"Which routines do you want to set up? ({i}/{G})"`

Selecting a candidate in this call **is** the confirmation to create it — there is no separate follow-up confirm. Selecting none (in every group) means "not now" for every candidate; the same offer reappears on the next `/init` run for any candidate still missing a record.

**For each selected candidate:** if the step above resolved an environment, invoke `/claude-tweaks:routine create <skill> --defaults --environment=<resolved id> --source init` directly. If it didn't, invoke `/claude-tweaks:routine create <skill> --defaults --source init` (omitting `--environment`) for the *first* selected candidate only — its own CREATE Step 4 re-checks the cache, source (a), and source (b) (all still empty, by definition of reaching this branch), then Step 8 opens the guided-creation browser flow (or falls back to asking the user directly if guided creation is unavailable) to create this candidate's real routine, and writes the resolved `environment_id`/`environment_name` to the cache as a side effect. If that first candidate's `create` call fails (guided creation itself failed partway, or every fallback was unavailable), the cache is still empty — do not fall through to inviting a *second* candidate to attempt its own guided creation, which could create a second, duplicate `claude-tweaks: <slug>` environment (live, billed, no delete API). Stop attempting the remaining selected candidates in this case specifically (this overrides the general Failure-handling rule below, which otherwise continues past a single candidate's failure) and report that environment bootstrapping failed, with whatever detail the failed `create` call surfaced, so the user can re-run once the underlying issue (browser unavailable, UI automation failure, etc.) is resolved. If that first candidate's `create` call succeeds, every subsequent selected candidate finds the now-cached value automatically — invoke each of them with `--environment=<resolved id>` exactly like the "already resolved" case above. Either way, this flag combination skips `/routine`'s own interactive cadence picker and confirm — it uses the template's own default schedule and creates immediately, since the multiSelect selection above already served as the confirmation. `/init` still does not reimplement or duplicate any of `/routine`'s body-assembly, `RemoteTrigger`, guided-creation, or record-writing logic — `--defaults` (with or without `--environment=<id>`) is `/routine`'s own sanctioned non-interactive entry point, not a shortcut `/init` invented around it.

A user who wants a non-default schedule or environment for a specific routine declines it here and runs `/claude-tweaks:routine create <skill>` (without `--defaults`) afterward, where the full interactive Customize path is available.

**Failure handling:** If a `create` invocation fails for one selected candidate, continue with the remaining selected candidates rather than aborting the rest of `/init` — **except** the fresh-project first-candidate-bootstraps-the-environment case above, which stops instead (see that step's own explicit override and its reasoning). Report which candidates succeeded (with their console URLs) and which failed, in a single summary after all selected candidates have been attempted.

---

### Step 16 — Non-default-branch issue tracking (companion workflow)

Offer only when the project has a GitHub-flavored remote — same two-tier check Step 9
documents. Check whether
`.github/workflows/track-issue-fixes.yml` already exists; if present, skip this step
silently (idempotent — no re-prompt on `/init` re-run).

GitHub's native `Fixes #N`/`Closes #N` keyword parsing only fires when the referencing
commit lands on the repository's default branch. Projects whose workflow lands fixes on
an integration branch first (`dev`, `staging`, a feature branch) get no signal at all —
the issue just sits open with no record that it's already fixed somewhere.

**Call `AskUserQuestion`:**

- `question`: `"claude-tweaks can wire up automatic issue tracking for non-default branches. GitHub only auto-closes Fixes #N/Closes #N on the default branch — fixes landed elsewhere lose that signal entirely and the issue looks untouched. Set up the tracking workflow?"`, `header`: `"Issue tracking"`, `multiSelect`: `false`
- Option 1 — `label`: `"Yes — write the tracking workflow (Recommended)"`, `description`: `"Writes .github/workflows/track-issue-fixes.yml."`
- Option 2 — `label`: `"Skip"`, `description`: `"Handle issue tracking manually."`

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
"Close-via-merge" in `_shared/issue-claims.md`).

**Failure handling:** if writing the file fails (e.g. permissions), surface the
failure and continue `/init` — never abort the rest of bootstrap on this step.

**Re-run behavior:** the idempotency check above means this step is silent on repeat
`/init` runs once the workflow file exists. Declining is fine — it's offered again on
the next `/init` run.

---

### Step 17 — Work-Record Backend (detailed procedure)

`/claude-tweaks:capture`, `/claude-tweaks:specify`, `/claude-tweaks:backlog`,
`/claude-tweaks:dispatch`, `/claude-tweaks:tidy`, and the health skills
(`/claude-tweaks:code-health`, `/claude-tweaks:harness-health`,
`/claude-tweaks:journey-health`) all file, shape, gate, dispatch, or sweep against
the same **work record** — the one durable unit each of them acts on. A work record
is backed by either a GitHub issue or, under the `local-files` driver, one local
record file per record (`specs/{id}-{slug}.md`, read and written by
`bin/lib/issues/local-store.js`). Decide the backend once here so every future
filing/shaping/dispatching run is consistent — no split-brain between issue-backed
and file-backed records for the same repo. `_shared/work-record.md` is the canonical
home of the full record taxonomy (the axes, the label families, and the
config-key table) — every consumer skill cites it rather than restating it, and this
step is where its config keys first get written.

**Gate:** same two-tier check Step 9 documents.

**When the gate succeeds** (a GitHub-flavored remote is reachable): skip the prompt
below entirely and go straight to "Write the flag to CLAUDE.md" with
`work-backend: github-issues`. GitHub issues is the richer, proven path
(filterable, visible outside the repo, works with `/claude-tweaks:backlog refine` for
authorization and headless dispatch) — asking a neutral A/B question when the
better option is
unambiguously available is unnecessary friction, not a meaningful decision. A user
who wants local record files anyway (e.g. a public repo where work records
shouldn't be GitHub-visible) can still hand-edit CLAUDE.md's `work-backend` value
afterward — every consumer skill always honors whatever the flag says, regardless
of how it was set.

**When the gate fails** (no GitHub-flavored remote): present the choice below,
defaulted to option 2 — unchanged from today.

**Call `AskUserQuestion` (gate-fails case only):**

- `question`: `"How should claude-tweaks store work records (captured ideas, specs, and everything /claude-tweaks:backlog, /claude-tweaks:dispatch, and /claude-tweaks:tidy act on)?"`, `header`: `"Work-record backend"`, `multiSelect`: `false`
- Option 1 — `label`: `"GitHub issues (Recommended when a GitHub remote is available)"`, `description`: `"Filterable, visible outside the repo, works with /claude-tweaks:backlog refine for authorization and headless dispatch."`
- Option 2 — `label`: `"Local record files"`, `description`: `"specs/{id}-{slug}.md, one file per record — no GitHub dependency."`

**Write the flag to CLAUDE.md.** Add (or update) a `## Work records` section:

```markdown
## Work records

work-backend: github-issues
```

Use the appropriate value:

| Choice | Flag value |
|--------|-----------|
| Option 1 (GitHub issues) | `github-issues` |
| Option 2 (Local record files) | `local-files` |

A missing `work-backend` flag is treated identically to `local-files` by every
consumer skill that reads it — matching `design-integration`'s missing-flag
convention. That is a read-time fallback, separate from what `/init` itself does
when it finds the flag missing at provisioning time — see "Re-run behavior" below.

**Legacy alias note.** `/capture`, `/challenge`, and `/tidy` read `backlog-backend`
(the pre-migration flag name, under a `## Backlog integration` section) as a
read-only legacy alias for `work-backend` until the separate migration plan
retires it — every other consumer skill reads `work-backend` directly, with no
alias fallback (see `_shared/work-record.md`'s Config keys section, "Legacy alias
exception"). This write path only ever emits `work-backend`, never
`backlog-backend`. If this project's CLAUDE.md already has a `## Backlog
integration` section with a `backlog-backend` value (a pre-migration project), do
not rewrite it here — see "Re-run behavior" below for why that rename belongs to
Update-Mode, offered as a staged change, never applied silently by a Phase 0 pass
landing on an existing config.

**Sub-step 17b — Capability probe.** Runs immediately after Step 17 writes
`work-backend` fresh (either branch above) — not on a re-run where the flag was
already set; see "Re-run behavior" below.

Under `work-backend: github-issues`, resolve the owner/repo and run
`probeCapabilities()` (`bin/lib/issues/capabilities-probe.js`) in one `node -e`
snippet:

```bash
read -r OWNER REPO <<< "$(gh repo view --json owner,name -q '.owner.login + " " + .name')"
node -e "
  const { probeCapabilities } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/capabilities-probe.js');
  console.log(JSON.stringify(probeCapabilities({ owner: process.argv[1], repo: process.argv[2] })));
" "$OWNER" "$REPO"
```

Write the results beside the flag: `work-types: native` when the result's `types`
is true, else `work-types: labels`; `work-links: native` when BOTH `subIssues` and
`dependencies` are true, else `work-links: body-text`. Filing and shaping skills
read these two keys and branch — they never re-probe mid-flow
(`_shared/work-record.md`'s config-key table).

Under `work-backend: local-files`, skip the probe entirely and write
`work-types: labels` plus `work-links: body-text` directly — those are the only
expressions a plain file store supports, so there is nothing to detect.

**Sub-step 17c — Label provisioning offer** (`work-backend: github-issues` only).
Call `AskUserQuestion`:

- `question`: `"Provision all core work-record labels now?"`, `header`:
  `"Label bootstrap"`, `multiSelect`: `false`
- Option 1 (Recommended) — `label`: `"Yes — provision all labels now"`,
  `description`: `"Runs _shared/label-bootstrap.md's canonical LABELS_JSON whole —
  the core label families plus the optional priority:* family (see
  _shared/work-record.md's Label taxonomy table for the current per-family and
  total counts) — plus, when work-types reads labels, the three type:* labels
  (record.js's TYPE_LABELS), which the canonical LABELS_JSON structurally
  excludes. That file's own note names this offer as the one caller allowed
  to use the full list, rather than bootstrapping only what's about to be applied.
  Front-loads label creation so the first health-skill firing or
  /claude-tweaks:capture call never pays the lazy-create path."`
- Option 2 — `label`: `"No — create labels lazily as each skill needs them"`,
  `description`: `"Every filing/shaping/dispatching skill already bootstraps its
  own labels via the same check-then-create loop on first use
  (_shared/label-bootstrap.md). Both are valid — this only changes when labels
  first appear on GitHub, not whether the system works."`

On option 1, run the check-then-create loop from `_shared/label-bootstrap.md` with
its canonical `LABELS_JSON`. When `work-types: labels` (per Sub-step 17b's probe
result), also run the same loop with `record.js`'s `TYPE_LABELS` — the canonical
`LABELS_JSON` structurally excludes `type:*`, so without this second pass the
option's "never pays the lazy-create path" promise would be false for Type labels
the first time `/claude-tweaks:capture` or a health skill files one. Skip this second
pass under `work-types: native` — there's nothing to bootstrap. See
`_shared/work-record.md` for the taxonomy each label expresses (the axes:
type, origin, scoring, stage, authorization, bot state, acceptance).

**Pre-existing artifacts.** Projects that used the earlier two-file backlog design
may still have `specs/backlog/*.md` entries, or live GitHub issues carrying retired
`tier:*`/`status:*`/`backlog` vocabulary. Migrating that pre-existing content into
the unified work-record taxonomy is the separate migration plan's scope, not this
step's — `/init` provisions the backend going forward; it does not touch existing
records. Until that migration plan runs, `/claude-tweaks:tidy` surfaces the gap on
its own: an unsynced local record under `work-backend: github-issues` becomes a
Sync finding, and a live issue still carrying retired vocabulary is flagged for
re-triage.

**Re-run behavior (keyed to `work-backend`).** When `/init` is re-run on a project
where `work-backend: github-issues` is already set, this step — including
sub-steps 17b and 17c — is a no-op; ongoing capability re-probing on an
already-provisioned project is Update-Mode's job (see `update-mode.md`'s
Work-Record Backend Drift), not a repeat of this bootstrap step. When
`work-backend: local-files` is set, re-run the Gate check — if a GitHub remote has
since become available (the project was local-only at the last `/init` and has
since been pushed), offer the upgrade path back to `github-issues`, running 17b/17c
as part of that upgrade. When `work-backend` is **missing**, check for the legacy
`backlog-backend` key first: if present, this is not a fresh-init project — leave
it untouched and defer to Update-Mode's rename offer (see the Legacy alias note
above), rather than silently provisioning a second, differently-named section
beside it. Only when neither key is present does this count as a true fresh init:
apply the same Gate-based handling described above — silently set `github-issues`
(running 17b/17c) when the gate succeeds, present the gate-fails prompt otherwise.

See `_shared/work-record.md` for the full record taxonomy and config-key table that
this flag, and the two keys it provisions alongside it, govern.

**Failure handling:** if writing the CLAUDE.md section fails, surface the failure and
continue `/init` — never abort the rest of bootstrap on this step.
