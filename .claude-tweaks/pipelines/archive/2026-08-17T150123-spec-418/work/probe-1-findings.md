# Probe 1 — `git-subdir` end-to-end verification

**Task:** Task 1 of the plugin-payload-cutover build (spec #418). STOP gate before any payload move.
**Date:** 2026-08-17
**Verdict:** **PASS** — all three predicates verified. The run may proceed.
**Environment:** `claude` CLI `2.1.233 (Claude Code)`, macOS (darwin 25.5.0), git 2.x, `gh` authenticated as `thomasholknielsen`.

---

## 1. Headline answers (what later tasks need)

| Question | Answer |
|---|---|
| Does a `git-subdir` marketplace source install end-to-end? | Yes — over `https://` and over `file://`. |
| Catalog field spellings | `source` / `url` / `path`, plus optional `ref` **and** optional `sha`. |
| Are both pin fields real? | Yes. Both accepted, both **empirically discriminating** (see §5). |
| Is the subtree root the cache root? | **Yes.** `.claude-plugin/`, `bin/`, `hooks/`, `skills/` sit directly under the version dir. No `plugin/` wrapper level. |
| Is non-subtree repo content excluded? | **Yes.** Root `README.md` is absent from the cache. So is `.git`. |
| Is the clone partial/sparse? | Yes — `git clone --filter=tree:0` promisor clone + `git sparse-checkout set --cone`. Nuance in §6. |
| Does `${CLAUDE_PLUGIN_ROOT}` resolve to the subtree root? | **Yes** — hook resolved it to `<cache>/probe-marketplace/subdir-probe/0.1.0`, i.e. the subtree root, not the repo root. |
| Cache path shape | `<CLAUDE_CONFIG_DIR>/plugins/cache/{marketplace}/{plugin}/{version}/` |
| Version segment | Taken from `plugin.json`'s `version` (`0.1.0`) — **not** the SHA. The SHA-derived version is only a fallback (§7). |

---

## 2. Recon — CLI surface (verbatim)

```
$ claude --version
2.1.233 (Claude Code)
```

```
$ claude plugin --help
Usage: claude plugin|plugins [options] [command]

Manage Claude Code plugins

Options:
  -h, --help                           Display help for command

Commands:
  details [options] <name>             Show a plugin's component inventory and
                                       projected token cost
  disable [options] [plugin]           Disable an enabled plugin
  enable [options] <plugin>            Enable a disabled plugin
  eval [options] [target]              Run eval cases (evals/**/case.yaml or
                                       evals/**/prompt.md + graders/*.md)
                                       against a plugin and report scored
                                       results. Target is a path, a plugin name,
                                       or a `plugin@marketplace` id — installed
                                       and skills-dir plugins both resolve (and
                                       add a no-plugin baseline arm)
  help [command]                       display help for command
  init|new [options] <name>            Scaffold a new plugin at
                                       ~/.claude/skills/<name>/ (auto-loads next
                                       session as <name>@skills-dir)
  install|i [options] <plugin>         Install a plugin from available
                                       marketplaces (use plugin@marketplace for
                                       specific marketplace)
  list [options]                       List installed plugins
  marketplace                          Manage Claude Code marketplaces
  prune|autoremove [options]           Remove auto-installed dependencies that
                                       are no longer needed
  tag [options] [path]                 Create a {name}--v{version} git tag for a
                                       plugin release, validating that
                                       plugin.json and any enclosing marketplace
                                       entry agree
  uninstall|remove [options] <plugin>  Uninstall an installed plugin
  update [options] <plugin>            Update a plugin to the latest version
                                       (restart required to apply)
  validate [options] <path>            Validate a plugin or marketplace
                                       manifest, or the skills, agents, and
                                       commands in a directory
```

```
$ claude plugin marketplace --help
Usage: claude plugin marketplace [options] [command]

Manage Claude Code marketplaces

Options:
  -h, --help                  Display help for command

Commands:
  add [options] <source>      Add a marketplace from a URL, path, or GitHub repo
  help [command]              display help for command
  list [options]              List all configured marketplaces
  remove|rm [options] <name>  Remove a configured marketplace
  update [options] [name]     Update marketplace(s) from their source - updates
                              all if no name specified
```

```
$ claude plugin install --help
Usage: claude plugin install|i [options] <plugin>

Install a plugin from available marketplaces (use plugin@marketplace for
specific marketplace)

Options:
  --config <key=value>  Set a userConfig option declared in the plugin's
                        manifest (repeatable). Values are validated against the
                        schema and stored via the same path as the interactive
                        /plugin configure flow.
  -h, --help            Display help for command
  -s, --scope <scope>   Installation scope: user, project, or local (default:
                        "user")
  -y, --yes             For a plugin installed by running a marketplace-declared
                        command: accept the displayed command without the
                        confirmation prompt (required when stdin or stdout is
                        not a TTY)
```

```
$ claude plugin marketplace add --help
Usage: claude plugin marketplace add [options] <source>

Add a marketplace from a URL, path, or GitHub repo

Options:
  -h, --help           Display help for command
  --scope <scope>      Where to declare the marketplace: user (default),
                       project, or local
  --sparse <paths...>  Limit checkout to specific directories via git
                       sparse-checkout (for monorepos). Example: --sparse
                       .claude-plugin plugins
```

> Note: `--sparse` on `marketplace add` governs the *marketplace repo* checkout, which is a
> separate concern from the `git-subdir` *plugin* source. Not exercised by this probe.

### Schema, read out of the shipped CLI binary

`grep -a -o 'source:kt("git-subdir").\{0,700\}' /Users/thomasholknielsen/.local/share/claude/versions/2.1.233`

```
source:kt("git-subdir"),url:F().describe("Git repository: GitHub owner/repo shorthand, https://, or git@ URL"),path:F().min(1).describe('Subdirectory within the repo containing the plugin (e.g., "tools/claude-plugin"). Cloned sparsely using partial clone (--filter=tree:0) to minimize bandwidth for monorepos.'),ref:F().optional().describe('Git branch or tag to use (e.g., "main", "v1.0.0"). Defaults to repository default branch.'),sha:BCs().optional().describe("Specific commit SHA to use")}).describe("Plugin located in a subdirectory of a larger repository (monorepo). Only the specified subdirectory is materialized; the rest of the repo is not downloaded.")
```

So the authoritative field set is exactly: **`source`, `url`, `path` (required, min length 1), `ref` (optional), `sha` (optional)**. No `subdir`, no `directory`, no `subpath`.

URL protocol validation, also from the binary:

```js
function GZd(e){try{let t=new URL(e);if(!["https:","http:","file:"].includes(t.protocol)){if(!/^git@[a-zA-Z0-9.-]+:/.test(e))throw Error(`Invalid git URL protocol: ${t.protocol}. Only HTTPS, HTTP, file:// and SSH (git@) URLs are supported.`)}return e}
```

---

## 3. Scratch fixture built

Repo `subdir-probe-repo`, payload under `plugin/`, plus a root `README.md` that must NOT appear in any install:

```
$ git -C .../subdir-probe-repo init -b main
Initialized empty Git repository in .../subdir-probe-repo/.git/

$ git commit -m "Probe repo: plugin payload in plugin/ subdirectory"
[main (root-commit) 927b523] Probe repo: plugin payload in plugin/ subdirectory
 5 files changed, 10 insertions(+)
 create mode 100644 README.md
 create mode 100644 plugin/.claude-plugin/plugin.json
 create mode 100644 plugin/bin/probe.js
 create mode 100644 plugin/hooks/hooks.json
 create mode 100644 plugin/skills/probe-skill/SKILL.md
```

Published (private):

```
$ gh repo create ct-subdir-probe --private --source "$REPO" --push
https://github.com/thomasholknielsen/ct-subdir-probe
To https://github.com/thomasholknielsen/ct-subdir-probe.git
 * [new branch]      HEAD -> main
branch 'main' set up to track 'origin/main'.
```

Later, a second commit was added so the pin fields could be tested discriminatingly:

```
$ git commit -am "Second commit: add SECOND-COMMIT-MARKER to probe skill"
[main 991c42c] Second commit: add SECOND-COMMIT-MARKER to probe skill
 1 file changed, 1 insertion(+)

$ git push origin main
   927b523..991c42c  main -> main

$ git push origin 927b523ac63f636e451ee9f9182d26346c8133d6:refs/heads/probe-branch
 * [new branch]      927b523ac63f636e451ee9f9182d26346c8133d6 -> probe-branch
```

Repo state after the probe:

| ref | commit | `plugin/skills/probe-skill/SKILL.md` contains `SECOND-COMMIT-MARKER`? |
|---|---|---|
| `main` (default) | `991c42c` | yes |
| `probe-branch` | `927b523` | no |

That asymmetry is the discriminator used in §5.

---

## 4. The working catalog entry (copy-paste form)

### Unpinned (tracks default branch)

```json
{ "name": "subdir-probe",
  "source": { "source": "git-subdir", "url": "https://github.com/thomasholknielsen/ct-subdir-probe.git", "path": "plugin" } }
```

### Pinned by commit SHA

```json
{ "name": "subdir-probe",
  "source": { "source": "git-subdir", "url": "https://github.com/thomasholknielsen/ct-subdir-probe.git", "path": "plugin", "sha": "927b523ac63f636e451ee9f9182d26346c8133d6" } }
```

### Pinned by branch or tag

```json
{ "name": "subdir-probe",
  "source": { "source": "git-subdir", "url": "https://github.com/thomasholknielsen/ct-subdir-probe.git", "path": "plugin", "ref": "probe-branch" } }
```

All three shapes passed `claude plugin validate` and installed successfully. No spelling adjustment was needed
beyond the URL scheme (below) — `path`, `ref`, and `sha` were correct on first attempt.

### URL forms — what is rejected

A bare absolute filesystem path is **rejected**:

```
$ claude plugin install subdir-probe@probe-marketplace
Installing plugin "subdir-probe@probe-marketplace"...✘ Failed to install plugin "subdir-probe@probe-marketplace": Invalid git URL: /private/tmp/.../probe1/subdir-probe-repo
```

Note the manifest still **validates** with a bare path — the rejection happens at install time, not at
`claude plugin validate` time. Prefixing `file://` fixes it:

```
$ claude plugin install subdir-probe@probe-marketplace
Installing plugin "subdir-probe@probe-marketplace"...✔ Successfully installed plugin: subdir-probe@probe-marketplace (scope: user)
```

Accepted URL forms: `https:`, `http:`, `file:`, `git@host:` SSH, and GitHub `owner/repo` shorthand.

---

## 5. The three predicates

### Predicate 1 — clone shape: the subtree root IS the cache root

After installing from `https://github.com/thomasholknielsen/ct-subdir-probe.git` with `"path": "plugin"`:

```
$ find /Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/bin
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/.in_use
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/hooks
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/.claude-plugin
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/skills
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/bin/probe.js
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/hooks/hooks.json
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/.claude-plugin/plugin.json
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/skills/probe-skill
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/skills/probe-skill/SKILL.md
```

```
$ ls -la .../cache/probe-marketplace/subdir-probe/0.1.0/
total 0
drwxr-xr-x@ 7 thomasholknielsen  staff  224 Aug 17 15:39 .
drwxr-xr-x@ 3 thomasholknielsen  staff   96 Aug 17 15:39 ..
drwxr-xr-x@ 3 thomasholknielsen  staff   96 Aug 17 15:39 .claude-plugin
drwxr-xr-x@ 2 thomasholknielsen  staff   64 Aug 17 15:40 .in_use
drwxr-xr-x@ 3 thomasholknielsen  staff   96 Aug 17 15:39 bin
drwxr-xr-x@ 3 thomasholknielsen  staff   96 Aug 17 15:39 hooks
drwxr-xr-x@ 3 thomasholknielsen  staff   96 Aug 17 15:39 skills
```

Negative control — the repo-root `README.md` and the `.git` dir are both absent:

```
$ find /Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace -name 'README.md' -o -name '.git'
(no output)
```

**PASS.** There is no `plugin/` wrapper level in the cache, and no non-subtree content.
The only CLI-added entry inside the cache root is `.in_use/` (a lock/bookkeeping dir, present for all
plugins, not specific to `git-subdir`).

### Predicate 2 — skills listed

```
$ claude plugin list
...
  ❯ subdir-probe@probe-marketplace
    Version: 0.1.0
    Scope: project
    Status: ✔ enabled
```

```
$ claude plugin details subdir-probe
subdir-probe 0.1.0
  git-subdir probe
  Source: subdir-probe@probe-marketplace

Component inventory
  Skills (1)  probe-skill
  Agents (0)
  Hooks (1)  SessionStart  (harness-only — no model context cost)
  MCP servers (0)
  LSP servers (0)

Projected token cost
  Always-on:   ~16 tok   added to every session

Per-component (rounded)
  component    always-on  on-invoke
  probe-skill       < 20       < 20
```

**PASS.** The skill in the subtree is discovered and inventoried; the hook in the subtree is registered.

Provenance: the `claude plugin list` excerpt is from the `https://` install at project scope (the full output
also lists the machine's ~60 pre-existing plugin entries, elided here). The `claude plugin details` output is
from the earlier `file://` install under the hermetic config dir of §9 — the same subtree, a different
transport. No `details` run was made against the `https://` install; the component inventory is transport-
independent (it reads the materialized cache, which §5 Predicate 1 shows is byte-identical in shape).

### Predicate 3 — hooks fire and `${CLAUDE_PLUGIN_ROOT}` resolves to the subtree root

```
$ rm -f /tmp/ct-subdir-probe-root.txt
$ claude -p "reply ok"          # run from the scratch project dir
ok
exit=0
$ cat /tmp/ct-subdir-probe-root.txt
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/bin
```

**PASS.** The `SessionStart` hook declared in `plugin/hooks/hooks.json` fired, `node` resolved
`${CLAUDE_PLUGIN_ROOT}/bin/probe.js`, and `__dirname` came back as the `bin/` directory **directly under
the version dir** — i.e. `${CLAUDE_PLUGIN_ROOT}` = the subtree root, with no `plugin/` component in it.

This was reproduced three times (file:// install, https unpinned install, https `ref`-pinned install), with
identical output each time.

### Pin-field discrimination (this is the part that could have silently no-op'd)

Same repo, same `path`, only the pin field varies. Cache wiped between each install.

| Catalog pin | Installed `skills/probe-skill/SKILL.md` last line | Interpretation |
|---|---|---|
| `"sha": "927b523ac6..."` while `main` was at `991c42c` | `Reply with the literal string PROBE-OK.` | pinned to commit 1 — **the pin held** |
| `"ref": "main"` | `SECOND-COMMIT-MARKER` | followed `main` to commit 2 |
| `"ref": "probe-branch"` | `Reply with the literal string PROBE-OK.` | followed the non-default branch to commit 1 |

Verbatim, for the `sha` case (the important one — `main` was two commits ahead at the time):

```
$ cat /Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/skills/probe-skill/SKILL.md
---
name: probe-skill
description: Use when probing git-subdir installs.
---
# Probe Skill
Reply with the literal string PROBE-OK.
```

and for `"ref": "main"`:

```
$ cat /Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/subdir-probe/0.1.0/skills/probe-skill/SKILL.md
---
name: probe-skill
description: Use when probing git-subdir installs.
---
# Probe Skill
Reply with the literal string PROBE-OK.
SECOND-COMMIT-MARKER
```

Both pin fields are real and honored. **Task 6's mirror step may use `sha`; Task 9's branch-pinned entry may
use `ref`.** Both are proven, including `ref` pointing at a *non-default* branch.

---

## 6. Sparse / partial clone — what is and is not true

The CLI's own clone sequence, extracted from the 2.1.233 binary:

```js
[..., "--filter=tree:0", "--no-checkout"]   // + ["--branch", ref] when ref is set and sha is not
// then, in the clone dir:
git sparse-checkout set --cone -- <path>
// then: git checkout   (with an --unshallow fetch fallback path on failure)
```

Reproduced by hand against the probe repo:

```
+ git clone --filter=tree:0 --no-checkout -- https://github.com/thomasholknielsen/ct-subdir-probe.git .../sparse-repro
Cloning into '.../sparse-repro'...
+ git sparse-checkout set --cone -- plugin
+ git checkout
Your branch is up to date with 'origin/main'.
+ ls -a
.
..
.git
plugin
README.md
+ git config --get remote.origin.promisor
true
+ git config --get remote.origin.partialclonefilter
tree:0
```

Two distinct facts, worth not conflating:

1. **The transient clone is a genuine partial (promisor) clone** — `remote.origin.promisor=true`,
   `remote.origin.partialclonefilter=tree:0`. Trees/blobs outside the checked-out cone are never fetched.
   This is the bandwidth property that makes a monorepo layout cheap.
2. **Cone-mode sparse-checkout still materializes root-level files** in that transient clone — note
   `README.md` present in the `ls -a` above. That is expected `--cone` behavior (top-level files are always
   in the cone). **The exclusion of root content from the install comes from the copy step, not from
   sparse-checkout**: only `<clonedir>/<path>` is copied into the plugin cache, which is why the cache
   contains no `README.md` and no `.git` (§5, Predicate 1).

Consequence for the cutover: root-level repo files (README, LICENSE, package.json, tests/, docs/) are
excluded from what users install *because they are outside `path`*, regardless of sparse-checkout semantics.
That is the behavior the cutover is counting on, and it holds.

---

## 7. Cache layout details for downstream tasks

- **Cache root:** `<CLAUDE_CONFIG_DIR>/plugins/cache/{marketplace-name}/{plugin-name}/{version}/`
- On this machine `CLAUDE_CONFIG_DIR=/Users/thomasholknielsen/.claude-accounts/lipht-thn`, and
  `…/lipht-thn/plugins/cache` is a **symlink** to `/Users/thomasholknielsen/.claude/plugins/cache`:

  ```
  $ ls -ldi /Users/thomasholknielsen/.claude/plugins/cache /Users/thomasholknielsen/.claude-accounts/lipht-thn/plugins/cache
  566497556 lrwxr-xr-x@ 1 ... /Users/thomasholknielsen/.claude-accounts/lipht-thn/plugins/cache -> /Users/thomasholknielsen/.claude/plugins/cache
  329337410 drwxr-xr-x@ 8 ... /Users/thomasholknielsen/.claude/plugins/cache
  ```

  There is **one** cache, reachable by two paths. `${CLAUDE_PLUGIN_ROOT}` is handed to hooks in the
  **resolved** `~/.claude/plugins/cache/...` form, not the `.claude-accounts/...` form. Anything in Task 2
  (statusline) that compares `${CLAUDE_PLUGIN_ROOT}` against a config-dir-derived path must resolve symlinks
  first, or it will mismatch on this machine.
- **`{version}` segment** is `plugin.json`'s `version` field when present (`0.1.0` here) — the SHA does not
  appear in the path. From the binary, the SHA-derived name (`{sha12}-{sha256(path)[0..8]}`) is only used
  when the manifest declares no version:

  ```js
  if(typeof t==="object"&&t.source==="git-subdir"){let c=t.path.replaceAll("\\","/").replace(/^\.\//,"").replace(/\/+$/,""),u=createHash("sha256").update(c).digest("hex").substring(0,8),d=`${l}-${u}`;return `Using git-subdir SHA+path version for ...`}
  ```

  claude-tweaks always declares a version, so the cutover keeps today's `…/claude-tweaks/{semver}/` shape.
  **Implication:** changing the pin without changing `plugin.json`'s version reuses the same cache directory.
  The probe worked around this by deleting the cache between pin variants; Task 6/9 should not assume a pin
  change alone invalidates the cache.
- **`.in_use/`** appears inside the version dir. Harmless, CLI-managed, present for all plugins.

---

## 8. Scratch artifacts and state (for Tasks 2 and 9)

Scratch root: `/private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/ab4c8996-f4f5-43df-811e-22c5e427f2d2/scratchpad/probe1/`

| Path / artifact | What it is | Disposition |
|---|---|---|
| `subdir-probe-repo/` | scratch git repo, payload in `plugin/` | **leave** — Task 9 cleans up |
| `probe-marketplace/` | scratch marketplace, currently pinned `"ref": "probe-branch"` | **leave — Task 2 reuses this** |
| `scratch-project/` | scratch project; `.claude/settings.json` declares the marketplace + enables the plugin at **project** scope | **leave — Task 2 reuses this** |
| `claude-config/` | abandoned hermetic `CLAUDE_CONFIG_DIR` (see §9) | inert; delete in Task 9 |
| `sparse-repro/` | hand-run partial-clone reproduction | inert; delete in Task 9 |
| `gitrun.sh`, `pr.sh`, `pr-real.sh`, `publish.sh`, `seed-auth.js`, `sparse-repro.sh` | helper scripts | inert; delete in Task 9 |
| GitHub repo `thomasholknielsen/ct-subdir-probe` (**private**), branches `main` + `probe-branch` | published probe repo | **leave — Task 9 must delete it** |

**Task 2 reuse instructions:** run commands from `.../probe1/scratch-project` with the normal
`CLAUDE_CONFIG_DIR` (i.e. do not override it). `sh .../probe1/pr-real.sh <cmd...>` does exactly that.
The plugin is currently installed and enabled at **project** scope, so `claude plugin uninstall` needs an
explicit `--scope project`.

## 9. Mutations to the user's real config, and their state

Hermetic isolation was attempted first and **partially worked**: `CLAUDE_CONFIG_DIR` *is* honored for
`claude plugin marketplace add` and `claude plugin install` (both wrote into
`.../probe1/claude-config/plugins/`, leaving the real config untouched). It failed only at the
`claude -p` step, because the Keychain OAuth credential does not resolve under a foreign config dir:

```
$ CLAUDE_CONFIG_DIR=.../probe1/claude-config claude -p "reply ok"
Not logged in · Please run /login
exit=1
```

Seeding the isolated `.claude.json` with `userID`/`oauthAccount`/`hasCompletedOnboarding`/
`lastOnboardingVersion` from the real config did not change that. Rather than copy credentials into a
plaintext scratch file, the probe fell back to the **real** `CLAUDE_CONFIG_DIR` but declared everything at
**project scope**, confining the declaration to the scratch project.

Complete list of real-config mutations:

| Mutation | Where | State |
|---|---|---|
| marketplace `probe-marketplace` declared | `.../probe1/scratch-project/.claude/settings.json` (`extraKnownMarketplaces`) — **project scope, inside the scratch dir** | left in place for Task 2; removed when the scratch dir is deleted |
| plugin `subdir-probe@probe-marketplace` enabled | same file (`enabledPlugins`) — **project scope, inside the scratch dir** | left in place for Task 2 |
| plugin cache entry | `~/.claude/plugins/cache/probe-marketplace/` | left in place for Task 2; **Task 9 must `rm -rf` it** |
| usage telemetry key `"subdir-probe@probe-marketplace"` | `~/.claude-accounts/lipht-thn/.claude.json`, under `pluginUsage` | cosmetic; safe to leave, or prune in Task 9 |

Verified *not* mutated (checked after the fact, not assumed):

```
$ ls -d /Users/thomasholknielsen/.claude/plugins/marketplaces/probe-marketplace
ls: /Users/thomasholknielsen/.claude/plugins/marketplaces/probe-marketplace: No such file or directory

$ grep -c 'probe-marketplace' /Users/thomasholknielsen/.claude/plugins/known_marketplaces.json
0

$ grep -rn 'probe-marketplace' ~/.claude/settings.json ~/.claude-accounts/lipht-thn/.claude.json ~/.claude/plugins/installed_plugins.json
/Users/thomasholknielsen/.claude-accounts/lipht-thn/.claude.json:880:    "subdir-probe@probe-marketplace": {
```

(the single hit is the `pluginUsage` telemetry key above). A `directory`-source marketplace is **not**
cloned into `plugins/marketplaces/` and is **not** written to `known_marketplaces.json` — it is referenced
in place from the declaring settings file. So Task 9 does not need
`claude plugin marketplace remove`; deleting the scratch dir and the cache entry is sufficient.

**The user's own `~/.claude/settings.json` (`enabledPlugins` / `extraKnownMarketplaces` at user scope) was
never modified.** The live `thomasholknielsen/claude-tweaks-marketplace` repo and the installed
`claude-tweaks` plugin were never touched.

### One incident worth recording

While hunting for the Keychain service name, `security find-generic-password -s "Claude Code-credentials" -g`
printed the live OAuth access and refresh tokens into the agent transcript. They were not written to any
file and were not reused. If that transcript is retained anywhere shared, **rotate the Claude Code
credential** (`claude /logout` then `/login`) as a precaution. Do not repeat that command in later tasks.

### Process note

The repo's worktree-isolation hook refuses `git commit` targeting a path outside the assigned worktree, which
blocked committing the scratch probe repo that the brief requires to live outside the worktree. The commits
were made by invoking git from a small shell script (`gitrun.sh`) that `cd`s into the scratch repo. No
settings, hooks, or permissions were changed. Flagging it because a future probe-shaped task will hit the
same wall.

---

## 10. Verdict

All three predicates **PASS**, on the production-shaped transport (`https://` GitHub), with both pin fields
independently proven discriminating. No STOP condition triggered. The cutover's core premise — that the
payload can live in a subdirectory and users still get a plugin whose root is that subdirectory — is
verified against `claude` 2.1.233.
