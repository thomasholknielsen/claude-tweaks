---
files:
  - plugin/bin/compose-context.js
  - plugin/bin/lib/compose-context/compose.js
  - plugin/bin/lib/compose-context/resolve-conditions.js
  - plugin/bin/lib/compose-context/index.js
  - docs/skill-authoring.md
  - plugin/skills/_shared/pr-first-merge.md
  - plugin/skills/_shared/pr-early-run-lifecycle.md
  - plugin/skills/wrap-up/auto-merge-short-circuit.md
  - plugin/skills/wrap-up/review-console.md
  - tests/compose-markers-conformance.test.js
---

# Compose a Per-Run Context Bundle From Fenced Skill Sources

**Persona:** claude-tweaks skill author about to fence a `_shared/*.md` contract with `<!-- when: key=value -->` markers for the first time, who wants to see — before touching a real file — exactly what a step reads back, what happens to a branch the run didn't take, what happens to a key the run can't resolve, and what a broken marker does to a bundle that already exists.
**Goal:** Run `plugin/bin/compose-context.js` against a scratch run directory and two scratch sources, and read the composed bundle, the JSON envelope, and each exit code with their own eyes.
**Entry point:** A terminal at this repo's checkout root, `plugin/bin/compose-context.js` reachable (this repo's own checkout, or another project's resolved plugin root per `docs/skill-authoring.md`'s plugin-root contract), and a scratch directory under the OS temp dir standing in for a run directory.
**Success state:** One bundle at `{run}/context/{step}.md` whose first line names every key's resolved value, whose body carries only the branches the run took, and a stdout JSON line that tells the calling step where the bundle is and which keys kept both branches — plus a clear picture of when the step must fall back to reading the sources directly.

## Steps

### 1. Compose two fenced sources against a pinned run — terminal
- **URL:** `node "${CLAUDE_PLUGIN_ROOT}/bin/compose-context.js" --run /tmp/compose-demo --step merge /tmp/compose-demo/a.md /tmp/compose-demo/b.md`, after `mkdir -p /tmp/compose-demo`, writing `/tmp/compose-demo/config.yml` as `mode: auto` + `integration-model: pr-first`, and `a.md` as a `# A` heading followed by a `<!-- when: integration-model=pr-first -->` block and a `<!-- when: integration-model=local-merge -->` block (each on its own lines, closed by `<!-- /when -->`), `b.md` as plain prose.
- **Action:** Run it, then `cat /tmp/compose-demo/context/merge.md`.
- **Should feel:** One command, one file to read — the step never opens `a.md` or `b.md` itself.
- **Should understand:** The bundle opens with `<!-- resolved: integration-model=pr-first mode=auto attendance=… transport=… worktree-policy=… work-backend=… -->` in that fixed six-key order, then `a.md`'s kept lines (the `pr-first` branch, marker lines stripped, the `local-merge` branch gone) and then `b.md`, in argv order. stdout is exactly one JSON line: `{"path": …, "bytes": …, "sources": [the two argv strings verbatim], "unresolved": [...]}`. The bundle is regenerated on every call — edit `config.yml` to `integration-model: local-merge`, re-run, and the other branch appears; nothing is cached.
- **Red flags:** Both branches present with the key pinned; marker lines surviving into the body; sources out of argv order; more than one line on stdout; a bundle that does not change after the pin changes.

### 2. Read which keys kept both branches
- **URL:** the same command with `config.yml` deleted, against a scratch dir that has no `.claude-tweaks/policy.yml` and no `CLAUDE.md`
- **Action:** Re-run Step 1's command and read the header line and the JSON's `unresolved` array.
- **Should feel:** Honest — the composer says which keys it could not resolve instead of guessing.
- **Should understand:** `integration-model`, `mode`, `attendance`, `worktree-policy`, and `work-backend` all read `unresolved`, and both of `a.md`'s blocks are now in the bundle: an unresolved key never drops a branch. `transport` still resolves (`gh` or `mcp`) — it is a probe for the `gh` binary, never a guess. `integration-model` resolves only from the run's `config.yml` pin (every `/flow` run writes one at the Manifesto) or `policy.yml`; the composer never runs forge detection, because detection fails open to `local-merge` indistinguishably from a real answer and would silently drop every `pr-first` branch.
- **Red flags:** A key resolved to a default value the run never set; a branch missing while its key reads `unresolved`; a `gh repo view` or `git remote` call showing up in a trace (the module's only shell-out is `gh --version`).

### 3. Break a marker and watch the prior bundle survive
- **URL:** the same command with a third source `bad.md` containing `<!-- when: mode=auto -->` and no closing marker
- **Action:** Run Step 1's command once more with `bad.md` appended, then read stderr, the exit code, and `context/merge.md` again.
- **Should feel:** Loud, precise, and safe — the failure names the file and line, and the good bundle from the previous call is byte-for-byte untouched.
- **Should understand:** Exit `2`, stderr `compose-context.js: /tmp/compose-demo/bad.md:1: unclosed marker …`, nothing on stdout, nothing written, no temp file left in `context/`. Every marker in every source is validated before a single byte is written, so a failing call is a no-op on disk. The same exit `2` covers a malformed invocation (usage on stderr), an unknown key or value, nesting deeper than one level, a close with no open, and a `--run` directory that is missing or resolves inside a checkout other than the main one; exit `1` is a filesystem failure (an unreadable source, an unwritable output path). This is why the call-site guidance in `docs/skill-authoring.md` says the step checks the exit code before reading the bundle: a stale bundle from an earlier composition is still sitting there, and the fallback on any non-zero exit is to read the named sources directly.
- **Red flags:** A partially written or emptied `merge.md` after the failure; an exit code other than 2 for a bad marker; a `merge.md.tmp-*` file left behind; a step that reads the bundle without checking the exit code.

### 4. Document the grammar inside a fenced code block
- **URL:** the same command with `a.md` extended by a ```` ```markdown ```` fenced block that quotes a full `<!-- when: … --> … <!-- /when -->` example
- **Action:** Re-run and read the bundle.
- **Should feel:** Unsurprising — the example is prose, and it comes through as prose.
- **Should understand:** Lines inside a fenced code block are literal text to the composer: never markers, never validated, never stripped. A fence closes only on a fence of the same character (backtick or tilde) with at least the opener's length, so a three-backtick example nested inside a four-backtick fence stays inside it. This is how a `_shared/*.md` file documents the marker grammar without triggering it.
- **Red flags:** The fenced example's marker lines stripped or its inner branch dropped; a spurious "close without open" error caused by a nested fence of a different character.

### 5. Trigger the run-dir guard
- **URL:** `node "${CLAUDE_PLUGIN_ROOT}/bin/compose-context.js" --run .claude/worktrees/some-worktree/.claude-tweaks/pipelines/some-run --step x a.md` from inside a checkout
- **Action:** Point `--run` at a run directory that resolves inside a linked worktree instead of the main checkout.
- **Should feel:** Refused before anything happens — the same `[IL-127]` posture every other run-directory CLI in this plugin takes.
- **Should understand:** Exit `2` with a message naming the main checkout the path resolves outside of, nothing written. A path outside any checkout at all (this journey's `/tmp/compose-demo`) is accepted as-is — the anchored-or-outside rule `resolve-policy.js` and `resolve-profile.js` carry, registered for this CLI in `plugin/skills/_shared/pipeline-run-dir.md`'s CLI-argument-boundary section.
- **Red flags:** A bundle written into a worktree-local shadow run dir; a temp-dir run dir refused.

### 6. Compose the real merge bundle the way `/wrap-up` does — terminal
- **URL:** `node "${CLAUDE_PLUGIN_ROOT}/bin/compose-context.js" --run /tmp/compose-demo --step merge "${CLAUDE_PLUGIN_ROOT}/skills/_shared/pr-first-merge.md" "${CLAUDE_PLUGIN_ROOT}/skills/_shared/pr-early-run-lifecycle.md"`, with `config.yml` restored to `integration-model: pr-first` and `gh` on PATH — the exact call `plugin/skills/wrap-up/auto-merge-short-circuit.md` and `review-console.md`'s "Approve all + merge" step carry.
- **Action:** Run it, read the JSON line's `bytes`, then open `context/merge.md` and search it for `Local-merge fallback` and `Scope extends to issue reads`.
- **Should feel:** The first production use of the composer, and nothing changed in how the procedure reads — only what is absent.
- **Should understand:** The `## Local-merge fallback` heading is still there but its body is gone (a fenced-whole section renders as a bare heading in the untaken composition — the heading marks the branch's place, so any citation to it by name still resolves); the `## Skip / degrade behavior` section keeps its degrade table (rows 2-7 are pr-first paths) and loses only the local-merge paragraph and its SKIP block; the MCP root-cause section keeps its `Confirmed against…` bullets and `**Consequence:**` paragraph (three later sentences cite "Root cause above" under every transport) and loses only the `**Scope extends…**` paragraph. Source paths are `${CLAUDE_PLUGIN_ROOT}`-rooted, never repo-relative — a `plugin/skills/…` path resolves only from a claude-tweaks checkout and would exit 1 in every consumer install. The bundle is ~56 KB against ~59 KB for the two raw files: additive fencing of prose that already exists is a small saving; the per-step byte budget is #1990's job. `stripMarkers(source) === git show origin/main:{source}` holds for both files — the migration inserted marker lines and changed nothing else.
- **Red flags:** A `Local-merge fallback` body present under `pr-first`; a degrade-table row missing; a "Root cause above" citation with no root cause left in the bundle; exit 1 with an ENOENT naming `plugin/skills/…`; a skill step that reads `context/merge.md` without checking the exit code first.

## Origin
- Created during build of #1988 (per-run skill-context composer CLI — Phase 1 of #1987's decomposition); steps 1-5 built in this session.
- Step 6 added during build of #1989 (merge-path markers — the first production consumer: `pr-first-merge.md` and `pr-early-run-lifecycle.md` fenced, `/wrap-up`'s two merge sites reading the composed `merge` bundle).
- Related specs: #1987 (parent design), #1990 (composed-bytes measurement, imports `stripMarkers`/`compose`; carries the merge bundle's byte budget), #1991-#1994 (the remaining records that fence real `_shared/*.md` files), #1995-#1997.
