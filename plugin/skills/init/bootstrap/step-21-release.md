# Step 21 — Release Bootstrap (detailed procedure)

*Optional Enhancement step — see `SKILL.md`'s `## Input` for when this group is offered or filtered, and `../bootstrap-steps.md` for its ordering and renumbering conventions.*

Gives `detection-tables.md`'s release-process row (Step 2e) a destination (#2253). On a repo with no release automation, writes the release-please engine's files — the config every later phase of the release family reads, the manifest, and (pr-first only) the workflow — and seeds the two `release-*` policy keys. On a repo that already runs a competing tool, refuses and reports rather than layering a second engine on top (design stance 7: existing release automation is a conflict, not a wrap target).

**Gate — Step 20's output.** This step routes on `integration-model` (`_shared/integration-model.md`): `pr-first` → release-please workflow + config, `local-merge` → config only (the local engine reads the same files). Resolve the value the way every consumer does — `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values integration-model`. When Step 20 did not run or the value resolves empty/ambiguous, **skip this step entirely** and record `release: skipped — integration-model unresolved` in the init summary — never guess an engine.

**Branch.** Resolve the integration branch via `_shared/integration-branch.md`'s canonical ladder (the `integration-branch` policy value when set, else the remote's default branch — `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` — else `main`); it is the branch the workflow triggers on.

**Detect and write — one CLI call.** The whole decision is the code twin `bin/lib/init/release-bootstrap.js`, fronted by:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/release-bootstrap.js" --integration-model {pr-first|local-merge} --branch {branch}
```

It prints one JSON line — `{verdict, tool?, evidence?, releaseType?, version?, written[], policyRows[]}` — and exits 0 on every verdict (2 on usage, 1 on an unexpected error). Read `verdict`:

| Verdict | What the CLI did | Init summary line |
|---|---|---|
| `fresh` | Wrote `release-please-config.json` (`release-type` from the stack table below), `.release-please-manifest.json` (seeded from the newest `v*` tag by semver precedence, else the stack manifest's version, else `0.1.0`), and — `pr-first` only — `.github/workflows/release-please.yml` (`googleapis/release-please-action@v4`, `contents: write` + `pull-requests: write`) | `release: bootstrapped — {releaseType}, manifest {version}` |
| `already-bootstrapped` | Nothing — the config already carries this step's own shape; an idempotent no-op that never re-writes or clobbers | `release: already configured` |
| `conflict` | Nothing — a competing tool was found: `.releaserc*` / `release.config.*` (semantic-release), `.changeset/` (changesets), `.goreleaser.*` (goreleaser), or a foreign `release-please-config.json` | `release: conflict — {tool}` (name the `evidence` path). Removing the tool clears it on the next `/init` run |

`v*` tags are not conflict evidence — a project that already tags releases by hand is exactly the onboarding case; tags feed only the manifest seed. Detection is this step's own presence check, deliberately not `_shared/existing-convention-detection.md`'s genre-grammar procedure (its ≥3-file floor and grammar parse answer a different question); only the three-way verdict vocabulary is shared.

**Policy rows (`fresh` only) — deferred write.** The CLI returns `policyRows`, two commented-out lines:

```
# release-hook: <command run after the local engine tags a release — local-merge only; under pr-first the release: published workflow is the hook>
# release-train: false
```

Append them to `.claude-tweaks/policy.yml` through `worktree-policy-finalization.md`'s isolated-worktree write (`../worktree-policy-finalization.md`, § "How the write itself happens") — queue them exactly as Step 6 queues `worktree-always`, never a direct `Edit` against the main checkout; skip a line whose key is already present (commented or not). Both keys are non-core schema entries (`_shared/policy-schema.md`, Additional levers) and never Manifesto levers; what reads them ships in later units (`bin/release-local.js`, `/claude-tweaks:release --train`).

## Stack table

The canonical stack → `release-type` mapping (code twin: `RELEASE_STACK_TABLE` in `bin/lib/init/release-bootstrap.js`, pinned row-for-row by `tests/init-release-bootstrap-conformance.test.js`). Markers are root-level names; `*.ext` means any root file with that extension. **Exactly one** matching row selects its type; zero or two-plus rows fall through to `simple` — a multi-stack repo is out of scope by design, not resolved by precedence. Later units (the local engine, the preflight fact pack) cite this table rather than re-deriving their own.

| `release-type` | Root markers |
|---|---|
| `node` | `package.json` |
| `python` | `pyproject.toml`, `setup.py` |
| `rust` | `Cargo.toml` |
| `go` | `go.mod` |
| `java` | `pom.xml`, `build.gradle`, `build.gradle.kts` |
| `ruby` | `Gemfile`, `*.gemspec` |
| `php` | `composer.json` |
| `dotnet` | `*.csproj`, `*.sln` |

Under `simple`, `extra-files` names the first version-bearing JSON manifest found — `.claude-plugin/plugin.json`, `plugin/.claude-plugin/plugin.json`, then root `*.json` files with a top-level `version` — as `{type: json, path, jsonpath: $.version}` (this repo: `plugin/.claude-plugin/plugin.json`); none found → no `extra-files` key.

**Idempotent:** re-running `/init` on a repo this step already bootstrapped reports `already configured` and writes nothing; declining is not a state this step records — it is offered again next run.

**Failure handling:** a CLI exit of 1 (unexpected error) is surfaced with its stderr line and `/init` continues — never abort the rest of bootstrap on this step. Exit 2 is a prose bug (a malformed invocation above), not a project condition.
