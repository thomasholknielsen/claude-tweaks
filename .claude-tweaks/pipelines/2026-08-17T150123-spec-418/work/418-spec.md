---
record: 418
origin: human
risk: high
size: high
ceremony: standard
grants: []
fingerprint: plugin-payload-boundary:move-the-plugin-payload-into-plugin-behind-a-root-manifest-s
surface: backend
---
# 418: Cut the plugin payload over to plugin/ with a git-subdir marketplace source (single release)

Surface: backend

## Current State

Payload dirs sit at repo root (`.claude-plugin/`, `skills/`, `agents/`, `hooks/`, `bin/`) and installs clone the whole ~14MB repo. This issue's original design (root-manifest shim transition) was falsified by three independent attempts: `${CLAUDE_PLUGIN_ROOT}` resolves to the directory containing the loaded manifest and does not follow component-path fields into a subdirectory, so a root shim pointing into `plugin/` breaks all ~365 payload-internal references for installed builds. Decision on #416 (2026-08-17, greenfield posture): **no transition machinery — single-release atomic cutover.** Installed builds are per-version cached snapshots and are unaffected; the accepted exposure is a stale-catalog *update attempt* failing loudly until the catalog auto-refreshes. All former blockers are closed (#417, #393, audit queue #367/#368/#386/#390–#399).

## Deliverables

- **Probe 1 (before any move):** scratch-repo end-to-end verification of `git-subdir` — sparse clone happens, skills listed, hooks registered, and `${CLAUDE_PLUGIN_ROOT}` observed resolving to the subdirectory. Observed output recorded in the run.
- **Probe 2 (before any move):** failed-update harmlessness — break a scratch catalog entry, attempt a plugin update, confirm the existing cached install remains intact and working. Observed output recorded.
- `git mv` into `plugin/`: `.claude-plugin/`, `skills/`, `agents/`, `hooks/`, `bin/`. Everything else stays at root. **No root manifest, no shim, no root copy** — the repo root simply stops being a plugin.
- Path sweep (repo-root-relative references only): `CLAUDE.md` (`claude --plugin-dir ./` → `./plugin`), `docs/plugin-structure.md`, `docs/skill-authoring.md`, `docs/releasing.md`, `.github/workflows/*`, `package.json` globs, `bin/release.js` + `bin/lib/release/` (bump target becomes `plugin/.claude-plugin/plugin.json`; single manifest, no dual-write), `evals/runner.js` `PLUGIN_SNAPSHOT_DIRS` (prefix `plugin/`, plus a comment stating it is the eval fixture snapshot, not the payload definition), `tests/` path constants pinning payload files by repo-relative path (derive the list by grepping `tests/` for `skills/` and `bin/` literals), and `scripts/claude-cloud-setup.sh` + `.claude/settings.json` / statusline wrapper checked for `bin/` references — any hit fixed here, check + outcome shown.
- **Catalog flip in the same release:** marketplace entry becomes `{"source": "git-subdir", "url": ..., "path": "plugin"}`; `release.js`'s mirror step adjusted so each release pins the entry's `sha` to the release commit; drop the entry-level `version` field (docs: `plugin.json` silently wins and a stale entry copy can mask releases).
- New ADR (`docs/decisions/`, next free number at build time): the payload boundary is the `plugin/` subtree; records the falsified shim premise and the no-transition decision; corrects ADR-0011's and `docs/skill-graph.md`'s `PLUGIN_SNAPSHOT_DIRS` citations to cite the boundary instead.
- `${CLAUDE_PLUGIN_ROOT}` references are **not rewritten** — under a `git-subdir` source, `plugin/` IS the plugin root and they resolve unchanged. This is the end-state half of the original premise (verified by Probe 1); the falsified half was the shim's whole-repo-clone case only.

## Acceptance Criteria

- Both probes recorded with observed output before any `git mv`. **A negative Probe 1 result STOPs this issue and reopens the #416 decision — do not improvise an alternative mid-build.**
- `claude --plugin-dir ./plugin` loads the plugin locally (skills listed, hooks registered) — verification steps and observed output recorded.
- End-to-end: a temporary catalog entry (`git-subdir`, `ref` pinned to the feature branch) installs a working plugin (skills invocable) in a scratch project **before merge** — verified, not assumed; the temporary entry is removed at the flip.
- `npm test` green; a repo-wide grep shows no remaining repo-root-relative reference to a moved directory outside dev-side files (output shown). Dev-side files = `tests/`, `evals/`, `tools/`, `perf/`, `docs/`, `scripts/`, `.claude-tweaks/`, `.claude/`, `.github/`, `CHANGELOG.md`, `README.md`, `package.json`. `${CLAUDE_PLUGIN_ROOT}`-relative references are expected unchanged and are not matches.
- The new ADR exists; ADR-0011 and skill-graph no longer cite `PLUGIN_SNAPSHOT_DIRS` as the payload.
- Release shipped with the catalog flipped in the same `release.js` run; post-release, a fresh scratch install from the live marketplace works (output shown).

## Technical Approach

Single PR, mostly `git mv` so history follows. Fresh `main` merge-up immediately before the mv — the settled queue merged content into files this moves (merge-upstream-before-authoring lesson). Release + catalog flip via `node bin/release.js` from the merged result; the mirror step lands the flipped entry seconds after the push. The stale-catalog window (a loud, self-healing update error; no working install breaks) is accepted per the #416 decision — do not add grace-window machinery.

## Gotchas

- This issue must **not** carry `auto:build`: the release + two-repo catalog flip wants an attended run, and the retry-counter defect (#779) means this issue's dispatch failure history under-counts.
- Script the catalog edit via node, never shell interpolation — zsh mangles `"$ref:path"` and `echo` corrupts `\n` in JSON payloads.
- #419 (boundary enforcement test) has no tree to run against until this merges — land it with or immediately after, never before.

<!-- work-fingerprint: plugin-payload-boundary:move-the-plugin-payload-into-plugin-behind-a-root-manifest-s -->


## Blocked / Future Work

- **AC 6 (release shipped + catalog flip + post-release fresh install) is deliberately not executed in this run** — attended-by-design (spec Gotcha) and structurally impossible from a worktree-isolated session. The handoff (exact commands, verification pointer) lives in PR #793's "Release handoff" section and ledger item 7. The PR carries `Refs #418` (not Fixes) so the record stays open until the release is verified; close manually afterward.
- Unblocks: merging PR #793, then running the ledger-7 release procedure from clean main.
