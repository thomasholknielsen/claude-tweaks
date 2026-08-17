---
record: 418
origin: human
risk: high
size: high
ceremony: standard
grants: [build]
surface: backend
---
# 418: Move the plugin payload into plugin/ behind a root-manifest shim

Surface: backend

## Current State

The payload dirs sit at repo root (`.claude-plugin/`, `skills/`, `agents/`, `hooks/`, `bin/`) and the installer clones everything. `docs/skill-graph.md`&#39;s provenance note and ADR-0011 cite `evals/runner.js`&#39;s `PLUGIN_SNAPSHOT_DIRS` as if it were the payload definition. The sibling test-relocation sub-issue (#417, a hard `Blocked by` dependency of this one, not background) makes `bin/` production-only before this runs. Platform facts verified 2026-08-14 against https://code.claude.com/docs/en/plugins-reference.md: `plugin.json` component-path fields (`skills`, `agents`, `hooks`, …) scope what Claude Code loads — a root manifest pointing into a subdirectory is the transition shim this sub-issue relies on, pending the field-shape verification gate below.

## Deliverables

- `git mv` into `plugin/`: `.claude-plugin/`, `skills/`, `agents/`, `hooks/`, `bin/`. Everything else stays at root.
- Root `.claude-plugin/plugin.json` shim: same identity, component paths pointing into `plugin/` (`"skills": "plugin/skills"`, `"agents": "plugin/agents"`, `"hooks": "plugin/hooks/hooks.json"`). **Version-sync rule:** while the shim exists, `bin/release.js` bumps BOTH manifests in lockstep (dual-write) — a frozen shim version would misreport the installed build to `/help`&#39;s version line and the statusline. **Removal owner:** the shim is deleted by sub-issue #420 (the expand-contract contract phase) — it is transition scaffolding with a named owner, not an indefinite compatibility shim (CLAUDE.md&#39;s Don&#39;ts rule on recorded removal conditions).
- Path sweep (repo-root-relative references only): `CLAUDE.md`, `docs/plugin-structure.md`, `docs/skill-authoring.md`, `docs/releasing.md`, `.github/workflows/*`, `package.json` globs, `bin/release.js` + `bin/lib/release/` (target becomes `plugin/.claude-plugin/plugin.json` + the root shim per the dual-write rule), `evals/runner.js` `PLUGIN_SNAPSHOT_DIRS` (prefix `plugin/`, plus a comment stating it is the eval fixture snapshot, not the payload definition), and **`tests/` path constants** that pin payload files by repo-relative path (e.g. `tests/hooks-gate-coverage.test.js` → `skills/_shared/policy-schema.md`; derive the full list by grepping `tests/` for `skills/` and `bin/` literals).
- New ADR (`docs/decisions/`, next free number at build time): the payload boundary is the `plugin/` subtree; correct ADR-0011&#39;s and `docs/skill-graph.md`&#39;s `PLUGIN_SNAPSHOT_DIRS` citations to cite the boundary instead.

## Acceptance Criteria

- **Gate task (first, before any move):** the shim&#39;s component-path field shapes — especially `hooks` as a file path — verified against the current plugins-reference doc, result recorded in the run. A negative result (schema doesn&#39;t support a workable shim) STOPS this sub-issue and re-scopes the transition design; do not improvise an alternative mid-build.
- `claude --plugin-dir ./plugin` loads the plugin locally (skills listed, hooks registered) — verification steps and observed output recorded.
- The shim verified end-to-end: installing from the unchanged `url`-source marketplace entry in a scratch project yields a working plugin (skills invocable) — verified, not assumed.
- `npm test` green; a repo-wide grep shows no remaining repo-root-relative reference to a moved directory outside dev-side files (output shown). **Dev-side files** = `tests/`, `evals/`, `tools/`, `perf/`, `docs/`, `scripts/`, `.claude-tweaks/`, `.claude/`, `.github/`, `CHANGELOG.md`, `README.md`, `package.json`. `${CLAUDE_PLUGIN_ROOT}`-relative references are expected to be unchanged and are not matches.
- The repo&#39;s own `.claude/settings.json` / statusline wrapper checked for `bin/` path references; any hit fixed as part of this sub-issue and the check + outcome shown (not deferred).
- The new ADR exists; ADR-0011 and skill-graph no longer cite `PLUGIN_SNAPSHOT_DIRS` as the payload.

## Technical Approach

Expand-contract phase 1 (expand). Single PR, mostly `git mv` so history follows. The claim that hooks/skills/statusline need no internal edits is a **hypothesis the staged install verifies**, not an established fact — their cross-references are `${CLAUDE_PLUGIN_ROOT}`-relative by contract, and the local `--plugin-dir` + scratch-install ACs are what prove it.

## Gotchas

- Do NOT rewrite `${CLAUDE_PLUGIN_ROOT}` references — the plugin root becomes `plugin/` at install time and they resolve unchanged. Rewriting them is the classic over-eager sweep failure.
- **The authoritative blocking set is this issue&#39;s native `Blocked by` links** (wired at decomposition: #417, #393, and the still-open members of the 2026-08-14 audit/design queue — #390, #391, #392, #394–#399, #386, #367, #368 at filing time). GitHub&#39;s dependency graph is the go/no-go check at pickup; re-verify file-level scope against the live tree then (IL-71: measurements go stale between filing and build).
- The queue may have merged content into files this moves — `git mv` after a fresh main merge-up, never from a stale base (merge-upstream-before-authoring lesson).
