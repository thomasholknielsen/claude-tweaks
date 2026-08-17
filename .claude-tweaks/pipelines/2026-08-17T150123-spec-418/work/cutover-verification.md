# Cutover verification — whole-branch (Task 9, record #418)

**Task:** Task 9 of the plugin-payload-cutover build. Whole-branch verification: local `--plugin-dir`
load, pre-merge branch-pinned end-to-end install over `git-subdir`, repo-wide control grep, merged
full suite.
**Date:** 2026-08-17
**Verdict:** **PASS** — all four ACs met with command+output evidence below.
**Environment:** `claude` CLI `2.1.233 (Claude Code)`, macOS (darwin 25.5.0), `grep` = ugrep 7.5.0
(shell function), `/usr/bin/grep` = BSD grep 2.6.0-FreeBSD.
**Branch:** `worktree-flow-record-418-r2`; verification ran against tip `505a839b` (Steps 1-3) and
`f18d0efe` after the origin/main merge (Step 4).

---

## AC 1 — Local load from `--plugin-dir <worktree>/plugin`

### 1a. The payload subtree validates as a plugin directory

```
$ claude plugin validate "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-record-418-r2/plugin"
Validating plugin manifest: /Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-record-418-r2/plugin/.claude-plugin/plugin.json

✔ Validation passed
exit=0
```

### 1b. Skills are listed

Run from a scratch project (`…/scratchpad/task9/local-load`) whose `.claude/settings.json` sets
`"claude-tweaks@claude-tweaks-marketplace": false` — the machine's real user-scope claude-tweaks is
**disabled for this project**, so every `claude-tweaks:*` skill in the reply can only come from the
`--plugin-dir` load. That is the discriminator; without it the listing would be unattributable.

```
$ pwd
/private/tmp/claude-501/-Users-thomasholknielsen-Code-Workspaces-claude-tweaks/ab4c8996-f4f5-43df-811e-22c5e427f2d2/scratchpad/task9/local-load
$ claude --plugin-dir "…/flow-record-418-r2/plugin" -d hooks --debug-file "…/s1-hooks-debug.log" -p "Do not use any tools. List every skill available to you whose name begins with 'claude-tweaks:'. Output only the skill names, one per line, nothing else."
claude-tweaks:assess-agent-autonomy
claude-tweaks:backlog
claude-tweaks:browse
claude-tweaks:build
claude-tweaks:capture
claude-tweaks:challenge
claude-tweaks:code-health
claude-tweaks:deepen
claude-tweaks:demo
claude-tweaks:design-wrapper
claude-tweaks:dispatch
claude-tweaks:docs-health
claude-tweaks:feedback
claude-tweaks:flow
claude-tweaks:harness-health
claude-tweaks:help
claude-tweaks:init
claude-tweaks:journey-health
claude-tweaks:journeys
claude-tweaks:ledger
claude-tweaks:reflect
claude-tweaks:research
claude-tweaks:review
claude-tweaks:routine
claude-tweaks:routine-kickoff
claude-tweaks:simplify
claude-tweaks:specify
claude-tweaks:stories
claude-tweaks:test
claude-tweaks:tidy
claude-tweaks:visual-review
claude-tweaks:visualize
claude-tweaks:wrap-up
exit=0
```

33 skills, i.e. the whole catalog.

### 1c. Hooks are registered — from the payload subtree, not the installed build

Verbatim lines from that run's `-d hooks --debug-file` log:

```
2026-08-17T17:11:14.071Z [DEBUG] Read hooks.json for plugin claude-tweaks (enabled=true): /Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-record-418-r2/plugin/hooks/hooks.json
2026-08-17T17:11:14.073Z [DEBUG] Loaded inline plugin from path: claude-tweaks
2026-08-17T17:11:14.073Z [DEBUG] Loaded 1 session-only plugins from --plugin-dir
2026-08-17T17:11:14.073Z [DEBUG] Read hooks.json for plugin claude-tweaks (enabled=false; will NOT register, plugin is disabled): /Users/thomasholknielsen/.claude-accounts/lipht-thn/plugins/cache/claude-tweaks-marketplace/claude-tweaks/6.94.0/hooks/hooks.json
2026-08-17T17:11:14.074Z [DEBUG] Plugin "claude-tweaks" from --plugin-dir overrides installed version
2026-08-17T17:11:14.075Z [DEBUG] Attempting to load skills from plugin claude-tweaks default skillsPath: /Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-record-418-r2/plugin/skills
2026-08-17T17:11:14.076Z [DEBUG] Loaded agent from plugin claude-tweaks custom file: /Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-record-418-r2/plugin/agents/qa-agent.md
2026-08-17T17:11:14.083Z [DEBUG] Loaded 33 skills from plugin claude-tweaks default directory
2026-08-17T17:11:14.102Z [DEBUG] Loading hooks from plugin: claude-tweaks
2026-08-17T17:11:14.102Z [DEBUG] Registered 35 hooks from 5 plugins
2026-08-17T17:11:18.577Z [DEBUG] SessionEnd:other [node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" session-end] completed with status 0
```

All four payload directories (`.claude-plugin`, `skills`, `agents`, `hooks`) resolve under
`…/flow-record-418-r2/plugin/`, and the installed 6.94.0 build is explicitly *not* registering.

### 1d. The `SessionStart` hook actually fires and `${CLAUDE_PLUGIN_ROOT}` resolves to the subtree root

Stronger than a registration line: an unfinished pipeline run dir was planted in the scratch project
so `session-start.js`'s stale-run branch would produce distinctive output, and the session was asked
to echo the session-start context it received.

```
$ find .claude-tweaks -type d
.claude-tweaks
.claude-tweaks/pipelines
.claude-tweaks/pipelines/2026-08-17T170000-task9-hookprobe
.claude-tweaks/pipelines/2026-08-17T170000-task9-hookprobe/staged

$ claude --plugin-dir "…/flow-record-418-r2/plugin" -p "Do not use any tools. Quote verbatim, in a fenced code block, every line of session-start context you were given that mentions 'claude-tweaks'. If there is none, reply exactly: NONE."
```
```
claude-tweaks: unfinished pipeline run(s) detected under .claude-tweaks/pipelines/:
- 2026-08-17T170000-task9-hookprobe (status: unknown)
Review {run}/decisions.md and staged/ to resume, or close a finished run with: node "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-record-418-r2/plugin/bin/hooks.js" close-run --run <dir>
```
```
exit=0
```

`${CLAUDE_PLUGIN_ROOT}` interpolated to `…/flow-record-418-r2/plugin` — the payload subtree root, with
no extra level and no stale reference to the pre-cutover repo root. **AC 1: PASS.**

---

## AC 2 — Pre-merge end-to-end install, branch-pinned, over `git-subdir`

### 2a. Branch pushed first (the pin has to resolve on the remote)

```
$ git log --oneline origin/worktree-flow-record-418-r2 -1
6c86f77e Materialize record #418 spec and create pipeline ledger — run 2026-08-17T150123-spec-418
$ git merge-base --is-ancestor origin/worktree-flow-record-418-r2 HEAD && echo "ANCESTOR-OK: remote tip is an ancestor of local HEAD"
ANCESTOR-OK: remote tip is an ancestor of local HEAD
$ git push origin worktree-flow-record-418-r2
To https://github.com/thomasholknielsen/claude-tweaks.git
   6c86f77e..505a839b  worktree-flow-record-418-r2 -> worktree-flow-record-418-r2
```

### 2b. Cache-collision precheck (the pin does not invalidate the cache — Probe 1 §7)

```
$ ls -la ~/.claude/plugins/cache/probe-marketplace/
total 0
drwxr-xr-x@ 3 thomasholknielsen  staff   96 Aug 17 15:51 .
drwxr-xr-x@ 8 thomasholknielsen  staff  256 Aug 17 18:50 ..
drwxr-xr-x@ 7 thomasholknielsen  staff  224 Aug 17 16:33 subdir-probe

$ find ~/.claude/plugins/cache -maxdepth 2 -name 'claude-tweaks*'
/Users/thomasholknielsen/.claude/plugins/cache/claude-tweaks-marketplace
/Users/thomasholknielsen/.claude/plugins/cache/claude-tweaks-marketplace/claude-tweaks
```

No pre-existing `probe-marketplace/claude-tweaks*` version dir, so nothing stale could be silently
reused. The real install's cache lives under a different marketplace segment and was never touched.

### 2c. The temporary catalog entry — the exact release-mirror URL form

The `url` is the suffix-less form `plugin/bin/lib/release/mirror.js` composes
(`PLUGIN_REPO_URL = 'https://github.com/thomasholknielsen/claude-tweaks'`), with `path: "plugin"` and a
`sha` pin at the branch tip — the same three fields `composeMirroredCatalog()` emits. Task 6's review
flagged that this exact URL spelling had never been literally exercised; this closes that gap.

```
$ cat …/probe1/probe-marketplace/.claude-plugin/marketplace.json
{
  "name": "probe-marketplace",
  "owner": { "name": "probe" },
  "plugins": [
    { "name": "subdir-probe",
      "source": { "source": "git-subdir", "url": "https://github.com/thomasholknielsen/ct-subdir-probe.git", "path": "plugin", "ref": "probe-branch" } },
    { "name": "claude-tweaks-cutover-probe",
      "source": { "source": "git-subdir", "url": "https://github.com/thomasholknielsen/claude-tweaks", "path": "plugin", "sha": "505a839b0889a5ff045dd1881f29248c0209dcaf" } }
  ]
}

$ claude plugin validate "…/probe1/probe-marketplace"
Validating marketplace manifest: …/probe1/probe-marketplace/.claude-plugin/marketplace.json

⚠ Found 1 warning:

  ❯ description: No marketplace description provided. Adding a description helps users understand what this marketplace offers

✔ Validation passed with warnings
exit=0

$ claude plugin marketplace update probe-marketplace
Updating marketplace: probe-marketplace...Validating local marketplace
✔ Successfully updated marketplace: probe-marketplace
exit=0
```

**URL-form result: the suffix-less `https://github.com/thomasholknielsen/claude-tweaks` works.** No
`.git` suffix was needed at any point, and no fallback was used. The mirror's composed URL is correct
as written.

Incidental finding, worth recording: the catalog **entry name may differ from the payload's own
`plugin.json` name**. The entry was `claude-tweaks-cutover-probe`; the payload declares
`"name": "claude-tweaks"`. Install, listing, and cache all key on the **entry** name; the skill
namespace and `claude plugin details` header key on the **manifest** name. That asymmetry is what let
this probe coexist with the real install (see 2e).

### 2d. Install

```
$ claude plugin install claude-tweaks-cutover-probe@probe-marketplace --scope project
Installing plugin "claude-tweaks-cutover-probe@probe-marketplace"...✔ Successfully installed plugin: claude-tweaks-cutover-probe@probe-marketplace (scope: project)
exit=0
```

### 2e. Cache shape — the subtree root IS the cache root, and non-subtree content is excluded

```
$ find ~/.claude/plugins/cache/probe-marketplace/claude-tweaks-cutover-probe -maxdepth 2
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/claude-tweaks-cutover-probe
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/claude-tweaks-cutover-probe/6.93.0
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/claude-tweaks-cutover-probe/6.93.0/bin
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/claude-tweaks-cutover-probe/6.93.0/agents
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/claude-tweaks-cutover-probe/6.93.0/.in_use
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/claude-tweaks-cutover-probe/6.93.0/hooks
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/claude-tweaks-cutover-probe/6.93.0/.orphaned_at
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/claude-tweaks-cutover-probe/6.93.0/.claude-plugin
/Users/thomasholknielsen/.claude/plugins/cache/probe-marketplace/claude-tweaks-cutover-probe/6.93.0/skills

$ find ~/.claude/plugins/cache/probe-marketplace/claude-tweaks-cutover-probe \( -name 'README.md' -o -name '.git' -o -name 'package.json' -o -name 'tests' -o -name 'CLAUDE.md' \)
(end — empty means no non-subtree content)
```

No `plugin/` wrapper level; the version segment is the payload's own `6.93.0` (this branch's
`plugin/.claude-plugin/plugin.json`, distinct from the machine's installed 6.94.0); every dev-side
sibling of `plugin/` in the repo (`README.md`, `CLAUDE.md`, `package.json`, `tests/`) is absent from
the materialized cache. That is the cutover's whole point, measured end-to-end.

> Noted, not chased: the fresh install already carries `.orphaned_at`. Probe 2 §11.4 recorded two
> anomalous `.orphaned_at` stamps on this shared cache with no upgrade in flight and attributed them
> to concurrent `claude` sessions on this machine. The plugin listed, loaded, and ran regardless
> (below), so this is the same benign shape as Probe 2's round 6, not a new failure.

### 2f. Listed, inventoried, and invocable

```
$ claude plugin list | grep -B1 -A4 cutover-probe

  ❯ claude-tweaks-cutover-probe@probe-marketplace
    Version: 6.93.0
    Scope: project
    Status: ✔ enabled

$ claude plugin details claude-tweaks-cutover-probe@probe-marketplace
claude-tweaks 6.93.0
  A structured workflow system for Claude Code — from idea capture through build, review, and wrap-up, tracked as a unified work record on GitHub Issues. Includes an LLM-as-judge recurring code-health sweep, browser automation, and QA pipeline.
  Source: claude-tweaks-cutover-probe@probe-marketplace

Component inventory
  Skills (33)  assess-agent-autonomy, backlog, browse, build, capture, challenge, code-health, deepen, demo, design-wrapper, dispatch, docs-health, feedback, flow, harness-health, help, init, journey-health, journeys, ledger, reflect, research, review, routine, routine-kickoff, simplify, specify, stories, test, tidy, visual-review, visualize, wrap-up
  Agents (0)
  Hooks (6)  SessionStart, SessionEnd, PreCompact, PreToolUse, PostToolUse, SubagentStop  (harness-only — no model context cost)
  MCP servers (0)
  LSP servers (0)

Projected token cost
  Always-on:   ~2,999 tok   added to every session
exit=0
```

(`claude plugin details claude-tweaks-cutover-probe` — unqualified — returns
`Plugin "claude-tweaks-cutover-probe" not found`; the qualified `name@marketplace` form is required,
matching Probe 2 §3.0's unqualified-name trap.)

The installed plugin's `SessionStart` hook fires from the **cache** subtree root (same scratch-project
technique as 1d, this time with the real user-scope claude-tweaks disabled for the project so only the
probe install can answer):

```
$ claude -d hooks --debug-file … -p "Do not use any tools. First list every skill available to you whose name begins with 'claude-tweaks', one per line. Then print a line '---' and quote verbatim every line of session-start context you were given that mentions 'claude-tweaks'."
claude-tweaks:build
…                                     (33 skills; full list elided — identical to 1b)
claude-tweaks:wrap-up

---

claude-tweaks: unfinished pipeline run(s) detected under .claude-tweaks/pipelines/:
Review {run}/decisions.md and staged/ to resume, or close a finished run with: node "/Users/thomasholknielsen/.claude-accounts/lipht-thn/plugins/cache/probe-marketplace/claude-tweaks-cutover-probe/6.93.0/bin/hooks.js" close-run --run <dir>
exit=0
```

And a real skill invocation — the brief's suggested check:

```
$ claude -p "/claude-tweaks:help"
## Workflow Status

claude-tweaks v6.93.0

**Note:** This directory isn't an initialized claude-tweaks project — no `CLAUDE.md`, not a git repository, and no work-record backend configured. …

### Pipeline
Nothing found — no design docs, no specs, no records.

## Section 1: Quick Reference Cheat Sheet

### Lifecycle (run in order)
| Command | What it does | Takes |
|---------|-------------|-------|
| `/claude-tweaks:init` | Bootstrap structure, generate CLAUDE.md, skills, rules | `[<path>|<github-url>|<description>|--update|...]` |
| `/claude-tweaks:capture` | Brain-dump idea into the backlog | `<idea text> [--route=...] ...` |
…
### Artifact Lifecycle
```
Backlog record → Design Doc → Ready record(s) → Code → Stories → TEST_PASSED → Review → Polish → Done
```
…
exit=0
```

The skill loaded from the `git-subdir`-materialized cache, read its own sub-files, and self-reported
`v6.93.0` — the branch payload, not the machine's 6.94.0 install. **AC 2: PASS.**

### 2g. Temporary entry removed and probe uninstalled ("removed at the flip", pre-merge half)

```
$ claude plugin uninstall claude-tweaks-cutover-probe@probe-marketplace --scope project
✔ Successfully uninstalled plugin: claude-tweaks-cutover-probe (scope: project)
exit=0

$ claude plugin list | grep -c cutover-probe
0

$ diff …/probe1/probe-marketplace/.claude-plugin/marketplace.json …/probe1/probe2/marketplace.json.healthy-backup
diff-exit=0 (0 = temp entry removed, manifest byte-identical to Task 1's healthy backup)
$ grep -c "cutover-probe" …/probe1/probe-marketplace/.claude-plugin/marketplace.json
0
```

The live `thomasholknielsen/claude-tweaks-marketplace` catalog was never touched at any point.

---

## AC 3 — Repo-wide control grep

Pattern (the AC's own):
`(^|[^./A-Za-z0-9_$-])(\.claude-plugin|skills|agents|hooks|bin)/`

### 3a. Positive control — the pattern bites

Run against `CLAUDE.md` as it stood at `58dbfa41`, the pre-move merge commit:

```
$ git show 58dbfa41:CLAUDE.md | /usr/bin/grep -nE "$PAT" | head -8
12:| Content | Markdown (SKILL.md files with YAML frontmatter); Node modules under `bin/` |
21:- `skills/{name}/SKILL.md` — skill definition; `skills/{name}/*.md` — sub-files lazy-loaded by that skill
22:- `skills/_shared/*.md` — cross-skill contracts, criteria, and canonical procedures cited by skills rather than restated
23:- `bin/` — Node executables; `bin/lib/{name}/` — multi-file modules as flat sibling directories, NOT a nested `_shared/` wrapper (that convention is specific to `skills/_shared/`)
24:- `hooks/hooks.json` + `bin/hooks.js` — one dispatcher for every hook event
31:SKILL.md structure, … Read it before creating or editing any `skills/**/*.md`.
35:- Version lives in `.claude-plugin/plugin.json`
41:Invocation: `node bin/release.js <minor|patch> "<summary>"` from clean `main`. …
$ git show 58dbfa41:CLAUDE.md | /usr/bin/grep -cE "$PAT"
17
```

17 hits on the pre-sweep text, 0 on the swept file (below). The scan discriminates.

Both greps were run: `grep` here is **ugrep 7.5.0** (a shell function), which can skip files a
`.gitignore` covers; `/usr/bin/grep` is BSD grep, which cannot. Section D additionally drives
`/usr/bin/grep -a` from `find … -print0 | xargs -0`, so no ignore rule and no binary-file skip
(`plugin/bin/lib/issues/initiative-budget.js` carries a NUL byte) can produce a falsely clean result.
All three agree.

### 3b. Findings — three tracked files under `work/`, plus two in `README.md`

The first run was **not** clean. Genuine hits, all of them dev-side prose that Task 7's sweep did not
cover because its file list was hand-enumerated:

| File | Hits | Nature |
|---|---|---|
| `work/320-spec.md` | 21 | materialized spec for record #320 — `bin/lib/wrap-up/*.js`, `skills/wrap-up/claude-md-curation.md`, `bin/resolve-policy.js`, … |
| `work/422-spec.md` | 2 | `skills/dispatch/settle-and-merge.md`, `skills/wrap-up/SKILL.md` |
| `work/714-spec.md` | 2 | a runnable `grep -n "AUTO-RESOLVED" skills/…` acceptance-criterion command |
| `README.md` | 2 | `skills/_shared/autonomy-ceiling.md`, `skills/_shared/work-record.md` |

`work/` is not on the AC's exclusion list. `README.md` is — but the brief's own whitespace-spanning
control greps it explicitly, and the two references are real repo paths a reader would follow, so they
were fixed rather than waved through. Every prefixed target was checked to exist at its new path
(`ls plugin/bin/lib/wrap-up/facts.js …` — all 11 present). Fixed in commit `d591089b`.

### 3c. The one residual hit, and why it is not one

```
./CLAUDE.md:87:A `npm test` failure count that varies run-to-run on byte-identical code tracks machine load (sibling agents/sessions running concurrently), not a regression — …
```

`agents/sessions` is English prose, not a path. It is the exact literal Task 7's sweep script
registered as a PROTECTED false positive (`prefix-payload-paths.js`, `PROTECTED['CLAUDE.md']`), so the
two passes agree on it independently.

`.superpowers/sdd/` also matches heavily. That directory is gitignored, is this build's own SDD
scratch, and its matches are the raw `git diff` text of the move itself (`rename from bin/hooks.js`,
…) plus task reports quoting pre-cutover paths. Not repo content, not shipped, not fixed.

### 3d. Final state — clean (re-run after the fixes AND after the origin/main merge)

```
########## B. THE AC GREP — ugrep (the shell's default `grep`)
./CLAUDE.md:87:A `npm test` failure count that varies run-to-run … (sibling agents/sessions running concurrently) …
grep-exit=0

########## C. SAME AC GREP — BSD /usr/bin/grep (does NOT honor .gitignore)
./CLAUDE.md:87:A `npm test` failure count that varies run-to-run … (sibling agents/sessions running concurrently) …
grep-exit=0

########## D. BINARY-SAFE VARIANT — /usr/bin/grep -a, find+xargs (no gitignore filtering at all)
./CLAUDE.md:87:A `npm test` failure count that varies run-to-run … (sibling agents/sessions running concurrently) …
pipeline-exit=0

########## E. RELATIVE-IMPORT FORMS the AC pattern deliberately cannot see
$ find … | xargs /usr/bin/grep -anE '(\.\.?/)+(\.claude-plugin|skills|agents|hooks|bin)/'
pipeline-exit=0   (no repo-content matches — only .superpowers/sdd/ diffs)

########## F. WHITESPACE-SPANNING CONTROL
$ /usr/bin/grep -rnE '(skills|bin|agents|hooks)[[:space:]]*/' README.md work/
   → every surviving match is inside a correctly `plugin/`-prefixed path:
     README.md:94  `plugin/skills/_shared/autonomy-ceiling.md`
     README.md:109 `plugin/skills/_shared/work-record.md`
     work/*.md     `plugin/bin/…`, `plugin/skills/…`
$ grep -rn -z -E '(skills|bin|agents|hooks)\s+/' README.md work/    # ugrep -z, spans newlines
grep-exit=1  (1 = no matches)
```

Section E was added beyond the brief because the AC's character class `[^./A-Za-z0-9_$-]` cannot see
`./skills/` or `../bin/`; a relative-import form would have passed the AC while still being wrong.
None exists. Section F's `-z` variant covers a literal that wraps across a newline. **AC 3: PASS.**

A post-merge scan for the specific breakage class the merge could reintroduce:

```
$ /usr/bin/grep -rnE "require\('(\.\./)+bin/" tests/ perf/ tools/ evals/ scripts/
exit=1  (1 = none)
```

---

## AC 4 — Merge origin/main, then the full suite

### 4a. The merge — five conflicts, all resolved by hand

`origin/main` had moved to `389eb7cf` since the branch's last merge.

```
$ git merge origin/main
Auto-merging docs/REGISTRY.md
CONFLICT (content): Merge conflict in docs/REGISTRY.md
Auto-merging docs/plugin-structure.md
CONFLICT (content): Merge conflict in docs/plugin-structure.md
Auto-merging docs/skill-graph.md
CONFLICT (file location): skills/_shared/github-rate-limit.md added in origin/main inside a directory that was renamed in HEAD, suggesting it should perhaps be moved to plugin/skills/_shared/github-rate-limit.md.
Auto-merging tests/batch-ref-argument.test.js
CONFLICT (content): Merge conflict in tests/batch-ref-argument.test.js
Auto-merging tests/bin-lib/log-decision/append.test.js
Auto-merging tests/hooks-run-dir-resolve.test.js
CONFLICT (content): Merge conflict in tests/hooks-run-dir-resolve.test.js
Automatic merge failed; fix conflicts and then commit the result.
```

Every conflict is the cutover's own shape — upstream edited a file at its pre-move path while this
branch moved it — so each resolution keeps **upstream's content** and **this branch's paths**:

| Conflict | Resolution |
|---|---|
| `skills/_shared/github-rate-limit.md` (a brand-new upstream file, `CONFLICT (file location)`) | accepted at `plugin/skills/_shared/github-rate-limit.md`; verified it carries no conflict markers and no stray copy exists at the repo root (`ls` of the root shows no `skills/`, `bin/`, `agents/`, `hooks/`) |
| `docs/REGISTRY.md` | ours' `plugin/`-prefixed rows, **plus** upstream's added `skills/_shared/*.md` auto-detect on the skill-graph row, re-prefixed |
| `docs/plugin-structure.md` (2 hunks) | hunk 1: upstream's rewritten `specify` row (new `#A-#B` range + read-back text) + ours' `wrap-up` row — proven byte-identical to theirs modulo the `plugin/` prefix before choosing; hunk 2: upstream's `_shared` row (adds `github-rate-limit.md`) with its two payload paths re-prefixed |
| `tests/batch-ref-argument.test.js` | ours' `plugin/skills/specify/SKILL.md` path + upstream's stricter `#A-#B` grammar assertion |
| `tests/hooks-run-dir-resolve.test.js` | ours' `../plugin/bin/lib/hooks/run-dir-resolve` require + upstream's added `harnessWorktreeOf` fixture import |

Merge commit `d38d5d0d`.

### 4b. First full run after the merge — RED, exactly the predicted class

```
exit=1
# tests 4492
# pass 4486
# fail 6
```

```
not ok 204 - tests/github-rate-limit-conformance.test.js
not ok 4199 - specify SKILL.md documents the \#A-\#B/\#A–\#B range form and its expansion rule
not ok 4200 - specify SKILL.md wires range expansion into the batch-branch resolution bullet
not ok 4201 - specify SKILL.md caps the range form at 25 expanded elements with a hard-error message
not ok 4202 - specify SKILL.md rejects a malformed range at case 1 rather than silently falling through to topic resolution
not ok 4203 - shaping-mode.md documents mandatory read-back verification after each record write
```

```
error: "ENOENT: no such file or directory, open '…/flow-record-418-r2/skills/specify/SKILL.md'"
```

Two whole test files arrived with the merge still written against pre-cutover paths —
`tests/specify-range-form-readback.test.js` (5 reads) and `tests/github-rate-limit-conformance.test.js`
(18 path literals incl. a `path.join(REPO_ROOT, 'skills')` directory walk). Neither existed on this
branch before the merge, so no earlier task could have repointed them: this is the "green branches
merge red" case the brief told me to catch here, and it is caught. Repointed to `plugin/…` using the
convention already in `tests/specify-batch-input.test.js`; commit `f18d0efe`.

```
$ node --test tests/specify-range-form-readback.test.js tests/github-rate-limit-conformance.test.js
# tests 43
# pass 43
# fail 0
```

### 4c. Merged full suite — GREEN

```
$ npm test > …/task9-full.log 2>&1; echo exit=$?; grep -E '^# (tests|pass|fail)' …/task9-full.log
exit=0
# tests 4529
# suites 0
# pass 4529
# fail 0
# cancelled 0
# skipped 0
```

**AC 4: PASS** — exit 0, fail 0, skipped 0.

### 4d. A second sibling release landed mid-task — merged and re-verified

While this record was being written, `origin/main` moved again to `63670e69` ("[fast-lane] specify:
extractor-based Key Files reads"). Re-merged rather than declared done on a stale base — this is
exactly the class that produced 4b.

```
$ git merge origin/main
Auto-merging tests/bin-lib/issues/grouping.test.js
CONFLICT (content): Merge conflict in tests/bin-lib/issues/grouping.test.js
```

One conflict, the same shape again: upstream added two exports to the require line while this branch
had repointed its path. Resolved as upstream's import list + this branch's
`../../../plugin/bin/lib/issues/grouping` path. Merge commit `78021afd`.

```
$ /usr/bin/grep -rnE "require\('(\.\./)+bin/" tests/ perf/ tools/ evals/ scripts/
require-scan-exit=1   (none)

$ npm test; echo exit=$?
exit=0
# tests 4539
# pass 4539
# fail 0
# skipped 0
```

The AC 3 control grep was re-run on this tree too, with the same single CLAUDE.md prose false
positive and nothing else.

> Standing caveat for whoever merges this branch: two sibling releases landed inside this one task,
> and both broke the branch in the same way (an upstream edit to a file this branch moved). Re-merge
> `origin/main` and re-run the full suite immediately before merging, and expect the conflict to be a
> require-path or path-literal line, not a semantic one.

`tests/changelog-coverage.test.js` cleared as predicted. It appears in Task 8's pre-merge log
(`…/scratchpad/task8-npmtest.log`) inside failure blocks at lines 64 and 141 of that suite; it appears
nowhere in this run's log outside passing output, and the run's `fail` count is 0. v6.94.0's CHANGELOG
entry arrived with the merge. No further sibling release shipped mid-run.

---

## Cleanup — scratch state removed, end state verified by command

Per Probe 1 §8-9 and Probe 2 §11.6. The user's real `claude-tweaks` install and the live
`claude-tweaks-marketplace` were left strictly alone.

### What was removed

| Artifact | Action | Verified |
|---|---|---|
| plugin cache `~/.claude/plugins/cache/probe-marketplace/` (both `subdir-probe` 0.1.0-0.5.0 and `claude-tweaks-cutover-probe` 6.93.0) | `rm -rf` | `ls: … No such file or directory` |
| scratch dirs `…/scratchpad/probe1/` (incl. `subdir-probe-repo`, `probe-marketplace`, `scratch-project`, `claude-config`, `sparse-repro`, helper scripts) and Task 9's own `task9/local-load`, `task9/e2e-project` | `rm -rf` | `ls: … No such file or directory` |
| `/tmp/ct-subdir-probe-root.txt` | `rm -f` | `ls: … No such file or directory` |
| marketplace registration `probe-marketplace` | `claude plugin marketplace remove probe-marketplace` | see below |
| GitHub repo `thomasholknielsen/ct-subdir-probe` | **NOT REMOVED** — see below | — |

### Verified end state

```
$ claude plugin marketplace list
Configured marketplaces:

  ❯ claude-code-plugins        Source: GitHub (anthropics/claude-code)
  ❯ claude-plugins-official    Source: GitHub (anthropics/claude-plugins-official)
  ❯ claude-tweaks-marketplace  Source: GitHub (thomasholknielsen/claude-tweaks-marketplace)
  ❯ claude-user-config         Source: GitHub (lab-holknielsen/claude-user-config)
  ❯ diagram-design             Source: GitHub (cathrynlavery/diagram-design)
  ❯ impeccable                 Source: GitHub (pbakaus/impeccable)

$ claude plugin list | grep -ci probe
0

$ /usr/bin/grep -c 'probe-marketplace' ~/.claude-accounts/lipht-thn/plugins/known_marketplaces.json
0

$ /usr/bin/grep -rn 'probe-marketplace' ~/.claude/settings.json ~/.claude/plugins/known_marketplaces.json ~/.claude/plugins/installed_plugins.json ~/.claude-accounts/lipht-thn/settings.json
(exit=1 — clean)
```

Left in place deliberately: one `pluginUsage` telemetry key (`"subdir-probe@probe-marketplace"`) in
`~/.claude-accounts/lipht-thn/.claude.json` — cosmetic, and Probe 1 §9 already classified it
safe-to-leave; pruning it means hand-editing a live config file the CLI rewrites atomically.

### The user's real install — untouched, checked rather than assumed

```
$ claude plugin list | grep -A3 'claude-tweaks@claude-tweaks-marketplace'
  ❯ claude-tweaks@claude-tweaks-marketplace
    Version: 6.94.0
    Scope: user
    Status: ✔ enabled
    …(plus the per-project scoped installs, all still listed)
$ ls -d ~/.claude/plugins/cache/claude-tweaks-marketplace/claude-tweaks/*
… 49 version dirs, 6.24.0 → 6.94.0, unchanged
```

The live `claude-tweaks-marketplace` catalog was never written to at any point in this task.

### Correction to Probe 1 §9 (found during cleanup)

Probe 1 §9 concluded the probe marketplace "is **not** written to `known_marketplaces.json`", from:

```
$ grep -c 'probe-marketplace' /Users/thomasholknielsen/.claude/plugins/known_marketplaces.json
0
```

That grep read the wrong file for this machine. `CLAUDE_CONFIG_DIR` is
`~/.claude-accounts/lipht-thn`, and only `plugins/cache` is symlinked across to `~/.claude` —
`plugins/known_marketplaces.json` is a **separate file per config dir**. The live one did carry the
entry:

```
$ /usr/bin/grep -n -A6 "probe-marketplace" ~/.claude-accounts/lipht-thn/plugins/known_marketplaces.json
51:  "probe-marketplace": {
52-    "source": { "source": "directory", "path": "…/scratchpad/probe1/probe-marketplace" },
56-    "installLocation": "…/scratchpad/probe1/probe-marketplace",
57-    "lastUpdated": "2026-08-17T17:14:03.719Z"
```

So `claude plugin marketplace remove` **was** required, contrary to Probe 1's note that deleting the
scratch dir and cache entry would suffice. Done, verified 0 hits. Recorded as ledger item 6.

### Residual — the scratch GitHub repo could not be deleted (human-owed)

```
$ gh repo delete thomasholknielsen/ct-subdir-probe --yes
HTTP 403: Must have admin rights to Repository. (https://api.github.com/repos/thomasholknielsen/ct-subdir-probe)
This API operation needs the "delete_repo" scope. To request it, run:  gh auth refresh -h github.com -s delete_repo
exit=1
```

Four attempts, all 403. (The *first* pass returned `HTTP 503: No server is currently available…`,
which masked the real cause — worth remembering: a GitHub 503 on `DELETE /repos/*` can be a
scope failure wearing a transient's clothes.) The token holds `admin:org, gist, repo, workflow` —
no `delete_repo`. Granting it is an interactive credential change, outside an agent's bounds.

State of the leftover: `{"isArchived":false,"isPrivate":true,"name":"ct-subdir-probe"}` — private,
unreferenced by any marketplace, harmless. Not archived or renamed: neither was asked for, and a
surprise mutation to a GitHub repo is worse than a recorded residual.

Ledger item 5 tracks it. To finish:

```
gh auth refresh -h github.com -s delete_repo
```
```
gh repo delete thomasholknielsen/ct-subdir-probe --yes
```

---

## Verdict

| AC | Result |
|---|---|
| Local `--plugin-dir` load: skills listed, hooks registered and firing from the subtree | PASS |
| Pre-merge branch-pinned `git-subdir` install; skill invocable; temp entry removed | PASS |
| Repo-wide control grep clean (with positive control, gitignore control, binary control, relative-form control, whitespace control) | PASS — 5 genuine hits found and fixed first |
| origin/main merged; full `npm test` exit 0, fail 0 | PASS — 6 merge-induced failures found and fixed first |
| Scratch cleanup | PASS with one recorded residual (ledger 5: `ct-subdir-probe` needs a `delete_repo` scope grant) |

The exact release-mirror URL form (`https://github.com/thomasholknielsen/claude-tweaks`, suffix-less)
installs correctly. No mirror change is needed.

Commits from this task: `d591089b` (README + work/ spec sweep), `d38d5d0d` (origin/main merge),
`f18d0efe` (repoint the two merged-in tests), `50c9d24b` (this record + ledger items 5-6),
`78021afd` (second origin/main merge).
