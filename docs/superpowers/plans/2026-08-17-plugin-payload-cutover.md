# Plugin Payload Cutover to plugin/ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the plugin payload (`.claude-plugin/`, `skills/`, `agents/`, `hooks/`, `bin/`) into `plugin/` and adjust every dev-side consumer so the repo root stops being a plugin, gated by two pre-move probes, with the marketplace catalog flip prepared in `release.js` for a single-release atomic cutover.

**Architecture:** Pure `git mv` of the five payload dirs (history follows), then dev-side path repairs in tests/tools/perf/evals/release machinery/docs. Payload-internal references are plugin-root-relative and move wholesale — untouched. The catalog flip itself executes at release time (post-merge, attended, from `main`) via the adjusted `release.js` mirror step; this branch only prepares it.

**Tech Stack:** Node 18+ (`node --test`), git, `gh` CLI, `claude` CLI (probes).

**Spec:** `.claude-tweaks/pipelines/2026-08-17T150123-spec-418/work/418-spec.md` (materialized from GitHub issue #418)

## Global Constraints

- **No version bump and no CHANGELOG edit on this branch** — `release.js` owns both at release time (version-collision discipline; the release is a post-merge human step, Task 10).
- **`${CLAUDE_PLUGIN_ROOT}` references are never rewritten** — under `git-subdir`, `plugin/` IS the plugin root; they resolve unchanged (spec deliverable).
- **Payload-internal references stay untouched** — `skills/**` citing `skills/_shared/...` or `bin/lib/...`, `hooks/hooks.json` citing `${CLAUDE_PLUGIN_ROOT}/bin/hooks.js`: all plugin-root-relative, all move together.
- **Payload→`docs/` prose citations are out of scope** — skill prose citing `docs/**` is dev-repo guidance; the spec's sweep covers references TO moved dirs from outside the payload only.
- Commit messages: imperative `{Verb} {what} — {detail}`, reference the record as `refs #418` (NEVER `closes`/`fixes` — the PR body carries the closing keyword).
- Per-task verification runs targeted suites only; the full `npm test` runs at the designated verification points (Tasks 5, 9) — never between a subagent's edit and its commit otherwise.
- All work happens inside the worktree: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-record-418-r2"` — verify with `pwd` + `git rev-parse --show-toplevel` before any commit.
- A **negative Probe 1 result STOPs the entire run** and reopens the #416 decision — do not improvise an alternative mid-build (spec AC, verbatim).
- `#419` (boundary enforcement test) lands with or immediately after this record, never before — do not implement it here.

---

### Task 1: Probe 1 — git-subdir end-to-end verification (STOP gate; before any move)

**Files:**
- Create: `.claude-tweaks/pipelines/2026-08-17T150123-spec-418/work/probe-1-findings.md`

**Interfaces:**
- Produces: `probe-1-findings.md` recording (a) the exact working catalog entry JSON for a `git-subdir` source (field spellings for url/path and the pin field — `sha` and/or `ref`), (b) the installed cache directory layout (whether the subtree root is the cache root), (c) whether the clone is sparse/partial, (d) the scratch marketplace location for reuse by Tasks 2 and 9. Tasks 6, 7, 9 consume these facts.

- [ ] **Step 1: Recon the CLI surface** — run and record:

```bash
claude plugin --help
claude plugin marketplace --help
claude plugin install --help
```

- [ ] **Step 2: Build a scratch plugin repo with the payload in a subdirectory.** In a scratchpad dir (NOT the worktree), create `subdir-probe-repo/plugin/` containing:

`plugin/.claude-plugin/plugin.json`:
```json
{ "name": "subdir-probe", "description": "git-subdir probe", "version": "0.1.0" }
```

`plugin/skills/probe-skill/SKILL.md`:
```markdown
---
name: probe-skill
description: Use when probing git-subdir installs.
---
# Probe Skill
Reply with the literal string PROBE-OK.
```

`plugin/hooks/hooks.json`:
```json
{ "hooks": { "SessionStart": [ { "hooks": [ { "type": "command", "command": "node \"${CLAUDE_PLUGIN_ROOT}/bin/probe.js\"" } ] } ] } }
```

`plugin/bin/probe.js`:
```js
require('fs').appendFileSync('/tmp/ct-subdir-probe-root.txt', __dirname + '\n');
```

Also add a root-level `README.md` saying "root is not the plugin" (proves the install excludes non-subtree content). `git init`, commit all.

- [ ] **Step 3: Publish the scratch repo.** Try a local path/URL first in Step 4's catalog; if the `git-subdir` source rejects non-hosted URLs, publish via `gh repo create ct-subdir-probe --private --source "$PWD" --push` (record the repo name for cleanup in Task 9).

- [ ] **Step 4: Create a scratch marketplace + install into a scratch project.** Scratch marketplace dir `probe-marketplace/.claude-plugin/marketplace.json`:

```json
{
  "name": "probe-marketplace",
  "owner": { "name": "probe" },
  "plugins": [
    { "name": "subdir-probe",
      "source": { "source": "git-subdir", "url": "<repo url from Step 3>", "path": "plugin" } }
  ]
}
```

In a fresh scratch project dir: `claude plugin marketplace add <marketplace path>` then `claude plugin install subdir-probe@probe-marketplace`. If field names are rejected, consult the errors/`--help`/docs, adjust, and **record the exact shape that worked**. Also test a pinned variant (add `"sha"` — or `"ref"` if `sha` is rejected — pointing at the scratch repo's tip) since Task 6's mirror step and Task 9's branch-pinned entry both need a working pin field.

- [ ] **Step 5: Verify the three spec predicates and record output:**
  1. Clone shape: list the install cache dir (`~/.claude/plugins/cache/probe-marketplace/subdir-probe/...`) — record whether the cache root IS the subtree (contains `.claude-plugin/`, `bin/` directly) and whether root `README.md` is absent (sparse).
  2. Skills listed: `claude plugin list` (or the recon-discovered equivalent) from the scratch project shows the plugin/skill.
  3. Hooks registered + `${CLAUDE_PLUGIN_ROOT}` resolution: `rm -f /tmp/ct-subdir-probe-root.txt`, then run `claude -p "reply ok"` in the scratch project; `/tmp/ct-subdir-probe-root.txt` must exist and contain a path inside the install cache ending in `/bin` — proving the hook fired AND `${CLAUDE_PLUGIN_ROOT}` resolved to the subtree root.

- [ ] **Step 6: Verdict.** ALL three predicates pass → write `probe-1-findings.md` (commands, verbatim output, working entry JSON, cache layout, pin-field finding), commit: `git add .claude-tweaks/pipelines/2026-08-17T150123-spec-418/work/probe-1-findings.md && git commit -m "Record Probe 1 findings — git-subdir end-to-end verified (refs #418)"`. ANY predicate fails → **STOP: report `BLOCKED` with the failing output; the run must stop and reopen #416. Do not proceed to any later task.**

### Task 2: Probe 2 — failed-update harmlessness (before any move)

**Files:**
- Create: `.claude-tweaks/pipelines/2026-08-17T150123-spec-418/work/probe-2-findings.md`

**Interfaces:**
- Consumes: Task 1's scratch marketplace, scratch repo, and installed `subdir-probe` plugin.

- [ ] **Step 1: Snapshot the healthy install.** Record `find <cache dir for subdir-probe> -type f | sort` and the installed `plugin.json` content.

- [ ] **Step 2: Break the catalog entry.** Edit the scratch `marketplace.json`: point the entry's pin at a nonexistent sha (e.g. `"sha": "0000000000000000000000000000000000000000"`) or a nonexistent `"path"`. Run `claude plugin marketplace update probe-marketplace` (if needed) then `claude plugin update subdir-probe` (exact subcommands per Task 1's recon).

- [ ] **Step 3: Verify harmlessness.** The update attempt must fail LOUDLY (record the error verbatim), and the existing cached install must be intact: re-run Step 1's `find` (identical output) and re-run Task 1 Step 5.3's hook check (still fires). Record both.

- [ ] **Step 4: Commit findings.** Write `probe-2-findings.md`, then `git add .claude-tweaks/pipelines/2026-08-17T150123-spec-418/work/probe-2-findings.md && git commit -m "Record Probe 2 findings — failed update leaves cached install intact (refs #418)"`. If the cached install was NOT intact, report `DONE_WITH_CONCERNS` naming exactly what changed — this contradicts the #416 accepted-exposure premise and review must see it.

### Task 3: Fresh main merge-up, then git mv into plugin/

**Files:**
- Modify (rename): `.claude-plugin/` → `plugin/.claude-plugin/`, `skills/` → `plugin/skills/`, `agents/` → `plugin/agents/`, `hooks/` → `plugin/hooks/`, `bin/` → `plugin/bin/`

**Interfaces:**
- Produces: the `plugin/` subtree every later task's paths assume. Top-level `docs/`, `tests/`, `evals/`, `tools/`, `perf/`, `scripts/`, `work/`, `.github/`, `.claude-tweaks/`, `package.json`, `CLAUDE.md`, `CHANGELOG.md` stay at root.

- [ ] **Step 1: Merge upstream first** (siblings ship mid-build — the queue is active):

```bash
git fetch origin main
git merge origin/main
```

Resolve any conflict per `_shared/git-discipline.md` (read both sides, produce a merged result; never reset).

- [ ] **Step 2: Move the five dirs** (one `git mv` per dir):

```bash
mkdir plugin
git mv .claude-plugin plugin/.claude-plugin
git mv skills plugin/skills
git mv agents plugin/agents
git mv hooks plugin/hooks
git mv bin plugin/bin
```

- [ ] **Step 3: Prove the staged set is renames-only.** `git diff --cached --name-status` — every line must have status `R100` and two path columns (a `--name-status` check, not `--name-only`); zero `A`/`M`/`D` lines. Show the count: `git diff --cached --name-status | grep -vc '^R'` must print `0`.

- [ ] **Step 4: Commit** (no other edits mixed in):

```bash
git commit -m "Move plugin payload into plugin/ — .claude-plugin, skills, agents, hooks, bin (refs #418)"
```

**Note:** `npm test` is EXPECTED red after this commit (dev-side requires still point at `bin/`) — do not attempt fixes here; Tasks 4–6 repair them. State this in your report rather than reporting a failure.

### Task 4: Repair tests/ path couplings

**Files:**
- Modify: every file under `tests/` whose `require()` or path constant references the moved dirs (~97 files; grep-derived, not enumerated)

**Interfaces:**
- Consumes: `plugin/` subtree from Task 3.
- Produces: `tests/` suite green against the new layout.

- [ ] **Step 1: Mechanical require rewrite.** Run this codemod from the worktree root:

```bash
node -e "
const fs=require('fs'),path=require('path');
const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
let n=0;
for(const f of walk('tests').filter(f=>f.endsWith('.js'))){
  const t=fs.readFileSync(f,'utf8');
  const u=t.replace(/require\('((?:\.\.\/)+)bin\//g, \"require('\$1plugin/bin/\");
  if(u!==t){fs.writeFileSync(f,u);n++;}
}
console.log('rewrote',n,'files');
"
```

- [ ] **Step 2: Repo-root join constants.** Find them: `grep -rnE \"join\\((ROOT|REPO_ROOT|REPO), *'(skills|bin|agents|hooks|\\.claude-plugin)'\" tests/`. For each hit where the base is the real repo root (`path.join(__dirname, '..')` style), insert the segment: `join(ROOT, 'skills')` → `join(ROOT, 'plugin', 'skills')` (same for `bin`, `agents`, `hooks`, `.claude-plugin`).

- [ ] **Step 3: Fixture discrimination pass.** For remaining hits of `grep -rnE \"['\\\"](skills|bin|agents|hooks|\\.claude-plugin)/|join\\([a-zA-Z_]+, *'(skills|bin|agents|hooks|\\.claude-plugin)'\" tests/`: a join on a **tmp/fixture root** (`root = tmp()`, `tmpGitRepo()`, `makeFixture()` etc.) describes a fabricated repo the test builds — leave it unchanged UNLESS the module under test resolves payload paths beneath a real repo root (read the module to decide; the release-machinery fixtures are handled in Task 6 — skip `tests/bin-lib/release/` and `tests/hooks-post-tool-use-plugin-version-bump.test.js` entirely here to avoid a file collision with Task 6). Record in your report which fixture files you deliberately left unchanged and why.

- [ ] **Step 4: Run the tests/ suite** (targeted, not full npm test — tools/evals repair lands in Task 5):

```bash
node --test $(find tests -name '*.test.js' | sort) 2>&1 | tail -20
```

Expected: failures only in `tests/bin-lib/release/` and `tests/hooks-post-tool-use-plugin-version-bump.test.js` (Task 6's scope — their fixtures/pins encode the old manifest path). Anything else failing: fix it here. Note machine-load flakiness: a count that varies run-to-run on identical code is load, not regression — re-run the affected file in isolation before concluding.

- [ ] **Step 5: Commit** — `git add tests && git commit -m "Repoint tests/ at plugin/ payload paths — refs #418"`

### Task 5: Repair tools/upstream-drift, perf/, evals/ couplings; first full-suite gate

**Files:**
- Modify: `evals/runner.js`, `evals/tests/runner.test.js`, `evals/fixtures/merge-check-cases.json` (check), `tools/upstream-drift/manifest.yml`, `tools/upstream-drift/tests/*.test.js`, `tools/upstream-drift/tests/fixtures/full-schema.yml`, any `perf/` grep hits

**Interfaces:**
- Consumes: Task 4's green-except-release `tests/`.
- Produces: full `npm test` green except `tests/bin-lib/release/` + `tests/hooks-post-tool-use-plugin-version-bump.test.js` (Task 6 closes those).

- [ ] **Step 1: evals/runner.js snapshot dirs.** Replace lines 35–46's constant and loop so the snapshot root stays a plugin root (dest strips the prefix), and add the spec-required comment:

```js
// PLUGIN_SNAPSHOT_DIRS is the eval fixture snapshot, not the payload
// definition — the payload boundary is the plugin/ subtree (ADR-0015).
const PLUGIN_SNAPSHOT_DIRS = ['plugin/.claude-plugin', 'plugin/skills', 'plugin/agents', 'plugin/hooks', 'plugin/bin', 'plugin/commands'];

export function buildPluginSnapshot() {
  const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-plugin-snapshot-'));
  for (const name of PLUGIN_SNAPSHOT_DIRS) {
    const src = path.join(PLUGIN_ROOT, name);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(snapshotDir, path.basename(name)), { recursive: true });
    }
  }
  return snapshotDir;
}
```

(`path.basename('plugin/.claude-plugin')` is `.claude-plugin` — the snapshot layout is unchanged.)

- [ ] **Step 2: Update `evals/tests/runner.test.js`** to the new constant/layout expectations (read its current assertions first; keep asserting that the snapshot root contains `.claude-plugin` etc. directly). Check `evals/fixtures/merge-check-cases.json` — its `skills/`-looking strings are fixture *content* unless they resolve against the real repo; leave fixture content alone.

- [ ] **Step 3: tools/upstream-drift.** `grep -rnE '(^|[^./A-Za-z0-9_-])(skills|bin|agents|hooks|\.claude-plugin)/' tools/upstream-drift/manifest.yml tools/upstream-drift/tests/` — rewrite hits that name THIS repo's payload paths to `plugin/...`; leave hits naming an upstream dependency's own paths (e.g. superpowers' `skills/...`) unchanged — read each hit's context to tell which repo it describes.

- [ ] **Step 4: perf/.** Same grep over `perf/`; fix hits; run `npm run test:perf 2>&1 | tail -5` — green.

- [ ] **Step 5: Full-suite gate.** `npm test > /tmp/task5-full.log 2>&1; echo exit=$?; grep -E '^# (tests|pass|fail)' /tmp/task5-full.log | tail -3`. Expected: fail count == the release-family failures only (list them in your report by file). Anything else: fix here.

- [ ] **Step 6: Commit** — `git add evals tools perf && git commit -m "Repoint evals/tools/perf at plugin/ payload paths — refs #418"`

### Task 6: Release machinery — manifest paths + git-subdir mirror composition (TDD)

**Files:**
- Modify: `plugin/bin/lib/release/compose.js`, `precheck.js`, `status.js`, `run.js`, `mirror.js`; `plugin/bin/lib/hooks/post-tool-use.js` (release-nudge wording, ~lines 176/274)
- Test: `tests/bin-lib/release/compose.test.js`, `precheck.test.js`, `status.test.js`, `status-cli.test.js`, `run.test.js`, `mirror.test.js`, `tests/hooks-post-tool-use-plugin-version-bump.test.js`, `tests/changelog-coverage.test.js` (check)

**Interfaces:**
- Consumes: Probe 1's recorded catalog entry shape (`probe-1-findings.md`) — the mirror composition MUST use the field spellings the probe proved working; if the probe found no working pin field, compose without a pin, and say so in your report (deliverable deviation review must see).
- Produces: `composeMirroredCatalog(catalogText, { version, description, sha })` writing `entry.source = { source: 'git-subdir', url: 'https://github.com/thomasholknielsen/claude-tweaks', path: 'plugin', sha }` (spellings per probe), deleting `entry.version`; `mirrorRelease` passing the pushed release commit sha; manifest path constants at `plugin/.claude-plugin/plugin.json`.

- [ ] **Step 1: Update the release tests first** (red): in the six release suites plus the post-tool-use bump test, change every fixture/assertion manifest path `.claude-plugin/plugin.json` → `plugin/.claude-plugin/plugin.json` (fixtures fabricating repos must create the nested layout), and rewrite `mirror.test.js` to assert the new composition: given a catalog with an old-style entry, the result has `entry.source.source === 'git-subdir'`, `path === 'plugin'`, the sha pin set, NO `version` key (`assert.ok(!('version' in entry))`), and `changed` true when the sha differs / false when identical. Run `node --test tests/bin-lib/release 2>&1 | tail -5` — expect red against current code.

- [ ] **Step 2: Path constants** (green half 1): `compose.js` `RELEASE_FILES[0]` → `'plugin/.claude-plugin/plugin.json'`; `status.js` `MANIFEST` → `'plugin/.claude-plugin/plugin.json'`; `precheck.js` — the three `git show` specs (`origin/main:...`, `main:...`, `` `${branch}:...` ``) get the `plugin/` prefix (the `docs/shipped-versions.tsv` read is unmoved). Remember the zsh lesson pinned in memory applies only to shells — these are JS strings, no change of mechanism.

- [ ] **Step 3: Mirror composition** (green half 2): implement the new `composeMirroredCatalog` per the Produces block; in `run.js`, capture `const releaseSha = deps.git(['rev-parse', 'HEAD']).trim()` after the release commit lands (before/after push both name the same commit) and pass `sha: releaseSha` through to `mirrorRelease`; `mirrorRelease` forwards it to composition. `changed` detection compares the whole source object + description, not `entry.version`.

- [ ] **Step 4: post-tool-use release nudge.** Read `plugin/bin/lib/hooks/post-tool-use.js` around lines 176 and 274: update any repo-root-relative manifest path to `plugin/.claude-plugin/plugin.json` and reword the mirror-outstanding line (currently `plugins[].version`) to the sha-pin reality. Update its test's fixtures/pins accordingly.

- [ ] **Step 5: Run targeted suites** — `node --test tests/bin-lib/release tests/hooks-post-tool-use-plugin-version-bump.test.js tests/changelog-coverage.test.js 2>&1 | tail -5` — green.

- [ ] **Step 6: Commit** — `git add plugin/bin/lib/release plugin/bin/lib/hooks/post-tool-use.js tests/bin-lib/release tests/hooks-post-tool-use-plugin-version-bump.test.js tests/changelog-coverage.test.js && git commit -m "Repoint release machinery at plugin/ manifest; mirror composes git-subdir sha-pinned catalog entry — refs #418"`

### Task 7: Docs, CLAUDE.md, and config sweep (with shown no-op checks)

**Files:**
- Modify: `CLAUDE.md`, `docs/plugin-structure.md`, `docs/skill-authoring.md`, `docs/releasing.md`
- Check (expected no-op, outcome shown): `.github/workflows/*.yml`, `package.json`, `scripts/claude-cloud-setup.sh`, `.claude/settings.json`, `.gitignore`, `plugin/bin/install-statusline-wrapper.js`, `plugin/bin/lib/statusline-wrapper-source.js`

**Interfaces:**
- Consumes: Probe 1's cache-layout finding (statusline check below).

- [ ] **Step 1: CLAUDE.md.** `claude --plugin-dir ./` → `claude --plugin-dir ./plugin`; the release invocation `node bin/release.js` → `node plugin/bin/release.js`; the Structure section's payload paths (`skills/{name}/SKILL.md` → `plugin/skills/{name}/SKILL.md`, `skills/_shared/` → `plugin/skills/_shared/`, `bin/` → `plugin/bin/`, `hooks/hooks.json` + `bin/hooks.js` → `plugin/`-prefixed). Keep it surgical — only path spellings, no prose restructuring; respect the 150-line budget (`wc -l CLAUDE.md` before/after must not grow).

- [ ] **Step 2: docs sweep.** In `docs/plugin-structure.md` (directory tree + per-skill table + CLI list), `docs/skill-authoring.md`, `docs/releasing.md`: rewrite repo-root-relative payload paths to `plugin/...`. Grep to derive the exact hit list: `grep -rnE '(^|[^./A-Za-z0-9_-])(skills|bin|agents|hooks|\.claude-plugin)/' docs/plugin-structure.md docs/skill-authoring.md docs/releasing.md`. Do NOT sweep other `docs/**` prose wholesale — historical docs (incident log, shipped specs, ADRs 0005–0014 body text) describe the past accurately; Task 8 handles the two live citations the spec names.

- [ ] **Step 3: Shown no-op checks.** For each: run the grep, paste the (empty or benign) output in your report:
  - `.github/workflows/`: `grep -rnE '(skills|bin|agents|hooks|\.claude-plugin)/' .github/workflows/` — expected empty (CI runs `npm test` only).
  - `package.json`: test glob covers `tests tools/upstream-drift/tests` — unmoved; expected no change.
  - `scripts/claude-cloud-setup.sh`: its `.claude-plugin/` reads are install-path-relative (`entry.installPath + "/.claude-plugin/plugin.json"`) — correct under git-subdir iff Probe 1 confirmed the cache root is the subtree root; state the probe fact and conclude.
  - `.claude/settings.json`: marketplace/enabledPlugins names only — no paths; expected no change.
  - `.gitignore`: no payload-dir rules — expected no change.
  - Statusline: `statusline-wrapper-source.js` resolves `<cache>/<version>/bin/claude-tweaks-statusline.js` — valid iff the cache root is the subtree root (Probe 1 fact); check `install-statusline-wrapper.js` for any repo-root-relative source path (it reads the wrapper source from the plugin's own tree — `${CLAUDE_PLUGIN_ROOT}`-relative or `__dirname`-relative both survive the move; fix only a genuinely repo-root-relative hit).

- [ ] **Step 4: Run the docs-pinning conformance suites** — `node --test $(find tests -name '*.test.js' | sort) 2>&1 | tail -5` (prose pins live throughout `tests/`; full green expected now).

- [ ] **Step 5: Commit** — `git add CLAUDE.md docs/plugin-structure.md docs/skill-authoring.md docs/releasing.md && git commit -m "Sweep dev-side docs to plugin/ payload paths — refs #418"` (add any Step-3 fixed file too).

### Task 8: ADR-0015 + citation corrections

**Files:**
- Create: `docs/decisions/0015-plugin-payload-boundary-is-the-plugin-subtree.md`
- Modify: `docs/decisions/0011-skill-relationship-edges-live-outside-the-payload.md` (line ~36), `docs/skill-graph.md` (line ~6), `docs/plugin-structure.md` (line ~31)

- [ ] **Step 1: Write ADR-0015** matching the house ADR format (read 0011–0014 first for the template). Content requirements (spec): the payload boundary is the `plugin/` subtree consumed via a `git-subdir` marketplace source; the falsified premise (a root-manifest shim — `${CLAUDE_PLUGIN_ROOT}` resolves to the directory containing the loaded manifest and does not follow component paths into a subdirectory, breaking ~365 payload-internal references; falsified by three independent attempts); the #416 no-transition decision (single-release atomic cutover, installs are per-version cached snapshots, accepted exposure = a stale-catalog update attempt failing loudly until the catalog refreshes); and that `PLUGIN_SNAPSHOT_DIRS` is an eval fixture, not the boundary definition.

- [ ] **Step 2: Correct the two stale citations + structure line.** ADR-0011's "`docs/` is outside `PLUGIN_SNAPSHOT_DIRS` (...)" and `docs/skill-graph.md`'s equivalent line now cite the boundary instead: "`docs/` is outside the plugin payload — the `plugin/` subtree (ADR-0015)". `docs/plugin-structure.md:31`'s "deliberately outside PLUGIN_SNAPSHOT_DIRS" gets the same treatment.

- [ ] **Step 3: Verify** — `grep -rn 'PLUGIN_SNAPSHOT_DIRS' docs/` must show only ADR-0015's own historical mention (and zero in skill-graph/0011/plugin-structure); `node --test $(find tests -name '*.test.js' | sort) 2>&1 | tail -3` green.

- [ ] **Step 4: Commit** — `git add docs/decisions docs/skill-graph.md docs/plugin-structure.md && git commit -m "Add ADR-0015 payload-boundary decision; retire PLUGIN_SNAPSHOT_DIRS citations — refs #418"`

### Task 9: Whole-branch verification — local load, pre-merge e2e install, control grep

**Files:**
- Create: `.claude-tweaks/pipelines/2026-08-17T150123-spec-418/work/cutover-verification.md`

**Interfaces:**
- Consumes: Task 1's scratch marketplace + recon; the pushed feature branch (`worktree-flow-record-418-r2` — push first if behind).

- [ ] **Step 1: Local load (AC).** From a scratch project dir: `claude --plugin-dir "<worktree>/plugin" -p "reply ok"` and the recon-discovered listing command — record output proving skills are listed and hooks registered (the SessionStart hook writes its run-dir probe lines; any visible hook effect counts — record what you observed, verbatim).

- [ ] **Step 2: Pre-merge end-to-end (AC).** Push the branch (`git push origin worktree-flow-record-418-r2`). Add a TEMPORARY entry to the Task 1 scratch marketplace: `{ "name": "claude-tweaks-cutover-probe", "source": { "source": "git-subdir", "url": "https://github.com/thomasholknielsen/claude-tweaks", "path": "plugin", "<pin-field>": "<branch tip sha or branch ref, per Probe 1>" } }`. Install in a scratch project; verify a claude-tweaks skill is invocable (e.g. `-p "/claude-tweaks:help"` produces the help output). Record verbatim. Then remove the temporary entry and uninstall (this is the "temporary entry removed at the flip" AC half for the pre-merge probe; the live catalog was never touched).

- [ ] **Step 3: Repo-wide control grep (AC).** Run and record:

```bash
grep -rnE "(^|[^./A-Za-z0-9_$-])(\.claude-plugin|skills|agents|hooks|bin)/" . \
  --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=plugin \
  --exclude-dir=tests --exclude-dir=evals --exclude-dir=tools --exclude-dir=perf \
  --exclude-dir=docs --exclude-dir=scripts --exclude-dir=.claude-tweaks --exclude-dir=.claude --exclude-dir=.github \
  --exclude=CHANGELOG.md --exclude=README.md --exclude=package.json
```

Expected empty (dev-side dirs are excluded per the AC's own list). Run a POSITIVE control first (same grep without `--exclude-dir=tests` must produce hits — hmm, after Task 4 those are `plugin/bin` spellings; instead prove the grep bites by running it against `git show 'HEAD~N:CLAUDE.md'` (pre-sweep) or a planted scratch file, and show that). Also run the whitespace-spanning control from memory: `grep -rnE '(skills|bin|agents|hooks)\s*/' README.md work/` and eyeball hits. Any genuine hit: fix it, re-run, show clean.

- [ ] **Step 4: Merge upstream again + full suite.** `git fetch origin main && git merge origin/main` (byte-pinned tests make green branches merge red — catch it here), then `npm test > /tmp/task9-full.log 2>&1; echo exit=$?; grep -E '^# (tests|pass|fail)' /tmp/task9-full.log | tail -3` — exit 0, fail 0.

- [ ] **Step 5: Record + commit + cleanup.** Write `cutover-verification.md` with all recorded outputs; delete the scratch GitHub repo if Task 1 created one (`gh repo delete ct-subdir-probe --yes`); commit: `git add .claude-tweaks/pipelines/2026-08-17T150123-spec-418/work/cutover-verification.md && git commit -m "Record cutover verification — local load, branch-pinned e2e install, control grep (refs #418)"`

### Task 10: Release handoff prep (documentation only — NO release execution)

**Files:**
- Modify: `docs/plans/2026-08-17-plugin-payload-cutover-ledger.md` (append one `ops` row)

- [ ] **Step 1: Confirm the branch never bumped the version.** `git diff main...HEAD -- plugin/.claude-plugin/plugin.json | grep '"version"'` — must be empty (path only; the mv rename itself is fine). `git diff main...HEAD -- CHANGELOG.md` — must be empty.

- [ ] **Step 2: Seed the release ops item.** Append to the ledger table:

```markdown
| 1 | ops (reason-not-auto: requires-human) | Release + catalog flip — after merging PR #793, from the MAIN checkout on clean main: `git pull`, then `node plugin/bin/release.js minor "Cut plugin payload over to plugin/ with git-subdir marketplace source"`; the mirror step flips the catalog entry (git-subdir, sha-pinned) in the same run. Then verify a fresh scratch install from the live marketplace works (spec AC; procedure mirrors work/cutover-verification.md Step 2 without the temp entry). Attended by design (spec Gotcha: no auto:build; worktree session structurally cannot run a release). Companion: #419 lands with or immediately after, never before. | open | — |
```

- [ ] **Step 3: Commit** — `git add docs/plans/2026-08-17-plugin-payload-cutover-ledger.md && git commit -m "Seed release handoff ops item — refs #418"`

---

## Verification checklist (whole-branch, for the final review)

- Probes 1+2 recorded with observed output BEFORE the Task 3 mv commit (git log order proves it).
- `claude --plugin-dir ./plugin` load recorded; branch-pinned scratch install recorded; temp entry removed.
- `npm test` green at branch tip after a fresh `origin/main` merge; control grep output recorded and clean.
- ADR-0015 exists; `PLUGIN_SNAPSHOT_DIRS` citations retired from ADR-0011/skill-graph/plugin-structure.
- No version/CHANGELOG delta on the branch; release documented as post-merge human step.
