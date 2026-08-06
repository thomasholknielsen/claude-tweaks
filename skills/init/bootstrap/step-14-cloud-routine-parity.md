# Step 14 — Cloud/Routine Parity Setup (detailed procedure)

*Optional Enhancement step — see `SKILL.md`'s `## Input` for when this group is offered or filtered, and `../bootstrap-steps.md` for its ordering and renumbering conventions.*

Cloud sessions (claude.ai/code) and scheduled Routines run in fresh sandboxes with no access to this machine's local `~/.claude` config — they only see plugins declared in the **project-level** `.claude/settings.json#enabledPlugins` (paired with any custom marketplace under `extraKnownMarketplaces`). A project that never declares this has full local capability but silently loses claude-tweaks (and everything it depends on) the moment someone opens a cloud session or fires a scheduled Routine against it.

**Gate:** same two-tier check Step 9 documents. No remote → skip this step silently.

**Branch check.** Resolve the repo's actual GitHub default branch: when `gh` is available and authenticated, `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`; otherwise fall back to `git remote show origin` and read its `HEAD branch:` line (the same two-source lookup `/claude-tweaks:routine`'s CREATE Step 5.5 runs as the last rank of its own branch-resolution precedence). Compare it against the current branch (`git branch --show-current`). If neither source resolves a default branch, skip this check silently rather than guessing — everything below still runs. If they differ, this doesn't block the step, but print this warning before continuing to Detect:

> This project's default branch is '{default}', but you're currently on '{current}'. Cloud sessions check out '{default}' — the plugin declarations and script this step is about to write won't take effect for cloud sessions until this branch merges into '{default}'. Scheduled Routines are pinned separately: each audits the branch it was given at creation time. If '{current}' is where development actually happens, set `integration-branch: {current}` in `.claude-tweaks/policy.yml`, so every routine created or re-synced from here on audits it — existing ones pick it up on `/claude-tweaks:routine update <skill>`.

That second half matters because the two are genuinely independent: a routine left unpinned audits '{default}' forever, and on a `dev` → `staging` → `main` model that branch can be simultaneously behind and ahead of the one being developed (#132). This check runs on every invocation of this step, including a re-run where the Idempotency behavior below skips the settings.json portion — the branch can change between runs even when the declared plugins haven't.

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
  Scheduled Routines are pinned independently of that: each audits the branch it was given
  at creation. If development happens off the default branch, set `integration-branch` in
  `.claude-tweaks/policy.yml` — every routine created or re-synced afterwards picks it up.
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
